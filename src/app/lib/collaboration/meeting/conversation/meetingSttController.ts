/**
 * Phase 12.6.2 - Meeting Speech-to-Text (STT) Controller
 *
 * Coordinates an STT adapter with a MeetingConversationStore.
 *
 * ARCHITECTURAL BOUNDARY:
 * - Does NOT touch RTCPeerConnection, audio tracks, or WebRTC signaling.
 * - Audio acquisition and encoding is strictly an adapter-internal concern.
 * - Controller purely maps normalized SttTranscriptEvent to UpsertSegmentInput
 *   and feeds it into MeetingConversationStore.
 * - Manages session lifecycle and guarantees complete listener cleanup.
 */

import type { MeetingConversationStore } from "./meetingConversationStore";
import type {
  MeetingSttAdapter,
  SttError,
  SttLifecycleState,
  SttSessionOptions,
  SttTranscriptEvent,
} from "./meetingSttTypes";

export type SttControllerOptions = {
  adapter: MeetingSttAdapter;
  store: MeetingConversationStore;
};

export class MeetingSttController {
  private readonly adapter: MeetingSttAdapter;
  private readonly store: MeetingConversationStore;

  private isStarted: boolean = false;
  private unsubscribeTranscript: (() => void) | null = null;
  private unsubscribeError: (() => void) | null = null;
  private unsubscribeState: (() => void) | null = null;

  private stateListeners: Set<(state: SttLifecycleState) => void> = new Set();
  private errorListeners: Set<(error: SttError) => void> = new Set();

  constructor(options: SttControllerOptions) {
    if (!options.adapter) {
      throw new Error("MeetingSttController requires an adapter");
    }
    if (!options.store) {
      throw new Error("MeetingSttController requires a store");
    }
    this.adapter = options.adapter;
    this.store = options.store;
  }

  /**
   * Returns the current lifecycle state of the underlying adapter.
   */
  public getLifecycleState(): SttLifecycleState {
    return this.adapter.getState();
  }

  /**
   * Starts the STT session and attaches event pipelines to the conversation store.
   */
  public async start(options: SttSessionOptions): Promise<void> {
    if (this.isStarted) {
      return;
    }

    // Clean up any stale subscriptions before attaching
    this.detachAdapterListeners();

    // Attach listeners
    this.unsubscribeTranscript = this.adapter.onTranscript(
      (event: SttTranscriptEvent) => {
        this.handleTranscriptEvent(event);
      }
    );

    this.unsubscribeError = this.adapter.onError((error: SttError) => {
      this.notifyErrorListeners(error);
    });

    this.unsubscribeState = this.adapter.onStateChange(
      (state: SttLifecycleState) => {
        this.notifyStateListeners(state);
      }
    );

    this.isStarted = true;

    try {
      await this.adapter.start(options);
    } catch (err) {
      this.isStarted = false;
      this.detachAdapterListeners();
      throw err;
    }
  }

  /**
   * Stops the STT session and detaches adapter listeners.
   */
  public async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    this.isStarted = false;
    try {
      await this.adapter.stop();
    } finally {
      this.detachAdapterListeners();
    }
  }

  /**
   * Fully tears down the controller and underlying adapter.
   */
  public dispose(): void {
    this.isStarted = false;
    this.detachAdapterListeners();
    this.adapter.dispose();
    this.stateListeners.clear();
    this.errorListeners.clear();
  }

  /**
   * Subscribes to STT lifecycle state transitions.
   */
  public onStateChange(
    listener: (state: SttLifecycleState) => void
  ): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  /**
   * Subscribes to normalized STT errors.
   */
  public onError(listener: (error: SttError) => void): () => void {
    this.errorListeners.add(listener);
    return () => {
      this.errorListeners.delete(listener);
    };
  }

  /**
   * Normalizes an incoming transcript event and feeds it directly into
   * the authoritative MeetingConversationStore.
   */
  private handleTranscriptEvent(event: SttTranscriptEvent): void {
    this.store.upsertSegment({
      id: event.id,
      meetingId: event.meetingId,
      speakerId: event.speakerId,
      speakerName: event.speakerName,
      text: event.text,
      timestamp: event.timestamp,
      status: event.status,
      language: event.language,
    });
  }

  private detachAdapterListeners(): void {
    if (this.unsubscribeTranscript) {
      this.unsubscribeTranscript();
      this.unsubscribeTranscript = null;
    }
    if (this.unsubscribeError) {
      this.unsubscribeError();
      this.unsubscribeError = null;
    }
    if (this.unsubscribeState) {
      this.unsubscribeState();
      this.unsubscribeState = null;
    }
  }

  private notifyStateListeners(state: SttLifecycleState): void {
    for (const listener of this.stateListeners) {
      try {
        listener(state);
      } catch (err) {
        console.error("[MeetingSttController] State listener error:", err);
      }
    }
  }

  private notifyErrorListeners(error: SttError): void {
    for (const listener of this.errorListeners) {
      try {
        listener(error);
      } catch (err) {
        console.error("[MeetingSttController] Error listener error:", err);
      }
    }
  }
}
