/**
 * Phase 12.1 - Audio/Video Meeting Architecture & Foundation
 *
 * Media Hardware Lifecycle, Track Teardown, Hardware Error Categorization,
 * and RTCPeerConnection Lifecycle Management.
 */

import type {
  MediaAcquisitionError,
} from "./meetingTypes";

// ==========================================
// 1. ENVIRONMENT / API CAPABILITY CHECK
// ==========================================

export function isMediaDevicesSupported(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  return Boolean(
    navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

export function isDisplayMediaSupported(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  return Boolean(
    navigator.mediaDevices &&
      typeof navigator.mediaDevices.getDisplayMedia === "function"
  );
}

// ==========================================
// 2. ERROR CATEGORIZATION
// ==========================================

export function categorizeMediaError(error: unknown): MediaAcquisitionError {
  if (error instanceof Error) {
    const name = error.name;

    switch (name) {
      case "NotAllowedError":
      case "PermissionDeniedError":
        return {
          code: "PERMISSION_DENIED",
          name,
          message:
            "Camera or microphone access was denied. Please check browser site permissions.",
          originalError: error,
        };

      case "NotFoundError":
      case "DevicesNotFoundError":
        return {
          code: "NOT_FOUND",
          name,
          message: "No suitable microphone or camera device was found on this system.",
          originalError: error,
        };

      case "NotReadableError":
      case "TrackStartError":
        return {
          code: "NOT_READABLE",
          name,
          message:
            "Hardware device is already in use by another application or operating system process.",
          originalError: error,
        };

      case "OverconstrainedError":
      case "ConstraintNotSatisfiedError":
        return {
          code: "OVERCONSTRAINED",
          name,
          message:
            "The requested media constraints (e.g. resolution/device) could not be satisfied.",
          originalError: error,
        };

      case "SecurityError":
        return {
          code: "SECURITY_ERROR",
          name,
          message:
            "Media access was blocked due to security restrictions or an insecure context.",
          originalError: error,
        };

      case "AbortError":
        return {
          code: "USER_CANCELLED",
          name,
          message: "Media selection was cancelled by the user.",
          originalError: error,
        };

      default:
        return {
          code: "UNKNOWN_ERROR",
          name,
          message: error.message || "An unexpected error occurred accessing media hardware.",
          originalError: error,
        };
    }
  }

  return {
    code: "UNKNOWN_ERROR",
    name: "UnknownError",
    message: String(error) || "An unknown media acquisition error occurred.",
    originalError: error,
  };
}

// ==========================================
// 3. MEDIA STREAM ACQUISITION
// ==========================================

export type AcquireMediaResult = {
  stream: MediaStream | null;
  error: MediaAcquisitionError | null;
};

/**
 * Safely acquire local audio/video MediaStream.
 * Must only be invoked after explicit user interaction.
 */
export async function acquireUserMedia(
  constraints: MediaStreamConstraints = { audio: true, video: true }
): Promise<MediaStream> {
  if (!isMediaDevicesSupported()) {
    const error = new Error(
      "MediaDevices API is not supported in this browser or execution environment."
    );
    error.name = "NotSupportedError";
    throw error;
  }

  return await navigator.mediaDevices.getUserMedia(constraints);
}

/**
 * Safely acquire screen sharing MediaStream.
 * Must only be invoked after explicit user interaction.
 */
export async function acquireDisplayMedia(
  options: DisplayMediaStreamOptions = { video: true, audio: false }
): Promise<AcquireMediaResult> {
  if (!isDisplayMediaSupported()) {
    return {
      stream: null,
      error: {
        code: "UNSUPPORTED",
        name: "NotSupportedError",
        message: "Screen sharing is not supported in this browser or environment.",
      },
    };
  }

  try {
    const stream = await navigator.mediaDevices.getDisplayMedia(options);
    return {
      stream,
      error: null,
    };
  } catch (err) {
    return {
      stream: null,
      error: categorizeMediaError(err),
    };
  }
}

// ==========================================
// 4. RESOURCE CLEANUP & TEARDOWN
// ==========================================

/**
 * Stop every track in a MediaStream to prevent hardware lockup,
 * camera indicator lights staying on, or background resource leaks.
 */
export function stopAllTracks(
  stream: MediaStream | null | undefined
): void {
  if (!stream) {
    return;
  }

  try {
    const tracks = stream.getTracks();
    for (const track of tracks) {
      try {
        track.stop();
      } catch {
        // Track already closed or stopped
      }
    }
  } catch {
    // Stream may already be inactive
  }
}

/**
 * Release a MediaStream and all underlying audio/video tracks.
 * Idempotent and safe to call multiple times.
 */
export function releaseMediaStream(
  stream: MediaStream | null | undefined
): void {
  stopAllTracks(stream);
}

/**
 * Safely close an RTCPeerConnection:
 * 1. Stops all active transceivers/senders
 * 2. Clears event listeners
 * 3. Calls pc.close()
 */
export function closePeerConnection(
  pc: RTCPeerConnection | null | undefined
): void {
  if (!pc) {
    return;
  }

  try {
    // Stop local RTP senders
    const senders = pc.getSenders?.();
    if (Array.isArray(senders)) {
      for (const sender of senders) {
        if (sender.track) {
          try {
            sender.track.stop();
          } catch {
            // Ignore
          }
        }
      }
    }

    // Clear event handlers to prevent lingering callbacks
    pc.onicecandidate = null;
    pc.ontrack = null;
    pc.onconnectionstatechange = null;
    pc.onsignalingstatechange = null;
    pc.oniceconnectionstatechange = null;

    if (pc.signalingState !== "closed") {
      pc.close();
    }
  } catch {
    // Peer connection may already be closed
  }
}

/**
 * Standard WebRTC configuration for peer connections.
 * Uses standard public STUN servers for NAT traversal.
 */
export function createDefaultRtcConfiguration(): RTCConfiguration {
  return {
    iceServers: [
      {
        urls: [
          "stun:stun.l.google.com:19302",
          "stun:stun1.l.google.com:19302",
        ],
      },
    ],
    iceCandidatePoolSize: 10,
  };
}
