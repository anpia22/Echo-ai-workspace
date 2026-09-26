"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  MeetingState,
} from "../../lib/collaboration/meeting/meetingTypes";
import { MeetingParticipantTile } from "./MeetingParticipantTile";
import { MeetingControls } from "./MeetingControls";
import { MeetingVideoTile } from "./MeetingVideoTile";

export type MeetingDockProps = {
  meetingState: MeetingState;
  localStream: MediaStream | null;
  screenStream?: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  isMicEnabled: boolean;
  isCameraEnabled: boolean;
  isScreenSharing?: boolean;
  activePresenterId?: string | null;
  localUserId: string | null;
  localDisplayName?: string;
  localColor?: string;
  onStartMeeting: () => Promise<void> | void;
  onLeaveMeeting: () => Promise<void> | void;
  onSetMicEnabled: (enabled: boolean) => void;
  onSetCameraEnabled: (enabled: boolean) => void;
  onToggleScreenShare?: () => void;
};

export function MeetingDock({
  meetingState,
  localStream,
  screenStream = null,
  remoteStreams,
  isMicEnabled,
  isCameraEnabled,
  isScreenSharing = false,
  activePresenterId = null,
  localUserId,
  localDisplayName = "You",
  localColor = "#6366f1",
  onStartMeeting,
  onLeaveMeeting,
  onSetMicEnabled,
  onSetCameraEnabled,
  onToggleScreenShare,
}: MeetingDockProps) {
  const { status, error, participants } = meetingState;
  const [isVideoPanelOpen, setIsVideoPanelOpen] = useState(true);
  const [dismissedError, setDismissedError] = useState<string | null>(null);

  // Spotlight presentation state
  const [spotlightUserId, setSpotlightUserId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [dismissedPresenterId, setDismissedPresenterId] = useState<string | null>(null);
  const spotlightContainerRef = useRef<HTMLDivElement | null>(null);

  // Auto-spotlight when active presenter appears
  useEffect(() => {
    if (activePresenterId && dismissedPresenterId !== activePresenterId) {
      setSpotlightUserId(activePresenterId);
    } else if (!activePresenterId) {
      setSpotlightUserId(null);
      setDismissedPresenterId(null);
    }
  }, [activePresenterId, dismissedPresenterId]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const isAnotherUserSharing = Boolean(
    activePresenterId && activePresenterId !== localUserId
  );
  const screenShareDisabled = isAnotherUserSharing;
  const screenShareDisabledReason = isAnotherUserSharing
    ? "Another participant is currently presenting"
    : undefined;

  const remoteParticipantsList = useMemo(
    () => Array.from(participants.values()),
    [participants]
  );

  const totalParticipantCount = 1 + remoteParticipantsList.length;

  const isSpotlightLocal =
    spotlightUserId === (localUserId || "local") ||
    (isScreenSharing && Boolean(localUserId) && spotlightUserId === localUserId);
  const spotlightParticipant = spotlightUserId ? participants.get(spotlightUserId) : null;
  const spotlightDisplayName = isSpotlightLocal
    ? `${localDisplayName} (You)`
    : (spotlightParticipant?.displayName ?? "Participant");
  const spotlightStream = isSpotlightLocal
    ? (isScreenSharing && screenStream ? screenStream : localStream)
    : (spotlightUserId ? (remoteStreams.get(spotlightUserId) ?? null) : null);
  const isSpotlightSharing = isSpotlightLocal
    ? isScreenSharing
    : Boolean(spotlightParticipant?.screenShareState?.isSharing);

  // 1. Idle state -> render compact Start Meeting trigger
  if (status === "idle") {
    return (
      <div
        data-testid="meeting-dock-idle"
        className="pointer-events-auto absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-30"
      >
        <button
          type="button"
          id="meeting-start-btn"
          onClick={() => void onStartMeeting()}
          className="flex items-center gap-2 rounded-2xl border border-indigo-500/40 bg-indigo-950/90 px-4 py-2.5 text-xs font-semibold text-indigo-200 shadow-2xl backdrop-blur-md transition hover:border-indigo-400 hover:bg-indigo-900/90 hover:scale-105 active:scale-95"
          title="Start or join audio/video meeting"
        >
          <svg
            className="h-4 w-4 text-indigo-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
          <span>Start Meeting</span>
        </button>
      </div>
    );
  }

  // 2. Joining state -> disabled loading indicator
  if (status === "joining") {
    return (
      <div
        data-testid="meeting-dock-joining"
        className="pointer-events-auto absolute bottom-6 left-1/2 -translate-x-1/2 z-30"
      >
        <button
          type="button"
          disabled
          className="flex cursor-not-allowed items-center gap-2 rounded-2xl border border-amber-500/40 bg-amber-950/90 px-4 py-2.5 text-xs font-semibold text-amber-200 shadow-2xl backdrop-blur-md opacity-90"
        >
          <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
          <span>Joining meeting…</span>
        </button>
      </div>
    );
  }

  // 3. Error state -> clean recoverable notice
  if (status === "error" && error && error !== dismissedError) {
    return (
      <div
        data-testid="meeting-dock-error"
        className="pointer-events-auto fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-red-500/50 bg-red-950/90 px-4 py-3 text-xs text-red-200 shadow-2xl backdrop-blur-md"
      >
        <svg
          className="h-4 w-4 shrink-0 text-red-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <span>{error || "Unable to join meeting."}</span>
        <button
          type="button"
          onClick={() => void onStartMeeting()}
          className="rounded-lg bg-red-800/60 px-2 py-1 font-semibold text-white transition hover:bg-red-700"
        >
          Retry
        </button>
        <button
          type="button"
          onClick={() => setDismissedError(error)}
          className="text-red-400 hover:text-white"
          title="Dismiss"
        >
          ✕
        </button>
      </div>
    );
  }

  // 4. In-Meeting & Leaving state -> Floating Video Panel + Floating Controls
  return (
    <div
      data-testid="meeting-dock-active"
      className="pointer-events-none absolute inset-0 z-40 overflow-hidden"
    >
      {/* Floating Video Strip / Panel (Top Right over canvas) */}
      {isVideoPanelOpen ? (
        <div
          data-testid="meeting-video-panel"
          className="pointer-events-auto absolute left-3 right-3 top-3 sm:left-auto sm:right-6 sm:top-6 flex max-w-full flex-col gap-2 rounded-3xl border border-zinc-700/50 bg-zinc-900/80 p-2.5 sm:p-3 shadow-2xl backdrop-blur-xl transition-all sm:max-w-2xl"
        >
          <div className="flex items-center justify-between px-1 text-[11px] font-medium text-zinc-400">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Meeting Active ({totalParticipantCount})
            </span>
            <button
              type="button"
              onClick={() => setIsVideoPanelOpen(false)}
              className="text-zinc-500 transition hover:text-zinc-300"
              title="Minimize panel"
            >
              Minimize
            </button>
          </div>

          <div className="flex max-h-40 max-w-full items-center gap-2 overflow-x-auto pb-1 sm:max-h-44">
            {/* Local Video Tile */}
            <MeetingParticipantTile
              userId={localUserId || "local"}
              displayName={localDisplayName}
              color={localColor}
              stream={
                isScreenSharing && screenStream ? screenStream : localStream
              }
              isLocal
              isMuted={!isMicEnabled}
              isVideoOn={isCameraEnabled || isScreenSharing}
              isSharing={isScreenSharing}
              connectionState="connected"
              onExpand={() => setSpotlightUserId(localUserId || "local")}
            />

            {/* Remote Participant Tiles */}
            {remoteParticipantsList.map((participant) => (
              <MeetingParticipantTile
                key={participant.userId}
                userId={participant.userId}
                displayName={participant.displayName}
                color={participant.color}
                stream={remoteStreams.get(participant.userId) ?? null}
                isLocal={false}
                isMuted={participant.audioState.isMuted}
                isVideoOn={
                  participant.videoState.isVideoOn ||
                  Boolean(participant.screenShareState?.isSharing)
                }
                isSharing={Boolean(participant.screenShareState?.isSharing)}
                connectionState={participant.connectionState}
                onExpand={() => setSpotlightUserId(participant.userId)}
              />
            ))}

            {/* Empty Remote Participants notice */}
            {remoteParticipantsList.length === 0 ? (
              <div
                data-testid="meeting-empty-remote"
                className="flex h-28 w-44 shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-zinc-900/40 p-3 text-center sm:h-32 sm:w-48"
              >
                <span className="text-xl">👋</span>
                <p className="mt-1 text-[11px] font-medium text-zinc-300">
                  Waiting for others…
                </p>
                <p className="mt-0.5 text-[9px] text-zinc-500">
                  Invite someone by sharing the room link
                </p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Spotlight Presentation / Video Stage Modal */}
      {spotlightUserId && spotlightStream ? (
        <div
          ref={spotlightContainerRef}
          data-testid="meeting-spotlight-modal"
          className="pointer-events-auto fixed inset-2 sm:inset-6 md:inset-8 z-50 flex flex-col overflow-hidden rounded-2xl sm:rounded-3xl border border-zinc-700/60 bg-zinc-950/95 shadow-2xl backdrop-blur-2xl transition-all"
        >
          {/* Spotlight Header Bar */}
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-800/80 bg-zinc-900/80 px-3 sm:px-4">
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span className="truncate text-xs sm:text-sm font-semibold text-zinc-100">
                {spotlightDisplayName}
              </span>
              {isSpotlightSharing ? (
                <span className="flex items-center gap-1 rounded bg-indigo-600/90 px-2 py-0.5 text-[10px] font-semibold text-white shrink-0">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Screen Share
                </span>
              ) : null}
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Fullscreen Toggle */}
              <button
                type="button"
                onClick={() => {
                  if (!document.fullscreenElement) {
                    spotlightContainerRef.current?.requestFullscreen?.();
                    setIsFullscreen(true);
                  } else {
                    document.exitFullscreen?.();
                    setIsFullscreen(false);
                  }
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700 hover:text-white transition"
                title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                aria-label="Toggle Fullscreen"
              >
                {isFullscreen ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 9L4 4m0 0h5m-5 0v5m11 2l5 5m0 0h-5m5 0v-5m-7-3l5-5m0 0v5m0-5h-5M4 20l5-5m-5 5h5m-5 0v-5" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                )}
              </button>

              {/* Close Spotlight Button */}
              <button
                type="button"
                onClick={() => {
                  if (activePresenterId === spotlightUserId) {
                    setDismissedPresenterId(spotlightUserId);
                  }
                  setSpotlightUserId(null);
                  if (document.fullscreenElement) {
                    document.exitFullscreen?.();
                    setIsFullscreen(false);
                  }
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800/80 text-zinc-400 hover:bg-zinc-700 hover:text-white transition"
                title="Minimize spotlight view"
                aria-label="Minimize spotlight"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Video Stream Stage */}
          <div className="relative flex-1 w-full bg-black flex items-center justify-center overflow-hidden">
            <MeetingVideoTile
              stream={spotlightStream}
              muted={isSpotlightLocal}
              mirror={false}
              ariaLabel={`${spotlightDisplayName}'s presentation`}
              className="h-full w-full object-contain"
            />
          </div>
        </div>
      ) : null}

      {/* Floating Bottom Meeting Controls Bar */}
      <div className="pointer-events-auto absolute bottom-3 sm:bottom-6 left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:right-6 z-30 max-w-[calc(100vw-1.5rem)]">
        <MeetingControls
          isMicEnabled={isMicEnabled}
          isCameraEnabled={isCameraEnabled}
          isScreenSharing={isScreenSharing}
          isScreenShareDisabled={screenShareDisabled}
          screenShareDisabledReason={screenShareDisabledReason}
          isLeaving={status === "leaving"}
          participantCount={totalParticipantCount}
          isVideoPanelOpen={isVideoPanelOpen}
          onToggleMic={() => onSetMicEnabled(!isMicEnabled)}
          onToggleCamera={() => onSetCameraEnabled(!isCameraEnabled)}
          onToggleScreenShare={onToggleScreenShare}
          onToggleVideoPanel={() => setIsVideoPanelOpen((prev) => !prev)}
          onLeave={() => void onLeaveMeeting()}
        />
      </div>
    </div>
  );
}
