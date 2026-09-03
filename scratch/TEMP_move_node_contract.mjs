/**
 * TEMPORARY MOVE_NODE contract tests.
 * Production code is imported; NVIDIA client is not called.
 */
process.env.NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || "dummy-key-for-tests";
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "dummy-key-for-tests";

const { parseMoveNodeAction } = await import("../src/app/lib/moveNodeAction.ts");
const { applyCanvasActions } = await import("../src/app/lib/applyCanvasActions.ts");
const { validateActions } = await import("../src/app/api/analyze/route.ts");

const results = [];

function assert(name, expected, actual, ok) {
  results.push({ name, expected, actual: ok ? "pass" : actual, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : " :: " + actual}`);
}

const baseNode = {
  id: "n1",
  nodeType: "problem",
  title: "Poor lead quality",
  description: "Keep me",
  position: { x: 100, y: 100 },
};

const otherNode = {
  id: "n2",
  nodeType: "problem",
  title: "Sales performance is getting worse",
  description: "other",
  position: { x: 10, y: 20 },
};

const edge = {
  id: "e1",
  sourceId: "n1",
  targetId: "n2",
  relationship: "causes",
};

const canvas = {
  nodes: [
    { ...baseNode, position: { ...baseNode.position } },
    { ...otherNode, position: { ...otherNode.position } },
  ],
  edges: [{ ...edge }],
};

const validMove = {
  type: "MOVE_NODE",
  targetTitle: "Poor lead quality",
  position: { x: 400, y: 300 },
};

// A — valid MOVE_NODE
{
  const validated = validateActions(canvas, [validMove]);
  const next = applyCanvasActions(canvas, validated);
  const moved = next.nodes.find((n) => n.id === "n1");
  const other = next.nodes.find((n) => n.id === "n2");
  const ok =
    validated.length === 1 &&
    validated[0].type === "MOVE_NODE" &&
    moved.position.x === 400 &&
    moved.position.y === 300 &&
    moved.title === "Poor lead quality" &&
    moved.description === "Keep me" &&
    moved.nodeType === "problem" &&
    moved.id === "n1" &&
    other.position.x === 10 &&
    other.position.y === 20 &&
    next.edges.length === 1 &&
    next.edges[0].id === "e1";
  assert("Valid MOVE_NODE", "accepted + executed", JSON.stringify(moved?.position), ok);
}

// B — missing target
{
  const action = {
    type: "MOVE_NODE",
    targetTitle: "does not exist",
    position: { x: 1, y: 2 },
  };
  let threw = false;
  let next;
  try {
    const validated = validateActions(canvas, [action]);
    next = applyCanvasActions(canvas, validated);
  } catch (e) {
    threw = true;
  }
  const ok =
    !threw &&
    validateActions(canvas, [action]).length === 0 &&
    next.nodes[0].position.x === 100 &&
    next.nodes[0].position.y === 100;
  assert("Missing target node", "safe ignore", threw ? "threw" : "ok", ok);
}

// C — invalid x string
{
  const action = {
    type: "MOVE_NODE",
    targetTitle: "Poor lead quality",
    position: { x: "400", y: 300 },
  };
  const ok =
    parseMoveNodeAction(action) === null &&
    validateActions(canvas, [action]).length === 0;
  assert("Invalid x", "rejected", String(validateActions(canvas, [action]).length), ok);
}

// D — invalid y null
{
  const action = {
    type: "MOVE_NODE",
    targetTitle: "Poor lead quality",
    position: { x: 400, y: null },
  };
  const ok =
    parseMoveNodeAction(action) === null &&
    validateActions(canvas, [action]).length === 0;
  assert("Invalid y", "rejected", String(validateActions(canvas, [action]).length), ok);
}

// E — missing position
{
  const action = {
    type: "MOVE_NODE",
    targetTitle: "Poor lead quality",
  };
  const ok =
    parseMoveNodeAction(action) === null &&
    validateActions(canvas, [action]).length === 0;
  assert("Missing position", "rejected", String(validateActions(canvas, [action]).length), ok);
}

// F — missing targetTitle (node identifier in this codebase)
{
  const action = {
    type: "MOVE_NODE",
    position: { x: 400, y: 300 },
  };
  const ok =
    parseMoveNodeAction(action) === null &&
    validateActions(canvas, [action]).length === 0;
  assert("Missing targetTitle", "rejected", String(validateActions(canvas, [action]).length), ok);
}

// E1 CREATE_NODE
{
  const empty = { nodes: [], edges: [] };
  const actions = [
    {
      type: "CREATE_NODE",
      nodeType: "problem",
      title: "Sales performance is getting worse",
      description: "Decline",
    },
  ];
  const validated = validateActions(empty, actions);
  const next = applyCanvasActions(empty, validated);
  const ok =
    validated.map((a) => a.type).join() === "CREATE_NODE" &&
    next.nodes.length === 1 &&
    next.nodes[0].title === "Sales performance is getting worse";
  assert("E1 CREATE_NODE", "unchanged", JSON.stringify(validated.map((a) => a.type)), ok);
}

// E2 CREATE_NODE + CREATE_EDGE
{
  const start = {
    nodes: [
      {
        id: "n2",
        nodeType: "problem",
        title: "Sales performance is getting worse",
        position: { x: 0, y: 0 },
      },
    ],
    edges: [],
  };
  const actions = [
    {
      type: "CREATE_NODE",
      nodeType: "problem",
      title: "Poor lead quality",
      description: "Cause",
    },
    {
      type: "CREATE_EDGE",
      sourceTitle: "Poor lead quality",
      targetTitle: "Sales performance is getting worse",
      relationship: "causes",
    },
  ];
  const validated = validateActions(start, actions);
  const next = applyCanvasActions(start, validated);
  const ok =
    validated.map((a) => a.type).join(",") === "CREATE_NODE,CREATE_EDGE" &&
    next.nodes.length === 2 &&
    next.edges.length === 1;
  assert(
    "E2 CREATE_NODE + CREATE_EDGE",
    "unchanged",
    JSON.stringify(validated.map((a) => a.type)),
    ok
  );
}

// E4 MOVE_NODE not dropped to []
{
  const start = {
    nodes: [
      {
        id: "n3",
        nodeType: "problem",
        title: "Weak lead verification",
        position: { x: 50, y: 50 },
      },
    ],
    edges: [],
  };
  const actions = [
    {
      type: "MOVE_NODE",
      targetTitle: "Weak lead verification",
      position: { x: 400, y: 80 },
    },
  ];
  const validated = validateActions(start, actions);
  const next = applyCanvasActions(start, validated);
  const ok =
    validated.length === 1 &&
    validated[0].type === "MOVE_NODE" &&
    next.nodes[0].position.x === 400 &&
    next.nodes[0].position.y === 80;
  assert("E4 MOVE_NODE", "executed not []", JSON.stringify(validated.map((a) => a.type)), ok);
}

// E5 UPDATE_NODE
{
  const start = {
    nodes: [
      {
        id: "n3",
        nodeType: "problem",
        title: "Weak lead verification",
        position: { x: 1, y: 1 },
      },
    ],
    edges: [],
  };
  const actions = [
    {
      type: "UPDATE_NODE",
      targetTitle: "Weak lead verification",
      updates: { title: "Weak verification" },
    },
  ];
  const validated = validateActions(start, actions);
  const next = applyCanvasActions(start, validated);
  const ok =
    validated.map((a) => a.type).join() === "UPDATE_NODE" &&
    next.nodes[0].title === "Weak verification";
  assert("E5 UPDATE_NODE", "unchanged", JSON.stringify(validated.map((a) => a.type)), ok);
}

// E8 []
{
  const start = {
    nodes: [
      {
        id: "n2",
        nodeType: "problem",
        title: "Poor lead quality",
        position: { x: 0, y: 0 },
      },
    ],
    edges: [],
  };
  const validated = validateActions(start, []);
  const next = applyCanvasActions(start, validated);
  const ok = validated.length === 0 && next.nodes.length === 1;
  assert("E8 []", "unchanged", String(validated.length), ok);
}

const failed = results.filter((r) => !r.ok);
console.log("\n" + results.filter((r) => r.ok).length + "/" + results.length + " passed");
if (failed.length) {
  process.exit(1);
}
