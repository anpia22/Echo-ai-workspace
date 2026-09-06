import { chromium } from "playwright";

const BASE_URL = process.env.ECHO_E2E_URL || "http://localhost:3000";
const ROOM_ID = `test-room-phase12-4-${Date.now()}`;
const USER_A = `user-a-${Date.now()}`;
const USER_B = `user-b-${Date.now()}`;

console.log("=================================================");
console.log("PHASE 12.4: TWO-BROWSER SCREEN SHARING VERIFICATION");
console.log("=================================================");
console.log(`Room: ${ROOM_ID}`);
console.log(`User A (Alice): ${USER_A}`);
console.log(`User B (Bob):   ${USER_B}`);
console.log("=================================================\n");

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCondition(fn, timeoutMs = 25000, intervalMs = 500, label = "condition") {
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

    // Hook navigator.mediaDevices.getDisplayMedia on both pages to capture track reference
    const hookDisplayMedia = () => {
      const orig = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getDisplayMedia = async function (...args) {
        const stream = await orig(...args);
        window.__capturedScreenStream = stream;
        window.__capturedScreenTrack = stream.getVideoTracks()[0];
        return stream;
      };
    };

    console.log("Step 1: Navigating Browser A (Alice) to room...");
    await pageA.goto(`${BASE_URL}/?room=${ROOM_ID}`);
    await pageA.evaluate((u) => {
      sessionStorage.setItem(
        "echo.collaboration.participant",
        JSON.stringify({ userId: u, displayName: "Alice", color: "#6366f1" })
      );
    }, USER_A);
    await pageA.reload();
    await pageA.evaluate(hookDisplayMedia);

    console.log("Step 2: Navigating Browser B (Bob) to room...");
    await pageB.goto(`${BASE_URL}/?room=${ROOM_ID}`);
    await pageB.evaluate((u) => {
      sessionStorage.setItem(
        "echo.collaboration.participant",
        JSON.stringify({ userId: u, displayName: "Bob", color: "#ec4899" })
      );
    }, USER_B);
    await pageB.reload();
    await pageB.evaluate(hookDisplayMedia);

    // Wait for canvas on both
    await waitForCondition(
      async () => {
        const aReady = (await pageA.locator(".react-flow").count()) > 0;
        const bReady = (await pageB.locator(".react-flow").count()) > 0;
        return aReady && bReady;
      },
      15000,
      500,
      "both canvases mounted"
    );
    console.log("✔ Step 1 & 2: Both canvases mounted.");

    // Step 3: Both click Start Meeting
    console.log("\nStep 3: Both users start meeting...");
    await pageA.locator("#meeting-start-btn").click();
    await wait(1000);
    await pageB.locator("#meeting-start-btn").click();

    // Verify both connected and video tiles visible
    await waitForCondition(
      async () => {
        const aHasRemoteTile = await pageA.locator(`[data-testid="participant-tile-${USER_B}"]`).isVisible();
        const bHasRemoteTile = await pageB.locator(`[data-testid="participant-tile-${USER_A}"]`).isVisible();
        const aHasRemoteVideo = await pageA.locator(`[data-testid="participant-tile-${USER_B}"] video`).isVisible();
        const bHasRemoteVideo = await pageB.locator(`[data-testid="participant-tile-${USER_A}"] video`).isVisible();
        return aHasRemoteTile && bHasRemoteTile && aHasRemoteVideo && bHasRemoteVideo;
      },
      25000,
      500,
      "mutual video connection established"
    );
    console.log("✔ Step 3: WebRTC connection established; mutual video tiles playing.");

    // Re-hook in case page re-evaluated
    await pageA.evaluate(hookDisplayMedia);
    await pageB.evaluate(hookDisplayMedia);

    // Step 4: Browser A starts Screen Share
    console.log("\nStep 4: Browser A (Alice) clicks Screen Share button...");
    const aScreenBtn = pageA.locator("#meeting-toggle-screen-btn");
    await expectVisible(aScreenBtn, "Browser A screen share button");
    await aScreenBtn.click();

    // Verify Browser A local tile shows "Presenting" badge and button is active
    await waitForCondition(
      async () => {
        const localPresentingBadge = await pageA
          .locator('[data-testid="local-participant-tile"] [data-testid="participant-presenting-badge"]')
          .isVisible();
        const btnClasses = (await aScreenBtn.getAttribute("class")) || "";
        const isBtnActive = btnClasses.includes("bg-indigo-600");
        return localPresentingBadge && isBtnActive;
      },
      15000,
      500,
      "Browser A local presenting badge and active button"
    );
    console.log("✔ Step 4a: Browser A local preview indicates Presenting; screen share button is active.");

    // Step 5: Verify Browser B receives screen video and sees Alice as Presenting
    console.log("\nStep 5: Verifying Browser B sees Alice presenting...");
    await waitForCondition(
      async () => {
        const bSeesAlicePresenting = await pageB
          .locator(`[data-testid="participant-tile-${USER_A}"] [data-testid="participant-presenting-badge"]`)
          .isVisible();
        const bHasAliceVideo = await pageB
          .locator(`[data-testid="participant-tile-${USER_A}"] video`)
          .isVisible();
        return bSeesAlicePresenting && bHasAliceVideo;
      },
      15000,
      500,
      "Browser B sees Alice presenting with video"
    );
    console.log("✔ Step 5: Browser B displays 'Presenting' badge on Alice's tile with screen video track.");

    // Step 6: Single Presenter Guard: Verify Browser B cannot start sharing
    console.log("\nStep 6: Verifying single presenter enforcement on Browser B...");
    const bScreenBtn = pageB.locator("#meeting-toggle-screen-btn");
    await waitForCondition(
      async () => {
        const isDisabled = await bScreenBtn.isDisabled();
        const title = (await bScreenBtn.getAttribute("title")) || "";
        return isDisabled && title.includes("Another participant is currently presenting");
      },
      10000,
      500,
      "Browser B screen share button disabled with presenter lock"
    );
    console.log("✔ Step 6: Single presenter lock enforced: Browser B's share button is disabled with tooltip.");

    // Step 7: Browser A stops screen share via UI button
    console.log("\nStep 7: Browser A clicks Stop Sharing button...");
    await aScreenBtn.click();

    // Verify camera track restored and presenter badges cleared
    await waitForCondition(
      async () => {
        const aNoBadge = !(await pageA
          .locator('[data-testid="local-participant-tile"] [data-testid="participant-presenting-badge"]')
          .isVisible());
        const bNoBadge = !(await pageB
          .locator(`[data-testid="participant-tile-${USER_A}"] [data-testid="participant-presenting-badge"]`)
          .isVisible());
        const bBtnEnabled = !(await bScreenBtn.isDisabled());
        const aHasVideo = await pageA.locator('[data-testid="local-participant-tile"] video').isVisible();
        const bHasVideo = await pageB.locator(`[data-testid="participant-tile-${USER_A}"] video`).isVisible();
        return aNoBadge && bNoBadge && bBtnEnabled && aHasVideo && bHasVideo;
      },
      15000,
      500,
      "screen share stopped, camera restored, badges cleared"
    );
    console.log("✔ Step 7: Camera restored on both browsers; presenting badges cleared; Bob's share button re-enabled.");

    // Step 8: Camera OFF preservation test
    console.log("\nStep 8: Testing Camera OFF preservation...");
    // Turn Bob's camera off
    await pageB.locator("#meeting-toggle-camera-btn").click();
    await waitForCondition(
      async () => {
        const bCameraOff = await pageB.locator('[data-testid="local-participant-tile"]').getByText("Camera off").isVisible();
        const aSeesBobCameraOff = await pageA.locator(`[data-testid="participant-tile-${USER_B}"]`).getByText("Camera off").isVisible();
        return bCameraOff && aSeesBobCameraOff;
      },
      10000,
      500,
      "Bob's camera turned off on both browsers"
    );
    console.log("  Bob's camera turned OFF (avatar fallback showing).");

    // Bob starts screen sharing with camera OFF
    console.log("  Bob starts screen sharing...");
    await bScreenBtn.click();
    await waitForCondition(
      async () => {
        const bPresenting = await pageB.locator('[data-testid="local-participant-tile"] [data-testid="participant-presenting-badge"]').isVisible();
        const aSeesBobPresenting = await pageA.locator(`[data-testid="participant-tile-${USER_B}"] [data-testid="participant-presenting-badge"]`).isVisible();
        const aSeesBobVideo = await pageA.locator(`[data-testid="participant-tile-${USER_B}"] video`).isVisible();
        return bPresenting && aSeesBobPresenting && aSeesBobVideo;
      },
      15000,
      500,
      "Bob presenting while camera is off"
    );
    console.log("  Bob is sharing screen (video rendered over avatar).");

    // Bob stops screen sharing -> camera MUST remain OFF
    console.log("  Bob stops screen sharing -> verifying camera remains OFF...");
    await bScreenBtn.click();
    await waitForCondition(
      async () => {
        const bStillOff = await pageB.locator('[data-testid="local-participant-tile"]').getByText("Camera off").isVisible();
        const aSeesStillOff = await pageA.locator(`[data-testid="participant-tile-${USER_B}"]`).getByText("Camera off").isVisible();
        const bNoPresenting = !(await pageB.locator('[data-testid="local-participant-tile"] [data-testid="participant-presenting-badge"]').isVisible());
        return bStillOff && aSeesStillOff && bNoPresenting;
      },
      15000,
      500,
      "camera remains OFF after stopping screen share"
    );
    console.log("✔ Step 8: Camera OFF preservation verified: Camera remained OFF after screen share stopped.");

    // Restore Bob's camera for next test
    await pageB.locator("#meeting-toggle-camera-btn").click();
    await wait(2000);

    // Step 9: Native browser track ending (screenTrack.onended) test
    console.log("\nStep 9: Testing native browser track ending (screenTrack.onended)...");
    await aScreenBtn.click();
    await waitForCondition(
      async () => {
        return await pageA.locator('[data-testid="local-participant-tile"] [data-testid="participant-presenting-badge"]').isVisible();
      },
      15000,
      500,
      "Alice presenting before native stop"
    );
    console.log("  Alice is presenting screen.");

    // Directly trigger native track ending (stop + ended event) on Alice's captured screen track!
    console.log("  Triggering native browser screen track ending (track.stop() + ended event)...");
    const stoppedSuccessfully = await pageA.evaluate(() => {
      if (window.__capturedScreenTrack) {
        window.__capturedScreenTrack.stop();
        window.__capturedScreenTrack.dispatchEvent(new Event("ended"));
        return true;
      }
      return false;
    });
    if (!stoppedSuccessfully) {
      throw new Error("Failed to find __capturedScreenTrack to stop");
    }

    // Verify native track stop triggers onScreenShareEnded: camera restored, badges cleared, presenter reset
    await waitForCondition(
      async () => {
        const aNoBadge = !(await pageA
          .locator('[data-testid="local-participant-tile"] [data-testid="participant-presenting-badge"]')
          .isVisible());
        const bNoBadge = !(await pageB
          .locator(`[data-testid="participant-tile-${USER_A}"] [data-testid="participant-presenting-badge"]`)
          .isVisible());
        const bBtnEnabled = !(await bScreenBtn.isDisabled());
        const aHasVideo = await pageA.locator('[data-testid="local-participant-tile"] video').isVisible();
        const bHasVideo = await pageB.locator(`[data-testid="participant-tile-${USER_A}"] video`).isVisible();
        return aNoBadge && bNoBadge && bBtnEnabled && aHasVideo && bHasVideo;
      },
      20000,
      500,
      "native track.stop() cleanup verified on both browsers"
    );
    console.log("✔ Step 9: Native browser track ending (screenTrack.onended) successfully restored camera and cleared presenter state!");

    // Step 10: Leave-while-sharing test
    console.log("\nStep 10: Testing leave while sharing...");
    await aScreenBtn.click();
    await waitForCondition(
      async () => {
        return await pageA.locator('[data-testid="local-participant-tile"] [data-testid="participant-presenting-badge"]').isVisible();
      },
      15000,
      500,
      "Alice presenting before leave"
    );
    console.log("  Alice presenting; Alice now clicks Leave Meeting...");
    await pageA.locator("#meeting-leave-btn").click();

    // Verify Browser A returns to idle and Browser B cleans up Alice's tile
    await waitForCondition(
      async () => {
        const aIdle = await pageA.locator("#meeting-start-btn").isVisible();
        const bAliceRemoved = !(await pageB.locator(`[data-testid="participant-tile-${USER_A}"]`).isVisible());
        const bBtnEnabled = !(await bScreenBtn.isDisabled());
        return aIdle && bAliceRemoved && bBtnEnabled;
      },
      15000,
      500,
      "leave-while-sharing cleanup on both browsers"
    );
    console.log("✔ Step 10: Leave-while-sharing completely cleaned up: A idle, B removed A's tile, Bob's share button unlocked.");

    console.log("\n=================================================");
    console.log("ALL PHASE 12.4 VERIFICATION CHECKS PASSED! (10/10)");
    console.log("=================================================");
  } finally {
    await browser.close();
  }
}

async function expectVisible(locator, name) {
  const visible = await locator.isVisible();
  if (!visible) {
    throw new Error(`Expected ${name} to be visible`);
  }
}

run().catch((err) => {
  console.error("\n❌ PHASE 12.4 VERIFICATION FAILED:", err);
  process.exit(1);
});
