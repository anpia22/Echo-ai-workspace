/**
 * Phase 13.5 — Live Database Verification
 *
 * Tests end-to-end canvas persistence against the running local Supabase/PostgreSQL instance.
 * Requires: Docker + local Supabase running, .env.local with SUPABASE_SERVICE_ROLE_KEY.
 *
 * Test flow:
 *  1. Create workspace
 *  2. Hydrate → verify empty canvas
 *  3. CREATE_NODE × 3
 *  4. CREATE_EDGE
 *  5. GROUP_NODES
 *  6. MOVE_NODE (position update)
 *  7. UPDATE_NODE (field update)
 *  8. DELETE_EDGE
 *  9. DELETE_NODE
 * 10. Stale revision → 409 conflict, DB unchanged
 * 11. Reload hydration → verify persisted state
 * 12. Atomicity: provoke failure, verify no partial mutation
 * 13. Clean up
 */

import { getServerSupabaseClient } from "../src/app/lib/persistence/server/db";
import { WorkspaceRepository } from "../src/app/lib/persistence/repositories/workspaceRepository";
import { CanvasRepository } from "../src/app/lib/persistence/repositories/canvasRepository";
import { createActor } from "../src/app/lib/persistence/server/auth";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`[13.5 Live DB Assertion Failed] ${msg}`);
  }
}

const TEST_WS_ID = "e0135500-0000-0000-0000-000000000001";
const TEST_USER_ID = "00000000-0000-0000-0000-000000000001"; // local dev actor
const NODE_A = "f0135500-0000-0000-aaaa-000000000001";
const NODE_B = "f0135500-0000-0000-aaaa-000000000002";
const NODE_C = "f0135500-0000-0000-aaaa-000000000003";
const EDGE_AB = "f0135500-0000-0000-bbbb-000000000001";
const GROUP_1 = "f0135500-0000-0000-cccc-000000000001";

async function runLiveDb() {
  console.log("=================================================================");
  console.log("PHASE 13.5 — Live Database Verification");
  console.log("=================================================================\n");

  const supabase = getServerSupabaseClient();
  const actor = createActor(TEST_USER_ID);
  const wsRepo = new WorkspaceRepository();
  const canvasRepo = new CanvasRepository();

  // Cleanup from previous test run
  await supabase.from("workspaces").delete().eq("id", TEST_WS_ID);
  console.log("✔ Pre-cleanup complete\n");

  // ── Step 1: Create workspace ────────────────────────────────────────────────
  console.log("1. Create workspace...");
  const { data: createdWs, error: createErr } = await supabase.rpc("create_workspace_with_owner", {
    p_id: TEST_WS_ID,
    p_title: "Phase 13.5 Test Workspace",
    p_description: "Live canvas persistence test",
    p_settings: {},
    p_user_id: TEST_USER_ID,
    p_display_name: "Test Owner",
    p_color: "#6366f1",
  });
  if (createErr) throw new Error(`create_workspace_with_owner failed: ${createErr.message}`);
  assert(Number(createdWs.workspace.revision) === 1, "Initial revision is 1");
  let revision = 1;
  console.log("✔ Workspace created (revision=1)\n");

  // ── Step 2: Hydrate → verify empty canvas ──────────────────────────────────
  console.log("2. Hydrate → verify empty canvas...");
  let hydration = await wsRepo.loadWorkspace(actor, TEST_WS_ID);
  assert(hydration.canvas.nodes.length === 0, "Canvas empty on fresh workspace");
  assert(hydration.workspace.revision === 1, "Revision is 1 after create");
  console.log("✔ Empty canvas confirmed\n");

  // ── Step 3: CREATE_NODE × 3 ────────────────────────────────────────────────
  console.log("3. CREATE_NODE × 3...");
  const mutResult = await canvasRepo.mutateCanvas(actor, {
    workspaceId: TEST_WS_ID,
    expectedBaseRevision: revision,
    upsertNodes: [
      { id: NODE_A, nodeType: "problem", title: "Node Alpha", positionX: 100, positionY: 200 },
      { id: NODE_B, nodeType: "solution", title: "Node Beta", positionX: 300, positionY: 400 },
      { id: NODE_C, nodeType: "insight", title: "Node Gamma", positionX: 500, positionY: 600 },
    ],
  });
  assert(mutResult.accepted, "CREATE_NODE ×3: accepted");
  assert(mutResult.newRevision === 2, `CREATE_NODE ×3: revision bumped to 2 (got ${mutResult.newRevision})`);
  revision = mutResult.newRevision;
  console.log("✔ 3 nodes created (revision=2)\n");

  // ── Step 4: CREATE_EDGE ────────────────────────────────────────────────────
  console.log("4. CREATE_EDGE...");
  const edgeResult = await canvasRepo.mutateCanvas(actor, {
    workspaceId: TEST_WS_ID,
    expectedBaseRevision: revision,
    upsertEdges: [
      { id: EDGE_AB, sourceId: NODE_A, targetId: NODE_B, relationship: "resolves" },
    ],
  });
  assert(edgeResult.newRevision === 3, `CREATE_EDGE: revision=3 (got ${edgeResult.newRevision})`);
  revision = edgeResult.newRevision;
  console.log("✔ Edge created (revision=3)\n");

  // ── Step 5: GROUP_NODES ────────────────────────────────────────────────────
  console.log("5. GROUP_NODES...");
  const groupResult = await canvasRepo.mutateCanvas(actor, {
    workspaceId: TEST_WS_ID,
    expectedBaseRevision: revision,
    upsertGroups: [
      { id: GROUP_1, title: "Alpha-Beta Cluster", memberIds: [NODE_A, NODE_B] },
    ],
  });
  assert(groupResult.newRevision === 4, `GROUP_NODES: revision=4 (got ${groupResult.newRevision})`);
  revision = groupResult.newRevision;
  console.log("✔ Group created (revision=4)\n");

  // ── Step 6: MOVE_NODE (position update) ────────────────────────────────────
  console.log("6. MOVE_NODE — update position...");
  const moveResult = await canvasRepo.mutateCanvas(actor, {
    workspaceId: TEST_WS_ID,
    expectedBaseRevision: revision,
    upsertNodes: [
      { id: NODE_A, nodeType: "problem", title: "Node Alpha", positionX: 999, positionY: 888 },
    ],
  });
  assert(moveResult.newRevision === 5, `MOVE_NODE: revision=5 (got ${moveResult.newRevision})`);
  revision = moveResult.newRevision;

  // Verify position actually updated in DB
  const { data: nodeRow } = await supabase
    .from("canvas_nodes")
    .select("position_x, position_y")
    .eq("id", NODE_A)
    .eq("workspace_id", TEST_WS_ID)
    .single();
  assert(Number(nodeRow?.position_x) === 999, "MOVE_NODE: position_x updated in DB");
  assert(Number(nodeRow?.position_y) === 888, "MOVE_NODE: position_y updated in DB");
  console.log("✔ Node position updated (revision=5)\n");

  // ── Step 7: UPDATE_NODE (title + nodeType) ─────────────────────────────────
  console.log("7. UPDATE_NODE — title update...");
  const updateResult = await canvasRepo.mutateCanvas(actor, {
    workspaceId: TEST_WS_ID,
    expectedBaseRevision: revision,
    upsertNodes: [
      { id: NODE_C, nodeType: "risk", title: "Node Gamma Updated", positionX: 500, positionY: 600 },
    ],
  });
  assert(updateResult.newRevision === 6, `UPDATE_NODE: revision=6 (got ${updateResult.newRevision})`);
  revision = updateResult.newRevision;
  console.log("✔ Node updated (revision=6)\n");

  // ── Step 8: DELETE_EDGE ────────────────────────────────────────────────────
  console.log("8. DELETE_EDGE...");
  const delEdgeResult = await canvasRepo.mutateCanvas(actor, {
    workspaceId: TEST_WS_ID,
    expectedBaseRevision: revision,
    deleteEdgeIds: [EDGE_AB],
  });
  assert(delEdgeResult.newRevision === 7, `DELETE_EDGE: revision=7 (got ${delEdgeResult.newRevision})`);
  revision = delEdgeResult.newRevision;

  const { data: remainingEdges } = await supabase
    .from("canvas_edges")
    .select("id")
    .eq("workspace_id", TEST_WS_ID);
  assert(remainingEdges?.length === 0, "DELETE_EDGE: edge removed from DB");
  console.log("✔ Edge deleted (revision=7)\n");

  // ── Step 9: DELETE_NODE ────────────────────────────────────────────────────
  console.log("9. DELETE_NODE...");
  const delNodeResult = await canvasRepo.mutateCanvas(actor, {
    workspaceId: TEST_WS_ID,
    expectedBaseRevision: revision,
    deleteNodeIds: [NODE_C],
  });
  assert(delNodeResult.newRevision === 8, `DELETE_NODE: revision=8 (got ${delNodeResult.newRevision})`);
  revision = delNodeResult.newRevision;

  const { data: remainingNodes } = await supabase
    .from("canvas_nodes")
    .select("id")
    .eq("workspace_id", TEST_WS_ID);
  assert(remainingNodes?.length === 2, `DELETE_NODE: 2 nodes remain (got ${remainingNodes?.length})`);
  console.log("✔ Node deleted (revision=8)\n");

  // ── Step 10: Stale revision → conflict ────────────────────────────────────
  console.log("10. Stale revision → 409 conflict...");
  const staleRevision = revision - 3; // Deliberately stale
  let caughtStale = false;
  try {
    await canvasRepo.mutateCanvas(actor, {
      workspaceId: TEST_WS_ID,
      expectedBaseRevision: staleRevision,
      upsertNodes: [{ id: NODE_A, nodeType: "problem", title: "Should not persist", positionX: 0, positionY: 0 }],
    });
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes("stale")) {
      caughtStale = true;
    } else {
      throw err;
    }
  }
  assert(caughtStale, "Stale revision correctly rejected");

  // Verify DB unchanged after stale rejection
  const { data: wsAfterStale } = await supabase
    .from("workspaces")
    .select("revision")
    .eq("id", TEST_WS_ID)
    .single();
  assert(Number(wsAfterStale?.revision) === revision, "Stale rejection: revision unchanged in DB");

  const { data: nodesAfterStale } = await supabase
    .from("canvas_nodes")
    .select("title")
    .eq("workspace_id", TEST_WS_ID);
  assert(
    !nodesAfterStale?.some((n) => n.title === "Should not persist"),
    "Stale rejection: node not written to DB"
  );
  console.log("✔ Stale revision safely rejected; DB unchanged\n");

  // ── Step 11: Reload hydration → verify persisted state ────────────────────
  console.log("11. Reload hydration → verify persisted canvas state...");
  hydration = await wsRepo.loadWorkspace(actor, TEST_WS_ID);
  assert(hydration.workspace.revision === revision, `Hydration: revision=${revision}`);
  assert(hydration.canvas.nodes.length === 2, `Hydration: 2 nodes loaded (got ${hydration.canvas.nodes.length})`);
  assert(hydration.canvas.edges.length === 0, "Hydration: 0 edges (deleted)");
  assert(hydration.canvas.groups.length === 1, "Hydration: 1 group");

  const hydratedNodeA = hydration.canvas.nodes.find((n) => n.id === NODE_A);
  assert(hydratedNodeA !== undefined, "Hydration: Node Alpha exists");
  assert(hydratedNodeA!.positionX === 999, "Hydration: Node Alpha has updated positionX");

  const hydratedGroup = hydration.canvas.groups.find((g) => g.id === GROUP_1);
  assert(hydratedGroup !== undefined, "Hydration: Group exists");
  assert(hydratedGroup!.memberIds.includes(NODE_A), "Hydration: Group contains NODE_A");
  console.log("✔ Hydration matches persisted DB state\n");

  // ── Step 12: Atomicity test — provoke failure mid-batch ────────────────────
  console.log("12. Atomicity: invalid group member → entire batch fails atomically...");
  const badMemberId = "f0135500-0000-0000-dddd-000000000099"; // nonexistent node
  let caughtAtomic = false;
  try {
    await canvasRepo.mutateCanvas(actor, {
      workspaceId: TEST_WS_ID,
      expectedBaseRevision: revision,
      upsertNodes: [{ id: NODE_A, nodeType: "problem", title: "Atomic Test Node", positionX: 1, positionY: 1 }],
      upsertGroups: [{ id: GROUP_1, title: "Bad Group", memberIds: [NODE_A, badMemberId] }],
    });
  } catch (err) {
    caughtAtomic = true;
  }
  assert(caughtAtomic, "Atomicity: batch with bad group member raises error");

  // Verify DB unchanged: revision and node title should be unchanged
  const { data: wsAfterAtomic } = await supabase
    .from("workspaces")
    .select("revision")
    .eq("id", TEST_WS_ID)
    .single();
  assert(Number(wsAfterAtomic?.revision) === revision, "Atomicity: revision unchanged after failed batch");

  const { data: nodeAfterAtomic } = await supabase
    .from("canvas_nodes")
    .select("title")
    .eq("id", NODE_A)
    .single();
  assert(nodeAfterAtomic?.title !== "Atomic Test Node", "Atomicity: node title NOT updated (whole batch rolled back)");
  console.log("✔ Failed batch rolled back atomically; zero partial mutation\n");

  // ── Step 13: Clean up ──────────────────────────────────────────────────────
  console.log("13. Cleanup...");
  await supabase.from("workspaces").delete().eq("id", TEST_WS_ID);
  console.log("✔ Test workspace deleted\n");

  console.log("=================================================================");
  console.log("PHASE 13.5 — LIVE DATABASE VERIFICATION: ALL PASS ✅");
  console.log("=================================================================");
}

runLiveDb().catch((err) => {
  console.error("\n❌ LIVE DB TEST FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
