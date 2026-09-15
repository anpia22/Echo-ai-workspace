/**
 * Phase 13.1 — Persistent Backend Workspace: Meeting Persistence Contracts
 *
 * Serializable DTOs for durable Meeting sessions, participants, finalized transcripts,
 * and synthesized insights.
 *
 * CRITICAL INVARIANTS:
 * 1. MeetingId belongs to WorkspaceId, but is distinct from RoomId.
 * 2. Only FINALIZED transcript segments are persisted.
 *    Interim STT recognition events remain 100% ephemeral in memory.
 * 3. Transcript uniqueness identity is: (meetingId, segmentId).
 *    `sequence` is strictly for deterministic ordering (sequence ASC, timestamp ASC, id ASC).
 *    Do NOT place a UNIQUE(meetingId, sequence) constraint in the schema.
 * 4. Insight types strictly adhere to the 7 semantic categories from Phase 12.6.3:
 *    problem, solution, decision, task, question, idea, note.
 * 5. Strictly RUNTIME-ONLY and NEVER persisted to database:
 *    - MediaStream & MediaStreamTrack
 *    - RTCPeerConnection & peer maps
 *    - SDP Offers, Answers, and ICE Candidates
 *    - WebRTC signaling envelopes
 *    - STT provider runtime instances & audio buffers
 *    - UI floating coordinates, active speaker audio levels
 */

import type {
  EpochMsTimestamp,
  IsoTimestampString,
  MeetingId,
  UserId,
  WorkspaceId,
} from "./types";

/**
 * Persistence lifecycle states for a meeting session.
 */
export type MeetingPersistenceStatus = "active" | "ended";

/**
 * Durable Meeting session record.
 */
export type MeetingRecord = {
  id: MeetingId;
  workspaceId: WorkspaceId;
  status: MeetingPersistenceStatus;
  startedAt: IsoTimestampString;
  createdAt: IsoTimestampString;
  title?: string;
  endedAt?: IsoTimestampString;
  createdBy?: UserId;
};

/**
 * Durable attendee record for a meeting session.
 */
export type MeetingParticipantRecord = {
  id: string;
  meetingId: MeetingId;
  userId: UserId;
  displayName: string;
  color: string;
  joinedAt: IsoTimestampString;
  leftAt?: IsoTimestampString;
};

/**
 * Durable finalized meeting transcript segment.
 * Compatible with Phase 12.6.1 MeetingTranscriptSegment contract.
 */
export type MeetingTranscriptSegmentRecord = {
  /** Unique segment identifier */
  id: string;
  /** Scoped meeting session identifier */
  meetingId: MeetingId;
  /** Speaker identifier */
  speakerId: UserId;
  /** Speaker display name */
  speakerName: string;
  /** Transcribed final text */
  text: string;
  /** Utterance occurrence epoch timestamp (ms) */
  timestamp: EpochMsTimestamp;
  /**
   * Monotonic sequence assigned upon finalization.
   * STRICT INVARIANT: Sequence is for ORDERING ONLY.
   * It is NOT a uniqueness key. Uniqueness is (meetingId, id).
   */
  sequence: number;
  /** Always 'final' for persisted records (interim is never stored) */
  status: "final";
  /** Provenance tag */
  source: "meeting";
  /** Language tag (e.g. 'en-US') */
  language?: string;
  /** Record creation timestamp */
  createdAt: IsoTimestampString;
};

/**
 * Semantic insight categories from Phase 12.6.3.
 */
export type MeetingInsightType =
  | "problem"
  | "solution"
  | "decision"
  | "task"
  | "question"
  | "idea"
  | "note";

/**
 * Durable synthesized meeting insight record.
 * Backed by transcript segment IDs for attribution and provenance.
 */
export type MeetingInsightRecord = {
  /** Deterministic identifier (FNV-1a 53-bit hash string from Phase 12.6.3) */
  id: string;
  /** Scoped meeting session identifier */
  meetingId: MeetingId;
  /** Semantic classification */
  type: MeetingInsightType;
  /** Insight title */
  title: string;
  /** Explanatory summary or rationale */
  summary: string;
  /** Source transcript segment IDs backing this insight */
  sourceSegmentIds: string[];
  /** Speaker IDs responsible for the utterances */
  speakerIds: string[];
  /** Timestamp when insight occurred */
  timestamp: EpochMsTimestamp;
  /** Optional confidence score (0..1) */
  confidence?: number;
  /** Record creation timestamp */
  createdAt: IsoTimestampString;
};

/**
 * Request DTO for recording meeting start.
 */
export type CreateMeetingRequest = {
  meetingId: MeetingId;
  workspaceId: WorkspaceId;
  title?: string;
  createdBy?: UserId;
};

/**
 * Response DTO after meeting start recorded.
 */
export type CreateMeetingResponse = {
  meeting: MeetingRecord;
};

/**
 * Request DTO for marking meeting ended.
 */
export type EndMeetingRequest = {
  meetingId: MeetingId;
  workspaceId?: WorkspaceId;
  title?: string;
  endedAt?: IsoTimestampString;
};

/**
 * Response DTO after meeting ended.
 */
export type EndMeetingResponse = {
  meeting: MeetingRecord;
};

/**
 * Request DTO for appending finalized transcript segments.
 */
export type PersistTranscriptSegmentsRequest = {
  meetingId: MeetingId;
  segments: MeetingTranscriptSegmentRecord[];
};

/**
 * Response DTO after transcript segments persisted.
 */
export type PersistTranscriptSegmentsResponse = {
  persistedCount: number;
};

/**
 * Request DTO for storing synthesized meeting insights.
 */
export type PersistMeetingInsightsRequest = {
  meetingId: MeetingId;
  insights: MeetingInsightRecord[];
};

/**
 * Response DTO after insights persisted.
 */
export type PersistMeetingInsightsResponse = {
  persistedCount: number;
};

/**
 * Response DTO for listing historical meetings in a workspace.
 */
export type MeetingHistoryResponse = {
  meetings: MeetingRecord[];
  totalCount: number;
};
