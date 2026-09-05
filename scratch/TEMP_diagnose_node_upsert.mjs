import { chromium } from "playwright";

const ROOM = `diag-room-${Date.now()}`;
const URL_A = `http://localhost:3000/?room=${ROOM}`;
const URL_B = `http://localhost:3000/?room=${ROOM}`;

async function main() {
  const browser = await chromium.launch({ headless: true });

  const contextA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const contextB = await browser.newContext({ viewport: { width: 1280, height: 800 } });

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  const logsA = [];
  const logsB = [];

  pageA.on("console", (msg) => {
    const text = msg.text();
    logsA.push(`[A] ${text}`);
    console.log(`[A] ${text}`);
  });
  pageB.on("console", (msg) => {
    const text = msg.text();
    logsB.push(`[B] ${text}`);
    console.log(`[B] ${text}`);
  });

  console.log("Navigating Page A to:", URL_A);
  await pageA.goto(URL_A, { waitUntil: "networkidle" });

  console.log("Navigating Page B to:", URL_B);
  await pageB.goto(URL_B, { waitUntil: "networkidle" });

  // Wait for both to be Synced
  console.log("Waiting for Synced state on both clients...");
  await pageA.waitForFunction(() => document.body.innerText.includes("Synced"), null, { timeout: 15000 });
  await pageB.waitForFunction(() => document.body.innerText.includes("Synced"), null, { timeout: 15000 });
  console.log("Both clients are Synced!");

  // Wait for 2 participants indicator
  console.log("Waiting for 2 participants...");
  await pageA.waitForSelector('[title*="2 participants in room"]', { timeout: 15000 });
  await pageB.waitForSelector('[title*="2 participants in room"]', { timeout: 15000 });
  console.log("Both show 2 participants!");

  // Now on Client A, let's type an input into the textarea and click send / press Enter
  console.log("Submitting AI prompt on Client A...");
  const textarea = pageA.locator("textarea").first();
  await textarea.fill("add solution node to poor lead quality");
  
  // Press Enter to submit
  await textarea.press("Enter");

  // Wait for AI to complete
  console.log("Waiting for AI response on Client A...");
  await pageA.waitForFunction(() => {
    const key = "echo-conversations";
    const data = JSON.parse(localStorage.getItem(key) || "[]");
    return (data[0]?.canvas?.nodes?.length || 0) > 0;
  }, null, { timeout: 25000 });
  console.log("Client A has created node in canvas!");

  // Now wait 10 seconds to see if Client B receives the node
  console.log("Waiting 10 seconds to see if Client B receives the node...");
  await pageB.waitForTimeout(10000);

  // Check canvas nodes on A and B
  const nodesA = await pageA.evaluate(() => {
    const key = "echo-conversations";
    const data = JSON.parse(localStorage.getItem(key) || "[]");
    return data[0]?.canvas?.nodes || [];
  });
  const nodesB = await pageB.evaluate(() => {
    const key = "echo-conversations";
    const data = JSON.parse(localStorage.getItem(key) || "[]");
    return data[0]?.canvas?.nodes || [];
  });

  console.log("RESULT Client A nodes count:", nodesA.length, nodesA.map(n => ({ id: n.id, title: n.title })));
  console.log("RESULT Client B nodes count:", nodesB.length, nodesB.map(n => ({ id: n.id, title: n.title })));

  await browser.close();
}

main().catch(err => {
  console.error("Test error:", err);
  process.exit(1);
});
