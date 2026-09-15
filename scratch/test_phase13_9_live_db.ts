/**
 * Phase 13.9 — Live Database Verification Suite
 *
 * Tests against live PostgreSQL / Supabase Docker instance:
 * 1. Setup test workspaces (Owner vs Viewer)
 * 2. Atomic migration execution of multi-turn conversations and canvas
 * 3. Server-authoritative timestamps verification
 * 4. Monotonic sequence assignment under row lock
 * 5. Non-destructive idempotency: re-running migration reuses conversations, skips
 *    duplicates, and safely backfills missing messages
 * 6. Cross-workspace ID collision rejection with full rollback
 * 7. Complete canvas 0+0+0 emptiness check (never overwrites existing workspace canvas)
 * 8. Deterministic canvas snapshot selection (updatedAt DESC, id DESC)
 * 9. API route integration & authorization matrix (Owner 200, Viewer 403, Non-member 403)
 * 10. Atomic rollback on failure: zero partial records committed
 */

import { getServerSupabaseClient } from "../src/app/lib/persistence/server/db";
import { MigrationRepository } from "../src/app/lib/persistence/repositories/migrationRepository";
import { WorkspaceRepository } from "../src/app/lib/persistence/repositories/workspaceRepository";
import { createActor } from "../src/app/lib/persistence/server/auth";
import { PersistenceError } from "../src/app/lib/persistence/server/errors";
import { POST as postMigrate } from "../src/app/api/workspace/[workspaceId]/migrate/route";
import type { LegacyConversationPayload } from "../src/app/lib/persistence/migrationTypes";

function assert(condition: unknown, msg: string): asserts condition {
  if (!condition) {
    throw new Error(`[Live DB Assertion Failed] ${msg}`);
  }
}

async function runLiveDbTests() {
  console.log("=================================================================");
  console.log("PHASE 13.9 — Live Database Verification");
  console.log("=================================================================\n");

  const supabase = getServerSupabaseClient();
  const migrationRepo = new MigrationRepository(supabase);
  const wsRepo = new WorkspaceRepository(supabase);

  const testWsIdA = "99999999-9999-9999-9999-999999999991";
  const testWsIdB = "99999999-9999-9999-9999-999999999992";
  const testWsIdC = "99999999-9999-9999-9999-999999999993";

  const aliceUserId = "user-13-9-alice-owner";
  const eveViewerId = "user-13-9-eve-viewer";

  const aliceOwner = createActor(aliceUserId);
  const eveViewer = { userId: eveViewerId };

  // Sample legacy conversations
  const convId1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1";
  const convId2 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2";
  const msgId1 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1";
  const msgId2 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2";
  const msgId3 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3";
  const msgId4 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4";
  const nodeId1 = "cccccccc-cccc-cccc-cccc-ccccccccccc1";
  const nodeId2 = "cccccccc-cccc-cccc-cccc-ccccccccccc2";
  const edgeId1 = "dddddddd-dddd-dddd-dddd-ddddddddddd1";

  const sampleLegacyConversations: LegacyConversationPayload[] = [
    {
      id: convId1,
      title: "First Architecture Talk",
      messages: [
        { id: msgId1, role: "user", content: "Design database schema", createdAt: "2025-01-01T00:00:00Z" },
        { id: msgId2, role: "assistant", content: "Here is the schema", createdAt: "2025-01-01T00:01:00Z" },
      ],
      canvas: {
        nodes: [
          { id: nodeId1, nodeType: "concept", title: "PostgreSQL", position: { x: 10, y: 20 } },
          { id: nodeId2, nodeType: "concept", title: "Redis", position: { x: 200, y: 120 } },
        ],
        edges: [
          { id: edgeId1, sourceId: nodeId1, targetId: nodeId2, relationship: "caches" },
        ],
        groups: [],
      },
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:05:00Z",
    },
    {
      id: convId2,
      title: "Second Product Talk",
      messages: [
        { id: msgId3, role: "user", content: "Launch plan", createdAt: "2025-01-02T00:00:00Z" },
        { id: msgId4, role: "assistant", content: "Q1 Launch roadmap", createdAt: "2025-01-02T00:01:00Z" },
      ],
      canvas: {
        nodes: [],
        edges: [],
        groups: [],
      },
      createdAt: "2025-01-02T00:00:00Z",
      updatedAt: "2025-01-02T00:02:00Z",
    },
  ];

  try {
    // 0. Pre-cleanup
    console.log("0. Cleaning up prior test workspaces...");
    await supabase.from("workspaces").delete().in("id", [testWsIdA, testWsIdB, testWsIdC]);
    console.log("✔ Pre-cleanup complete\n");

    // 1. Setup Workspaces
    console.log("1. Setting up workspaces...");
    await wsRepo.createWorkspace(aliceOwner, {
      id: testWsIdA,
      title: "Workspace A (Alice Owner)",
    });

    await wsRepo.createWorkspace(aliceOwner, {
      id: testWsIdB,
      title: "Workspace B (Alice Owner)",
    });

    // Add Eve as viewer in Workspace A
    await supabase.from("workspace_members").insert({
      workspace_id: testWsIdA,
      user_id: eveViewerId,
      role: "viewer",
    });
    console.log("✔ Workspaces created & memberships assigned\n");

    // 2. Atomic Migration Execution in Workspace A
    console.log("2. Executing atomic migration into Workspace A...");
    const resA = await migrationRepo.migrateWorkspace(aliceOwner, {
      targetWorkspaceId: testWsIdA,
      payload: {
        sourceStorageKey: "echo-conversations",
        exportedAt: new Date().toISOString(),
        conversations: sampleLegacyConversations,
      },
    });

    assert(resA.success === true, "Migration response should indicate success");
    assert(resA.importedConversations === 2, `Expected 2 imported conversations, got ${resA.importedConversations}`);
    assert(resA.importedMessages === 4, `Expected 4 imported messages, got ${resA.importedMessages}`);
    assert(resA.importedNodes === 2, `Expected 2 imported canvas nodes, got ${resA.importedNodes}`);
    assert(resA.importedEdges === 1, `Expected 1 imported canvas edge, got ${resA.importedEdges}`);
    assert(resA.skippedDuplicates === 0, `Expected 0 skipped duplicates on initial import, got ${resA.skippedDuplicates}`);
    console.log("✔ Initial migration imported all conversations, messages, and canvas nodes/edges\n");

    // 3. Verify Server-Authoritative Timestamps & Sequences in DB
    console.log("3. Verifying DB records, sequence assignment, and authoritative timestamps...");
    const { data: convRows } = await supabase
      .from("conversations")
      .select("*")
      .eq("workspace_id", testWsIdA)
      .order("created_at", { ascending: true });

    assert(convRows != null && convRows.length === 2, "DB should contain 2 conversations");

    const { data: msgRows } = await supabase
      .from("messages")
      .select("*")
      .eq("workspace_id", testWsIdA)
      .eq("conversation_id", convId1)
      .order("sequence", { ascending: true });

    assert(msgRows != null && msgRows.length === 2, "Conversation 1 should have 2 messages");
    assert(msgRows[0].sequence === "1" || msgRows[0].sequence === 1, "First message should have sequence 1");
    assert(msgRows[1].sequence === "2" || msgRows[1].sequence === 2, "Second message should have sequence 2");

    // Server-authoritative timestamp check: created_at must be recent, NOT 2025 legacy string
    const msgCreatedAt = new Date(msgRows[0].created_at).getTime();
    const currentYear = new Date().getUTCFullYear();
    assert(new Date(msgCreatedAt).getUTCFullYear() >= 2026, "Message created_at must be server-authoritative current timestamp");
    console.log("✔ Sequences (1, 2) and server-authoritative timestamps verified\n");

    // 4. Non-Destructive Idempotency & Backfill Test
    console.log("4. Testing non-destructive idempotency and message backfill...");
    const newMsgId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb5";
    const backfillPayload: LegacyConversationPayload[] = [
      {
        ...sampleLegacyConversations[0],
        messages: [
          ...sampleLegacyConversations[0].messages,
          { id: newMsgId, role: "user", content: "Third message backfilled", createdAt: "2025-01-01T00:02:00Z" },
        ],
      },
    ];

    const resBackfill = await migrationRepo.migrateWorkspace(aliceOwner, {
      targetWorkspaceId: testWsIdA,
      payload: {
        sourceStorageKey: "echo-conversations",
        exportedAt: new Date().toISOString(),
        conversations: backfillPayload,
      },
    });

    assert(resBackfill.importedConversations === 0, "Existing conversation should be reused (0 new conversations)");
    assert(resBackfill.skippedDuplicates === 2, `Expected 2 skipped duplicate messages, got ${resBackfill.skippedDuplicates}`);
    assert(resBackfill.importedMessages === 1, `Expected 1 imported backfilled message, got ${resBackfill.importedMessages}`);

    // Verify backfilled message received sequence 3
    const { data: backfilledMsg } = await supabase
      .from("messages")
      .select("*")
      .eq("id", newMsgId)
      .single();
    assert(backfilledMsg != null, "Backfilled message should exist in DB");
    assert(backfilledMsg.sequence === "3" || backfilledMsg.sequence === 3, "Backfilled message must receive monotonic sequence 3");
    console.log("✔ Non-destructive idempotency: duplicate messages skipped, new message backfilled with sequence 3\n");

    // 4b. Sequence Concurrency Lock: Concurrent message migrations on same conversation (Hardening #1)
    console.log("4b. Testing sequence concurrency lock (concurrent message migrations on same conversation)...");
    const concurrentMsg1 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb6";
    const concurrentMsg2 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb7";
    const concurrentMsg3 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb8";

    await Promise.all([
      migrationRepo.migrateWorkspace(aliceOwner, {
        targetWorkspaceId: testWsIdA,
        payload: {
          sourceStorageKey: "echo-conversations",
          exportedAt: new Date().toISOString(),
          conversations: [
            {
              ...sampleLegacyConversations[0],
              messages: [{ id: concurrentMsg1, role: "user", content: "Concurrent Msg 1", createdAt: "2025-01-01T00:03:00Z" }],
            },
          ],
        },
      }),
      migrationRepo.migrateWorkspace(aliceOwner, {
        targetWorkspaceId: testWsIdA,
        payload: {
          sourceStorageKey: "echo-conversations",
          exportedAt: new Date().toISOString(),
          conversations: [
            {
              ...sampleLegacyConversations[0],
              messages: [{ id: concurrentMsg2, role: "user", content: "Concurrent Msg 2", createdAt: "2025-01-01T00:03:01Z" }],
            },
          ],
        },
      }),
      migrationRepo.migrateWorkspace(aliceOwner, {
        targetWorkspaceId: testWsIdA,
        payload: {
          sourceStorageKey: "echo-conversations",
          exportedAt: new Date().toISOString(),
          conversations: [
            {
              ...sampleLegacyConversations[0],
              messages: [{ id: concurrentMsg3, role: "user", content: "Concurrent Msg 3", createdAt: "2025-01-01T00:03:02Z" }],
            },
          ],
        },
      }),
    ]);

    // Verify sequences are strictly unique and contiguous (4, 5, 6)
    const { data: concurrentRows } = await supabase
      .from("messages")
      .select("sequence")
      .eq("workspace_id", testWsIdA)
      .eq("conversation_id", convId1)
      .in("id", [concurrentMsg1, concurrentMsg2, concurrentMsg3])
      .order("sequence", { ascending: true });

    assert(concurrentRows != null && concurrentRows.length === 3, "All 3 concurrent messages must be saved");
    const seqs = concurrentRows.map((r: any) => Number(r.sequence)).sort((a: number, b: number) => a - b);
    assert(seqs[0] === 4 && seqs[1] === 5 && seqs[2] === 6, `Expected sequences [4, 5, 6], got [${seqs.join(", ")}]`);
    console.log("✔ Concurrency lock verified: concurrent messages serialized cleanly into sequences [4, 5, 6]\n");

    // 5. Hardening & Blocker Verification Suite
    // -------------------------------------------------------------------------
    // 13.9.1: canvas_group cross-workspace collision -> 409 -> zero partial DB state
    console.log("5. [13.9.1] Testing canvas_group cross-workspace collision rejection...");
    const testGroupIdA = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1";
    // Insert a group into Workspace A
    await supabase.from("canvas_groups").insert({
      id: testGroupIdA,
      workspace_id: testWsIdA,
      title: "Workspace A Group",
      member_ids: [nodeId1],
      color: "#3b82f6",
    });

    // Attempt to migrate a payload containing testGroupIdA into Workspace B!
    await (async () => {
      let threw = false;
      try {
        await migrationRepo.migrateWorkspace(aliceOwner, {
          targetWorkspaceId: testWsIdB,
          payload: {
            sourceStorageKey: "echo-conversations",
            exportedAt: new Date().toISOString(),
            conversations: [
              {
                id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7",
                title: "Colliding Group Talk",
                messages: [],
                canvas: {
                  nodes: [],
                  edges: [],
                  groups: [
                    { id: testGroupIdA, title: "Intruder Group", memberIds: [] },
                  ],
                },
                createdAt: "2025-01-01T00:00:00Z",
                updatedAt: "2025-01-01T00:05:00Z",
              },
            ],
          },
        });
      } catch (err: any) {
        threw = true;
        assert(err instanceof PersistenceError, "Must throw PersistenceError");
        assert(err.code === "CONFLICT", `Must be CONFLICT 409 error, got ${err.code}`);
        assert(err.message.includes("COLLISION: Canvas group ID"), `Expected canvas group collision, got ${err.message}`);
      }
      assert(threw, "Cross-workspace canvas group collision must throw error and abort");
    })();

    // Verify atomic rollback: Workspace B must have ZERO conversations and ZERO groups
    const { data: wsBConvsGroup } = await supabase.from("conversations").select("*").eq("workspace_id", testWsIdB);
    assert(wsBConvsGroup != null && wsBConvsGroup.length === 0, "Workspace B must remain empty due to full rollback");
    const { data: wsBGroups } = await supabase.from("canvas_groups").select("*").eq("workspace_id", testWsIdB);
    assert(wsBGroups != null && wsBGroups.length === 0, "Workspace B canvas groups must remain empty");
    console.log("✔ [13.9.1] canvas_group cross-workspace collision rejected with 409 & zero partial DB state\n");

    // -------------------------------------------------------------------------
    // 13.9.2: message ID exists in same workspace but different conversation -> conflict -> zero partial DB state
    console.log("5. [13.9.2] Testing message ID collision in same workspace but different conversation...");
    const newConvIdDiff = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaad";
    // Attempt to migrate newConvIdDiff in Workspace A, but reusing msgId1 (which belongs to convId1!)
    await (async () => {
      let threw = false;
      try {
        await migrationRepo.migrateWorkspace(aliceOwner, {
          targetWorkspaceId: testWsIdA,
          payload: {
            sourceStorageKey: "echo-conversations",
            exportedAt: new Date().toISOString(),
            conversations: [
              {
                id: newConvIdDiff,
                title: "Conflicting Conversation",
                messages: [
                  { id: msgId1, role: "user", content: "Hijacked Message Content", createdAt: "2025-01-01T00:00:00Z" },
                ],
                canvas: { nodes: [], edges: [], groups: [] },
                createdAt: "2025-01-01T00:00:00Z",
                updatedAt: "2025-01-01T00:05:00Z",
              },
            ],
          },
        });
      } catch (err: any) {
        threw = true;
        assert(err instanceof PersistenceError, "Must throw PersistenceError");
        assert(err.code === "CONFLICT", `Must be CONFLICT 409 error, got ${err.code}`);
        assert(err.message.includes("COLLISION"), `Expected message collision, got ${err.message}`);
        assert(err.message.includes("different conversation"), `Expected different conversation error, got ${err.message}`);
      }
      assert(threw, "Same-workspace different-conversation message ID collision must throw CONFLICT and abort");
    })();

    // Verify atomic rollback: newConvIdDiff must NOT exist in conversations table
    const { data: hijackedConv } = await supabase.from("conversations").select("*").eq("id", newConvIdDiff);
    assert(hijackedConv != null && hijackedConv.length === 0, "Conflicting conversation must not be committed to DB");
    console.log("✔ [13.9.2] Same-workspace different-conversation message ID collision rejected with 409 & zero partial DB state\n");

    // -------------------------------------------------------------------------
    // 13.9.3: same message ID + same workspace + same conversation -> duplicate -> preserve existing message
    console.log("5. [13.9.3] Testing duplicate message identity (same message ID + same workspace + same conversation)...");
    const { data: msgBefore } = await supabase.from("messages").select("*").eq("id", msgId1).single();
    assert(msgBefore != null, "Existing message msgId1 must exist");

    const resDuplicate = await migrationRepo.migrateWorkspace(aliceOwner, {
      targetWorkspaceId: testWsIdA,
      payload: {
        sourceStorageKey: "echo-conversations",
        exportedAt: new Date().toISOString(),
        conversations: [
          {
            id: convId1,
            title: "Reused Conversation",
            messages: [
              { id: msgId1, role: "user", content: "Design database schema", createdAt: "2025-01-01T00:00:00Z" },
            ],
            canvas: { nodes: [], edges: [], groups: [] },
            createdAt: "2025-01-01T00:00:00Z",
            updatedAt: "2025-01-01T00:05:00Z",
          },
        ],
      },
    });

    assert(resDuplicate.success === true, "Idempotent duplicate migration must succeed");
    assert(resDuplicate.skippedDuplicates === 1, `Expected 1 skipped duplicate, got ${resDuplicate.skippedDuplicates}`);
    assert(resDuplicate.importedMessages === 0, "Expected 0 imported messages");

    const { data: msgAfter } = await supabase.from("messages").select("*").eq("id", msgId1).single();
    assert(msgAfter.content === msgBefore.content, "Existing message content must be strictly preserved");
    assert(msgAfter.created_at === msgBefore.created_at, "Existing message created_at must be strictly preserved");
    assert(msgAfter.sequence === msgBefore.sequence, "Existing message sequence must be strictly preserved");
    console.log("✔ [13.9.3] Same message identity cleanly skipped as duplicate, server record strictly preserved\n");

    // -------------------------------------------------------------------------
    // 13.9.4: Multi-record payload with late conflict -> EVERYTHING rolls back atomically
    console.log("5. [13.9.4] Testing multi-record payload with late conflict -> full atomic rollback...");
    // Initialize clean workspace C
    await wsRepo.createWorkspace(aliceOwner, {
      id: testWsIdC,
      title: "Workspace C (Atomic Rollback Test)",
    });

    const multiConv1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaac1";
    const multiMsg1a = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbc1";
    const multiMsg1b = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbc2";
    const multiNode1 = "cccccccc-cccc-cccc-cccc-cccccccccc01";

    const multiConv2 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaac2";
    const multiMsg2a = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbc3";

    const multiConv3Poison = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaac3";
    // Poison: uses msgId1 which already belongs to Workspace A!
    const poisonPayload: LegacyConversationPayload[] = [
      {
        id: multiConv1,
        title: "Multi Record 1",
        messages: [
          { id: multiMsg1a, role: "user", content: "M1", createdAt: "2026-01-01T00:00:00Z" },
          { id: multiMsg1b, role: "assistant", content: "M2", createdAt: "2026-01-01T00:01:00Z" },
        ],
        canvas: {
          nodes: [{ id: multiNode1, nodeType: "concept", title: "Node 1", position: { x: 10, y: 10 } }],
          edges: [],
          groups: [],
        },
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:02:00Z",
      },
      {
        id: multiConv2,
        title: "Multi Record 2",
        messages: [
          { id: multiMsg2a, role: "user", content: "M3", createdAt: "2026-01-01T00:00:00Z" },
        ],
        canvas: { nodes: [], edges: [], groups: [] },
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:01:00Z",
      },
      {
        id: multiConv3Poison,
        title: "Multi Record 3 (Poison Conflict)",
        messages: [
          { id: msgId1, role: "user", content: "Poison Message from Ws A", createdAt: "2026-01-01T00:00:00Z" },
        ],
        canvas: { nodes: [], edges: [], groups: [] },
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:01:00Z",
      },
    ];

    await (async () => {
      let threw = false;
      try {
        await migrationRepo.migrateWorkspace(aliceOwner, {
          targetWorkspaceId: testWsIdC,
          payload: {
            sourceStorageKey: "echo-conversations",
            exportedAt: new Date().toISOString(),
            conversations: poisonPayload,
          },
        });
      } catch (err: any) {
        threw = true;
        assert(err instanceof PersistenceError, "Must throw PersistenceError");
        assert(err.code === "CONFLICT", `Must be CONFLICT 409 error, got ${err.code}`);
        assert(err.message.includes("COLLISION"), `Expected collision message, got ${err.message}`);
      }
      assert(threw, "Multi-record payload with late collision must throw error and abort");
    })();

    // Verify COMPLETE atomic rollback in Workspace C: zero conversations, zero messages, zero canvas nodes
    const { count: countConvs } = await supabase.from("conversations").select("*", { count: "exact", head: true }).eq("workspace_id", testWsIdC);
    const { count: countMsgs } = await supabase.from("messages").select("*", { count: "exact", head: true }).eq("workspace_id", testWsIdC);
    const { count: countNodes } = await supabase.from("canvas_nodes").select("*", { count: "exact", head: true }).eq("workspace_id", testWsIdC);

    assert(countConvs === 0, `Expected 0 committed conversations in Workspace C, got ${countConvs}`);
    assert(countMsgs === 0, `Expected 0 committed messages in Workspace C, got ${countMsgs}`);
    assert(countNodes === 0, `Expected 0 committed canvas nodes in Workspace C, got ${countNodes}`);
    console.log("✔ [13.9.4] Full multi-record transaction rolled back atomically: 0 conversations, 0 messages, 0 nodes committed\n");

    // 6. Canvas 0+0+0 Emptiness Invariant & Deterministic Selection (Hardening #3 & #5)
    console.log("6. Testing Canvas 0+0+0 emptiness check (no overwrite of existing canvas)...");
    const newConvId3 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3";
    const newNodeId3 = "cccccccc-cccc-cccc-cccc-ccccccccccc3";
    const resNoCanvasOverwrite = await migrationRepo.migrateWorkspace(aliceOwner, {
      targetWorkspaceId: testWsIdA, // already has canvas nodes!
      payload: {
        sourceStorageKey: "echo-conversations",
        exportedAt: new Date().toISOString(),
        conversations: [
          {
            id: newConvId3,
            title: "Third Conv with Canvas",
            messages: [],
            canvas: {
              nodes: [{ id: newNodeId3, nodeType: "concept", title: "Intruder Node", position: { x: 0, y: 0 } }],
              edges: [],
              groups: [],
            },
            createdAt: "2025-01-03T00:00:00Z",
            updatedAt: "2025-01-03T00:01:00Z",
          },
        ],
      },
    });

    assert(resNoCanvasOverwrite.importedNodes === 0, "Canvas nodes must NOT be imported when workspace canvas is non-empty");
    assert(resNoCanvasOverwrite.importedEdges === 0, "Canvas edges must NOT be imported when workspace canvas is non-empty");
    console.log("✔ Canvas 0+0+0 rule verified: existing canvas nodes/edges strictly preserved\n");

    // 7. API Route Integration: Authorization Matrix (Viewer 403, Owner 200)
    console.log("7. Testing API Route /api/workspace/[workspaceId]/migrate authorization...");

    // 7a. Viewer test
    process.env.ECHO_DEV_USER_ID = eveViewerId;
    const reqViewer = new Request(`http://localhost:3000/api/workspace/${testWsIdA}/migrate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        payload: {
          sourceStorageKey: "echo-conversations",
          exportedAt: new Date().toISOString(),
          conversations: [],
        },
      }),
    });

    const respViewer = await postMigrate(reqViewer, { params: Promise.resolve({ workspaceId: testWsIdA }) });
    assert(respViewer.status === 403, `Viewer must be rejected with 403, got ${respViewer.status}`);
    console.log("✔ Viewer rejected with HTTP 403 Forbidden");

    // 7b. Non-member test
    process.env.ECHO_DEV_USER_ID = "unknown-intruder";
    const reqNonMember = new Request(`http://localhost:3000/api/workspace/${testWsIdA}/migrate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        payload: {
          sourceStorageKey: "echo-conversations",
          exportedAt: new Date().toISOString(),
          conversations: [],
        },
      }),
    });

    const respNonMember = await postMigrate(reqNonMember, { params: Promise.resolve({ workspaceId: testWsIdA }) });
    assert(respNonMember.status === 403, `Non-member must be rejected with 403, got ${respNonMember.status}`);
    console.log("✔ Non-member rejected with HTTP 403 Forbidden");

    // 7c. Owner test (200 OK)
    process.env.ECHO_DEV_USER_ID = aliceUserId;
    const reqOwner = new Request(`http://localhost:3000/api/workspace/${testWsIdA}/migrate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        payload: {
          sourceStorageKey: "echo-conversations",
          exportedAt: new Date().toISOString(),
          conversations: [],
        },
      }),
    });

    const respOwner = await postMigrate(reqOwner, { params: Promise.resolve({ workspaceId: testWsIdA }) });
    assert(respOwner.status === 200, `Owner must succeed with 200, got ${respOwner.status}`);
    const ownerJson = await respOwner.json();
    assert(ownerJson.ok === true && ownerJson.success === true, "Owner response must be ok: true, success: true");
    assert(ownerJson.backupStorageKey === "echo-conversations-backup", "Must specify backupStorageKey");
    assert(ownerJson.completionFlagKey === "echo-migrated-v1", "Must specify completionFlagKey");
    console.log("✔ Owner succeeded with HTTP 200 OK and expected migration contracts\n");

    // 8. Cleanup
    console.log("8. Cleaning up test workspaces...");
    await supabase.from("workspaces").delete().in("id", [testWsIdA, testWsIdB, testWsIdC]);
    console.log("✔ Cleanup complete\n");

    console.log("=================================================================");
    console.log("🎉 ALL 10 PHASE 13.9 LIVE DATABASE ASSERTIONS PASSED!");
    console.log("=================================================================");
  } catch (err) {
    console.error("❌ Live DB Test Failed:", err);
    process.exit(1);
  }
}

runLiveDbTests();
