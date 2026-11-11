/**
 * P1.7 — Canvas undo / redo: diffing, applying, the history stack, and what happens when a
 * collaborator changed the same canvas in between. Includes a randomized round-trip check.
 *
 * Run: npx tsx scratch/test_p1_7_canvas_history.ts
 */

import type { CanvasEdge, CanvasGroup, CanvasNode, CanvasState } from "../src/app/lib/applyCanvasActions";
import {
  DEFAULT_HISTORY_LIMIT,
  applyChange,
  canvasDiffToMutation,
  createCanvasHistory,
  diffToChange,
  invertChange,
  isEmptyChange,
} from "../src/app/lib/canvasHistory";

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

const node = (id: string, x = 0, y = 0, extra: Partial<CanvasNode> = {}): CanvasNode => ({ id, nodeType: "idea", title: `T-${id}`, position: { x, y }, ...extra });
const edge = (id: string, s: string, t: string, relationship?: string): CanvasEdge => ({ id, sourceId: s, targetId: t, ...(relationship ? { relationship } : {}) });
const group = (id: string, ids: string[], title = `G-${id}`): CanvasGroup => ({ id, title, memberIds: ids });
const canvas = (nodes: CanvasNode[] = [], edges: CanvasEdge[] = [], groups: CanvasGroup[] = []): CanvasState => ({ nodes, edges, groups });

/** Canonical form for comparing canvases regardless of order. */
const canon = (c: CanvasState) =>
  JSON.stringify({
    nodes: [...c.nodes].map((n) => ({ ...n, description: n.description || undefined })).sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...c.edges].map((e) => ({ ...e, relationship: e.relationship || undefined })).sort((a, b) => a.id.localeCompare(b.id)),
    groups: [...c.groups].map((g) => ({ ...g, memberIds: [...g.memberIds].sort() })).sort((a, b) => a.id.localeCompare(b.id)),
  });

/** Seeded random numbers, so a failing case can be reproduced. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function randomCanvas(r: () => number): CanvasState {
  const n = Math.floor(r() * 6);
  const nodes = Array.from({ length: n }, (_, i) => node(`n${i}`, Math.floor(r() * 500), Math.floor(r() * 500), { title: `title ${Math.floor(r() * 3)}`, nodeType: r() < 0.5 ? "idea" : "problem", ...(r() < 0.4 ? { description: `d${Math.floor(r() * 3)}` } : {}) }));
  const edges: CanvasEdge[] = [];
  for (let i = 0; i < n * 2; i++) {
    if (n < 2) break;
    const a = nodes[Math.floor(r() * n)].id;
    const b = nodes[Math.floor(r() * n)].id;
    if (a !== b && !edges.some((e) => e.sourceId === a && e.targetId === b)) edges.push(edge(`e${i}`, a, b, r() < 0.5 ? "causes" : undefined));
  }
  const groups = n >= 2 && r() < 0.6 ? [group("g1", nodes.filter(() => r() < 0.6).map((x) => x.id), `grp ${Math.floor(r() * 3)}`)] : [];
  return { nodes, edges, groups };
}

function mutate(c: CanvasState, r: () => number): CanvasState {
  let out: CanvasState = JSON.parse(JSON.stringify(c));
  const steps = 1 + Math.floor(r() * 4);
  for (let i = 0; i < steps; i++) {
    const roll = r();
    if (roll < 0.25 && out.nodes.length) { const t = out.nodes[Math.floor(r() * out.nodes.length)]; t.position = { x: Math.floor(r() * 500), y: Math.floor(r() * 500) }; }
    else if (roll < 0.4 && out.nodes.length) { const t = out.nodes[Math.floor(r() * out.nodes.length)]; t.title = `renamed ${Math.floor(r() * 9)}`; }
    else if (roll < 0.5 && out.nodes.length) { const t = out.nodes[Math.floor(r() * out.nodes.length)]; t.description = r() < 0.5 ? undefined : `new ${Math.floor(r() * 9)}`; }
    else if (roll < 0.65) out.nodes.push(node(`add${i}-${Math.floor(r() * 1000)}`, Math.floor(r() * 500), Math.floor(r() * 500)));
    else if (roll < 0.8 && out.nodes.length) { const gone = out.nodes[Math.floor(r() * out.nodes.length)].id; out.nodes = out.nodes.filter((n) => n.id !== gone); out.edges = out.edges.filter((e) => e.sourceId !== gone && e.targetId !== gone); out.groups = out.groups.map((g) => ({ ...g, memberIds: g.memberIds.filter((m) => m !== gone) })); }
    else if (roll < 0.9 && out.nodes.length >= 2) { const a = out.nodes[0].id, b = out.nodes[out.nodes.length - 1].id; if (a !== b && !out.edges.some((e) => e.sourceId === a && e.targetId === b)) out.edges.push(edge(`ne${i}-${Math.floor(r() * 1000)}`, a, b, "solves")); }
    else if (out.edges.length) { const gone = out.edges[Math.floor(r() * out.edges.length)].id; out.edges = out.edges.filter((e) => e.id !== gone); }
  }
  return out;
}

function main() {
  console.log("diffing");
  check("identical canvases have an empty change", isEmptyChange(diffToChange(canvas([node("a")]), canvas([node("a")]))));
  check("an added node is an add", (() => { const c = diffToChange(canvas(), canvas([node("a")])); return c.nodes.length === 1 && c.nodes[0].kind === "add"; })());
  check("a removed node is a remove", (() => { const c = diffToChange(canvas([node("a")]), canvas()); return c.nodes.length === 1 && c.nodes[0].kind === "remove"; })());
  check("a move records only the position", (() => { const c = diffToChange(canvas([node("a", 1, 1)]), canvas([node("a", 9, 9)])); const n = c.nodes[0]; return n.kind === "update" && Object.keys(n.fields).join() === "position"; })());
  check("a rename records only the title", (() => { const c = diffToChange(canvas([node("a")]), canvas([node("a", 0, 0, { title: "new" })])); const n = c.nodes[0]; return n.kind === "update" && Object.keys(n.fields).join() === "title"; })());
  check("no description and an empty description are the same", isEmptyChange(diffToChange(canvas([node("a")]), canvas([node("a", 0, 0, { description: "" })]))));
  check("an edge label change is an update", (() => { const c = diffToChange(canvas([node("a"), node("b")], [edge("e", "a", "b", "causes")]), canvas([node("a"), node("b")], [edge("e", "a", "b", "solves")])); return c.edges.length === 1 && c.edges[0].kind === "update"; })());
  check("group membership order does not matter", isEmptyChange(diffToChange(canvas([node("a"), node("b")], [], [group("g", ["a", "b"])]), canvas([node("a"), node("b")], [], [group("g", ["b", "a"])]))));

  console.log("applying and undoing");
  {
    const before = canvas([node("a", 1, 1), node("b", 5, 5)], [edge("e", "a", "b")]);
    const after = canvas([node("a", 40, 40), node("b", 5, 5), node("n", 9, 9)], [edge("e", "a", "b"), edge("e2", "a", "n", "causes")], [group("g", ["a", "n"])]);
    const change = diffToChange(before, after);
    check("applying a change reproduces the later canvas", canon(applyChange(before, change).canvas) === canon(after));
    check("applying its inverse restores the earlier canvas", canon(applyChange(after, invertChange(change)).canvas) === canon(before));
    check("the inverse of the inverse is the original", canon(applyChange(before, invertChange(invertChange(change))).canvas) === canon(after));
    const noop = applyChange(before, { nodes: [], edges: [], groups: [] });
    check("applying nothing returns the same object", noop.canvas === before && noop.applied === 0);
  }

  console.log("randomized round trips (300 cases)");
  {
    let bad = 0;
    let firstBad = "";
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed);
      const a = randomCanvas(r);
      const b = mutate(a, r);
      const change = diffToChange(a, b);
      const forward = canon(applyChange(a, change).canvas) === canon(b);
      const backward = canon(applyChange(b, invertChange(change)).canvas) === canon(a);
      if (!forward || !backward) {
        bad++;
        if (!firstBad) firstBad = `seed ${seed}: forward=${forward} backward=${backward}`;
      }
    }
    check("apply(diff) gives the later canvas and apply(inverse) gives the earlier one, every time", bad === 0, firstBad);
  }

  console.log("when a collaborator changed things in between");
  {
    const start = canvas([node("a", 10, 10), node("b", 200, 10)]);
    const afterMyMove = canvas([node("a", 99, 99), node("b", 200, 10)]);
    const myChange = diffToChange(start, afterMyMove);
    // A collaborator renames A and moves B after my move.
    const theirs = canvas([node("a", 99, 99, { title: "THEIR TITLE" }), node("b", 777, 777)]);
    const undone = applyChange(theirs, invertChange(myChange)).canvas;
    const a = undone.nodes.find((n) => n.id === "a")!;
    const b = undone.nodes.find((n) => n.id === "b")!;
    check("undoing my move puts my node back", a.position.x === 10 && a.position.y === 10);
    check("their rename of that node is kept", a.title === "THEIR TITLE");
    check("their move of another node is untouched", b.position.x === 777);
  }
  {
    const start = canvas([node("m", 0, 0)]);
    const aiAdds = canvas([node("m", 0, 0), node("n", 5, 5)], [edge("e", "m", "n", "causes")]);
    const aiChange = diffToChange(start, aiAdds);
    // A collaborator then connects N to a node of their own.
    const theirs = canvas([node("m"), node("n", 5, 5), node("x", 50, 50)], [edge("e", "m", "n", "causes"), edge("e2", "n", "x", "needs")]);
    const r = applyChange(theirs, invertChange(aiChange));
    const ids = new Set(r.canvas.nodes.map((n) => n.id));
    check("undoing the AI's additions removes them", !ids.has("n") && !r.canvas.edges.some((e) => e.id === "e"));
    check("a collaborator's link to a removed node goes too (nothing dangles)", !r.canvas.edges.some((e) => e.sourceId === "n" || e.targetId === "n") && r.canvas.edges.every((e) => ids.has(e.sourceId) && ids.has(e.targetId)));
    check("their own node is kept", ids.has("x"));
  }
  {
    const full = canvas([node("a"), node("b")], [edge("e", "a", "b")]);
    const afterDelete = canvas([node("a")]); // I deleted b (and so its edge)
    const del = diffToChange(full, afterDelete);
    // Meanwhile a collaborator deleted node a. Undoing my delete restores b, but its edge to a cannot come back.
    const r = applyChange(canvas(), invertChange(del));
    check("undoing a delete brings the node back", r.canvas.nodes.some((n) => n.id === "b"));
    check("but not an edge whose other end is gone", r.canvas.edges.length === 0 && r.skipped >= 1);
  }
  {
    const start = canvas([node("a", 1, 1)]);
    const mine = diffToChange(start, canvas([node("a", 9, 9)]));
    const r = applyChange(canvas(), invertChange(mine)); // the node no longer exists
    check("undoing a change to something that was deleted is skipped, not an error", r.applied === 0 && r.skipped === 1 && r.canvas.nodes.length === 0);
  }
  {
    const g0 = canvas([node("a"), node("b")], [], [group("g", ["a", "b"])]);
    const g1 = canvas([node("a"), node("b")], [], [group("g", ["a"])]);
    const ch = diffToChange(g0, g1);
    const theirs = canvas([node("a")], [], [group("g", ["a"])]); // b was deleted by someone else
    const r = applyChange(theirs, invertChange(ch)).canvas;
    check("group members that no longer exist are not put back", JSON.stringify(r.groups[0].memberIds) === JSON.stringify(["a"]));
  }

  console.log("the history stack");
  {
    let t = 0;
    const h = createCanvasHistory({ now: () => t });
    const c0 = canvas([node("a", 0, 0)]);
    const c1 = canvas([node("a", 0, 0), node("b", 1, 1)]);
    const c2 = canvas([node("a", 0, 0), node("b", 1, 1), node("c", 2, 2)]);
    check("nothing to undo at the start", !h.canUndo("k") && !h.canRedo("k") && h.undo("k", c0) === null && h.redo("k", c0) === null);
    t = 10_000; h.record("k", diffToChange(c0, c1), "Add b");
    t = 20_000; h.record("k", diffToChange(c1, c2), "Add c");
    check("recording enables undo and shows the latest label", h.canUndo("k") && !h.canRedo("k") && h.peekUndo("k") === "Add c");
    const u1 = h.undo("k", c2)!;
    check("undo reverses the latest step", u1.label === "Add c" && canon(u1.canvas) === canon(c1));
    check("and enables redo", h.canRedo("k") && h.peekRedo("k") === "Add c");
    const u2 = h.undo("k", u1.canvas)!;
    check("undo again goes one step further back", u2.label === "Add b" && canon(u2.canvas) === canon(c0) && !h.canUndo("k"));
    const r1 = h.redo("k", u2.canvas)!;
    check("redo replays the step", canon(r1.canvas) === canon(c1) && h.canUndo("k"));
    t = 30_000; h.record("k", diffToChange(c1, canvas([node("a", 0, 0), node("b", 1, 1), node("z", 9, 9)])), "Add z");
    check("a new change ends the redo trail", !h.canRedo("k") && h.peekUndo("k") === "Add z");
    check("histories are separate per conversation", !h.canUndo("other"));
    h.clear("k");
    check("clear forgets a conversation's history", !h.canUndo("k"));
    check("recording an empty change does nothing", (() => { h.record("k", diffToChange(c0, c0), "nothing"); return !h.canUndo("k"); })());
  }
  {
    const h = createCanvasHistory({ limit: 3 });
    let c = canvas();
    const labels: string[] = [];
    for (let i = 0; i < 5; i++) { const n = canvas([...c.nodes, node(`n${i}`, i, i)]); h.record("k", diffToChange(c, n), `Add ${i}`); c = n; }
    for (;;) { const r = h.undo("k", c); if (!r) break; labels.push(r.label); c = r.canvas; }
    check("only the most recent steps are kept; the oldest are the ones dropped", labels.join() === "Add 4,Add 3,Add 2" && DEFAULT_HISTORY_LIMIT === 100);
  }

  console.log("merging drags");
  {
    let t = 1000;
    const h = createCanvasHistory({ now: () => t, mergeWindowMs: 1500 });
    const p = (x: number) => canvas([node("a", x, 0), node("b", 0, 0)]);
    h.record("k", diffToChange(p(0), p(10)), "Move");
    t += 400; h.record("k", diffToChange(p(10), p(30)), "Move");
    t += 400; h.record("k", diffToChange(p(30), p(60)), "Move");
    const r = h.undo("k", p(60))!;
    check("quick drags of the same node are one step, back to where it started", r.canvas.nodes.find((n) => n.id === "a")!.position.x === 0 && !h.canUndo("k"));
  }
  {
    let t = 1000;
    const h = createCanvasHistory({ now: () => t, mergeWindowMs: 1500 });
    const p = (x: number) => canvas([node("a", x, 0)]);
    h.record("k", diffToChange(p(0), p(10)), "Move");
    t += 5000; h.record("k", diffToChange(p(10), p(30)), "Move");
    const r = h.undo("k", p(30))!;
    check("drags further apart in time are separate steps", r.canvas.nodes[0].position.x === 10 && h.canUndo("k"));
  }
  {
    let t = 1000;
    const h = createCanvasHistory({ now: () => t, mergeWindowMs: 1500 });
    const p = (x: number) => canvas([node("a", x, 0)]);
    h.record("k", diffToChange(p(0), p(10)), "Move");
    t += 300; h.record("k", diffToChange(p(10), p(0)), "Move");
    check("dragging back to the start leaves nothing to undo", !h.canUndo("k"));
  }
  {
    let t = 1000;
    const h = createCanvasHistory({ now: () => t, mergeWindowMs: 1500 });
    const two = (ax: number, bx: number) => canvas([node("a", ax, 0), node("b", bx, 0)]);
    h.record("k", diffToChange(two(0, 0), two(10, 0)), "Move a");
    t += 200; h.record("k", diffToChange(two(10, 0), two(10, 50)), "Move b");
    check("drags of different nodes are not merged", h.undo("k", two(10, 50))!.canvas.nodes.find((n) => n.id === "b")!.position.x === 0 && h.canUndo("k"));
  }
  {
    let t = 1000;
    const h = createCanvasHistory({ now: () => t, mergeWindowMs: 1500 });
    h.record("k", diffToChange(canvas([node("a", 0, 0)]), canvas([node("a", 10, 0)])), "Move");
    t += 100; h.record("k", diffToChange(canvas([node("a", 10, 0)]), canvas([node("a", 10, 0), node("n", 1, 1)])), "AI added a node");
    check("an AI change is never merged into a drag", h.canUndo("k") && h.peekUndo("k") === "AI added a node");
  }

  console.log("undo skips steps that no longer apply");
  {
    const h = createCanvasHistory({ now: () => 0, mergeWindowMs: 0 });
    const c0 = canvas([node("a", 0, 0), node("b", 0, 0)]);
    const c1 = canvas([node("a", 5, 5), node("b", 0, 0)]);
    const c2 = canvas([node("a", 5, 5), node("b", 9, 9)]);
    h.record("k", diffToChange(c0, c1), "Move a");
    h.record("k", diffToChange(c1, c2), "Move b");
    // A collaborator deleted node b. Undoing "Move b" cannot apply, so it is forgotten and the earlier step is undone.
    const theirs = canvas([node("a", 5, 5)]);
    const r = h.undo("k", theirs)!;
    check("the stale step is dropped and the previous one is undone", r.label === "Move a" && r.canvas.nodes[0].position.x === 0);
  }
  {
    const h = createCanvasHistory({ now: () => 0, mergeWindowMs: 0 });
    h.record("k", diffToChange(canvas([node("a", 0, 0)]), canvas([node("a", 5, 5)])), "Move a");
    check("when nothing applies, undo reports nothing to undo", h.undo("k", canvas()) === null && !h.canUndo("k"));
  }

  console.log("saving a change");
  const prev = canvas([node("a", 1, 2, { description: "d" }), node("b", 3, 4)], [edge("e", "a", "b", "causes")], [group("g", ["a", "b"])]);
  check("nothing changed: nothing to save", canvasDiffToMutation(prev, prev) === null);
  {
    const m = canvasDiffToMutation(prev, canvas([node("a", 10, 20, { description: "d" }), node("b", 3, 4)], [edge("e", "a", "b", "causes")], [group("g", ["a", "b"])]))!;
    check("a move saves one node with its new position in the database's field names", m.upsertNodes?.length === 1 && m.upsertNodes[0].id === "a" && m.upsertNodes[0].positionX === 10 && m.upsertNodes[0].positionY === 20 && !m.deleteNodeIds && !m.upsertEdges);
    check("the node keeps its other fields when saved", m.upsertNodes?.[0].title === "T-a" && m.upsertNodes?.[0].description === "d" && m.upsertNodes?.[0].nodeType === "idea");
  }
  {
    const m = canvasDiffToMutation(prev, canvas([node("a", 1, 2, { description: "d" })], [], [group("g", ["a"])]))!;
    check("removing a node saves its id, its edge and the group change", m.deleteNodeIds?.join() === "b" && m.deleteEdgeIds?.join() === "e" && m.upsertGroups?.[0].memberIds.join() === "a");
  }
  {
    const m = canvasDiffToMutation(canvas(), canvas([node("n", 1, 1), node("m", 2, 2)], [edge("x", "n", "m", "solves")]))!;
    check("adding nodes and an edge saves them together", m.upsertNodes?.length === 2 && m.upsertEdges?.length === 1 && m.upsertEdges[0].relationship === "solves" && !m.deleteNodeIds);
  }
  {
    const m = canvasDiffToMutation(canvas([node("a")], [], [group("g", ["a"])]), canvas([node("a")]))!;
    check("removing a group saves its id", m.deleteGroupIds?.join() === "g" && !m.upsertNodes);
  }
  {
    // What undo of "AI added a node and an edge" would save, then what redo would save.
    const before = canvas([node("m")]);
    const after = canvas([node("m"), node("n", 5, 5)], [edge("e", "m", "n", "causes")]);
    const undo = canvasDiffToMutation(after, before)!;
    const redo = canvasDiffToMutation(before, after)!;
    check("undo of an addition saves a delete of the node and its edge", undo.deleteNodeIds?.join() === "n" && undo.deleteEdgeIds?.join() === "e" && !undo.upsertNodes);
    check("redo of it saves the node and edge again", redo.upsertNodes?.[0].id === "n" && redo.upsertEdges?.[0].id === "e" && !redo.deleteNodeIds);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
