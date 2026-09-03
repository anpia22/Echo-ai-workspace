import type {
  CanvasEdge,
  CanvasGroup,
  CanvasNode,
  CanvasState,
} from "../applyCanvasActions";

export type CanvasSnapshot = CanvasState;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function cloneCanvasNode(node: CanvasNode): CanvasNode {
  const cloned: CanvasNode = {
    id: node.id,
    nodeType: node.nodeType,
    title: node.title,
    position: {
      x: node.position.x,
      y: node.position.y,
    },
  };

  if (typeof node.description === "string") {
    cloned.description = node.description;
  }

  return cloned;
}

function cloneNode(node: CanvasNode): CanvasNode {
  return cloneCanvasNode(node);
}

function cloneEdge(edge: CanvasEdge): CanvasEdge {
  const cloned: CanvasEdge = {
    id: edge.id,
    sourceId: edge.sourceId,
    targetId: edge.targetId,
  };

  if (typeof edge.relationship === "string") {
    cloned.relationship = edge.relationship;
  }

  return cloned;
}

function cloneGroup(group: CanvasGroup): CanvasGroup {
  return {
    id: group.id,
    title: group.title,
    memberIds: [...group.memberIds],
  };
}

export function cloneCanvasSnapshot(canvas: CanvasSnapshot): CanvasSnapshot {
  return {
    nodes: canvas.nodes.map(cloneNode),
    edges: canvas.edges.map(cloneEdge),
    groups: canvas.groups.map(cloneGroup),
  };
}

export function createCanvasSnapshot(canvas: CanvasState): CanvasSnapshot {
  return cloneCanvasSnapshot({
    nodes: Array.isArray(canvas.nodes) ? canvas.nodes : [],
    edges: Array.isArray(canvas.edges) ? canvas.edges : [],
    groups: Array.isArray(canvas.groups) ? canvas.groups : [],
  });
}

export function parseCanvasNode(value: unknown): CanvasNode | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.nodeType) ||
    !isNonEmptyString(value.title) ||
    !isRecord(value.position) ||
    !isFiniteNumber(value.position.x) ||
    !isFiniteNumber(value.position.y)
  ) {
    return null;
  }

  if (
    value.description !== undefined &&
    typeof value.description !== "string"
  ) {
    return null;
  }

  return cloneCanvasNode({
    id: value.id,
    nodeType: value.nodeType,
    title: value.title,
    description:
      typeof value.description === "string" ? value.description : undefined,
    position: {
      x: value.position.x,
      y: value.position.y,
    },
  });
}

function parseNode(value: unknown): CanvasNode | null {
  return parseCanvasNode(value);
}

function parseEdge(value: unknown, nodeIds: Set<string>): CanvasEdge | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.sourceId) ||
    !isNonEmptyString(value.targetId)
  ) {
    return null;
  }

  if (!nodeIds.has(value.sourceId) || !nodeIds.has(value.targetId)) {
    return null;
  }

  if (
    value.relationship !== undefined &&
    typeof value.relationship !== "string"
  ) {
    return null;
  }

  return cloneEdge({
    id: value.id,
    sourceId: value.sourceId,
    targetId: value.targetId,
    relationship:
      typeof value.relationship === "string" ? value.relationship : undefined,
  });
}

function parseGroup(value: unknown): CanvasGroup | null {
  if (!isRecord(value)) {
    return null;
  }

  if (!isNonEmptyString(value.id) || typeof value.title !== "string") {
    return null;
  }

  if (!Array.isArray(value.memberIds)) {
    return null;
  }

  const memberIds: string[] = [];

  for (const memberId of value.memberIds) {
    if (!isNonEmptyString(memberId)) {
      return null;
    }

    memberIds.push(memberId);
  }

  return cloneGroup({
    id: value.id,
    title: value.title,
    memberIds,
  });
}

export function validateCanvasSnapshot(
  payload: unknown
): CanvasSnapshot | null {
  if (!isRecord(payload)) {
    return null;
  }

  if (
    !Array.isArray(payload.nodes) ||
    !Array.isArray(payload.edges) ||
    !Array.isArray(payload.groups)
  ) {
    return null;
  }

  const nodes: CanvasNode[] = [];
  const nodeIds = new Set<string>();

  for (const candidate of payload.nodes) {
    const node = parseNode(candidate);

    if (!node || nodeIds.has(node.id)) {
      return null;
    }

    nodeIds.add(node.id);
    nodes.push(node);
  }

  const edges: CanvasEdge[] = [];
  const edgeIds = new Set<string>();

  for (const candidate of payload.edges) {
    const edge = parseEdge(candidate, nodeIds);

    if (!edge || edgeIds.has(edge.id)) {
      return null;
    }

    edgeIds.add(edge.id);
    edges.push(edge);
  }

  const groups: CanvasGroup[] = [];
  const groupIds = new Set<string>();

  for (const candidate of payload.groups) {
    const group = parseGroup(candidate);

    if (!group || groupIds.has(group.id)) {
      return null;
    }

    groupIds.add(group.id);
    groups.push(group);
  }

  return {
    nodes,
    edges,
    groups,
  };
}

export function isEmptyCanvasSnapshot(snapshot: CanvasSnapshot): boolean {
  return (
    snapshot.nodes.length === 0 &&
    snapshot.edges.length === 0 &&
    snapshot.groups.length === 0
  );
}
