export const ROOM_QUERY_PARAM = "room";

export type RoomId = string;

export type RoomMode = "solo" | "room";

function readRoomParam(
  params: Pick<URLSearchParams, "get">
): RoomId | null {
  const value = params.get(ROOM_QUERY_PARAM);

  if (value == null) {
    return null;
  }

  const roomId = value.trim();

  return roomId.length > 0 ? roomId : null;
}

export function createRoomId(): RoomId {
  return crypto.randomUUID();
}

export function getRoomIdFromUrl(
  search:
    | string
    | Pick<URLSearchParams, "get">
    | null
    | undefined
): RoomId | null {
  if (search == null) {
    return null;
  }

  if (typeof search === "string") {
    const query = search.startsWith("?") ? search.slice(1) : search;
    return readRoomParam(new URLSearchParams(query));
  }

  return readRoomParam(search);
}

export function getRoomMode(roomId: RoomId | null): RoomMode {
  return roomId ? "room" : "solo";
}

export function getRoomChannelName(roomId: RoomId): string {
  return `echo-room:${roomId}`;
}

export function buildRoomPath(roomId: RoomId): string {
  const params = new URLSearchParams();
  params.set(ROOM_QUERY_PARAM, roomId);
  return `/?${params.toString()}`;
}

export function buildRoomUrl(
  roomId: RoomId,
  origin?: string
): string {
  const path = buildRoomPath(roomId);

  if (origin) {
    return new URL(path, origin).toString();
  }

  if (typeof window !== "undefined") {
    return new URL(path, window.location.origin).toString();
  }

  return path;
}
