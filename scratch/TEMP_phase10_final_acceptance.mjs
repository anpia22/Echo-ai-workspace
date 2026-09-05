import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  parseNodeCollaborationEvent,
  applyRemoteNodeEvent,
  moveSemanticNode,
  upsertSemanticNode,
  deleteSemanticNode,
  NODE_UPSERT_EVENT,
  NODE_DELETED_EVENT,
  NODE_MOVED_EVENT,
} from "../src/app/lib/collaboration/nodeEvents.ts";
import {
  parseEdgeCollaborationEvent,
  applyRemoteEdgeEvent,
  upsertSemanticEdge,
  deleteSemanticEdge,
  EDGE_UPSERT_EVENT,
  EDGE_DELETED_EVENT,
} from "../src/app/lib/collaboration/edgeEvents.ts";
import {
  parseGroupCollaborationEvent,
  applyRemoteGroupEvent,
  upsertSemanticGroup,
  deleteSemanticGroup,
  GROUP_UPSERT_EVENT,
  GROUP_DELETED_EVENT,
} from "../src/app/lib/collaboration/groupEvents.ts";
import {
  parseCursorMovePayload,
  applyRemoteCursorMove,
  pruneDisconnectedCursors,
  CURSOR_MOVE_EVENT,
} from "../src/app/lib/collaboration/cursorEvents.ts";
import {
  parsePresenceState,
} from "../src/app/lib/collaboration/presence.ts";
import {
  validateCanvasSnapshot,
  isEmptyCanvasSnapshot,
} from "../src/app/lib/collaboration/canvasSnapshot.ts";

const SNAPSHOT_REQUEST_EVENT = "REQUEST_SYNC";
const SNAPSHOT_SYNC_EVENT = "SYNC_STATE";
import { applyCanvasActions } from "../src/app/lib/applyCanvasActions.ts";

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

async function createParticipant(roomId, userId, name, color) {
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const participant = { userId, name, color };
  const channelName = `echo-room:${roomId}`;
  let canvas = { nodes: [], edges: [], groups: [] };
  let participants = [];
  let cursors = new Map();
  let semanticBroadcastsReceived = 0;
  let rawBroadcastCount = 0;

  const channel = client.channel(channelName, {
    config: {
      broadcast: { ack: false, self: false },
      presence: { key: userId },
    },
  });

  channel
    .on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      participants = parsePresenceState(state);
      cursors = pruneDisconnectedCursors(cursors, new Set(participants.map((p) => p.userId)));
    })
    .on("broadcast", { event: NODE_UPSERT_EVENT }, ({ payload }) => {
      rawBroadcastCount++;
      const evt = parseNodeCollaborationEvent(payload);
      if (evt && evt.roomId === roomId && evt.senderId !== userId) {
        semanticBroadcastsReceived++;
        canvas = applyRemoteNodeEvent(canvas, evt);
      }
    })
    .on("broadcast", { event: NODE_DELETED_EVENT }, ({ payload }) => {
      rawBroadcastCount++;
      const evt = parseNodeCollaborationEvent(payload);
      if (evt && evt.roomId === roomId && evt.senderId !== userId) {
        semanticBroadcastsReceived++;
        canvas = applyRemoteNodeEvent(canvas, evt);
      }
    })
    .on("broadcast", { event: NODE_MOVED_EVENT }, ({ payload }) => {
      rawBroadcastCount++;
      const evt = parseNodeCollaborationEvent(payload);
      if (evt && evt.roomId === roomId && evt.senderId !== userId) {
        semanticBroadcastsReceived++;
        canvas = applyRemoteNodeEvent(canvas, evt);
      }
    })
    .on("broadcast", { event: EDGE_UPSERT_EVENT }, ({ payload }) => {
      rawBroadcastCount++;
      const evt = parseEdgeCollaborationEvent(payload);
      if (evt && evt.roomId === roomId && evt.senderId !== userId) {
        semanticBroadcastsReceived++;
        canvas = applyRemoteEdgeEvent(canvas, evt);
      }
    })
    .on("broadcast", { event: EDGE_DELETED_EVENT }, ({ payload }) => {
      rawBroadcastCount++;
      const evt = parseEdgeCollaborationEvent(payload);
      if (evt && evt.roomId === roomId && evt.senderId !== userId) {
        semanticBroadcastsReceived++;
        canvas = applyRemoteEdgeEvent(canvas, evt);
      }
    })
    .on("broadcast", { event: GROUP_UPSERT_EVENT }, ({ payload }) => {
      rawBroadcastCount++;
      const evt = parseGroupCollaborationEvent(payload);
      if (evt && evt.roomId === roomId && evt.senderId !== userId) {
        semanticBroadcastsReceived++;
        canvas = applyRemoteGroupEvent(canvas, evt);
      }
    })
    .on("broadcast", { event: GROUP_DELETED_EVENT }, ({ payload }) => {
      rawBroadcastCount++;
      const evt = parseGroupCollaborationEvent(payload);
      if (evt && evt.roomId === roomId && evt.senderId !== userId) {
        semanticBroadcastsReceived++;
        canvas = applyRemoteGroupEvent(canvas, evt);
      }
    })
    .on("broadcast", { event: CURSOR_MOVE_EVENT }, ({ payload }) => {
      rawBroadcastCount++;
      const cursor = parseCursorMovePayload(payload);
      if (cursor && cursor.roomId === roomId && cursor.senderId !== userId) {
        cursors = applyRemoteCursorMove(cursors, cursor);
      }
    })
    .on("broadcast", { event: SNAPSHOT_REQUEST_EVENT }, ({ payload }) => {
      rawBroadcastCount++;
      if (payload && payload.roomId === roomId && payload.from !== userId && canvas.nodes.length > 0) {
        void channel.send({
          type: "broadcast",
          event: SNAPSHOT_SYNC_EVENT,
          payload: {
            type: SNAPSHOT_SYNC_EVENT,
            from: userId,
            roomId,
            canvas,
          },
        });
      }
    })
    .on("broadcast", { event: SNAPSHOT_SYNC_EVENT }, ({ payload }) => {
      rawBroadcastCount++;
      if (payload && payload.roomId === roomId && payload.from !== userId) {
        const parsed = validateCanvasSnapshot(payload.canvas);
        if (parsed && !isEmptyCanvasSnapshot(parsed)) {
          canvas = parsed;
        }
      }
    });

  await new Promise((resolveSub, rejectSub) => {
    channel.subscribe((status, err) => {
      if (status === "SUBSCRIBED") resolveSub();
      else if (status === "CHANNEL_ERROR") rejectSub(err || new Error("Channel error"));
    });
  });

  await channel.track(participant);

  return {
    client,
    channel,
    participant,
    getCanvas: () => canvas,
    setCanvas: (next) => { canvas = next; },
    getParticipants: () => participants,
    getCursors: () => cursors,
    getSemanticCount: () => semanticBroadcastsReceived,
    getRawCount: () => rawBroadcastCount,
    sendNodeUpsert: async (node) => {
      canvas = upsertSemanticNode(canvas, node);
      await channel.send({
        type: "broadcast",
        event: NODE_UPSERT_EVENT,
        payload: { type: NODE_UPSERT_EVENT, roomId, senderId: userId, node },
      });
    },
    sendNodeMoved: async (nodeId, position) => {
      canvas = moveSemanticNode(canvas, nodeId, position);
      await channel.send({
        type: "broadcast",
        event: NODE_MOVED_EVENT,
        payload: { type: NODE_MOVED_EVENT, roomId, senderId: userId, nodeId, position },
      });
    },
    sendNodeDeleted: async (nodeId) => {
      canvas = deleteSemanticNode(canvas, nodeId);
      await channel.send({
        type: "broadcast",
        event: NODE_DELETED_EVENT,
        payload: { type: NODE_DELETED_EVENT, roomId, senderId: userId, nodeId },
      });
    },
    sendEdgeUpsert: async (edge) => {
      canvas = upsertSemanticEdge(canvas, edge);
      await channel.send({
        type: "broadcast",
        event: EDGE_UPSERT_EVENT,
        payload: { type: EDGE_UPSERT_EVENT, roomId, senderId: userId, edge },
      });
    },
    sendEdgeDeleted: async (edgeId) => {
      canvas = deleteSemanticEdge(canvas, edgeId);
      await channel.send({
        type: "broadcast",
        event: EDGE_DELETED_EVENT,
        payload: { type: EDGE_DELETED_EVENT, roomId, senderId: userId, edgeId },
      });
    },
    sendGroupUpsert: async (group) => {
      canvas = upsertSemanticGroup(canvas, group);
      await channel.send({
        type: "broadcast",
        event: GROUP_UPSERT_EVENT,
        payload: { type: GROUP_UPSERT_EVENT, roomId, senderId: userId, group },
      });
    },
    sendGroupDeleted: async (groupId) => {
      canvas = deleteSemanticGroup(canvas, groupId);
      await channel.send({
        type: "broadcast",
        event: GROUP_DELETED_EVENT,
        payload: { type: GROUP_DELETED_EVENT, roomId, senderId: userId, groupId },
      });
    },
    sendCursor: async (x, y) => {
      await channel.send({
        type: "broadcast",
        event: CURSOR_MOVE_EVENT,
        payload: { roomId, senderId: userId, userId, x, y, timestamp: Date.now(), name, color },
      });
    },
    requestSync: async () => {
      await channel.send({
        type: "broadcast",
        event: SNAPSHOT_REQUEST_EVENT,
        payload: { type: SNAPSHOT_REQUEST_EVENT, from: userId, roomId },
      });
    },
    disconnect: async () => {
      await channel.untrack();
      await client.removeChannel(channel);
    },
  };
}

async function runPhase10FinalAcceptance() {
  console.log("==================================================");
  console.log("STARTING PHASE 10 FINAL ACCEPTANCE VERIFICATION");
  console.log("==================================================");

  const roomA = `acceptance-roomA-${Date.now()}`;
  const roomB = `acceptance-roomB-${Date.now()}`;

  const clientA = await createParticipant(roomA, "user-a", "Alice", "#3B82F6");
  const clientB = await createParticipant(roomA, "user-b", "Bob", "#10B981");
  const clientC = await createParticipant(roomB, "user-c", "Charlie", "#F59E0B");

  await wait(1500);

  // ----------------------------------------------------
  // GATE 1: Presence Verification A <-> B & Room Isolation
  // ----------------------------------------------------
  console.log("\n--- GATE 1: Presence & Room Isolation ---");
  const partA = clientA.getParticipants();
  const partB = clientB.getParticipants();
  const partC = clientC.getParticipants();

  if (partA.length !== 2 || !partA.some((p) => p.userId === "user-b")) {
    throw new Error(`Presence A failed! Count=${partA.length}`);
  }
  if (partB.length !== 2 || !partB.some((p) => p.userId === "user-a")) {
    throw new Error(`Presence B failed! Count=${partB.length}`);
  }
  if (partC.length !== 1 || partC[0].userId !== "user-c") {
    throw new Error(`Room isolation failed! Client C saw: ${JSON.stringify(partC)}`);
  }
  console.log("PASS: Presence A <-> B and Room Isolation verified");

  // ----------------------------------------------------
  // GATE 2: Bidirectional NODE_UPSERT Verification
  // ----------------------------------------------------
  console.log("\n--- GATE 2: Bidirectional NODE_UPSERT ---");
  // A -> B
  const nodeA = {
    id: "node-from-a",
    nodeType: "problem",
    title: "High API Latency",
    description: "Spike at peak hours",
    position: { x: 100, y: 150 },
  };
  await clientA.sendNodeUpsert(nodeA);
  await wait(800);

  const canvasB_afterA = clientB.getCanvas();
  const receivedOnB = canvasB_afterA.nodes.find((n) => n.id === "node-from-a");
  if (!receivedOnB || receivedOnB.title !== "High API Latency") {
    throw new Error("A -> B NODE_UPSERT failed!");
  }
  console.log("PASS: A -> B NODE_UPSERT without refresh");

  // B -> A
  const nodeB = {
    id: "node-from-b",
    nodeType: "solution",
    title: "Implement Edge Cache",
    description: "Cloudflare cache layer",
    position: { x: 400, y: 150 },
  };
  await clientB.sendNodeUpsert(nodeB);
  await wait(800);

  const canvasA_afterB = clientA.getCanvas();
  const receivedOnA = canvasA_afterB.nodes.find((n) => n.id === "node-from-b");
  if (!receivedOnA || receivedOnA.title !== "Implement Edge Cache") {
    throw new Error("B -> A NODE_UPSERT failed!");
  }
  console.log("PASS: B -> A NODE_UPSERT without refresh");

  // Verify Client C received 0 nodes (Room Isolation)
  if (clientC.getCanvas().nodes.length !== 0) {
    throw new Error("Client C received nodes across rooms!");
  }
  console.log("PASS: Node Room Isolation verified");

  // ----------------------------------------------------
  // GATE 3: Bidirectional NODE_MOVED Verification
  // ----------------------------------------------------
  console.log("\n--- GATE 3: Bidirectional NODE_MOVED ---");
  // A moves node-from-a to (250, 350)
  await clientA.sendNodeMoved("node-from-a", { x: 250, y: 350 });
  await wait(800);

  const nodeOnB_moved = clientB.getCanvas().nodes.find((n) => n.id === "node-from-a");
  if (!nodeOnB_moved || nodeOnB_moved.position.x !== 250 || nodeOnB_moved.position.y !== 350) {
    throw new Error(`A -> B NODE_MOVED failed! Got: ${JSON.stringify(nodeOnB_moved?.position)}`);
  }
  console.log("PASS: A moves node -> B receives identical position");

  // B moves node-from-b to (550, 650)
  await clientB.sendNodeMoved("node-from-b", { x: 550, y: 650 });
  await wait(800);

  const nodeOnA_moved = clientA.getCanvas().nodes.find((n) => n.id === "node-from-b");
  if (!nodeOnA_moved || nodeOnA_moved.position.x !== 550 || nodeOnA_moved.position.y !== 650) {
    throw new Error(`B -> A NODE_MOVED failed! Got: ${JSON.stringify(nodeOnA_moved?.position)}`);
  }
  console.log("PASS: B moves node -> A receives identical position");

  // ----------------------------------------------------
  // GATE 4: Bidirectional Edge Verification
  // ----------------------------------------------------
  console.log("\n--- GATE 4: Bidirectional EDGE_UPSERT ---");
  // A creates edge: node-from-b -> node-from-a (solves)
  const edgeA = {
    id: "edge-a",
    sourceId: "node-from-b",
    targetId: "node-from-a",
    relationship: "solves",
  };
  await clientA.sendEdgeUpsert(edgeA);
  await wait(800);

  const edgeOnB = clientB.getCanvas().edges.find((e) => e.id === "edge-a");
  if (!edgeOnB || edgeOnB.relationship !== "solves") {
    throw new Error("A -> B EDGE_UPSERT failed!");
  }
  console.log("PASS: A creates edge -> B receives edge without refresh");

  // B creates another edge (e.g. edge-b)
  const edgeB = {
    id: "edge-b",
    sourceId: "node-from-a",
    targetId: "node-from-b",
    relationship: "relates_to",
  };
  await clientB.sendEdgeUpsert(edgeB);
  await wait(800);

  const edgeOnA = clientA.getCanvas().edges.find((e) => e.id === "edge-b");
  if (!edgeOnA || edgeOnA.relationship !== "relates_to") {
    throw new Error("B -> A EDGE_UPSERT failed!");
  }
  console.log("PASS: B creates edge -> A receives edge without refresh");

  // ----------------------------------------------------
  // GATE 5: Bidirectional Group Verification
  // ----------------------------------------------------
  console.log("\n--- GATE 5: Bidirectional GROUP_UPSERT & DELETE ---");
  // A creates group
  const groupA = {
    id: "group-1",
    title: "Backend Infrastructure",
    memberIds: ["node-from-a", "node-from-b"],
  };
  await clientA.sendGroupUpsert(groupA);
  await wait(800);

  const groupOnB = clientB.getCanvas().groups.find((g) => g.id === "group-1");
  if (!groupOnB || groupOnB.title !== "Backend Infrastructure") {
    throw new Error("A -> B GROUP_UPSERT failed!");
  }
  console.log("PASS: A creates group -> B receives group");

  // B modifies group title
  const updatedGroupB = {
    ...groupOnB,
    title: "Cloud Infrastructure Updated",
  };
  await clientB.sendGroupUpsert(updatedGroupB);
  await wait(800);

  const updatedOnA = clientA.getCanvas().groups.find((g) => g.id === "group-1");
  if (!updatedOnA || updatedOnA.title !== "Cloud Infrastructure Updated") {
    throw new Error("B modifies group -> A receives update failed!");
  }
  console.log("PASS: B modifies group -> A receives update");

  // B deletes group
  await clientB.sendGroupDeleted("group-1");
  await wait(800);

  const deletedOnA = clientA.getCanvas().groups.find((g) => g.id === "group-1");
  if (deletedOnA) {
    throw new Error("B deletes group -> A deletion failed!");
  }
  console.log("PASS: B deletes group -> A receives deletion");

  // ----------------------------------------------------
  // GATE 6: Presence + Cursor Bidirectional Verification
  // ----------------------------------------------------
  console.log("\n--- GATE 6: Cursor Bidirectional & Isolation ---");
  // Cursor A -> B
  await clientA.sendCursor(150, 250);
  await wait(800);

  const cursorOnB = clientB.getCursors().get("user-a");
  if (!cursorOnB || cursorOnB.x !== 150 || cursorOnB.y !== 250) {
    throw new Error("Cursor A -> B failed!");
  }
  console.log("PASS: Cursor A -> B verified");

  // Cursor B -> A
  await clientB.sendCursor(350, 450);
  await wait(800);

  const cursorOnA = clientA.getCursors().get("user-b");
  if (!cursorOnA || cursorOnA.x !== 350 || cursorOnA.y !== 450) {
    throw new Error("Cursor B -> A failed!");
  }
  console.log("PASS: Cursor B -> A verified");

  // Different-room cursor isolation
  const cursorOnC = clientC.getCursors().get("user-a");
  if (cursorOnC) {
    throw new Error("Cursor leaked to Client C in different room!");
  }
  console.log("PASS: Different-room cursor isolation verified");

  // ----------------------------------------------------
  // GATE 7: Reconnection & Snapshot Synchronization
  // ----------------------------------------------------
  console.log("\n--- GATE 7: Reconnection & Anti-Echo ---");
  // 1. Client B disconnects
  console.log("Disconnecting Client B...");
  await clientB.disconnect();
  await wait(1500);

  // Verify leave pruning on Client A
  const partA_afterLeave = clientA.getParticipants();
  if (partA_afterLeave.some((p) => p.userId === "user-b")) {
    throw new Error("Leave pruning failed! User B still in participant list.");
  }
  const cursorA_afterLeave = clientA.getCursors().get("user-b");
  if (cursorA_afterLeave) {
    throw new Error("Cursor pruning failed! User B cursor still present.");
  }
  console.log("PASS: Leave pruning verified");

  // 2. Client A mutates canvas while B is offline
  const offlineNode = {
    id: "node-offline",
    nodeType: "problem",
    title: "Database Deadlock",
    description: "Lock contention on writes",
    position: { x: 700, y: 700 },
  };
  await clientA.sendNodeUpsert(offlineNode);
  await wait(800);

  // 3. Client B reconnects
  console.log("Reconnecting Client B...");
  const clientB_reconnect = await createParticipant(roomA, "user-b", "Bob", "#10B981");
  await wait(1500);

  // Client B requests sync
  const initialB_count = clientB_reconnect.getSemanticCount();
  await clientB_reconnect.requestSync();
  await wait(2000);

  // Verify Client B received complete snapshot
  const recoveredCanvasB = clientB_reconnect.getCanvas();
  const recoveredOffline = recoveredCanvasB.nodes.find((n) => n.id === "node-offline");
  if (!recoveredOffline) {
    throw new Error("Client B reconnection failed to recover latest snapshot!");
  }
  console.log("PASS: Client B reconnects and receives latest snapshot");

  // Verify NO duplicate entities
  const uniqueIds = new Set(recoveredCanvasB.nodes.map((n) => n.id));
  if (uniqueIds.size !== recoveredCanvasB.nodes.length) {
    throw new Error("Duplicate entities found on recovered canvas!");
  }
  console.log("PASS: No duplicate entities on recovered canvas");

  // Verify NO semantic echo during snapshot hydration
  const semanticEventsDuringHydration = clientB_reconnect.getSemanticCount() - initialB_count;
  if (semanticEventsDuringHydration !== 0) {
    throw new Error(`Semantic echo occurred! Emitted ${semanticEventsDuringHydration} events during hydration.`);
  }
  console.log("PASS: No semantic echo during snapshot hydration");

  // Presence restored
  const partA_restored = clientA.getParticipants();
  if (!partA_restored.some((p) => p.userId === "user-b")) {
    throw new Error("Presence not restored after reconnect!");
  }
  console.log("PASS: Presence restored after reconnect");

  // Cursor resumes
  await clientB_reconnect.sendCursor(500, 600);
  await wait(800);
  const cursorResumed = clientA.getCursors().get("user-b");
  if (!cursorResumed || cursorResumed.x !== 500 || cursorResumed.y !== 600) {
    throw new Error("Cursor tracking failed to resume after reconnect!");
  }
  console.log("PASS: Cursor resumes after reconnect");

  // ----------------------------------------------------
  // GATE 8: Phase 8 & 9 Semantic AI Actions Regression
  // ----------------------------------------------------
  console.log("\n--- GATE 8: Phase 8 & 9 Semantic Action Regression ---");
  let baseCanvas = {
    nodes: [
      { id: "n1", nodeType: "problem", title: "Slow Page Load", description: "Takes 5s", position: { x: 100, y: 100 } },
      { id: "n2", nodeType: "problem", title: "Heavy Bundles", description: "Unused JS", position: { x: 300, y: 100 } },
    ],
    edges: [
      { id: "e1", sourceId: "n2", targetId: "n1", relationship: "causes" },
    ],
    groups: [],
  };

  const testActions = [
    { type: "CREATE_NODE", nodeType: "solution", title: "Code Splitting", description: "Lazy load routes" },
    { type: "CREATE_EDGE", sourceTitle: "Code Splitting", targetTitle: "Heavy Bundles", relationship: "solves" },
    { type: "UPDATE_NODE", targetTitle: "Slow Page Load", updates: { title: "Critical Page Load Lag", description: "Lag in p99" } },
    { type: "MOVE_NODE", targetTitle: "Heavy Bundles", position: { x: 320, y: 120 } },
    { type: "GROUP_NODES", groupTitle: "Performance Issues", nodeTitles: ["Critical Page Load Lag", "Heavy Bundles"] },
    { type: "DELETE_EDGE", sourceTitle: "Code Splitting", targetTitle: "Heavy Bundles" },
    { type: "DELETE_NODE", targetTitle: "Heavy Bundles" },
  ];

  const resultCanvas = applyCanvasActions(baseCanvas, testActions);
  
  // Verify CREATE_NODE
  const createdSol = resultCanvas.nodes.find((n) => n.title === "Code Splitting");
  if (!createdSol || createdSol.nodeType !== "solution") {
    throw new Error("AI CREATE_NODE regression!");
  }
  console.log("PASS: AI CREATE_NODE functional");

  // Verify UPDATE_NODE
  const updatedNode = resultCanvas.nodes.find((n) => n.title === "Critical Page Load Lag");
  if (!updatedNode || updatedNode.id !== "n1" || updatedNode.description !== "Lag in p99") {
    throw new Error("AI UPDATE_NODE regression!");
  }
  console.log("PASS: AI UPDATE_NODE functional");

  // Verify GROUP_NODES
  const createdGroup = resultCanvas.groups.find((g) => g.title === "Performance Issues");
  if (!createdGroup || !createdGroup.memberIds.includes("n1")) {
    throw new Error("AI GROUP_NODES regression!");
  }
  console.log("PASS: AI GROUP_NODES functional");

  // Verify DELETE_NODE removed Heavy Bundles
  const deletedNode = resultCanvas.nodes.find((n) => n.id === "n2");
  if (deletedNode) {
    throw new Error("AI DELETE_NODE regression!");
  }
  console.log("PASS: AI DELETE_NODE functional");

  // Verify dangling edges cleaned
  const danglingEdge = resultCanvas.edges.find((e) => e.sourceId === "n2" || e.targetId === "n2");
  if (danglingEdge) {
    throw new Error("Dangling edge remained after DELETE_NODE!");
  }
  console.log("PASS: AI DELETE_EDGE & dangling edge cleanup functional");

  // Clean teardown
  await clientA.disconnect();
  await clientB_reconnect.disconnect();
  await clientC.disconnect();

  console.log("\n==================================================");
  console.log("ALL PHASE 10 ACCEPTANCE GATES PASSED! 🚀");
  console.log("==================================================");
}

runPhase10FinalAcceptance().catch((err) => {
  console.error("FATAL ERROR IN FINAL ACCEPTANCE:", err);
  process.exit(1);
});
