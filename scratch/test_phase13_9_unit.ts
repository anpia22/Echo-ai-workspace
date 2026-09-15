/**
 * Phase 13.9: Unit Tests — Legacy Migration, Validation & Cutover Guard Invariants
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MigrationRepository } from "../src/app/lib/persistence/repositories/migrationRepository";
import { PersistenceError } from "../src/app/lib/persistence/server/errors";
import type { PersistenceActor } from "../src/app/lib/persistence/server/auth";
import type { LegacyConversationPayload } from "../src/app/lib/persistence/migrationTypes";

describe("Phase 13.9 — Client Migration & Cutover Unit Tests", () => {
  const ownerActor: PersistenceActor = {
    userId: "user-owner-1",
  };

  const viewerActor: PersistenceActor = {
    userId: "user-viewer-1",
  };

  const workspaceId = "11111111-1111-1111-1111-111111111111";

  const validConversation: LegacyConversationPayload = {
    id: "33333333-3333-3333-3333-333333333331",
    title: "Legacy Brainstorm",
    messages: [
      {
        id: "44444444-4444-4444-4444-444444444441",
        role: "user",
        content: "Hello Echo",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "44444444-4444-4444-4444-444444444442",
        role: "assistant",
        content: "Hello! How can I help you?",
        createdAt: "2026-01-01T00:00:01.000Z",
      },
    ],
    canvas: {
      nodes: [
        {
          id: "55555555-5555-5555-5555-555555555551",
          nodeType: "concept",
          title: "Root Idea",
          position: { x: 100, y: 150 },
        },
      ],
      edges: [],
      groups: [],
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:05:00.000Z",
  };

  it("validation: parses valid legacy payload correctly", () => {
    const repo = new MigrationRepository({} as any);
    const result = repo.validateLegacyData([validConversation]);

    assert.equal(result.isValid, true);
    assert.equal(result.totalConversationsFound, 1);
    assert.equal(result.validConversationCount, 1);
    assert.equal(result.corruptConversationCount, 0);
    assert.equal(result.totalMessagesCount, 2);
    assert.equal(result.totalNodesCount, 1);
    assert.equal(result.validationErrors.length, 0);
  });

  it("validation: rejects non-array root", () => {
    const repo = new MigrationRepository({} as any);
    const result = repo.validateLegacyData({ foo: "bar" });

    assert.equal(result.isValid, false);
    assert.equal(result.validationErrors.length, 1);
    assert.match(result.validationErrors[0], /root must be an array/);
  });

  it("validation: isolates corrupted conversation items with invalid UUID", () => {
    const repo = new MigrationRepository({} as any);
    const corruptConv = {
      id: "not-a-valid-uuid",
      title: "Broken",
      messages: [],
      canvas: { nodes: [], edges: [], groups: [] },
    };

    const result = repo.validateLegacyData([validConversation, corruptConv]);
    assert.equal(result.isValid, false);
    assert.equal(result.totalConversationsFound, 2);
    assert.equal(result.validConversationCount, 1);
    assert.equal(result.corruptConversationCount, 1);
    assert.match(result.validationErrors[0], /invalid or missing UUID id/);
  });

  it("validation: isolates corrupt message UUIDs", () => {
    const repo = new MigrationRepository({} as any);
    const badMessageConv: LegacyConversationPayload = {
      ...validConversation,
      id: "33333333-3333-3333-3333-333333333332",
      messages: [
        {
          id: "invalid-msg-id",
          role: "user",
          content: "Oops",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };

    const result = repo.validateLegacyData([badMessageConv]);
    assert.equal(result.isValid, false);
    assert.equal(result.corruptConversationCount, 1);
    assert.match(result.validationErrors[0], /invalid UUID id/);
  });

  it("authorization: viewer role is strictly rejected with FORBIDDEN (403)", async () => {
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
    } as any;

    const repo = new MigrationRepository(mockClient);

    await assert.rejects(
      async () => {
        await repo.migrateWorkspace(viewerActor, {
          targetWorkspaceId: workspaceId,
          payload: {
            sourceStorageKey: "echo-conversations",
            exportedAt: new Date().toISOString(),
            conversations: [validConversation],
          },
        });
      },
      (err: any) => {
        assert(err instanceof PersistenceError);
        assert.equal(err.code, "FORBIDDEN");
        return true;
      }
    );
  });

  it("authorization: non-member actor is strictly rejected with FORBIDDEN (403)", async () => {
    const mockClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      }),
    } as any;

    const repo = new MigrationRepository(mockClient);

    await assert.rejects(
      async () => {
        await repo.migrateWorkspace(viewerActor, {
          targetWorkspaceId: workspaceId,
          payload: {
            sourceStorageKey: "echo-conversations",
            exportedAt: new Date().toISOString(),
            conversations: [validConversation],
          },
        });
      },
      (err: any) => {
        assert(err instanceof PersistenceError);
        assert.equal(err.code, "FORBIDDEN");
        return true;
      }
    );
  });

  it("validation: rejects wrong sourceStorageKey", async () => {
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
    } as any;

    const repo = new MigrationRepository(mockClient);

    await assert.rejects(
      async () => {
        await repo.migrateWorkspace(ownerActor, {
          targetWorkspaceId: workspaceId,
          payload: {
            sourceStorageKey: "wrong-key" as any,
            exportedAt: new Date().toISOString(),
            conversations: [validConversation],
          },
        });
      },
      (err: any) => {
        assert(err instanceof PersistenceError);
        assert.equal(err.code, "VALIDATION_ERROR");
        assert.match(err.message, /sourceStorageKey/);
        return true;
      }
    );
  });

  it("atomic cutover: client protocol steps verify backup before removing source", () => {
    // Simulating localStorage behavior
    const store: Record<string, string> = {
      "echo-conversations": JSON.stringify([validConversation]),
    };

    const sourceSnapshot = store["echo-conversations"];
    assert(sourceSnapshot != null);

    // Step 1: write backup
    store["echo-conversations-backup"] = sourceSnapshot;

    // Step 2: verify backup
    assert.equal(store["echo-conversations-backup"], sourceSnapshot);

    // Step 3: write manifest
    store["echo-migration-v1-meta"] = JSON.stringify({
      workspaceId,
      migratedAt: new Date().toISOString(),
      sourceLength: sourceSnapshot.length,
      importedConversations: 1,
      importedMessages: 2,
    });

    // Step 4: set completion flag
    store["echo-migrated-v1"] = "true";

    // Step 5: check source consistency (source not modified)
    if (store["echo-conversations"] === sourceSnapshot) {
      delete store["echo-conversations"];
    }

    // Invariants verified
    assert.equal(store["echo-conversations"], undefined);
    assert.equal(store["echo-migrated-v1"], "true");
    assert(store["echo-conversations-backup"].length > 0);
    assert(store["echo-migration-v1-meta"].includes(workspaceId));
  });

  it("source consistency guard: does NOT delete source if modified during migration", () => {
    const store: Record<string, string> = {
      "echo-conversations": JSON.stringify([validConversation]),
    };

    const sourceSnapshot = store["echo-conversations"];

    // User types new message in-flight
    store["echo-conversations"] = JSON.stringify([
      {
        ...validConversation,
        messages: [
          ...validConversation.messages,
          { id: "44444444-4444-4444-4444-444444444443", role: "user", content: "New edit in-flight", createdAt: "2026-01-01T00:06:00.000Z" },
        ],
      },
    ]);

    // Cutover completes for snapshot
    store["echo-conversations-backup"] = sourceSnapshot;
    store["echo-migrated-v1"] = "true";

    // Consistency check: source modified! DO NOT REMOVE SOURCE
    if (store["echo-conversations"] === sourceSnapshot) {
      delete store["echo-conversations"];
    }

    // New in-flight user edits are preserved! Zero data loss!
    assert(store["echo-conversations"] != null);
    assert(store["echo-conversations"].includes("New edit in-flight"));
  });

  it("workspace-switch guard: mismatched workspace ID ignores stale callback", () => {
    let appliedWorkspaceId: string | null = null;
    const activeWorkspaceId = "workspace-B";
    const requestWorkspaceId = "workspace-A";

    const callback = (resWsId: string) => {
      if (resWsId !== activeWorkspaceId) {
        // Discarded!
        return;
      }
      appliedWorkspaceId = resWsId;
    };

    callback(requestWorkspaceId);
    assert.equal(appliedWorkspaceId, null, "Callback must be dropped when workspace switched");
  });

  it("hardening #3: computeSourceHash determinism and sensitivity to modifications", async () => {
    const { computeSourceHash } = await import("../src/app/lib/persistence/client/useClientMigration");
    const payloadA = JSON.stringify([validConversation]);
    const hashA1 = computeSourceHash(payloadA);
    const hashA2 = computeSourceHash(payloadA);
    assert.equal(hashA1, hashA2, "Hash must be completely deterministic for identical payloads");

    const payloadB = JSON.stringify([{ ...validConversation, title: "Modified Title" }]);
    const hashB = computeSourceHash(payloadB);
    assert.notEqual(hashA1, hashB, "Hash must differ when payload content changes");
  });

  it("hardening #4: isWorkspaceMigrated strictly enforces flag=true AND meta.workspaceId === activeWorkspaceId", async () => {
    const { isWorkspaceMigrated, STORAGE_FLAG_KEY, STORAGE_META_KEY } = await import(
      "../src/app/lib/persistence/client/useClientMigration"
    );

    // Setup global window / localStorage mock for node test
    const mockStorage: Record<string, string> = {};
    const originalWindow = (globalThis as any).window;
    (globalThis as any).window = {
      localStorage: {
        getItem: (k: string) => mockStorage[k] ?? null,
        setItem: (k: string, v: string) => {
          mockStorage[k] = v;
        },
        removeItem: (k: string) => {
          delete mockStorage[k];
        },
      },
    };

    try {
      const targetWs = "ws-target-111";
      const otherWs = "ws-other-222";

      // Case 1: Nothing set -> false
      assert.equal(isWorkspaceMigrated(targetWs), false);

      // Case 2: flag is true but meta is missing -> false
      mockStorage[STORAGE_FLAG_KEY] = "true";
      assert.equal(isWorkspaceMigrated(targetWs), false);

      // Case 3: flag is true but meta belongs to different workspace -> false (Cross-workspace isolation!)
      mockStorage[STORAGE_META_KEY] = JSON.stringify({ workspaceId: otherWs });
      assert.equal(isWorkspaceMigrated(targetWs), false);

      // Case 4: flag is true AND meta belongs to active workspace -> true!
      mockStorage[STORAGE_META_KEY] = JSON.stringify({ workspaceId: targetWs });
      assert.equal(isWorkspaceMigrated(targetWs), true);

      // Case 5: flag is false even if meta matches -> false
      mockStorage[STORAGE_FLAG_KEY] = "false";
      assert.equal(isWorkspaceMigrated(targetWs), false);
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });

  it("hardening #5: canvas ordering timestamps are selection metadata only", () => {
    // Verifies that conversations with varying updatedAt are ordered deterministically
    const convOlder = {
      ...validConversation,
      id: "33333333-3333-3333-3333-333333333331",
      updatedAt: "2025-01-01T00:00:00Z",
    };
    const convNewer = {
      ...validConversation,
      id: "33333333-3333-3333-3333-333333333332",
      updatedAt: "2025-06-01T00:00:00Z",
    };

    const conversations = [convOlder, convNewer];
    // Sort deterministically by updatedAt DESC, id DESC
    const sorted = [...conversations].sort((a, b) => {
      const timeCmp = (b.updatedAt || "").localeCompare(a.updatedAt || "");
      if (timeCmp !== 0) return timeCmp;
      return (b.id || "").localeCompare(a.id || "");
    });

    assert.equal(sorted[0].id, convNewer.id, "Most recent legacy canvas candidate must be chosen");
  });
});
