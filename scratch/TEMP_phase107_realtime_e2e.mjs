import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

async function createPresenceClient(roomId, participant) {
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const channelName = `echo-room:${roomId}`;
  let currentParticipants = [];

  const channel = client.channel(channelName, {
    config: {
      broadcast: { ack: false, self: false },
      presence: { key: participant.userId },
    },
  });

  const updatePresence = () => {
    const raw = channel.presenceState();
    currentParticipants = parsePresenceState(raw);
  };

  channel.on("presence", { event: "sync" }, updatePresence);
  channel.on("presence", { event: "join" }, updatePresence);
  channel.on("presence", { event: "leave" }, updatePresence);

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
    getParticipants: () => currentParticipants,
    leave: async () => {
      await channel.untrack();
      await client.removeChannel(channel);
    },
  };
}

async function run() {
  console.log("Starting Phase 10.7 Live Supabase Presence E2E Test...");

  const roomA = `presence-test-a-${Date.now()}`;
  const roomB = `presence-test-b-${Date.now()}`;

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
  const pD = {
    userId: "user-delta",
    displayName: generateDisplayName("user-delta"),
    color: getParticipantColor("user-delta"),
  };

  // 1. Client A joins roomA
  console.log("Client A joining roomA...");
  const clientA = await createPresenceClient(roomA, pA);
  await wait(600);

  console.log(`Client A sees ${clientA.getParticipants().length} participants in roomA.`);

  // 2. Client B joins roomA
  console.log("Client B joining roomA...");
  const clientB = await createPresenceClient(roomA, pB);
  await wait(800);

  const aParticipantsAfterB = clientA.getParticipants();
  const bParticipants = clientB.getParticipants();
  console.log(`Client A sees: ${aParticipantsAfterB.map((p) => p.displayName).join(", ")} (count: ${aParticipantsAfterB.length})`);
  console.log(`Client B sees: ${bParticipants.map((p) => p.displayName).join(", ")} (count: ${bParticipants.length})`);

  if (aParticipantsAfterB.length < 2 || bParticipants.length < 2) {
    throw new Error(`Expected 2 participants in roomA, got A: ${aParticipantsAfterB.length}, B: ${bParticipants.length}`);
  }

  // 3. Client C joins roomB (isolation check)
  console.log("Client C joining roomB (isolated room)...");
  const clientC = await createPresenceClient(roomB, pC);
  await wait(800);

  const cParticipants = clientC.getParticipants();
  console.log(`Client C in roomB sees count: ${cParticipants.length} (${cParticipants.map((p) => p.displayName).join(", ")})`);

  const hasLeakInA = clientA.getParticipants().some((p) => p.userId === pC.userId);
  const hasLeakInC = cParticipants.some((p) => p.userId === pA.userId || p.userId === pB.userId);

  if (hasLeakInA || hasLeakInC) {
    throw new Error("Room isolation breached! Client C leaked into roomA or vice versa.");
  }
  console.log("Room isolation confirmed between roomA and roomB.");

  // 4. Client D joins roomA (3 participants in roomA)
  console.log("Client D joining roomA (testing 3 clients)...");
  const clientD = await createPresenceClient(roomA, pD);
  await wait(800);

  const roomACountWithD = clientA.getParticipants().length;
  console.log(`Room A participant count with D: ${roomACountWithD}`);
  if (roomACountWithD < 3) {
    throw new Error(`Expected 3 participants in roomA, got ${roomACountWithD}`);
  }

  // 5. Client D leaves roomA
  console.log("Client D leaving roomA (testing leave detection)...");
  await clientD.leave();
  await wait(800);

  const roomACountAfterDLeave = clientA.getParticipants().length;
  console.log(`Room A participant count after D left: ${roomACountAfterDLeave}`);
  if (roomACountAfterDLeave !== 2) {
    throw new Error(`Expected 2 participants in roomA after D left, got ${roomACountAfterDLeave}`);
  }

  // Cleanup remaining clients
  await clientA.leave();
  await clientB.leave();
  await clientC.leave();

  console.log("\n==========================================");
  console.log("LIVE SUPABASE PRESENCE E2E: PASS!");
  console.log("==========================================");
  process.exit(0);
}

run().catch((err) => {
  console.error("Live presence test failed:", err);
  process.exit(1);
});
