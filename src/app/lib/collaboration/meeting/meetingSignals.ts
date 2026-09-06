/**
 * Phase 12.1 - Audio/Video Meeting Architecture & Foundation
 *
 * Signaling Protocol Validators, Envelopes, Room Isolation,
 * and Pure State Reducers for WebRTC Mesh over Supabase Realtime.
 */

import {
  WEBRTC_OFFER_EVENT,
  WEBRTC_ANSWER_EVENT,
  WEBRTC_ICE_CANDIDATE_EVENT,
  MEDIA_STATE_EVENT,
  MEETING_LEAVE_EVENT,
  type MediaStateBroadcastPayload,
  type MeetingLeavePayload,
  type MeetingSignalingEnvelope,
  type ParticipantAudioState,
  type ParticipantMediaState,
  type ParticipantScreenShareState,
  type ParticipantVideoState,
  type WebRTCAnswerPayload,
  type WebRTCIceCandidatePayload,
  type WebRTCOfferPayload,
} from "./meetingTypes";

export type { MeetingSignalingEnvelope };
export {
  WEBRTC_OFFER_EVENT,
  WEBRTC_ANSWER_EVENT,
  WEBRTC_ICE_CANDIDATE_EVENT,
  MEDIA_STATE_EVENT,
  MEETING_LEAVE_EVENT,
};

// ==========================================
// 1. PRIMITIVE VALIDATORS & GUARDS
// ==========================================

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isValidTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function isValidSdp(
  value: unknown,
  expectedType: "offer" | "answer"
): value is RTCSessionDescriptionInit {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.type === expectedType &&
    typeof value.sdp === "string" &&
    value.sdp.length > 0
  );
}

export function isValidIceCandidate(
  value: unknown
): value is RTCIceCandidateInit {
  if (!isRecord(value)) {
    return false;
  }

  // A candidate object may have candidate string (or null/empty for end-of-candidates)
  const candidateValid =
    value.candidate === null ||
    value.candidate === undefined ||
    typeof value.candidate === "string";

  const sdpMidValid =
    value.sdpMid === null ||
    value.sdpMid === undefined ||
    typeof value.sdpMid === "string";

  const sdpMLineIndexValid =
    value.sdpMLineIndex === null ||
    value.sdpMLineIndex === undefined ||
    typeof value.sdpMLineIndex === "number";

  return candidateValid && sdpMidValid && sdpMLineIndexValid;
}

export function isValidAudioState(
  value: unknown
): value is ParticipantAudioState {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.isMuted === "boolean" &&
    typeof value.hasAudio === "boolean" &&
    (value.isSpeaking === undefined || typeof value.isSpeaking === "boolean")
  );
}

export function isValidVideoState(
  value: unknown
): value is ParticipantVideoState {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.isVideoOn === "boolean" &&
    typeof value.hasVideo === "boolean"
  );
}

export function isValidScreenShareState(
  value: unknown
): value is ParticipantScreenShareState {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.isSharing === "boolean";
}

// ==========================================
// 2. SIGNALING ENVELOPE PARSERS
// ==========================================

export function parseWebRTCOfferPayload(
  raw: unknown,
  currentRoomId: string,
  currentUserId: string
): WebRTCOfferPayload | null {
  if (!isRecord(raw)) return null;

  if (raw.type !== WEBRTC_OFFER_EVENT) return null;

  // Strict room isolation
  if (!isNonEmptyString(raw.roomId) || raw.roomId !== currentRoomId) return null;

  // Sender validation & self-event rejection
  if (!isNonEmptyString(raw.senderId) || raw.senderId === currentUserId) return null;

  // Target validation: offer must be addressed directly to this peer
  if (!isNonEmptyString(raw.targetId) || raw.targetId !== currentUserId) return null;

  // SDP validation
  if (!isValidSdp(raw.sdp, "offer")) return null;

  // Timestamp validation
  if (!isValidTimestamp(raw.timestamp)) return null;

  const generation =
    typeof raw.generation === "number" &&
    Number.isFinite(raw.generation) &&
    raw.generation > 0
      ? raw.generation
      : undefined;

  return {
    type: WEBRTC_OFFER_EVENT,
    roomId: raw.roomId,
    senderId: raw.senderId,
    targetId: raw.targetId,
    sdp: raw.sdp,
    ...(generation !== undefined ? { generation } : {}),
    timestamp: raw.timestamp,
  };
}

export function parseWebRTCAnswerPayload(
  raw: unknown,
  currentRoomId: string,
  currentUserId: string
): WebRTCAnswerPayload | null {
  if (!isRecord(raw)) return null;

  if (raw.type !== WEBRTC_ANSWER_EVENT) return null;

  // Strict room isolation
  if (!isNonEmptyString(raw.roomId) || raw.roomId !== currentRoomId) return null;

  // Sender validation & self-event rejection
  if (!isNonEmptyString(raw.senderId) || raw.senderId === currentUserId) return null;

  // Target validation: answer must be addressed directly to this peer
  if (!isNonEmptyString(raw.targetId) || raw.targetId !== currentUserId) return null;

  // SDP validation
  if (!isValidSdp(raw.sdp, "answer")) return null;

  // Timestamp validation
  if (!isValidTimestamp(raw.timestamp)) return null;

  const generation =
    typeof raw.generation === "number" &&
    Number.isFinite(raw.generation) &&
    raw.generation > 0
      ? raw.generation
      : undefined;

  return {
    type: WEBRTC_ANSWER_EVENT,
    roomId: raw.roomId,
    senderId: raw.senderId,
    targetId: raw.targetId,
    sdp: raw.sdp,
    ...(generation !== undefined ? { generation } : {}),
    timestamp: raw.timestamp,
  };
}

export function parseWebRTCIceCandidatePayload(
  raw: unknown,
  currentRoomId: string,
  currentUserId: string
): WebRTCIceCandidatePayload | null {
  if (!isRecord(raw)) return null;

  if (raw.type !== WEBRTC_ICE_CANDIDATE_EVENT) return null;

  // Strict room isolation
  if (!isNonEmptyString(raw.roomId) || raw.roomId !== currentRoomId) return null;

  // Sender validation & self-event rejection
  if (!isNonEmptyString(raw.senderId) || raw.senderId === currentUserId) return null;

  // Target validation: candidate must be addressed to this peer
  if (!isNonEmptyString(raw.targetId) || raw.targetId !== currentUserId) return null;

  // Candidate validation
  if (!isValidIceCandidate(raw.candidate)) return null;

  // Timestamp validation
  if (!isValidTimestamp(raw.timestamp)) return null;

  const generation =
    typeof raw.generation === "number" &&
    Number.isFinite(raw.generation) &&
    raw.generation > 0
      ? raw.generation
      : undefined;

  return {
    type: WEBRTC_ICE_CANDIDATE_EVENT,
    roomId: raw.roomId,
    senderId: raw.senderId,
    targetId: raw.targetId,
    candidate: raw.candidate,
    ...(generation !== undefined ? { generation } : {}),
    timestamp: raw.timestamp,
  };
}

export function parseMediaStateBroadcastPayload(
  raw: unknown,
  currentRoomId: string,
  currentUserId: string
): MediaStateBroadcastPayload | null {
  if (!isRecord(raw)) return null;

  if (raw.type !== MEDIA_STATE_EVENT) return null;

  // Strict room isolation
  if (!isNonEmptyString(raw.roomId) || raw.roomId !== currentRoomId) return null;

  // Sender validation & self-event rejection
  if (!isNonEmptyString(raw.senderId) || raw.senderId === currentUserId) return null;

  // Media state schemas
  if (!isValidAudioState(raw.audioState)) return null;
  if (!isValidVideoState(raw.videoState)) return null;
  if (!isValidScreenShareState(raw.screenShareState)) return null;

  // Timestamp validation
  if (!isValidTimestamp(raw.timestamp)) return null;

  return {
    type: MEDIA_STATE_EVENT,
    roomId: raw.roomId,
    senderId: raw.senderId,
    audioState: raw.audioState,
    videoState: raw.videoState,
    screenShareState: raw.screenShareState,
    timestamp: raw.timestamp,
  };
}

export function parseMeetingLeavePayload(
  raw: unknown,
  currentRoomId: string,
  currentUserId: string
): MeetingLeavePayload | null {
  if (!isRecord(raw)) return null;

  if (raw.type !== MEETING_LEAVE_EVENT) return null;

  // Strict room isolation
  if (!isNonEmptyString(raw.roomId) || raw.roomId !== currentRoomId) return null;

  // Sender validation & self-event rejection
  if (!isNonEmptyString(raw.senderId) || raw.senderId === currentUserId) return null;

  // Timestamp validation
  if (!isValidTimestamp(raw.timestamp)) return null;

  return {
    type: MEETING_LEAVE_EVENT,
    roomId: raw.roomId,
    senderId: raw.senderId,
    timestamp: raw.timestamp,
  };
}

export function parseMeetingSignalingEnvelope(
  raw: unknown,
  currentRoomId: string,
  currentUserId: string
): MeetingSignalingEnvelope | null {
  if (!isRecord(raw) || typeof raw.type !== "string") {
    return null;
  }

  switch (raw.type) {
    case WEBRTC_OFFER_EVENT:
      return parseWebRTCOfferPayload(raw, currentRoomId, currentUserId);
    case WEBRTC_ANSWER_EVENT:
      return parseWebRTCAnswerPayload(raw, currentRoomId, currentUserId);
    case WEBRTC_ICE_CANDIDATE_EVENT:
      return parseWebRTCIceCandidatePayload(raw, currentRoomId, currentUserId);
    case MEDIA_STATE_EVENT:
      return parseMediaStateBroadcastPayload(raw, currentRoomId, currentUserId);
    case MEETING_LEAVE_EVENT:
      return parseMeetingLeavePayload(raw, currentRoomId, currentUserId);
    default:
      return null;
  }
}

// ==========================================
// 3. SIGNALING PAYLOAD BUILDERS
// ==========================================

export function buildOfferPayload(
  roomId: string,
  senderId: string,
  targetId: string,
  sdp: RTCSessionDescriptionInit | string,
  generation?: number
): WebRTCOfferPayload {
  return {
    type: WEBRTC_OFFER_EVENT,
    roomId,
    senderId,
    targetId,
    sdp: typeof sdp === "string" ? { type: "offer", sdp } : sdp,
    ...(generation !== undefined ? { generation } : {}),
    timestamp: Date.now(),
  };
}

export function buildAnswerPayload(
  roomId: string,
  senderId: string,
  targetId: string,
  sdp: RTCSessionDescriptionInit | string,
  generation?: number
): WebRTCAnswerPayload {
  return {
    type: WEBRTC_ANSWER_EVENT,
    roomId,
    senderId,
    targetId,
    sdp: typeof sdp === "string" ? { type: "answer", sdp } : sdp,
    ...(generation !== undefined ? { generation } : {}),
    timestamp: Date.now(),
  };
}

export function buildIceCandidatePayload(
  roomId: string,
  senderId: string,
  targetId: string,
  candidate: RTCIceCandidateInit,
  generation?: number
): WebRTCIceCandidatePayload {
  return {
    type: WEBRTC_ICE_CANDIDATE_EVENT,
    roomId,
    senderId,
    targetId,
    candidate,
    ...(generation !== undefined ? { generation } : {}),
    timestamp: Date.now(),
  };
}

export function buildMediaStatePayload(
  roomId: string,
  senderId: string,
  audioState: ParticipantAudioState,
  videoState: ParticipantVideoState,
  screenShareState: ParticipantScreenShareState
): MediaStateBroadcastPayload {
  return {
    type: MEDIA_STATE_EVENT,
    roomId,
    senderId,
    audioState,
    videoState,
    screenShareState,
    timestamp: Date.now(),
  };
}

export function buildMeetingLeavePayload(
  roomId: string,
  senderId: string
): MeetingLeavePayload {
  return {
    type: MEETING_LEAVE_EVENT,
    roomId,
    senderId,
    timestamp: Date.now(),
  };
}

// ==========================================
// 4. PURE PARTICIPANT MEDIA STATE REDUCERS
// ==========================================

export function applyMediaStateUpdate(
  currentParticipants: Map<string, ParticipantMediaState>,
  payload: MediaStateBroadcastPayload,
  meta?: { displayName: string; color: string }
): Map<string, ParticipantMediaState> {
  const next = new Map(currentParticipants);
  const existing = next.get(payload.senderId);

  const updated: ParticipantMediaState = {
    userId: payload.senderId,
    displayName: meta?.displayName || existing?.displayName || `User ${payload.senderId.slice(0, 4)}`,
    color: meta?.color || existing?.color || "#3b82f6",
    connectionState: existing?.connectionState ?? "connecting",
    audioState: payload.audioState,
    videoState: payload.videoState,
    screenShareState: payload.screenShareState,
    joinedAt: existing?.joinedAt ?? payload.timestamp,
  };

  next.set(payload.senderId, updated);
  return next;
}

export function applyMeetingLeave(
  currentParticipants: Map<string, ParticipantMediaState>,
  senderId: string
): Map<string, ParticipantMediaState> {
  if (!currentParticipants.has(senderId)) {
    return currentParticipants;
  }

  const next = new Map(currentParticipants);
  next.delete(senderId);
  return next;
}

export function pruneDisconnectedPeers(
  currentParticipants: Map<string, ParticipantMediaState>,
  activePresenceIds: Set<string>
): Map<string, ParticipantMediaState> {
  let changed = false;
  for (const userId of currentParticipants.keys()) {
    if (!activePresenceIds.has(userId)) {
      changed = true;
      break;
    }
  }

  if (!changed) {
    return currentParticipants;
  }

  const next = new Map<string, ParticipantMediaState>();
  for (const [userId, state] of currentParticipants.entries()) {
    if (activePresenceIds.has(userId)) {
      next.set(userId, state);
    }
  }

  return next;
}

/**
 * Screen sharing resolution rule:
 * Only one active presenter should exist per room.
 * Resolves whether the local user or a remote participant is the active presenter.
 */
export function resolveActivePresenter(
  participants: Map<string, ParticipantMediaState>,
  localIsSharing: boolean,
  localUserId: string
): string | null {
  if (localIsSharing) {
    return localUserId;
  }

  for (const [userId, participant] of participants.entries()) {
    if (participant.screenShareState?.isSharing) {
      return userId;
    }
  }

  return null;
}
