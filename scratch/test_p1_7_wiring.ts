/**
 * P1.7 — Undo / redo is wired into the app the way it was designed: only the user's own changes
 * are recorded, undo goes through the same screen / room / database / snapshot path as any edit,
 * and the guards (viewers, AI in flight, text boxes) are in place. Structural checks on the page.
 *
 * Run: npx tsx scratch/test_p1_7_wiring.ts
 */

import { readFileSync } from "node:fs";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name} ${detail}`);
  }
}

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const page = read("src/app/app/page.tsx");
const hook = read("src/app/lib/persistence/client/useCanvasPersistence.ts");

/** The text of a function or block starting at `start`, up to `end`. */
const between = (s: string, start: string, end: string) => {
  const i = s.indexOf(start);
  const j = s.indexOf(end, i + start.length);
  return i === -1 || j === -1 ? "" : s.slice(i, j);
};

console.log("what is recorded");
check("a history exists, one per conversation, in memory", /createCanvasHistory\(\)/.test(page) && /canvasHistory\.record\(\s*(saveConversationId|requestConversationId)/.test(page));
check("the user's drags are recorded", /canvasHistory\.record\(saveConversationId, diffToChange\(currentCanvas, nextCanvas\), "Move node"\)/.test(page));
check("the AI changes the user asked for are recorded, with a count", /canvasHistory\.record\(\s*requestConversationId,\s*diffToChange\(currentCanvas, nextCanvas\)/.test(page) && /AI changes \(\$\{data\.actions\.length\}\)/.test(page));
const remote = between(page, "onRemoteNodeEvent:", "onMeetingSignal:");
check("collaborators' changes are NEVER recorded (they are not the user's to undo)", remote.length > 100 && !/canvasHistory/.test(remote));
check("hydration, conversation switching and snapshots do not record either", (page.match(/canvasHistory\.record\(/g) ?? []).length === 2);

console.log("what undo and redo do");
const step = between(page, "const stepCanvasHistory = (direction", "// The keyboard handler lives in an effect");
check("the step function exists", step.length > 500);
check("viewers cannot undo", /isWorkspaceReadOnly\(\)/.test(step));
check("nothing is undone while an AI answer is on its way (it would land on top)", /analyzeInFlightRef\.current/.test(step));
check("it undoes the active conversation's history only", /activeConversationIdRef\.current/.test(step) && /canvasHistory\.undo\(convId, current\)/.test(step) && /canvasHistory\.redo\(convId, current\)/.test(step));
check("it updates the screen", /setCanvas\(next\)/.test(step) && /canvasRef\.current = next/.test(step));
check("it tells the other people in the room (nodes, edges and groups)", /publishLocalNodeMutations\(diffLocalNodeMutations\(current, next\)/.test(step) && /publishLocalEdgeMutations\(diffLocalEdgeMutations\(current, next\)/.test(step) && /publishLocalGroupMutations\(diffLocalGroupMutations\(current, next\)/.test(step));
check("it saves to the database through the offline-safe queue", /persistCanvasChange\(current, next\)/.test(step));
check("it saves the conversation's own canvas through the queue too", /enqueueConversationCanvasSave\(\{ workspaceId: wsId, conversationId: convId, canvas: next \}\)/.test(step));
check("it keeps the conversation list's copy of the canvas current", /setConversations\(\(prev\) => prev\.map\(\(c\) => \(c\.id === convId \? \{ \.\.\.c, canvas: next \} : c\)\)\)/.test(step));
check("it does NOT record the undo as a new change (that would erase the redo)", !/canvasHistory\.record/.test(step));
check("it says what was undone, and when some parts no longer apply", /Undid|Redid/.test(step) && /no longer apply/.test(step) && /Nothing to undo/.test(step));

console.log("the hook that saves it");
const persist = between(hook, "const persistCanvasChange = useCallback", "return {\n    persistenceStatus");
check("saving a change builds the batch from the difference", /canvasDiffToMutation\(/.test(persist));
check("it saves nothing before the workspace is ready, or when nothing differs", /!workspaceId \|\| persistenceRevisionRef\.current === null/.test(persist) && /if \(!mutation\)/.test(persist));
check("it goes through the same queue as every other canvas save", /enqueueSave\(workspaceId, mutation\)/.test(persist));
check("the hook exposes it", /persistCanvasChange,\s*\n\s*\};/.test(hook));

console.log("the controls");
check("Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y redo", /e\.ctrlKey \|\| e\.metaKey/.test(page) && /key === "y" \|\| e\.shiftKey \? "redo" : "undo"/.test(page));
check("in a text box the keys are left to the browser", /tagName === "INPUT"/.test(page) && /tagName === "TEXTAREA"/.test(page) && /isContentEditable/.test(page));
check("the keyboard listener is added once and removed on leaving", /window\.addEventListener\("keydown", onKeyDown\);\s*return \(\) => window\.removeEventListener\("keydown", onKeyDown\);\s*\}, \[\]\);/.test(page));
check("both buttons exist, labelled, with test ids", /data-testid="canvas-undo"/.test(page) && /data-testid="canvas-redo"/.test(page) && /aria-label="Undo"/.test(page) && /aria-label="Redo"/.test(page));
check("buttons are disabled when there is nothing to do, or while the AI is working", /disabled=\{!canUndo \|\| loading\}/.test(page) && /disabled=\{!canRedo \|\| loading\}/.test(page));
check("the controls are hidden for viewers", /\{!isViewOnly && \(\s*<div\s+data-testid="canvas-history-controls"/.test(page));
check("the buttons redraw when the history changes", /void historyVersion;/.test(page) && (page.match(/setHistoryVersion\(canvasHistory\.getVersion\(\)\)/g) ?? []).length >= 3);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
