/**
 * Phase 14.4 — Temporal & Historical Intent Classifier
 *
 * Deterministic classifier that inspects user queries to identify:
 * 1. Intent category (CURRENT_CONTEXT, RECENT_CONVERSATION, HISTORICAL_MEETING,
 *    HISTORICAL_CONVERSATION, HISTORICAL_TOPIC)
 * 2. Normalized temporal references (e.g. offset, last meeting, last week)
 * 3. Topic extraction for historical search
 *
 * CRITICAL INVARIANTS:
 * - Pure function: no database queries, no side-effects, no embedding models.
 * - Deterministic output.
 * - Conservative topic extraction; cleans leading articles and trailing punctuation.
 * - Safe fallback to CURRENT_CONTEXT on ambiguous or unknown inputs.
 */

import type {
  ClassifiedIntent,
  TemporalReference,
} from "./aiIntentTypes";

const NUMBER_WORD_MAP: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

function parseNumberWordOrDigits(text: string): number | undefined {
  const clean = text.trim().toLowerCase();
  if (/^\d+$/.test(clean)) {
    return parseInt(clean, 10);
  }
  return NUMBER_WORD_MAP[clean];
}

/**
 * Extracts a normalized topic string from a query.
 * Matches patterns like "regarding <topic>", "about <topic>", "on <topic>".
 */
export function extractTopic(query: string): string | undefined {
  const normalized = query.trim().replace(/[?.!,]+$/, "");

  // Priority 1: "regarding <topic>"
  const regardingMatch = normalized.match(/\bregarding\s+([a-zA-Z0-9_\-\s]+)$/i);
  if (regardingMatch?.[1]) {
    return cleanTopicString(regardingMatch[1]);
  }

  // Priority 2: "about <topic>"
  const aboutMatch = normalized.match(/\babout\s+([a-zA-Z0-9_\-\s]+)$/i);
  if (aboutMatch?.[1]) {
    return cleanTopicString(aboutMatch[1]);
  }

  // Priority 3: "on <topic>" following discuss/decide/talk
  const onMatch = normalized.match(/\b(?:discuss(?:ed)?|decid(?:ed)?|talk(?:ed)?)\s+on\s+([a-zA-Z0-9_\-\s]+)$/i);
  if (onMatch?.[1]) {
    return cleanTopicString(onMatch[1]);
  }

  return undefined;
}

function cleanTopicString(raw: string): string | undefined {
  let cleaned = raw.trim();
  // Strip leading articles
  cleaned = cleaned.replace(/^(?:the|a|an|our|their|this|that)\s+/i, "");
  // Strip trailing punctuation or temporal references
  cleaned = cleaned.replace(/[?.!,]+$/, "").trim();

  // If the extracted topic is too long (e.g. over 6 words) or empty, discard
  if (!cleaned || cleaned.split(/\s+/).length > 6) {
    return undefined;
  }
  return cleaned.toLowerCase();
}

/**
 * Detects whether the query is an active canvas modification command.
 */
function isCanvasCommand(query: string): boolean {
  const lower = query.trim().toLowerCase();

  // Imperative action verbs targeting canvas elements
  const actionPrefixes = [
    /^create\s+(?:a\s+)?(?:node|edge|relationship|card|box|group)/i,
    /^add\s+(?:a\s+)?(?:node|edge|relationship|solution|problem|decision|task|question|idea)/i,
    /^move\s+(?:this|that|the|node)/i,
    /^delete\s+(?:this|that|the|node|edge)/i,
    /^remove\s+(?:this|that|the|node|edge)/i,
    /^update\s+(?:this|that|the|node)/i,
    /^rename\s+(?:this|that|the|node)/i,
    /^group\s+(?:these|the|nodes)/i,
    /^connect\s+/i,
    /^link\s+/i,
  ];

  return actionPrefixes.some((regex) => regex.test(lower));
}

/**
 * Parses deterministic temporal references from query.
 */
export function extractTemporalReference(query: string): TemporalReference | undefined {
  const lower = query.toLowerCase();

  // Pattern: "N meetings ago" (e.g. "three meetings ago", "2 meetings ago")
  const offsetMeetingMatch = lower.match(/\b(\w+|\d+)\s+meetings?\s+ago\b/);
  if (offsetMeetingMatch) {
    const parsedOffset = parseNumberWordOrDigits(offsetMeetingMatch[1]);
    if (parsedOffset && parsedOffset > 0) {
      return {
        type: "MEETING_OFFSET",
        offset: parsedOffset,
        rawText: offsetMeetingMatch[0],
      };
    }
  }

  // Pattern: "last meeting", "latest meeting", "previous meeting"
  const lastMeetingMatch = lower.match(/\b(last|latest|previous)\s+meeting\b/);
  if (lastMeetingMatch) {
    return {
      type: "LAST_MEETING",
      offset: 1,
      rawText: lastMeetingMatch[0],
    };
  }

  // Pattern: "last week('s) meeting"
  const lastWeekMeetingMatch = lower.match(/\blast\s+week(?:'s)?(?:\s+meeting)?\b/);
  if (lastWeekMeetingMatch && lower.includes("meeting")) {
    return {
      type: "TIME_WINDOW",
      windowDays: 7,
      rawText: lastWeekMeetingMatch[0],
    };
  }

  // Pattern: "yesterday('s) meeting"
  const yesterdayMeetingMatch = lower.match(/\byesterday(?:'s)?(?:\s+meeting)?\b/);
  if (yesterdayMeetingMatch && lower.includes("meeting")) {
    return {
      type: "TIME_WINDOW",
      windowDays: 1,
      rawText: yesterdayMeetingMatch[0],
    };
  }

  // Pattern: "last few meetings", "recent meetings"
  const recentMeetingsMatch = lower.match(/\b(last\s+few|recent)\s+meetings\b/);
  if (recentMeetingsMatch) {
    return {
      type: "LAST_FEW_MEETINGS",
      rawText: recentMeetingsMatch[0],
    };
  }

  // Pattern: "previous conversation(s)", "earlier conversation(s)"
  const prevConvMatch = lower.match(/\b(previous|earlier|past)\s+conversations?\b/);
  if (prevConvMatch) {
    return {
      type: "PREVIOUS_CONVERSATIONS",
      rawText: prevConvMatch[0],
    };
  }

  // Pattern: "recent conversation", "recent chat"
  const recentConvMatch = lower.match(/\brecent\s+conversation\b/);
  if (recentConvMatch) {
    return {
      type: "RECENT_CONVERSATION",
      rawText: recentConvMatch[0],
    };
  }

  return undefined;
}

/**
 * Classifies the given query into an AIContextIntent with structured metadata.
 */
export function classifyAIIntent(query: string): ClassifiedIntent {
  if (!query || typeof query !== "string" || query.trim() === "") {
    return {
      intent: "CURRENT_CONTEXT",
      confidence: 1.0,
      reason: "Empty or invalid query; default to current context",
    };
  }

  const trimmed = query.trim();
  const lower = trimmed.toLowerCase();

  // 1. Direct canvas commands take immediate priority
  if (isCanvasCommand(trimmed)) {
    return {
      intent: "CURRENT_CONTEXT",
      confidence: 1.0,
      reason: "Detected imperative canvas modification command",
    };
  }

  // 2. Extract temporal reference if present
  const temporal = extractTemporalReference(trimmed);

  // 3. Extract topic if present
  const topic = extractTopic(trimmed);

  // 4. Meeting-oriented queries
  if (
    temporal?.type === "MEETING_OFFSET" ||
    temporal?.type === "LAST_MEETING" ||
    temporal?.type === "LAST_FEW_MEETINGS" ||
    (temporal?.type === "TIME_WINDOW" && lower.includes("meeting")) ||
    lower.includes("meeting")
  ) {
    return {
      intent: "HISTORICAL_MEETING",
      temporalReference: temporal,
      topic,
      confidence: 0.95,
      reason: "Meeting reference detected in temporal context",
    };
  }

  // 5. Conversation-oriented historical queries
  if (temporal?.type === "PREVIOUS_CONVERSATIONS" || lower.includes("previous conversation") || lower.includes("earlier conversation")) {
    return {
      intent: "HISTORICAL_CONVERSATION",
      temporalReference: temporal,
      topic,
      confidence: 0.9,
      reason: "Historical conversation reference detected",
    };
  }

  // 6. Recent conversation summarization
  if (
    temporal?.type === "RECENT_CONVERSATION" ||
    lower.includes("summarize our recent conversation") ||
    lower.includes("summarize the recent conversation") ||
    lower.includes("our conversation so far")
  ) {
    return {
      intent: "RECENT_CONVERSATION",
      temporalReference: temporal,
      confidence: 0.95,
      reason: "Recent conversation review or summarization requested",
    };
  }

  // 7. Topic-oriented historical queries (e.g. "What did we talk about regarding authentication?")
  const isHistoricalInquiry =
    /\b(what\s+did\s+we|what\s+were|did\s+we|have\s+we|what\s+was\s+discussed|what\s+did\s+they)\b/i.test(lower) &&
    /\b(discuss|talk|decide|mention|say)\b/i.test(lower);

  if (isHistoricalInquiry && topic) {
    return {
      intent: "HISTORICAL_TOPIC",
      topic,
      confidence: 0.85,
      reason: "Historical inquiry regarding specific topic",
    };
  }

  // 8. Default fallback: CURRENT_CONTEXT
  return {
    intent: "CURRENT_CONTEXT",
    confidence: 0.8,
    reason: "No explicit historical or temporal markers; defaulting to current context",
  };
}
