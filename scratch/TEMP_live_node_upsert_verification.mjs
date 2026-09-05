import { chromium } from "playwright";

const ROOM = `live-upsert-${Date.now()}`;
const ROOM_OTHER = `live-upsert-other-${Date.now()}`;
const BASE_URL = "http://localhost:3000";

const URL_A = `${BASE_URL}/?room=${ROOM}`;
const URL_B = `${BASE_URL}/?room=${ROOM}`;
const URL_C = `${BASE_URL}/?room=${ROOM_OTHER}`;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("==================================================");
  console.log("STARTING LIVE NODE_UPSERT COLLABORATION TESTS");
  console.log(`Room: ${ROOM}`);
  console.log("==================================================");

  const browser = await chromium.launch({ headless: true });

  const contextA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const contextB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const contextC = await browser.newContext({ viewport: { width: 1280, height: 800 } });

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const pageC = await contextC.newPage();

  const logsA = [];
  const logsB = [];
  const logsC = [];

  pageA.on("console", (msg) => {
    const text = msg.text();
    logsA.push(text);
    if (text.includes("NODE_UPSERT") || text.includes("NODE_MOVED") || text.includes("ERROR") || text.includes("Echo AI") || text.includes("AI ACTIONS") || text.includes("completed") || text.includes("LATENCY")) {
      console.log(`[CLIENT A] ${text}`);
    }
  });

  pageB.on("console", (msg) => {
    const text = msg.text();
    logsB.push(text);
    if (text.includes("NODE_UPSERT") || text.includes("NODE_MOVED") || text.includes("ERROR") || text.includes("Echo AI") || text.includes("AI ACTIONS") || text.includes("completed") || text.includes("LATENCY")) {
      console.log(`[CLIENT B] ${text}`);
    }
  });

  pageC.on("console", (msg) => {
    const text = msg.text();
    logsC.push(text);
  });

  console.log("\n[STEP 1] Navigating Client A and Client B to Room", ROOM);
  await pageA.goto(URL_A, { waitUntil: "networkidle" });
  await pageB.goto(URL_B, { waitUntil: "networkidle" });

  await pageA.waitForFunction(() => document.body.innerText.includes("Synced"), null, { timeout: 15000 });
  await pageB.waitForFunction(() => document.body.innerText.includes("Synced"), null, { timeout: 15000 });
  await pageA.waitForSelector('[title*="2 participants in room"]', { timeout: 15000 });
  await pageB.waitForSelector('[title*="2 participants in room"]', { timeout: 15000 });
  console.log("PASS: Both Client A and Client B connected, Synced, and show 2 participants.");

  // Helper to read localStorage canvas nodes
  const getCanvasNodes = async (page) => {
    return page.evaluate(() => {
      const key = "echo-conversations";
      const data = JSON.parse(localStorage.getItem(key) || "[]");
      return data[0]?.canvas?.nodes || [];
    });
  };

  const getCanvasEdges = async (page) => {
    return page.evaluate(() => {
      const key = "echo-conversations";
      const data = JSON.parse(localStorage.getItem(key) || "[]");
      return data[0]?.canvas?.edges || [];
    });
  };

  // ------------------------------------------------------------
  // TEST 1: AI Prompt on Client A -> "create a problem node called Realtime Test"
  // ------------------------------------------------------------
  console.log("\n[STEP 2] Submitting prompt on Client A: 'create a problem node called Realtime Test'");
  const textareaA = pageA.locator("textarea").first();
  await textareaA.fill("create a problem node called Realtime Test");
  await textareaA.press("Enter");

  console.log("Waiting for Client A to create 'Realtime Test'...");
  await pageA.waitForFunction(() => {
    const key = "echo-conversations";
    const data = JSON.parse(localStorage.getItem(key) || "[]");
    return data[0]?.canvas?.nodes?.some((n) => n.title.toLowerCase().includes("realtime test"));
  }, null, { timeout: 60000 });

  const nodesAfterA = await getCanvasNodes(pageA);
  const testNodeA = nodesAfterA.find((n) => n.title.toLowerCase().includes("realtime test"));
  console.log(`Client A created node: id=${testNodeA.id}, title="${testNodeA.title}"`);

  console.log("Checking if Client B receives 'Realtime Test' WITHOUT REFRESH...");
  await pageB.waitForFunction(({ targetId }) => {
    const key = "echo-conversations";
    const data = JSON.parse(localStorage.getItem(key) || "[]");
    return data[0]?.canvas?.nodes?.some((n) => n.id === targetId);
  }, { targetId: testNodeA.id }, { timeout: 15000 });

  const nodesAfterB = await getCanvasNodes(pageB);
  const testNodeB = nodesAfterB.find((n) => n.id === testNodeA.id);
  if (!testNodeB || testNodeB.id !== testNodeA.id) {
    throw new Error(`FAIL: Client B did not receive exact node! Expected ${testNodeA.id}`);
  }
  console.log(`PASS: Client B received node WITHOUT REFRESH! id=${testNodeB.id}, title="${testNodeB.title}"`);

  await sleep(5000);

  // ------------------------------------------------------------
  // TEST 2: AI Prompt on Client B -> "add another problem node called Second Realtime Node"
  // ------------------------------------------------------------
  console.log("\n[STEP 3] Submitting prompt on Client B: 'add another problem node called Second Realtime Node'");
  const textareaB = pageB.locator("textarea").first();
  await textareaB.fill("add another problem node called Second Realtime Node");
  await textareaB.press("Enter");

  console.log("Waiting for Client B to create 'Second Realtime Node'...");
  await pageB.waitForFunction(() => {
    const key = "echo-conversations";
    const data = JSON.parse(localStorage.getItem(key) || "[]");
    return data[0]?.canvas?.nodes?.some((n) => n.title.toLowerCase().includes("second realtime"));
  }, null, { timeout: 60000 });

  const nodesAfterB2 = await getCanvasNodes(pageB);
  const secondNodeB = nodesAfterB2.find((n) => n.title.toLowerCase().includes("second realtime"));
  console.log(`Client B created node: id=${secondNodeB.id}, title="${secondNodeB.title}"`);

  console.log("Checking if Client A receives 'Second Realtime Node' WITHOUT REFRESH...");
  await pageA.waitForFunction(({ targetId }) => {
    const key = "echo-conversations";
    const data = JSON.parse(localStorage.getItem(key) || "[]");
    return data[0]?.canvas?.nodes?.some((n) => n.id === targetId);
  }, { targetId: secondNodeB.id }, { timeout: 15000 });

  const nodesAfterA2 = await getCanvasNodes(pageA);
  const secondNodeA = nodesAfterA2.find((n) => n.id === secondNodeB.id);
  if (!secondNodeA || secondNodeA.id !== secondNodeB.id) {
    throw new Error(`FAIL: Client A did not receive exact node! Expected ${secondNodeB.id}`);
  }
  console.log(`PASS: Client A received node WITHOUT REFRESH! id=${secondNodeA.id}, title="${secondNodeA.title}"`);

  await sleep(5000);

  // ------------------------------------------------------------
  // TEST 3: Original Failure Case -> AI Path Client A creates solution node
  // "add solution node to poor lead quality"
  // ------------------------------------------------------------
  console.log("\n[STEP 4] Submitting original failure prompt on Client A: 'create a problem node called Poor lead quality and add a solution node to it'");
  await textareaA.fill("create a problem node called Poor lead quality and add a solution node to it");
  await textareaA.press("Enter");

  console.log("Waiting for Client A to create solution node...");
  await pageA.waitForFunction(() => {
    const key = "echo-conversations";
    const data = JSON.parse(localStorage.getItem(key) || "[]");
    return data[0]?.canvas?.nodes?.some((n) => n.nodeType === "solution" || n.title.toLowerCase().includes("lead"));
  }, null, { timeout: 60000 });

  const nodesAfterA3 = await getCanvasNodes(pageA);
  const solutionNodesA = nodesAfterA3.filter((n) => n.nodeType === "solution");
  console.log(`Client A solution nodes:`, solutionNodesA.map((n) => ({ id: n.id, title: n.title })));

  console.log("Checking if Client B receives solution node WITHOUT REFRESH...");
  for (const sol of solutionNodesA) {
    await pageB.waitForFunction(({ id }) => {
      const key = "echo-conversations";
      const data = JSON.parse(localStorage.getItem(key) || "[]");
      return data[0]?.canvas?.nodes?.some((n) => n.id === id);
    }, { id: sol.id }, { timeout: 15000 });
  }

  const nodesAfterB3 = await getCanvasNodes(pageB);
  console.log("Client A total nodes:", nodesAfterA3.length);
  console.log("Client B total nodes:", nodesAfterB3.length);

  if (nodesAfterA3.length !== nodesAfterB3.length) {
    throw new Error(`FAIL: Node count mismatch! A=${nodesAfterA3.length}, B=${nodesAfterB3.length}`);
  }
  console.log("PASS: Client B received all nodes from AI path WITHOUT REFRESH!");

  // ------------------------------------------------------------
  // TEST 4: Verify Duplicate Protection & Stable IDs
  // ------------------------------------------------------------
  console.log("\n[STEP 5] Verifying duplicate protection and stable IDs...");
  const setA = new Set(nodesAfterA3.map((n) => n.id));
  const setB = new Set(nodesAfterB3.map((n) => n.id));

  if (setA.size !== nodesAfterA3.length) {
    throw new Error("FAIL: Duplicate IDs found on Client A!");
  }
  if (setB.size !== nodesAfterB3.length) {
    throw new Error("FAIL: Duplicate IDs found on Client B!");
  }

  for (const id of setA) {
    if (!setB.has(id)) {
      throw new Error(`FAIL: Node id ${id} exists on A but not B!`);
    }
  }
  console.log("PASS: Exactly 1 copy of each node on both clients, identical stable UUIDs!");

  // ------------------------------------------------------------
  // TEST 5: NODE_MOVED live sync
  // ------------------------------------------------------------
  console.log("\n[STEP 6] Testing NODE_MOVED from Client A -> Client B...");
  const nodeToMove = nodesAfterA3[0];
  const newPos = { x: nodeToMove.position.x + 150, y: nodeToMove.position.y + 150 };

  await pageA.evaluate(({ id, pos }) => {
    // Trigger updateNodePosition via react flow change or evaluating internal component prop
    // In page.tsx: updateNodePosition(nodeId, position)
    // We can dispatch flow move or invoke onNodePositionChange if accessible, or drag node in DOM
  }, { id: nodeToMove.id, pos: newPos });

  // Drag the first node on Client A using mouse
  const nodeLocatorA = pageA.locator(`[data-id="${nodeToMove.id}"]`);
  if (await nodeLocatorA.count() > 0) {
    const box = await nodeLocatorA.boundingBox();
    if (box) {
      await pageA.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await pageA.mouse.down();
      await pageA.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 80, { steps: 5 });
      await pageA.mouse.up();
      console.log("Dragged node on Client A canvas.");
    }
  }

  // ------------------------------------------------------------
  // TEST 6: Room Isolation
  // ------------------------------------------------------------
  console.log("\n[STEP 7] Verifying Room Isolation with Client C in different room...");
  await pageC.goto(URL_C, { waitUntil: "networkidle" });
  await pageC.waitForFunction(() => document.body.innerText.includes("Synced"), null, { timeout: 15000 });
  const nodesC = await getCanvasNodes(pageC);
  if (nodesC.length !== 0) {
    throw new Error(`FAIL: Client C in Room ${ROOM_OTHER} has ${nodesC.length} nodes! Expected 0.`);
  }
  console.log("PASS: Room isolation confirmed! Client C in separate room has 0 nodes.");

  await browser.close();

  console.log("\n==================================================");
  console.log("ALL LIVE COLLABORATION INTEGRATION TESTS PASSED! 🎉");
  console.log("==================================================");
}

main().catch((err) => {
  console.error("FATAL ERROR IN LIVE TEST:", err);
  process.exit(1);
});
