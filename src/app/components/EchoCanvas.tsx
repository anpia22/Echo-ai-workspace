"use client";

import { useCallback, useEffect, useMemo } from "react";

import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
} from "@xyflow/react";

import "@xyflow/react/dist/style.css";

type CanvasAction = {
  type: string;
  nodeType?: string;
  title?: string;
  description?: string;
  sourceTitle?: string;
  targetTitle?: string;
  relationship?: string;
  position?: {
    x: number;
    y: number;
  };
};

type EchoCanvasProps = {
  actions: CanvasAction[];

  onNodePositionChange?: (
    title: string,
    position: {
      x: number;
      y: number;
    }
  ) => void;
};

const getNodeStyle = (nodeType?: string) => {
  switch (nodeType) {
    case "problem":
      return {
        background: "#2a1111",
        border: "1px solid #ef4444",
        color: "#fca5a5",
      };

    case "solution":
      return {
        background: "#0d2418",
        border: "1px solid #22c55e",
        color: "#86efac",
      };

    case "decision":
      return {
        background: "#20180a",
        border: "1px solid #eab308",
        color: "#fde047",
      };

    case "task":
      return {
        background: "#111c2d",
        border: "1px solid #3b82f6",
        color: "#93c5fd",
      };

    case "question":
      return {
        background: "#20142d",
        border: "1px solid #a855f7",
        color: "#d8b4fe",
      };

    default:
      return {
        background: "#18181b",
        border: "1px solid #52525b",
        color: "#e4e4e7",
      };
  }
};

export default function EchoCanvas({
  actions,
  onNodePositionChange,
}: EchoCanvasProps) {
  /*
   * --------------------------------------------------
   * Generate nodes
   * --------------------------------------------------
   */

  const generatedNodes: Node[] = useMemo(() => {
    return actions
      .filter(
        (action) =>
          action.type === "CREATE_NODE" &&
          action.title
      )
      .map((action, index) => ({
        id: `echo-node-${index}`,

        position:
          action.position || {
            x:
              100 +
              (index % 3) * 280,

            y:
              100 +
              Math.floor(index / 3) * 180,
          },

        data: {
          nodeType: action.nodeType,
          title: action.title,

          label: (
            <div className="min-w-[220px]">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider opacity-60">
                {action.nodeType}
              </div>

              <div className="text-base font-semibold">
                {action.title}
              </div>

              {action.description && (
                <div className="mt-2 text-xs opacity-70">
                  {action.description}
                </div>
              )}
            </div>
          ),
        },

        style: {
          ...getNodeStyle(action.nodeType),

          borderRadius: "16px",

          padding: "16px",

          width: 250,

          boxShadow:
            "0 10px 30px rgba(0,0,0,0.25)",
        },
      }));
  }, [actions]);

  /*
   * --------------------------------------------------
   * Generate edges
   * --------------------------------------------------
   */

  const generatedEdges: Edge[] = useMemo(() => {
    return actions
      .filter(
        (action) =>
          action.type === "CREATE_EDGE" &&
          action.sourceTitle &&
          action.targetTitle
      )
      .map((action, index) => {
        const sourceNode =
          generatedNodes.find(
            (node) =>
              node.data?.title ===
              action.sourceTitle
          );

        const targetNode =
          generatedNodes.find(
            (node) =>
              node.data?.title ===
              action.targetTitle
          );

        if (
          !sourceNode ||
          !targetNode
        ) {
          return null;
        }

        return {
          id: `echo-edge-${index}`,

          source: sourceNode.id,

          target: targetNode.id,

          label: action.relationship,

          animated: true,

          style: {
            strokeWidth: 2,
          },

          labelStyle: {
            fill: "#a1a1aa",
            fontSize: 11,
          },

          labelBgStyle: {
            fill: "#18181b",
            fillOpacity: 0.9,
          },
        };
      })
      .filter(Boolean) as Edge[];
  }, [actions, generatedNodes]);

  /*
   * --------------------------------------------------
   * React Flow state
   * --------------------------------------------------
   */

  const [
    nodes,
    setNodes,
    onNodesChange,
  ] = useNodesState(generatedNodes);

  const [
    edges,
    setEdges,
    onEdgesChange,
  ] = useEdgesState<Edge>(
    generatedEdges
  );

  /*
   * --------------------------------------------------
   * Sync AI changes
   * --------------------------------------------------
   *
   * Important:
   * We only sync when the actual action data changes.
   *
   * During dragging, React Flow owns the node state.
   * We do NOT update actions on every mouse movement.
   *
   * --------------------------------------------------
   */

  useEffect(() => {
    setNodes((currentNodes) => {
      const nextNodes = generatedNodes;

      return nextNodes.map((newNode) => {
        const existingNode =
          currentNodes.find(
            (node) =>
              node.id === newNode.id
          );

        /*
         * Preserve the current React Flow
         * position when possible.
         */

        if (existingNode) {
          return {
            ...newNode,

            position:
              existingNode.position,
          };
        }

        return newNode;
      });
    });

    setEdges(generatedEdges);
  }, [
    generatedNodes,
    generatedEdges,
    setNodes,
    setEdges,
  ]);

  /*
   * --------------------------------------------------
   * Handle node changes
   * --------------------------------------------------
   */

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      /*
       * Let React Flow handle ALL changes
       * immediately.
       *
       * This keeps dragging smooth.
       */

      onNodesChange(changes);

      /*
       * Only save position when dragging
       * has finished.
       */

      changes.forEach((change) => {
        if (
          change.type !== "position" ||
          !change.position
        ) {
          return;
        }

        /*
         * React Flow sends dragging=true
         * while the user is moving the node.
         *
         * We wait until dragging=false.
         */

        if (change.dragging) {
          return;
        }

        const movedNode =
          nodes.find(
            (node) =>
              node.id === change.id
          );

        if (
          !movedNode ||
          typeof movedNode.data?.title !==
          "string"
        ) {
          return;
        }

        /*
         * Save only the FINAL position.
         */

        onNodePositionChange?.(
          movedNode.data.title,
          change.position
        );
      });
    },
    [
      nodes,
      onNodesChange,
      onNodePositionChange,
    ]
  );

  /*
   * --------------------------------------------------
   * Manual edge connection
   * --------------------------------------------------
   */

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((currentEdges) =>
        addEdge(
          connection,
          currentEdges
        )
      );
    },
    [setEdges]
  );

  /*
   * --------------------------------------------------
   * Render
   * --------------------------------------------------
   */

  return (
    <div className="h-full w-full bg-zinc-950">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
      >
        <Background
          color="#27272a"
          gap={20}
        />

        <Controls />

        <MiniMap
          nodeColor={(node) => {
            const nodeType =
              node.data?.nodeType;

            if (
              nodeType === "problem"
            ) {
              return "#ef4444";
            }

            if (
              nodeType === "solution"
            ) {
              return "#22c55e";
            }

            if (
              nodeType === "decision"
            ) {
              return "#eab308";
            }

            if (
              nodeType === "task"
            ) {
              return "#3b82f6";
            }

            if (
              nodeType === "question"
            ) {
              return "#a855f7";
            }

            return "#71717a";
          }}
        />
      </ReactFlow>
    </div>
  );
}