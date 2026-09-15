/**
 * Phase 13.3 — Meeting Repository
 *
 * Implements server-side persistence for meeting sessions, participants,
 * finalized transcript segments, and synthesized insights.
 *
 * CRITICAL INVARIANTS:
 * - meetingId belongs to workspaceId, but is distinct from roomId.
 * - WebRTC runtime state (MediaStreams, RTCPeerConnections, ICE, SDP) is NEVER persisted.
 * - Transcript identity is strictly (meetingId, segmentId) with idempotency & conflict handling.
 * - sequence is for deterministic presentation ordering ONLY.
 * - Insight identity is strictly (meetingId, insightId) with idempotency & conflict handling.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CreateMeetingRequest,
  CreateMeetingResponse,
  EndMeetingRequest,
  EndMeetingResponse,
  MeetingHistoryResponse,
  MeetingId,
  MeetingInsightRecord,
  MeetingParticipantRecord,
  MeetingRecord,
  MeetingTranscriptSegmentRecord,
  PersistMeetingInsightsRequest,
  PersistMeetingInsightsResponse,
  PersistTranscriptSegmentsRequest,
  PersistTranscriptSegmentsResponse,
  WorkspaceId,
} from "../index";
import {
  type PersistenceActor,
  PersistenceError,
  getServerSupabaseClient,
  mapMeetingRow,
  mapMeetingParticipantRow,
  mapTranscriptRow,
  mapInsightRow,
  requireWorkspaceMember,
  requireWorkspaceRole,
} from "../server";

export class MeetingRepository {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient = getServerSupabaseClient()) {
    this.client = client;
  }

  /**
   * Records the start of a meeting session in a workspace.
   * Server-authoritative: starts in 'active' status with server timestamps.
   * Idempotent: returns existing meeting if same workspace, throws CONFLICT if in another workspace.
   */
  async createMeeting(actor: PersistenceActor, req: CreateMeetingRequest): Promise<CreateMeetingResponse> {
    const { meetingId, workspaceId, title } = req;

    await requireWorkspaceRole(this.client, workspaceId, actor, ["owner", "admin", "editor", "member"]);

    if (!meetingId || meetingId.trim() === "") {
      throw new PersistenceError("VALIDATION_ERROR", "meetingId cannot be empty");
    }

    const cleanMeetingId = meetingId.trim();
    const finalTitle = title?.trim() || "Echo Meeting";

    // 1. Attempt atomic create_meeting_tx RPC with actor verification and server-authoritative timestamps
    try {
      const { data: rpcData, error: rpcError } = await this.client.rpc("create_meeting_tx", {
        p_workspace_id: workspaceId,
        p_meeting_id: cleanMeetingId,
        p_title: finalTitle,
        p_actor_id: actor.userId,
      });

      if (!rpcError && rpcData) {
        return {
          meeting: mapMeetingRow(rpcData),
        };
      }

      if (rpcError) {
        if (rpcError.code === "42501") {
          throw new PersistenceError("FORBIDDEN", rpcError.message);
        }
        if (rpcError.code === "23505") {
          throw new PersistenceError("CONFLICT", `Meeting ${cleanMeetingId} already exists in another workspace`);
        }
        // If RPC is missing (PGRST202 / 42883 in test environments), fall through to mock fallback
        if (rpcError.code !== "PGRST202" && rpcError.code !== "42883") {
          throw new PersistenceError("DATABASE_ERROR", `Failed to create meeting: ${rpcError.message}`);
        }
      }
    } catch (err: unknown) {
      if (err instanceof PersistenceError) {
        throw err;
      }
      // Continue to fallback if unexpected RPC invocation issue
    }

    // 2. Fallback for mock/test environments without RPC
    const { data: existing, error: existError } = await this.client
      .from("meetings")
      .select("*")
      .eq("id", cleanMeetingId)
      .maybeSingle();

    if (existError && existError.code !== "PGRST116") {
      throw new PersistenceError("DATABASE_ERROR", `Failed to inspect existing meeting: ${existError.message}`);
    }

    if (existing) {
      if (existing.workspace_id === workspaceId) {
        return { meeting: mapMeetingRow(existing) };
      } else {
        throw new PersistenceError("CONFLICT", `Meeting ${cleanMeetingId} already exists in another workspace`);
      }
    }

    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from("meetings")
      .insert({
        id: cleanMeetingId,
        workspace_id: workspaceId,
        title: finalTitle,
        status: "active",
        started_at: now,
        created_by: actor.userId,
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new PersistenceError("CONFLICT", `Meeting ${cleanMeetingId} already exists`);
      }
      throw new PersistenceError("DATABASE_ERROR", `Failed to create meeting: ${error.message}`);
    }

    return {
      meeting: mapMeetingRow(data),
    };
  }

  /**
   * Marks a meeting session as ended.
   * Server-authoritative: sets ended_at = now(). Client cannot dictate timestamp.
   * Concurrency-safe: row-locked via end_meeting_tx.
   * Idempotent: returning existing ended record if already ended.
   * Recovery: if meeting start persistence failed or was dropped, atomically creates in 'ended' status.
   */
  async endMeeting(
    actor: PersistenceActor,
    req: EndMeetingRequest,
    targetWorkspaceId?: WorkspaceId
  ): Promise<EndMeetingResponse> {
    const { meetingId } = req;
    if (!meetingId || meetingId.trim() === "") {
      throw new PersistenceError("VALIDATION_ERROR", "meetingId cannot be empty");
    }

    const cleanMeetingId = meetingId.trim();
    const cleanTitle = req.title?.trim() || "Untitled Meeting";

    // Determine target workspace ID
    let resolvedWorkspaceId = targetWorkspaceId || req.workspaceId;

    if (!resolvedWorkspaceId) {
      const { data: meetingData, error: fetchError } = await this.client
        .from("meetings")
        .select("workspace_id")
        .eq("id", cleanMeetingId)
        .maybeSingle();

      if (fetchError || !meetingData) {
        throw new PersistenceError("NOT_FOUND", `Meeting ${cleanMeetingId} not found`);
      }
      resolvedWorkspaceId = meetingData.workspace_id;
    }

    if (!resolvedWorkspaceId) {
      throw new PersistenceError("VALIDATION_ERROR", "workspaceId could not be resolved for meeting");
    }

    // Role verification (defense in depth)
    await requireWorkspaceRole(this.client, resolvedWorkspaceId, actor, ["owner", "admin", "editor", "member"]);

    // 1. Attempt atomic end_meeting_tx RPC
    try {
      const { data: rpcData, error: rpcError } = await this.client.rpc("end_meeting_tx", {
        p_workspace_id: resolvedWorkspaceId,
        p_meeting_id: cleanMeetingId,
        p_actor_id: actor.userId,
        p_title: cleanTitle,
      });

      if (!rpcError && rpcData) {
        return {
          meeting: mapMeetingRow(rpcData),
        };
      }

      if (rpcError) {
        if (rpcError.code === "42501") {
          throw new PersistenceError("FORBIDDEN", rpcError.message);
        }
        if (rpcError.code !== "PGRST202" && rpcError.code !== "42883") {
          throw new PersistenceError("DATABASE_ERROR", `Failed to end meeting: ${rpcError.message}`);
        }
      }
    } catch (err: unknown) {
      if (err instanceof PersistenceError) {
        throw err;
      }
    }

    // 2. Fallback for mock/test environments without RPC
    const { data: existingMeeting, error: checkError } = await this.client
      .from("meetings")
      .select("*")
      .eq("id", cleanMeetingId)
      .maybeSingle();

    if (checkError && checkError.code !== "PGRST116") {
      throw new PersistenceError("DATABASE_ERROR", `Failed to query meeting: ${checkError.message}`);
    }

    const now = new Date().toISOString();

    if (!existingMeeting) {
      // Async Recovery in fallback: meeting start was dropped, create directly in 'ended' state
      const { data: recovered, error: recoverErr } = await this.client
        .from("meetings")
        .insert({
          id: cleanMeetingId,
          workspace_id: resolvedWorkspaceId,
          title: cleanTitle,
          status: "ended",
          started_at: now,
          ended_at: now,
          created_by: actor.userId,
          created_at: now,
          updated_at: now,
        })
        .select("*")
        .single();

      if (recoverErr) {
        throw new PersistenceError("DATABASE_ERROR", `Failed to recover meeting: ${recoverErr.message}`);
      }
      return { meeting: mapMeetingRow(recovered) };
    }

    if (existingMeeting.workspace_id !== resolvedWorkspaceId) {
      throw new PersistenceError("FORBIDDEN", `Meeting ${cleanMeetingId} belongs to a different workspace`);
    }

    if (existingMeeting.status === "ended") {
      return { meeting: mapMeetingRow(existingMeeting) };
    }

    const { data: updated, error: updateError } = await this.client
      .from("meetings")
      .update({
        status: "ended",
        ended_at: now,
        updated_at: now,
      })
      .eq("id", cleanMeetingId)
      .select("*")
      .single();

    if (updateError) {
      throw new PersistenceError("DATABASE_ERROR", `Failed to end meeting: ${updateError.message}`);
    }

    return {
      meeting: mapMeetingRow(updated),
    };
  }

  /**
   * Fetches meeting record by ID, verifying workspace relationship.
   */
  async getMeeting(actor: PersistenceActor, workspaceId: WorkspaceId, meetingId: MeetingId): Promise<MeetingRecord> {
    await requireWorkspaceMember(this.client, workspaceId, actor);

    const { data, error } = await this.client
      .from("meetings")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", meetingId)
      .single();

    if (error || !data) {
      throw new PersistenceError("NOT_FOUND", `Meeting ${meetingId} not found in workspace ${workspaceId}`);
    }

    return mapMeetingRow(data);
  }

  /**
   * Records a participant attending the meeting.
   */
  async recordParticipant(
    actor: PersistenceActor,
    meetingId: MeetingId,
    participant: { userId: string; displayName: string; color: string }
  ): Promise<MeetingParticipantRecord> {
    const { data: meetingData, error: fetchError } = await this.client
      .from("meetings")
      .select("workspace_id")
      .eq("id", meetingId)
      .single();

    if (fetchError || !meetingData) {
      throw new PersistenceError("NOT_FOUND", `Meeting ${meetingId} not found`);
    }

    await requireWorkspaceRole(this.client, meetingData.workspace_id, actor, ["owner", "admin", "editor", "member"]);

    const { data, error } = await this.client
      .from("meeting_participants")
      .upsert(
        {
          meeting_id: meetingId,
          user_id: participant.userId,
          display_name: participant.displayName,
          color: participant.color,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "meeting_id, user_id" }
      )
      .select("*")
      .single();

    if (error) {
      throw new PersistenceError("DATABASE_ERROR", `Failed to record participant: ${error.message}`);
    }

    return mapMeetingParticipantRow(data);
  }

  /**
   * Persists finalized transcript segments with (meetingId, segmentId) idempotency and conflict detection.
   */
  async persistTranscriptSegments(
    actor: PersistenceActor,
    req: PersistTranscriptSegmentsRequest
  ): Promise<PersistTranscriptSegmentsResponse> {
    const { meetingId, segments } = req;

    if (!Array.isArray(segments) || segments.length === 0) {
      return { persistedCount: 0 };
    }

    const { data: meetingData, error: fetchError } = await this.client
      .from("meetings")
      .select("workspace_id")
      .eq("id", meetingId)
      .single();

    if (fetchError || !meetingData) {
      throw new PersistenceError("NOT_FOUND", `Meeting ${meetingId} not found`);
    }

    await requireWorkspaceRole(this.client, meetingData.workspace_id, actor, ["owner", "admin", "editor", "member"]);

    let persistedCount = 0;

    for (const segment of segments) {
      // Check existing segment for idempotency vs conflict
      const { data: existingSeg, error: existError } = await this.client
        .from("meeting_transcript_segments")
        .select("*")
        .eq("meeting_id", meetingId)
        .eq("id", segment.id)
        .maybeSingle();

      if (existError) {
        throw new PersistenceError("DATABASE_ERROR", existError.message);
      }

      if (existingSeg) {
        // Idempotency comparison
        if (existingSeg.text === segment.text && existingSeg.speaker_id === segment.speakerId) {
          // Idempotent: already persisted with same content
          continue;
        } else {
          throw new PersistenceError(
            "CONFLICT",
            `Transcript segment ${segment.id} in meeting ${meetingId} exists with conflicting content`
          );
        }
      }

      const { error: insertError } = await this.client
        .from("meeting_transcript_segments")
        .insert({
          id: segment.id,
          meeting_id: meetingId,
          speaker_id: segment.speakerId,
          speaker_name: segment.speakerName,
          text: segment.text,
          timestamp: segment.timestamp,
          sequence: segment.sequence,
          status: "final",
          source: "meeting",
          language: segment.language || null,
        });

      if (insertError) {
        throw new PersistenceError("DATABASE_ERROR", `Failed to insert transcript segment: ${insertError.message}`);
      }

      persistedCount += 1;
    }

    return { persistedCount };
  }

  /**
   * Persists synthesized meeting insights with (meetingId, insightId) idempotency and conflict detection.
   */
  async persistMeetingInsights(
    actor: PersistenceActor,
    req: PersistMeetingInsightsRequest
  ): Promise<PersistMeetingInsightsResponse> {
    const { meetingId, insights } = req;

    if (!Array.isArray(insights) || insights.length === 0) {
      return { persistedCount: 0 };
    }

    const { data: meetingData, error: fetchError } = await this.client
      .from("meetings")
      .select("workspace_id")
      .eq("id", meetingId)
      .single();

    if (fetchError || !meetingData) {
      throw new PersistenceError("NOT_FOUND", `Meeting ${meetingId} not found`);
    }

    await requireWorkspaceRole(this.client, meetingData.workspace_id, actor, ["owner", "admin", "editor", "member"]);

    let persistedCount = 0;

    for (const insight of insights) {
      const { data: existingIns, error: existError } = await this.client
        .from("meeting_insights")
        .select("*")
        .eq("meeting_id", meetingId)
        .eq("id", insight.id)
        .maybeSingle();

      if (existError) {
        throw new PersistenceError("DATABASE_ERROR", existError.message);
      }

      if (existingIns) {
        // Idempotency comparison
        if (existingIns.title === insight.title && existingIns.type === insight.type) {
          continue;
        } else {
          throw new PersistenceError(
            "CONFLICT",
            `Meeting insight ${insight.id} in meeting ${meetingId} exists with conflicting title or type`
          );
        }
      }

      const { error: insertError } = await this.client
        .from("meeting_insights")
        .insert({
          id: insight.id,
          meeting_id: meetingId,
          type: insight.type,
          title: insight.title,
          summary: insight.summary,
          source_segment_ids: insight.sourceSegmentIds,
          speaker_ids: insight.speakerIds,
          confidence: insight.confidence !== undefined ? insight.confidence : null,
          timestamp: insight.timestamp,
        });

      if (insertError) {
        throw new PersistenceError("DATABASE_ERROR", `Failed to insert meeting insight: ${insertError.message}`);
      }

      persistedCount += 1;
    }

    return { persistedCount };
  }

  /**
   * Lists past meetings belonging to a workspace.
   */
  async getMeetingHistory(actor: PersistenceActor, workspaceId: WorkspaceId): Promise<MeetingHistoryResponse> {
    await requireWorkspaceMember(this.client, workspaceId, actor);

    const { data, count, error } = await this.client
      .from("meetings")
      .select("*", { count: "exact" })
      .eq("workspace_id", workspaceId)
      .order("started_at", { ascending: false });

    if (error) {
      throw new PersistenceError("DATABASE_ERROR", error.message);
    }

    return {
      meetings: (data || []).map(mapMeetingRow),
      totalCount: count ?? 0,
    };
  }

  private async verifyMeetingBelongsToWorkspace(meetingId: MeetingId, workspaceId: WorkspaceId): Promise<void> {
    const { data, error } = await this.client
      .from("meetings")
      .select("workspace_id")
      .eq("id", meetingId)
      .single();

    if (error || !data) {
      throw new PersistenceError("NOT_FOUND", `Meeting ${meetingId} not found`);
    }

    if (data.workspace_id !== workspaceId) {
      throw new PersistenceError(
        "INVALID_RELATIONSHIP",
        `Meeting ${meetingId} belongs to workspace ${data.workspace_id}, not ${workspaceId}`
      );
    }
  }

  /**
   * Retrieves transcript segments for a meeting in canonical ordering (sequence ASC, timestamp ASC, id ASC).
   */
  async listTranscriptSegments(
    actor: PersistenceActor,
    workspaceId: WorkspaceId,
    meetingId: MeetingId
  ): Promise<MeetingTranscriptSegmentRecord[]> {
    await requireWorkspaceMember(this.client, workspaceId, actor);
    await this.verifyMeetingBelongsToWorkspace(meetingId, workspaceId);

    const { data, error } = await this.client
      .from("meeting_transcript_segments")
      .select("*")
      .eq("meeting_id", meetingId)
      .order("sequence", { ascending: true })
      .order("timestamp", { ascending: true })
      .order("id", { ascending: true });

    if (error) {
      throw new PersistenceError("DATABASE_ERROR", error.message);
    }

    return (data || []).map(mapTranscriptRow);
  }

  /**
   * Retrieves meeting insights for a meeting.
   */
  async listMeetingInsights(
    actor: PersistenceActor,
    workspaceId: WorkspaceId,
    meetingId: MeetingId
  ): Promise<MeetingInsightRecord[]> {
    await requireWorkspaceMember(this.client, workspaceId, actor);
    await this.verifyMeetingBelongsToWorkspace(meetingId, workspaceId);

    const { data, error } = await this.client
      .from("meeting_insights")
      .select("*")
      .eq("meeting_id", meetingId)
      .order("timestamp", { ascending: true });

    if (error) {
      throw new PersistenceError("DATABASE_ERROR", error.message);
    }

    return (data || []).map(mapInsightRow);
  }
}
