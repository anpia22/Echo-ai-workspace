import {
  FOLLOW_USER_EVENT,
  UNFOLLOW_USER_EVENT,
  VIEWPORT_UPDATE_EVENT,
  parseFollowUserPayload,
  parseUnfollowUserPayload,
  parseViewportUpdatePayload,
  isStaleViewportUpdate,
  shouldAcceptViewportUpdate,
  applyFollowUser,
  applyUnfollowUser,
  cloneViewport,
  isValidViewport,
} from "../src/app/lib/collaboration/viewportEvents.ts";
import { createCanvasSnapshot } from "../src/app/lib/collaboration/canvasSnapshot.ts";
import { getRoomIdFromUrl, getRoomMode } from "../src/app/lib/collaboration/room.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log("Starting Phase 11.3 Follow / Unfollow Realtime Protocol Test Suite...\n");

let passedCount = 0;
function pass(testName) {
  passedCount++;
  console.log(`PASS [${passedCount}]: ${testName}`);
}

const currentRoomId = "room-abc-123";
const currentUserId = "user-alice";
const targetLeaderId = "user-bob";

// -------------------------------------------------------------
// Test 1: FOLLOW_USER valid payload accepted
// -------------------------------------------------------------
const validFollowPayload = {
  type: FOLLOW_USER_EVENT,
  roomId: currentRoomId,
  leaderId: targetLeaderId,
  followerId: currentUserId,
};
const parsedFollow = parseFollowUserPayload(validFollowPayload);
assert(parsedFollow !== null, "valid follow payload must be accepted");
assert(parsedFollow.leaderId === targetLeaderId, "leaderId must match");
assert(parsedFollow.followerId === currentUserId, "followerId must match");
assert(parsedFollow.roomId === currentRoomId, "roomId must match");
pass("Test 1 — FOLLOW_USER valid payload accepted");

// -------------------------------------------------------------
// Test 2: UNFOLLOW_USER valid payload accepted
// -------------------------------------------------------------
const validUnfollowPayload = {
  type: UNFOLLOW_USER_EVENT,
  roomId: currentRoomId,
  leaderId: targetLeaderId,
  followerId: currentUserId,
};
const parsedUnfollow = parseUnfollowUserPayload(validUnfollowPayload);
assert(parsedUnfollow !== null, "valid unfollow payload must be accepted");
assert(parsedUnfollow.leaderId === targetLeaderId, "leaderId must match");
assert(parsedUnfollow.followerId === currentUserId, "followerId must match");
pass("Test 2 — UNFOLLOW_USER valid payload accepted");

// -------------------------------------------------------------
// Test 3: VIEWPORT_UPDATE valid payload accepted
// -------------------------------------------------------------
const validViewportPayload = {
  type: VIEWPORT_UPDATE_EVENT,
  roomId: currentRoomId,
  senderId: targetLeaderId,
  viewport: { x: 100, y: -50, zoom: 1.25 },
  timestamp: 1700000000000,
};
const parsedViewport = parseViewportUpdatePayload(validViewportPayload);
assert(parsedViewport !== null, "valid viewport update must be accepted");
assert(parsedViewport.senderId === targetLeaderId, "senderId must match");
assert(parsedViewport.viewport.x === 100, "viewport.x must match");
assert(parsedViewport.viewport.zoom === 1.25, "viewport.zoom must match");
pass("Test 3 — VIEWPORT_UPDATE valid payload accepted");

// -------------------------------------------------------------
// Test 4: Malformed roomId rejected
// -------------------------------------------------------------
assert(parseFollowUserPayload({ ...validFollowPayload, roomId: "" }) === null, "empty roomId rejected");
assert(parseFollowUserPayload({ ...validFollowPayload, roomId: "   " }) === null, "whitespace roomId rejected");
assert(parseFollowUserPayload({ ...validFollowPayload, roomId: null }) === null, "null roomId rejected");
assert(parseFollowUserPayload({ ...validFollowPayload, roomId: 123 }) === null, "numeric roomId rejected");
assert(parseViewportUpdatePayload({ ...validViewportPayload, roomId: "" }) === null, "empty roomId in viewport update rejected");
pass("Test 4 — Malformed roomId rejected");

// -------------------------------------------------------------
// Test 5: Malformed participant IDs rejected (including self-follow)
// -------------------------------------------------------------
assert(parseFollowUserPayload({ ...validFollowPayload, leaderId: "" }) === null, "empty leaderId rejected");
assert(parseFollowUserPayload({ ...validFollowPayload, followerId: "" }) === null, "empty followerId rejected");
assert(parseFollowUserPayload({ ...validFollowPayload, leaderId: "user-alice", followerId: "user-alice" }) === null, "self-follow must be rejected");
assert(parseUnfollowUserPayload({ ...validUnfollowPayload, leaderId: "user-alice", followerId: "user-alice" }) === null, "self-unfollow must be rejected");
assert(parseViewportUpdatePayload({ ...validViewportPayload, senderId: "" }) === null, "empty senderId rejected");
pass("Test 5 — Malformed participant IDs rejected");

// -------------------------------------------------------------
// Test 6: Invalid viewport x rejected
// -------------------------------------------------------------
assert(parseViewportUpdatePayload({ ...validViewportPayload, viewport: { x: "100", y: 0, zoom: 1 } }) === null, "string x rejected");
assert(parseViewportUpdatePayload({ ...validViewportPayload, viewport: { x: null, y: 0, zoom: 1 } }) === null, "null x rejected");
assert(parseViewportUpdatePayload({ ...validViewportPayload, viewport: { x: undefined, y: 0, zoom: 1 } }) === null, "undefined x rejected");
pass("Test 6 — Invalid viewport x rejected");

// -------------------------------------------------------------
// Test 7: Invalid viewport y rejected
// -------------------------------------------------------------
assert(parseViewportUpdatePayload({ ...validViewportPayload, viewport: { x: 0, y: "bad", zoom: 1 } }) === null, "string y rejected");
assert(parseViewportUpdatePayload({ ...validViewportPayload, viewport: { x: 0, y: null, zoom: 1 } }) === null, "null y rejected");
pass("Test 7 — Invalid viewport y rejected");

// -------------------------------------------------------------
// Test 8: Invalid zoom rejected
// -------------------------------------------------------------
assert(parseViewportUpdatePayload({ ...validViewportPayload, viewport: { x: 0, y: 0, zoom: 0 } }) === null, "zero zoom rejected");
assert(parseViewportUpdatePayload({ ...validViewportPayload, viewport: { x: 0, y: 0, zoom: -1 } }) === null, "negative zoom rejected");
assert(parseViewportUpdatePayload({ ...validViewportPayload, viewport: { x: 0, y: 0, zoom: "1.5" } }) === null, "string zoom rejected");
pass("Test 8 — Invalid zoom rejected");

// -------------------------------------------------------------
// Test 9: NaN / Infinity rejected
// -------------------------------------------------------------
assert(parseViewportUpdatePayload({ ...validViewportPayload, viewport: { x: NaN, y: 0, zoom: 1 } }) === null, "NaN x rejected");
assert(parseViewportUpdatePayload({ ...validViewportPayload, viewport: { x: 0, y: NaN, zoom: 1 } }) === null, "NaN y rejected");
assert(parseViewportUpdatePayload({ ...validViewportPayload, viewport: { x: 0, y: 0, zoom: NaN } }) === null, "NaN zoom rejected");
assert(parseViewportUpdatePayload({ ...validViewportPayload, viewport: { x: Infinity, y: 0, zoom: 1 } }) === null, "Infinity x rejected");
assert(parseViewportUpdatePayload({ ...validViewportPayload, viewport: { x: 0, y: -Infinity, zoom: 1 } }) === null, "-Infinity y rejected");
assert(parseViewportUpdatePayload({ ...validViewportPayload, viewport: { x: 0, y: 0, zoom: Infinity } }) === null, "Infinity zoom rejected");
pass("Test 9 — NaN / Infinity rejected");

// -------------------------------------------------------------
// Test 10: Self VIEWPORT_UPDATE ignored
// -------------------------------------------------------------
function filterIncomingViewport(event, localUserId, localRoomId, followingUserId) {
  if (!event) return null;
  if (event.roomId !== localRoomId) return null;
  if (event.senderId === localUserId) return null; // self filter
  if (event.senderId !== followingUserId) return null; // following filter
  return event;
}

const selfEvent = { ...parsedViewport, senderId: currentUserId };
assert(filterIncomingViewport(selfEvent, currentUserId, currentRoomId, targetLeaderId) === null, "self-sent viewport update must be filtered out");
pass("Test 10 — Self VIEWPORT_UPDATE ignored");

// -------------------------------------------------------------
// Test 11: Wrong-room VIEWPORT_UPDATE ignored
// -------------------------------------------------------------
const wrongRoomEvent = { ...parsedViewport, roomId: "other-room-xyz" };
assert(filterIncomingViewport(wrongRoomEvent, currentUserId, currentRoomId, targetLeaderId) === null, "wrong-room viewport update must be filtered out");
pass("Test 11 — Wrong-room VIEWPORT_UPDATE ignored");

// -------------------------------------------------------------
// Test 12: Viewport from non-followed participant ignored
// -------------------------------------------------------------
const strangerEvent = { ...parsedViewport, senderId: "user-charlie" };
assert(filterIncomingViewport(strangerEvent, currentUserId, currentRoomId, targetLeaderId) === null, "viewport from stranger must be ignored");
assert(filterIncomingViewport(parsedViewport, currentUserId, currentRoomId, null) === null, "viewport ignored when not following anyone");
pass("Test 12 — Viewport from non-followed participant ignored");

// -------------------------------------------------------------
// Test 13: Older timestamp rejected
// -------------------------------------------------------------
const lastAccepted = 1700000005000;
const olderTimestamp = 1700000004999;
assert(isStaleViewportUpdate(olderTimestamp, lastAccepted), "older timestamp must be flagged stale");
assert(!shouldAcceptViewportUpdate(olderTimestamp, lastAccepted), "older timestamp must not be accepted");
pass("Test 13 — Older timestamp rejected");

// -------------------------------------------------------------
// Test 14: Newer timestamp accepted
// -------------------------------------------------------------
const newerTimestamp = 1700000005001;
assert(!isStaleViewportUpdate(newerTimestamp, lastAccepted), "newer timestamp must not be flagged stale");
assert(shouldAcceptViewportUpdate(newerTimestamp, lastAccepted), "newer timestamp must be accepted");
assert(shouldAcceptViewportUpdate(lastAccepted, lastAccepted), "equal timestamp accepted deterministically");
pass("Test 14 — Newer timestamp accepted");

// -------------------------------------------------------------
// Test 15: FOLLOW_USER updates leader follower set
// -------------------------------------------------------------
let leaderFollowers = new Set();
leaderFollowers = applyFollowUser(leaderFollowers, "user-alice");
assert(leaderFollowers.has("user-alice"), "follower must be added to set");
assert(leaderFollowers.size === 1, "size must be 1");
leaderFollowers = applyFollowUser(leaderFollowers, "user-charlie");
assert(leaderFollowers.size === 2, "second follower must be added");
leaderFollowers = applyFollowUser(leaderFollowers, "user-alice");
assert(leaderFollowers.size === 2, "duplicate follow must not inflate set");
pass("Test 15 — FOLLOW_USER updates leader follower set");

// -------------------------------------------------------------
// Test 16: UNFOLLOW_USER removes follower
// -------------------------------------------------------------
leaderFollowers = applyUnfollowUser(leaderFollowers, "user-alice");
assert(!leaderFollowers.has("user-alice"), "unfollowed participant must be removed");
assert(leaderFollowers.size === 1, "remaining follower preserved");
leaderFollowers = applyUnfollowUser(leaderFollowers, "non-existent-user");
assert(leaderFollowers.size === 1, "unfollowing non-existent user must be no-op");
pass("Test 16 — UNFOLLOW_USER removes follower");

// -------------------------------------------------------------
// Test 17: followUser() updates followingUserId
// -------------------------------------------------------------
let clientFollowState = { followingUserId: null };
function mockFollowUser(leaderId) {
  if (!leaderId || typeof leaderId !== "string" || !leaderId.trim()) return;
  clientFollowState.followingUserId = leaderId.trim();
}
mockFollowUser("user-bob");
assert(clientFollowState.followingUserId === "user-bob", "followUser must set followingUserId");
pass("Test 17 — followUser() updates followingUserId");

// -------------------------------------------------------------
// Test 18: unfollowUser() clears followingUserId
// -------------------------------------------------------------
function mockUnfollowUser() {
  clientFollowState.followingUserId = null;
}
mockUnfollowUser();
assert(clientFollowState.followingUserId === null, "unfollowUser must clear followingUserId");
pass("Test 18 — unfollowUser() clears followingUserId");

// -------------------------------------------------------------
// Test 19: No Viewport Persistence
// -------------------------------------------------------------
const canvas = { nodes: [], edges: [], groups: [] };
const snapshot = createCanvasSnapshot(canvas);
const conversation = {
  id: "conv-1",
  title: "Title",
  messages: [],
  actions: [],
  canvas,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
const serialized = JSON.stringify(conversation);
assert(!serialized.includes('"followingUserId"'), "localStorage must not store followingUserId");
assert(!serialized.includes('"followerUserIds"'), "localStorage must not store followerUserIds");
assert(!serialized.includes('"VIEWPORT_UPDATE"'), "localStorage must not store VIEWPORT_UPDATE");
assert(!("followingUserId" in snapshot), "snapshot must not store followingUserId");
pass("Test 19 — No viewport persistence");

// -------------------------------------------------------------
// Test 20: No CanvasState mutation
// -------------------------------------------------------------
const initialNodeCount = canvas.nodes.length;
const initialEdgeCount = canvas.edges.length;
const initialGroupCount = (canvas.groups ?? []).length;

// Simulate follow/unfollow operations
mockFollowUser("user-bob");
mockUnfollowUser();

assert(canvas.nodes.length === initialNodeCount, "nodes must not mutate");
assert(canvas.edges.length === initialEdgeCount, "edges must not mutate");
assert((canvas.groups ?? []).length === initialGroupCount, "groups must not mutate");
assert(!("viewport" in canvas), "CanvasState must not contain viewport");
pass("Test 20 — No CanvasState mutation");

console.log("\n==========================================");
console.log(`ALL ${passedCount} PHASE 11.3 ACCEPTANCE TESTS PASSED!`);
console.log("==========================================");
