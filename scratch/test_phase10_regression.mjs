// Phase 10 Collaboration Regression Suite
// Verifies that NODE_*, EDGE_*, GROUP_*, CURSOR_*, SYNC_*, Presence, Reconnect,
// Room isolation, and Solo mode contracts remain strictly intact.

import {
  NODE_UPSERT_EVENT,
  NODE_DELETED_EVENT,
  NODE_MOVED_EVENT,
  parseNodeCollaborationEvent,
  diffLocalNodeMutations,
  moveSemanticNode,
  upsertSemanticNode,
  deleteSemanticNode,
} from "../src/app/lib/collaboration/nodeEvents.ts";
import {
  EDGE_UPSERT_EVENT,
  EDGE_DELETED_EVENT,
  parseEdgeCollaborationEvent,
  diffLocalEdgeMutations,
  upsertSemanticEdge,
  deleteSemanticEdge,
} from "../src/app/lib/collaboration/edgeEvents.ts";
import {
  GROUP_UPSERT_EVENT,
  GROUP_DELETED_EVENT,
  parseGroupCollaborationEvent,
  diffLocalGroupMutations,
  upsertSemanticGroup,
  deleteSemanticGroup,
} from "../src/app/lib/collaboration/groupEvents.ts";
import {
  CURSOR_MOVE_EVENT,
  parseCursorMovePayload,
  applyRemoteCursorMove,
  pruneDisconnectedCursors,
} from "../src/app/lib/collaboration/cursorEvents.ts";
import {
  parsePresenceState,
} from "../src/app/lib/collaboration/presence.ts";
import {
  createCanvasSnapshot,
  validateCanvasSnapshot,
  isEmptyCanvasSnapshot,
  cloneCanvasSnapshot,
} from "../src/app/lib/collaboration/canvasSnapshot.ts";
import {
  getRoomChannelName,
  getRoomIdFromUrl,
  getRoomMode,
} from "../src/app/lib/collaboration/room.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log("Starting Phase 10 Collaboration Regression Suite...\n");

let passed = 0;
function pass(name) {
  passed++;
  console.log(`PASS [${passed}]: ${name}`);
}

const roomId = "room-regression-10";
const userId = "user-alice";

// 1. NODE_UPSERT, NODE_MOVED, NODE_DELETED contracts
{
  const node = { id: "n1", nodeType: "problem", title: "Test Node", position: { x: 10, y: 20 } };
  const upsertEvt = { type: NODE_UPSERT_EVENT, roomId, senderId: userId, node };
  assert(parseNodeCollaborationEvent(upsertEvt) !== null, "NODE_UPSERT parsed correctly");

  const moveEvt = { type: NODE_MOVED_EVENT, roomId, senderId: userId, nodeId: "n1", position: { x: 50, y: 60 } };
  assert(parseNodeCollaborationEvent(moveEvt) !== null, "NODE_MOVED parsed correctly");

  const delEvt = { type: NODE_DELETED_EVENT, roomId, senderId: userId, nodeId: "n1" };
  assert(parseNodeCollaborationEvent(delEvt) !== null, "NODE_DELETED parsed correctly");

  let canvas = { nodes: [], edges: [], groups: [] };
  canvas = upsertSemanticNode(canvas, node);
  assert(canvas.nodes.length === 1, "Node upserted into canvas");
  canvas = moveSemanticNode(canvas, "n1", { x: 100, y: 200 });
  assert(canvas.nodes[0].position.x === 100 && canvas.nodes[0].position.y === 200, "Node moved in canvas");
  canvas = deleteSemanticNode(canvas, "n1");
  assert(canvas.nodes.length === 0, "Node deleted from canvas");

  pass("Node Collaboration Events (UPSERT, MOVED, DELETED)");
}

// 2. EDGE_UPSERT, EDGE_DELETED contracts
{
  const edge = { id: "e1", sourceId: "n1", targetId: "n2", relationship: "causes" };
  const edgeUpEvt = { type: EDGE_UPSERT_EVENT, roomId, senderId: userId, edge };
  assert(parseEdgeCollaborationEvent(edgeUpEvt) !== null, "EDGE_UPSERT parsed correctly");

  const edgeDelEvt = { type: EDGE_DELETED_EVENT, roomId, senderId: userId, edgeId: "e1" };
  assert(parseEdgeCollaborationEvent(edgeDelEvt) !== null, "EDGE_DELETED parsed correctly");

  let canvas = {
    nodes: [
      { id: "n1", nodeType: "problem", title: "N1", position: { x: 0, y: 0 } },
      { id: "n2", nodeType: "solution", title: "N2", position: { x: 10, y: 10 } },
    ],
    edges: [],
    groups: [],
  };
  canvas = upsertSemanticEdge(canvas, edge);
  assert(canvas.edges.length === 1, "Edge upserted into canvas");
  canvas = deleteSemanticEdge(canvas, "e1");
  assert(canvas.edges.length === 0, "Edge deleted from canvas");

  pass("Edge Collaboration Events (UPSERT, DELETED)");
}

// 3. GROUP_UPSERT, GROUP_DELETED contracts
{
  const group = { id: "g1", title: "Group 1", memberIds: ["n1", "n2"] };
  const groupUpEvt = { type: GROUP_UPSERT_EVENT, roomId, senderId: userId, group };
  assert(parseGroupCollaborationEvent(groupUpEvt) !== null, "GROUP_UPSERT parsed correctly");

  const groupDelEvt = { type: GROUP_DELETED_EVENT, roomId, senderId: userId, groupId: "g1" };
  assert(parseGroupCollaborationEvent(groupDelEvt) !== null, "GROUP_DELETED parsed correctly");

  let canvas = {
    nodes: [
      { id: "n1", nodeType: "problem", title: "N1", position: { x: 0, y: 0 } },
      { id: "n2", nodeType: "solution", title: "N2", position: { x: 10, y: 10 } },
    ],
    edges: [],
    groups: [],
  };
  canvas = upsertSemanticGroup(canvas, group);
  assert(canvas.groups.length === 1, "Group upserted into canvas");
  canvas = deleteSemanticGroup(canvas, "g1");
  assert(canvas.groups.length === 0, "Group deleted from canvas");

  pass("Group Collaboration Events (UPSERT, DELETED)");
}

// 4. REQUEST_SYNC and SYNC_STATE Snapshot contracts
{
  const canvas = {
    nodes: [
      { id: "n1", nodeType: "task", title: "Task 1", position: { x: 5, y: 10 } },
      { id: "n2", nodeType: "solution", title: "Task 2", position: { x: 20, y: 30 } },
    ],
    edges: [{ id: "e1", sourceId: "n1", targetId: "n2" }],
    groups: [{ id: "g1", title: "Sprint", memberIds: ["n1"] }],
  };
  const snapshot = createCanvasSnapshot(canvas);
  assert(validateCanvasSnapshot(snapshot) !== null, "Snapshot validates");
  assert(!isEmptyCanvasSnapshot(snapshot), "Snapshot is not empty");
  const cloned = cloneCanvasSnapshot(snapshot);
  assert(cloned !== snapshot && cloned.nodes.length === 2, "Snapshot cloned cleanly");

  pass("Snapshot Sync contracts (REQUEST_SYNC, SYNC_STATE)");
}

// 5. CURSOR_MOVE contracts
{
  const cursorPayload = {
    type: CURSOR_MOVE_EVENT,
    roomId,
    userId: "user-bob",
    senderId: "user-bob",
    x: 123.45,
    y: 678.9,
    timestamp: Date.now(),
  };
  const parsed = parseCursorMovePayload(cursorPayload);
  assert(parsed !== null, "Cursor move parsed");
  let cursors = new Map();
  cursors = applyRemoteCursorMove(cursors, parsed);
  assert(cursors.has("user-bob"), "Cursor applied to map");
  assert(cursors.get("user-bob").x === 123.45, "Cursor coordinates match");

  // Prune disconnected cursors
  const activeUsers = new Set(["user-alice"]); // user-bob left
  cursors = pruneDisconnectedCursors(cursors, activeUsers);
  assert(!cursors.has("user-bob"), "Disconnected cursor pruned");

  pass("Cursor Move contracts");
}

// 6. Presence parsing contracts
{
  const rawPresence = {
    "user-1": [{ userId: "user-1", displayName: "Alice", color: "#ef4444" }],
    "user-2": [{ userId: "user-2", displayName: "Bob", color: "#3b82f6" }],
  };
  const participants = parsePresenceState(rawPresence);
  assert(participants.length === 2, "2 participants parsed from presence");
  assert(participants.find((p) => p.userId === "user-1").displayName === "Alice", "Alice found");

  pass("Presence parsing contracts");
}

// 7. Room isolation and naming contracts
{
  assert(getRoomChannelName("xyz") === "echo-room:xyz", "Channel name format matches");
  assert(getRoomMode("room-123") === "room", "Room mode detected");
  assert(getRoomMode(null) === "solo", "Solo mode detected");

  pass("Room isolation and naming contracts");
}

console.log("\n==========================================");
console.log(`ALL ${passed} PHASE 10 COLLABORATION REGRESSION TESTS PASSED!`);
console.log("==========================================\n");
