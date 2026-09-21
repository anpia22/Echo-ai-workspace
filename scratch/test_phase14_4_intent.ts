/**
 * Phase 14.4: Targeted Verification Suite
 * Temporal & Historical Intent Classification & Retrieval Selection
 *
 * Verifies:
 * 1. "What did we discuss in our last meeting?" -> HISTORICAL_MEETING (LAST_MEETING)
 * 2. "What did we decide three meetings ago?" -> HISTORICAL_MEETING (MEETING_OFFSET, offset: 3)
 * 3. "Show decisions from last week's meeting." -> HISTORICAL_MEETING (TIME_WINDOW)
 * 4. "What did we talk about regarding authentication?" -> HISTORICAL_TOPIC (topic: "authentication")
 * 5. "What were our previous conversations about the dashboard?" -> HISTORICAL_CONVERSATION (topic: "dashboard")
 * 6. "Summarize our recent conversation." -> RECENT_CONVERSATION
 * 7. "Create a node for authentication." -> CURRENT_CONTEXT
 * 8. "Move this node." -> CURRENT_CONTEXT
 * 9. Unknown/ambiguous request falls back safely to CURRENT_CONTEXT.
 * 10. Historical intent cannot bypass workspace authorization (FORBIDDEN for non-member).
 * 11. Missing historical meeting produces a controlled no-match result without crashing.
 * 12. End-to-end intent-driven context retrieval via AIContextEngine.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyAIIntent, extractTopic, extractTemporalReference } from "../src/app/lib/ai/aiIntentClassifier";
import { AIContextEngine } from "../src/app/lib/ai/aiContextEngine";
import { WorkspaceRepository } from "../src/app/lib/persistence/repositories/workspaceRepository";
import { ConversationRepository } from "../src/app/lib/persistence/repositories/conversationRepository";
import { MeetingRepository } from "../src/app/lib/persistence/repositories/meetingRepository";
import { CanvasRepository } from "../src/app/lib/persistence/repositories/canvasRepository";
import { PersistenceError } from "../src/app/lib/persistence/server/errors";
import type { PersistenceActor } from "../src/app/lib/persistence/server/auth";

describe("Phase 14.4 — Temporal & Historical Intent Classification", () => {
  const workspaceA = "11111111-1111-1111-1111-111111111111";

  const memberActor: PersistenceActor = {
    userId: "user-member-alpha",
  };

  const strangerActor: PersistenceActor = {
    userId: "user-stranger-omega",
  };

  function createTestFixtures() {
    const workspacesTable: any[] = [
      {
        id: workspaceA,
        title: "Workspace Alpha",
        revision: 1,
        created_at: "2026-09-17T00:00:00.000Z",
        updated_at: "2026-09-17T00:00:00.000Z",
      },
    ];

    const membersTable: any[] = [
      {
        workspace_id: workspaceA,
        user_id: memberActor.userId,
        role: "admin",
      },
    ];

    const conversationsTable: any[] = [
      {
        id: "conv-dashboard-1",
        workspace_id: workspaceA,
        title: "Discussions regarding the dashboard metrics",
        created_at: "2026-09-17T01:00:00.000Z",
        updated_at: "2026-09-17T01:30:00.000Z",
      },
      {
        id: "conv-auth-1",
        workspace_id: workspaceA,
        title: "Authentication architecture and JWT tokens",
        created_at: "2026-09-17T02:00:00.000Z",
        updated_at: "2026-09-17T02:30:00.000Z",
      },
    ];

    const messagesTable: any[] = [
      {
        id: "msg-dash-1",
        workspace_id: workspaceA,
        conversation_id: "conv-dashboard-1",
        role: "user",
        content: "We should display weekly active nodes on the dashboard",
        created_at: "2026-09-17T01:05:00.000Z",
        sequence: 1,
      },
    ];

    // Chronologically ordered meetings (started_at DESC: meet-1 is latest, meet-2 is 2nd ago, meet-3 is 3rd ago)
    const meetingsTable: any[] = [
      {
        id: "meet-1",
        workspace_id: workspaceA,
        title: "Latest Release Sync",
        status: "ended",
        started_at: "2026-09-17T14:00:00.000Z",
        ended_at: "2026-09-17T15:00:00.000Z",
        created_by: memberActor.userId,
        created_at: "2026-09-17T14:00:00.000Z",
        updated_at: "2026-09-17T15:00:00.000Z",
      },
      {
        id: "meet-2",
        workspace_id: workspaceA,
        title: "Sprint Planning",
        status: "ended",
        started_at: "2026-09-17T12:00:00.000Z",
        ended_at: "2026-09-17T13:00:00.000Z",
        created_by: memberActor.userId,
        created_at: "2026-09-17T12:00:00.000Z",
        updated_at: "2026-09-17T13:00:00.000Z",
      },
      {
        id: "meet-3",
        workspace_id: workspaceA,
        title: "Deep Architecture Review",
        status: "ended",
        started_at: "2026-09-17T09:00:00.000Z",
        ended_at: "2026-09-17T10:00:00.000Z",
        created_by: memberActor.userId,
        created_at: "2026-09-17T09:00:00.000Z",
        updated_at: "2026-09-17T10:00:00.000Z",
      },
    ];

    const transcriptTable: any[] = [
      {
        id: "seg-1",
        meeting_id: "meet-1",
        speaker_id: memberActor.userId,
        speaker_name: "Alice",
        text: "In this latest meeting we deployed v1.0.",
        timestamp: 1726581600000,
        sequence: 1,
        status: "final",
        source: "meeting",
        created_at: "2026-09-17T14:05:00.000Z",
      },
      {
        id: "seg-3",
        meeting_id: "meet-3",
        speaker_id: memberActor.userId,
        speaker_name: "Bob",
        text: "Three meetings ago we chose Supabase and Nemotron.",
        timestamp: 1726563600000,
        sequence: 1,
        status: "final",
        source: "meeting",
        created_at: "2026-09-17T09:05:00.000Z",
      },
    ];

    const insightsTable: any[] = [
      {
        id: "ins-1",
        meeting_id: "meet-1",
        type: "decision",
        title: "v1.0 Deployed",
        summary: "Shipped the primary MVP milestone.",
        source_segment_ids: ["seg-1"],
        speaker_ids: [memberActor.userId],
        timestamp: 1726581900000,
        created_at: "2026-09-17T14:10:00.000Z",
      },
      {
        id: "ins-3",
        meeting_id: "meet-3",
        type: "decision",
        title: "Adopted Nemotron and Supabase",
        summary: "Decided three meetings ago to freeze architecture.",
        source_segment_ids: ["seg-3"],
        speaker_ids: [memberActor.userId],
        timestamp: 1726563900000,
        created_at: "2026-09-17T09:10:00.000Z",
      },
      {
        id: "ins-auth",
        meeting_id: "meet-1",
        type: "problem",
        title: "Authentication Token Expiry",
        summary: "We discussed authentication token refresh race conditions.",
        source_segment_ids: ["seg-1"],
        speaker_ids: [memberActor.userId],
        timestamp: 1726582000000,
        created_at: "2026-09-17T14:15:00.000Z",
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

    return {
      engine,
      meetingsTable,
    };
  }

  // ==========================================
  // Part A: Intent Classification Unit Tests
  // ==========================================
  describe("Intent Classification Rules", () => {
    it("1. classifies 'What did we discuss in our last meeting?' as HISTORICAL_MEETING", () => {
      const result = classifyAIIntent("What did we discuss in our last meeting?");
      assert.equal(result.intent, "HISTORICAL_MEETING");
      assert.equal(result.temporalReference?.type, "LAST_MEETING");
      assert.equal(result.temporalReference?.offset, 1);
    });

    it("2. classifies 'What did we decide three meetings ago?' as HISTORICAL_MEETING with offset 3", () => {
      const result = classifyAIIntent("What did we decide three meetings ago?");
      assert.equal(result.intent, "HISTORICAL_MEETING");
      assert.equal(result.temporalReference?.type, "MEETING_OFFSET");
      assert.equal(result.temporalReference?.offset, 3);
    });

    it("3. classifies 'Show decisions from last week's meeting.' as HISTORICAL_MEETING", () => {
      const result = classifyAIIntent("Show decisions from last week's meeting.");
      assert.equal(result.intent, "HISTORICAL_MEETING");
      assert.equal(result.temporalReference?.type, "TIME_WINDOW");
      assert.equal(result.temporalReference?.windowDays, 7);
    });

    it("4. classifies 'What did we talk about regarding authentication?' as HISTORICAL_TOPIC with topic 'authentication'", () => {
      const result = classifyAIIntent("What did we talk about regarding authentication?");
      assert.equal(result.intent, "HISTORICAL_TOPIC");
      assert.equal(result.topic, "authentication");
    });

    it("5. classifies 'What were our previous conversations about the dashboard?' as historical conversation intent with topic 'dashboard'", () => {
      const result = classifyAIIntent("What were our previous conversations about the dashboard?");
      assert.equal(result.intent, "HISTORICAL_CONVERSATION");
      assert.equal(result.topic, "dashboard");
      assert.equal(result.temporalReference?.type, "PREVIOUS_CONVERSATIONS");
    });

    it("6. classifies 'Summarize our recent conversation.' as RECENT_CONVERSATION", () => {
      const result = classifyAIIntent("Summarize our recent conversation.");
      assert.equal(result.intent, "RECENT_CONVERSATION");
    });

    it("7. classifies 'Create a node for authentication.' as CURRENT_CONTEXT (imperative canvas command)", () => {
      const result = classifyAIIntent("Create a node for authentication.");
      assert.equal(result.intent, "CURRENT_CONTEXT");
    });

    it("8. classifies 'Move this node.' as CURRENT_CONTEXT", () => {
      const result = classifyAIIntent("Move this node.");
      assert.equal(result.intent, "CURRENT_CONTEXT");

      const resultRight = classifyAIIntent("Move this node to the right.");
      assert.equal(resultRight.intent, "CURRENT_CONTEXT");
    });

    it("9. falls back safely to CURRENT_CONTEXT for unknown or conversational input", () => {
      const resultGreeting = classifyAIIntent("Hello Echo! How are you doing today?");
      assert.equal(resultGreeting.intent, "CURRENT_CONTEXT");

      const resultGeneral = classifyAIIntent("Tell me a creative idea.");
      assert.equal(resultGeneral.intent, "CURRENT_CONTEXT");

      const resultEmpty = classifyAIIntent("");
      assert.equal(resultEmpty.intent, "CURRENT_CONTEXT");
    });
  });

  // ==========================================
  // Part B: Intent-Driven Retrieval & Security
  // ==========================================
  describe("Intent-Driven Retrieval Routing & Security", () => {
    it("10. enforces workspace authorization for historical intent (rejects non-member with FORBIDDEN)", async () => {
      const { engine } = createTestFixtures();
      const intent = classifyAIIntent("What did we discuss in our last meeting?");

      await assert.rejects(
        async () => {
          await engine.retrieveAIContext(strangerActor, workspaceA, { intent });
        },
        (err: unknown) => {
          assert(err instanceof PersistenceError);
          assert.equal(err.code, "FORBIDDEN");
          return true;
        }
      );
    });

    it("11. produces a controlled no-match result when requested historical meeting does not exist", async () => {
      const { engine } = createTestFixtures();
      // Request 10 meetings ago, but workspace only has 3 meetings
      const intent = classifyAIIntent("What did we decide ten meetings ago?");
      assert.equal(intent.temporalReference?.offset, 10);

      const context = await engine.retrieveAIContext(memberActor, workspaceA, { intent });

      assert.equal(context.workspace.id, workspaceA);
      assert.equal(context.historicalSelection?.matched, false);
      assert.equal(context.historicalSelection?.offset, 10);
      assert.ok(context.historicalSelection?.reason?.includes("No meeting found for offset 10"));
      assert.equal(context.relevantMeetings?.length, 0);
      assert.equal(context.meetingInsights?.length, 0);
      assert.equal(context.transcriptSegments?.length, 0);
    });

    it("12. retrieves the exact targeted meeting for 'three meetings ago'", async () => {
      const { engine } = createTestFixtures();
      const intent = classifyAIIntent("What did we decide three meetings ago?");
      assert.equal(intent.temporalReference?.offset, 3);

      const context = await engine.retrieveAIContext(memberActor, workspaceA, { intent });

      assert.equal(context.historicalSelection?.matched, true);
      assert.equal(context.historicalSelection?.meetingId, "meet-3");
      assert.equal(context.historicalSelection?.meetingTitle, "Deep Architecture Review");
      assert.equal(context.relevantMeetings?.length, 1);
      assert.equal(context.relevantMeetings?.[0].id, "meet-3");
      assert.equal(context.transcriptSegments?.length, 1);
      assert.equal(context.transcriptSegments?.[0].text, "Three meetings ago we chose Supabase and Nemotron.");
      assert.equal(context.meetingInsights?.length, 1);
      assert.equal(context.meetingInsights?.[0].title, "Adopted Nemotron and Supabase");
    });

    it("13. retrieves matching topic insights for 'What did we talk about regarding authentication?'", async () => {
      const { engine } = createTestFixtures();
      const intent = classifyAIIntent("What did we talk about regarding authentication?");
      assert.equal(intent.intent, "HISTORICAL_TOPIC");
      assert.equal(intent.topic, "authentication");

      const context = await engine.retrieveAIContext(memberActor, workspaceA, { intent });

      assert.equal(context.historicalSelection?.matched, true);
      assert.equal(context.historicalSelection?.topic, "authentication");
      // Matches ins-auth and conv-auth-1
      assert.ok((context.meetingInsights?.length ?? 0) >= 1);
      assert.equal(context.meetingInsights?.[0].title, "Authentication Token Expiry");
      assert.ok((context.relevantConversations?.length ?? 0) >= 1);
      assert.equal(context.relevantConversations?.[0].id, "conv-auth-1");
    });
  });
});
