import { applyCanvasActions, type CanvasAction, type CanvasState } from "../src/app/lib/applyCanvasActions";
import { mapMeetingInsightToAction } from "../src/app/lib/collaboration/meeting/bridge";
import type { MeetingInsight } from "../src/app/lib/collaboration/meeting/analysis/meetingAnalysisTypes";
import { createCanvasSnapshot } from "../src/app/lib/collaboration/canvasSnapshot";
import { diffLocalNodeMutations } from "../src/app/lib/collaboration/nodeEvents";
import { diffLocalEdgeMutations } from "../src/app/lib/collaboration/edgeEvents";

console.log("=================================================");
console.log("RUNNING PHASE 17 FINAL DEMO WALKTHROUGH TEST");
console.log("=================================================");

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`✔ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`✘ FAIL: ${testName}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Step 0: Clean Start / Empty Canvas
// ---------------------------------------------------------------------------
console.log("\n--- Demo Step 0: Fresh Workspace Initialization ---");
let canvas: CanvasState = { nodes: [], edges: [], groups: [] };
assert(canvas.nodes.length === 0 && canvas.edges.length === 0, "Demo starts with pristine empty canvas");

// ---------------------------------------------------------------------------
// Step 1: Initial Pitch Input -> Platform Architecture Generation
// "We need to build a solar lead management platform. Vendors should receive qualified leads,
// admins need to verify leads, and the system should prevent duplicate leads."
// ---------------------------------------------------------------------------
console.log("\n--- Demo Step 1: AI -> Canvas Multi-Node Generation ---");
const step1Actions: CanvasAction[] = [
  { type: "CREATE_NODE", nodeType: "idea", title: "Solar Lead Platform", description: "Core hub for intake, scoring, and distribution." },
  { type: "CREATE_NODE", nodeType: "task", title: "Lead Capture", description: "Inbound landing pages and partner webhooks." },
  { type: "CREATE_NODE", nodeType: "task", title: "Lead Verification", description: "Admin and automated quality verification." },
  { type: "CREATE_NODE", nodeType: "task", title: "Vendor Management", description: "Routing qualified leads to active solar installers." },
  { type: "CREATE_NODE", nodeType: "problem", title: "Duplicate Leads", description: "High volume of repeated lead submissions." },
  { type: "CREATE_EDGE", sourceTitle: "Solar Lead Platform", targetTitle: "Lead Capture", relationship: "supports" },
  { type: "CREATE_EDGE", sourceTitle: "Solar Lead Platform", targetTitle: "Lead Verification", relationship: "supports" },
  { type: "CREATE_EDGE", sourceTitle: "Solar Lead Platform", targetTitle: "Vendor Management", relationship: "supports" },
  { type: "CREATE_EDGE", sourceTitle: "Lead Verification", targetTitle: "Duplicate Leads", relationship: "solves" }
];

canvas = applyCanvasActions(canvas, step1Actions);
assert(canvas.nodes.length === 5, "Step 1: 5 distinct core nodes generated");
assert(canvas.edges.length === 4, "Step 1: 4 structural relationship edges created");
assert(canvas.nodes.every(n => Boolean(n.id) && typeof n.position.x === "number"), "Step 1: all nodes have valid IDs & positions");

// ---------------------------------------------------------------------------
// Step 2: Relationships Formulation
// "Lead verification should prevent low-quality leads from reaching vendors."
// ---------------------------------------------------------------------------
console.log("\n--- Demo Step 2: Semantic Relationship Enrichment ---");
const step2Actions: CanvasAction[] = [
  { type: "CREATE_EDGE", sourceTitle: "Lead Verification", targetTitle: "Vendor Management", relationship: "solves" }
];

canvas = applyCanvasActions(canvas, step2Actions);
assert(canvas.edges.length === 5, "Step 2: Relationship edge connected between Verification and Vendor Management");
const relEdge = canvas.edges.find(e => {
  const s = canvas.nodes.find(n => n.id === e.sourceId);
  const t = canvas.nodes.find(n => n.id === e.targetId);
  return s?.title === "Lead Verification" && t?.title === "Vendor Management";
});
assert(Boolean(relEdge) && relEdge?.relationship === "solves", "Step 2: Relationship semantic preserved as 'solves'");

// ---------------------------------------------------------------------------
// Step 3: Natural Language Canvas Commands (MOVE, UPDATE, CREATE)
// ---------------------------------------------------------------------------
console.log("\n--- Demo Step 3: Direct Natural Language Canvas Commands ---");
// 3.1 MOVE_NODE
const step3Move: CanvasAction = {
  type: "MOVE_NODE",
  targetTitle: "Lead Verification",
  position: { x: 450, y: 200 }
};
const prevForMove = { ...canvas, nodes: [...canvas.nodes] };
canvas = applyCanvasActions(canvas, [step3Move]);
const movedNode = canvas.nodes.find(n => n.title === "Lead Verification");
assert(movedNode?.position.x === 450 && movedNode?.position.y === 200, "Step 3.1: Lead Verification repositioned on canvas");

// 3.2 UPDATE_NODE
const step3Update: CanvasAction = {
  type: "UPDATE_NODE",
  targetTitle: "Lead Verification",
  updates: {
    title: "Verified Lead Workflow",
    description: "Multi-step automated compliance and verification pipeline."
  }
};
canvas = applyCanvasActions(canvas, [step3Update]);
assert(canvas.nodes.some(n => n.title === "Verified Lead Workflow"), "Step 3.2: Renamed to 'Verified Lead Workflow'");
assert(!canvas.nodes.some(n => n.title === "Lead Verification"), "Step 3.2: Old title cleanly updated");

// 3.3 CREATE Task
const step3CreateTask: CanvasAction[] = [
  { type: "CREATE_NODE", nodeType: "solution", title: "Fuzzy Duplicate Scorer", description: "ML duplicate detection on email and address." },
  { type: "CREATE_EDGE", sourceTitle: "Fuzzy Duplicate Scorer", targetTitle: "Duplicate Leads", relationship: "solves" }
];
canvas = applyCanvasActions(canvas, step3CreateTask);
assert(canvas.nodes.length === 6, "Step 3.3: Total nodes increased to 6");
assert(canvas.edges.length === 6, "Step 3.3: Total edges increased to 6");

// ---------------------------------------------------------------------------
// Step 4: Meeting Intelligence -> Action Bridge
// During team audio/video meeting, an insight is synthesized:
// "Decision: Integrate third-party address verification API"
// ---------------------------------------------------------------------------
console.log("\n--- Demo Step 4: Meeting Insight to Workspace Action Bridge ---");
const meetingInsight: MeetingInsight = {
  id: "insight-demo-101",
  meetingId: "meeting-demo-session",
  type: "decision",
  title: "Integrate Postal Address API",
  summary: "Use Google Maps Places API to standardize solar installation addresses.",
  confidence: 0.95,
  sourceSegmentIds: ["seg-1", "seg-2"],
  speakerIds: ["speaker-alice"],
  timestamp: Date.now()
};

const mappedResult = mapMeetingInsightToAction(meetingInsight);
assert(mappedResult.success && Boolean(mappedResult.action), "Step 4: Meeting insight successfully mapped to CanvasAction");
if (mappedResult.success && mappedResult.action) {
  canvas = applyCanvasActions(canvas, [mappedResult.action]);
}
assert(canvas.nodes.some(n => n.title === "Integrate Postal Address API"), "Step 4: Meeting decision automatically rendered as canvas node");
assert(canvas.nodes.find(n => n.title === "Integrate Postal Address API")?.nodeType === "decision", "Step 4: Correct 'decision' nodeType applied");

// ---------------------------------------------------------------------------
// Step 5: Grouping / Workspace Structuring
// ---------------------------------------------------------------------------
console.log("\n--- Demo Step 5: High-Level Visual Grouping ---");
const groupAction: CanvasAction = {
  type: "GROUP_NODES",
  groupTitle: "Verification & Integrity Subsystem",
  nodeTitles: ["Verified Lead Workflow", "Duplicate Leads", "Fuzzy Duplicate Scorer", "Integrate Postal Address API"]
};
canvas = applyCanvasActions(canvas, [groupAction]);
assert(canvas.groups.length === 1, "Step 5: Visual group created on canvas");
assert(canvas.groups[0].title === "Verification & Integrity Subsystem", "Step 5: Correct group title assigned");
assert(canvas.groups[0].memberIds.length === 4, "Step 5: Group encompasses all 4 target nodes");

// ---------------------------------------------------------------------------
// Step 6: Final Canvas State Integrity
// ---------------------------------------------------------------------------
console.log("\n--- Demo Step 6: Final Canvas State Integrity & Snapshot ---");
assert(canvas.nodes.length === 7, "Step 6: Final node count is exactly 7");
assert(canvas.edges.length === 6, "Step 6: Final edge count is exactly 6");
assert(canvas.groups.length === 1, "Step 6: Final group count is exactly 1");

// Verify complete ID uniqueness and relationship integrity
const nodeIds = new Set(canvas.nodes.map(n => n.id));
assert(nodeIds.size === 7, "Step 6: 100% of node IDs are unique");

const edgeIntegrity = canvas.edges.every(e => nodeIds.has(e.sourceId) && nodeIds.has(e.targetId));
assert(edgeIntegrity, "Step 6: 100% of edges connect valid existing nodes (zero dangling edges)");

const groupIntegrity = canvas.groups.every(g => g.memberIds.every(mId => nodeIds.has(mId)));
assert(groupIntegrity, "Step 6: 100% of group members map to valid existing nodes");

// Test persistence snapshot serialization
const finalSnapshot = createCanvasSnapshot(canvas);
assert(finalSnapshot.nodes.length === 7 && finalSnapshot.edges.length === 6, "Step 6: Snapshot correctly serializes canvas for DB persistence");

console.log("\n=================================================");
console.log(`PHASE 17 DEMO WALKTHROUGH: ${passed} PASSED, ${failed} FAILED`);
console.log("=================================================");

if (failed > 0) {
  process.exit(1);
} else {
  console.log("ALL PHASE 17 DEMO WALKTHROUGH TESTS PASSED!");
  process.exit(0);
}
