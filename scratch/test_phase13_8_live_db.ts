/**
 * Phase 13.8 — Live Database Verification Suite
 *
 * Tests against live PostgreSQL / Supabase Docker instance:
 * 1. Workspace creation & membership (owner vs viewer)
 * 2. Room creation with server-authoritative timestamps
 * 3. Room idempotency (same roomId in same workspace)
 * 4. Cross-workspace collision rejection (same roomId in different workspace)
 * 5. Role authorization: Viewer read-only (GET allowed, POST/PATCH 403)
 * 6. Concurrency & row lock: concurrent closeRoom calls serialize safely
 * 7. Async recovery: closeRoom on unstarted/dropped room creates directly in closed status
 * 8. Composite FK enforcement: (workspace_id, room_id) must match
 * 9. API route integration: POST/GET/PATCH with server-authoritative identity & timestamps
 */

import { getServerSupabaseClient } from "../src/app/lib/persistence/server/db";
import { RoomRepository } from "../src/app/lib/persistence/repositories/roomRepository";
import { WorkspaceRepository } from "../src/app/lib/persistence/repositories/workspaceRepository";
import { createActor } from "../src/app/lib/persistence/server/auth";
import { PersistenceError } from "../src/app/lib/persistence/server/errors";
import { POST as postRooms, GET as getRooms } from "../src/app/api/workspace/[workspaceId]/rooms/route";
import { GET as getRoomById, PATCH as patchRoomById } from "../src/app/api/workspace/[workspaceId]/rooms/[roomId]/route";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`[Live DB Assertion Failed] ${msg}`);
  }
}

async function runLiveDbTests() {
  console.log("=================================================================");
  console.log("PHASE 13.8 — Live Database Verification");
  console.log("=================================================================\n");

  const supabase = getServerSupabaseClient();
  const roomRepo = new RoomRepository(supabase);
  const wsRepo = new WorkspaceRepository(supabase);

  const testWsIdA = "88888888-8888-8888-8888-888888888881";
  const testWsIdB = "88888888-8888-8888-8888-888888888882";
  const aliceUserId = "user-13-8-alice";
  const bobUserId = "user-13-8-bob";
  const eveViewerId = "user-13-8-eve-viewer";

  const aliceOwner = createActor(aliceUserId);
  const bobOwner = createActor(bobUserId);
  const eveViewer = {
    userId: eveViewerId,
  };

  try {
    // 0. Pre-cleanup
    console.log("0. Cleaning up prior test records...");
    await supabase.from("workspaces").delete().in("id", [testWsIdA, testWsIdB]);
    console.log("✔ Pre-cleanup complete\n");

    // 1. Setup Workspaces
    console.log("1. Setting up workspaces...");
    await wsRepo.createWorkspace(aliceOwner, {
      id: testWsIdA,
      title: "Phase 13.8 Workspace A",
    });
    // Add Eve as viewer to Workspace A
    await supabase.from("workspace_members").insert({
      workspace_id: testWsIdA,
      user_id: eveViewerId,
      display_name: "Eve Viewer",
      role: "viewer",
      color: "#94a3b8",
    });

    await wsRepo.createWorkspace(bobOwner, {
      id: testWsIdB,
      title: "Phase 13.8 Workspace B",
    });
    console.log("✔ Workspaces and members initialized\n");

    // 2. Create Room in Workspace A
    console.log("2. Creating active room with server-authoritative timestamps...");
    const roomId1 = "room-13-8-001";
    const createResult = await roomRepo.createRoom(aliceOwner, {
      roomId: roomId1,
      workspaceId: testWsIdA,
      title: "Architecture Planning Room",
      metadata: { purpose: "Phase 13.8 Persistence" },
    });

    assert(createResult.room.id === roomId1, "Room ID must match");
    assert(createResult.room.workspaceId === testWsIdA, "Workspace ID must match");
    assert(createResult.room.title === "Architecture Planning Room", "Title must match");
    assert(createResult.room.status === "active", "Initial status must be active");
    assert(createResult.room.createdBy === aliceUserId, "Created by must match authoritative actor");
    assert(createResult.room.createdAt !== null, "createdAt must be set by DB");
    assert(!createResult.room.closedAt, "closedAt must initially be undefined");
    console.log("✔ Room created actively:", createResult.room.id, "at", createResult.room.createdAt);

    // 3. Idempotency on createRoom (same roomId in same workspace)
    console.log("3. Testing idempotency: creating same room in same workspace...");
    const duplicateCreate = await roomRepo.createRoom(aliceOwner, {
      roomId: roomId1,
      workspaceId: testWsIdA,
      title: "Different Title Attempt",
    });
    assert(duplicateCreate.room.id === roomId1, "Idempotent return must match ID");
    assert(duplicateCreate.room.title === "Architecture Planning Room", "Idempotent return must preserve existing record");
    assert(duplicateCreate.room.createdAt === createResult.room.createdAt, "createdAt must not change");
    console.log("✔ Idempotent creation returns existing record safely\n");

    // 4. Cross-workspace collision rejection (same roomId in Workspace B)
    console.log("4. Testing cross-workspace collision rejection...");
    let conflictCaught = false;
    try {
      await roomRepo.createRoom(bobOwner, {
        roomId: roomId1,
        workspaceId: testWsIdB,
        title: "Bob Room Colliding",
      });
    } catch (err: any) {
      if (err instanceof PersistenceError && err.code === "CONFLICT") {
        conflictCaught = true;
      }
    }
    assert(conflictCaught, "Duplicate room ID across workspaces must be rejected with CONFLICT");
    console.log("✔ Cross-workspace room ID collision blocked with CONFLICT\n");

    // 5. Role Authorization Matrix
    console.log("5. Testing Role Authorization Matrix (Viewer read-only)...");
    let viewerCreateBlocked = false;
    try {
      await roomRepo.createRoom(eveViewer, {
        roomId: "room-viewer-blocked",
        workspaceId: testWsIdA,
      });
    } catch (err: any) {
      if (err instanceof PersistenceError && err.code === "FORBIDDEN") {
        viewerCreateBlocked = true;
      }
    }
    assert(viewerCreateBlocked, "Viewer must be blocked from creating rooms");

    let viewerCloseBlocked = false;
    try {
      await roomRepo.closeRoom(eveViewer, { roomId: roomId1 }, testWsIdA);
    } catch (err: any) {
      if (err instanceof PersistenceError && err.code === "FORBIDDEN") {
        viewerCloseBlocked = true;
      }
    }
    assert(viewerCloseBlocked, "Viewer must be blocked from closing rooms");

    // Viewer read operations: MUST SUCCEED
    const viewerGetRoom = await roomRepo.getRoom(eveViewer, testWsIdA, roomId1);
    assert(viewerGetRoom.id === roomId1, "Viewer must be able to read room record");

    const viewerHistory = await roomRepo.listRooms(eveViewer, testWsIdA);
    assert(viewerHistory.rooms.length >= 1, "Viewer must be able to list room history");
    console.log("✔ Role matrix verified: Viewer write blocked (403), viewer read permitted (200)\n");

    // 6. Concurrency & Row Locking on closeRoom
    console.log("6. Testing concurrent closeRoom calls with row-level locking...");
    const [closeResult1, closeResult2, closeResult3] = await Promise.all([
      roomRepo.closeRoom(aliceOwner, { roomId: roomId1, lastKnownState: { revision: 10 } }, testWsIdA),
      roomRepo.closeRoom(aliceOwner, { roomId: roomId1, lastKnownState: { revision: 10 } }, testWsIdA),
      roomRepo.closeRoom(aliceOwner, { roomId: roomId1, lastKnownState: { revision: 10 } }, testWsIdA),
    ]);

    assert(closeResult1.room.status === "closed", "Status must be closed");
    assert(closeResult2.room.status === "closed", "Status must be closed");
    assert(closeResult3.room.status === "closed", "Status must be closed");
    assert(closeResult1.room.closedAt !== null, "closedAt must be set");
    assert(
      closeResult1.room.closedAt === closeResult2.room.closedAt &&
      closeResult2.room.closedAt === closeResult3.room.closedAt,
      "All concurrent closes must resolve with identical server timestamp"
    );
    console.log("✔ Concurrency safe: serialized transitions to closed at", closeResult1.room.closedAt, "\n");

    // 7. Async Start Failure Recovery
    console.log("7. Testing Async Start Failure Recovery (room start was dropped)...");
    const droppedRoomId = "room-dropped-start-recovery";
    const recoverResult = await roomRepo.closeRoom(
      aliceOwner,
      { roomId: droppedRoomId, title: "Recovered Drop Session", lastKnownState: { nodeCount: 3 } },
      testWsIdA
    );

    assert(recoverResult.room.id === droppedRoomId, "Recovered room ID must match");
    assert(recoverResult.room.status === "closed", "Recovered room must be created in closed state");
    assert(recoverResult.room.title === "Recovered Drop Session", "Title must be preserved");
    assert(recoverResult.room.createdAt !== null, "createdAt must be set");
    assert(recoverResult.room.closedAt !== null, "closedAt must be set");

    // Verify it exists in DB query
    const verifiedInDb = await roomRepo.getRoom(aliceOwner, testWsIdA, droppedRoomId);
    assert(verifiedInDb.status === "closed", "DB must reflect recovered room record");
    console.log("✔ Dropped start successfully recovered directly in closed state\n");

    // 8. Composite Foreign Key Enforcement
    console.log("8. Testing composite FK enforcement on collaboration_room_participants...");
    let compositeFkRejected = false;
    try {
      // Attempt to insert participant with room from Workspace A but workspace_id = Workspace B!
      await supabase.from("collaboration_room_participants").insert({
        room_id: roomId1, // belongs to testWsIdA
        workspace_id: testWsIdB, // cross-workspace mismatch!
        user_id: bobUserId,
        display_name: "Bob Hacker",
      });
    } catch (err: any) {
      compositeFkRejected = true;
    }
    // Check error code via direct query if no thrown exception
    const { error: fkError } = await supabase.from("collaboration_room_participants").insert({
      room_id: roomId1,
      workspace_id: testWsIdB,
      user_id: bobUserId,
      display_name: "Bob Hacker",
    });
    assert(
      compositeFkRejected || (fkError !== null && fkError.code === "23503"),
      "Composite FK must reject mismatched (workspace_id, room_id)"
    );
    console.log("✔ Composite foreign key strictly enforced at database level\n");

    // 9. Next.js API Routes Verification
    console.log("9. Testing Next.js API Route Handlers...");
    const apiRoomId = "room-api-route-test";
    process.env.ECHO_DEV_USER_ID = aliceUserId;

    // 9a. POST /api/workspace/[workspaceId]/rooms with spoofing attempt
    console.log("9a. POST /api/workspace/[workspaceId]/rooms (stripping client spoofed fields)...");
    const fakeReqPost = new Request("http://localhost:3000/api/workspace/" + testWsIdA + "/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomId: apiRoomId,
        title: "API Route Collab Room",
        userId: "spoofed-hacker", // must be ignored
        createdAt: "1999-01-01T00:00:00Z", // must be ignored
        closedAt: "1999-01-01T00:00:00Z", // must be ignored
      }),
    });

    const postResponse = await postRooms(fakeReqPost, {
      params: Promise.resolve({ workspaceId: testWsIdA }),
    });

    assert(postResponse.status === 201, `POST status must be 201, got ${postResponse.status}`);
    const postJson = await postResponse.json();
    assert(postJson.ok === true, "POST response must be ok");
    assert(postJson.room.id === apiRoomId, "Room ID must match");
    assert(postJson.room.createdBy === aliceUserId, "Authoritative user ID must be used (not spoofed)");
    assert(postJson.room.createdAt !== "1999-01-01T00:00:00Z", "createdAt must be server-authoritative now()");
    assert(!postJson.room.closedAt, "closedAt must not be set from client");
    console.log("✔ Route POST: spoofed fields rejected, server-authoritative creation confirmed");

    // 9b. GET /api/workspace/[workspaceId]/rooms
    console.log("9b. GET /api/workspace/[workspaceId]/rooms...");
    const fakeReqGet = new Request("http://localhost:3000/api/workspace/" + testWsIdA + "/rooms", {
      method: "GET",
    });
    const getResponse = await getRooms(fakeReqGet, {
      params: Promise.resolve({ workspaceId: testWsIdA }),
    });
    assert(getResponse.status === 200, "GET status must be 200");
    const getJson = await getResponse.json();
    assert(getJson.ok === true && Array.isArray(getJson.rooms), "Rooms array must be returned");
    assert(getJson.rooms.some((r: any) => r.id === apiRoomId), "Created room must be in list");
    console.log("✔ Route GET: room list successfully returned");

    // 9c. PATCH /api/workspace/[workspaceId]/rooms/[roomId]
    console.log("9c. PATCH /api/workspace/[workspaceId]/rooms/[roomId] (closing room)...");
    const fakeReqPatch = new Request(
      `http://localhost:3000/api/workspace/${testWsIdA}/rooms/${apiRoomId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "closed",
          closedAt: "1999-01-01T00:00:00Z", // must be ignored!
        }),
      }
    );
    const patchResponse = await patchRoomById(fakeReqPatch, {
      params: Promise.resolve({ workspaceId: testWsIdA, roomId: apiRoomId }),
    });
    assert(patchResponse.status === 200, "PATCH status must be 200");
    const patchJson = await patchResponse.json();
    assert(patchJson.room.status === "closed", "Room status must be closed");
    assert(patchJson.room.closedAt !== "1999-01-01T00:00:00Z", "closedAt must be server-authoritative now()");
    console.log("✔ Route PATCH: room closed with server-authoritative timestamp");

    // 9d. Viewer PATCH must return 403
    console.log("9d. Viewer PATCH must return 403...");
    process.env.ECHO_DEV_USER_ID = eveViewerId;
    const fakeViewerPatch = new Request(
      `http://localhost:3000/api/workspace/${testWsIdA}/rooms/${apiRoomId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "closed" }),
      }
    );
    const viewerPatchResponse = await patchRoomById(fakeViewerPatch, {
      params: Promise.resolve({ workspaceId: testWsIdA, roomId: apiRoomId }),
    });
    assert(viewerPatchResponse.status === 403, `Viewer PATCH must return 403, got ${viewerPatchResponse.status}`);
    console.log("✔ Viewer PATCH route blocked with 403 Forbidden\n");

    // 10. Cleanup
    console.log("10. Cleaning up test workspaces...");
    await supabase.from("workspaces").delete().in("id", [testWsIdA, testWsIdB]);
    console.log("✔ Post-cleanup complete\n");

    console.log("=================================================================");
    console.log("PHASE 13.8 LIVE DATABASE VERIFICATION: ALL ASSERTIONS PASSED ✅");
    console.log("=================================================================");
  } catch (error) {
    console.error("\n❌ Live DB Verification FAILED:", error);
    try {
      await supabase.from("workspaces").delete().in("id", [testWsIdA, testWsIdB]);
    } catch {}
    process.exit(1);
  }
}

runLiveDbTests();
