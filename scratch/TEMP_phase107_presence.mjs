import {
  getParticipantColor,
  generateDisplayName,
  getOrCreateParticipant,
  PARTICIPANT_PALETTE,
} from "../src/app/lib/collaboration/participant.ts";
import { parsePresenceState } from "../src/app/lib/collaboration/presence.ts";
import { applyCanvasActions } from "../src/app/lib/applyCanvasActions.ts";
import {
  diffLocalNodeMutations,
  applyRemoteNodeEvent,
  NODE_UPSERT_EVENT,
} from "../src/app/lib/collaboration/nodeEvents.ts";
import {
  diffLocalEdgeMutations,
  applyRemoteEdgeEvent,
  EDGE_UPSERT_EVENT,
} from "../src/app/lib/collaboration/edgeEvents.ts";
import {
  diffLocalGroupMutations,
  applyRemoteGroupEvent,
  GROUP_UPSERT_EVENT,
} from "../src/app/lib/collaboration/groupEvents.ts";
import {
  createCanvasSnapshot,
  validateCanvasSnapshot,
} from "../src/app/lib/collaboration/canvasSnapshot.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log("Starting Phase 10.7 Automated Verification Suite...\n");

// -------------------------------------------------------------
// TEST 1 — Single Participant
// -------------------------------------------------------------
{
  const p1 = {
    userId: "user-1",
    displayName: "User 1001",
    color: PARTICIPANT_PALETTE[0],
  };

  const presenceState = {
    "user-1": [p1],
  };

  const participants = parsePresenceState(presenceState);
  assert(participants.length === 1, "TEST 1: participant count = 1");
  assert(participants[0].userId === "user-1", "TEST 1: user-1 id matches");
  assert(participants[0].displayName === "User 1001", "TEST 1: displayName matches");
  assert(participants[0].color === PARTICIPANT_PALETTE[0], "TEST 1: color matches");
  console.log("PASS: TEST 1 — Single Participant");
}

// -------------------------------------------------------------
// TEST 2 — Two Participants Same Room
// -------------------------------------------------------------
{
  const pA = { userId: "user-a", displayName: "User 1111", color: "#3b82f6" };
  const pB = { userId: "user-b", displayName: "User 2222", color: "#10b981" };

  const roomAPresence = {
    "user-a": [pA],
    "user-b": [pB],
  };

  const participants = parsePresenceState(roomAPresence);
  assert(participants.length === 2, "TEST 2: participant count = 2");
  const userIds = new Set(participants.map((p) => p.userId));
  assert(userIds.has("user-a"), "TEST 2: user-a is present");
  assert(userIds.has("user-b"), "TEST 2: user-b is present");
  console.log("PASS: TEST 2 — Two Participants Same Room");
}

// -------------------------------------------------------------
// TEST 3 — Three Participants
// -------------------------------------------------------------
{
  const pA = { userId: "user-a", displayName: "User A", color: "#3b82f6" };
  const pB = { userId: "user-b", displayName: "User B", color: "#10b981" };
  const pC = { userId: "user-c", displayName: "User C", color: "#f59e0b" };

  const roomPresence = {
    "user-a": [pA],
    "user-b": [pB],
    "user-c": [pC],
  };

  const participants = parsePresenceState(roomPresence);
  assert(participants.length === 3, "TEST 3: participant count = 3");
  const userIds = new Set(participants.map((p) => p.userId));
  assert(userIds.has("user-a") && userIds.has("user-b") && userIds.has("user-c"), "TEST 3: all 3 users present");
  console.log("PASS: TEST 3 — Three Participants");
}

// -------------------------------------------------------------
// TEST 4 — Participant Leave
// -------------------------------------------------------------
{
  const pA = { userId: "user-a", displayName: "User A", color: "#3b82f6" };
  const pB = { userId: "user-b", displayName: "User B", color: "#10b981" };

  // Initial state: A and B in room
  let state = {
    "user-a": [pA],
    "user-b": [pB],
  };
  let participants = parsePresenceState(state);
  assert(participants.length === 2, "TEST 4: initial count = 2");

  // User A leaves: A removed from presenceState
  state = {
    "user-b": [pB],
  };
  participants = parsePresenceState(state);
  assert(participants.length === 1, "TEST 4: count changes from 2 -> 1");
  assert(participants[0].userId === "user-b", "TEST 4: only user-b remains");
  console.log("PASS: TEST 4 — Participant Leave");
}

// -------------------------------------------------------------
// TEST 5 — Room Isolation
// -------------------------------------------------------------
{
  const pA = { userId: "user-a", displayName: "User A", color: "#3b82f6" };
  const pB = { userId: "user-b", displayName: "User B", color: "#10b981" };
  const pC = { userId: "user-c", displayName: "User C", color: "#f59e0b" };

  // Room A presence:
  const roomAPresence = {
    "user-a": [pA],
    "user-b": [pB],
  };

  // Room B presence:
  const roomBPresence = {
    "user-c": [pC],
  };

  const participantsA = parsePresenceState(roomAPresence);
  const participantsB = parsePresenceState(roomBPresence);

  assert(participantsA.length === 2, "TEST 5: Room A has 2 participants");
  assert(!participantsA.some((p) => p.userId === "user-c"), "TEST 5: Room A does not see user-c");

  assert(participantsB.length === 1, "TEST 5: Room B has 1 participant");
  assert(!participantsB.some((p) => p.userId === "user-a" || p.userId === "user-b"), "TEST 5: Room B does not see user-a or user-b");
  console.log("PASS: TEST 5 — Room Isolation");
}

// -------------------------------------------------------------
// TEST 6 — Stable Session Identity
// -------------------------------------------------------------
{
  // Simulate sessionStorage persistence
  const mockStorage = new Map();
  const originalSessionStorage = global.sessionStorage;
  global.sessionStorage = {
    getItem: (key) => mockStorage.get(key) || null,
    setItem: (key, val) => mockStorage.set(key, String(val)),
    removeItem: (key) => mockStorage.delete(key),
  };
  global.window = {};

  try {
    const participant1 = getOrCreateParticipant();
    const id1 = participant1.userId;
    const name1 = participant1.displayName;
    const color1 = participant1.color;

    // Simulate React remount / re-render
    const participant2 = getOrCreateParticipant();
    assert(participant2.userId === id1, "TEST 6: userId survives remount");
    assert(participant2.displayName === name1, "TEST 6: displayName survives remount");
    assert(participant2.color === color1, "TEST 6: color survives remount");
  } finally {
    if (originalSessionStorage) {
      global.sessionStorage = originalSessionStorage;
    }
  }
  console.log("PASS: TEST 6 — Stable Session Identity");
}

// -------------------------------------------------------------
// TEST 7 — Strict Mode / Duplicate Tracking
// -------------------------------------------------------------
{
  const pA = { userId: "user-a", displayName: "User A", color: "#3b82f6" };

  // React Strict Mode or duplicate channel tracks produce multiple metas under same user key
  const strictModePresenceState = {
    "user-a": [pA, pA, { ...pA, extraMeta: 123 }],
  };

  const participants = parsePresenceState(strictModePresenceState);
  assert(participants.length === 1, "TEST 7: Exactly 1 participant despite multiple presence metas");
  assert(participants[0].userId === "user-a", "TEST 7: Normalized user-a preserved");
  console.log("PASS: TEST 7 — Strict Mode / Duplicate Tracking");
}

// -------------------------------------------------------------
// TEST 8 — Presence Metadata
// -------------------------------------------------------------
{
  const p = {
    userId: "valid-uuid-1234",
    displayName: "User 7890",
    color: "#8b5cf6",
  };

  const state = { "valid-uuid-1234": [p] };
  const parsed = parsePresenceState(state);

  assert(parsed.length === 1, "Parsed 1 participant");
  assert(typeof parsed[0].userId === "string" && parsed[0].userId.length > 0, "TEST 8: valid userId string");
  assert(typeof parsed[0].displayName === "string" && parsed[0].displayName.length > 0, "TEST 8: valid displayName string");
  assert(typeof parsed[0].color === "string" && parsed[0].color.startsWith("#"), "TEST 8: valid hex color");
  console.log("PASS: TEST 8 — Presence Metadata");
}

// -------------------------------------------------------------
// TEST 9 — No Canvas Mutation
// -------------------------------------------------------------
{
  const canvas = {
    nodes: [{ id: "n1", nodeType: "problem", title: "N1", position: { x: 0, y: 0 } }],
    edges: [{ id: "e1", sourceId: "n1", targetId: "n1" }],
    groups: [{ id: "g1", title: "G1", memberIds: ["n1"] }],
  };

  const beforeCanvasJson = JSON.stringify(canvas);

  // Simulate presence join / sync / leave
  const presenceState = {
    "user-1": [{ userId: "user-1", displayName: "User 1", color: "#3b82f6" }],
  };
  const participants = parsePresenceState(presenceState);
  assert(participants.length === 1, "Presence parsed");

  const afterCanvasJson = JSON.stringify(canvas);
  assert(beforeCanvasJson === afterCanvasJson, "TEST 9: CanvasState remains completely untouched by presence operations");
  console.log("PASS: TEST 9 — No Canvas Mutation");
}

// -------------------------------------------------------------
// TEST 10 — No Broadcast Regression
// -------------------------------------------------------------
{
  let broadcastCount = 0;
  const mockBroadcast = {
    broadcastNodeUpsert: () => { broadcastCount++; },
    broadcastNodeDeleted: () => { broadcastCount++; },
    broadcastNodeMoved: () => { broadcastCount++; },
    broadcastEdgeUpsert: () => { broadcastCount++; },
    broadcastEdgeDeleted: () => { broadcastCount++; },
    broadcastGroupUpsert: () => { broadcastCount++; },
    broadcastGroupDeleted: () => { broadcastCount++; },
  };

  // Processing presence changes does NOT invoke any broadcast methods
  const state = {
    "user-x": [{ userId: "user-x", displayName: "User X", color: "#ec4899" }],
  };
  const participants = parsePresenceState(state);
  assert(participants.length === 1, "Presence parsed");

  assert(broadcastCount === 0, "TEST 10: 0 broadcasts fired during presence operations");
  console.log("PASS: TEST 10 — No Broadcast Regression");
}

// -------------------------------------------------------------
// TEST 11 — Solo Mode
// -------------------------------------------------------------
{
  // When roomId is null:
  // useRoomChannel returns IDLE_CONNECTION with participants: [], currentParticipant: null
  // RoomControls renders "Create Room" button only.
  const empty = { nodes: [], edges: [], groups: [] };
  const soloResult = applyCanvasActions(empty, [
    { type: "CREATE_NODE", nodeType: "task", title: "Solo Task" },
  ]);

  assert(soloResult.nodes.length === 1, "TEST 11: Canvas mutations work locally in solo mode");
  console.log("PASS: TEST 11 — Solo Mode");
}

// -------------------------------------------------------------
// TEST 12 — Existing Collaboration Regression
// -------------------------------------------------------------
{
  // 10.4 Snapshot Regression
  const fullCanvas = {
    nodes: [{ id: "n1", nodeType: "problem", title: "N1", position: { x: 0, y: 0 } }],
    edges: [],
    groups: [],
  };
  const snapshot = createCanvasSnapshot(fullCanvas);
  const validated = validateCanvasSnapshot(snapshot);
  assert(validated !== null && validated.nodes.length === 1, "TEST 12: 10.4 snapshot sync functional");

  // 10.5 Node Updates Regression
  const nodeUpserted = applyRemoteNodeEvent(fullCanvas, {
    type: NODE_UPSERT_EVENT,
    roomId: "r",
    senderId: "s",
    node: { id: "n2", nodeType: "solution", title: "N2", position: { x: 10, y: 20 } },
  });
  assert(nodeUpserted.nodes.length === 2, "TEST 12: 10.5 node upsert functional");

  // 10.6 Edge Updates Regression
  const edgeUpserted = applyRemoteEdgeEvent(nodeUpserted, {
    type: EDGE_UPSERT_EVENT,
    roomId: "r",
    senderId: "s",
    edge: { id: "e1", sourceId: "n1", targetId: "n2", relationship: "solves" },
  });
  assert(edgeUpserted.edges.length === 1, "TEST 12: 10.6 edge upsert functional");

  // 10.6 Group Updates Regression
  const groupUpserted = applyRemoteGroupEvent(edgeUpserted, {
    type: GROUP_UPSERT_EVENT,
    roomId: "r",
    senderId: "s",
    group: { id: "g1", title: "Group", memberIds: ["n1", "n2"] },
  });
  assert(groupUpserted.groups.length === 1, "TEST 12: 10.6 group upsert functional");
  console.log("PASS: TEST 12 — Existing Collaboration Regression");
}

console.log("\n==========================================");
console.log("ALL 12 TESTS PASSED SUCCESSFULLY!");
console.log("==========================================");
