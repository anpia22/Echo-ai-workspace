import type { CanvasNode, CanvasState } from "../applyCanvasActions";
import { cloneCanvasNode, parseCanvasNode } from "./canvasSnapshot";

export const NODE_UPSERT_EVENT = "NODE_UPSERT";
export const NODE_DELETED_EVENT = "NODE_DELETED";
export const NODE_MOVED_EVENT = "NODE_MOVED";

export type NodePosition = {
  x: number;
  y: number;
};

export type NodeUpsertEvent = {
  type: typeof NODE_UPSERT_EVENT;
  roomId: string;
  senderId: string;
  node: CanvasNode;
};

export type NodeDeletedEvent = {
  type: typeof NODE_DELETED_EVENT;
  roomId: string;
  senderId: string;
  nodeId: string;
};

export type NodeMovedEvent = {
  type: typeof NODE_MOVED_EVENT;
  roomId: string;
  senderId: string;
  nodeId: string;
  position: NodePosition;
};

export type NodeCollaborationEvent =
  | NodeUpsertEvent
  | NodeDeletedEvent
  | NodeMovedEvent;

export type LocalNodeMutation =
  | { type: typeof NODE_UPSERT_EVENT; node: CanvasNode }
  | { type: typeof NODE_DELETED_EVENT; nodeId: string }
  | { type: typeof NODE_MOVED_EVENT; nodeId: string; position: NodePosition };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parsePosition(value: unknown): NodePosition | null {
  if (!isRecord(value)) {
    return null;
  }

  if (!isFiniteNumber(value.x) || !isFiniteNumber(value.y)) {
    return null;
  }

  return { x: value.x, y: value.y };
}

export function parseNodeCollaborationEvent(
  payload: unknown
): NodeCollaborationEvent | null {
  if (!isRecord(payload)) {
    return null;
  }

  if (
    !isNonEmptyString(payload.roomId) ||
    !isNonEmptyString(payload.senderId)
  ) {
    return null;
  }

  if (payload.type === NODE_UPSERT_EVENT) {
    const node = parseCanvasNode(payload.node);

    if (!node) {
      return null;
    }

    return {
      type: NODE_UPSERT_EVENT,
      roomId: payload.roomId,
      senderId: payload.senderId,
      node,
    };
  }

  if (payload.type === NODE_DELETED_EVENT) {
    if (!isNonEmptyString(payload.nodeId)) {
      return null;
    }

    return {
      type: NODE_DELETED_EVENT,
      roomId: payload.roomId,
      senderId: payload.senderId,
      nodeId: payload.nodeId,
    };
  }

  if (payload.type === NODE_MOVED_EVENT) {
    if (!isNonEmptyString(payload.nodeId)) {
      return null;
    }

    const position = parsePosition(payload.position);

    if (!position) {
      return null;
    }

    return {
      type: NODE_MOVED_EVENT,
      roomId: payload.roomId,
      senderId: payload.senderId,
      nodeId: payload.nodeId,
      position,
    };
  }

  return null;
}

function sameNodeData(left: CanvasNode, right: CanvasNode): boolean {
  return (
    left.nodeType === right.nodeType &&
    left.title === right.title &&
    (left.description ?? "") === (right.description ?? "")
  );
}

function samePosition(left: NodePosition, right: NodePosition): boolean {
  return left.x === right.x && left.y === right.y;
}

export function upsertSemanticNode(
  canvas: CanvasState,
  node: CanvasNode
): CanvasState {
  const nextNode = cloneCanvasNode(node);
  const index = canvas.nodes.findIndex((existing) => existing.id === nextNode.id);

  if (index === -1) {
    return {
      ...canvas,
      nodes: [...canvas.nodes, nextNode],
    };
  }

  const existing = canvas.nodes[index];

  if (
    sameNodeData(existing, nextNode) &&
    samePosition(existing.position, nextNode.position)
  ) {
    return canvas;
  }

  const nodes = canvas.nodes.slice();
  nodes[index] = nextNode;

  return {
    ...canvas,
    nodes,
  };
}

export function deleteSemanticNode(
  canvas: CanvasState,
  nodeId: string
): CanvasState {
  if (!canvas.nodes.some((node) => node.id === nodeId)) {
    return canvas;
  }

  return {
    nodes: canvas.nodes.filter((node) => node.id !== nodeId),
    edges: canvas.edges.filter(
      (edge) => edge.sourceId !== nodeId && edge.targetId !== nodeId
    ),
    groups: canvas.groups
      .map((group) => ({
        ...group,
        memberIds: group.memberIds.filter((memberId) => memberId !== nodeId),
      }))
      .filter((group) => group.memberIds.length > 0),
  };
}

export function moveSemanticNode(
  canvas: CanvasState,
  nodeId: string,
  position: NodePosition
): CanvasState {
  const index = canvas.nodes.findIndex((node) => node.id === nodeId);

  if (index === -1) {
    return canvas;
  }

  const existing = canvas.nodes[index];

  if (samePosition(existing.position, position)) {
    return canvas;
  }

  const nodes = canvas.nodes.slice();
  nodes[index] = cloneCanvasNode({
    ...existing,
    position: {
      x: position.x,
      y: position.y,
    },
  });

  return {
    ...canvas,
    nodes,
  };
}

export function applyRemoteNodeEvent(
  canvas: CanvasState,
  event: NodeCollaborationEvent
): CanvasState {
  if (event.type === NODE_UPSERT_EVENT) {
    return upsertSemanticNode(canvas, event.node);
  }

  if (event.type === NODE_DELETED_EVENT) {
    return deleteSemanticNode(canvas, event.nodeId);
  }

  return moveSemanticNode(canvas, event.nodeId, event.position);
}

export function diffLocalNodeMutations(
  previous: CanvasState,
  next: CanvasState
): LocalNodeMutation[] {
  const mutations: LocalNodeMutation[] = [];
  const previousById = new Map(
    previous.nodes.map((node) => [node.id, node])
  );
  const nextIds = new Set(next.nodes.map((node) => node.id));

  for (const node of next.nodes) {
    const existing = previousById.get(node.id);

    if (!existing) {
      mutations.push({
        type: NODE_UPSERT_EVENT,
        node: cloneCanvasNode(node),
      });
      continue;
    }

    const dataChanged = !sameNodeData(existing, node);
    const positionChanged = !samePosition(existing.position, node.position);

    if (dataChanged) {
      mutations.push({
        type: NODE_UPSERT_EVENT,
        node: cloneCanvasNode(node),
      });
      continue;
    }

    if (positionChanged) {
      mutations.push({
        type: NODE_MOVED_EVENT,
        nodeId: node.id,
        position: {
          x: node.position.x,
          y: node.position.y,
        },
      });
    }
  }

  for (const node of previous.nodes) {
    if (!nextIds.has(node.id)) {
      mutations.push({
        type: NODE_DELETED_EVENT,
        nodeId: node.id,
      });
    }
  }

  return mutations;
}

export function publishLocalNodeMutations(
  mutations: LocalNodeMutation[],
  publish: {
    broadcastNodeUpsert: (node: CanvasNode) => void;
    broadcastNodeDeleted: (nodeId: string) => void;
    broadcastNodeMoved: (nodeId: string, position: NodePosition) => void;
  }
): void {
  for (const mutation of mutations) {
    if (mutation.type === NODE_UPSERT_EVENT) {
      publish.broadcastNodeUpsert(mutation.node);
      continue;
    }

    if (mutation.type === NODE_DELETED_EVENT) {
      publish.broadcastNodeDeleted(mutation.nodeId);
      continue;
    }

    publish.broadcastNodeMoved(mutation.nodeId, mutation.position);
  }
}
