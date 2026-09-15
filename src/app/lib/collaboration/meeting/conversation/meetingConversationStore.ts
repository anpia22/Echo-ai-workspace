/**
 * Phase 12.6.1 - Meeting Conversation Store
 *
 * Implements deterministic transcript ordering, deduplication, interim/final separation,
 * speaker attribution, and meeting isolation.
 */

import type {
  MeetingConversationSnapshot,
  MeetingTranscriptListener,
  MeetingTranscriptSegment,
  UpsertSegmentInput,
} from "./meetingConversationTypes";

export class MeetingConversationStore {
  private readonly meetingId: string;
  private sequenceCounter: number = 0;

  /** Finalized segments ordered by sequence ASC */
  private finalizedSegments: MeetingTranscriptSegment[] = [];

  /** Active interim segments keyed by segment ID */
  private interimMap: Map<string, MeetingTranscriptSegment> = new Map();

  /** Set of segment IDs that have reached final status (prevents duplicate finalization) */
  private finalizedSegmentIds: Set<string> = new Set();

  /** Map of finalized segments for fast ID-based idempotent lookup */
  private finalizedMap: Map<string, MeetingTranscriptSegment> = new Map();

  /** Registered listeners */
  private listeners: Set<MeetingTranscriptListener> = new Set();

  constructor(meetingId: string) {
    if (!meetingId || typeof meetingId !== "string" || meetingId.trim() === "") {
      throw new Error("MeetingConversationStore requires a non-empty meetingId");
    }
    this.meetingId = meetingId;
  }

  /**
   * Returns the bound meeting ID.
   */
  public getMeetingId(): string {
    return this.meetingId;
  }

  /**
   * Helper to produce an independent clone of a transcript segment.
   */
  private cloneSegment(
    segment: MeetingTranscriptSegment
  ): MeetingTranscriptSegment {
    return {
      id: segment.id,
      meetingId: segment.meetingId,
      speakerId: segment.speakerId,
      speakerName: segment.speakerName,
      text: segment.text,
      timestamp: segment.timestamp,
      sequence: segment.sequence,
      status: segment.status,
      language: segment.language,
      source: segment.source,
      createdAt: segment.createdAt,
      updatedAt: segment.updatedAt,
    };
  }

  /**
   * Adds or updates a transcript segment.
   *
   * Guarantees:
   * 1. Rejects segments belonging to a different meeting (Meeting Isolation).
   * 2. Cannot downgrade an already finalized segment to interim.
   * 3. Multiple interim updates with the same ID update in-place without advancing sequence.
   * 4. Transitioning to 'final' assigns a strictly monotonically increasing sequence number.
   * 5. Re-submitting an already finalized segment is strictly idempotent (no-op, does not fire duplicate events).
   * 6. Returns an independent clone so external mutations cannot affect internal store state.
   */
  public upsertSegment(
    input: UpsertSegmentInput
  ): MeetingTranscriptSegment | null {
    // 1. Meeting isolation check
    if (input.meetingId !== this.meetingId) {
      console.warn(
        `[MeetingConversationStore] Rejected segment ${input.id}: meetingId mismatch (expected: ${this.meetingId}, received: ${input.meetingId})`
      );
      return null;
    }

    const now = Date.now();
    const timestamp = input.timestamp ?? now;

    // 2. Check if segment has already been finalized
    if (this.finalizedSegmentIds.has(input.id)) {
      const finalized = this.finalizedMap.get(input.id);
      if (!finalized) return null;

      // Once finalized, it CANNOT be downgraded to interim.
      // If status is 'final', handle as strictly idempotent no-op.
      return this.cloneSegment(finalized);
    }

    // 3. Handle Interim segment
    if (input.status === "interim") {
      const existingInterim = this.interimMap.get(input.id);

      const interimSegment: MeetingTranscriptSegment = {
        id: input.id,
        meetingId: this.meetingId,
        speakerId: input.speakerId,
        speakerName: input.speakerName,
        text: input.text,
        timestamp,
        // Interim updates do NOT consume sequence numbers
        sequence: -1,
        status: "interim",
        language: input.language,
        source: "meeting",
        createdAt: existingInterim ? existingInterim.createdAt : now,
        updatedAt: now,
      };

      this.interimMap.set(input.id, interimSegment);
      this.notifyListeners(interimSegment);
      return this.cloneSegment(interimSegment);
    }

    // 4. Handle Final segment transition / creation
    const existingInterim = this.interimMap.get(input.id);
    if (existingInterim) {
      this.interimMap.delete(input.id);
    }

    // Assign strictly monotonically increasing sequence number upon finalization
    this.sequenceCounter += 1;
    const assignedSequence = this.sequenceCounter;

    const finalSegment: MeetingTranscriptSegment = {
      id: input.id,
      meetingId: this.meetingId,
      speakerId: input.speakerId,
      speakerName: input.speakerName,
      text: input.text,
      timestamp,
      sequence: assignedSequence,
      status: "final",
      language: input.language,
      source: "meeting",
      createdAt: existingInterim ? existingInterim.createdAt : now,
      updatedAt: now,
    };

    this.finalizedSegments.push(finalSegment);
    this.finalizedSegmentIds.add(input.id);
    this.finalizedMap.set(input.id, finalSegment);

    this.notifyListeners(finalSegment);
    return this.cloneSegment(finalSegment);
  }

  /**
   * Retrieves an immutable snapshot of the conversation state.
   * Finalized segments are deterministically ordered by sequence ASC,
   * then timestamp ASC, then id ASC.
   * All returned segment objects are independent clones.
   */
  public getSnapshot(): MeetingConversationSnapshot {
    const sortedFinalized = [...this.finalizedSegments]
      .sort((a, b) => {
        if (a.sequence !== b.sequence) {
          return a.sequence - b.sequence;
        }
        if (a.timestamp !== b.timestamp) {
          return a.timestamp - b.timestamp;
        }
        return a.id.localeCompare(b.id);
      })
      .map((segment) => this.cloneSegment(segment));

    const activeInterims = Array.from(this.interimMap.values())
      .sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id))
      .map((segment) => this.cloneSegment(segment));

    return {
      meetingId: this.meetingId,
      segments: sortedFinalized,
      interimSegments: activeInterims,
      lastSequence: this.sequenceCounter,
    };
  }

  /**
   * Retrieves all finalized segments in deterministic order.
   * Returned segment objects are independent clones.
   */
  public getFinalizedSegments(): MeetingTranscriptSegment[] {
    return this.getSnapshot().segments;
  }

  /**
   * Retrieves currently active interim segments.
   * Returned segment objects are independent clones.
   */
  public getInterimSegments(): MeetingTranscriptSegment[] {
    return Array.from(this.interimMap.values()).map((segment) =>
      this.cloneSegment(segment)
    );
  }

  /**
   * Subscribes to transcript events.
   * Returns an unsubscribe function.
   */
  public subscribe(listener: MeetingTranscriptListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Cleans up and resets all segments, interims, counters, and deduplication states.
   */
  public clear(): void {
    this.sequenceCounter = 0;
    this.finalizedSegments = [];
    this.interimMap.clear();
    this.finalizedSegmentIds.clear();
    this.finalizedMap.clear();
    this.listeners.clear();
  }

  private notifyListeners(segment: MeetingTranscriptSegment): void {
    if (this.listeners.size === 0) return;
    for (const listener of this.listeners) {
      try {
        // Provide independent clones so listeners cannot mutate internal store state
        listener(this.cloneSegment(segment), this.getSnapshot());
      } catch (err) {
        console.error("[MeetingConversationStore] Listener error:", err);
      }
    }
  }
}
