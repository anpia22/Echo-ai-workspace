/**
 * Phase 12.6.4 — Meeting Insight to Canvas Action Bridge Types
 *
 * Defines pure contracts for transforming Phase 12.6.3 MeetingInsight objects
 * into Phase 8 CanvasAction objects.
 *
 * STRICT INVARIANTS:
 * - Reuses canonical CanvasAction and CanvasActionMetadata from applyCanvasActions.
 * - Supported node types strictly match Phase 8 schema (no fake note node type).
 * - Independent from React, ReactFlow, WebRTC, STT, and LLM SDKs.
 */

import type { CanvasAction, CanvasActionMetadata } from "../../../applyCanvasActions";

export type { CanvasAction, CanvasActionMetadata };

/**
 * Supported Canvas Node types corresponding directly to Phase 8 schema.
 * Note: 'note' is NOT a native node type in Phase 8 and is handled as unsupported.
 */
export const SUPPORTED_CANVAS_NODE_TYPES = [
  "problem",
  "solution",
  "decision",
  "task",
  "question",
  "idea",
] as const;

export type SupportedCanvasNodeType = (typeof SUPPORTED_CANVAS_NODE_TYPES)[number];

export type InsightActionBridgeErrorCode = "INVALID_INPUT" | "UNSUPPORTED_TYPE";

export interface InsightActionBridgeDiagnostic {
  code: InsightActionBridgeErrorCode;
  message: string;
  insightId?: string;
  field?: string;
}

export interface MeetingInsightActionMapping {
  insightId: string;
  actions: CanvasAction[];
}

export interface MeetingInsightActionBridgeResult {
  meetingId: string;
  actions: CanvasAction[];
  mappedCount: number;
  skippedCount: number;
  diagnostics: InsightActionBridgeDiagnostic[];
}

export type SingleInsightMappingResult =
  | { success: true; action: CanvasAction }
  | { success: false; error: InsightActionBridgeDiagnostic };
