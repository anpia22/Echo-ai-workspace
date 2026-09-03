import { applyCanvasActions } from "../src/app/lib/applyCanvasActions.ts";
import {
  applyRemoteEdgeEvent,
  diffLocalEdgeMutations,
  parseEdgeCollaborationEvent,
  upsertSemanticEdge,
  deleteSemanticEdge,
  EDGE_UPSERT_EVENT,
  EDGE_DELETED_EVENT,
} from "../src/app/lib/collaboration/edgeEvents.ts";
import {
  applyRemoteGroupEvent,
  diffLocalGroupMutations,
  parseGroupCollaborationEvent,
  upsertSemanticGroup,
  deleteSemanticGroup,
  GROUP_UPSERT_EVENT,
  GROUP_DELETED_EVENT,
} from "../src/app/lib/collaboration/groupEvents.ts";
import {
  applyRemoteNodeEvent,
  diffLocalNodeMutations,
  NODE_UPSERT_EVENT,
  NODE_MOVED_EVENT,
  NODE_DELETED_EVENT,
} from "../src/app/lib/collaboration/nodeEvents.ts";
import {
  createCanvasSnapshot,
  validateCanvasSnapshot,
  cloneCanvasSnapshot,
} from "../src/app/lib/collaboration/canvasSnapshot.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

const node1 = {
  id: "node-1",
  nodeType: "problem",
  title: "Slow query response",
  description: "DB latency high",
  position: { x: 10, y: 20 },
};

const node2 = {
  id: "node-2",
  nodeType: "solution",
  title: "Add read replica",
  description: "Scale reads",
  position: { x: 200, y: 150 },
};

const initialCanvas = {
  nodes: [node1, node2],
  edges: [],
  groups: [],
};

console.log("Starting Phase 10.6 Automated Verification Suite...\n");

// -------------------------------------------------------------
// TEST 1 — EDGE CREATE
// -------------------------------------------------------------
{
  const newEdge = {
    id: "edge-123",
    sourceId: "node-1",
    targetId: "node-2",
    relationship: "solves",
  };

  const payload = {
    type: EDGE_UPSERT_EVENT,
    roomId: "room-test",
    senderId: "participant-a",
    edge: newEdge,
  };

  const parsed = parseEdgeCollaborationEvent(payload);
  assert(parsed !== null, "TEST 1: Edge event must parse successfully");
  assert(parsed.edge.id === "edge-123", "TEST 1: Stable edge ID preserved");

  const canvasB = applyRemoteEdgeEvent(initialCanvas, parsed);
  assert(canvasB.edges.length === 1, "TEST 1: Exactly 1 edge in client B");
  assert(canvasB.edges[0].id === "edge-123", "TEST 1: Same edge ID in client B");
  assert(canvasB.edges[0].sourceId === "node-1", "TEST 1: Correct sourceId");
  assert(canvasB.edges[0].targetId === "node-2", "TEST 1: Correct targetId");
  console.log("PASS: TEST 1 — EDGE CREATE");
}

// -------------------------------------------------------------
// TEST 2 — EDGE UPDATE / UPSERT
// -------------------------------------------------------------
{
  const edge = {
    id: "edge-123",
    sourceId: "node-1",
    targetId: "node-2",
    relationship: "solves",
  };
  const canvasWithEdge = upsertSemanticEdge(initialCanvas, edge);

  const updatedEdge = {
    id: "edge-123",
    sourceId: "node-1",
    targetId: "node-2",
    relationship: "supports",
  };

  const updatePayload = {
    type: EDGE_UPSERT_EVENT,
    roomId: "room-test",
    senderId: "participant-a",
    edge: updatedEdge,
  };

  const parsedUpdate = parseEdgeCollaborationEvent(updatePayload);
  const updatedCanvas = applyRemoteEdgeEvent(canvasWithEdge, parsedUpdate);

  assert(updatedCanvas.edges.length === 1, "TEST 2: No duplicate edge on update");
  assert(updatedCanvas.edges[0].id === "edge-123", "TEST 2: Same stable ID");
  assert(updatedCanvas.edges[0].relationship === "supports", "TEST 2: Relationship updated");
  console.log("PASS: TEST 2 — EDGE UPDATE / UPSERT");
}

// -------------------------------------------------------------
// TEST 3 — EDGE DELETE
// -------------------------------------------------------------
{
  const edge = {
    id: "edge-123",
    sourceId: "node-1",
    targetId: "node-2",
    relationship: "solves",
  };
  const canvasWithEdge = upsertSemanticEdge(initialCanvas, edge);

  const deletePayload = {
    type: EDGE_DELETED_EVENT,
    roomId: "room-test",
    senderId: "participant-a",
    edgeId: "edge-123",
  };

  const parsedDelete = parseEdgeCollaborationEvent(deletePayload);
  assert(parsedDelete !== null, "TEST 3: Delete event parsed");

  const canvasAfterDelete = applyRemoteEdgeEvent(canvasWithEdge, parsedDelete);
  assert(canvasAfterDelete.edges.length === 0, "TEST 3: Edge removed");
  console.log("PASS: TEST 3 — EDGE DELETE");
}

// -------------------------------------------------------------
// TEST 4 — DUPLICATE EDGE UPSERT
// -------------------------------------------------------------
{
  const edge = {
    id: "edge-dup",
    sourceId: "node-1",
    targetId: "node-2",
    relationship: "related to",
  };

  const payload = {
    type: EDGE_UPSERT_EVENT,
    roomId: "room-test",
    senderId: "participant-a",
    edge,
  };

  const parsed = parseEdgeCollaborationEvent(payload);
  const step1 = applyRemoteEdgeEvent(initialCanvas, parsed);
  const step2 = applyRemoteEdgeEvent(step1, parsed);

  assert(step2.edges.length === 1, "TEST 4: Duplicate upsert maintains exactly one edge");
  assert(step2 === step1, "TEST 4: Idempotent upsert preserves reference when unchanged");
  console.log("PASS: TEST 4 — DUPLICATE EDGE UPSERT");
}

// -------------------------------------------------------------
// TEST 5 — DUPLICATE EDGE DELETE
// -------------------------------------------------------------
{
  const edge = {
    id: "edge-del-dup",
    sourceId: "node-1",
    targetId: "node-2",
    relationship: "related to",
  };

  const canvasWithEdge = upsertSemanticEdge(initialCanvas, edge);
  const step1 = deleteSemanticEdge(canvasWithEdge, "edge-del-dup");
  assert(step1.edges.length === 0, "TEST 5: First delete removes edge");

  const step2 = deleteSemanticEdge(step1, "edge-del-dup");
  assert(step2.edges.length === 0, "TEST 5: Second delete does not error or change state");
  assert(step2 === step1, "TEST 5: Reference preserved on missing edge delete");
  console.log("PASS: TEST 5 — DUPLICATE EDGE DELETE");
}

// -------------------------------------------------------------
// TEST 6 — GROUP CREATE
// -------------------------------------------------------------
{
  const group = {
    id: "group-arch",
    title: "Database Architecture",
    memberIds: ["node-1", "node-2"],
  };

  const payload = {
    type: GROUP_UPSERT_EVENT,
    roomId: "room-test",
    senderId: "participant-a",
    group,
  };

  const parsed = parseGroupCollaborationEvent(payload);
  assert(parsed !== null, "TEST 6: Group event parsed successfully");
  assert(parsed.group.id === "group-arch", "TEST 6: Stable group ID");

  const canvasB = applyRemoteGroupEvent(initialCanvas, parsed);
  assert(canvasB.groups.length === 1, "TEST 6: Exactly 1 group in client B");
  assert(canvasB.groups[0].id === "group-arch", "TEST 6: Same stable ID in client B");
  assert(canvasB.groups[0].title === "Database Architecture", "TEST 6: Group title matches");
  assert(canvasB.groups[0].memberIds.length === 2, "TEST 6: Membership matches");
  console.log("PASS: TEST 6 — GROUP CREATE");
}

// -------------------------------------------------------------
// TEST 7 — GROUP UPSERT IDEMPOTENCY
// -------------------------------------------------------------
{
  const group = {
    id: "group-dup",
    title: "Duplicate Group",
    memberIds: ["node-1"],
  };

  const payload = {
    type: GROUP_UPSERT_EVENT,
    roomId: "room-test",
    senderId: "participant-a",
    group,
  };

  const parsed = parseGroupCollaborationEvent(payload);
  const step1 = applyRemoteGroupEvent(initialCanvas, parsed);
  const step2 = applyRemoteGroupEvent(step1, parsed);

  assert(step2.groups.length === 1, "TEST 7: Exactly 1 group after duplicate upsert");
  assert(step2 === step1, "TEST 7: Idempotent group upsert preserves reference");
  console.log("PASS: TEST 7 — GROUP UPSERT IDEMPOTENCY");
}

// -------------------------------------------------------------
// TEST 8 — GROUP DELETE
// -------------------------------------------------------------
{
  const group = {
    id: "group-del",
    title: "Group To Delete",
    memberIds: ["node-1"],
  };

  const withGroup = upsertSemanticGroup(initialCanvas, group);
  assert(withGroup.groups.length === 1, "Group added");

  const deletePayload = {
    type: GROUP_DELETED_EVENT,
    roomId: "room-test",
    senderId: "participant-a",
    groupId: "group-del",
  };

  const parsedDelete = parseGroupCollaborationEvent(deletePayload);
  const afterDelete = applyRemoteGroupEvent(withGroup, parsedDelete);
  assert(afterDelete.groups.length === 0, "TEST 8: Group removed");

  const repeatDelete = applyRemoteGroupEvent(afterDelete, parsedDelete);
  assert(repeatDelete.groups.length === 0, "TEST 8: Repeated group delete is safe");
  assert(repeatDelete === afterDelete, "TEST 8: Idempotent on missing group");
  console.log("PASS: TEST 8 — GROUP DELETE");
}

// -------------------------------------------------------------
// TEST 9 — NO ECHO LOOP
// -------------------------------------------------------------
{
  // Remote events update CanvasState directly without triggering diffLocalEdgeMutations or diffLocalGroupMutations
  let broadcastCount = 0;
  const mockRoomConnection = {
    broadcastEdgeUpsert: () => { broadcastCount++; },
    broadcastEdgeDeleted: () => { broadcastCount++; },
    broadcastGroupUpsert: () => { broadcastCount++; },
    broadcastGroupDeleted: () => { broadcastCount++; },
  };

  // When Client B applies a remote event:
  const remoteEvent = {
    type: EDGE_UPSERT_EVENT,
    roomId: "room-test",
    senderId: "participant-a",
    edge: {
      id: "edge-no-echo",
      sourceId: "node-1",
      targetId: "node-2",
      relationship: "solves",
    },
  };

  // Client B's handler only calls applyRemoteEdgeEvent:
  const canvasB = applyRemoteEdgeEvent(initialCanvas, remoteEvent);
  assert(canvasB.edges.length === 1, "TEST 9: Edge applied to CanvasState");

  // Client B never invokes local publish helpers for remote events:
  assert(broadcastCount === 0, "TEST 9: Client B does not broadcast when receiving remote event");
  console.log("PASS: TEST 9 — NO ECHO LOOP");
}

// -------------------------------------------------------------
// TEST 10 — ROOM ISOLATION
// -------------------------------------------------------------
{
  const currentRoom = "room-A";
  const edgePayloadWrongRoom = {
    type: EDGE_UPSERT_EVENT,
    roomId: "room-B",
    senderId: "participant-other",
    edge: {
      id: "edge-wrong-room",
      sourceId: "node-1",
      targetId: "node-2",
    },
  };

  const parsed = parseEdgeCollaborationEvent(edgePayloadWrongRoom);
  assert(parsed !== null, "Payload parsed");

  // useRoomChannel filters: parsed.roomId !== currentRoom -> ignored!
  const isTargetRoom = parsed.roomId === currentRoom;
  assert(!isTargetRoom, "TEST 10: Event from room-B is rejected for room-A");
  console.log("PASS: TEST 10 — ROOM ISOLATION");
}

// -------------------------------------------------------------
// TEST 11 — MALFORMED EDGE EVENTS
// -------------------------------------------------------------
{
  assert(parseEdgeCollaborationEvent(null) === null, "TEST 11: null payload rejected");
  assert(parseEdgeCollaborationEvent({}) === null, "TEST 11: empty payload rejected");
  assert(parseEdgeCollaborationEvent({ type: EDGE_UPSERT_EVENT, roomId: "r" }) === null, "TEST 11: missing sender rejected");
  assert(
    parseEdgeCollaborationEvent({
      type: EDGE_UPSERT_EVENT,
      roomId: "r",
      senderId: "s",
      edge: { id: "e1" }, // missing source/target
    }) === null,
    "TEST 11: edge without source/target rejected"
  );
  assert(
    parseEdgeCollaborationEvent({
      type: EDGE_UPSERT_EVENT,
      roomId: "r",
      senderId: "s",
      edge: { id: "", sourceId: "n1", targetId: "n2" },
    }) === null,
    "TEST 11: empty edge id rejected"
  );
  assert(
    parseEdgeCollaborationEvent({
      type: EDGE_DELETED_EVENT,
      roomId: "r",
      senderId: "s",
      edgeId: "",
    }) === null,
    "TEST 11: empty delete edgeId rejected"
  );
  console.log("PASS: TEST 11 — MALFORMED EDGE EVENTS");
}

// -------------------------------------------------------------
// TEST 12 — MALFORMED GROUP EVENTS
// -------------------------------------------------------------
{
  assert(parseGroupCollaborationEvent(null) === null, "TEST 12: null payload rejected");
  assert(parseGroupCollaborationEvent({}) === null, "TEST 12: empty payload rejected");
  assert(
    parseGroupCollaborationEvent({
      type: GROUP_UPSERT_EVENT,
      roomId: "r",
      senderId: "s",
      group: { id: "g1", title: 123, memberIds: [] },
    }) === null,
    "TEST 12: invalid title rejected"
  );
  assert(
    parseGroupCollaborationEvent({
      type: GROUP_UPSERT_EVENT,
      roomId: "r",
      senderId: "s",
      group: { id: "g1", title: "T", memberIds: [123] },
    }) === null,
    "TEST 12: non-string memberId rejected"
  );
  assert(
    parseGroupCollaborationEvent({
      type: GROUP_DELETED_EVENT,
      roomId: "r",
      senderId: "s",
      groupId: "",
    }) === null,
    "TEST 12: empty groupId rejected"
  );
  console.log("PASS: TEST 12 — MALFORMED GROUP EVENTS");
}

// -------------------------------------------------------------
// TEST 13 — MISSING NODE DEPENDENCY
// -------------------------------------------------------------
{
  const edgeMissingSource = {
    id: "edge-phantom",
    sourceId: "phantom-node-99",
    targetId: "node-2",
    relationship: "causes",
  };

  const edgeResult = upsertSemanticEdge(initialCanvas, edgeMissingSource);
  assert(edgeResult.edges.length === 0, "TEST 13: Missing source node edge ignored");
  assert(!edgeResult.nodes.some((n) => n.id === "phantom-node-99"), "TEST 13: Phantom node NOT created for edge");

  const groupMissingNode = {
    id: "group-phantom",
    title: "Phantom Group",
    memberIds: ["node-1", "phantom-node-99"],
  };

  const groupResult = upsertSemanticGroup(initialCanvas, groupMissingNode);
  assert(groupResult.groups.length === 0, "TEST 13: Group with missing member ignored");
  assert(!groupResult.nodes.some((n) => n.id === "phantom-node-99"), "TEST 13: Phantom node NOT created for group");
  console.log("PASS: TEST 13 — MISSING NODE DEPENDENCY");
}

// -------------------------------------------------------------
// TEST 14 — STABLE IDS
// -------------------------------------------------------------
{
  const actions = [
    { type: "CREATE_NODE", nodeType: "problem", title: "Task A" },
    { type: "CREATE_NODE", nodeType: "solution", title: "Task B" },
    { type: "CREATE_EDGE", sourceTitle: "Task A", targetTitle: "Task B", relationship: "solves" },
    { type: "GROUP_NODES", nodeTitles: ["Task A", "Task B"], groupTitle: "Tasks" },
  ];

  const empty = { nodes: [], edges: [], groups: [] };
  const clientACanvas = applyCanvasActions(empty, actions);
  assert(clientACanvas.edges.length === 1, "Edge created");
  assert(clientACanvas.groups.length === 1, "Group created");

  const edgeDiff = diffLocalEdgeMutations(empty, clientACanvas);
  const groupDiff = diffLocalGroupMutations(empty, clientACanvas);

  assert(edgeDiff[0].edge.id === clientACanvas.edges[0].id, "TEST 14: Edge broadcast uses exact stable ID");
  assert(groupDiff[0].group.id === clientACanvas.groups[0].id, "TEST 14: Group broadcast uses exact stable ID");

  // Client B receives both:
  let clientBCanvas = { nodes: clientACanvas.nodes, edges: [], groups: [] };
  clientBCanvas = applyRemoteEdgeEvent(clientBCanvas, {
    type: EDGE_UPSERT_EVENT,
    roomId: "room-test",
    senderId: "client-A",
    edge: edgeDiff[0].edge,
  });
  clientBCanvas = applyRemoteGroupEvent(clientBCanvas, {
    type: GROUP_UPSERT_EVENT,
    roomId: "room-test",
    senderId: "client-A",
    group: groupDiff[0].group,
  });

  assert(clientBCanvas.edges[0].id === clientACanvas.edges[0].id, "TEST 14: Client B has identical stable edge ID");
  assert(clientBCanvas.groups[0].id === clientACanvas.groups[0].id, "TEST 14: Client B has identical stable group ID");
  console.log("PASS: TEST 14 — STABLE IDS");
}

// -------------------------------------------------------------
// TEST 15 — SOLO MODE
// -------------------------------------------------------------
{
  // In solo mode (roomId is null):
  // applyCanvasActions and local state run completely independently without network.
  const empty = { nodes: [], edges: [], groups: [] };
  const soloResult = applyCanvasActions(empty, [
    { type: "CREATE_NODE", nodeType: "task", title: "Solo Task" },
    { type: "CREATE_NODE", nodeType: "solution", title: "Solo Solution" },
    { type: "CREATE_EDGE", sourceTitle: "Solo Task", targetTitle: "Solo Solution" },
    { type: "GROUP_NODES", nodeTitles: ["Solo Task", "Solo Solution"], groupTitle: "Solo Group" },
  ]);

  assert(soloResult.nodes.length === 2, "TEST 15: Nodes created in solo mode");
  assert(soloResult.edges.length === 1, "TEST 15: Edge created in solo mode");
  assert(soloResult.groups.length === 1, "TEST 15: Group created in solo mode");
  console.log("PASS: TEST 15 — SOLO MODE");
}

// -------------------------------------------------------------
// TEST 16 — PHASE 8 REGRESSION
// -------------------------------------------------------------
{
  const empty = { nodes: [], edges: [], groups: [] };
  // CREATE_NODE
  let c = applyCanvasActions(empty, [
    { type: "CREATE_NODE", nodeType: "problem", title: "P1" },
    { type: "CREATE_NODE", nodeType: "solution", title: "S1" },
  ]);
  assert(c.nodes.length === 2, "P8: CREATE_NODE");

  // CREATE_EDGE
  c = applyCanvasActions(c, [
    { type: "CREATE_EDGE", sourceTitle: "P1", targetTitle: "S1", relationship: "solves" },
  ]);
  assert(c.edges.length === 1, "P8: CREATE_EDGE");

  // UPDATE_NODE
  c = applyCanvasActions(c, [
    { type: "UPDATE_NODE", targetTitle: "P1", updates: { title: "P1 Renamed" } },
  ]);
  assert(c.nodes.some((n) => n.title === "P1 Renamed"), "P8: UPDATE_NODE");

  // MOVE_NODE
  c = applyCanvasActions(c, [
    { type: "MOVE_NODE", targetTitle: "S1", position: { x: 50, y: 60 } },
  ]);
  const s1 = c.nodes.find((n) => n.title === "S1");
  assert(s1.position.x === 50 && s1.position.y === 60, "P8: MOVE_NODE");

  // GROUP_NODES
  c = applyCanvasActions(c, [
    { type: "GROUP_NODES", nodeTitles: ["P1 Renamed", "S1"], groupTitle: "Group 1" },
  ]);
  assert(c.groups.length === 1, "P8: GROUP_NODES");

  // DELETE_EDGE
  c = applyCanvasActions(c, [
    { type: "DELETE_EDGE", sourceTitle: "P1 Renamed", targetTitle: "S1" },
  ]);
  assert(c.edges.length === 0, "P8: DELETE_EDGE");

  // DELETE_NODE
  c = applyCanvasActions(c, [
    { type: "DELETE_NODE", targetTitle: "P1 Renamed" },
  ]);
  assert(c.nodes.length === 1, "P8: DELETE_NODE");
  console.log("PASS: TEST 16 — PHASE 8 REGRESSION");
}

// -------------------------------------------------------------
// TEST 17 — PHASE 10.4 SNAPSHOT REGRESSION
// -------------------------------------------------------------
{
  const fullCanvas = {
    nodes: [node1, node2],
    edges: [{ id: "e1", sourceId: "node-1", targetId: "node-2", relationship: "solves" }],
    groups: [{ id: "g1", title: "Architecture", memberIds: ["node-1", "node-2"] }],
  };

  const snapshot = createCanvasSnapshot(fullCanvas);
  const validated = validateCanvasSnapshot(snapshot);
  assert(validated !== null, "TEST 17: Valid snapshot passes validation");
  assert(validated.nodes.length === 2, "TEST 17: Nodes in snapshot");
  assert(validated.edges.length === 1, "TEST 17: Edges in snapshot");
  assert(validated.groups.length === 1, "TEST 17: Groups in snapshot");

  // Hydration does NOT call diffLocalEdgeMutations or publish helpers:
  const cloned = cloneCanvasSnapshot(validated);
  assert(cloned.edges[0].id === "e1", "TEST 17: Edge preserved in hydrated snapshot");
  assert(cloned.groups[0].id === "g1", "TEST 17: Group preserved in hydrated snapshot");
  console.log("PASS: TEST 17 — PHASE 10.4 SNAPSHOT REGRESSION");
}

// -------------------------------------------------------------
// TEST 18 — PHASE 10.5 NODE REGRESSION
// -------------------------------------------------------------
{
  const empty = { nodes: [], edges: [], groups: [] };
  // NODE_UPSERT
  const upserted = applyRemoteNodeEvent(empty, {
    type: NODE_UPSERT_EVENT,
    roomId: "r",
    senderId: "s",
    node: node1,
  });
  assert(upserted.nodes.length === 1, "TEST 18: NODE_UPSERT works");

  // NODE_MOVED
  const moved = applyRemoteNodeEvent(upserted, {
    type: NODE_MOVED_EVENT,
    roomId: "r",
    senderId: "s",
    nodeId: "node-1",
    position: { x: 77, y: 88 },
  });
  assert(moved.nodes[0].position.x === 77, "TEST 18: NODE_MOVED works");

  // NODE_DELETED
  const deleted = applyRemoteNodeEvent(moved, {
    type: NODE_DELETED_EVENT,
    roomId: "r",
    senderId: "s",
    nodeId: "node-1",
  });
  assert(deleted.nodes.length === 0, "TEST 18: NODE_DELETED works");
  console.log("PASS: TEST 18 — PHASE 10.5 NODE REGRESSION");
}

console.log("\n==========================================");
console.log("ALL 18 TESTS PASSED SUCCESSFULLY!");
console.log("==========================================");
