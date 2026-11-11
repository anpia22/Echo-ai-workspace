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

/**
 * Private (access-controlled) channel name. The workspace id is part of the name so the
 * database can check workspace membership for every join and message (see the
 * 20261110010000_p0_1_realtime_authorization.sql migration).
 */
export function getSecureRoomChannelName(
  workspaceId: string,
  roomId: RoomId
): string {
  return `echo-room:${workspaceId}:${roomId}`;
}

export function buildRoomPath(
  roomId: RoomId,
  existingSearch?: string | URLSearchParams
): string {
  const params = new URLSearchParams(
    typeof existingSearch === "string"
      ? (existingSearch.startsWith("?") ? existingSearch.slice(1) : existingSearch)
      : (existingSearch ? existingSearch.toString() : "")
  );
  params.set(ROOM_QUERY_PARAM, roomId);
  return `/app?${params.toString()}`;
}

export function buildRoomUrl(
  roomId: RoomId,
  origin?: string,
  existingSearch?: string | URLSearchParams
): string {
  // Pass the current search so the link keeps ?workspace=: the room's access control is
  // per workspace, so a link without it would open the recipient's own workspace instead.
  const path = buildRoomPath(roomId, existingSearch);

  if (origin) {
    return new URL(path, origin).toString();
  }

  if (typeof window !== "undefined") {
    return new URL(path, window.location.origin).toString();
  }

  return path;
}
