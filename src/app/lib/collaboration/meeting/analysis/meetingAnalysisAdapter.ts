/**
 * Phase 12.6.3 - Meeting Analysis Adapter Abstraction & Deterministic Mock
 *
 * Implements the base analysis adapter and a production-grade deterministic mock adapter
 * that extracts structured insights with full source segment provenance.
 *
 * STRICT INVARIANTS:
 * - NO CanvasState or ReactFlow integration.
 * - NO LLM vendor SDK imports.
 * - Snapshot-based analysis: does not mutate context or maintain a second transcript store.
 * - Real provenance: sourceSegmentIds maps directly to transcript messages in the context.
 * - Deterministic IDs: identical inputs produce identical insight IDs.
 */

import type { MeetingConversationContext } from "../conversation/meetingConversationTypes";
import { generateDeterministicInsightId } from "./meetingAnalysis";
import type {
  AnalysisError,
  AnalysisErrorCode,
  AnalysisLifecycleState,
  MeetingAnalysisAdapter,
  MeetingAnalysisResult,
  MeetingInsight,
} from "./meetingAnalysisTypes";

/**
 * Abstract base class managing lifecycle states, error dispatch,
 * and listener registration for analysis adapters.
 */
export abstract class BaseMeetingAnalysisAdapter
  implements MeetingAnalysisAdapter
{
  public abstract readonly name: string;

  protected state: AnalysisLifecycleState = "idle";
  private errorListeners: Set<(error: AnalysisError) => void> = new Set();
  private stateListeners: Set<(state: AnalysisLifecycleState) => void> =
    new Set();

  public getState(): AnalysisLifecycleState {
    return this.state;
  }

  public abstract analyze(
    context: MeetingConversationContext
  ): Promise<MeetingAnalysisResult>;

  public onError(listener: (error: AnalysisError) => void): () => void {
    this.errorListeners.add(listener);
    return () => {
      this.errorListeners.delete(listener);
    };
  }

  public onStateChange(
    listener: (state: AnalysisLifecycleState) => void
  ): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  public dispose(): void {
    this.state = "idle";
    this.errorListeners.clear();
    this.stateListeners.clear();
  }

  protected setState(nextState: AnalysisLifecycleState): void {
    if (this.state === nextState) return;
    this.state = nextState;
    for (const listener of this.stateListeners) {
      try {
        listener(nextState);
      } catch (err) {
        console.error(`[${this.name}] State listener error:`, err);
      }
    }
  }

  protected emitError(
    code: AnalysisErrorCode,
    message: string,
    fatal: boolean = false,
    originalError?: unknown
  ): void {
    const error: AnalysisError = {
      code,
      message,
      fatal,
      timestamp: Date.now(),
      originalError,
    };

    if (fatal) {
      this.setState("error");
    }

    for (const listener of this.errorListeners) {
      try {
        listener(error);
      } catch (err) {
        console.error(`[${this.name}] Error listener error:`, err);
      }
    }
  }
}

/**
 * High-fidelity deterministic Mock Analysis Adapter for tests and offline analysis.
 * Analyzes conversation context snapshots and extracts structured insights
 * with verified source segment provenance and deterministic IDs.
 */
export class MockMeetingAnalysisAdapter extends BaseMeetingAnalysisAdapter {
  public readonly name: string = "MockMeetingAnalysisAdapter";

  private injectedError: { code: AnalysisErrorCode; message: string } | null =
    null;
  private customInsights: MeetingInsight[] | null = null;

  public async analyze(
    context: MeetingConversationContext
  ): Promise<MeetingAnalysisResult> {
    // 1. Strict context structure validation
    if (
      !context ||
      typeof context !== "object" ||
      typeof context.meetingId !== "string" ||
      context.meetingId.trim() === ""
    ) {
      this.emitError(
        "INVALID_INPUT",
        "Invalid conversation context: meetingId must be a non-empty string",
        true
      );
      throw new Error(
        "Invalid conversation context: meetingId must be a non-empty string"
      );
    }

    if (!Array.isArray(context.messages)) {
      this.emitError(
        "INVALID_INPUT",
        "Invalid conversation context: messages must be an array",
        true
      );
      throw new Error(
        "Invalid conversation context: messages must be an array"
      );
    }

    // Check for simulated injected error
    if (this.injectedError) {
      this.emitError(this.injectedError.code, this.injectedError.message, true);
      throw new Error(this.injectedError.message);
    }

    const messages = context.messages;
    const meetingId = context.meetingId.trim();

    // 2. Strict provenance and field validation on all messages upfront
    const validSegmentIds = new Set<string>();
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (!msg || typeof msg !== "object") {
        this.emitError(
          "INVALID_INPUT",
          `Invalid conversation message at index ${i}: message must be an object`,
          true
        );
        throw new Error(
          `Invalid conversation message at index ${i}: message must be an object`
        );
      }

      const segmentId = msg.id ?? msg.segmentId;
      if (
        typeof segmentId !== "string" ||
        segmentId.trim() === ""
      ) {
        this.emitError(
          "INVALID_INPUT",
          `Invalid conversation message: transcript segment ID is required (missing provenance on sequence ${msg.sequence})`,
          true
        );
        throw new Error(
          `Invalid conversation message: transcript segment ID is required (missing provenance on sequence ${msg.sequence})`
        );
      }

      if (
        typeof msg.speakerId !== "string" ||
        msg.speakerId.trim() === ""
      ) {
        this.emitError(
          "INVALID_INPUT",
          `Invalid conversation message: speakerId must be a non-empty string on sequence ${msg.sequence}`,
          true
        );
        throw new Error(
          `Invalid conversation message: speakerId must be a non-empty string on sequence ${msg.sequence}`
        );
      }

      if (typeof msg.text !== "string") {
        this.emitError(
          "INVALID_INPUT",
          `Invalid conversation message: text must be a string on sequence ${msg.sequence}`,
          true
        );
        throw new Error(
          `Invalid conversation message: text must be a string on sequence ${msg.sequence}`
        );
      }

      if (!Number.isFinite(msg.timestamp)) {
        this.emitError(
          "INVALID_INPUT",
          `Invalid conversation message: timestamp must be a finite number on sequence ${msg.sequence}`,
          true
        );
        throw new Error(
          `Invalid conversation message: timestamp must be a finite number on sequence ${msg.sequence}`
        );
      }

      if (!Number.isFinite(msg.sequence)) {
        this.emitError(
          "INVALID_INPUT",
          `Invalid conversation message: sequence must be a finite number on segment ${segmentId}`,
          true
        );
        throw new Error(
          `Invalid conversation message: sequence must be a finite number on segment ${segmentId}`
        );
      }

      validSegmentIds.add(segmentId);
    }

    // 3. If custom mock insights are set, validate their sourceSegmentIds against actual context messages
    if (this.customInsights) {
      for (const ins of this.customInsights) {
        if (
          !Array.isArray(ins.sourceSegmentIds) ||
          ins.sourceSegmentIds.length === 0
        ) {
          this.emitError(
            "INVALID_INPUT",
            `Custom mock insight '${ins.id}' has empty sourceSegmentIds`,
            true
          );
          throw new Error(
            `Custom mock insight '${ins.id}' has empty sourceSegmentIds`
          );
        }
        for (const segId of ins.sourceSegmentIds) {
          if (!validSegmentIds.has(segId)) {
            this.emitError(
              "INVALID_INPUT",
              `Custom mock insight '${ins.id}' references non-existent segment ID '${segId}'`,
              true
            );
            throw new Error(
              `Custom mock insight '${ins.id}' references non-existent segment ID '${segId}'`
            );
          }
        }
      }
    }

    this.setState("analyzing");

    try {
      // Handle empty conversation snapshot (valid empty array [])
      if (messages.length === 0) {
        this.setState("ready");
        return {
          meetingId,
          insights: [],
          // Fixed epoch timestamp intentionally used by mock for deterministic repeatability across tests
          analyzedAt: 1700000000000,
          sourceMessageCount: 0,
        };
      }

      // If custom mock insights are set, return them with meetingId bound and cloned arrays
      if (this.customInsights) {
        this.setState("ready");
        return {
          meetingId,
          insights: this.customInsights.map((ins) => ({
            ...ins,
            meetingId,
            sourceSegmentIds: [...ins.sourceSegmentIds],
            speakerIds: [...ins.speakerIds],
          })),
          // Fixed epoch timestamp intentionally used by mock for deterministic repeatability across tests
          analyzedAt: 1700000000000,
          sourceMessageCount: messages.length,
        };
      }

      // Deterministic rule-based extraction from context utterances
      const extractedInsights: MeetingInsight[] = [];

      for (const msg of messages) {
        const text = msg.text.trim();
        const lower = text.toLowerCase();
        // Strict provenance: genuine segment ID from context (no guessing or fallback)
        const segmentId = (msg.id ?? msg.segmentId) as string;
        const sourceSegmentIds = [segmentId];
        const speakerIds = [msg.speakerId];
        const timestamp = msg.timestamp;

        // Problem insight
        if (
          lower.includes("problem") ||
          lower.includes("issue") ||
          lower.includes("bug") ||
          lower.includes("lead quality problem")
        ) {
          const title = lower.includes("lead quality")
            ? "Lead quality problem"
            : `Issue: ${text.slice(0, 40)}`;
          const id = generateDeterministicInsightId(
            meetingId,
            "problem",
            title,
            sourceSegmentIds
          );
          extractedInsights.push({
            id,
            meetingId,
            type: "problem",
            title,
            summary: text,
            sourceSegmentIds,
            speakerIds,
            confidence: 0.95,
            timestamp,
          });
        }

        // Solution insight
        if (
          (lower.includes("solution") ||
            lower.includes("stricter verification") ||
            (lower.includes("verification") && !lower.includes("improve")) ||
            lower.includes("fix")) &&
          !lower.includes("will improve")
        ) {
          const title = lower.includes("stricter verification")
            ? "Stricter verification"
            : `Solution: ${text.slice(0, 40)}`;
          const id = generateDeterministicInsightId(
            meetingId,
            "solution",
            title,
            sourceSegmentIds
          );
          extractedInsights.push({
            id,
            meetingId,
            type: "solution",
            title,
            summary: text,
            sourceSegmentIds,
            speakerIds,
            confidence: 0.9,
            timestamp,
          });
        }

        // Task insight
        if (
          lower.includes("will improve") ||
          lower.includes("improve the verification") ||
          lower.includes("todo") ||
          lower.includes("task")
        ) {
          const title = lower.includes("verification")
            ? "Improve the verification flow"
            : `Task: ${text.slice(0, 40)}`;
          const id = generateDeterministicInsightId(
            meetingId,
            "task",
            title,
            sourceSegmentIds
          );
          extractedInsights.push({
            id,
            meetingId,
            type: "task",
            title,
            summary: text,
            sourceSegmentIds,
            speakerIds,
            confidence: 0.92,
            timestamp,
          });
        }

        // Decision insight
        if (
          lower.includes("decided") ||
          lower.includes("agreed") ||
          lower.includes("decision")
        ) {
          const title = `Decision: ${text.slice(0, 40)}`;
          const id = generateDeterministicInsightId(
            meetingId,
            "decision",
            title,
            sourceSegmentIds
          );
          extractedInsights.push({
            id,
            meetingId,
            type: "decision",
            title,
            summary: text,
            sourceSegmentIds,
            speakerIds,
            confidence: 0.94,
            timestamp,
          });
        }

        // Question insight
        if (text.endsWith("?") || lower.includes("should we")) {
          const title = lower.includes("marketplace pricing")
            ? "Should we change marketplace pricing?"
            : `Question: ${text.slice(0, 40)}`;
          const id = generateDeterministicInsightId(
            meetingId,
            "question",
            title,
            sourceSegmentIds
          );
          extractedInsights.push({
            id,
            meetingId,
            type: "question",
            title,
            summary: text,
            sourceSegmentIds,
            speakerIds,
            confidence: 0.88,
            timestamp,
          });
        }

        // Idea insight
        if (
          lower.includes("idea") ||
          lower.includes("proposal") ||
          lower.includes("what if")
        ) {
          const title = `Idea: ${text.slice(0, 40)}`;
          const id = generateDeterministicInsightId(
            meetingId,
            "idea",
            title,
            sourceSegmentIds
          );
          extractedInsights.push({
            id,
            meetingId,
            type: "idea",
            title,
            summary: text,
            sourceSegmentIds,
            speakerIds,
            confidence: 0.85,
            timestamp,
          });
        }
      }

      this.setState("ready");

      return {
        meetingId,
        insights: extractedInsights,
        analyzedAt: 1700000000000,
        sourceMessageCount: messages.length,
      };
    } catch (err) {
      if (this.state !== "error") {
        this.emitError(
          "INVALID_RESPONSE",
          err instanceof Error ? err.message : "Analysis failure",
          true,
          err
        );
      }
      throw err;
    }
  }

  /**
   * Test helper to inject an error on the next analyze call.
   */
  public simulateError(code: AnalysisErrorCode, message: string): void {
    this.injectedError = { code, message };
  }

  /**
   * Test helper to clear any injected error.
   */
  public clearInjectedError(): void {
    this.injectedError = null;
  }

  /**
   * Test helper to set explicit custom insights.
   */
  public setMockInsights(insights: MeetingInsight[] | null): void {
    this.customInsights = insights
      ? insights.map((ins) => ({
          ...ins,
          sourceSegmentIds: [...ins.sourceSegmentIds],
          speakerIds: [...ins.speakerIds],
        }))
      : null;
  }
}
