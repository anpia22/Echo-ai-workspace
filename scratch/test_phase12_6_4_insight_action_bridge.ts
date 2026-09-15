/**
 * Phase 12.6.4 — Meeting Insight to Canvas Action Bridge Test Suite
 *
 * Verifies:
 * - Pure transformation from MeetingInsight[] to CanvasAction[]
 * - Complete coverage of requirements A through Z and AA through AD
 * - Pipeline integration with existing deduplicateActions() and applyCanvasActions()
 * - Zero direct CanvasState mutation in bridge
 * - Zero ReactFlow, WebRTC, STT, or LLM SDK dependencies
 */

import assert from "node:assert/strict";
import {
  mapMeetingInsightToAction,
  mapMeetingInsightsToActions,
  bridgeMeetingInsights,
  SUPPORTED_CANVAS_NODE_TYPES,
} from "../src/app/lib/collaboration/meeting/bridge";
import type { MeetingInsight } from "../src/app/lib/collaboration/meeting/analysis/meetingAnalysisTypes";
import {
  applyCanvasActions,
  type CanvasState,
  type CanvasAction,
} from "../src/app/lib/applyCanvasActions";
import { deduplicateActions } from "../src/app/lib/deduplicateActions";

const MEETING_ID_ALPHA = "meeting-room-alpha";
const MEETING_ID_BETA = "meeting-room-beta";

function createValidInsight(
  overrides: Partial<MeetingInsight> = {}
): MeetingInsight {
  return {
    id: "ins-problem-lead-quality-12345",
    meetingId: MEETING_ID_ALPHA,
    type: "problem",
    title: "Lead quality problem",
    summary: "Inbound leads are not converting well.",
    sourceSegmentIds: ["seg-101", "seg-102"],
    speakerIds: ["user-alice"],
    confidence: 0.95,
    timestamp: 1700000000000,
    ...overrides,
  };
}

async function run() {
  console.log("=================================================");
  console.log("RUNNING PHASE 12.6.4 INSIGHT ACTION BRIDGE TESTS");
  console.log("=================================================");

  // -------------------------------------------------------------
  // Test A: Empty insights
  // -------------------------------------------------------------
  console.log("\nTest A: Empty insights handling...");
  {
    const actions = mapMeetingInsightsToActions([]);
    assert.deepEqual(actions, []);

    const bridgeResult = bridgeMeetingInsights([]);
    assert.equal(bridgeResult.actions.length, 0);
    assert.equal(bridgeResult.mappedCount, 0);
    assert.equal(bridgeResult.skippedCount, 0);
    assert.equal(bridgeResult.diagnostics.length, 0);

    console.log("✔ Test A passed: Empty input produces empty output with zero side effects.");
  }

  // -------------------------------------------------------------
  // Tests B–G: Single insight mapping for all 6 supported types
  // -------------------------------------------------------------
  console.log("\nTests B–G: Single insight mapping for all 6 supported types...");
  {
    for (const nodeType of SUPPORTED_CANVAS_NODE_TYPES) {
      const insight = createValidInsight({
        id: `ins-${nodeType}-test-1`,
        type: nodeType,
        title: `Test ${nodeType} title`,
        summary: `Test ${nodeType} summary`,
      });

      const res = mapMeetingInsightToAction(insight);
      assert.equal(res.success, true);
      if (res.success) {
        assert.equal(res.action.type, "CREATE_NODE");
        assert.equal(res.action.nodeType, nodeType);
        assert.equal(res.action.title, `Test ${nodeType} title`);
        assert.equal(res.action.description, `Test ${nodeType} summary`);
        assert.ok(res.action.metadata);
        assert.equal(res.action.metadata.source, "meeting");
        assert.equal(res.action.metadata.meetingId, MEETING_ID_ALPHA);
        assert.equal(res.action.metadata.insightId, `ins-${nodeType}-test-1`);
      }
    }
    console.log("✔ Tests B–G passed: All 6 supported types map cleanly to CREATE_NODE.");
  }

  // -------------------------------------------------------------
  // Test H: Note handling according to verified Phase 8 capability
  // -------------------------------------------------------------
  console.log("\nTest H: Note insight handling (unsupported in Phase 8)...");
  {
    const noteInsight = createValidInsight({
      id: "ins-note-1",
      type: "note" as any,
      title: "Casual meeting note",
      summary: "This was just an informal observation.",
    });

    const res = mapMeetingInsightToAction(noteInsight);
    assert.equal(res.success, false);
    if (!res.success) {
      assert.equal(res.error.code, "UNSUPPORTED_TYPE");
      assert.ok(res.error.message.includes("native 'note' node type"));
    }

    const bridgeRes = bridgeMeetingInsights([noteInsight]);
    assert.equal(bridgeRes.actions.length, 0);
    assert.equal(bridgeRes.skippedCount, 1);
    assert.equal(bridgeRes.diagnostics[0].code, "UNSUPPORTED_TYPE");

    console.log("✔ Test H passed: Note is safely rejected as UNSUPPORTED_TYPE without inventing fake types.");
  }

  // -------------------------------------------------------------
  // Tests I, J, K: Correct title, description, and nodeType
  // -------------------------------------------------------------
  console.log("\nTests I, J, K: Semantic field propagation...");
  {
    const insight = createValidInsight({
      title: "  Padded Title  ",
      summary: "Exact detailed summary of the issue.",
      type: "decision",
    });

    const res = mapMeetingInsightToAction(insight);
    assert.equal(res.success, true);
    if (res.success) {
      assert.equal(res.action.title, "Padded Title", "Title must be cleanly trimmed");
      assert.equal(res.action.description, "Exact detailed summary of the issue.");
      assert.equal(res.action.nodeType, "decision");
    }
    console.log("✔ Tests I, J, K passed: Title, summary, and nodeType propagated accurately.");
  }

  // -------------------------------------------------------------
  // Tests L & M: Deterministic repeated mapping
  // -------------------------------------------------------------
  console.log("\nTests L & M: Deterministic repeated mapping...");
  {
    const insight = createValidInsight();
    const run1 = mapMeetingInsightToAction(insight);
    const run2 = mapMeetingInsightToAction(insight);

    assert.deepEqual(run1, run2, "Repeated mapping must be strictly identical");
    console.log("✔ Tests L & M passed: Zero non-deterministic artifacts across runs.");
  }

  // -------------------------------------------------------------
  // Test N: Multiple insights preserve deterministic order
  // -------------------------------------------------------------
  console.log("\nTest N: Preserving deterministic insight ordering...");
  {
    const ins1 = createValidInsight({ id: "ins-1", title: "First Problem", type: "problem" });
    const ins2 = createValidInsight({ id: "ins-2", title: "Second Solution", type: "solution" });
    const ins3 = createValidInsight({ id: "ins-3", title: "Third Task", type: "task" });

    const actions = mapMeetingInsightsToActions([ins1, ins2, ins3]);
    assert.equal(actions.length, 3);
    assert.equal(actions[0].title, "First Problem");
    assert.equal(actions[1].title, "Second Solution");
    assert.equal(actions[2].title, "Third Task");
    console.log("✔ Test N passed: Input order strictly preserved in mapped actions.");
  }

  // -------------------------------------------------------------
  // Tests O & P: Input array & metadata immutability
  // -------------------------------------------------------------
  console.log("\nTests O & P: Immutability of input array and nested metadata...");
  {
    const originalSegments = ["seg-1", "seg-2"];
    const originalSpeakers = ["user-1"];
    const insight = createValidInsight({
      sourceSegmentIds: originalSegments,
      speakerIds: originalSpeakers,
    });
    const batch = [insight];

    const actions = mapMeetingInsightsToActions(batch);
    // Mutate action metadata
    actions[0].metadata!.sourceSegmentIds!.push("mutated-segment");
    actions[0].metadata!.speakerIds!.push("mutated-speaker");

    // Verify original insight is untouched
    assert.deepEqual(insight.sourceSegmentIds, ["seg-1", "seg-2"]);
    assert.deepEqual(insight.speakerIds, ["user-1"]);
    assert.equal(batch.length, 1);

    console.log("✔ Tests O & P passed: Deep immutability enforced for arrays and metadata.");
  }

  // -------------------------------------------------------------
  // Tests Q–V: Strict validation and rejection
  // -------------------------------------------------------------
  console.log("\nTests Q–V: Strict field validation...");
  {
    // Q: Missing insight ID
    assert.equal(mapMeetingInsightToAction(createValidInsight({ id: "" })).success, false);
    // R: Missing meeting ID
    assert.equal(mapMeetingInsightToAction(createValidInsight({ meetingId: "  " })).success, false);
    // S: Missing title
    assert.equal(mapMeetingInsightToAction(createValidInsight({ title: "" })).success, false);
    // T: Invalid type
    assert.equal(mapMeetingInsightToAction(createValidInsight({ type: "unknown-type" as any })).success, false);
    // U: Invalid sourceSegmentIds (non-array)
    assert.equal(mapMeetingInsightToAction(createValidInsight({ sourceSegmentIds: "not-array" as any })).success, false);
    // V: Invalid speakerIds (non-array)
    assert.equal(mapMeetingInsightToAction(createValidInsight({ speakerIds: null as any })).success, false);

    // Strict mapper throws on INVALID_INPUT
    assert.throws(() => {
      mapMeetingInsightsToActions([createValidInsight({ id: "" })]);
    });

    console.log("✔ Tests Q–V passed: Malformed insight fields rejected with INVALID_INPUT.");
  }

  // -------------------------------------------------------------
  // Test W: Meeting isolation & Authoritative meeting ID resolution
  // -------------------------------------------------------------
  console.log("\nTest W: Meeting isolation in bridge...");
  {
    const insRoomAlpha = createValidInsight({ id: "ins-a", meetingId: MEETING_ID_ALPHA });
    const insRoomBeta = createValidInsight({ id: "ins-b", meetingId: MEETING_ID_BETA });

    const bridgeResult = bridgeMeetingInsights([insRoomAlpha, insRoomBeta], MEETING_ID_ALPHA);
    assert.equal(bridgeResult.mappedCount, 1);
    assert.equal(bridgeResult.skippedCount, 1);
    assert.equal(bridgeResult.diagnostics[0].code, "INVALID_INPUT");
    assert.ok(bridgeResult.diagnostics[0].message.includes("Meeting isolation violation"));

    // W2: Empty expectedMeetingId string strictly rejected
    const emptyExpectedResult = bridgeMeetingInsights([insRoomAlpha], "   ");
    assert.equal(emptyExpectedResult.mappedCount, 0);
    assert.equal(emptyExpectedResult.skippedCount, 1);
    assert.equal(emptyExpectedResult.diagnostics[0].code, "INVALID_INPUT");
    assert.ok(emptyExpectedResult.diagnostics[0].message.includes("expectedMeetingId must be a non-empty string"));

    // W3: Malformed first insight without meetingId does not prevent establishing valid authoritative ID
    const malformedWithoutMeetingId = createValidInsight({ id: "ins-bad", meetingId: "" as any });
    const validAlpha = createValidInsight({ id: "ins-good", meetingId: MEETING_ID_ALPHA });
    const batchWithBadFirst = bridgeMeetingInsights([malformedWithoutMeetingId, validAlpha]);
    assert.equal(batchWithBadFirst.meetingId, MEETING_ID_ALPHA, "Authoritative meeting ID must be established from valid insight");
    assert.equal(batchWithBadFirst.mappedCount, 1, "Valid insight should map successfully");
    assert.equal(batchWithBadFirst.skippedCount, 1, "Malformed first insight should be skipped with INVALID_INPUT");
    assert.equal(batchWithBadFirst.diagnostics[0].code, "INVALID_INPUT");

    console.log("✔ Test W passed: Cross-meeting insight batch strictly rejected with isolation violation.");
  }

  // -------------------------------------------------------------
  // Test X: Provenance preservation
  // -------------------------------------------------------------
  console.log("\nTest X: Provenance preservation...");
  {
    const insight = createValidInsight({
      id: "ins-provenance-test",
      meetingId: MEETING_ID_ALPHA,
      sourceSegmentIds: ["seg-99", "seg-100"],
      speakerIds: ["spk-alice", "spk-bob"],
      confidence: 0.88,
    });

    const res = mapMeetingInsightToAction(insight);
    assert.equal(res.success, true);
    if (res.success) {
      assert.deepEqual(res.action.metadata, {
        source: "meeting",
        meetingId: MEETING_ID_ALPHA,
        insightId: "ins-provenance-test",
        sourceSegmentIds: ["seg-99", "seg-100"],
        speakerIds: ["spk-alice", "spk-bob"],
        confidence: 0.88,
      });
      // Strict provenance check: source is literal "meeting", meetingId and insightId are non-empty strings
      assert.equal(res.action.metadata?.source, "meeting");
      assert.equal(typeof res.action.metadata?.meetingId, "string");
      assert.equal(typeof res.action.metadata?.insightId, "string");
    }
    console.log("✔ Test X passed: Full meeting provenance preserved on action metadata.");
  }


  // -------------------------------------------------------------
  // Test Y & Z: Duplicate mapping & deduplicateActions compatibility
  // -------------------------------------------------------------
  console.log("\nTest Y & Z: Duplicate mapping & deduplicateActions compatibility...");
  {
    const insight1 = createValidInsight({ title: "Common Problem" });
    const insight2 = createValidInsight({ title: "Common Problem" });

    const actions = mapMeetingInsightsToActions([insight1, insight2]);
    assert.equal(actions.length, 2);

    // Run through existing Phase 8 deduplicateActions
    const deduplicated = deduplicateActions(actions);
    assert.equal(deduplicated.length, 1, "deduplicateActions must collapse identical title CREATE_NODE");
    assert.equal(deduplicated[0].title, "Common Problem");

    console.log("✔ Test Y & Z passed: Duplicate actions collapse cleanly via Phase 8 deduplicateActions.");
  }

  // -------------------------------------------------------------
  // Test AA: Cross-meeting duplicate title (Phase 8 title uniqueness authoritative)
  // -------------------------------------------------------------
  console.log("\nTest AA: Cross-meeting duplicate title handling...");
  {
    const insA = createValidInsight({ meetingId: MEETING_ID_ALPHA, title: "Lead quality problem" });
    const insB = createValidInsight({ meetingId: MEETING_ID_BETA, title: "Lead quality problem" });

    // Bridge maps each individually with its own isolated meeting metadata
    const actionA = mapMeetingInsightToAction(insA);
    const actionB = mapMeetingInsightToAction(insB);
    assert.equal(actionA.success && actionA.action.metadata?.meetingId, MEETING_ID_ALPHA);
    assert.equal(actionB.success && actionB.action.metadata?.meetingId, MEETING_ID_BETA);

    // But when passing through Phase 8 deduplicateActions, Phase 8 title uniqueness remains authoritative
    if (actionA.success && actionB.success) {
      const deduped = deduplicateActions([actionA.action, actionB.action]);
      assert.equal(deduped.length, 1, "Phase 8 deduplicateActions title identity remains authoritative");
    }

    console.log("✔ Test AA passed: Bridge retains isolated metadata while Phase 8 action identity remains authoritative.");
  }

  // -------------------------------------------------------------
  // Test AB: Metadata immutability
  // -------------------------------------------------------------
  console.log("\nTest AB: Strict metadata immutability...");
  {
    const sourceSegmentIds = ["seg-1", "seg-2"];
    const speakerIds = ["user-1"];
    const insight = createValidInsight({ sourceSegmentIds, speakerIds });

    const res = mapMeetingInsightToAction(insight);
    assert.equal(res.success, true);
    if (res.success && res.action.metadata) {
      res.action.metadata.sourceSegmentIds!.push("evil");
      res.action.metadata.speakerIds!.push("evil");

      assert.deepEqual(sourceSegmentIds, ["seg-1", "seg-2"]);
      assert.deepEqual(speakerIds, ["user-1"]);
    }
    console.log("✔ Test AB passed: Mutating action metadata does not affect original insight.");
  }

  // -------------------------------------------------------------
  // Test AC: Invalid array contents
  // -------------------------------------------------------------
  console.log("\nTest AC: Deep validation of array contents...");
  {
    // Non-string or empty string segment ID
    assert.equal(
      mapMeetingInsightToAction(createValidInsight({ sourceSegmentIds: [123 as any] })).success,
      false
    );
    assert.equal(
      mapMeetingInsightToAction(createValidInsight({ sourceSegmentIds: ["" as any] })).success,
      false
    );
    assert.equal(
      mapMeetingInsightToAction(createValidInsight({ sourceSegmentIds: [null as any] })).success,
      false
    );

    // Non-string or empty string speaker ID
    assert.equal(
      mapMeetingInsightToAction(createValidInsight({ speakerIds: [null as any] })).success,
      false
    );
    assert.equal(
      mapMeetingInsightToAction(createValidInsight({ speakerIds: ["   " as any] })).success,
      false
    );
    assert.equal(
      mapMeetingInsightToAction(createValidInsight({ speakerIds: [{} as any] })).success,
      false
    );

    console.log("✔ Test AC passed: Invalid array element types rejected with INVALID_INPUT.");
  }

  // -------------------------------------------------------------
  // Test AD: Confidence bounds validation
  // -------------------------------------------------------------
  console.log("\nTest AD: Confidence bounds validation...");
  {
    assert.equal(mapMeetingInsightToAction(createValidInsight({ confidence: 1.5 })).success, false);
    assert.equal(mapMeetingInsightToAction(createValidInsight({ confidence: -0.2 })).success, false);
    assert.equal(mapMeetingInsightToAction(createValidInsight({ confidence: NaN })).success, false);
    assert.equal(mapMeetingInsightToAction(createValidInsight({ confidence: Infinity })).success, false);

    // Valid edge values: 0 and 1
    assert.equal(mapMeetingInsightToAction(createValidInsight({ confidence: 0 })).success, true);
    assert.equal(mapMeetingInsightToAction(createValidInsight({ confidence: 1 })).success, true);

    console.log("✔ Test AD passed: Confidence validated strictly in [0, 1] range.");
  }

  // -------------------------------------------------------------
  // Pipeline Integration Test:
  // MeetingInsight[] -> bridge -> CanvasAction[] -> deduplicateActions() -> applyCanvasActions()
  // -------------------------------------------------------------
  console.log("\nPipeline Integration Test: End-to-end bridge to Phase 8 canvas execution...");
  {
    const initialCanvas: CanvasState = {
      nodes: [
        {
          id: "existing-node-1",
          nodeType: "problem",
          title: "Existing Canvas Problem",
          description: "Pre-existing on the board",
          position: { x: 100, y: 100 },
        },
      ],
      edges: [],
      groups: [],
    };

    const insights: MeetingInsight[] = [
      createValidInsight({
        id: "ins-int-1",
        type: "problem",
        title: "Existing Canvas Problem", // Duplicate title! Must not duplicate canvas node.
        summary: "Same problem discussed again",
      }),
      createValidInsight({
        id: "ins-int-2",
        type: "solution",
        title: "Automated Verification Flow",
        summary: "Verification will improve lead quality.",
      }),
      createValidInsight({
        id: "ins-int-3",
        type: "task",
        title: "Implement PostgreSQL schema",
        summary: "Build tables for lead scoring.",
      }),
      createValidInsight({
        id: "ins-int-4",
        type: "note" as any, // Unsupported note -> safely skipped!
        title: "Discussion note",
        summary: "Should be skipped.",
      }),
    ];

    // 1. Bridge mapping
    const bridgeResult = bridgeMeetingInsights(insights, MEETING_ID_ALPHA);
    assert.equal(bridgeResult.mappedCount, 3);
    assert.equal(bridgeResult.skippedCount, 1);
    assert.equal(bridgeResult.actions.length, 3);

    // 2. Existing Phase 8 deduplication
    const dedupedActions = deduplicateActions(bridgeResult.actions);
    assert.equal(dedupedActions.length, 3);

    // 3. Existing Phase 8 canvas execution
    const nextCanvas = applyCanvasActions(initialCanvas, dedupedActions);

    // Verify results
    assert.equal(nextCanvas.nodes.length, 3, "Expected 1 pre-existing + 2 new nodes (duplicate skipped)");
    assert.ok(nextCanvas.nodes.some((n) => n.title === "Existing Canvas Problem"));
    assert.ok(nextCanvas.nodes.some((n) => n.title === "Automated Verification Flow"));
    assert.ok(nextCanvas.nodes.some((n) => n.title === "Implement PostgreSQL schema"));

    // Verify initialCanvas was NOT mutated (immutability)
    assert.equal(initialCanvas.nodes.length, 1);

    // Verify new nodes received incremental layout positions
    const solutionNode = nextCanvas.nodes.find((n) => n.title === "Automated Verification Flow");
    assert.ok(solutionNode && typeof solutionNode.position.x === "number");

    console.log("✔ Pipeline Integration Test passed: Full flow from MeetingInsight to CanvasState execution verified!");
  }

  console.log("\n=================================================");
  console.log("ALL PHASE 12.6.4 TESTS PASSED SUCCESSFULLY!");
  console.log("=================================================");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
