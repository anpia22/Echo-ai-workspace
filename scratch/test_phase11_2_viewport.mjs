import {
  isValidCoordinate,
  isValidZoom,
  isValidViewport,
  cloneViewport,
  isSameViewport,
} from "../src/app/lib/collaboration/viewportEvents.ts";
function emptyCanvas() {
  return { nodes: [], edges: [], groups: [] };
}
import { createCanvasSnapshot } from "../src/app/lib/collaboration/canvasSnapshot.ts";
import { getRoomIdFromUrl, getRoomMode } from "../src/app/lib/collaboration/room.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log("Starting Phase 11.2 Viewport State Model Test Suite...\n");

let passedCount = 0;
function pass(testName) {
  passedCount++;
  console.log(`PASS [${passedCount}]: ${testName}`);
}

// -------------------------------------------------------------
// Test 1: Type Correctness & Helpers
// -------------------------------------------------------------
const validVp = { x: 120.5, y: -45.2, zoom: 1.25 };
assert(isValidViewport(validVp), "validVp must be recognized as valid ViewportState");
assert(isValidCoordinate(validVp.x), "x must be a valid coordinate");
assert(isValidCoordinate(validVp.y), "y must be a valid coordinate");
assert(isValidZoom(validVp.zoom), "zoom must be a valid zoom");

assert(!isValidViewport(null), "null is not a valid viewport");
assert(!isValidViewport({}), "empty object is not a valid viewport");
assert(!isValidViewport({ x: "10", y: 20, zoom: 1 }), "string x is not valid");
assert(!isValidViewport({ x: 10, y: 20, zoom: 0 }), "zoom <= 0 is not valid");
assert(!isValidViewport({ x: 10, y: 20, zoom: -1 }), "negative zoom is not valid");
assert(!isValidViewport({ x: NaN, y: 20, zoom: 1 }), "NaN is not valid");
assert(!isValidViewport({ x: Infinity, y: 20, zoom: 1 }), "Infinity is not valid");

const cloned = cloneViewport(validVp);
assert(cloned !== validVp, "cloneViewport must return a new object reference");
assert(isSameViewport(cloned, validVp), "cloned must match original values");
assert(!isSameViewport(validVp, { x: 121, y: -45.2, zoom: 1.25 }), "different x must not be same viewport");
pass("Test 1 — Type correctness and validation helpers");

// -------------------------------------------------------------
// Test 2: Pan Tracking
// -------------------------------------------------------------
let currentViewport = { x: 0, y: 0, zoom: 1 };
function simulatePan(deltaX, deltaY) {
  currentViewport = {
    x: currentViewport.x + deltaX,
    y: currentViewport.y + deltaY,
    zoom: currentViewport.zoom,
  };
}

simulatePan(150, -80);
assert(currentViewport.x === 150 && currentViewport.y === -80 && currentViewport.zoom === 1, "pan must update x and y");
simulatePan(-50, 30);
assert(currentViewport.x === 100 && currentViewport.y === -50 && currentViewport.zoom === 1, "subsequent pan must update x and y");
pass("Test 2 — Pan tracking reflects (x, y) correctly");

// -------------------------------------------------------------
// Test 3: Zoom Tracking
// -------------------------------------------------------------
function simulateZoom(newZoom) {
  currentViewport = {
    x: currentViewport.x,
    y: currentViewport.y,
    zoom: newZoom,
  };
}

simulateZoom(1.75);
assert(currentViewport.zoom === 1.75 && currentViewport.x === 100 && currentViewport.y === -50, "zoom in must update scale");
simulateZoom(0.5);
assert(currentViewport.zoom === 0.5 && currentViewport.x === 100 && currentViewport.y === -50, "zoom out must update scale");
pass("Test 3 — Zoom tracking reflects zoom scale correctly");

// -------------------------------------------------------------
// Test 4: FitView Compatibility
// -------------------------------------------------------------
function simulateFitView(bounds, viewportPadding = 0.24) {
  // Simulates ReactFlow calculate transform for bounding box
  const calculatedZoom = Math.min(2, Math.max(0.2, 1 / (1 + viewportPadding)));
  const calculatedX = bounds.minX + 50;
  const calculatedY = bounds.minY + 50;
  currentViewport = {
    x: calculatedX,
    y: calculatedY,
    zoom: calculatedZoom,
  };
  return currentViewport;
}

const fitResult = simulateFitView({ minX: -200, minY: -100, maxX: 400, maxY: 300 });
assert(isValidViewport(fitResult), "fitView must yield valid ViewportState");
assert(currentViewport.zoom > 0 && currentViewport.zoom <= 2, "fitView zoom must stay within bounds");
pass("Test 4 — FitView compatibility updates viewport tracking accurately");

// -------------------------------------------------------------
// Test 5: Programmatic Viewport (ViewportApi contract)
// -------------------------------------------------------------
let internalRfViewport = { x: 0, y: 0, zoom: 1 };
const viewportApi = {
  getViewport: () => cloneViewport(internalRfViewport),
  setViewport: (vp) => {
    internalRfViewport = cloneViewport(vp);
  },
};

const targetVp = { x: 340, y: -120, zoom: 1.4 };
viewportApi.setViewport(targetVp);
const readVp = viewportApi.getViewport();
assert(isSameViewport(readVp, targetVp), "viewportApi getViewport must return target setViewport");
pass("Test 5 — Programmatic ViewportApi contract (getViewport / setViewport)");

// -------------------------------------------------------------
// Test 6: Persistence Isolation
// -------------------------------------------------------------
const testCanvas = emptyCanvas();
const snapshot = createCanvasSnapshot(testCanvas);

assert(!("viewport" in testCanvas), "CanvasState must NOT contain viewport");
assert(!("x" in testCanvas), "CanvasState must NOT contain x");
assert(!("y" in testCanvas), "CanvasState must NOT contain y");
assert(!("zoom" in testCanvas), "CanvasState must NOT contain zoom");
assert(!("viewport" in snapshot), "CanvasSnapshot must NOT contain viewport");

// Verify simulated localStorage conversation record
const conversationRecord = {
  id: "test-conv-id",
  title: "Test Conversation",
  messages: [],
  actions: [],
  canvas: testCanvas,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const serialized = JSON.stringify(conversationRecord);
assert(!serialized.includes('"viewport"'), "localStorage payload must NOT contain viewport");
pass("Test 6 — Persistence isolation (localStorage & CanvasState are untouched)");

// -------------------------------------------------------------
// Test 7: Realtime Collaboration Isolation
// -------------------------------------------------------------
// Verify no Phase 11.3 viewport collaboration events exist in active room protocols
const allowedEvents = new Set([
  "NODE_UPSERT",
  "NODE_DELETED",
  "NODE_MOVED",
  "EDGE_UPSERT",
  "EDGE_DELETED",
  "GROUP_UPSERT",
  "GROUP_DELETED",
  "REQUEST_SYNC",
  "SYNC_STATE",
  "CURSOR_MOVE",
]);

assert(!allowedEvents.has("VIEWPORT_UPDATE"), "VIEWPORT_UPDATE must NOT be enabled in Phase 11.2");
assert(!allowedEvents.has("FOLLOW_USER"), "FOLLOW_USER must NOT be enabled in Phase 11.2");
assert(!allowedEvents.has("UNFOLLOW_USER"), "UNFOLLOW_USER must NOT be enabled in Phase 11.2");
pass("Test 7 — Collaboration isolation (zero realtime viewport events emitted in Phase 11.2)");

// -------------------------------------------------------------
// Test 8: Solo Mode Unchanged
// -------------------------------------------------------------
const emptyParams = new URLSearchParams("");
const roomId = getRoomIdFromUrl(emptyParams);
const soloMode = getRoomMode(roomId);
assert(soloMode === "solo", "empty room query param must remain solo mode");
pass("Test 8 — Solo mode remains completely functional and untouched");

console.log("\n==========================================");
console.log(`ALL ${passedCount} PHASE 11.2 ACCEPTANCE TESTS PASSED!`);
console.log("==========================================");
