"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type {
  CanvasEdge,
  CanvasGroup,
  CanvasNode,
} from "../applyCanvasActions";
import {
  cloneCanvasNode,
  cloneCanvasSnapshot,
  createCanvasSnapshot,
  isEmptyCanvasSnapshot,
  validateCanvasSnapshot,
  type CanvasSnapshot,
} from "./canvasSnapshot";
import {
  NODE_DELETED_EVENT,
  NODE_MOVED_EVENT,
  NODE_UPSERT_EVENT,
  parseNodeCollaborationEvent,
  type NodeCollaborationEvent,
  type NodePosition,
} from "./nodeEvents";
import {
  EDGE_DELETED_EVENT,
  EDGE_UPSERT_EVENT,
  cloneCanvasEdge,
  parseEdgeCollaborationEvent,
  type EdgeCollaborationEvent,
} from "./edgeEvents";
import {
  GROUP_DELETED_EVENT,
  GROUP_UPSERT_EVENT,
  cloneCanvasGroup,
  parseGroupCollaborationEvent,
  type GroupCollaborationEvent,
} from "./groupEvents";
import {
  CURSOR_MOVE_EVENT,
  parseCursorMovePayload,
  applyRemoteCursorMove,
  pruneDisconnectedCursors,
  type CursorMovePayload,
  type RemoteCursor,
} from "./cursorEvents";
import {
  getOrCreateParticipant,
  type Participant,
} from "./participant";
import { parsePresenceState } from "./presence";
import { getRoomChannelName, type RoomId } from "./room";
import {
  getBrowserSupabaseClient,
  getBrowserSupabaseConfig,
} from "./supabase";

export type RoomConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

export type CanvasSyncStatus = "idle" | "syncing" | "synced";

export type RoomConnection = {
  state: RoomConnectionState;
  message: string | null;
  channelName: string | null;
  syncStatus: CanvasSyncStatus;
  participants: Participant[];
  currentParticipant: Participant | null;
  remoteCursors: RemoteCursor[];
};

export type RoomChannelSyncHandlers = {
  getSnapshot: () => CanvasSnapshot;
  onRemoteSnapshot: (snapshot: CanvasSnapshot) => void;
  onRemoteNodeEvent?: (event: NodeCollaborationEvent) => void;
  onRemoteEdgeEvent?: (event: EdgeCollaborationEvent) => void;
  onRemoteGroupEvent?: (event: GroupCollaborationEvent) => void;
  onRemoteCursorMove?: (event: CursorMovePayload) => void;
};

export type RoomNodeBroadcast = {
  broadcastNodeUpsert: (node: CanvasNode) => void;
  broadcastNodeDeleted: (nodeId: string) => void;
  broadcastNodeMoved: (nodeId: string, position: NodePosition) => void;
};

export type RoomEdgeBroadcast = {
  broadcastEdgeUpsert: (edge: CanvasEdge) => void;
  broadcastEdgeDeleted: (edgeId: string) => void;
};

export type RoomGroupBroadcast = {
  broadcastGroupUpsert: (group: CanvasGroup) => void;
  broadcastGroupDeleted: (groupId: string) => void;
};

export type RoomCursorBroadcast = {
  broadcastCursorMove: (x: number, y: number, timestamp?: number) => void;
};

export type RoomBroadcast = RoomNodeBroadcast &
  RoomEdgeBroadcast &
  RoomGroupBroadcast &
  RoomCursorBroadcast;

type ActiveSubscription = {
  roomId: RoomId;
  state: Exclude<RoomConnectionState, "idle">;
  message: string;
  channelName: string;
  syncStatus: CanvasSyncStatus;
};

const IDLE_CONNECTION: RoomConnection = {
  state: "idle",
  message: null,
  channelName: null,
  syncStatus: "idle",
  participants: [],
  currentParticipant: null,
  remoteCursors: [],
};

const REQUEST_SYNC_EVENT = "REQUEST_SYNC";
const SYNC_STATE_EVENT = "SYNC_STATE";
const EMPTY_SNAPSHOT_WAIT_MS = 2500;
const REQUEST_SYNC_RETRY_MS = 800;

type RequestSyncPayload = {
  type: typeof REQUEST_SYNC_EVENT;
  from: string;
  roomId: string;
};

type SyncStatePayload = {
  type: typeof SYNC_STATE_EVENT;
  from: string;
  roomId: string;
  canvas: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRequestSyncPayload(value: unknown): value is RequestSyncPayload {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.type === REQUEST_SYNC_EVENT &&
    typeof value.from === "string" &&
    value.from.length > 0 &&
    typeof value.roomId === "string" &&
    value.roomId.length > 0
  );
}

function isSyncStatePayload(value: unknown): value is SyncStatePayload {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.type === SYNC_STATE_EVENT &&
    typeof value.from === "string" &&
    value.from.length > 0 &&
    typeof value.roomId === "string" &&
    value.roomId.length > 0 &&
    "canvas" in value
  );
}

type PublishContext = {
  roomId: RoomId;
  senderId: string;
};

const NOOP_BROADCAST: RoomBroadcast = {
  broadcastNodeUpsert: () => {},
  broadcastNodeDeleted: () => {},
  broadcastNodeMoved: () => {},
  broadcastEdgeUpsert: () => {},
  broadcastEdgeDeleted: () => {},
  broadcastGroupUpsert: () => {},
  broadcastGroupDeleted: () => {},
  broadcastCursorMove: () => {},
};

export function useRoomChannel(
  roomId: RoomId | null,
  syncHandlers?: RoomChannelSyncHandlers
): RoomConnection & RoomBroadcast {
  const [trackedRoomId, setTrackedRoomId] = useState(roomId);
  const [subscription, setSubscription] = useState<ActiveSubscription | null>(
    null
  );
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [remoteCursorsMap, setRemoteCursorsMap] = useState<
    Map<string, RemoteCursor>
  >(new Map());
  const currentParticipant = roomId ? getOrCreateParticipant() : null;

  const remoteCursors = useMemo(
    () => Array.from(remoteCursorsMap.values()),
    [remoteCursorsMap]
  );

  const getSnapshotRef = useRef(syncHandlers?.getSnapshot);
  const onRemoteSnapshotRef = useRef(syncHandlers?.onRemoteSnapshot);
  const onRemoteNodeEventRef = useRef(syncHandlers?.onRemoteNodeEvent);
  const onRemoteEdgeEventRef = useRef(syncHandlers?.onRemoteEdgeEvent);
  const onRemoteGroupEventRef = useRef(syncHandlers?.onRemoteGroupEvent);
  const onRemoteCursorMoveRef = useRef(syncHandlers?.onRemoteCursorMove);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const publishContextRef = useRef<PublishContext | null>(null);
  const subscribedRef = useRef(false);

  useEffect(() => {
    getSnapshotRef.current = syncHandlers?.getSnapshot;
    onRemoteSnapshotRef.current = syncHandlers?.onRemoteSnapshot;
    onRemoteNodeEventRef.current = syncHandlers?.onRemoteNodeEvent;
    onRemoteEdgeEventRef.current = syncHandlers?.onRemoteEdgeEvent;
    onRemoteGroupEventRef.current = syncHandlers?.onRemoteGroupEvent;
    onRemoteCursorMoveRef.current = syncHandlers?.onRemoteCursorMove;
  });

  if (trackedRoomId !== roomId) {
    setTrackedRoomId(roomId);
    setSubscription(null);
    setParticipants([]);
    setRemoteCursorsMap(new Map());
  }

  useEffect(() => {
    if (!roomId) {
      return;
    }

    const participant = getOrCreateParticipant();

    const channelName = getRoomChannelName(roomId);
    const supabase = getBrowserSupabaseClient();

    if (!supabase) {
      return;
    }
    let cancelled = false;
    let appliedRemoteSnapshot = false;
    let syncWaitTimer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    publishContextRef.current = {
      roomId,
      senderId: participant.userId,
    };

    const channel = supabase.channel(channelName, {
      config: {
        broadcast: {
          ack: false,
          self: false,
        },
        presence: {
          key: participant.userId,
        },
      },
    });

    channelRef.current = channel;

    const sendRequestSync = () => {
      void channel.send({
        type: "broadcast",
        event: REQUEST_SYNC_EVENT,
        payload: {
          type: REQUEST_SYNC_EVENT,
          from: participant.userId,
          roomId,
        },
      });
    };

    const sendSyncState = () => {
      const getSnapshot = getSnapshotRef.current;

      if (!getSnapshot) {
        return;
      }

      const snapshot = createCanvasSnapshot(getSnapshot());

      void channel.send({
        type: "broadcast",
        event: SYNC_STATE_EVENT,
        payload: {
          type: SYNC_STATE_EVENT,
          from: participant.userId,
          roomId,
          canvas: snapshot,
        },
      });
    };

    channel.on("broadcast", { event: REQUEST_SYNC_EVENT }, ({ payload }) => {
      if (cancelled || !isRequestSyncPayload(payload)) {
        return;
      }

      if (payload.roomId !== roomId || payload.from === participant.userId) {
        return;
      }

      sendSyncState();
    });

    channel.on("broadcast", { event: SYNC_STATE_EVENT }, ({ payload }) => {
      if (cancelled || appliedRemoteSnapshot || !isSyncStatePayload(payload)) {
        return;
      }

      if (payload.roomId !== roomId || payload.from === participant.userId) {
        return;
      }

      const snapshot = validateCanvasSnapshot(payload.canvas);

      if (!snapshot || isEmptyCanvasSnapshot(snapshot)) {
        return;
      }

      appliedRemoteSnapshot = true;

      if (syncWaitTimer !== null) {
        clearTimeout(syncWaitTimer);
        syncWaitTimer = null;
      }

      if (retryTimer !== null) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }

      onRemoteSnapshotRef.current?.(cloneCanvasSnapshot(snapshot));

      setSubscription({
        roomId,
        state: "connected",
        message: "Synced",
        channelName,
        syncStatus: "synced",
      });
    });

    const handleNodeEvent = ({ payload }: { payload: unknown }) => {
      if (cancelled) {
        return;
      }

      const event = parseNodeCollaborationEvent(payload);

      if (!event) {
        return;
      }

      if (event.roomId !== roomId || event.senderId === participant.userId) {
        return;
      }

      onRemoteNodeEventRef.current?.(event);
    };

    channel.on("broadcast", { event: NODE_UPSERT_EVENT }, handleNodeEvent);
    channel.on("broadcast", { event: NODE_DELETED_EVENT }, handleNodeEvent);
    channel.on("broadcast", { event: NODE_MOVED_EVENT }, handleNodeEvent);

    const handleEdgeEvent = ({ payload }: { payload: unknown }) => {
      if (cancelled) {
        return;
      }

      const event = parseEdgeCollaborationEvent(payload);

      if (!event) {
        return;
      }

      if (event.roomId !== roomId || event.senderId === participant.userId) {
        return;
      }

      onRemoteEdgeEventRef.current?.(event);
    };

    channel.on("broadcast", { event: EDGE_UPSERT_EVENT }, handleEdgeEvent);
    channel.on("broadcast", { event: EDGE_DELETED_EVENT }, handleEdgeEvent);

    const handleGroupEvent = ({ payload }: { payload: unknown }) => {
      if (cancelled) {
        return;
      }

      const event = parseGroupCollaborationEvent(payload);

      if (!event) {
        return;
      }

      if (event.roomId !== roomId || event.senderId === participant.userId) {
        return;
      }

      onRemoteGroupEventRef.current?.(event);
    };

    channel.on("broadcast", { event: GROUP_UPSERT_EVENT }, handleGroupEvent);
    channel.on("broadcast", { event: GROUP_DELETED_EVENT }, handleGroupEvent);

    // Presence listeners
    const handlePresenceChange = () => {
      if (cancelled) {
        return;
      }

      const rawState = channel.presenceState();
      const nextParticipants = parsePresenceState(
        rawState as Record<string, unknown>
      );
      setParticipants(nextParticipants);

      // Prune cursors for participants who left
      const activeIds = new Set(nextParticipants.map((p) => p.userId));
      setRemoteCursorsMap((currentMap) =>
        pruneDisconnectedCursors(currentMap, activeIds)
      );
    };

    channel.on("presence", { event: "sync" }, handlePresenceChange);
    channel.on("presence", { event: "join" }, handlePresenceChange);
    channel.on("presence", { event: "leave" }, handlePresenceChange);

    // Cursor move listener
    const handleCursorEvent = ({ payload }: { payload: unknown }) => {
      if (cancelled) {
        return;
      }

      const event = parseCursorMovePayload(payload);
      if (!event) {
        return;
      }

      // Room isolation & self-event filtering
      if (event.roomId !== roomId || event.userId === participant.userId) {
        return;
      }

      setRemoteCursorsMap((currentMap) =>
        applyRemoteCursorMove(currentMap, event)
      );
      onRemoteCursorMoveRef.current?.(event);
    };

    channel.on("broadcast", { event: CURSOR_MOVE_EVENT }, handleCursorEvent);

    let hasConnectedOnce = false;

    const handleOnline = () => {
      if (cancelled) return;
      if (hasConnectedOnce) {
        setSubscription({
          roomId,
          state: "reconnecting",
          message: "Reconnecting…",
          channelName,
          syncStatus: "idle",
        });
      }
    };

    const handleOffline = () => {
      if (cancelled) return;
      subscribedRef.current = false;
      setRemoteCursorsMap(new Map());
      setSubscription({
        roomId,
        state: "disconnected",
        message: "Disconnected",
        channelName,
        syncStatus: "idle",
      });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    channel.subscribe((status, error) => {
      if (cancelled) {
        return;
      }

      if (status === "SUBSCRIBED") {
        void channel.track({
          userId: participant.userId,
          displayName: participant.displayName,
          color: participant.color,
        });

        subscribedRef.current = true;
        appliedRemoteSnapshot = false;

        hasConnectedOnce = true;

        setSubscription({
          roomId,
          state: "connected",
          message: "Syncing...",
          channelName,
          syncStatus: "syncing",
        });

        sendRequestSync();

        if (retryTimer !== null) {
          clearTimeout(retryTimer);
        }
        retryTimer = setTimeout(() => {
          if (cancelled || appliedRemoteSnapshot) {
            return;
          }

          sendRequestSync();
        }, REQUEST_SYNC_RETRY_MS);

        if (syncWaitTimer !== null) {
          clearTimeout(syncWaitTimer);
        }
        syncWaitTimer = setTimeout(() => {
          if (cancelled || appliedRemoteSnapshot) {
            return;
          }

          setSubscription({
            roomId,
            state: "connected",
            message: "Synced",
            channelName,
            syncStatus: "synced",
          });
        }, EMPTY_SNAPSHOT_WAIT_MS);
        return;
      }

      if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        subscribedRef.current = false;
        setRemoteCursorsMap(new Map());

        if (syncWaitTimer !== null) {
          clearTimeout(syncWaitTimer);
          syncWaitTimer = null;
        }

        if (retryTimer !== null) {
          clearTimeout(retryTimer);
          retryTimer = null;
        }

        if (hasConnectedOnce) {
          setSubscription({
            roomId,
            state: "reconnecting",
            message: "Reconnecting…",
            channelName,
            syncStatus: "idle",
          });
        } else {
          setSubscription({
            roomId,
            state: "error",
            message: error?.message?.trim() || "Connection error",
            channelName,
            syncStatus: "idle",
          });
        }
      }
    });

    return () => {
      cancelled = true;
      subscribedRef.current = false;
      channelRef.current = null;
      publishContextRef.current = null;
      setRemoteCursorsMap(new Map());

      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);

      if (syncWaitTimer !== null) {
        clearTimeout(syncWaitTimer);
      }

      if (retryTimer !== null) {
        clearTimeout(retryTimer);
      }

      void channel.untrack();
      void supabase.removeChannel(channel);
    };
  }, [roomId]);

  const broadcastNodeUpsert = useCallback((node: CanvasNode) => {
    const channel = channelRef.current;
    const meta = publishContextRef.current;

    if (!channel || !meta || !subscribedRef.current) {
      return;
    }

    void channel.send({
      type: "broadcast",
      event: NODE_UPSERT_EVENT,
      payload: {
        type: NODE_UPSERT_EVENT,
        roomId: meta.roomId,
        senderId: meta.senderId,
        node: cloneCanvasNode(node),
      },
    });
  }, []);

  const broadcastNodeDeleted = useCallback((nodeId: string) => {
    const channel = channelRef.current;
    const meta = publishContextRef.current;

    if (!channel || !meta || !subscribedRef.current || nodeId.length === 0) {
      return;
    }

    void channel.send({
      type: "broadcast",
      event: NODE_DELETED_EVENT,
      payload: {
        type: NODE_DELETED_EVENT,
        roomId: meta.roomId,
        senderId: meta.senderId,
        nodeId,
      },
    });
  }, []);

  const broadcastNodeMoved = useCallback(
    (nodeId: string, position: NodePosition) => {
      const channel = channelRef.current;
      const meta = publishContextRef.current;

      if (!channel || !meta || !subscribedRef.current || nodeId.length === 0) {
        return;
      }

      if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
        return;
      }

      void channel.send({
        type: "broadcast",
        event: NODE_MOVED_EVENT,
        payload: {
          type: NODE_MOVED_EVENT,
          roomId: meta.roomId,
          senderId: meta.senderId,
          nodeId,
          position: {
            x: position.x,
            y: position.y,
          },
        },
      });
    },
    []
  );

  const broadcastEdgeUpsert = useCallback((edge: CanvasEdge) => {
    const channel = channelRef.current;
    const meta = publishContextRef.current;

    if (!channel || !meta || !subscribedRef.current) {
      return;
    }

    void channel.send({
      type: "broadcast",
      event: EDGE_UPSERT_EVENT,
      payload: {
        type: EDGE_UPSERT_EVENT,
        roomId: meta.roomId,
        senderId: meta.senderId,
        edge: cloneCanvasEdge(edge),
      },
    });
  }, []);

  const broadcastEdgeDeleted = useCallback((edgeId: string) => {
    const channel = channelRef.current;
    const meta = publishContextRef.current;

    if (!channel || !meta || !subscribedRef.current || edgeId.length === 0) {
      return;
    }

    void channel.send({
      type: "broadcast",
      event: EDGE_DELETED_EVENT,
      payload: {
        type: EDGE_DELETED_EVENT,
        roomId: meta.roomId,
        senderId: meta.senderId,
        edgeId,
      },
    });
  }, []);

  const broadcastGroupUpsert = useCallback((group: CanvasGroup) => {
    const channel = channelRef.current;
    const meta = publishContextRef.current;

    if (!channel || !meta || !subscribedRef.current) {
      return;
    }

    void channel.send({
      type: "broadcast",
      event: GROUP_UPSERT_EVENT,
      payload: {
        type: GROUP_UPSERT_EVENT,
        roomId: meta.roomId,
        senderId: meta.senderId,
        group: cloneCanvasGroup(group),
      },
    });
  }, []);

  const broadcastGroupDeleted = useCallback((groupId: string) => {
    const channel = channelRef.current;
    const meta = publishContextRef.current;

    if (!channel || !meta || !subscribedRef.current || groupId.length === 0) {
      return;
    }

    void channel.send({
      type: "broadcast",
      event: GROUP_DELETED_EVENT,
      payload: {
        type: GROUP_DELETED_EVENT,
        roomId: meta.roomId,
        senderId: meta.senderId,
        groupId,
      },
    });
  }, []);

  const broadcastCursorMove = useCallback(
    (x: number, y: number, timestamp?: number) => {
      const channel = channelRef.current;
      const meta = publishContextRef.current;

      if (!channel || !meta || !subscribedRef.current) {
        return;
      }

      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return;
      }

      const now =
        timestamp && Number.isFinite(timestamp) && timestamp > 0
          ? timestamp
          : Date.now();

      void channel.send({
        type: "broadcast",
        event: CURSOR_MOVE_EVENT,
        payload: {
          type: CURSOR_MOVE_EVENT,
          roomId: meta.roomId,
          userId: meta.senderId,
          senderId: meta.senderId,
          x,
          y,
          timestamp: now,
        },
      });
    },
    []
  );

  if (!roomId) {
    return {
      ...IDLE_CONNECTION,
      ...NOOP_BROADCAST,
    };
  }

  const channelName = getRoomChannelName(roomId);

  if (!getBrowserSupabaseConfig()) {
    return {
      state: "error",
      message: "Realtime unavailable",
      channelName,
      syncStatus: "idle",
      participants: [],
      currentParticipant: null,
      remoteCursors: [],
      ...NOOP_BROADCAST,
    };
  }

  if (subscription && subscription.roomId === roomId) {
    return {
      state: subscription.state,
      message: subscription.message,
      channelName: subscription.channelName,
      syncStatus: subscription.syncStatus,
      participants,
      currentParticipant,
      remoteCursors,
      broadcastNodeUpsert,
      broadcastNodeDeleted,
      broadcastNodeMoved,
      broadcastEdgeUpsert,
      broadcastEdgeDeleted,
      broadcastGroupUpsert,
      broadcastGroupDeleted,
      broadcastCursorMove,
    };
  }

  return {
    state: "connecting",
    message: "Connecting…",
    channelName,
    syncStatus: "idle",
    participants,
    currentParticipant,
    remoteCursors,
    broadcastNodeUpsert,
    broadcastNodeDeleted,
    broadcastNodeMoved,
    broadcastEdgeUpsert,
    broadcastEdgeDeleted,
    broadcastGroupUpsert,
    broadcastGroupDeleted,
    broadcastCursorMove,
  };
}
