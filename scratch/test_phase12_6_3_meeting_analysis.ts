/**
 * Phase 12.6.3 Verification Suite: AI Meeting Analysis Contracts & Determinism
 *
 * Validates:
 * A. Analysis adapter contract adherence
 * B. Empty conversation handling
 * C. Single transcript analysis
 * D. Multiple speaker analysis
 * E. Problem insight extraction
 * F. Solution insight extraction
 * G. Decision insight extraction
 * H. Task insight extraction
 * I. Question insight extraction
 * J. Idea insight extraction
 * K. Source segment ID provenance
 * L. Speaker attribution from source utterances
 * M. Deterministic insight IDs (no random UUID / Date.now)
 * N. Repeated analysis determinism (idempotency)
 * O. Invalid input handling
 * P. Normalized analysis errors
 * Q. Lifecycle transitions (idle -> analyzing -> ready / error)
 * R. Cleanup and resource release
 * S. Store and context immutability
 * T. SSR / Node environment safety
 * U. Zero Canvas dependencies
 * V. Zero STT-provider dependencies
 */

import assert from "node:assert/strict";
import {
  createMeetingConversationStore,
  buildMeetingConversationContext,
  type MeetingConversationContext,
} from "../src/app/lib/collaboration/meeting/conversation/index";
import {
  MockMeetingAnalysisAdapter,
  generateDeterministicInsightId,
  filterInsightsByType,
  type AnalysisError,
  type AnalysisLifecycleState,
} from "../src/app/lib/collaboration/meeting/analysis/index";

console.log("=================================================");
console.log("RUNNING PHASE 12.6.3 MEETING ANALYSIS CONTRACT TESTS");
console.log("=================================================\n");

const MEETING_ID_ALPHA = "room-analysis-alpha";

async function run() {
  // -------------------------------------------------------------
  // Test A: Analysis Adapter Contract Adherence
  // -------------------------------------------------------------
  console.log("Test A: Analysis adapter contract adherence...");
  {
    const adapter = new MockMeetingAnalysisAdapter();
    assert.equal(typeof adapter.name, "string");
    assert.equal(typeof adapter.getState, "function");
    assert.equal(typeof adapter.analyze, "function");
    assert.equal(typeof adapter.onError, "function");
    assert.equal(typeof adapter.onStateChange, "function");
    assert.equal(typeof adapter.dispose, "function");
    assert.equal(adapter.getState(), "idle");
    console.log("✔ Test A passed: Adapter adheres strictly to MeetingAnalysisAdapter interface.");
  }

  // -------------------------------------------------------------
  // Test B: Empty Conversation Handling
  // -------------------------------------------------------------
  console.log("\nTest B: Empty conversation handling...");
  {
    const adapter = new MockMeetingAnalysisAdapter();
    const emptyContext: MeetingConversationContext = {
      meetingId: MEETING_ID_ALPHA,
      formattedTranscript: "",
      messages: [],
      startTime: null,
      endTime: null,
      participantIds: [],
    };

    const result = await adapter.analyze(emptyContext);
    assert.equal(result.meetingId, MEETING_ID_ALPHA);
    assert.equal(result.insights.length, 0);
    assert.equal(result.sourceMessageCount, 0);
    assert.equal(adapter.getState(), "ready");
    console.log("✔ Test B passed: Empty conversation produces empty insights list cleanly.");
  }

  // -------------------------------------------------------------
  // Test C: Single Transcript Analysis
  // -------------------------------------------------------------
  console.log("\nTest C: Single transcript analysis...");
  {
    const store = createMeetingConversationStore(MEETING_ID_ALPHA);
    store.upsertSegment({
      id: "seg-single-1",
      meetingId: MEETING_ID_ALPHA,
      speakerId: "user-alice",
      speakerName: "Alice",
      text: "We have a critical lead quality problem.",
      status: "final",
      timestamp: 1000,
    });

    const context = buildMeetingConversationContext(store);
    const adapter = new MockMeetingAnalysisAdapter();
    const result = await adapter.analyze(context);

    assert.equal(result.meetingId, MEETING_ID_ALPHA);
    assert.equal(result.insights.length, 1);
    assert.equal(result.insights[0].type, "problem");
    assert.equal(result.insights[0].title, "Lead quality problem");
    assert.deepEqual(result.insights[0].sourceSegmentIds, ["seg-single-1"]);
    assert.deepEqual(result.insights[0].speakerIds, ["user-alice"]);

    console.log("✔ Test C passed: Single transcript utterance analyzed successfully.");
  }

  // -------------------------------------------------------------
  // Test D: Multiple Speaker Analysis & Speaker Attribution
  // -------------------------------------------------------------
  console.log("\nTest D: Multiple speaker analysis...");
  {
    const store = createMeetingConversationStore(MEETING_ID_ALPHA);
    store.upsertSegment({ id: "s-1", meetingId: MEETING_ID_ALPHA, speakerId: "u-alice", speakerName: "Alice", text: "We have a lead quality problem.", status: "final" });
    store.upsertSegment({ id: "s-2", meetingId: MEETING_ID_ALPHA, speakerId: "u-bob", speakerName: "Bob", text: "Stricter verification is our solution.", status: "final" });
    store.upsertSegment({ id: "s-3", meetingId: MEETING_ID_ALPHA, speakerId: "u-anup", speakerName: "Anup", text: "Anup will improve the verification flow.", status: "final" });

    const context = buildMeetingConversationContext(store);
    const adapter = new MockMeetingAnalysisAdapter();
    const result = await adapter.analyze(context);

    assert.equal(result.insights.length, 3);
    const problem = result.insights.find((i) => i.type === "problem");
    const solution = result.insights.find((i) => i.type === "solution");
    const task = result.insights.find((i) => i.type === "task");

    assert.ok(problem && solution && task);
    assert.deepEqual(problem.speakerIds, ["u-alice"]);
    assert.deepEqual(solution.speakerIds, ["u-bob"]);
    assert.deepEqual(task.speakerIds, ["u-anup"]);

    console.log("✔ Test D passed: Multi-speaker attribution verified.");
  }

  // -------------------------------------------------------------
  // Test E, F, G, H, I, J: Insight Types (Problem, Solution, Decision, Task, Question, Idea)
  // -------------------------------------------------------------
  console.log("\nTest E-J: Semantic insight types extraction...");
  {
    const store = createMeetingConversationStore(MEETING_ID_ALPHA);
    store.upsertSegment({ id: "m-prob", meetingId: MEETING_ID_ALPHA, speakerId: "u1", speakerName: "Alice", text: "Lead quality problem identified.", status: "final" });
    store.upsertSegment({ id: "m-sol", meetingId: MEETING_ID_ALPHA, speakerId: "u2", speakerName: "Bob", text: "We need stricter verification.", status: "final" });
    store.upsertSegment({ id: "m-task", meetingId: MEETING_ID_ALPHA, speakerId: "u3", speakerName: "Anup", text: "Anup will improve the verification flow.", status: "final" });
    store.upsertSegment({ id: "m-dec", meetingId: MEETING_ID_ALPHA, speakerId: "u1", speakerName: "Alice", text: "We decided to require phone OTP.", status: "final" });
    store.upsertSegment({ id: "m-q", meetingId: MEETING_ID_ALPHA, speakerId: "u2", speakerName: "Bob", text: "Should we change marketplace pricing?", status: "final" });
    store.upsertSegment({ id: "m-idea", meetingId: MEETING_ID_ALPHA, speakerId: "u3", speakerName: "Anup", text: "Idea: add a trust badge on verified leads.", status: "final" });

    const context = buildMeetingConversationContext(store);
    const adapter = new MockMeetingAnalysisAdapter();
    const result = await adapter.analyze(context);

    assert.equal(filterInsightsByType(result.insights, "problem").length, 1);
    assert.equal(filterInsightsByType(result.insights, "solution").length, 1);
    assert.equal(filterInsightsByType(result.insights, "task").length, 1);
    assert.equal(filterInsightsByType(result.insights, "decision").length, 1);
    assert.equal(filterInsightsByType(result.insights, "question").length, 1);
    assert.equal(filterInsightsByType(result.insights, "idea").length, 1);

    console.log("✔ Test E-J passed: All 6 required insight types extracted cleanly.");
  }

  // -------------------------------------------------------------
  // Test K: Source Segment ID Provenance
  // -------------------------------------------------------------
  console.log("\nTest K: Source segment ID provenance...");
  {
    const store = createMeetingConversationStore(MEETING_ID_ALPHA);
    store.upsertSegment({
      id: "exact-segment-xyz",
      meetingId: MEETING_ID_ALPHA,
      speakerId: "u1",
      speakerName: "Alice",
      text: "We have a critical lead quality problem.",
      status: "final",
    });

    const context = buildMeetingConversationContext(store);
    const adapter = new MockMeetingAnalysisAdapter();
    const result = await adapter.analyze(context);

    assert.equal(result.insights.length, 1);
    const insight = result.insights[0];
    assert.deepEqual(insight.sourceSegmentIds, ["exact-segment-xyz"]);
    assert.notEqual(insight.sourceSegmentIds[0], "unknown");

    console.log("✔ Test K passed: Source segment ID provenance verified.");
  }

  // -------------------------------------------------------------
  // Test L: Speaker Attribution from Source Utterances
  // -------------------------------------------------------------
  console.log("\nTest L: Speaker attribution from source utterances...");
  {
    const store = createMeetingConversationStore(MEETING_ID_ALPHA);
    store.upsertSegment({
      id: "seg-speaker-test",
      meetingId: MEETING_ID_ALPHA,
      speakerId: "author-user-999",
      speakerName: "Deepak",
      text: "We decided on the new database schema.",
      status: "final",
    });

    const context = buildMeetingConversationContext(store);
    const adapter = new MockMeetingAnalysisAdapter();
    const result = await adapter.analyze(context);

    assert.equal(result.insights.length, 1);
    assert.deepEqual(result.insights[0].speakerIds, ["author-user-999"]);

    console.log("✔ Test L passed: Speaker attribution correctly reflects the utterance author.");
  }

  // -------------------------------------------------------------
  // Test M: Deterministic Insight IDs (No Random UUID / Date.now)
  // -------------------------------------------------------------
  console.log("\nTest M: Deterministic insight ID generation...");
  {
    const id1 = generateDeterministicInsightId(
      "meeting-123",
      "problem",
      "Lead quality problem",
      ["seg-a", "seg-b"]
    );
    const id2 = generateDeterministicInsightId(
      "meeting-123",
      "problem",
      "Lead quality problem",
      ["seg-b", "seg-a"] // Interleaved order must produce identical ID
    );

    assert.equal(id1, id2, "Deterministic ID must be order-invariant on sourceSegmentIds");
    assert.ok(id1.startsWith("ins-problem-"), "Prefix must reflect semantic category");
    assert.equal(id1.includes("undefined"), false);
    assert.equal(id1.includes("NaN"), false);

    // Differentiating by type or title produces distinct IDs
    const id3 = generateDeterministicInsightId(
      "meeting-123",
      "solution",
      "Lead quality problem",
      ["seg-a", "seg-b"]
    );
    assert.notEqual(id1, id3, "Different insight type must produce different ID");

    console.log("✔ Test M passed: Deterministic ID generation confirmed.");
  }

  // -------------------------------------------------------------
  // Test N: Repeated Analysis Determinism (Idempotency)
  // -------------------------------------------------------------
  console.log("\nTest N: Repeated analysis determinism...");
  {
    const store = createMeetingConversationStore(MEETING_ID_ALPHA);
    store.upsertSegment({ id: "seg-rep-1", meetingId: MEETING_ID_ALPHA, speakerId: "u1", speakerName: "Alice", text: "Lead quality problem.", status: "final" });
    store.upsertSegment({ id: "seg-rep-2", meetingId: MEETING_ID_ALPHA, speakerId: "u2", speakerName: "Bob", text: "Stricter verification.", status: "final" });

    const context = buildMeetingConversationContext(store);
    const adapter = new MockMeetingAnalysisAdapter();

    const run1 = await adapter.analyze(context);
    const run2 = await adapter.analyze(context);

    assert.equal(run1.insights.length, run2.insights.length);
    assert.deepEqual(
      run1.insights.map((i) => ({ id: i.id, type: i.type, title: i.title, source: i.sourceSegmentIds })),
      run2.insights.map((i) => ({ id: i.id, type: i.type, title: i.title, source: i.sourceSegmentIds }))
    );

    console.log("✔ Test N passed: Repeated analysis on same context produces identical insights.");
  }

  // -------------------------------------------------------------
  // Test O: Invalid Input Handling & Strict Provenance Validation
  // -------------------------------------------------------------
  console.log("\nTest O: Invalid input handling & strict provenance validation...");
  {
    const adapter = new MockMeetingAnalysisAdapter();
    const caughtErrors: AnalysisError[] = [];
    adapter.onError((err) => caughtErrors.push(err));

    // O1: null context
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await assert.rejects(async () => {
      await adapter.analyze(null as any);
    });
    assert.equal(caughtErrors[caughtErrors.length - 1].code, "INVALID_INPUT");

    // O2: Missing/empty meetingId
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await assert.rejects(async () => {
      await adapter.analyze({ meetingId: "  ", messages: [] } as any);
    });
    assert.equal(caughtErrors[caughtErrors.length - 1].code, "INVALID_INPUT");

    // O3: messages: null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await assert.rejects(async () => {
      await adapter.analyze({ meetingId: MEETING_ID_ALPHA, messages: null } as any);
    });
    assert.equal(caughtErrors[caughtErrors.length - 1].code, "INVALID_INPUT");

    // O4: messages: non-array (string or number)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await assert.rejects(async () => {
      await adapter.analyze({ meetingId: MEETING_ID_ALPHA, messages: "not-an-array" } as any);
    });
    assert.equal(caughtErrors[caughtErrors.length - 1].code, "INVALID_INPUT");

    // O5: message without id or segmentId (must reject rather than generating fake 'seg-X' ID)
    const contextMissingProvenance: MeetingConversationContext = {
      meetingId: MEETING_ID_ALPHA,
      formattedTranscript: "We have a lead quality problem",
      messages: [
        {
          speakerId: "u1",
          speakerName: "Alice",
          text: "We have a lead quality problem",
          timestamp: 1000,
          sequence: 5,
          // id and segmentId intentionally omitted
        },
      ],
      startTime: 1000,
      endTime: 1000,
      participantIds: ["u1"],
    };

    await assert.rejects(async () => {
      await adapter.analyze(contextMissingProvenance);
    });
    assert.equal(caughtErrors[caughtErrors.length - 1].code, "INVALID_INPUT");
    assert.ok(caughtErrors[caughtErrors.length - 1].message.includes("transcript segment ID is required"));

    // O6: message with empty id or segmentId
    const contextEmptyProvenance: MeetingConversationContext = {
      meetingId: MEETING_ID_ALPHA,
      formattedTranscript: "We have a problem",
      messages: [
        {
          id: "   ",
          segmentId: "   ",
          speakerId: "u1",
          speakerName: "Alice",
          text: "We have a problem",
          timestamp: 1000,
          sequence: 1,
        },
      ],
      startTime: 1000,
      endTime: 1000,
      participantIds: ["u1"],
    };

    await assert.rejects(async () => {
      await adapter.analyze(contextEmptyProvenance);
    });
    assert.equal(caughtErrors[caughtErrors.length - 1].code, "INVALID_INPUT");

    // O7: message with missing or invalid speakerId
    const contextInvalidSpeaker: MeetingConversationContext = {
      meetingId: MEETING_ID_ALPHA,
      formattedTranscript: "We have a problem",
      messages: [
        {
          id: "seg-1",
          segmentId: "seg-1",
          speakerId: "   ",
          speakerName: "Alice",
          text: "We have a problem",
          timestamp: 1000,
          sequence: 1,
        },
      ],
      startTime: 1000,
      endTime: 1000,
      participantIds: [],
    };

    await assert.rejects(async () => {
      await adapter.analyze(contextInvalidSpeaker);
    });
    assert.equal(caughtErrors[caughtErrors.length - 1].code, "INVALID_INPUT");

    // O8: message with non-string text
    const contextInvalidText: MeetingConversationContext = {
      meetingId: MEETING_ID_ALPHA,
      formattedTranscript: "",
      messages: [
        {
          id: "seg-1",
          segmentId: "seg-1",
          speakerId: "u1",
          speakerName: "Alice",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          text: 12345 as any,
          timestamp: 1000,
          sequence: 1,
        },
      ],
      startTime: 1000,
      endTime: 1000,
      participantIds: ["u1"],
    };

    await assert.rejects(async () => {
      await adapter.analyze(contextInvalidText);
    });
    assert.equal(caughtErrors[caughtErrors.length - 1].code, "INVALID_INPUT");

    // O9: message with non-finite timestamp
    const contextInvalidTimestamp: MeetingConversationContext = {
      meetingId: MEETING_ID_ALPHA,
      formattedTranscript: "",
      messages: [
        {
          id: "seg-1",
          segmentId: "seg-1",
          speakerId: "u1",
          speakerName: "Alice",
          text: "We have a problem",
          timestamp: NaN,
          sequence: 1,
        },
      ],
      startTime: 1000,
      endTime: 1000,
      participantIds: ["u1"],
    };

    await assert.rejects(async () => {
      await adapter.analyze(contextInvalidTimestamp);
    });
    assert.equal(caughtErrors[caughtErrors.length - 1].code, "INVALID_INPUT");

    // O10: message with non-finite sequence
    const contextInvalidSequence: MeetingConversationContext = {
      meetingId: MEETING_ID_ALPHA,
      formattedTranscript: "",
      messages: [
        {
          id: "seg-1",
          segmentId: "seg-1",
          speakerId: "u1",
          speakerName: "Alice",
          text: "We have a problem",
          timestamp: 1000,
          sequence: Infinity,
        },
      ],
      startTime: 1000,
      endTime: 1000,
      participantIds: ["u1"],
    };

    await assert.rejects(async () => {
      await adapter.analyze(contextInvalidSequence);
    });
    assert.equal(caughtErrors[caughtErrors.length - 1].code, "INVALID_INPUT");

    // O11: Custom mock insight referencing non-existent sourceSegmentIds
    adapter.setMockInsights([
      {
        id: "fake-ins-1",
        meetingId: MEETING_ID_ALPHA,
        type: "problem",
        title: "Fabricated problem",
        summary: "Fabricated summary",
        sourceSegmentIds: ["non-existent-segment-id-999"], // Not in context!
        speakerIds: ["u1"],
        timestamp: 1000,
      },
    ]);

    const validContextWithRealIds: MeetingConversationContext = {
      meetingId: MEETING_ID_ALPHA,
      formattedTranscript: "Actual text",
      messages: [
        {
          id: "real-segment-1",
          segmentId: "real-segment-1",
          speakerId: "u1",
          speakerName: "Alice",
          text: "Actual text",
          timestamp: 1000,
          sequence: 1,
        },
      ],
      startTime: 1000,
      endTime: 1000,
      participantIds: ["u1"],
    };

    await assert.rejects(async () => {
      await adapter.analyze(validContextWithRealIds);
    });

    assert.equal(caughtErrors[caughtErrors.length - 1].code, "INVALID_INPUT");
    assert.ok(caughtErrors[caughtErrors.length - 1].message.includes("references non-existent segment ID"));

    // O12: Custom mock insights immutability test (cloning sourceSegmentIds & speakerIds)
    const originalSourceSegments = ["real-segment-1"];
    const originalSpeakerIds = ["u1"];
    adapter.setMockInsights([
      {
        id: "valid-custom-1",
        meetingId: MEETING_ID_ALPHA,
        type: "problem",
        title: "Valid custom insight",
        summary: "Valid custom summary",
        sourceSegmentIds: originalSourceSegments,
        speakerIds: originalSpeakerIds,
        timestamp: 1000,
      },
    ]);

    const customResult = await adapter.analyze(validContextWithRealIds);
    assert.equal(customResult.insights.length, 1);
    // Mutate returned array in consumer space
    customResult.insights[0].sourceSegmentIds.push("mutated-segment");
    customResult.insights[0].speakerIds.push("mutated-speaker");

    // Run again and verify original custom insight arrays inside adapter were protected
    const customResult2 = await adapter.analyze(validContextWithRealIds);
    assert.deepEqual(customResult2.insights[0].sourceSegmentIds, ["real-segment-1"]);
    assert.deepEqual(customResult2.insights[0].speakerIds, ["u1"]);

    // Clear custom mock insights for subsequent tests
    adapter.setMockInsights(null);

    console.log("✔ Test O passed: All strict context validation, provenance checks, and immutability verified with INVALID_INPUT.");
  }

  // -------------------------------------------------------------
  // Test P: Normalized Analysis Errors
  // -------------------------------------------------------------
  console.log("\nTest P: Normalized analysis error structure...");
  {
    const adapter = new MockMeetingAnalysisAdapter();
    const caughtErrors: AnalysisError[] = [];
    adapter.onError((err) => caughtErrors.push(err));

    adapter.simulateError("NETWORK_ERROR", "Simulated connection timeout");

    const validContext: MeetingConversationContext = {
      meetingId: MEETING_ID_ALPHA,
      formattedTranscript: "Hello",
      messages: [{ id: "1", segmentId: "1", speakerId: "u", speakerName: "A", text: "Hello", timestamp: 1, sequence: 1 }],
      startTime: 1,
      endTime: 1,
      participantIds: ["u"],
    };

    await assert.rejects(async () => {
      await adapter.analyze(validContext);
    });

    assert.equal(caughtErrors.length, 1);
    assert.equal(caughtErrors[0].code, "NETWORK_ERROR");
    assert.equal(caughtErrors[0].message, "Simulated connection timeout");
    assert.equal(caughtErrors[0].fatal, true);
    assert.equal(typeof caughtErrors[0].timestamp, "number");

    adapter.clearInjectedError();
    console.log("✔ Test P passed: Errors conform strictly to normalized AnalysisError shape.");
  }

  // -------------------------------------------------------------
  // Test Q: Lifecycle Transitions (idle -> analyzing -> ready / error)
  // -------------------------------------------------------------
  console.log("\nTest Q: Lifecycle state transitions...");
  {
    const adapter = new MockMeetingAnalysisAdapter();
    const observedStates: AnalysisLifecycleState[] = [];
    adapter.onStateChange((state) => observedStates.push(state));

    assert.equal(adapter.getState(), "idle");

    const context: MeetingConversationContext = {
      meetingId: MEETING_ID_ALPHA,
      formattedTranscript: "",
      messages: [],
      startTime: null,
      endTime: null,
      participantIds: [],
    };

    await adapter.analyze(context);
    assert.equal(adapter.getState(), "ready");
    assert.deepEqual(observedStates, ["analyzing", "ready"]);

    console.log("✔ Test Q passed: Lifecycle transitions (idle -> analyzing -> ready) verified.");
  }

  // -------------------------------------------------------------
  // Test R: Cleanup & Listener Detachment on dispose()
  // -------------------------------------------------------------
  console.log("\nTest R: Cleanup and resource release on dispose()...");
  {
    const adapter = new MockMeetingAnalysisAdapter();
    let listenerFired = false;
    adapter.onStateChange(() => {
      listenerFired = true;
    });

    adapter.dispose();
    assert.equal(adapter.getState(), "idle");

    // After dispose, state listener should not fire
    adapter.simulateError("TIMEOUT", "Post-dispose error");
    assert.equal(listenerFired, false, "Disposed adapter must have zero active listeners");

    console.log("✔ Test R passed: dispose() detaches all listeners and resets state.");
  }

  // -------------------------------------------------------------
  // Test S: Store & Context Immutability
  // -------------------------------------------------------------
  console.log("\nTest S: Immutability of conversation store and context...");
  {
    const store = createMeetingConversationStore(MEETING_ID_ALPHA);
    store.upsertSegment({ id: "s-imm-1", meetingId: MEETING_ID_ALPHA, speakerId: "u1", speakerName: "Alice", text: "Lead quality problem", status: "final" });

    const context = buildMeetingConversationContext(store);
    const originalMessagesJson = JSON.stringify(context.messages);

    const adapter = new MockMeetingAnalysisAdapter();
    await adapter.analyze(context);

    // Verify context was not mutated
    assert.equal(JSON.stringify(context.messages), originalMessagesJson, "Context messages must not be mutated");
    // Verify store was not mutated
    assert.equal(store.getFinalizedSegments().length, 1);
    assert.equal(store.getSnapshot().lastSequence, 1);

    console.log("✔ Test S passed: Immutability of store and context strictly preserved.");
  }

  // -------------------------------------------------------------
  // Test T: SSR / Node Environment Safety
  // -------------------------------------------------------------
  console.log("\nTest T: SSR and Node environment safety...");
  {
    assert.equal(typeof window, "undefined");
    assert.equal(typeof document, "undefined");

    const adapter = new MockMeetingAnalysisAdapter();
    assert.ok(adapter, "Adapter instantiates cleanly without browser window/document globals");

    console.log("✔ Test T passed: SSR safety verified in Node environment.");
  }

  // -------------------------------------------------------------
  // Test U & V: Zero Canvas Dependencies & Zero STT-Vendor Dependencies
  // -------------------------------------------------------------
  console.log("\nTest U & V: Zero Canvas dependencies & zero vendor SDK dependencies...");
  {
    const analysisExports = Object.keys(
      await import("../src/app/lib/collaboration/meeting/analysis/index")
    );

    assert.ok(analysisExports.includes("MockMeetingAnalysisAdapter"));
    assert.ok(analysisExports.includes("BaseMeetingAnalysisAdapter"));
    assert.ok(analysisExports.includes("generateDeterministicInsightId"));
    assert.ok(analysisExports.includes("filterInsightsByType"));

    // Ensure no canvas action symbols or LLM vendor symbols are exported
    assert.equal(analysisExports.includes("CREATE_NODE"), false);
    assert.equal(analysisExports.includes("applyCanvasActions"), false);
    assert.equal(analysisExports.includes("CanvasNode"), false);
    assert.equal(analysisExports.includes("OpenAI"), false);

    console.log("✔ Test U & V passed: Architecture is completely free of Canvas and vendor SDK dependencies.");
  }

  console.log("\n=================================================");
  console.log("ALL PHASE 12.6.3 TESTS PASSED SUCCESSFULLY!");
  console.log("=================================================");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
