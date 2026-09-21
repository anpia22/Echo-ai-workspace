/**
 * Phase 14.5 — Bounded Prompt Assembly & Token Budgeting: Types & Contracts
 *
 * Explicit token bounds, estimation utilities, and configuration for
 * building compact, deterministic prompt context for Echo's AI engine.
 */

/**
 * Centralized budget constraints for AI prompt assembly.
 */
export const AI_PROMPT_BUDGET = {
  /** Conservative character-to-token estimation divisor (3.5 chars/token) */
  CHARS_PER_TOKEN_ESTIMATE: 3.5,
  /** Hard token budget for the historical context section (~1500 tokens) */
  MAX_HISTORICAL_TOKENS: 1500,
  /** Hard character budget for the historical context section (~5250 chars) */
  MAX_HISTORICAL_CHARS: 5250,
  /** Hard character cap for an individual transcript segment */
  MAX_TRANSCRIPT_TEXT_CHARS: 200,
  /** Hard character cap for an individual insight summary */
  MAX_INSIGHT_SUMMARY_CHARS: 250,
  /** Hard character cap for an individual conversation message */
  MAX_MESSAGE_CONTENT_CHARS: 300,
  /** Maximum number of insights rendered in historical prompt section */
  MAX_PROMPT_INSIGHTS: 10,
  /** Maximum number of transcript segments rendered in historical prompt section */
  MAX_PROMPT_TRANSCRIPTS: 15,
  /** Maximum number of historical messages rendered in historical prompt section */
  MAX_PROMPT_MESSAGES: 10,
} as const;

export type PromptBudgetOptions = {
  maxHistoricalTokens?: number;
  maxHistoricalChars?: number;
  maxTranscriptChars?: number;
  maxInsightChars?: number;
  maxMessageChars?: number;
  maxPromptInsights?: number;
  maxPromptTranscripts?: number;
  maxPromptMessages?: number;
};

export type FormattedHistoricalContext = {
  sectionText: string;
  estimatedTokens: number;
  charCount: number;
  truncated: boolean;
  itemCounts: {
    meetings: number;
    insights: number;
    transcripts: number;
    conversations: number;
    messages: number;
  };
};

export type UserPromptAssemblyInput = {
  transcript: string;
  conversationHistory: Array<{ role: string; content: string }>;
  graphContext: unknown;
  explicitGraphSummary: string;
  graphInsightSummary: string;
  graphRecommendationSummary: string;
  historicalSectionText?: string;
};
