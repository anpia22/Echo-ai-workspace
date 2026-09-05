import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  computeFollowStateList,
  resolveParticipantDisplayName,
  formatFollowerCountLabel,
  formatFollowingLabel,
} from "../src/app/lib/collaboration/presence.ts";
import { createCanvasSnapshot } from "../src/app/lib/collaboration/canvasSnapshot.ts";
import { getRoomIdFromUrl, getRoomMode } from "../src/app/lib/collaboration/room.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log("Starting Phase 11.7 Follow Indicators Test Suite...\n");

let passedCount = 0;
function pass(testName) {
  passedCount++;
  console.log(`PASS [${passedCount}]: ${testName}`);
}

async function runTests() {
  const currentUserId = "user-alice";
  const currentParticipant = {
    userId: currentUserId,
    displayName: "Alice",
    color: "#3b82f6",
  };

  const participantBob = {
    userId: "user-bob",
    displayName: "Bob",
    color: "#10b981",
  };

  const participantCharlie = {
    userId: "user-charlie",
    displayName: "Charlie",
    color: "#f59e0b",
  };

  // -------------------------------------------------------------
  // Test A: Current following indicator
  // followingUserId = participantA -> indicator shows participantA
  // -------------------------------------------------------------
  {
    const followingUserId = participantBob.userId;
    const leaderName = resolveParticipantDisplayName(
      followingUserId,
      [participantBob, participantCharlie],
      currentParticipant
    );
    const label = formatFollowingLabel(leaderName);

    assert(leaderName === "Bob", "Leader name must resolve to Bob");
    assert(label === "Following Bob", "Indicator label must be 'Following Bob'");

    const items = computeFollowStateList(
      [participantBob, participantCharlie],
      currentParticipant,
      followingUserId,
      new Set()
    );
    const bobItem = items.find((i) => i.userId === participantBob.userId);
    assert(bobItem.isFollowing === true, "Bob item must be marked isFollowing: true");

    pass("Test A — Current following indicator reflects followed participant");
  }

  // -------------------------------------------------------------
  // Test B: No active follow
  // followingUserId = null -> active-follow indicator absent
  // -------------------------------------------------------------
  {
    const followingUserId = null;
    const items = computeFollowStateList(
      [participantBob, participantCharlie],
      currentParticipant,
      followingUserId,
      new Set()
    );

    for (const item of items) {
      assert(item.isFollowing === false, "No participant should be marked isFollowing when followingUserId is null");
    }

    pass("Test B — No active follow indicator present when followingUserId is null");
  }

  // -------------------------------------------------------------
  // Test C: Follow target identity
  // Correct participant name displayed when present; safe fallback when absent
  // -------------------------------------------------------------
  {
    // Present in list
    const knownName = resolveParticipantDisplayName(
      participantCharlie.userId,
      [participantBob, participantCharlie],
      currentParticipant
    );
    assert(knownName === "Charlie", "Resolved known participant name");

    // Absent from list (e.g. presence not yet arrived or disconnected)
    const unknownUserId = "user-unknown-987654";
    const fallbackName = resolveParticipantDisplayName(
      unknownUserId,
      [participantBob],
      currentParticipant
    );
    assert(typeof fallbackName === "string" && fallbackName.length > 0, "Fallback name must be safe string");
    assert(fallbackName.includes("User user") || fallbackName === unknownUserId, "Fallback handles unknown cleanly");

    pass("Test C — Follow target identity resolves accurately with safe fallback");
  }

  // -------------------------------------------------------------
  // Test D: Follower indicator
  // followerUserIds = {A, B} -> follower indication reflects 2
  // -------------------------------------------------------------
  {
    const followerUserIds = new Set([participantBob.userId, participantCharlie.userId]);
    const followerCount = followerUserIds.size;
    const label = formatFollowerCountLabel(followerCount);

    assert(label === "2 following you", "Follower label must be '2 following you'");

    const items = computeFollowStateList(
      [participantBob, participantCharlie],
      currentParticipant,
      null,
      followerUserIds
    );

    const bobItem = items.find((i) => i.userId === participantBob.userId);
    const charlieItem = items.find((i) => i.userId === participantCharlie.userId);
    assert(bobItem.isFollower === true, "Bob is marked isFollower: true");
    assert(charlieItem.isFollower === true, "Charlie is marked isFollower: true");

    pass("Test D — Follower indicator reflects active followers accurately");
  }

  // -------------------------------------------------------------
  // Test E: Zero followers
  // followerUserIds = {} -> no misleading follower indication
  // -------------------------------------------------------------
  {
    const followerUserIds = new Set();
    const followerCount = followerUserIds.size;
    const label = formatFollowerCountLabel(followerCount);

    assert(label === "", "Empty follower count produces empty/hidden label");

    const items = computeFollowStateList(
      [participantBob],
      currentParticipant,
      null,
      followerUserIds
    );
    const bobItem = items.find((i) => i.userId === participantBob.userId);
    assert(bobItem.isFollower === false, "Participant must not be marked isFollower when set is empty");

    pass("Test E — Zero followers produces no misleading follower indication");
  }

  // -------------------------------------------------------------
  // Test F: Participant filtering
  // Current user must not appear as their own participant/follower
  // -------------------------------------------------------------
  {
    // Even if followerUserIds accidentally contained current user's ID
    const followerUserIds = new Set([currentUserId, participantBob.userId]);
    const items = computeFollowStateList(
      [participantBob],
      currentParticipant,
      currentUserId, // accidental self following
      followerUserIds
    );

    const you = items.find((i) => i.userId === currentUserId);
    assert(you.isYou === true, "Current user identified as isYou");
    assert(you.isFollower === false, "Current user must NEVER be marked as their own follower");
    assert(you.isFollowing === false, "Current user must NEVER be marked as following themselves");
    assert(you.canFollow === false, "Current user cannot be followed by themselves");

    pass("Test F — Current user strictly filtered from self follow/follower state");
  }

  // -------------------------------------------------------------
  // Test G: Presence changes
  // Indicators remain safe when participant data changes
  // -------------------------------------------------------------
  {
    const followerUserIds = new Set([participantBob.userId]);

    // Initial state: Bob in room
    let items = computeFollowStateList([participantBob], currentParticipant, participantBob.userId, followerUserIds);
    assert(items.length === 2, "2 items in room");
    assert(items.find((i) => i.userId === participantBob.userId).isFollowing === true);
    assert(items.find((i) => i.userId === participantBob.userId).isFollower === true);

    // Bob disconnects from presence
    items = computeFollowStateList([], currentParticipant, participantBob.userId, followerUserIds);
    assert(items.length === 1, "Only current user remains in presence");
    assert(items[0].isYou === true);

    // Resolving Bob's name when not in presence still succeeds safely
    const resolvedName = resolveParticipantDisplayName(participantBob.userId, [], currentParticipant);
    assert(typeof resolvedName === "string", "Resolves safely without crashing");

    pass("Test G — Presence changes update indicator safely without crashing");
  }

  // -------------------------------------------------------------
  // Test H: Follow state source of truth
  // Indicators derive strictly from followingUserId and followerUserIds
  // -------------------------------------------------------------
  {
    let collaborationFollowing = null;
    let collaborationFollowers = new Set();

    let items = computeFollowStateList([participantBob], currentParticipant, collaborationFollowing, collaborationFollowers);
    assert(items.find((i) => i.userId === participantBob.userId).isFollowing === false);
    assert(items.find((i) => i.userId === participantBob.userId).isFollower === false);

    // Collaboration hook updates
    collaborationFollowing = participantBob.userId;
    collaborationFollowers = new Set([participantBob.userId]);

    items = computeFollowStateList([participantBob], currentParticipant, collaborationFollowing, collaborationFollowers);
    assert(items.find((i) => i.userId === participantBob.userId).isFollowing === true);
    assert(items.find((i) => i.userId === participantBob.userId).isFollower === true);

    pass("Test H — Indicators derive strictly from collaboration state source of truth");
  }

  // -------------------------------------------------------------
  // Test I: No direct realtime
  // UI does not publish or subscribe directly to Supabase
  // -------------------------------------------------------------
  {
    const presenceSource = readFileSync(
      resolve(process.cwd(), "src/app/components/PresenceIndicator.tsx"),
      "utf-8"
    );
    const roomControlsSource = readFileSync(
      resolve(process.cwd(), "src/app/components/RoomControls.tsx"),
      "utf-8"
    );

    assert(!presenceSource.includes("createClient"), "PresenceIndicator must not create supabase client");
    assert(!presenceSource.includes("channel.send"), "PresenceIndicator must not send realtime messages");
    assert(!roomControlsSource.includes("createClient"), "RoomControls must not create supabase client");
    assert(!roomControlsSource.includes("channel.send"), "RoomControls must not send realtime messages");

    pass("Test I — UI has zero direct realtime / Supabase access");
  }

  // -------------------------------------------------------------
  // Test J: No viewport side effects
  // Indicators do not call setViewport or fitView
  // -------------------------------------------------------------
  {
    const presenceSource = readFileSync(
      resolve(process.cwd(), "src/app/components/PresenceIndicator.tsx"),
      "utf-8"
    );
    const roomControlsSource = readFileSync(
      resolve(process.cwd(), "src/app/components/RoomControls.tsx"),
      "utf-8"
    );

    assert(!presenceSource.includes("setViewport"), "PresenceIndicator must not call setViewport");
    assert(!presenceSource.includes("fitView"), "PresenceIndicator must not call fitView");
    assert(!roomControlsSource.includes("setViewport"), "RoomControls must not call setViewport");
    assert(!roomControlsSource.includes("fitView"), "RoomControls must not call fitView");

    pass("Test J — Zero viewport / camera side effects from indicators");
  }

  // -------------------------------------------------------------
  // Test K: Solo mode
  // Indicators are hidden/disabled in solo mode
  // -------------------------------------------------------------
  {
    const soloParams = new URLSearchParams("");
    const soloRoomId = getRoomIdFromUrl(soloParams);
    const soloMode = getRoomMode(soloRoomId);

    assert(soloRoomId === null, "Solo mode has null roomId");
    assert(soloMode === "solo", "Mode is solo");

    const roomControlsSource = readFileSync(
      resolve(process.cwd(), "src/app/components/RoomControls.tsx"),
      "utf-8"
    );
    assert(
      roomControlsSource.includes("if (!roomId) {\n    return (\n      <button\n        type=\"button\"\n        onClick={createRoom}"),
      "RoomControls in solo mode must only render Create Room button"
    );

    pass("Test K — Solo mode hides all collaboration and follow indicators");
  }

  // -------------------------------------------------------------
  // Test L: Existing follow behavior
  // 11.6 Follow/Unfollow controls remain intact
  // -------------------------------------------------------------
  {
    const presenceSource = readFileSync(
      resolve(process.cwd(), "src/app/components/PresenceIndicator.tsx"),
      "utf-8"
    );

    assert(presenceSource.includes("onFollow(item.userId)"), "Follow action remains available");
    assert(presenceSource.includes("onUnfollow?.()"), "Unfollow action remains available");
    assert(presenceSource.includes("Following you"), "Following you indicator is rendered");

    pass("Test L — Existing Phase 11.6 Follow/Unfollow functionality fully preserved");
  }

  // -------------------------------------------------------------
  // Test M: Persistence and CanvasState isolation
  // -------------------------------------------------------------
  {
    const snapshot = createCanvasSnapshot({
      nodes: [],
      edges: [],
      groups: [],
    });
    assert(!("followingUserId" in snapshot), "CanvasSnapshot has no followingUserId");
    assert(!("followerUserIds" in snapshot), "CanvasSnapshot has no followerUserIds");

    pass("Test M — Persistence and CanvasState isolation strictly preserved");
  }

  console.log("\n==========================================");
  console.log(`ALL ${passedCount} PHASE 11.7 ACCEPTANCE TESTS PASSED!`);
  console.log("==========================================\n");
}

runTests().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
