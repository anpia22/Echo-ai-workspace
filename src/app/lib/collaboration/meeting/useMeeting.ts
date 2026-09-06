"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyMediaStateUpdate,
  buildMeetingLeavePayload,
  buildMediaStatePayload,
  parseMediaStateBroadcastPayload,
  parseMeetingLeavePayload,
  resolveActivePresenter,
  type MeetingSignalingEnvelope,
} from "./meetingSignals";
import type {
  LocalMediaState,
  MeetingState,
  MeetingPeerConnectionState,
  ParticipantMediaState,
} from "./meetingTypes";
import {
  MeetingRuntime,
  type MeetingRuntimeOptions,
} from "./meetingRuntime";

export type MeetingPresenceParticipant = {
  userId: string;
  displayName?: string;
  color?: string;
};

export type UseMeetingOptions = {
  roomId: string | null;
  userId: string | null;
  displayName?: string;
  color?: string;

  broadcastSignal?: (payload: MeetingSignalingEnvelope) => void;
};

const INITIAL_MEDIA_STATE: LocalMediaState = {
  micEnabled: true,
  cameraEnabled: true,
  screenShareEnabled: false,
  audioDeviceId: null,
  videoDeviceId: null,
  audioError: null,
  videoError: null,
  screenError: null,
};

const INITIAL_MEETING_STATE: MeetingState = {
  status: "idle",
  roomId: null,
  localMedia: INITIAL_MEDIA_STATE,
  participants: new Map(),
  activePresenterId: null,
  activeSpeakerId: null,
  error: null,
};

function createParticipant(
  userId: string,
  displayName: string,
  color: string
): ParticipantMediaState {
  return {
    userId,
    displayName,
    color,
    connectionState: "connecting",
    audioState: {
      isMuted: false,
      hasAudio: true,
      isSpeaking: false,
    },
    videoState: {
      isVideoOn: true,
      hasVideo: true,
    },
    screenShareState: {
      isSharing: false,
    },
    joinedAt: Date.now(),
  };
}

export function useMeeting(options: UseMeetingOptions) {
  const {
    roomId,
    userId,
    displayName = "Guest",
    color = "#6366f1",
    broadcastSignal,
  } = options;

  const [meeting, setMeeting] =
    useState<MeetingState>(INITIAL_MEETING_STATE);

  const [remoteStreams, setRemoteStreams] = useState<
    Map<string, MediaStream>
  >(new Map());

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);

  const runtimeRef = useRef<MeetingRuntime | null>(null);

  const broadcastSignalRef = useRef(broadcastSignal);
  const pendingPeerJoinsRef = useRef<Set<string>>(new Set());
  const isStartingScreenShareRef = useRef(false);

  const meetingRef = useRef(meeting);
  useEffect(() => {
    meetingRef.current = meeting;
  }, [meeting]);

  useEffect(() => {
    broadcastSignalRef.current = broadcastSignal;
  }, [broadcastSignal]);

  const broadcastCurrentMediaState = useCallback(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !roomId || !userId) return;

    const currentMedia = meetingRef.current.localMedia;
    broadcastSignalRef.current?.(
      buildMediaStatePayload(
        roomId,
        userId,
        {
          isMuted: !runtime.isMicEnabled(),
          hasAudio: true,
        },
        {
          isVideoOn: runtime.isCameraEnabled(),
          hasVideo: true,
        },
        {
          isSharing: currentMedia.screenShareEnabled,
        }
      )
    );
  }, [roomId, userId]);

  const updateParticipantState = useCallback(
    (
      peerId: string,
      state: MeetingPeerConnectionState
    ) => {
      setMeeting((current) => {
        const participant = current.participants.get(peerId);

        if (!participant) {
          return current;
        }

        const nextParticipants = new Map(current.participants);

        nextParticipants.set(peerId, {
          ...participant,
          connectionState: state,
        });

        return {
          ...current,
          participants: nextParticipants,
        };
      });
    },
    []
  );

  const createRuntime = useCallback(() => {
    if (!roomId || !userId) {
      return null;
    }

    const runtimeOptions: MeetingRuntimeOptions = {
      roomId,
      localUserId: userId,
      displayName,
      color,

      callbacks: {
        onLocalStream: (stream) => {
          setLocalStream(stream);
        },

        onRemoteStream: (peerId, stream) => {
          setRemoteStreams((current) => {
            const next = new Map(current);
            next.set(peerId, stream);
            return next;
          });
        },

        onRemoteStreamRemoved: (peerId) => {
          setRemoteStreams((current) => {
            if (!current.has(peerId)) {
              return current;
            }

            const next = new Map(current);
            next.delete(peerId);
            return next;
          });
        },

        onPeerStateChange: updateParticipantState,

        onError: (error) => {
          setMeeting((current) => ({
            ...current,
            status: "error",
            error: error.message,
          }));
        },

        onSignal: (payload) => {
          broadcastSignalRef.current?.(payload);
        },

        onScreenShareEnded: () => {
          console.log(`[useMeeting:${userId}] Screen sharing ended natively`);
          setScreenStream(null);
          setMeeting((current) => {
            const nextLocalMedia = {
              ...current.localMedia,
              screenShareEnabled: false,
            };
            const nextActivePresenterId = resolveActivePresenter(
              current.participants,
              false,
              userId ?? ""
            );
            return {
              ...current,
              localMedia: nextLocalMedia,
              activePresenterId: nextActivePresenterId,
            };
          });

          if (roomId && userId) {
            const runtime = runtimeRef.current;
            broadcastSignalRef.current?.(
              buildMediaStatePayload(
                roomId,
                userId,
                {
                  isMuted: runtime ? !runtime.isMicEnabled() : false,
                  hasAudio: true,
                },
                {
                  isVideoOn: runtime ? runtime.isCameraEnabled() : true,
                  hasVideo: true,
                },
                {
                  isSharing: false,
                }
              )
            );
          }
        },

        onMediaDeviceError: (device: "audio" | "video", message: string) => {
          console.warn(`[useMeeting:${userId}] Media device error (${device}):`, message);
          setMeeting((current) => ({
            ...current,
            localMedia: {
              ...current.localMedia,
              audioError: device === "audio" ? message : current.localMedia.audioError,
              videoError: device === "video" ? message : current.localMedia.videoError,
            },
          }));
        },

        onLocalTrackEnded: (kind: "audio" | "video") => {
          console.log(`[useMeeting:${userId}] Local track ended (${kind})`);
          setMeeting((current) => {
            const nextLocalMedia = {
              ...current.localMedia,
              micEnabled: kind === "audio" ? false : current.localMedia.micEnabled,
              cameraEnabled: kind === "video" ? false : current.localMedia.cameraEnabled,
            };
            return {
              ...current,
              localMedia: nextLocalMedia,
            };
          });

          if (roomId && userId) {
            const runtime = runtimeRef.current;
            broadcastSignalRef.current?.(
              buildMediaStatePayload(
                roomId,
                userId,
                {
                  isMuted: kind === "audio" ? true : (runtime ? !runtime.isMicEnabled() : false),
                  hasAudio: kind === "audio" ? false : true,
                },
                {
                  isVideoOn: kind === "video" ? false : (runtime ? runtime.isCameraEnabled() : true),
                  hasVideo: kind === "video" ? false : true,
                },
                {
                  isSharing: runtime ? runtime.isScreenSharing() : false,
                }
              )
            );
          }
        },
      },
    };

    const runtime = new MeetingRuntime(runtimeOptions);

    runtimeRef.current = runtime;

    if (typeof window !== "undefined") {
      (window as unknown as { __echoMeetingRuntime?: MeetingRuntime | null }).__echoMeetingRuntime = runtime;
    }

    return runtime;
  }, [
    roomId,
    userId,
    displayName,
    color,
    updateParticipantState,
  ]);

  const startMeeting = useCallback(async () => {
    if (!roomId || !userId) {
      return;
    }

    let runtime = runtimeRef.current;

    if (!runtime) {
      runtime = createRuntime();
    }

    if (!runtime) {
      return;
    }

    setMeeting((current) => ({
      ...current,
      status: "joining",
      roomId,
      error: null,
    }));

    try {
      const stream = await runtime.start();
      setLocalStream(stream);

      setMeeting((current) => ({
        ...current,
        status: "in-meeting",
        roomId,
        localMedia: {
          ...current.localMedia,
          micEnabled: runtime?.isMicEnabled() ?? true,
          cameraEnabled: runtime?.isCameraEnabled() ?? true,
        },
        error: null,
      }));

      broadcastCurrentMediaState();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to start meeting.";

      setMeeting((current) => ({
        ...current,
        status: "error",
        error: message,
      }));
    }
  }, [roomId, userId, createRuntime, broadcastCurrentMediaState]);

  const joinPeer = useCallback(
    async (
      peerId: string,
      peerDisplayName = "Participant",
      peerColor = "#6366f1"
    ) => {
      const runtime = runtimeRef.current;

      if (
        !runtime ||
        peerId === userId ||
        pendingPeerJoinsRef.current.has(peerId)
      ) {
        return;
      }

      pendingPeerJoinsRef.current.add(peerId);

      try {
        setMeeting((current) => {
          if (current.participants.has(peerId)) {
            return current;
          }

          const nextParticipants = new Map(current.participants);

          nextParticipants.set(
            peerId,
            createParticipant(peerId, peerDisplayName, peerColor)
          );

          return {
            ...current,
            participants: nextParticipants,
          };
        });

        /*
         * Deterministic offerer rule:
         * smaller userId creates the offer.
         *
         * This prevents both browsers from simultaneously
         * creating the initial offer for the same pair.
         */
        const shouldCreateOffer =
          Boolean(userId) && userId! < peerId;

        await runtime.addPeer(peerId, shouldCreateOffer);
        broadcastCurrentMediaState();
      } finally {
        pendingPeerJoinsRef.current.delete(peerId);
      }
    },
    [userId, broadcastCurrentMediaState]
  );

  const removePeer = useCallback(async (peerId: string) => {
    pendingPeerJoinsRef.current.delete(peerId);
    await runtimeRef.current?.removePeer(peerId);

    setMeeting((current) => {
      if (!current.participants.has(peerId)) {
        return current;
      }

      const nextParticipants = new Map(current.participants);
      nextParticipants.delete(peerId);

      const nextActivePresenterId = resolveActivePresenter(
        nextParticipants,
        current.localMedia.screenShareEnabled,
        userId ?? ""
      );

      return {
        ...current,
        participants: nextParticipants,
        activePresenterId: nextActivePresenterId,
      };
    });

    setRemoteStreams((current) => {
      if (!current.has(peerId)) {
        return current;
      }

      const next = new Map(current);
      next.delete(peerId);
      return next;
    });
  }, [userId]);

  const syncPeers = useCallback(
    async (participants: MeetingPresenceParticipant[]) => {
      const runtime = runtimeRef.current;
      if (!runtime || !userId) return;

      const remoteParticipants = participants.filter(
        (participant) => participant.userId !== userId
      );

      const activePeerIds = new Set(
        remoteParticipants.map((participant) => participant.userId)
      );

      // Add newly discovered peers.
      for (const participant of remoteParticipants) {
        await joinPeer(
          participant.userId,
          participant.displayName ?? "Participant",
          participant.color ?? "#6366f1"
        );
      }

      // Remove peers that disappeared from presence.
      for (const peerId of runtime.getPeerIds()) {
        if (!activePeerIds.has(peerId)) {
          await removePeer(peerId);
        }
      }
    },
    [userId, joinPeer, removePeer]
  );

  const handleMediaState = useCallback(
    (payload: unknown) => {
      if (!roomId || !userId) return;

      const mediaState = parseMediaStateBroadcastPayload(
        payload,
        roomId,
        userId
      );

      if (!mediaState) return;

      const runtime = runtimeRef.current;
      if (runtime) {
        const conn = runtime.getPeerConnection(mediaState.senderId);
        if (!conn) {
          void joinPeer(mediaState.senderId);
        } else if (
          conn.remoteDescription === null &&
          Boolean(userId) &&
          userId! < mediaState.senderId
        ) {
          console.log(
            `[useMeeting:${userId}] Remote peer ${mediaState.senderId} active but remoteDescription is null. Re-offering...`
          );
          void runtime.createOffer(mediaState.senderId);
        }
      }

      setMeeting((current) => {
        const nextParticipants = applyMediaStateUpdate(
          current.participants,
          mediaState
        );
        const nextActivePresenterId = resolveActivePresenter(
          nextParticipants,
          current.localMedia.screenShareEnabled,
          userId ?? ""
        );
        return {
          ...current,
          participants: nextParticipants,
          activePresenterId: nextActivePresenterId,
        };
      });
    },
    [roomId, userId, joinPeer]
  );

  const handleSignal = useCallback(
    async (payload: unknown) => {
      if (!roomId || !userId) return;

      const mediaState = parseMediaStateBroadcastPayload(
        payload,
        roomId,
        userId
      );

      if (mediaState) {
        const runtime = runtimeRef.current;
        if (runtime) {
          const conn = runtime.getPeerConnection(mediaState.senderId);
          if (!conn) {
            void joinPeer(mediaState.senderId);
          } else if (
            conn.remoteDescription === null &&
            Boolean(userId) &&
            userId! < mediaState.senderId
          ) {
            console.log(
              `[useMeeting:${userId}] Remote peer ${mediaState.senderId} active but remoteDescription is null. Re-offering...`
            );
            void runtime.createOffer(mediaState.senderId);
          }
        }

        setMeeting((current) => {
          const nextParticipants = applyMediaStateUpdate(
            current.participants,
            mediaState
          );
          const nextActivePresenterId = resolveActivePresenter(
            nextParticipants,
            current.localMedia.screenShareEnabled,
            userId ?? ""
          );
          return {
            ...current,
            participants: nextParticipants,
            activePresenterId: nextActivePresenterId,
          };
        });
        return;
      }

      const leave = parseMeetingLeavePayload(payload, roomId, userId);
      if (leave) {
        await removePeer(leave.senderId);
        return;
      }

      await runtimeRef.current?.handleSignal(payload);
    },
    [roomId, userId, joinPeer, removePeer]
  );

  const setMicEnabled = useCallback(
    (enabled: boolean) => {
      const runtime = runtimeRef.current;

      if (!runtime || !roomId || !userId) {
        return;
      }

      runtime.setMicEnabled(enabled);

      setMeeting((current) => {
        const nextLocalMedia = {
          ...current.localMedia,
          micEnabled: enabled,
        };

        broadcastSignalRef.current?.(
          buildMediaStatePayload(
            roomId,
            userId,
            {
              isMuted: !enabled,
              hasAudio: true,
            },
            {
              isVideoOn: nextLocalMedia.cameraEnabled,
              hasVideo: true,
            },
            {
              isSharing: nextLocalMedia.screenShareEnabled,
            }
          )
        );

        return {
          ...current,
          localMedia: nextLocalMedia,
        };
      });
    },
    [roomId, userId]
  );

  const setCameraEnabled = useCallback(
    (enabled: boolean) => {
      const runtime = runtimeRef.current;

      if (!runtime || !roomId || !userId) {
        return;
      }

      runtime.setCameraEnabled(enabled);

      setMeeting((current) => {
        const nextLocalMedia = {
          ...current.localMedia,
          cameraEnabled: enabled,
        };

        broadcastSignalRef.current?.(
          buildMediaStatePayload(
            roomId,
            userId,
            {
              isMuted: !nextLocalMedia.micEnabled,
              hasAudio: true,
            },
            {
              isVideoOn: enabled,
              hasVideo: true,
            },
            {
              isSharing: nextLocalMedia.screenShareEnabled,
            }
          )
        );

        return {
          ...current,
          localMedia: nextLocalMedia,
        };
      });
    },
    [roomId, userId]
  );

  const startScreenShare = useCallback(async () => {
    const runtime = runtimeRef.current;
    if (!runtime || !roomId || !userId) {
      return;
    }

    if (isStartingScreenShareRef.current) {
      return;
    }

    if (
      meetingRef.current.activePresenterId &&
      meetingRef.current.activePresenterId !== userId
    ) {
      console.warn(
        `[useMeeting:${userId}] Another participant (${meetingRef.current.activePresenterId}) is already presenting.`
      );
      return;
    }

    isStartingScreenShareRef.current = true;

    try {
      const displayStream = await runtime.startScreenShare();
      setScreenStream(displayStream);

      setMeeting((current) => {
        const nextLocalMedia = {
          ...current.localMedia,
          screenShareEnabled: true,
          screenError: null,
        };
        const nextActivePresenterId = resolveActivePresenter(
          current.participants,
          true,
          userId
        );

        return {
          ...current,
          localMedia: nextLocalMedia,
          activePresenterId: nextActivePresenterId,
        };
      });

      broadcastSignalRef.current?.(
        buildMediaStatePayload(
          roomId,
          userId,
          {
            isMuted: !runtime.isMicEnabled(),
            hasAudio: true,
          },
          {
            isVideoOn: runtime.isCameraEnabled(),
            hasVideo: true,
          },
          {
            isSharing: true,
          }
        )
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to start screen share.";
      console.error(`[useMeeting:${userId}] Error starting screen share:`, error);
      setMeeting((current) => ({
        ...current,
        localMedia: {
          ...current.localMedia,
          screenShareEnabled: false,
          screenError: message,
        },
      }));
    } finally {
      isStartingScreenShareRef.current = false;
    }
  }, [roomId, userId]);

  const stopScreenShare = useCallback(async () => {
    const runtime = runtimeRef.current;
    if (!runtime || !roomId || !userId) {
      return;
    }

    try {
      await runtime.stopScreenShare();
    } catch (error) {
      console.error(`[useMeeting:${userId}] Error stopping screen share:`, error);
    }

    setScreenStream(null);

    setMeeting((current) => {
      const nextLocalMedia = {
        ...current.localMedia,
        screenShareEnabled: false,
      };
      const nextActivePresenterId = resolveActivePresenter(
        current.participants,
        false,
        userId
      );

      return {
        ...current,
        localMedia: nextLocalMedia,
        activePresenterId: nextActivePresenterId,
      };
    });

    broadcastSignalRef.current?.(
      buildMediaStatePayload(
        roomId,
        userId,
        {
          isMuted: !runtime.isMicEnabled(),
          hasAudio: true,
        },
        {
          isVideoOn: runtime.isCameraEnabled(),
          hasVideo: true,
        },
        {
          isSharing: false,
        }
      )
    );
  }, [roomId, userId]);

  const leaveMeeting = useCallback(async () => {
    const runtime = runtimeRef.current;

    if (!runtime || !roomId || !userId) {
      return;
    }

    setMeeting((current) => ({
      ...current,
      status: "leaving",
    }));

    broadcastSignalRef.current?.(
      buildMeetingLeavePayload(roomId, userId)
    );

    if (meetingRef.current.localMedia.screenShareEnabled) {
      try {
        await runtime.stopScreenShare();
      } catch (e) {
        console.error("Error stopping screen share on leave:", e);
      }
    }

    await runtime.stop();

    runtimeRef.current = null;
    if (typeof window !== "undefined") {
      (window as unknown as { __echoMeetingRuntime?: MeetingRuntime | null }).__echoMeetingRuntime = null;
    }

    setRemoteStreams(new Map());
    setLocalStream(null);
    setScreenStream(null);

    setMeeting({
      ...INITIAL_MEETING_STATE,
      localMedia: {
        ...INITIAL_MEDIA_STATE,
      },
    });
  }, [roomId, userId]);

  useEffect(() => {
    return () => {
      void runtimeRef.current?.stop();
      runtimeRef.current = null;
      if (typeof window !== "undefined") {
        (window as unknown as { __echoMeetingRuntime?: MeetingRuntime | null }).__echoMeetingRuntime = null;
      }
    };
  }, []);

  return {
    meeting,

    localStream,

    screenStream,

    remoteStreams,

    startMeeting,
    leaveMeeting,

    startScreenShare,
    stopScreenShare,

    joinPeer,
    removePeer,
    syncPeers,

    handleSignal,
    handleMediaState,

    setMicEnabled,
    setCameraEnabled,

    isMicEnabled: meeting.localMedia.micEnabled,

    isCameraEnabled: meeting.localMedia.cameraEnabled,

    isScreenSharing: meeting.localMedia.screenShareEnabled,

    activePresenterId: meeting.activePresenterId,
  };
}
