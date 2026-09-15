/**
 * Phase 13.8: Unit Tests — Collaboration Room Persistence & Authorization Matrix
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RoomRepository } from "../src/app/lib/persistence/repositories/roomRepository";
import { PersistenceError } from "../src/app/lib/persistence/server/errors";
import type { PersistenceActor } from "../src/app/lib/persistence/server/auth";

describe("Phase 13.8 — Collaboration Room Persistence Unit Tests", () => {
  const ownerActor: PersistenceActor = {
    userId: "user-owner-1",
  };

  const viewerActor: PersistenceActor = {
    userId: "user-viewer-1",
  };

  const workspaceId = "11111111-1111-1111-1111-111111111111";
  const otherWorkspaceId = "22222222-2222-2222-2222-222222222222";
  const roomId = "room-test-123";

  it("rejects empty roomId on creation", async () => {
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

    const repo = new RoomRepository(mockClient);

    await assert.rejects(
      async () => {
        await repo.createRoom(ownerActor, {
          roomId: "   ",
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

  it("enforces role permissions: viewer cannot create room", async () => {
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

    const repo = new RoomRepository(mockClient);

    await assert.rejects(
      async () => {
        await repo.createRoom(viewerActor, {
          roomId,
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

  it("enforces role permissions: viewer cannot close room", async () => {
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

    const repo = new RoomRepository(mockClient);

    await assert.rejects(
      async () => {
        await repo.closeRoom(viewerActor, { roomId }, workspaceId);
      },
      (err: any) => {
        assert(err instanceof PersistenceError);
        assert.equal(err.code, "FORBIDDEN");
        return true;
      }
    );
  });

  it("idempotently handles same roomId in same workspace", async () => {
    const existingRoom = {
      id: roomId,
      workspace_id: workspaceId,
      title: "Existing Collab Room",
      status: "active",
      created_by: ownerActor.userId,
      metadata: {},
      created_at: "2026-09-07T00:00:00Z",
      closed_at: null,
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
              maybeSingle: async () => ({ data: existingRoom, error: null }),
            }),
          }),
        };
      },
    } as any;

    const repo = new RoomRepository(mockClient);
    const result = await repo.createRoom(ownerActor, {
      roomId,
      workspaceId,
      title: "New Title Attempt",
    });

    assert.equal(result.room.id, roomId);
    assert.equal(result.room.title, "Existing Collab Room");
  });

  it("rejects duplicate roomId across different workspaces with CONFLICT", async () => {
    const existingOtherWorkspace = {
      id: roomId,
      workspace_id: otherWorkspaceId,
      title: "Other WS Room",
      status: "active",
      created_by: "someone-else",
      created_at: "2026-09-07T00:00:00Z",
      closed_at: null,
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

    const repo = new RoomRepository(mockClient);

    await assert.rejects(
      async () => {
        await repo.createRoom(ownerActor, {
          roomId,
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

  it("handles async recovery: closeRoom recovers unpersisted room in closed status", async () => {
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
                single: async () => ({ data: { ...data, id: roomId }, error: null }),
              }),
            };
          },
        };
      },
    } as any;

    const repo = new RoomRepository(mockClient);
    const result = await repo.closeRoom(
      ownerActor,
      { roomId, title: "Recovered Collab Session", lastKnownState: { nodeCount: 5 } },
      workspaceId
    );

    assert.equal(result.room.id, roomId);
    assert.equal(result.room.status, "closed");
    assert.equal(insertedRow.status, "closed");
    assert.equal(insertedRow.title, "Recovered Collab Session");
    assert(insertedRow.created_at);
    assert(insertedRow.closed_at);
  });
});
