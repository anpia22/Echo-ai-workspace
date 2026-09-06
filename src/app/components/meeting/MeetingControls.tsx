"use client";

export type MeetingControlsProps = {
  isMicEnabled: boolean;
  isCameraEnabled: boolean;
  isScreenSharing?: boolean;
  isScreenShareDisabled?: boolean;
  screenShareDisabledReason?: string;
  isLeaving?: boolean;
  participantCount: number;
  isVideoPanelOpen: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare?: () => void;
  onToggleVideoPanel: () => void;
  onLeave: () => void;
};

export function MeetingControls({
  isMicEnabled,
  isCameraEnabled,
  isScreenSharing = false,
  isScreenShareDisabled = false,
  screenShareDisabledReason,
  isLeaving = false,
  participantCount,
  isVideoPanelOpen,
  onToggleMic,
  onToggleCamera,
  onToggleScreenShare,
  onToggleVideoPanel,
  onLeave,
}: MeetingControlsProps) {
  return (
    <div
      data-testid="meeting-controls"
      className="flex items-center gap-2 rounded-2xl border border-zinc-700/60 bg-zinc-900/90 p-2 shadow-2xl backdrop-blur-md"
    >
      {/* Participant Count Badge */}
      <div
        className="flex items-center gap-1.5 rounded-xl bg-zinc-800/80 px-2.5 py-1.5 text-xs font-medium text-zinc-300"
        title={`${participantCount} participant${participantCount === 1 ? "" : "s"} in meeting`}
      >
        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
        <svg
          className="h-3.5 w-3.5 text-zinc-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
        <span>{participantCount}</span>
      </div>

      <div className="h-4 w-px bg-zinc-700/60" />

      {/* Mic Toggle */}
      <button
        type="button"
        id="meeting-toggle-mic-btn"
        onClick={onToggleMic}
        disabled={isLeaving}
        title={isMicEnabled ? "Mute microphone" : "Unmute microphone"}
        className={`flex h-10 w-10 items-center justify-center rounded-xl transition disabled:opacity-50 ${
          isMicEnabled
            ? "border border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
            : "border border-red-500/60 bg-red-950/60 text-red-400 hover:bg-red-900/60"
        }`}
      >
        {isMicEnabled ? (
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
            />
          </svg>
        ) : (
          <svg
            className="h-5 w-5"
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
        )}
      </button>

      {/* Camera Toggle */}
      <button
        type="button"
        id="meeting-toggle-camera-btn"
        onClick={onToggleCamera}
        disabled={isLeaving}
        title={isCameraEnabled ? "Turn off camera" : "Turn on camera"}
        className={`flex h-10 w-10 items-center justify-center rounded-xl transition disabled:opacity-50 ${
          isCameraEnabled
            ? "border border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
            : "border border-red-500/60 bg-red-950/60 text-red-400 hover:bg-red-900/60"
        }`}
      >
        {isCameraEnabled ? (
          <svg
            className="h-5 w-5"
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
        ) : (
          <svg
            className="h-5 w-5"
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
        )}
      </button>

      {/* Screen Share Toggle */}
      <button
        type="button"
        id="meeting-toggle-screen-btn"
        onClick={onToggleScreenShare}
        disabled={isLeaving || isScreenShareDisabled}
        title={
          screenShareDisabledReason ||
          (isScreenSharing ? "Stop sharing screen" : "Share screen")
        }
        className={`flex h-10 w-10 items-center justify-center rounded-xl transition ${
          isScreenSharing
            ? "border border-indigo-500/80 bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 hover:bg-indigo-500"
            : isScreenShareDisabled
            ? "border border-zinc-800 bg-zinc-800/40 text-zinc-500 cursor-not-allowed opacity-50"
            : "border border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
        }`}
      >
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
      </button>

      {/* Video Panel Minimize / Expand Toggle */}
      <button
        type="button"
        id="meeting-toggle-panel-btn"
        onClick={onToggleVideoPanel}
        disabled={isLeaving}
        title={isVideoPanelOpen ? "Minimize video panel" : "Expand video panel"}
        className={`flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-800 text-zinc-300 transition hover:bg-zinc-700 disabled:opacity-50`}
      >
        {isVideoPanelOpen ? (
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        ) : (
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
        )}
      </button>

      <div className="h-4 w-px bg-zinc-700/60" />

      {/* Leave Meeting Button */}
      <button
        type="button"
        id="meeting-leave-btn"
        onClick={onLeave}
        disabled={isLeaving}
        title="Leave meeting"
        className="flex items-center gap-1.5 rounded-xl bg-red-600 px-3.5 py-2 text-xs font-semibold text-white shadow transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z"
          />
        </svg>
        <span>{isLeaving ? "Leaving…" : "Leave"}</span>
      </button>
    </div>
  );
}
