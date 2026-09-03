import { chromium } from "playwright";

const BASE_URL = process.env.ECHO_E2E_URL || "http://127.0.0.1:3001";
const STORAGE_KEY = "echo-conversations";

const seededCanvas = {
  nodes: [
    {
      id: "sales",
      nodeType: "problem",
      title: "Sales performance",
      description: "Overall sales results",
      position: { x: 360, y: 600 },
    },
    {
      id: "lead",
      nodeType: "problem",
      title: "Poor lead quality",
      description: "Leads are not qualified",
      position: { x: 120, y: 280 },
    },
    {
      id: "verify",
      nodeType: "problem",
      title: "Weak lead verification",
      description: "Verification is incomplete",
      position: { x: 520, y: 280 },
    },
  ],
  edges: [
    {
      id: "e1",
      sourceId: "lead",
      targetId: "sales",
      relationship: "causes",
    },
    {
      id: "e2",
      sourceId: "verify",
      targetId: "sales",
      relationship: "causes",
    },
  ],
  groups: [],
};

function readCanvas(conversations) {
  return conversations[0]?.canvas;
}

async function sendPrompt(page, text) {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/analyze") &&
      response.request().method() === "POST",
    { timeout: 180000 }
  );

  await page.fill("textarea", text);
  await page.click('button:has-text("Analyze with Echo")');
  const response = await responsePromise;
  const json = await response.json();
  await page.waitForFunction(
    () =>
      !Array.from(document.querySelectorAll("button")).some((button) =>
        button.textContent?.includes("Echo is thinking")
      ),
    { timeout: 180000 }
  );
  await page.waitForTimeout(800);
  return json;
}

async function loadConversations(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), STORAGE_KEY);
}

const report = {
  groupActions: null,
  afterGroup: null,
  afterRefresh: null,
  afterDrag: null,
  afterDragRefresh: null,
  ambiguous: null,
  move: null,
  update: null,
  create: null,
  deleteEdge: null,
  deleteNode: null,
  readonly: null,
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

try {
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  await page.evaluate(
    ({ key, canvas }) => {
      const now = new Date().toISOString();
      localStorage.setItem(
        key,
        JSON.stringify([
          {
            id: "e2e-group-nodes",
            title: "GROUP_NODES E2E",
            messages: [],
            actions: [],
            canvas,
            createdAt: now,
            updatedAt: now,
          },
        ])
      );
    },
    { key: STORAGE_KEY, canvas: seededCanvas }
  );

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "GROUP_NODES E2E" }).click();
  await page.waitForTimeout(500);

  report.groupActions = await sendPrompt(page, "Group the root causes together.");
  report.afterGroup = readCanvas(await loadConversations(page));

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "GROUP_NODES E2E" }).click();
  await page.waitForTimeout(500);
  report.afterRefresh = readCanvas(await loadConversations(page));

  const leadNode = page.locator(".react-flow__node-echo").filter({ hasText: "Poor lead quality" });
  const box = await leadNode.boundingBox();
  if (!box) {
    throw new Error("Could not find Poor lead quality node to drag");
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 140, box.y + box.height / 2 + 80, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(800);
  report.afterDrag = readCanvas(await loadConversations(page));

  const draggedPosition = report.afterDrag.nodes.find((node) => node.id === "lead").position;

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "GROUP_NODES E2E" }).click();
  await page.waitForTimeout(500);
  report.afterDragRefresh = readCanvas(await loadConversations(page));

  report.ambiguous = await sendPrompt(
    page,
    "Group these."
  );

  report.move = await sendPrompt(page, "Move Sales performance 200 pixels to the right.");
  report.update = await sendPrompt(
    page,
    'Rename Weak lead verification to Weak verification.'
  );
  report.create = await sendPrompt(
    page,
    "Add a solution titled Improve verification and connect it so it solves Weak verification."
  );
  report.deleteEdge = await sendPrompt(
    page,
    "Remove the causes relationship from Poor lead quality to Sales performance."
  );
  report.deleteNode = await sendPrompt(page, "Delete Unrelated idea if it exists. If it does not exist, delete Improve verification.");
  report.readonly = await sendPrompt(page, "What's unresolved?");

  const persisted = report.afterDragRefresh;
  const group = persisted.groups?.[0];
  const salesInGroup = group?.memberIds?.includes("sales");
  const idsUnchanged =
    persisted.nodes.map((node) => node.id).sort().join(",") ===
    "lead,sales,verify";
  const dragPersisted =
    persisted.nodes.find((node) => node.id === "lead").position.x !== 120 ||
    persisted.nodes.find((node) => node.id === "lead").position.y !== 280;

  const verdict = {
    grouped: Boolean(report.afterGroup.groups?.length),
    groupTitle: report.afterGroup.groups?.[0]?.title,
    memberIds: report.afterGroup.groups?.[0]?.memberIds,
    salesNotGrouped: !report.afterGroup.groups?.[0]?.memberIds?.includes("sales"),
    noDuplicateNodes: report.afterGroup.nodes.length === 3,
    idsUnchanged,
    edgesUnchanged:
      JSON.stringify(report.afterGroup.edges.map((edge) => ({ s: edge.sourceId, t: edge.targetId, r: edge.relationship }))) ===
      JSON.stringify(seededCanvas.edges.map((edge) => ({ s: edge.sourceId, t: edge.targetId, r: edge.relationship }))),
    groupPersistedAfterRefresh: Boolean(report.afterRefresh.groups?.length),
    dragChangedPosition: dragPersisted,
    dragPersistedAfterRefresh:
      JSON.stringify(report.afterDragRefresh.nodes.find((node) => node.id === "lead").position) ===
      JSON.stringify(draggedPosition),
    groupActionsType: report.groupActions.actions?.map((action) => action.type),
    ambiguousActions: report.ambiguous.actions,
    ambiguousMessage: report.ambiguous.message,
    moveActions: report.move.actions?.map((action) => action.type),
    updateActions: report.update.actions?.map((action) => action.type),
    createActions: report.create.actions?.map((action) => action.type),
    deleteEdgeActions: report.deleteEdge.actions?.map((action) => action.type),
    deleteNodeActions: report.deleteNode.actions?.map((action) => action.type),
    readonlyActions: report.readonly.actions,
    salesInGroup,
  };

  console.log(JSON.stringify({ verdict, report }, null, 2));
} finally {
  await browser.close();
}
