/**
 * Phase 14.5 — Bounded Prompt Assembly & Token Budgeting
 *
 * Converts already-authorized, bounded AIContext into compact, deterministic,
 * intent-prioritized prompt sections for Echo's AI engine.
 *
 * CRITICAL INVARIANTS:
 * 1. Pure transformation: NO database calls, NO authorization checks, NO side-effects.
 * 2. Hard max token/character bounds are strictly enforced; output never exceeds budget.
 * 3. Unicode-safe truncation prevents malformed text or split surrogate pairs.
 * 4. Internal database IDs (UUIDs, foreign keys, internal IDs) are NEVER leaked into the prompt.
 * 5. Intent-aware prioritization ensures high-priority information is retained while lower-priority
 *    context is truncated first.
 * 6. Preserves existing current-context/canvas prompt behavior completely.
 */

import type { AIContext } from "./aiContextTypes";
import {
  AI_PROMPT_BUDGET,
  type FormattedHistoricalContext,
  type PromptBudgetOptions,
  type UserPromptAssemblyInput,
} from "./aiPromptTypes";

/**
 * Deterministic conservative token estimation.
 * Uses 3.5 characters per token as a conservative heuristic for English text.
 * NOTE: This is an approximation for budgeting/truncation, not exact model tokenization.
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / AI_PROMPT_BUDGET.CHARS_PER_TOKEN_ESTIMATE);
}

/**
 * Deterministic, Unicode-safe string truncation.
 * Uses code point iteration to avoid splitting surrogate pairs or emojis.
 */
export function truncateStringUnicodeSafe(text: string, maxChars: number): string {
  if (!text || maxChars <= 0) return "";
  const codePoints = Array.from(text);
  if (codePoints.length <= maxChars) {
    return text;
  }
  return codePoints.slice(0, Math.max(0, maxChars - 1)).join("") + "…";
}

/**
 * Formats a clean date/time representation without internal timestamp IDs.
 */
function formatHumanTimestamp(timestampOrIso: number | string | undefined): string {
  if (!timestampOrIso) return "Unknown";
  try {
    const d = typeof timestampOrIso === "number" ? new Date(timestampOrIso) : new Date(timestampOrIso);
    return isNaN(d.getTime()) ? String(timestampOrIso) : d.toUTCString();
  } catch {
    return String(timestampOrIso);
  }
}

/**
 * Assembles a bounded, intent-prioritized historical context section from AIContext.
 */
export function buildHistoricalContextSection(
  aiContext: AIContext,
  options?: PromptBudgetOptions
): FormattedHistoricalContext {
  const maxHistoricalChars =
    options?.maxHistoricalChars ??
    (options?.maxHistoricalTokens
      ? Math.floor(options.maxHistoricalTokens * AI_PROMPT_BUDGET.CHARS_PER_TOKEN_ESTIMATE)
      : AI_PROMPT_BUDGET.MAX_HISTORICAL_CHARS);

  const maxTranscriptChars =
    options?.maxTranscriptChars ?? AI_PROMPT_BUDGET.MAX_TRANSCRIPT_TEXT_CHARS;
  const maxInsightChars = options?.maxInsightChars ?? AI_PROMPT_BUDGET.MAX_INSIGHT_SUMMARY_CHARS;
  const maxMessageChars = options?.maxMessageChars ?? AI_PROMPT_BUDGET.MAX_MESSAGE_CONTENT_CHARS;
  const maxPromptInsights = options?.maxPromptInsights ?? AI_PROMPT_BUDGET.MAX_PROMPT_INSIGHTS;
  const maxPromptTranscripts =
    options?.maxPromptTranscripts ?? AI_PROMPT_BUDGET.MAX_PROMPT_TRANSCRIPTS;
  const maxPromptMessages = options?.maxPromptMessages ?? AI_PROMPT_BUDGET.MAX_PROMPT_MESSAGES;

  const itemCounts = {
    meetings: 0,
    insights: 0,
    transcripts: 0,
    conversations: 0,
    messages: 0,
  };

  // Case 1: Unmatched historical selection (e.g. missing meeting or topic)
  if (aiContext.historicalSelection && aiContext.historicalSelection.matched === false) {
    const reason = aiContext.historicalSelection.reason || "No matching historical records found";
    const sectionText = `## HISTORICAL CONTEXT\nNo matching historical records found (${reason}).`;
    return {
      sectionText,
      charCount: sectionText.length,
      estimatedTokens: estimateTokenCount(sectionText),
      truncated: false,
      itemCounts,
    };
  }

  const intent = aiContext.classifiedIntent?.intent ?? "CURRENT_CONTEXT";

  // If CURRENT_CONTEXT with no explicitly requested historical meeting/insights/conversations, omit section
  if (
    intent === "CURRENT_CONTEXT" &&
    !aiContext.meetingInsights?.length &&
    !aiContext.transcriptSegments?.length &&
    !aiContext.currentConversation
  ) {
    return {
      sectionText: "",
      charCount: 0,
      estimatedTokens: 0,
      truncated: false,
      itemCounts,
    };
  }

  const chunks: string[] = ["## HISTORICAL CONTEXT"];
  let currentLength = chunks[0].length + 1;
  let truncated = false;

  function appendChunk(chunk: string): boolean {
    const projected = currentLength + chunk.length + 1;
    if (projected > maxHistoricalChars) {
      truncated = true;
      return false;
    }
    chunks.push(chunk);
    currentLength = projected;
    return true;
  }

  // INTENT-AWARE SECTION GENERATORS:

  // 1. Meeting Block
  const meetingBlockLines: string[] = [];
  if (aiContext.relevantMeetings && aiContext.relevantMeetings.length > 0) {
    meetingBlockLines.push("### Meeting:");
    for (const m of aiContext.relevantMeetings) {
      meetingBlockLines.push(
        `- Title: ${truncateStringUnicodeSafe(m.title, 80)}`,
        `  Date/Time: ${formatHumanTimestamp(m.startedAt)}`,
        `  Status: ${m.status}`
      );
      itemCounts.meetings += 1;
    }
  }

  // 2. Insights Block
  const insightLines: string[] = [];
  if (aiContext.meetingInsights && aiContext.meetingInsights.length > 0) {
    insightLines.push("### Decisions / Insights:");
    const boundedInsights = aiContext.meetingInsights.slice(0, maxPromptInsights);
    for (const ins of boundedInsights) {
      const title = truncateStringUnicodeSafe(ins.title, 80);
      const summary = truncateStringUnicodeSafe(ins.summary, maxInsightChars);
      insightLines.push(`- [${ins.type.toUpperCase()}] ${title}: ${summary}`);
      itemCounts.insights += 1;
    }
  }

  // 3. Transcript Block
  const transcriptLines: string[] = [];
  if (aiContext.transcriptSegments && aiContext.transcriptSegments.length > 0) {
    transcriptLines.push("### Relevant Transcript:");
    const boundedSegments = aiContext.transcriptSegments.slice(0, maxPromptTranscripts);
    for (const seg of boundedSegments) {
      const speaker = truncateStringUnicodeSafe(seg.speakerName, 30);
      const text = truncateStringUnicodeSafe(seg.text, maxTranscriptChars);
      transcriptLines.push(`- ${speaker}: "${text}"`);
      itemCounts.transcripts += 1;
    }
  }

  // 4. Conversation Block
  const conversationLines: string[] = [];
  const messagesToRender =
    aiContext.currentConversation && aiContext.currentConversation.messages.length > 0
      ? aiContext.currentConversation.messages
      : aiContext.recentConversationMessages ?? [];

  if (messagesToRender.length > 0) {
    conversationLines.push("### Historical Conversation:");
    const boundedMessages = messagesToRender.slice(-maxPromptMessages);
    for (const msg of boundedMessages) {
      const content = truncateStringUnicodeSafe(msg.content, maxMessageChars);
      conversationLines.push(`- ${msg.role}: ${content}`);
      itemCounts.messages += 1;
    }
  }

  // PRIORITIZED ASSEMBLY BASED ON INTENT:
  // Order blocks by priority according to intent

  type BlockInfo = { name: string; lines: string[] };
  let prioritizedBlocks: BlockInfo[] = [];

  if (intent === "HISTORICAL_MEETING") {
    // Meeting metadata > Insights > Transcript > Conversation
    prioritizedBlocks = [
      { name: "meeting", lines: meetingBlockLines },
      { name: "insights", lines: insightLines },
      { name: "transcript", lines: transcriptLines },
      { name: "conversation", lines: conversationLines },
    ];
  } else if (intent === "HISTORICAL_TOPIC") {
    // Insights (matching topic) > Conversation > Transcript > Meeting
    prioritizedBlocks = [
      { name: "insights", lines: insightLines },
      { name: "conversation", lines: conversationLines },
      { name: "transcript", lines: transcriptLines },
      { name: "meeting", lines: meetingBlockLines },
    ];
  } else if (intent === "HISTORICAL_CONVERSATION") {
    // Conversation > Insights > Transcript > Meeting
    prioritizedBlocks = [
      { name: "conversation", lines: conversationLines },
      { name: "insights", lines: insightLines },
      { name: "meeting", lines: meetingBlockLines },
      { name: "transcript", lines: transcriptLines },
    ];
  } else if (intent === "RECENT_CONVERSATION") {
    // Conversation > Insights > Meeting > Transcript
    prioritizedBlocks = [
      { name: "conversation", lines: conversationLines },
      { name: "meeting", lines: meetingBlockLines },
      { name: "insights", lines: insightLines },
      { name: "transcript", lines: transcriptLines },
    ];
  } else {
    // CURRENT_CONTEXT: Meeting summaries > Insights
    prioritizedBlocks = [
      { name: "meeting", lines: meetingBlockLines },
      { name: "insights", lines: insightLines },
      { name: "conversation", lines: conversationLines },
      { name: "transcript", lines: transcriptLines },
    ];
  }

  // Append prioritized blocks while respecting maxHistoricalChars
  for (const block of prioritizedBlocks) {
    if (block.lines.length === 0) continue;
    const blockText = block.lines.join("\n");
    const fit = appendChunk(blockText);
    if (!fit) {
      // Attempt item-by-item truncation of this block if header fits
      if (block.lines.length > 1) {
        const header = block.lines[0];
        if (appendChunk(header)) {
          for (let i = 1; i < block.lines.length; i++) {
            if (!appendChunk(block.lines[i])) {
              truncated = true;
              break;
            }
          }
        }
      }
      break;
    }
  }

  const sectionText = chunks.join("\n\n");
  return {
    sectionText,
    charCount: sectionText.length,
    estimatedTokens: estimateTokenCount(sectionText),
    truncated,
    itemCounts,
  };
}

/**
 * Assembles the full user prompt for Nemotron, embedding the bounded historical context
 * while preserving all existing canvas and conversational reasoning rules.
 */
export function buildUserPromptContent(input: UserPromptAssemblyInput): string {
  const parts: string[] = [
    `RECENT CONVERSATION:\n\n${JSON.stringify(input.conversationHistory, null, 2)}`,
    `CURRENT CANVAS GRAPH:\n\n${JSON.stringify(input.graphContext, null, 2)}`,
    input.explicitGraphSummary,
    input.graphInsightSummary,
    input.graphRecommendationSummary,
  ];

  if (input.historicalSectionText && input.historicalSectionText.trim().length > 0) {
    parts.push(input.historicalSectionText.trim());
  }

  parts.push(
    `CURRENT USER MESSAGE:\n\n${input.transcript}`,
    `Use the conversation history and CURRENT CANVAS GRAPH as context.

Understand the user's message naturally.

Do not assume that the user is giving a command.

Determine what the user means in the context of the ongoing conversation.

A single request may need multiple actions. Generate only the
minimum actions, in dependency order (CREATE_NODE before any
CREATE_EDGE that uses that new title). Prefer existing nodes.
Do not duplicate existing titles.
If the user asks to add a solution without naming it, or
confirms a prior recommendation with "do that" / "go ahead"
when one target is clear, invent a concise solution from
context and emit CREATE_NODE plus the needed CREATE_EDGE.
Do not ask them to name the solution first.
If several recommended targets are still equally valid,
ask which one and return "actions": [].

If the user asks a reasoning, insight, or recommendation
question about the workspace (main problems, causes,
solutions, unresolved items, workspace summary, evidence,
ranking, what to do next, what to focus on, coverage gaps,
or similar), inspect CURRENT CANVAS GRAPH, EXPLICIT
RELATIONSHIPS, GRAPH INSIGHT FACTS, and GRAPH
RECOMMENDATION FACTS first. Answer from those facts only.
Return "actions": [] unless they explicitly ask to modify
the canvas. Do not invent ranking, causality, solutions,
impact, or priority. Recommendations must stay
recommendations. If there is not enough evidence, say so
and return "actions": [].

If the message introduces meaningful information that belongs on the
workspace, create or update the appropriate canvas elements.

If the message is only conversational, respond naturally and return:

"actions": []

When referring to existing canvas nodes or edges, always use
their exact titles from CURRENT CANVAS GRAPH.

When resolving words such as "this", "that", "it", "this problem",
"that problem", "this solution", "that solution", "this decision",
"that relationship", "the previous problem", or similar references,
use both RECENT CONVERSATION and CURRENT CANVAS GRAPH.

Prefer the most recently discussed relevant object of that type.
Do not invent titles. Do not recreate deleted nodes.
Do not create a new node when the user is referring to an
existing canvas concept.
Do not invent relationships that are not explicit edges.

If a reference is genuinely ambiguous, ask a natural
clarification question and return:

"actions": []

If the user is revising, replacing, correcting, or renaming an
existing canvas concept, use UPDATE_NODE. Do not DELETE then CREATE.

If the user wants a concept removed entirely, use DELETE_NODE.

Return ONLY valid JSON.`
  );

  return parts.join("\n\n");
}
