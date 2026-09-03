import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  applyRemoteEdgeEvent,
  parseEdgeCollaborationEvent,
  EDGE_UPSERT_EVENT,
  EDGE_DELETED_EVENT,
} from "../src/app/lib/collaboration/edgeEvents.ts";
import {
  applyRemoteGroupEvent,
  parseGroupCollaborationEvent,
  GROUP_UPSERT_EVENT,
  GROUP_DELETED_EVENT,
} from "../src/app/lib/collaboration/groupEvents.ts";
import {
  applyRemoteNodeEvent,
  parseNodeCollaborationEvent,
  NODE_UPSERT_EVENT,
} from "../src/app/lib/collaboration/nodeEvents.ts";

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
  throw new Error("Missing Supabase env vars in .env.local");
}

function wait(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

async function subscribe(client, channelName, handlers) {
  const channel = client.channel(channelName, {
    config: {
      broadcast: { ack: false, self: false },
    },
  });

  for (const event of [
    "NODE_UPSERT",
    "NODE_DELETED",
    "NODE_MOVED",
    "EDGE_UPSERT",
    "EDGE_DELETED",
    "GROUP_UPSERT",
    "GROUP_DELETED",
    "REQUEST_SYNC",
    "SYNC_STATE",
  ]) {
    channel.on("broadcast", { event }, ({ payload }) => {
      handlers.onEvent?.(event, payload);
    });
  }

  await new Promise((resolveSub, rejectSub) => {
    channel.subscribe((status, error) => {
      if (status === "SUBSCRIBED") {
        resolveSub();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        rejectSub(error || new Error(status));
      }
    });
  });

  return channel;
}

const node1 = {
  id: "live-node-1",
  nodeType: "problem",
  title: "High API Error Rate",
  position: { x: 10, y: 20 },
};

const node2 = {
  id: "live-node-2",
  nodeType: "solution",
  title: "Rate Limit Client",
  position: { x: 150, y: 120 },
};

const edge1 = {
  id: "live-edge-1",
  sourceId: "live-node-1",
  targetId: "live-node-2",
  relationship: "solves",
};

const group1 = {
  id: "live-group-1",
  title: "API Stability",
  memberIds: ["live-node-1", "live-node-2"],
};

async function run() {
  console.log("Starting Phase 10.6 Real-time Supabase E2E Test...");

  const roomA = `phase106-a-${Date.now()}`;
  const roomB = `phase106-b-${Date.now()}`;

  const clientA = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const clientB = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const clientC = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const eventsB = [];
  const eventsC = [];
  let canvasB = { nodes: [], edges: [], groups: [] };

  const channelA = await subscribe(clientA, `echo-room:${roomA}`, {});
  const channelB = await subscribe(clientB, `echo-room:${roomA}`, {
    onEvent: (event, payload) => {
      eventsB.push({ event, payload });

      // Handle remote events as done in useRoomChannel & page.tsx:
      if (payload?.roomId !== roomA || payload?.senderId === "participant-b") {
        return;
      }

      if (event === NODE_UPSERT_EVENT) {
        const parsed = parseNodeCollaborationEvent(payload);
        if (parsed) canvasB = applyRemoteNodeEvent(canvasB, parsed);
      } else if (event === EDGE_UPSERT_EVENT || event === EDGE_DELETED_EVENT) {
        const parsed = parseEdgeCollaborationEvent(payload);
        if (parsed) canvasB = applyRemoteEdgeEvent(canvasB, parsed);
      } else if (event === GROUP_UPSERT_EVENT || event === GROUP_DELETED_EVENT) {
        const parsed = parseGroupCollaborationEvent(payload);
        if (parsed) canvasB = applyRemoteGroupEvent(canvasB, parsed);
      }
    },
  });

  const channelC = await subscribe(clientC, `echo-room:${roomB}`, {
    onEvent: (event, payload) => {
      eventsC.push({ event, payload });
    },
  });

  const sendFromA = (event, payload) =>
    channelA.send({
      type: "broadcast",
      event,
      payload: { ...payload, roomId: roomA, senderId: "participant-a" },
    });

  // 1. Send initial nodes (so edges and groups have dependencies)
  await sendFromA(NODE_UPSERT_EVENT, { type: NODE_UPSERT_EVENT, node: node1 });
  await wait(300);
  await sendFromA(NODE_UPSERT_EVENT, { type: NODE_UPSERT_EVENT, node: node2 });
  await wait(300);

  // 2. Send EDGE_UPSERT
  await sendFromA(EDGE_UPSERT_EVENT, { type: EDGE_UPSERT_EVENT, edge: edge1 });
  await wait(300);

  // 3. Send duplicate EDGE_UPSERT
  await sendFromA(EDGE_UPSERT_EVENT, { type: EDGE_UPSERT_EVENT, edge: edge1 });
  await wait(300);

  // 4. Send updated EDGE_UPSERT
  await sendFromA(EDGE_UPSERT_EVENT, {
    type: EDGE_UPSERT_EVENT,
    edge: { ...edge1, relationship: "supports" },
  });
  await wait(300);

  // 5. Send GROUP_UPSERT
  await sendFromA(GROUP_UPSERT_EVENT, { type: GROUP_UPSERT_EVENT, group: group1 });
  await wait(300);

  // 6. Send duplicate GROUP_UPSERT
  await sendFromA(GROUP_UPSERT_EVENT, { type: GROUP_UPSERT_EVENT, group: group1 });
  await wait(300);

  // 7. Send malformed edge/group events
  await sendFromA(EDGE_UPSERT_EVENT, { type: EDGE_UPSERT_EVENT, edge: { id: "bad" } });
  await sendFromA(GROUP_UPSERT_EVENT, { type: GROUP_UPSERT_EVENT, group: { id: "bad" } });
  await wait(300);

  // 8. Send EDGE_DELETED
  await sendFromA(EDGE_DELETED_EVENT, { type: EDGE_DELETED_EVENT, edgeId: edge1.id });
  await wait(300);

  // 9. Send GROUP_DELETED
  await sendFromA(GROUP_DELETED_EVENT, { type: GROUP_DELETED_EVENT, groupId: group1.id });
  await wait(400);

  // Clean up
  await clientA.removeChannel(channelA);
  await clientB.removeChannel(channelB);
  await clientC.removeChannel(channelC);

  const edgeUpserts = eventsB.filter((e) => e.event === EDGE_UPSERT_EVENT);
  const edgeDeletes = eventsB.filter((e) => e.event === EDGE_DELETED_EVENT);
  const groupUpserts = eventsB.filter((e) => e.event === GROUP_UPSERT_EVENT);
  const groupDeletes = eventsB.filter((e) => e.event === GROUP_DELETED_EVENT);
  const bBroadcasts = eventsB.filter((e) => e.payload?.senderId === "participant-b");

  console.log("Realtime Results:");
  console.log(`- Edge upsert events received: ${edgeUpserts.length}`);
  console.log(`- Edge delete events received: ${edgeDeletes.length}`);
  console.log(`- Group upsert events received: ${groupUpserts.length}`);
  console.log(`- Group delete events received: ${groupDeletes.length}`);
  console.log(`- Client B rebroadcast count: ${bBroadcasts.length} (Expected: 0)`);
  console.log(`- Client C (room-B) event count: ${eventsC.length} (Expected: 0)`);
  console.log(`- Final Canvas B edges: ${canvasB.edges.length} (Expected: 0 after delete)`);
  console.log(`- Final Canvas B groups: ${canvasB.groups.length} (Expected: 0 after delete)`);

  if (bBroadcasts.length !== 0) {
    throw new Error("Client B rebroadcast detected!");
  }

  if (eventsC.length !== 0) {
    throw new Error("Room isolation breached! Room C received events.");
  }

  if (canvasB.edges.length !== 0 || canvasB.groups.length !== 0) {
    throw new Error("Canvas state was not properly updated on delete.");
  }

  console.log("\nREALTIME LIVE SUPABASE E2E: PASS!");
}

run().catch((err) => {
  console.error("Realtime test failed:", err);
  process.exit(1);
});
