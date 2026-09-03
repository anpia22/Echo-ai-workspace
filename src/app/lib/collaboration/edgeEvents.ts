import type { CanvasEdge, CanvasState } from "../applyCanvasActions";

export const EDGE_UPSERT_EVENT = "EDGE_UPSERT";
export const EDGE_DELETED_EVENT = "EDGE_DELETED";

export type EdgeUpsertEvent = {
  type: typeof EDGE_UPSERT_EVENT;
  roomId: string;
  senderId: string;
  edge: CanvasEdge;
};

export type EdgeDeletedEvent = {
  type: typeof EDGE_DELETED_EVENT;
  roomId: string;
  senderId: string;
  edgeId: string;
};

export type EdgeCollaborationEvent = EdgeUpsertEvent | EdgeDeletedEvent;

export type LocalEdgeMutation =
  | { type: typeof EDGE_UPSERT_EVENT; edge: CanvasEdge }
  | { type: typeof EDGE_DELETED_EVENT; edgeId: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function cloneCanvasEdge(edge: CanvasEdge): CanvasEdge {
  const sourceId =
    edge.sourceId ?? (edge as { source?: string }).source ?? "";
  const targetId =
    edge.targetId ?? (edge as { target?: string }).target ?? "";

  const cloned: CanvasEdge = {
    id: edge.id,
    sourceId,
    targetId,
  };

  if (typeof edge.relationship === "string") {
    cloned.relationship = edge.relationship;
  }

  return cloned;
}

export function parseCanvasEdge(value: unknown): CanvasEdge | null {
  if (!isRecord(value)) {
    return null;
  }

  if (!isNonEmptyString(value.id)) {
    return null;
  }

  const sourceId = isNonEmptyString(value.sourceId)
    ? value.sourceId
    : isNonEmptyString(value.source)
    ? value.source
    : null;

  const targetId = isNonEmptyString(value.targetId)
    ? value.targetId
    : isNonEmptyString(value.target)
    ? value.target
    : null;

  if (!sourceId || !targetId) {
    return null;
  }

  if (
    value.relationship !== undefined &&
    typeof value.relationship !== "string"
  ) {
    return null;
  }

  return cloneCanvasEdge({
    id: value.id,
    sourceId,
    targetId,
    relationship:
      typeof value.relationship === "string" ? value.relationship : undefined,
  });
}

export function parseEdgeCollaborationEvent(
  payload: unknown
): EdgeCollaborationEvent | null {
  if (!isRecord(payload)) {
    return null;
  }

  if (
    !isNonEmptyString(payload.roomId) ||
    !isNonEmptyString(payload.senderId)
  ) {
    return null;
  }

  if (payload.type === EDGE_UPSERT_EVENT) {
    const edge = parseCanvasEdge(payload.edge);

    if (!edge) {
      return null;
    }

    return {
      type: EDGE_UPSERT_EVENT,
      roomId: payload.roomId,
      senderId: payload.senderId,
      edge,
    };
  }

  if (payload.type === EDGE_DELETED_EVENT) {
    if (!isNonEmptyString(payload.edgeId)) {
      return null;
    }

    return {
      type: EDGE_DELETED_EVENT,
      roomId: payload.roomId,
      senderId: payload.senderId,
      edgeId: payload.edgeId,
    };
  }

  return null;
}

function sameEdgeData(left: CanvasEdge, right: CanvasEdge): boolean {
  const leftSource = left.sourceId ?? (left as { source?: string }).source;
  const rightSource = right.sourceId ?? (right as { source?: string }).source;
  const leftTarget = left.targetId ?? (left as { target?: string }).target;
  const rightTarget = right.targetId ?? (right as { target?: string }).target;

  return (
    leftSource === rightSource &&
    leftTarget === rightTarget &&
    (left.relationship ?? "") === (right.relationship ?? "")
  );
}

export function upsertSemanticEdge(
  canvas: CanvasState,
  edge: CanvasEdge
): CanvasState {
  const sourceId = edge.sourceId ?? (edge as { source?: string }).source;
  const targetId = edge.targetId ?? (edge as { target?: string }).target;

  const hasSource = canvas.nodes.some((node) => node.id === sourceId);
  const hasTarget = canvas.nodes.some((node) => node.id === targetId);

  // Missing node dependency rule: ignore edge if nodes do not exist.
  // Never create phantom nodes.
  if (!hasSource || !hasTarget) {
    return canvas;
  }

  const nextEdge = cloneCanvasEdge(edge);
  const index = canvas.edges.findIndex((existing) => existing.id === nextEdge.id);

  if (index === -1) {
    return {
      ...canvas,
      edges: [...canvas.edges, nextEdge],
    };
  }

  const existing = canvas.edges[index];

  if (sameEdgeData(existing, nextEdge)) {
    return canvas;
  }

  const edges = canvas.edges.slice();
  edges[index] = nextEdge;

  return {
    ...canvas,
    edges,
  };
}

export function deleteSemanticEdge(
  canvas: CanvasState,
  edgeId: string
): CanvasState {
  if (!canvas.edges.some((edge) => edge.id === edgeId)) {
    return canvas;
  }

  return {
    ...canvas,
    edges: canvas.edges.filter((edge) => edge.id !== edgeId),
  };
}

export function applyRemoteEdgeEvent(
  canvas: CanvasState,
  event: EdgeCollaborationEvent
): CanvasState {
  if (event.type === EDGE_UPSERT_EVENT) {
    return upsertSemanticEdge(canvas, event.edge);
  }

  return deleteSemanticEdge(canvas, event.edgeId);
}

export function diffLocalEdgeMutations(
  previous: CanvasState,
  next: CanvasState
): LocalEdgeMutation[] {
  const mutations: LocalEdgeMutation[] = [];
  const previousById = new Map(
    previous.edges.map((edge) => [edge.id, edge])
  );
  const nextIds = new Set(next.edges.map((edge) => edge.id));

  for (const edge of next.edges) {
    const existing = previousById.get(edge.id);

    if (!existing) {
      mutations.push({
        type: EDGE_UPSERT_EVENT,
        edge: cloneCanvasEdge(edge),
      });
      continue;
    }

    if (!sameEdgeData(existing, edge)) {
      mutations.push({
        type: EDGE_UPSERT_EVENT,
        edge: cloneCanvasEdge(edge),
      });
    }
  }

  for (const edge of previous.edges) {
    if (!nextIds.has(edge.id)) {
      mutations.push({
        type: EDGE_DELETED_EVENT,
        edgeId: edge.id,
      });
    }
  }

  return mutations;
}

export function publishLocalEdgeMutations(
  mutations: LocalEdgeMutation[],
  publish: {
    broadcastEdgeUpsert: (edge: CanvasEdge) => void;
    broadcastEdgeDeleted: (edgeId: string) => void;
  }
): void {
  for (const mutation of mutations) {
    if (mutation.type === EDGE_UPSERT_EVENT) {
      publish.broadcastEdgeUpsert(mutation.edge);
      continue;
    }

    publish.broadcastEdgeDeleted(mutation.edgeId);
  }
}
