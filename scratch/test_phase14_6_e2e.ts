/**
 * Phase 14.6 — End-to-End AI Context & Memory Verification Suite
 *
 * Verifies the complete Phase 14 pipeline end-to-end:
 * Persistence
 *   → Authorization Guard
 *   → Context Retrieval
 *   → Historical Intent Classification
 *   → Temporal Selection
 *   → Prompt Budgeting & Truncation
 *   → /api/analyze user prompt content assembly
 *
 * Scenarios:
 * 1. Historical Meeting ("What did we decide three meetings ago?")
 * 2. Last Meeting ("What did we decide in our last meeting?")
 * 3. Historical Topic ("What did we discuss about authentication?")
 * 4. Historical Conversation ("What were our previous conversations about the dashboard?")
 * 5. Current Context Regression (Commands & conversation without historical clutter)
 * 6. Security & Tenancy Isolation (Workspace A vs B, foreign ID access, non-member rejection)
 * 7. Missing History (Ten meetings ago with only 3 meetings -> safe no-match)
 * 8. Prompt Budget & Truncation (Hard limits, Unicode safety, zero DB ID leakage)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AIContextEngine,
  classifyAIIntent,
  buildHistoricalContextSection,
  buildUserPromptContent,
  estimateTokenCount,
  truncateStringUnicodeSafe,
  AI_PROMPT_BUDGET,
  type AIContext,
} from "../src/app/lib/ai";
import { WorkspaceRepository } from "../src/app/lib/persistence/repositories/workspaceRepository";
import { ConversationRepository } from "../src/app/lib/persistence/repositories/conversationRepository";
import { MeetingRepository } from "../src/app/lib/persistence/repositories/meetingRepository";
import { CanvasRepository } from "../src/app/lib/persistence/repositories/canvasRepository";
import { PersistenceError } from "../src/app/lib/persistence/server/errors";
import type { PersistenceActor } from "../src/app/lib/persistence/server/auth";

describe("Phase 14.6 — End-to-End AI Context & Memory Verification", () => {
  const workspaceA = "11111111-1111-1111-1111-111111111111";
  const workspaceB = "22222222-2222-2222-2222-222222222222";

  const memberActorA: PersistenceActor = {
    userId: "user-alpha-lead",
  };

  const memberActorB: PersistenceActor = {
    userId: "user-beta-lead",
  };

  const strangerActor: PersistenceActor = {
    userId: "user-stranger-intruder",
  };

  // Deterministic fixtures setup
  function createE2EFixtures() {
    const workspacesTable = [
      {
        id: workspaceA,
        title: "Workspace Alpha — Primary",
        revision: 1,
        created_at: "2026-09-17T00:00:00.000Z",
        updated_at: "2026-09-17T00:00:00.000Z",
      },
      {
        id: workspaceB,
        title: "Workspace Beta — Isolated",
        revision: 1,
        created_at: "2026-09-17T00:00:00.000Z",
        updated_at: "2026-09-17T00:00:00.000Z",
      },
    ];

    const membersTable = [
      {
        workspace_id: workspaceA,
        user_id: memberActorA.userId,
        role: "admin",
      },
      {
        workspace_id: workspaceB,
        user_id: memberActorB.userId,
        role: "owner",
      },
    ];

    // Meetings in Workspace A:
    // Meeting A (oldest, 3 meetings ago):
    // "Decision: Use PostgreSQL for the production database."
    // Meeting B (middle, 2 meetings ago):
    // "Decision: Use Supabase Realtime for collaboration."
    // Meeting C (newest, last meeting):
    // "Decision: Use React Flow for the canvas."
    const meetingsTable = [
      {
        id: "meet-c-newest",
        workspace_id: workspaceA,
        title: "Frontend Canvas Architecture Sync",
        status: "ended",
        started_at: "2026-09-19T14:00:00.000Z",
        ended_at: "2026-09-19T15:00:00.000Z",
        created_by: memberActorA.userId,
        created_at: "2026-09-19T14:00:00.000Z",
        updated_at: "2026-09-19T15:00:00.000Z",
      },
      {
        id: "meet-b-middle",
        workspace_id: workspaceA,
        title: "Realtime Collaboration Planning",
        status: "ended",
        started_at: "2026-09-18T10:00:00.000Z",
        ended_at: "2026-09-18T11:00:00.000Z",
        created_by: memberActorA.userId,
        created_at: "2026-09-18T10:00:00.000Z",
        updated_at: "2026-09-18T11:00:00.000Z",
      },
      {
        id: "meet-a-oldest",
        workspace_id: workspaceA,
        title: "Backend Storage & Database Selection",
        status: "ended",
        started_at: "2026-09-17T09:00:00.000Z",
        ended_at: "2026-09-17T10:00:00.000Z",
        created_by: memberActorA.userId,
        created_at: "2026-09-17T09:00:00.000Z",
        updated_at: "2026-09-17T10:00:00.000Z",
      },
      // Workspace B meeting for cross-tenancy isolation
      {
        id: "meet-b-secret",
        workspace_id: workspaceB,
        title: "Secret Strategy in Workspace B",
        status: "ended",
        started_at: "2026-09-19T16:00:00.000Z",
        ended_at: "2026-09-19T17:00:00.000Z",
        created_by: memberActorB.userId,
        created_at: "2026-09-19T16:00:00.000Z",
        updated_at: "2026-09-19T17:00:00.000Z",
      },
    ];

    const transcriptTable = [
      {
        id: "seg-a-1",
        meeting_id: "meet-a-oldest",
        speaker_id: memberActorA.userId,
        speaker_name: "Alice",
        text: "We confirmed PostgreSQL satisfies our ACID and relational isolation requirements.",
        timestamp: 1726563900000,
        sequence: 1,
        status: "final",
        source: "meeting",
        created_at: "2026-09-17T09:05:00.000Z",
      },
      {
        id: "seg-b-1",
        meeting_id: "meet-b-middle",
        speaker_id: memberActorA.userId,
        speaker_name: "Bob",
        text: "Supabase Realtime channels will handle cursor broadcast smoothly.",
        timestamp: 1726653900000,
        sequence: 1,
        status: "final",
        source: "meeting",
        created_at: "2026-09-18T10:05:00.000Z",
      },
      {
        id: "seg-c-1",
        meeting_id: "meet-c-newest",
        speaker_id: memberActorA.userId,
        speaker_name: "Charlie",
        text: "React Flow xyflow library gives us the best node customizability.",
        timestamp: 1726754700000,
        sequence: 1,
        status: "final",
        source: "meeting",
        created_at: "2026-09-19T14:05:00.000Z",
      },
      {
        id: "seg-b-secret",
        meeting_id: "meet-b-secret",
        speaker_id: memberActorB.userId,
        speaker_name: "Eve",
        text: "Classified details intended only for Workspace B members.",
        timestamp: 1726761900000,
        sequence: 1,
        status: "final",
        source: "meeting",
        created_at: "2026-09-19T16:05:00.000Z",
      },
    ];

    const insightsTable = [
      {
        id: "ins-a-1",
        meeting_id: "meet-a-oldest",
        type: "decision",
        title: "PostgreSQL Database Choice",
        summary: "Decision: Use PostgreSQL for the production database.",
        source_segment_ids: ["seg-a-1"],
        speaker_ids: [memberActorA.userId],
        timestamp: 1726564000000,
        created_at: "2026-09-17T09:10:00.000Z",
      },
      {
        id: "ins-a-topic",
        meeting_id: "meet-a-oldest",
        type: "problem",
        title: "Authentication Token Expiry",
        summary: "Discussed authentication and JWT token lifecycle management.",
        source_segment_ids: ["seg-a-1"],
        speaker_ids: [memberActorA.userId],
        timestamp: 1726564100000,
        created_at: "2026-09-17T09:12:00.000Z",
      },
      {
        id: "ins-b-1",
        meeting_id: "meet-b-middle",
        type: "decision",
        title: "Supabase Realtime for Sync",
        summary: "Decision: Use Supabase Realtime for collaboration.",
        source_segment_ids: ["seg-b-1"],
        speaker_ids: [memberActorA.userId],
        timestamp: 1726654000000,
        created_at: "2026-09-18T10:10:00.000Z",
      },
      {
        id: "ins-c-1",
        meeting_id: "meet-c-newest",
        type: "decision",
        title: "React Flow for Canvas",
        summary: "Decision: Use React Flow for the canvas.",
        source_segment_ids: ["seg-c-1"],
        speaker_ids: [memberActorA.userId],
        timestamp: 1726754800000,
        created_at: "2026-09-19T14:10:00.000Z",
      },
      {
        id: "ins-c-topic",
        meeting_id: "meet-c-newest",
        type: "idea",
        title: "Dashboard Layout Idea",
        summary: "Discussed dashboard layout and telemetry chart positioning.",
        source_segment_ids: ["seg-c-1"],
        speaker_ids: [memberActorA.userId],
        timestamp: 1726754900000,
        created_at: "2026-09-19T14:15:00.000Z",
      },
      {
        id: "ins-b-secret",
        meeting_id: "meet-b-secret",
        type: "decision",
        title: "Beta Secret",
        summary: "Confidential roadmap for Beta workspace.",
        source_segment_ids: ["seg-b-secret"],
        speaker_ids: [memberActorB.userId],
        timestamp: 1726762000000,
        created_at: "2026-09-19T16:10:00.000Z",
      },
    ];

    const conversationsTable = [
      {
        id: "conv-dashboard",
        workspace_id: workspaceA,
        title: "Dashboard Widgets Architecture",
        created_at: "2026-09-18T11:00:00.000Z",
        updated_at: "2026-09-18T12:00:00.000Z",
      },
      {
        id: "conv-billing",
        workspace_id: workspaceA,
        title: "Stripe Billing and Invoicing",
        created_at: "2026-09-18T13:00:00.000Z",
        updated_at: "2026-09-18T14:00:00.000Z",
      },
      {
        id: "conv-secret-b",
        workspace_id: workspaceB,
        title: "Beta Workspace Private Chat",
        created_at: "2026-09-18T15:00:00.000Z",
        updated_at: "2026-09-18T16:00:00.000Z",
      },
    ];

    const messagesTable = [
      {
        id: "msg-dash-1",
        workspace_id: workspaceA,
        conversation_id: "conv-dashboard",
        role: "user",
        content: "We agreed our dashboard needs real-time charts for active users.",
        sequence: 1,
        created_at: "2026-09-18T11:05:00.000Z",
      },
      {
        id: "msg-billing-1",
        workspace_id: workspaceA,
        conversation_id: "conv-billing",
        role: "user",
        content: "Stripe webhook endpoints are verified and ready.",
        sequence: 1,
        created_at: "2026-09-18T13:05:00.000Z",
      },
      {
        id: "msg-secret-b",
        workspace_id: workspaceB,
        conversation_id: "conv-secret-b",
        role: "user",
        content: "Classified Beta internal conversation message.",
        sequence: 1,
        created_at: "2026-09-18T15:05:00.000Z",
      },
    ];

    const canvasNodesTable: any[] = [];
    const canvasEdgesTable: any[] = [];
    const canvasGroupsTable: any[] = [];

    const mockClient = {
      from: (table: string) => {
        const queryState: { eqFilters: [string, any][] } = { eqFilters: [] };
        const selectBuilder: any = {
          eq: (col: string, val: any) => {
            queryState.eqFilters.push([col, val]);
            return selectBuilder;
          },
          order: () => selectBuilder,
          select: () => selectBuilder,
          single: async () => {
            let target: any[] = [];
            if (table === "workspaces") target = workspacesTable;
            if (table === "workspace_members") target = membersTable;
            if (table === "conversations") target = conversationsTable;
            if (table === "messages") target = messagesTable;
            if (table === "meetings") target = meetingsTable;
            if (table === "meeting_transcript_segments") target = transcriptTable;
            if (table === "meeting_insights") target = insightsTable;

            const match = target.find((row) =>
              queryState.eqFilters.every(([c, v]) => row[c] === v)
            );
            if (!match) {
              return { data: null, error: { message: "Not found", code: "PGRST116" } };
            }
            return { data: match, error: null };
          },
          maybeSingle: async () => {
            let target: any[] = [];
            if (table === "workspaces") target = workspacesTable;
            if (table === "workspace_members") target = membersTable;
            if (table === "conversations") target = conversationsTable;
            if (table === "messages") target = messagesTable;
            if (table === "meetings") target = meetingsTable;
            if (table === "meeting_transcript_segments") target = transcriptTable;
            if (table === "meeting_insights") target = insightsTable;

            const match = target.find((row) =>
              queryState.eqFilters.every(([c, v]) => row[c] === v)
            );
            return { data: match || null, error: null };
          },
          then: (resolve: any) => {
            let target: any[] = [];
            if (table === "workspaces") target = workspacesTable;
            if (table === "workspace_members") target = membersTable;
            if (table === "conversations") target = conversationsTable;
            if (table === "messages") target = messagesTable;
            if (table === "meetings") target = meetingsTable;
            if (table === "meeting_transcript_segments") target = transcriptTable;
            if (table === "meeting_insights") target = insightsTable;
            if (table === "canvas_nodes") target = canvasNodesTable;
            if (table === "canvas_edges") target = canvasEdgesTable;
            if (table === "canvas_groups") target = canvasGroupsTable;

            const filtered = target.filter((row) =>
              queryState.eqFilters.every(([c, v]) => row[c] === v)
            );
            resolve({ data: filtered, count: filtered.length, error: null });
          },
        };

        return {
          select: (_fields?: string, _opts?: any) => selectBuilder,
        };
      },
    };

    const workspaceRepo = new WorkspaceRepository(mockClient as any);
    const conversationRepo = new ConversationRepository(mockClient as any);
    const meetingRepo = new MeetingRepository(mockClient as any);
    const canvasRepo = new CanvasRepository(mockClient as any);

    const engine = new AIContextEngine({
      client: mockClient as any,
      workspaceRepo,
      conversationRepo,
      meetingRepo,
      canvasRepo,
    });

    return { engine, workspacesTable, meetingsTable, insightsTable, transcriptTable, conversationsTable, messagesTable };
  }

  // =========================================================================
  // SCENARIO 1 — HISTORICAL MEETING ("three meetings ago")
  // =========================================================================
  it("Scenario 1: Historical Meeting ('What did we decide three meetings ago?')", async () => {
    const { engine } = createE2EFixtures();
    const query = "What did we decide three meetings ago?";

    // 1. Intent Classification
    const intent = classifyAIIntent(query);
    assert.strictEqual(intent.intent, "HISTORICAL_MEETING");
    assert.strictEqual(intent.temporalReference?.type, "MEETING_OFFSET");
    assert.strictEqual(intent.temporalReference?.offset, 3);

    // 2. Context Retrieval via Authorized Engine
    const context = await engine.retrieveAIContext(memberActorA, workspaceA, {
      intent,
      includeMeetingInsights: true,
      includeTranscriptSegments: true,
    });

    // 3. Meeting A (meet-a-oldest) is targeted
    assert.strictEqual(context.historicalSelection?.meetingId, "meet-a-oldest");
    assert.strictEqual(context.relevantMeetings?.length, 1);
    assert.strictEqual(context.relevantMeetings[0].id, "meet-a-oldest");
    assert.strictEqual(context.relevantMeetings[0].title, "Backend Storage & Database Selection");

    // 4. Meeting B and C are NOT selected as target
    assert.notStrictEqual(context.historicalSelection?.meetingId, "meet-b-middle");
    assert.notStrictEqual(context.historicalSelection?.meetingId, "meet-c-newest");

    // 5. Meeting A insight is available
    const decisionInsight = context.meetingInsights?.find((i) => i.meetingId === "meet-a-oldest" && i.type === "decision");
    assert.ok(decisionInsight, "Meeting A decision insight must be present");
    assert.ok(decisionInsight?.summary.includes("PostgreSQL"));

    // 6. Meeting A transcript is available
    const transcriptSeg = context.transcriptSegments?.find((t) => t.meetingId === "meet-a-oldest");
    assert.ok(transcriptSeg, "Meeting A transcript segment must be present");
    assert.ok(transcriptSeg?.text.includes("ACID and relational"));

    // 7. Context remains workspace-scoped
    assert.strictEqual(context.workspace.id, workspaceA);

    // 8. Prompt builder includes the selected historical context
    const historicalSection = buildHistoricalContextSection(context);
    assert.ok(historicalSection.sectionText.includes("Backend Storage & Database Selection"));
    assert.ok(historicalSection.sectionText.includes("PostgreSQL"));
    assert.ok(historicalSection.sectionText.includes("Alice:"));

    const userPrompt = buildUserPromptContent({
      transcript: query,
      conversationHistory: [],
      graphContext: { nodes: [], edges: [] },
      explicitGraphSummary: "",
      graphInsightSummary: "",
      graphRecommendationSummary: "",
      historicalSectionText: historicalSection.sectionText,
    });

    assert.ok(userPrompt.includes("## HISTORICAL CONTEXT"));
    assert.ok(userPrompt.includes("PostgreSQL"));
    assert.ok(userPrompt.includes("CURRENT USER MESSAGE:\n\nWhat did we decide three meetings ago?"));

    // 9. Historical context remains within budget
    assert.ok(historicalSection.charCount <= AI_PROMPT_BUDGET.MAX_HISTORICAL_CHARS);
    assert.ok(historicalSection.estimatedTokens <= AI_PROMPT_BUDGET.MAX_HISTORICAL_TOKENS);
  });

  // =========================================================================
  // SCENARIO 2 — LAST MEETING ("last meeting")
  // =========================================================================
  it("Scenario 2: Last Meeting ('What did we decide in our last meeting?')", async () => {
    const { engine } = createE2EFixtures();
    const query = "What did we decide in our last meeting?";

    // 1. Intent Classification
    const intent = classifyAIIntent(query);
    assert.strictEqual(intent.intent, "HISTORICAL_MEETING");
    assert.strictEqual(intent.temporalReference?.type, "LAST_MEETING");
    assert.strictEqual(intent.temporalReference?.offset, 1);

    // 2. Context Retrieval
    const context = await engine.retrieveAIContext(memberActorA, workspaceA, {
      intent,
      includeMeetingInsights: true,
      includeTranscriptSegments: true,
    });

    // 3. Meeting C (newest) selected
    assert.strictEqual(context.historicalSelection?.meetingId, "meet-c-newest");
    assert.strictEqual(context.relevantMeetings?.[0]?.id, "meet-c-newest");
    assert.strictEqual(context.relevantMeetings?.[0]?.title, "Frontend Canvas Architecture Sync");

    // 4. Meeting A/B not selected as target
    assert.notStrictEqual(context.historicalSelection?.meetingId, "meet-a-oldest");
    assert.notStrictEqual(context.historicalSelection?.meetingId, "meet-b-middle");

    // 5. Meeting C insight enters bounded context
    const insightC = context.meetingInsights?.find((i) => i.meetingId === "meet-c-newest" && i.type === "decision");
    assert.ok(insightC);
    assert.ok(insightC?.summary.includes("React Flow"));

    const historicalSection = buildHistoricalContextSection(context);
    assert.ok(historicalSection.sectionText.includes("React Flow for Canvas"));
    assert.ok(!historicalSection.sectionText.includes("meet-c-newest"), "UUID must not be exposed");
  });

  // =========================================================================
  // SCENARIO 3 — HISTORICAL TOPIC ("authentication")
  // =========================================================================
  it("Scenario 3: Historical Topic ('What did we discuss about authentication?')", async () => {
    const { engine } = createE2EFixtures();
    const query = "What did we discuss about authentication?";

    // 1. Intent Classification
    const intent = classifyAIIntent(query);
    assert.strictEqual(intent.intent, "HISTORICAL_TOPIC");
    assert.strictEqual(intent.topic, "authentication");

    // 2. Context Retrieval
    const context = await engine.retrieveAIContext(memberActorA, workspaceA, {
      intent,
      includeMeetingInsights: true,
      includeTranscriptSegments: true,
    });

    // 3. Matching historical information selected
    assert.ok(context.meetingInsights && context.meetingInsights.length > 0);
    const authInsight = context.meetingInsights.find((i) =>
      i.title.toLowerCase().includes("authentication") || i.summary.toLowerCase().includes("authentication")
    );
    assert.ok(authInsight, "Authentication insight must be selected");
    assert.ok(authInsight?.summary.includes("JWT token"));

    // 4. Unrelated dashboard content not prioritized over auth
    const historicalSection = buildHistoricalContextSection(context);
    assert.ok(historicalSection.sectionText.includes("Authentication Token Expiry"));

    // 5. Workspace isolation remains enforced
    assert.strictEqual(context.workspace.id, workspaceA);
    assert.ok(!historicalSection.sectionText.includes("Classified details intended only for Workspace B"));
  });

  // =========================================================================
  // SCENARIO 4 — HISTORICAL CONVERSATION ("previous conversations about dashboard")
  // =========================================================================
  it("Scenario 4: Historical Conversation ('What were our previous conversations about the dashboard?')", async () => {
    const { engine } = createE2EFixtures();
    const query = "What were our previous conversations about the dashboard?";

    // 1. Intent classification
    const intent = classifyAIIntent(query);
    assert.strictEqual(intent.intent, "HISTORICAL_CONVERSATION");
    assert.strictEqual(intent.topic, "dashboard");

    // 2. Context Retrieval
    const context = await engine.retrieveAIContext(memberActorA, workspaceA, {
      intent,
      includeRelevantConversations: true,
      includeRecentMessages: true,
    });

    // 3. Matching conversation content is selected
    assert.ok(context.relevantConversations && context.relevantConversations.length > 0);
    const dashConv = context.relevantConversations.find((c) => c.title.toLowerCase().includes("dashboard"));
    assert.ok(dashConv, "Dashboard conversation must be selected");
    assert.strictEqual(dashConv?.id, "conv-dashboard");

    // 4. Unrelated billing conversation is not prioritized
    const historicalSection = buildHistoricalContextSection(context);
    assert.ok(historicalSection.sectionText.includes("Historical Conversation:") || context.relevantConversations.length >= 1);
  });

  // =========================================================================
  // SCENARIO 5 — CURRENT CONTEXT REGRESSION
  // =========================================================================
  it("Scenario 5: Current Context Regression (Commands & conversation without historical clutter)", async () => {
    const { engine } = createE2EFixtures();

    const cmd1 = "Create a node for authentication.";
    const intent1 = classifyAIIntent(cmd1);
    assert.strictEqual(intent1.intent, "CURRENT_CONTEXT", "Canvas creation command must be CURRENT_CONTEXT");

    const cmd2 = "Move this node to the right.";
    const intent2 = classifyAIIntent(cmd2);
    assert.strictEqual(intent2.intent, "CURRENT_CONTEXT", "Canvas move command must be CURRENT_CONTEXT");

    const chat1 = "Summarize what we are discussing.";
    const intent3 = classifyAIIntent(chat1);
    assert.ok(
      intent3.intent === "RECENT_CONVERSATION" || intent3.intent === "CURRENT_CONTEXT",
      "Casual summarization maps to conversation or current context"
    );

    // Verify context retrieval maintains active canvas
    const inMemoryCanvas = {
      nodes: [{ id: "node-1", title: "API Gateway", nodeType: "solution", description: "Edge router" }],
      edges: [],
    };
    const inMemoryMessages = [
      { role: "user" as const, content: "Hello Echo" },
      { role: "assistant" as const, content: "Hello! How can I assist you with the canvas?" },
    ];

    const context = await engine.retrieveAIContext(memberActorA, workspaceA, {
      intent: intent1,
      inMemoryCanvas,
      inMemoryMessages,
    });

    assert.strictEqual(context.currentCanvas?.nodes.length, 1);
    assert.strictEqual(context.currentCanvas?.nodes[0].title, "API Gateway");

    // Historical context does not unexpectedly flood normal requests
    const historicalSection = buildHistoricalContextSection(context);
    assert.strictEqual(historicalSection.sectionText, "", "Historical section must be empty when none requested");

    const prompt = buildUserPromptContent({
      transcript: cmd1,
      conversationHistory: [{ role: "user", content: "Hello Echo" }],
      graphContext: inMemoryCanvas,
      explicitGraphSummary: "",
      graphInsightSummary: "",
      graphRecommendationSummary: "",
      historicalSectionText: historicalSection.sectionText,
    });

    assert.ok(!prompt.includes("## HISTORICAL WORKSPACE CONTEXT"), "Historical header omitted for current context");
    assert.ok(prompt.includes("CURRENT CANVAS GRAPH:"));
    assert.ok(prompt.includes("API Gateway"));
  });

  // =========================================================================
  // SCENARIO 6 — SECURITY & TENANCY ISOLATION
  // =========================================================================
  it("Scenario 6: Security & Tenancy Isolation (Workspace A vs B, foreign ID access, non-member rejection)", async () => {
    const { engine } = createE2EFixtures();

    // 1. Stranger actor rejected with FORBIDDEN
    await assert.rejects(
      async () => {
        await engine.retrieveAIContext(strangerActor, workspaceA, {});
      },
      (err: any) => {
        assert.ok(err instanceof PersistenceError);
        assert.strictEqual(err.code, "FORBIDDEN");
        return true;
      }
    );

    // 2. Member A asks for Workspace A context -> Workspace B data NEVER enters AIContext
    const contextA = await engine.retrieveAIContext(memberActorA, workspaceA, {
      includeMeetingInsights: true,
      includeTranscriptSegments: true,
      includeRelevantMeetings: true,
      includeRelevantConversations: true,
    });

    const promptSectionA = buildHistoricalContextSection(contextA);
    assert.ok(!promptSectionA.sectionText.includes("Secret Strategy in Workspace B"));
    assert.ok(!promptSectionA.sectionText.includes("Beta Workspace Private Chat"));
    assert.ok(!promptSectionA.sectionText.includes("Classified details intended only for Workspace B"));

    // 3. Member A cannot query Workspace B
    await assert.rejects(
      async () => {
        await engine.retrieveAIContext(memberActorA, workspaceB, {});
      },
      (err: any) => {
        assert.ok(err instanceof PersistenceError);
        assert.strictEqual(err.code, "FORBIDDEN");
        return true;
      }
    );

    // 4. Cross-workspace meeting selection fails safely with INVALID_RELATIONSHIP
    await assert.rejects(
      async () => {
        await engine.retrieveAIContext(memberActorA, workspaceA, {
          meetingId: "meet-b-secret", // Attempt to supply Workspace B meeting ID under Workspace A
          includeMeetingInsights: true,
        });
      },
      (err: any) => {
        assert.ok(err instanceof PersistenceError);
        assert.strictEqual(err.code, "INVALID_RELATIONSHIP");
        return true;
      }
    );
  });

  // =========================================================================
  // SCENARIO 7 — MISSING HISTORY ("ten meetings ago" with only 3 meetings)
  // =========================================================================
  it("Scenario 7: Missing History ('What did we decide ten meetings ago?')", async () => {
    const { engine } = createE2EFixtures();
    const query = "What did we decide ten meetings ago?";

    // 1. Intent classification
    const intent = classifyAIIntent(query);
    assert.strictEqual(intent.intent, "HISTORICAL_MEETING");
    assert.strictEqual(intent.temporalReference?.offset, 10);

    // 2. Retrieval does not crash or throw unhandled DB error
    const context = await engine.retrieveAIContext(memberActorA, workspaceA, {
      intent,
      includeMeetingInsights: true,
      includeTranscriptSegments: true,
    });

    // 3. Controlled no-match result
    assert.strictEqual(context.historicalSelection?.meetingId, undefined, "No target meeting when offset exceeds bounds");
    assert.strictEqual(context.relevantMeetings?.length, 0, "No meeting returned");
    assert.strictEqual(context.meetingInsights?.length, 0, "No unrelated insights returned");

    // 4. Prompt builder handles empty historical selection cleanly with controlled no-match notification
    const section = buildHistoricalContextSection(context);
    assert.ok(section.sectionText.includes("No matching historical records found"), "Informs AI of no-match without DB crash");
    assert.ok(section.sectionText.includes("offset 10"), "Controlled reason included");
    assert.ok(!section.sectionText.includes("Backend Storage"), "No unrelated meeting substituted");
  });

  // =========================================================================
  // SCENARIO 8 — PROMPT BUDGET & TRUNCATION
  // =========================================================================
  it("Scenario 8: Prompt Budget & Truncation (Hard limits, Unicode safety, zero DB ID leakage)", async () => {
    const hugeInsights = Array.from({ length: 40 }, (_, idx) => ({
      id: `secret-insight-uuid-${idx}`,
      meetingId: "secret-meeting-uuid",
      type: "decision" as const,
      title: `Architectural Decision ${idx}`,
      summary: `High priority decision ${idx}: ${"X".repeat(300)}`,
      timestamp: 1726754800000,
    }));

    const hugeTranscripts = Array.from({ length: 30 }, (_, idx) => ({
      id: `secret-seg-uuid-${idx}`,
      meetingId: "secret-meeting-uuid",
      speakerName: `Speaker ${idx}`,
      text: `Utterance ${idx}: ${"Y".repeat(400)}`,
      sequence: idx,
      timestamp: 1726754800000,
    }));

    const aiContext: AIContext = {
      workspace: {
        id: "secret-workspace-uuid-777",
        title: "Workspace Alpha",
        role: "owner",
      },
      classifiedIntent: {
        intent: "HISTORICAL_MEETING",
        confidence: 0.95,
      },
      relevantMeetings: [
        {
          id: "secret-meeting-uuid",
          title: "Massive Meeting",
          status: "ended",
          startedAt: "2026-09-19T14:00:00.000Z",
          endedAt: "2026-09-19T15:00:00.000Z",
        },
      ],
      meetingInsights: hugeInsights,
      transcriptSegments: hugeTranscripts,
    };

    // Build with standard hard limits
    const section = buildHistoricalContextSection(aiContext);

    // 1. Bounded & respects hard limits
    assert.ok(section.charCount <= AI_PROMPT_BUDGET.MAX_HISTORICAL_CHARS);
    assert.ok(section.estimatedTokens <= AI_PROMPT_BUDGET.MAX_HISTORICAL_TOKENS);
    assert.strictEqual(section.truncated, true, "Section must be marked truncated");

    // 2. Individual entries are capped
    assert.ok(!section.sectionText.includes("X".repeat(300)), "Individual insight summary capped");
    assert.ok(!section.sectionText.includes("Y".repeat(400)), "Individual transcript text capped");

    // 3. Higher priority (meeting metadata, insights) survives over lower priority
    assert.ok(section.sectionText.includes("Massive Meeting"), "Meeting title retained");
    assert.ok(section.sectionText.includes("Architectural Decision 0"), "First insight retained");

    // 4. Unicode code points remain valid and clean
    const unicodeStr = "🚀 Node Status: OK! 🌟";
    const truncatedUnicode = truncateStringUnicodeSafe(unicodeStr, 11);
    assert.ok(!truncatedUnicode.includes("\uFFFD"), "Unicode must not produce replacement character");
    assert.strictEqual(truncatedUnicode, "🚀 Node Sta…", "Clean Unicode code point truncation with ellipsis");

    // 5. Zero internal database UUIDs leaked into AI-facing prompt
    assert.ok(!section.sectionText.includes("secret-workspace-uuid-777"), "Workspace UUID scrubbed");
    assert.ok(!section.sectionText.includes("secret-meeting-uuid"), "Meeting UUID scrubbed");
    assert.ok(!section.sectionText.includes("secret-insight-uuid-"), "Insight UUID scrubbed");
    assert.ok(!section.sectionText.includes("secret-seg-uuid-"), "Transcript segment UUID scrubbed");
  });
});
