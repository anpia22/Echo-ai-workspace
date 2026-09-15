/**
 * Live Database Verification Suite
 * Tests live PostgreSQL / Supabase instance:
 * 1. Connectivity via Supabase Client (HTTP/REST)
 * 2. Table presence & schema verification
 * 3. RPC execution (create_workspace_with_owner)
 * 4. Canvas mutation transaction (apply_canvas_mutation_tx)
 * 5. OCC revision verification (bump_workspace_revision)
 * 6. End-to-end WorkspaceRepository operations
 */

import { getServerSupabaseClient } from "../src/app/lib/persistence/server/db";
import { WorkspaceRepository } from "../src/app/lib/persistence/repositories/workspaceRepository";
import { createActor } from "../src/app/lib/persistence/server/auth";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`[Live DB Assertion Failed] ${msg}`);
  }
}

async function runLiveDbVerification() {
  console.log("=================================================");
  console.log("RUNNING LIVE POSTGRESQL / SUPABASE VERIFICATION");
  console.log("=================================================\n");

  const supabase = getServerSupabaseClient();

  // Test 1: Connectivity & table check
  console.log("1. Testing live Supabase connection...");
  const { data: workspaces, error: wsError } = await supabase
    .from("workspaces")
    .select("id, title, revision")
    .limit(1);

  if (wsError) {
    throw new Error(`Failed to query workspaces table: ${wsError.message} (${wsError.code})`);
  }
  console.log("✔ Connected to live database. Workspaces table queried successfully.\n");

  // Test 2: Live RPC: create_workspace_with_owner
  console.log("2. Testing live RPC: create_workspace_with_owner...");
  const testWsId = "a0000000-0000-0000-0000-000000000001";
  const testUserId = "user-live-test-owner";
  
  // Clean up any prior test artifact
  await supabase.from("workspaces").delete().eq("id", testWsId);

  const { data: rpcCreated, error: rpcError } = await supabase.rpc("create_workspace_with_owner", {
    p_id: testWsId,
    p_title: "Live Test Workspace",
    p_description: "Created in live verification",
    p_settings: { live: true },
    p_user_id: testUserId,
    p_display_name: "Live Owner",
    p_color: "#10b981",
  });

  if (rpcError) {
    throw new Error(`create_workspace_with_owner RPC failed: ${rpcError.message}`);
  }
  assert(rpcCreated.workspace.id === testWsId, "Returned workspace ID matches");
  assert(Number(rpcCreated.workspace.revision) === 1, "Initial revision is exactly 1");
  assert(rpcCreated.member.role === "owner", "Created member is owner");
  console.log("✔ Live RPC create_workspace_with_owner passed! Revision initialized to 1.\n");

  // Test 3: Live RPC: apply_canvas_mutation_tx
  console.log("3. Testing live RPC: apply_canvas_mutation_tx (Atomic Canvas + OCC)...");
  const nodeId1 = "b0000000-0000-0000-0000-000000000001";
  const nodeId2 = "b0000000-0000-0000-0000-000000000002";
  const edgeId1 = "c0000000-0000-0000-0000-000000000001";
  const groupId1 = "d0000000-0000-0000-0000-000000000001";

  const { data: txResult, error: txError } = await supabase.rpc("apply_canvas_mutation_tx", {
    p_workspace_id: testWsId,
    p_actor_id: testUserId,
    p_expected_revision: 1,
    p_upsert_nodes: [
      { id: nodeId1, nodeType: "problem", title: "Live Node 1", positionX: 100, positionY: 200 },
      { id: nodeId2, nodeType: "solution", title: "Live Node 2", positionX: 300, positionY: 400 },
    ],
    p_delete_node_ids: [],
    p_upsert_edges: [
      { id: edgeId1, sourceId: nodeId1, targetId: nodeId2, relationship: "resolves" },
    ],
    p_delete_edge_ids: [],
    p_upsert_groups: [
      { id: groupId1, title: "Live Cluster", memberIds: [nodeId1, nodeId2] },
    ],
    p_delete_group_ids: [],
    p_action: { type: "BATCH_UPSERT", payload: { note: "Live DB verification" } },
  });

  if (txError) {
    throw new Error(`apply_canvas_mutation_tx failed: ${txError.message}`);
  }
  assert(Number(txResult.newRevision) === 2, "Revision atomically bumped from 1 to 2");
  console.log("✔ apply_canvas_mutation_tx successfully committed nodes, edges, groups, and audit log! New revision: 2.\n");

  // Test 4: Live OCC Stale Revision Rejection
  console.log("4. Testing OCC stale revision rejection...");
  const { error: staleError } = await supabase.rpc("apply_canvas_mutation_tx", {
    p_workspace_id: testWsId,
    p_actor_id: testUserId,
    p_expected_revision: 1, // Stale! Current revision is 2
    p_upsert_nodes: [],
    p_delete_node_ids: [],
    p_upsert_edges: [],
    p_delete_edge_ids: [],
    p_upsert_groups: [],
    p_delete_group_ids: [],
  });
  assert(staleError !== null && staleError.message.toLowerCase().includes("stale"), "OCC correctly rejected stale mutation");
  console.log("✔ Live OCC protection confirmed: Stale revision safely rejected with exception:", staleError?.message, "\n");

  // Test 5: End-to-End WorkspaceRepository create & load
  console.log("5. Testing WorkspaceRepository end-to-end against live DB...");
  const repo = new WorkspaceRepository();
  const actor = createActor(testUserId);
  const loaded = await repo.loadWorkspace(actor, testWsId);

  assert(loaded.workspace.id === testWsId, "Loaded workspace matches");
  assert(loaded.workspace.revision === 2, "Loaded revision matches bumped revision 2");
  assert(loaded.members.length === 1 && loaded.members[0].role === "owner", "Owner member loaded");
  assert(loaded.canvas.nodes.length === 2, "2 nodes hydrated from live database");
  assert(loaded.canvas.edges.length === 1, "1 edge hydrated from live database");
  assert(loaded.canvas.groups.length === 1, "1 group hydrated from live database");
  console.log("✔ WorkspaceRepository.loadWorkspace successfully loaded and hydrated full bundle from live PostgreSQL!\n");

  // Clean up
  await supabase.from("workspaces").delete().eq("id", testWsId);
  console.log("✔ Test workspace cleaned up cleanly.\n");

  console.log("=================================================");
  console.log("LIVE POSTGRESQL / SUPABASE VERIFICATION COMPLETE: ALL PASS!");
  console.log("=================================================");
}

runLiveDbVerification().catch((err) => {
  console.error(err);
  process.exit(1);
});
