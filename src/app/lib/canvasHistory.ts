/**
 * P1.7 — Undo / redo for the canvas. Pure logic (no React, no I/O).
 *
 * A change is recorded per entity and per FIELD, not as a whole-canvas snapshot. Undoing it puts
 * back only what this user changed: if a collaborator renamed a node after the user moved it,
 * undoing the move leaves the new name alone; if a collaborator deleted something the undo needs,
 * that part is skipped. Only the user's own edits (their drags and the AI changes they asked for)
 * are recorded, never a collaborator's.
 */

import type { CanvasEdge, CanvasGroup, CanvasNode, CanvasState } from "./applyCanvasActions";

type Pos = { x: number; y: number };
type Pair<T> = [before: T, after: T];

export type NodeFields = {
  title?: Pair<string>;
  description?: Pair<string | undefined>;
  nodeType?: Pair<string>;
  position?: Pair<Pos>;
};
export type EdgeFields = {
  relationship?: Pair<string | undefined>;
  sourceId?: Pair<string>;
  targetId?: Pair<string>;
};
export type GroupFields = {
  title?: Pair<string>;
  memberIds?: Pair<string[]>;
};

export type NodeChange = { id: string } & ({ kind: "add" | "remove"; node: CanvasNode } | { kind: "update"; fields: NodeFields });
export type EdgeChange = { id: string } & ({ kind: "add" | "remove"; edge: CanvasEdge } | { kind: "update"; fields: EdgeFields });
export type GroupChange = { id: string } & ({ kind: "add" | "remove"; group: CanvasGroup } | { kind: "update"; fields: GroupFields });

export type CanvasChange = { nodes: NodeChange[]; edges: EdgeChange[]; groups: GroupChange[] };

export const emptyChange = (): CanvasChange => ({ nodes: [], edges: [], groups: [] });
export const isEmptyChange = (c: CanvasChange): boolean => c.nodes.length === 0 && c.edges.length === 0 && c.groups.length === 0;

const samePos = (a: Pos, b: Pos) => a.x === b.x && a.y === b.y;
const sameText = (a: string | undefined, b: string | undefined) => (a ?? "") === (b ?? "");
const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join("\u0000") === [...b].sort().join("\u0000");

// ---------------------------------------------------------------------------
// Diff: what changed between two canvases
// ---------------------------------------------------------------------------

export function diffToChange(prev: CanvasState, next: CanvasState): CanvasChange {
  const change = emptyChange();

  const prevNodes = new Map(prev.nodes.map((n) => [n.id, n]));
  const nextNodes = new Map(next.nodes.map((n) => [n.id, n]));
  for (const [id, n] of nextNodes) {
    const before = prevNodes.get(id);
    if (!before) {
      change.nodes.push({ id, kind: "add", node: n });
      continue;
    }
    const fields: NodeFields = {};
    if (before.title !== n.title) fields.title = [before.title, n.title];
    if (!sameText(before.description, n.description)) fields.description = [before.description, n.description];
    if (before.nodeType !== n.nodeType) fields.nodeType = [before.nodeType, n.nodeType];
    if (!samePos(before.position, n.position)) fields.position = [before.position, n.position];
    if (Object.keys(fields).length > 0) change.nodes.push({ id, kind: "update", fields });
  }
  for (const [id, n] of prevNodes) if (!nextNodes.has(id)) change.nodes.push({ id, kind: "remove", node: n });

  const prevEdges = new Map(prev.edges.map((e) => [e.id, e]));
  const nextEdges = new Map(next.edges.map((e) => [e.id, e]));
  for (const [id, e] of nextEdges) {
    const before = prevEdges.get(id);
    if (!before) {
      change.edges.push({ id, kind: "add", edge: e });
      continue;
    }
    const fields: EdgeFields = {};
    if (!sameText(before.relationship, e.relationship)) fields.relationship = [before.relationship, e.relationship];
    if (before.sourceId !== e.sourceId) fields.sourceId = [before.sourceId, e.sourceId];
    if (before.targetId !== e.targetId) fields.targetId = [before.targetId, e.targetId];
    if (Object.keys(fields).length > 0) change.edges.push({ id, kind: "update", fields });
  }
  for (const [id, e] of prevEdges) if (!nextEdges.has(id)) change.edges.push({ id, kind: "remove", edge: e });

  const prevGroups = new Map(prev.groups.map((g) => [g.id, g]));
  const nextGroups = new Map(next.groups.map((g) => [g.id, g]));
  for (const [id, g] of nextGroups) {
    const before = prevGroups.get(id);
    if (!before) {
      change.groups.push({ id, kind: "add", group: g });
      continue;
    }
    const fields: GroupFields = {};
    if (before.title !== g.title) fields.title = [before.title, g.title];
    if (!sameSet(before.memberIds, g.memberIds)) fields.memberIds = [before.memberIds, g.memberIds];
    if (Object.keys(fields).length > 0) change.groups.push({ id, kind: "update", fields });
  }
  for (const [id, g] of prevGroups) if (!nextGroups.has(id)) change.groups.push({ id, kind: "remove", group: g });

  return change;
}

// ---------------------------------------------------------------------------
// Invert and apply
// ---------------------------------------------------------------------------

const swapPairs = <F extends object>(fields: F): F => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = Array.isArray(v) && v.length === 2 ? [v[1], v[0]] : v;
  return out as F;
};

/** The change that undoes `c`: adds become removes, and every field goes back the other way. */
export function invertChange(c: CanvasChange): CanvasChange {
  return {
    nodes: c.nodes.map((n) => (n.kind === "update" ? { id: n.id, kind: "update", fields: swapPairs(n.fields) } : { ...n, kind: n.kind === "add" ? "remove" : "add" })) as NodeChange[],
    edges: c.edges.map((e) => (e.kind === "update" ? { id: e.id, kind: "update", fields: swapPairs(e.fields) } : { ...e, kind: e.kind === "add" ? "remove" : "add" })) as EdgeChange[],
    groups: c.groups.map((g) => (g.kind === "update" ? { id: g.id, kind: "update", fields: swapPairs(g.fields) } : { ...g, kind: g.kind === "add" ? "remove" : "add" })) as GroupChange[],
  };
}

export type ApplyResult = {
  /** The same object as the input when nothing could be applied. */
  canvas: CanvasState;
  /** Parts of the change that were applied. */
  applied: number;
  /** Parts that no longer make sense (the item is gone, or a link would dangle) and were skipped. */
  skipped: number;
};

/** Applies a change to a canvas ("bring each entity to its `after`"). Never throws; skips what does not fit. */
export function applyChange(canvas: CanvasState, change: CanvasChange): ApplyResult {
  const nodes = [...canvas.nodes];
  let edges = [...canvas.edges];
  let groups = [...canvas.groups];
  let applied = 0;
  let skipped = 0;

  const nodeIndex = () => new Map(nodes.map((n, i) => [n.id, i]));

  for (const c of change.nodes) {
    const idx = nodeIndex().get(c.id);
    if (c.kind === "update") {
      if (idx === undefined) {
        skipped++;
      } else {
        const cur = nodes[idx];
        const next: CanvasNode = { ...cur, position: { ...cur.position } };
        if (c.fields.title) next.title = c.fields.title[1];
        if (c.fields.description) next.description = c.fields.description[1];
        if (c.fields.nodeType) next.nodeType = c.fields.nodeType[1];
        if (c.fields.position) next.position = { ...c.fields.position[1] };
        nodes[idx] = next;
        applied++;
      }
    } else if (c.kind === "add") {
      if (idx === undefined) { nodes.push(c.node); applied++; } else skipped++;
    } else if (idx !== undefined) {
      nodes.splice(idx, 1);
      applied++;
    } else {
      skipped++;
    }
  }

  const live = () => new Set(nodes.map((n) => n.id));

  for (const c of change.edges) {
    const idx = edges.findIndex((e) => e.id === c.id);
    if (c.kind === "update") {
      if (idx === -1) {
        skipped++;
      } else {
        const next = { ...edges[idx] };
        if (c.fields.relationship) next.relationship = c.fields.relationship[1];
        if (c.fields.sourceId) next.sourceId = c.fields.sourceId[1];
        if (c.fields.targetId) next.targetId = c.fields.targetId[1];
        edges[idx] = next;
        applied++;
      }
    } else if (c.kind === "add") {
      const ids = live();
      if (idx !== -1 || !ids.has(c.edge.sourceId) || !ids.has(c.edge.targetId)) skipped++; // already there, or an end is gone
      else { edges.push(c.edge); applied++; }
    } else if (idx !== -1) {
      edges.splice(idx, 1);
      applied++;
    } else {
      skipped++;
    }
  }

  for (const c of change.groups) {
    const idx = groups.findIndex((g) => g.id === c.id);
    if (c.kind === "update") {
      if (idx === -1) {
        skipped++;
      } else {
        const next = { ...groups[idx] };
        if (c.fields.title) next.title = c.fields.title[1];
        if (c.fields.memberIds) next.memberIds = [...c.fields.memberIds[1]];
        groups[idx] = next;
        applied++;
      }
    } else if (c.kind === "add") {
      if (idx !== -1) skipped++;
      else { groups.push({ ...c.group, memberIds: [...c.group.memberIds] }); applied++; }
    } else if (idx !== -1) {
      groups.splice(idx, 1);
      applied++;
    } else {
      skipped++;
    }
  }

  if (applied === 0) return { canvas, applied: 0, skipped };

  // Nothing may point at something that is gone: this mirrors what the database does on delete.
  const ids = live();
  edges = edges.filter((e) => ids.has(e.sourceId) && ids.has(e.targetId));
  groups = groups.map((g) => (g.memberIds.every((m) => ids.has(m)) ? g : { ...g, memberIds: g.memberIds.filter((m) => ids.has(m)) }));

  return { canvas: { nodes, edges, groups }, applied, skipped };
}

// ---------------------------------------------------------------------------
// The history stack (one per conversation)
// ---------------------------------------------------------------------------

export type HistoryEntry = { label: string; change: CanvasChange; at: number };

export type CanvasHistoryOptions = {
  /** Most steps kept per conversation. */
  limit?: number;
  /** Drags of the same node closer together than this become one step. */
  mergeWindowMs?: number;
  now?: () => number;
};

export const DEFAULT_HISTORY_LIMIT = 100;
export const DEFAULT_MERGE_WINDOW_MS = 1_500;

type Stacks = { undo: HistoryEntry[]; redo: HistoryEntry[] };

function isSinglePositionMove(c: CanvasChange): string | null {
  if (c.edges.length || c.groups.length || c.nodes.length !== 1) return null;
  const n = c.nodes[0];
  if (n.kind !== "update") return null;
  const keys = Object.keys(n.fields);
  return keys.length === 1 && keys[0] === "position" ? n.id : null;
}

export function createCanvasHistory(options: CanvasHistoryOptions = {}) {
  const limit = options.limit ?? DEFAULT_HISTORY_LIMIT;
  const mergeWindow = options.mergeWindowMs ?? DEFAULT_MERGE_WINDOW_MS;
  const now = options.now ?? Date.now;
  const stacks = new Map<string, Stacks>();
  let version = 0;

  const get = (key: string): Stacks => {
    let s = stacks.get(key);
    if (!s) stacks.set(key, (s = { undo: [], redo: [] }));
    return s;
  };

  return {
    /** Records a change the user made. Recording a new change ends the redo trail. */
    record(key: string, change: CanvasChange, label: string): void {
      if (isEmptyChange(change)) return;
      const s = get(key);
      const t = now();
      const top = s.undo[s.undo.length - 1];
      const movedNow = isSinglePositionMove(change);
      const movedBefore = top ? isSinglePositionMove(top.change) : null;

      s.redo.length = 0;
      if (top && movedNow && movedNow === movedBefore && t - top.at < mergeWindow) {
        // Several small drags of the same node in a row are one step.
        const first = (top.change.nodes[0] as { fields: NodeFields }).fields.position![0];
        const last = (change.nodes[0] as { fields: NodeFields }).fields.position![1];
        if (samePos(first, last)) s.undo.pop(); // dragged back to where it started: nothing to undo
        else s.undo[s.undo.length - 1] = { label: top.label, at: t, change: { ...top.change, nodes: [{ id: movedNow, kind: "update", fields: { position: [first, last] } }] } };
      } else {
        s.undo.push({ label, change, at: t });
        if (s.undo.length > limit) s.undo.shift();
      }
      version++;
    },

    /** Undoes the latest step that still fits the current canvas. Null when there is nothing to undo. */
    undo(key: string, canvas: CanvasState): { canvas: CanvasState; label: string; skipped: number } | null {
      const s = get(key);
      while (s.undo.length > 0) {
        const entry = s.undo.pop()!;
        const r = applyChange(canvas, invertChange(entry.change));
        version++;
        if (r.applied > 0) {
          s.redo.push(entry);
          return { canvas: r.canvas, label: entry.label, skipped: r.skipped };
        }
        // Nothing of it fits any more (collaborators changed those items): forget it and try the one before.
      }
      return null;
    },

    redo(key: string, canvas: CanvasState): { canvas: CanvasState; label: string; skipped: number } | null {
      const s = get(key);
      while (s.redo.length > 0) {
        const entry = s.redo.pop()!;
        const r = applyChange(canvas, entry.change);
        version++;
        if (r.applied > 0) {
          s.undo.push(entry);
          return { canvas: r.canvas, label: entry.label, skipped: r.skipped };
        }
      }
      return null;
    },

    canUndo: (key: string) => (stacks.get(key)?.undo.length ?? 0) > 0,
    canRedo: (key: string) => (stacks.get(key)?.redo.length ?? 0) > 0,
    peekUndo: (key: string) => stacks.get(key)?.undo.at(-1)?.label ?? null,
    peekRedo: (key: string) => stacks.get(key)?.redo.at(-1)?.label ?? null,
    clear(key: string) {
      if (stacks.delete(key)) version++;
    },
    /** Changes whenever anything is recorded, undone or redone: lets the UI know to redraw its buttons. */
    getVersion: () => version,
  };
}

// ---------------------------------------------------------------------------
// Saving a change: the database batch that turns `prev` into `next`
// ---------------------------------------------------------------------------

export type SaveMutation = {
  upsertNodes?: Array<{ id: string; nodeType: string; title: string; description?: string; positionX: number; positionY: number }>;
  deleteNodeIds?: string[];
  upsertEdges?: Array<{ id: string; sourceId: string; targetId: string; relationship?: string }>;
  deleteEdgeIds?: string[];
  upsertGroups?: Array<{ id: string; title: string; memberIds: string[] }>;
  deleteGroupIds?: string[];
};

/** The save batch for turning `prev` into `next`, or null when nothing differs. */
export function canvasDiffToMutation(prev: CanvasState, next: CanvasState): SaveMutation | null {
  const c = diffToChange(prev, next);
  if (isEmptyChange(c)) return null;
  const nextNodes = new Map(next.nodes.map((n) => [n.id, n]));
  const nextEdges = new Map(next.edges.map((e) => [e.id, e]));
  const nextGroups = new Map(next.groups.map((g) => [g.id, g]));
  const m: SaveMutation = {};

  const upNodes = c.nodes.filter((n) => n.kind !== "remove").map((n) => nextNodes.get(n.id)!);
  if (upNodes.length) m.upsertNodes = upNodes.map((n) => ({ id: n.id, nodeType: n.nodeType, title: n.title, description: n.description, positionX: n.position.x, positionY: n.position.y }));
  const delNodes = c.nodes.filter((n) => n.kind === "remove").map((n) => n.id);
  if (delNodes.length) m.deleteNodeIds = delNodes;

  const upEdges = c.edges.filter((e) => e.kind !== "remove").map((e) => nextEdges.get(e.id)!);
  if (upEdges.length) m.upsertEdges = upEdges.map((e) => ({ id: e.id, sourceId: e.sourceId, targetId: e.targetId, relationship: e.relationship }));
  const delEdges = c.edges.filter((e) => e.kind === "remove").map((e) => e.id);
  if (delEdges.length) m.deleteEdgeIds = delEdges;

  const upGroups = c.groups.filter((g) => g.kind !== "remove").map((g) => nextGroups.get(g.id)!);
  if (upGroups.length) m.upsertGroups = upGroups.map((g) => ({ id: g.id, title: g.title, memberIds: g.memberIds }));
  const delGroups = c.groups.filter((g) => g.kind === "remove").map((g) => g.id);
  if (delGroups.length) m.deleteGroupIds = delGroups;

  return m;
}
