import fs from "fs";
import path from "path";
import assert from "assert";

const pagePath = path.resolve(process.cwd(), "src/app/page.tsx");
const pageSrc = fs.readFileSync(pagePath, "utf-8");

console.log("=================================================");
console.log("RUNNING PHASE 15.1 STRUCTURAL LAYOUT TESTS");
console.log("=================================================");

function testInvariant(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✔ PASS: ${name}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`✖ FAIL: ${name} -> ${msg}`);
    throw err;
  }
}

try {
  testInvariant("MainWorkspace exists", () => {
    assert(
      pageSrc.includes('data-testid="main-workspace"') ||
        pageSrc.includes("id=\"main-workspace\""),
      "MainWorkspace element with data-testid='main-workspace' not found"
    );
  });

  testInvariant("CanvasViewport exists", () => {
    assert(
      pageSrc.includes('data-testid="canvas-viewport"'),
      "CanvasViewport element with data-testid='canvas-viewport' not found"
    );
  });

  testInvariant("ComposerDock exists", () => {
    assert(
      pageSrc.includes('data-testid="composer-dock"'),
      "ComposerDock element with data-testid='composer-dock' not found"
    );
  });

  testInvariant("CanvasViewport is inside MainWorkspace", () => {
    const mainWorkspaceMatch = /<main[^>]*data-testid="main-workspace"[^>]*>([\s\S]*?)<\/main>/.exec(pageSrc);
    assert(mainWorkspaceMatch, "Could not match <main data-testid='main-workspace'> content");
    assert(
      mainWorkspaceMatch[1].includes('data-testid="canvas-viewport"'),
      "CanvasViewport is not inside MainWorkspace"
    );
  });

  testInvariant("ComposerDock is inside MainWorkspace", () => {
    const mainWorkspaceMatch = /<main[^>]*data-testid="main-workspace"[^>]*>([\s\S]*?)<\/main>/.exec(pageSrc);
    assert(mainWorkspaceMatch, "Could not match <main data-testid='main-workspace'> content");
    assert(
      mainWorkspaceMatch[1].includes('data-testid="composer-dock"'),
      "ComposerDock is not inside MainWorkspace"
    );
  });

  testInvariant("CanvasViewport occurs before ComposerDock", () => {
    const canvasViewportIdx = pageSrc.indexOf('data-testid="canvas-viewport"');
    const composerDockIdx = pageSrc.indexOf('data-testid="composer-dock"');
    assert(canvasViewportIdx !== -1, "CanvasViewport not found");
    assert(composerDockIdx !== -1, "ComposerDock not found");
    assert(
      canvasViewportIdx < composerDockIdx,
      "CanvasViewport must occur before ComposerDock in layout order"
    );
  });

  testInvariant("EchoCanvas is inside CanvasViewport", () => {
    const canvasViewportMatch = /<div[^>]*data-testid="canvas-viewport"[^>]*>([\s\S]*?)<\/div>\s*\{\/\*\s*Composer Dock/.exec(pageSrc);
    assert(canvasViewportMatch, "Could not extract CanvasViewport block");
    assert(
      canvasViewportMatch[1].includes("<EchoCanvas"),
      "EchoCanvas is not rendered inside CanvasViewport"
    );
  });

  testInvariant("Composer is inside ComposerDock", () => {
    const composerDockMatch = /<div[^>]*data-testid="composer-dock"[^>]*>([\s\S]*?)<\/main>/.exec(pageSrc);
    assert(composerDockMatch, "Could not extract ComposerDock block");
    assert(
      composerDockMatch[1].includes("composerInputRef") &&
        composerDockMatch[1].includes("Ask Echo..."),
      "Ask Echo composer textarea and controls are not inside ComposerDock"
    );
  });

  testInvariant("Composer does not use absolute bottom overlay positioning", () => {
    assert(
      !pageSrc.includes("absolute bottom-8 left-1/2"),
      "Found forbidden overlay class: 'absolute bottom-8 left-1/2'"
    );
    assert(
      !pageSrc.includes("absolute bottom-6 left-1/2 z-10"),
      "Found forbidden composer overlay positioning"
    );
    // Check that inside composer-dock there is no absolute bottom overlay
    const composerDockMatch = /<div[^>]*data-testid="composer-dock"[^>]*>([\s\S]*?)<\/main>/.exec(pageSrc);
    if (composerDockMatch) {
      assert(
        !composerDockMatch[1].includes("absolute bottom-"),
        "ComposerDock should not contain absolute bottom-* positioning overlay"
      );
    }
  });

  testInvariant("Empty state is inside CanvasViewport", () => {
    const canvasViewportMatch = /<div[^>]*data-testid="canvas-viewport"[^>]*>([\s\S]*?)<\/div>\s*\{\/\*\s*Composer Dock/.exec(pageSrc);
    assert(canvasViewportMatch, "Could not extract CanvasViewport block");
    assert(
      canvasViewportMatch[1].includes("Start thinking with Echo"),
      "Empty state ('Start thinking with Echo') must be inside CanvasViewport"
    );
  });

  testInvariant("Empty state has no pb-40 compensation", () => {
    const emptyStateMatch = /\{isEmptyWorkspace\s*\?[\s\S]*?Start thinking with Echo[\s\S]*?:\s*null\}/.exec(pageSrc);
    assert(emptyStateMatch, "Could not extract empty state block");
    assert(
      !emptyStateMatch[0].includes("pb-40"),
      "Empty state still contains 'pb-40' compensation hack"
    );
  });

  testInvariant("MainWorkspace uses flex-col", () => {
    const mainWorkspaceTag = /<main[^>]*data-testid="main-workspace"[^>]*>/.exec(pageSrc);
    assert(mainWorkspaceTag, "MainWorkspace tag not found");
    assert(
      mainWorkspaceTag[0].includes("flex-col"),
      "MainWorkspace must use 'flex-col' to stack CanvasViewport and ComposerDock vertically"
    );
  });

  testInvariant("CanvasViewport uses flex-1", () => {
    const canvasViewportTag = /<div[^>]*data-testid="canvas-viewport"[^>]*>/.exec(pageSrc);
    assert(canvasViewportTag, "CanvasViewport tag not found");
    assert(
      canvasViewportTag[0].includes("flex-1"),
      "CanvasViewport must use 'flex-1' to take all available height above ComposerDock"
    );
  });

  testInvariant("ComposerDock uses shrink-0", () => {
    const composerDockTag = /<div[^>]*data-testid="composer-dock"[^>]*>/.exec(pageSrc);
    assert(composerDockTag, "ComposerDock tag not found");
    assert(
      composerDockTag[0].includes("shrink-0"),
      "ComposerDock must use 'shrink-0' to reserve its exact physical height"
    );
  });

  console.log("=================================================");
  console.log("ALL PHASE 15.1 STRUCTURAL LAYOUT TESTS PASSED!");
  console.log("=================================================");
} catch {
  process.exit(1);
}
