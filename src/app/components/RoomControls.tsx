"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  buildRoomPath,
  buildRoomUrl,
  createRoomId,
  getRoomIdFromUrl,
} from "../lib/collaboration/room";
import type {
  RoomConnection,
  RoomBroadcast,
} from "../lib/collaboration/useRoomChannel";
import PresenceIndicator from "./PresenceIndicator";

import {
  resolveParticipantDisplayName,
  formatFollowerCountLabel,
  formatFollowingLabel,
} from "../lib/collaboration/presence";

type RoomControlsProps = {
  connection: RoomConnection & Partial<RoomBroadcast>;
  followInterruptedNotice?: string | null;
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

export default function RoomControls({
  connection,
  followInterruptedNotice,
}: RoomControlsProps) {
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

  const followedParticipant = connection.followingUserId
    ? connection.participants.find(
        (p) =>
          (p.userId ?? (p as unknown as { id?: string })?.id) ===
          connection.followingUserId
      )
    : null;

  const followerCount = connection.followerUserIds?.size ?? 0;
  const followedLeaderName = connection.followingUserId
    ? followedParticipant?.displayName ||
      resolveParticipantDisplayName(
        connection.followingUserId,
        connection.participants
      )
    : "";

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
        followingUserId={connection.followingUserId}
        followerUserIds={connection.followerUserIds}
        onFollow={connection.followUser}
        onUnfollow={connection.unfollowUser}
      />

      {followerCount > 0 ? (
        <div
          className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-2.5 py-1 text-xs text-emerald-300"
          title={`${followerCount} participant${followerCount === 1 ? "" : "s"} following your canvas`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>
            {formatFollowerCountLabel(followerCount)}
          </span>
        </div>
      ) : null}

      {connection.followingUserId ? (
        <div className="flex items-center gap-1.5 rounded-xl border border-blue-500/40 bg-blue-950/40 px-2.5 py-1 text-xs text-blue-300">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
          <span className="max-w-36 truncate">
            {formatFollowingLabel(followedLeaderName)}
          </span>
          <button
            type="button"
            onClick={() => connection.unfollowUser?.()}
            className="rounded border border-blue-400/30 bg-blue-900/50 px-1.5 py-0.5 text-[10px] font-medium text-blue-200 transition hover:bg-blue-800/60"
            aria-label={`Unfollow ${followedLeaderName}`}
            title="Stop following"
          >
            Unfollow
          </button>
        </div>
      ) : null}

      {followInterruptedNotice ? (
        <span
          className="flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-400 transition"
          role="status"
          aria-live="polite"
        >
          {followInterruptedNotice}
        </span>
      ) : null}

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
