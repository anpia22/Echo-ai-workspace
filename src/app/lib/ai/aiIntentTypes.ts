/**
 * Phase 14.4 — Temporal & Historical Intent Classification: Types & Contracts
 *
 * Explicit TypeScript models for classifying user intent into structured
 * temporal and historical categories before context retrieval.
 */

export type AIContextIntentType =
  | "CURRENT_CONTEXT"
  | "RECENT_CONVERSATION"
  | "HISTORICAL_MEETING"
  | "HISTORICAL_CONVERSATION"
  | "HISTORICAL_TOPIC";

export type TemporalReferenceType =
  | "LAST_MEETING"
  | "PREVIOUS_MEETING"
  | "MEETING_OFFSET"
  | "LAST_FEW_MEETINGS"
  | "RECENT_MEETINGS"
  | "PREVIOUS_CONVERSATIONS"
  | "RECENT_CONVERSATION"
  | "TIME_WINDOW";

export type TemporalReference = {
  type: TemporalReferenceType;
  rawText: string;
  offset?: number;
  windowDays?: number;
};

export type ClassifiedIntent = {
  intent: AIContextIntentType;
  temporalReference?: TemporalReference;
  topic?: string;
  confidence: number;
  reason?: string;
};

export type HistoricalSelectionResult = {
  matched: boolean;
  meetingId?: string;
  meetingTitle?: string;
  conversationId?: string;
  topic?: string;
  offset?: number;
  reason?: string;
};
