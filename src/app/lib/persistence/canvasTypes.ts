/**
 * Phase 13.1 — Persistent Backend Workspace: Canvas Persistence Contracts
 *
 * Serializable DTOs for durable canvas state (nodes, edges, groups) and action audit records.
 *
 * CRITICAL INVARIANTS:
 * 1. CanvasState in memory remains the ONLY runtime canonical model.
 * 2. canvas_nodes, canvas_edges, canvas_groups represent durable materialized state.
 * 3. canvas_actions is an append-only audit & provenance log ONLY — NOT for canvas reconstruction.
 * 4. Cross-workspace edge integrity invariant:
 *    edge.workspaceId === sourceNode.workspaceId === targetNode.workspaceId
 *    (Enforced via composite foreign keys in Phase 13.2 schema).
 * 5. Strictly JSON-safe DTOs — zero @xyflow/react dependencies.
 */

import type {
  CanvasEdgeId,
  CanvasGroupId,
  CanvasNodeId,
  ConversationId,
  IsoTimestampString,
  MeetingId,
  ServerRevision,
  UserId,
  WorkspaceId,
} from "./types";

/**
 * Durable Node record materialized in database table `canvas_nodes`.
 */
export type CanvasNodeRecord = {
  id: CanvasNodeId;
  workspaceId: WorkspaceId;
  nodeType: string;
  title: string;
  description?: string;
  positionX: number;
  positionY: number;
  version: number;
  createdAt: IsoTimestampString;
  updatedAt: IsoTimestampString;
};

/**
 * Durable Edge record materialized in database table `canvas_edges`.
 */
export type CanvasEdgeRecord = {
  id: CanvasEdgeId;
  workspaceId: WorkspaceId;
  sourceId: CanvasNodeId;
  targetId: CanvasNodeId;
  relationship?: string;
  createdAt: IsoTimestampString;
};

/**
 * Durable Group record materialized in database table `canvas_groups`.
 */
export type CanvasGroupRecord = {
  id: CanvasGroupId;
  workspaceId: WorkspaceId;
  title: string;
  memberIds: CanvasNodeId[];
  color?: string;
  createdAt: IsoTimestampString;
  updatedAt: IsoTimestampString;
};

/**
 * Materialized canvas snapshot used for initial workspace hydration.
 */
export type CanvasSnapshotRecord = {
  workspaceId: WorkspaceId;
  revision: ServerRevision;
  nodes: CanvasNodeRecord[];
  edges: CanvasEdgeRecord[];
  groups: CanvasGroupRecord[];
};

/**
 * Payload for syncing canvas mutations to the backend.
 * Uses expectedBaseRevision to detect concurrent conflicting writes on the server.
 */
export type CanvasMutationRequest = {
  workspaceId: WorkspaceId;
  expectedBaseRevision?: ServerRevision;
  upsertNodes?: Array<{
    id: CanvasNodeId;
    nodeType: string;
    title: string;
    description?: string;
    positionX: number;
    positionY: number;
  }>;
  deleteNodeIds?: CanvasNodeId[];
  upsertEdges?: Array<{
    id: CanvasEdgeId;
    sourceId: CanvasNodeId;
    targetId: CanvasNodeId;
    relationship?: string;
  }>;
  deleteEdgeIds?: CanvasEdgeId[];
  upsertGroups?: Array<{
    id: CanvasGroupId;
    title: string;
    memberIds: CanvasNodeId[];
    color?: string;
  }>;
  deleteGroupIds?: CanvasGroupId[];
};

/**
 * Response after processing a canvas mutation batch on the server.
 */
export type CanvasMutationResponse = {
  accepted: boolean;
  workspaceId: WorkspaceId;
  newRevision: ServerRevision;
  appliedNodeCount: number;
  appliedEdgeCount: number;
  appliedGroupCount: number;
  error?: string;
};

/**
 * Meeting action provenance metadata compatible with Phase 12.6.4 CanvasActionMetadata.
 */
export type CanvasActionProvenanceMetadata = {
  source?: "meeting" | string;
  meetingId?: MeetingId;
  insightId?: string;
  sourceSegmentIds?: string[];
  speakerIds?: string[];
  confidence?: number;
  [key: string]: unknown;
};

/**
 * Append-only action audit log entry stored in `canvas_actions`.
 * Strictly for audit, telemetry, undo/redo inspection, and provenance.
 * NEVER used as an event-sourcing engine to reconstruct the canvas.
 */
export type CanvasActionRecord = {
  id: string;
  workspaceId: WorkspaceId;
  conversationId?: ConversationId;
  actionType: string;
  payload: Record<string, unknown>;
  metadata?: CanvasActionProvenanceMetadata;
  appliedBy?: UserId;
  createdAt: IsoTimestampString;
};

/**
 * Request DTO to append an action to the canvas audit log.
 */
export type RecordCanvasActionRequest = {
  id?: string;
  workspaceId: WorkspaceId;
  conversationId?: ConversationId;
  actionType: string;
  payload: Record<string, unknown>;
  metadata?: CanvasActionProvenanceMetadata;
  appliedBy?: UserId;
};

/**
 * Response DTO after recording a canvas action.
 */
export type RecordCanvasActionResponse = {
  action: CanvasActionRecord;
};
