/**
 * Phase 13.7 — Client Hook: useMeetingPersistence
 *
 * Provides non-blocking, asynchronous persistence for meeting lifecycle events.
 *
 * CRITICAL INVARIANTS:
 * - Completely isolated from Phase 12 WebRTC runtime (audio, video, STT, screen sharing).
 * - Persistence errors NEVER block or interrupt the live meeting.
 * - Start failure recovery: If start persistence fails or drops, ending the meeting
 *   still attempts atomic end/recovery via the backend, guaranteeing historical durability.
 * - Server-authoritative: timestamps and user identity are managed server-side.
 */

import { useCallback, useRef, useState } from "react";
import type {
  MeetingInsightRecord,
  MeetingRecord,
  MeetingTranscriptSegmentRecord,
} from "../meetingTypes";
import {
  createMeetingApi,
  endMeetingApi,
  getMeetingHistoryApi,
  getMeetingInsightsApi,
  getMeetingTranscriptsApi,
} from "./meetingApi";

export type MeetingPersistenceStatus = "idle" | "persisting" | "persisted" | "error";

export interface UseMeetingPersistenceOptions {
  workspaceId: string | null;
  onPersistError?: (error: Error) => void;
}

export interface UseMeetingPersistenceReturn {
  status: MeetingPersistenceStatus;
  lastPersistedMeeting: MeetingRecord | null;
  error: string | null;
  persistStart: (meetingId: string, title?: string) => Promise<MeetingRecord | null>;
  persistEnd: (
    meetingId: string,
    title?: string,
    segments?: MeetingTranscriptSegmentRecord[],
    insights?: MeetingInsightRecord[]
  ) => Promise<MeetingRecord | null>;
  fetchHistory: () => Promise<MeetingRecord[]>;
  fetchTranscripts: (meetingId: string) => Promise<MeetingTranscriptSegmentRecord[]>;
  fetchInsights: (meetingId: string) => Promise<MeetingInsightRecord[]>;
}

interface ActiveMeetingRef {
  meetingId: string;
  title?: string;
  startAcknowledged: boolean;
}

export function useMeetingPersistence({
  workspaceId,
  onPersistError,
}: UseMeetingPersistenceOptions): UseMeetingPersistenceReturn {
  const [status, setStatus] = useState<MeetingPersistenceStatus>("idle");
  const [lastPersistedMeeting, setLastPersistedMeeting] = useState<MeetingRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeMeetingRef = useRef<ActiveMeetingRef | null>(null);

  /**
   * Asynchronously records meeting start.
   * Runtime continues immediately without awaiting DB completion.
   */
  const persistStart = useCallback(
    async (meetingId: string, title?: string): Promise<MeetingRecord | null> => {
      if (!workspaceId) {
        return null;
      }

      activeMeetingRef.current = {
        meetingId,
        title,
        startAcknowledged: false,
      };

      setStatus("persisting");
      setError(null);

      try {
        const meeting = await createMeetingApi(workspaceId, {
          meetingId,
          title,
        });

        if (activeMeetingRef.current?.meetingId === meetingId) {
          activeMeetingRef.current.startAcknowledged = true;
        }

        setLastPersistedMeeting(meeting);
        setStatus("persisted");
        return meeting;
      } catch (err: unknown) {
        const errorObj = err instanceof Error ? err : new Error(String(err));
        setError(errorObj.message);
        setStatus("error");
        onPersistError?.(errorObj);
        // Do NOT throw: WebRTC runtime must not crash on persistence errors
        return null;
      }
    },
    [workspaceId, onPersistError]
  );

  /**
   * Asynchronously marks meeting as ended.
   * Handles recovery: if start failed or was dropped, still attempts to end/recover.
   */
  const persistEnd = useCallback(
    async (
      meetingId: string,
      title?: string,
      segments?: MeetingTranscriptSegmentRecord[],
      insights?: MeetingInsightRecord[]
    ): Promise<MeetingRecord | null> => {
      if (!workspaceId) {
        return null;
      }

      const effectiveTitle = title || activeMeetingRef.current?.title || "Untitled Meeting";
      setStatus("persisting");
      setError(null);

      try {
        const meeting = await endMeetingApi(workspaceId, meetingId, {
          title: effectiveTitle,
          segments,
          insights,
        });

        activeMeetingRef.current = null;
        setLastPersistedMeeting(meeting);
        setStatus("persisted");
        return meeting;
      } catch (err: unknown) {
        const errorObj = err instanceof Error ? err : new Error(String(err));
        setError(errorObj.message);
        setStatus("error");
        onPersistError?.(errorObj);
        return null;
      }
    },
    [workspaceId, onPersistError]
  );

  /**
   * Loads meeting history for the current workspace.
   */
  const fetchHistory = useCallback(async (): Promise<MeetingRecord[]> => {
    if (!workspaceId) {
      return [];
    }

    try {
      return await getMeetingHistoryApi(workspaceId);
    } catch (err: unknown) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      setError(errorObj.message);
      onPersistError?.(errorObj);
      return [];
    }
  }, [workspaceId, onPersistError]);

  /**
   * Loads transcript segments for a meeting in the workspace.
   */
  const fetchTranscripts = useCallback(
    async (meetingId: string): Promise<MeetingTranscriptSegmentRecord[]> => {
      if (!workspaceId) {
        return [];
      }

      try {
        return await getMeetingTranscriptsApi(workspaceId, meetingId);
      } catch (err: unknown) {
        const errorObj = err instanceof Error ? err : new Error(String(err));
        setError(errorObj.message);
        onPersistError?.(errorObj);
        return [];
      }
    },
    [workspaceId, onPersistError]
  );

  /**
   * Loads synthesized insights for a meeting in the workspace.
   */
  const fetchInsights = useCallback(
    async (meetingId: string): Promise<MeetingInsightRecord[]> => {
      if (!workspaceId) {
        return [];
      }

      try {
        return await getMeetingInsightsApi(workspaceId, meetingId);
      } catch (err: unknown) {
        const errorObj = err instanceof Error ? err : new Error(String(err));
        setError(errorObj.message);
        onPersistError?.(errorObj);
        return [];
      }
    },
    [workspaceId, onPersistError]
  );

  return {
    status,
    lastPersistedMeeting,
    error,
    persistStart,
    persistEnd,
    fetchHistory,
    fetchTranscripts,
    fetchInsights,
  };
}
