/**
 * Phase 12.1 - Audio/Video Meeting Architecture & Foundation
 *
 * Core meeting domain types, peer lifecycle definitions,
 * signaling contracts, and strict CanvasState isolation.
 */

// ==========================================
// 1. STRICT CANVAS STATE (UNCHANGED / SACRED)
// ==========================================

export type CanvasNode = {
  id: string;
  nodeType: string;
  title: string;
  description?: string;
  position: {
    x: number;
    y: number;
  };
};

export type CanvasEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  relationship?: string;
};

export type CanvasGroup = {
  id: string;
  title: string;
  memberIds: string[];
};

/**
 * CanvasState must remain strictly: nodes, edges, groups.
 * Meeting/media/peer/audio/video state must NEVER be added to CanvasState.
 */
export type CanvasState = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  groups: CanvasGroup[];
};

// ==========================================
// 2. PEER & MEETING LIFECYCLE
// ==========================================

/**
 * Peer connection lifecycle:
 * idle -> joining -> connecting -> connected -> leaving -> closed
 */
export type MeetingPeerConnectionState =
  | "idle"
  | "joining"
  | "connecting"
  | "connected"
  | "leaving"
  | "closed"
  | "failed";

/**
 * High-level meeting status of the local participant.
 */
export type MeetingStatus =
  | "idle"
  | "joining"
  | "in-meeting"
  | "leaving"
  | "error";

// ==========================================
// 3. MEDIA STATE MODELS (EPHEMERAL ONLY)
// ==========================================

export type LocalMediaState = {
  micEnabled: boolean;
  cameraEnabled: boolean;
  screenShareEnabled: boolean;
  audioDeviceId?: string | null;
  videoDeviceId?: string | null;
  audioError?: string | null;
  videoError?: string | null;
  screenError?: string | null;
};

export type ParticipantAudioState = {
  isMuted: boolean;
  hasAudio: boolean;
  isSpeaking?: boolean;
};

export type ParticipantVideoState = {
  isVideoOn: boolean;
  hasVideo: boolean;
};

export type ParticipantScreenShareState = {
  isSharing: boolean;
};

export type ParticipantMediaState = {
  userId: string;
  displayName: string;
  color: string;
  connectionState: MeetingPeerConnectionState;
  audioState: ParticipantAudioState;
  videoState: ParticipantVideoState;
  screenShareState: ParticipantScreenShareState;
  joinedAt?: number;
};

/**
 * Complete in-memory Meeting State.
 * NEVER persisted to localStorage or conversation history.
 */
export type MeetingState = {
  status: MeetingStatus;
  roomId: string | null;
  localMedia: LocalMediaState;
  participants: Map<string, ParticipantMediaState>;
  activePresenterId: string | null;
  activeSpeakerId: string | null;
  error: string | null;
};

// ==========================================
// 4. SIGNALING PROTOCOL CONTRACTS
// ==========================================

export const WEBRTC_OFFER_EVENT = "webrtc:offer";
export const WEBRTC_ANSWER_EVENT = "webrtc:answer";
export const WEBRTC_ICE_CANDIDATE_EVENT = "webrtc:ice-candidate";
export const MEDIA_STATE_EVENT = "meeting:media-state";
export const MEETING_LEAVE_EVENT = "meeting:leave";

export type WebRTCOfferPayload = {
  type: typeof WEBRTC_OFFER_EVENT;
  roomId: string;
  senderId: string;
  targetId: string;
  sdp: RTCSessionDescriptionInit | string;
  generation?: number;
  timestamp: number;
};

export type WebRTCAnswerPayload = {
  type: typeof WEBRTC_ANSWER_EVENT;
  roomId: string;
  senderId: string;
  targetId: string;
  sdp: RTCSessionDescriptionInit | string;
  generation?: number;
  timestamp: number;
};

export type WebRTCIceCandidatePayload = {
  type: typeof WEBRTC_ICE_CANDIDATE_EVENT;
  roomId: string;
  senderId: string;
  targetId: string;
  candidate: RTCIceCandidateInit;
  generation?: number;
  timestamp: number;
};

export type MediaStateBroadcastPayload = {
  type: typeof MEDIA_STATE_EVENT;
  roomId: string;
  senderId: string;
  audioState: ParticipantAudioState;
  videoState: ParticipantVideoState;
  screenShareState: ParticipantScreenShareState;
  timestamp: number;
};

export type MeetingLeavePayload = {
  type: typeof MEETING_LEAVE_EVENT;
  roomId: string;
  senderId: string;
  timestamp: number;
};

export type MeetingSignalingEnvelope =
  | WebRTCOfferPayload
  | WebRTCAnswerPayload
  | WebRTCIceCandidatePayload
  | MediaStateBroadcastPayload
  | MeetingLeavePayload;

// ==========================================
// 5. MEDIA ACQUISITION ERROR MODEL
// ==========================================

export type MediaErrorCode =
  | "PERMISSION_DENIED"
  | "NOT_FOUND"
  | "NOT_READABLE"
  | "OVERCONSTRAINED"
  | "SECURITY_ERROR"
  | "USER_CANCELLED"
  | "UNSUPPORTED"
  | "UNKNOWN_ERROR";

export type MediaAcquisitionError = {
  code: MediaErrorCode;
  name: string;
  message: string;
  originalError?: unknown;
};
