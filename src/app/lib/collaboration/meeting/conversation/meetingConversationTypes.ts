/**
 * Phase 12.6.1 - AI Meeting Integration: Transcript/Data Contracts
 *
 * Pure domain contracts and types for meeting transcripts, speaker attribution,
 * interim/final transcript states, and deterministic ordering.
 *
 * STRICT INVARIANTS:
 * - CanvasState is NOT referenced or mutated here.
 * - No AI model, system prompt, or STT provider SDK dependencies.
 * - No WebRTC internals or UI components imported.
 */

export type TranscriptStatus = "interim" | "final";

export type TranscriptSource = "meeting";

/**
 * Fundamental transcript segment contract representing an utterance in a meeting.
 */
export type MeetingTranscriptSegment = {
  /** Unique identifier for the transcript segment */
  id: string;
  /** Meeting/session identifier for strict meeting isolation */
  meetingId: string;
  /** User/Participant ID of the speaker */
  speakerId: string;
  /** Display name of the speaker at the time of utterance */
  speakerName: string;
  /** Transcribed text content */
  text: string;
  /** Epoch timestamp (ms) of the utterance occurrence */
  timestamp: number;
  /**
   * Deterministic monotonically increasing sequence number per meeting.
   * Assigned strictly upon finalization (1, 2, 3...).
   * For interim segments, this is -1 (unassigned).
   */
  sequence: number;
  /** Interim (in-flight) or Final (immutable) */
  status: TranscriptStatus;
  /** Optional language tag (e.g. 'en-US') */
  language?: string;
  /** Source tag for provenance */
  source: TranscriptSource;
  /** Timestamp (ms) when record was initially created */
  createdAt: number;
  /** Timestamp (ms) when record was last updated */
  updatedAt: number;
};

/**
 * Input for creating or updating a transcript segment.
 */
export type UpsertSegmentInput = {
  id: string;
  meetingId: string;
  speakerId: string;
  speakerName: string;
  text: string;
  timestamp?: number;
  status: TranscriptStatus;
  language?: string;
};

/**
 * Complete immutable snapshot of conversation state for a meeting.
 */
export type MeetingConversationSnapshot = {
  meetingId: string;
  /** Finalized segments sorted deterministically by sequence ASC */
  segments: MeetingTranscriptSegment[];
  /** Active interim segments currently in-flight */
  interimSegments: MeetingTranscriptSegment[];
  /** Highest sequence number assigned to a finalized segment */
  lastSequence: number;
};

/**
 * Minimal structured message representation for downstream consumption.
 */
export type FormattedMeetingMessage = {
  /** Underlying transcript segment ID */
  id?: string;
  /** Explicit alias for segment ID */
  segmentId?: string;
  speakerId: string;
  speakerName: string;
  text: string;
  timestamp: number;
  sequence: number;
};

/**
 * High-level conversation context payload for future adapters.
 */
export type MeetingConversationContext = {
  meetingId: string;
  formattedTranscript: string;
  messages: FormattedMeetingMessage[];
  startTime: number | null;
  endTime: number | null;
  participantIds: string[];
};

/**
 * Listener invoked when a transcript segment is added, updated, or finalized.
 */
export type MeetingTranscriptListener = (
  segment: MeetingTranscriptSegment,
  snapshot: MeetingConversationSnapshot
) => void;
