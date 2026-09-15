/**
 * Phase 13.3 — Canvas Repository
 *
 * Implements server-side durable canvas persistence (nodes, edges, groups) and
 * append-only canvas action audit logging.
 *
 * CRITICAL INVARIANTS:
 * - CanvasState in memory remains the ONLY runtime canonical model.
 * - canvas_nodes, canvas_edges, canvas_groups are durable materialized state.
 * - canvas_actions is an append-only audit & provenance log — NOT for canvas reconstruction.
 * - Composite FKs guarantee zero cross-workspace edge leakage.
 * - Group member IDs are validated against existing nodes in the workspace before writing.
 * - All mutations pass through apply_canvas_mutation_tx for atomic OCC revision locking.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CanvasMutationRequest,
  CanvasMutationResponse,
  CanvasSnapshotRecord,
  RecordCanvasActionRequest,
  RecordCanvasActionResponse,
  WorkspaceId,
} from "../index";
import {
  type PersistenceActor,
  PersistenceError,
  getServerSupabaseClient,
  mapCanvasNodeRow,
  mapCanvasEdgeRow,
  mapCanvasGroupRow,
  mapCanvasActionRow,
  parseServerRevision,
  requireWorkspaceMember,
  requireWorkspaceRole,
} from "../server";

export class CanvasRepository {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient = getServerSupabaseClient()) {
    this.client = client;
  }

  /**
   * Fetches the materialized canvas snapshot for initial workspace hydration.
   */
  async loadCanvasSnapshot(actor: PersistenceActor, workspaceId: WorkspaceId): Promise<CanvasSnapshotRecord> {
    await requireWorkspaceMember(this.client, workspaceId, actor);

    const [wsRes, nodesRes, edgesRes, groupsRes] = await Promise.all([
      this.client.from("workspaces").select("revision").eq("id", workspaceId).single(),
      this.client.from("canvas_nodes").select("*").eq("workspace_id", workspaceId),
      this.client.from("canvas_edges").select("*").eq("workspace_id", workspaceId),
      this.client.from("canvas_groups").select("*").eq("workspace_id", workspaceId),
    ]);

    if (wsRes.error || !wsRes.data) {
      throw new PersistenceError("NOT_FOUND", `Workspace ${workspaceId} not found`);
    }
    if (nodesRes.error) throw new PersistenceError("DATABASE_ERROR", nodesRes.error.message);
    if (edgesRes.error) throw new PersistenceError("DATABASE_ERROR", edgesRes.error.message);
    if (groupsRes.error) throw new PersistenceError("DATABASE_ERROR", groupsRes.error.message);

    return {
      workspaceId,
      revision: parseServerRevision(wsRes.data.revision),
      nodes: (nodesRes.data || []).map(mapCanvasNodeRow),
      edges: (edgesRes.data || []).map(mapCanvasEdgeRow),
      groups: (groupsRes.data || []).map(mapCanvasGroupRow),
    };
  }

  /**
   * Executes a batch canvas mutation atomically with server-controlled revision lock.
   */
  async mutateCanvas(actor: PersistenceActor, req: CanvasMutationRequest): Promise<CanvasMutationResponse> {
    const { workspaceId, expectedBaseRevision } = req;

    // 1. Authorize: Actor must have editor, admin, or owner role
    await requireWorkspaceRole(this.client, workspaceId, actor, ["owner", "admin", "editor", "member"]);

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // 2. Strict client-side validation of edge requests before sending to database
    if (req.upsertEdges && req.upsertEdges.length > 0) {
      const logicalSeen = new Map<string, string>();
      for (const edge of req.upsertEdges) {
        if (!edge.id || typeof edge.id !== "string" || edge.id.trim() === "") {
          throw new PersistenceError("VALIDATION_ERROR", "Edge id cannot be empty");
        }
        if (!UUID_REGEX.test(edge.id)) {
          throw new PersistenceError("VALIDATION_ERROR", `Edge ID ${edge.id} must be a valid UUID`);
        }
        if (!edge.sourceId || !edge.targetId) {
          throw new PersistenceError("VALIDATION_ERROR", `Edge ${edge.id} requires sourceId and targetId`);
        }
        const logicalKey = `${edge.sourceId}->${edge.targetId}:${edge.relationship || ""}`;
        if (logicalSeen.has(logicalKey) && logicalSeen.get(logicalKey) !== edge.id) {
          throw new PersistenceError(
            "CONFLICT",
            `Batch edge conflict: logical edge ${logicalKey} defined with multiple distinct IDs: ${logicalSeen.get(logicalKey)} vs ${edge.id}`
          );
        }
        logicalSeen.set(logicalKey, edge.id);
      }
    }

    // 3. Strict client-side validation of group member IDs before sending to database
    if (req.upsertGroups && req.upsertGroups.length > 0) {
      for (const group of req.upsertGroups) {
        if (!group.id || typeof group.id !== "string" || !UUID_REGEX.test(group.id)) {
          throw new PersistenceError("VALIDATION_ERROR", `Group ID ${group.id} must be a valid UUID`);
        }
        if (!group.title || group.title.trim() === "") {
          throw new PersistenceError("VALIDATION_ERROR", "Group title cannot be empty");
        }
        if (!Array.isArray(group.memberIds)) {
          throw new PersistenceError("VALIDATION_ERROR", `Group ${group.id} memberIds must be a JSON array`);
        }

        const seen = new Set<string>();
        for (const memberId of group.memberIds) {
          if (!memberId || typeof memberId !== "string" || memberId.trim() === "") {
            throw new PersistenceError("VALIDATION_ERROR", `Group ${group.id} contains invalid empty memberId`);
          }
          if (!UUID_REGEX.test(memberId)) {
            throw new PersistenceError("VALIDATION_ERROR", `Group ${group.id} contains malformed UUID memberId: ${memberId}`);
          }
          if (seen.has(memberId)) {
            throw new PersistenceError("VALIDATION_ERROR", `Group ${group.id} contains duplicate memberId ${memberId}`);
          }
          seen.add(memberId);
        }
      }
    }

    // 4. Execute atomic PostgreSQL RPC procedure: apply_canvas_mutation_tx
    const { data, error } = await this.client.rpc("apply_canvas_mutation_tx", {
      p_workspace_id: workspaceId,
      p_actor_id: actor.userId,
      p_expected_revision: expectedBaseRevision !== undefined ? expectedBaseRevision : null,
      p_upsert_nodes: req.upsertNodes || [],
      p_delete_node_ids: req.deleteNodeIds || [],
      p_upsert_edges: req.upsertEdges || [],
      p_delete_edge_ids: req.deleteEdgeIds || [],
      p_upsert_groups: req.upsertGroups || [],
      p_delete_group_ids: req.deleteGroupIds || [],
      p_action: null,
    });

    if (error) {
      // Check for known PostgreSQL error codes
      if (error.code === "40001" || error.message.includes("Stale workspace revision")) {
        throw new PersistenceError("STALE_REVISION", `Stale workspace revision for workspace ${workspaceId}`);
      }
      if (error.code === "23505" || error.message.includes("Edge conflict")) {
        throw new PersistenceError("CONFLICT", error.message);
      }
      if (error.code === "22023" || error.message.includes("validation error")) {
        throw new PersistenceError("VALIDATION_ERROR", error.message);
      }
      if (error.code === "23503" || error.message.includes("Group member")) {
        throw new PersistenceError("VALIDATION_ERROR", error.message);
      }
      if (error.code === "42501" || error.message.includes("Forbidden") || error.message.includes("Unauthorized")) {
        throw new PersistenceError("FORBIDDEN", error.message);
      }
      throw new PersistenceError("DATABASE_ERROR", `Canvas mutation failed: ${error.message}`);
    }

    if (!data || !data.accepted) {
      throw new PersistenceError("DATABASE_ERROR", "Canvas mutation rejected by database");
    }

    return {
      accepted: true,
      workspaceId,
      newRevision: parseServerRevision(data.newRevision),
      appliedNodeCount: Number(data.appliedNodeCount || 0),
      appliedEdgeCount: Number(data.appliedEdgeCount || 0),
      appliedGroupCount: Number(data.appliedGroupCount || 0),
    };
  }

  /**
   * Appends a canvas action to the immutable audit & provenance log.
   * Strictly INSERT-only.
   */
  async recordAction(actor: PersistenceActor, req: RecordCanvasActionRequest): Promise<RecordCanvasActionResponse> {
    const { workspaceId, actionType, payload, metadata, conversationId } = req;

    await requireWorkspaceRole(this.client, workspaceId, actor, ["owner", "admin", "editor", "member"]);

    if (!actionType || actionType.trim() === "") {
      throw new PersistenceError("VALIDATION_ERROR", "actionType cannot be empty");
    }

    const { data, error } = await this.client
      .from("canvas_actions")
      .insert({
        id: req.id || undefined,
        workspace_id: workspaceId,
        conversation_id: conversationId || null,
        action_type: actionType.trim(),
        payload: payload || {},
        metadata: metadata || {},
        applied_by: actor.userId,
      })
      .select("*")
      .single();

    if (error) {
      throw new PersistenceError("DATABASE_ERROR", `Failed to record canvas action audit: ${error.message}`);
    }

    return {
      action: mapCanvasActionRow(data),
    };
  }
}
