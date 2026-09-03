"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  buildRoomPath,
  buildRoomUrl,
  createRoomId,
  getRoomIdFromUrl,
} from "../lib/collaboration/room";
import type { RoomConnection } from "../lib/collaboration/useRoomChannel";
import PresenceIndicator from "./PresenceIndicator";

type RoomControlsProps = {
  connection: RoomConnection;
};

function formatRoomLabel(roomId: string): string {
  if (roomId.length <= 18) {
    return roomId;
  }

  return `${roomId.slice(0, 8)}…`;
}

function statusLabel(
  connection: RoomConnection
): string {
  const { message, state, syncStatus } = connection;

  if (state === "error") {
    return message || "Connection error";
  }

  if (state === "connecting") {
    return message || "Connecting…";
  }

  if (state === "reconnecting") {
    return "Reconnecting…";
  }

  if (state === "disconnected") {
    return "Disconnected";
  }

  if (state === "connected" && syncStatus === "syncing") {
    return "Syncing...";
  }

  if (state === "connected" && syncStatus === "synced") {
    return "Synced";
  }

  if (message) {
    return message;
  }

  if (state === "connected") {
    return "Connected";
  }

  return "";
}

export default function RoomControls({ connection }: RoomControlsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomId = getRoomIdFromUrl(searchParams);
  const [copyStatus, setCopyStatus] = useState<
    "idle" | "copied" | "failed"
  >("idle");

  const createRoom = () => {
    const nextRoomId = createRoomId();
    router.push(buildRoomPath(nextRoomId));
  };

  const copyRoomLink = async () => {
    if (!roomId) {
      return;
    }

    const url = buildRoomUrl(roomId);

    try {
      await navigator.clipboard.writeText(url);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }

    window.setTimeout(() => {
      setCopyStatus("idle");
    }, 2000);
  };

  if (!roomId) {
    return (
      <button
        type="button"
        onClick={createRoom}
        className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800"
      >
        Create Room
      </button>
    );
  }

  const copyLabel =
    copyStatus === "copied"
      ? "Copied"
      : copyStatus === "failed"
        ? "Copy failed"
        : "Copy link";

  const statusText = statusLabel(connection);

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        className="max-w-40 truncate text-xs text-zinc-500"
        title={`Shared workspace ${roomId}`}
      >
        Room: {formatRoomLabel(roomId)}
      </span>

      <button
        type="button"
        onClick={() => {
          void copyRoomLink();
        }}
        className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800"
      >
        {copyLabel}
      </button>

      <PresenceIndicator
        participants={connection.participants}
        currentParticipant={connection.currentParticipant}
      />

      {statusText ? (
        <span
          className="max-w-40 truncate text-xs text-zinc-500"
          title={
            connection.channelName
              ? `${statusText} (${connection.channelName})`
              : statusText
          }
        >
          {statusText}
        </span>
      ) : null}
    </div>
  );
}
