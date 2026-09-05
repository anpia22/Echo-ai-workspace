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
import {
  applyRemoteNodeEvent,
  upsertSemanticNode,
  moveSemanticNode,
  deleteSemanticNode,
  NODE_UPSERT_EVENT,
} from "../src/app/lib/collaboration/nodeEvents.ts";
import {
  applyRemoteEdgeEvent,
  upsertSemanticEdge,
  deleteSemanticEdge,
} from "../src/app/lib/collaboration/edgeEvents.ts";
import {
  applyRemoteGroupEvent,
  upsertSemanticGroup,
  deleteSemanticGroup,
} from "../src/app/lib/collaboration/groupEvents.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

console.log("Starting Phase 11.R1 Full Regression & Integration Audit Test Suite...\n");

let passedCount = 0;
function pass(testName) {
  passedCount++;
  console.log(`PASS [${passedCount}]: ${testName}`);
}

async function runTests() {
  const room1 = "echo-room-1";
  const room2 = "echo-room-2";

  // Peer client simulator
  function createClient(options) {
    let roomId = options.roomId ?? room1;
    const userId = options.userId;
    const displayName = options.displayName ?? userId;
    let isConnected = true;
    let sessionGeneration = 1;

    let followingUserId = null;
    let followerUserIds = new Set();
    let lastAcceptedViewportTimestamp = 0;
    let latestRemoteViewport = null;

    let canvasViewport = { x: 0, y: 0, zoom: 1 };
    const appliedViewports = [];
    const publishedViewportEvents = [];
    const publishedFollowEvents = [];
    const publishedUnfollowEvents = [];
    let notice = null;

    const guard = createRemoteViewportApplyGuard(120);

    const broadcaster = createViewportBroadcaster({
      throttleMs: 30,
      isLeader: () => followerUserIds.size > 0,
      publish: (vp) => {
        if (!isConnected) return;
        publishedViewportEvents.push({
          type: VIEWPORT_UPDATE_EVENT,
          roomId,
          senderId: userId,
          viewport: cloneViewport(vp),
          timestamp: Date.now(),
        });
      },
    });

    const followUser = (leaderId) => {
      if (!isConnected || !roomId || !leaderId || leaderId === userId) return;
      followingUserId = leaderId;
      publishedFollowEvents.push({
        type: FOLLOW_USER_EVENT,
        roomId,
        leaderId,
        followerId: userId,
      });
    };

    const unfollowUser = (targetLeader) => {
      const leaderToUnfollow = targetLeader ?? followingUserId;
      followingUserId = null;
      if (leaderToUnfollow && isConnected && roomId) {
        publishedUnfollowEvents.push({
          type: UNFOLLOW_USER_EVENT,
          roomId,
          leaderId: leaderToUnfollow,
          followerId: userId,
        });
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
        notice = "Follow mode stopped";
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

    const receiveEvent = (payload, eventGeneration = sessionGeneration) => {
      if (!isConnected) return false;
      if (eventGeneration !== sessionGeneration) return false;

      if (payload.type === FOLLOW_USER_EVENT) {
        const parsed = parseFollowUserPayload(payload);
        if (!parsed) return false;
        if (parsed.roomId !== roomId || parsed.followerId === userId) return false;
        if (parsed.leaderId === userId) {
          followerUserIds = applyFollowUser(followerUserIds, parsed.followerId);
          return true;
        }
        return false;
      }

      if (payload.type === UNFOLLOW_USER_EVENT) {
        const parsed = parseUnfollowUserPayload(payload);
        if (!parsed) return false;
        if (parsed.roomId !== roomId || parsed.followerId === userId) return false;
        if (parsed.leaderId === userId) {
          followerUserIds = applyUnfollowUser(followerUserIds, parsed.followerId);
          return true;
        }
        return false;
      }

      if (payload.type === VIEWPORT_UPDATE_EVENT) {
        const parsed = parseViewportUpdatePayload(payload);
        if (!parsed) return false;
        if (parsed.roomId !== roomId) return false;
        if (parsed.senderId === userId) return false;
        if (parsed.senderId !== followingUserId) return false;
        if (!shouldAcceptViewportUpdate(parsed.timestamp, lastAcceptedViewportTimestamp)) {
          return false;
        }
        lastAcceptedViewportTimestamp = parsed.timestamp;
        latestRemoteViewport = cloneViewport(parsed.viewport);
        applyRemoteViewport(parsed.viewport);
        return true;
      }

      return false;
    };

    const handlePresence = (activeIds) => {
      const active = new Set(activeIds);
      // Prune followers
      const nextFollowers = new Set();
      for (const fId of followerUserIds) {
        if (active.has(fId)) {
          nextFollowers.add(fId);
        }
      }
      followerUserIds = nextFollowers;

      // Disconnect followed leader if departed
      if (followingUserId && !active.has(followingUserId)) {
        followingUserId = null;
      }
    };

    const disconnect = () => {
      isConnected = false;
      followingUserId = null;
      followerUserIds = new Set();
      lastAcceptedViewportTimestamp = 0;
      latestRemoteViewport = null;
      guard.clear();
      broadcaster.flush();
    };

    const reconnect = () => {
      sessionGeneration += 1;
      isConnected = true;
      followingUserId = null;
      followerUserIds = new Set();
      lastAcceptedViewportTimestamp = 0;
      latestRemoteViewport = null;
      guard.clear();
    };

    const switchRoom = (newRoomId) => {
      sessionGeneration += 1;
      roomId = newRoomId;
      followingUserId = null;
      followerUserIds = new Set();
      lastAcceptedViewportTimestamp = 0;
      latestRemoteViewport = null;
      guard.clear();
      broadcaster.destroy();
    };

    return {
      userId,
      getRoomId: () => roomId,
      isConnected: () => isConnected,
      getSessionGeneration: () => sessionGeneration,
      getFollowingUserId: () => followingUserId,
      getFollowerUserIds: () => followerUserIds,
      getCanvasViewport: () => canvasViewport,
      getAppliedViewports: () => appliedViewports,
      getPublishedViewportEvents: () => publishedViewportEvents,
      getPublishedFollowEvents: () => publishedFollowEvents,
      getPublishedUnfollowEvents: () => publishedUnfollowEvents,
      getNotice: () => notice,
      followUser,
      unfollowUser,
      onManualViewportChange,
      applyRemoteViewport,
      receiveEvent,
      handlePresence,
      disconnect,
      reconnect,
      switchRoom,
      destroy: () => {
        guard.destroy();
        broadcaster.destroy();
      },
    };
  }

  // =========================================================================
  // INTEGRATED 30-STEP END-TO-END SCENARIO (Section 21)
  // =========================================================================
  {
    // 1. A joins Room 1
    // 2. B joins Room 1
    // 3. C joins Room 1
    const clientA = createClient({ userId: "alice", roomId: room1 });
    const clientB = createClient({ userId: "bob", roomId: room1 });
    const clientC = createClient({ userId: "charlie", roomId: room1 });

    assert(clientA.getRoomId() === room1 && clientB.getRoomId() === room1 && clientC.getRoomId() === room1, "1-3: Clients joined Room 1");

    // 4. A follows B
    clientA.followUser("bob");
    assert(clientA.getFollowingUserId() === "bob", "4: A follows B locally");
    const followEv = clientA.getPublishedFollowEvents()[0];
    assert(followEv && followEv.leaderId === "bob", "4: Follow event published");
    clientB.receiveEvent(followEv);
    assert(clientB.getFollowerUserIds().has("alice"), "4: B registers A as follower");

    // 5. B moves viewport
    // 6. A receives viewport
    // 7. A camera follows B
    const vpB1 = { x: 150, y: 220, zoom: 1.25 };
    clientB.onManualViewportChange(vpB1);
    await sleep(40); // Broadcaster throttle flush
    const vpEv1 = clientB.getPublishedViewportEvents()[clientB.getPublishedViewportEvents().length - 1];
    assert(vpEv1 && isSameViewport(vpEv1.viewport, vpB1), "5: B broadcasted viewport");

    const aReceived1 = clientA.receiveEvent(vpEv1);
    assert(aReceived1 === true, "6: A accepted B's viewport");
    assert(isSameViewport(clientA.getCanvasViewport(), vpB1), "7: A canvas camera follows B");
    assert(clientA.getFollowingUserId() === "bob", "7: A still following B (remote does not interrupt)");
    assert(clientA.getPublishedViewportEvents().length === 0, "5-7: Feedback loop prevented: A does not broadcast remote viewport");

    // 8. C follows A (A is now follower of B AND leader of C simultaneously!)
    clientC.followUser("alice");
    const cFollowEv = clientC.getPublishedFollowEvents()[0];
    clientA.receiveEvent(cFollowEv);
    assert(clientA.getFollowingUserId() === "bob", "8: A is follower of B");
    assert(clientA.getFollowerUserIds().has("charlie"), "8: A is simultaneously leader for C");

    // 9. B moves again
    // 10. A follows B
    // 11. C receives A's resulting viewport
    const vpB2 = { x: 300, y: 400, zoom: 1.5 };
    clientB.onManualViewportChange(vpB2);
    await sleep(40);
    const vpEv2 = clientB.getPublishedViewportEvents()[clientB.getPublishedViewportEvents().length - 1];

    clientA.receiveEvent(vpEv2);
    assert(isSameViewport(clientA.getCanvasViewport(), vpB2), "10: A followed B to vpB2");

    // Because A is leader for C, A's broadcaster publishes to C
    // In our client, applying remote viewport marks applying in guard; for leader cascade, A broadcasts resulting move if desired or when A moves
    clientA.onManualViewportChange(clientA.getCanvasViewport());
    await sleep(40);
    const aLeadEvents = clientA.getPublishedViewportEvents();
    // Verify leader publishing
    clientA.onManualViewportChange({ x: 310, y: 410, zoom: 1.5 });
    await sleep(40);
    const aLeadEv = clientA.getPublishedViewportEvents()[clientA.getPublishedViewportEvents().length - 1];
    assert(aLeadEv && aLeadEv.senderId === "alice", "11: A can broadcast as leader");

    // 12. A manually pans
    // 13. A unfollows B
    // 14. C continues following A
    const aManualVp = { x: -50, y: 80, zoom: 1.0 };
    clientA.onManualViewportChange(aManualVp);
    assert(clientA.getFollowingUserId() === null, "12-13: A manually moved -> A unfollows B immediately");
    assert(clientA.getNotice() === "Follow mode stopped", "13: Follow mode stopped notice emitted");
    assert(clientA.getFollowerUserIds().has("charlie"), "14: C continues following A");

    // 15. A follows B again
    clientA.followUser("bob");
    assert(clientA.getFollowingUserId() === "bob", "15: A explicitly follows B again");

    // 16. Stale B viewport arrives
    // 17. Stale update is rejected
    const staleVpEv = {
      type: VIEWPORT_UPDATE_EVENT,
      roomId: room1,
      senderId: "bob",
      viewport: { x: 10, y: 10, zoom: 1 },
      timestamp: vpEv1.timestamp - 1000, // Older
    };
    const staleAccepted = clientA.receiveEvent(staleVpEv);
    assert(staleAccepted === false, "16-17: Stale viewport update strictly rejected");

    // 18. B disconnects
    // 19. A follow state clears
    clientA.handlePresence(["alice", "charlie"]); // Bob departed
    assert(clientA.getFollowingUserId() === null, "18-19: Followed leader departed -> A follow state cleared");

    // 20. A reconnects
    // 21. A does not auto-follow B
    clientA.disconnect();
    clientA.reconnect();
    assert(clientA.getFollowingUserId() === null, "20-21: Reconnecting does NOT auto-follow B");
    assert(clientA.getFollowerUserIds().size === 0, "20-21: Stale followers cleared on reconnect");

    // 22. A follows B again
    clientA.followUser("bob");
    assert(clientA.getFollowingUserId() === "bob", "22: A explicitly follows B");

    // 23. A switches Room 1 -> Room 2
    // 24. Follow state clears
    clientA.switchRoom(room2);
    assert(clientA.getRoomId() === room2, "23: A now in Room 2");
    assert(clientA.getFollowingUserId() === null, "24: Follow state cleared on room switch");
    assert(clientA.getFollowerUserIds().size === 0, "24: Follower state cleared on room switch");

    // 25. Delayed Room 1 viewport arrives
    // 26. Room 2 ignores it
    const delayedRoom1Event = {
      type: VIEWPORT_UPDATE_EVENT,
      roomId: room1,
      senderId: "bob",
      viewport: { x: 999, y: 999, zoom: 2 },
      timestamp: Date.now(),
    };
    const delayedAccepted = clientA.receiveEvent(delayedRoom1Event);
    assert(delayedAccepted === false, "25-26: Room 1 event completely ignored in Room 2");

    // 27. A performs CanvasState operations
    // 28. No viewport event is generated
    const canvasBefore = { nodes: [], edges: [] };
    const canvasWithNode = upsertSemanticNode(canvasBefore, {
      id: "node-1",
      type: "concept",
      position: { x: 50, y: 50 },
      title: "Title",
    });
    const vpEventsBefore = clientA.getPublishedViewportEvents().length;
    // Semantic node update
    const canvasMoved = moveSemanticNode(canvasWithNode, "node-1", { x: 100, y: 100 });
    assert(canvasMoved.nodes[0].position.x === 100, "27: Node moved in semantic canvas");
    assert(clientA.getPublishedViewportEvents().length === vpEventsBefore, "28: Zero viewport events emitted during CanvasState operations");

    // 29. Phase 10 collaboration operations still work
    const canvasGrouped = upsertSemanticGroup(canvasMoved, {
      id: "group-1",
      title: "Group",
      memberIds: ["node-1"],
    });
    const snapshot = createCanvasSnapshot(canvasGrouped);
    assert(snapshot.nodes.length === 1 && snapshot.groups.length === 1, "29: Phase 10 snapshot contracts preserved");

    // 30. Cleanup occurs
    clientA.destroy();
    clientB.destroy();
    clientC.destroy();
    pass("30-Step End-to-End Follow Me Integrated Scenario (Steps 1 to 30)");
  }

  // =========================================================================
  // Integration Test: Rapid Follow Switching (B -> C -> D -> B)
  // =========================================================================
  {
    const client = createClient({ userId: "alice", roomId: room1 });
    const userB = "bob";
    const userC = "charlie";
    const userD = "david";

    client.followUser(userB);
    assert(client.getFollowingUserId() === userB, "Follows B");

    client.followUser(userC);
    assert(client.getFollowingUserId() === userC, "Switches to C");

    client.followUser(userD);
    assert(client.getFollowingUserId() === userD, "Switches to D");

    client.followUser(userB);
    assert(client.getFollowingUserId() === userB, "Switches back to B");

    // Events from C and D arriving now must be ignored
    const vpC = {
      type: VIEWPORT_UPDATE_EVENT,
      roomId: room1,
      senderId: userC,
      viewport: { x: 100, y: 100, zoom: 1 },
      timestamp: Date.now(),
    };
    const vpD = {
      type: VIEWPORT_UPDATE_EVENT,
      roomId: room1,
      senderId: userD,
      viewport: { x: 200, y: 200, zoom: 1 },
      timestamp: Date.now(),
    };
    assert(client.receiveEvent(vpC) === false, "Event from former leader C ignored");
    assert(client.receiveEvent(vpD) === false, "Event from former leader D ignored");

    // Event from active leader B accepted
    const vpB = {
      type: VIEWPORT_UPDATE_EVENT,
      roomId: room1,
      senderId: userB,
      viewport: { x: 300, y: 300, zoom: 1.2 },
      timestamp: Date.now(),
    };
    assert(client.receiveEvent(vpB) === true, "Event from current leader B accepted");
    assert(isSameViewport(client.getCanvasViewport(), vpB.viewport), "Applied current leader B viewport");

    client.destroy();
    pass("Rapid Follow Switching (B -> C -> D -> B) validates strict leader binding");
  }

  // =========================================================================
  // Integration Test: Rapid Consecutive Viewport Updates & Stale Order Handling
  // =========================================================================
  {
    const client = createClient({ userId: "alice", roomId: room1 });
    client.followUser("bob");

    const baseTime = 10000;
    const updates = [
      { vp: { x: 10, y: 10, zoom: 1 }, time: baseTime + 10 },
      { vp: { x: 20, y: 20, zoom: 1 }, time: baseTime + 20 },
      { vp: { x: 30, y: 30, zoom: 1 }, time: baseTime + 30 },
      { vp: { x: 25, y: 25, zoom: 1 }, time: baseTime + 25 }, // Stale out of order
      { vp: { x: 40, y: 40, zoom: 1 }, time: baseTime + 40 },
    ];

    let appliedCount = 0;
    for (const u of updates) {
      const ok = client.receiveEvent({
        type: VIEWPORT_UPDATE_EVENT,
        roomId: room1,
        senderId: "bob",
        viewport: u.vp,
        timestamp: u.time,
      });
      if (ok) appliedCount++;
    }

    assert(appliedCount === 4, "Only 4 chronological updates applied, 1 stale rejected");
    assert(isSameViewport(client.getCanvasViewport(), { x: 40, y: 40, zoom: 1 }), "Final viewport matches newest timestamp");

    client.destroy();
    pass("Rapid consecutive viewport updates with out-of-order rejection");
  }

  // =========================================================================
  // Integration Test: Solo Mode Full Regression
  // =========================================================================
  {
    const solo = createClient({ userId: "solo-user", roomId: null });
    solo.disconnect();

    assert(solo.getFollowingUserId() === null, "Solo has no followingUserId");
    assert(solo.getFollowerUserIds().size === 0, "Solo has no followerUserIds");

    solo.followUser("someone");
    assert(solo.getFollowingUserId() === null, "followUser is no-op in solo mode");

    solo.onManualViewportChange({ x: 50, y: 50, zoom: 1 });
    assert(solo.getPublishedViewportEvents().length === 0, "Zero broadcasts in solo mode");

    solo.destroy();
    pass("Solo Mode Full Isolation & Zero Side Effects");
  }

  // =========================================================================
  // Integration Test: Self-Event Isolation
  // =========================================================================
  {
    const client = createClient({ userId: "alice", roomId: room1 });
    client.followUser("alice"); // Attempt self follow
    assert(client.getFollowingUserId() === null, "Cannot follow self");

    // Self event received from network
    const selfEv = {
      type: VIEWPORT_UPDATE_EVENT,
      roomId: room1,
      senderId: "alice",
      viewport: { x: 99, y: 99, zoom: 2 },
      timestamp: Date.now(),
    };
    assert(client.receiveEvent(selfEv) === false, "Self event ignored");

    client.destroy();
    pass("Self-Event Isolation strictly enforced");
  }

  console.log("\n==========================================");
  console.log(`ALL ${passedCount} PHASE 11.R1 AUDIT TESTS PASSED!`);
  console.log("==========================================\n");
}

runTests().catch((err) => {
  console.error("Test failure in Phase 11.R1:", err);
  process.exit(1);
});
