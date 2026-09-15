/**
 * Phase 12.6.3 - AI Meeting Analysis: Types & Contracts
 *
 * Defines the provider-agnostic boundary between finalized meeting conversation data
 * and structured domain-level meeting insights.
 *
 * STRICT INVARIANTS:
 * - NO CanvasState, ReactFlow, or UI dependencies.
 * - NO canvas action types (CREATE_NODE, UPDATE_NODE, etc.).
 * - NO LLM vendor SDK imports (OpenAI, NVIDIA, Gemini, Anthropic).
 * - Insights represent pure domain-level meeting intelligence.
 */

import type { MeetingConversationContext } from "../conversation/meetingConversationTypes";

/**
 * Supported domain insight categories.
 */
export type InsightType =
  | "problem"
  | "solution"
  | "decision"
  | "task"
  | "question"
  | "idea"
  | "note";

/**
 * Domain-level structured meeting insight.
 * Points back to actual transcript segment IDs for provenance and attribution.
 */
export type MeetingInsight = {
  /** Deterministic identifier derived from content & source provenance */
  id: string;
  /** Scoped meeting session ID */
  meetingId: string;
  /** Semantic classification of the insight */
  type: InsightType;
  /** Concise insight title */
  title: string;
  /** Explanatory summary or rationale */
  summary: string;
  /** Array of source transcript segment IDs backing this insight */
  sourceSegmentIds: string[];
  /** Array of speaker IDs responsible for the source utterances */
  speakerIds: string[];
  /** Optional confidence score (0..1) */
  confidence?: number;
  /** Timestamp when the insight occurred or was synthesized */
  timestamp: number;
};

/**
 * Lifecycle states of the analysis adapter.
 */
export type AnalysisLifecycleState =
  | "idle"
  | "analyzing"
  | "ready"
  | "error";

/**
 * Normalized provider-neutral analysis error codes.
 */
export type AnalysisErrorCode =
  | "INVALID_INPUT"
  | "NOT_CONFIGURED"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "ABORTED"
  | "INVALID_RESPONSE"
  | "UNKNOWN";

/**
 * Normalized analysis error.
 */
export type AnalysisError = {
  code: AnalysisErrorCode;
  message: string;
  fatal: boolean;
  timestamp: number;
  originalError?: unknown;
};

/**
 * Snapshot-based analysis result containing synthesized meeting insights.
 */
export type MeetingAnalysisResult = {
  meetingId: string;
  insights: MeetingInsight[];
  analyzedAt: number;
  sourceMessageCount: number;
};

/**
 * Provider-agnostic contract that all meeting analysis adapters must implement.
 */
export interface MeetingAnalysisAdapter {
  /** Descriptive name of the adapter implementation */
  readonly name: string;

  /** Current lifecycle state */
  getState(): AnalysisLifecycleState;

  /**
   * Analyzes a finalized meeting conversation context snapshot
   * and returns structured domain insights.
   */
  analyze(context: MeetingConversationContext): Promise<MeetingAnalysisResult>;

  /** Registers a listener for analysis errors */
  onError(listener: (error: AnalysisError) => void): () => void;

  /** Registers a listener for lifecycle state transitions */
  onStateChange(listener: (state: AnalysisLifecycleState) => void): () => void;

  /** Disposes the adapter and detaches all active listeners */
  dispose(): void;
}
