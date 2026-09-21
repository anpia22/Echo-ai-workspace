/**
 * Phase 14.3 — Server AI Context Engine: Types & Contracts
 *
 * Explicit TypeScript types for structured, bounded workspace AI context.
 * Strictly decoupled from final prompt formatting and token budgeting (reserved for 14.4 and 14.5).
 */

import type { MessageRole } from "../persistence/conversationTypes";
import type { MeetingInsightType, MeetingPersistenceStatus } from "../persistence/meetingTypes";
import type { WorkspaceMemberRole } from "../persistence/workspaceTypes";

/**
 * Upper limits for historical context items retrieved per AI query.
 * Centralized constant configuration ensuring token safety.
 */
export const AI_CONTEXT_BOUNDS = {
  MAX_CONVERSATIONS: 5,
  MAX_MESSAGES_PER_CONVERSATION: 20,
  MAX_RECENT_MESSAGES: 10,
  MAX_MEETINGS: 5,
  MAX_INSIGHTS: 20,
  MAX_TRANSCRIPT_SEGMENTS: 30,
} as const;

export type AIContextBounds = {
  maxConversations: number;
  maxMessagesPerConversation: number;
  maxRecentMessages: number;
  maxMeetings: number;
  maxInsights: number;
  maxTranscriptSegments: number;
};

/**
 * Workspace metadata relevant to AI context.
 */
export type AIWorkspaceContext = {
  id: string;
  title: string;
  role: WorkspaceMemberRole;
};

/**
 * Lightweight message record for AI context.
 */
export type AIMessageContext = {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  sequence?: number;
};

/**
 * Lightweight summary of a conversation thread.
 */
export type AIConversationSummary = {
  id: string;
  title: string;
  updatedAt: string;
};

/**
 * Lightweight summary of a meeting session.
 */
export type AIMeetingSummary = {
  id: string;
  title: string;
  startedAt: string;
  endedAt?: string;
  status: MeetingPersistenceStatus;
};

/**
 * Meeting insight item tailored for downstream AI reasoning.
 */
export type AIMeetingInsightContext = {
  id: string;
  meetingId: string;
  type: MeetingInsightType;
  title: string;
  summary: string;
  timestamp: number;
};

/**
 * Finalized meeting transcript segment for AI context.
 */
export type AITranscriptSegmentContext = {
  id: string;
  meetingId: string;
  speakerName: string;
  text: string;
  timestamp: number;
  sequence: number;
};

/**
 * Normalized canvas snapshot for AI context.
 */
export type AICanvasContext = {
  revision: number;
  nodeCount: number;
  edgeCount: number;
  groupCount: number;
  nodes: Array<{
    id: string;
    title: string;
    nodeType?: string;
    description?: string;
  }>;
  edges: Array<{
    sourceTitle?: string;
    targetTitle?: string;
    relationship?: string;
  }>;
};

import type { ClassifiedIntent, HistoricalSelectionResult } from "./aiIntentTypes";

/**
 * Bounded structured AI context object.
 */
export type AIContext = {
  workspace: AIWorkspaceContext;
  classifiedIntent?: ClassifiedIntent;
  historicalSelection?: HistoricalSelectionResult;
  currentConversation?: {
    id: string;
    messages: AIMessageContext[];
  };
  recentConversationMessages?: AIMessageContext[];
  relevantConversations?: AIConversationSummary[];
  relevantMeetings?: AIMeetingSummary[];
  meetingInsights?: AIMeetingInsightContext[];
  transcriptSegments?: AITranscriptSegmentContext[];
  currentCanvas?: AICanvasContext;
};

/**
 * Options for configuring context retrieval.
 */
export type AIContextRetrievalOptions = {
  conversationId?: string;
  meetingId?: string;
  intent?: ClassifiedIntent;
  includeCurrentCanvas?: boolean;
  includeRecentMessages?: boolean;
  includeRelevantConversations?: boolean;
  includeRelevantMeetings?: boolean;
  includeMeetingInsights?: boolean;
  includeTranscriptSegments?: boolean;
  inMemoryCanvas?: {
    nodes?: Array<{ id?: string; title?: string; nodeType?: string; description?: string }>;
    edges?: Array<{ sourceId?: string; targetId?: string; sourceTitle?: string; targetTitle?: string; relationship?: string }>;
    groups?: Array<{ id?: string; title?: string; memberIds?: string[] }>;
  };
  inMemoryMessages?: Array<{ role: MessageRole; content: string }>;
  bounds?: Partial<AIContextBounds>;
};
