"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useOnViewportChange,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type NodeProps,
  type Viewport,
} from "@xyflow/react";

import "@xyflow/react/dist/style.css";

import { NODE_HEIGHT, NODE_WIDTH } from "../lib/canvasLayout";
import type { RemoteCursor } from "../lib/collaboration/cursorEvents";
import type { Participant } from "../lib/collaboration/participant";
import {
  createRemoteViewportApplyGuard,
  createViewportBroadcaster,
  isCloseViewport,
  isSameViewport,
  isValidViewport,
  type ViewportState,
} from "../lib/collaboration/viewportEvents";
import RemoteCursors from "./RemoteCursors";

type CanvasNode = {
  id: string;
  nodeType: string;
  title: string;
  description?: string;
  position: {
    x: number;
    y: number;
  };
};

type CanvasEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  relationship?: string;
};

type CanvasGroup = {
  id: string;
  title: string;
  memberIds: string[];
};

type CanvasState = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  groups?: CanvasGroup[];
};

export type ViewportApi = {
  getViewport: () => ViewportState;
  setViewport: (
    viewport: ViewportState,
    options?: { duration?: number }
  ) => void;
  applyRemoteViewport: (viewport: ViewportState) => void;
};

export type EchoCanvasProps = {
  canvas: CanvasState;

  onNodePositionChange?: (
    nodeId: string,
    position: {
      x: number;
      y: number;
    }
  ) => void;

  remoteCursors?: RemoteCursor[];
  participants?: Participant[];
  onCursorMove?: (x: number, y: number) => void;

  onViewportChange?: (viewport: ViewportState) => void;
  onViewportInit?: (api: ViewportApi) => void;
  onViewportBroadcast?: (viewport: ViewportState) => void;
  onManualViewportChange?: (viewport: ViewportState) => void;
  isLeader?: boolean;
  roomId?: string | null;
};

type EchoNodeData = {
  nodeType: string;
  title: string;
  description?: string;
  parentPosition?: { x: number; y: number };
  kind?: "node";
};

type EchoGroupData = {
  title: string;
  kind: "group";
};

const GROUP_PAD_X = 28;
const GROUP_PAD_Y_TOP = 44;
const GROUP_PAD_Y_BOTTOM = 28;

const handleStyle = {
  width: 8,
  height: 8,
  background: "#3f3f46",
  border: "1px solid #71717a",
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

function EchoNode({ data }: NodeProps<Node<EchoNodeData>>) {
  return (
    <div
      className="relative"
      style={{
        ...getNodeStyle(data.nodeType),
        borderRadius: "16px",
        padding: "16px",
        width: NODE_WIDTH,
        minHeight: 120,
        boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        id="t-top"
        style={handleStyle}
        isConnectable={false}
      />
      <Handle
        type="source"
        position={Position.Top}
        id="s-top"
        style={handleStyle}
        isConnectable={false}
      />
      <Handle
        type="target"
        position={Position.Right}
        id="t-right"
        style={handleStyle}
        isConnectable={false}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="s-right"
        style={handleStyle}
        isConnectable={false}
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="t-bottom"
        style={handleStyle}
        isConnectable={false}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="s-bottom"
        style={handleStyle}
        isConnectable={false}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="t-left"
        style={handleStyle}
        isConnectable={false}
      />
      <Handle
        type="source"
        position={Position.Left}
        id="s-left"
        style={handleStyle}
        isConnectable={false}
      />

      <div className="mb-2 text-xs font-semibold uppercase tracking-wider opacity-60">
        {data.nodeType}
      </div>

      <div className="text-base font-semibold">{data.title}</div>

      {data.description ? (
        <div className="mt-2 text-xs opacity-70">{data.description}</div>
      ) : null}
    </div>
  );
}

function EchoGroup({ data }: NodeProps<Node<EchoGroupData>>) {
  return (
    <div
      className="h-full w-full rounded-[20px] border border-dashed border-zinc-600 bg-zinc-900/40"
      style={{ pointerEvents: "none" }}
    >
      <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
        {data.title}
      </div>
    </div>
  );
}

const nodeTypes = {
  echo: EchoNode,
  echoGroup: EchoGroup,
};

function pickHandles(
  source: { x: number; y: number },
  target: { x: number; y: number }
): { sourceHandle: string; targetHandle: string } {
  const dx =
    target.x + NODE_WIDTH / 2 - (source.x + NODE_WIDTH / 2);
  const dy =
    target.y + NODE_HEIGHT / 2 - (source.y + NODE_HEIGHT / 2);

  if (Math.abs(dy) >= Math.abs(dx)) {
    if (dy >= 0) {
      return { sourceHandle: "s-bottom", targetHandle: "t-top" };
    }

    return { sourceHandle: "s-top", targetHandle: "t-bottom" };
  }

  if (dx >= 0) {
    return { sourceHandle: "s-right", targetHandle: "t-left" };
  }

  return { sourceHandle: "s-left", targetHandle: "t-right" };
}

function EchoCanvasInner({
  canvas,
  onNodePositionChange,
  remoteCursors,
  participants,
  onCursorMove,
  onViewportChange,
  onViewportInit,
  onViewportBroadcast,
  onManualViewportChange,
  isLeader,
  roomId,
}: EchoCanvasProps) {
  const {
    screenToFlowPosition,
    getViewport,
    setViewport: rfSetViewport,
  } = useReactFlow();

  const localViewportRef = useRef<ViewportState>({ x: 0, y: 0, zoom: 1 });
  const isLeaderRef = useRef(Boolean(isLeader));
  useEffect(() => {
    isLeaderRef.current = Boolean(isLeader);
  }, [isLeader]);

  const onViewportBroadcastRef = useRef(onViewportBroadcast);
  useEffect(() => {
    onViewportBroadcastRef.current = onViewportBroadcast;
  }, [onViewportBroadcast]);

  const onManualViewportChangeRef = useRef(onManualViewportChange);
  useEffect(() => {
    onManualViewportChangeRef.current = onManualViewportChange;
  }, [onManualViewportChange]);

  const isInitialMountRef = useRef(true);
  useEffect(() => {
    const timer = setTimeout(() => {
      isInitialMountRef.current = false;
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  const broadcasterRef = useRef<ReturnType<typeof createViewportBroadcaster> | null>(null);

  useEffect(() => {
    const broadcaster = createViewportBroadcaster({
      throttleMs: 50,
      isLeader: () => !isInitialMountRef.current && isLeaderRef.current,
      publish: (vp) => {
        onViewportBroadcastRef.current?.(vp);
      },
    });
    broadcasterRef.current = broadcaster;

    return () => {
      broadcaster.destroy();
      broadcasterRef.current = null;
    };
  }, []);

  const remoteGuardRef = useRef<ReturnType<
    typeof createRemoteViewportApplyGuard
  > | null>(null);

  useEffect(() => {
    const guard = createRemoteViewportApplyGuard(120);
    remoteGuardRef.current = guard;
    return () => {
      guard.destroy();
      remoteGuardRef.current = null;
    };
  }, []);

  // Room switch isolation: clear remote apply guard & destroy any pending throttled broadcast
  useEffect(() => {
    remoteGuardRef.current?.clear();
  }, [roomId]);

  const applyRemoteViewport = useCallback(
    (viewport: ViewportState) => {
      if (!isValidViewport(viewport)) {
        return;
      }

      if (
        localViewportRef.current &&
        (isSameViewport(localViewportRef.current, viewport) ||
          isCloseViewport(localViewportRef.current, viewport))
      ) {
        return;
      }

      remoteGuardRef.current?.markApplying(viewport);
      void rfSetViewport(viewport);
    },
    [rfSetViewport]
  );

  useOnViewportChange({
    onChange: useCallback(
      (vp: Viewport) => {
        const next: ViewportState = { x: vp.x, y: vp.y, zoom: vp.zoom };
        localViewportRef.current = next;
        onViewportChange?.(next);

        // Feedback loop prevention: suppress broadcast if this change is from remote viewport
        if (remoteGuardRef.current?.shouldSuppressBroadcast(next)) {
          return;
        }

        if (!isInitialMountRef.current) {
          onManualViewportChangeRef.current?.(next);
        }

        broadcasterRef.current?.onViewportMove(next);
      },
      [onViewportChange]
    ),
    onEnd: useCallback(
      (vp: Viewport) => {
        const next: ViewportState = { x: vp.x, y: vp.y, zoom: vp.zoom };
        if (remoteGuardRef.current?.isApplying()) {
          remoteGuardRef.current.clear();
          return;
        }
        broadcasterRef.current?.onViewportMoveEnd(next);
      },
      []
    ),
  });

  useEffect(() => {
    const vp = getViewport();
    if (vp) {
      const initial: ViewportState = { x: vp.x, y: vp.y, zoom: vp.zoom };
      localViewportRef.current = initial;
      onViewportChange?.(initial);
    }
  }, [getViewport, onViewportChange]);

  useEffect(() => {
    if (!onViewportInit) {
      return;
    }

    onViewportInit({
      getViewport: () => {
        const vp = getViewport();
        return { x: vp.x, y: vp.y, zoom: vp.zoom };
      },
      setViewport: (
        viewport: ViewportState,
        options?: { duration?: number }
      ) => {
        void rfSetViewport(viewport, options);
      },
      applyRemoteViewport,
    });
  }, [getViewport, rfSetViewport, onViewportInit, applyRemoteViewport]);

  const lastFlowPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastBroadcastTimeRef = useRef<number>(0);
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const THROTTLE_MS = 35; // ~28.5 updates/sec

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!onCursorMove) {
        return;
      }

      const flowPosition = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      lastFlowPosRef.current = flowPosition;

      const now = Date.now();
      const elapsed = now - lastBroadcastTimeRef.current;

      if (elapsed >= THROTTLE_MS) {
        lastBroadcastTimeRef.current = now;
        if (throttleTimerRef.current !== null) {
          clearTimeout(throttleTimerRef.current);
          throttleTimerRef.current = null;
        }
        onCursorMove(flowPosition.x, flowPosition.y);
      } else if (throttleTimerRef.current === null) {
        throttleTimerRef.current = setTimeout(() => {
          throttleTimerRef.current = null;
          lastBroadcastTimeRef.current = Date.now();
          const latest = lastFlowPosRef.current;
          if (latest) {
            onCursorMove(latest.x, latest.y);
          }
        }, THROTTLE_MS - elapsed);
      }
    },
    [onCursorMove, screenToFlowPosition]
  );

  useEffect(() => {
    return () => {
      if (throttleTimerRef.current !== null) {
        clearTimeout(throttleTimerRef.current);
      }
    };
  }, []);

  const generatedNodes: Node<EchoNodeData | EchoGroupData>[] = useMemo(() => {
    const nodesById = new Map(canvas.nodes.map((node) => [node.id, node]));
    const groupNodes: Node<EchoGroupData>[] = [];

    for (const group of canvas.groups ?? []) {
      const members = group.memberIds
        .map((memberId) => nodesById.get(memberId))
        .filter((node): node is CanvasNode => Boolean(node));

      if (members.length === 0) {
        continue;
      }

      const minX = Math.min(...members.map((node) => node.position.x));
      const minY = Math.min(...members.map((node) => node.position.y));
      const maxX = Math.max(
        ...members.map((node) => node.position.x + NODE_WIDTH)
      );
      const maxY = Math.max(
        ...members.map((node) => node.position.y + NODE_HEIGHT)
      );

      groupNodes.push({
        id: `echo-group:${group.id}`,
        type: "echoGroup",
        position: {
          x: minX - GROUP_PAD_X,
          y: minY - GROUP_PAD_Y_TOP,
        },
        data: {
          kind: "group",
          title: group.title,
        },
        draggable: false,
        selectable: false,
        connectable: false,
        zIndex: -1,
        style: {
          width: maxX - minX + GROUP_PAD_X * 2,
          height: maxY - minY + GROUP_PAD_Y_TOP + GROUP_PAD_Y_BOTTOM,
        },
      });
    }

    const echoNodes: Node<EchoNodeData>[] = canvas.nodes.map((node) => ({
      id: node.id,
      type: "echo",
      position: node.position,
      zIndex: 1,
      data: {
        kind: "node",
        nodeType: node.nodeType,
        title: node.title,
        description: node.description,
        parentPosition: node.position,
      },
    }));

    return [...groupNodes, ...echoNodes];
  }, [canvas.groups, canvas.nodes]);

  const generatedEdges: Edge[] = useMemo(() => {
    const nodesById = new Map(
      canvas.nodes.map((node) => [node.id, node])
    );

    return canvas.edges.map((edge) => {
      const relationship =
        edge.relationship?.toLowerCase().trim() || "related to";

      let strokeWidth = 1.75;

      switch (relationship) {
        case "causes":
          strokeWidth = 2;
          break;

        case "solves":
          strokeWidth = 2.25;
          break;

        case "supports":
          strokeWidth = 1.75;
          break;

        case "depends on":
          strokeWidth = 2;
          break;

        case "decided by":
          strokeWidth = 1.75;
          break;

        case "related to":
        default:
          strokeWidth = 1.5;
          break;
      }

      const sourceNode = nodesById.get(edge.sourceId);
      const targetNode = nodesById.get(edge.targetId);

      const handles =
        sourceNode && targetNode
          ? pickHandles(sourceNode.position, targetNode.position)
          : { sourceHandle: "s-bottom", targetHandle: "t-top" };

      return {
        id: edge.id,
        source: edge.sourceId,
        target: edge.targetId,
        sourceHandle: handles.sourceHandle,
        targetHandle: handles.targetHandle,
        type: "smoothstep",
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
          color: "#a1a1aa",
        },
        label: relationship,
        animated: false,
        style: {
          strokeWidth,
          stroke: "#a1a1aa",
        },
        labelStyle: {
          fill: "#d4d4d8",
          fontSize: 11,
          fontWeight: 500,
        },
        labelBgStyle: {
          fill: "#09090b",
          fillOpacity: 0.92,
        },
        labelBgPadding: [8, 4] as [number, number],
        labelBgBorderRadius: 6,
      };
    });
  }, [canvas.edges, canvas.nodes]);

  const [
    nodes,
    setNodes,
    onNodesChange,
  ] = useNodesState(generatedNodes);

  const [
    edges,
    setEdges,
    onEdgesChange,
  ] = useEdgesState<Edge>(generatedEdges);

  useEffect(() => {
    setNodes((currentNodes) => {
      return generatedNodes.map((newNode) => {
        const existingNode = currentNodes.find(
          (node) => node.id === newNode.id
        );

        if (!existingNode) {
          return newNode;
        }

        if (newNode.type === "echoGroup") {
          return newNode;
        }

        const existingData = existingNode.data as EchoNodeData;
        const newData = newNode.data as EchoNodeData;

        const parentPositionChanged =
          existingData.parentPosition?.x !== newData.parentPosition?.x ||
          existingData.parentPosition?.y !== newData.parentPosition?.y;

        return {
          ...newNode,
          position: parentPositionChanged ? newNode.position : existingNode.position,
          selected: existingNode.selected,
          dragging: existingNode.dragging,
        };
      });
    });
  }, [generatedNodes, setNodes]);

  useEffect(() => {
    const positionById = new Map(
      nodes.map((node) => [node.id, node.position])
    );

    setEdges(
      generatedEdges.map((edge) => {
        const sourcePosition = positionById.get(edge.source);
        const targetPosition = positionById.get(edge.target);

        if (!sourcePosition || !targetPosition) {
          return edge;
        }

        const handles = pickHandles(sourcePosition, targetPosition);

        return {
          ...edge,
          sourceHandle: handles.sourceHandle,
          targetHandle: handles.targetHandle,
        };
      })
    );
  }, [generatedEdges, nodes, setEdges]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<Node<EchoNodeData | EchoGroupData>>[]) => {
      onNodesChange(changes);

      changes.forEach((change) => {
        if (change.type !== "position" || !change.position) {
          return;
        }

        if (change.dragging) {
          return;
        }

        const movedNode = nodes.find((node) => node.id === change.id);

        if (
          !movedNode ||
          movedNode.type === "echoGroup" ||
          movedNode.data?.kind === "group"
        ) {
          return;
        }

        onNodePositionChange?.(movedNode.id, change.position);
      });
    },
    [nodes, onNodesChange, onNodePositionChange]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((currentEdges) => addEdge(connection, currentEdges));
    },
    [setEdges]
  );

  return (
    <div
      className="h-full w-full bg-zinc-950"
      onPointerMove={handlePointerMove}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        fitViewOptions={{ padding: 0.24 }}
        minZoom={0.2}
        maxZoom={2}
        nodesConnectable={false}
        elementsSelectable
      >
        <Background color="#27272a" gap={20} />

        <Controls />

        <MiniMap
          nodeColor={(node) => {
            if (node.type === "echoGroup") {
              return "#3f3f46";
            }

            const nodeType = (node.data as EchoNodeData | undefined)?.nodeType;

            if (nodeType === "problem") {
              return "#ef4444";
            }

            if (nodeType === "solution") {
              return "#22c55e";
            }

            if (nodeType === "decision") {
              return "#eab308";
            }

            if (nodeType === "task") {
              return "#3b82f6";
            }

            if (nodeType === "question") {
              return "#a855f7";
            }

            return "#71717a";
          }}
        />

        <RemoteCursors cursors={remoteCursors} participants={participants} />
      </ReactFlow>
    </div>
  );
}

export default function EchoCanvas(props: EchoCanvasProps) {
  return (
    <ReactFlowProvider>
      <EchoCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
