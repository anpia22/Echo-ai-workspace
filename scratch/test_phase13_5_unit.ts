/**
 * Phase 13.5 — Unit Tests: canvasActionMapper
 *
 * Tests the CanvasAction → CanvasMutationRequest translation layer.
 * No database, no network. Pure logic.
 */

import { mapActionsToMutation, isMutationRequestEmpty, buildMoveNodeMutation } from "../src/app/lib/persistence/client/canvasActionMapper";
import type { CanvasStateLike } from "../src/app/lib/persistence/client/canvasActionMapper";

type TestResult = { passed: number; failed: number; errors: string[] };

function assert(condition: boolean, msg: string, result: TestResult) {
  if (!condition) {
    result.failed++;
    result.errors.push(`FAIL: ${msg}`);
    console.error(`  ❌ FAIL: ${msg}`);
  } else {
    result.passed++;
    console.log(`  ✅ PASS: ${msg}`);
  }
}

// ── Fixtures ───────────────────────────────────────────────────────────────────

const NODE_ID_1 = "aaaaaaaa-0000-0000-0000-000000000001";
const NODE_ID_2 = "aaaaaaaa-0000-0000-0000-000000000002";
const NODE_ID_3 = "aaaaaaaa-0000-0000-0000-000000000003";
const EDGE_ID_1 = "bbbbbbbb-0000-0000-0000-000000000001";
const GROUP_ID_1 = "cccccccc-0000-0000-0000-000000000001";
const WS_ID = "dddddddd-0000-0000-0000-000000000001";

const emptyCanvas: CanvasStateLike = { nodes: [], edges: [], groups: [] };

const canvasWithTwoNodes: CanvasStateLike = {
  nodes: [
    { id: NODE_ID_1, nodeType: "problem", title: "Node Alpha", position: { x: 100, y: 200 } },
    { id: NODE_ID_2, nodeType: "solution", title: "Node Beta", position: { x: 300, y: 400 } },
  ],
  edges: [],
  groups: [],
};

const canvasWithEdge: CanvasStateLike = {
  ...canvasWithTwoNodes,
  edges: [
    { id: EDGE_ID_1, sourceId: NODE_ID_1, targetId: NODE_ID_2, relationship: "resolves" },
  ],
};

const canvasWithGroup: CanvasStateLike = {
  ...canvasWithTwoNodes,
  groups: [
    { id: GROUP_ID_1, title: "My Group", memberIds: [NODE_ID_1, NODE_ID_2] },
  ],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

async function runUnitTests() {
  console.log("=================================================================");
  console.log("PHASE 13.5 — Unit Tests: canvasActionMapper");
  console.log("=================================================================\n");

  const result: TestResult = { passed: 0, failed: 0, errors: [] };

  // ----- isMutationRequestEmpty -----
  console.log("--- isMutationRequestEmpty ---");
  assert(isMutationRequestEmpty({ workspaceId: WS_ID }), "empty request is empty", result);
  assert(
    !isMutationRequestEmpty({ workspaceId: WS_ID, upsertNodes: [{ id: NODE_ID_1, nodeType: "problem", title: "X", positionX: 0, positionY: 0 }] }),
    "request with upsertNodes is not empty",
    result
  );
  assert(
    !isMutationRequestEmpty({ workspaceId: WS_ID, deleteNodeIds: [NODE_ID_1] }),
    "request with deleteNodeIds is not empty",
    result
  );

  // ----- CREATE_NODE -----
  console.log("\n--- CREATE_NODE ---");
  {
    const actions = [{ type: "CREATE_NODE", nodeType: "problem", title: "Node Alpha" }];
    const req = mapActionsToMutation(actions, emptyCanvas, canvasWithTwoNodes, WS_ID);
    assert(req.upsertNodes?.length === 1, "CREATE_NODE: produces 1 upsert node", result);
    assert(req.upsertNodes![0].id === NODE_ID_1, "CREATE_NODE: correct node ID from nextCanvas", result);
    assert(req.upsertNodes![0].title === "Node Alpha", "CREATE_NODE: correct title", result);
    assert(req.upsertNodes![0].positionX === 100, "CREATE_NODE: correct positionX", result);
    assert(!req.deleteNodeIds, "CREATE_NODE: no deleteNodeIds", result);
  }

  // ----- CREATE_NODE: title not in nextCanvas → skip -----
  console.log("\n--- CREATE_NODE: missing title ---");
  {
    const actions = [{ type: "CREATE_NODE", nodeType: "problem", title: "Ghost Node" }];
    const req = mapActionsToMutation(actions, emptyCanvas, canvasWithTwoNodes, WS_ID);
    assert(!req.upsertNodes || req.upsertNodes.length === 0, "CREATE_NODE missing title: produces empty upsertNodes", result);
  }

  // ----- UPDATE_NODE -----
  console.log("\n--- UPDATE_NODE ---");
  {
    const updatedCanvas: CanvasStateLike = {
      ...canvasWithTwoNodes,
      nodes: [
        { id: NODE_ID_1, nodeType: "solution", title: "Node Alpha Updated", position: { x: 100, y: 200 } },
        canvasWithTwoNodes.nodes[1],
      ],
    };
    const actions = [{ type: "UPDATE_NODE", targetTitle: "Node Alpha", updates: { title: "Node Alpha Updated", nodeType: "solution" } }];
    const req = mapActionsToMutation(actions, canvasWithTwoNodes, updatedCanvas, WS_ID);
    assert(req.upsertNodes?.length === 1, "UPDATE_NODE: produces 1 upsert node", result);
    assert(req.upsertNodes![0].id === NODE_ID_1, "UPDATE_NODE: correct node ID", result);
    assert(req.upsertNodes![0].title === "Node Alpha Updated", "UPDATE_NODE: new title", result);
    assert(req.upsertNodes![0].nodeType === "solution", "UPDATE_NODE: new nodeType", result);
  }

  // ----- MOVE_NODE -----
  console.log("\n--- MOVE_NODE ---");
  {
    const movedCanvas: CanvasStateLike = {
      ...canvasWithTwoNodes,
      nodes: [
        { id: NODE_ID_1, nodeType: "problem", title: "Node Alpha", position: { x: 500, y: 600 } },
        canvasWithTwoNodes.nodes[1],
      ],
    };
    const actions = [{ type: "MOVE_NODE", targetTitle: "Node Alpha", position: { x: 500, y: 600 } }];
    const req = mapActionsToMutation(actions, canvasWithTwoNodes, movedCanvas, WS_ID);
    assert(req.upsertNodes?.length === 1, "MOVE_NODE: produces 1 upsert node", result);
    assert(req.upsertNodes![0].positionX === 500, "MOVE_NODE: positionX updated", result);
    assert(req.upsertNodes![0].positionY === 600, "MOVE_NODE: positionY updated", result);
    assert(req.upsertNodes![0].id === NODE_ID_1, "MOVE_NODE: correct node ID from nextCanvas", result);
  }

  // ----- DELETE_NODE -----
  console.log("\n--- DELETE_NODE ---");
  {
    const afterDelete: CanvasStateLike = {
      nodes: [canvasWithTwoNodes.nodes[1]],
      edges: [],
      groups: [],
    };
    const actions = [{ type: "DELETE_NODE", targetTitle: "Node Alpha" }];
    const req = mapActionsToMutation(actions, canvasWithTwoNodes, afterDelete, WS_ID);
    assert(req.deleteNodeIds?.length === 1, "DELETE_NODE: produces 1 deleteNodeId", result);
    assert(req.deleteNodeIds![0] === NODE_ID_1, "DELETE_NODE: correct node ID from prevCanvas", result);
    assert(!req.upsertNodes || req.upsertNodes.length === 0, "DELETE_NODE: no upsertNodes", result);
  }

  // ----- CREATE_EDGE -----
  console.log("\n--- CREATE_EDGE ---");
  {
    const actions = [{ type: "CREATE_EDGE", sourceTitle: "Node Alpha", targetTitle: "Node Beta", relationship: "resolves" }];
    const req = mapActionsToMutation(actions, canvasWithTwoNodes, canvasWithEdge, WS_ID);
    assert(req.upsertEdges?.length === 1, "CREATE_EDGE: produces 1 upsert edge", result);
    assert(req.upsertEdges![0].id === EDGE_ID_1, "CREATE_EDGE: correct edge ID from nextCanvas", result);
    assert(req.upsertEdges![0].sourceId === NODE_ID_1, "CREATE_EDGE: correct sourceId", result);
    assert(req.upsertEdges![0].targetId === NODE_ID_2, "CREATE_EDGE: correct targetId", result);
  }

  // ----- DELETE_EDGE -----
  console.log("\n--- DELETE_EDGE ---");
  {
    const actions = [{ type: "DELETE_EDGE", sourceTitle: "Node Alpha", targetTitle: "Node Beta", relationship: "resolves" }];
    const req = mapActionsToMutation(actions, canvasWithEdge, canvasWithTwoNodes, WS_ID);
    assert(req.deleteEdgeIds?.length === 1, "DELETE_EDGE: produces 1 deleteEdgeId", result);
    assert(req.deleteEdgeIds![0] === EDGE_ID_1, "DELETE_EDGE: correct edge ID from prevCanvas", result);
  }

  // ----- GROUP_NODES -----
  console.log("\n--- GROUP_NODES ---");
  {
    const actions = [{ type: "GROUP_NODES", groupTitle: "My Group", nodeTitles: ["Node Alpha", "Node Beta"] }];
    const req = mapActionsToMutation(actions, canvasWithTwoNodes, canvasWithGroup, WS_ID);
    assert(req.upsertGroups?.length === 1, "GROUP_NODES: produces 1 upsert group", result);
    assert(req.upsertGroups![0].id === GROUP_ID_1, "GROUP_NODES: correct group ID from nextCanvas", result);
    assert(req.upsertGroups![0].memberIds.length === 2, "GROUP_NODES: correct memberIds count", result);
    assert(req.upsertGroups![0].memberIds.includes(NODE_ID_1), "GROUP_NODES: memberIds contains node 1", result);
  }

  // ----- Multi-action batch atomicity: CREATE_NODE + CREATE_EDGE -----
  console.log("\n--- Multi-action batch: CREATE_NODE + CREATE_EDGE ---");
  {
    const actions = [
      { type: "CREATE_NODE", nodeType: "problem", title: "Node Alpha" },
      { type: "CREATE_NODE", nodeType: "solution", title: "Node Beta" },
      { type: "CREATE_EDGE", sourceTitle: "Node Alpha", targetTitle: "Node Beta", relationship: "resolves" },
    ];
    const req = mapActionsToMutation(actions, emptyCanvas, canvasWithEdge, WS_ID);
    assert(req.upsertNodes?.length === 2, "Multi-action: 2 nodes in single request", result);
    assert(req.upsertEdges?.length === 1, "Multi-action: 1 edge in single request", result);
    assert(!isMutationRequestEmpty(req), "Multi-action: request is not empty", result);
  }

  // ----- Empty action array → empty request -----
  console.log("\n--- Empty action array ---");
  {
    const req = mapActionsToMutation([], canvasWithTwoNodes, canvasWithTwoNodes, WS_ID);
    assert(isMutationRequestEmpty(req), "Empty actions: produces empty mutation request", result);
  }

  // ----- Deduplication: same node referenced twice -----
  console.log("\n--- Deduplication ---");
  {
    const actions = [
      { type: "CREATE_NODE", nodeType: "problem", title: "Node Alpha" },
      { type: "CREATE_NODE", nodeType: "problem", title: "Node Alpha" }, // duplicate
    ];
    const req = mapActionsToMutation(actions, emptyCanvas, canvasWithTwoNodes, WS_ID);
    assert(req.upsertNodes?.length === 1, "Deduplication: duplicate CREATE_NODE appears once", result);
  }

  // ----- buildMoveNodeMutation -----
  console.log("\n--- buildMoveNodeMutation ---");
  {
    const node = { id: NODE_ID_1, nodeType: "problem", title: "Node Alpha", position: { x: 999, y: 888 } };
    const mutation = buildMoveNodeMutation(WS_ID, node);
    assert(mutation.upsertNodes?.length === 1, "buildMoveNodeMutation: 1 upsertNode", result);
    assert(mutation.upsertNodes![0].id === NODE_ID_1, "buildMoveNodeMutation: correct id", result);
    assert(mutation.upsertNodes![0].positionX === 999, "buildMoveNodeMutation: positionX", result);
    assert(mutation.upsertNodes![0].positionY === 888, "buildMoveNodeMutation: positionY", result);
    assert(!isMutationRequestEmpty(mutation), "buildMoveNodeMutation: not empty", result);
  }

  // ----- Summary -----
  console.log("\n=================================================================");
  const total = result.passed + result.failed;
  console.log(`Phase 13.5 Unit Tests: ${result.passed}/${total} passed`);
  if (result.failed > 0) {
    console.log("\nFailed:");
    result.errors.forEach((e) => console.log(" ", e));
    process.exit(1);
  } else {
    console.log("ALL PASS ✅");
  }
  console.log("=================================================================");
}

runUnitTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
