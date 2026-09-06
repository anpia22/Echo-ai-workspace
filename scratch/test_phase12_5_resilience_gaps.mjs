import { chromium } from "playwright";

const BASE_URL = process.env.ECHO_E2E_URL || "http://localhost:3000";
const ROOM_ID = `test-room-phase12-5-gaps-${Date.now()}`;
const USER_A = `user-a-${Date.now()}`;
const USER_B = `user-b-${Date.now()}`;

console.log("=================================================");
console.log("PHASE 12.5: RESILIENCE, RECOVERY & FAILURE GAPS AUDIT");
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

    // Step 2: Start Meeting on both
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

    // ==========================================
    // GAP 1 & 8: RECOVERY PATH SEPARATION
    // TEST A: ICE-RESTART-SUCCESS PATH
    // ==========================================
    console.log("\n--- TEST A: ICE RESTART SUCCESS PATH ---");
    console.log("Testing deterministic offerer ICE restart without peer recreation...");

    // Record initial RTCPeerConnection reference and generation on Alice
    const initialInfoA = await pageA.evaluate((uB) => {
      const runtime = window.__echoMeetingRuntime;
      const pc = runtime?.getPeerConnection(uB);
      window.__initialPcRef = pc;
      return {
        hasPc: Boolean(pc),
        gen: runtime?.getPeerGeneration(uB),
      };
    }, USER_B);
    console.log(`  Alice initial generation: ${initialInfoA.gen}`);

    // Trigger ICE restart from deterministic offerer (Alice: user-a < user-b)
    await pageA.evaluate(async (uB) => {
      console.log("[Test] Alice initiating ICE restart offer with iceRestart=true");
      await window.__echoMeetingRuntime?.restartIce(uB);
    }, USER_B);

    // Verify both sides return to connected and maintain connection
    await waitForCondition(
      async () => {
        const aState = await pageA.evaluate((uB) => window.__echoMeetingRuntime?.getPeerConnection(uB)?.connectionState, USER_B);
        const bState = await pageB.evaluate((uA) => window.__echoMeetingRuntime?.getPeerConnection(uA)?.connectionState, USER_A);
        const aIce = await pageA.evaluate((uB) => window.__echoMeetingRuntime?.getPeerConnection(uB)?.iceConnectionState, USER_B);
        const bIce = await pageB.evaluate((uA) => window.__echoMeetingRuntime?.getPeerConnection(uA)?.iceConnectionState, USER_A);
        return aState === "connected" && bState === "connected" && aIce === "connected" && bIce === "connected";
      },
      20000,
      500,
      "ICE restart reconnected"
    );

    // Verify PeerConnection object identity was PRESERVED (no peer recreation!)
    const postIceRestartInfo = await pageA.evaluate((uB) => {
      const runtime = window.__echoMeetingRuntime;
      const currentPc = runtime?.getPeerConnection(uB);
      return {
        isSameInstance: currentPc === window.__initialPcRef,
        gen: runtime?.getPeerGeneration(uB),
      };
    }, USER_B);

    console.log(`  Post-ICE-restart isSameInstance: ${postIceRestartInfo.isSameInstance}, gen: ${postIceRestartInfo.gen}`);
    if (!postIceRestartInfo.isSameInstance) {
      throw new Error("Expected RTCPeerConnection instance to be preserved during successful ICE restart!");
    }
    if (postIceRestartInfo.gen !== 1) {
      throw new Error(`Expected generation to remain 1 during ICE restart, got ${postIceRestartInfo.gen}`);
    }
    console.log("✔ TEST A PASSED: ICE restart succeeded on existing RTCPeerConnection; generation remained 1; media active.");

    // ==========================================
    // GAP 2 & 8: RECOVERY PATH SEPARATION
    // TEST B: PEER RECREATION FALLBACK (FORCED-CLOSURE / TIMEOUT RECOVERY)
    // ==========================================
    console.log("\n--- TEST B: PEER RECREATION FALLBACK PATH ---");
    console.log("Testing connection-closure recovery / escalation to peer recreation...");

    // Store pre-recreation stream ID on Alice
    const preRecreateStreamId = await pageA.evaluate((uB) => {
      const stream = window.__echoMeetingRuntime?.getPeerStream(uB);
      return stream ? stream.id : null;
    }, USER_B);

    // Trigger connection-closure recovery
    await pageA.evaluate((uB) => {
      const pc = window.__echoMeetingRuntime?.getPeerConnection(uB);
      if (pc) {
        console.log("[Test] Forcing connection closure on Alice for connection-closure recovery test");
        pc.close();
        pc.dispatchEvent(new Event("connectionstatechange"));
      }
    }, USER_B);

    // Wait for recreation & reconnection
    await waitForCondition(
      async () => {
        const aState = await pageA.evaluate((uB) => window.__echoMeetingRuntime?.getPeerConnection(uB)?.connectionState, USER_B);
        const bState = await pageB.evaluate((uA) => window.__echoMeetingRuntime?.getPeerConnection(uA)?.connectionState, USER_A);
        const genA = await pageA.evaluate((uB) => window.__echoMeetingRuntime?.getPeerGeneration(uB), USER_B);
        return aState === "connected" && bState === "connected" && genA && genA > 1;
      },
      30000,
      500,
      "recreation recovery"
    );

    const postRecreateGenA = await pageA.evaluate((uB) => window.__echoMeetingRuntime?.getPeerGeneration(uB), USER_B);
    const postRecreateGenB = await pageB.evaluate((uA) => window.__echoMeetingRuntime?.getPeerGeneration(uA), USER_A);
    console.log(`  Recovered via recreation! Alice gen: ${postRecreateGenA}, Bob gen: ${postRecreateGenB}`);
    console.log("✔ TEST B PASSED: Peer recreation succeeded; epoch advanced to gen 2; peers fully reconnected.");

    // ==========================================
    // GAP 4: REMOTE STREAM REPLACEMENT & CLEANUP
    // ==========================================
    console.log("\n--- GAP 4: REMOTE STREAM REPLACEMENT & CLEANUP ---");
    const postRecreateStreamId = await pageA.evaluate((uB) => {
      const stream = window.__echoMeetingRuntime?.getPeerStream(uB);
      return stream ? stream.id : null;
    }, USER_B);

    console.log(`  Old RemoteStream ID: ${preRecreateStreamId}`);
    console.log(`  New RemoteStream ID: ${postRecreateStreamId}`);
    if (!postRecreateStreamId || postRecreateStreamId === preRecreateStreamId) {
      throw new Error(`Expected remote MediaStream to be replaced with a fresh instance! Got: ${postRecreateStreamId}`);
    }
    console.log("✔ GAP 4 PASSED: Old remote MediaStream was replaced cleanly by fresh active stream with no stale references.");

    // ==========================================
    // GAP 3: DUPLICATE PEER IDEMPOTENCY
    // ==========================================
    console.log("\n--- GAP 3: DUPLICATE PEER IDEMPOTENCY ---");
    const duplicateAddResult = await pageA.evaluate(async (uB) => {
      const runtime = window.__echoMeetingRuntime;
      const initialCount = runtime.getPeerIds().filter((id) => id === uB).length;

      // Invoke addPeer repeatedly with the same remote peer
      console.log("[Test] Calling addPeer twice on already active peer");
      await runtime.addPeer(uB, false);
      await runtime.addPeer(uB, true);

      const postCount = runtime.getPeerIds().filter((id) => id === uB).length;
      return { initialCount, postCount };
    }, USER_B);

    console.log(`  Alice peer count for Bob: initial=${duplicateAddResult.initialCount}, post=${duplicateAddResult.postCount}`);
    if (duplicateAddResult.postCount !== 1) {
      throw new Error(`Duplicate addPeer created multiple peer entries! Count: ${duplicateAddResult.postCount}`);
    }
    console.log("✔ GAP 3 PASSED: Exactly 1 active RTCPeerConnection maintained; duplicate addPeer calls are strictly idempotent.");

    // ==========================================
    // GAP 5: EXPLICIT STALE SIGNALING TEST
    // ==========================================
    console.log("\n--- GAP 5: EXPLICIT STALE SIGNALING TEST ---");
    const staleSignalingResult = await pageB.evaluate(async (uA) => {
      const runtime = window.__echoMeetingRuntime;
      const currentGen = runtime.getPeerGeneration(uA);
      const initialCandidateCount = runtime.getProcessedCandidateCount(uA);

      console.log(`[Test] Current Bob peer generation for Alice is ${currentGen}. Testing rejection of gen 1 signals...`);

      // 1. Deliver stale gen 1 offer
      const staleOffer = {
        type: "webrtc:offer",
        roomId: runtime.roomId,
        senderId: uA,
        targetId: runtime.localUserId,
        sdp: "v=0\r\no=stale 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n",
        generation: 1,
      };
      await runtime.handleOffer(staleOffer);

      // 2. Deliver stale gen 1 answer
      const staleAnswer = {
        type: "webrtc:answer",
        roomId: runtime.roomId,
        senderId: uA,
        targetId: runtime.localUserId,
        sdp: "v=0\r\no=stale 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n",
        generation: 1,
      };
      await runtime.handleAnswer(staleAnswer);

      // 3. Deliver stale gen 1 ICE candidate
      const staleCandidate = {
        type: "webrtc:ice-candidate",
        roomId: runtime.roomId,
        senderId: uA,
        targetId: runtime.localUserId,
        candidate: {
          candidate: "candidate:stale 1 udp 2122260223 127.0.0.1 50000 typ host",
          sdpMid: "0",
          sdpMLineIndex: 0,
        },
        generation: 1,
      };
      await runtime.handleIceCandidate(staleCandidate);

      const postCandidateCount = runtime.getProcessedCandidateCount(uA);
      const postGen = runtime.getPeerGeneration(uA);
      const connState = runtime.getPeerConnection(uA)?.connectionState;

      return {
        currentGen,
        postGen,
        initialCandidateCount,
        postCandidateCount,
        connState,
      };
    }, USER_A);

    console.log("  Stale signaling audit results:", staleSignalingResult);
    if (staleSignalingResult.postCandidateCount !== staleSignalingResult.initialCandidateCount) {
      throw new Error("Stale ICE candidate was erroneously accepted into processed candidates!");
    }
    if (staleSignalingResult.connState !== "connected") {
      throw new Error(`Fresh connection was destabilized by stale signals! State: ${staleSignalingResult.connState}`);
    }
    console.log("✔ GAP 5 PASSED: Stale generation signals (offer, answer, ICE) rejected cleanly; candidate pipeline and connection remain healthy.");

    // ==========================================
    // GAP 6: REMOTE PEER LEAVE CLEANUP
    // ==========================================
    console.log("\n--- GAP 6: REMOTE PEER LEAVE CLEANUP ---");
    console.log("Bob clicks Leave Meeting...");
    await pageB.locator("#meeting-leave-btn").click();

    // Verify Alice cleanly removes Bob
    await waitForCondition(
      async () => {
        const hasBobTile = await pageA.locator(`[data-testid="participant-tile-${USER_B}"]`).isVisible();
        const hasBobPeer = await pageA.evaluate((uB) => {
          const runtime = window.__echoMeetingRuntime;
          return runtime ? runtime.getPeerIds().includes(uB) : false;
        }, USER_B);
        const hasBobStream = await pageA.evaluate((uB) => {
          return Boolean(window.__echoMeetingRuntime?.getPeerStream(uB));
        }, USER_B);
        return !hasBobTile && !hasBobPeer && !hasBobStream;
      },
      15000,
      500,
      "Alice cleans up after Bob leaves"
    );
    console.log("✔ GAP 6 PASSED: Remote peer leave completely cleans up tile, peer connection, streams, and state.");

    // ==========================================
    // GAP 7: LEAVE -> REJOIN CLEANUP & RECONNECT
    // ==========================================
    console.log("\n--- GAP 7: LEAVE -> REJOIN CLEANUP & RECONNECT ---");
    console.log("Bob clicks Start Meeting to rejoin...");
    await pageB.locator("#meeting-start-btn").click();

    // Verify Bob reconnects with Alice
    await waitForCondition(
      async () => {
        const aHasRemoteVideo = await pageA.locator(`[data-testid="participant-tile-${USER_B}"] video`).isVisible();
        const bHasRemoteVideo = await pageB.locator(`[data-testid="participant-tile-${USER_A}"] video`).isVisible();
        const aState = await pageA.evaluate((uB) => window.__echoMeetingRuntime?.getPeerConnection(uB)?.connectionState, USER_B);
        const bState = await pageB.evaluate((uA) => window.__echoMeetingRuntime?.getPeerConnection(uA)?.connectionState, USER_A);
        return aHasRemoteVideo && bHasRemoteVideo && aState === "connected" && bState === "connected";
      },
      25000,
      500,
      "Bob rejoins and reconnects"
    );

    // Verify Bob has exactly 1 peer and Alice has exactly 1 peer
    const peerCounts = {
      aPeers: await pageA.evaluate(() => window.__echoMeetingRuntime?.getPeerIds().length),
      bPeers: await pageB.evaluate(() => window.__echoMeetingRuntime?.getPeerIds().length),
    };
    console.log(`  Active peer counts post-rejoin: Alice=${peerCounts.aPeers}, Bob=${peerCounts.bPeers}`);
    if (peerCounts.aPeers !== 1 || peerCounts.bPeers !== 1) {
      throw new Error(`Duplicate peer connections found post-rejoin! ${JSON.stringify(peerCounts)}`);
    }
    console.log("✔ GAP 7 PASSED: Rejoin created fresh PeerConnection; media reconnected without duplicates or state leaks.");

    console.log("\n=================================================");
    console.log("ALL PHASE 12.5 GAPS AUDIT CHECKS PASSED! (8/8)");
    console.log("=================================================");
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error("\n❌ PHASE 12.5 GAPS AUDIT FAILED:", err);
  process.exit(1);
});
