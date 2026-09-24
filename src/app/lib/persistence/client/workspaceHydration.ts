/**
 * Phase 13.4 — Workspace Hydration & Normalization Boundary
 *
 * Converts persisted Phase 13.1 DTOs into existing runtime CanvasState & Conversation models.
 * CRITICAL INVARIANTS:
 * - CanvasState remains the single canonical runtime state.
 * - Hydration is strictly READ-ONLY; never mutates backend database or triggers autosave.
 * - Persisted relationships (edge source/target, group members) are strictly validated.
 */

import type { CanvasSnapshotRecord } from "../canvasTypes";
import type { ConversationRecord, MessageRecord } from "../conversationTypes";

export type RuntimeCanvasNode = {
  id: string;
  nodeType: string;
  title: string;
  description?: string;
  position: {
    x: number;
    y: number;
  };
};

export type RuntimeCanvasEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  relationship?: string;
};

export type RuntimeCanvasGroup = {
  id: string;
  title: string;
  memberIds: string[];
};

export type RuntimeCanvasState = {
  nodes: RuntimeCanvasNode[];
  edges: RuntimeCanvasEdge[];
  groups: RuntimeCanvasGroup[];
};

export type RuntimeMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type RuntimeConversation = {
  id: string;
  title: string;
  messages: RuntimeMessage[];
  canvas: RuntimeCanvasState;
  createdAt: string;
  updatedAt: string;
};

/**
 * Normalizes a loaded persistent CanvasSnapshotRecord into authoritative runtime CanvasState.
 * Validates node existence, edge/group relationship integrity, and duplicate identities.
 */
export function normalizePersistedCanvas(
  snapshot?: CanvasSnapshotRecord | null
): RuntimeCanvasState {
  if (!snapshot || !Array.isArray(snapshot.nodes)) {
    return { nodes: [], edges: [], groups: [] };
  }

  // 1. Normalize nodes, reject duplicate node IDs, and index valid node IDs
  const validNodeIds = new Set<string>();
  const normalizedNodes: RuntimeCanvasNode[] = [];

  for (const node of snapshot.nodes) {
    if (!node || typeof node.id !== "string" || !node.title) {
      continue;
    }
    // Reject duplicate node IDs deterministically (keep first occurrence)
    if (validNodeIds.has(node.id)) {
      continue;
    }
    validNodeIds.add(node.id);
    normalizedNodes.push({
      id: node.id,
      nodeType: node.nodeType || "problem",
      title: node.title,
      description: node.description || undefined,
      position: {
        x: typeof node.positionX === "number"
          ? node.positionX
          : typeof (node as any).position?.x === "number"
          ? (node as any).position.x
          : 0,
        y: typeof node.positionY === "number"
          ? node.positionY
          : typeof (node as any).position?.y === "number"
          ? (node as any).position.y
          : 0,
      },
    });
  }

  // 2. Normalize and validate edges: reject duplicate edge IDs and enforce valid endpoints
  const seenEdgeIds = new Set<string>();
  const normalizedEdges: RuntimeCanvasEdge[] = [];
  if (Array.isArray(snapshot.edges)) {
    for (const edge of snapshot.edges) {
      if (!edge || !edge.id || !edge.sourceId || !edge.targetId) {
        continue;
      }
      // Reject duplicate edge IDs deterministically (keep first occurrence)
      if (seenEdgeIds.has(edge.id)) {
        continue;
      }
      // Strictly enforce composite endpoint existence
      if (!validNodeIds.has(edge.sourceId) || !validNodeIds.has(edge.targetId)) {
        // Dangling edge detected in persisted state; exclude from runtime canvas
        continue;
      }
      seenEdgeIds.add(edge.id);
      normalizedEdges.push({
        id: edge.id,
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        relationship: edge.relationship || undefined,
      });
    }
  }

  // 3. Normalize and validate groups: reject duplicate group IDs and deduplicate member IDs
  const seenGroupIds = new Set<string>();
  const normalizedGroups: RuntimeCanvasGroup[] = [];
  if (Array.isArray(snapshot.groups)) {
    for (const group of snapshot.groups) {
      if (!group || !group.id || !group.title) {
        continue;
      }
      // Reject duplicate group IDs deterministically (keep first occurrence)
      if (seenGroupIds.has(group.id)) {
        continue;
      }
      seenGroupIds.add(group.id);

      // Deduplicate member IDs deterministically and verify node existence
      const seenMemberIds = new Set<string>();
      const validMembers: string[] = [];
      if (Array.isArray(group.memberIds)) {
        for (const mid of group.memberIds) {
          if (typeof mid === "string" && validNodeIds.has(mid) && !seenMemberIds.has(mid)) {
            seenMemberIds.add(mid);
            validMembers.push(mid);
          }
        }
      }

      normalizedGroups.push({
        id: group.id,
        title: group.title,
        memberIds: validMembers,
      });
    }
  }

  return {
    nodes: normalizedNodes,
    edges: normalizedEdges,
    groups: normalizedGroups,
  };
}

/**
 * Normalizes loaded persisted conversations and messages into runtime Conversation models.
 *
 * HYDRATION SEMANTICS (Phase 13.4):
 * - Metadata (id, title, timestamps) is hydrated for ALL conversations in the workspace.
 * - Full message history is hydrated for the active (first) conversation ONLY via `activeMessages`.
 *   Subsequent conversations in the workspace hold empty message arrays until explicitly activated.
 * - Message roles are strictly validated at runtime: only "user" and "assistant" are permitted.
 *   Messages with unknown/invalid roles are safely dropped from runtime state.
 */
export function normalizePersistedConversations(
  records: ConversationRecord[],
  activeMessages: MessageRecord[],
  activeCanvas: RuntimeCanvasState
): RuntimeConversation[] {
  if (!Array.isArray(records) || records.length === 0) {
    return [];
  }

  const VALID_ROLES = new Set(["user", "assistant"]);

  return records.map((record, index) => {
    const isFirst = index === 0;
    const msgs: RuntimeMessage[] = [];

    if (isFirst && Array.isArray(activeMessages)) {
      for (const m of activeMessages) {
        if (!m || !m.id || !m.content) {
          continue;
        }
        // Strict runtime validation of message role (reject invalid/arbitrary roles)
        if (!VALID_ROLES.has(m.role)) {
          continue;
        }
        msgs.push({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          createdAt: m.createdAt,
        });
      }
    }

    let convCanvas: RuntimeCanvasState;
    if (record.metadata?.canvas && typeof record.metadata.canvas === "object") {
      convCanvas = normalizePersistedCanvas(record.metadata.canvas as any);
    } else {
      const hasAnyMetadataCanvas = records.some((r) => r.metadata?.canvas);
      if (isFirst && !hasAnyMetadataCanvas && activeCanvas && (activeCanvas.nodes.length > 0 || activeCanvas.edges.length > 0)) {
        convCanvas = activeCanvas;
      } else {
        convCanvas = { nodes: [], edges: [], groups: [] };
      }
    }

    return {
      id: record.id,
      title: record.title,
      messages: msgs,
      canvas: convCanvas,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  });
}
