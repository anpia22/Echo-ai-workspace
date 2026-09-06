import assert from "node:assert/strict";
import { MeetingRuntime } from "../src/app/lib/collaboration/meeting/meetingRuntime.ts";

console.log("=================================================");
console.log("PHASE 12.5: MEDIA DEVICE FALLBACK & ERROR REPORTING");
console.log("=================================================");

class FakeMediaStreamTrack {
  constructor(kind) {
    this.kind = kind;
    this.enabled = true;
    this.readyState = "live";
  }
  stop() {
    this.readyState = "ended";
  }
  addEventListener() {}
  removeEventListener() {}
}

class FakeMediaStream {
  constructor(tracks = []) {
    this._tracks = tracks;
  }
  getTracks() {
    return [...this._tracks];
  }
  getAudioTracks() {
    return this._tracks.filter((t) => t.kind === "audio");
  }
  getVideoTracks() {
    return this._tracks.filter((t) => t.kind === "video");
  }
}

// Global mocks
globalThis.MediaStream = FakeMediaStream;
globalThis.window = globalThis;

function mockMediaDevices(getUserMediaFn) {
  Object.defineProperty(globalThis.navigator, "mediaDevices", {
    value: {
      getUserMedia: getUserMediaFn,
    },
    configurable: true,
    writable: true,
  });
}

async function testCameraFailsAudioSucceeds() {
  console.log("\nTest 1: Camera fails, audio succeeds -> meeting starts audio-only, records videoError");
  let reportedError = null;

  mockMediaDevices(async (constraints) => {
    if (constraints.audio && constraints.video) {
      throw new Error("OverconstrainedError: Camera device not found");
    }
    if (constraints.audio && !constraints.video) {
      return new FakeMediaStream([new FakeMediaStreamTrack("audio")]);
    }
    if (!constraints.audio && constraints.video) {
      throw new Error("OverconstrainedError: Camera device not found");
    }
    throw new Error("Unexpected constraints");
  });

  const runtime = new MeetingRuntime({
    roomId: "test-room",
    localUserId: "user-1",
    displayName: "Alice",
    callbacks: {
      onLocalStream: () => {},
      onRemoteStream: () => {},
      onRemoteStreamRemoved: () => {},
      onPeerStateChange: () => {},
      onError: () => {},
      onSignal: () => {},
      onMediaDeviceError: (device, msg) => {
        reportedError = { device, msg };
      },
    },
  });

  const stream = await runtime.start();
  assert.equal(stream.getAudioTracks().length, 1, "Audio track must be present");
  assert.equal(stream.getVideoTracks().length, 0, "Video track must be absent");
  assert.ok(reportedError, "onMediaDeviceError callback must have fired");
  assert.equal(reportedError.device, "video");
  assert.match(reportedError.msg, /Camera device not found/);
  console.log("✔ Test 1 passed: Audio meeting started, video error reported via callback.");
  await runtime.stop();
}

async function testMicFailsVideoSucceeds() {
  console.log("\nTest 2: Mic fails, video succeeds -> meeting starts video-only, records audioError");
  let reportedError = null;

  mockMediaDevices(async (constraints) => {
    if (constraints.audio && constraints.video) {
      throw new Error("NotAllowedError: Microphone permission denied");
    }
    if (constraints.audio && !constraints.video) {
      throw new Error("NotAllowedError: Microphone permission denied");
    }
    if (!constraints.audio && constraints.video) {
      return new FakeMediaStream([new FakeMediaStreamTrack("video")]);
    }
    throw new Error("Unexpected constraints");
  });

  const runtime = new MeetingRuntime({
    roomId: "test-room",
    localUserId: "user-2",
    displayName: "Bob",
    callbacks: {
      onLocalStream: () => {},
      onRemoteStream: () => {},
      onRemoteStreamRemoved: () => {},
      onPeerStateChange: () => {},
      onError: () => {},
      onSignal: () => {},
      onMediaDeviceError: (device, msg) => {
        reportedError = { device, msg };
      },
    },
  });

  const stream = await runtime.start();
  assert.equal(stream.getAudioTracks().length, 0, "Audio track must be absent");
  assert.equal(stream.getVideoTracks().length, 1, "Video track must be present");
  assert.ok(reportedError, "onMediaDeviceError callback must have fired");
  assert.equal(reportedError.device, "audio");
  assert.match(reportedError.msg, /Microphone permission denied/);
  console.log("✔ Test 2 passed: Video meeting started, audio error reported via callback.");
  await runtime.stop();
}

async function testBothFail() {
  console.log("\nTest 3: Both audio & video fail -> meeting fails with descriptive error");
  mockMediaDevices(async () => {
    throw new Error("NotFoundError: No media devices available");
  });

  const runtime = new MeetingRuntime({
    roomId: "test-room",
    localUserId: "user-3",
    displayName: "Charlie",
    callbacks: {
      onLocalStream: () => {},
      onRemoteStream: () => {},
      onRemoteStreamRemoved: () => {},
      onPeerStateChange: () => {},
      onError: () => {},
      onSignal: () => {},
    },
  });

  await assert.rejects(
    async () => {
      await runtime.start();
    },
    /No media devices available/
  );
  console.log("✔ Test 3 passed: Descriptive failure thrown when both devices fail.");
  await runtime.stop();
}

async function run() {
  await testCameraFailsAudioSucceeds();
  await testMicFailsVideoSucceeds();
  await testBothFail();
  console.log("\n=================================================");
  console.log("ALL DEVICE FALLBACK TESTS PASSED!");
  console.log("=================================================");
}

run().catch((err) => {
  console.error("❌ Fallback test failed:", err);
  process.exit(1);
});
