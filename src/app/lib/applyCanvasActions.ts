import { calculateIncrementalLayout } from "./canvasLayout";
import {
  parseGroupNodesAction,
  resolveGroupMemberIds,
  sameMemberSet,
} from "./groupNodesAction";
import { parseMoveNodeAction } from "./moveNodeAction";

export type CanvasAction = {
  type: string;
  nodeType?: string;
  title?: string;
  description?: string;
  sourceTitle?: string;
  targetTitle?: string;
  relationship?: string;
  nodeTitles?: string[];
  groupTitle?: string;
  position?: {
    x: number;
    y: number;
  };
  updates?: {
    title?: string;
    description?: string;
    nodeType?: string;
  };
};

export type CanvasNode = {
  id: string;
  nodeType: string;
  title: string;
  description?: string;
  position: {
    x: number;
    y: number;
  };
};

export type CanvasEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  relationship?: string;
};

export type CanvasGroup = {
  id: string;
  title: string;
  memberIds: string[];
};

export type CanvasState = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  groups: CanvasGroup[];
};

export function applyCanvasActions(
  currentCanvas: CanvasState,
  newActions: CanvasAction[]
): CanvasState {
  const existingNodeIds = new Set(
    currentCanvas.nodes.map((node) => node.id)
  );

  let nextCanvas: CanvasState = {
    nodes: [...currentCanvas.nodes],
    edges: [...currentCanvas.edges],
    groups: [...(currentCanvas.groups ?? [])],
  };

  for (const action of newActions) {
    if (!action || typeof action !== "object") {
      continue;
    }

    if (
      action.type === "CREATE_NODE" &&
      action.title &&
      action.nodeType
    ) {
      const exists = nextCanvas.nodes.some(
        (node) => node.title === action.title
      );

      if (!exists) {
        nextCanvas.nodes.push({
          id: crypto.randomUUID(),
          nodeType: action.nodeType,
          title: action.title,
          description: action.description,
          position: { x: 0, y: 0 },
        });
      }

      continue;
    }

    if (
      action.type === "CREATE_EDGE" &&
      action.sourceTitle &&
      action.targetTitle
    ) {
      const sourceNode = nextCanvas.nodes.find(
        (node) => node.title === action.sourceTitle
      );

      const targetNode = nextCanvas.nodes.find(
        (node) => node.title === action.targetTitle
      );

      if (!sourceNode || !targetNode) {
        console.warn(
          "Ignored CREATE_EDGE because node does not exist:",
          action
        );
        continue;
      }

      const edgeExists = nextCanvas.edges.some(
        (edge) =>
          edge.sourceId === sourceNode.id &&
          edge.targetId === targetNode.id &&
          edge.relationship === action.relationship
      );

      if (!edgeExists) {
        nextCanvas.edges.push({
          id: crypto.randomUUID(),
          sourceId: sourceNode.id,
          targetId: targetNode.id,
          relationship: action.relationship,
        });
      }

      continue;
    }

    if (
      action.type === "UPDATE_NODE" &&
      action.targetTitle &&
      action.updates
    ) {
      const nodeIndex = nextCanvas.nodes.findIndex(
        (node) => node.title === action.targetTitle
      );

      if (nodeIndex === -1) {
        console.warn(
          "Ignored UPDATE_NODE because target does not exist:",
          action
        );
        continue;
      }

      const oldNode = nextCanvas.nodes[nodeIndex];
      const newTitle = action.updates.title ?? oldNode.title;

      if (
        newTitle !== oldNode.title &&
        nextCanvas.nodes.some((node) => node.title === newTitle)
      ) {
        console.warn(
          "Ignored UPDATE_NODE because new title already exists:",
          action
        );
        continue;
      }

      nextCanvas.nodes[nodeIndex] = {
        ...oldNode,
        title: newTitle,
        description: action.updates.description ?? oldNode.description,
        nodeType: action.updates.nodeType ?? oldNode.nodeType,
      };

      continue;
    }

    if (action.type === "DELETE_NODE" && action.targetTitle) {
      const targetNode = nextCanvas.nodes.find(
        (node) => node.title === action.targetTitle
      );

      if (!targetNode) {
        console.warn(
          "Ignored DELETE_NODE because target does not exist:",
          action
        );
        continue;
      }

      nextCanvas.nodes = nextCanvas.nodes.filter(
        (node) => node.id !== targetNode.id
      );

      nextCanvas.edges = nextCanvas.edges.filter(
        (edge) =>
          edge.sourceId !== targetNode.id &&
          edge.targetId !== targetNode.id
      );

      nextCanvas.groups = nextCanvas.groups
        .map((group) => ({
          ...group,
          memberIds: group.memberIds.filter(
            (memberId) => memberId !== targetNode.id
          ),
        }))
        .filter((group) => group.memberIds.length > 0);

      continue;
    }

    if (
      action.type === "DELETE_EDGE" &&
      action.sourceTitle &&
      action.targetTitle
    ) {
      const sourceNode = nextCanvas.nodes.find(
        (node) => node.title === action.sourceTitle
      );

      const targetNode = nextCanvas.nodes.find(
        (node) => node.title === action.targetTitle
      );

      if (!sourceNode || !targetNode) {
        console.warn(
          "Ignored DELETE_EDGE because node does not exist:",
          action
        );
        continue;
      }

      nextCanvas.edges = nextCanvas.edges.filter((edge) => {
        const sameConnection =
          edge.sourceId === sourceNode.id &&
          edge.targetId === targetNode.id;

        const sameRelationship =
          !action.relationship ||
          edge.relationship === action.relationship;

        return !(sameConnection && sameRelationship);
      });

      continue;
    }

    if (action.type === "MOVE_NODE") {
      const moveNode = parseMoveNodeAction(action);

      if (!moveNode) {
        console.warn("Ignored malformed MOVE_NODE:", action);
        continue;
      }

      const nodeIndex = nextCanvas.nodes.findIndex(
        (node) => node.title === moveNode.targetTitle
      );

      if (nodeIndex === -1) {
        console.warn(
          "Ignored MOVE_NODE because target does not exist:",
          action
        );
        continue;
      }

      const existingNode = nextCanvas.nodes[nodeIndex];

      nextCanvas.nodes[nodeIndex] = {
        ...existingNode,
        position: {
          x: moveNode.position.x,
          y: moveNode.position.y,
        },
      };

      continue;
    }

    if (action.type === "GROUP_NODES") {
      const groupNodes = parseGroupNodesAction(action);

      if (!groupNodes) {
        console.warn("Ignored malformed GROUP_NODES:", action);
        continue;
      }

      const memberIds = resolveGroupMemberIds(
        nextCanvas.nodes,
        groupNodes.nodeTitles
      );

      if (!memberIds) {
        console.warn(
          "Ignored GROUP_NODES because a title is missing or ambiguous:",
          action
        );
        continue;
      }

      const alreadyGrouped = nextCanvas.groups.some((group) =>
        sameMemberSet(group.memberIds, memberIds)
      );

      if (alreadyGrouped) {
        continue;
      }

      const memberIdSet = new Set(memberIds);

      nextCanvas.groups = nextCanvas.groups
        .map((group) => ({
          ...group,
          memberIds: group.memberIds.filter(
            (memberId) => !memberIdSet.has(memberId)
          ),
        }))
        .filter((group) => group.memberIds.length > 0);

      nextCanvas.groups.push({
        id: crypto.randomUUID(),
        title: groupNodes.groupTitle,
        memberIds,
      });

      continue;
    }

    console.warn("Ignored unknown canvas action:", action);
  }

  const newNodeIds = nextCanvas.nodes
    .filter((node) => !existingNodeIds.has(node.id))
    .map((node) => node.id);

  const laidOut = calculateIncrementalLayout(
    {
      nodes: nextCanvas.nodes,
      edges: nextCanvas.edges,
    },
    newNodeIds
  );

  return {
    nodes: laidOut.nodes,
    edges: laidOut.edges,
    groups: nextCanvas.groups,
  };
}
