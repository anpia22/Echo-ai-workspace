"use client";

import {
  acquireUserMedia,
  acquireDisplayMedia,
  createDefaultRtcConfiguration,
  releaseMediaStream,
  stopAllTracks,
} from "./mediaLifecycle";
import {
  buildAnswerPayload,
  buildIceCandidatePayload,
  buildOfferPayload,
  parseMeetingLeavePayload,
  parseWebRTCIceCandidatePayload,
  parseWebRTCAnswerPayload,
  parseWebRTCOfferPayload,
  type MeetingSignalingEnvelope,
} from "./meetingSignals";
import type {
  MeetingPeerConnectionState,
  ParticipantMediaState,
} from "./meetingTypes";

export type MeetingRuntimeCallbacks = {
  onLocalStream?: (stream: MediaStream | null) => void;
  onRemoteStream?: (peerId: string, stream: MediaStream) => void;
  onRemoteStreamRemoved?: (peerId: string) => void;
  onPeerStateChange?: (
    peerId: string,
    state: MeetingPeerConnectionState
  ) => void;
  onParticipantMediaState?: (state: ParticipantMediaState) => void;
  onError?: (error: Error) => void;
  onSignal?: (payload: MeetingSignalingEnvelope) => void;
  onScreenShareEnded?: () => void;
  onMediaDeviceError?: (device: "audio" | "video", message: string) => void;
  onLocalTrackEnded?: (kind: "audio" | "video") => void;
};

type PeerEntry = {
  peerId: string;
  generation: number;
  connection: RTCPeerConnection;
  remoteStream: MediaStream;
  makingOffer: boolean;
  handlingOffer: boolean;
  ignoreOffer: boolean;
  pendingCandidates: RTCIceCandidateInit[];
  processedCandidates: Set<string>;
  iceRestartCount: number;
  recoveryAttemptCount: number;
  isRecovering: boolean;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
  recoveryTimer: ReturnType<typeof setTimeout> | null;
};

export type MeetingRuntimeOptions = {
  roomId: string;
  localUserId: string;
  displayName: string;
  color: string;
  callbacks?: MeetingRuntimeCallbacks;
};

export class MeetingRuntime {
  private readonly roomId: string;
  private readonly localUserId: string;
  private readonly displayName: string;
  private readonly color: string;

  private readonly callbacks: MeetingRuntimeCallbacks;

  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private isScreenSharingActive = false;

  private peers = new Map<string, PeerEntry>();
  private pendingEarlyCandidates = new Map<string, RTCIceCandidateInit[]>();
  private connectingPeers = new Set<string>();

  private micEnabled = true;
  private cameraEnabled = true;

  private started = false;

  constructor(options: MeetingRuntimeOptions) {
    this.roomId = options.roomId;
    this.localUserId = options.localUserId;
    this.displayName = options.displayName;
    this.color = options.color;
    this.callbacks = options.callbacks ?? {};
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getScreenStream(): MediaStream | null {
    return this.screenStream;
  }

  isScreenSharing(): boolean {
    return this.isScreenSharingActive;
  }

  getPeerIds(): string[] {
    return Array.from(this.peers.keys());
  }

  getPeerConnection(peerId: string): RTCPeerConnection | null {
    return this.peers.get(peerId)?.connection ?? null;
  }

  getPeerGeneration(peerId: string): number | null {
    return this.peers.get(peerId)?.generation ?? null;
  }

  isPeerRecovering(peerId: string): boolean {
    return this.peers.get(peerId)?.isRecovering ?? false;
  }

  getPeerStream(peerId: string): MediaStream | null {
    return this.peers.get(peerId)?.remoteStream ?? null;
  }

  async restartIce(peerId: string): Promise<void> {
    const entry = this.peers.get(peerId);
    if (!entry || entry.connection.connectionState === "closed") return;
    await this.createOffer(peerId, { iceRestart: true });
  }

  getProcessedCandidateCount(peerId: string): number {
    return this.peers.get(peerId)?.processedCandidates.size ?? 0;
  }

  async start(): Promise<MediaStream> {
    if (this.started && this.localStream) {
      return this.localStream;
    }

    let audioStream: MediaStream | null = null;
    let videoStream: MediaStream | null = null;
    let audioErrMessage: string | null = null;
    let videoErrMessage: string | null = null;

    try {
      this.localStream = await acquireUserMedia({
        audio: true,
        video: true,
      });
    } catch (err) {
      console.warn(
        `[WebRTC:${this.localUserId}] Dual media acquisition failed, trying fallback:`,
        err
      );
      // Try audio alone
      try {
        audioStream = await acquireUserMedia({ audio: true, video: false });
      } catch (aErr) {
        audioErrMessage =
          aErr instanceof Error ? aErr.message : "Microphone access failed.";
      }

      // Try video alone
      try {
        videoStream = await acquireUserMedia({ audio: false, video: true });
      } catch (vErr) {
        videoErrMessage =
          vErr instanceof Error ? vErr.message : "Camera access failed.";
      }

      if (audioStream && videoStream) {
        const combined = new MediaStream();
        audioStream.getAudioTracks().forEach((t) => combined.addTrack(t));
        videoStream.getVideoTracks().forEach((t) => combined.addTrack(t));
        this.localStream = combined;
      } else if (audioStream) {
        this.localStream = audioStream;
        this.cameraEnabled = false;
        videoErrMessage =
          videoErrMessage ||
          (err instanceof Error ? err.message : "Camera access failed.");
      } else if (videoStream) {
        this.localStream = videoStream;
        this.micEnabled = false;
        audioErrMessage =
          audioErrMessage ||
          (err instanceof Error ? err.message : "Microphone access failed.");
      } else {
        const normalized =
          err instanceof Error
            ? err
            : new Error("Unable to access camera or microphone.");
        this.callbacks.onMediaDeviceError?.(
          "audio",
          audioErrMessage || normalized.message
        );
        this.callbacks.onMediaDeviceError?.(
          "video",
          videoErrMessage || normalized.message
        );
        this.callbacks.onError?.(normalized);
        throw normalized;
      }
    }

    this.started = true;

    if (audioErrMessage) {
      this.callbacks.onMediaDeviceError?.("audio", audioErrMessage);
    }
    if (videoErrMessage) {
      this.callbacks.onMediaDeviceError?.("video", videoErrMessage);
    }

    this.setLocalTrackEnabled("audio", this.micEnabled);
    this.setLocalTrackEnabled("video", this.cameraEnabled);

    // Attach track.onended listeners for unexpected device failures
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.onended = () => {
        console.log(`[WebRTC:${this.localUserId}] Audio track ended`);
        this.micEnabled = false;
        this.callbacks.onLocalTrackEnded?.("audio");
      };
    }

    const cameraTrack = this.localStream.getVideoTracks()[0];
    if (cameraTrack) {
      cameraTrack.onended = () => {
        console.log(`[WebRTC:${this.localUserId}] Camera track ended`);
        this.cameraEnabled = false;
        this.callbacks.onLocalTrackEnded?.("video");
      };
    }

    this.callbacks.onLocalStream?.(this.localStream);

    return this.localStream;
  }

  async addPeer(
    peerId: string,
    shouldCreateOffer: boolean
  ): Promise<void> {
    if (!peerId || peerId === this.localUserId) {
      return;
    }

    if (!this.localStream) {
      await this.start();
    }

    if (this.peers.has(peerId) || this.connectingPeers.has(peerId)) {
      if (shouldCreateOffer && this.peers.has(peerId)) {
        await this.createOffer(peerId);
      }
      return;
    }

    this.connectingPeers.add(peerId);

    try {
      const connection = new RTCPeerConnection(
        createDefaultRtcConfiguration()
      );

      const remoteStream = new MediaStream();

      const earlyCandidates =
        this.pendingEarlyCandidates.get(peerId) ?? [];
      this.pendingEarlyCandidates.delete(peerId);

      const entry: PeerEntry = {
        peerId,
        generation: 1,
        connection,
        remoteStream,
        makingOffer: false,
        handlingOffer: false,
        ignoreOffer: false,
        pendingCandidates: earlyCandidates,
        processedCandidates: new Set(),
        iceRestartCount: 0,
        recoveryAttemptCount: 0,
        isRecovering: false,
        disconnectTimer: null,
        recoveryTimer: null,
      };

      this.peers.set(peerId, entry);

      this.attachPeerHandlers(entry);

      for (const track of this.localStream?.getTracks() ?? []) {
        if (track.kind === "video" && this.isScreenSharingActive && this.screenStream) {
          const screenVideoTrack = this.screenStream.getVideoTracks()[0];
          if (screenVideoTrack) {
            connection.addTrack(screenVideoTrack, this.screenStream);
            continue;
          }
        }
        connection.addTrack(track, this.localStream!);
      }

      this.callbacks.onPeerStateChange?.(peerId, "connecting");

      if (shouldCreateOffer) {
        await this.createOffer(peerId);
      }
    } finally {
      this.connectingPeers.delete(peerId);
    }
  }

  async removePeer(peerId: string): Promise<void> {
    this.connectingPeers.delete(peerId);
    const entry = this.peers.get(peerId);

    if (!entry) {
      return;
    }

    if (entry.disconnectTimer) {
      clearTimeout(entry.disconnectTimer);
      entry.disconnectTimer = null;
    }
    if (entry.recoveryTimer) {
      clearTimeout(entry.recoveryTimer);
      entry.recoveryTimer = null;
    }
    entry.isRecovering = false;

    this.peers.delete(peerId);
    this.pendingEarlyCandidates.delete(peerId);
    entry.pendingCandidates = [];
    entry.processedCandidates.clear();

    this.cleanupPeerConnection(entry.connection);

    this.callbacks.onRemoteStreamRemoved?.(peerId);
    this.callbacks.onPeerStateChange?.(peerId, "closed");
  }

  async handleSignal(payload: unknown): Promise<void> {
    const offer = parseWebRTCOfferPayload(
      payload,
      this.roomId,
      this.localUserId
    );

    if (offer) {
      await this.handleOffer(offer);
      return;
    }

    const answer = parseWebRTCAnswerPayload(
      payload,
      this.roomId,
      this.localUserId
    );

    if (answer) {
      await this.handleAnswer(answer);
      return;
    }

    const ice = parseWebRTCIceCandidatePayload(
      payload,
      this.roomId,
      this.localUserId
    );

    if (ice) {
      await this.handleIceCandidate(ice);
      return;
    }

    const leave = parseMeetingLeavePayload(
      payload,
      this.roomId,
      this.localUserId
    );

    if (leave) {
      await this.removePeer(leave.senderId);
    }
  }

  async createOffer(peerId: string, options?: RTCOfferOptions): Promise<void> {
    const entry = this.peers.get(peerId);

    if (!entry) {
      return;
    }

    if (entry.connection.signalingState === "closed") {
      return;
    }

    if (
      entry.connection.signalingState === "have-local-offer" &&
      !options?.iceRestart
    ) {
      if (entry.connection.localDescription) {
        console.log(
          `[WebRTC:${this.localUserId}] Re-sending existing local offer to ${peerId}`
        );
        this.callbacks.onSignal?.(
          buildOfferPayload(
            this.roomId,
            this.localUserId,
            peerId,
            entry.connection.localDescription.sdp,
            entry.generation
          )
        );
      }
      return;
    }

    if (entry.makingOffer) {
      return;
    }

    try {
      entry.makingOffer = true;
      console.log(
        `[WebRTC:${this.localUserId}] Creating offer for ${peerId} (iceRestart=${Boolean(
          options?.iceRestart
        )}, gen=${entry.generation})`
      );

      const offer = await entry.connection.createOffer(options);

      await entry.connection.setLocalDescription(offer);

      const localDescription = entry.connection.localDescription;

      if (!localDescription) {
        return;
      }

      console.log(
        `[WebRTC:${this.localUserId}] Sending offer to ${peerId} (gen=${entry.generation})`
      );
      this.callbacks.onSignal?.(
        buildOfferPayload(
          this.roomId,
          this.localUserId,
          peerId,
          localDescription.sdp,
          entry.generation
        )
      );
    } catch (error) {
      console.error(`[WebRTC:${this.localUserId}] Error creating offer:`, error);
      this.reportError(error);
    } finally {
      entry.makingOffer = false;
    }
  }

  setMicEnabled(enabled: boolean): void {
    this.micEnabled = enabled;
    this.setLocalTrackEnabled("audio", enabled);
  }

  setCameraEnabled(enabled: boolean): void {
    this.cameraEnabled = enabled;
    this.setLocalTrackEnabled("video", enabled);
  }

  isMicEnabled(): boolean {
    return this.micEnabled;
  }

  isCameraEnabled(): boolean {
    return this.cameraEnabled;
  }

  async startScreenShare(): Promise<MediaStream> {
    if (this.isScreenSharingActive && this.screenStream) {
      return this.screenStream;
    }

    const result = await acquireDisplayMedia({ video: true, audio: false });
    if (result.error || !result.stream) {
      const err = new Error(
        result.error?.message || "Failed to start screen sharing."
      );
      err.name = result.error?.name || "AcquireDisplayMediaError";
      throw err;
    }

    const screenStream = result.stream;
    const screenVideoTrack = screenStream.getVideoTracks()[0];
    if (!screenVideoTrack) {
      stopAllTracks(screenStream);
      throw new Error("No video track found in screen capture.");
    }

    this.screenStream = screenStream;
    this.isScreenSharingActive = true;

    // Listen for native browser "Stop sharing" event
    screenVideoTrack.onended = () => {
      console.log(`[WebRTC:${this.localUserId}] Native screen share ended`);
      void (async () => {
        await this.stopScreenShare();
        this.callbacks.onScreenShareEnded?.();
      })();
    };

    // Replace camera video track on all existing peer connections
    const cameraTrack = this.localStream?.getVideoTracks()[0] ?? null;
    for (const entry of this.peers.values()) {
      const senders = entry.connection.getSenders();
      const videoSender = senders.find(
        (s) => s.track?.kind === "video" || (cameraTrack && s.track === cameraTrack)
      );
      if (videoSender) {
        try {
          await videoSender.replaceTrack(screenVideoTrack);
        } catch (error) {
          console.error(
            `[WebRTC:${this.localUserId}] Error replacing track for peer ${entry.peerId}:`,
            error
          );
        }
      }
    }

    return screenStream;
  }

  async stopScreenShare(): Promise<void> {
    if (!this.isScreenSharingActive && !this.screenStream) {
      return;
    }

    this.isScreenSharingActive = false;

    // Restore camera video track on all existing peer connections
    const cameraTrack = this.localStream?.getVideoTracks()[0] ?? null;
    if (cameraTrack) {
      // Ensure the camera track's enabled state reflects cameraEnabled setting
      cameraTrack.enabled = this.cameraEnabled;
    }

    for (const entry of this.peers.values()) {
      const senders = entry.connection.getSenders();
      const videoSender = senders.find(
        (s) =>
          s.track?.kind === "video" ||
          (this.screenStream && s.track === this.screenStream.getVideoTracks()[0])
      );
      if (videoSender) {
        try {
          await videoSender.replaceTrack(cameraTrack);
        } catch (error) {
          console.error(
            `[WebRTC:${this.localUserId}] Error restoring camera track for peer ${entry.peerId}:`,
            error
          );
        }
      }
    }

    // Stop all tracks in screenStream and clean up
    if (this.screenStream) {
      stopAllTracks(this.screenStream);
      this.screenStream = null;
    }
  }

  async stop(): Promise<void> {
    this.started = false;

    await this.stopScreenShare();

    for (const peerId of Array.from(this.peers.keys())) {
      await this.removePeer(peerId);
    }

    this.pendingEarlyCandidates.clear();

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        track.onended = null;
      }
      releaseMediaStream(this.localStream);
      this.localStream = null;
    }

    this.callbacks.onLocalStream?.(null);
  }

  private attachPeerHandlers(entry: PeerEntry): void {
    const { connection, peerId, remoteStream } = entry;

    connection.onicecandidate = (event) => {
      if (!event.candidate) {
        return;
      }

      this.callbacks.onSignal?.(
        buildIceCandidatePayload(
          this.roomId,
          this.localUserId,
          peerId,
          event.candidate.toJSON(),
          entry.generation
        )
      );
    };

    connection.ontrack = (event) => {
      console.log(`[WebRTC:${this.localUserId}] ontrack: ${event.track.kind} from ${peerId}`);
      const incomingStream = event.streams[0];

      if (incomingStream) {
        this.callbacks.onRemoteStream?.(peerId, incomingStream);
        return;
      }

      remoteStream.addTrack(event.track);
      this.callbacks.onRemoteStream?.(peerId, remoteStream);
    };

    const onSuccessfulConnection = () => {
      if (entry.disconnectTimer) {
        clearTimeout(entry.disconnectTimer);
        entry.disconnectTimer = null;
      }
      if (entry.recoveryTimer) {
        clearTimeout(entry.recoveryTimer);
        entry.recoveryTimer = null;
      }
      entry.isRecovering = false;
      entry.iceRestartCount = 0;
      entry.recoveryAttemptCount = 0;
    };

    connection.onconnectionstatechange = () => {
      console.log(`[WebRTC:${this.localUserId}] connectionStateChange: ${peerId} -> ${connection.connectionState} (ice=${connection.iceConnectionState})`);
      const state = this.mapConnectionState(connection);

      this.callbacks.onPeerStateChange?.(peerId, state);

      if (connection.connectionState === "connected") {
        onSuccessfulConnection();
      } else if (connection.connectionState === "disconnected") {
        this.handlePeerDisconnected(peerId);
      } else if (connection.connectionState === "failed") {
        this.handlePeerFailure(peerId, "connection_failed");
      } else if (connection.connectionState === "closed") {
        this.handlePeerFailure(peerId, "connection_closed");
      }
    };

    connection.oniceconnectionstatechange = () => {
      console.log(`[WebRTC:${this.localUserId}] iceConnectionStateChange: ${peerId} -> ${connection.iceConnectionState} (conn=${connection.connectionState})`);
      const state = this.mapConnectionState(connection);
      this.callbacks.onPeerStateChange?.(peerId, state);

      if (
        connection.iceConnectionState === "connected" ||
        connection.iceConnectionState === "completed"
      ) {
        onSuccessfulConnection();
      } else if (connection.iceConnectionState === "disconnected") {
        this.handlePeerDisconnected(peerId);
      } else if (connection.iceConnectionState === "failed") {
        this.handlePeerFailure(peerId, "ice_failed");
      } else if (connection.iceConnectionState === "closed") {
        this.handlePeerFailure(peerId, "ice_closed");
      }
    };

    connection.onsignalingstatechange = () => {
      console.log(`[WebRTC:${this.localUserId}] signalingStateChange: ${peerId} -> ${connection.signalingState}`);
      if (connection.signalingState === "closed") {
        this.handlePeerFailure(peerId, "signaling_closed");
      }
    };
  }

  private handlePeerDisconnected(peerId: string): void {
    const entry = this.peers.get(peerId);
    if (!entry || entry.isRecovering || entry.disconnectTimer) {
      return;
    }

    console.log(
      `[WebRTC:${this.localUserId}] Transient disconnect detected for ${peerId}, waiting 3s grace period...`
    );
    this.callbacks.onPeerStateChange?.(peerId, "connecting");

    entry.disconnectTimer = setTimeout(() => {
      entry.disconnectTimer = null;
      if (
        entry.connection.iceConnectionState === "disconnected" ||
        entry.connection.iceConnectionState === "failed" ||
        entry.connection.connectionState === "disconnected" ||
        entry.connection.connectionState === "failed"
      ) {
        console.warn(
          `[WebRTC:${this.localUserId}] Disconnect grace period expired for ${peerId}, initiating recovery`
        );
        this.handlePeerFailure(peerId, "sustained_disconnect");
      }
    }, 3000);
  }

  private handlePeerFailure(peerId: string, reason: string): void {
    if (!this.started) return;
    const entry = this.peers.get(peerId);
    if (!entry) return;

    if (entry.isRecovering) {
      return;
    }

    console.warn(
      `[WebRTC:${this.localUserId}] Handling peer failure for ${peerId} (reason: ${reason}, restarts: ${entry.iceRestartCount}, recoveries: ${entry.recoveryAttemptCount})`
    );

    entry.isRecovering = true;
    if (entry.disconnectTimer) {
      clearTimeout(entry.disconnectTimer);
      entry.disconnectTimer = null;
    }
    if (entry.recoveryTimer) {
      clearTimeout(entry.recoveryTimer);
      entry.recoveryTimer = null;
    }

    // Step 1: Attempt ICE Restart if within retry limits and connection is not closed
    if (
      entry.iceRestartCount < 2 &&
      entry.connection.signalingState !== "closed" &&
      entry.connection.connectionState !== "closed"
    ) {
      entry.iceRestartCount++;

      // Deterministic recovery offerer rule: smaller userId initiates ICE restart offer
      if (this.localUserId < peerId) {
        console.log(
          `[WebRTC:${this.localUserId}] Deterministic offerer initiating ICE restart (${entry.iceRestartCount}/2) for ${peerId}`
        );
        void this.createOffer(peerId, { iceRestart: true });

        // Watchdog: If connection is still not reconnected after 4000ms, escalate to peer recreation
        entry.recoveryTimer = setTimeout(() => {
          entry.recoveryTimer = null;
          if (
            entry.connection.iceConnectionState !== "connected" &&
            entry.connection.iceConnectionState !== "completed" &&
            entry.connection.connectionState !== "connected"
          ) {
            console.warn(
              `[WebRTC:${this.localUserId}] ICE restart watchdog timed out for ${peerId}, escalating to recreation`
            );
            entry.isRecovering = false;
            void this.recreatePeer(peerId);
          } else {
            entry.isRecovering = false;
          }
        }, 4000);
        return;
      } else {
        console.log(
          `[WebRTC:${this.localUserId}] Answerer waiting for remote peer ${peerId} to initiate ICE restart...`
        );
        entry.recoveryTimer = setTimeout(() => {
          entry.recoveryTimer = null;
          if (
            entry.connection.iceConnectionState !== "connected" &&
            entry.connection.iceConnectionState !== "completed" &&
            entry.connection.connectionState !== "connected"
          ) {
            console.warn(
              `[WebRTC:${this.localUserId}] Answerer wait timed out for ${peerId}, escalating to recreation`
            );
            entry.isRecovering = false;
            void this.recreatePeer(peerId, true);
          } else {
            entry.isRecovering = false;
          }
        }, 5000);
        return;
      }
    }

    // Step 2: Escalate to Peer Connection recreation
    entry.isRecovering = false;
    void this.recreatePeer(peerId);
  }

  private async recreatePeer(
    peerId: string,
    forceOffer: boolean = false,
    targetGeneration?: number
  ): Promise<void> {
    if (!this.started) return;
    const entry = this.peers.get(peerId);
    if (!entry) return;

    if (entry.recoveryAttemptCount >= 3) {
      console.error(
        `[WebRTC:${this.localUserId}] Max connection recovery attempts (3) exceeded for ${peerId}. Marking as failed.`
      );
      this.cleanupPeerConnection(entry.connection);
      this.callbacks.onPeerStateChange?.(peerId, "failed");
      return;
    }

    entry.recoveryAttemptCount++;
    const nextGen = targetGeneration ?? (entry.generation + 1);
    console.log(
      `[WebRTC:${this.localUserId}] Recreating peer connection (${entry.recoveryAttemptCount}/3) for ${peerId}, next gen: ${nextGen}`
    );

    // Cleanly tear down old connection
    this.cleanupPeerConnection(entry.connection);

    if (entry.disconnectTimer) {
      clearTimeout(entry.disconnectTimer);
      entry.disconnectTimer = null;
    }
    if (entry.recoveryTimer) {
      clearTimeout(entry.recoveryTimer);
      entry.recoveryTimer = null;
    }

    const newConnection = new RTCPeerConnection(
      createDefaultRtcConfiguration()
    );
    const newRemoteStream = new MediaStream();

    entry.connection = newConnection;
    entry.remoteStream = newRemoteStream;
    entry.generation = nextGen;
    entry.makingOffer = false;
    entry.handlingOffer = false;
    entry.ignoreOffer = false;
    entry.pendingCandidates = [];
    entry.processedCandidates.clear();
    entry.isRecovering = false;

    this.attachPeerHandlers(entry);

    // Reattach current local tracks:
    // Respect active screen sharing and camera/mic enabled state!
    for (const track of this.localStream?.getTracks() ?? []) {
      if (track.kind === "video") {
        if (this.isScreenSharingActive && this.screenStream) {
          const screenVideoTrack = this.screenStream.getVideoTracks()[0];
          if (screenVideoTrack) {
            newConnection.addTrack(screenVideoTrack, this.screenStream);
            continue;
          }
        }
        track.enabled = this.cameraEnabled;
        newConnection.addTrack(track, this.localStream!);
      } else if (track.kind === "audio") {
        track.enabled = this.micEnabled;
        newConnection.addTrack(track, this.localStream!);
      }
    }

    this.callbacks.onRemoteStream?.(peerId, newRemoteStream);
    this.callbacks.onPeerStateChange?.(peerId, "connecting");

    // Deterministic offerer initiates fresh offer (or forceOffer if remote offer timed out)
    if (this.localUserId < peerId || forceOffer) {
      await this.createOffer(peerId);
    }
  }

  private async handleOffer(
    payload: Extract<MeetingSignalingEnvelope, { type: "webrtc:offer" }>
  ): Promise<void> {
    await this.addPeer(payload.senderId, false);

    const entry = this.peers.get(payload.senderId);

    if (!entry) {
      return;
    }

    // Stale generation rejection
    if (
      payload.generation !== undefined &&
      payload.generation < entry.generation
    ) {
      console.log(
        `[WebRTC:${this.localUserId}] Rejecting stale offer from ${payload.senderId} (signal gen=${payload.generation} < peer gen=${entry.generation})`
      );
      return;
    }

    // Advance peer connection if incoming offer has newer generation or if local connection is closed
    if (
      (payload.generation !== undefined && payload.generation > entry.generation) ||
      entry.connection.connectionState === "closed" ||
      entry.connection.signalingState === "closed"
    ) {
      console.log(
        `[WebRTC:${this.localUserId}] Incoming offer requires fresh connection (remote gen=${payload.generation}, local gen=${entry.generation}, connState=${entry.connection.connectionState}). Advancing...`
      );
      await this.recreatePeer(payload.senderId, false, payload.generation);
    }

    if (entry.handlingOffer) {
      return;
    }

    const connection = entry.connection;
    const sdpString = typeof payload.sdp === "string" ? payload.sdp : payload.sdp.sdp;

    if (
      connection.signalingState === "stable" &&
      connection.remoteDescription?.sdp === sdpString
    ) {
      console.log(
        `[WebRTC:${this.localUserId}] Duplicate offer from ${payload.senderId} already applied. Re-sending answer.`
      );
      if (connection.localDescription) {
        this.callbacks.onSignal?.(
          buildAnswerPayload(
            this.roomId,
            this.localUserId,
            payload.senderId,
            connection.localDescription.sdp,
            entry.generation
          )
        );
      }
      return;
    }

    entry.handlingOffer = true;
    console.log(`[WebRTC:${this.localUserId}] handleOffer from ${payload.senderId}, state=${connection.signalingState} (gen=${payload.generation ?? 1})`);

    try {
      // Offer collision handling (Perfect Negotiation pattern)
      if (connection.signalingState !== "stable") {
        const isPolite = this.localUserId > payload.senderId;
        console.log(`[WebRTC:${this.localUserId}] Offer collision with ${payload.senderId}. isPolite=${isPolite}`);
        if (!isPolite) {
          // Impolite peer ignores incoming offer
          return;
        }
        // Polite peer rolls back local offer to accept incoming offer
        await connection.setLocalDescription({ type: "rollback" });
      }

      const sessionDesc: RTCSessionDescriptionInit =
        typeof payload.sdp === "string"
          ? { type: "offer", sdp: payload.sdp }
          : payload.sdp;

      await connection.setRemoteDescription(sessionDesc);
      await this.flushPendingCandidates(entry);

      const answer = await connection.createAnswer();

      await connection.setLocalDescription(answer);

      const localDescription = connection.localDescription;

      if (!localDescription) {
        return;
      }

      console.log(`[WebRTC:${this.localUserId}] Sending answer to ${payload.senderId} (gen=${entry.generation})`);
      this.callbacks.onSignal?.(
        buildAnswerPayload(
          this.roomId,
          this.localUserId,
          payload.senderId,
          localDescription.sdp,
          entry.generation
        )
      );
    } catch (error) {
      console.warn(`[WebRTC:${this.localUserId}] Non-fatal error handling offer:`, error);
    } finally {
      entry.handlingOffer = false;
    }
  }

  private async handleAnswer(
    payload: Extract<MeetingSignalingEnvelope, { type: "webrtc:answer" }>
  ): Promise<void> {
    const entry = this.peers.get(payload.senderId);

    if (!entry) {
      return;
    }

    // Stale generation rejection
    if (
      payload.generation !== undefined &&
      payload.generation < entry.generation
    ) {
      console.log(
        `[WebRTC:${this.localUserId}] Rejecting stale answer from ${payload.senderId} (signal gen=${payload.generation} < peer gen=${entry.generation})`
      );
      return;
    }

    console.log(`[WebRTC:${this.localUserId}] handleAnswer from ${payload.senderId}, state=${entry.connection.signalingState} (gen=${payload.generation ?? 1})`);
    try {
      if (entry.connection.signalingState !== "have-local-offer") {
        console.warn(`[WebRTC:${this.localUserId}] Received answer from ${payload.senderId} in unexpected state: ${entry.connection.signalingState}`);
        return;
      }

      const sessionDesc: RTCSessionDescriptionInit =
        typeof payload.sdp === "string"
          ? { type: "answer", sdp: payload.sdp }
          : payload.sdp;

      await entry.connection.setRemoteDescription(sessionDesc);
      await this.flushPendingCandidates(entry);
      console.log(`[WebRTC:${this.localUserId}] Remote description (answer) set successfully for ${payload.senderId}`);
    } catch (error) {
      console.warn(`[WebRTC:${this.localUserId}] Non-fatal error handling answer:`, error);
    }
  }

  private async handleIceCandidate(
    payload: Extract<
      MeetingSignalingEnvelope,
      { type: "webrtc:ice-candidate" }
    >
  ): Promise<void> {
    const entry = this.peers.get(payload.senderId);

    if (!entry) {
      const early =
        this.pendingEarlyCandidates.get(payload.senderId) ?? [];
      early.push(payload.candidate);
      this.pendingEarlyCandidates.set(payload.senderId, early);
      return;
    }

    // Stale generation rejection
    if (
      payload.generation !== undefined &&
      payload.generation < entry.generation
    ) {
      console.log(
        `[WebRTC:${this.localUserId}] Rejecting stale ICE candidate from ${payload.senderId} (signal gen=${payload.generation} < peer gen=${entry.generation})`
      );
      return;
    }

    // Deduplication
    const candidateKey = `${payload.candidate.candidate}|${payload.candidate.sdpMid}|${payload.candidate.sdpMLineIndex}`;
    if (entry.processedCandidates.has(candidateKey)) {
      return;
    }
    entry.processedCandidates.add(candidateKey);

    if (
      !entry.connection.remoteDescription ||
      !entry.connection.remoteDescription.type
    ) {
      entry.pendingCandidates.push(payload.candidate);
      return;
    }

    try {
      await entry.connection.addIceCandidate(payload.candidate);
    } catch (error) {
      this.reportError(error);
    }
  }

  private async flushPendingCandidates(entry: PeerEntry): Promise<void> {
    if (
      !entry.connection.remoteDescription ||
      entry.pendingCandidates.length === 0
    ) {
      return;
    }

    const queued = [...entry.pendingCandidates];
    entry.pendingCandidates = [];

    for (const candidate of queued) {
      try {
        await entry.connection.addIceCandidate(candidate);
      } catch (error) {
        this.reportError(error);
      }
    }
  }

  private setLocalTrackEnabled(
    kind: "audio" | "video",
    enabled: boolean
  ): void {
    if (!this.localStream) {
      return;
    }

    for (const track of this.localStream.getTracks()) {
      if (track.kind === kind) {
        track.enabled = enabled;
      }
    }
  }

  private cleanupPeerConnection(connection: RTCPeerConnection): void {
    connection.onicecandidate = null;
    connection.ontrack = null;
    connection.onconnectionstatechange = null;
    connection.onsignalingstatechange = null;
    connection.oniceconnectionstatechange = null;

    if (connection.signalingState !== "closed") {
      try {
        connection.close();
      } catch {
        // Ignore already-closing connections.
      }
    }
  }

  private mapConnectionState(
    connection: RTCPeerConnection
  ): MeetingPeerConnectionState {
    if (
      connection.connectionState === "connected" ||
      connection.iceConnectionState === "connected" ||
      connection.iceConnectionState === "completed"
    ) {
      return "connected";
    }

    if (
      connection.connectionState === "failed" ||
      connection.iceConnectionState === "failed"
    ) {
      return "failed";
    }

    if (
      connection.connectionState === "closed" ||
      connection.iceConnectionState === "closed"
    ) {
      return "closed";
    }

    if (
      connection.connectionState === "connecting" ||
      connection.iceConnectionState === "checking"
    ) {
      return "connecting";
    }

    return "idle";
  }

  private reportError(error: unknown): void {
    const normalized =
      error instanceof Error
        ? error
        : new Error("WebRTC operation failed.");

    this.callbacks.onError?.(normalized);
  }
}
