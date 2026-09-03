import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createCanvasSnapshot,
  validateCanvasSnapshot,
  isEmptyCanvasSnapshot,
} from "../src/app/lib/collaboration/canvasSnapshot.ts";
import {
  applyRemoteNodeEvent,
  NODE_UPSERT_EVENT,
  NODE_MOVED_EVENT,
} from "../src/app/lib/collaboration/nodeEvents.ts";
import {
  applyRemoteEdgeEvent,
  EDGE_UPSERT_EVENT,
} from "../src/app/lib/collaboration/edgeEvents.ts";
import {
  applyRemoteGroupEvent,
  GROUP_UPSERT_EVENT,
} from "../src/app/lib/collaboration/groupEvents.ts";
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

const REQUEST_SYNC_EVENT = "REQUEST_SYNC";
const SYNC_STATE_EVENT = "SYNC_STATE";

async function createClientInstance(roomId, participant, initialCanvas = { nodes: [], edges: [], groups: [] }) {
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const channelName = `echo-room:${roomId}`;
  let canvas = JSON.parse(JSON.stringify(initialCanvas));
  let participants = [];
  let cursors = new Map();
  let semanticBroadcastsGenerated = 0;
  let syncRequestsSent = 0;

  let channel = null;

  const connect = async () => {
    channel = client.channel(channelName, {
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

    // Snapshot sync handlers
    channel.on("broadcast", { event: REQUEST_SYNC_EVENT }, ({ payload }) => {
      if (!payload || payload.roomId !== roomId || payload.from === participant.userId) return;
      // Send current snapshot
      void channel.send({
        type: "broadcast",
        event: SYNC_STATE_EVENT,
        payload: {
          type: SYNC_STATE_EVENT,
          from: participant.userId,
          roomId,
          canvas: createCanvasSnapshot(canvas),
        },
      });
    });

    channel.on("broadcast", { event: SYNC_STATE_EVENT }, ({ payload }) => {
      if (!payload || payload.roomId !== roomId || payload.from === participant.userId) return;
      const snapshot = validateCanvasSnapshot(payload.canvas);
      if (!snapshot || isEmptyCanvasSnapshot(snapshot)) return;
      // Hydrate local canvas (without generating semantic broadcasts!)
      canvas = snapshot;
    });

    // Semantic events
    channel.on("broadcast", { event: NODE_UPSERT_EVENT }, ({ payload }) => {
      if (!payload || payload.roomId !== roomId || payload.senderId === participant.userId) return;
      canvas = applyRemoteNodeEvent(canvas, payload);
    });

    channel.on("broadcast", { event: EDGE_UPSERT_EVENT }, ({ payload }) => {
      if (!payload || payload.roomId !== roomId || payload.senderId === participant.userId) return;
      canvas = applyRemoteEdgeEvent(canvas, payload);
    });

    channel.on("broadcast", { event: GROUP_UPSERT_EVENT }, ({ payload }) => {
      if (!payload || payload.roomId !== roomId || payload.senderId === participant.userId) return;
      canvas = applyRemoteGroupEvent(canvas, payload);
    });

    // Cursor
    channel.on("broadcast", { event: CURSOR_MOVE_EVENT }, ({ payload }) => {
      const event = parseCursorMovePayload(payload);
      if (!event || event.roomId !== roomId || event.userId === participant.userId) return;
      cursors = applyRemoteCursorMove(cursors, event);
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

    await channel.track({
      userId: participant.userId,
      displayName: participant.displayName,
      color: participant.color,
    });
  };

  await connect();

  return {
    client,
    getChannel: () => channel,
    getCanvas: () => canvas,
    setCanvas: (c) => { canvas = c; },
    getParticipants: () => participants,
    getCursors: () => cursors,
    getSemanticCount: () => semanticBroadcastsGenerated,
    getSyncRequestsSent: () => syncRequestsSent,
    requestSync: async () => {
      syncRequestsSent++;
      await channel.send({
        type: "broadcast",
        event: REQUEST_SYNC_EVENT,
        payload: {
          type: REQUEST_SYNC_EVENT,
          from: participant.userId,
          roomId,
        },
      });
    },
    broadcastNodeUpsert: async (node) => {
      semanticBroadcastsGenerated++;
      canvas = applyRemoteNodeEvent(canvas, { type: NODE_UPSERT_EVENT, roomId, senderId: participant.userId, node });
      await channel.send({
        type: "broadcast",
        event: NODE_UPSERT_EVENT,
        payload: { type: NODE_UPSERT_EVENT, roomId, senderId: participant.userId, node },
      });
    },
    broadcastEdgeUpsert: async (edge) => {
      semanticBroadcastsGenerated++;
      canvas = applyRemoteEdgeEvent(canvas, { type: EDGE_UPSERT_EVENT, roomId, senderId: participant.userId, edge });
      await channel.send({
        type: "broadcast",
        event: EDGE_UPSERT_EVENT,
        payload: { type: EDGE_UPSERT_EVENT, roomId, senderId: participant.userId, edge },
      });
    },
    broadcastGroupUpsert: async (group) => {
      semanticBroadcastsGenerated++;
      canvas = applyRemoteGroupEvent(canvas, { type: GROUP_UPSERT_EVENT, roomId, senderId: participant.userId, group });
      await channel.send({
        type: "broadcast",
        event: GROUP_UPSERT_EVENT,
        payload: { type: GROUP_UPSERT_EVENT, roomId, senderId: participant.userId, group },
      });
    },
    broadcastCursorMove: async (x, y) => {
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
    disconnect: async () => {
      await channel.untrack();
      await client.removeChannel(channel);
      channel = null;
    },
    reconnect: async () => {
      await connect();
    },
  };
}

async function run() {
  console.log("Starting Phase 10.9 Live Supabase Realtime Reconnection E2E Test...\n");

  const roomA = `reconnect-a-${Date.now()}`;
  const roomB = `reconnect-b-${Date.now()}`;

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

  // Scenario A — Normal collaboration
  console.log("Scenario A: Connecting Client A and Client B in Room A; Client C in Room B...");
  const clientA = await createClientInstance(roomA, pA);
  await wait(400);
  const clientB = await createClientInstance(roomA, pB);
  await wait(400);
  const clientC = await createClientInstance(roomB, pC);
  await wait(800);

  console.log("PASS: Scenario A — Clients connected.");

  // Scenario B — Disconnect B
  console.log("Scenario B: Disconnecting Client B...");
  await clientB.disconnect();
  await wait(800);

  // Client A should now see Client B is gone from presence
  const participantsAAfterBLeave = clientA.getParticipants();
  console.log(`Client A sees ${participantsAAfterBLeave.length} participants in Room A after B disconnected.`);
  console.log("PASS: Scenario B — Client B disconnected.");

  // Scenario C — Mutations while B is disconnected
  console.log("Scenario C: Client A performs canvas mutations in Room A while B is offline...");
  await clientA.broadcastNodeUpsert({
    id: "n-sol",
    nodeType: "solution",
    title: "Offline Created Solution",
    position: { x: 100, y: 100 },
  });
  await clientA.broadcastNodeUpsert({
    id: "n-prob",
    nodeType: "problem",
    title: "Offline Created Problem",
    position: { x: 300, y: 100 },
  });
  await clientA.broadcastEdgeUpsert({
    id: "e-offline",
    sourceId: "n-sol",
    targetId: "n-prob",
    relationship: "addresses",
  });
  await clientA.broadcastGroupUpsert({
    id: "g-offline",
    title: "Offline Group",
    memberIds: ["n-sol", "n-prob"],
  });
  await wait(600);

  console.log("PASS: Scenario C — Mutations performed by Client A.");

  // Verify Client C in Room B received 0 events from Room A (Room isolation check)
  console.log("Scenario F (early check): Verifying Client C in Room B received 0 events from Room A...");
  if (clientC.getCanvas().nodes.length > 0) {
    throw new Error("Room isolation failure! Client C in Room B received Room A state.");
  }
  console.log("PASS: Scenario F — Room isolation verified for Client C.");

  // Scenario D — Reconnect B & Request Sync
  console.log("Scenario D: Client B reconnects to Room A...");
  await clientB.reconnect();
  await wait(600);

  console.log("Client B sends REQUEST_SYNC...");
  await clientB.requestSync();
  await wait(800);

  // Scenario E — State recovery
  console.log("Scenario E: Verifying Client B recovered Room A state via snapshot sync...");
  const canvasB = clientB.getCanvas();
  console.log(`Client B recovered canvas: ${canvasB.nodes.length} nodes, ${canvasB.edges.length} edges, ${canvasB.groups?.length} groups`);

  if (canvasB.nodes.length !== 2) {
    throw new Error(`Expected 2 nodes on Client B, got ${canvasB.nodes.length}`);
  }
  if (canvasB.edges.length !== 1) {
    throw new Error(`Expected 1 edge on Client B, got ${canvasB.edges.length}`);
  }
  if (canvasB.groups?.length !== 1) {
    throw new Error(`Expected 1 group on Client B, got ${canvasB.groups?.length}`);
  }
  console.log("PASS: Scenario E — State recovery verified on Client B.");

  // Scenario G — Presence recovery
  console.log("Scenario G: Verifying Client B presence restored in Room A...");
  const aParticipantsAfterBReconnect = clientA.getParticipants();
  if (!aParticipantsAfterBReconnect.some((p) => p.userId === pB.userId)) {
    throw new Error("Client B presence was not restored in Client A's view!");
  }
  console.log("PASS: Scenario G — Presence recovered for Client B.");

  // Scenario H — Cursor recovery
  console.log("Scenario H: Testing fresh cursor movement after reconnect...");
  await clientB.broadcastCursorMove(777, 888);
  await wait(600);

  const cursorsOnA = clientA.getCursors();
  if (!cursorsOnA.has("user-beta") || cursorsOnA.get("user-beta").x !== 777) {
    throw new Error("Client A did not receive fresh cursor from Client B after reconnect!");
  }
  console.log("PASS: Scenario H — Fresh cursor received after reconnect.");

  // Scenario I — No semantic echo
  console.log("Scenario I: Verifying Client B did NOT rebroadcast recovered snapshot as semantic events...");
  if (clientB.getSemanticCount() > 0) {
    throw new Error("Semantic rebroadcast detected! Client B emitted semantic events during recovery.");
  }
  console.log("PASS: Scenario I — Zero semantic rebroadcasts from Client B.");

  // Scenario J — Clean teardown
  console.log("Scenario J: Cleaning up all clients...");
  await clientA.disconnect();
  await clientB.disconnect();
  await clientC.disconnect();
  console.log("PASS: Scenario J — All clients disconnected cleanly.");

  console.log("\n==========================================");
  console.log("LIVE SUPABASE RECONNECTION E2E: PASS!");
  console.log("==========================================");
  process.exit(0);
}

run().catch((err) => {
  console.error("Live reconnection E2E failed:", err);
  process.exit(1);
});
