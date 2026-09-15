/**
 * Phase 13.5 — Canvas Action → Persistence DTO Mapper
 *
 * Translates runtime CanvasAction[] + canvas state snapshots into a CanvasMutationRequest
 * suitable for server-side persistence via apply_canvas_mutation_tx.
 *
 * CRITICAL INVARIANTS:
 * - CanvasAction carries titles, NOT IDs. IDs are derived from prevCanvas / nextCanvas.
 * - prevCanvas = canvas state BEFORE applyCanvasActions (used to locate deleted items)
 * - nextCanvas = canvas state AFTER applyCanvasActions (used to locate created/updated items)
 * - No ReactFlow-internal objects are ever serialized.
 * - Zero-length results are returned as empty arrays; callers must guard against empty batches.
 * - Client-only: this file must never import server/repository/DB modules.
 */

import type { CanvasAction } from "../../applyCanvasActions";
import type { CanvasMutationRequest } from "../canvasTypes";

export type CanvasNodeLike = {
  id: string;
  nodeType: string;
  title: string;
  description?: string;
  position: { x: number; y: number };
};

export type CanvasEdgeLike = {
  id: string;
  sourceId: string;
  targetId: string;
  relationship?: string;
};

export type CanvasGroupLike = {
  id: string;
  title: string;
  memberIds: string[];
};

export type CanvasStateLike = {
  nodes: CanvasNodeLike[];
  edges: CanvasEdgeLike[];
  groups: CanvasGroupLike[];
};

/**
 * Maps a batch of CanvasActions + canvas state snapshots into a CanvasMutationRequest.
 *
 * ID resolution strategy:
 * - CREATE_NODE  → id from nextCanvas (lookup by title)
 * - UPDATE_NODE  → id from nextCanvas (same id, updated fields)
 * - MOVE_NODE    → id from nextCanvas (same id, new position)
 * - DELETE_NODE  → id from prevCanvas (node existed before deletion)
 * - CREATE_EDGE  → id from nextCanvas (new edge; lookup by source+target+rel)
 * - DELETE_EDGE  → id from prevCanvas (edge existed before deletion)
 * - GROUP_NODES  → group id from nextCanvas (lookup by title or member set)
 */
export function mapActionsToMutation(
  actions: CanvasAction[],
  prevCanvas: CanvasStateLike,
  nextCanvas: CanvasStateLike,
  workspaceId: string
): Omit<CanvasMutationRequest, "expectedBaseRevision"> {
  const upsertNodes: NonNullable<CanvasMutationRequest["upsertNodes"]> = [];
  const deleteNodeIds: string[] = [];
  const upsertEdges: NonNullable<CanvasMutationRequest["upsertEdges"]> = [];
  const deleteEdgeIds: string[] = [];
  const upsertGroups: NonNullable<CanvasMutationRequest["upsertGroups"]> = [];
  const deleteGroupIds: string[] = [];

  // Track processed items to avoid duplicate entries from multi-action batches
  const upsertedNodeIds = new Set<string>();
  const deletedNodeIds = new Set<string>();
  const upsertedEdgeIds = new Set<string>();
  const deletedEdgeIds = new Set<string>();
  const upsertedGroupIds = new Set<string>();

  for (const action of actions) {
    if (!action || typeof action.type !== "string") {
      continue;
    }

    // -------------------------------------------------------------------
    // CREATE_NODE — node is in nextCanvas, not in prevCanvas
    // -------------------------------------------------------------------
    if (action.type === "CREATE_NODE" && action.title) {
      const node = nextCanvas.nodes.find((n) => n.title === action.title);
      if (!node) {
        console.warn("[canvasActionMapper] CREATE_NODE: node not found in nextCanvas:", action.title);
        continue;
      }
      if (upsertedNodeIds.has(node.id)) continue;
      upsertedNodeIds.add(node.id);
      upsertNodes.push({
        id: node.id,
        nodeType: node.nodeType,
        title: node.title,
        description: node.description,
        positionX: node.position.x,
        positionY: node.position.y,
      });
      continue;
    }

    // -------------------------------------------------------------------
    // UPDATE_NODE — same node, updated fields; id from nextCanvas
    // -------------------------------------------------------------------
    if (action.type === "UPDATE_NODE" && action.targetTitle) {
      const node = nextCanvas.nodes.find(
        (n) => n.title === (action.updates?.title ?? action.targetTitle)
      );
      if (!node) {
        // Fallback: look up by original title (title may have changed)
        const originalNode = nextCanvas.nodes.find((n) => n.title === action.targetTitle);
        if (!originalNode) {
          console.warn("[canvasActionMapper] UPDATE_NODE: node not found in nextCanvas:", action.targetTitle);
          continue;
        }
        if (upsertedNodeIds.has(originalNode.id)) continue;
        upsertedNodeIds.add(originalNode.id);
        upsertNodes.push({
          id: originalNode.id,
          nodeType: originalNode.nodeType,
          title: originalNode.title,
          description: originalNode.description,
          positionX: originalNode.position.x,
          positionY: originalNode.position.y,
        });
        continue;
      }
      if (upsertedNodeIds.has(node.id)) continue;
      upsertedNodeIds.add(node.id);
      upsertNodes.push({
        id: node.id,
        nodeType: node.nodeType,
        title: node.title,
        description: node.description,
        positionX: node.position.x,
        positionY: node.position.y,
      });
      continue;
    }

    // -------------------------------------------------------------------
    // MOVE_NODE — same node id, updated position; id from nextCanvas
    // -------------------------------------------------------------------
    if (action.type === "MOVE_NODE" && action.targetTitle) {
      const node = nextCanvas.nodes.find((n) => n.title === action.targetTitle);
      if (!node) {
        console.warn("[canvasActionMapper] MOVE_NODE: node not found in nextCanvas:", action.targetTitle);
        continue;
      }
      if (upsertedNodeIds.has(node.id)) continue;
      upsertedNodeIds.add(node.id);
      upsertNodes.push({
        id: node.id,
        nodeType: node.nodeType,
        title: node.title,
        description: node.description,
        positionX: node.position.x,
        positionY: node.position.y,
      });
      continue;
    }

    // -------------------------------------------------------------------
    // DELETE_NODE — node was in prevCanvas, now removed; id from prevCanvas
    // -------------------------------------------------------------------
    if (action.type === "DELETE_NODE" && action.targetTitle) {
      const node = prevCanvas.nodes.find((n) => n.title === action.targetTitle);
      if (!node) {
        console.warn("[canvasActionMapper] DELETE_NODE: node not found in prevCanvas:", action.targetTitle);
        continue;
      }
      if (deletedNodeIds.has(node.id)) continue;
      deletedNodeIds.add(node.id);
      deleteNodeIds.push(node.id);
      continue;
    }

    // -------------------------------------------------------------------
    // CREATE_EDGE — edge is in nextCanvas, not in prevCanvas
    // -------------------------------------------------------------------
    if (action.type === "CREATE_EDGE" && action.sourceTitle && action.targetTitle) {
      const sourceNode = nextCanvas.nodes.find((n) => n.title === action.sourceTitle);
      const targetNode = nextCanvas.nodes.find((n) => n.title === action.targetTitle);
      if (!sourceNode || !targetNode) {
        console.warn("[canvasActionMapper] CREATE_EDGE: source or target not found:", action);
        continue;
      }

      const rel = action.relationship ?? "";
      const edge = nextCanvas.edges.find(
        (e) =>
          e.sourceId === sourceNode.id &&
          e.targetId === targetNode.id &&
          (e.relationship ?? "") === rel
      );
      if (!edge) {
        console.warn("[canvasActionMapper] CREATE_EDGE: edge not found in nextCanvas:", action);
        continue;
      }
      if (upsertedEdgeIds.has(edge.id)) continue;
      upsertedEdgeIds.add(edge.id);
      upsertEdges.push({
        id: edge.id,
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        relationship: edge.relationship,
      });
      continue;
    }

    // -------------------------------------------------------------------
    // DELETE_EDGE — edge was in prevCanvas; id from prevCanvas
    // -------------------------------------------------------------------
    if (action.type === "DELETE_EDGE" && action.sourceTitle && action.targetTitle) {
      const sourceNode = prevCanvas.nodes.find((n) => n.title === action.sourceTitle);
      const targetNode = prevCanvas.nodes.find((n) => n.title === action.targetTitle);
      if (!sourceNode || !targetNode) {
        console.warn("[canvasActionMapper] DELETE_EDGE: source or target not found in prevCanvas:", action);
        continue;
      }

      const rel = action.relationship ?? "";
      const edge = prevCanvas.edges.find(
        (e) =>
          e.sourceId === sourceNode.id &&
          e.targetId === targetNode.id &&
          (action.relationship === undefined || (e.relationship ?? "") === rel)
      );
      if (!edge) {
        console.warn("[canvasActionMapper] DELETE_EDGE: edge not found in prevCanvas:", action);
        continue;
      }
      if (deletedEdgeIds.has(edge.id)) continue;
      deletedEdgeIds.add(edge.id);
      deleteEdgeIds.push(edge.id);
      continue;
    }

    // -------------------------------------------------------------------
    // GROUP_NODES — group is in nextCanvas; id from nextCanvas
    // -------------------------------------------------------------------
    if (action.type === "GROUP_NODES" && action.groupTitle && Array.isArray(action.nodeTitles)) {
      // Resolve member IDs from nextCanvas
      const memberIds: string[] = [];
      for (const title of action.nodeTitles) {
        const node = nextCanvas.nodes.find((n) => n.title === title);
        if (node) {
          memberIds.push(node.id);
        }
      }

      // Find the group by matching member set or title in nextCanvas
      const group = nextCanvas.groups.find(
        (g) =>
          g.title === action.groupTitle ||
          (memberIds.length > 0 &&
            memberIds.every((id) => g.memberIds.includes(id)) &&
            g.memberIds.length === memberIds.length)
      );

      if (!group) {
        console.warn("[canvasActionMapper] GROUP_NODES: group not found in nextCanvas:", action.groupTitle);
        continue;
      }
      if (upsertedGroupIds.has(group.id)) continue;
      upsertedGroupIds.add(group.id);
      upsertGroups.push({
        id: group.id,
        title: group.title,
        memberIds: group.memberIds,
      });
      continue;
    }

    // Unknown or unsupported action types are silently skipped
    // (future action types are not this mapper's responsibility)
  }

  return {
    workspaceId,
    upsertNodes: upsertNodes.length > 0 ? upsertNodes : undefined,
    deleteNodeIds: deleteNodeIds.length > 0 ? deleteNodeIds : undefined,
    upsertEdges: upsertEdges.length > 0 ? upsertEdges : undefined,
    deleteEdgeIds: deleteEdgeIds.length > 0 ? deleteEdgeIds : undefined,
    upsertGroups: upsertGroups.length > 0 ? upsertGroups : undefined,
    deleteGroupIds: deleteGroupIds.length > 0 ? deleteGroupIds : undefined,
  };
}

/**
 * Returns true if a mapped CanvasMutationRequest contains at least one operation.
 * Use this as a pre-flight guard before sending to the API.
 */
export function isMutationRequestEmpty(
  req: Omit<CanvasMutationRequest, "expectedBaseRevision">
): boolean {
  return (
    (!req.upsertNodes || req.upsertNodes.length === 0) &&
    (!req.deleteNodeIds || req.deleteNodeIds.length === 0) &&
    (!req.upsertEdges || req.upsertEdges.length === 0) &&
    (!req.deleteEdgeIds || req.deleteEdgeIds.length === 0) &&
    (!req.upsertGroups || req.upsertGroups.length === 0) &&
    (!req.deleteGroupIds || req.deleteGroupIds.length === 0)
  );
}

/**
 * Synthesizes a MOVE_NODE CanvasMutationRequest directly from node ID + position.
 * Used for drag-end events that bypass the CanvasAction system.
 */
export function buildMoveNodeMutation(
  workspaceId: string,
  node: CanvasNodeLike
): Omit<CanvasMutationRequest, "expectedBaseRevision"> {
  return {
    workspaceId,
    upsertNodes: [
      {
        id: node.id,
        nodeType: node.nodeType,
        title: node.title,
        description: node.description,
        positionX: node.position.x,
        positionY: node.position.y,
      },
    ],
  };
}
