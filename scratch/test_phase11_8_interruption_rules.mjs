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
  shouldAcceptViewportUpdate,
  shouldInterruptFollowOnManualMovement,
  handleFollowInterruption,
} from "../src/app/lib/collaboration/viewportEvents.ts";
import {
  computeFollowStateList,
  formatFollowingLabel,
  formatFollowerCountLabel,
} from "../src/app/lib/collaboration/presence.ts";
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

console.log("Starting Phase 11.8 Interruption Rules Test Suite...\n");

let passedCount = 0;
function pass(testName) {
  passedCount++;
  console.log(`PASS [${passedCount}]: ${testName}`);
}

async function runTests() {
  const currentRoomId = "room-test-118";
  const currentUserId = "user-follower-bob";
  const leaderAId = "user-leader-alice";
  const followerCId = "user-follower-charlie";

  // Collaboration harness simulating the complete lifecycle:
  // ReactFlow viewport movements, remote viewport applications, follower/leader state, and guards.
  function createHarness(options = {}) {
    const roomId = options.roomId ?? currentRoomId;
    const userId = options.userId ?? currentUserId;
    let followingUserId = options.initialFollowingUserId ?? null;
    let followerUserIds = new Set(options.initialFollowerUserIds ?? []);
    let lastAcceptedViewportTimestamp = 0;
    let latestRemoteViewport = null;
    let interruptedNotice = null;

    let currentCanvasViewport = { x: 0, y: 0, zoom: 1 };
    const appliedViewports = [];
    const broadcastEvents = [];
    const unfollowEvents = [];

    const guard = createRemoteViewportApplyGuard(120);

    const isLeader = () => followerUserIds.size > 0;

    const broadcaster = createViewportBroadcaster({
      throttleMs: 30,
      isLeader,
      publish: (vp) => {
        broadcastEvents.push(cloneViewport(vp));
      },
    });

    const unfollowUser = (targetLeader) => {
      const leaderToUnfollow = targetLeader ?? followingUserId;
      followingUserId = null;
      if (leaderToUnfollow) {
        unfollowEvents.push({
          type: UNFOLLOW_USER_EVENT,
          roomId,
          leaderId: leaderToUnfollow,
          followerId: userId,
        });
      }
    };

    const handleManualMovement = (nextViewport) => {
      // Core Phase 11.8 rule: if following, manual movement interrupts follow
      if (shouldInterruptFollowOnManualMovement(followingUserId)) {
        unfollowUser();
        interruptedNotice = "Follow mode stopped";
      }
    };

    // ReactFlow useOnViewportChange simulation
    const onViewportChange = (vp) => {
      currentCanvasViewport = cloneViewport(vp);

      // 1. Check if suppressed by remote guard
      if (guard.shouldSuppressBroadcast(vp)) {
        return;
      }

      // 2. Genuine manual user movement
      handleManualMovement(vp);

      // 3. Leader broadcasting (if leader for others)
      broadcaster.onViewportMove(vp);
    };

    const onViewportEnd = (vp) => {
      currentCanvasViewport = cloneViewport(vp);
      if (guard.isApplying()) {
        guard.clear();
        return;
      }
      broadcaster.onViewportMoveEnd(vp);
    };

    // ReactFlow setViewport simulation
    const applyRemoteViewport = (vp) => {
      if (!isValidViewport(vp)) return;
      guard.markApplying(vp);
      appliedViewports.push(cloneViewport(vp));
      // Simulate ReactFlow firing viewport change callback
      onViewportChange(vp);
      onViewportEnd(vp);
    };

    // Realtime message receiver
    const receiveRemoteEvent = (rawPayload) => {
      const parsed = parseViewportUpdatePayload(rawPayload);
      if (!parsed) return false;

      // Room isolation check
      if (parsed.roomId !== roomId) return false;

      // Self filtering
      if (parsed.senderId === userId) return false;

      // Followed leader filtering
      if (followingUserId !== parsed.senderId) return false;

      // Stale protection
      if (
        !shouldAcceptViewportUpdate(
          parsed.timestamp,
          lastAcceptedViewportTimestamp
        )
      ) {
        return false;
      }

      lastAcceptedViewportTimestamp = parsed.timestamp;
      latestRemoteViewport = cloneViewport(parsed.viewport);
      applyRemoteViewport(parsed.viewport);
      return true;
    };

    return {
      getFollowingUserId: () => followingUserId,
      getFollowerUserIds: () => followerUserIds,
      getInterruptedNotice: () => interruptedNotice,
      getCurrentCanvasViewport: () => currentCanvasViewport,
      getAppliedViewports: () => appliedViewports,
      getBroadcastEvents: () => broadcastEvents,
      getUnfollowEvents: () => unfollowEvents,
      getGuard: () => guard,
      receiveRemoteEvent,
      onViewportChange,
      onViewportEnd,
      applyRemoteViewport,
      unfollowUser,
      destroy: () => {
        guard.destroy();
        broadcaster.destroy();
      },
    };
  }

  // -------------------------------------------------------------
  // Test 1: Manual pan interrupts
  // followingUserId = leader, manual pan -> unfollowUser(), followingUserId = null
  // -------------------------------------------------------------
  {
    const harness = createHarness({
      initialFollowingUserId: leaderAId,
    });

    assert(harness.getFollowingUserId() === leaderAId, "Initially following leader A");

    // Simulate user manually panning canvas to (x: 50, y: 0, zoom: 1)
    harness.onViewportChange({ x: 50, y: 0, zoom: 1 });
    harness.onViewportEnd({ x: 50, y: 0, zoom: 1 });

    assert(harness.getFollowingUserId() === null, "Manual pan must interrupt follow mode immediately");
    assert(harness.getUnfollowEvents().length === 1, "UNFOLLOW_USER event must be generated");
    assert(harness.getUnfollowEvents()[0].leaderId === leaderAId, "Unfollowed leader must be Alice");
    assert(harness.getCurrentCanvasViewport().x === 50, "User's pan position must be preserved");
    assert(harness.getInterruptedNotice() === "Follow mode stopped", "User feedback notice must be set");

    harness.destroy();
    pass("Test 1 — Manual pan interrupts Follow Mode immediately");
  }

  // -------------------------------------------------------------
  // Test 2: Manual zoom interrupts
  // followingUserId = leader, manual zoom -> unfollowUser()
  // -------------------------------------------------------------
  {
    const harness = createHarness({
      initialFollowingUserId: leaderAId,
    });

    assert(harness.getFollowingUserId() === leaderAId, "Initially following leader A");

    // Simulate user zooming via wheel/trackpad from zoom 1 to 1.5
    harness.onViewportChange({ x: 0, y: 0, zoom: 1.5 });
    harness.onViewportEnd({ x: 0, y: 0, zoom: 1.5 });

    assert(harness.getFollowingUserId() === null, "Manual zoom must interrupt follow mode immediately");
    assert(harness.getUnfollowEvents().length === 1, "UNFOLLOW_USER must be emitted");
    assert(harness.getCurrentCanvasViewport().zoom === 1.5, "User's zoom level must be preserved");

    harness.destroy();
    pass("Test 2 — Manual zoom interrupts Follow Mode immediately");
  }

  // -------------------------------------------------------------
  // Test 3: Remote setViewport does NOT interrupt
  // Remote VIEWPORT_UPDATE -> setViewport() -> NO unfollow
  // -------------------------------------------------------------
  {
    const harness = createHarness({
      initialFollowingUserId: leaderAId,
    });

    assert(harness.getFollowingUserId() === leaderAId, "Initially following leader A");

    // Leader sends a remote viewport update
    const accepted = harness.receiveRemoteEvent({
      type: VIEWPORT_UPDATE_EVENT,
      roomId: currentRoomId,
      senderId: leaderAId,
      viewport: { x: 300, y: 400, zoom: 2.0 },
      timestamp: 1000,
    });

    assert(accepted === true, "Remote viewport event must be accepted");
    assert(harness.getFollowingUserId() === leaderAId, "Follow Mode must NOT be interrupted by remote viewport");
    assert(harness.getUnfollowEvents().length === 0, "No unfollow event must be sent");
    assert(harness.getAppliedViewports().length === 1, "Remote viewport applied to canvas");
    assert(harness.getCurrentCanvasViewport().x === 300, "Camera synchronized with leader");

    harness.destroy();
    pass("Test 3 — Remote setViewport does NOT interrupt Follow Mode");
  }

  // -------------------------------------------------------------
  // Test 4: Remote viewport does not create feedback loop
  // remote update -> setViewport -> callback -> no new unfollow -> no rebroadcast
  // -------------------------------------------------------------
  {
    const harness = createHarness({
      initialFollowingUserId: leaderAId,
    });

    harness.receiveRemoteEvent({
      type: VIEWPORT_UPDATE_EVENT,
      roomId: currentRoomId,
      senderId: leaderAId,
      viewport: { x: 200, y: 250, zoom: 1.2 },
      timestamp: 2000,
    });

    assert(harness.getBroadcastEvents().length === 0, "Remote viewport must NOT cause a broadcast feedback loop");
    assert(harness.getUnfollowEvents().length === 0, "Remote viewport must not cause unfollow");

    harness.destroy();
    pass("Test 4 — Remote viewport does not create feedback loop or spurious unfollow");
  }

  // -------------------------------------------------------------
  // Test 5: Not following
  // followingUserId = null -> manual viewport movement -> no unfollow -> normal behavior
  // -------------------------------------------------------------
  {
    const harness = createHarness({
      initialFollowingUserId: null,
    });

    harness.onViewportChange({ x: 10, y: 20, zoom: 1.1 });
    harness.onViewportEnd({ x: 10, y: 20, zoom: 1.1 });

    assert(harness.getFollowingUserId() === null, "Remains null");
    assert(harness.getUnfollowEvents().length === 0, "No unfollow event called when not following");
    assert(harness.getInterruptedNotice() === null, "No interruption notice shown");

    harness.destroy();
    pass("Test 5 — Manual movement when not following behaves normally without unfollow calls");
  }

  // -------------------------------------------------------------
  // Test 6: Leader + follower simultaneously
  // A follows B, C follows A. A manually moves -> A stops following B -> A remains leader for C
  // -------------------------------------------------------------
  {
    // Current user Bob follows Alice (leaderAId) AND is followed by Charlie (followerCId)
    const harness = createHarness({
      initialFollowingUserId: leaderAId,
      initialFollowerUserIds: [followerCId],
    });

    assert(harness.getFollowingUserId() === leaderAId, "Bob follows Alice");
    assert(harness.getFollowerUserIds().has(followerCId), "Charlie follows Bob");

    // Bob manually moves canvas
    harness.onViewportChange({ x: 99, y: 88, zoom: 1.0 });
    harness.onViewportEnd({ x: 99, y: 88, zoom: 1.0 });

    // Bob must have stopped following Alice
    assert(harness.getFollowingUserId() === null, "Bob stops following Alice");
    assert(harness.getUnfollowEvents().length === 1, "Bob emitted UNFOLLOW_USER for Alice");

    // Bob must STILL be a leader for Charlie and broadcast his new viewport!
    assert(harness.getFollowerUserIds().has(followerCId), "Charlie is still following Bob");
    assert(harness.getBroadcastEvents().length === 1, "Bob broadcasts his new viewport to Charlie");
    assert(harness.getBroadcastEvents()[0].x === 99, "Broadcast contains Bob's new position");

    harness.destroy();
    pass("Test 6 — Leader + follower simultaneously stops following while continuing leader broadcast");
  }

  // -------------------------------------------------------------
  // Test 7: Explicit unfollow
  // Explicit unfollow button click -> exactly one unfollow path -> no duplicate send
  // -------------------------------------------------------------
  {
    const harness = createHarness({
      initialFollowingUserId: leaderAId,
    });

    // Explicit unfollow
    harness.unfollowUser();

    assert(harness.getFollowingUserId() === null, "Follow cleared");
    assert(harness.getUnfollowEvents().length === 1, "Exactly one unfollow event generated");

    // Calling unfollow again when already null does not duplicate
    harness.unfollowUser();
    assert(harness.getUnfollowEvents().length === 1, "No duplicate unfollow event");

    harness.destroy();
    pass("Test 7 — Explicit unfollow uses single source of truth without duplicates");
  }

  // -------------------------------------------------------------
  // Test 8: Rapid remote viewport updates
  // A -> B -> C: all remote updates remain non-interrupting
  // -------------------------------------------------------------
  {
    const harness = createHarness({
      initialFollowingUserId: leaderAId,
    });

    for (let i = 1; i <= 5; i++) {
      harness.receiveRemoteEvent({
        type: VIEWPORT_UPDATE_EVENT,
        roomId: currentRoomId,
        senderId: leaderAId,
        viewport: { x: i * 10, y: i * 10, zoom: 1 + i * 0.1 },
        timestamp: 1000 + i * 50,
      });
    }

    assert(harness.getFollowingUserId() === leaderAId, "Rapid updates must never interrupt follow mode");
    assert(harness.getUnfollowEvents().length === 0, "Zero unfollow events emitted during rapid stream");
    assert(harness.getAppliedViewports().length === 5, "All 5 viewports applied");

    harness.destroy();
    pass("Test 8 — Rapid remote viewport updates remain completely non-interrupting");
  }

  // -------------------------------------------------------------
  // Test 9: Stale remote update
  // Older timestamp -> rejected -> no camera change -> no interruption
  // -------------------------------------------------------------
  {
    const harness = createHarness({
      initialFollowingUserId: leaderAId,
    });

    harness.receiveRemoteEvent({
      type: VIEWPORT_UPDATE_EVENT,
      roomId: currentRoomId,
      senderId: leaderAId,
      viewport: { x: 50, y: 50, zoom: 1 },
      timestamp: 2000,
    });

    // Older timestamp arrived late
    const staleResult = harness.receiveRemoteEvent({
      type: VIEWPORT_UPDATE_EVENT,
      roomId: currentRoomId,
      senderId: leaderAId,
      viewport: { x: 999, y: 999, zoom: 2 },
      timestamp: 1500,
    });

    assert(staleResult === false, "Stale update rejected");
    assert(harness.getCurrentCanvasViewport().x === 50, "Stale viewport must not move camera");
    assert(harness.getFollowingUserId() === leaderAId, "Follow state intact");
    assert(harness.getUnfollowEvents().length === 0, "No unfollow");

    harness.destroy();
    pass("Test 9 — Stale remote update rejected with zero interruption side effects");
  }

  // -------------------------------------------------------------
  // Test 10: Self event
  // senderId === currentUserId -> ignored -> no interruption
  // -------------------------------------------------------------
  {
    const harness = createHarness({
      initialFollowingUserId: leaderAId,
    });

    const selfResult = harness.receiveRemoteEvent({
      type: VIEWPORT_UPDATE_EVENT,
      roomId: currentRoomId,
      senderId: currentUserId,
      viewport: { x: 100, y: 100, zoom: 1 },
      timestamp: 3000,
    });

    assert(selfResult === false, "Self event rejected");
    assert(harness.getFollowingUserId() === leaderAId, "Follow state intact");
    assert(harness.getUnfollowEvents().length === 0, "No unfollow");

    harness.destroy();
    pass("Test 10 — Self viewport event ignored with no interruption");
  }

  // -------------------------------------------------------------
  // Test 11: Wrong room
  // roomId !== current room -> ignored -> no interruption
  // -------------------------------------------------------------
  {
    const harness = createHarness({
      initialFollowingUserId: leaderAId,
    });

    const wrongRoomResult = harness.receiveRemoteEvent({
      type: VIEWPORT_UPDATE_EVENT,
      roomId: "other-room-xyz",
      senderId: leaderAId,
      viewport: { x: 200, y: 200, zoom: 1 },
      timestamp: 4000,
    });

    assert(wrongRoomResult === false, "Wrong room event rejected");
    assert(harness.getFollowingUserId() === leaderAId, "Follow state intact");
    assert(harness.getUnfollowEvents().length === 0, "No unfollow");

    harness.destroy();
    pass("Test 11 — Wrong room event ignored with no interruption");
  }

  // -------------------------------------------------------------
  // Test 12: Solo mode
  // Solo mode has no room, followingUserId is null, no interruption logic
  // -------------------------------------------------------------
  {
    const soloParams = new URLSearchParams("");
    const soloRoomId = getRoomIdFromUrl(soloParams);
    const soloMode = getRoomMode(soloRoomId);

    assert(soloRoomId === null, "Solo roomId is null");
    assert(soloMode === "solo", "Solo mode active");

    const pageSource = readFileSync(
      resolve(process.cwd(), "src/app/page.tsx"),
      "utf-8"
    );

    assert(
      pageSource.includes("if (followingUserIdRef.current !== null)"),
      "Interruption only triggers when followingUserIdRef.current is not null"
    );

    pass("Test 12 — Solo mode operates cleanly without follow interruption side effects");
  }

  // -------------------------------------------------------------
  // Test 13: Remote guard cleanup
  // After remote setViewport(), remoteApplyGuard === false is eventually guaranteed
  // -------------------------------------------------------------
  {
    const guard = createRemoteViewportApplyGuard(50);
    assert(guard.isApplying() === false, "Initially not applying");

    guard.markApplying({ x: 10, y: 20, zoom: 1 });
    assert(guard.isApplying() === true, "Marked as applying");

    // When matching target is observed, it clears immediately
    guard.shouldSuppressBroadcast({ x: 10, y: 20, zoom: 1 });
    assert(guard.isApplying() === false, "Immediately cleared after target reached");

    // Even without matching target, timeout clears it
    guard.markApplying({ x: 99, y: 99, zoom: 1 });
    assert(guard.isApplying() === true);
    await sleep(60);
    assert(guard.isApplying() === false, "Guaranteed cleared after timeout");

    guard.destroy();
    pass("Test 13 — Remote guard cleanup guaranteed deterministically and by timeout");
  }

  // -------------------------------------------------------------
  // Test 14: Presence/UI reflects interruption
  // After manual viewport interaction -> unfollowUser() -> indicators reflect not following
  // -------------------------------------------------------------
  {
    const participantAlice = {
      userId: leaderAId,
      displayName: "Alice",
      color: "#3b82f6",
    };
    const currentParticipant = {
      userId: currentUserId,
      displayName: "Bob",
      color: "#10b981",
    };

    let followingUserId = leaderAId;
    let items = computeFollowStateList([participantAlice], currentParticipant, followingUserId);
    assert(items.find((i) => i.userId === leaderAId).isFollowing === true, "Alice initially followed");

    // Interruption occurs
    if (shouldInterruptFollowOnManualMovement(followingUserId)) {
      followingUserId = null;
    }

    items = computeFollowStateList([participantAlice], currentParticipant, followingUserId);
    assert(items.find((i) => i.userId === leaderAId).isFollowing === false, "Alice no longer followed");

    pass("Test 14 — Presence and Follow UI naturally reflect interruption without independent state");
  }

  // -------------------------------------------------------------
  // Test 15: Persistence and CanvasState isolation
  // -------------------------------------------------------------
  {
    const snapshot = createCanvasSnapshot({
      nodes: [],
      edges: [],
      groups: [],
    });
    assert(!("followingUserId" in snapshot), "CanvasSnapshot has no followingUserId");
    assert(!("interruptedNotice" in snapshot), "CanvasSnapshot has no interruptedNotice");

    pass("Test 15 — Persistence and CanvasState isolation strictly preserved");
  }

  console.log("\n==========================================");
  console.log(`ALL ${passedCount} PHASE 11.8 ACCEPTANCE TESTS PASSED!`);
  console.log("==========================================\n");
}

runTests().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
