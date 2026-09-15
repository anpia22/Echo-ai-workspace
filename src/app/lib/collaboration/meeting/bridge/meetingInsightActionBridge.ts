/**
 * Phase 12.6.4 — Meeting Insight Action Bridge
 *
 * Provides batch orchestration and diagnostic collection for mapping
 * MeetingInsight objects into CanvasAction objects.
 *
 * STRICT INVARIANTS:
 * - NO direct CanvasState mutations (never calls applyCanvasActions, setCanvas, etc.).
 * - Meeting isolation: strictly establishes authoritative meetingId and checks consistency.
 * - Zero mutable global state, zero singleton caches.
 * - Pure diagnostic collection (diagnostics + mapped actions).
 */

import type { CanvasAction } from "../../../applyCanvasActions";
import type { MeetingInsight } from "../analysis/meetingAnalysisTypes";
import {
  type InsightActionBridgeDiagnostic,
  type MeetingInsightActionBridgeResult,
} from "./meetingInsightActionTypes";
import { mapMeetingInsightToAction } from "./meetingInsightActionMapper";

/**
 * Bridges an array of MeetingInsight objects into CanvasAction objects with
 * structured diagnostics and meeting isolation enforcement.
 *
 * @param insights Array of MeetingInsight objects to bridge.
 * @param expectedMeetingId Optional expected meetingId to enforce strict room boundary.
 */
export function bridgeMeetingInsights(
  insights: MeetingInsight[],
  expectedMeetingId?: string
): MeetingInsightActionBridgeResult {
  if (!Array.isArray(insights)) {
    return {
      meetingId: typeof expectedMeetingId === "string" ? expectedMeetingId.trim() : "",
      actions: [],
      mappedCount: 0,
      skippedCount: 0,
      diagnostics: [
        {
          code: "INVALID_INPUT",
          message: "Invalid input: insights must be an array",
        },
      ],
    };
  }

  // If expectedMeetingId is provided, it must be a non-empty string
  let authoritativeMeetingId = "";
  if (expectedMeetingId !== undefined) {
    if (typeof expectedMeetingId !== "string" || expectedMeetingId.trim() === "") {
      return {
        meetingId: "",
        actions: [],
        mappedCount: 0,
        skippedCount: insights.length,
        diagnostics: [
          {
            code: "INVALID_INPUT",
            message: "expectedMeetingId must be a non-empty string when provided",
            field: "expectedMeetingId",
          },
        ],
      };
    }
    authoritativeMeetingId = expectedMeetingId.trim();
  } else {
    // Establish authoritative meeting ID from the first valid meetingId in the batch
    for (const ins of insights) {
      if (
        ins &&
        typeof ins === "object" &&
        typeof ins.meetingId === "string" &&
        ins.meetingId.trim() !== ""
      ) {
        authoritativeMeetingId = ins.meetingId.trim();
        break;
      }
    }
  }

  if (insights.length === 0) {
    return {
      meetingId: authoritativeMeetingId,
      actions: [],
      mappedCount: 0,
      skippedCount: 0,
      diagnostics: [],
    };
  }

  const actions: CanvasAction[] = [];
  const diagnostics: InsightActionBridgeDiagnostic[] = [];
  let mappedCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < insights.length; i++) {
    const insight = insights[i];

    // Enforce meeting isolation if authoritative meeting ID has been established
    if (
      authoritativeMeetingId !== "" &&
      insight &&
      typeof insight === "object" &&
      typeof insight.meetingId === "string" &&
      insight.meetingId.trim() !== ""
    ) {
      if (insight.meetingId.trim() !== authoritativeMeetingId) {
        diagnostics.push({
          code: "INVALID_INPUT",
          message: `Meeting isolation violation at index ${i}: insight belongs to meeting '${insight.meetingId}', expected '${authoritativeMeetingId}'`,
          insightId: insight.id,
          field: "meetingId",
        });
        skippedCount++;
        continue;
      }
    }

    const result = mapMeetingInsightToAction(insight);

    if (result.success) {
      actions.push(result.action);
      mappedCount++;
    } else {
      diagnostics.push(result.error);
      skippedCount++;
    }
  }

  return {
    meetingId: authoritativeMeetingId,
    actions,
    mappedCount,
    skippedCount,
    diagnostics,
  };
}
