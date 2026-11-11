/**
 * P1.2 — Simultaneous edits: saves are queued and rebased instead of silently dropped.
 *
 * A fake server mimics the real rule (a save must carry the current revision, otherwise it is
 * rejected as stale; every accepted save bumps the revision). Two fake clients then edit at once.
 *
 * Run: npx tsx scratch/test_p1_2_canvas_rebase.ts
 */

import { readFileSync } from "node:fs";
import {
  CanvasPersistenceApiError,
  CanvasPersistenceConflictError,
  fetchCanvasRevisionApi,
  persistCanvasMutation,
} from "../src/app/lib/persistence/client/canvasApi";
import { SaveAbandoned, createSaveQueue, saveWithRebase } from "../src/app/lib/persistence/client/canvasSaveQueue";

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

type Mutation = { set?: Record<string, string> };

/** The authoritative state: revision plus the stored value of every entity. */
class FakeServer {
  revision = 1;
  entities: Record<string, string> = {};
  fetches = 0;
  sends = 0;
  /** Runs once, at the start of the next send, to simulate someone else saving first. */
  interleave: (() => void) | null = null;

  async send(m: Mutation, base: number) {
    this.sends++;
    if (this.interleave) {
      const f = this.interleave;
      this.interleave = null;
      f();
    }
    if (base !== this.revision) throw new CanvasPersistenceConflictError("stale");
    Object.assign(this.entities, m.set ?? {});
    this.revision++;
    return { newRevision: this.revision };
  }
  async fetchRevision() {
    this.fetches++;
    return this.revision;
  }
}

/** A client's belief about the current revision, plus the save plumbing. */
function client(server: FakeServer, startRevision: number) {
  let revision: number | null = startRevision;
  const queue = createSaveQueue();
  return {
    get revision() { return revision; },
    queue,
    save: (m: Mutation, extra: Partial<Parameters<typeof saveWithRebase<Mutation>>[1]> = {}) =>
      saveWithRebase(m, {
        send: (mm, base) => server.send(mm, base),
        fetchRevision: () => server.fetchRevision(),
        getRevision: () => revision,
        setRevision: (r) => { revision = r; },
        isStale: (e) => e instanceof CanvasPersistenceConflictError,
        ...extra,
      }),
  };
}

async function outcome<T>(p: Promise<T>) {
  try {
    return { ok: true as const, value: await p };
  } catch (error) {
    return { ok: false as const, error };
  }
}

async function main() {
  console.log("the problem, reproduced (old behaviour: no rebase)");
  {
    const s = new FakeServer();
    const b = client(s, 1);
    await s.send({ set: { a: "from A" } }, 1); // A saves first: revision is now 2
    const old = await outcome(s.send({ set: { b: "from B" } }, b.revision!));
    check("without rebase B's save is rejected as stale", !old.ok && old.error instanceof CanvasPersistenceConflictError);
    const old2 = await outcome(s.send({ set: { c: "from B again" } }, b.revision!));
    check("and every later save from B keeps failing (revision never refreshed)", !old2.ok);
    check("so B's work never reaches the database", s.entities.b === undefined && s.entities.c === undefined);
  }

  console.log("two people edit at once");
  {
    const s = new FakeServer();
    const b = client(s, 1);
    await s.send({ set: { a: "from A" } }, 1);
    const r = await b.save({ set: { b: "from B" } });
    check("B's stale save is rebased and succeeds", r.newRevision === 3 && r.attempts === 2);
    check("the database has BOTH people's changes", s.entities.a === "from A" && s.entities.b === "from B");
    check("B learned the new revision", b.revision === 3);
    const sendsBefore = s.sends;
    const fetchesBefore = s.fetches;
    await b.save({ set: { c: "from B later" } });
    check("B's next save goes straight through (no second round trip)", s.sends - sendsBefore === 1 && s.fetches === fetchesBefore);
  }

  console.log("same item edited by both");
  {
    const s = new FakeServer();
    const b = client(s, 1);
    await s.send({ set: { node1: "A's title" } }, 1);
    await b.save({ set: { node1: "B's title" } });
    check("the later save wins (same rule as the live sync)", s.entities.node1 === "B's title");
  }

  console.log("someone saves in the middle of a rebase");
  {
    const s = new FakeServer();
    const b = client(s, 1);
    await s.send({ set: { a: "1" } }, 1);
    // After B fetches the new revision but before B's retry lands, another save sneaks in.
    s.interleave = null;
    let sneaked = false;
    const origFetch = s.fetchRevision.bind(s);
    s.fetchRevision = async () => {
      const rev = await origFetch();
      if (!sneaked) {
        sneaked = true;
        s.interleave = () => { s.revision++; };
      }
      return rev;
    };
    const r = await b.save({ set: { b: "2" } });
    check("it rebases again and still succeeds", r.attempts === 3 && s.entities.b === "2");
  }
  {
    const s = new FakeServer();
    const b = client(s, 1);
    // A different person saves in front of every attempt, forever.
    const origSend = s.send.bind(s);
    s.send = async (m, base) => { s.revision++; return origSend(m, base); };
    const r = await outcome(b.save({ set: { b: "x" } }));
    check("if it can never catch up it stops after 4 attempts with a conflict", !r.ok && r.error instanceof CanvasPersistenceConflictError && s.sends === 4);
    check("it refreshed the revision between attempts (3 times, not after the last)", s.fetches === 3);
    check("and nothing was written", s.entities.b === undefined);
  }

  console.log("errors that are not stale");
  {
    const s = new FakeServer();
    const b = client(s, 1);
    s.send = async () => { throw new CanvasPersistenceApiError(409, "INVALID_RELATIONSHIP", "edge points at a deleted node"); };
    const r = await outcome(b.save({ set: { a: "x" } }));
    check("a real error is thrown at once, unchanged", !r.ok && r.error instanceof CanvasPersistenceApiError && (r.error as CanvasPersistenceApiError).code === "INVALID_RELATIONSHIP");
    check("without any retry or revision fetch", s.fetches === 0);
  }
  {
    const s = new FakeServer();
    const b = client(s, 1);
    await s.send({ set: { a: "1" } }, 1);
    s.fetchRevision = async () => { throw new Error("network down"); };
    const r = await outcome(b.save({ set: { b: "2" } }));
    check("if the revision lookup fails, that error surfaces", !r.ok && (r.error as Error).message === "network down");
  }

  console.log("guards");
  {
    const s = new FakeServer();
    const notReady = client(s, 1);
    const r1 = await outcome(saveWithRebase({}, {
      send: (m, base) => s.send(m, base), fetchRevision: () => s.fetchRevision(),
      getRevision: () => null, setRevision: () => undefined, isStale: () => false,
    }));
    check("nothing is sent before the first revision is known", !r1.ok && r1.error instanceof SaveAbandoned && s.sends === 0);
    const r2 = await outcome(notReady.save({}, { shouldContinue: () => false }));
    check("nothing is sent if the workspace changed", !r2.ok && r2.error instanceof SaveAbandoned && s.sends === 0);
  }

  console.log("one tab racing itself (old bug)");
  {
    const s = new FakeServer();
    const tab = client(s, 1);
    // Fire two saves at the same moment, the old way: both read revision 1.
    const both = await Promise.all([
      outcome(s.send({ set: { x: "1" } }, tab.revision!)),
      outcome(s.send({ set: { y: "2" } }, tab.revision!)),
    ]);
    check("old way: the second of two quick saves is lost", both.filter((r) => !r.ok).length === 1);
  }
  {
    const s = new FakeServer();
    const tab = client(s, 1);
    const results = await Promise.all([
      tab.queue.enqueue(() => tab.save({ set: { x: "1" } })),
      tab.queue.enqueue(() => tab.save({ set: { y: "2" } })),
      tab.queue.enqueue(() => tab.save({ set: { z: "3" } })),
    ]);
    check("queued: all three quick saves are stored", s.entities.x === "1" && s.entities.y === "2" && s.entities.z === "3");
    check("each used the revision the previous one produced", results.map((r) => r.newRevision).join() === "2,3,4");
    check("with no stale rejections at all", s.fetches === 0 && s.sends === 3);
  }

  console.log("queue behaviour");
  {
    const q = createSaveQueue();
    const order: string[] = [];
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const a = q.enqueue(async () => { await delay(30); order.push("a"); return "A"; });
    const b = q.enqueue(async () => { order.push("b"); throw new Error("b failed"); });
    const c = q.enqueue(async () => { order.push("c"); return "C"; });
    check("work is counted while pending", q.pending === 3);
    const [ra, rb, rc] = await Promise.all([outcome(a), outcome(b), outcome(c)]);
    check("tasks run strictly in order, even when the first is slow", order.join("") === "abc");
    check("each caller gets its own result or error", ra.ok && ra.value === "A" && !rb.ok && rc.ok && rc.value === "C");
    check("a failed save does not block the ones behind it", order.includes("c"));
    await delay(5);
    check("pending drops back to zero", q.pending === 0);
  }

  console.log("API layer");
  const realFetch = globalThis.fetch;
  const respond = (status: number, body: unknown) => {
    (globalThis as unknown as { fetch: unknown }).fetch = async () =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  };
  respond(409, { ok: false, code: "STALE_REVISION", message: "Stale workspace revision" });
  check("409 STALE_REVISION is a rebase-able conflict", (await outcome(persistCanvasMutation("w", {} as never))).ok === false && (await outcome(persistCanvasMutation("w", {} as never)) as { error: unknown }).error instanceof CanvasPersistenceConflictError);
  respond(409, { ok: false, code: "INVALID_RELATIONSHIP", message: "node deleted" });
  const other = await outcome(persistCanvasMutation("w", {} as never));
  check("any other 409 is NOT treated as stale", !other.ok && other.error instanceof CanvasPersistenceApiError && !(other.error instanceof CanvasPersistenceConflictError));
  respond(409, { message: "old server without a code" });
  check("a 409 without a code still counts as stale (older servers)", (await outcome(persistCanvasMutation("w", {} as never)) as { error: unknown }).error instanceof CanvasPersistenceConflictError);
  respond(200, { ok: true, revision: 7 });
  check("revision lookup returns the number", (await fetchCanvasRevisionApi("w")) === 7);
  respond(200, { ok: true, revision: "7" });
  check("revision lookup rejects a malformed answer", (await outcome(fetchCanvasRevisionApi("w"))).ok === false);
  respond(403, { ok: false, code: "FORBIDDEN", message: "not a member" });
  const forbidden = await outcome(fetchCanvasRevisionApi("w"));
  check("revision lookup surfaces permission errors", !forbidden.ok && (forbidden.error as CanvasPersistenceApiError).status === 403);
  (globalThis as unknown as { fetch: unknown }).fetch = realFetch;

  console.log("wiring");
  const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  const hook = read("src/app/lib/persistence/client/useCanvasPersistence.ts");
  check("both save paths go through the shared outbox (P1.3), which rebases", (hook.match(/enqueueSave\(/g) ?? []).length === 3 && /enqueueCanvasSave\(/.test(hook) && /saveWithRebase\(/.test(hook));
  check("the hook no longer sends saves directly", !/await persistCanvasMutation\(workspaceId/.test(hook));
  check("a save queued for another workspace is dropped", /workspaceIdRef\.current === target\b/.test(hook));
  check("abandoned saves are not reported as errors", /err instanceof SaveAbandoned\) return/.test(hook));
  const route = read("src/app/api/workspace/[workspaceId]/canvas/route.ts");
  const get = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"));
  check("GET revision requires membership before reading", get.indexOf("requireWorkspaceMember") !== -1 && get.indexOf("requireWorkspaceMember") < get.indexOf('.from("workspaces")'));
  check("GET revision returns only the number and is not cached", /revision: Number\(data\.revision\)/.test(get) && /no-store/.test(get) && !/select\("\*"\)/.test(get));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
