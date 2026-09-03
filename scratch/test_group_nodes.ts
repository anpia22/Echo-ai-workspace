import assert from "node:assert/strict";
import {
  applyCanvasActions,
  type CanvasState,
} from "../src/app/lib/applyCanvasActions";
import {
  parseGroupNodesAction,
  resolveGroupMemberIds,
} from "../src/app/lib/groupNodesAction";

const canvas: CanvasState = {
  nodes: [
    {
      id: "sales",
      nodeType: "problem",
      title: "Sales performance",
      position: { x: 360, y: 320 },
    },
    {
      id: "lead",
      nodeType: "problem",
      title: "Poor lead quality",
      position: { x: 360, y: 40 },
    },
    {
      id: "verify",
      nodeType: "problem",
      title: "Weak lead verification",
      position: { x: 40, y: 40 },
    },
    {
      id: "other",
      nodeType: "idea",
      title: "Unrelated idea",
      position: { x: 900, y: 900 },
    },
  ],
  edges: [
    {
      id: "e1",
      sourceId: "lead",
      targetId: "sales",
      relationship: "causes",
    },
    {
      id: "e2",
      sourceId: "verify",
      targetId: "sales",
      relationship: "causes",
    },
  ],
  groups: [],
};

assert.equal(parseGroupNodesAction({ type: "GROUP_NODES" }), null);
assert.equal(
  parseGroupNodesAction({
    type: "GROUP_NODES",
    nodeTitles: [],
    groupTitle: "Root Causes",
  }),
  null
);
assert.equal(
  resolveGroupMemberIds(canvas.nodes, ["Missing"]),
  null
);
assert.equal(
  resolveGroupMemberIds(
    [...canvas.nodes, { id: "dup", title: "Poor lead quality" }],
    ["Poor lead quality"]
  ),
  null
);

const grouped = applyCanvasActions(canvas, [
  {
    type: "GROUP_NODES",
    nodeTitles: ["Poor lead quality", "Weak lead verification"],
    groupTitle: "Root Causes",
  },
]);

assert.equal(grouped.nodes.length, 4);
assert.deepEqual(
  grouped.nodes.map((node) => node.id),
  canvas.nodes.map((node) => node.id)
);
assert.deepEqual(
  grouped.nodes.map((node) => node.title),
  canvas.nodes.map((node) => node.title)
);
assert.deepEqual(grouped.edges, canvas.edges);
assert.equal(grouped.groups.length, 1);
assert.equal(grouped.groups[0].title, "Root Causes");
assert.deepEqual(grouped.groups[0].memberIds.sort(), ["lead", "verify"]);
assert.deepEqual(
  grouped.nodes.find((node) => node.id === "sales")?.position,
  canvas.nodes.find((node) => node.id === "sales")?.position
);
assert.deepEqual(
  grouped.nodes.find((node) => node.id === "other")?.position,
  canvas.nodes.find((node) => node.id === "other")?.position
);

const skippedMissing = applyCanvasActions(canvas, [
  {
    type: "GROUP_NODES",
    nodeTitles: ["Poor lead quality", "Does not exist"],
    groupTitle: "Root Causes",
  },
]);
assert.equal(skippedMissing.groups.length, 0);

const moved = applyCanvasActions(grouped, [
  {
    type: "MOVE_NODE",
    targetTitle: "Poor lead quality",
    position: { x: 12, y: 34 },
  },
]);
assert.deepEqual(
  moved.nodes.find((node) => node.id === "lead")?.position,
  { x: 12, y: 34 }
);
assert.equal(moved.groups.length, 1);
assert.deepEqual(moved.groups[0].memberIds.sort(), ["lead", "verify"]);

const updated = applyCanvasActions(grouped, [
  {
    type: "UPDATE_NODE",
    targetTitle: "Poor lead quality",
    updates: { title: "Lead quality issues" },
  },
]);
assert.equal(
  updated.nodes.find((node) => node.id === "lead")?.title,
  "Lead quality issues"
);
assert.deepEqual(updated.groups[0].memberIds.sort(), ["lead", "verify"]);

const created = applyCanvasActions(grouped, [
  {
    type: "CREATE_NODE",
    nodeType: "solution",
    title: "Improve verification",
    description: "Add checks",
  },
  {
    type: "CREATE_EDGE",
    sourceTitle: "Improve verification",
    targetTitle: "Weak lead verification",
    relationship: "solves",
  },
]);
assert.equal(created.nodes.length, 5);
assert.equal(created.edges.length, 3);
assert.equal(created.groups.length, 1);

const deletedEdge = applyCanvasActions(grouped, [
  {
    type: "DELETE_EDGE",
    sourceTitle: "Poor lead quality",
    targetTitle: "Sales performance",
    relationship: "causes",
  },
]);
assert.equal(deletedEdge.edges.length, 1);
assert.equal(deletedEdge.groups.length, 1);

const deletedNode = applyCanvasActions(grouped, [
  { type: "DELETE_NODE", targetTitle: "Poor lead quality" },
]);
assert.equal(deletedNode.nodes.length, 3);
assert.ok(!deletedNode.nodes.some((node) => node.id === "lead"));
assert.equal(deletedNode.groups.length, 1);
assert.deepEqual(deletedNode.groups[0].memberIds, ["verify"]);

console.log("GROUP_NODES unit tests passed");
