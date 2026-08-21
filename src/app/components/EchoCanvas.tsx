"use client";

import { useCallback, useEffect } from "react";
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
} from "@xyflow/react";

import "@xyflow/react/dist/style.css";

type CanvasAction = {
  type: string;
  nodeType?: string;
  title?: string;
  description?: string;
};

type EchoCanvasProps = {
  actions: CanvasAction[];
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
}: EchoCanvasProps) {
  const generatedNodes: Node[] = actions
    .filter(
      (action) =>
        action.type === "CREATE_NODE" &&
        action.title
    )
    .map((action, index) => ({
      id: `echo-node-${index}`,
      position: {
        x: 100 + (index % 3) * 280,
        y: 100 + Math.floor(index / 3) * 180,
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

  const generatedEdges: Edge[] = actions
    .filter(
      (action) =>
        action.type === "CREATE_EDGE" &&
        action.sourceTitle &&
        action.targetTitle
    )
    .map((action, index) => {
      const sourceNode = generatedNodes.find(
        (node) =>
          node.data?.title === action.sourceTitle
      );

      const targetNode = generatedNodes.find(
        (node) =>
          node.data?.title === action.targetTitle
      );

      if (!sourceNode || !targetNode) {
        return null;
      }

      return {
        id: `echo-edge-${index}`,
        source: sourceNode.id,
        target: targetNode.id,
        label: action.relationship,
        animated: true,
      };
    })
    .filter(Boolean) as Edge[];


  const [nodes, setNodes, onNodesChange] =
    useNodesState(generatedNodes);

  const [edges, setEdges, onEdgesChange] =
    useEdgesState<Edge>([]);

  useEffect(() => {
    setNodes(generatedNodes);
    setEdges(generatedEdges);
  }, [actions, setNodes, setEdges]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((currentEdges) =>
        addEdge(connection, currentEdges)
      );
    },
    [setEdges]
  );

  return (
    <div className="h-full w-full bg-zinc-950">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
      >
        <Background color="#27272a" gap={20} />

        <Controls />

        <MiniMap
          nodeColor={(node) => {
            const nodeType =
              node.data?.nodeType;

            if (nodeType === "problem") {
              return "#ef4444";
            }

            if (nodeType === "solution") {
              return "#22c55e";
            }

            return "#71717a";
          }}
        />
      </ReactFlow>
    </div>
  );
}