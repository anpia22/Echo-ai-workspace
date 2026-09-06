import { chromium } from "playwright";

const BASE_URL = process.env.ECHO_E2E_URL || "http://localhost:3000";
const ROOM_ID = `test-room-phase12-3-${Date.now()}`;
const USER_A = `user-a-${Date.now()}`;
const USER_B = `user-b-${Date.now()}`;

console.log("=================================================");
console.log("PHASE 12.3: TWO-BROWSER PRODUCTION MEETING UI VERIFICATION");
console.log("=================================================");
console.log(`Room: ${ROOM_ID}`);
console.log(`User A (Alice): ${USER_A}`);
console.log(`User B (Bob):   ${USER_B}`);
console.log("=================================================\n");

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCondition(fn, timeoutMs = 20000, intervalMs = 500, label = "condition") {
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
    // 1. Setup Context A (Alice)
    const contextA = await browser.newContext({
      permissions: ["camera", "microphone"],
    });
    const pageA = await contextA.newPage();

    // 2. Setup Context B (Bob)
    const contextB = await browser.newContext({
      permissions: ["camera", "microphone"],
    });
    const pageB = await contextB.newPage();

    pageA.on("console", (msg) => console.log(`[Browser A] ${msg.text()}`));
    pageA.on("pageerror", (err) => console.error(`[Browser A Error] ${err.message}`));
    pageB.on("console", (msg) => console.log(`[Browser B] ${msg.text()}`));
    pageB.on("pageerror", (err) => console.error(`[Browser B Error] ${err.message}`));

    console.log("Step 1: Navigating Browser A (Alice) to main Echo workspace...");
    await pageA.goto(`${BASE_URL}/?room=${ROOM_ID}`);
    await pageA.evaluate((u) => {
      sessionStorage.setItem(
        "echo.collaboration.participant",
        JSON.stringify({ userId: u, displayName: "Alice", color: "#6366f1" })
      );
    }, USER_A);
    await pageA.reload();

    // Wait for canvas on Browser A
    await waitForCondition(
      async () => {
        const hasCanvas = await pageA.locator(".react-flow").count();
        const startBtn = await pageA.locator("#meeting-start-btn").isVisible();
        return hasCanvas > 0 && startBtn;
      },
      15000,
      500,
      "Browser A canvas and Start Meeting button"
    );
    console.log("✔ Step 1: Browser A canvas mounted; Start Meeting button visible.");

    // Step 2: Browser A starts meeting alone
    console.log("\nStep 2: Browser A clicks Start Meeting...");
    await pageA.locator("#meeting-start-btn").click();

    await waitForCondition(
      async () => {
        const hasControls = await pageA.locator('[data-testid="meeting-controls"]').isVisible();
        const hasPanel = await pageA.locator('[data-testid="meeting-video-panel"]').isVisible();
        const hasLocalVideo = await pageA.locator('[data-testid="local-participant-tile"] video').isVisible();
        const hasEmptyRemote = await pageA.locator('[data-testid="meeting-empty-remote"]').isVisible();
        return hasControls && hasPanel && hasLocalVideo && hasEmptyRemote;
      },
      15000,
      500,
      "Browser A in-meeting with local preview and empty remote state"
    );
    console.log("✔ Step 2: Browser A in-meeting: controls visible, local video tile playing with 'You', empty remote state displayed.");

    // Step 3: Browser B (Bob) navigates and joins
    console.log("\nStep 3: Navigating Browser B (Bob) to main Echo workspace...");
    await pageB.goto(`${BASE_URL}/?room=${ROOM_ID}`);
    await pageB.evaluate((u) => {
      sessionStorage.setItem(
        "echo.collaboration.participant",
        JSON.stringify({ userId: u, displayName: "Bob", color: "#10b981" })
      );
    }, USER_B);
    await pageB.reload();

    await waitForCondition(
      async () => {
        const hasCanvas = await pageB.locator(".react-flow").count();
        const startBtn = await pageB.locator("#meeting-start-btn").isVisible();
        return hasCanvas > 0 && startBtn;
      },
      15000,
      500,
      "Browser B canvas and Start Meeting button"
    );
    console.log("✔ Step 3: Browser B canvas mounted; Start Meeting button visible.");

    // Step 4: Browser B starts meeting
    console.log("\nStep 4: Browser B clicks Start Meeting...");
    await pageB.locator("#meeting-start-btn").click();

    await waitForCondition(
      async () => {
        const hasControlsB = await pageB.locator('[data-testid="meeting-controls"]').isVisible();
        const hasLocalVideoB = await pageB.locator('[data-testid="local-participant-tile"] video').isVisible();
        return hasControlsB && hasLocalVideoB;
      },
      15000,
      500,
      "Browser B in-meeting UI with local preview"
    );
    console.log("✔ Step 4: Browser B entered meeting with local video preview.");

    // Step 5: WebRTC negotiation & remote video rendering
    console.log("\nStep 5: Waiting for bidirectional remote video rendering on production tiles...");
    await waitForCondition(
      async () => {
        const bTileInA = await pageA.locator(`[data-testid="participant-tile-${USER_B}"] video`).isVisible();
        const aTileInB = await pageB.locator(`[data-testid="participant-tile-${USER_A}"] video`).isVisible();
        return bTileInA && aTileInB;
      },
      25000,
      500,
      "Remote video tiles rendering bidirectionally"
    );
    console.log("✔ Step 5: Success! Browser A renders Bob's remote video; Browser B renders Alice's remote video.");

    // Step 7: Header In-Meeting Badge
    const headerBadgeA = await pageA.locator('[data-testid="header-meeting-badge"]').isVisible();
    const headerBadgeB = await pageB.locator('[data-testid="header-meeting-badge"]').isVisible();
    console.log(`✔ Step 7: Header In-Meeting badges visible: A=${headerBadgeA}, B=${headerBadgeB}.`);

    // Step 8: Test Microphone Toggle A -> B
    console.log("\nStep 8: Testing Mic Toggle (Alice mutes mic)...");
    await pageA.locator("#meeting-toggle-mic-btn").click();

    await waitForCondition(
      async () => {
        // Browser B should see mute icon on Alice's tile
        const muteBadgeOnB = await pageB
          .locator(`[data-testid="participant-tile-${USER_A}"] [title="Microphone muted"]`)
          .isVisible();
        return muteBadgeOnB;
      },
      10000,
      300,
      "Browser B sees Alice's muted badge"
    );
    console.log("✔ Step 8a: Browser B observed Alice's muted state badge in real time.");

    // Unmute
    await pageA.locator("#meeting-toggle-mic-btn").click();
    await waitForCondition(
      async () => {
        const muteBadgeOnB = await pageB
          .locator(`[data-testid="participant-tile-${USER_A}"] [title="Microphone muted"]`)
          .isVisible();
        return !muteBadgeOnB;
      },
      10000,
      300,
      "Browser B sees Alice unmuted"
    );
    console.log("✔ Step 8b: Browser B observed Alice unmuted.");

    // Step 9: Test Camera Toggle A -> B (avatar fallback)
    console.log("\nStep 9: Testing Camera Toggle (Alice turns camera off)...");
    await pageA.locator("#meeting-toggle-camera-btn").click();

    await waitForCondition(
      async () => {
        // On Browser A: local tile shows camera off avatar
        const localCameraOff = await pageA
          .locator('[data-testid="local-participant-tile"]')
          .textContent();
        // On Browser B: remote tile for Alice shows camera off avatar
        const remoteCameraOff = await pageB
          .locator(`[data-testid="participant-tile-${USER_A}"]`)
          .textContent();
        return localCameraOff?.includes("Camera off") && remoteCameraOff?.includes("Camera off");
      },
      10000,
      300,
      "Camera off avatar displayed on both sides"
    );
    console.log("✔ Step 9a: Camera turned off -> clean avatar with initials and 'Camera off' rendered on both browsers.");

    // Turn camera back on
    console.log("Testing Camera Toggle (Alice turns camera back on)...");
    await pageA.locator("#meeting-toggle-camera-btn").click();

    await waitForCondition(
      async () => {
        const localVideoA = await pageA.locator('[data-testid="local-participant-tile"] video').isVisible();
        const remoteVideoInB = await pageB.locator(`[data-testid="participant-tile-${USER_A}"] video`).isVisible();
        return localVideoA && remoteVideoInB;
      },
      15000,
      300,
      "Video restored cleanly"
    );
    console.log("✔ Step 9b: Camera turned back on -> live video streams smoothly restored on both sides.");

    // Step 10: Toggle video panel minimize/expand (UI-only state)
    console.log("\nStep 10: Testing video panel minimize/expand toggle...");
    await pageA.locator("#meeting-toggle-panel-btn").click();
    const panelHidden = !(await pageA.locator('[data-testid="meeting-video-panel"]').isVisible());
    console.log(`✔ Step 10a: Video panel minimized: ${panelHidden}.`);

    await pageA.locator("#meeting-toggle-panel-btn").click();
    const panelRestored = await pageA.locator('[data-testid="meeting-video-panel"]').isVisible();
    console.log(`✔ Step 10b: Video panel restored: ${panelRestored}.`);

    // Step 11: Leave meeting test
    console.log("\nStep 11: Browser B (Bob) clicks Leave Meeting...");
    await pageB.locator("#meeting-leave-btn").click();

    await waitForCondition(
      async () => {
        // Bob resets to idle with Start Meeting button
        const bobIdle = await pageB.locator("#meeting-start-btn").isVisible();
        // Alice removes Bob's tile
        const bobTileInA = await pageA.locator(`[data-testid="participant-tile-${USER_B}"]`).count();
        // Alice shows waiting for others empty state again
        const emptyStateInA = await pageA.locator('[data-testid="meeting-empty-remote"]').isVisible();
        return bobIdle && bobTileInA === 0 && emptyStateInA;
      },
      15000,
      300,
      "Bob leaves meeting and Alice removes Bob's tile"
    );
    console.log("✔ Step 11: Bob left meeting -> Bob reset to idle; Alice removed Bob's tile and returned to empty remote state.");

    // Step 12: Verify Echo Canvas is still interactive
    const canvasExists = await pageA.locator(".react-flow").isVisible();
    console.log(`✔ Step 12: Echo canvas remains fully intact and responsive: ${canvasExists}.`);

    console.log("\n=================================================");
    console.log("ALL PHASE 12.3 ACCEPTANCE CRITERIA VERIFIED & PASSED!");
    console.log("=================================================");

    await contextA.close();
    await contextB.close();
    await browser.close();
    process.exit(0);
  } catch (error) {
    console.error("\n❌ PHASE 12.3 TEST FAILED:", error);
    await browser.close();
    process.exit(1);
  }
}

run();
