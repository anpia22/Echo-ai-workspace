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
        background: "linear-gradient(145deg, rgba(42,17,17,0.8) 0%, rgba(20,5,5,0.9) 100%)",
        border: "1px solid rgba(239, 68, 68, 0.3)",
        borderTop: "1px solid rgba(239, 68, 68, 0.6)",
        color: "#fca5a5",
      };

    case "solution":
      return {
        background: "linear-gradient(145deg, rgba(13,36,24,0.8) 0%, rgba(5,20,10,0.9) 100%)",
        border: "1px solid rgba(34, 197, 94, 0.3)",
        borderTop: "1px solid rgba(34, 197, 94, 0.6)",
        color: "#86efac",
      };

    case "decision":
      return {
        background: "linear-gradient(145deg, rgba(32,24,10,0.8) 0%, rgba(20,15,5,0.9) 100%)",
        border: "1px solid rgba(234, 179, 8, 0.3)",
        borderTop: "1px solid rgba(234, 179, 8, 0.6)",
        color: "#fde047",
      };

    case "task":
      return {
        background: "linear-gradient(145deg, rgba(17,28,45,0.8) 0%, rgba(10,15,25,0.9) 100%)",
        border: "1px solid rgba(59, 130, 246, 0.3)",
        borderTop: "1px solid rgba(59, 130, 246, 0.6)",
        color: "#93c5fd",
      };

    case "question":
      return {
        background: "linear-gradient(145deg, rgba(32,20,45,0.8) 0%, rgba(15,10,25,0.9) 100%)",
        border: "1px solid rgba(168, 85, 247, 0.3)",
        borderTop: "1px solid rgba(168, 85, 247, 0.6)",
        color: "#d8b4fe",
      };

    default:
      return {
        background: "linear-gradient(145deg, rgba(24,24,27,0.8) 0%, rgba(9,9,11,0.9) 100%)",
        border: "1px solid rgba(82, 82, 91, 0.3)",
        borderTop: "1px solid rgba(82, 82, 91, 0.6)",
        color: "#e4e4e7",
      };
  }
};

const getNodeGlyph = (nodeType?: string) => {
  switch (nodeType) {
    case "problem":
      return "⚠️";
    case "solution":
      return "✓";
    case "decision":
      return "◆";
    case "task":
      return "◻";
    case "question":
      return "?";
    case "idea":
      return "✦";
    default:
      return "●";
  }
};

function EchoNode({ data, selected }: NodeProps<Node<EchoNodeData>>) {
  const isSelected = Boolean(selected);

  return (
    <div
      data-testid={`echo-node-${data.nodeType || "default"}`}
      data-selected={isSelected ? "true" : "false"}
      className={`relative flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:shadow-2xl ${
        isSelected
          ? "ring-2 ring-white/90 shadow-[0_0_24px_rgba(255,255,255,0.22)] scale-[1.01]"
          : "hover:border-white/30"
      }`}
      style={{
        ...getNodeStyle(data.nodeType),
        borderRadius: "20px",
        padding: "18px 20px",
        width: NODE_WIDTH,
        minHeight: 120,
        boxShadow: isSelected
          ? "0 16px 36px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.15)"
          : "0 12px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <Handle type="target" position={Position.Top} id="t-top" style={handleStyle} isConnectable={false} />
      <Handle type="source" position={Position.Top} id="s-top" style={handleStyle} isConnectable={false} />
      <Handle type="target" position={Position.Right} id="t-right" style={handleStyle} isConnectable={false} />
      <Handle type="source" position={Position.Right} id="s-right" style={handleStyle} isConnectable={false} />
      <Handle type="target" position={Position.Bottom} id="t-bottom" style={handleStyle} isConnectable={false} />
      <Handle type="source" position={Position.Bottom} id="s-bottom" style={handleStyle} isConnectable={false} />
      <Handle type="target" position={Position.Left} id="t-left" style={handleStyle} isConnectable={false} />
      <Handle type="source" position={Position.Left} id="s-left" style={handleStyle} isConnectable={false} />

      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest opacity-75">
          <span className="text-[11px] leading-none opacity-90">{getNodeGlyph(data.nodeType)}</span>
          <span>{data.nodeType}</span>
        </span>
      </div>

      <div className="text-[15px] font-semibold leading-snug tracking-tight text-white/90">
        {data.title}
      </div>

      {data.description ? (
        <div className="mt-2.5 text-xs font-medium leading-relaxed opacity-70">
          {data.description}
        </div>
      ) : null}
    </div>
  );
}

function EchoGroup({ data }: NodeProps<Node<EchoGroupData>>) {
  return (
    <div
      className="h-full w-full rounded-[24px] border-2 border-dashed border-zinc-700/50 bg-zinc-900/20 backdrop-blur-[2px] transition-all duration-500"
      style={{ pointerEvents: "none" }}
    >
      <div className="px-4 py-3 text-xs font-bold uppercase tracking-widest text-zinc-500">
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
  source?: { x?: number; y?: number } | null,
  target?: { x?: number; y?: number } | null
): { sourceHandle: string; targetHandle: string } {
  const sx = typeof source?.x === "number" ? source.x : 0;
  const sy = typeof source?.y === "number" ? source.y : 0;
  const tx = typeof target?.x === "number" ? target.x : 0;
  const ty = typeof target?.y === "number" ? target.y : 0;

  const dx = tx + NODE_WIDTH / 2 - (sx + NODE_WIDTH / 2);
  const dy = ty + NODE_HEIGHT / 2 - (sy + NODE_HEIGHT / 2);

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
    const getNodePos = (n: any): { x: number; y: number } => {
      if (n?.position && typeof n.position.x === "number" && typeof n.position.y === "number") {
        return n.position;
      }
      return {
        x: typeof n?.position?.x === "number" ? n.position.x : typeof n?.positionX === "number" ? n.positionX : 0,
        y: typeof n?.position?.y === "number" ? n.position.y : typeof n?.positionY === "number" ? n.positionY : 0,
      };
    };

    const nodesById = new Map((canvas.nodes ?? []).map((node) => [node.id, node]));
    const groupNodes: Node<EchoGroupData>[] = [];

    for (const group of canvas.groups ?? []) {
      const members = (group.memberIds ?? [])
        .map((memberId) => nodesById.get(memberId))
        .filter((node): node is CanvasNode => Boolean(node));

      if (members.length === 0) {
        continue;
      }

      const minX = Math.min(...members.map((node) => getNodePos(node).x));
      const minY = Math.min(...members.map((node) => getNodePos(node).y));
      const maxX = Math.max(
        ...members.map((node) => getNodePos(node).x + NODE_WIDTH)
      );
      const maxY = Math.max(
        ...members.map((node) => getNodePos(node).y + NODE_HEIGHT)
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

    const echoNodes: Node<EchoNodeData>[] = (canvas.nodes ?? []).map((node) => {
      const pos = getNodePos(node);
      return {
        id: node.id,
        type: "echo",
        position: pos,
        zIndex: 1,
        data: {
          kind: "node",
          nodeType: node.nodeType,
          title: node.title,
          description: node.description,
          parentPosition: pos,
        },
      };
    });

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
      let strokeColor = "#94a3b8"; // clean slate

      switch (relationship) {
        case "causes":
          strokeWidth = 2;
          strokeColor = "#f87171"; // soft red
          break;

        case "solves":
          strokeWidth = 2.25;
          strokeColor = "#4ade80"; // soft emerald
          break;

        case "supports":
          strokeWidth = 1.75;
          strokeColor = "#38bdf8"; // soft sky blue
          break;

        case "depends on":
          strokeWidth = 2;
          strokeColor = "#a78bfa"; // soft purple
          break;

        case "decided by":
          strokeWidth = 1.75;
          strokeColor = "#fbbf24"; // soft amber
          break;

        case "related to":
        default:
          strokeWidth = 1.5;
          strokeColor = "#94a3b8";
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
          color: strokeColor,
        },
        label: relationship,
        animated: false,
        style: {
          strokeWidth,
          stroke: strokeColor,
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
