/**
 * Phase 12.6.4 — Meeting Insight to Canvas Action Mapper
 *
 * Implements pure conversion from MeetingInsight to CanvasAction.
 *
 * STRICT INVARIANTS:
 * - Pure functions only: NO Date.now(), NO Math.random(), NO crypto.randomUUID().
 * - Deep immutability: clones all array metadata.
 * - Deep validation of array elements (sourceSegmentIds, speakerIds) and confidence bounds.
 * - Respects Phase 8 node types: 'note' is explicitly unsupported (no fake coercion).
 * - Zero direct CanvasState mutations.
 */

import type { CanvasAction } from "../../../applyCanvasActions";
import type { MeetingInsight } from "../analysis/meetingAnalysisTypes";
import {
  SUPPORTED_CANVAS_NODE_TYPES,
  type SupportedCanvasNodeType,
  type InsightActionBridgeDiagnostic,
  type SingleInsightMappingResult,
} from "./meetingInsightActionTypes";

/**
 * Performs deep semantic validation of a MeetingInsight.
 * Returns null if valid, or a structured diagnostic if invalid.
 */
export function validateMeetingInsight(
  candidate: unknown
): InsightActionBridgeDiagnostic | null {
  if (!candidate || typeof candidate !== "object") {
    return {
      code: "INVALID_INPUT",
      message: "Meeting insight must be a non-null object",
    };
  }

  const ins = candidate as Partial<MeetingInsight>;

  if (typeof ins.meetingId !== "string" || ins.meetingId.trim() === "") {
    return {
      code: "INVALID_INPUT",
      message: "insight.meetingId must be a non-empty string",
      field: "meetingId",
    };
  }

  if (typeof ins.id !== "string" || ins.id.trim() === "") {
    return {
      code: "INVALID_INPUT",
      message: "insight.id must be a non-empty string",
      field: "id",
    };
  }

  if (typeof ins.type !== "string" || ins.type.trim() === "") {
    return {
      code: "INVALID_INPUT",
      message: "insight.type must be a non-empty string",
      insightId: ins.id,
      field: "type",
    };
  }

  if (typeof ins.title !== "string" || ins.title.trim() === "") {
    return {
      code: "INVALID_INPUT",
      message: "insight.title must be a non-empty string",
      insightId: ins.id,
      field: "title",
    };
  }

  if (typeof ins.summary !== "string") {
    return {
      code: "INVALID_INPUT",
      message: "insight.summary must be a string",
      insightId: ins.id,
      field: "summary",
    };
  }

  if (!Array.isArray(ins.sourceSegmentIds)) {
    return {
      code: "INVALID_INPUT",
      message: "insight.sourceSegmentIds must be an array",
      insightId: ins.id,
      field: "sourceSegmentIds",
    };
  }

  for (let i = 0; i < ins.sourceSegmentIds.length; i++) {
    const segId = ins.sourceSegmentIds[i];
    if (typeof segId !== "string" || segId.trim() === "") {
      return {
        code: "INVALID_INPUT",
        message: `insight.sourceSegmentIds[${i}] must be a non-empty string`,
        insightId: ins.id,
        field: `sourceSegmentIds[${i}]`,
      };
    }
  }

  if (!Array.isArray(ins.speakerIds)) {
    return {
      code: "INVALID_INPUT",
      message: "insight.speakerIds must be an array",
      insightId: ins.id,
      field: "speakerIds",
    };
  }

  for (let i = 0; i < ins.speakerIds.length; i++) {
    const spkId = ins.speakerIds[i];
    if (typeof spkId !== "string" || spkId.trim() === "") {
      return {
        code: "INVALID_INPUT",
        message: `insight.speakerIds[${i}] must be a non-empty string`,
        insightId: ins.id,
        field: `speakerIds[${i}]`,
      };
    }
  }

  if (ins.confidence !== undefined) {
    if (
      !Number.isFinite(ins.confidence) ||
      ins.confidence < 0 ||
      ins.confidence > 1
    ) {
      return {
        code: "INVALID_INPUT",
        message: `insight.confidence must be a finite number between 0 and 1 (received ${ins.confidence})`,
        insightId: ins.id,
        field: "confidence",
      };
    }
  }

  if (ins.timestamp !== undefined && !Number.isFinite(ins.timestamp)) {
    return {
      code: "INVALID_INPUT",
      message: "insight.timestamp must be a finite number",
      insightId: ins.id,
      field: "timestamp",
    };
  }

  return null;
}

/**
 * Pure mapping of a single MeetingInsight to a CanvasAction.
 *
 * Supported insight types: problem, solution, decision, task, question, idea.
 * 'note' returns UNSUPPORTED_TYPE because Phase 8 has no native note node.
 */
export function mapMeetingInsightToAction(
  insight: MeetingInsight
): SingleInsightMappingResult {
  const validationError = validateMeetingInsight(insight);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const type = insight.type.trim().toLowerCase();

  if (type === "note") {
    return {
      success: false,
      error: {
        code: "UNSUPPORTED_TYPE",
        message:
          "Phase 8 canvas does not have a native 'note' node type; note insights cannot be safely mapped",
        insightId: insight.id,
        field: "type",
      },
    };
  }

  if (!SUPPORTED_CANVAS_NODE_TYPES.includes(type as SupportedCanvasNodeType)) {
    return {
      success: false,
      error: {
        code: "UNSUPPORTED_TYPE",
        message: `Unsupported insight type '${insight.type}' for canvas node mapping`,
        insightId: insight.id,
        field: "type",
      },
    };
  }

  const action: CanvasAction = {
    type: "CREATE_NODE",
    nodeType: type,
    title: insight.title.trim(),
    description: insight.summary,
    metadata: {
      source: "meeting",
      meetingId: insight.meetingId.trim(),
      insightId: insight.id.trim(),
      sourceSegmentIds: [...insight.sourceSegmentIds],
      speakerIds: [...insight.speakerIds],
      ...(typeof insight.confidence === "number"
        ? { confidence: insight.confidence }
        : {}),
    },
  };

  return { success: true, action };
}

/**
 * Strict batch conversion of MeetingInsight[] to CanvasAction[].
 *
 * Throws an Error on invalid input.
 * Skips unsupported insight types (like 'note') and returns all successfully mapped actions.
 */
export function mapMeetingInsightsToActions(
  insights: MeetingInsight[]
): CanvasAction[] {
  if (!Array.isArray(insights)) {
    throw new Error("Invalid input: insights must be an array");
  }

  const actions: CanvasAction[] = [];

  for (let i = 0; i < insights.length; i++) {
    const result = mapMeetingInsightToAction(insights[i]);
    if (!result.success) {
      if (result.error.code === "INVALID_INPUT") {
        throw new Error(
          `Invalid meeting insight at index ${i}: ${result.error.message}`
        );
      }
      // UNSUPPORTED_TYPE is skipped in strict mapper
      continue;
    }
    actions.push(result.action);
  }

  return actions;
}
