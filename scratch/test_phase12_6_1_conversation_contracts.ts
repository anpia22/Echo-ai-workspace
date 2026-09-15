/**
 * Phase 12.6.1 Verification Suite: Meeting Conversation & Transcript Contracts
 *
 * Tests:
 * 1. Create transcript segment (interim & final)
 * 2. Interim segment updates in-place without advancing sequence
 * 3. Final segment transition (promotes interim, assigns next monotonic sequence)
 * 4. Deterministic ordering by sequence
 * 5. Duplicate segment rejection & strict idempotency:
 *    - Re-submitting final segment is idempotent no-op
 *    - Downgrading final to interim is forbidden
 * 6. Meeting isolation (rejects mismatched meetingId; no cross-meeting leakage)
 * 7. Speaker attribution across multiple speakers
 * 8. Cleanup / reset between meetings
 * 9. Future AI formatting boundary ([Speaker]: text, no LLM / Canvas dependencies)
 */

import assert from "node:assert/strict";
import {
  MeetingConversationStore,
  createMeetingConversationStore,
  formatTranscriptForAI,
  buildMeetingConversationContext,
  type MeetingTranscriptSegment,
} from "../src/app/lib/collaboration/meeting/conversation/index";

console.log("=================================================");
console.log("RUNNING PHASE 12.6.1 CONVERSATION CONTRACT TESTS");
console.log("=================================================\n");

const MEETING_ID_A = "meeting-room-alpha";
const MEETING_ID_B = "meeting-room-beta";

// -------------------------------------------------------------
// Test 1: Create transcript segment (interim & final)
// -------------------------------------------------------------
console.log("Test 1: Creating transcript segments (interim & final)...");
{
  const store = createMeetingConversationStore(MEETING_ID_A);
  assert.equal(store.getMeetingId(), MEETING_ID_A);

  // 1a. Create interim segment
  const interim = store.upsertSegment({
    id: "seg-1",
    meetingId: MEETING_ID_A,
    speakerId: "user-1",
    speakerName: "Alice",
    text: "Hello everyone",
    status: "interim",
    language: "en-US",
  });

  assert.ok(interim, "Interim segment must be returned");
  assert.equal(interim.id, "seg-1");
  assert.equal(interim.meetingId, MEETING_ID_A);
  assert.equal(interim.speakerId, "user-1");
  assert.equal(interim.speakerName, "Alice");
  assert.equal(interim.text, "Hello everyone");
  assert.equal(interim.status, "interim");
  assert.equal(interim.sequence, -1, "Interim segment must have sequence -1 (unassigned)");
  assert.equal(interim.source, "meeting");

  const snapshot = store.getSnapshot();
  assert.equal(snapshot.segments.length, 0, "No finalized segments yet");
  assert.equal(snapshot.interimSegments.length, 1, "Exactly 1 active interim segment");
  assert.equal(snapshot.lastSequence, 0, "Last sequence must still be 0");

  console.log("✔ Test 1 passed: Created interim segment with sequence -1.");
}

// -------------------------------------------------------------
// Test 2: Interim segment updates in-place without advancing sequence
// -------------------------------------------------------------
console.log("\nTest 2: Interim segment update without consuming sequence...");
{
  const store = createMeetingConversationStore(MEETING_ID_A);

  const listenerEvents: Array<{ id: string; text: string; status: string; seq: number }> = [];
  store.subscribe((segment) => {
    listenerEvents.push({ id: segment.id, text: segment.text, status: segment.status, seq: segment.sequence });
  });

  // Create initial interim
  store.upsertSegment({
    id: "seg-interim-1",
    meetingId: MEETING_ID_A,
    speakerId: "user-1",
    speakerName: "Alice",
    text: "We should",
    status: "interim",
  });

  // Update interim 1st time
  store.upsertSegment({
    id: "seg-interim-1",
    meetingId: MEETING_ID_A,
    speakerId: "user-1",
    speakerName: "Alice",
    text: "We should check",
    status: "interim",
  });

  // Update interim 2nd time
  store.upsertSegment({
    id: "seg-interim-1",
    meetingId: MEETING_ID_A,
    speakerId: "user-1",
    speakerName: "Alice",
    text: "We should check the server logs",
    status: "interim",
  });

  const snapshot = store.getSnapshot();
  assert.equal(snapshot.interimSegments.length, 1, "Interim updates must update in-place, not create multiple records");
  assert.equal(snapshot.interimSegments[0].text, "We should check the server logs");
  assert.equal(snapshot.interimSegments[0].sequence, -1, "Interim updates must never advance sequence");
  assert.equal(snapshot.lastSequence, 0, "Sequence counter must remain 0");
  assert.equal(snapshot.segments.length, 0, "Finalized segments count must remain 0");

  console.log("✔ Test 2 passed: Interim updates stayed in-place with sequence -1.");
}

// -------------------------------------------------------------
// Test 3: Final segment transition (promotes interim & assigns sequence)
// -------------------------------------------------------------
console.log("\nTest 3: Final segment transition (promotes interim & assigns sequence)...");
{
  const store = createMeetingConversationStore(MEETING_ID_A);

  // Start with interim
  store.upsertSegment({
    id: "seg-flow-1",
    meetingId: MEETING_ID_A,
    speakerId: "user-1",
    speakerName: "Alice",
    text: "Good morning team",
    status: "interim",
  });

  assert.equal(store.getInterimSegments().length, 1);
  assert.equal(store.getFinalizedSegments().length, 0);

  // Transition to final
  const finalized = store.upsertSegment({
    id: "seg-flow-1",
    meetingId: MEETING_ID_A,
    speakerId: "user-1",
    speakerName: "Alice",
    text: "Good morning team, let's start.",
    status: "final",
  });

  assert.ok(finalized);
  assert.equal(finalized.status, "final");
  assert.equal(finalized.sequence, 1, "First finalized segment must receive sequence 1");

  const snapshot = store.getSnapshot();
  assert.equal(snapshot.interimSegments.length, 0, "Interim must be removed upon finalization");
  assert.equal(snapshot.segments.length, 1, "Finalized list must have 1 segment");
  assert.equal(snapshot.segments[0].id, "seg-flow-1");
  assert.equal(snapshot.segments[0].sequence, 1);
  assert.equal(snapshot.lastSequence, 1);

  // Second segment directly submitted as final
  const final2 = store.upsertSegment({
    id: "seg-flow-2",
    meetingId: MEETING_ID_A,
    speakerId: "user-2",
    speakerName: "Bob",
    text: "Ready when you are.",
    status: "final",
  });

  assert.equal(final2?.sequence, 2, "Second finalized segment must receive sequence 2");
  assert.equal(store.getSnapshot().lastSequence, 2);

  console.log("✔ Test 3 passed: Transitioned interim to final with sequence 1 and 2.");
}

// -------------------------------------------------------------
// Test 4: Deterministic ordering by sequence
// -------------------------------------------------------------
console.log("\nTest 4: Deterministic ordering by sequence...");
{
  const store = createMeetingConversationStore(MEETING_ID_A);

  // Finalize 3 segments in order
  store.upsertSegment({ id: "s1", meetingId: MEETING_ID_A, speakerId: "u1", speakerName: "Alice", text: "Point 1", status: "final", timestamp: 1000 });
  store.upsertSegment({ id: "s2", meetingId: MEETING_ID_A, speakerId: "u2", speakerName: "Bob", text: "Point 2", status: "final", timestamp: 1050 });
  store.upsertSegment({ id: "s3", meetingId: MEETING_ID_A, speakerId: "u1", speakerName: "Alice", text: "Point 3", status: "final", timestamp: 1100 });

  const finalized = store.getFinalizedSegments();
  assert.equal(finalized.length, 3);
  assert.deepEqual(
    finalized.map((s) => ({ id: s.id, seq: s.sequence })),
    [
      { id: "s1", seq: 1 },
      { id: "s2", seq: 2 },
      { id: "s3", seq: 3 },
    ]
  );

  console.log("✔ Test 4 passed: Deterministic sequence ordering preserved.");
}

// -------------------------------------------------------------
// Test 5: Duplicate segment rejection & strict idempotency
// -------------------------------------------------------------
console.log("\nTest 5: Duplicate segment rejection & strict idempotency...");
{
  const store = createMeetingConversationStore(MEETING_ID_A);

  let listenerCount = 0;
  store.subscribe(() => {
    listenerCount++;
  });

  // Step 1: Initial finalization
  const res1 = store.upsertSegment({
    id: "dup-seg-1",
    meetingId: MEETING_ID_A,
    speakerId: "user-1",
    speakerName: "Alice",
    text: "Immutable text",
    status: "final",
  });
  assert.equal(res1?.sequence, 1);
  assert.equal(listenerCount, 1);

  // Step 2: Second final with identical ID (strict idempotent no-op)
  const res2 = store.upsertSegment({
    id: "dup-seg-1",
    meetingId: MEETING_ID_A,
    speakerId: "user-1",
    speakerName: "Alice",
    text: "Attempted duplicate text",
    status: "final",
  });

  assert.ok(res2);
  assert.equal(res2.id, "dup-seg-1");
  assert.equal(res2.text, "Immutable text", "Original finalized text must remain unchanged");
  assert.equal(res2.sequence, 1, "Sequence must not advance on duplicate final");
  assert.equal(listenerCount, 1, "Listeners must not be re-triggered for duplicate final segment");
  assert.equal(store.getFinalizedSegments().length, 1, "Store must contain exactly 1 segment");
  assert.equal(store.getSnapshot().lastSequence, 1, "lastSequence must remain 1");

  // Step 3: Attempt to downgrade finalized segment to interim (strictly forbidden)
  const resDowngrade = store.upsertSegment({
    id: "dup-seg-1",
    meetingId: MEETING_ID_A,
    speakerId: "user-1",
    speakerName: "Alice",
    text: "Downgrade attempt",
    status: "interim",
  });

  assert.ok(resDowngrade);
  assert.equal(resDowngrade.status, "final", "Segment must remain final; cannot be downgraded");
  assert.equal(resDowngrade.sequence, 1);
  assert.equal(store.getInterimSegments().length, 0, "No interim segments created on downgrade attempt");

  console.log("✔ Test 5 passed: Strict idempotency and downgrade prevention confirmed.");
}

// -------------------------------------------------------------
// Test 6: Meeting isolation (foreign meeting rejection & no leakage)
// -------------------------------------------------------------
console.log("\nTest 6: Meeting isolation...");
{
  const storeA = createMeetingConversationStore(MEETING_ID_A);
  const storeB = createMeetingConversationStore(MEETING_ID_B);

  // Store A rejects foreign meetingId
  const foreignResult = storeA.upsertSegment({
    id: "foreign-1",
    meetingId: MEETING_ID_B, // Mismatched!
    speakerId: "user-2",
    speakerName: "Bob",
    text: "Should be rejected",
    status: "final",
  });
  assert.equal(foreignResult, null, "Foreign meetingId segment must be strictly rejected");
  assert.equal(storeA.getFinalizedSegments().length, 0);

  // Populate store A and store B independently
  storeA.upsertSegment({
    id: "seg-a",
    meetingId: MEETING_ID_A,
    speakerId: "user-1",
    speakerName: "Alice",
    text: "Meeting A agenda",
    status: "final",
  });

  storeB.upsertSegment({
    id: "seg-b",
    meetingId: MEETING_ID_B,
    speakerId: "user-2",
    speakerName: "Bob",
    text: "Meeting B agenda",
    status: "final",
  });

  assert.equal(storeA.getFinalizedSegments().length, 1);
  assert.equal(storeA.getFinalizedSegments()[0].text, "Meeting A agenda");

  assert.equal(storeB.getFinalizedSegments().length, 1);
  assert.equal(storeB.getFinalizedSegments()[0].text, "Meeting B agenda");

  console.log("✔ Test 6 passed: Meeting isolation strictly enforced.");
}

// -------------------------------------------------------------
// Test 7: Speaker attribution across multiple speakers
// -------------------------------------------------------------
console.log("\nTest 7: Speaker attribution...");
{
  const store = createMeetingConversationStore(MEETING_ID_A);

  store.upsertSegment({ id: "sp-1", meetingId: MEETING_ID_A, speakerId: "usr-alice", speakerName: "Alice", text: "Shall we start?", status: "final" });
  store.upsertSegment({ id: "sp-2", meetingId: MEETING_ID_A, speakerId: "usr-bob", speakerName: "Bob", text: "Yes, ready.", status: "final" });
  store.upsertSegment({ id: "sp-3", meetingId: MEETING_ID_A, speakerId: "usr-charlie", speakerName: "Charlie", text: "I am here too.", status: "final" });

  const segments = store.getFinalizedSegments();
  assert.equal(segments[0].speakerId, "usr-alice");
  assert.equal(segments[0].speakerName, "Alice");

  assert.equal(segments[1].speakerId, "usr-bob");
  assert.equal(segments[1].speakerName, "Bob");

  assert.equal(segments[2].speakerId, "usr-charlie");
  assert.equal(segments[2].speakerName, "Charlie");

  console.log("✔ Test 7 passed: Speaker identity correctly attributed.");
}

// -------------------------------------------------------------
// Test 8: Cleanup / reset between meetings
// -------------------------------------------------------------
console.log("\nTest 8: Cleanup and reset...");
{
  const store = createMeetingConversationStore(MEETING_ID_A);

  store.upsertSegment({ id: "c-1", meetingId: MEETING_ID_A, speakerId: "u1", speakerName: "Alice", text: "Segment 1", status: "final" });
  store.upsertSegment({ id: "c-2", meetingId: MEETING_ID_A, speakerId: "u1", speakerName: "Alice", text: "Interim 2", status: "interim" });

  assert.equal(store.getFinalizedSegments().length, 1);
  assert.equal(store.getInterimSegments().length, 1);
  assert.equal(store.getSnapshot().lastSequence, 1);

  // Clear store
  store.clear();

  assert.equal(store.getFinalizedSegments().length, 0, "Finalized segments must be empty after clear()");
  assert.equal(store.getInterimSegments().length, 0, "Interim segments must be empty after clear()");
  assert.equal(store.getSnapshot().lastSequence, 0, "Sequence counter must be reset to 0");

  // New segment starts at sequence 1 again
  const newSegment = store.upsertSegment({
    id: "c-3",
    meetingId: MEETING_ID_A,
    speakerId: "u2",
    speakerName: "Bob",
    text: "Fresh meeting start",
    status: "final",
  });
  assert.equal(newSegment?.sequence, 1, "After clear, sequence must restart at 1");

  console.log("✔ Test 8 passed: Complete state and sequence reset on clear().");
}

// -------------------------------------------------------------
// Test 9: Future AI formatting contract
// -------------------------------------------------------------
console.log("\nTest 9: Future AI formatting boundary...");
{
  const store = createMeetingConversationStore(MEETING_ID_A);

  store.upsertSegment({ id: "ai-1", meetingId: MEETING_ID_A, speakerId: "u1", speakerName: "Alice", text: "We need to scale the database.", status: "final", timestamp: 10000 });
  store.upsertSegment({ id: "ai-2", meetingId: MEETING_ID_A, speakerId: "u2", speakerName: "Bob", text: "Let's add read replicas.", status: "final", timestamp: 12000 });
  store.upsertSegment({ id: "ai-interim", meetingId: MEETING_ID_A, speakerId: "u3", speakerName: "Charlie", text: "Wait I am still typing...", status: "interim", timestamp: 13000 });

  const formatted = formatTranscriptForAI(store.getFinalizedSegments());
  const expectedText = "[Alice]: We need to scale the database.\n[Bob]: Let's add read replicas.";

  assert.equal(formatted, expectedText, "AI transcript format must be exactly '[Speaker]: text'");

  const context = buildMeetingConversationContext(store);
  assert.equal(context.meetingId, MEETING_ID_A);
  assert.equal(context.formattedTranscript, expectedText);
  assert.equal(context.messages.length, 2);
  assert.equal(context.messages[0].speakerName, "Alice");
  assert.equal(context.messages[0].sequence, 1);
  assert.equal(context.messages[1].speakerName, "Bob");
  assert.equal(context.messages[1].sequence, 2);
  assert.deepEqual(context.participantIds.sort(), ["u1", "u2"].sort());
  assert.equal(context.startTime, 10000);
  assert.equal(context.endTime, 12000);

  console.log("✔ Test 9 passed: Pure data transformation for AI boundary verified.");
}

// -------------------------------------------------------------
// Test 10: Immutability & Cloning Protection (Deliberate Mutation Verification)
// -------------------------------------------------------------
console.log("\nTest 10: Immutability & cloning protection against external mutation...");
{
  const store = createMeetingConversationStore(MEETING_ID_A);

  // 10a. Verify upsertSegment returns an independent clone
  const returnedInterim = store.upsertSegment({
    id: "mut-interim-1",
    meetingId: MEETING_ID_A,
    speakerId: "u1",
    speakerName: "Alice",
    text: "Original interim text",
    status: "interim",
  });
  assert.ok(returnedInterim);

  // Deliberately mutate returned interim object
  returnedInterim.text = "MUTATED_INTERIM_TEXT";
  returnedInterim.speakerName = "HACKER_NAME";
  returnedInterim.sequence = 42;

  const currentInterims = store.getInterimSegments();
  assert.equal(currentInterims[0].text, "Original interim text", "Store interim text must NOT be affected by external mutation");
  assert.equal(currentInterims[0].speakerName, "Alice", "Store speakerName must NOT be affected by external mutation");
  assert.equal(currentInterims[0].sequence, -1, "Store sequence must NOT be affected by external mutation");

  // 10b. Verify upsertSegment final returns an independent clone
  const returnedFinal = store.upsertSegment({
    id: "mut-final-1",
    meetingId: MEETING_ID_A,
    speakerId: "u2",
    speakerName: "Bob",
    text: "Original final text",
    status: "final",
  });
  assert.ok(returnedFinal);

  // Deliberately mutate returned final object
  returnedFinal.text = "MUTATED_FINAL_TEXT";
  returnedFinal.sequence = 9999;

  const currentFinalized = store.getFinalizedSegments();
  assert.equal(currentFinalized[0].text, "Original final text", "Store final text must NOT be affected by external mutation");
  assert.equal(currentFinalized[0].sequence, 1, "Store sequence must NOT be affected by external mutation");

  // 10c. Verify getSnapshot() segments and interimSegments are independent clones
  const snapshot1 = store.getSnapshot();
  snapshot1.segments[0].text = "POISON_SNAPSHOT_SEGMENT";
  snapshot1.segments[0].sequence = 777;
  snapshot1.interimSegments[0].text = "POISON_SNAPSHOT_INTERIM";

  const snapshot2 = store.getSnapshot();
  assert.equal(snapshot2.segments[0].text, "Original final text", "Store snapshot segment must NOT be affected by previous snapshot mutation");
  assert.equal(snapshot2.segments[0].sequence, 1, "Store snapshot sequence must NOT be affected by previous snapshot mutation");
  assert.equal(snapshot2.interimSegments[0].text, "Original interim text", "Store snapshot interim must NOT be affected by previous snapshot mutation");

  // 10d. Verify getFinalizedSegments() and getInterimSegments() return independent clones
  const finList = store.getFinalizedSegments();
  finList[0].text = "POISON_GET_FINALIZED";
  assert.equal(store.getFinalizedSegments()[0].text, "Original final text");

  const intList = store.getInterimSegments();
  intList[0].text = "POISON_GET_INTERIMS";
  assert.equal(store.getInterimSegments()[0].text, "Original interim text");

  // 10e. Verify notifyListeners provides independent clones
  let listenerMutated = false;
  store.subscribe((eventSegment, eventSnapshot) => {
    // Deliberately attempt to mutate listener arguments
    eventSegment.text = "POISONED_LISTENER_SEGMENT";
    eventSegment.sequence = 888;
    if (eventSnapshot.segments.length > 0) {
      eventSnapshot.segments[0].text = "POISONED_LISTENER_SNAPSHOT";
    }
    listenerMutated = true;
  });

  store.upsertSegment({
    id: "mut-final-2",
    meetingId: MEETING_ID_A,
    speakerId: "u3",
    speakerName: "Charlie",
    text: "Charlie original text",
    status: "final",
  });

  assert.equal(listenerMutated, true, "Listener must have been invoked");
  const postListenerSnapshot = store.getSnapshot();
  const charlieSegment = postListenerSnapshot.segments.find((s) => s.id === "mut-final-2");
  assert.ok(charlieSegment);
  assert.equal(charlieSegment.text, "Charlie original text", "Store segment must remain untouched despite listener mutation");
  assert.equal(charlieSegment.sequence, 2, "Store sequence must remain untouched despite listener mutation");
  assert.equal(postListenerSnapshot.segments[0].text, "Original final text", "First segment in store must remain untouched");

  console.log("✔ Test 10 passed: Complete immutability and cloning protection verified.");
}

console.log("\n=================================================");
console.log("ALL PHASE 12.6.1 TESTS PASSED SUCCESSFULLY!");
console.log("=================================================");

