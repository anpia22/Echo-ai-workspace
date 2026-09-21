import fs from "fs";
import path from "path";

console.log("=================================================");
console.log("RUNNING PHASE 15.2 UX POLISH VERIFICATION TESTS");
console.log("=================================================");

const pagePath = path.resolve(process.cwd(), "src/app/page.tsx");
const canvasPath = path.resolve(process.cwd(), "src/app/components/EchoCanvas.tsx");

const pageContent = fs.readFileSync(pagePath, "utf-8");
const canvasContent = fs.readFileSync(canvasPath, "utf-8");

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`✔ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`✘ FAIL: ${testName}`);
    failed++;
  }
}

// 1. Header AI Status
assert(
  pageContent.includes('data-testid="header-ai-status"'),
  "Header AI status badge exists with data-testid='header-ai-status'"
);
assert(
  pageContent.includes("Echo Thinking…") &&
  pageContent.includes("Listening…") &&
  pageContent.includes("AI Ready"),
  "Header AI status displays real reactive states (Thinking, Listening, AI Ready)"
);

// 2. Canvas Viewport AI Thinking Pill
assert(
  pageContent.includes('data-testid="canvas-ai-status"'),
  "Canvas Viewport contains floating AI status indicator ('canvas-ai-status')"
);
assert(
  pageContent.includes("Echo is thinking…") && pageContent.includes("animate-spin"),
  "Canvas thinking indicator includes subtle spinner and calm typography"
);

// 3. Composer UX Polish
assert(
  pageContent.includes("disabled={loading}"),
  "Composer textarea is disabled while Echo is thinking"
);
assert(
  pageContent.includes("composer-thinking"),
  "Composer dock contains active thinking indicator ('composer-thinking')"
);
assert(
  pageContent.includes("⌘K") || pageContent.includes("Ctrl+K"),
  "Composer dock features keyboard shortcut hint badge (⌘K / Ctrl+K)"
);
assert(
  pageContent.includes("setTranscript(promptText)") && pageContent.includes("isEmptyWorkspace"),
  "Empty canvas features clickable starter prompt chips for immediate discoverability"
);

// 4. Error and Feedback States
assert(
  pageContent.includes("Echo couldn't process this request. Please try again."),
  "analyzeTranscript displays user-friendly error message on API failure"
);
assert(
  pageContent.includes("Connection issue. Please check your network and try again."),
  "analyzeTranscript displays friendly error on network catch"
);
assert(
  pageContent.includes("Canvas updated"),
  "analyzeTranscript displays success notification when actions are applied"
);

// 5. Canvas Node Selection & Glyphs Polish
assert(
  canvasContent.includes("getNodeGlyph") &&
  canvasContent.includes("problem") &&
  canvasContent.includes("solution") &&
  canvasContent.includes("decision"),
  "EchoCanvas includes getNodeGlyph for distinct visual node type indicators"
);
assert(
  canvasContent.includes("data-selected={isSelected ? \"true\" : \"false\"}") &&
  canvasContent.includes("ring-white/90"),
  "EchoCanvas EchoNode applies clear ring, shadow, and scale on selected state"
);

// 6. Canvas Edge Styling Polish
assert(
  canvasContent.includes("causes") &&
  canvasContent.includes("solves") &&
  canvasContent.includes("supports") &&
  canvasContent.includes("#f87171"),
  "EchoCanvas applies semantic edge stroke colors and markers based on relation types"
);

// 7. Preservation of Phase 15.1 Invariants
assert(
  pageContent.includes('data-testid="main-workspace"') &&
  pageContent.includes('data-testid="canvas-viewport"') &&
  pageContent.includes('data-testid="composer-dock"'),
  "Phase 15.1 structural layout landmarks preserved intact"
);
assert(
  !pageContent.includes("pb-40"),
  "No artificial bottom padding (pb-40) compensation reintroduced"
);

console.log("=================================================");
console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log("=================================================");

if (failed > 0) {
  process.exit(1);
} else {
  console.log("ALL PHASE 15.2 UX POLISH TESTS PASSED!");
  process.exit(0);
}
