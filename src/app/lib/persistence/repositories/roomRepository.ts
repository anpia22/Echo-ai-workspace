/**
 * Phase 13.8 — Collaboration Room Repository
 *
 * Implements server-side persistence for collaboration room sessions
 * and historical attendee records.
 *
 * CRITICAL INVARIANTS:
 * - Phase 10 owns live collaboration, presence, events, and WebRTC.
 * - RoomRepository persists durable session history and recovery state only.
 * - Server-authoritative timestamps (now()). Client timestamps are rejected.
 * - Idempotency: duplicate room creation returns existing record; cross-workspace collision is rejected.
 * - Concurrency: closeRoom is row-locked (FOR UPDATE) with async recovery if start was dropped.
 * - Tenancy: room participants are strictly bounded by composite (workspace_id, room_id).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CloseCollaborationRoomRequest,
  CloseCollaborationRoomResponse,
  CollaborationParticipantRecord,
  CollaborationRoomHistoryResponse,
  CollaborationRoomRecord,
  CreateCollaborationRoomRequest,
  CreateCollaborationRoomResponse,
  RecordCollaborationParticipantRequest,
  WorkspaceId,
} from "../index";
import {
  type PersistenceActor,
  PersistenceError,
  getServerSupabaseClient,
  mapCollaborationParticipantRow,
  mapCollaborationRoomRow,
  requireWorkspaceMember,
  requireWorkspaceRole,
} from "../server";

export class RoomRepository {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient = getServerSupabaseClient()) {
    this.client = client;
  }

  /**
   * Records the creation/start of a collaboration room session in a workspace.
   * Server-authoritative: starts in 'active' status with server timestamps.
   * Idempotent: returns existing room if in same workspace; throws CONFLICT if in another workspace.
   */
  async createRoom(
    actor: PersistenceActor,
    req: CreateCollaborationRoomRequest
  ): Promise<CreateCollaborationRoomResponse> {
    const { roomId, workspaceId, title, metadata } = req;

    await requireWorkspaceRole(this.client, workspaceId, actor, ["owner", "admin", "editor", "member"]);

    if (!roomId || roomId.trim() === "") {
      throw new PersistenceError("VALIDATION_ERROR", "roomId cannot be empty");
    }

    const cleanRoomId = roomId.trim();
    const finalTitle = title?.trim() || "Echo Collaboration Room";

    // 1. Attempt atomic create_collaboration_room_tx RPC
    try {
      const { data: rpcData, error: rpcError } = await this.client.rpc("create_collaboration_room_tx", {
        p_workspace_id: workspaceId,
        p_room_id: cleanRoomId,
        p_title: finalTitle,
        p_actor_id: actor.userId,
        p_metadata: metadata || {},
      });

      if (!rpcError && rpcData) {
        return {
          room: mapCollaborationRoomRow(rpcData),
        };
      }

      if (rpcError) {
        if (rpcError.code === "42501") {
          throw new PersistenceError("FORBIDDEN", rpcError.message);
        }
        if (rpcError.code === "23505") {
          throw new PersistenceError("CONFLICT", `Room ${cleanRoomId} already exists in another workspace`);
        }
        if (rpcError.code !== "PGRST202" && rpcError.code !== "42883") {
          throw new PersistenceError("DATABASE_ERROR", `Failed to create room: ${rpcError.message}`);
        }
      }
    } catch (err: unknown) {
      if (err instanceof PersistenceError) {
        throw err;
      }
    }

    // 2. Fallback for mock/test environments without RPC
    const { data: existing, error: existError } = await this.client
      .from("collaboration_rooms")
      .select("*")
      .eq("id", cleanRoomId)
      .maybeSingle();

    if (existError && existError.code !== "PGRST116") {
      throw new PersistenceError("DATABASE_ERROR", `Failed to inspect existing room: ${existError.message}`);
    }

    if (existing) {
      if (existing.workspace_id === workspaceId) {
        return { room: mapCollaborationRoomRow(existing) };
      } else {
        throw new PersistenceError("CONFLICT", `Room ${cleanRoomId} already exists in another workspace`);
      }
    }

    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from("collaboration_rooms")
      .insert({
        id: cleanRoomId,
        workspace_id: workspaceId,
        title: finalTitle,
        status: "active",
        created_by: actor.userId,
        metadata: metadata || {},
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new PersistenceError("CONFLICT", `Room ${cleanRoomId} already exists`);
      }
      throw new PersistenceError("DATABASE_ERROR", `Failed to create room: ${error.message}`);
    }

    return {
      room: mapCollaborationRoomRow(data),
    };
  }

  /**
   * Closes an active collaboration room session.
   * Server-authoritative: sets closed_at = now().
   * Concurrency-safe: row-locked via close_collaboration_room_tx.
   * Idempotent: returning existing closed record if already closed.
   * Recovery: if room start persistence failed or was dropped, atomically creates in 'closed' status.
   */
  async closeRoom(
    actor: PersistenceActor,
    req: CloseCollaborationRoomRequest,
    targetWorkspaceId?: WorkspaceId
  ): Promise<CloseCollaborationRoomResponse> {
    const { roomId, lastKnownState } = req;
    if (!roomId || roomId.trim() === "") {
      throw new PersistenceError("VALIDATION_ERROR", "roomId cannot be empty");
    }

    const cleanRoomId = roomId.trim();
    const cleanTitle = req.title?.trim() || "Echo Collaboration Room";

    // Determine target workspace ID
    let resolvedWorkspaceId = targetWorkspaceId || req.workspaceId;

    if (!resolvedWorkspaceId) {
      const { data: roomData, error: fetchError } = await this.client
        .from("collaboration_rooms")
        .select("workspace_id")
        .eq("id", cleanRoomId)
        .maybeSingle();

      if (fetchError || !roomData) {
        throw new PersistenceError("NOT_FOUND", `Room ${cleanRoomId} not found`);
      }
      resolvedWorkspaceId = roomData.workspace_id;
    }

    if (!resolvedWorkspaceId) {
      throw new PersistenceError("VALIDATION_ERROR", "workspaceId could not be resolved for room");
    }

    // Role verification (defense in depth)
    await requireWorkspaceRole(this.client, resolvedWorkspaceId, actor, ["owner", "admin", "editor", "member"]);

    // 1. Attempt atomic close_collaboration_room_tx RPC
    try {
      const { data: rpcData, error: rpcError } = await this.client.rpc("close_collaboration_room_tx", {
        p_workspace_id: resolvedWorkspaceId,
        p_room_id: cleanRoomId,
        p_actor_id: actor.userId,
        p_last_known_state: lastKnownState || null,
        p_title: cleanTitle,
      });

      if (!rpcError && rpcData) {
        return {
          room: mapCollaborationRoomRow(rpcData),
        };
      }

      if (rpcError) {
        if (rpcError.code === "42501") {
          throw new PersistenceError("FORBIDDEN", rpcError.message);
        }
        if (rpcError.code !== "PGRST202" && rpcError.code !== "42883") {
          throw new PersistenceError("DATABASE_ERROR", `Failed to close room: ${rpcError.message}`);
        }
      }
    } catch (err: unknown) {
      if (err instanceof PersistenceError) {
        throw err;
      }
    }

    // 2. Fallback for mock/test environments without RPC
    const { data: existingRoom, error: checkError } = await this.client
      .from("collaboration_rooms")
      .select("*")
      .eq("id", cleanRoomId)
      .maybeSingle();

    if (checkError && checkError.code !== "PGRST116") {
      throw new PersistenceError("DATABASE_ERROR", `Failed to query room: ${checkError.message}`);
    }

    const now = new Date().toISOString();

    if (!existingRoom) {
      // Async Recovery: room start was dropped, create directly in 'closed' state
      const { data: recovered, error: recoverErr } = await this.client
        .from("collaboration_rooms")
        .insert({
          id: cleanRoomId,
          workspace_id: resolvedWorkspaceId,
          title: cleanTitle,
          status: "closed",
          created_by: actor.userId,
          last_known_state: lastKnownState || null,
          created_at: now,
          closed_at: now,
          updated_at: now,
        })
        .select("*")
        .single();

      if (recoverErr) {
        throw new PersistenceError("DATABASE_ERROR", `Failed to recover room: ${recoverErr.message}`);
      }
      return { room: mapCollaborationRoomRow(recovered) };
    }

    if (existingRoom.workspace_id !== resolvedWorkspaceId) {
      throw new PersistenceError("FORBIDDEN", `Room ${cleanRoomId} belongs to a different workspace`);
    }

    if (existingRoom.status === "closed") {
      return { room: mapCollaborationRoomRow(existingRoom) };
    }

    const { data: updated, error: updateError } = await this.client
      .from("collaboration_rooms")
      .update({
        status: "closed",
        closed_at: now,
        updated_at: now,
        last_known_state: lastKnownState || existingRoom.last_known_state,
      })
      .eq("id", cleanRoomId)
      .select("*")
      .single();

    if (updateError) {
      throw new PersistenceError("DATABASE_ERROR", `Failed to close room: ${updateError.message}`);
    }

    return {
      room: mapCollaborationRoomRow(updated),
    };
  }

  /**
   * Retrieves single room record by ID, validating workspace relationship.
   */
  async getRoom(actor: PersistenceActor, workspaceId: WorkspaceId, roomId: string): Promise<CollaborationRoomRecord> {
    await requireWorkspaceMember(this.client, workspaceId, actor);

    const { data, error } = await this.client
      .from("collaboration_rooms")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", roomId)
      .single();

    if (error || !data) {
      throw new PersistenceError("NOT_FOUND", `Room ${roomId} not found in workspace ${workspaceId}`);
    }

    return mapCollaborationRoomRow(data);
  }

  /**
   * Lists past collaboration rooms for a workspace ordered by created_at DESC.
   */
  async listRooms(actor: PersistenceActor, workspaceId: WorkspaceId): Promise<CollaborationRoomHistoryResponse> {
    await requireWorkspaceMember(this.client, workspaceId, actor);

    const { data, count, error } = await this.client
      .from("collaboration_rooms")
      .select("*", { count: "exact" })
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new PersistenceError("DATABASE_ERROR", error.message);
    }

    return {
      rooms: (data || []).map(mapCollaborationRoomRow),
      totalCount: count ?? 0,
    };
  }

  /**
   * Records a participant attending the collaboration room session.
   * Enforces composite tenancy (workspace_id, room_id).
   */
  async recordParticipant(
    actor: PersistenceActor,
    req: RecordCollaborationParticipantRequest
  ): Promise<CollaborationParticipantRecord> {
    const { roomId, workspaceId, userId, displayName, color } = req;

    await requireWorkspaceRole(this.client, workspaceId, actor, ["owner", "admin", "editor", "member"]);

    // Verify room exists in workspace
    const { data: room, error: roomError } = await this.client
      .from("collaboration_rooms")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("id", roomId)
      .single();

    if (roomError || !room) {
      throw new PersistenceError("NOT_FOUND", `Room ${roomId} not found in workspace ${workspaceId}`);
    }

    const { data, error } = await this.client
      .from("collaboration_room_participants")
      .upsert(
        {
          room_id: roomId,
          workspace_id: workspaceId,
          user_id: userId,
          display_name: displayName,
          color: color || "#6366f1",
          joined_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "room_id, user_id" }
      )
      .select("*")
      .single();

    if (error) {
      throw new PersistenceError("DATABASE_ERROR", `Failed to record participant: ${error.message}`);
    }

    return mapCollaborationParticipantRow(data);
  }

  /**
   * Lists historical attendees for a room session.
   */
  async listRoomParticipants(
    actor: PersistenceActor,
    workspaceId: WorkspaceId,
    roomId: string
  ): Promise<CollaborationParticipantRecord[]> {
    await requireWorkspaceMember(this.client, workspaceId, actor);

    const { data, error } = await this.client
      .from("collaboration_room_participants")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("room_id", roomId)
      .order("joined_at", { ascending: true });

    if (error) {
      throw new PersistenceError("DATABASE_ERROR", error.message);
    }

    return (data || []).map(mapCollaborationParticipantRow);
  }
}
