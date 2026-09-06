"use client";

import { useMemo } from "react";
import type { MeetingPeerConnectionState } from "../../lib/collaboration/meeting/meetingTypes";
import { MeetingVideoTile } from "./MeetingVideoTile";

export type MeetingParticipantTileProps = {
  userId: string;
  displayName: string;
  color?: string;
  stream?: MediaStream | null;
  isLocal?: boolean;
  isMuted?: boolean;
  isVideoOn?: boolean;
  isSharing?: boolean;
  connectionState?: MeetingPeerConnectionState;
  isSpeaking?: boolean;
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "U";
}

export function MeetingParticipantTile({
  userId,
  displayName,
  color = "#6366f1",
  stream = null,
  isLocal = false,
  isMuted = false,
  isVideoOn = true,
  isSharing = false,
  connectionState = "connected",
}: MeetingParticipantTileProps) {
  const initials = useMemo(() => getInitials(displayName), [displayName]);
  const hasActiveVideo = Boolean(isVideoOn && stream);

  // Status indicator styling
  const connectionBadge = useMemo(() => {
    if (isLocal) return null;
    switch (connectionState) {
      case "connected":
        return <span className="h-2 w-2 rounded-full bg-emerald-400" title="Connected" />;
      case "connecting":
      case "joining":
        return <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" title="Connecting…" />;
      case "failed":
        return <span className="h-2 w-2 rounded-full bg-red-500" title="Connection failed" />;
      case "closed":
      case "leaving":
        return <span className="h-2 w-2 rounded-full bg-zinc-500" title="Disconnected" />;
      default:
        return <span className="h-2 w-2 rounded-full bg-zinc-400" title="Connecting…" />;
    }
  }, [isLocal, connectionState]);

  return (
    <div
      data-testid={isLocal ? "local-participant-tile" : `participant-tile-${userId}`}
      data-user-id={userId}
      className={`group relative flex h-28 w-44 shrink-0 flex-col overflow-hidden rounded-xl border bg-zinc-950 shadow-md transition-all sm:h-32 sm:w-48 ${
        isSharing
          ? "border-indigo-500 ring-2 ring-indigo-500/50 shadow-indigo-500/20"
          : "border-zinc-800"
      }`}
    >
      {/* Video Stream or Avatar Fallback */}
      {hasActiveVideo ? (
        <MeetingVideoTile
          stream={stream}
          muted={isLocal}
          mirror={isLocal && !isSharing}
          ariaLabel={`${displayName}'s video`}
          className="h-full w-full"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-b from-zinc-900 to-zinc-950 p-2 text-center">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full text-base font-bold text-white shadow-inner"
            style={{ backgroundColor: color }}
          >
            {initials}
          </div>
          <span className="mt-1.5 flex items-center gap-1 text-[10px] font-medium text-zinc-400">
            {/* Camera Off Icon */}
            <svg
              className="h-3 w-3 text-zinc-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M4 6h10a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2zM3 3l18 18"
              />
            </svg>
            Camera off
          </span>
        </div>
      )}

      {/* Top Bar Indicators (Connection status & indicators) */}
      <div className="pointer-events-none absolute inset-x-2 top-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {isLocal ? (
            <span className="rounded bg-zinc-900/80 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300 backdrop-blur-sm">
              You
            </span>
          ) : (
            <span className="flex items-center gap-1.5 rounded bg-zinc-900/80 px-1.5 py-0.5 text-[10px] font-medium text-zinc-300 backdrop-blur-sm">
              {connectionBadge}
              <span className="capitalize">{connectionState}</span>
            </span>
          )}

          {isSharing ? (
            <span
              data-testid="participant-presenting-badge"
              className="flex items-center gap-1 rounded bg-indigo-600/90 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm backdrop-blur-sm"
              title="Presenting screen"
            >
              <svg
                className="h-2.5 w-2.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
              <span>Presenting</span>
            </span>
          ) : null}
        </div>

        {/* Mute badge if muted */}
        {isMuted ? (
          <span
            data-testid="participant-muted-icon"
            className="flex h-5 w-5 items-center justify-center rounded-full bg-red-600/90 text-white shadow"
            title="Microphone muted"
          >
            <svg
              className="h-3 w-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3zM3 3l18 18"
              />
            </svg>
          </span>
        ) : null}
      </div>

      {/* Bottom Bar: Name label */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2">
        <div className="flex items-center justify-between gap-1">
          <span
            className="max-w-[120px] truncate text-xs font-medium text-zinc-200"
            title={displayName}
          >
            {displayName}
          </span>
          {isLocal ? (
            <span className="text-[10px] text-zinc-400 font-normal">
              (Local)
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
