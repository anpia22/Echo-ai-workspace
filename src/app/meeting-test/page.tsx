"use client";

import { Suspense, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { useRoomChannel } from "../lib/collaboration/useRoomChannel";
import { useMeeting } from "../lib/collaboration/meeting";
import { createCanvasSnapshot } from "../lib/collaboration/canvasSnapshot";

function MeetingTestContent() {
  const searchParams = useSearchParams();
  const roomId = searchParams.get("room") || "test-room-phase12";
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  const meetingHandleSignalRef = useRef<
    ((payload: unknown) => Promise<void>) | null
  >(null);

  const roomConnection = useRoomChannel(roomId, {
    getSnapshot: () => createCanvasSnapshot({ nodes: [], edges: [], groups: [] }),
    onRemoteSnapshot: () => {},
    onMeetingSignal: (payload) => {
      void meetingHandleSignalRef.current?.(payload);
    },
  });

  const broadcastMeetingSignalRef = useRef(roomConnection.broadcastMeetingSignal);
  useEffect(() => {
    broadcastMeetingSignalRef.current = roomConnection.broadcastMeetingSignal;
  }, [roomConnection.broadcastMeetingSignal]);

  const meeting = useMeeting({
    roomId,
    userId: roomConnection.currentParticipant?.userId ?? null,
    displayName: roomConnection.currentParticipant?.displayName ?? "Guest",
    color: roomConnection.currentParticipant?.color ?? "#6366f1",
    broadcastSignal: (payload) => {
      broadcastMeetingSignalRef.current(payload);
    },
  });

  useEffect(() => {
    meetingHandleSignalRef.current = meeting.handleSignal;
  }, [meeting.handleSignal]);

  const { meeting: meetingDomainState, syncPeers: meetingSyncPeers } = meeting;

  useEffect(() => {
    if (meetingDomainState.status !== "in-meeting") return;

    void meetingSyncPeers(
      roomConnection.participants.map((participant) => ({
        userId: participant.userId,
        displayName: participant.displayName,
        color: participant.color,
      }))
    );
  }, [
    meetingDomainState.status,
    meetingSyncPeers,
    roomConnection.participants,
  ]);

  // Attach local media stream to video preview
  useEffect(() => {
    if (localVideoRef.current && meeting.localStream) {
      localVideoRef.current.srcObject = meeting.localStream;
    } else if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
  }, [meeting.localStream]);

  // Expose test controls on window for Playwright / automated tests
  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as unknown as Record<string, unknown>).__echoMeetingTest = {
        startMeeting: meeting.startMeeting,
        leaveMeeting: meeting.leaveMeeting,
        setMicEnabled: meeting.setMicEnabled,
        setCameraEnabled: meeting.setCameraEnabled,
        syncPeers: () =>
          meeting.syncPeers(
            roomConnection.participants.map((p) => ({
              userId: p.userId,
              displayName: p.displayName,
              color: p.color,
            }))
          ),
        getStatus: () => ({
          status: meeting.meeting.status,
          localUserId: roomConnection.currentParticipant?.userId,
          presenceCount: roomConnection.participants.length,
          peersCount: meeting.meeting.participants.size,
          remoteStreamsCount: meeting.remoteStreams.size,
          isMicEnabled: meeting.isMicEnabled,
          isCameraEnabled: meeting.isCameraEnabled,
          hasLocalStream: Boolean(meeting.localStream),
          participants: Array.from(meeting.meeting.participants.entries()).map(
            ([id, p]) => ({
              id,
              audio: p.audioState,
              video: p.videoState,
              connection: p.connectionState,
            })
          ),
          remoteStreamIds: Array.from(meeting.remoteStreams.keys()),
        }),
      };
    }
  }, [meeting, roomConnection]);

  const participantsList = useMemo(
    () => Array.from(meeting.meeting.participants.values()),
    [meeting.meeting.participants]
  );

  const remoteStreamEntries = useMemo(
    () => Array.from(meeting.remoteStreams.entries()),
    [meeting.remoteStreams]
  );

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 bg-zinc-900 text-white min-h-screen">
      <div className="border border-zinc-700 p-4 rounded-lg space-y-2">
        <h1 className="text-xl font-bold text-indigo-400">
          Phase 12.2-D WebRTC Mesh Test Harness (Dev Only)
        </h1>
        <div className="grid grid-cols-2 gap-4 text-sm font-mono">
          <div>Room: <span id="test-room-id">{roomId}</span></div>
          <div>User: <span id="test-user-id">{roomConnection.currentParticipant?.userId ?? "none"}</span></div>
          <div>Connection State: <span id="room-connection-state">{roomConnection.state}</span></div>
          <div>Meeting Status: <span id="meeting-status" className="font-bold text-amber-400">{meeting.meeting.status}</span></div>
          <div>Local Mic: <span id="local-mic-status">{meeting.isMicEnabled ? "on" : "off"}</span></div>
          <div>Local Camera: <span id="local-camera-status">{meeting.isCameraEnabled ? "on" : "off"}</span></div>
          <div>Remote Peers: <span id="remote-peers-count">{participantsList.length}</span></div>
          <div>Remote Streams: <span id="remote-streams-count">{remoteStreamEntries.length}</span></div>
        </div>
      </div>

      <div className="flex gap-4">
        <button
          id="start-meeting-btn"
          onClick={() => void meeting.startMeeting()}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded font-semibold"
        >
          Start Meeting
        </button>

        <button
          id="leave-meeting-btn"
          onClick={() => void meeting.leaveMeeting()}
          className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded font-semibold"
        >
          Leave Meeting
        </button>

        <button
          id="toggle-mic-btn"
          onClick={() => meeting.setMicEnabled(!meeting.isMicEnabled)}
          className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded font-semibold"
        >
          Toggle Mic ({meeting.isMicEnabled ? "ON" : "OFF"})
        </button>

        <button
          id="toggle-camera-btn"
          onClick={() => meeting.setCameraEnabled(!meeting.isCameraEnabled)}
          className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded font-semibold"
        >
          Toggle Camera ({meeting.isCameraEnabled ? "ON" : "OFF"})
        </button>
      </div>

      {/* Local Video Stream Preview */}
      <div className="border border-zinc-800 p-4 rounded-lg">
        <h2 className="text-sm font-semibold mb-2 text-zinc-400">Local Stream Preview</h2>
        <video
          id="local-video"
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="w-64 h-48 bg-black rounded border border-zinc-700 object-cover"
        />
      </div>

      {/* Remote Video Streams */}
      <div className="border border-zinc-800 p-4 rounded-lg">
        <h2 className="text-sm font-semibold mb-2 text-zinc-400">Remote Streams ({remoteStreamEntries.length})</h2>
        <div id="remote-streams-container" className="grid grid-cols-2 gap-4">
          {remoteStreamEntries.map(([peerId, stream]) => (
            <RemoteVideo key={peerId} peerId={peerId} stream={stream} />
          ))}
        </div>
      </div>

      {/* Participants State List */}
      <div className="border border-zinc-800 p-4 rounded-lg">
        <h2 className="text-sm font-semibold mb-2 text-zinc-400">Participants State</h2>
        <div id="participants-list" className="space-y-2 font-mono text-xs">
          {participantsList.map((p) => (
            <div key={p.userId} id={`participant-${p.userId}`} className="p-2 bg-zinc-800 rounded">
              <span className="font-bold text-indigo-400">{p.displayName} ({p.userId.slice(-6)})</span>:{" "}
              State: {p.connectionState} | Mic: {p.audioState.isMuted ? "MUTED" : "UNMUTED"} | Video: {p.videoState.isVideoOn ? "ON" : "OFF"}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RemoteVideo({ peerId, stream }: { peerId: string; stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="space-y-1">
      <div className="text-xs font-mono text-zinc-400">Peer: {peerId.slice(-6)}</div>
      <video
        id={`remote-video-${peerId}`}
        ref={videoRef}
        autoPlay
        playsInline
        className="w-64 h-48 bg-black rounded border border-zinc-700 object-cover"
      />
    </div>
  );
}

function MeetingTestWrapper() {
  const searchParams = useSearchParams();
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  if (!isClient) {
    return <div className="p-6 text-white font-mono">Initializing Test Client...</div>;
  }

  const userParam = searchParams.get("user");
  if (userParam && typeof window !== "undefined") {
    const stored = sessionStorage.getItem("echo.collaboration.participant");
    const current = stored ? JSON.parse(stored) : null;
    if (!current || current.userId !== userParam) {
      sessionStorage.setItem(
        "echo.collaboration.participant",
        JSON.stringify({
          userId: userParam,
          displayName: `User ${userParam.slice(-4)}`,
          color: "#6366f1",
        })
      );
    }
  }

  return <MeetingTestContent />;
}

export default function MeetingTestPage() {
  return (
    <Suspense fallback={<div className="p-6 text-white font-mono">Loading Test Harness...</div>}>
      <MeetingTestWrapper />
    </Suspense>
  );
}
