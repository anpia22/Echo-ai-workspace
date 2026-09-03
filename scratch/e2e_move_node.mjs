import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";

const BASE_URL = process.env.ECHO_E2E_URL || "http://localhost:3000";
const STORAGE_KEY = "echo-conversations";

const seededCanvas = {
  nodes: [
    {
      id: "sales",
      nodeType: "problem",
      title: "Sales performance is getting worse",
      description: "Overall sales results",
      position: { x: 360, y: 320 },
    },
    {
      id: "lead",
      nodeType: "problem",
      title: "Poor lead quality",
      description: "Leads are not qualified",
      position: { x: 360, y: 40 },
    },
    {
      id: "verify",
      nodeType: "problem",
      title: "Weak lead verification",
      description: "Verification is incomplete",
      position: { x: 360, y: -240 },
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
      targetId: "lead",
      relationship: "causes",
    },
  ],
  groups: [],
};

function nodeByTitle(canvas, title) {
  return canvas?.nodes?.find((node) => node.title === title);
}

function edgeKey(edge) {
  return `${edge.sourceId}|${edge.targetId}|${edge.relationship}`;
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
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
  await page.waitForTimeout(1200);
  return json;
}

async function loadConversations(page) {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || "[]"),
    STORAGE_KEY
  );
}

async function nodeBox(page, title) {
  const locator = page
    .locator(".react-flow__node-echo")
    .filter({ hasText: title });
  await locator.first().waitFor({ timeout: 15000 });
  return locator.first().boundingBox();
}

const now = new Date().toISOString();
const seededConversations = JSON.stringify([
  {
    id: "e2e-move-node",
    title: "MOVE_NODE E2E",
    messages: [],
    actions: [],
    canvas: seededCanvas,
    createdAt: now,
    updatedAt: now,
  },
]);

const consoleLogs = [];
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  storageState: {
    cookies: [],
    origins: [
      {
        origin: new URL(BASE_URL).origin,
        localStorage: [{ name: STORAGE_KEY, value: seededConversations }],
      },
    ],
  },
});
const page = await context.newPage();
page.on("console", (msg) => {
  consoleLogs.push({ type: msg.type(), text: msg.text() });
});

const report = {
  baseUrl: BASE_URL,
  before: null,
  beforeBoxes: null,
  moveResponse: null,
  afterMove: null,
  afterBoxes: null,
  afterRefresh: null,
  afterRefreshBoxes: null,
  createResponse: null,
  afterCreate: null,
};

try {
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  const titleButton = page.getByRole("button", { name: "MOVE_NODE E2E" });
  if (await titleButton.count()) {
    await titleButton.click();
  }
  await page.waitForTimeout(800);

  report.before = (await loadConversations(page))[0]?.canvas;
  report.beforeBoxes = {
    lead: await nodeBox(page, "Poor lead quality"),
    sales: await nodeBox(page, "Sales performance is getting worse"),
    verify: await nodeBox(page, "Weak lead verification"),
  };
  await page.screenshot({
    path: "scratch/TEMP_move_node_e2e_before.png",
    fullPage: true,
  });

  report.moveResponse = await sendPrompt(
    page,
    "Move Poor lead quality below Sales performance."
  );

  report.afterMove = (await loadConversations(page))[0]?.canvas;
  report.afterBoxes = {
    lead: await nodeBox(page, "Poor lead quality"),
    sales: await nodeBox(page, "Sales performance is getting worse"),
    verify: await nodeBox(page, "Weak lead verification"),
  };
  await page.screenshot({
    path: "scratch/TEMP_move_node_e2e_after.png",
    fullPage: true,
  });

  const movedPosition = nodeByTitle(
    report.afterMove,
    "Poor lead quality"
  )?.position;

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "MOVE_NODE E2E" }).click();
  await page.waitForTimeout(800);

  report.afterRefresh = (await loadConversations(page))[0]?.canvas;
  report.afterRefreshBoxes = {
    lead: await nodeBox(page, "Poor lead quality"),
  };
  await page.screenshot({
    path: "scratch/TEMP_move_node_e2e_refresh.png",
    fullPage: true,
  });

  report.createResponse = await sendPrompt(
    page,
    "Add a solution called Improve lead verification."
  );
  report.afterCreate = (await loadConversations(page))[0]?.canvas;

  const leadBefore = nodeByTitle(report.before, "Poor lead quality");
  const leadAfter = nodeByTitle(report.afterMove, "Poor lead quality");
  const leadRefresh = nodeByTitle(report.afterRefresh, "Poor lead quality");
  const salesBefore = nodeByTitle(
    report.before,
    "Sales performance is getting worse"
  );
  const salesAfter = nodeByTitle(
    report.afterMove,
    "Sales performance is getting worse"
  );
  const verifyBefore = nodeByTitle(report.before, "Weak lead verification");
  const verifyAfter = nodeByTitle(report.afterMove, "Weak lead verification");

  const actions = report.moveResponse?.actions || [];
  const moveAction = actions.find((action) => action.type === "MOVE_NODE");
  const rawRejected = JSON.stringify(consoleLogs).includes("Rejected");
  const unknownAction = JSON.stringify(consoleLogs).includes("unknown canvas");

  const beforeEdgeKeys = (report.before?.edges || []).map(edgeKey).sort();
  const afterEdgeKeys = (report.afterMove?.edges || []).map(edgeKey).sort();
  const refreshEdgeKeys = (report.afterRefresh?.edges || []).map(edgeKey).sort();

  const createActions = report.createResponse?.actions || [];
  const created = (report.afterCreate?.nodes || []).some(
    (node) => node.title === "Improve lead verification"
  );

  const checks = {
    aiGeneratedMoveNode: Boolean(
      moveAction &&
        moveAction.targetTitle === "Poor lead quality" &&
        finiteNumber(moveAction.position?.x) &&
        finiteNumber(moveAction.position?.y)
    ),
    notEmptyActions: actions.length > 0,
    onlyMoveOrIncludesMove: Boolean(moveAction),
    noUnknownDrop: !unknownAction,
    idSame: leadBefore?.id === leadAfter?.id && leadAfter?.id === "lead",
    titleSame: leadAfter?.title === "Poor lead quality",
    descriptionSame: leadAfter?.description === leadBefore?.description,
    nodeTypeSame: leadAfter?.nodeType === leadBefore?.nodeType,
    positionChanged:
      JSON.stringify(leadBefore?.position) !==
      JSON.stringify(leadAfter?.position),
    salesUnmoved:
      JSON.stringify(salesBefore?.position) ===
      JSON.stringify(salesAfter?.position),
    verifyUnmoved:
      JSON.stringify(verifyBefore?.position) ===
      JSON.stringify(verifyAfter?.position),
    edgesUnchangedAfterMove:
      JSON.stringify(beforeEdgeKeys) === JSON.stringify(afterEdgeKeys),
    edgesUnchangedAfterRefresh:
      JSON.stringify(beforeEdgeKeys) === JSON.stringify(refreshEdgeKeys),
    persistPosition:
      JSON.stringify(leadAfter?.position) ===
      JSON.stringify(leadRefresh?.position),
    persistId: leadRefresh?.id === leadAfter?.id,
    visibleMove:
      report.beforeBoxes?.lead &&
      report.afterBoxes?.lead &&
      (Math.abs(report.afterBoxes.lead.x - report.beforeBoxes.lead.x) > 2 ||
        Math.abs(report.afterBoxes.lead.y - report.beforeBoxes.lead.y) > 2),
    createNode:
      createActions.some((action) => action.type === "CREATE_NODE") && created,
    movedPosition,
    moveAction,
    rawRejected,
  };

  const verdict = {
    checks,
    pass: {
      ai: checks.aiGeneratedMoveNode,
      validation: checks.aiGeneratedMoveNode && checks.notEmptyActions && checks.noUnknownDrop,
      execution: checks.positionChanged && checks.idSame,
      identity:
        checks.idSame &&
        checks.titleSame &&
        checks.descriptionSame &&
        checks.nodeTypeSame,
      edges: checks.edgesUnchangedAfterMove && checks.edgesUnchangedAfterRefresh,
      unrelated: checks.salesUnmoved && checks.verifyUnmoved,
      persist: checks.persistPosition && checks.persistId,
      create: checks.createNode,
      visible: checks.visibleMove,
    },
  };

  await writeFile(
    "scratch/TEMP_move_node_e2e_results.json",
    JSON.stringify(
      {
        verdict,
        report,
        consoleLogs: consoleLogs.filter((entry) =>
          /VALIDATED|AI ACTIONS|MOVE_NODE|Rejected|Ignored|unknown/i.test(
            entry.text
          )
        ),
      },
      null,
      2
    )
  );

  console.log(JSON.stringify({ verdict, moveAction, movedPosition }, null, 2));
} finally {
  await browser.close();
}
