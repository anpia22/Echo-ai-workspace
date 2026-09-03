import {
  createCanvasSnapshot,
  isEmptyCanvasSnapshot,
  validateCanvasSnapshot,
} from "../src/app/lib/collaboration/canvasSnapshot.ts";

const valid = {
  nodes: [
    {
      id: "550e8400-e29b-41d4-a716-446655440000",
      nodeType: "problem",
      title: "Sales performance is getting worse",
      description: "Top line concern",
      position: { x: 10, y: 20 },
    },
    {
      id: "550e8400-e29b-41d4-a716-446655440001",
      nodeType: "problem",
      title: "Poor lead quality is one reason",
      position: { x: 40, y: 80 },
    },
  ],
  edges: [
    {
      id: "edge-1",
      sourceId: "550e8400-e29b-41d4-a716-446655440000",
      targetId: "550e8400-e29b-41d4-a716-446655440001",
      relationship: "causes",
    },
  ],
  groups: [
    {
      id: "group-1",
      title: "Sales",
      memberIds: [
        "550e8400-e29b-41d4-a716-446655440000",
        "550e8400-e29b-41d4-a716-446655440001",
      ],
    },
  ],
};

const snapshot = validateCanvasSnapshot(valid);
if (!snapshot) {
  throw new Error("expected valid snapshot");
}
if (snapshot.nodes[0].id !== valid.nodes[0].id) {
  throw new Error("node ids must be preserved");
}
if (snapshot === valid || snapshot.nodes[0] === valid.nodes[0]) {
  throw new Error("snapshot must be cloned");
}

valid.nodes[0].title = "mutated source";
if (snapshot.nodes[0].title === "mutated source") {
  throw new Error("clone must not share node references");
}

if (validateCanvasSnapshot(null) !== null) {
  throw new Error("null must be rejected");
}
if (validateCanvasSnapshot({ nodes: [], edges: [] }) !== null) {
  throw new Error("missing groups must be rejected");
}
if (
  validateCanvasSnapshot({
    ...valid,
    edges: [{ id: "bad", sourceId: "missing", targetId: valid.nodes[0].id }],
  }) !== null
) {
  throw new Error("unknown edge endpoints must be rejected");
}

const created = createCanvasSnapshot({
  nodes: valid.nodes,
  edges: valid.edges,
  groups: valid.groups,
});
if (created.nodes[0].id !== valid.nodes[0].id) {
  throw new Error("createCanvasSnapshot must keep ids");
}
if (isEmptyCanvasSnapshot(created)) {
  throw new Error("populated snapshot is not empty");
}
if (
  !isEmptyCanvasSnapshot({
    nodes: [],
    edges: [],
    groups: [],
  })
) {
  throw new Error("empty snapshot detection failed");
}

console.log("phase104 snapshot validation: pass");
