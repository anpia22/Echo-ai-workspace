/**
 * Phase 13.7 — Client Meeting Persistence API Wrapper
 *
 * Client-only HTTP boundary for persisting meeting history.
 * Communicates with Next.js /api/workspace/[workspaceId]/meetings routes.
 *
 * CRITICAL INVARIANTS:
 * - Never supplies user identity or timestamps from client.
 * - Client-provided meetingId is strictly an opaque correlation/idempotency token.
 * - Browser-safe; zero server dependencies.
 */

import type {
  MeetingInsightRecord,
  MeetingRecord,
  MeetingTranscriptSegmentRecord,
} from "../meetingTypes";

export class MeetingPersistenceApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "MeetingPersistenceApiError";
    this.code = code;
    this.status = status;
  }
}

export class MeetingPersistenceConflictError extends MeetingPersistenceApiError {
  constructor(message: string) {
    super("CONFLICT", message, 409);
    this.name = "MeetingPersistenceConflictError";
  }
}

export type CreateMeetingPayload = {
  meetingId?: string;
  title?: string;
};

export type EndMeetingPayload = {
  title?: string;
  segments?: MeetingTranscriptSegmentRecord[];
  insights?: MeetingInsightRecord[];
};

/**
 * Persists meeting start asynchronously.
 */
export async function createMeetingApi(
  workspaceId: string,
  payload: CreateMeetingPayload
): Promise<MeetingRecord> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/meetings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      meetingId: payload.meetingId,
      title: payload.title,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 409) {
      throw new MeetingPersistenceConflictError(data?.error?.message || "Meeting ID conflict");
    }
    throw new MeetingPersistenceApiError(
      data?.error?.code || "PERSISTENCE_ERROR",
      data?.error?.message || `Failed to create meeting: HTTP ${response.status}`,
      response.status
    );
  }

  return data.meeting;
}

/**
 * Persists meeting end asynchronously along with finalized transcript segments and insights.
 */
export async function endMeetingApi(
  workspaceId: string,
  meetingId: string,
  payload?: EndMeetingPayload
): Promise<MeetingRecord> {
  const response = await fetch(
    `/api/workspace/${encodeURIComponent(workspaceId)}/meetings/${encodeURIComponent(meetingId)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status: "ended",
        title: payload?.title,
        segments: payload?.segments,
        insights: payload?.insights,
      }),
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new MeetingPersistenceApiError(
      data?.error?.code || "PERSISTENCE_ERROR",
      data?.error?.message || `Failed to end meeting: HTTP ${response.status}`,
      response.status
    );
  }

  return data.meeting;
}

/**
 * Lists past meetings for a workspace.
 */
export async function getMeetingHistoryApi(workspaceId: string): Promise<MeetingRecord[]> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/meetings`, {
    method: "GET",
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new MeetingPersistenceApiError(
      data?.error?.code || "PERSISTENCE_ERROR",
      data?.error?.message || `Failed to fetch meeting history: HTTP ${response.status}`,
      response.status
    );
  }

  return data.meetings || [];
}

/**
 * Retrieves a single meeting record by ID.
 */
export async function getMeetingApi(workspaceId: string, meetingId: string): Promise<MeetingRecord> {
  const response = await fetch(
    `/api/workspace/${encodeURIComponent(workspaceId)}/meetings/${encodeURIComponent(meetingId)}`,
    {
      method: "GET",
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new MeetingPersistenceApiError(
      data?.error?.code || "PERSISTENCE_ERROR",
      data?.error?.message || `Failed to get meeting: HTTP ${response.status}`,
      response.status
    );
  }

  return data.meeting;
}

/**
 * Retrieves canonical transcript segments for a meeting in a workspace.
 */
export async function getMeetingTranscriptsApi(
  workspaceId: string,
  meetingId: string
): Promise<MeetingTranscriptSegmentRecord[]> {
  const response = await fetch(
    `/api/workspace/${encodeURIComponent(workspaceId)}/meetings/${encodeURIComponent(meetingId)}/transcripts`,
    {
      method: "GET",
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new MeetingPersistenceApiError(
      data?.error?.code || "PERSISTENCE_ERROR",
      data?.error?.message || `Failed to get transcripts: HTTP ${response.status}`,
      response.status
    );
  }

  return data.transcripts || data.segments || [];
}

/**
 * Retrieves synthesized meeting insights for a meeting in a workspace.
 */
export async function getMeetingInsightsApi(
  workspaceId: string,
  meetingId: string
): Promise<MeetingInsightRecord[]> {
  const response = await fetch(
    `/api/workspace/${encodeURIComponent(workspaceId)}/meetings/${encodeURIComponent(meetingId)}/insights`,
    {
      method: "GET",
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new MeetingPersistenceApiError(
      data?.error?.code || "PERSISTENCE_ERROR",
      data?.error?.message || `Failed to get insights: HTTP ${response.status}`,
      response.status
    );
  }

  return data.insights || [];
}

