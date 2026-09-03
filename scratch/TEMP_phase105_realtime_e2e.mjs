import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  applyRemoteNodeEvent,
  parseNodeCollaborationEvent,
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
  throw new Error("missing supabase env");
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

  for (const event of ["NODE_UPSERT", "NODE_DELETED", "NODE_MOVED", "REQUEST_SYNC", "SYNC_STATE"]) {
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

const node = {
  id: "live-node-abc",
  nodeType: "problem",
  title: "Poor lead quality is a problem",
  position: { x: 12, y: 34 },
};

async function run() {
  const roomA = `phase105-a-${Date.now()}`;
  const roomB = `phase105-b-${Date.now()}`;

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
  let bBroadcasts = 0;
  let canvasB = { nodes: [], edges: [], groups: [] };

  const channelA = await subscribe(clientA, `echo-room:${roomA}`, {});
  const channelB = await subscribe(clientB, `echo-room:${roomA}`, {
    onEvent: (event, payload) => {
      eventsB.push({ event, payload });
      const parsed = parseNodeCollaborationEvent(payload);
      if (!parsed || parsed.roomId !== roomA || parsed.senderId === "participant-b") {
        return;
      }
      canvasB = applyRemoteNodeEvent(canvasB, parsed);
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

  await sendFromA("NODE_UPSERT", { type: "NODE_UPSERT", node });
  await wait(400);
  await sendFromA("NODE_UPSERT", { type: "NODE_UPSERT", node });
  await wait(400);
  await sendFromA("NODE_UPSERT", {
    type: "NODE_UPSERT",
    node: { ...node, title: "Lead quality problem" },
  });
  await wait(400);
  await sendFromA("NODE_MOVED", {
    type: "NODE_MOVED",
    nodeId: node.id,
    position: { x: 80, y: 90 },
  });
  await wait(400);
  await sendFromA("NODE_UPSERT", { type: "NODE_UPSERT" });
  await sendFromA("NODE_MOVED", { type: "NODE_MOVED", nodeId: node.id });
  await sendFromA("NODE_DELETED", { type: "NODE_DELETED" });
  await wait(400);
  await sendFromA("NODE_DELETED", { type: "NODE_DELETED", nodeId: node.id });
  await wait(400);
  await sendFromA("NODE_DELETED", { type: "NODE_DELETED", nodeId: node.id });
  await wait(400);

  const nodeEventsFromA = eventsB.filter(
    (item) =>
      item.payload?.senderId === "participant-a" &&
      ["NODE_UPSERT", "NODE_DELETED", "NODE_MOVED"].includes(item.event)
  );
  const rebroadcasts = eventsB.filter(
    (item) => item.payload?.senderId === "participant-b"
  );

  const result = {
    receivedByB: nodeEventsFromA.map((item) => item.event),
    finalNodeCount: canvasB.nodes.length,
    isolated: eventsC.length === 0,
    noEchoLoop: rebroadcasts.length === 0 && bBroadcasts === 0,
    malformedIgnored: canvasB.nodes.length === 0,
  };

  console.log(JSON.stringify(result, null, 2));

  await clientA.removeChannel(channelA);
  await clientB.removeChannel(channelB);
  await clientC.removeChannel(channelC);

  if (
    !result.isolated ||
    !result.noEchoLoop ||
    result.finalNodeCount !== 0 ||
    !result.receivedByB.includes("NODE_UPSERT") ||
    !result.receivedByB.includes("NODE_MOVED") ||
    !result.receivedByB.includes("NODE_DELETED")
  ) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
