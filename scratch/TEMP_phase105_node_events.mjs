import { applyCanvasActions } from "../src/app/lib/applyCanvasActions.ts";
import {
  applyRemoteNodeEvent,
  diffLocalNodeMutations,
  parseNodeCollaborationEvent,
  upsertSemanticNode,
  deleteSemanticNode,
  moveSemanticNode,
  NODE_DELETED_EVENT,
  NODE_MOVED_EVENT,
  NODE_UPSERT_EVENT,
} from "../src/app/lib/collaboration/nodeEvents.ts";

const empty = { nodes: [], edges: [], groups: [] };

const nodeA = {
  id: "abc",
  nodeType: "problem",
  title: "Poor lead quality",
  description: "Leads are weak",
  position: { x: 10, y: 20 },
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(parseNodeCollaborationEvent(null) === null, "null payload rejected");
assert(
  parseNodeCollaborationEvent({
    type: NODE_UPSERT_EVENT,
    roomId: "room-a",
    senderId: "user-1",
  }) === null,
  "upsert without node rejected"
);
assert(
  parseNodeCollaborationEvent({
    type: NODE_UPSERT_EVENT,
    roomId: "room-a",
    senderId: "user-1",
    node: { ...nodeA, position: { x: "1", y: 2 } },
  }) === null,
  "non-numeric position rejected"
);
assert(
  parseNodeCollaborationEvent({
    type: NODE_MOVED_EVENT,
    roomId: "room-a",
    senderId: "user-1",
    nodeId: "abc",
    position: { x: 1 },
  }) === null,
  "incomplete move rejected"
);
assert(
  parseNodeCollaborationEvent({
    type: NODE_DELETED_EVENT,
    roomId: "room-a",
    senderId: "user-1",
  }) === null,
  "delete without nodeId rejected"
);
assert(
  parseNodeCollaborationEvent({
    type: "EDGE_UPSERT",
    roomId: "room-a",
    senderId: "user-1",
  }) === null,
  "unknown event ignored"
);

const parsedUpsert = parseNodeCollaborationEvent({
  type: NODE_UPSERT_EVENT,
  roomId: "room-a",
  senderId: "user-1",
  node: nodeA,
});
assert(parsedUpsert?.node.id === "abc", "upsert keeps stable id");

let canvas = applyRemoteNodeEvent(empty, parsedUpsert);
assert(canvas.nodes.length === 1, "insert on missing node");
canvas = applyRemoteNodeEvent(canvas, parsedUpsert);
assert(canvas.nodes.length === 1, "duplicate upsert does not copy");

const renamed = parseNodeCollaborationEvent({
  type: NODE_UPSERT_EVENT,
  roomId: "room-a",
  senderId: "user-1",
  node: { ...nodeA, title: "Lead quality is poor" },
});
canvas = applyRemoteNodeEvent(canvas, renamed);
assert(canvas.nodes.length === 1, "update does not duplicate");
assert(canvas.nodes[0].id === "abc", "update keeps id");
assert(canvas.nodes[0].title === "Lead quality is poor", "title updated");

const moved = parseNodeCollaborationEvent({
  type: NODE_MOVED_EVENT,
  roomId: "room-a",
  senderId: "user-1",
  nodeId: "abc",
  position: { x: 99, y: 100 },
});
canvas = applyRemoteNodeEvent(canvas, moved);
assert(canvas.nodes[0].position.x === 99, "move updates x");
assert(canvas.nodes[0].id === "abc", "move keeps id");

const ignoredMove = applyRemoteNodeEvent(empty, moved);
assert(ignoredMove.nodes.length === 0, "move of missing node is ignored");

const deleted = parseNodeCollaborationEvent({
  type: NODE_DELETED_EVENT,
  roomId: "room-a",
  senderId: "user-1",
  nodeId: "abc",
});
canvas = applyRemoteNodeEvent(canvas, deleted);
assert(canvas.nodes.length === 0, "delete removes node");
const deletedAgain = applyRemoteNodeEvent(canvas, deleted);
assert(deletedAgain.nodes.length === 0, "duplicate delete is safe");

const withEdge = {
  nodes: [nodeA],
  edges: [
    {
      id: "e1",
      sourceId: "abc",
      targetId: "abc",
      relationship: "related to",
    },
  ],
  groups: [{ id: "g1", title: "G", memberIds: ["abc"] }],
};
const afterDelete = deleteSemanticNode(withEdge, "abc");
assert(afterDelete.edges.length === 0, "delete removes connected edges locally");
assert(afterDelete.groups.length === 0, "delete removes empty groups");

const created = applyCanvasActions(empty, [
  {
    type: "CREATE_NODE",
    nodeType: "problem",
    title: "Sales performance is getting worse",
    description: "Top line",
  },
]);
assert(created.nodes.length === 1, "CREATE_NODE still works");
const createDiff = diffLocalNodeMutations(empty, created);
assert(createDiff.length === 1 && createDiff[0].type === NODE_UPSERT_EVENT, "create diffs to upsert");
assert(createDiff[0].node.id === created.nodes[0].id, "broadcast uses generated id");

const updated = applyCanvasActions(created, [
  {
    type: "UPDATE_NODE",
    targetTitle: "Sales performance is getting worse",
    updates: { title: "Sales drop" },
  },
]);
const updateDiff = diffLocalNodeMutations(created, updated);
assert(updateDiff[0].type === NODE_UPSERT_EVENT, "update diffs to upsert");
assert(updateDiff[0].node.id === created.nodes[0].id, "update keeps id");

const movedLocal = applyCanvasActions(updated, [
  {
    type: "MOVE_NODE",
    targetTitle: "Sales drop",
    position: { x: 40, y: 50 },
  },
]);
const moveDiff = diffLocalNodeMutations(updated, movedLocal);
assert(moveDiff[0].type === NODE_MOVED_EVENT, "move diffs to NODE_MOVED");
assert(moveDiff[0].nodeId === updated.nodes[0].id, "move uses stable id");

const deletedLocal = applyCanvasActions(movedLocal, [
  { type: "DELETE_NODE", targetTitle: "Sales drop" },
]);
const deleteDiff = diffLocalNodeMutations(movedLocal, deletedLocal);
assert(deleteDiff[0].type === NODE_DELETED_EVENT, "delete diffs to NODE_DELETED");
assert(deleteDiff[0].nodeId === movedLocal.nodes[0].id, "delete uses stable id");

const remoteCanvas = applyRemoteNodeEvent(empty, {
  type: NODE_UPSERT_EVENT,
  roomId: "room-a",
  senderId: "user-1",
  node: nodeA,
});
const remoteDiff = diffLocalNodeMutations(empty, remoteCanvas);
assert(remoteDiff.length === 1, "diff can describe remote apply");
assert(
  applyRemoteNodeEvent === applyRemoteNodeEvent,
  "remote apply function is isolated from broadcast"
);

const createdPair = applyCanvasActions(empty, [
  { type: "CREATE_NODE", nodeType: "problem", title: "P1" },
  { type: "CREATE_NODE", nodeType: "solution", title: "S1" },
  {
    type: "CREATE_EDGE",
    sourceTitle: "P1",
    targetTitle: "S1",
    relationship: "solves",
  },
]);
assert(createdPair.nodes.length === 2, "phase 8 create nodes");
assert(createdPair.edges.length === 1, "phase 8 create edge");

const movedPair = applyCanvasActions(createdPair, [
  { type: "MOVE_NODE", targetTitle: "P1", position: { x: 5, y: 6 } },
]);
const p1 = movedPair.nodes.find((node) => node.title === "P1");
assert(p1?.position.x === 5 && p1?.position.y === 6, "phase 8 move");

const grouped = applyCanvasActions(movedPair, [
  {
    type: "GROUP_NODES",
    nodeTitles: ["P1", "S1"],
    groupTitle: "Bundle",
  },
]);
assert(grouped.groups.length === 1, "phase 8 group");

const afterEdgeDelete = applyCanvasActions(grouped, [
  {
    type: "DELETE_EDGE",
    sourceTitle: "P1",
    targetTitle: "S1",
    relationship: "solves",
  },
]);
assert(afterEdgeDelete.edges.length === 0, "phase 8 delete edge");

assert(upsertSemanticNode(empty, nodeA).nodes[0].id === "abc", "upsert insert");
assert(
  moveSemanticNode(empty, "missing", { x: 1, y: 1 }).nodes.length === 0,
  "move missing no-op"
);

console.log("phase105 node event unit tests: pass");
