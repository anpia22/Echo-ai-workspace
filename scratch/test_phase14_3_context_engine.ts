/**
 * Phase 14.3: Targeted Verification Suite
 * Server AI Context Engine & Authorization Guard
 *
 * Verifies:
 * 1. Authenticated workspace member can retrieve context.
 * 2. Non-member cannot retrieve context (throws FORBIDDEN).
 * 3. Unauthenticated request is rejected (throws UNAUTHORIZED).
 * 4. Meeting from another workspace cannot enter context (Cross-workspace isolation).
 * 5. Conversation from another workspace cannot enter context (Cross-workspace isolation).
 * 6. Context engine never trusts workspace ownership supplied by client (authoritative DB check).
 * 7. Existing current-context behavior remains intact (in-memory canvas and messages).
 * 8. Explicit size and token bounds enforcement.
 * 9. Route level validation and authorization guard on /api/analyze.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AIContextEngine } from "../src/app/lib/ai/aiContextEngine";
import { AI_CONTEXT_BOUNDS } from "../src/app/lib/ai/aiContextTypes";
import { WorkspaceRepository } from "../src/app/lib/persistence/repositories/workspaceRepository";
import { ConversationRepository } from "../src/app/lib/persistence/repositories/conversationRepository";
import { MeetingRepository } from "../src/app/lib/persistence/repositories/meetingRepository";
import { CanvasRepository } from "../src/app/lib/persistence/repositories/canvasRepository";
import { PersistenceError } from "../src/app/lib/persistence/server/errors";
import type { PersistenceActor } from "../src/app/lib/persistence/server/auth";
import { POST as analyzeRoute } from "../src/app/api/analyze/route";

describe("Phase 14.3 — Server AI Context Engine & Authorization Guard", () => {
  const workspaceA = "11111111-1111-1111-1111-111111111111";
  const workspaceB = "22222222-2222-2222-2222-222222222222";

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
        description: "Primary workspace",
        revision: 3,
        created_at: "2026-09-17T00:00:00.000Z",
        updated_at: "2026-09-17T00:00:00.000Z",
      },
      {
        id: workspaceB,
        title: "Workspace Beta",
        description: "Isolated workspace",
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
        id: "conv-a-1",
        workspace_id: workspaceA,
        title: "Architecture Planning",
        created_at: "2026-09-17T01:00:00.000Z",
        updated_at: "2026-09-17T01:30:00.000Z",
      },
      {
        id: "conv-a-2",
        workspace_id: workspaceA,
        title: "Sprint Review",
        created_at: "2026-09-17T02:00:00.000Z",
        updated_at: "2026-09-17T02:30:00.000Z",
      },
      {
        id: "conv-b-secret",
        workspace_id: workspaceB,
        title: "Secret Strategy",
        created_at: "2026-09-17T03:00:00.000Z",
        updated_at: "2026-09-17T03:30:00.000Z",
      },
    ];

    const messagesTable: any[] = [
      {
        id: "msg-1",
        workspace_id: workspaceA,
        conversation_id: "conv-a-1",
        role: "user",
        content: "Let's review the graph data model",
        created_at: "2026-09-17T01:05:00.000Z",
        sequence: 1,
      },
      {
        id: "msg-2",
        workspace_id: workspaceA,
        conversation_id: "conv-a-1",
        role: "assistant",
        content: "Graph data model looks solid",
        created_at: "2026-09-17T01:06:00.000Z",
        sequence: 2,
      },
      {
        id: "msg-b-secret",
        workspace_id: workspaceB,
        conversation_id: "conv-b-secret",
        role: "user",
        content: "Classified conversation details",
        created_at: "2026-09-17T03:05:00.000Z",
        sequence: 1,
      },
    ];

    const meetingsTable: any[] = [
      {
        id: "meet-a-1",
        workspace_id: workspaceA,
        title: "Weekly Sync",
        status: "ended",
        started_at: "2026-09-17T10:00:00.000Z",
        ended_at: "2026-09-17T11:00:00.000Z",
        created_by: memberActor.userId,
        created_at: "2026-09-17T10:00:00.000Z",
        updated_at: "2026-09-17T11:00:00.000Z",
      },
      {
        id: "meet-b-secret",
        workspace_id: workspaceB,
        title: "Board Confidential",
        status: "ended",
        started_at: "2026-09-17T12:00:00.000Z",
        ended_at: "2026-09-17T13:00:00.000Z",
        created_by: "user-beta-owner",
        created_at: "2026-09-17T12:00:00.000Z",
        updated_at: "2026-09-17T13:00:00.000Z",
      },
    ];

    const transcriptTable: any[] = [
      {
        id: "seg-a-1",
        meeting_id: "meet-a-1",
        speaker_id: memberActor.userId,
        speaker_name: "Alice",
        text: "We finalized the persistence bridge.",
        timestamp: 1726567200000,
        sequence: 1,
        status: "final",
        source: "meeting",
        created_at: "2026-09-17T10:05:00.000Z",
      },
      {
        id: "seg-b-1",
        meeting_id: "meet-b-secret",
        speaker_id: "user-beta-owner",
        speaker_name: "Bob",
        text: "Top secret meeting transcript.",
        timestamp: 1726574400000,
        sequence: 1,
        status: "final",
        source: "meeting",
        created_at: "2026-09-17T12:05:00.000Z",
      },
    ];

    const insightsTable: any[] = [
      {
        id: "ins-a-1",
        meeting_id: "meet-a-1",
        type: "decision",
        title: "Freeze phase 14.2",
        summary: "Meeting bridge is frozen and verified.",
        source_segment_ids: ["seg-a-1"],
        speaker_ids: [memberActor.userId],
        timestamp: 1726567300000,
        confidence: 0.95,
        created_at: "2026-09-17T10:10:00.000Z",
      },
      {
        id: "ins-b-1",
        meeting_id: "meet-b-secret",
        type: "decision",
        title: "Confidential acquisition",
        summary: "Do not disclose.",
        source_segment_ids: ["seg-b-1"],
        speaker_ids: ["user-beta-owner"],
        timestamp: 1726574500000,
        confidence: 0.99,
        created_at: "2026-09-17T12:10:00.000Z",
      },
    ];

    const canvasNodesTable: any[] = [
      {
        id: "node-1",
        workspace_id: workspaceA,
        title: "API Gateway",
        node_type: "solution",
        description: "Handles external traffic",
        x: 100,
        y: 200,
        created_at: "2026-09-17T00:00:00.000Z",
        updated_at: "2026-09-17T00:00:00.000Z",
      },
    ];

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
      mockClient,
      engine,
      workspacesTable,
      membersTable,
      conversationsTable,
      messagesTable,
      meetingsTable,
      transcriptTable,
      insightsTable,
    };
  }

  describe("Workspace Member Authorization", () => {
    it("allows authenticated workspace member to retrieve structured context", async () => {
      const { engine } = createTestFixtures();

      const context = await engine.retrieveAIContext(memberActor, workspaceA, {
        conversationId: "conv-a-1",
        meetingId: "meet-a-1",
        includeRelevantConversations: true,
        includeRelevantMeetings: true,
      });

      assert.equal(context.workspace.id, workspaceA);
      assert.equal(context.workspace.title, "Workspace Alpha");
      assert.equal(context.workspace.role, "admin");

      // Conversations
      assert.equal(context.currentConversation?.id, "conv-a-1");
      assert.equal(context.currentConversation?.messages.length, 2);
      assert.equal(context.currentConversation?.messages[0].content, "Let's review the graph data model");

      // Relevant workspace conversations
      assert.equal(context.relevantConversations?.length, 2);
      assert.deepEqual(
        context.relevantConversations?.map((c) => c.id).sort(),
        ["conv-a-1", "conv-a-2"]
      );

      // Meetings
      assert.equal(context.relevantMeetings?.length, 1);
      assert.equal(context.relevantMeetings?.[0].id, "meet-a-1");

      // Transcripts & Insights
      assert.equal(context.transcriptSegments?.length, 1);
      assert.equal(context.transcriptSegments?.[0].text, "We finalized the persistence bridge.");
      assert.equal(context.meetingInsights?.length, 1);
      assert.equal(context.meetingInsights?.[0].title, "Freeze phase 14.2");
    });

    it("rejects non-member with FORBIDDEN error", async () => {
      const { engine } = createTestFixtures();

      await assert.rejects(
        async () => {
          await engine.retrieveAIContext(strangerActor, workspaceA);
        },
        (err: unknown) => {
          assert(err instanceof PersistenceError);
          assert.equal(err.code, "FORBIDDEN");
          assert(err.message.includes("is not a member of workspace"));
          return true;
        }
      );
    });

    it("rejects unauthenticated request with UNAUTHORIZED error", async () => {
      const { engine } = createTestFixtures();

      await assert.rejects(
        async () => {
          await engine.retrieveAIContext({ userId: "" } as any, workspaceA);
        },
        (err: unknown) => {
          assert(err instanceof PersistenceError);
          assert.equal(err.code, "UNAUTHORIZED");
          return true;
        }
      );

      await assert.rejects(
        async () => {
          await engine.retrieveAIContext(null as any, workspaceA);
        },
        (err: unknown) => {
          assert(err instanceof PersistenceError);
          assert.equal(err.code, "UNAUTHORIZED");
          return true;
        }
      );
    });

    it("rejects invalid workspaceId format with VALIDATION_ERROR", async () => {
      const { engine } = createTestFixtures();

      await assert.rejects(
        async () => {
          await engine.retrieveAIContext(memberActor, "not-a-uuid");
        },
        (err: unknown) => {
          assert(err instanceof PersistenceError);
          assert.equal(err.code, "VALIDATION_ERROR");
          return true;
        }
      );
    });
  });

  describe("Cross-Workspace Isolation & Tenancy Defense", () => {
    it("never lets meeting from another workspace enter context", async () => {
      const { engine } = createTestFixtures();

      // Attempt to retrieve meeting from Workspace B under Workspace A
      await assert.rejects(
        async () => {
          await engine.retrieveAIContext(memberActor, workspaceA, {
            meetingId: "meet-b-secret",
            includeMeetingInsights: true,
            includeTranscriptSegments: true,
          });
        },
        (err: unknown) => {
          assert(err instanceof PersistenceError);
          assert.equal(err.code, "INVALID_RELATIONSHIP");
          assert(err.message.includes("belongs to workspace"));
          return true;
        }
      );

      // Verify general meeting retrieval never leaks Workspace B meetings
      const context = await engine.retrieveAIContext(memberActor, workspaceA, {
        includeRelevantMeetings: true,
      });

      const meetingIds = context.relevantMeetings?.map((m) => m.id) || [];
      assert.ok(!meetingIds.includes("meet-b-secret"), "Confidential meeting leaked across workspaces!");
    });

    it("never lets conversation from another workspace enter context", async () => {
      const { engine } = createTestFixtures();

      // Attempt to retrieve conversation from Workspace B under Workspace A
      await assert.rejects(
        async () => {
          await engine.retrieveAIContext(memberActor, workspaceA, {
            conversationId: "conv-b-secret",
          });
        },
        (err: unknown) => {
          assert(err instanceof PersistenceError);
          assert.equal(err.code, "NOT_FOUND");
          return true;
        }
      );

      // Verify general conversation list never leaks Workspace B conversations
      const context = await engine.retrieveAIContext(memberActor, workspaceA, {
        includeRelevantConversations: true,
      });

      const convIds = context.relevantConversations?.map((c) => c.id) || [];
      assert.ok(!convIds.includes("conv-b-secret"), "Confidential conversation leaked across workspaces!");
    });

    it("derives membership strictly from DB and never trusts client claims", async () => {
      const { engine } = createTestFixtures();

      // Even if an attacker claims to be 'owner' of Workspace B, the engine queries DB
      await assert.rejects(
        async () => {
          await engine.retrieveAIContext(memberActor, workspaceB);
        },
        (err: unknown) => {
          assert(err instanceof PersistenceError);
          assert.equal(err.code, "FORBIDDEN");
          return true;
        }
      );
    });
  });

  describe("Current Context Preservation", () => {
    it("preserves in-memory canvas and recent conversation messages", async () => {
      const { engine } = createTestFixtures();

      const inMemoryCanvas = {
        nodes: [
          { id: "node-mem-1", title: "Memory Node", nodeType: "idea", description: "In-memory concept" },
        ],
        edges: [
          { sourceTitle: "Memory Node", targetTitle: "API Gateway", relationship: "depends on" },
        ],
      };

      const inMemoryMessages = [
        { role: "user" as const, content: "Can you analyze this design?" },
        { role: "assistant" as const, content: "Sure, let's look at the edges." },
      ];

      const context = await engine.retrieveAIContext(memberActor, workspaceA, {
        inMemoryCanvas,
        inMemoryMessages,
      });

      // Canvas preserved
      assert.equal(context.currentCanvas?.nodeCount, 1);
      assert.equal(context.currentCanvas?.nodes[0].title, "Memory Node");
      assert.equal(context.currentCanvas?.edges[0].relationship, "depends on");

      // In-memory messages preserved
      assert.equal(context.recentConversationMessages?.length, 2);
      assert.equal(context.recentConversationMessages?.[0].content, "Can you analyze this design?");
      assert.equal(context.recentConversationMessages?.[1].content, "Sure, let's look at the edges.");
    });
  });

  describe("Size & Token Safety Bounds", () => {
    it("strictly bounds conversations, meetings, insights, and messages", async () => {
      const { engine, conversationsTable, messagesTable, meetingsTable, transcriptTable, insightsTable } =
        createTestFixtures();

      // Populate 20 conversations, 20 meetings, 50 messages, 50 transcripts, 50 insights
      for (let i = 10; i < 30; i++) {
        conversationsTable.push({
          id: `conv-bulk-${i}`,
          workspace_id: workspaceA,
          title: `Bulk Conversation ${i}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        meetingsTable.push({
          id: `meet-bulk-${i}`,
          workspace_id: workspaceA,
          title: `Bulk Meeting ${i}`,
          status: "ended",
          started_at: new Date().toISOString(),
          ended_at: new Date().toISOString(),
          created_by: memberActor.userId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      for (let i = 10; i < 60; i++) {
        messagesTable.push({
          id: `msg-bulk-${i}`,
          workspace_id: workspaceA,
          conversation_id: "conv-a-1",
          role: "user",
          content: `Bulk message ${i}`,
          created_at: new Date().toISOString(),
          sequence: i,
        });
        transcriptTable.push({
          id: `seg-bulk-${i}`,
          meeting_id: "meet-a-1",
          speaker_id: memberActor.userId,
          speaker_name: "Alice",
          text: `Bulk segment text ${i}`,
          timestamp: 1726567200000 + i,
          sequence: i,
          status: "final",
          source: "meeting",
          created_at: new Date().toISOString(),
        });
        insightsTable.push({
          id: `ins-bulk-${i}`,
          meeting_id: "meet-a-1",
          type: "task",
          title: `Bulk insight ${i}`,
          summary: `Summary ${i}`,
          source_segment_ids: [],
          speaker_ids: [],
          timestamp: 1726567200000 + i,
          created_at: new Date().toISOString(),
        });
      }

      // Default bounds test
      const context = await engine.retrieveAIContext(memberActor, workspaceA, {
        conversationId: "conv-a-1",
        meetingId: "meet-a-1",
        includeRelevantConversations: true,
        includeRelevantMeetings: true,
      });

      assert.equal(context.relevantConversations?.length, AI_CONTEXT_BOUNDS.MAX_CONVERSATIONS);
      assert.equal(context.relevantMeetings?.length, AI_CONTEXT_BOUNDS.MAX_MEETINGS);
      assert.equal(
        context.currentConversation?.messages.length,
        AI_CONTEXT_BOUNDS.MAX_MESSAGES_PER_CONVERSATION
      );
      assert.equal(context.transcriptSegments?.length, AI_CONTEXT_BOUNDS.MAX_TRANSCRIPT_SEGMENTS);
      assert.equal(context.meetingInsights?.length, AI_CONTEXT_BOUNDS.MAX_INSIGHTS);

      // Custom bounds override test
      const customBoundedContext = await engine.retrieveAIContext(memberActor, workspaceA, {
        conversationId: "conv-a-1",
        meetingId: "meet-a-1",
        bounds: {
          maxConversations: 2,
          maxMeetings: 2,
          maxMessagesPerConversation: 3,
          maxTranscriptSegments: 4,
          maxInsights: 5,
        },
      });

      assert.equal(customBoundedContext.relevantConversations?.length, 2);
      assert.equal(customBoundedContext.relevantMeetings?.length, 2);
      assert.equal(customBoundedContext.currentConversation?.messages.length, 3);
      assert.equal(customBoundedContext.transcriptSegments?.length, 4);
      assert.equal(customBoundedContext.meetingInsights?.length, 5);
    });
  });

  describe("API Route Guard Validation (/api/analyze)", () => {
    it("rejects invalid workspaceId UUID format with status 400", async () => {
      const req = new Request("http://localhost/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: "Add a solution node",
          workspaceId: "not-a-valid-uuid",
        }),
      });

      const res = await analyzeRoute(req);
      assert.equal(res.status, 400);
      const json = await res.json();
      assert.equal(json.error.code, "VALIDATION_ERROR");
      assert.ok(json.error.message.includes("Invalid workspace ID format"));
    });

    it("rejects missing or empty transcript with status 400", async () => {
      const req = new Request("http://localhost/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: "",
          workspaceId: workspaceA,
        }),
      });

      const res = await analyzeRoute(req);
      assert.equal(res.status, 400);
      const json = await res.json();
      assert.ok(json.error.includes("Transcript is required"));
    });
  });
});
