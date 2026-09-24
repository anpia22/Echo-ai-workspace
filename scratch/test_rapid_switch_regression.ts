/**
 * Rapid Conversation Switch & Stale-Request Protection Regression Test
 *
 * Deterministically verifies:
 * 1. Rapid switching sequence: A → B → C → B → A → C → B with scrambled resolution order
 *    (e.g., C resolves first, A second, B last). Final active must be B with ONLY B's canvas.
 * 2. Out-of-order resolution: A → B → A → B where first A resolves after final B.
 *    Late response for A is ignored, final state is strictly B.
 * 3. Stale save completion: A save started for Conversation A completing while B is active
 *    does not corrupt B's UI state or save A's canvas into B.
 * 4. In-flight AbortController cancellation: switching from A to B aborts A's in-flight fetch.
 * 5. Workspace scoping: canvas responses for a different workspace are discarded.
 */

import { assert } from "console";

interface CanvasNode {
  id: string;
  title: string;
  position: { x: number; y: number };
}

interface CanvasEdge {
  id: string;
  source: string;
  target: string;
}

interface CanvasState {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  groups?: any[];
}

function emptyCanvas(): CanvasState {
  return { nodes: [], edges: [], groups: [] };
}

class CanvasController {
  // Authoritative references
  activeConversationId: string | null = null;
  currentWorkspaceId: string | null = null;
  canvasOwnerConversationId: string | null = null;
  canvasRequestGeneration = 0;
  activeAbortController: AbortController | null = null;

  // Runtime visible state
  visibleCanvas: CanvasState = emptyCanvas();
  visibleConversationId: string | null = null;

  // Persistence store (simulated DB / in-memory cache per conversation)
  conversationCanvases: Map<string, CanvasState> = new Map();

  constructor(workspaceId: string) {
    this.currentWorkspaceId = workspaceId;
  }

  setConversationCanvasInStore(conversationId: string, canvas: CanvasState) {
    this.conversationCanvases.set(conversationId, canvas);
  }

  // Conversation switch logic exactly mirroring Echo runtime in page.tsx
  switchConversation(
    targetConversationId: string,
    onFetchStart?: (convId: string, generation: number, signal: AbortSignal) => Promise<CanvasState>
  ): { generation: number; promise: Promise<void> } {
    // 1. Flush active conversation's current canvas strictly associated with previous conversation ID
    const prevConvId = this.activeConversationId;
    if (prevConvId && this.canvasOwnerConversationId === prevConvId) {
      this.conversationCanvases.set(prevConvId, this.visibleCanvas);
    }

    // 2. Abort any in-flight canvas request for previous conversation
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }

    // 3. Invalidate previous request generation/token
    const generation = ++this.canvasRequestGeneration;

    // 4. Update authoritative conversation references
    const requestedConversationId = targetConversationId;
    const requestedWorkspaceId = this.currentWorkspaceId;
    this.activeConversationId = requestedConversationId;
    this.canvasOwnerConversationId = requestedConversationId;

    // 5. Clear visible canvas & transient UI state immediately
    this.visibleCanvas = emptyCanvas();
    this.visibleConversationId = requestedConversationId;

    // 6. Optimistic render if already cached in memory
    const cached = this.conversationCanvases.get(requestedConversationId);
    if (cached && (cached.nodes.length > 0 || cached.edges.length > 0)) {
      this.visibleCanvas = cached;
    }

    // 7. Start async load with AbortController
    const controller = new AbortController();
    this.activeAbortController = controller;

    const promise = (async () => {
      try {
        let loadedCanvas: CanvasState;
        if (onFetchStart) {
          loadedCanvas = await onFetchStart(requestedConversationId, generation, controller.signal);
        } else {
          loadedCanvas = this.conversationCanvases.get(requestedConversationId) || emptyCanvas();
        }

        // STRICT STALE-REQUEST PROTECTION:
        // Before applying response, verify:
        // requestedWorkspaceId === currentWorkspaceId
        // && requestedConversationId === activeConversationId
        // && generation === canvasRequestGeneration
        if (
          controller.signal.aborted ||
          generation !== this.canvasRequestGeneration ||
          requestedConversationId !== this.activeConversationId ||
          requestedWorkspaceId !== this.currentWorkspaceId
        ) {
          // Discard completely!
          return;
        }

        // Apply response
        this.visibleCanvas = loadedCanvas;
        this.canvasOwnerConversationId = requestedConversationId;
      } catch (err: any) {
        if (
          controller.signal.aborted ||
          generation !== this.canvasRequestGeneration ||
          requestedConversationId !== this.activeConversationId
        ) {
          return;
        }
        if (err?.name === "AbortError") {
          return;
        }
        throw err;
      }
    })();

    return { generation, promise };
  }

  // Simulated save with save race protection
  async simulateSave(
    saveFunc: () => Promise<void>
  ): Promise<{ saved: boolean; discarded: boolean }> {
    // A save operation must be associated with the conversationId for which the canvas state was captured
    const saveConversationId = this.activeConversationId;
    if (!saveConversationId) {
      return { saved: false, discarded: true };
    }

    if (this.canvasOwnerConversationId !== saveConversationId) {
      return { saved: false, discarded: true };
    }

    const nodesSnapshot = [...this.visibleCanvas.nodes];
    const edgesSnapshot = [...this.visibleCanvas.edges];

    await saveFunc();

    // After save completion, do not update UI state unless the saved conversation is still the active conversation
    if (saveConversationId !== this.activeConversationId) {
      return { saved: true, discarded: true }; // Backend saved for Conversation A, but UI state of active Conversation B untouched
    }

    return { saved: true, discarded: false };
  }
}

async function runTests() {
  console.log("================================================================================");
  console.log("RUNNING DETERMINISTIC CONVERSATION SWITCH RACE CONDITION REGRESSION TESTS");
  console.log("================================================================================");

  let passed = 0;
  let total = 0;

  function expect(description: string, condition: boolean) {
    total++;
    if (condition) {
      console.log(`  ✅ PASS: ${description}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${description}`);
      process.exitCode = 1;
    }
  }

  // --------------------------------------------------------------------------
  // TEST 1: Rapid switch A → B → C → B → A → C → B with Scrambled Resolution
  // --------------------------------------------------------------------------
  console.log("\n[Test 1] Rapid switch: A → B → C → B → A → C → B with scrambled resolution");
  {
    const controller = new CanvasController("workspace-123");

    const canvasA: CanvasState = {
      nodes: [{ id: "node-a-1", title: "Node A", position: { x: 10, y: 10 } }],
      edges: [],
    };
    const canvasB: CanvasState = {
      nodes: [
        { id: "node-b-1", title: "Node B1", position: { x: 20, y: 20 } },
        { id: "node-b-2", title: "Node B2", position: { x: 30, y: 30 } },
      ],
      edges: [{ id: "edge-b-1", source: "node-b-1", target: "node-b-2" }],
    };
    const canvasC: CanvasState = {
      nodes: [{ id: "node-c-1", title: "Node C", position: { x: 50, y: 50 } }],
      edges: [],
    };

    // Store canvases in DB
    controller.setConversationCanvasInStore("conv-A", canvasA);
    controller.setConversationCanvasInStore("conv-B", canvasB);
    controller.setConversationCanvasInStore("conv-C", canvasC);

    // Setup deferred resolvers so we control exact resolution order
    const resolvers: Record<string, () => void> = {};
    const fetchDeferred = (id: string) =>
      new Promise<CanvasState>((resolve) => {
        resolvers[id] = () => {
          if (id.startsWith("conv-A")) resolve(canvasA);
          else if (id.startsWith("conv-B")) resolve(canvasB);
          else if (id.startsWith("conv-C")) resolve(canvasC);
        };
      });

    // 1. A starts
    const p1 = controller.switchConversation("conv-A", () => fetchDeferred("conv-A-1")).promise;
    // 2. B starts
    const p2 = controller.switchConversation("conv-B", () => fetchDeferred("conv-B-1")).promise;
    // 3. C starts
    const p3 = controller.switchConversation("conv-C", () => fetchDeferred("conv-C-1")).promise;
    // 4. B starts
    const p4 = controller.switchConversation("conv-B", () => fetchDeferred("conv-B-2")).promise;
    // 5. A starts
    const p5 = controller.switchConversation("conv-A", () => fetchDeferred("conv-A-2")).promise;
    // 6. C starts
    const p6 = controller.switchConversation("conv-C", () => fetchDeferred("conv-C-2")).promise;
    // 7. B starts (final active!)
    const p7 = controller.switchConversation("conv-B", () => fetchDeferred("conv-B-3")).promise;

    // SCRAMBLED RESOLUTION:
    // Resolve C first
    resolvers["conv-C-1"]?.();
    resolvers["conv-C-2"]?.();
    // Resolve A second
    resolvers["conv-A-1"]?.();
    resolvers["conv-A-2"]?.();
    // Resolve earlier B's
    resolvers["conv-B-1"]?.();
    resolvers["conv-B-2"]?.();
    // Finally resolve the last B
    resolvers["conv-B-3"]?.();

    await Promise.all([p1, p2, p3, p4, p5, p6, p7]);

    expect("Final active conversation is strictly conv-B", controller.activeConversationId === "conv-B");
    expect("Visible conversation ID is conv-B", controller.visibleConversationId === "conv-B");
    expect("Canvas contains exactly 2 nodes (B's nodes)", controller.visibleCanvas.nodes.length === 2);
    expect("Canvas contains Node B1", controller.visibleCanvas.nodes.some((n) => n.id === "node-b-1"));
    expect("Canvas contains Node B2", controller.visibleCanvas.nodes.some((n) => n.id === "node-b-2"));
    expect("Canvas contains Edge B1", controller.visibleCanvas.edges.length === 1 && controller.visibleCanvas.edges[0].id === "edge-b-1");
    expect("No nodes from A leaked into B", !controller.visibleCanvas.nodes.some((n) => n.id === "node-a-1"));
    expect("No nodes from C leaked into B", !controller.visibleCanvas.nodes.some((n) => n.id === "node-c-1"));
  }

  // --------------------------------------------------------------------------
  // TEST 2: A → B → A → B where first A resolves after final B
  // --------------------------------------------------------------------------
  console.log("\n[Test 2] A → B → A → B where first A resolves after final B");
  {
    const controller = new CanvasController("workspace-123");

    const canvasA: CanvasState = {
      nodes: [{ id: "node-a-1", title: "Node A", position: { x: 10, y: 10 } }],
      edges: [],
    };
    const canvasB: CanvasState = {
      nodes: [{ id: "node-b-1", title: "Node B", position: { x: 20, y: 20 } }],
      edges: [],
    };

    let resolveFirstA: () => void = () => {};
    let resolveFinalB: () => void = () => {};

    // 1. A starts (slow)
    const p1 = controller.switchConversation("conv-A", () => new Promise<CanvasState>((resolve) => {
      resolveFirstA = () => resolve(canvasA);
    })).promise;

    // 2. B starts
    const p2 = controller.switchConversation("conv-B", async () => canvasB).promise;

    // 3. A starts again
    const p3 = controller.switchConversation("conv-A", async () => canvasA).promise;

    // 4. B starts (final)
    const p4 = controller.switchConversation("conv-B", () => new Promise<CanvasState>((resolve) => {
      resolveFinalB = () => resolve(canvasB);
    })).promise;

    // Final B resolves FIRST
    resolveFinalB();
    await p4;

    // Verify state right after B resolves
    expect("Active conversation is conv-B after final B resolution", controller.activeConversationId === "conv-B");
    expect("Visible canvas is B canvas", controller.visibleCanvas.nodes[0]?.id === "node-b-1");

    // NOW First A resolves LATE (simulating network delay / slow query)
    resolveFirstA();
    await Promise.all([p1, p2, p3]);

    // Late A response MUST be ignored!
    expect("Active conversation remains conv-B after late A response", controller.activeConversationId === "conv-B");
    expect("Visible canvas still contains ONLY B nodes (A ignored)", controller.visibleCanvas.nodes.length === 1 && controller.visibleCanvas.nodes[0]?.id === "node-b-1");
  }

  // --------------------------------------------------------------------------
  // TEST 3: Stale Save Completion Protection
  // --------------------------------------------------------------------------
  console.log("\n[Test 3] Stale save completion protection");
  {
    const controller = new CanvasController("workspace-123");

    const canvasA: CanvasState = {
      nodes: [{ id: "node-a-1", title: "Node A", position: { x: 10, y: 10 } }],
      edges: [],
    };
    const canvasB: CanvasState = {
      nodes: [],
      edges: [],
    };

    // User is on conversation A
    await controller.switchConversation("conv-A", async () => canvasA).promise;
    expect("Active is conv-A", controller.activeConversationId === "conv-A");
    expect("Canvas has node-a-1", controller.visibleCanvas.nodes.length === 1);

    // User triggers a save on Conversation A
    let finishSaveA: () => void = () => {};
    const savePromise = controller.simulateSave(() => new Promise((resolve) => {
      finishSaveA = resolve;
    }));

    // Before save completes, user switches to Conversation B (which is empty)
    await controller.switchConversation("conv-B", async () => canvasB).promise;
    expect("Active switched to conv-B", controller.activeConversationId === "conv-B");
    expect("Canvas is empty for conv-B", controller.visibleCanvas.nodes.length === 0);

    // Now save for A completes
    finishSaveA();
    const saveResult = await savePromise;

    expect("Save completed in background", saveResult.saved);
    expect("UI state for B was NOT updated by late save completion for A", saveResult.discarded);
    expect("Visible canvas for B remains empty (A did not corrupt B)", controller.visibleCanvas.nodes.length === 0);
    expect("Active conversation remains conv-B", controller.activeConversationId === "conv-B");
  }

  // --------------------------------------------------------------------------
  // TEST 4: AbortController In-Flight Cancellation
  // --------------------------------------------------------------------------
  console.log("\n[Test 4] In-Flight AbortController Cancellation");
  {
    const controller = new CanvasController("workspace-123");

    let signalAborted = false;

    // Start loading A
    const p1 = controller.switchConversation("conv-A", (convId, gen, signal) => {
      return new Promise<CanvasState>((resolve) => {
        signal.addEventListener("abort", () => {
          signalAborted = true;
        });
        setTimeout(() => resolve({ nodes: [{ id: "late-node", title: "Late", position: { x: 0, y: 0 } }], edges: [] }), 100);
      });
    }).promise;

    // Immediately switch to B
    const p2 = controller.switchConversation("conv-B", async () => ({ nodes: [{ id: "b-node", title: "B", position: { x: 0, y: 0 } }], edges: [] })).promise;

    await Promise.all([p1, p2]);

    expect("AbortController for in-flight request A was triggered", signalAborted);
    expect("Visible canvas contains only B's node", controller.visibleCanvas.nodes.length === 1 && controller.visibleCanvas.nodes[0].id === "b-node");
  }

  // --------------------------------------------------------------------------
  // TEST 5: Workspace Tenancy Guard
  // --------------------------------------------------------------------------
  console.log("\n[Test 5] Workspace Tenancy Guard (discard response if workspace changed)");
  {
    const controller = new CanvasController("workspace-1");

    let resolveFetch: () => void = () => {};
    const p1 = controller.switchConversation("conv-A", () => new Promise((resolve) => {
      resolveFetch = () => resolve({ nodes: [{ id: "ws1-node", title: "WS1", position: { x: 0, y: 0 } }], edges: [] });
    })).promise;

    // User switches workspace
    controller.currentWorkspaceId = "workspace-2";

    // Response for workspace-1 arrives
    resolveFetch();
    await p1;

    expect("Stale workspace response discarded; visible canvas is empty", controller.visibleCanvas.nodes.length === 0);
  }

  console.log("\n================================================================================");
  console.log(`REGRESSION TEST SUMMARY: ${passed}/${total} assertions passed`);
  console.log("================================================================================");

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
