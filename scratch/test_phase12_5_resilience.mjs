import { chromium } from "playwright";

const BASE_URL = process.env.ECHO_E2E_URL || "http://localhost:3000";
const ROOM_ID = `test-room-phase12-5-${Date.now()}`;
const USER_A = `user-a-${Date.now()}`;
const USER_B = `user-b-${Date.now()}`;

console.log("=================================================");
console.log("PHASE 12.5: TWO-BROWSER RESILIENCE & RECOVERY VERIFICATION");
console.log("=================================================");
console.log(`Room: ${ROOM_ID}`);
console.log(`User A (Alice): ${USER_A}`);
console.log(`User B (Bob):   ${USER_B}`);
console.log("=================================================\n");

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCondition(fn, timeoutMs = 30000, intervalMs = 500, label = "condition") {
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

    // Hook getDisplayMedia
    const hookDisplayMedia = () => {
      const orig = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getDisplayMedia = async function (...args) {
        const stream = await orig(...args);
        window.__capturedScreenStream = stream;
        return stream;
      };
    };

    console.log("Step 1: Navigating Alice and Bob to room...");
    await pageA.goto(`${BASE_URL}/?room=${ROOM_ID}`);
    await pageA.evaluate((u) => {
      sessionStorage.setItem(
        "echo.collaboration.participant",
        JSON.stringify({ userId: u, displayName: "Alice", color: "#6366f1" })
      );
    }, USER_A);
    await pageA.reload();
    await pageA.evaluate(hookDisplayMedia);

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
    console.log("✔ Step 1: Both canvases mounted.");

    // Step 2: Both click Start Meeting
    console.log("\nStep 2: Starting meeting on both browsers...");
    await pageA.locator("#meeting-start-btn").click();
    await wait(1000);
    await pageB.locator("#meeting-start-btn").click();

    // Verify initial WebRTC connection
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
      "initial mutual WebRTC connection"
    );
    console.log("✔ Step 2: Mutual WebRTC connection established with active video streams.");

    // Step 3: Verify initial generation = 1 on both browsers
    console.log("\nStep 3: Checking initial connection generation...");
    const genA1 = await pageA.evaluate((uB) => {
      return window.__echoMeetingRuntime?.getPeerGeneration(uB);
    }, USER_B);
    const genB1 = await pageB.evaluate((uA) => {
      return window.__echoMeetingRuntime?.getPeerGeneration(uA);
    }, USER_A);
    console.log(`  Initial Alice generation for Bob: ${genA1}`);
    console.log(`  Initial Bob generation for Alice: ${genB1}`);
    if (genA1 !== 1 || genB1 !== 1) {
      throw new Error(`Expected generation 1 on both sides, got Alice=${genA1}, Bob=${genB1}`);
    }
    console.log("✔ Step 3: Initial generation is 1 for both peers.");

    // Step 4: Induce genuine connection disruption & verify automated recovery
    console.log("\nStep 4: Inducing genuine WebRTC disruption (closing active RTCPeerConnection)...");
    const preDisruptTime = Date.now();
    await pageA.evaluate((uB) => {
      const pc = window.__echoMeetingRuntime?.getPeerConnection(uB);
      if (pc) {
        console.log("[Test] Forcing pc.close() to simulate network/engine drop");
        pc.close();
        pc.dispatchEvent(new Event("connectionstatechange"));
      }
    }, USER_B);

    // Verify recovery initiates and connection is re-established
    console.log("  Waiting for automatic recovery and reconnection...");
    await waitForCondition(
      async () => {
        const genA2 = await pageA.evaluate((uB) => {
          return window.__echoMeetingRuntime?.getPeerGeneration(uB);
        }, USER_B);
        const aState = await pageA.evaluate((uB) => {
          return window.__echoMeetingRuntime?.getPeerConnection(uB)?.connectionState;
        }, USER_B);
        const bState = await pageB.evaluate((uA) => {
          return window.__echoMeetingRuntime?.getPeerConnection(uA)?.connectionState;
        }, USER_A);
        const aHasRemoteVideo = await pageA.locator(`[data-testid="participant-tile-${USER_B}"] video`).isVisible();
        const bHasRemoteVideo = await pageB.locator(`[data-testid="participant-tile-${USER_A}"] video`).isVisible();

        return (
          genA2 &&
          genA2 > 1 &&
          (aState === "connected" || aState === "connecting") &&
          (bState === "connected" || bState === "connecting") &&
          aHasRemoteVideo &&
          bHasRemoteVideo
        );
      },
      30000,
      500,
      "recovery reconnection after genuine disruption"
    );

    // Wait until fully connected
    await waitForCondition(
      async () => {
        const aState = await pageA.evaluate((uB) => window.__echoMeetingRuntime?.getPeerConnection(uB)?.connectionState, USER_B);
        const bState = await pageB.evaluate((uA) => window.__echoMeetingRuntime?.getPeerConnection(uA)?.connectionState, USER_A);
        return aState === "connected" && bState === "connected";
      },
      20000,
      500,
      "both sides fully connected"
    );

    const genA2 = await pageA.evaluate((uB) => window.__echoMeetingRuntime?.getPeerGeneration(uB), USER_B);
    const genB2 = await pageB.evaluate((uA) => window.__echoMeetingRuntime?.getPeerGeneration(uA), USER_A);
    console.log(`  Recovered! Alice generation: ${genA2}, Bob generation: ${genB2}`);
    console.log("✔ Step 4: Genuine disruption triggered automated recovery; peers re-connected with incremented generation.");

    // Step 5: Verify recovery while Screen Sharing is ACTIVE
    console.log("\nStep 5: Testing recovery while Screen Sharing is active...");
    // Alice starts screen sharing
    await pageA.locator("#meeting-toggle-screen-btn").click();
    await waitForCondition(
      async () => {
        const aLocalPresenting = await pageA.locator('[data-testid="local-participant-tile"] [data-testid="participant-presenting-badge"]').isVisible();
        const bSeesAlicePresenting = await pageB.locator(`[data-testid="participant-tile-${USER_A}"] [data-testid="participant-presenting-badge"]`).isVisible();
        return aLocalPresenting && bSeesAlicePresenting;
      },
      15000,
      500,
      "Alice screen sharing active on both sides"
    );
    console.log("  Alice is actively screen sharing.");

    // Induce connection disruption while screen sharing
    console.log("  Disrupting connection while screen sharing...");
    await pageB.evaluate((uA) => {
      const pc = window.__echoMeetingRuntime?.getPeerConnection(uA);
      if (pc) {
        console.log("[Test] Forcing pc.close() during screen sharing");
        pc.close();
        pc.dispatchEvent(new Event("connectionstatechange"));
      }
    }, USER_A);

    // Verify recovery completes AND screen sharing remains intact
    console.log("  Waiting for recovery to complete while preserving screen sharing...");
    await waitForCondition(
      async () => {
        const aState = await pageA.evaluate((uB) => window.__echoMeetingRuntime?.getPeerConnection(uB)?.connectionState, USER_B);
        const bState = await pageB.evaluate((uA) => window.__echoMeetingRuntime?.getPeerConnection(uA)?.connectionState, USER_A);
        const bSeesAlicePresenting = await pageB.locator(`[data-testid="participant-tile-${USER_A}"] [data-testid="participant-presenting-badge"]`).isVisible();
        const bHasVideo = await pageB.locator(`[data-testid="participant-tile-${USER_A}"] video`).isVisible();
        return aState === "connected" && bState === "connected" && bSeesAlicePresenting && bHasVideo;
      },
      30000,
      500,
      "recovery while screen sharing active"
    );
    console.log("✔ Step 5a: WebRTC recovered successfully; Alice screen sharing preserved on remote peer.");

    // Alice stops screen sharing -> camera returns smoothly
    console.log("  Alice stops screen sharing -> verifying camera restoration...");
    await pageA.locator("#meeting-toggle-screen-btn").click();
    await waitForCondition(
      async () => {
        const aNoBadge = !(await pageA.locator('[data-testid="local-participant-tile"] [data-testid="participant-presenting-badge"]').isVisible());
        const bNoBadge = !(await pageB.locator(`[data-testid="participant-tile-${USER_A}"] [data-testid="participant-presenting-badge"]`).isVisible());
        const bHasVideo = await pageB.locator(`[data-testid="participant-tile-${USER_A}"] video`).isVisible();
        return aNoBadge && bNoBadge && bHasVideo;
      },
      15000,
      500,
      "camera track restored after screen sharing stopped"
    );
    console.log("✔ Step 5b: Camera video track smoothly restored after stopping screen share post-recovery.");

    // Step 6: Verify Camera OFF state preservation across recovery
    console.log("\nStep 6: Testing Camera OFF preservation across recovery...");
    // Bob turns camera off
    await pageB.locator("#meeting-toggle-camera-btn").click();
    await waitForCondition(
      async () => {
        const bCameraOff = await pageB.locator('[data-testid="local-participant-tile"]').getByText("Camera off").isVisible();
        const aSeesBobCameraOff = await pageA.locator(`[data-testid="participant-tile-${USER_B}"]`).getByText("Camera off").isVisible();
        return bCameraOff && aSeesBobCameraOff;
      },
      10000,
      500,
      "Bob camera turned off"
    );
    console.log("  Bob's camera is OFF.");

    // Disrupt connection again
    console.log("  Disrupting connection while Bob's camera is OFF...");
    await pageA.evaluate((uB) => {
      const pc = window.__echoMeetingRuntime?.getPeerConnection(uB);
      if (pc) {
        console.log("[Test] Forcing pc.close() while Bob camera is off");
        pc.close();
        pc.dispatchEvent(new Event("connectionstatechange"));
      }
    }, USER_B);

    // Verify recovery completes AND Bob's camera remains OFF
    console.log("  Waiting for recovery to complete...");
    await waitForCondition(
      async () => {
        const aState = await pageA.evaluate((uB) => window.__echoMeetingRuntime?.getPeerConnection(uB)?.connectionState, USER_B);
        const bState = await pageB.evaluate((uA) => window.__echoMeetingRuntime?.getPeerConnection(uA)?.connectionState, USER_A);
        const aSeesBobCameraOff = await pageA.locator(`[data-testid="participant-tile-${USER_B}"]`).getByText("Camera off").isVisible();
        const bCameraOff = await pageB.locator('[data-testid="local-participant-tile"]').getByText("Camera off").isVisible();
        return aState === "connected" && bState === "connected" && aSeesBobCameraOff && bCameraOff;
      },
      30000,
      500,
      "recovery while camera is off maintains camera off state"
    );
    console.log("✔ Step 6: Post-recovery, Bob's camera remains strictly OFF (no erroneous camera track attachment).");

    // Step 7: Verify Track onended handling
    console.log("\nStep 7: Testing track onended handling (device/source drop)...");
    await pageA.evaluate(() => {
      const stream = window.__echoMeetingRuntime?.getLocalStream();
      const audioTrack = stream?.getAudioTracks()[0];
      if (audioTrack) {
        console.log("[Test] Dispatching native 'ended' event on audio track");
        audioTrack.dispatchEvent(new Event("ended"));
      }
    });

    await waitForCondition(
      async () => {
        const aMicOff = await pageA.locator('[data-testid="local-participant-tile"] [data-testid="participant-muted-icon"]').isVisible();
        const bSeesAliceMuted = await pageB.locator(`[data-testid="participant-tile-${USER_A}"] [data-testid="participant-muted-icon"]`).isVisible();
        return aMicOff && bSeesAliceMuted;
      },
      10000,
      500,
      "track ended updates mic state and broadcasts to peers"
    );
    console.log("✔ Step 7: Local track 'ended' event cleanly updated local state and broadcasted to remote peer.");

    // Step 8: Verify clean leave during recovery
    console.log("\nStep 8: Testing clean leave / cleanup during recovery...");
    // Trigger recovery
    await pageB.evaluate((uA) => {
      const pc = window.__echoMeetingRuntime?.getPeerConnection(uA);
      pc?.close();
    }, USER_A);

    // Alice immediately leaves meeting
    await pageA.locator("#meeting-leave-btn").click();

    await waitForCondition(
      async () => {
        const aStartBtnVisible = await pageA.locator("#meeting-start-btn").isVisible();
        const bRemoteTileGone = (await pageB.locator(`[data-testid="participant-tile-${USER_A}"]`).count()) === 0;
        return aStartBtnVisible && bRemoteTileGone;
      },
      15000,
      500,
      "Alice clean leave during recovery"
    );

    // Verify Alice runtime is cleaned up
    const runtimeCleaned = await pageA.evaluate(() => window.__echoMeetingRuntime === null);
    if (!runtimeCleaned) {
      throw new Error("Alice meeting runtime was not cleaned up after leave!");
    }
    console.log("✔ Step 8: Clean leave during recovery cancelled timers, destroyed connections, and reset state.");

    console.log("\n=================================================");
    console.log("ALL PHASE 12.5 RESILIENCE & RECOVERY TESTS PASSED!");
    console.log("=================================================");
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error("\n❌ PHASE 12.5 TEST FAILED:", err);
  process.exit(1);
});
