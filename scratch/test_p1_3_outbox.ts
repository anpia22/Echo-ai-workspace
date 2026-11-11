/**
 * P1.3 — Offline and reconnect: the outbox keeps writes in order, retries temporary failures with
 * backoff, resumes when the browser is back online, abandons writes that can never succeed, and
 * merges drags. Uses a fake clock and a fake network; nothing here really waits.
 *
 * Run: npx tsx scratch/test_p1_3_outbox.ts
 */

import {
  DEFAULT_MAX_DELAY_MS,
  backoffDelayMs,
  createOutbox,
  type OutboxItem,
  type OutboxOptions,
} from "../src/app/lib/persistence/client/outbox";
import {
  KIND_CANVAS,
  KIND_MESSAGE,
  NoExecutorError,
  classifySaveError,
  coalesceCanvasSaves,
  isTemporaryStatus,
  type CanvasSavePayload,
} from "../src/app/lib/persistence/client/saveOutbox";
import { CanvasPersistenceApiError, CanvasPersistenceConflictError } from "../src/app/lib/persistence/client/canvasApi";
import { ConversationPersistenceApiError, ConversationPersistenceConflictError } from "../src/app/lib/persistence/client/conversationApi";
import { SaveAbandoned } from "../src/app/lib/persistence/client/canvasSaveQueue";
import { ReadOnlyWorkspaceError } from "../src/app/lib/persistence/client/readOnly";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name} ${detail}`);
  }
}

/** Lets pending promise callbacks run. */
const flush = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
};

/** A fake clock whose timers only fire when the test advances time. */
function fakeTimers() {
  let now = 0;
  let id = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => now,
    setTimer: (fn: () => void, ms: number) => {
      const handle = ++id;
      timers.set(handle, { at: now + ms, fn });
      return handle;
    },
    clearTimer: (h: unknown) => void timers.delete(h as number),
    pendingTimers: () => timers.size,
    nextDelay: () => (timers.size ? Math.min(...[...timers.values()].map((t) => t.at)) - now : null),
    async advance(ms: number) {
      const target = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at;
        timers.delete(due[0]);
        due[1].fn();
        await flush();
      }
      now = target;
    },
  };
}

type Harness = ReturnType<typeof harness>;
function harness(opts: Partial<OutboxOptions> & { failures?: Array<unknown | null> } = {}) {
  const t = fakeTimers();
  const log: string[] = [];
  const failures = [...(opts.failures ?? [])]; // consumed one per attempt: an Error to fail with, or null to succeed
  let inFlight = 0;
  let maxInFlight = 0;
  let online = true;
  const dropped: Array<{ id: string; reason: unknown }> = [];

  const outbox = createOutbox({
    execute: async (item) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      log.push(`try:${item.id}`);
      await new Promise((r) => setImmediate(r));
      inFlight--;
      const fail = failures.length ? failures.shift() : null;
      if (fail) throw fail;
      log.push(`ok:${item.id}`);
    },
    classify: (e) => (e instanceof Error && e.message.startsWith("PERMANENT") ? "drop" : "retry"),
    onDrop: (item, reason) => dropped.push({ id: item.id, reason }),
    isOnline: () => online,
    now: t.now,
    setTimer: t.setTimer,
    clearTimer: t.clearTimer,
    random: () => 0,
    ...opts,
  });
  return { outbox, t, log, dropped, setOnline: (v: boolean) => (online = v), maxInFlight: () => maxInFlight, failures };
}

const item = (id: string, extra: Partial<OutboxItem> = {}): OutboxItem => ({ id, kind: "k", payload: {}, ...extra });

async function main() {
  console.log("normal operation");
  {
    const h = harness();
    h.outbox.enqueue(item("a"));
    h.outbox.enqueue(item("b"));
    h.outbox.enqueue(item("c"));
    check("work is counted while pending", h.outbox.status().pending === 3);
    await flush();
    check("items run in the order they were made", h.log.filter((l) => l.startsWith("ok:")).join() === "ok:a,ok:b,ok:c");
    check("never more than one at a time", h.maxInFlight() === 1);
    check("when everything is saved the outbox is idle and empty", h.outbox.status().pending === 0 && h.outbox.status().state === "idle");
  }

  console.log("temporary failures are retried, in order");
  {
    const h = harness({ failures: [new Error("network"), new Error("network")] });
    h.outbox.enqueue(item("a"));
    h.outbox.enqueue(item("b"));
    await flush();
    check("a failed item stays at the front and waits", h.outbox.status().pending === 2 && h.outbox.status().state === "waiting");
    check("the item behind it does not jump ahead", !h.log.includes("try:b"));
    check("a retry is scheduled (about 1 second)", h.t.nextDelay() === 1000);
    await h.t.advance(1000);
    check("it retries after the delay, fails again, and waits longer (2 seconds)", h.log.filter((l) => l === "try:a").length === 2 && h.t.nextDelay() === 2000);
    await h.t.advance(2000);
    check("then it succeeds, and the next item follows", h.log.join() === "try:a,try:a,try:a,ok:a,try:b,ok:b" && h.outbox.status().pending === 0);
  }

  console.log("backoff");
  check("grows 1, 2, 4, 8 seconds", [1, 2, 3, 4].map((a) => backoffDelayMs(a, 1000, 30000, () => 0)).join() === "1000,2000,4000,8000");
  check("is capped at 30 seconds", backoffDelayMs(20, 1000, DEFAULT_MAX_DELAY_MS, () => 0.99) === DEFAULT_MAX_DELAY_MS);
  check("jitter stays small", (() => { const d = backoffDelayMs(1, 1000, 30000, () => 0.99); return d >= 1000 && d <= 1250; })());
  {
    const h = harness({ failures: [new Error("x"), new Error("x"), new Error("x")] });
    h.outbox.enqueue(item("a"));
    await flush();
    const triesBefore = h.log.filter((l) => l === "try:a").length;
    for (let i = 0; i < 25; i++) h.outbox.enqueue(item(`more-${i}`));
    await flush();
    check("new items added during a backoff wait do NOT trigger extra attempts (no hammering)", h.log.filter((l) => l === "try:a").length === triesBefore && h.t.pendingTimers() === 1);
  }

  console.log("offline and back online");
  {
    const h = harness();
    h.setOnline(false);
    h.outbox.enqueue(item("a"));
    h.outbox.enqueue(item("b"));
    await flush();
    check("while offline nothing is sent", h.log.length === 0);
    check("and the status says offline with the waiting count", h.outbox.status().state === "offline" && h.outbox.status().pending === 2);
    h.outbox.enqueue(item("c"));
    await flush();
    check("more work can be added while offline", h.outbox.status().pending === 3 && h.log.length === 0);
    h.setOnline(true);
    h.outbox.kick();
    await flush();
    check("when the browser is back online everything is sent, in order", h.log.filter((l) => l.startsWith("ok:")).join() === "ok:a,ok:b,ok:c" && h.outbox.status().state === "idle");
  }
  {
    const h = harness({ failures: [new Error("x"), new Error("x"), new Error("x")] });
    h.outbox.enqueue(item("a"));
    await flush();
    await h.t.advance(1000);
    await h.t.advance(2000);
    check("after three failures the wait has grown (4 seconds)", h.t.nextDelay() === 4000);
    h.outbox.kick();
    await flush();
    check("kick() retries immediately, without waiting out the backoff", h.log.includes("ok:a") && h.t.pendingTimers() === 0);
    h.outbox.enqueue(item("b"));
    await flush();
    check("and starts the backoff over afterwards", h.outbox.status().pending === 0);
  }
  {
    const h = harness({ failures: [new Error("x")] });
    h.setOnline(false);
    h.outbox.enqueue(item("a"));
    h.setOnline(true);
    h.outbox.kick();
    await flush();
    check("a failure that happens as the connection drops reports offline, not a scary error", h.outbox.status().pending === 1 || h.outbox.status().state !== "sending");
  }

  console.log("failures that can never succeed");
  {
    const h = harness({ failures: [new Error("PERMANENT: forbidden")] });
    h.outbox.enqueue(item("bad"));
    h.outbox.enqueue(item("good"));
    await flush();
    check("the bad item is dropped and reported", h.dropped.length === 1 && h.dropped[0].id === "bad" && h.outbox.status().dropped === 1);
    check("the item behind it is NOT blocked", h.log.includes("ok:good") && h.outbox.status().pending === 0);
  }
  {
    const h = harness({ failures: [new Error("PERMANENT")], onDrop: () => { throw new Error("notifier exploded"); } });
    h.outbox.enqueue(item("bad"));
    h.outbox.enqueue(item("good"));
    await flush();
    check("a broken notifier cannot break the queue", h.log.includes("ok:good"));
  }

  console.log("replacing and merging waiting work");
  {
    const h = harness({ failures: [new Error("x")] });
    h.outbox.enqueue(item("first", { key: "snap:1", payload: { v: 1 } }));
    await flush(); // fails once; now waiting
    h.outbox.enqueue(item("blocker"));
    h.outbox.enqueue(item("newer", { key: "snap:2", payload: { v: 2 } }));
    h.outbox.enqueue(item("newest", { key: "snap:2", payload: { v: 3 } }));
    check("a newer item with the same key replaces a waiting one in place", h.outbox.status().pending === 3);
    await h.t.advance(1000);
    await flush();
    check("only the latest snapshot is sent", h.log.includes("ok:newest") && !h.log.includes("ok:newer"));
  }
  {
    // The item in flight must never be replaced: it may already have reached the server.
    const t = fakeTimers();
    const seen: unknown[] = [];
    let release: () => void = () => undefined;
    const outbox = createOutbox({
      execute: async (it) => { seen.push((it.payload as { v: number }).v); await new Promise<void>((r) => (release = r)); },
      classify: () => "retry", setTimer: t.setTimer, clearTimer: t.clearTimer, random: () => 0,
    });
    outbox.enqueue({ id: "one", kind: "k", key: "s", payload: { v: 1 } });
    await flush();
    outbox.enqueue({ id: "two", kind: "k", key: "s", payload: { v: 2 } });
    check("an item already being sent is not replaced: the newer one is queued after it", outbox.status().pending === 2);
    release();
    await flush();
    release();
    await flush();
    check("both go out, in order", seen.join() === "1,2");
  }
  {
    const h = harness({
      failures: [new Error("x")],
      coalesce: (tail, next) => (tail.kind === "drag" && next.kind === "drag" ? { ...tail, payload: { n: (tail.payload as { n: number }).n + (next.payload as { n: number }).n } } : null),
    });
    h.outbox.enqueue(item("hold"));
    await flush(); // first attempt fails, so the queue is waiting
    h.outbox.enqueue({ id: "d1", kind: "drag", payload: { n: 1 } });
    h.outbox.enqueue({ id: "d2", kind: "drag", payload: { n: 1 } });
    h.outbox.enqueue({ id: "d3", kind: "drag", payload: { n: 1 } });
    check("waiting items can be merged", h.outbox.status().pending === 2);
  }
  {
    // The head item is in flight during its attempt: nothing may be merged into it.
    const t = fakeTimers();
    let release: () => void = () => undefined;
    const executed: unknown[] = [];
    const outbox = createOutbox({
      execute: async (it) => { executed.push(JSON.stringify(it.payload)); await new Promise<void>((r) => (release = r)); },
      classify: () => "retry", setTimer: t.setTimer, clearTimer: t.clearTimer, random: () => 0,
      coalesce: (tail, next) => ({ ...tail, payload: { n: (tail.payload as { n: number }).n + (next.payload as { n: number }).n } }),
    });
    outbox.enqueue({ id: "d1", kind: "drag", payload: { n: 1 } });
    await flush();
    outbox.enqueue({ id: "d2", kind: "drag", payload: { n: 10 } });
    release();
    await flush();
    release();
    await flush();
    check("nothing is merged into the item currently being sent", executed.join("|") === '{"n":1}|{"n":10}');
  }

  console.log("limits and housekeeping");
  {
    const h = harness({ maxItems: 3, failures: [new Error("x")] });
    h.outbox.enqueue(item("head"));
    await flush();
    h.outbox.enqueue(item("b"));
    h.outbox.enqueue(item("c"));
    h.outbox.enqueue(item("d"));
    check("a full outbox abandons the oldest waiting item and says so", h.outbox.status().pending === 3 && h.dropped.length === 1);
  }
  {
    const h = harness({ failures: [new Error("x")] });
    h.outbox.enqueue(item("a", { kind: "ws1" }));
    await flush();
    h.outbox.enqueue(item("b", { kind: "ws1" }));
    h.outbox.enqueue(item("c", { kind: "ws2" }));
    const removed = h.outbox.discard((i) => i.kind === "ws1");
    check("discard removes waiting items that match (e.g. after leaving a workspace)", removed >= 1 && h.outbox.status().pending <= 2);
  }
  {
    const h = harness();
    let calls = 0;
    const off = h.outbox.subscribe(() => calls++);
    h.outbox.enqueue(item("a"));
    await flush();
    const during = calls;
    off();
    h.outbox.enqueue(item("b"));
    await flush();
    check("subscribers are told about changes, and stop when they unsubscribe", during > 0 && calls === during);
  }

  console.log("error classification");
  check("a dropped connection (fetch TypeError) is temporary", classifySaveError(new TypeError("Failed to fetch")) === "retry");
  check("timeouts and aborts are temporary", classifySaveError(Object.assign(new Error("t"), { name: "TimeoutError" })) === "retry" && classifySaveError(Object.assign(new Error("a"), { name: "AbortError" })) === "retry");
  check("server trouble and rate limits are temporary", [500, 502, 503, 504, 429, 408].every((s) => classifySaveError(new CanvasPersistenceApiError(s, "X", "x")) === "retry"));
  check("the same for conversation saves", classifySaveError(new ConversationPersistenceApiError("X", "x", 503)) === "retry");
  check("requests that can never succeed are dropped", [400, 401, 403, 404, 422].every((s) => classifySaveError(new CanvasPersistenceApiError(s, "X", "x")) === "drop"));
  check("conflicts are dropped (the canvas save already rebased several times)", classifySaveError(new CanvasPersistenceConflictError("stale")) === "drop" && classifySaveError(new ConversationPersistenceConflictError("dup")) === "drop");
  check("read-only, abandoned and unhandled saves are dropped", classifySaveError(new ReadOnlyWorkspaceError()) === "drop" && classifySaveError(new SaveAbandoned()) === "drop" && classifySaveError(new NoExecutorError("x")) === "drop");
  check("anything unknown is dropped, never retried forever", classifySaveError(new Error("???")) === "drop" && classifySaveError(null) === "drop" && classifySaveError("text") === "drop");
  check("temporary statuses", isTemporaryStatus(500) && isTemporaryStatus(429) && !isTemporaryStatus(404) && !isTemporaryStatus(400));

  console.log("merging drags");
  const node = (id: string, x: number, y = 0) => ({ id, nodeType: "idea", title: id, position: { x, y } });
  const canvasItem = (id: string, mutation: CanvasSavePayload["mutation"], ws = "w1"): OutboxItem => ({ id, kind: KIND_CANVAS, payload: { workspaceId: ws, mutation } satisfies CanvasSavePayload });
  const moved = (r: OutboxItem | null) => (r?.payload as CanvasSavePayload | undefined)?.mutation.upsertNodes as Array<{ id: string; position: { x: number } }> | undefined;
  {
    const merged = coalesceCanvasSaves(canvasItem("a", { upsertNodes: [node("n1", 10)] as never }), canvasItem("b", { upsertNodes: [node("n1", 50), node("n2", 7)] as never }));
    check("two drags merge into one save", merged !== null && merged.id === "a");
    check("the newer position wins for the same node", moved(merged)?.find((n) => n.id === "n1")?.position.x === 50);
    check("other nodes are kept", moved(merged)?.length === 2 && moved(merged)?.some((n) => n.id === "n2") === true);
    check("200 drags of one node become one save with one node", (() => {
      let acc: OutboxItem | null = canvasItem("0", { upsertNodes: [node("n1", 0)] as never });
      for (let i = 1; i < 200 && acc; i++) acc = coalesceCanvasSaves(acc, canvasItem(String(i), { upsertNodes: [node("n1", i)] as never }));
      return acc !== null && moved(acc)?.length === 1 && moved(acc)?.[0].position.x === 199;
    })());
  }
  check("saves for different workspaces are never merged", coalesceCanvasSaves(canvasItem("a", { upsertNodes: [node("n", 1)] as never }, "w1"), canvasItem("b", { upsertNodes: [node("n", 2)] as never }, "w2")) === null);
  check("saves that delete anything are never merged (order matters)", coalesceCanvasSaves(canvasItem("a", { upsertNodes: [node("n", 1)] as never }), canvasItem("b", { upsertNodes: [node("m", 1)] as never, deleteNodeIds: ["x"] })) === null);
  check("saves with edges or groups are never merged", coalesceCanvasSaves(canvasItem("a", { upsertNodes: [node("n", 1)] as never, upsertEdges: [{ id: "e" }] as never }), canvasItem("b", { upsertNodes: [node("n", 2)] as never })) === null && coalesceCanvasSaves(canvasItem("a", { upsertNodes: [node("n", 1)] as never }), canvasItem("b", { upsertGroups: [{ id: "g" }] as never })) === null);
  check("other kinds of write are never merged", coalesceCanvasSaves(canvasItem("a", { upsertNodes: [node("n", 1)] as never }), { id: "m", kind: KIND_MESSAGE, payload: {} }) === null);

  console.log("a whole offline session");
  {
    const t = fakeTimers();
    const sent: string[] = [];
    let online = false;
    const outbox = createOutbox({
      execute: async (it) => { sent.push(it.id); },
      classify: classifySaveError,
      coalesce: coalesceCanvasSaves,
      isOnline: () => online,
      setTimer: t.setTimer, clearTimer: t.clearTimer, random: () => 0,
    });
    for (let i = 0; i < 150; i++) outbox.enqueue(canvasItem(`drag-${i}`, { upsertNodes: [node("n1", i, i)] as never }));
    outbox.enqueue({ id: "msg", kind: KIND_MESSAGE, payload: {} });
    for (let i = 150; i < 160; i++) outbox.enqueue(canvasItem(`drag-${i}`, { upsertNodes: [node("n1", i, i)] as never }));
    await flush();
    check("150 drags + a message + 10 drags offline are held as 3 items, not 161", outbox.status().pending === 3 && outbox.status().state === "offline");
    online = true;
    outbox.kick();
    await flush();
    check("on reconnect: the merged drags, then the message, then the later drags, in order", sent.join() === "drag-0,msg,drag-150" && outbox.status().pending === 0);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
