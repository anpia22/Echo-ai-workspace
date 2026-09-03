import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE_URL = process.env.ECHO_E2E_URL || "http://localhost:3001";
const STORAGE_KEY = "echo-conversations";
const ROOM = `phase105-live-${Date.now()}`;
const OTHER_ROOM = `phase105-other-${Date.now()}`;

const nodeId = "550e8400-e29b-41d4-a716-446655440000";
const createdNodeId = "live-created-node-105";

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

const canvasA = {
  nodes: [
    {
      id: nodeId,
      nodeType: "problem",
      title: "Poor lead quality is a problem",
      position: { x: 120, y: 160 },
    },
  ],
  edges: [],
  groups: [],
};

function conversation(id, title, canvas) {
  const now = new Date().toISOString();
  return JSON.stringify([
    {
      id,
      title,
      messages: [],
      actions: [],
      canvas,
      createdAt: now,
      updatedAt: now,
    },
  ]);
}

async function openSeeded(browser, path, storageJson) {
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    storageState: {
      cookies: [],
      origins: [
        {
          origin: new URL(BASE_URL).origin,
          localStorage: [{ name: STORAGE_KEY, value: storageJson }],
        },
      ],
    },
  });
  const page = await context.newPage();
  await page.goto(`${BASE_URL}${path}`, { waitUntil: "networkidle" });
  return { context, page };
}

async function readCanvas(page) {
  return page.evaluate((key) => {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return parsed[0]?.canvas ?? { nodes: [], edges: [], groups: [] };
  }, STORAGE_KEY);
}

async function waitForSynced(page) {
  await page.waitForFunction(
    () =>
      document.body.innerText.includes("Synced") ||
      document.body.innerText.includes("Realtime unavailable") ||
      document.body.innerText.includes("Connection error"),
    null,
    { timeout: 15000 }
  );
}

const browser = await chromium.launch({ headless: true });

try {
  const solo = await openSeeded(
    browser,
    "/",
    conversation("solo", "Solo", canvasA)
  );
  await solo.page.waitForSelector("text=Create Room", { timeout: 10000 });
  const soloSyncing = await solo.page.locator("text=Syncing").count();
  await solo.page.locator(".react-flow__node-echo").first().waitFor();
  await solo.context.close();

  const host = await openSeeded(
    browser,
    `/?room=${ROOM}`,
    conversation("host", "Host", canvasA)
  );
  await waitForSynced(host.page);

  const guest = await openSeeded(
    browser,
    `/?room=${ROOM}`,
    conversation("guest", "Guest", { nodes: [], edges: [], groups: [] })
  );
  await guest.page.waitForFunction(
    ({ key, id }) => {
      const parsed = JSON.parse(localStorage.getItem(key) || "[]");
      return parsed[0]?.canvas?.nodes?.some((node) => node.id === id);
    },
    { key: STORAGE_KEY, id: nodeId },
    { timeout: 20000 }
  );

  const env = loadEnvLocal();
  const realtime = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const inject = realtime.channel(`echo-room:${ROOM}`, {
    config: { broadcast: { ack: false, self: false } },
  });
  await new Promise((resolveSub, rejectSub) => {
    inject.subscribe((status, error) => {
      if (status === "SUBSCRIBED") {
        resolveSub();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        rejectSub(error || new Error(status));
      }
    });
  });

  const createdNode = {
    id: createdNodeId,
    nodeType: "problem",
    title: "Phase 105 live create",
    position: { x: 40, y: 40 },
  };

  await inject.send({
    type: "broadcast",
    event: "NODE_UPSERT",
    payload: {
      type: "NODE_UPSERT",
      roomId: ROOM,
      senderId: "e2e-injector",
      node: createdNode,
    },
  });

  await guest.page.waitForFunction(
    ({ key, id }) => {
      const parsed = JSON.parse(localStorage.getItem(key) || "[]");
      return parsed[0]?.canvas?.nodes?.some((node) => node.id === id);
    },
    { key: STORAGE_KEY, id: createdNodeId },
    { timeout: 15000 }
  );

  await inject.send({
    type: "broadcast",
    event: "NODE_UPSERT",
    payload: {
      type: "NODE_UPSERT",
      roomId: ROOM,
      senderId: "e2e-injector",
      node: { ...createdNode, title: "Phase 105 live update" },
    },
  });

  await guest.page.waitForFunction(
    ({ key, id }) => {
      const parsed = JSON.parse(localStorage.getItem(key) || "[]");
      const match = parsed[0]?.canvas?.nodes?.find((node) => node.id === id);
      return match?.title === "Phase 105 live update";
    },
    { key: STORAGE_KEY, id: createdNodeId },
    { timeout: 15000 }
  );

  const afterUpsert = await readCanvas(guest.page);

  await inject.send({
    type: "broadcast",
    event: "NODE_DELETED",
    payload: {
      type: "NODE_DELETED",
      roomId: ROOM,
      senderId: "e2e-injector",
      nodeId: createdNodeId,
    },
  });

  await guest.page.waitForFunction(
    ({ key, id }) => {
      const parsed = JSON.parse(localStorage.getItem(key) || "[]");
      const nodes = parsed[0]?.canvas?.nodes ?? [];
      return !nodes.some((node) => node.id === id);
    },
    { key: STORAGE_KEY, id: createdNodeId },
    { timeout: 15000 }
  );

  await realtime.removeChannel(inject);

  const beforeMove = await readCanvas(guest.page);

  const node = host.page.locator(".react-flow__node-echo").first();
  const box = await node.boundingBox();
  if (!box) {
    throw new Error("host node box missing");
  }
  await host.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await host.page.mouse.down();
  await host.page.mouse.move(box.x + 180, box.y + 140, { steps: 12 });
  await host.page.mouse.up();

  await guest.page.waitForFunction(
    ({ key, id, originX, originY }) => {
      const parsed = JSON.parse(localStorage.getItem(key) || "[]");
      const match = parsed[0]?.canvas?.nodes?.find((item) => item.id === id);
      if (!match) {
        return false;
      }
      return match.position.x !== originX || match.position.y !== originY;
    },
    {
      key: STORAGE_KEY,
      id: nodeId,
      originX: beforeMove.nodes[0].position.x,
      originY: beforeMove.nodes[0].position.y,
    },
    { timeout: 15000 }
  );

  const afterMove = await readCanvas(guest.page);

  const other = await openSeeded(
    browser,
    `/?room=${OTHER_ROOM}`,
    conversation("other", "Other", {
      nodes: [
        {
          id: "only-other",
          nodeType: "idea",
          title: "Room B only",
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
      groups: [],
    })
  );
  await waitForSynced(other.page);
  await other.page.waitForTimeout(2500);
  const otherCanvas = await readCanvas(other.page);

  const result = {
    soloNoSyncing: soloSyncing === 0,
    snapshotId: beforeMove.nodes[0]?.id,
    liveCreateId: afterUpsert.nodes.find((node) => node.id === createdNodeId)?.id,
    liveUpdateTitle: afterUpsert.nodes.find((node) => node.id === createdNodeId)?.title,
    liveDeleteGone: !afterMove.nodes.some((node) => node.id === createdNodeId),
    movedId: afterMove.nodes.find((node) => node.id === nodeId)?.id,
    movedPositionChanged:
      afterMove.nodes.find((node) => node.id === nodeId)?.position?.x !==
        beforeMove.nodes.find((node) => node.id === nodeId)?.position?.x ||
      afterMove.nodes.find((node) => node.id === nodeId)?.position?.y !==
        beforeMove.nodes.find((node) => node.id === nodeId)?.position?.y,
    otherRoomUntouched: otherCanvas.nodes[0]?.id === "only-other",
    guestNodeCount: afterMove.nodes.length,
  };

  console.log(JSON.stringify(result, null, 2));

  const pass =
    result.soloNoSyncing &&
    result.snapshotId === nodeId &&
    result.liveCreateId === createdNodeId &&
    result.liveUpdateTitle === "Phase 105 live update" &&
    result.liveDeleteGone &&
    result.movedId === nodeId &&
    result.movedPositionChanged &&
    result.otherRoomUntouched &&
    result.guestNodeCount === 1;

  await host.context.close();
  await guest.context.close();
  await other.context.close();
  await browser.close();

  if (!pass) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error);
  await browser.close();
  process.exitCode = 1;
}
