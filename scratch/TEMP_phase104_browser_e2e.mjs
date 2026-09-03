import { chromium } from "playwright";

const BASE_URL = process.env.ECHO_E2E_URL || "http://localhost:3001";
const STORAGE_KEY = "echo-conversations";
const ROOM_A = `phase104-room-a-${Date.now()}`;
const ROOM_B = `phase104-room-b-${Date.now()}`;

const canvasA = {
  nodes: [
    {
      id: "550e8400-e29b-41d4-a716-446655440000",
      nodeType: "problem",
      title: "Sales performance is getting worse",
      position: { x: 80, y: 80 },
    },
    {
      id: "550e8400-e29b-41d4-a716-446655440001",
      nodeType: "problem",
      title: "Poor lead quality is one reason",
      position: { x: 80, y: 260 },
    },
  ],
  edges: [
    {
      id: "550e8400-e29b-41d4-a716-446655440002",
      sourceId: "550e8400-e29b-41d4-a716-446655440000",
      targetId: "550e8400-e29b-41d4-a716-446655440001",
      relationship: "causes",
    },
  ],
  groups: [],
};

const canvasBLocal = {
  nodes: [
    {
      id: "only-in-room-b",
      nodeType: "idea",
      title: "Room B only",
      position: { x: 40, y: 40 },
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

async function waitForNodeIds(page, ids, timeoutMs = 20000) {
  await page.waitForFunction(
    ({ key, expected }) => {
      const parsed = JSON.parse(localStorage.getItem(key) || "[]");
      const canvas = parsed[0]?.canvas;
      if (!canvas?.nodes) {
        return false;
      }
      const have = canvas.nodes.map((node) => node.id);
      return expected.every((id) => have.includes(id));
    },
    { key: STORAGE_KEY, expected: ids },
    { timeout: timeoutMs }
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
  const soloHasConnecting = await solo.page
    .locator("text=Connecting")
    .count();
  const soloHasSyncing = await solo.page.locator("text=Syncing").count();
  await solo.context.close();

  const host = await openSeeded(
    browser,
    `/?room=${ROOM_A}`,
    conversation("host", "Host", canvasA)
  );
  await host.page.waitForSelector(`text=Room:`, { timeout: 10000 });
  await host.page.waitForFunction(
    () =>
      document.body.innerText.includes("Synced") ||
      document.body.innerText.includes("Realtime unavailable") ||
      document.body.innerText.includes("Connection error"),
    null,
    { timeout: 15000 }
  );

  const guest = await openSeeded(
    browser,
    `/?room=${ROOM_A}`,
    conversation("guest", "Guest", {
      nodes: [],
      edges: [],
      groups: [],
    })
  );

  await waitForNodeIds(guest.page, [
    "550e8400-e29b-41d4-a716-446655440000",
    "550e8400-e29b-41d4-a716-446655440001",
  ]);
  const guestCanvas = await readCanvas(guest.page);

  const otherRoom = await openSeeded(
    browser,
    `/?room=${ROOM_B}`,
    conversation("other", "Other", canvasBLocal)
  );
  await otherRoom.page.waitForTimeout(4000);
  const otherCanvas = await readCanvas(otherRoom.page);

  const emptyRoom = await openSeeded(
    browser,
    `/?room=fresh-room-${Date.now()}`,
    conversation("fresh", "Fresh", canvasA)
  );
  await emptyRoom.page.waitForTimeout(3500);
  const emptyRoomCanvas = await readCanvas(emptyRoom.page);

  const result = {
    soloNoSyncUi: soloHasConnecting === 0 && soloHasSyncing === 0,
    guestNodeIds: guestCanvas.nodes.map((node) => node.id),
    guestEdgeIds: guestCanvas.edges.map((edge) => edge.id),
    otherRoomKeptLocal: otherCanvas.nodes[0]?.id === "only-in-room-b",
    emptyRoomKeptLocal:
      emptyRoomCanvas.nodes[0]?.id ===
      "550e8400-e29b-41d4-a716-446655440000",
  };

  console.log(JSON.stringify(result, null, 2));

  const pass =
    result.soloNoSyncUi &&
    result.guestNodeIds[0] === "550e8400-e29b-41d4-a716-446655440000" &&
    result.guestNodeIds[1] === "550e8400-e29b-41d4-a716-446655440001" &&
    result.guestEdgeIds[0] === "550e8400-e29b-41d4-a716-446655440002" &&
    result.otherRoomKeptLocal &&
    result.emptyRoomKeptLocal;

  await host.context.close();
  await guest.context.close();
  await otherRoom.context.close();
  await emptyRoom.context.close();
  await browser.close();

  if (!pass) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error);
  await browser.close();
  process.exitCode = 1;
}
