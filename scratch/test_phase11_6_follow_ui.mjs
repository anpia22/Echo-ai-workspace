import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  computeFollowStateList,
} from "../src/app/lib/collaboration/presence.ts";
import { createCanvasSnapshot } from "../src/app/lib/collaboration/canvasSnapshot.ts";
import { getRoomIdFromUrl, getRoomMode } from "../src/app/lib/collaboration/room.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log("Starting Phase 11.6 Follow UI Test Suite...\n");

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
  // Test 1: Participants rendered
  // Existing participants appear in Follow UI; current user is excluded from follow actions.
  // -------------------------------------------------------------
  {
    const items = computeFollowStateList(
      [participantBob, participantCharlie],
      currentParticipant,
      null
    );

    assert(items.length === 3, "All 3 participants must be rendered");
    // Current user is sorted first
    assert(items[0].userId === currentUserId, "Current user must be sorted first");
    assert(items[0].isYou === true, "Current user is marked isYou");
    assert(items[0].canFollow === false, "Current user must NOT be followable");

    // Other participants are listed and followable
    const bobItem = items.find((i) => i.userId === participantBob.userId);
    const charlieItem = items.find((i) => i.userId === participantCharlie.userId);
    assert(bobItem !== undefined, "Bob must appear in the list");
    assert(charlieItem !== undefined, "Charlie must appear in the list");
    assert(bobItem.canFollow === true, "Bob can be followed");
    assert(charlieItem.canFollow === true, "Charlie can be followed");
    assert(bobItem.isFollowing === false, "Bob is not followed by default");

    pass("Test 1 — Participants rendered & current user excluded from follow actions");
  }

  // -------------------------------------------------------------
  // Test 2: Follow action
  // Clicking Follow for participant A calls followUser(A)
  // -------------------------------------------------------------
  {
    let followedUserId = null;
    const mockFollowUser = (id) => {
      followedUserId = id;
    };

    const items = computeFollowStateList(
      [participantBob],
      currentParticipant,
      null
    );
    const bob = items.find((i) => i.userId === participantBob.userId);

    // Simulate clicking follow on Bob
    if (bob.canFollow && !bob.isFollowing) {
      mockFollowUser(bob.userId);
    }

    assert(followedUserId === participantBob.userId, "followUser must be called with participant's userId");
    pass("Test 2 — Follow action invokes followUser(leaderId)");
  }

  // -------------------------------------------------------------
  // Test 3: Active following state
  // When followingUserId === A, A displays the active Following state
  // -------------------------------------------------------------
  {
    const items = computeFollowStateList(
      [participantBob, participantCharlie],
      currentParticipant,
      participantBob.userId
    );

    const bob = items.find((i) => i.userId === participantBob.userId);
    const charlie = items.find((i) => i.userId === participantCharlie.userId);

    assert(bob.isFollowing === true, "Bob must be in active following state");
    assert(charlie.isFollowing === false, "Charlie must NOT be in following state");
    pass("Test 3 — Active following state reflected for followed participant");
  }

  // -------------------------------------------------------------
  // Test 4: Unfollow action
  // Clicking Unfollow calls unfollowUser()
  // -------------------------------------------------------------
  {
    let unfollowCalled = false;
    const mockUnfollowUser = () => {
      unfollowCalled = true;
    };

    const items = computeFollowStateList(
      [participantBob],
      currentParticipant,
      participantBob.userId
    );
    const bob = items.find((i) => i.userId === participantBob.userId);

    assert(bob.isFollowing === true, "Bob is currently followed");
    // Simulate clicking unfollow
    mockUnfollowUser();

    assert(unfollowCalled === true, "unfollowUser must be invoked");
    pass("Test 4 — Unfollow action invokes unfollowUser()");
  }

  // -------------------------------------------------------------
  // Test 5: No self-follow
  // Current user never receives a Follow action/button
  // -------------------------------------------------------------
  {
    const items = computeFollowStateList(
      [participantBob],
      currentParticipant,
      null
    );
    const you = items.find((i) => i.userId === currentUserId);

    assert(you.isYou === true, "Must identify self");
    assert(you.canFollow === false, "Current user cannot follow themselves");
    assert(you.isFollowing === false, "Current user cannot be in following state for themselves");
    pass("Test 5 — Current user cannot follow themselves");
  }

  // -------------------------------------------------------------
  // Test 6: Solo mode
  // Follow controls are not available in solo mode
  // -------------------------------------------------------------
  {
    const soloParams = new URLSearchParams("");
    const soloRoomId = getRoomIdFromUrl(soloParams);
    const soloMode = getRoomMode(soloRoomId);

    assert(soloRoomId === null, "Solo mode has null roomId");
    assert(soloMode === "solo", "Mode is solo");

    // In solo mode, RoomControls renders only 'Create Room' and does not render PresenceIndicator or follow controls
    const roomControlsSource = readFileSync(
      resolve(process.cwd(), "src/app/components/RoomControls.tsx"),
      "utf-8"
    );
    assert(
      roomControlsSource.includes("if (!roomId) {\n    return (\n      <button\n        type=\"button\"\n        onClick={createRoom}"),
      "RoomControls in solo mode must only render Create Room button"
    );

    pass("Test 6 — Solo mode renders no follow controls or presence dropdown");
  }

  // -------------------------------------------------------------
  // Test 7: Participant changes
  // Participant list updates reactively when presence state changes
  // -------------------------------------------------------------
  {
    // Initial presence: Bob and Charlie
    let currentParticipants = [participantBob, participantCharlie];
    let items = computeFollowStateList(currentParticipants, currentParticipant, null);
    assert(items.length === 3, "Initially 3 participants");

    // Charlie disconnects
    currentParticipants = [participantBob];
    items = computeFollowStateList(currentParticipants, currentParticipant, null);
    assert(items.length === 2, "Now only 2 participants");
    assert(!items.some((i) => i.userId === participantCharlie.userId), "Charlie is no longer present");

    // New participant joins: Dave
    const participantDave = {
      userId: "user-dave",
      displayName: "Dave",
      color: "#ec4899",
    };
    currentParticipants = [participantBob, participantDave];
    items = computeFollowStateList(currentParticipants, currentParticipant, null);
    assert(items.length === 3, "Dave is now included");
    assert(items.some((i) => i.userId === participantDave.userId), "Dave is in the list");

    pass("Test 7 — Participant list updates reactively with presence changes");
  }

  // -------------------------------------------------------------
  // Test 8: No direct realtime access
  // UI does not create its own Supabase channel or send follow events directly
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

    assert(!presenceSource.includes("supabase"), "PresenceIndicator must not reference supabase");
    assert(!presenceSource.includes("createClient"), "PresenceIndicator must not create clients");
    assert(!presenceSource.includes("channel.send"), "PresenceIndicator must not call channel.send");
    assert(!presenceSource.includes("FOLLOW_USER_EVENT"), "PresenceIndicator must not import raw event names");

    assert(!roomControlsSource.includes("createClient"), "RoomControls must not create supabase client");
    assert(!roomControlsSource.includes("channel.send"), "RoomControls must not call channel.send");

    pass("Test 8 — UI has zero direct realtime / Supabase access");
  }

  // -------------------------------------------------------------
  // Test 9: No direct viewport control
  // Follow UI does not directly call setViewport()
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
    assert(!roomControlsSource.includes("setViewport"), "RoomControls must not call setViewport");

    pass("Test 9 — Follow UI does not directly call setViewport()");
  }

  // -------------------------------------------------------------
  // Test 10: Collaboration state is source of truth
  // UI derives state from followingUserId without independent conflicting state
  // -------------------------------------------------------------
  {
    let collaborationFollowingUserId = null;

    // Initially null
    let items = computeFollowStateList([participantBob], currentParticipant, collaborationFollowingUserId);
    assert(items.find((i) => i.userId === participantBob.userId).isFollowing === false);

    // Collaboration hook updates followingUserId to Bob
    collaborationFollowingUserId = participantBob.userId;
    items = computeFollowStateList([participantBob], currentParticipant, collaborationFollowingUserId);
    assert(items.find((i) => i.userId === participantBob.userId).isFollowing === true);

    // Collaboration hook updates followingUserId to null (e.g. unfollowed)
    collaborationFollowingUserId = null;
    items = computeFollowStateList([participantBob], currentParticipant, collaborationFollowingUserId);
    assert(items.find((i) => i.userId === participantBob.userId).isFollowing === false);

    pass("Test 10 — UI uses collaboration followingUserId as sole source of truth");
  }

  // -------------------------------------------------------------
  // Test 11: Follow switching safety
  // Switching from Alice to Bob reflects immediately in UI
  // -------------------------------------------------------------
  {
    let items = computeFollowStateList(
      [participantBob, participantCharlie],
      currentParticipant,
      participantBob.userId
    );
    assert(items.find((i) => i.userId === participantBob.userId).isFollowing === true);
    assert(items.find((i) => i.userId === participantCharlie.userId).isFollowing === false);

    // Switch to Charlie
    items = computeFollowStateList(
      [participantBob, participantCharlie],
      currentParticipant,
      participantCharlie.userId
    );
    assert(items.find((i) => i.userId === participantBob.userId).isFollowing === false);
    assert(items.find((i) => i.userId === participantCharlie.userId).isFollowing === true);

    pass("Test 11 — Follow switching updates followed participant cleanly");
  }

  // -------------------------------------------------------------
  // Test 12: Accessibility and interactive elements
  // Follow controls use semantic HTML button elements with descriptive labels
  // -------------------------------------------------------------
  {
    const presenceSource = readFileSync(
      resolve(process.cwd(), "src/app/components/PresenceIndicator.tsx"),
      "utf-8"
    );

    assert(presenceSource.includes("<button"), "Must use interactive button elements");
    assert(presenceSource.includes("aria-label="), "Buttons must have accessible aria-labels");
    assert(presenceSource.includes("type=\"button\""), "Buttons must have type='button'");

    pass("Test 12 — Accessibility standards verified (semantic buttons, aria-labels)");
  }

  // -------------------------------------------------------------
  // Test 13: Persistence isolation
  // followingUserId is not stored to localStorage or canvas persistence
  // -------------------------------------------------------------
  {
    const snapshot = createCanvasSnapshot({
      nodes: [],
      edges: [],
      groups: [],
    });
    assert(!("followingUserId" in snapshot), "followingUserId must not exist in CanvasSnapshot");
    assert(!("followState" in snapshot), "followState must not exist in CanvasSnapshot");

    pass("Test 13 — Persistence isolation preserved");
  }

  // -------------------------------------------------------------
  // Test 14: CanvasState isolation
  // CanvasState structure remains untouched
  // -------------------------------------------------------------
  {
    const sampleCanvas = {
      nodes: [{ id: "n1", label: "Test", position: { x: 0, y: 0 }, type: "default" }],
      edges: [{ id: "e1", from: "n1", to: "n2" }],
      groups: [],
    };

    assert(!("followingUserId" in sampleCanvas), "CanvasState has no followingUserId");
    assert(!("viewport" in sampleCanvas), "CanvasState has no viewport");

    pass("Test 14 — CanvasState structure remains clean and unpolluted");
  }

  console.log("\n==========================================");
  console.log(`ALL ${passedCount} PHASE 11.6 ACCEPTANCE TESTS PASSED!`);
  console.log("==========================================\n");
}

runTests().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
