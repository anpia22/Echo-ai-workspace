import { applyCanvasActions, type CanvasAction, type CanvasState } from "../src/app/lib/applyCanvasActions";
import { deduplicateActions } from "../src/app/lib/deduplicateActions";
import { diffLocalNodeMutations } from "../src/app/lib/collaboration/nodeEvents";
import { diffLocalEdgeMutations } from "../src/app/lib/collaboration/edgeEvents";
import { diffLocalGroupMutations } from "../src/app/lib/collaboration/groupEvents";
import { createCanvasSnapshot } from "../src/app/lib/collaboration/canvasSnapshot";

console.log("=================================================");
console.log("RUNNING PHASE 16 RELIABILITY & STRESS TEST SUITE");
console.log("=================================================");

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`✔ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`✘ FAIL: ${testName}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

function verifyCanvasIntegrity(canvas: CanvasState, contextName: string): boolean {
  const nodeIds = new Set<string>();
  for (const node of canvas.nodes) {
    if (!node.id || nodeIds.has(node.id)) {
      console.error(`[Integrity] Duplicate or missing node ID in ${contextName}: ${node.id}`);
      return false;
    }
    if (typeof node.position?.x !== "number" || isNaN(node.position.x) ||
        typeof node.position?.y !== "number" || isNaN(node.position.y)) {
      console.error(`[Integrity] Invalid node position in ${contextName} for node ${node.id}`);
      return false;
    }
    nodeIds.add(node.id);
  }

  const edgeIds = new Set<string>();
  for (const edge of canvas.edges) {
    if (!edge.id || edgeIds.has(edge.id)) {
      console.error(`[Integrity] Duplicate or missing edge ID in ${contextName}: ${edge.id}`);
      return false;
    }
    if (!nodeIds.has(edge.sourceId) || !nodeIds.has(edge.targetId)) {
      console.error(`[Integrity] Dangling edge in ${contextName}: source ${edge.sourceId}, target ${edge.targetId}`);
      return false;
    }
    edgeIds.add(edge.id);
  }

  for (const group of canvas.groups ?? []) {
    for (const memberId of group.memberIds) {
      if (!nodeIds.has(memberId)) {
        console.error(`[Integrity] Dangling group member in ${contextName}: ${memberId}`);
        return false;
      }
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// 1. Normal Conversation: Create Node
// ---------------------------------------------------------------------------
console.log("\n--- Scenario 1: Normal Conversation ---");
let canvas: CanvasState = { nodes: [], edges: [], groups: [] };

const normalAction: CanvasAction = {
  type: "CREATE_NODE",
  nodeType: "problem",
  title: "Poor Lead Quality",
  description: "Sales team reports high bounce rate on unqualified outbound leads."
};

canvas = applyCanvasActions(canvas, [normalAction]);
assert(canvas.nodes.length === 1, "Normal conversation: 1 node created");
assert(canvas.nodes[0].title === "Poor Lead Quality", "Normal conversation: correct title");
assert(canvas.nodes[0].nodeType === "problem", "Normal conversation: correct nodeType");
assert(Boolean(canvas.nodes[0].id), "Normal conversation: node has valid UUID");
assert(verifyCanvasIntegrity(canvas, "Scenario 1"), "Normal conversation: canvas integrity verified");

// ---------------------------------------------------------------------------
// 2. Duplicate Idea
// ---------------------------------------------------------------------------
console.log("\n--- Scenario 2: Duplicate Idea ---");
const duplicateAction: CanvasAction = {
  type: "CREATE_NODE",
  nodeType: "problem",
  title: "Poor Lead Quality",
  description: "Duplicate idea submission"
};

canvas = applyCanvasActions(canvas, [duplicateAction]);
assert(canvas.nodes.length === 1, "Duplicate idea: duplicate node rejected, count remains 1");
assert(verifyCanvasIntegrity(canvas, "Scenario 2"), "Duplicate idea: canvas integrity verified");

// Also test action-level deduplication
const batchWithDuplicates = deduplicateActions([duplicateAction, duplicateAction, normalAction]);
assert(batchWithDuplicates.length === 1, "deduplicateActions: collapses duplicate actions in batch");

// ---------------------------------------------------------------------------
// 3. Existing Node Reference (CREATE_NODE + CREATE_EDGE)
// ---------------------------------------------------------------------------
console.log("\n--- Scenario 3: Existing Node Reference ---");
const solutionAction: CanvasAction = {
  type: "CREATE_NODE",
  nodeType: "solution",
  title: "AI Lead Scoring",
  description: "Automatically filter leads using ML scoring."
};

const edgeAction: CanvasAction = {
  type: "CREATE_EDGE",
  sourceTitle: "AI Lead Scoring",
  targetTitle: "Poor Lead Quality",
  relationship: "solves"
};

canvas = applyCanvasActions(canvas, [solutionAction, edgeAction]);
assert(canvas.nodes.length === 2, "Existing node reference: solution node added");
assert(canvas.edges.length === 1, "Existing node reference: relationship edge created");

const edge = canvas.edges[0];
const sourceNode = canvas.nodes.find(n => n.title === "AI Lead Scoring");
const targetNode = canvas.nodes.find(n => n.title === "Poor Lead Quality");
assert(edge.sourceId === sourceNode?.id && edge.targetId === targetNode?.id, "Edge points to correct node IDs");
assert(edge.relationship === "solves", "Edge preserves relationship type");

// Duplicate edge test
canvas = applyCanvasActions(canvas, [edgeAction]);
assert(canvas.edges.length === 1, "Duplicate edge rejected, count remains 1");
assert(verifyCanvasIntegrity(canvas, "Scenario 3"), "Existing node reference: canvas integrity verified");

// ---------------------------------------------------------------------------
// 4. Move Existing Node
// ---------------------------------------------------------------------------
console.log("\n--- Scenario 4: Move Existing Node ---");
const prevCanvas = { ...canvas, nodes: [...canvas.nodes] };
const moveAction: CanvasAction = {
  type: "MOVE_NODE",
  targetTitle: "AI Lead Scoring",
  position: { x: 350, y: 220 }
};

canvas = applyCanvasActions(canvas, [moveAction]);
const movedNode = canvas.nodes.find(n => n.title === "AI Lead Scoring");
assert(movedNode?.position.x === 350 && movedNode?.position.y === 220, "Move node: coordinates updated");
assert(movedNode?.id === sourceNode?.id, "Move node: node ID remains stable");

const nodeMutations = diffLocalNodeMutations(prevCanvas, canvas);
assert(nodeMutations.some(m => m.type === "NODE_MOVED" && m.nodeId === movedNode?.id),
  "Move node: collaboration diff generates NODE_MOVED event");
assert(verifyCanvasIntegrity(canvas, "Scenario 4"), "Move node: canvas integrity verified");

// ---------------------------------------------------------------------------
// 5. Update Existing Node
// ---------------------------------------------------------------------------
console.log("\n--- Scenario 5: Update Existing Node ---");
const updateAction: CanvasAction = {
  type: "UPDATE_NODE",
  targetTitle: "Poor Lead Quality",
  updates: {
    title: "Low Quality Inbound Leads",
    description: "Updated description after team review"
  }
};

canvas = applyCanvasActions(canvas, [updateAction]);
const updatedNode = canvas.nodes.find(n => n.title === "Low Quality Inbound Leads");
assert(Boolean(updatedNode), "Update node: title changed successfully");
assert(updatedNode?.id === targetNode?.id, "Update node: node ID preserved");
assert(canvas.edges[0].targetId === updatedNode?.id, "Update node: connected edge preserved targetId");
assert(verifyCanvasIntegrity(canvas, "Scenario 5"), "Update node: canvas integrity verified");

// ---------------------------------------------------------------------------
// 6. Delete Existing Node & Cascade
// ---------------------------------------------------------------------------
console.log("\n--- Scenario 6: Delete Existing Node ---");
const deleteAction: CanvasAction = {
  type: "DELETE_NODE",
  targetTitle: "Low Quality Inbound Leads"
};

canvas = applyCanvasActions(canvas, [deleteAction]);
assert(!canvas.nodes.some(n => n.title === "Low Quality Inbound Leads"), "Delete node: node removed");
assert(canvas.edges.length === 0, "Delete node: connected edge cascade-deleted (no orphaned edges)");
assert(canvas.nodes.length === 1, "Delete node: unrelated nodes preserved");
assert(verifyCanvasIntegrity(canvas, "Scenario 6"), "Delete node: canvas integrity verified");

// ---------------------------------------------------------------------------
// 7. Multi-Action Request
// ---------------------------------------------------------------------------
console.log("\n--- Scenario 7: Multi-Action Request ---");
canvas = { nodes: [], edges: [], groups: [] };

const multiActions: CanvasAction[] = [
  { type: "CREATE_NODE", nodeType: "problem", title: "Slow DB Queries" },
  { type: "CREATE_NODE", nodeType: "solution", title: "Read Replicas" },
  { type: "CREATE_NODE", nodeType: "decision", title: "Adopt Postgres Aurora" },
  { type: "CREATE_EDGE", sourceTitle: "Read Replicas", targetTitle: "Slow DB Queries", relationship: "solves" },
  { type: "CREATE_EDGE", sourceTitle: "Adopt Postgres Aurora", targetTitle: "Read Replicas", relationship: "supports" },
  { type: "GROUP_NODES", groupTitle: "Database Strategy", nodeTitles: ["Slow DB Queries", "Read Replicas", "Adopt Postgres Aurora"] }
];

canvas = applyCanvasActions(canvas, multiActions);
assert(canvas.nodes.length === 3, "Multi-action: 3 nodes created");
assert(canvas.edges.length === 2, "Multi-action: 2 edges created");
assert(canvas.groups.length === 1, "Multi-action: 1 group created");
assert(canvas.groups[0].memberIds.length === 3, "Multi-action: group contains all 3 member IDs");
assert(verifyCanvasIntegrity(canvas, "Scenario 7"), "Multi-action: canvas integrity verified");

// ---------------------------------------------------------------------------
// 8. Conflicting Actions in Same Batch
// ---------------------------------------------------------------------------
console.log("\n--- Scenario 8: Conflicting Actions ---");
// 8.1 Create then Delete
const createThenDelete: CanvasAction[] = [
  { type: "CREATE_NODE", nodeType: "idea", title: "Ephemeral Spike" },
  { type: "DELETE_NODE", targetTitle: "Ephemeral Spike" }
];
canvas = applyCanvasActions(canvas, createThenDelete);
assert(!canvas.nodes.some(n => n.title === "Ephemeral Spike"), "Conflicting create/delete: node safely removed");
assert(verifyCanvasIntegrity(canvas, "Scenario 8.1"), "Scenario 8.1 integrity verified");

// 8.2 Update then Delete
const updateThenDelete: CanvasAction[] = [
  { type: "UPDATE_NODE", targetTitle: "Adopt Postgres Aurora", updates: { title: "Adopt Aurora v2" } },
  { type: "DELETE_NODE", targetTitle: "Adopt Aurora v2" }
];
canvas = applyCanvasActions(canvas, updateThenDelete);
assert(!canvas.nodes.some(n => n.title.includes("Aurora")), "Conflicting update/delete: node safely removed");
assert(verifyCanvasIntegrity(canvas, "Scenario 8.2"), "Scenario 8.2 integrity verified");

// ---------------------------------------------------------------------------
// 9. Invalid AI JSON & Malformed Actions
// ---------------------------------------------------------------------------
console.log("\n--- Scenario 9: Invalid & Malformed Actions ---");
const initialSnapshot = JSON.stringify(canvas);

// Unknown action type
const malformedUnknown: any = { type: "UNKNOWN_NONSENSE_ACTION", foo: "bar" };
// Null/undefined elements
const malformedPrimitives: any = [null, undefined, "not an object", 42, {}];
// Missing required titles
const malformedMissingTitles: any = [
  { type: "CREATE_EDGE", sourceTitle: "Ghost Node A", targetTitle: "Ghost Node B" },
  { type: "UPDATE_NODE", targetTitle: "Ghost Node" },
  { type: "DELETE_NODE", targetTitle: "Ghost Node" }
];

let safeRun = true;
try {
  canvas = applyCanvasActions(canvas, [malformedUnknown, ...malformedPrimitives, ...malformedMissingTitles]);
} catch (err) {
  safeRun = false;
}
assert(safeRun, "Malformed actions: engine executes without throwing uncaught exception");
assert(verifyCanvasIntegrity(canvas, "Scenario 9"), "Malformed actions: canvas integrity maintained");

// ---------------------------------------------------------------------------
// 10. Empty & Minimal Inputs
// ---------------------------------------------------------------------------
console.log("\n--- Scenario 10: Empty & Minimal Inputs ---");
let emptyCanvasRun = applyCanvasActions({ nodes: [], edges: [], groups: [] }, []);
assert(emptyCanvasRun.nodes.length === 0, "Empty canvas with empty actions returns clean state");

// Deduplication on empty array
assert(deduplicateActions([]).length === 0, "deduplicateActions on empty array returns empty array");

// ---------------------------------------------------------------------------
// 11. Persistence Roundtrip Simulation
// ---------------------------------------------------------------------------
console.log("\n--- Scenario 11: Persistence Roundtrip ---");
const snapshot = createCanvasSnapshot(canvas);
const restoredState: CanvasState = {
  nodes: snapshot.nodes.map(n => ({ id: n.id, nodeType: n.nodeType, title: n.title, description: n.description, position: { ...n.position } })),
  edges: snapshot.edges.map(e => ({ id: e.id, sourceId: e.sourceId, targetId: e.targetId, relationship: e.relationship })),
  groups: (snapshot.groups ?? []).map(g => ({ id: g.id, title: g.title, memberIds: [...g.memberIds] }))
};
assert(restoredState.nodes.length === canvas.nodes.length, "Persistence roundtrip: node count preserved");
assert(restoredState.edges.length === canvas.edges.length, "Persistence roundtrip: edge count preserved");
assert(restoredState.groups.length === canvas.groups.length, "Persistence roundtrip: group count preserved");
assert(verifyCanvasIntegrity(restoredState, "Scenario 11"), "Persistence roundtrip: integrity verified");

// ---------------------------------------------------------------------------
// 12. Rapid Repeated Requests Simulation (Deduplication Guard)
// ---------------------------------------------------------------------------
console.log("\n--- Scenario 12: Rapid Repeated Requests ---");
const rapidActions: CanvasAction[] = [
  { type: "CREATE_NODE", nodeType: "task", title: "Configure CDN Cache" },
  { type: "CREATE_NODE", nodeType: "task", title: "Configure CDN Cache" },
  { type: "CREATE_NODE", nodeType: "task", title: "Configure CDN Cache" }
];
canvas = applyCanvasActions(canvas, rapidActions);
const cdnTasks = canvas.nodes.filter(n => n.title === "Configure CDN Cache");
assert(cdnTasks.length === 1, "Rapid identical requests: state writer strictly deduplicates to 1 node");
assert(verifyCanvasIntegrity(canvas, "Scenario 12"), "Rapid requests: canvas integrity verified");

// ---------------------------------------------------------------------------
// 13. Collaboration Mutation Diffing
// ---------------------------------------------------------------------------
console.log("\n--- Scenario 13: Collaboration Diff Invariants ---");
const previousState = { ...canvas, nodes: [...canvas.nodes], edges: [...canvas.edges], groups: [...canvas.groups] };
const nextState = applyCanvasActions(previousState, [
  { type: "CREATE_NODE", nodeType: "idea", title: "Edge Worker Optimization" },
  { type: "CREATE_EDGE", sourceTitle: "Edge Worker Optimization", targetTitle: "Configure CDN Cache", relationship: "supports" }
]);

const nodeDiffs = diffLocalNodeMutations(previousState, nextState);
const edgeDiffs = diffLocalEdgeMutations(previousState, nextState);
const groupDiffs = diffLocalGroupMutations(previousState, nextState);

assert(nodeDiffs.length === 1 && nodeDiffs[0].type === "NODE_UPSERT", "Collaboration diff: exactly 1 NODE_UPSERT produced");
assert(edgeDiffs.length === 1 && edgeDiffs[0].type === "EDGE_UPSERT", "Collaboration diff: exactly 1 EDGE_UPSERT produced");
assert(groupDiffs.length === 0, "Collaboration diff: 0 unexpected group mutations");

console.log("\n=================================================");
console.log(`PHASE 16 RELIABILITY SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log("=================================================");

if (failed > 0) {
  process.exit(1);
} else {
  console.log("ALL PHASE 16 RELIABILITY TESTS PASSED!");
  process.exit(0);
}
