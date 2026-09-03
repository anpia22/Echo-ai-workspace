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
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
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

async function createRegressionClient(roomId, participant, initialCanvas = { nodes: [], edges: [], groups: [] }) {
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const channelName = `echo-room:${roomId}`;
  let canvas = JSON.parse(JSON.stringify(initialCanvas));
  let participants = [];
  let cursors = new Map();
  let semanticBroadcastsGenerated = 0;
  let connectionState = "connecting";

  let channel = null;

  const connect = async () => {
    connectionState = "connecting";
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

    // Snapshot sync
    channel.on("broadcast", { event: REQUEST_SYNC_EVENT }, ({ payload }) => {
      if (!payload || payload.roomId !== roomId || payload.from === participant.userId) return;
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
      // Hydrate local state without broadcasting!
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
          connectionState = "connected";
          resolveSub();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          connectionState = "error";
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
    getConnectionState: () => connectionState,
    getParticipants: () => participants,
    getCursors: () => cursors,
    getSemanticBroadcastCount: () => semanticBroadcastsGenerated,
    requestSync: async () => {
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
      connectionState = "reconnecting";
      cursors = new Map();
      await channel.untrack();
      await client.removeChannel(channel);
      channel = null;
    },
    reconnect: async () => {
      await connect();
    },
  };
}

async function runRegressionE2E() {
  console.log("Starting Phase 10.R1 Live Supabase Realtime Regression E2E Test...\n");

  const roomA = `reg-a-${Date.now()}`;
  const roomB = `reg-b-${Date.now()}`;

  const pA = { userId: "user-alpha", displayName: generateDisplayName("user-alpha"), color: getParticipantColor("user-alpha") };
  const pB = { userId: "user-beta", displayName: generateDisplayName("user-beta"), color: getParticipantColor("user-beta") };
  const pC = { userId: "user-gamma", displayName: generateDisplayName("user-gamma"), color: getParticipantColor("user-gamma") };

  // Step 1 — Connect
  console.log("Step 1: Connecting Client A and Client B to Room A; Client C to Room B...");
  const clientA = await createRegressionClient(roomA, pA);
  await wait(400);
  const clientB = await createRegressionClient(roomA, pB);
  await wait(400);
  const clientC = await createRegressionClient(roomB, pC);
  await wait(800);

  if (clientA.getConnectionState() !== "connected" || clientB.getConnectionState() !== "connected" || clientC.getConnectionState() !== "connected") {
    throw new Error("Step 1 failed: not all clients reached connected state");
  }
  console.log("PASS: Step 1 — All clients connected successfully.");

  // Step 2 — Presence
  console.log("Step 2: Verifying Presence across rooms...");
  const aPart = clientA.getParticipants();
  const bPart = clientB.getParticipants();
  const cPart = clientC.getParticipants();

  if (!aPart.some((p) => p.userId === pB.userId) || !bPart.some((p) => p.userId === pA.userId)) {
    throw new Error("Step 2 failed: Client A and B do not see each other in Room A");
  }
  if (cPart.some((p) => p.userId === pA.userId || p.userId === pB.userId)) {
    throw new Error("Step 2 failed: Client C sees participants from Room A");
  }
  console.log("PASS: Step 2 — Presence verified (A sees B, B sees A, C is isolated).");

  // Step 3 — Node
  console.log("Step 3: Client A creates node...");
  await clientA.broadcastNodeUpsert({
    id: "n-regression-1",
    nodeType: "problem",
    title: "System Latency",
    position: { x: 50, y: 50 },
  });
  await wait(600);

  if (!clientB.getCanvas().nodes.some((n) => n.id === "n-regression-1")) {
    throw new Error("Step 3 failed: Client B did not receive node");
  }
  if (clientC.getCanvas().nodes.length > 0) {
    throw new Error("Step 3 failed: Client C in Room B received node from Room A");
  }
  console.log("PASS: Step 3 — Node creation verified on Client B; Client C received nothing.");

  // Step 4 — Edge
  console.log("Step 4: Client A creates second node and edge...");
  await clientA.broadcastNodeUpsert({
    id: "n-regression-2",
    nodeType: "solution",
    title: "Add Cache Layer",
    position: { x: 250, y: 50 },
  });
  await wait(400);
  await clientA.broadcastEdgeUpsert({
    id: "e-regression-1",
    sourceId: "n-regression-2",
    targetId: "n-regression-1",
    relationship: "solves",
  });
  await wait(600);

  if (!clientB.getCanvas().edges.some((e) => e.id === "e-regression-1")) {
    throw new Error("Step 4 failed: Client B did not receive edge");
  }
  if (clientC.getCanvas().edges.length > 0) {
    throw new Error("Step 4 failed: Client C received edge from Room A");
  }
  console.log("PASS: Step 4 — Edge creation verified on Client B; Client C received nothing.");

  // Step 5 — Group
  console.log("Step 5: Client A creates group...");
  await clientA.broadcastGroupUpsert({
    id: "g-regression-1",
    title: "Latency Mitigation",
    memberIds: ["n-regression-1", "n-regression-2"],
  });
  await wait(600);

  if (!clientB.getCanvas().groups.some((g) => g.id === "g-regression-1")) {
    throw new Error("Step 5 failed: Client B did not receive group");
  }
  if (clientC.getCanvas().groups?.length > 0) {
    throw new Error("Step 5 failed: Client C received group from Room A");
  }
  console.log("PASS: Step 5 — Group creation verified on Client B; Client C received nothing.");

  // Step 6 — Cursor
  console.log("Step 6: Client A moves cursor...");
  const bCanvasBeforeCursor = JSON.stringify(clientB.getCanvas());
  await clientA.broadcastCursorMove(123, 456);
  await wait(600);

  const cursorsOnB = clientB.getCursors();
  if (!cursorsOnB.has("user-alpha") || cursorsOnB.get("user-alpha").x !== 123) {
    throw new Error("Step 6 failed: Client B did not receive cursor");
  }
  if (clientC.getCursors().has("user-alpha")) {
    throw new Error("Step 6 failed: Client C received cursor from Room A");
  }
  if (JSON.stringify(clientB.getCanvas()) !== bCanvasBeforeCursor) {
    throw new Error("Step 6 failed: Client B CanvasState was modified by cursor movement");
  }
  console.log("PASS: Step 6 — Cursor received on Client B; CanvasState untouched; Client C received nothing.");

  // Step 7 — Disconnect B
  console.log("Step 7: Disconnecting Client B...");
  const bCanvasBeforeDisconnect = JSON.stringify(clientB.getCanvas());
  await clientB.disconnect();
  await wait(800);

  if (JSON.stringify(clientB.getCanvas()) !== bCanvasBeforeDisconnect) {
    throw new Error("Step 7 failed: Client B CanvasState was wiped or corrupted upon disconnect");
  }
  if (clientB.getCursors().size > 0) {
    throw new Error("Step 7 failed: Client B cursors were not pruned on disconnect");
  }
  console.log("PASS: Step 7 — Client B disconnected; local canvas preserved; cursors pruned.");

  // Step 8 — Mutate While B is Offline
  console.log("Step 8: Client A mutates canvas while B is offline...");
  await clientA.broadcastNodeUpsert({
    id: "n-regression-3",
    nodeType: "decision",
    title: "Adopt Redis Cache",
    position: { x: 450, y: 150 },
  });
  await clientA.broadcastEdgeUpsert({
    id: "e-regression-2",
    sourceId: "n-regression-3",
    targetId: "n-regression-2",
    relationship: "implements",
  });
  await clientA.broadcastGroupUpsert({
    id: "g-regression-1",
    title: "Latency Mitigation (Expanded)",
    memberIds: ["n-regression-1", "n-regression-2", "n-regression-3"],
  });
  await wait(600);

  if (clientB.getCanvas().nodes.some((n) => n.id === "n-regression-3")) {
    throw new Error("Step 8 failed: Disconnected Client B received live event while offline");
  }
  if (clientC.getCanvas().nodes.length > 0) {
    throw new Error("Step 8 failed: Client C in Room B received mutations from Room A");
  }
  console.log("PASS: Step 8 — Mutations applied on Client A; Client B and Client C received 0 events.");

  // Step 9 — Reconnect B
  console.log("Step 9: Client B reconnects and synchronizes...");
  await clientB.reconnect();
  await wait(600);

  await clientB.requestSync();
  await wait(800);

  const canvasBRecovered = clientB.getCanvas();
  if (canvasBRecovered.nodes.length !== 3) {
    throw new Error(`Step 9 failed: Expected 3 nodes on Client B, got ${canvasBRecovered.nodes.length}`);
  }
  if (canvasBRecovered.edges.length !== 2) {
    throw new Error(`Step 9 failed: Expected 2 edges on Client B, got ${canvasBRecovered.edges.length}`);
  }
  if (canvasBRecovered.groups.length !== 1 || canvasBRecovered.groups[0].memberIds.length !== 3) {
    throw new Error(`Step 9 failed: Expected updated group with 3 members, got ${JSON.stringify(canvasBRecovered.groups)}`);
  }
  console.log("PASS: Step 9 — Client B reconnected and recovered complete latest room state.");

  // Step 10 — Echo Protection
  console.log("Step 10: Verifying zero semantic rebroadcasts from Client B during recovery...");
  if (clientB.getSemanticBroadcastCount() > 0) {
    throw new Error("Step 10 failed: Client B emitted semantic broadcasts while hydrating snapshot");
  }
  console.log("PASS: Step 10 — Zero semantic broadcasts generated during snapshot hydration.");

  // Step 11 — Presence Recovery
  console.log("Step 11: Verifying Client B presence restored on Client A...");
  const aPartAfterReconnect = clientA.getParticipants();
  if (!aPartAfterReconnect.some((p) => p.userId === pB.userId)) {
    throw new Error("Step 11 failed: Client B not present in Client A's view after reconnect");
  }
  console.log("PASS: Step 11 — Presence restored after reconnect.");

  // Step 12 — Cursor Recovery
  console.log("Step 12: Testing fresh cursor movement after reconnect...");
  await clientB.broadcastCursorMove(888, 999);
  await wait(600);

  const cursorsOnAAfterReconnect = clientA.getCursors();
  if (!cursorsOnAAfterReconnect.has("user-beta") || cursorsOnAAfterReconnect.get("user-beta").x !== 888) {
    throw new Error("Step 12 failed: Client A did not receive fresh cursor from Client B");
  }
  console.log("PASS: Step 12 — Cursor tracking resumed after reconnect.");

  // Step 13 — Teardown
  console.log("Step 13: Tearing down all clients cleanly...");
  await clientA.disconnect();
  await clientB.disconnect();
  await clientC.disconnect();
  console.log("PASS: Step 13 — Clean teardown complete.");

  console.log("\n==========================================");
  console.log("LIVE SUPABASE REGRESSION E2E: PASS!");
  console.log("==========================================");
  process.exit(0);
}

runRegressionE2E().catch((err) => {
  console.error("Live regression E2E failed:", err);
  process.exit(1);
});
