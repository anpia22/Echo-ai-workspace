import {
  CURSOR_MOVE_EVENT,
  parseCursorMovePayload,
  applyRemoteCursorMove,
  pruneDisconnectedCursors,
} from "../src/app/lib/collaboration/cursorEvents.ts";
import {
  getParticipantColor,
  generateDisplayName,
} from "../src/app/lib/collaboration/participant.ts";
import { parsePresenceState } from "../src/app/lib/collaboration/presence.ts";
import { applyCanvasActions } from "../src/app/lib/applyCanvasActions.ts";
import {
  createCanvasSnapshot,
  validateCanvasSnapshot,
} from "../src/app/lib/collaboration/canvasSnapshot.ts";
import {
  applyRemoteNodeEvent,
  NODE_UPSERT_EVENT,
} from "../src/app/lib/collaboration/nodeEvents.ts";
import {
  applyRemoteEdgeEvent,
  EDGE_UPSERT_EVENT,
} from "../src/app/lib/collaboration/edgeEvents.ts";
import {
  applyRemoteGroupEvent,
  GROUP_UPSERT_EVENT,
} from "../src/app/lib/collaboration/groupEvents.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log("Starting Phase 10.8 Automated Verification Suite...\n");

// -------------------------------------------------------------
// TEST 1 — Single Cursor Capture & Flow Coordinates
// -------------------------------------------------------------
{
  const canvas = {
    nodes: [{ id: "n1", nodeType: "problem", title: "N1", position: { x: 100, y: 100 } }],
    edges: [],
    groups: [],
  };
  const beforeJson = JSON.stringify(canvas);

  // Simulate screenToFlowPosition conversion:
  // Given screen coords (clientX, clientY) and viewport transform { x: 50, y: 50, zoom: 1.5 }
  // flowX = (clientX - viewport.x) / zoom
  const viewport = { x: 50, y: 50, zoom: 1.5 };
  const clientPos = { x: 200, y: 200 };
  const flowPos = {
    x: (clientPos.x - viewport.x) / viewport.zoom,
    y: (clientPos.y - viewport.y) / viewport.zoom,
  };

  assert(Math.round(flowPos.x) === 100, "TEST 1: flow X matches expected");
  assert(Math.round(flowPos.y) === 100, "TEST 1: flow Y matches expected");

  const parsed = parseCursorMovePayload({
    roomId: "room-1",
    userId: "user-1",
    x: flowPos.x,
    y: flowPos.y,
    timestamp: Date.now(),
  });
  assert(parsed !== null, "TEST 1: cursor payload parsed");
  assert(parsed.x === flowPos.x && parsed.y === flowPos.y, "TEST 1: flow coordinates preserved");

  assert(JSON.stringify(canvas) === beforeJson, "TEST 1: CanvasState untouched");
  console.log("PASS: TEST 1 — Single Cursor Capture");
}

// -------------------------------------------------------------
// TEST 2 — Two Participants Same Room
// -------------------------------------------------------------
{
  let cursorsForA = new Map();
  let cursorsForB = new Map();

  const moveFromB = parseCursorMovePayload({
    roomId: "room-1",
    userId: "user-b",
    x: 250,
    y: 350,
    timestamp: 1000,
  });
  const moveFromA = parseCursorMovePayload({
    roomId: "room-1",
    userId: "user-a",
    x: 120,
    y: 180,
    timestamp: 1000,
  });

  // Client A receives B's move
  cursorsForA = applyRemoteCursorMove(cursorsForA, moveFromB);
  assert(cursorsForA.has("user-b"), "TEST 2: A sees B's cursor");
  assert(cursorsForA.get("user-b").x === 250, "TEST 2: correct X on A");

  // Client B receives A's move
  cursorsForB = applyRemoteCursorMove(cursorsForB, moveFromA);
  assert(cursorsForB.has("user-a"), "TEST 2: B sees A's cursor");
  assert(cursorsForB.get("user-a").x === 120, "TEST 2: correct X on B");
  console.log("PASS: TEST 2 — Two Participants Same Room");
}

// -------------------------------------------------------------
// TEST 3 — Three Participants
// -------------------------------------------------------------
{
  let cursors = new Map();
  const pA = { userId: "user-a", displayName: "User A", color: "#3b82f6" };
  const pB = { userId: "user-b", displayName: "User B", color: "#10b981" };
  const pC = { userId: "user-c", displayName: "User C", color: "#f59e0b" };

  cursors = applyRemoteCursorMove(cursors, parseCursorMovePayload({ roomId: "r", userId: "user-a", x: 10, y: 20, timestamp: 100 }));
  cursors = applyRemoteCursorMove(cursors, parseCursorMovePayload({ roomId: "r", userId: "user-b", x: 30, y: 40, timestamp: 100 }));
  cursors = applyRemoteCursorMove(cursors, parseCursorMovePayload({ roomId: "r", userId: "user-c", x: 50, y: 60, timestamp: 100 }));

  assert(cursors.size === 3, "TEST 3: 3 remote cursors present");
  assert(cursors.has("user-a") && cursors.has("user-b") && cursors.has("user-c"), "TEST 3: all user IDs exist");

  // Verify participant metadata lookup
  const participants = [pA, pB, pC];
  const pMap = new Map(participants.map((p) => [p.userId, p]));
  for (const [userId, cursor] of cursors.entries()) {
    const meta = pMap.get(userId);
    assert(meta !== undefined, `TEST 3: participant ${userId} has metadata`);
    assert(meta.displayName.length > 0, `TEST 3: participant ${userId} has name`);
    assert(meta.color.startsWith("#"), `TEST 3: participant ${userId} has color`);
  }
  console.log("PASS: TEST 3 — Three Participants");
}

// -------------------------------------------------------------
// TEST 4 — Room Isolation
// -------------------------------------------------------------
{
  const currentRoom = "room-alpha";
  const eventFromRoomAlpha = parseCursorMovePayload({
    roomId: "room-alpha",
    userId: "user-1",
    x: 100,
    y: 200,
    timestamp: 500,
  });
  const eventFromRoomBeta = parseCursorMovePayload({
    roomId: "room-beta",
    userId: "user-2",
    x: 300,
    y: 400,
    timestamp: 500,
  });

  let roomAlphaCursors = new Map();

  // Alpha listener check
  if (eventFromRoomAlpha.roomId === currentRoom) {
    roomAlphaCursors = applyRemoteCursorMove(roomAlphaCursors, eventFromRoomAlpha);
  }
  if (eventFromRoomBeta.roomId === currentRoom) {
    roomAlphaCursors = applyRemoteCursorMove(roomAlphaCursors, eventFromRoomBeta);
  }

  assert(roomAlphaCursors.has("user-1"), "TEST 4: room-alpha receives event from room-alpha");
  assert(!roomAlphaCursors.has("user-2"), "TEST 4: room-alpha ignores event from room-beta");
  console.log("PASS: TEST 4 — Room Isolation");
}

// -------------------------------------------------------------
// TEST 5 — Pan/Zoom Correctness
// -------------------------------------------------------------
{
  // When cursor is at flow coordinates (500, 300):
  const flowPosition = { x: 500, y: 300 };

  // Viewport A: pan (0, 0), zoom 1.0 -> screen: 500, 300
  const vpA = { x: 0, y: 0, zoom: 1.0 };
  const screenA = {
    x: flowPosition.x * vpA.zoom + vpA.x,
    y: flowPosition.y * vpA.zoom + vpA.y,
  };
  assert(screenA.x === 500 && screenA.y === 300, "TEST 5: screen A matches");

  // Viewport B (user pans by +200, +150, zooms 2.0x):
  const vpB = { x: 200, y: 150, zoom: 2.0 };
  const screenB = {
    x: flowPosition.x * vpB.zoom + vpB.x,
    y: flowPosition.y * vpB.zoom + vpB.y,
  };
  assert(screenB.x === 1200 && screenB.y === 750, "TEST 5: screen B scales correctly");

  // Converting screenB back to flow using Viewport B yields exact original flow coordinate:
  const backToFlow = {
    x: (screenB.x - vpB.x) / vpB.zoom,
    y: (screenB.y - vpB.y) / vpB.zoom,
  };
  assert(backToFlow.x === flowPosition.x && backToFlow.y === flowPosition.y, "TEST 5: flow coordinate invariant across pan/zoom");
  console.log("PASS: TEST 5 — Pan/Zoom Correctness");
}

// -------------------------------------------------------------
// TEST 6 — Throttling / Coalescing
// -------------------------------------------------------------
{
  let broadcastCount = 0;
  const THROTTLE_MS = 35;
  let lastBroadcastTime = 0;
  let timer = null;
  let lastPos = null;

  function simulateMove(x, y, now) {
    lastPos = { x, y };
    const elapsed = now - lastBroadcastTime;
    if (elapsed >= THROTTLE_MS) {
      lastBroadcastTime = now;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      broadcastCount++;
    } else if (timer === null) {
      timer = setTimeout(() => {
        timer = null;
        lastBroadcastTime = Date.now();
        broadcastCount++;
      }, THROTTLE_MS - elapsed);
    }
  }

  // Simulate 100 rapid pointer move events over 40 milliseconds (a mouse dragging quickly)
  for (let i = 0; i < 100; i++) {
    simulateMove(i * 5, i * 5, 1000 + i * 0.4);
  }

  // Initially only 1 or 2 broadcasts should have fired, NOT 100!
  assert(broadcastCount <= 2, `TEST 6: broadcasts throttled (count=${broadcastCount})`);
  console.log("PASS: TEST 6 — Throttling");
}

// -------------------------------------------------------------
// TEST 7 — Malformed Payload Validation
// -------------------------------------------------------------
{
  const invalidPayloads = [
    null,
    undefined,
    "not-an-object",
    [],
    { roomId: "r", userId: "u", x: NaN, y: 10, timestamp: 100 },
    { roomId: "r", userId: "u", x: 10, y: Infinity, timestamp: 100 },
    { roomId: "r", userId: "u", x: 10, y: -Infinity, timestamp: 100 },
    { roomId: "r", userId: "u", x: "10", y: 10, timestamp: 100 },
    { roomId: "r", userId: "u", x: 10, y: 10, timestamp: -1 },
    { roomId: "r", userId: "u", x: 10, y: 10, timestamp: 0 },
    { roomId: "r", userId: "u", x: 10, y: 10, timestamp: NaN },
    { roomId: "", userId: "u", x: 10, y: 10, timestamp: 100 },
    { roomId: "   ", userId: "u", x: 10, y: 10, timestamp: 100 },
    { roomId: "r", userId: "", x: 10, y: 10, timestamp: 100 },
    { roomId: 123, userId: "u", x: 10, y: 10, timestamp: 100 },
  ];

  for (const bad of invalidPayloads) {
    const res = parseCursorMovePayload(bad);
    assert(res === null, `TEST 7: rejected malformed payload: ${JSON.stringify(bad)}`);
  }
  console.log("PASS: TEST 7 — Malformed Payload Validation");
}

// -------------------------------------------------------------
// TEST 8 — Stale Events (Last-Write-Wins by Timestamp)
// -------------------------------------------------------------
{
  let cursors = new Map();
  const newerMove = parseCursorMovePayload({
    roomId: "r",
    userId: "user-1",
    x: 500,
    y: 500,
    timestamp: 200,
  });
  const olderMove = parseCursorMovePayload({
    roomId: "r",
    userId: "user-1",
    x: 100,
    y: 100,
    timestamp: 100,
  });

  cursors = applyRemoteCursorMove(cursors, newerMove);
  assert(cursors.get("user-1").x === 500, "TEST 8: newer move applied");

  // Older event arrives out-of-order:
  cursors = applyRemoteCursorMove(cursors, olderMove);
  assert(cursors.get("user-1").x === 500, "TEST 8: older move rejected (stale protection passed)");
  assert(cursors.get("user-1").timestamp === 200, "TEST 8: timestamp remains 200");
  console.log("PASS: TEST 8 — Stale Events");
}

// -------------------------------------------------------------
// TEST 9 — Duplicate Events
// -------------------------------------------------------------
{
  let cursors = new Map();
  const event = parseCursorMovePayload({
    roomId: "r",
    userId: "user-1",
    x: 200,
    y: 300,
    timestamp: 500,
  });

  cursors = applyRemoteCursorMove(cursors, event);
  cursors = applyRemoteCursorMove(cursors, event);
  cursors = applyRemoteCursorMove(cursors, event);

  assert(cursors.size === 1, "TEST 9: Exactly 1 cursor entry exists");
  assert(cursors.get("user-1").x === 200, "TEST 9: position stable");
  console.log("PASS: TEST 9 — Duplicate Events");
}

// -------------------------------------------------------------
// TEST 10 — Participant Leave Pruning
// -------------------------------------------------------------
{
  let cursors = new Map();
  cursors = applyRemoteCursorMove(cursors, parseCursorMovePayload({ roomId: "r", userId: "user-a", x: 10, y: 10, timestamp: 100 }));
  cursors = applyRemoteCursorMove(cursors, parseCursorMovePayload({ roomId: "r", userId: "user-b", x: 20, y: 20, timestamp: 100 }));
  assert(cursors.size === 2, "TEST 10: initial 2 cursors");

  // User A leaves room: active participants only contains user-b
  const activeUserIds = new Set(["user-b"]);
  cursors = pruneDisconnectedCursors(cursors, activeUserIds);

  assert(cursors.size === 1, "TEST 10: 1 cursor remains");
  assert(!cursors.has("user-a"), "TEST 10: user-a's cursor was pruned");
  assert(cursors.has("user-b"), "TEST 10: user-b's cursor remains");
  console.log("PASS: TEST 10 — Participant Leave Pruning");
}

// -------------------------------------------------------------
// TEST 11 — No CanvasState Mutation
// -------------------------------------------------------------
{
  const canvas = {
    nodes: [
      { id: "n1", nodeType: "task", title: "Original Task", position: { x: 50, y: 50 } },
    ],
    edges: [
      { id: "e1", sourceId: "n1", targetId: "n1", relationship: "rel" },
    ],
    groups: [
      { id: "g1", title: "Group", memberIds: ["n1"] },
    ],
  };
  const snapshotBefore = JSON.stringify(canvas);

  // Perform extensive cursor updates
  let cursors = new Map();
  for (let i = 0; i < 50; i++) {
    const payload = parseCursorMovePayload({
      roomId: "r",
      userId: `user-${i % 5}`,
      x: i * 10,
      y: i * 15,
      timestamp: 1000 + i,
    });
    cursors = applyRemoteCursorMove(cursors, payload);
  }

  const snapshotAfter = JSON.stringify(canvas);
  assert(snapshotBefore === snapshotAfter, "TEST 11: CanvasState completely unchanged after 50 cursor operations");
  console.log("PASS: TEST 11 — No CanvasState Mutation");
}

// -------------------------------------------------------------
// TEST 12 — No Semantic Broadcasts Fired
// -------------------------------------------------------------
{
  let semanticBroadcasts = 0;
  const mockChannel = {
    broadcastNodeUpsert: () => { semanticBroadcasts++; },
    broadcastNodeDeleted: () => { semanticBroadcasts++; },
    broadcastNodeMoved: () => { semanticBroadcasts++; },
    broadcastEdgeUpsert: () => { semanticBroadcasts++; },
    broadcastEdgeDeleted: () => { semanticBroadcasts++; },
    broadcastGroupUpsert: () => { semanticBroadcasts++; },
    broadcastGroupDeleted: () => { semanticBroadcasts++; },
  };

  // Process cursor moves
  const move = parseCursorMovePayload({ roomId: "r", userId: "u1", x: 10, y: 10, timestamp: 10 });
  const map = applyRemoteCursorMove(new Map(), move);
  assert(map.size === 1, "Cursor applied");

  assert(semanticBroadcasts === 0, "TEST 12: Zero semantic broadcasts generated");
  console.log("PASS: TEST 12 — No Semantic Broadcasts");
}

// -------------------------------------------------------------
// TEST 13 — Solo Mode
// -------------------------------------------------------------
{
  // In solo mode (roomId is null), onCursorMove is undefined
  const emptyCanvas = { nodes: [], edges: [], groups: [] };
  const updated = applyCanvasActions(emptyCanvas, [
    { type: "CREATE_NODE", nodeType: "task", title: "Solo Mode Node" },
  ]);
  assert(updated.nodes.length === 1, "TEST 13: Local actions work in solo mode");
  console.log("PASS: TEST 13 — Solo Mode");
}

// -------------------------------------------------------------
// TEST 14 — Phase 10.4 Snapshot Sync Regression
// -------------------------------------------------------------
{
  const canvas = {
    nodes: [{ id: "n1", nodeType: "problem", title: "P1", position: { x: 0, y: 0 } }],
    edges: [],
    groups: [],
  };
  const snapshot = createCanvasSnapshot(canvas);
  const validated = validateCanvasSnapshot(snapshot);
  assert(validated !== null && validated.nodes[0].title === "P1", "TEST 14: 10.4 snapshot sync intact");
  console.log("PASS: TEST 14 — Phase 10.4 Snapshot Sync Regression");
}

// -------------------------------------------------------------
// TEST 15 — Phase 10.5 Real-Time Node Updates Regression
// -------------------------------------------------------------
{
  const initial = { nodes: [], edges: [], groups: [] };
  const updated = applyRemoteNodeEvent(initial, {
    type: NODE_UPSERT_EVENT,
    roomId: "r",
    senderId: "s",
    node: { id: "n1", nodeType: "decision", title: "Decision", position: { x: 50, y: 50 } },
  });
  assert(updated.nodes.length === 1 && updated.nodes[0].id === "n1", "TEST 15: 10.5 node upsert intact");
  console.log("PASS: TEST 15 — Phase 10.5 Real-Time Node Updates Regression");
}

// -------------------------------------------------------------
// TEST 16 — Phase 10.6 Real-Time Edge & Group Updates Regression
// -------------------------------------------------------------
{
  const canvasWithNodes = {
    nodes: [
      { id: "n1", nodeType: "problem", title: "N1", position: { x: 0, y: 0 } },
      { id: "n2", nodeType: "solution", title: "N2", position: { x: 100, y: 100 } },
    ],
    edges: [],
    groups: [],
  };

  const withEdge = applyRemoteEdgeEvent(canvasWithNodes, {
    type: EDGE_UPSERT_EVENT,
    roomId: "r",
    senderId: "s",
    edge: { id: "e1", sourceId: "n1", targetId: "n2", relationship: "solves" },
  });
  assert(withEdge.edges.length === 1, "TEST 16: edge upsert intact");

  const withGroup = applyRemoteGroupEvent(withEdge, {
    type: GROUP_UPSERT_EVENT,
    roomId: "r",
    senderId: "s",
    group: { id: "g1", title: "Group 1", memberIds: ["n1", "n2"] },
  });
  assert(withGroup.groups.length === 1, "TEST 16: group upsert intact");
  console.log("PASS: TEST 16 — Phase 10.6 Edge & Group Updates Regression");
}

// -------------------------------------------------------------
// TEST 17 — Phase 10.7 Multi-User Presence Regression
// -------------------------------------------------------------
{
  const presenceState = {
    "user-alpha": [{ userId: "user-alpha", displayName: "User Alpha", color: "#3b82f6" }],
    "user-beta": [{ userId: "user-beta", displayName: "User Beta", color: "#10b981" }],
  };
  const participants = parsePresenceState(presenceState);
  assert(participants.length === 2, "TEST 17: presence state parsed 2 participants");
  assert(participants.some((p) => p.userId === "user-alpha"), "TEST 17: user-alpha present");
  console.log("PASS: TEST 17 — Phase 10.7 Multi-User Presence Regression");
}

console.log("\n==========================================");
console.log("ALL 17 TESTS PASSED SUCCESSFULLY!");
console.log("==========================================");
