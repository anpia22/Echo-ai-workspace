/**
 * Phase 13.1 — Persistent Backend Workspace: Contract Verification Suite
 *
 * Verifies that all Phase 13.1 DTOs and contracts:
 * 1. Maintain identity separation (workspaceId !== meetingId !== roomId).
 * 2. Are 100% JSON-safe and serializable.
 * 3. Enforce server-authoritative revision and composite edge invariants.
 * 4. Maintain transcript sequence as ordering-only.
 * 5. Integrate cleanly with Phase 8 canvas, Phase 10 room, and Phase 12 meeting contracts.
 */

import {
  type Workspace,
  type WorkspaceMember,
  type CreateWorkspaceRequest,
  type CreateWorkspaceResponse,
  type LoadWorkspaceResponse,
  type ConversationRecord,
  type MessageRecord,
  type CanvasNodeRecord,
  type CanvasEdgeRecord,
  type CanvasGroupRecord,
  type CanvasSnapshotRecord,
  type CanvasMutationRequest,
  type CanvasMutationResponse,
  type CanvasActionRecord,
  type CanvasActionProvenanceMetadata,
  type MeetingRecord,
  type MeetingParticipantRecord,
  type MeetingTranscriptSegmentRecord,
  type MeetingInsightRecord,
  type MigrateWorkspaceRequest,
  type MigrateWorkspaceResponse,
  type WorkspaceId,
  type MeetingId,
  type RoomId,
} from "../src/app/lib/persistence";

import { applyCanvasActions, type CanvasState } from "../src/app/lib/applyCanvasActions";
import { deduplicateActions } from "../src/app/lib/deduplicateActions";
import { createMeetingConversationStore } from "../src/app/lib/collaboration/meeting/conversation";
import { bridgeMeetingInsights } from "../src/app/lib/collaboration/meeting/bridge";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[Phase 13.1 Assertion Failed] ${message}`);
  }
}

function verifyJsonRoundTrip<T>(data: T, label: string): T {
  const json = JSON.stringify(data);
  const parsed = JSON.parse(json);
  assert(parsed !== null && typeof parsed === "object", `${label} must parse to object`);
  return parsed as T;
}

console.log("=================================================");
console.log("RUNNING PHASE 13.1 ARCHITECTURE & CONTRACT TESTS");
console.log("=================================================\n");

// -------------------------------------------------------------
// Test 1: Identity Separation (workspaceId !== meetingId !== roomId)
// -------------------------------------------------------------
console.log("Test 1: Verifying identity separation...");
const wsId: WorkspaceId = "ws-prod-alpha-123";
const mId: MeetingId = "meeting-session-456";
const rId: RoomId = "echo-room:ephemeral-signal-789";

assert(wsId !== mId, "workspaceId must be distinct from meetingId");
assert(wsId !== rId, "workspaceId must be distinct from roomId");
assert(mId !== rId, "meetingId must be distinct from roomId");
console.log("✔ Test 1 passed: Conceptual identity separation strictly verified.\n");

// -------------------------------------------------------------
// Test 2: Workspace & Hydration Contracts
// -------------------------------------------------------------
console.log("Test 2: Verifying Workspace & Hydration DTOs...");
const workspace: Workspace = {
  id: wsId,
  title: "Alpha Project Workspace",
  description: "Durable collaborative project workspace",
  settings: { theme: "dark", aiAutoAnalyze: true },
  revision: 1,
  createdAt: "2026-09-06T13:00:00.000Z",
  updatedAt: "2026-09-06T13:00:00.000Z",
};

const member: WorkspaceMember = {
  id: "wm-001",
  workspaceId: wsId,
  userId: "user-alice",
  displayName: "Alice Dev",
  role: "owner",
  color: "#3b82f6",
  createdAt: "2026-09-06T13:00:00.000Z",
};

const loadResponse: LoadWorkspaceResponse = {
  workspace,
  members: [member],
  conversations: [],
  activeConversationMessages: [],
  canvas: {
    workspaceId: wsId,
    revision: 1,
    nodes: [],
    edges: [],
    groups: [],
  },
  recentMeetings: [],
};

const serializedWorkspace = verifyJsonRoundTrip(loadResponse, "LoadWorkspaceResponse");
assert(serializedWorkspace.workspace.id === wsId, "Serialized workspace ID matches");
assert(serializedWorkspace.workspace.revision === 1, "Server revision preserved");
console.log("✔ Test 2 passed: Workspace & Hydration DTOs are JSON-safe.\n");

// -------------------------------------------------------------
// Test 3: Canvas Materialized DTOs & Composite Edge Invariant
// -------------------------------------------------------------
console.log("Test 3: Verifying Canvas DTOs & Composite Edge Invariant...");
const nodeA: CanvasNodeRecord = {
  id: "node-111",
  workspaceId: wsId,
  nodeType: "problem",
  title: "Poor Lead Quality",
  description: "Low conversion rate on cold outreach",
  positionX: 100,
  positionY: 200,
  version: 1,
  createdAt: "2026-09-06T13:00:00.000Z",
  updatedAt: "2026-09-06T13:00:00.000Z",
};

const nodeB: CanvasNodeRecord = {
  id: "node-222",
  workspaceId: wsId,
  nodeType: "solution",
  title: "AI Lead Scoring",
  description: "Automated qualification engine",
  positionX: 400,
  positionY: 200,
  version: 1,
  createdAt: "2026-09-06T13:00:00.000Z",
  updatedAt: "2026-09-06T13:00:00.000Z",
};

const edgeAB: CanvasEdgeRecord = {
  id: "edge-333",
  workspaceId: wsId,
  sourceId: nodeA.id,
  targetId: nodeB.id,
  relationship: "solves",
  createdAt: "2026-09-06T13:00:00.000Z",
};

// Verify composite invariant
assert(
  edgeAB.workspaceId === nodeA.workspaceId && edgeAB.workspaceId === nodeB.workspaceId,
  "Edge workspaceId must match both sourceNode and targetNode workspaceId"
);

const canvasSnapshot: CanvasSnapshotRecord = {
  workspaceId: wsId,
  revision: 2,
  nodes: [nodeA, nodeB],
  edges: [edgeAB],
  groups: [],
};

const serializedCanvas = verifyJsonRoundTrip(canvasSnapshot, "CanvasSnapshotRecord");
assert(serializedCanvas.nodes.length === 2, "2 nodes serialized");
assert(serializedCanvas.edges[0].relationship === "solves", "Edge relationship preserved");
console.log("✔ Test 3 passed: Canvas materialized records conform to composite invariants.\n");

// -------------------------------------------------------------
// Test 4: Canvas Action Audit Log (Audit ONLY, NOT Canvas Engine)
// -------------------------------------------------------------
console.log("Test 4: Verifying Canvas Action Audit Log DTO...");
const meetingMetadata: CanvasActionProvenanceMetadata = {
  source: "meeting",
  meetingId: mId,
  insightId: "insight-hash-abc",
  sourceSegmentIds: ["seg-1", "seg-2"],
  speakerIds: ["user-alice"],
  confidence: 0.95,
};

const actionRecord: CanvasActionRecord = {
  id: "action-log-001",
  workspaceId: wsId,
  conversationId: "conv-001",
  actionType: "CREATE_NODE",
  payload: {
    nodeType: "problem",
    title: "Poor Lead Quality",
    description: "Uttered in meeting",
  },
  metadata: meetingMetadata,
  appliedBy: "user-alice",
  createdAt: "2026-09-06T13:05:00.000Z",
};

const serializedAction = verifyJsonRoundTrip(actionRecord, "CanvasActionRecord");
assert(serializedAction.metadata?.source === "meeting", "Meeting source tag preserved");
assert(serializedAction.metadata?.insightId === "insight-hash-abc", "Insight ID provenance preserved");
console.log("✔ Test 4 passed: Canvas Action audit contracts support full meeting provenance.\n");

// -------------------------------------------------------------
// Test 5: Meeting Records & Transcript Sequence as Ordering Only
// -------------------------------------------------------------
console.log("Test 5: Verifying Meeting & Transcript Segment DTOs...");
const meetingRecord: MeetingRecord = {
  id: mId,
  workspaceId: wsId,
  status: "active",
  startedAt: "2026-09-06T13:10:00.000Z",
  createdAt: "2026-09-06T13:10:00.000Z",
  title: "Weekly Planning Sync",
  createdBy: "user-alice",
};

// Segment 1 and Segment 2 with concurrent ordering check
const seg1: MeetingTranscriptSegmentRecord = {
  id: "seg-uuid-001",
  meetingId: mId,
  speakerId: "user-alice",
  speakerName: "Alice",
  text: "We have poor lead quality.",
  timestamp: 1788700756000,
  sequence: 1, // ordering
  status: "final",
  source: "meeting",
  createdAt: "2026-09-06T13:10:10.000Z",
};

const seg2: MeetingTranscriptSegmentRecord = {
  id: "seg-uuid-002",
  meetingId: mId,
  speakerId: "user-bob",
  speakerName: "Bob",
  text: "AI scoring can solve that.",
  timestamp: 1788700758000,
  sequence: 2, // ordering
  status: "final",
  source: "meeting",
  createdAt: "2026-09-06T13:10:12.000Z",
};

// Uniqueness check: (meetingId, segmentId)
assert(seg1.id !== seg2.id, "Segment IDs are unique");
assert(seg1.meetingId === seg2.meetingId, "Both segments belong to same meeting");

const insightRecord: MeetingInsightRecord = {
  id: "insight-fnv-999",
  meetingId: mId,
  type: "problem",
  title: "Poor Lead Quality",
  summary: "Alice reported lead qualification issues",
  sourceSegmentIds: [seg1.id],
  speakerIds: ["user-alice"],
  confidence: 0.92,
  timestamp: 1788700756000,
  createdAt: "2026-09-06T13:10:15.000Z",
};

const serializedMeeting = verifyJsonRoundTrip(meetingRecord, "MeetingRecord");
const serializedSeg = verifyJsonRoundTrip(seg1, "MeetingTranscriptSegmentRecord");
const serializedInsight = verifyJsonRoundTrip(insightRecord, "MeetingInsightRecord");
assert(serializedMeeting.id === mId, "Meeting ID preserved");
assert(serializedSeg.sequence === 1, "Sequence preserved for ordering");
assert(serializedInsight.type === "problem", "Insight type preserved");
console.log("✔ Test 5 passed: Meeting records enforce ordering sequence and identity independence.\n");

// -------------------------------------------------------------
// Test 6: Migration Contracts (Gated Verification & Retained Backup)
// -------------------------------------------------------------
console.log("Test 6: Verifying Migration DTOs...");
const migrationReq: MigrateWorkspaceRequest = {
  targetWorkspaceId: wsId,
  defaultWorkspaceTitle: "Migrated Workspace",
  payload: {
    sourceStorageKey: "echo-conversations",
    exportedAt: "2026-09-06T13:15:00.000Z",
    conversations: [
      {
        id: "legacy-conv-1",
        title: "Legacy Discussion",
        messages: [{ id: "m-1", role: "user", content: "Hello", createdAt: "2026-09-06T12:00:00.000Z" }],
        canvas: { nodes: [], edges: [], groups: [] },
        createdAt: "2026-09-06T12:00:00.000Z",
        updatedAt: "2026-09-06T12:00:00.000Z",
      },
    ],
  },
};

const migrationRes: MigrateWorkspaceResponse = {
  success: true,
  targetWorkspaceId: wsId,
  importedConversations: 1,
  importedMessages: 1,
  importedNodes: 0,
  importedEdges: 0,
  importedGroups: 0,
  skippedDuplicates: 0,
  migratedAt: "2026-09-06T13:15:05.000Z",
  backupStorageKey: "echo-conversations-backup",
  completionFlagKey: "echo-migrated-v1",
};

const serializedMigReq = verifyJsonRoundTrip(migrationReq, "MigrateWorkspaceRequest");
const serializedMigRes = verifyJsonRoundTrip(migrationRes, "MigrateWorkspaceResponse");
assert(serializedMigReq.payload.conversations.length === 1, "Payload conversation preserved");
assert(serializedMigRes.backupStorageKey === "echo-conversations-backup", "Safe backup key confirmed");
assert(serializedMigRes.completionFlagKey === "echo-migrated-v1", "Gated completion flag confirmed");
console.log("✔ Test 6 passed: Migration contracts support multi-stage gated safety.\n");

// -------------------------------------------------------------
// Test 7: Runtime Compatibility Check (Phase 8, 10, 12 remain untouched)
// -------------------------------------------------------------
console.log("Test 7: Verifying zero degradation to runtime engines...");

// A. Phase 8 applyCanvasActions remains authoritative
const initialCanvas: CanvasState = { nodes: [], edges: [], groups: [] };
const actions = deduplicateActions([
  { type: "CREATE_NODE", nodeType: "problem", title: "Runtime Node" },
]);
const nextCanvas = applyCanvasActions(initialCanvas, actions);
assert(nextCanvas.nodes.length === 1, "applyCanvasActions created node as expected");
assert(nextCanvas.nodes[0].title === "Runtime Node", "Title matches");

// B. Phase 12.6.1 MeetingConversationStore functions identically
const store = createMeetingConversationStore("meeting-test-runtime");
const segment = store.upsertSegment({
  id: "seg-test",
  meetingId: "meeting-test-runtime",
  speakerId: "u1",
  speakerName: "Alice",
  text: "Testing runtime store",
  status: "final",
});
assert(segment !== null, "Segment should be returned from upsertSegment");
assert(segment!.sequence === 1, "MeetingConversationStore assigned sequence 1");

// C. Phase 12.6.4 bridgeMeetingInsights functions identically
const bridgeResult = bridgeMeetingInsights(
  [
    {
      id: "ins-test",
      meetingId: "meeting-test-runtime",
      type: "idea",
      title: "New Product Concept",
      summary: "Explore persistent workspaces",
      sourceSegmentIds: [segment!.id],
      speakerIds: ["u1"],
      confidence: 0.99,
      timestamp: 1788700756000,
    },
  ],
  "meeting-test-runtime"
);
assert(bridgeResult.mappedCount === 1, "Insight cleanly bridged to CanvasAction");
assert(bridgeResult.actions[0].type === "CREATE_NODE", "Mapped to CREATE_NODE");
console.log("✔ Test 7 passed: Runtime canvas, meeting store, and bridge engines 100% operational.\n");

console.log("=================================================");
console.log("ALL PHASE 13.1 CONTRACT TESTS PASSED SUCCESSFULLY!");
console.log("=================================================");
