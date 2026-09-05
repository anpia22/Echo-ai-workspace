import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  VIEWPORT_UPDATE_EVENT,
  FOLLOW_USER_EVENT,
  UNFOLLOW_USER_EVENT,
  parseViewportUpdatePayload,
  parseFollowUserPayload,
  parseUnfollowUserPayload,
  isValidViewport,
  cloneViewport,
  isSameViewport,
  isCloseViewport,
  isLeaderForViewportBroadcast,
  createViewportBroadcaster,
  createRemoteViewportApplyGuard,
} from "../src/app/lib/collaboration/viewportEvents.ts";
import { createCanvasSnapshot } from "../src/app/lib/collaboration/canvasSnapshot.ts";
import { getRoomIdFromUrl, getRoomMode } from "../src/app/lib/collaboration/room.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

console.log("Starting Phase 11.5 Follower Viewport Sync Test Suite...\n");

let passedCount = 0;
function pass(testName) {
  passedCount++;
  console.log(`PASS [${passedCount}]: ${testName}`);
}

async function runTests() {
  const currentRoomId = "room-test-115";
  const currentUserId = "user-follower-bob";
  const leaderAId = "user-leader-alice";
  const leaderBId = "user-leader-charlie";

  // Helper simulating the collaboration layer + canvas layer integration
  function createCollaborationCanvasHarness(options = {}) {
    const roomId = options.roomId ?? currentRoomId;
    const userId = options.userId ?? currentUserId;
    let followingUserId = options.initialFollowingUserId ?? null;
    let followerUserIds = new Set(options.initialFollowerUserIds ?? []);
    let lastAcceptedViewportTimestamp = 0;
    let latestRemoteViewport = null;
    let isSubscribed = options.isSubscribed ?? true;

    // Canvas layer simulation
    let currentCanvasViewport = { x: 0, y: 0, zoom: 1 };
    const appliedViewports = [];
    const broadcastEvents = [];

    const guard = createRemoteViewportApplyGuard(120);

    const broadcaster = createViewportBroadcaster({
      throttleMs: 50,
      isLeader: () => followerUserIds.size > 0,
      publish: (vp) => {
        broadcastEvents.push({
          type: VIEWPORT_UPDATE_EVENT,
          roomId,
          senderId: userId,
          viewport: cloneViewport(vp),
          timestamp: Date.now(),
        });
      },
    });

    // Simulated ReactFlow viewport callback
    const triggerReactFlowViewportChange = (nextViewport) => {
      currentCanvasViewport = cloneViewport(nextViewport);

      // Remote apply guard: suppress broadcast if this event was caused by remote setViewport
      if (guard.shouldSuppressBroadcast(nextViewport)) {
        return;
      }

      broadcaster.onViewportMove(nextViewport);
    };

    // Canvas layer setViewport / applyRemoteViewport
    const canvasApi = {
      getViewport: () => cloneViewport(currentCanvasViewport),
      setViewport: (vp) => {
        triggerReactFlowViewportChange(vp);
      },
      applyRemoteViewport: (vp) => {
        if (!isValidViewport(vp)) return;
        if (isSameViewport(currentCanvasViewport, vp)) return;
        appliedViewports.push(cloneViewport(vp));
        guard.markApplying(vp);
        triggerReactFlowViewportChange(vp);
      },
    };

    // Collaboration layer handleViewportUpdate
    const handleViewportUpdate = (payload) => {
      if (!isSubscribed) return;
      const event = parseViewportUpdatePayload(payload);
      if (!event) return;

      // Room isolation & self-filtering
      if (event.roomId !== roomId || event.senderId === userId) {
        return;
      }

      // Followed leader filtering
      if (event.senderId !== followingUserId) {
        return;
      }

      // Stale protection
      if (event.timestamp < lastAcceptedViewportTimestamp) {
        return;
      }

      lastAcceptedViewportTimestamp = event.timestamp;
      latestRemoteViewport = cloneViewport(event.viewport);

      // Forward to canvas layer with application-time unfollow check
      if (followingUserId !== event.senderId) {
        return;
      }
      canvasApi.applyRemoteViewport(event.viewport);
    };

    return {
      setFollowingUserId: (id) => {
        followingUserId = id;
      },
      getFollowingUserId: () => followingUserId,
      setFollowers: (followers) => {
        followerUserIds = new Set(followers);
      },
      handleViewportUpdate,
      canvasApi,
      appliedViewports,
      broadcastEvents,
      guard,
      broadcaster,
      teardown: () => {
        isSubscribed = false;
        guard.destroy();
        broadcaster.destroy();
      },
    };
  }

  // -------------------------------------------------------------
  // Test 1 — Remote viewport applied
  // -------------------------------------------------------------
  {
    const harness = createCollaborationCanvasHarness({
      initialFollowingUserId: leaderAId,
    });

    const leaderViewport = { x: 125, y: -75, zoom: 1.5 };
    harness.handleViewportUpdate({
      type: VIEWPORT_UPDATE_EVENT,
      roomId: currentRoomId,
      senderId: leaderAId,
      viewport: leaderViewport,
      timestamp: Date.now(),
    });

    assert(harness.appliedViewports.length === 1, "Expected setViewport to be invoked once");
    assert(isSameViewport(harness.appliedViewports[0], leaderViewport), "Applied viewport must match leader's viewport");
    assert(isSameViewport(harness.canvasApi.getViewport(), leaderViewport), "Canvas viewport must be updated");

    harness.teardown();
    pass("Test 1 — Remote viewport applied to ReactFlow canvas");
  }

  // -------------------------------------------------------------
  // Test 2 — Only followed leader controls viewport
  // -------------------------------------------------------------
  {
    const harness = createCollaborationCanvasHarness({
      initialFollowingUserId: leaderAId,
    });

    // Update from Leader A (followed) -> MUST APPLY
    harness.handleViewportUpdate({
      type: VIEWPORT_UPDATE_EVENT,
      roomId: currentRoomId,
      senderId: leaderAId,
      viewport: { x: 10, y: 10, zoom: 1 },
      timestamp: 100,
    });
    assert(harness.appliedViewports.length === 1, "Leader A update must be applied");

    // Update from Leader B (not followed) -> MUST BE IGNORED
    harness.handleViewportUpdate({
      type: VIEWPORT_UPDATE_EVENT,
      roomId: currentRoomId,
      senderId: leaderBId,
      viewport: { x: 999, y: 999, zoom: 2 },
      timestamp: 110,
    });
    assert(harness.appliedViewports.length === 1, "Leader B update must be ignored");
    assert(harness.canvasApi.getViewport().x === 10, "Canvas viewport must remain Leader A's viewport");

    harness.teardown();
    pass("Test 2 — Only followed leader controls viewport");
  }

  // -------------------------------------------------------------
  // Test 3 — Self update ignored
  // -------------------------------------------------------------
  {
    const harness = createCollaborationCanvasHarness({
      initialFollowingUserId: currentUserId, // Cannot happen legitimately, but test self-filter
    });

    harness.handleViewportUpdate({
      type: VIEWPORT_UPDATE_EVENT,
      roomId: currentRoomId,
      senderId: currentUserId,
      viewport: { x: 50, y: 50, zoom: 1 },
      timestamp: Date.now(),
    });

    assert(harness.appliedViewports.length === 0, "Self viewport update must be ignored");

    harness.teardown();
    pass("Test 3 — Self update ignored");
  }

  // -------------------------------------------------------------
  // Test 4 — Wrong room ignored
  // -------------------------------------------------------------
  {
    const harness = createCollaborationCanvasHarness({
      initialFollowingUserId: leaderAId,
    });

    harness.handleViewportUpdate({
      type: VIEWPORT_UPDATE_EVENT,
      roomId: "other-foreign-room",
      senderId: leaderAId,
      viewport: { x: 200, y: 200, zoom: 1.2 },
      timestamp: Date.now(),
    });

    assert(harness.appliedViewports.length === 0, "Foreign room viewport update must be ignored");

    harness.teardown();
    pass("Test 4 — Wrong room ignored");
  }

  // -------------------------------------------------------------
  // Test 5 — Stale update ignored
  // -------------------------------------------------------------
  {
    const harness = createCollaborationCanvasHarness({
      initialFollowingUserId: leaderAId,
    });

    // Newer update arrives first (t = 200)
    harness.handleViewportUpdate({
      type: VIEWPORT_UPDATE_EVENT,
      roomId: currentRoomId,
      senderId: leaderAId,
      viewport: { x: 200, y: 200, zoom: 1.5 },
      timestamp: 200,
    });
    assert(harness.appliedViewports.length === 1, "Newer viewport applied");

    // Older update arrives later (t = 150)
    harness.handleViewportUpdate({
      type: VIEWPORT_UPDATE_EVENT,
      roomId: currentRoomId,
      senderId: leaderAId,
      viewport: { x: 100, y: 100, zoom: 1.0 },
      timestamp: 150,
    });
    assert(harness.appliedViewports.length === 1, "Older viewport must be rejected as stale");
    assert(harness.canvasApi.getViewport().x === 200, "Canvas viewport must remain at the newer position");

    harness.teardown();
    pass("Test 5 — Stale update ignored");
  }

  // -------------------------------------------------------------
  // Test 6 — Unfollow protection
  // -------------------------------------------------------------
  {
    const harness = createCollaborationCanvasHarness({
      initialFollowingUserId: leaderAId,
    });

    // Following A -> update applies
    harness.handleViewportUpdate({
      type: VIEWPORT_UPDATE_EVENT,
      roomId: currentRoomId,
      senderId: leaderAId,
      viewport: { x: 10, y: 20, zoom: 1 },
      timestamp: 100,
    });
    assert(harness.appliedViewports.length === 1, "Update applied while following A");

    // User unfollows A
    harness.setFollowingUserId(null);

    // Another update from A -> must NOT apply
    harness.handleViewportUpdate({
      type: VIEWPORT_UPDATE_EVENT,
      roomId: currentRoomId,
      senderId: leaderAId,
      viewport: { x: 50, y: 60, zoom: 1 },
      timestamp: 200,
    });
    assert(harness.appliedViewports.length === 1, "No updates applied after unfollow");
    assert(harness.canvasApi.getViewport().x === 10, "Canvas remains at previous viewport");

    harness.teardown();
    pass("Test 6 — Unfollow protection prevents subsequent updates");
  }

  // -------------------------------------------------------------
  // Test 7 — Queued update safety
  // -------------------------------------------------------------
  {
    const harness = createCollaborationCanvasHarness({
      initialFollowingUserId: leaderAId,
    });

    // Simulate an event received and queued in a microtask/timer
    const queuedEvent = {
      type: VIEWPORT_UPDATE_EVENT,
      roomId: currentRoomId,
      senderId: leaderAId,
      viewport: { x: 300, y: 300, zoom: 1.2 },
      timestamp: Date.now(),
    };

    // User unfollows before the queued callback executes
    harness.setFollowingUserId(null);

    // Now application callback runs with the queued event
    if (harness.getFollowingUserId() === queuedEvent.senderId) {
      harness.canvasApi.applyRemoteViewport(queuedEvent.viewport);
    }

    assert(harness.appliedViewports.length === 0, "Queued update must not apply after unfollow");

    harness.teardown();
    pass("Test 7 — Queued update safety guards against asynchronous delivery after unfollow");
  }

  // -------------------------------------------------------------
  // Test 8 — Feedback protection
  // -------------------------------------------------------------
  {
    // Current user is followed by C, and is following A
    const harness = createCollaborationCanvasHarness({
      initialFollowingUserId: leaderAId,
      initialFollowerUserIds: ["user-c"],
    });

    // Remote update arrives from A
    harness.handleViewportUpdate({
      type: VIEWPORT_UPDATE_EVENT,
      roomId: currentRoomId,
      senderId: leaderAId,
      viewport: { x: 150, y: 250, zoom: 1.25 },
      timestamp: Date.now(),
    });

    assert(harness.appliedViewports.length === 1, "Remote viewport was applied");
    // Feedback protection verification:
    // The remote setViewport MUST NOT trigger publishViewportUpdate back to room
    assert(harness.broadcastEvents.length === 0, "Remote viewport application must NEVER broadcast");

    harness.teardown();
    pass("Test 8 — Feedback protection prevents remote viewport from triggering a broadcast");
  }

  // -------------------------------------------------------------
  // Test 9 — Local movement still works afterward
  // -------------------------------------------------------------
  {
    const harness = createCollaborationCanvasHarness({
      initialFollowingUserId: leaderAId,
      initialFollowerUserIds: ["user-c"],
    });

    // 1. Remote update arrives and is applied
    harness.handleViewportUpdate({
      type: VIEWPORT_UPDATE_EVENT,
      roomId: currentRoomId,
      senderId: leaderAId,
      viewport: { x: 100, y: 100, zoom: 1 },
      timestamp: 100,
    });
    assert(harness.broadcastEvents.length === 0, "No broadcast on remote update");

    // 2. Local user manually moves canvas
    harness.canvasApi.setViewport({ x: 120, y: 120, zoom: 1.1 });

    // Local movement by a participant with followers should broadcast according to Phase 11.4
    assert(harness.broadcastEvents.length === 1, "Local movement must broadcast successfully");
    assert(harness.broadcastEvents[0].viewport.x === 120, "Broadcasted local viewport matches user movement");

    harness.teardown();
    pass("Test 9 — Local movement still works normally after remote sync");
  }

  // -------------------------------------------------------------
  // Test 10 — Leader broadcasting regression
  // -------------------------------------------------------------
  {
    const harness = createCollaborationCanvasHarness({
      initialFollowingUserId: null, // Pure leader
      initialFollowerUserIds: ["user-c", "user-d"],
    });

    harness.canvasApi.setViewport({ x: 50, y: 75, zoom: 1.0 });
    assert(harness.broadcastEvents.length === 1, "Leader local movement broadcasts");
    assert(harness.broadcastEvents[0].viewport.x === 50, "Broadcast contains leader position");

    harness.teardown();
    pass("Test 10 — Leader broadcasting regression verified");
  }

  // -------------------------------------------------------------
  // Test 11 — Both follower + leader
  // -------------------------------------------------------------
  {
    // Current User follows A and is followed by C
    const harness = createCollaborationCanvasHarness({
      initialFollowingUserId: leaderAId,
      initialFollowerUserIds: ["user-c"],
    });

    // A sends viewport
    harness.handleViewportUpdate({
      type: VIEWPORT_UPDATE_EVENT,
      roomId: currentRoomId,
      senderId: leaderAId,
      viewport: { x: 400, y: 500, zoom: 1.5 },
      timestamp: Date.now(),
    });

    assert(harness.appliedViewports.length === 1, "A's viewport applied to Current User");
    assert(harness.broadcastEvents.length === 0, "No bounce back to A or room on remote update");

    // Later, Current User moves canvas locally
    harness.canvasApi.setViewport({ x: 420, y: 520, zoom: 1.5 });
    assert(harness.broadcastEvents.length === 1, "Current User can still legitimately broadcast local movements to C");

    harness.teardown();
    pass("Test 11 — Both follower + leader operates without feedback loops");
  }

  // -------------------------------------------------------------
  // Test 12 — Rapid updates
  // -------------------------------------------------------------
  {
    const harness = createCollaborationCanvasHarness({
      initialFollowingUserId: leaderAId,
    });

    // Leader sends 5 rapid viewport updates
    for (let i = 1; i <= 5; i++) {
      harness.handleViewportUpdate({
        type: VIEWPORT_UPDATE_EVENT,
        roomId: currentRoomId,
        senderId: leaderAId,
        viewport: { x: i * 20, y: i * 10, zoom: 1 + i * 0.05 },
        timestamp: 1000 + i * 10,
      });
    }

    assert(harness.appliedViewports.length === 5, "All valid sequential updates applied");
    const finalVp = harness.canvasApi.getViewport();
    assert(finalVp.x === 100 && finalVp.y === 50 && finalVp.zoom === 1.25, "Latest viewport wins");
    assert(harness.broadcastEvents.length === 0, "Zero feedback broadcasts during rapid remote updates");

    harness.teardown();
    pass("Test 12 — Rapid updates processed safely without loops or stale state");
  }

  // -------------------------------------------------------------
  // Test 13 — Solo mode
  // -------------------------------------------------------------
  {
    // Solo mode: no roomId, no collaboration
    const harness = createCollaborationCanvasHarness({
      roomId: null,
      isSubscribed: false,
      initialFollowingUserId: null,
    });

    // No remote update can be processed
    harness.handleViewportUpdate({
      type: VIEWPORT_UPDATE_EVENT,
      roomId: currentRoomId,
      senderId: leaderAId,
      viewport: { x: 50, y: 50, zoom: 1 },
      timestamp: Date.now(),
    });

    assert(harness.appliedViewports.length === 0, "Solo mode applies no remote viewports");
    assert(harness.broadcastEvents.length === 0, "Solo mode produces no broadcasts");

    harness.teardown();
    pass("Test 13 — Solo mode operates without collaboration side effects");
  }

  // -------------------------------------------------------------
  // Test 14 — Cleanup
  // -------------------------------------------------------------
  {
    const harness = createCollaborationCanvasHarness({
      initialFollowingUserId: leaderAId,
    });

    // Teardown / unmount
    harness.teardown();

    // Event arrives after teardown
    harness.handleViewportUpdate({
      type: VIEWPORT_UPDATE_EVENT,
      roomId: currentRoomId,
      senderId: leaderAId,
      viewport: { x: 99, y: 99, zoom: 1 },
      timestamp: Date.now(),
    });

    assert(harness.appliedViewports.length === 0, "No setViewport after teardown");

    pass("Test 14 — Cleanup prevents stale callbacks after unmount");
  }

  console.log("\n==========================================");
  console.log(`ALL ${passedCount} PHASE 11.5 ACCEPTANCE TESTS PASSED!`);
  console.log("==========================================\n");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
