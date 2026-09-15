/**
 * Phase 13.7: Unit Tests — Meeting Persistence & Authorization Matrix
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MeetingRepository } from "../src/app/lib/persistence/repositories/meetingRepository";
import { PersistenceError } from "../src/app/lib/persistence/server/errors";
import type { PersistenceActor } from "../src/app/lib/persistence/server/auth";

describe("Phase 13.7 — Meeting Persistence Unit Tests", () => {
  const ownerActor: PersistenceActor = {
    userId: "user-owner-1",
  };

  const viewerActor: PersistenceActor = {
    userId: "user-viewer-1",
  };

  const workspaceId = "11111111-1111-1111-1111-111111111111";
  const otherWorkspaceId = "22222222-2222-2222-2222-222222222222";
  const meetingId = "meet-test-123";

  it("rejects empty meetingId on creation", async () => {
    const mockClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { role: "owner" }, error: null }),
            }),
          }),
        }),
      }),
      rpc: async () => ({ data: null, error: { code: "42883" } }),
    } as any;

    const repo = new MeetingRepository(mockClient);

    await assert.rejects(
      async () => {
        await repo.createMeeting(ownerActor, {
          meetingId: "   ",
          workspaceId,
        });
      },
      (err: any) => {
        assert(err instanceof PersistenceError);
        assert.equal(err.code, "VALIDATION_ERROR");
        return true;
      }
    );
  });

  it("enforces role permissions: viewer cannot create meeting", async () => {
    const mockClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { role: "viewer" }, error: null }),
            }),
          }),
        }),
      }),
      rpc: async () => ({ data: null, error: { code: "42501", message: "FORBIDDEN" } }),
    } as any;

    const repo = new MeetingRepository(mockClient);

    await assert.rejects(
      async () => {
        await repo.createMeeting(viewerActor, {
          meetingId,
          workspaceId,
        });
      },
      (err: any) => {
        assert(err instanceof PersistenceError);
        assert.equal(err.code, "FORBIDDEN");
        return true;
      }
    );
  });

  it("enforces role permissions: viewer cannot end meeting", async () => {
    const mockClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { role: "viewer" }, error: null }),
            }),
            single: async () => ({ data: { workspace_id: workspaceId }, error: null }),
          }),
        }),
      }),
      rpc: async () => ({ data: null, error: { code: "42501", message: "FORBIDDEN" } }),
    } as any;

    const repo = new MeetingRepository(mockClient);

    await assert.rejects(
      async () => {
        await repo.endMeeting(viewerActor, { meetingId }, workspaceId);
      },
      (err: any) => {
        assert(err instanceof PersistenceError);
        assert.equal(err.code, "FORBIDDEN");
        return true;
      }
    );
  });

  it("idempotently handles same meetingId in same workspace", async () => {
    const existingMeeting = {
      id: meetingId,
      workspace_id: workspaceId,
      title: "Existing Title",
      status: "active",
      started_at: "2026-09-07T00:00:00Z",
      ended_at: null,
      created_by: ownerActor.userId,
      created_at: "2026-09-07T00:00:00Z",
      updated_at: "2026-09-07T00:00:00Z",
    };

    const mockClient = {
      rpc: async () => ({ data: null, error: { code: "PGRST202" } }),
      from: (table: string) => {
        if (table === "workspace_members") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { role: "owner" }, error: null }),
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: existingMeeting, error: null }),
            }),
          }),
        };
      },
    } as any;

    const repo = new MeetingRepository(mockClient);
    const result = await repo.createMeeting(ownerActor, {
      meetingId,
      workspaceId,
      title: "New Title Attempt",
    });

    assert.equal(result.meeting.id, meetingId);
    assert.equal(result.meeting.title, "Existing Title");
  });

  it("rejects duplicate meetingId across different workspaces with CONFLICT", async () => {
    const existingOtherWorkspace = {
      id: meetingId,
      workspace_id: otherWorkspaceId,
      title: "Other WS Meeting",
      status: "active",
      started_at: "2026-09-07T00:00:00Z",
      ended_at: null,
      created_by: "someone-else",
      created_at: "2026-09-07T00:00:00Z",
      updated_at: "2026-09-07T00:00:00Z",
    };

    const mockClient = {
      rpc: async () => ({ data: null, error: { code: "PGRST202" } }),
      from: (table: string) => {
        if (table === "workspace_members") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { role: "owner" }, error: null }),
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: existingOtherWorkspace, error: null }),
            }),
          }),
        };
      },
    } as any;

    const repo = new MeetingRepository(mockClient);

    await assert.rejects(
      async () => {
        await repo.createMeeting(ownerActor, {
          meetingId,
          workspaceId,
        });
      },
      (err: any) => {
        assert(err instanceof PersistenceError);
        assert.equal(err.code, "CONFLICT");
        return true;
      }
    );
  });

  it("handles async recovery: endMeeting recovers unpersisted meeting in ended status", async () => {
    let insertedRow: any = null;

    const mockClient = {
      rpc: async () => ({ data: null, error: { code: "PGRST202" } }),
      from: (table: string) => {
        if (table === "workspace_members") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { role: "editor" }, error: null }),
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }), // not found!
            }),
          }),
          insert: (data: any) => {
            insertedRow = data;
            return {
              select: () => ({
                single: async () => ({ data: { ...data, id: meetingId }, error: null }),
              }),
            };
          },
        };
      },
    } as any;

    const repo = new MeetingRepository(mockClient);
    const result = await repo.endMeeting(
      ownerActor,
      { meetingId, title: "Recovered Session" },
      workspaceId
    );

    assert.equal(result.meeting.id, meetingId);
    assert.equal(result.meeting.status, "ended");
    assert.equal(insertedRow.status, "ended");
    assert.equal(insertedRow.title, "Recovered Session");
    assert(insertedRow.started_at);
    assert(insertedRow.ended_at);
  });
});
