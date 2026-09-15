/**
 * Phase 12.6.2 - Speech-to-Text (STT) Adapter Abstraction & Mock
 *
 * Implements the abstract base adapter and a high-fidelity mock adapter
 * for verification and provider substitution.
 *
 * STRICT INVARIANTS:
 * - Browser-safe & SSR-safe (no window/navigator access during module load).
 * - No vendor SDK dependencies.
 * - Normalized error emission.
 */

import type {
  MeetingSttAdapter,
  SttError,
  SttErrorCode,
  SttLifecycleState,
  SttSessionOptions,
  SttTranscriptEvent,
} from "./meetingSttTypes";

/**
 * Abstract base class managing listeners, lifecycle state transitions,
 * and normalized event distribution for STT adapters.
 */
export abstract class BaseMeetingSttAdapter implements MeetingSttAdapter {
  public abstract readonly name: string;

  protected state: SttLifecycleState = "idle";
  protected currentSession: SttSessionOptions | null = null;

  private transcriptListeners: Set<(event: SttTranscriptEvent) => void> = new Set();
  private errorListeners: Set<(error: SttError) => void> = new Set();
  private stateListeners: Set<(state: SttLifecycleState) => void> = new Set();

  public getState(): SttLifecycleState {
    return this.state;
  }

  public abstract start(options: SttSessionOptions): Promise<void>;
  public abstract stop(): Promise<void>;

  public onTranscript(
    listener: (event: SttTranscriptEvent) => void
  ): () => void {
    this.transcriptListeners.add(listener);
    return () => {
      this.transcriptListeners.delete(listener);
    };
  }

  public onError(listener: (error: SttError) => void): () => void {
    this.errorListeners.add(listener);
    return () => {
      this.errorListeners.delete(listener);
    };
  }

  public onStateChange(
    listener: (state: SttLifecycleState) => void
  ): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  public dispose(): void {
    this.state = "stopped";
    this.currentSession = null;
    this.transcriptListeners.clear();
    this.errorListeners.clear();
    this.stateListeners.clear();
  }

  /**
   * Updates state and notifies state listeners if transition occurred.
   */
  protected setState(nextState: SttLifecycleState): void {
    if (this.state === nextState) return;
    this.state = nextState;
    for (const listener of this.stateListeners) {
      try {
        listener(nextState);
      } catch (err) {
        console.error(`[${this.name}] State listener error:`, err);
      }
    }
  }

  /**
   * Broadcasts a normalized transcript event to all registered listeners.
   */
  protected emitTranscript(event: SttTranscriptEvent): void {
    for (const listener of this.transcriptListeners) {
      try {
        listener({ ...event });
      } catch (err) {
        console.error(`[${this.name}] Transcript listener error:`, err);
      }
    }
  }

  /**
   * Dispatches a normalized error to error listeners.
   */
  protected emitError(
    code: SttErrorCode,
    message: string,
    fatal: boolean = false,
    originalError?: unknown
  ): void {
    const error: SttError = {
      code,
      message,
      fatal,
      timestamp: Date.now(),
      originalError,
    };

    if (fatal) {
      this.setState("error");
    }

    for (const listener of this.errorListeners) {
      try {
        listener(error);
      } catch (err) {
        console.error(`[${this.name}] Error listener exception:`, err);
      }
    }
  }
}

/**
 * High-fidelity Mock STT Adapter for tests and local simulation.
 * Implements the exact universal public contract as any future real provider.
 */
export class MockMeetingSttAdapter extends BaseMeetingSttAdapter {
  public readonly name: string = "MockMeetingSttAdapter";

  public async start(options: SttSessionOptions): Promise<void> {
    if (this.state === "listening" || this.state === "starting") {
      return;
    }

    this.setState("starting");
    this.currentSession = { ...options };

    // Simulate asynchronous initialization
    this.setState("listening");
  }

  public async stop(): Promise<void> {
    if (this.state === "stopped" || this.state === "idle") {
      return;
    }

    this.setState("stopping");
    this.currentSession = null;
    this.setState("stopped");
  }

  /**
   * Helper for tests to simulate an utterance arriving from the speech engine.
   */
  public simulateTranscript(
    params: Omit<
      SttTranscriptEvent,
      "meetingId" | "speakerId" | "speakerName" | "timestamp"
    > & {
      meetingId?: string;
      speakerId?: string;
      speakerName?: string;
      timestamp?: number;
    }
  ): void {
    if (this.state !== "listening" && this.state !== "starting") {
      console.warn(`[MockMeetingSttAdapter] Transcript emitted while in state '${this.state}'`);
    }

    const meetingId = params.meetingId ?? this.currentSession?.meetingId ?? "unknown-meeting";
    const speakerId = params.speakerId ?? this.currentSession?.speakerId ?? "unknown-speaker";
    const speakerName = params.speakerName ?? this.currentSession?.speakerName ?? "Unknown";

    this.emitTranscript({
      id: params.id,
      meetingId,
      speakerId,
      speakerName,
      text: params.text,
      timestamp: params.timestamp ?? Date.now(),
      status: params.status,
      language: params.language ?? this.currentSession?.language,
      confidence: params.confidence,
    });
  }

  /**
   * Helper for tests to simulate an engine error.
   */
  public simulateError(
    code: SttErrorCode,
    message: string,
    fatal: boolean = false,
    originalError?: unknown
  ): void {
    this.emitError(code, message, fatal, originalError);
  }

  public getCurrentSession(): SttSessionOptions | null {
    return this.currentSession ? { ...this.currentSession } : null;
  }
}
