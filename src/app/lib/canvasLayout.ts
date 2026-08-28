export type LayoutNode = {
  id: string;
  nodeType: string;
  title: string;
  description?: string;
  position: {
    x: number;
    y: number;
  };
};

export type LayoutEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  relationship?: string;
};

export type LayoutCanvas = {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
};

export const NODE_WIDTH = 250;
export const NODE_HEIGHT = 200;
export const NODE_GAP = 80;
export const COL_STEP = NODE_WIDTH + NODE_GAP;
export const ROW_STEP = NODE_HEIGHT + NODE_GAP;
export const FIRST_NODE_POSITION = { x: 360, y: 320 };

const RELATIONSHIP_PRIORITY = [
  "causes",
  "solves",
  "leads to",
  "depends on",
  "requires",
  "supports",
  "decided by",
  "related to",
] as const;

const MAX_SEARCH_RING = 14;

type Point = { x: number; y: number };

function normalizeRelationship(relationship?: string): string {
  return relationship?.toLowerCase().trim() || "related to";
}

export function hasNodeCollision(
  candidate: Point,
  occupyingNodes: LayoutNode[]
): boolean {
  return occupyingNodes.some((node) => boxesOverlap(candidate, node.position));
}

function boxesOverlap(a: Point, b: Point): boolean {
  return (
    a.x < b.x + NODE_WIDTH + NODE_GAP &&
    a.x + NODE_WIDTH + NODE_GAP > b.x &&
    a.y < b.y + NODE_HEIGHT + NODE_GAP &&
    a.y + NODE_HEIGHT + NODE_GAP > b.y
  );
}

export function getConnectedNodes(
  nodeId: string,
  canvas: LayoutCanvas
): LayoutNode[] {
  const connectedIds = new Set<string>();

  for (const edge of canvas.edges) {
    if (edge.sourceId === nodeId) {
      connectedIds.add(edge.targetId);
    }
    if (edge.targetId === nodeId) {
      connectedIds.add(edge.sourceId);
    }
  }

  return canvas.nodes.filter((node) => connectedIds.has(node.id));
}

function nodeCenter(node: LayoutNode): Point {
  return {
    x: node.position.x + NODE_WIDTH / 2,
    y: node.position.y + NODE_HEIGHT / 2,
  };
}

function orientation(a: Point, b: Point, c: Point): number {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);

  if (value === 0) {
    return 0;
  }

  return value > 0 ? 1 : 2;
}

function onSegment(a: Point, b: Point, c: Point): boolean {
  return (
    Math.min(a.x, c.x) <= b.x &&
    b.x <= Math.max(a.x, c.x) &&
    Math.min(a.y, c.y) <= b.y &&
    b.y <= Math.max(a.y, c.y)
  );
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);

  if (o1 !== o2 && o3 !== o4) {
    return true;
  }

  if (o1 === 0 && onSegment(a, c, b)) {
    return true;
  }

  if (o2 === 0 && onSegment(a, d, b)) {
    return true;
  }

  if (o3 === 0 && onSegment(c, a, d)) {
    return true;
  }

  if (o4 === 0 && onSegment(c, b, d)) {
    return true;
  }

  return false;
}

function shareEndpoint(
  edgeA: LayoutEdge,
  edgeB: LayoutEdge
): boolean {
  return (
    edgeA.sourceId === edgeB.sourceId ||
    edgeA.sourceId === edgeB.targetId ||
    edgeA.targetId === edgeB.sourceId ||
    edgeA.targetId === edgeB.targetId
  );
}

function countEdgeCrossings(
  node: LayoutNode,
  occupyingNodes: LayoutNode[],
  edges: LayoutEdge[]
): number {
  const nodesById = new Map(
    occupyingNodes.concat(node).map((item) => [item.id, item])
  );

  const newEdges = edges.filter(
    (edge) => edge.sourceId === node.id || edge.targetId === node.id
  );

  const otherEdges = edges.filter(
    (edge) => edge.sourceId !== node.id && edge.targetId !== node.id
  );

  let crossings = 0;

  for (const newEdge of newEdges) {
    const source = nodesById.get(newEdge.sourceId);
    const target = nodesById.get(newEdge.targetId);

    if (!source || !target) {
      continue;
    }

    const a = nodeCenter(source);
    const b = nodeCenter(target);

    for (const otherEdge of otherEdges) {
      if (shareEndpoint(newEdge, otherEdge)) {
        continue;
      }

      const otherSource = nodesById.get(otherEdge.sourceId);
      const otherTarget = nodesById.get(otherEdge.targetId);

      if (!otherSource || !otherTarget) {
        continue;
      }

      if (
        segmentsIntersect(
          a,
          b,
          nodeCenter(otherSource),
          nodeCenter(otherTarget)
        )
      ) {
        crossings += 1;
      }
    }
  }

  return crossings;
}

function segmentHitsRect(
  a: Point,
  b: Point,
  rect: { x: number; y: number; width: number; height: number }
): boolean {
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];

  const sides: [Point, Point][] = [
    [corners[0], corners[1]],
    [corners[1], corners[2]],
    [corners[2], corners[3]],
    [corners[3], corners[0]],
  ];

  return sides.some(([start, end]) => segmentsIntersect(a, b, start, end));
}

function countBodiesCrossed(
  node: LayoutNode,
  occupyingNodes: LayoutNode[],
  edges: LayoutEdge[]
): number {
  const nodesById = new Map(
    occupyingNodes.concat(node).map((item) => [item.id, item])
  );

  const newEdges = edges.filter(
    (edge) => edge.sourceId === node.id || edge.targetId === node.id
  );

  let hits = 0;

  for (const edge of newEdges) {
    const source = nodesById.get(edge.sourceId);
    const target = nodesById.get(edge.targetId);

    if (!source || !target) {
      continue;
    }

    const start = nodeCenter(source);
    const end = nodeCenter(target);

    for (const other of occupyingNodes) {
      if (other.id === source.id || other.id === target.id) {
        continue;
      }

      if (
        segmentHitsRect(start, end, {
          x: other.position.x,
          y: other.position.y,
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
        })
      ) {
        hits += 1;
      }
    }
  }

  return hits;
}

function offsetFromAnchor(
  anchor: LayoutNode,
  direction: "above" | "below" | "left" | "right"
): Point {
  switch (direction) {
    case "above":
      return { x: anchor.position.x, y: anchor.position.y - ROW_STEP };
    case "below":
      return { x: anchor.position.x, y: anchor.position.y + ROW_STEP };
    case "left":
      return { x: anchor.position.x - COL_STEP, y: anchor.position.y };
    case "right":
      return { x: anchor.position.x + COL_STEP, y: anchor.position.y };
  }
}

function preferredSlotForEdge(
  newNode: LayoutNode,
  anchor: LayoutNode,
  relationship: string,
  newIsSource: boolean
): Point {
  const rel = normalizeRelationship(relationship);

  if (rel === "causes" || rel === "leads to") {
    return offsetFromAnchor(anchor, newIsSource ? "above" : "below");
  }

  if (rel === "solves" || rel === "supports") {
    return offsetFromAnchor(anchor, newIsSource ? "right" : "left");
  }

  if (rel === "depends on" || rel === "requires") {
    return offsetFromAnchor(anchor, newIsSource ? "below" : "above");
  }

  if (rel === "decided by") {
    return offsetFromAnchor(anchor, newIsSource ? "right" : "left");
  }

  if (
    newNode.nodeType === "solution" ||
    newNode.nodeType === "decision"
  ) {
    return offsetFromAnchor(anchor, "right");
  }

  if (newNode.nodeType === "task") {
    return offsetFromAnchor(anchor, "below");
  }

  if (newNode.nodeType === "question") {
    return offsetFromAnchor(anchor, "left");
  }

  return offsetFromAnchor(anchor, newIsSource ? "left" : "right");
}

function relationshipRank(relationship?: string): number {
  const index = RELATIONSHIP_PRIORITY.indexOf(
    normalizeRelationship(relationship) as (typeof RELATIONSHIP_PRIORITY)[number]
  );

  return index === -1 ? RELATIONSHIP_PRIORITY.length : index;
}

function getPrimaryAnchor(
  newNode: LayoutNode,
  occupyingNodes: LayoutNode[],
  edges: LayoutEdge[]
): { anchor: LayoutNode; relationship: string; newIsSource: boolean } | null {
  const occupyingIds = new Set(occupyingNodes.map((node) => node.id));

  const relatedEdges = edges
    .filter((edge) => {
      if (edge.sourceId === newNode.id) {
        return occupyingIds.has(edge.targetId);
      }

      if (edge.targetId === newNode.id) {
        return occupyingIds.has(edge.sourceId);
      }

      return false;
    })
    .sort((left, right) => {
      const rankDelta =
        relationshipRank(left.relationship) -
        relationshipRank(right.relationship);

      if (rankDelta !== 0) {
        return rankDelta;
      }

      return left.id.localeCompare(right.id);
    });

  const primary = relatedEdges[0];

  if (!primary) {
    return null;
  }

  const newIsSource = primary.sourceId === newNode.id;
  const anchorId = newIsSource ? primary.targetId : primary.sourceId;
  const anchor = occupyingNodes.find((node) => node.id === anchorId);

  if (!anchor) {
    return null;
  }

  return {
    anchor,
    relationship: normalizeRelationship(primary.relationship),
    newIsSource,
  };
}

function candidatesAround(origin: Point): Point[] {
  const candidates: Point[] = [];

  for (let ring = 0; ring <= MAX_SEARCH_RING; ring++) {
    if (ring === 0) {
      candidates.push(origin);
      continue;
    }

    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) {
          continue;
        }

        candidates.push({
          x: origin.x + dx * COL_STEP,
          y: origin.y + dy * ROW_STEP,
        });
      }
    }
  }

  return candidates;
}

function unconnectedOrigin(occupyingNodes: LayoutNode[]): Point {
  if (occupyingNodes.length === 0) {
    return FIRST_NODE_POSITION;
  }

  let rightmost = occupyingNodes[0];

  for (const node of occupyingNodes) {
    if (node.position.x > rightmost.position.x) {
      rightmost = node;
    }
  }

  return {
    x: rightmost.position.x + COL_STEP,
    y: rightmost.position.y,
  };
}

function scoreCandidate(
  candidate: Point,
  preferred: Point,
  node: LayoutNode,
  occupyingNodes: LayoutNode[],
  edges: LayoutEdge[]
): number {
  const placedNode = {
    ...node,
    position: candidate,
  };

  const crossings = countEdgeCrossings(placedNode, occupyingNodes, edges);
  const bodies = countBodiesCrossed(placedNode, occupyingNodes, edges);
  const dx = candidate.x - preferred.x;
  const dy = candidate.y - preferred.y;
  const distance = Math.abs(dx) + Math.abs(dy);
  const aligned = candidate.x === preferred.x || candidate.y === preferred.y ? 0 : 40;

  return crossings * 1000 + bodies * 400 + distance + aligned;
}

export function findBestNodePosition(
  node: LayoutNode,
  occupyingNodes: LayoutNode[],
  edges: LayoutEdge[]
): Point {
  const primary = getPrimaryAnchor(node, occupyingNodes, edges);

  const preferred = primary
    ? preferredSlotForEdge(
        node,
        primary.anchor,
        primary.relationship,
        primary.newIsSource
      )
    : unconnectedOrigin(occupyingNodes);

  let best: Point | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of candidatesAround(preferred)) {
    if (hasNodeCollision(candidate, occupyingNodes)) {
      continue;
    }

    const score = scoreCandidate(
      candidate,
      preferred,
      node,
      occupyingNodes,
      edges
    );

    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }

    if (score === 0) {
      break;
    }
  }

  if (best) {
    return best;
  }

  return preferred;
}

export function calculateIncrementalLayout(
  canvas: LayoutCanvas,
  newNodeIds: string[]
): LayoutCanvas {
  if (newNodeIds.length === 0) {
    return canvas;
  }

  const newIdSet = new Set(newNodeIds);
  const nodes = canvas.nodes.map((node) => ({ ...node }));
  const pending = nodes
    .filter((node) => newIdSet.has(node.id))
    .map((node) => node.id);

  const placedIds = new Set(
    nodes.filter((node) => !newIdSet.has(node.id)).map((node) => node.id)
  );

  while (pending.length > 0) {
    let nextIndex = pending.findIndex((id) =>
      getConnectedNodes(id, { nodes, edges: canvas.edges }).some((node) =>
        placedIds.has(node.id)
      )
    );

    if (nextIndex === -1) {
      nextIndex = 0;
    }

    const nodeId = pending.splice(nextIndex, 1)[0];
    const nodeIndex = nodes.findIndex((node) => node.id === nodeId);

    if (nodeIndex === -1) {
      continue;
    }

    const occupyingNodes = nodes.filter((node) => placedIds.has(node.id));

    nodes[nodeIndex] = {
      ...nodes[nodeIndex],
      position: findBestNodePosition(
        nodes[nodeIndex],
        occupyingNodes,
        canvas.edges
      ),
    };

    placedIds.add(nodeId);
  }

  return {
    nodes,
    edges: canvas.edges,
  };
}
