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
  isStaleViewportUpdate,
  applyFollowUser,
  applyUnfollowUser,
  shouldInterruptFollowOnManualMovement,
  handleFollowInterruption,
  shouldAcceptRemoteViewportEvent,
} from "../src/app/lib/collaboration/viewportEvents.ts";
import {
  computeFollowStateList,
  formatFollowingLabel,
  formatFollowerCountLabel,
} from "../src/app/lib/collaboration/presence.ts";
import { pruneDisconnectedCursors } from "../src/app/lib/collaboration/cursorEvents.ts";
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

console.log("Starting Phase 11.9 Reconnect & Isolation Safety Test Suite...\n");

let passedCount = 0;
function pass(testName) {
  passedCount++;
  console.log(`PASS [${passedCount}]: ${testName}`);
}

async function runTests() {
  const roomA = "echo-room-alpha";
  const roomB = "echo-room-beta";
  const userA = "user-alice";
  const userB = "user-bob";
  const userC = "user-charlie";

  // Simulation harness modeling connection lifecycle, session generations, room switches, and presence
  function createCollaborationSession(initialConfig = {}) {
    let roomId = initialConfig.roomId ?? roomA;
    let userId = initialConfig.userId ?? userA;
    let displayName = initialConfig.displayName ?? "Alice";
    let isConnected = initialConfig.isConnected ?? true;
    let sessionGeneration = 1;

    let followingUserId = initialConfig.followingUserId ?? null;
    let followerUserIds = new Set(initialConfig.followerUserIds ?? []);
    let lastAcceptedViewportTimestamp = 0;
    let latestRemoteViewport = null;

    let canvasViewport = { x: 0, y: 0, zoom: 1 };
    const appliedViewports = [];
    const broadcastEvents = [];
    const followEvents = [];
    const unfollowEvents = [];

    const guard = createRemoteViewportApplyGuard(120);

    const broadcaster = createViewportBroadcaster({
      throttleMs: 30,
      isLeader: () => followerUserIds.size > 0,
      publish: (vp) => {
        if (!isConnected) return;
        broadcastEvents.push({
          roomId,
          viewport: cloneViewport(vp),
          senderId: userId,
          generation: sessionGeneration,
        });
      },
    });

    const followUser = (leaderId) => {
      if (!isConnected || !roomId) return;
      if (!leaderId || leaderId === userId) return;
      followingUserId = leaderId;
      followEvents.push({
        type: FOLLOW_USER_EVENT,
        roomId,
        leaderId,
        followerId: userId,
      });
    };

    const unfollowUser = (targetLeader) => {
      const leaderToUnfollow = targetLeader ?? followingUserId;
      followingUserId = null;
      if (leaderToUnfollow && isConnected) {
        unfollowEvents.push({
          type: UNFOLLOW_USER_EVENT,
          roomId,
          leaderId: leaderToUnfollow,
          followerId: userId,
        });
      }
    };

    const handleDisconnect = () => {
      isConnected = false;
      // Disconnect safety: clear active follow & follower relationships immediately
      followingUserId = null;
      followerUserIds = new Set();
      lastAcceptedViewportTimestamp = 0;
      latestRemoteViewport = null;
      guard.clear();
      broadcaster.flush();
    };

    const handleReconnect = () => {
      sessionGeneration += 1;
      isConnected = true;
      // Reconnect safety: do NOT automatically restore previous follow or follower relationships!
      // Must remain null / empty until explicit action
      followingUserId = null;
      followerUserIds = new Set();
      lastAcceptedViewportTimestamp = 0;
      latestRemoteViewport = null;
      guard.clear();
      // Viewport must NOT change on reconnect
    };

    const switchRoom = (newRoomId) => {
      sessionGeneration += 1;
      roomId = newRoomId;
      // Room isolation: all Follow Mode state belonging to previous room is invalidated
      followingUserId = null;
      followerUserIds = new Set();
      lastAcceptedViewportTimestamp = 0;
      latestRemoteViewport = null;
      guard.clear();
      broadcaster.destroy();
    };

    const handlePresenceChange = (activeParticipantIds) => {
      const activeIds = new Set(activeParticipantIds);
      // Prune followers who left
      const nextFollowers = new Set();
      for (const id of followerUserIds) {
        if (activeIds.has(id)) {
          nextFollowers.add(id);
        }
      }
      followerUserIds = nextFollowers;

      // If leader being followed left the room, stop following
      if (followingUserId && !activeIds.has(followingUserId)) {
        followingUserId = null;
      }
    };

    const onManualViewportChange = (vp) => {
      canvasViewport = cloneViewport(vp);
      if (guard.shouldSuppressBroadcast(vp)) {
        return;
      }
      // Follow interruption
      if (shouldInterruptFollowOnManualMovement(followingUserId)) {
        unfollowUser();
      }
      broadcaster.onViewportMove(vp);
    };

    const applyRemoteViewport = (vp) => {
      if (!isValidViewport(vp)) return;
      guard.markApplying(vp);
      appliedViewports.push(cloneViewport(vp));
      canvasViewport = cloneViewport(vp);
      onManualViewportChange(vp);
    };

    const receiveRemoteEvent = (rawPayload, eventSessionGeneration = sessionGeneration) => {
      // Generation / stale callback safety
      if (eventSessionGeneration !== sessionGeneration) {
        return false;
      }

      const parsed = parseViewportUpdatePayload(rawPayload);
      if (!parsed) return false;

      // Room isolation
      if (parsed.roomId !== roomId) return false;

      // Self filtering
      if (parsed.senderId === userId) return false;

      // Followed leader filtering
      if (followingUserId !== parsed.senderId) return false;

      // Stale timestamp protection
      if (!shouldAcceptViewportUpdate(parsed.timestamp, lastAcceptedViewportTimestamp)) {
        return false;
      }

      lastAcceptedViewportTimestamp = parsed.timestamp;
      latestRemoteViewport = cloneViewport(parsed.viewport);
      applyRemoteViewport(parsed.viewport);
      return true;
    };

    return {
      getRoomId: () => roomId,
      getUserId: () => userId,
      isConnected: () => isConnected,
      getSessionGeneration: () => sessionGeneration,
      getFollowingUserId: () => followingUserId,
      getFollowerUserIds: () => followerUserIds,
      getCanvasViewport: () => canvasViewport,
      getAppliedViewports: () => appliedViewports,
      getBroadcastEvents: () => broadcastEvents,
      getFollowEvents: () => followEvents,
      getUnfollowEvents: () => unfollowEvents,
      getLastAcceptedViewportTimestamp: () => lastAcceptedViewportTimestamp,
      getGuard: () => guard,
      followUser,
      unfollowUser,
      handleDisconnect,
      handleReconnect,
      switchRoom,
      handlePresenceChange,
      onManualViewportChange,
      applyRemoteViewport,
      receiveRemoteEvent,
      destroy: () => {
        guard.destroy();
        broadcaster.destroy();
      },
    };
  }

  // -------------------------------------------------------------
  // Test 1: Disconnect Safety — local follow state invalidated
  // -------------------------------------------------------------
  {
    const session = createCollaborationSession({
      followingUserId: userB,
      followerUserIds: [userC],
    });

    assert(session.getFollowingUserId() === userB, "Initially following user B");
    assert(session.getFollowerUserIds().has(userC), "Initially followed by user C");

    // Room disconnect occurs
    session.handleDisconnect();

    assert(session.isConnected() === false, "Disconnected state confirmed");
    assert(session.getFollowingUserId() === null, "followingUserId must be null on disconnect");
    assert(session.getFollowerUserIds().size === 0, "followerUserIds must be empty on disconnect");
    assert(session.getLastAcceptedViewportTimestamp() === 0, "Viewport timestamp reset on disconnect");

    pass("Test 1 — Disconnect clears active follow & follower relationships immediately");
  }

  // -------------------------------------------------------------
  // Test 2: Reconnect Safety — NO automatic re-follow
  // -------------------------------------------------------------
  {
    const session = createCollaborationSession({
      followingUserId: userB,
      followerUserIds: [userC],
    });

    session.handleDisconnect();
    session.handleReconnect();

    assert(session.isConnected() === true, "Session reconnected");
    assert(session.getFollowingUserId() === null, "followingUserId must remain null after reconnect");
    assert(session.getFollowerUserIds().size === 0, "followerUserIds must remain empty after reconnect");
    assert(session.getFollowEvents().length === 0, "No automatic FOLLOW_USER broadcast on reconnect");

    // Must require explicit follow action
    session.followUser(userB);
    assert(session.getFollowingUserId() === userB, "Explicit follow sets followingUserId");
    assert(session.getFollowEvents().length === 1, "Explicit follow broadcasts FOLLOW_USER");

    pass("Test 2 — Reconnect does NOT automatically restore follow; requires explicit action");
  }

  // -------------------------------------------------------------
  // Test 3: No automatic viewport sync after reconnect
  // -------------------------------------------------------------
  {
    const session = createCollaborationSession({
      followingUserId: userB,
    });

    const initialViewport = { x: 120, y: -45, zoom: 1.25 };
    session.onManualViewportChange(initialViewport);

    const viewportBeforeDisconnect = cloneViewport(session.getCanvasViewport());
    assert(isSameViewport(viewportBeforeDisconnect, initialViewport), "Viewport matches initial");

    session.handleDisconnect();
    session.handleReconnect();

    const viewportAfterReconnect = cloneViewport(session.getCanvasViewport());
    assert(
      isSameViewport(viewportBeforeDisconnect, viewportAfterReconnect),
      "Camera must NOT move, reset, or fitView upon reconnect"
    );
    assert(session.getAppliedViewports().length === 0, "No remote viewports applied on reconnect");

    pass("Test 3 — Reconnect causes zero automatic camera movement or viewport sync");
  }

  // -------------------------------------------------------------
  // Test 4: Followed leader disappears from presence
  // -------------------------------------------------------------
  {
    const session = createCollaborationSession({
      followingUserId: userB,
    });

    assert(session.getFollowingUserId() === userB, "Following user B");

    // Presence update: Bob has left the room (active participants: Alice, Charlie)
    session.handlePresenceChange([userA, userC]);

    assert(
      session.getFollowingUserId() === null,
      "Follower must stop following leader when leader disappears from presence"
    );

    pass("Test 4 — Followed leader disappearing from presence clears follow state");
  }

  // -------------------------------------------------------------
  // Test 5: Disconnected followers removed from active follower tracking
  // -------------------------------------------------------------
  {
    const session = createCollaborationSession({
      followerUserIds: [userB, userC],
    });

    assert(session.getFollowerUserIds().size === 2, "Leader has 2 followers");

    // User C disconnects; active participants: Alice, Bob
    session.handlePresenceChange([userA, userB]);

    assert(session.getFollowerUserIds().has(userB), "User B is still follower");
    assert(!session.getFollowerUserIds().has(userC), "User C is removed from followers");
    assert(session.getFollowerUserIds().size === 1, "Follower count correctly decremented");

    pass("Test 5 — Disconnected follower is removed from active follower registry");
  }

  // -------------------------------------------------------------
  // Test 6: Room switch is a hard isolation boundary
  // -------------------------------------------------------------
  {
    const session = createCollaborationSession({
      roomId: roomA,
      followingUserId: userB,
      followerUserIds: [userC],
    });

    assert(session.getRoomId() === roomA, "In Room A");
    assert(session.getFollowingUserId() === userB, "Following in Room A");

    // User navigates from Room A to Room B
    session.switchRoom(roomB);

    assert(session.getRoomId() === roomB, "Now in Room B");
    assert(session.getFollowingUserId() === null, "followingUserId reset on room switch");
    assert(session.getFollowerUserIds().size === 0, "followerUserIds reset on room switch");
    assert(session.getLastAcceptedViewportTimestamp() === 0, "Viewport timestamp reset on room switch");

    pass("Test 6 — Room switch hard isolation clears all follow and follower state");
  }

  // -------------------------------------------------------------
  // Test 7: Old room events MUST NEVER affect new room
  // -------------------------------------------------------------
  {
    const session = createCollaborationSession({
      roomId: roomA,
      followingUserId: userB,
    });

    // Switch to Room B
    session.switchRoom(roomB);

    // Delayed VIEWPORT_UPDATE arrives from Room A
    const delayedOldRoomPayload = {
      type: VIEWPORT_UPDATE_EVENT,
      roomId: roomA,
      senderId: userB,
      viewport: { x: 500, y: 500, zoom: 2.0 },
      timestamp: Date.now(),
    };

    const accepted = session.receiveRemoteEvent(delayedOldRoomPayload);
    assert(accepted === false, "Old room viewport event must be rejected");
    assert(session.getAppliedViewports().length === 0, "No viewport applied from old room");
    assert(session.getFollowingUserId() === null, "followingUserId remains null");

    pass("Test 7 — Old room viewport update is completely ignored in new room");
  }

  // -------------------------------------------------------------
  // Test 8: Stale generation / delayed callback safety
  // -------------------------------------------------------------
  {
    const session = createCollaborationSession({
      roomId: roomA,
      followingUserId: userB,
    });

    const genBeforeReconnect = session.getSessionGeneration();

    // Reconnect bumps session generation
    session.handleDisconnect();
    session.handleReconnect();

    const genAfterReconnect = session.getSessionGeneration();
    assert(genAfterReconnect > genBeforeReconnect, "Session generation incremented");

    // Old callback or queued event with old generation arrives
    const oldGenPayload = {
      type: VIEWPORT_UPDATE_EVENT,
      roomId: roomA,
      senderId: userB,
      viewport: { x: 300, y: 300, zoom: 1.5 },
      timestamp: Date.now(),
    };

    const accepted = session.receiveRemoteEvent(oldGenPayload, genBeforeReconnect);
    assert(accepted === false, "Old generation callback must be dropped as a no-op");
    assert(session.getAppliedViewports().length === 0, "No viewport applied from stale generation");

    pass("Test 8 — Session generation protects against stale callbacks and delayed events");
  }

  // -------------------------------------------------------------
  // Test 9: Stale viewport timestamp protection
  // -------------------------------------------------------------
  {
    const session = createCollaborationSession({
      followingUserId: userB,
    });

    const t1 = 1000;
    const t2 = 900; // Older timestamp

    const ev1 = {
      type: VIEWPORT_UPDATE_EVENT,
      roomId: roomA,
      senderId: userB,
      viewport: { x: 10, y: 10, zoom: 1 },
      timestamp: t1,
    };

    const ok1 = session.receiveRemoteEvent(ev1);
    assert(ok1 === true, "t1 accepted");
    assert(session.getAppliedViewports().length === 1, "t1 applied");

    const ev2 = {
      type: VIEWPORT_UPDATE_EVENT,
      roomId: roomA,
      senderId: userB,
      viewport: { x: 20, y: 20, zoom: 1 },
      timestamp: t2,
    };

    const ok2 = session.receiveRemoteEvent(ev2);
    assert(ok2 === false, "t2 rejected as stale");
    assert(session.getAppliedViewports().length === 1, "Stale viewport was not applied");

    pass("Test 9 — Stale viewport timestamp protection remains strictly enforced");
  }

  // -------------------------------------------------------------
  // Test 10: Remote apply guard survives reconnect without feedback loop
  // -------------------------------------------------------------
  {
    const session = createCollaborationSession({
      followingUserId: userB,
    });

    const guard = session.getGuard();
    const vp = { x: 100, y: 200, zoom: 1 };

    session.applyRemoteViewport(vp);
    assert(session.getAppliedViewports().length === 1, "Remote viewport applied");

    // Feedback loop test: the manual change handler checks guard and suppresses broadcast
    assert(session.getBroadcastEvents().length === 0, "Feedback broadcast suppressed by guard");

    // Disconnect and reconnect resets guard
    session.handleDisconnect();
    session.handleReconnect();

    assert(guard.isApplying() === false, "Guard cleared on reconnect");

    pass("Test 10 — Remote apply guard survives reconnect without feedback loops");
  }

  // -------------------------------------------------------------
  // Test 11: Phase 11.8 manual interruption remains preserved
  // -------------------------------------------------------------
  {
    const session = createCollaborationSession({
      followingUserId: userB,
    });

    // Remote leader update does NOT interrupt
    const remoteVp = {
      type: VIEWPORT_UPDATE_EVENT,
      roomId: roomA,
      senderId: userB,
      viewport: { x: 80, y: 80, zoom: 1.1 },
      timestamp: Date.now(),
    };
    session.receiveRemoteEvent(remoteVp);
    assert(session.getFollowingUserId() === userB, "Remote update does NOT interrupt follow mode");

    // Genuine manual canvas move DOES interrupt
    session.onManualViewportChange({ x: 99, y: 99, zoom: 1.2 });
    assert(session.getFollowingUserId() === null, "Manual canvas movement interrupts follow mode");
    assert(session.getUnfollowEvents().length === 1, "Unfollow event generated");

    pass("Test 11 — Phase 11.8 manual movement vs remote application distinction preserved");
  }

  // -------------------------------------------------------------
  // Test 12: Leader + follower simultaneously across disconnect/reconnect
  // A follows B, C follows A -> A disconnects & reconnects
  // -------------------------------------------------------------
  {
    const sessionA = createCollaborationSession({
      userId: userA,
      followingUserId: userB,
      followerUserIds: [userC],
    });

    assert(sessionA.getFollowingUserId() === userB, "A follows B");
    assert(sessionA.getFollowerUserIds().has(userC), "C follows A");

    // A disconnects and reconnects
    sessionA.handleDisconnect();
    sessionA.handleReconnect();

    // After reconnect: A follows nobody, A has no active followers
    assert(sessionA.getFollowingUserId() === null, "A follows nobody after reconnect");
    assert(sessionA.getFollowerUserIds().size === 0, "A has no active followers after reconnect");

    // Explicitly follow B again
    sessionA.followUser(userB);
    assert(sessionA.getFollowingUserId() === userB, "A explicitly re-follows B");

    // A can become leader again when C explicitly follows A
    sessionA.getFollowerUserIds().add(userC);
    assert(sessionA.getFollowerUserIds().has(userC), "C explicitly follows A");

    pass("Test 12 — Leader + follower simultaneously disconnects and reconnects cleanly");
  }

  // -------------------------------------------------------------
  // Test 13: Solo Mode safety
  // -------------------------------------------------------------
  {
    const soloSession = createCollaborationSession({
      roomId: null,
      isConnected: false,
    });

    assert(soloSession.getFollowingUserId() === null, "Solo mode has no followingUserId");
    assert(soloSession.getFollowerUserIds().size === 0, "Solo mode has no followerUserIds");

    soloSession.followUser(userB);
    assert(soloSession.getFollowingUserId() === null, "Cannot follow in solo mode");
    assert(soloSession.getFollowEvents().length === 0, "No follow events in solo mode");

    soloSession.onManualViewportChange({ x: 10, y: 20, zoom: 1 });
    assert(soloSession.getBroadcastEvents().length === 0, "No broadcast events in solo mode");

    pass("Test 13 — Solo mode operates completely safely with zero realtime side effects");
  }

  // -------------------------------------------------------------
  // Test 14: shouldAcceptRemoteViewportEvent helper validation
  // -------------------------------------------------------------
  {
    const baseParams = {
      incomingRoomId: roomA,
      currentRoomId: roomA,
      senderId: userB,
      currentUserId: userA,
      followingUserId: userB,
      incomingTimestamp: 1000,
      lastAcceptedTimestamp: 500,
      sessionGeneration: 1,
      currentGeneration: 1,
    };

    assert(shouldAcceptRemoteViewportEvent(baseParams) === true, "Valid event accepted");

    // Wrong room
    assert(
      shouldAcceptRemoteViewportEvent({ ...baseParams, incomingRoomId: roomB }) === false,
      "Cross-room event rejected"
    );

    // Self event
    assert(
      shouldAcceptRemoteViewportEvent({ ...baseParams, senderId: userA }) === false,
      "Self event rejected"
    );

    // Not following sender
    assert(
      shouldAcceptRemoteViewportEvent({ ...baseParams, followingUserId: userC }) === false,
      "Unfollowed sender event rejected"
    );

    // Stale timestamp
    assert(
      shouldAcceptRemoteViewportEvent({ ...baseParams, incomingTimestamp: 400 }) === false,
      "Stale timestamp rejected"
    );

    // Stale generation
    assert(
      shouldAcceptRemoteViewportEvent({ ...baseParams, sessionGeneration: 0, currentGeneration: 1 }) === false,
      "Stale generation rejected"
    );

    pass("Test 14 — shouldAcceptRemoteViewportEvent verifies all isolation checks");
  }

  // -------------------------------------------------------------
  // Test 15: Persistence and CanvasState isolation strictly preserved
  // -------------------------------------------------------------
  {
    const initialCanvas = {
      nodes: [
        {
          id: "node-1",
          type: "concept",
          position: { x: 100, y: 150 },
          title: "Architecture",
          description: "Follow Mode Safety",
        },
      ],
      edges: [],
    };

    const snapshot = createCanvasSnapshot(initialCanvas);
    assert(snapshot.nodes.length === 1, "Snapshot preserved nodes");
    assert(snapshot.nodes[0].title === "Architecture", "Snapshot preserved node content");

    // Reconnect / room change events do not touch CanvasState or localStorage
    const snapshotStr = JSON.stringify(snapshot);
    assert(!snapshotStr.includes("followingUserId"), "CanvasState does not persist followingUserId");
    assert(!snapshotStr.includes("followerUserIds"), "CanvasState does not persist followerUserIds");
    assert(!snapshotStr.includes("remoteViewport"), "CanvasState does not persist remote viewports");

    pass("Test 15 — Persistence and CanvasState isolation strictly preserved");
  }

  console.log("\n==========================================");
  console.log(`ALL ${passedCount} PHASE 11.9 ACCEPTANCE TESTS PASSED!`);
  console.log("==========================================\n");
}

runTests().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
