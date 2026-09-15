/**
 * Phase 12.6.1 - Meeting Conversation Utilities & Helpers
 *
 * Provides factory methods and minimal data transformers for meeting transcripts.
 *
 * STRICT INVARIANTS:
 * - NO AI model, system prompt, or tokenization logic.
 * - NO CanvasState or ReactFlow integration.
 * - Simple pure data formatting only: transforms finalized segments to '[Speaker]: text'.
 */

import { MeetingConversationStore } from "./meetingConversationStore";
import type {
  FormattedMeetingMessage,
  MeetingConversationContext,
  MeetingTranscriptSegment,
} from "./meetingConversationTypes";

/**
 * Factory for creating a scoped MeetingConversationStore.
 */
export function createMeetingConversationStore(
  meetingId: string
): MeetingConversationStore {
  return new MeetingConversationStore(meetingId);
}

/**
 * Formats a list of finalized transcript segments into a clean, human-readable
 * speaker-attributed text block for future AI consumption.
 *
 * Example output:
 *   [Alice]: We need to review the architecture.
 *   [Bob]: Let's make sure the database is indexed.
 */
export function formatTranscriptForAI(
  segments: MeetingTranscriptSegment[]
): string {
  if (!Array.isArray(segments) || segments.length === 0) {
    return "";
  }

  return segments
    .filter((segment) => segment.status === "final" && segment.text.trim().length > 0)
    .sort((a, b) => a.sequence - b.sequence)
    .map((segment) => `[${segment.speakerName}]: ${segment.text.trim()}`)
    .join("\n");
}

/**
 * Builds a structured, high-level context representation of the meeting's conversation
 * without invoking any LLMs or external services.
 */
export function buildMeetingConversationContext(
  store: MeetingConversationStore
): MeetingConversationContext {
  const snapshot = store.getSnapshot();
  const finalized = snapshot.segments;

  const messages: FormattedMeetingMessage[] = finalized.map((segment) => ({
    id: segment.id,
    segmentId: segment.id,
    speakerId: segment.speakerId,
    speakerName: segment.speakerName,
    text: segment.text,
    timestamp: segment.timestamp,
    sequence: segment.sequence,
  }));

  const participantIdSet = new Set<string>();
  let minTime: number | null = null;
  let maxTime: number | null = null;

  for (const segment of finalized) {
    participantIdSet.add(segment.speakerId);
    if (minTime === null || segment.timestamp < minTime) {
      minTime = segment.timestamp;
    }
    if (maxTime === null || segment.timestamp > maxTime) {
      maxTime = segment.timestamp;
    }
  }

  return {
    meetingId: store.getMeetingId(),
    formattedTranscript: formatTranscriptForAI(finalized),
    messages,
    startTime: minTime,
    endTime: maxTime,
    participantIds: Array.from(participantIdSet),
  };
}
