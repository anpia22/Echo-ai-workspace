/**
 * Phase 13.1 — Persistent Backend Workspace: Common Persistence Primitives & Invariants
 *
 * Core scalar types, branded identifiers, and foundational architecture invariants.
 *
 * CRITICAL INVARIANTS:
 * 1. WorkspaceId !== MeetingId !== RoomId
 *    - WorkspaceId: Durable container identity for canvas, conversations, meetings.
 *    - MeetingId: Session-level persistence identity belonging to a workspace.
 *    - RoomId: Ephemeral WebRTC & broadcast signaling channel identity.
 * 2. CanvasState remains the ONLY runtime canonical model.
 * 3. Database tables (canvas_nodes, canvas_edges, canvas_groups) hold durable materialized state.
 * 4. canvas_actions is audit & provenance log ONLY — never used for canvas reconstruction.
 * 5. All types here are strictly JSON-serializable (no classes, functions, Map, Set, or WebRTC handles).
 */

/**
 * ISO 8601 UTC timestamp string representation (e.g. "2026-09-06T13:00:00.000Z").
 * Standard serialized format for durable records in the repository and API layer.
 */
export type IsoTimestampString = string;

/**
 * Epoch timestamp in milliseconds (e.g. 1788700756153).
 * Used for high-resolution meeting audio/STT event telemetry and segment timing.
 */
export type EpochMsTimestamp = number;

/**
 * Unique identifier for a durable Workspace.
 * Top-level isolation boundary for tenants, canvases, and conversations.
 */
export type WorkspaceId = string;

/**
 * Unique identifier for a Conversation thread within a workspace.
 */
export type ConversationId = string;

/**
 * Unique identifier for a Message in a conversation.
 */
export type MessageId = string;

/**
 * Canonical node identifier (matches CanvasNode.id).
 */
export type CanvasNodeId = string;

/**
 * Canonical edge identifier (matches CanvasEdge.id).
 */
export type CanvasEdgeId = string;

/**
 * Canonical group identifier (matches CanvasGroup.id).
 */
export type CanvasGroupId = string;

/**
 * Persistent meeting session identifier belonging to a workspace.
 */
export type MeetingId = string;

/**
 * Ephemeral WebRTC & broadcast signaling room token.
 * NEVER conflated with WorkspaceId.
 */
export type RoomId = string;

/**
 * User / Actor identifier across workspaces, meetings, and cursors.
 */
export type UserId = string;

/**
 * Monotonically increasing server-authoritative revision counter for a workspace.
 * Governed by the database/server to protect against stale writes and race conditions.
 */
export type ServerRevision = number;
