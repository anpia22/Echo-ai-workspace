export const CURSOR_MOVE_EVENT = "CURSOR_MOVE";

export type CursorMovePayload = {
  type: typeof CURSOR_MOVE_EVENT;
  roomId: string;
  userId: string;
  senderId: string;
  x: number;
  y: number;
  timestamp: number;
};

export type RemoteCursor = {
  userId: string;
  x: number;
  y: number;
  timestamp: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && !Number.isNaN(value);
}

function isValidTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && !Number.isNaN(value) && value > 0;
}

export function parseCursorMovePayload(
  payload: unknown
): CursorMovePayload | null {
  if (!isRecord(payload)) {
    return null;
  }

  if (!isNonEmptyString(payload.roomId)) {
    return null;
  }

  const userId = isNonEmptyString(payload.userId)
    ? payload.userId.trim()
    : isNonEmptyString(payload.senderId)
    ? payload.senderId.trim()
    : null;

  if (!userId) {
    return null;
  }

  if (!isValidCoordinate(payload.x) || !isValidCoordinate(payload.y)) {
    return null;
  }

  if (!isValidTimestamp(payload.timestamp)) {
    return null;
  }

  return {
    type: CURSOR_MOVE_EVENT,
    roomId: payload.roomId.trim(),
    userId,
    senderId: userId,
    x: payload.x,
    y: payload.y,
    timestamp: payload.timestamp,
  };
}

export function applyRemoteCursorMove(
  current: Map<string, RemoteCursor>,
  payload: CursorMovePayload
): Map<string, RemoteCursor> {
  if (!payload || !payload.userId) {
    return current;
  }

  const existing = current.get(payload.userId);

  // Stale event protection: reject older events
  if (existing && payload.timestamp < existing.timestamp) {
    return current;
  }

  const next = new Map(current);
  next.set(payload.userId, {
    userId: payload.userId,
    x: payload.x,
    y: payload.y,
    timestamp: payload.timestamp,
  });

  return next;
}

export function pruneDisconnectedCursors(
  current: Map<string, RemoteCursor>,
  activeUserIds: Set<string>
): Map<string, RemoteCursor> {
  let changed = false;
  for (const userId of current.keys()) {
    if (!activeUserIds.has(userId)) {
      changed = true;
      break;
    }
  }

  if (!changed) {
    return current;
  }

  const next = new Map<string, RemoteCursor>();
  for (const [userId, cursor] of current.entries()) {
    if (activeUserIds.has(userId)) {
      next.set(userId, cursor);
    }
  }

  return next;
}
