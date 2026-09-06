import { chromium } from "playwright";

const BASE_URL = process.env.ECHO_E2E_URL || "http://localhost:3000";
const ROOM_ID = `test-room-phase12-${Date.now()}`;
const USER_A = `user-a-${Date.now()}`;
const USER_B = `user-b-${Date.now()}`;

console.log("=================================================");
console.log("PHASE 12.2-D: TWO-BROWSER WEBRTC E2E VERIFICATION");
console.log("=================================================");
console.log(`Room: ${ROOM_ID}`);
console.log(`User A (Offerer): ${USER_A}`);
console.log(`User B (Answerer): ${USER_B}`);
console.log("=================================================\n");

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCondition(fn, timeoutMs = 15000, intervalMs = 500, label = "condition") {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await fn();
    if (result) return result;
    await wait(intervalMs);
  }
  throw new Error(`Timeout waiting for ${label} after ${timeoutMs}ms`);
}

async function run() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--allow-file-access-from-files",
      "--disable-gesture-requirement-for-media-playback",
      "--disable-features=WebRtcHideLocalIpsWithMdns",
    ],
  });

  try {
    // 1. Context A (User A)
    const contextA = await browser.newContext({
      permissions: ["camera", "microphone"],
    });
    const pageA = await contextA.newPage();

    // 2. Context B (User B)
    const contextB = await browser.newContext({
      permissions: ["camera", "microphone"],
    });
    const pageB = await contextB.newPage();

    pageA.on("console", (msg) => console.log(`[Browser A] ${msg.text()}`));
    pageA.on("pageerror", (err) => console.error(`[Browser A Error] ${err.message}`));
    pageB.on("console", (msg) => console.log(`[Browser B] ${msg.text()}`));
    pageB.on("pageerror", (err) => console.error(`[Browser B Error] ${err.message}`));

    console.log("Step 1: Navigating Browser A and Browser B to test harness...");
    await pageA.goto(`${BASE_URL}/meeting-test?room=${ROOM_ID}&user=${USER_A}`);
    await pageB.goto(`${BASE_URL}/meeting-test?room=${ROOM_ID}&user=${USER_B}`);

    // Wait for Supabase Realtime channel connected on both
    await waitForCondition(
      async () => {
        const text = await pageA.locator("#room-connection-state").textContent();
        return text?.includes("connected");
      },
      15000,
      500,
      "Browser A channel connected"
    );
    console.log("✔ Browser A channel connected to Supabase Realtime.");

    await waitForCondition(
      async () => {
        const text = await pageB.locator("#room-connection-state").textContent();
        return text?.includes("connected");
      },
      15000,
      500,
      "Browser B channel connected"
    );
    console.log("✔ Browser B channel connected to Supabase Realtime.");

    // Wait for presence discovery
    await waitForCondition(
      async () => {
        const statusA = await pageA.evaluate(() => window.__echoMeetingTest.getStatus());
        const statusB = await pageB.evaluate(() => window.__echoMeetingTest.getStatus());
        return statusA.presenceCount >= 2 && statusB.presenceCount >= 2;
      },
      15000,
      500,
      "Presence discovery of both participants"
    );
    console.log("✔ Step 2: Presence detected both users in room.");

    // Step 3: Browser A starts meeting
    console.log("\nStep 3: Browser A clicks Start Meeting...");
    await pageA.locator("#start-meeting-btn").click();
    await waitForCondition(
      async () => {
        const statusA = await pageA.evaluate(() => window.__echoMeetingTest.getStatus());
        return statusA.status === "in-meeting" && statusA.hasLocalStream;
      },
      10000,
      500,
      "Browser A in-meeting with local stream"
    );
    console.log("✔ Browser A in-meeting with local fake media stream.");

    // Step 4: Browser B starts meeting
    console.log("\nStep 4: Browser B clicks Start Meeting...");
    await pageB.locator("#start-meeting-btn").click();
    await waitForCondition(
      async () => {
        const statusB = await pageB.evaluate(() => window.__echoMeetingTest.getStatus());
        return statusB.status === "in-meeting" && statusB.hasLocalStream;
      },
      10000,
      500,
      "Browser B in-meeting with local fake media stream"
    );
    console.log("✔ Browser B in-meeting with local fake media stream.");

    // Step 5: WebRTC Offer / Answer / ICE / Mesh Connection
    console.log("\nStep 5: Waiting for WebRTC PeerConnection negotiation & remote stream reception...");
    let lastLog = 0;
    await waitForCondition(
      async () => {
        const statusA = await pageA.evaluate(() => window.__echoMeetingTest.getStatus());
        const statusB = await pageB.evaluate(() => window.__echoMeetingTest.getStatus());
        const connectedA = statusA.participants.some((p) => p.connection === "connected");
        const connectedB = statusB.participants.some((p) => p.connection === "connected");

        if (Date.now() - lastLog > 3000) {
          lastLog = Date.now();
          console.log(`[Status Probe] A: peers=${statusA.peersCount}, streams=${statusA.remoteStreamsCount}, states=${JSON.stringify(statusA.participants)}`);
          console.log(`[Status Probe] B: peers=${statusB.peersCount}, streams=${statusB.remoteStreamsCount}, states=${JSON.stringify(statusB.participants)}`);
        }

        return connectedA && connectedB && statusA.remoteStreamsCount >= 1 && statusB.remoteStreamsCount >= 1;
      },
      25000,
      500,
      "Both peers connected with remote streams"
    );

    const initialStatusA = await pageA.evaluate(() => window.__echoMeetingTest.getStatus());
    const initialStatusB = await pageB.evaluate(() => window.__echoMeetingTest.getStatus());

    console.log(`✔ WebRTC Connected! Browser A has ${initialStatusA.remoteStreamsCount} remote stream(s).`);
    console.log(`✔ WebRTC Connected! Browser B has ${initialStatusB.remoteStreamsCount} remote stream(s).`);
    console.log(`✔ Browser A peer state: ${JSON.stringify(initialStatusA.participants[0])}`);
    console.log(`✔ Browser B peer state: ${JSON.stringify(initialStatusB.participants[0])}`);

    // Step 6: Test Mic Toggle (Browser A -> Browser B)
    console.log("\nStep 6: Testing Mic Toggle A -> B...");
    await pageA.locator("#toggle-mic-btn").click();
    await waitForCondition(
      async () => {
        const statusB = await pageB.evaluate(() => window.__echoMeetingTest.getStatus());
        const peer = statusB.participants.find((p) => p.id === USER_A);
        return peer?.audio?.isMuted === true;
      },
      10000,
      300,
      "Browser B sees User A muted"
    );
    console.log("✔ Browser B saw User A MUTED successfully via MEDIA_STATE_EVENT.");

    // Toggle mic back on
    await pageA.locator("#toggle-mic-btn").click();
    await waitForCondition(
      async () => {
        const statusB = await pageB.evaluate(() => window.__echoMeetingTest.getStatus());
        const peer = statusB.participants.find((p) => p.id === USER_A);
        return peer?.audio?.isMuted === false;
      },
      10000,
      300,
      "Browser B sees User A unmuted"
    );
    console.log("✔ Browser B saw User A UNMUTED successfully.");

    // Step 7: Test Camera Toggle (Browser A -> Browser B)
    console.log("\nStep 7: Testing Camera Toggle A -> B...");
    await pageA.locator("#toggle-camera-btn").click();
    await waitForCondition(
      async () => {
        const statusB = await pageB.evaluate(() => window.__echoMeetingTest.getStatus());
        const peer = statusB.participants.find((p) => p.id === USER_A);
        return peer?.video?.isVideoOn === false;
      },
      10000,
      300,
      "Browser B sees User A video off"
    );
    console.log("✔ Browser B saw User A Video OFF successfully.");

    // Toggle camera back on
    await pageA.locator("#toggle-camera-btn").click();
    await waitForCondition(
      async () => {
        const statusB = await pageB.evaluate(() => window.__echoMeetingTest.getStatus());
        const peer = statusB.participants.find((p) => p.id === USER_A);
        return peer?.video?.isVideoOn === true;
      },
      10000,
      300,
      "Browser B sees User A video on"
    );
    console.log("✔ Browser B saw User A Video ON successfully.");

    // Step 8: Reverse Toggle (Browser B -> Browser A)
    console.log("\nStep 8: Testing Reverse Mic Toggle B -> A...");
    await pageB.locator("#toggle-mic-btn").click();
    await waitForCondition(
      async () => {
        const statusA = await pageA.evaluate(() => window.__echoMeetingTest.getStatus());
        const peer = statusA.participants.find((p) => p.id === USER_B);
        return peer?.audio?.isMuted === true;
      },
      10000,
      300,
      "Browser A sees User B muted"
    );
    console.log("✔ Browser A saw User B MUTED successfully.");

    await pageB.locator("#toggle-mic-btn").click();
    await waitForCondition(
      async () => {
        const statusA = await pageA.evaluate(() => window.__echoMeetingTest.getStatus());
        const peer = statusA.participants.find((p) => p.id === USER_B);
        return peer?.audio?.isMuted === false;
      },
      10000,
      300,
      "Browser A sees User B unmuted"
    );
    console.log("✔ Browser A saw User B UNMUTED successfully.");

    // Step 9: Leave Meeting & Teardown
    console.log("\nStep 9: Browser B leaves meeting...");
    await pageB.locator("#leave-meeting-btn").click();

    await waitForCondition(
      async () => {
        const statusA = await pageA.evaluate(() => window.__echoMeetingTest.getStatus());
        const statusB = await pageB.evaluate(() => window.__echoMeetingTest.getStatus());
        return statusB.status === "idle" && statusA.remoteStreamsCount === 0;
      },
      10000,
      300,
      "Browser A removes peer B after leave"
    );
    console.log("✔ Browser B entered idle state and Browser A removed peer B.");

    // Step 10: Rejoin Meeting (Fresh reconnect without duplicates)
    console.log("\nStep 10: Browser B rejoins meeting...");
    await pageB.locator("#start-meeting-btn").click();

    await waitForCondition(
      async () => {
        const statusA = await pageA.evaluate(() => window.__echoMeetingTest.getStatus());
        const statusB = await pageB.evaluate(() => window.__echoMeetingTest.getStatus());
        const connectedA = statusA.participants.some((p) => p.connection === "connected");
        const connectedB = statusB.participants.some((p) => p.connection === "connected");
        return connectedA && connectedB && statusA.remoteStreamsCount === 1 && statusB.remoteStreamsCount === 1;
      },
      25000,
      500,
      "Browser A and Browser B reconnected"
    );

    const finalStatusA = await pageA.evaluate(() => window.__echoMeetingTest.getStatus());
    const finalStatusB = await pageB.evaluate(() => window.__echoMeetingTest.getStatus());

    console.log(`✔ Reconnect complete! Browser A remote streams: ${finalStatusA.remoteStreamsCount}, peers: ${finalStatusA.peersCount}`);
    console.log(`✔ Reconnect complete! Browser B remote streams: ${finalStatusB.remoteStreamsCount}, peers: ${finalStatusB.peersCount}`);

    console.log("\n=================================================");
    console.log("ALL 10 PHASE 12.2-D VERIFICATION FLOWS PASSED!");
    console.log("=================================================");

    await contextA.close();
    await contextB.close();
    await browser.close();
    process.exit(0);
  } catch (error) {
    console.error("\n❌ TEST FAILED:", error);
    await browser.close();
    process.exit(1);
  }
}

run();
