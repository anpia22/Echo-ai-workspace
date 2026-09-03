import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CURSOR_MOVE_EVENT,
  parseCursorMovePayload,
  applyRemoteCursorMove,
  pruneDisconnectedCursors,
} from "../src/app/lib/collaboration/cursorEvents.ts";
import { parsePresenceState } from "../src/app/lib/collaboration/presence.ts";
import {
  getParticipantColor,
  generateDisplayName,
} from "../src/app/lib/collaboration/participant.ts";

function loadEnvLocal() {
  const text = readFileSync(resolve(".env.local"), "utf8");
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      continue;
    }
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return env;
}

const env = loadEnvLocal();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error("Missing Supabase credentials in .env.local");
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function createCollaborationClient(roomId, participant) {
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const channelName = `echo-room:${roomId}`;
  let participants = [];
  let cursors = new Map();
  let semanticBroadcastsReceived = 0;

  const channel = client.channel(channelName, {
    config: {
      broadcast: { ack: false, self: false },
      presence: { key: participant.userId },
    },
  });

  const updatePresence = () => {
    const raw = channel.presenceState();
    participants = parsePresenceState(raw);
    const activeIds = new Set(participants.map((p) => p.userId));
    cursors = pruneDisconnectedCursors(cursors, activeIds);
  };

  channel.on("presence", { event: "sync" }, updatePresence);
  channel.on("presence", { event: "join" }, updatePresence);
  channel.on("presence", { event: "leave" }, updatePresence);

  channel.on("broadcast", { event: CURSOR_MOVE_EVENT }, ({ payload }) => {
    const event = parseCursorMovePayload(payload);
    if (!event) return;
    if (event.roomId !== roomId || event.userId === participant.userId) return;
    cursors = applyRemoteCursorMove(cursors, event);
  });

  // Track if any semantic events are received
  const countSemantic = () => { semanticBroadcastsReceived++; };
  channel.on("broadcast", { event: "NODE_UPSERT" }, countSemantic);
  channel.on("broadcast", { event: "NODE_DELETED" }, countSemantic);
  channel.on("broadcast", { event: "NODE_MOVED" }, countSemantic);
  channel.on("broadcast", { event: "EDGE_UPSERT" }, countSemantic);
  channel.on("broadcast", { event: "EDGE_DELETED" }, countSemantic);
  channel.on("broadcast", { event: "GROUP_UPSERT" }, countSemantic);
  channel.on("broadcast", { event: "GROUP_DELETED" }, countSemantic);

  await new Promise((resolveSub, rejectSub) => {
    channel.subscribe((status, error) => {
      if (status === "SUBSCRIBED") {
        resolveSub();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        rejectSub(error || new Error(status));
      }
    });
  });

  await channel.track({
    userId: participant.userId,
    displayName: participant.displayName,
    color: participant.color,
  });

  return {
    client,
    channel,
    getParticipants: () => participants,
    getCursors: () => cursors,
    getSemanticCount: () => semanticBroadcastsReceived,
    moveCursor: async (x, y) => {
      await channel.send({
        type: "broadcast",
        event: CURSOR_MOVE_EVENT,
        payload: {
          type: CURSOR_MOVE_EVENT,
          roomId,
          userId: participant.userId,
          senderId: participant.userId,
          x,
          y,
          timestamp: Date.now(),
        },
      });
    },
    leave: async () => {
      await channel.untrack();
      await client.removeChannel(channel);
    },
  };
}

async function run() {
  console.log("Starting Phase 10.8 Live Supabase Realtime Cursor E2E Test...\n");

  const roomA = `cursor-room-a-${Date.now()}`;
  const roomB = `cursor-room-b-${Date.now()}`;

  const pA = {
    userId: "user-alpha",
    displayName: generateDisplayName("user-alpha"),
    color: getParticipantColor("user-alpha"),
  };
  const pB = {
    userId: "user-beta",
    displayName: generateDisplayName("user-beta"),
    color: getParticipantColor("user-beta"),
  };
  const pC = {
    userId: "user-gamma",
    displayName: generateDisplayName("user-gamma"),
    color: getParticipantColor("user-gamma"),
  };

  console.log("1. Connecting Client A to roomA...");
  const clientA = await createCollaborationClient(roomA, pA);
  await wait(500);

  console.log("2. Connecting Client B to roomA...");
  const clientB = await createCollaborationClient(roomA, pB);
  await wait(800);

  console.log("3. Connecting Client C to roomB (isolated room)...");
  const clientC = await createCollaborationClient(roomB, pC);
  await wait(800);

  // Step 1: Move Client A's cursor in roomA
  console.log("4. Client A moves cursor to (150, 250)...");
  await clientA.moveCursor(150, 250);
  await wait(600);

  const cursorsOnB = clientB.getCursors();
  const cursorsOnC = clientC.getCursors();

  if (!cursorsOnB.has("user-alpha")) {
    throw new Error("Client B did not receive Client A's cursor in roomA!");
  }
  const cursorAOnB = cursorsOnB.get("user-alpha");
  if (cursorAOnB.x !== 150 || cursorAOnB.y !== 250) {
    throw new Error(`Client B received wrong coordinates: ${cursorAOnB.x}, ${cursorAOnB.y}`);
  }
  console.log(`PASS: Client B received Client A's cursor at (${cursorAOnB.x}, ${cursorAOnB.y})`);

  if (cursorsOnC.has("user-alpha")) {
    throw new Error("Room isolation failure! Client C in roomB received Client A's cursor!");
  }
  console.log("PASS: Client C in roomB did not receive Client A's cursor (Room isolation verified)");

  // Step 2: Move Client B's cursor in roomA
  console.log("5. Client B moves cursor to (320, 480)...");
  await clientB.moveCursor(320, 480);
  await wait(600);

  const cursorsOnA = clientA.getCursors();
  if (!cursorsOnA.has("user-beta")) {
    throw new Error("Client A did not receive Client B's cursor in roomA!");
  }
  const cursorBOnA = cursorsOnA.get("user-beta");
  if (cursorBOnA.x !== 320 || cursorBOnA.y !== 480) {
    throw new Error(`Client A received wrong coordinates: ${cursorBOnA.x}, ${cursorBOnA.y}`);
  }
  console.log(`PASS: Client A received Client B's cursor at (${cursorBOnA.x}, ${cursorBOnA.y})`);

  if (clientC.getCursors().has("user-beta")) {
    throw new Error("Room isolation failure! Client C in roomB received Client B's cursor!");
  }
  console.log("PASS: Client C in roomB did not receive Client B's cursor (Room isolation verified)");

  // Step 3: Client A leaves roomA
  console.log("6. Client A leaves roomA...");
  await clientA.leave();
  await wait(800);

  const cursorsOnBAfterLeave = clientB.getCursors();
  if (cursorsOnBAfterLeave.has("user-alpha")) {
    throw new Error("Client A's cursor was not pruned from Client B after leaving!");
  }
  console.log("PASS: Client A's cursor was pruned from Client B after leaving");

  // Step 4: Verify zero semantic events were triggered by cursor moves
  console.log("7. Verifying zero semantic collaboration events were generated...");
  if (clientB.getSemanticCount() > 0 || clientC.getSemanticCount() > 0) {
    throw new Error("Semantic collaboration events were erroneously broadcasted during cursor operations!");
  }
  console.log("PASS: Zero semantic broadcasts generated during cursor operations");

  // Cleanup
  await clientB.leave();
  await clientC.leave();

  console.log("\n==========================================");
  console.log("LIVE SUPABASE CURSOR E2E: PASS!");
  console.log("==========================================");
  process.exit(0);
}

run().catch((err) => {
  console.error("Live cursor E2E failed:", err);
  process.exit(1);
});
