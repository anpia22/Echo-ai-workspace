/**
 * Phase 12.6.2 - Speech-to-Text (STT) Integration: Types & Contracts
 *
 * Defines the provider-agnostic boundary between WebRTC audio and the
 * MeetingConversationStore.
 *
 * STRICT INVARIANTS:
 * - Zero third-party vendor SDK imports (OpenAI, Deepgram, Whisper, etc.).
 * - No CanvasState, ReactFlow, or UI dependencies.
 * - STT lifecycle states are strictly separated from MeetingStatus.
 * - 'status' ("interim" | "final") is authoritative; no conflicting flags.
 */

import type { TranscriptStatus } from "./meetingConversationTypes";

/**
 * Explicit STT lifecycle states.
 * Strictly separate from MeetingStatus (idle | joining | in-meeting | leaving | error).
 */
export type SttLifecycleState =
  | "idle"
  | "starting"
  | "listening"
  | "stopping"
  | "stopped"
  | "error";

/**
 * Normalized STT error codes independent of vendor SDK exceptions.
 */
export type SttErrorCode =
  | "PERMISSION_DENIED"
  | "NOT_SUPPORTED"
  | "NETWORK_ERROR"
  | "AUDIO_CAPTURE_ERROR"
  | "TIMEOUT"
  | "ABORTED"
  | "UNKNOWN";

/**
 * Normalized STT Error structure.
 * Consumers rely exclusively on code, message, fatal, and timestamp.
 * originalError is purely an optional opaque diagnostic field.
 */
export type SttError = {
  code: SttErrorCode;
  message: string;
  fatal: boolean;
  timestamp: number;
  originalError?: unknown;
};

/**
 * Normalized transcript event emitted by an STT adapter.
 * 'status' is authoritative ("interim" | "final").
 */
export type SttTranscriptEvent = {
  id: string;
  meetingId: string;
  speakerId: string;
  speakerName: string;
  text: string;
  timestamp: number;
  status: TranscriptStatus;
  language?: string;
  confidence?: number;
};

/**
 * Options passed to start an STT session.
 * Audio stream reference is strictly an optional adapter-level concern;
 * the controller does not inspect or manipulate WebRTC tracks.
 */
export type SttSessionOptions = {
  meetingId: string;
  speakerId: string;
  speakerName: string;
  language?: string;
  audioStream?: MediaStream | null;
};

/**
 * Universal pluggable contract that all STT adapters must implement.
 */
export interface MeetingSttAdapter {
  /** Descriptive name of the adapter implementation */
  readonly name: string;

  /** Current lifecycle state */
  getState(): SttLifecycleState;

  /** Starts capturing speech and emitting transcript events */
  start(options: SttSessionOptions): Promise<void>;

  /** Stops capturing speech cleanly */
  stop(): Promise<void>;

  /** Registers a listener for normalized transcript events */
  onTranscript(listener: (event: SttTranscriptEvent) => void): () => void;

  /** Registers a listener for normalized STT errors */
  onError(listener: (error: SttError) => void): () => void;

  /** Registers a listener for STT lifecycle state transitions */
  onStateChange(listener: (state: SttLifecycleState) => void): () => void;

  /** Permanently tears down the adapter and releases all resources */
  dispose(): void;
}
