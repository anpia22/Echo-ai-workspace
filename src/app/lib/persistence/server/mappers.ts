/**
 * Phase 13.3 — Database ↔ DTO Row Mappers
 *
 * Explicit mapping functions converting raw PostgreSQL/Supabase rows into
 * frozen Phase 13.1 serializable DTOs.
 *
 * CRITICAL INVARIANTS:
 * - Server timestamps remain authoritative.
 * - BigInt/revision parsing is strictly precision-safe.
 * - No raw database internal columns leak into domain DTOs.
 * - Strict nullability and default handling.
 */

import type {
  Workspace,
  WorkspaceMember,
  WorkspaceMemberRole,
  ConversationRecord,
  MessageRecord,
  MessageRole,
  CanvasNodeRecord,
  CanvasEdgeRecord,
  CanvasGroupRecord,
  CanvasActionRecord,
  MeetingRecord,
  MeetingParticipantRecord,
  MeetingTranscriptSegmentRecord,
  MeetingInsightRecord,
  MeetingPersistenceStatus,
  MeetingInsightType,
  CollaborationRoomRecord,
  CollaborationParticipantRecord,
  RoomPersistenceStatus,
  ServerRevision,
} from "../index";
import { PersistenceError } from "./errors";

/**
 * Parses and validates PostgreSQL BIGINT revision to precision-safe JavaScript number.
 */
export function parseServerRevision(val: unknown): ServerRevision {
  if (typeof val === "number") {
    if (!Number.isSafeInteger(val) || val < 1) {
      throw new PersistenceError("VALIDATION_ERROR", `Invalid or non-safe integer revision: ${val}`);
    }
    return val;
  }
  if (typeof val === "string") {
    const num = Number(val);
    if (!Number.isSafeInteger(num) || num < 1) {
      throw new PersistenceError("VALIDATION_ERROR", `Invalid or non-safe integer revision string: ${val}`);
    }
    return num;
  }
  if (typeof val === "bigint") {
    if (val > BigInt(Number.MAX_SAFE_INTEGER) || val < BigInt(1)) {
      throw new PersistenceError("VALIDATION_ERROR", `BigInt revision exceeds JavaScript MAX_SAFE_INTEGER: ${val}`);
    }
    return Number(val);
  }
  throw new PersistenceError("VALIDATION_ERROR", `Expected valid revision value, received: ${typeof val}`);
}

export function mapWorkspaceRow(row: Record<string, unknown>): Workspace {
  if (!row || typeof row !== "object") {
    throw new PersistenceError("DATABASE_ERROR", "Invalid workspace row data");
  }

  return {
    id: String(row.id),
    title: String(row.title),
    description: row.description ? String(row.description) : undefined,
    settings: (row.settings && typeof row.settings === "object") ? (row.settings as Record<string, unknown>) : undefined,
    revision: parseServerRevision(row.revision),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export function mapWorkspaceMemberRow(row: Record<string, unknown>): WorkspaceMember {
  if (!row || typeof row !== "object") {
    throw new PersistenceError("DATABASE_ERROR", "Invalid workspace_member row data");
  }

  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    userId: String(row.user_id),
    displayName: String(row.display_name),
    role: String(row.role) as WorkspaceMemberRole,
    color: String(row.color || "#3b82f6"),
    createdAt: new Date(String(row.created_at)).toISOString(),
    lastSeenAt: row.last_seen_at ? new Date(String(row.last_seen_at)).toISOString() : undefined,
  };
}

export function mapConversationRow(row: Record<string, unknown>): ConversationRecord {
  if (!row || typeof row !== "object") {
    throw new PersistenceError("DATABASE_ERROR", "Invalid conversation row data");
  }

  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    title: String(row.title),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    metadata: (row.metadata && typeof row.metadata === "object") ? (row.metadata as Record<string, unknown>) : undefined,
  };
}

export function mapMessageRow(row: Record<string, unknown>): MessageRecord {
  if (!row || typeof row !== "object") {
    throw new PersistenceError("DATABASE_ERROR", "Invalid message row data");
  }

  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    workspaceId: String(row.workspace_id),
    role: String(row.role) as MessageRole,
    content: String(row.content),
    createdAt: new Date(String(row.created_at)).toISOString(),
    senderId: row.sender_id ? String(row.sender_id) : undefined,
    sequence: row.sequence !== undefined && row.sequence !== null ? Number(row.sequence) : undefined,
    metadata: (row.metadata && typeof row.metadata === "object") ? (row.metadata as Record<string, unknown>) : undefined,
  };
}

export function mapCanvasNodeRow(row: Record<string, unknown>): CanvasNodeRecord {
  if (!row || typeof row !== "object") {
    throw new PersistenceError("DATABASE_ERROR", "Invalid canvas_node row data");
  }

  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    nodeType: String(row.node_type),
    title: String(row.title),
    description: row.description ? String(row.description) : undefined,
    positionX: Number(row.position_x ?? 0),
    positionY: Number(row.position_y ?? 0),
    version: Number(row.version ?? 1),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export function mapCanvasEdgeRow(row: Record<string, unknown>): CanvasEdgeRecord {
  if (!row || typeof row !== "object") {
    throw new PersistenceError("DATABASE_ERROR", "Invalid canvas_edge row data");
  }

  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    sourceId: String(row.source_id),
    targetId: String(row.target_id),
    relationship: row.relationship ? String(row.relationship) : undefined,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

export function mapCanvasGroupRow(row: Record<string, unknown>): CanvasGroupRecord {
  if (!row || typeof row !== "object") {
    throw new PersistenceError("DATABASE_ERROR", "Invalid canvas_group row data");
  }

  const memberIds = Array.isArray(row.member_ids) ? (row.member_ids as string[]).map(String) : [];

  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    title: String(row.title),
    memberIds,
    color: row.color ? String(row.color) : undefined,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export function mapCanvasActionRow(row: Record<string, unknown>): CanvasActionRecord {
  if (!row || typeof row !== "object") {
    throw new PersistenceError("DATABASE_ERROR", "Invalid canvas_action row data");
  }

  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    conversationId: row.conversation_id ? String(row.conversation_id) : undefined,
    actionType: String(row.action_type),
    payload: (row.payload && typeof row.payload === "object") ? (row.payload as Record<string, unknown>) : {},
    metadata: (row.metadata && typeof row.metadata === "object") ? (row.metadata as Record<string, unknown>) : undefined,
    appliedBy: row.applied_by ? String(row.applied_by) : undefined,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

export function mapMeetingRow(row: Record<string, unknown>): MeetingRecord {
  if (!row || typeof row !== "object") {
    throw new PersistenceError("DATABASE_ERROR", "Invalid meeting row data");
  }

  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    title: row.title ? String(row.title) : undefined,
    status: String(row.status) as MeetingPersistenceStatus,
    startedAt: new Date(String(row.started_at)).toISOString(),
    endedAt: row.ended_at ? new Date(String(row.ended_at)).toISOString() : undefined,
    createdBy: row.created_by ? String(row.created_by) : undefined,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

export function mapMeetingParticipantRow(row: Record<string, unknown>): MeetingParticipantRecord {
  if (!row || typeof row !== "object") {
    throw new PersistenceError("DATABASE_ERROR", "Invalid meeting_participant row data");
  }

  return {
    id: String(row.id),
    meetingId: String(row.meeting_id),
    userId: String(row.user_id),
    displayName: String(row.display_name),
    color: String(row.color || "#3b82f6"),
    joinedAt: new Date(String(row.joined_at)).toISOString(),
    leftAt: row.left_at ? new Date(String(row.left_at)).toISOString() : undefined,
  };
}

export function mapTranscriptRow(row: Record<string, unknown>): MeetingTranscriptSegmentRecord {
  if (!row || typeof row !== "object") {
    throw new PersistenceError("DATABASE_ERROR", "Invalid meeting_transcript_segment row data");
  }

  return {
    id: String(row.id),
    meetingId: String(row.meeting_id),
    speakerId: String(row.speaker_id),
    speakerName: String(row.speaker_name),
    text: String(row.text),
    timestamp: Number(row.timestamp),
    sequence: Number(row.sequence ?? 0),
    status: "final",
    source: "meeting",
    language: row.language ? String(row.language) : undefined,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

export function mapInsightRow(row: Record<string, unknown>): MeetingInsightRecord {
  if (!row || typeof row !== "object") {
    throw new PersistenceError("DATABASE_ERROR", "Invalid meeting_insight row data");
  }

  return {
    id: String(row.id),
    meetingId: String(row.meeting_id),
    type: String(row.type) as MeetingInsightType,
    title: String(row.title),
    summary: String(row.summary),
    sourceSegmentIds: Array.isArray(row.source_segment_ids) ? (row.source_segment_ids as string[]).map(String) : [],
    speakerIds: Array.isArray(row.speaker_ids) ? (row.speaker_ids as string[]).map(String) : [],
    confidence: row.confidence !== undefined && row.confidence !== null ? Number(row.confidence) : undefined,
    timestamp: Number(row.timestamp),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

export function mapCollaborationRoomRow(row: Record<string, unknown>): CollaborationRoomRecord {
  if (!row || typeof row !== "object") {
    throw new PersistenceError("DATABASE_ERROR", "Invalid collaboration_room row data");
  }

  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    title: row.title ? String(row.title) : undefined,
    status: String(row.status) as RoomPersistenceStatus,
    createdBy: row.created_by ? String(row.created_by) : undefined,
    metadata: (row.metadata && typeof row.metadata === "object") ? (row.metadata as Record<string, unknown>) : {},
    lastKnownState: (row.last_known_state && typeof row.last_known_state === "object") ? (row.last_known_state as Record<string, unknown>) : undefined,
    createdAt: new Date(String(row.created_at)).toISOString(),
    closedAt: row.closed_at ? new Date(String(row.closed_at)).toISOString() : undefined,
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export function mapCollaborationParticipantRow(row: Record<string, unknown>): CollaborationParticipantRecord {
  if (!row || typeof row !== "object") {
    throw new PersistenceError("DATABASE_ERROR", "Invalid collaboration_participant row data");
  }

  return {
    id: String(row.id),
    roomId: String(row.room_id),
    workspaceId: String(row.workspace_id),
    userId: String(row.user_id),
    displayName: String(row.display_name),
    color: String(row.color || "#6366f1"),
    joinedAt: new Date(String(row.joined_at)).toISOString(),
    leftAt: row.left_at ? new Date(String(row.left_at)).toISOString() : undefined,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}
