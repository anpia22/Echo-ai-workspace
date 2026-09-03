import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

const canvasA = {
  nodes: [
    {
      id: "id-sales",
      nodeType: "problem",
      title: "Sales performance is getting worse",
      position: { x: 0, y: 0 },
    },
    {
      id: "id-leads",
      nodeType: "problem",
      title: "Poor lead quality is one reason",
      position: { x: 0, y: 160 },
    },
  ],
  edges: [
    {
      id: "id-edge",
      sourceId: "id-sales",
      targetId: "id-leads",
      relationship: "causes",
    },
  ],
  groups: [],
};

function wait(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

async function subscribe(client, channelName, handlers) {
  const channel = client.channel(channelName, {
    config: {
      broadcast: { ack: false, self: false },
    },
  });

  channel.on("broadcast", { event: "REQUEST_SYNC" }, ({ payload }) => {
    handlers.onRequest?.(payload);
  });
  channel.on("broadcast", { event: "SYNC_STATE" }, ({ payload }) => {
    handlers.onSync?.(payload);
  });

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

async function run() {
  const roomA = `phase104-a-${Date.now()}`;
  const roomB = `phase104-b-${Date.now()}`;

  const clientA = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const clientB = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const clientC = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let receivedByB = null;
  let receivedByC = null;
  let requestsSeenByA = 0;

  const channelA = await subscribe(clientA, `echo-room:${roomA}`, {
    onRequest: (payload) => {
      if (payload.from === "participant-a") {
        return;
      }
      requestsSeenByA += 1;
      void channelA.send({
        type: "broadcast",
        event: "SYNC_STATE",
        payload: {
          type: "SYNC_STATE",
          from: "participant-a",
          roomId: roomA,
          canvas: canvasA,
        },
      });
    },
  });

  const channelB = await subscribe(clientB, `echo-room:${roomA}`, {
    onSync: (payload) => {
      if (payload.from === "participant-b") {
        return;
      }
      receivedByB = payload;
    },
  });

  const channelC = await subscribe(clientC, `echo-room:${roomB}`, {
    onSync: (payload) => {
      receivedByC = payload;
    },
  });

  await channelB.send({
    type: "broadcast",
    event: "REQUEST_SYNC",
    payload: {
      type: "REQUEST_SYNC",
      from: "participant-b",
      roomId: roomA,
    },
  });

  await wait(1500);

  const sameRoom =
    receivedByB?.canvas?.nodes?.[0]?.id === "id-sales" &&
    receivedByB?.canvas?.nodes?.[1]?.id === "id-leads";
  const isolated = receivedByC === null;

  await clientA.removeChannel(channelA);
  await clientB.removeChannel(channelB);
  await clientC.removeChannel(channelC);
  await clientA.removeAllChannels();
  await clientB.removeAllChannels();
  await clientC.removeAllChannels();

  const result = {
    sameRoom,
    isolated,
    requestsSeenByA,
    ids: receivedByB?.canvas?.nodes?.map((node) => node.id) ?? [],
  };

  console.log(JSON.stringify(result, null, 2));

  if (!sameRoom || !isolated || requestsSeenByA < 1) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
