/**
 * Phase 14.3 — Server AI Context Engine & Authorization Guard
 *
 * Provides a secure, workspace-scoped, bounded retrieval boundary for historical
 * conversation, meeting, transcript, and canvas context before downstream AI prompt generation.
 *
 * CRITICAL INVARIANTS:
 * 1. Requires authenticated server actor and validates workspace membership.
 * 2. Scopes all meeting, conversation, and canvas queries strictly to the target workspaceId.
 * 3. Never trusts client-declared roles or workspace ownership; strictly queries the database.
 * 4. Cross-workspace retrieval is rejected with domain PersistenceError.
 * 5. Historical context is bounded by explicit size constraints to prevent token exhaustion.
 * 6. Preserves existing in-memory current canvas and recent conversation behavior.
 * 7. Does NOT format final prompts or perform temporal classification (Phase 14.4 & 14.5).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CanvasRepository,
  ConversationRepository,
  MeetingRepository,
  WorkspaceRepository,
} from "../persistence/repositories";
import {
  type PersistenceActor,
  PersistenceError,
  getServerSupabaseClient,
  requireWorkspaceMember,
} from "../persistence/server";
import {
  AI_CONTEXT_BOUNDS,
  type AICanvasContext,
  type AIContext,
  type AIContextBounds,
  type AIContextRetrievalOptions,
  type AIConversationSummary,
  type AIMeetingInsightContext,
  type AIMeetingSummary,
  type AIMessageContext,
  type AITranscriptSegmentContext,
  type AIWorkspaceContext,
} from "./aiContextTypes";
import { classifyAIIntent } from "./aiIntentClassifier";
import type { ClassifiedIntent } from "./aiIntentTypes";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AIContextEngineDeps = {
  client?: SupabaseClient;
  workspaceRepo?: WorkspaceRepository;
  conversationRepo?: ConversationRepository;
  meetingRepo?: MeetingRepository;
  canvasRepo?: CanvasRepository;
};

export class AIContextEngine {
  private readonly client: SupabaseClient;
  private readonly workspaceRepo: WorkspaceRepository;
  private readonly conversationRepo: ConversationRepository;
  private readonly meetingRepo: MeetingRepository;
  private readonly canvasRepo: CanvasRepository;

  constructor(deps?: AIContextEngineDeps) {
    this.client = deps?.client ?? getServerSupabaseClient();
    this.workspaceRepo = deps?.workspaceRepo ?? new WorkspaceRepository(this.client);
    this.conversationRepo = deps?.conversationRepo ?? new ConversationRepository(this.client);
    this.meetingRepo = deps?.meetingRepo ?? new MeetingRepository(this.client);
    this.canvasRepo = deps?.canvasRepo ?? new CanvasRepository(this.client);
  }

  /**
   * Resolves and bounds effective configuration limits.
   */
  private resolveBounds(overrides?: Partial<AIContextBounds>): AIContextBounds {
    return {
      maxConversations: overrides?.maxConversations ?? AI_CONTEXT_BOUNDS.MAX_CONVERSATIONS,
      maxMessagesPerConversation:
        overrides?.maxMessagesPerConversation ?? AI_CONTEXT_BOUNDS.MAX_MESSAGES_PER_CONVERSATION,
      maxRecentMessages: overrides?.maxRecentMessages ?? AI_CONTEXT_BOUNDS.MAX_RECENT_MESSAGES,
      maxMeetings: overrides?.maxMeetings ?? AI_CONTEXT_BOUNDS.MAX_MEETINGS,
      maxInsights: overrides?.maxInsights ?? AI_CONTEXT_BOUNDS.MAX_INSIGHTS,
      maxTranscriptSegments:
        overrides?.maxTranscriptSegments ?? AI_CONTEXT_BOUNDS.MAX_TRANSCRIPT_SEGMENTS,
    };
  }

  /**
   * Verifies authenticated actor and validates workspaceId format.
   */
  private validateIdentityAndWorkspace(actor: PersistenceActor, workspaceId: string): void {
    if (!actor || !actor.userId || typeof actor.userId !== "string" || actor.userId.trim() === "") {
      throw new PersistenceError("UNAUTHORIZED", "Authentication required to retrieve AI context");
    }

    if (!workspaceId || typeof workspaceId !== "string" || !UUID_REGEX.test(workspaceId)) {
      throw new PersistenceError(
        "VALIDATION_ERROR",
        `Invalid workspace ID format: '${workspaceId}'`
      );
    }
  }

  /**
   * Retrieves authorized workspace context and verifies caller membership.
   */
  async retrieveWorkspace(
    actor: PersistenceActor,
    workspaceId: string
  ): Promise<AIWorkspaceContext> {
    this.validateIdentityAndWorkspace(actor, workspaceId);

    // 1. Authoritative membership verification against database
    const authContext = await requireWorkspaceMember(this.client, workspaceId, actor);

    // 2. Fetch workspace metadata
    const { data, error } = await this.client
      .from("workspaces")
      .select("id, title")
      .eq("id", workspaceId)
      .single();

    if (error || !data) {
      throw new PersistenceError("NOT_FOUND", `Workspace ${workspaceId} not found`);
    }

    return {
      id: workspaceId,
      title: data.title || "Untitled Workspace",
      role: authContext.role,
    };
  }

  /**
   * Retrieves conversation summaries for the workspace, bounded by limit.
   */
  async retrieveConversations(
    actor: PersistenceActor,
    workspaceId: string,
    limit: number = AI_CONTEXT_BOUNDS.MAX_CONVERSATIONS
  ): Promise<AIConversationSummary[]> {
    this.validateIdentityAndWorkspace(actor, workspaceId);

    const conversations = await this.conversationRepo.listConversations(actor, workspaceId);
    return conversations.slice(0, limit).map((c) => ({
      id: c.id,
      title: c.title,
      updatedAt: c.updatedAt,
    }));
  }

  /**
   * Retrieves messages for a specific conversation in the workspace, bounded by limit.
   */
  async retrieveConversationMessages(
    actor: PersistenceActor,
    workspaceId: string,
    conversationId: string,
    limit: number = AI_CONTEXT_BOUNDS.MAX_MESSAGES_PER_CONVERSATION
  ): Promise<AIMessageContext[]> {
    this.validateIdentityAndWorkspace(actor, workspaceId);

    if (!conversationId || conversationId.trim() === "") {
      throw new PersistenceError("VALIDATION_ERROR", "conversationId cannot be empty");
    }

    const messages = await this.conversationRepo.listMessages(actor, workspaceId, conversationId);
    // Take the most recent messages up to limit
    const bounded = messages.slice(-limit);
    return bounded.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
      sequence: m.sequence,
    }));
  }

  /**
   * Retrieves meeting history for the workspace, bounded by limit.
   */
  async retrieveMeetings(
    actor: PersistenceActor,
    workspaceId: string,
    limit: number = AI_CONTEXT_BOUNDS.MAX_MEETINGS
  ): Promise<AIMeetingSummary[]> {
    this.validateIdentityAndWorkspace(actor, workspaceId);

    const history = await this.meetingRepo.getMeetingHistory(actor, workspaceId);
    return history.meetings.slice(0, limit).map((m) => ({
      id: m.id,
      title: m.title || "Echo Meeting",
      startedAt: m.startedAt,
      endedAt: m.endedAt,
      status: m.status,
    }));
  }

  /**
   * Retrieves persisted insights for a meeting, bounded by limit.
   */
  async retrieveMeetingInsights(
    actor: PersistenceActor,
    workspaceId: string,
    meetingId: string,
    limit: number = AI_CONTEXT_BOUNDS.MAX_INSIGHTS
  ): Promise<AIMeetingInsightContext[]> {
    this.validateIdentityAndWorkspace(actor, workspaceId);

    if (!meetingId || meetingId.trim() === "") {
      throw new PersistenceError("VALIDATION_ERROR", "meetingId cannot be empty");
    }

    const insights = await this.meetingRepo.listMeetingInsights(actor, workspaceId, meetingId);
    return insights.slice(0, limit).map((ins) => ({
      id: ins.id,
      meetingId: ins.meetingId,
      type: ins.type,
      title: ins.title,
      summary: ins.summary,
      timestamp: ins.timestamp,
    }));
  }

  /**
   * Retrieves persisted transcript segments for a meeting, bounded by limit.
   */
  async retrieveTranscriptSegments(
    actor: PersistenceActor,
    workspaceId: string,
    meetingId: string,
    limit: number = AI_CONTEXT_BOUNDS.MAX_TRANSCRIPT_SEGMENTS
  ): Promise<AITranscriptSegmentContext[]> {
    this.validateIdentityAndWorkspace(actor, workspaceId);

    if (!meetingId || meetingId.trim() === "") {
      throw new PersistenceError("VALIDATION_ERROR", "meetingId cannot be empty");
    }

    const segments = await this.meetingRepo.listTranscriptSegments(actor, workspaceId, meetingId);
    return segments.slice(0, limit).map((s) => ({
      id: s.id,
      meetingId: s.meetingId,
      speakerName: s.speakerName,
      text: s.text,
      timestamp: s.timestamp,
      sequence: s.sequence,
    }));
  }

  /**
   * Retrieves the materialized canvas snapshot for the workspace.
   */
  async retrieveCanvasSnapshot(
    actor: PersistenceActor,
    workspaceId: string
  ): Promise<AICanvasContext> {
    this.validateIdentityAndWorkspace(actor, workspaceId);

    const snapshot = await this.canvasRepo.loadCanvasSnapshot(actor, workspaceId);
    const nodeTitleById = new Map<string, string>();
    for (const node of snapshot.nodes) {
      nodeTitleById.set(node.id, node.title);
    }

    return {
      revision: snapshot.revision,
      nodeCount: snapshot.nodes.length,
      edgeCount: snapshot.edges.length,
      groupCount: snapshot.groups.length,
      nodes: snapshot.nodes.map((n) => ({
        id: n.id,
        title: n.title,
        nodeType: n.nodeType,
        description: n.description,
      })),
      edges: snapshot.edges.map((e) => ({
        sourceTitle: nodeTitleById.get(e.sourceId),
        targetTitle: nodeTitleById.get(e.targetId),
        relationship: e.relationship,
      })),
    };
  }

  /**
   * Helper to classify a raw text query.
   */
  classifyIntent(query: string): ClassifiedIntent {
    return classifyAIIntent(query);
  }

  /**
   * Builds an authorized, bounded AIContext bundle driven by a classified intent.
   */
  async retrieveContextForIntent(
    actor: PersistenceActor,
    workspaceId: string,
    intent: ClassifiedIntent,
    options: Omit<AIContextRetrievalOptions, "intent"> = {}
  ): Promise<AIContext> {
    return this.retrieveAIContext(actor, workspaceId, {
      ...options,
      intent,
    });
  }

  /**
   * Main entrypoint: builds an authorized, bounded AIContext bundle.
   */
  async retrieveAIContext(
    actor: PersistenceActor,
    workspaceId: string,
    options: AIContextRetrievalOptions = {}
  ): Promise<AIContext> {
    const bounds = this.resolveBounds(options.bounds);

    // 1. Authoritative workspace membership and metadata check
    const workspace = await this.retrieveWorkspace(actor, workspaceId);

    const result: AIContext = {
      workspace,
      classifiedIntent: options.intent,
    };

    // Intent Branch 1: HISTORICAL_MEETING
    if (options.intent?.intent === "HISTORICAL_MEETING") {
      const offset = options.intent.temporalReference?.offset ?? 1;
      const history = await this.retrieveMeetings(
        actor,
        workspaceId,
        Math.max(bounds.maxMeetings, offset)
      );

      if (history.length >= offset) {
        const targetMeeting = history[offset - 1];
        result.relevantMeetings = [targetMeeting];
        result.meetingInsights = await this.retrieveMeetingInsights(
          actor,
          workspaceId,
          targetMeeting.id,
          bounds.maxInsights
        );
        result.transcriptSegments = await this.retrieveTranscriptSegments(
          actor,
          workspaceId,
          targetMeeting.id,
          bounds.maxTranscriptSegments
        );
        result.historicalSelection = {
          matched: true,
          meetingId: targetMeeting.id,
          meetingTitle: targetMeeting.title,
          offset,
          reason: `Resolved historical meeting at offset ${offset}`,
        };
      } else {
        result.relevantMeetings = [];
        result.meetingInsights = [];
        result.transcriptSegments = [];
        result.historicalSelection = {
          matched: false,
          offset,
          reason: `No meeting found for offset ${offset} (workspace has ${history.length} meetings)`,
        };
      }
      return result;
    }

    // Intent Branch 2: HISTORICAL_TOPIC
    if (options.intent?.intent === "HISTORICAL_TOPIC") {
      const topic = options.intent.topic?.toLowerCase().trim() || "";
      const [history, conversations] = await Promise.all([
        this.retrieveMeetings(actor, workspaceId, bounds.maxMeetings),
        this.retrieveConversations(actor, workspaceId, bounds.maxConversations),
      ]);

      const matchingConvs = topic
        ? conversations.filter((c) => c.title.toLowerCase().includes(topic))
        : conversations;

      const matchingInsights: AIMeetingInsightContext[] = [];
      for (const m of history.slice(0, 3)) {
        const insights = await this.retrieveMeetingInsights(
          actor,
          workspaceId,
          m.id,
          bounds.maxInsights
        );
        matchingInsights.push(
          ...insights.filter(
            (i) =>
              i.title.toLowerCase().includes(topic) ||
              i.summary.toLowerCase().includes(topic)
          )
        );
      }

      if (matchingConvs.length > 0 || matchingInsights.length > 0) {
        result.relevantConversations = matchingConvs.slice(0, bounds.maxConversations);
        result.meetingInsights = matchingInsights.slice(0, bounds.maxInsights);
        result.historicalSelection = {
          matched: true,
          topic,
          reason: `Found historical records matching topic '${topic}'`,
        };
      } else {
        result.relevantConversations = [];
        result.meetingInsights = [];
        result.historicalSelection = {
          matched: false,
          topic,
          reason: `No historical context found matching topic '${topic}'`,
        };
      }
      return result;
    }

    // Intent Branch 3: HISTORICAL_CONVERSATION
    if (options.intent?.intent === "HISTORICAL_CONVERSATION") {
      const topic = options.intent.topic?.toLowerCase().trim();
      const conversations = await this.retrieveConversations(
        actor,
        workspaceId,
        bounds.maxConversations
      );

      const candidates = topic
        ? conversations.filter((c) => c.title.toLowerCase().includes(topic))
        : conversations;

      if (candidates.length > 0) {
        const targetConv = candidates[0];
        const messages = await this.retrieveConversationMessages(
          actor,
          workspaceId,
          targetConv.id,
          bounds.maxMessagesPerConversation
        );
        result.relevantConversations = candidates;
        result.currentConversation = {
          id: targetConv.id,
          messages,
        };
        result.historicalSelection = {
          matched: true,
          conversationId: targetConv.id,
          topic,
          reason: topic
            ? `Found conversation matching topic '${topic}'`
            : "Resolved most recent historical conversation",
        };
      } else {
        result.relevantConversations = [];
        result.historicalSelection = {
          matched: false,
          topic,
          reason: topic
            ? `No conversation found matching topic '${topic}'`
            : "No conversations found in workspace",
        };
      }
      return result;
    }

    // Intent Branch 4: RECENT_CONVERSATION
    if (options.intent?.intent === "RECENT_CONVERSATION") {
      if (options.inMemoryMessages && Array.isArray(options.inMemoryMessages)) {
        const sliceCount = Math.min(options.inMemoryMessages.length, bounds.maxRecentMessages);
        const recent = options.inMemoryMessages.slice(-sliceCount);
        result.recentConversationMessages = recent.map((m, idx) => ({
          id: `mem-${idx}`,
          role: m.role,
          content: m.content,
          createdAt: new Date().toISOString(),
        }));
      } else if (options.conversationId) {
        result.recentConversationMessages = await this.retrieveConversationMessages(
          actor,
          workspaceId,
          options.conversationId,
          bounds.maxRecentMessages
        );
      }
      result.historicalSelection = {
        matched: true,
        reason: "Recent conversation context selected",
      };
      return result;
    }

    // Intent Branch 5: CURRENT_CONTEXT (or default Phase 14.3 flow)
    result.historicalSelection = {
      matched: true,
      reason: "Current context selected",
    };

    // 2. Current conversation context
    if (options.conversationId) {
      const messages = await this.retrieveConversationMessages(
        actor,
        workspaceId,
        options.conversationId,
        bounds.maxMessagesPerConversation
      );
      result.currentConversation = {
        id: options.conversationId,
        messages,
      };
    }

    // 3. In-memory / recent conversation messages (preserving current behavior)
    if (options.inMemoryMessages && Array.isArray(options.inMemoryMessages)) {
      const sliceCount = Math.min(options.inMemoryMessages.length, bounds.maxRecentMessages);
      const recent = options.inMemoryMessages.slice(-sliceCount);
      result.recentConversationMessages = recent.map((m, idx) => ({
        id: `mem-${idx}`,
        role: m.role,
        content: m.content,
        createdAt: new Date().toISOString(),
      }));
    }

    // 4. Relevant conversations in workspace
    if (options.includeRelevantConversations !== false) {
      result.relevantConversations = await this.retrieveConversations(
        actor,
        workspaceId,
        bounds.maxConversations
      );
    }

    // 5. Relevant meetings in workspace
    if (options.includeRelevantMeetings !== false) {
      result.relevantMeetings = await this.retrieveMeetings(
        actor,
        workspaceId,
        bounds.maxMeetings
      );
    }

    // 6. Targeted meeting insights and transcript segments
    if (options.meetingId) {
      if (options.includeMeetingInsights !== false) {
        result.meetingInsights = await this.retrieveMeetingInsights(
          actor,
          workspaceId,
          options.meetingId,
          bounds.maxInsights
        );
      }

      if (options.includeTranscriptSegments !== false) {
        result.transcriptSegments = await this.retrieveTranscriptSegments(
          actor,
          workspaceId,
          options.meetingId,
          bounds.maxTranscriptSegments
        );
      }
    }

    // 7. Canvas state: prefer in-memory canvas if provided, otherwise load from DB if requested
    if (options.inMemoryCanvas) {
      const nodes = Array.isArray(options.inMemoryCanvas.nodes) ? options.inMemoryCanvas.nodes : [];
      const edges = Array.isArray(options.inMemoryCanvas.edges) ? options.inMemoryCanvas.edges : [];
      const groups = Array.isArray(options.inMemoryCanvas.groups) ? options.inMemoryCanvas.groups : [];

      result.currentCanvas = {
        revision: 0,
        nodeCount: nodes.length,
        edgeCount: edges.length,
        groupCount: groups.length,
        nodes: nodes.map((n) => ({
          id: n.id || "",
          title: n.title || "",
          nodeType: n.nodeType,
          description: n.description,
        })),
        edges: edges.map((e) => ({
          sourceTitle: e.sourceTitle,
          targetTitle: e.targetTitle,
          relationship: e.relationship,
        })),
      };
    } else if (options.includeCurrentCanvas) {
      result.currentCanvas = await this.retrieveCanvasSnapshot(actor, workspaceId);
    }

    return result;
  }
}

/**
 * Convenience helper to instantiate engine and retrieve AI context.
 */
export async function retrieveAIContext(
  actor: PersistenceActor,
  workspaceId: string,
  options?: AIContextRetrievalOptions,
  deps?: AIContextEngineDeps
): Promise<AIContext> {
  const engine = new AIContextEngine(deps);
  return engine.retrieveAIContext(actor, workspaceId, options);
}
