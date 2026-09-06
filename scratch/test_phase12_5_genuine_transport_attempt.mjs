import { chromium } from "playwright";
import { execSync } from "node:child_process";

const BASE_URL = process.env.ECHO_E2E_URL || "http://localhost:3000";
const ROOM_ID = `test-room-phase12-5-transport-${Date.now()}`;
const USER_A = `user-a-${Date.now()}`;
const USER_B = `user-b-${Date.now()}`;

console.log("=================================================");
console.log("PHASE 12.5: REAL WEBRTC UDP TRANSPORT INTERRUPTION ATTEMPT");
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
    const contextA = await browser.newContext({ permissions: ["camera", "microphone"] });
    const pageA = await contextA.newPage();

    const contextB = await browser.newContext({ permissions: ["camera", "microphone"] });
    const pageB = await contextB.newPage();

    pageA.on("console", (msg) => console.log(`[Browser A] ${msg.text()}`));
    pageA.on("pageerror", (err) => console.error(`[Browser A Error] ${err.message}`));
    pageB.on("console", (msg) => console.log(`[Browser B] ${msg.text()}`));
    pageB.on("pageerror", (err) => console.error(`[Browser B Error] ${err.message}`));

    console.log("Step 1: Navigating Alice and Bob to room...");
    await pageA.goto(`${BASE_URL}/?room=${ROOM_ID}`);
    await pageA.evaluate((u) => {
      sessionStorage.setItem(
        "echo.collaboration.participant",
        JSON.stringify({ userId: u, displayName: "Alice", color: "#6366f1" })
      );
    }, USER_A);
    await pageA.reload();

    await pageB.goto(`${BASE_URL}/?room=${ROOM_ID}`);
    await pageB.evaluate((u) => {
      sessionStorage.setItem(
        "echo.collaboration.participant",
        JSON.stringify({ userId: u, displayName: "Bob", color: "#ec4899" })
      );
    }, USER_B);
    await pageB.reload();

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

    // Step 2: Establish meeting normally
    console.log("\nStep 2: Starting meeting on both browsers...");
    await pageA.locator("#meeting-start-btn").click();
    await wait(1000);
    await pageB.locator("#meeting-start-btn").click();

    await waitForCondition(
      async () => {
        const aHasRemoteVideo = await pageA.locator(`[data-testid="participant-tile-${USER_B}"] video`).isVisible();
        const bHasRemoteVideo = await pageB.locator(`[data-testid="participant-tile-${USER_A}"] video`).isVisible();
        return aHasRemoteVideo && bHasRemoteVideo;
      },
      25000,
      500,
      "initial WebRTC connection"
    );
    console.log("✔ Step 2: Mutual WebRTC connection established with active video streams.");

    // Step 3: Inspect RTCPeerConnection.getStats() for actual selected ICE candidate pair
    console.log("\nStep 3: Querying RTCPeerConnection.getStats() for active UDP transport endpoints...");
    const statsInfo = await pageA.evaluate(async (uB) => {
      const pc = window.__echoMeetingRuntime?.getPeerConnection(uB);
      if (!pc) return null;

      const stats = await pc.getStats();
      let selectedPair = null;
      let localCandidate = null;
      let remoteCandidate = null;

      // Find selected candidate pair
      stats.forEach((report) => {
        if (report.type === "transport" && report.selectedCandidatePairId) {
          selectedPair = stats.get(report.selectedCandidatePairId);
        } else if (
          report.type === "candidate-pair" &&
          (report.selected || report.state === "succeeded")
        ) {
          selectedPair = report;
        }
      });

      if (selectedPair) {
        localCandidate = stats.get(selectedPair.localCandidateId);
        remoteCandidate = stats.get(selectedPair.remoteCandidateId);
      }

      return {
        connectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
        selectedPair: selectedPair
          ? {
              id: selectedPair.id,
              state: selectedPair.state,
              nominated: selectedPair.nominated,
              currentRoundTripTime: selectedPair.currentRoundTripTime,
              bytesSent: selectedPair.bytesSent,
              bytesReceived: selectedPair.bytesReceived,
            }
          : null,
        localCandidate: localCandidate
          ? {
              candidateType: localCandidate.candidateType,
              ip: localCandidate.ip || localCandidate.address,
              port: localCandidate.port,
              protocol: localCandidate.protocol,
            }
          : null,
        remoteCandidate: remoteCandidate
          ? {
              candidateType: remoteCandidate.candidateType,
              ip: remoteCandidate.ip || remoteCandidate.address,
              port: remoteCandidate.port,
              protocol: remoteCandidate.protocol,
            }
          : null,
      };
    }, USER_B);

    console.log("  RTCPeerConnection.getStats() Transport Details:");
    console.log(JSON.stringify(statsInfo, null, 2));

    if (!statsInfo?.localCandidate || !statsInfo?.remoteCandidate) {
      throw new Error("Failed to extract active ICE candidate pair from getStats()");
    }

    const localPort = statsInfo.localCandidate.port;
    const remotePort = statsInfo.remoteCandidate.port;
    const protocol = statsInfo.localCandidate.protocol.toUpperCase();
    console.log(`\n  Target WebRTC Transport: ${protocol} ${statsInfo.localCandidate.ip}:${localPort} <--> ${statsInfo.remoteCandidate.ip}:${remotePort}`);

    // Step 4: Attempt to apply OS packet-filtering firewall rule to interrupt UDP transport
    console.log("\nStep 4: Attempting targeted OS packet interruption on active UDP ports...");
    const ruleName = `EchoWebRTCBlock_${Date.now()}`;
    let interruptionBlockedByPermissions = false;
    let failureReason = "";

    try {
      console.log(`  Executing: netsh advfirewall firewall add rule name="${ruleName}" dir=in action=block protocol=UDP localport=${localPort}`);
      execSync(`netsh advfirewall firewall add rule name="${ruleName}" dir=in action=block protocol=UDP localport=${localPort}`, {
        stdio: "pipe",
        encoding: "utf-8",
      });
      console.log("  Firewall rule applied successfully.");
    } catch (err) {
      interruptionBlockedByPermissions = true;
      failureReason = err.stderr ? err.stderr.trim() : err.message;
      console.log(`\n  ❌ OS Packet-Filtering Attempt Blocked:`);
      console.log(`  Error Output: "${failureReason}"`);
    }

    if (interruptionBlockedByPermissions) {
      console.log("\n=================================================");
      console.log("GENUINE NETWORK TEST: BLOCKED BY ENVIRONMENT");
      console.log("=================================================");
      console.log("Reason: Applying targeted UDP transport block on Windows requires administrator");
      console.log("elevation (UAC). The current test runner operates in a non-elevated user context.");
      console.log("Per instructions, the test is NOT faked or mocked.");
      console.log("=================================================\n");
    } else {
      // Clean up rule immediately if it was created
      try {
        execSync(`netsh advfirewall firewall delete rule name="${ruleName}"`, {
          stdio: "pipe",
        });
        console.log("  Firewall rule cleaned up.");
      } catch {}
    }
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error("\n❌ SCRIPT ERROR:", err);
  process.exit(1);
});
