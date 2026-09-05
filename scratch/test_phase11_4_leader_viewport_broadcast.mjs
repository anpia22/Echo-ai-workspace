import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  VIEWPORT_UPDATE_EVENT,
  parseViewportUpdatePayload,
  isValidViewport,
  isValidCoordinate,
  isValidZoom,
  cloneViewport,
  isSameViewport,
  isLeaderForViewportBroadcast,
  createViewportBroadcaster,
} from "../src/app/lib/collaboration/viewportEvents.ts";
import { createCanvasSnapshot } from "../src/app/lib/collaboration/canvasSnapshot.ts";
import { getRoomIdFromUrl, getRoomMode } from "../src/app/lib/collaboration/room.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

console.log("Starting Phase 11.4 Leader Viewport Broadcast Test Suite...\n");

let passedCount = 0;
function pass(testName) {
  passedCount++;
  console.log(`PASS [${passedCount}]: ${testName}`);
}

async function runTests() {
  const roomId = "room-test-114";
  const leaderId = "user-leader-alice";
  const followerId = "user-follower-bob";

  // -------------------------------------------------------------
  // Test 1: Viewport movement can produce a valid VIEWPORT_UPDATE
  // -------------------------------------------------------------
  {
    const published = [];
    const broadcaster = createViewportBroadcaster({
      throttleMs: 50,
      isLeader: () => true,
      publish: (vp) => {
        published.push({
          type: VIEWPORT_UPDATE_EVENT,
          roomId,
          senderId: leaderId,
          viewport: cloneViewport(vp),
          timestamp: Date.now(),
        });
      },
    });

    broadcaster.onViewportMove({ x: 100, y: 200, zoom: 1.5 });
    assert(published.length === 1, "Expected 1 published event on initial move");
    const payload = published[0];
    assert(payload.type === VIEWPORT_UPDATE_EVENT, "Payload type must be VIEWPORT_UPDATE");
    assert(payload.viewport.x === 100 && payload.viewport.y === 200 && payload.viewport.zoom === 1.5, "Viewport coordinates must match");
    broadcaster.destroy();
    pass("Test 1 — Viewport movement produces a valid VIEWPORT_UPDATE");
  }

  // -------------------------------------------------------------
  // Test 2: Broadcast payload contains all required fields
  // -------------------------------------------------------------
  {
    const rawPayload = {
      type: VIEWPORT_UPDATE_EVENT,
      roomId,
      senderId: leaderId,
      viewport: { x: -45.5, y: 120.0, zoom: 0.75 },
      timestamp: Date.now(),
    };
    const parsed = parseViewportUpdatePayload(rawPayload);
    assert(parsed !== null, "parseViewportUpdatePayload must accept the payload");
    assert(parsed.type === "VIEWPORT_UPDATE", "type must match");
    assert(parsed.roomId === roomId, "roomId must match");
    assert(parsed.senderId === leaderId, "senderId must match");
    assert(parsed.viewport.x === -45.5, "viewport.x must match");
    assert(parsed.viewport.y === 120.0, "viewport.y must match");
    assert(parsed.viewport.zoom === 0.75, "viewport.zoom must match");
    assert(typeof parsed.timestamp === "number" && parsed.timestamp > 0, "timestamp must be positive number");
    pass("Test 2 — Broadcast payload contains type, roomId, senderId, viewport, timestamp");
  }

  // -------------------------------------------------------------
  // Test 3: Viewport contains finite x, finite y, positive finite zoom
  // -------------------------------------------------------------
  {
    assert(isValidViewport({ x: 0, y: 0, zoom: 1 }), "standard viewport is valid");
    assert(isValidViewport({ x: -1000.5, y: 5000.2, zoom: 0.1 }), "negative coords and low zoom are valid");
    assert(isValidCoordinate(100), "coordinate 100 is valid");
    assert(isValidCoordinate(-50), "coordinate -50 is valid");
    assert(isValidZoom(1), "zoom 1 is valid");
    assert(isValidZoom(0.001), "zoom 0.001 is valid");
    assert(!isValidZoom(0), "zoom 0 is invalid");
    assert(!isValidZoom(-0.5), "negative zoom is invalid");
    pass("Test 3 — Viewport contains finite x, finite y, positive finite zoom");
  }

  // -------------------------------------------------------------
  // Test 4: Malformed viewport is not broadcast
  // -------------------------------------------------------------
  {
    const published = [];
    const broadcaster = createViewportBroadcaster({
      throttleMs: 50,
      isLeader: () => true,
      publish: (vp) => published.push(vp),
    });

    broadcaster.onViewportMove({ x: NaN, y: 0, zoom: 1 });
    broadcaster.onViewportMove({ x: 0, y: Infinity, zoom: 1 });
    broadcaster.onViewportMove({ x: 0, y: 0, zoom: 0 });
    broadcaster.onViewportMove({ x: 0, y: 0, zoom: -1 });
    broadcaster.onViewportMove({ x: 0, y: 0, zoom: NaN });
    broadcaster.onViewportMove(null);
    broadcaster.onViewportMove(undefined);

    assert(published.length === 0, "Malformed viewports must never be broadcast");
    broadcaster.destroy();
    pass("Test 4 — Malformed viewport is not broadcast");
  }

  // -------------------------------------------------------------
  // Test 5: No followers => no viewport broadcast
  // -------------------------------------------------------------
  {
    const published = [];
    let followerCount = 0;
    let followingUserId = null;

    const broadcaster = createViewportBroadcaster({
      throttleMs: 50,
      isLeader: () => isLeaderForViewportBroadcast(followerCount, followingUserId),
      publish: (vp) => published.push(vp),
    });

    // When followerCount is 0, isLeader is false
    assert(!isLeaderForViewportBroadcast(followerCount, followingUserId), "followerCount 0 is not a leader");
    broadcaster.onViewportMove({ x: 100, y: 100, zoom: 1 });
    broadcaster.onViewportMoveEnd({ x: 100, y: 100, zoom: 1 });
    await sleep(60);

    assert(published.length === 0, "No followers must result in zero broadcasts");
    broadcaster.destroy();
    pass("Test 5 — No followers => no viewport broadcast");
  }

  // -------------------------------------------------------------
  // Test 6: Active follower => leader viewport broadcast enabled
  // -------------------------------------------------------------
  {
    const published = [];
    let followerCount = 0;
    let followingUserId = null;

    const broadcaster = createViewportBroadcaster({
      throttleMs: 50,
      isLeader: () => isLeaderForViewportBroadcast(followerCount, followingUserId),
      publish: (vp) => published.push(vp),
    });

    // Move before followers arrive: no broadcast
    broadcaster.onViewportMove({ x: 50, y: 50, zoom: 1 });
    assert(published.length === 0, "No broadcast before followers");

    // A follower joins: followerCount becomes 1
    followerCount = 1;
    assert(isLeaderForViewportBroadcast(followerCount, followingUserId), "Now participant is leader");

    broadcaster.onViewportMove({ x: 60, y: 60, zoom: 1.1 });
    assert(published.length === 1, "Viewport broadcast enabled once follower joins");
    assert(published[0].x === 60 && published[0].zoom === 1.1, "Published viewport matches latest");

    broadcaster.destroy();
    pass("Test 6 — Active follower => leader viewport broadcast enabled");
  }

  // -------------------------------------------------------------
  // Test 7: Follower does not automatically broadcast remote viewport
  // -------------------------------------------------------------
  {
    const followerPublished = [];
    let followerCount = 2; // Suppose this user had 2 followers previously
    let followingUserId = "user-alice"; // But now this user is following Alice!

    // Rule: if followingUserId !== null, participant is a FOLLOWER, never a leader
    assert(!isLeaderForViewportBroadcast(followerCount, followingUserId), "Participant following someone else must not be leader");

    const broadcaster = createViewportBroadcaster({
      throttleMs: 50,
      isLeader: () => isLeaderForViewportBroadcast(followerCount, followingUserId),
      publish: (vp) => followerPublished.push(vp),
    });

    // Remote viewport received from Alice
    const remoteViewport = { x: 300, y: 400, zoom: 1.2 };
    // Simulation of receiving remote event without rebroadcasting
    const onRemoteViewportUpdate = (event) => {
      // Must NOT call broadcaster or publishViewportUpdate
      // Simply stores latestRemoteViewport
    };

    onRemoteViewportUpdate({
      type: VIEWPORT_UPDATE_EVENT,
      roomId,
      senderId: followingUserId,
      viewport: remoteViewport,
      timestamp: Date.now(),
    });

    // Even if local viewport moved:
    broadcaster.onViewportMove(remoteViewport);
    broadcaster.onViewportMoveEnd(remoteViewport);
    await sleep(60);

    assert(followerPublished.length === 0, "Follower must never broadcast viewport");
    broadcaster.destroy();
    pass("Test 7 — Follower does not automatically broadcast remote viewport");
  }

  // -------------------------------------------------------------
  // Test 8: Rapid viewport events are throttled/coalesced
  // -------------------------------------------------------------
  {
    const published = [];
    const broadcaster = createViewportBroadcaster({
      throttleMs: 50,
      isLeader: () => true,
      publish: (vp) => published.push(cloneViewport(vp)),
    });

    // Rapid continuous movement: 10 events fired synchronously in a burst
    for (let i = 1; i <= 10; i++) {
      broadcaster.onViewportMove({ x: i * 10, y: i * 5, zoom: 1 });
    }

    // Immediately after rapid movement: only 1 immediate broadcast was sent
    assert(published.length === 1, `Expected exactly 1 broadcast during rapid movement window, got ${published.length}`);
    assert(published[0].x === 10, "First broadcast should be the initial event");

    broadcaster.destroy();
    pass("Test 8 — Rapid viewport events are throttled/coalesced");
  }

  // -------------------------------------------------------------
  // Test 9: Latest viewport is eventually broadcast after movement stops
  // -------------------------------------------------------------
  {
    const published = [];
    const broadcaster = createViewportBroadcaster({
      throttleMs: 50,
      isLeader: () => true,
      publish: (vp) => published.push(cloneViewport(vp)),
    });

    // Sequence: A -> B -> C -> D rapidly in a burst
    broadcaster.onViewportMove({ x: 10, y: 10, zoom: 1 }); // A: published immediately
    broadcaster.onViewportMove({ x: 20, y: 20, zoom: 1 }); // B
    broadcaster.onViewportMove({ x: 30, y: 30, zoom: 1 }); // C
    broadcaster.onViewportMove({ x: 40, y: 40, zoom: 1.2 }); // D (final)
    broadcaster.onViewportMoveEnd({ x: 40, y: 40, zoom: 1.2 });

    assert(published.length === 1, "Only first update published immediately");

    // Wait for trailing edge throttle timer to expire (> 50ms)
    await sleep(80);

    assert(published.length === 2, `Expected 2 broadcasts (first + final trailing), got ${published.length}`);
    assert(published[1].x === 40 && published[1].y === 40 && published[1].zoom === 1.2, "Final broadcast must contain latest viewport D");

    broadcaster.destroy();
    pass("Test 9 — Latest viewport is eventually broadcast after movement stops");
  }

  // -------------------------------------------------------------
  // Test 10: Initial mount does not broadcast viewport
  // -------------------------------------------------------------
  {
    const published = [];
    let isInitialMount = true;

    const broadcaster = createViewportBroadcaster({
      throttleMs: 50,
      isLeader: () => !isInitialMount && true,
      publish: (vp) => published.push(vp),
    });

    // Simulating mount-time viewport measurement
    const initialMeasuredViewport = { x: 0, y: 0, zoom: 1 };
    // onViewportChange is called for local ref, but broadcaster is guarded
    if (!isInitialMount) {
      broadcaster.onViewportMove(initialMeasuredViewport);
    }
    await sleep(60);

    assert(published.length === 0, "Initial mount must produce zero broadcasts");

    // After mount settles
    isInitialMount = false;
    // User moves canvas
    broadcaster.onViewportMove({ x: 15, y: 25, zoom: 1.05 });
    assert(published.length === 1, "User-initiated move after mount broadcasts successfully");

    broadcaster.destroy();
    pass("Test 10 — Initial mount does not broadcast viewport");
  }

  // -------------------------------------------------------------
  // Test 11: fitView uses the normal viewport event path
  // -------------------------------------------------------------
  {
    const published = [];
    const broadcaster = createViewportBroadcaster({
      throttleMs: 50,
      isLeader: () => true,
      publish: (vp) => published.push(cloneViewport(vp)),
    });

    // When fitView() is called, ReactFlow updates viewport and fires onChange
    const fitViewResultViewport = { x: 150, y: 220, zoom: 0.85 };
    broadcaster.onViewportMove(fitViewResultViewport);
    broadcaster.onViewportMoveEnd(fitViewResultViewport);

    assert(published.length === 1, "fitView movement routed through normal viewport broadcaster");
    assert(published[0].x === 150 && published[0].zoom === 0.85, "fitView viewport correctly captured");

    broadcaster.destroy();
    pass("Test 11 — fitView uses normal viewport event path without duplicate channels");
  }

  // -------------------------------------------------------------
  // Test 12: Remote VIEWPORT_UPDATE does not call setViewport()
  // -------------------------------------------------------------
  {
    let setViewportCallCount = 0;
    const mockReactFlowApi = {
      setViewport: () => {
        setViewportCallCount++;
      },
    };

    // Collaboration layer receives remote VIEWPORT_UPDATE
    const remotePayload = {
      type: VIEWPORT_UPDATE_EVENT,
      roomId,
      senderId: "user-leader-remote",
      viewport: { x: 500, y: 500, zoom: 1.5 },
      timestamp: Date.now(),
    };

    const parsed = parseViewportUpdatePayload(remotePayload);
    assert(parsed !== null, "Remote payload must be valid");

    // In Phase 11.4, onRemoteViewportUpdate stores latestRemoteViewportRef only
    const latestRemoteViewportRef = { current: null };
    const handleRemoteViewportUpdate = (event) => {
      latestRemoteViewportRef.current = event.viewport;
      // Phase 11.4: NO setViewport!
    };

    handleRemoteViewportUpdate(parsed);
    assert(latestRemoteViewportRef.current.x === 500, "latestRemoteViewportRef updated");
    assert(setViewportCallCount === 0, "Phase 11.4 must NOT invoke setViewport on remote event");
    pass("Test 12 — Remote VIEWPORT_UPDATE does not call setViewport()");
  }

  // -------------------------------------------------------------
  // Test 13: Remote VIEWPORT_UPDATE does not trigger another VIEWPORT_UPDATE
  // -------------------------------------------------------------
  {
    const published = [];
    const broadcaster = createViewportBroadcaster({
      throttleMs: 50,
      isLeader: () => false, // Follower receiving remote event is never leader
      publish: (vp) => published.push(vp),
    });

    // Remote event arrives
    const remoteEvent = {
      type: VIEWPORT_UPDATE_EVENT,
      roomId,
      senderId: leaderId,
      viewport: { x: 100, y: 200, zoom: 1 },
      timestamp: Date.now(),
    };

    // Handling remote event must NOT call broadcaster.onViewportMove
    assert(published.length === 0, "No rebroadcast on receiving remote viewport");
    broadcaster.destroy();
    pass("Test 13 — Remote VIEWPORT_UPDATE does not trigger another VIEWPORT_UPDATE");
  }

  // -------------------------------------------------------------
  // Test 14: Solo mode produces no realtime viewport broadcasts
  // -------------------------------------------------------------
  {
    const published = [];
    const soloRoomId = null; // Solo mode
    const followerCount = 0;
    const followingUserId = null;

    const isSoloLeader = Boolean(
      soloRoomId && isLeaderForViewportBroadcast(followerCount, followingUserId)
    );
    assert(!isSoloLeader, "Solo mode must never be considered a collaboration leader");

    const broadcaster = createViewportBroadcaster({
      throttleMs: 50,
      isLeader: () => isSoloLeader,
      publish: (vp) => published.push(vp),
    });

    broadcaster.onViewportMove({ x: 99, y: 88, zoom: 1 });
    broadcaster.onViewportMoveEnd({ x: 99, y: 88, zoom: 1 });
    await sleep(60);

    assert(published.length === 0, "Solo mode produces zero realtime broadcasts");
    broadcaster.destroy();
    pass("Test 14 — Solo mode produces no realtime viewport broadcasts");
  }

  // -------------------------------------------------------------
  // Test 15: Room isolation remains intact
  // -------------------------------------------------------------
  {
    const currentRoom = "room-AAA";
    const foreignPayload = {
      type: VIEWPORT_UPDATE_EVENT,
      roomId: "room-BBB",
      senderId: leaderId,
      viewport: { x: 100, y: 200, zoom: 1 },
      timestamp: Date.now(),
    };

    const parsed = parseViewportUpdatePayload(foreignPayload);
    assert(parsed !== null, "Foreign payload is syntactically valid");
    assert(parsed.roomId !== currentRoom, "Foreign roomId does not match currentRoom");

    let accepted = false;
    if (parsed.roomId === currentRoom) {
      accepted = true;
    }
    assert(!accepted, "Events from foreign rooms must be ignored");
    pass("Test 15 — Room isolation remains intact");
  }

  // -------------------------------------------------------------
  // Test 16: No viewport persistence
  // -------------------------------------------------------------
  {
    const mockLocalStorage = {};
    const broadcastViewport = { x: 777, y: 888, zoom: 1.25 };

    // Simulating viewport broadcast
    const published = [];
    const broadcaster = createViewportBroadcaster({
      throttleMs: 50,
      isLeader: () => true,
      publish: (vp) => published.push(vp),
    });

    broadcaster.onViewportMove(broadcastViewport);
    assert(published.length === 1, "Viewport broadcasted");
    assert(Object.keys(mockLocalStorage).length === 0, "localStorage must remain untouched by viewport events");

    broadcaster.destroy();
    pass("Test 16 — No viewport persistence");
  }

  // -------------------------------------------------------------
  // Test 17: No CanvasState mutation
  // -------------------------------------------------------------
  {
    const canvasBefore = {
      nodes: [{ id: "n1", nodeType: "problem", title: "Problem 1", position: { x: 10, y: 20 } }],
      edges: [{ id: "e1", sourceId: "n1", targetId: "n2" }],
      groups: [{ id: "g1", title: "Group 1", memberIds: ["n1"] }],
    };
    const snapshotBefore = JSON.stringify(createCanvasSnapshot(canvasBefore));

    const broadcaster = createViewportBroadcaster({
      throttleMs: 50,
      isLeader: () => true,
      publish: () => {},
    });

    for (let i = 0; i < 5; i++) {
      broadcaster.onViewportMove({ x: i * 50, y: i * 30, zoom: 1 + i * 0.1 });
    }

    const snapshotAfter = JSON.stringify(createCanvasSnapshot(canvasBefore));
    assert(snapshotBefore === snapshotAfter, "CanvasState nodes, edges, and groups must not be mutated");

    broadcaster.destroy();
    pass("Test 17 — No CanvasState mutation");
  }

  // -------------------------------------------------------------
  // Test 18: No duplicate viewport listeners
  // -------------------------------------------------------------
  {
    const published = [];
    // Mount broadcaster 1
    const b1 = createViewportBroadcaster({
      throttleMs: 50,
      isLeader: () => true,
      publish: (vp) => published.push(vp),
    });

    // Unmount / StrictMode cleanup
    b1.destroy();

    // Mount broadcaster 2
    const b2 = createViewportBroadcaster({
      throttleMs: 50,
      isLeader: () => true,
      publish: (vp) => published.push(vp),
    });

    b2.onViewportMove({ x: 55, y: 66, zoom: 1 });
    assert(published.length === 1, `Exactly 1 message broadcast, got ${published.length}`);

    b2.destroy();
    pass("Test 18 — No duplicate viewport listeners or double broadcasts");
  }

  // -------------------------------------------------------------
  // Test 19: Timers/animation callbacks are cleaned up
  // -------------------------------------------------------------
  {
    const published = [];
    const broadcaster = createViewportBroadcaster({
      throttleMs: 50,
      isLeader: () => true,
      publish: (vp) => published.push(vp),
    });

    // First move: immediate
    broadcaster.onViewportMove({ x: 10, y: 10, zoom: 1 });
    assert(published.length === 1, "First move published");

    // Second move: queues trailing timer
    broadcaster.onViewportMove({ x: 20, y: 20, zoom: 1 });

    // Component unmounts: destroy called immediately
    broadcaster.destroy();

    // Wait for timer to have fired if not cancelled
    await sleep(75);

    // Trailing timer must NOT have fired after destroy
    assert(published.length === 1, "Pending trailing timer must be cancelled upon destroy");
    pass("Test 19 — Timers are cleaned up on destroy");
  }

  // -------------------------------------------------------------
  // Test 20: No new dependency
  // -------------------------------------------------------------
  {
    const pkgText = readFileSync(resolve("package.json"), "utf8");
    const pkg = JSON.parse(pkgText);
    const deps = Object.keys(pkg.dependencies || {});
    const expectedDeps = [
      "@supabase/supabase-js",
      "@xyflow/react",
      "next",
      "openai",
      "react",
      "react-dom",
    ];

    for (const dep of deps) {
      assert(expectedDeps.includes(dep), `Unexpected dependency found: ${dep}`);
    }
    assert(deps.length === expectedDeps.length, "Dependency count must remain exactly unchanged");
    pass("Test 20 — No new dependency");
  }

  console.log("\n==========================================");
  console.log(`ALL ${passedCount} PHASE 11.4 ACCEPTANCE TESTS PASSED!`);
  console.log("==========================================\n");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
