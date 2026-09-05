// Viewport Events & Follow Protocol (Phase 11.3)
// Ephemeral representation of Follow Me protocol and viewport broadcast events.
// Decoupled from semantic CanvasState and persistence.

export type ViewportState = {
  x: number;
  y: number;
  zoom: number;
};

export const FOLLOW_USER_EVENT = "FOLLOW_USER";
export const UNFOLLOW_USER_EVENT = "UNFOLLOW_USER";
export const VIEWPORT_UPDATE_EVENT = "VIEWPORT_UPDATE";

export type FollowUserPayload = {
  type: typeof FOLLOW_USER_EVENT;
  roomId: string;
  leaderId: string;
  followerId: string;
};

export type UnfollowUserPayload = {
  type: typeof UNFOLLOW_USER_EVENT;
  roomId: string;
  leaderId: string;
  followerId: string;
};

export type ViewportUpdatePayload = {
  type: typeof VIEWPORT_UPDATE_EVENT;
  roomId: string;
  senderId: string;
  viewport: ViewportState;
  timestamp: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isValidCoordinate(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    !Number.isNaN(value)
  );
}

export function isValidZoom(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    !Number.isNaN(value) &&
    value > 0
  );
}

export function isValidTimestamp(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    !Number.isNaN(value) &&
    value > 0
  );
}

export function isValidViewport(value: unknown): value is ViewportState {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isValidCoordinate(value.x) &&
    isValidCoordinate(value.y) &&
    isValidZoom(value.zoom)
  );
}

export function cloneViewport(viewport: ViewportState): ViewportState {
  return {
    x: viewport.x,
    y: viewport.y,
    zoom: viewport.zoom,
  };
}

export function isSameViewport(a: ViewportState, b: ViewportState): boolean {
  return a.x === b.x && a.y === b.y && a.zoom === b.zoom;
}

export function parseFollowUserPayload(
  payload: unknown
): FollowUserPayload | null {
  if (!isRecord(payload)) {
    return null;
  }

  if (payload.type !== FOLLOW_USER_EVENT) {
    return null;
  }

  if (!isNonEmptyString(payload.roomId)) {
    return null;
  }

  if (!isNonEmptyString(payload.leaderId)) {
    return null;
  }

  if (!isNonEmptyString(payload.followerId)) {
    return null;
  }

  const leaderId = payload.leaderId.trim();
  const followerId = payload.followerId.trim();

  // A participant cannot follow themselves
  if (leaderId === followerId) {
    return null;
  }

  return {
    type: FOLLOW_USER_EVENT,
    roomId: payload.roomId.trim(),
    leaderId,
    followerId,
  };
}

export function parseUnfollowUserPayload(
  payload: unknown
): UnfollowUserPayload | null {
  if (!isRecord(payload)) {
    return null;
  }

  if (payload.type !== UNFOLLOW_USER_EVENT) {
    return null;
  }

  if (!isNonEmptyString(payload.roomId)) {
    return null;
  }

  if (!isNonEmptyString(payload.leaderId)) {
    return null;
  }

  if (!isNonEmptyString(payload.followerId)) {
    return null;
  }

  const leaderId = payload.leaderId.trim();
  const followerId = payload.followerId.trim();

  if (leaderId === followerId) {
    return null;
  }

  return {
    type: UNFOLLOW_USER_EVENT,
    roomId: payload.roomId.trim(),
    leaderId,
    followerId,
  };
}

export function parseViewportUpdatePayload(
  payload: unknown
): ViewportUpdatePayload | null {
  if (!isRecord(payload)) {
    return null;
  }

  if (payload.type !== VIEWPORT_UPDATE_EVENT) {
    return null;
  }

  if (!isNonEmptyString(payload.roomId)) {
    return null;
  }

  if (!isNonEmptyString(payload.senderId)) {
    return null;
  }

  if (!isValidTimestamp(payload.timestamp)) {
    return null;
  }

  if (!isValidViewport(payload.viewport)) {
    return null;
  }

  return {
    type: VIEWPORT_UPDATE_EVENT,
    roomId: payload.roomId.trim(),
    senderId: payload.senderId.trim(),
    viewport: {
      x: payload.viewport.x,
      y: payload.viewport.y,
      zoom: payload.viewport.zoom,
    },
    timestamp: payload.timestamp,
  };
}

// Stale viewport protection
export function shouldAcceptViewportUpdate(
  incomingTimestamp: number,
  lastAcceptedTimestamp: number
): boolean {
  return incomingTimestamp >= lastAcceptedTimestamp;
}

export function isStaleViewportUpdate(
  incomingTimestamp: number,
  lastAcceptedTimestamp: number
): boolean {
  return incomingTimestamp < lastAcceptedTimestamp;
}

// In-memory follower set management
export function applyFollowUser(
  currentFollowers: Set<string>,
  followerId: string
): Set<string> {
  if (currentFollowers.has(followerId)) {
    return currentFollowers;
  }
  const next = new Set(currentFollowers);
  next.add(followerId);
  return next;
}

export function applyUnfollowUser(
  currentFollowers: Set<string>,
  followerId: string
): Set<string> {
  if (!currentFollowers.has(followerId)) {
    return currentFollowers;
  }
  const next = new Set(currentFollowers);
  next.delete(followerId);
  return next;
}

export function isLeaderForViewportBroadcast(
  followerCount: number,
  followingUserId: string | null
): boolean {
  return followingUserId === null && followerCount > 0;
}

export type ViewportBroadcasterOptions = {
  throttleMs?: number;
  isLeader: () => boolean;
  publish: (viewport: ViewportState) => void;
};

export type ViewportBroadcaster = {
  onViewportMove: (viewport: ViewportState) => void;
  onViewportMoveEnd: (viewport?: ViewportState) => void;
  destroy: () => void;
  flush: () => void;
};

export function createViewportBroadcaster({
  throttleMs = 50,
  isLeader,
  publish,
}: ViewportBroadcasterOptions): ViewportBroadcaster {
  let lastBroadcastTime = 0;
  let lastSentViewport: ViewportState | null = null;
  let lastQueuedViewport: ViewportState | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;

  const flush = () => {
    if (destroyed) return;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (!lastQueuedViewport) return;
    if (!isLeader()) return;
    if (!isValidViewport(lastQueuedViewport)) return;

    if (
      !lastSentViewport ||
      !isSameViewport(lastSentViewport, lastQueuedViewport)
    ) {
      lastBroadcastTime = Date.now();
      lastSentViewport = cloneViewport(lastQueuedViewport);
      publish(lastSentViewport);
    }
  };

  const onViewportMove = (viewport: ViewportState) => {
    if (destroyed) return;
    if (!isValidViewport(viewport)) return;
    if (!isLeader()) return;

    if (lastSentViewport && isSameViewport(lastSentViewport, viewport)) {
      return;
    }

    lastQueuedViewport = cloneViewport(viewport);

    const now = Date.now();
    const elapsed = now - lastBroadcastTime;

    if (elapsed >= throttleMs) {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      lastBroadcastTime = now;
      lastSentViewport = cloneViewport(viewport);
      publish(lastSentViewport);
    } else if (timer === null) {
      timer = setTimeout(() => {
        timer = null;
        if (destroyed) return;
        flush();
      }, throttleMs - elapsed);
    }
  };

  const onViewportMoveEnd = (viewport?: ViewportState) => {
    if (destroyed) return;
    if (viewport && isValidViewport(viewport)) {
      lastQueuedViewport = cloneViewport(viewport);
    }
    if (timer !== null) {
      // Trailing timer is already scheduled and will flush
      return;
    }
    if (
      lastQueuedViewport &&
      (!lastSentViewport || !isSameViewport(lastSentViewport, lastQueuedViewport))
    ) {
      const now = Date.now();
      const elapsed = now - lastBroadcastTime;
      if (elapsed >= throttleMs) {
        flush();
      } else {
        timer = setTimeout(() => {
          timer = null;
          if (destroyed) return;
          flush();
        }, throttleMs - elapsed);
      }
    }
  };

  const destroy = () => {
    destroyed = true;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    lastQueuedViewport = null;
    lastSentViewport = null;
  };

  return {
    onViewportMove,
    onViewportMoveEnd,
    destroy,
    flush,
  };
}

export function isCloseViewport(
  a: ViewportState,
  b: ViewportState,
  eps = 0.05
): boolean {
  return (
    Math.abs(a.x - b.x) <= eps &&
    Math.abs(a.y - b.y) <= eps &&
    Math.abs(a.zoom - b.zoom) <= eps
  );
}

export type RemoteViewportApplyGuard = {
  markApplying: (viewport: ViewportState) => void;
  shouldSuppressBroadcast: (currentViewport: ViewportState) => boolean;
  isApplying: () => boolean;
  clear: () => void;
  destroy: () => void;
};

export function createRemoteViewportApplyGuard(
  timeoutMs = 120
): RemoteViewportApplyGuard {
  let applying = false;
  let targetViewport: ViewportState | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clear = () => {
    applying = false;
    targetViewport = null;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const markApplying = (viewport: ViewportState) => {
    clear();
    applying = true;
    targetViewport = cloneViewport(viewport);
    timer = setTimeout(() => {
      clear();
    }, timeoutMs);
  };

  const shouldSuppressBroadcast = (currentViewport: ViewportState): boolean => {
    if (!applying) {
      return false;
    }

    if (
      targetViewport &&
      (isSameViewport(targetViewport, currentViewport) ||
        isCloseViewport(targetViewport, currentViewport))
    ) {
      // Consumed the applied remote viewport
      clear();
      return true;
    }

    // Still within remote apply window
    return true;
  };

  return {
    markApplying,
    shouldSuppressBroadcast,
    isApplying: () => applying,
    clear,
    destroy: clear,
  };
}

export type FollowInterruptionHandlerOptions = {
  getFollowingUserId: () => string | null;
  unfollowUser: () => void;
  onInterrupted?: (notice: string) => void;
};

export function shouldInterruptFollowOnManualMovement(
  followingUserId: string | null | undefined
): boolean {
  return typeof followingUserId === "string" && followingUserId.length > 0;
}

export function handleFollowInterruption(
  options: FollowInterruptionHandlerOptions
): boolean {
  const currentLeader = options.getFollowingUserId();
  if (shouldInterruptFollowOnManualMovement(currentLeader)) {
    options.unfollowUser();
    options.onInterrupted?.("Follow mode stopped");
    return true;
  }
  return false;
}

export type RemoteViewportAcceptanceParams = {
  incomingRoomId: string;
  currentRoomId: string;
  senderId: string;
  currentUserId: string;
  followingUserId: string | null;
  incomingTimestamp: number;
  lastAcceptedTimestamp: number;
  sessionGeneration?: number;
  currentGeneration?: number;
};

export function shouldAcceptRemoteViewportEvent(
  params: RemoteViewportAcceptanceParams
): boolean {
  // Generation check if provided
  if (
    typeof params.sessionGeneration === "number" &&
    typeof params.currentGeneration === "number" &&
    params.sessionGeneration !== params.currentGeneration
  ) {
    return false;
  }

  // Room isolation
  if (params.incomingRoomId !== params.currentRoomId) {
    return false;
  }

  // Self filtering
  if (params.senderId === params.currentUserId) {
    return false;
  }

  // Must currently be following the sender
  if (!params.followingUserId || params.senderId !== params.followingUserId) {
    return false;
  }

  // Stale timestamp protection
  if (!shouldAcceptViewportUpdate(params.incomingTimestamp, params.lastAcceptedTimestamp)) {
    return false;
  }

  return true;
}


