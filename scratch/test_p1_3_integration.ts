/**
 * P1.3 — The app's real outbox with a fake network: messages and conversation canvases saved
 * while the connection is down arrive after it returns, repeats are harmless, hopeless saves are
 * dropped without blocking the rest. Plus structural checks that the app is wired to it.
 *
 * Run: npx tsx scratch/test_p1_3_integration.ts
 */

import { readFileSync } from "node:fs";
import {
  enqueueCanvasSave,
  enqueueConversationCanvasSave,
  enqueueMessageSave,
  installOutboxBrowserHooks,
  onOutboxDrop,
  outbox,
  registerExecutor,
} from "../src/app/lib/persistence/client/outboxRuntime";
import { KIND_CANVAS } from "../src/app/lib/persistence/client/saveOutbox";

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

const flush = async () => {
  for (let i = 0; i < 25; i++) await new Promise((r) => setImmediate(r));
};

type Call = { method: string; url: string; body: unknown };
type Plan = (call: Call) => { status: number; body?: unknown } | "network-down";

/** A fake network. `plan` decides each request's fate; every request is recorded. */
function fakeNetwork(plan: Plan) {
  const calls: Call[] = [];
  (globalThis as unknown as { fetch: unknown }).fetch = async (url: string, init?: { method?: string; body?: string }) => {
    const call: Call = { method: init?.method ?? "GET", url: String(url), body: init?.body ? JSON.parse(init.body) : undefined };
    calls.push(call);
    const r = plan(call);
    if (r === "network-down") throw new TypeError("Failed to fetch");
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status, headers: { "Content-Type": "application/json" } });
  };
  return calls;
}

const WS = "11111111-1111-4111-8111-111111111111";
const CONV = "22222222-2222-4222-8222-222222222222";
const msg = (id: string, content = "hello") => ({ workspaceId: WS, conversationId: CONV, conversationTitle: "Chat", message: { id, role: "user", content } });

async function settle() {
  // Give a retry timer's worth of time without waiting for it: kick runs everything due immediately.
  for (let i = 0; i < 6; i++) {
    outbox.kick();
    await flush();
    if (outbox.status().pending === 0) return;
  }
}

async function main() {
  console.log("messages");
  {
    let down = true;
    const calls = fakeNetwork(() => (down ? "network-down" : { status: 200, body: {} }));
    enqueueMessageSave(msg("m1", "first"));
    enqueueMessageSave(msg("m2", "second"));
    await flush();
    check("with the network down, messages wait (nothing lost)", outbox.status().pending === 2 && outbox.status().state === "waiting");
    check("only the first was tried, so the second cannot overtake it", calls.length === 1 && (calls[0].body as { id: string }).id === "m1");
    down = false;
    await settle();
    const saved = calls.filter((c) => c.method === "POST" && c.url.includes("/messages")).map((c) => (c.body as { id: string }).id);
    check("after the network returns both are saved, in order", outbox.status().pending === 0 && saved.slice(-2).join() === "m1,m2", saved.join());
    check("they go to the right conversation", calls.at(-1)!.url.includes(`/conversations/${CONV}/messages`));
  }
  {
    const calls = fakeNetwork(() => ({ status: 409, body: { error: { code: "CONFLICT", message: "duplicate message id" } } }));
    enqueueMessageSave(msg("dup"));
    await flush();
    check("a message that was already saved (earlier attempt reached the server) counts as done", outbox.status().pending === 0 && calls.length === 1);
  }
  {
    // The conversation does not exist on the server yet: it is created, then the message is saved.
    let step = 0;
    const calls = fakeNetwork((c) => {
      step++;
      if (c.url.endsWith("/messages") && step === 1) return { status: 404, body: { error: { code: "NOT_FOUND", message: "Conversation not found in workspace" } } };
      return { status: 200, body: {} };
    });
    enqueueMessageSave(msg("heal"));
    await flush();
    check("a missing conversation is created, then the message saved", calls.length === 3 && calls[1].method === "POST" && calls[1].url.endsWith("/conversations") && calls[2].url.endsWith("/messages") && outbox.status().pending === 0);
  }
  {
    const dropped: string[] = [];
    const off = onOutboxDrop((item) => dropped.push(item.id));
    const calls = fakeNetwork((c) => ((c.body as { id?: string })?.id === "bad" ? { status: 400, body: { error: { code: "VALIDATION_ERROR", message: "bad" } } } : { status: 200, body: {} }));
    enqueueMessageSave(msg("bad"));
    enqueueMessageSave(msg("good"));
    await flush();
    off();
    check("a message the server will never accept is dropped and reported", dropped.length === 1 && outbox.status().dropped >= 1);
    check("and does not block the next message", calls.some((c) => (c.body as { id?: string })?.id === "good") && outbox.status().pending === 0);
  }
  {
    let attempts = 0;
    fakeNetwork(() => (++attempts < 3 ? { status: 503, body: {} } : { status: 200, body: {} }));
    enqueueMessageSave(msg("flaky"));
    await flush();
    check("a server error is retried, not dropped", outbox.status().pending === 1 && outbox.status().state === "waiting");
    await settle();
    check("and succeeds once the server recovers", outbox.status().pending === 0 && attempts === 3);
  }

  console.log("conversation canvas");
  {
    let down = true;
    const calls = fakeNetwork(() => (down ? "network-down" : { status: 200, body: {} }));
    enqueueConversationCanvasSave({ workspaceId: WS, conversationId: CONV, canvas: { nodes: [{ id: "v1" }] } });
    await flush(); // first attempt fails: now waiting
    enqueueConversationCanvasSave({ workspaceId: WS, conversationId: CONV, canvas: { nodes: [{ id: "v2" }] } });
    enqueueConversationCanvasSave({ workspaceId: WS, conversationId: CONV, canvas: { nodes: [{ id: "v3" }] } });
    check("waiting snapshots of the same conversation collapse into one", outbox.status().pending === 1);
    down = false;
    await settle();
    const patches = calls.filter((c) => c.method === "PATCH");
    const last = patches.at(-1)!.body as { metadata: { canvas: { nodes: Array<{ id: string }> } } };
    check("the latest snapshot is what gets saved", outbox.status().pending === 0 && last.metadata.canvas.nodes[0].id === "v3");
  }
  {
    const calls = fakeNetwork(() => ({ status: 200, body: {} }));
    const other = "33333333-3333-4333-8333-333333333333";
    enqueueConversationCanvasSave({ workspaceId: WS, conversationId: CONV, canvas: { nodes: [] } });
    enqueueConversationCanvasSave({ workspaceId: WS, conversationId: other, canvas: { nodes: [] } });
    await flush();
    check("snapshots of different conversations are kept separate", calls.filter((c) => c.method === "PATCH").length === 2);
  }

  console.log("canvas saves without a handler");
  {
    const dropped: string[] = [];
    const off = onOutboxDrop((item) => dropped.push(item.kind));
    fakeNetwork(() => ({ status: 200, body: {} }));
    enqueueCanvasSave({ workspaceId: WS, mutation: { upsertNodes: [{ id: "n" }] as never } });
    await flush();
    off();
    check("with no canvas handler registered the save is dropped, and nothing gets stuck", dropped.includes(KIND_CANVAS) && outbox.status().pending === 0);
  }
  {
    let revision = 5;
    const sent: number[] = [];
    const unregister = registerExecutor(KIND_CANVAS, async (item) => {
      sent.push(revision);
      void item;
    });
    fakeNetwork(() => ({ status: 200, body: {} }));
    enqueueCanvasSave({ workspaceId: WS, mutation: { upsertNodes: [{ id: "n1", position: { x: 1, y: 1 } }] as never } });
    await flush();
    unregister();
    revision++;
    check("a registered canvas handler receives the save", sent.length === 1 && outbox.status().pending === 0);
  }

  console.log("browser wiring");
  {
    const listeners: Record<string, Array<(e?: unknown) => void>> = {};
    const w = globalThis as unknown as Record<string, unknown>;
    const fakeWindow = {
      addEventListener: (t: string, f: () => void) => ((listeners[`w:${t}`] ??= []).push(f)),
      removeEventListener: (t: string, f: () => void) => { listeners[`w:${t}`] = (listeners[`w:${t}`] ?? []).filter((x) => x !== f); },
    };
    const fakeDocument = {
      hidden: false,
      addEventListener: (t: string, f: () => void) => ((listeners[`d:${t}`] ??= []).push(f)),
      removeEventListener: (t: string, f: () => void) => { listeners[`d:${t}`] = (listeners[`d:${t}`] ?? []).filter((x) => x !== f); },
    };
    w.window = fakeWindow;
    w.document = fakeDocument;
    const off1 = installOutboxBrowserHooks();
    const off2 = installOutboxBrowserHooks();
    check("it listens for the browser coming back online, the tab becoming visible, and the tab closing", ["w:online", "d:visibilitychange", "w:beforeunload"].every((k) => listeners[k]?.length === 1));
    check("installing twice does not double up", listeners["w:online"].length === 1);

    // Closing the tab with nothing unsaved must not prompt; with unsaved work it must.
    const evt = { prevented: false, returnValue: undefined as unknown, preventDefault() { this.prevented = true; } };
    listeners["w:beforeunload"][0](evt);
    check("closing the tab with nothing waiting does not warn", evt.prevented === false);
    fakeNetwork(() => "network-down");
    enqueueMessageSave(msg("unsaved"));
    await flush();
    const evt2 = { prevented: false, returnValue: undefined as unknown, preventDefault() { this.prevented = true; } };
    listeners["w:beforeunload"][0](evt2);
    check("closing the tab with unsaved changes asks the browser to warn", evt2.prevented === true && evt2.returnValue === "");

    // Back online: the browser's event triggers an immediate retry.
    fakeNetwork(() => ({ status: 200, body: {} }));
    listeners["w:online"][0]();
    await flush();
    check("the browser's online event retries at once", outbox.status().pending === 0);

    off1();
    check("still installed while another component uses it", listeners["w:online"].length === 1);
    off2();
    check("fully removed when the last user leaves", (listeners["w:online"] ?? []).length === 0 && (listeners["d:visibilitychange"] ?? []).length === 0 && (listeners["w:beforeunload"] ?? []).length === 0);
    delete w.window;
    delete w.document;
  }

  console.log("the app is wired to it");
  const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  const hook = read("src/app/lib/persistence/client/useCanvasPersistence.ts");
  check("canvas saves are queued in the shared outbox", /enqueueCanvasSave\(\{ workspaceId: targetWorkspaceId, mutation \}\)/.test(hook));
  check("the canvas hook registers how to send them (it owns the revision)", /registerExecutor\(KIND_CANVAS, execute\)/.test(hook));
  check("temporary failures are rethrown so the outbox retries; hopeless ones are reported", /classifySaveError\(err\) === "drop"\) handleError\(err\);\s*throw err;/.test(hook));
  check("waiting canvas saves are discarded when the user leaves that workspace", /outbox\.discard\(/.test(hook) && /KIND_CANVAS/.test(hook));
  const conv = read("src/app/lib/persistence/client/useConversationPersistence.ts");
  check("a message that fails for connection reasons is queued, not lost", (conv.match(/classifySaveError\(\w+\) === "retry"/g) ?? []).length === 2 && (conv.match(/enqueueMessageSave\(/g) ?? []).length === 2);
  check("the local message is still never removed", /Never delete or revert local message/.test(conv));
  const page = read("src/app/app/page.tsx");
  check("conversation canvases are saved through the outbox", (page.match(/enqueueConversationCanvasSave\(/g) ?? []).length === 3 && !/updateConversationApi\(/.test(page));
  check("the page installs the browser hooks once", /useEffect\(\(\) => installOutboxBrowserHooks\(\), \[\]\)/.test(page));
  check("the status badge shows offline / retrying with the waiting count", /system-persistence-offline/.test(page) && /useOutboxStatus\(\)/.test(page) && /\$\{outboxStatus\.pending\} waiting/.test(page));
  check("the offline badge takes priority over a generic save error", page.indexOf("system-persistence-offline") < page.indexOf('data-testid="system-persistence-error"'));
  const rt = read("src/app/lib/persistence/client/outboxRuntime.ts");
  check("the status hook returns a stable snapshot (no render loops)", /let snapshot: OutboxStatus/.test(rt) && /useSyncExternalStore/.test(rt) && /SERVER_SNAPSHOT/.test(rt));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
