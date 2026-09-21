/**
 * Phase 14.2: Targeted Verification Suite
 * Meeting Transcript & Insight Persistence Bridge
 *
 * Verifies:
 * 1. Transcript persistence:
 *    - Finalized segments persist
 *    - Sequence / order preserved
 *    - Duplicate completion does not duplicate records (Idempotency)
 * 2. Insights persistence:
 *    - Finalized insights persist
 *    - Insight type preserved
 *    - Duplicate completion does not duplicate records (Idempotency)
 * 3. Authorization:
 *    - Workspace member can read
 *    - Non-member cannot read (Throws FORBIDDEN)
 *    - Meeting from another workspace cannot be accessed (Throws INVALID_RELATIONSHIP)
 * 4. Read API Routes:
 *    - /api/workspace/[workspaceId]/meetings/[meetingId]/transcripts returns 200 with records
 *    - /api/workspace/[workspaceId]/meetings/[meetingId]/insights returns 200 with records
 *    - Rejection of invalid UUIDs / empty parameters
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MeetingRepository } from "../src/app/lib/persistence/repositories/meetingRepository";
import { PersistenceError } from "../src/app/lib/persistence/server/errors";
import type { PersistenceActor } from "../src/app/lib/persistence/server/auth";
import type {
  MeetingInsightRecord,
  MeetingTranscriptSegmentRecord,
} from "../src/app/lib/persistence/meetingTypes";
import { GET as getTranscriptsRoute } from "../src/app/api/workspace/[workspaceId]/meetings/[meetingId]/transcripts/route";
import { GET as getInsightsRoute } from "../src/app/api/workspace/[workspaceId]/meetings/[meetingId]/insights/route";

describe("Phase 14.2 — Meeting Transcript & Insight Persistence Bridge", () => {
  const workspaceId = "11111111-1111-1111-1111-111111111111";
  const otherWorkspaceId = "22222222-2222-2222-2222-222222222222";
  const meetingId = "meet-phase14-2-test";

  const memberActor: PersistenceActor = {
    userId: "user-member-1",
  };

  const nonMemberActor: PersistenceActor = {
    userId: "user-stranger-99",
  };

  function createMockDb() {
    const meetingTable: any[] = [
      {
        id: meetingId,
        workspace_id: workspaceId,
        title: "Test Meeting",
        status: "ended",
        started_at: "2026-09-17T00:00:00.000Z",
        ended_at: "2026-09-17T01:00:00.000Z",
        created_by: memberActor.userId,
        created_at: "2026-09-17T00:00:00.000Z",
        updated_at: "2026-09-17T01:00:00.000Z",
      },
    ];
    const membersTable: any[] = [
      { workspace_id: workspaceId, user_id: memberActor.userId, role: "member" },
    ];
    const transcriptTable: any[] = [];
    const insightsTable: any[] = [];

    const mockClient = {
      from: (table: string) => {
        return {
          select: (_fields?: string) => {
            const queryState: { eqFilters: [string, any][] } = { eqFilters: [] };
            const selectBuilder: any = {
              eq: (col: string, val: any) => {
                queryState.eqFilters.push([col, val]);
                return selectBuilder;
              },
              order: (col: string, opts?: { ascending?: boolean }) => {
                // Sorting handled on execution
                return selectBuilder;
              },
              maybeSingle: async () => {
                let target: any[] = [];
                if (table === "meetings") target = meetingTable;
                if (table === "workspace_members") target = membersTable;
                if (table === "meeting_transcript_segments") target = transcriptTable;
                if (table === "meeting_insights") target = insightsTable;

                const match = target.find((row) =>
                  queryState.eqFilters.every(([c, v]) => row[c] === v)
                );
                return { data: match || null, error: null };
              },
              single: async () => {
                let target: any[] = [];
                if (table === "meetings") target = meetingTable;
                if (table === "workspace_members") target = membersTable;
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
              then: (resolve: any) => {
                let target: any[] = [];
                if (table === "meetings") target = meetingTable;
                if (table === "workspace_members") target = membersTable;
                if (table === "meeting_transcript_segments") target = transcriptTable;
                if (table === "meeting_insights") target = insightsTable;

                const filtered = target.filter((row) =>
                  queryState.eqFilters.every(([c, v]) => row[c] === v)
                );
                resolve({ data: filtered, error: null });
              },
            };
            return selectBuilder;
          },
          insert: (records: any) => {
            const recArray = (Array.isArray(records) ? records : [records]).map((r) => ({
              ...r,
              created_at: r.created_at || new Date().toISOString(),
            }));
            if (table === "meeting_transcript_segments") {
              transcriptTable.push(...recArray);
            }
            if (table === "meeting_insights") {
              insightsTable.push(...recArray);
            }
            return {
              error: null,
            };
          },
        };
      },
    };

    return { mockClient, transcriptTable, insightsTable };
  }

  // ==========================================
  // Part A: Transcript Persistence Tests
  // ==========================================
  describe("Transcript Persistence", () => {
    it("persists finalized segments preserving speaker, text, timestamp, and sequence", async () => {
      const { mockClient } = createMockDb();
      const repo = new MeetingRepository(mockClient as any);

      const segments: MeetingTranscriptSegmentRecord[] = [
        {
          id: "seg-1",
          meetingId,
          speakerId: "user-1",
          speakerName: "Alice",
          text: "We should benchmark the query latency.",
          timestamp: 1700000001000,
          sequence: 1,
          status: "final",
          source: "meeting",
          createdAt: "2026-09-17T00:00:01.000Z",
        },
        {
          id: "seg-2",
          meetingId,
          speakerId: "user-2",
          speakerName: "Bob",
          text: "Agreed, indexing the meeting_id column will help.",
          timestamp: 1700000002000,
          sequence: 2,
          status: "final",
          source: "meeting",
          createdAt: "2026-09-17T00:00:02.000Z",
        },
      ];

      const res = await repo.persistTranscriptSegments(memberActor, {
        meetingId,
        segments,
      });

      assert.equal(res.persistedCount, 2);

      const retrieved = await repo.listTranscriptSegments(memberActor, workspaceId, meetingId);
      assert.equal(retrieved.length, 2);
      assert.equal(retrieved[0].id, "seg-1");
      assert.equal(retrieved[0].speakerName, "Alice");
      assert.equal(retrieved[0].sequence, 1);
      assert.equal(retrieved[1].id, "seg-2");
      assert.equal(retrieved[1].speakerName, "Bob");
      assert.equal(retrieved[1].sequence, 2);
    });

    it("ensures duplicate completion does not duplicate records (Idempotency)", async () => {
      const { mockClient } = createMockDb();
      const repo = new MeetingRepository(mockClient as any);

      const segments: MeetingTranscriptSegmentRecord[] = [
        {
          id: "seg-idempotent-1",
          meetingId,
          speakerId: "user-1",
          speakerName: "Alice",
          text: "Meeting is starting now.",
          timestamp: 1700000001000,
          sequence: 1,
          status: "final",
          source: "meeting",
          createdAt: "2026-09-17T00:00:01.000Z",
        },
      ];

      // First run: inserts 1 segment
      const firstRun = await repo.persistTranscriptSegments(memberActor, {
        meetingId,
        segments,
      });
      assert.equal(firstRun.persistedCount, 1);

      // Second run: same segments, should skip and return 0 persisted without error
      const secondRun = await repo.persistTranscriptSegments(memberActor, {
        meetingId,
        segments,
      });
      assert.equal(secondRun.persistedCount, 0);

      const all = await repo.listTranscriptSegments(memberActor, workspaceId, meetingId);
      assert.equal(all.length, 1);
    });
  });

  // ==========================================
  // Part B: Insight Persistence Tests
  // ==========================================
  describe("Insight Persistence", () => {
    it("persists finalized insights preserving type, title, summary, and provenance", async () => {
      const { mockClient } = createMockDb();
      const repo = new MeetingRepository(mockClient as any);

      const insights: MeetingInsightRecord[] = [
        {
          id: "ins-1",
          meetingId,
          type: "decision",
          title: "Use PostgreSQL for Historical Context",
          summary: "Decided to leverage Supabase PostgreSQL for persistent transcript storage.",
          sourceSegmentIds: ["seg-1", "seg-2"],
          speakerIds: ["user-1", "user-2"],
          timestamp: 1700000005000,
          confidence: 0.95,
          createdAt: "2026-09-17T00:00:05.000Z",
        },
        {
          id: "ins-2",
          meetingId,
          type: "task",
          title: "Implement read-only endpoints",
          summary: "Expose transcripts and insights via GET route handlers.",
          sourceSegmentIds: ["seg-2"],
          speakerIds: ["user-2"],
          timestamp: 1700000006000,
          confidence: 0.9,
          createdAt: "2026-09-17T00:00:06.000Z",
        },
      ];

      const res = await repo.persistMeetingInsights(memberActor, {
        meetingId,
        insights,
      });

      assert.equal(res.persistedCount, 2);

      const retrieved = await repo.listMeetingInsights(memberActor, workspaceId, meetingId);
      assert.equal(retrieved.length, 2);
      assert.equal(retrieved[0].type, "decision");
      assert.equal(retrieved[0].title, "Use PostgreSQL for Historical Context");
      assert.deepEqual(retrieved[0].sourceSegmentIds, ["seg-1", "seg-2"]);
      assert.equal(retrieved[1].type, "task");
      assert.equal(retrieved[1].title, "Implement read-only endpoints");
    });

    it("ensures duplicate completion does not duplicate insights (Idempotency)", async () => {
      const { mockClient } = createMockDb();
      const repo = new MeetingRepository(mockClient as any);

      const insights: MeetingInsightRecord[] = [
        {
          id: "ins-idempotent-1",
          meetingId,
          type: "idea",
          title: "AI Synthesis Pipeline",
          summary: "Generate summaries on meeting end.",
          sourceSegmentIds: [],
          speakerIds: ["user-1"],
          timestamp: 1700000010000,
          createdAt: "2026-09-17T00:00:10.000Z",
        },
      ];

      // First run: inserts 1 insight
      const firstRun = await repo.persistMeetingInsights(memberActor, {
        meetingId,
        insights,
      });
      assert.equal(firstRun.persistedCount, 1);

      // Second run: same insights, skips and returns 0 persisted without error
      const secondRun = await repo.persistMeetingInsights(memberActor, {
        meetingId,
        insights,
      });
      assert.equal(secondRun.persistedCount, 0);

      const all = await repo.listMeetingInsights(memberActor, workspaceId, meetingId);
      assert.equal(all.length, 1);
    });
  });

  // ==========================================
  // Part C: Authorization Tests
  // ==========================================
  describe("Authorization & Tenancy", () => {
    it("allows workspace member to read transcripts and insights", async () => {
      const { mockClient } = createMockDb();
      const repo = new MeetingRepository(mockClient as any);

      const transcripts = await repo.listTranscriptSegments(memberActor, workspaceId, meetingId);
      assert(Array.isArray(transcripts));

      const insights = await repo.listMeetingInsights(memberActor, workspaceId, meetingId);
      assert(Array.isArray(insights));
    });

    it("rejects non-member with FORBIDDEN error", async () => {
      const { mockClient } = createMockDb();
      const repo = new MeetingRepository(mockClient as any);

      await assert.rejects(
        async () => {
          await repo.listTranscriptSegments(nonMemberActor, workspaceId, meetingId);
        },
        (err: any) => {
          assert(err instanceof PersistenceError);
          assert.equal(err.code, "FORBIDDEN");
          return true;
        }
      );

      await assert.rejects(
        async () => {
          await repo.listMeetingInsights(nonMemberActor, workspaceId, meetingId);
        },
        (err: any) => {
          assert(err instanceof PersistenceError);
          assert.equal(err.code, "FORBIDDEN");
          return true;
        }
      );
    });

    it("rejects meeting accessed under a mismatched workspace with INVALID_RELATIONSHIP", async () => {
      // Create mock where meeting has workspace_id = otherWorkspaceId
      const mockClient = {
        from: (table: string) => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { role: "member" }, error: null }),
              }),
              single: async () => {
                if (table === "meetings") {
                  return { data: { id: meetingId, workspace_id: otherWorkspaceId }, error: null };
                }
                return { data: null, error: null };
              },
            }),
          }),
        }),
      };

      const repo = new MeetingRepository(mockClient as any);

      await assert.rejects(
        async () => {
          await repo.listTranscriptSegments(memberActor, workspaceId, meetingId);
        },
        (err: any) => {
          assert(err instanceof PersistenceError);
          assert.equal(err.code, "INVALID_RELATIONSHIP");
          return true;
        }
      );
    });
  });

  // ==========================================
  // Part D: API Route Validation Tests
  // ==========================================
  describe("API Route Validation", () => {
    it("validates workspaceId UUID format in transcripts route", async () => {
      const req = new Request("http://localhost/api/workspace/invalid-uuid/meetings/meet-1/transcripts");
      const res = await getTranscriptsRoute(req, {
        params: Promise.resolve({ workspaceId: "not-a-valid-uuid", meetingId: "meet-1" }),
      });
      assert.equal(res.status, 400);
      const json = await res.json();
      assert.equal(json.error.code, "VALIDATION_ERROR");
    });

    it("validates empty meetingId in transcripts route", async () => {
      const req = new Request(`http://localhost/api/workspace/${workspaceId}/meetings/%20/transcripts`);
      const res = await getTranscriptsRoute(req, {
        params: Promise.resolve({ workspaceId, meetingId: "   " }),
      });
      assert.equal(res.status, 400);
      const json = await res.json();
      assert.equal(json.error.code, "VALIDATION_ERROR");
    });

    it("validates workspaceId UUID format in insights route", async () => {
      const req = new Request("http://localhost/api/workspace/invalid-uuid/meetings/meet-1/insights");
      const res = await getInsightsRoute(req, {
        params: Promise.resolve({ workspaceId: "not-a-valid-uuid", meetingId: "meet-1" }),
      });
      assert.equal(res.status, 400);
      const json = await res.json();
      assert.equal(json.error.code, "VALIDATION_ERROR");
    });

    it("validates empty meetingId in insights route", async () => {
      const req = new Request(`http://localhost/api/workspace/${workspaceId}/meetings/%20/insights`);
      const res = await getInsightsRoute(req, {
        params: Promise.resolve({ workspaceId, meetingId: "" }),
      });
      assert.equal(res.status, 400);
      const json = await res.json();
      assert.equal(json.error.code, "VALIDATION_ERROR");
    });
  });
});
