/**
 * Phase 13.3 — Workspace Repository
 *
 * Implements server-side workspace persistence, atomic creation (workspace + owner in 1 tx),
 * hydration loading, and member resolution.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CreateWorkspaceRequest,
  CreateWorkspaceResponse,
  LoadWorkspaceResponse,
  MessageRecord,
  Workspace,
  WorkspaceId,
  WorkspaceMember,
} from "../index";
import {
  type PersistenceActor,
  PersistenceError,
  getServerSupabaseClient,
  mapWorkspaceRow,
  mapWorkspaceMemberRow,
  mapConversationRow,
  mapMessageRow,
  mapCanvasNodeRow,
  mapCanvasEdgeRow,
  mapCanvasGroupRow,
  mapMeetingRow,
  requireWorkspaceMember,
} from "../server";

export class WorkspaceRepository {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient = getServerSupabaseClient()) {
    this.client = client;
  }

  /**
   * Atomically creates a workspace and assigns the caller as initial owner in a single transaction.
   */
  async createWorkspace(
    actor: PersistenceActor,
    req: CreateWorkspaceRequest,
    displayName = "Owner",
    color = "#3b82f6"
  ): Promise<CreateWorkspaceResponse> {
    if (!req.title || req.title.trim() === "") {
      throw new PersistenceError("VALIDATION_ERROR", "Workspace title cannot be empty");
    }

    // Execute atomic PostgreSQL RPC procedure: create_workspace_with_owner
    const { data, error } = await this.client.rpc("create_workspace_with_owner", {
      p_id: req.id || null,
      p_title: req.title.trim(),
      p_description: req.description || null,
      p_settings: req.settings || {},
      p_user_id: actor.userId,
      p_display_name: displayName,
      p_color: color,
    });

    if (error) {
      throw new PersistenceError("DATABASE_ERROR", `Failed to create workspace atomically: ${error.message}`);
    }

    if (!data || !data.workspace || !data.member) {
      throw new PersistenceError("DATABASE_ERROR", "Invalid response from create_workspace_with_owner RPC");
    }

    return {
      workspace: mapWorkspaceRow(data.workspace),
      member: mapWorkspaceMemberRow(data.member),
    };
  }

  /**
   * Hydrates the complete workspace hierarchy in a verified, authorized bundle.
   */
  async loadWorkspace(actor: PersistenceActor, workspaceId: WorkspaceId): Promise<LoadWorkspaceResponse> {
    // 1. Verify caller membership & authorization
    await requireWorkspaceMember(this.client, workspaceId, actor);

    // 2. Fetch workspace root
    const { data: wsData, error: wsError } = await this.client
      .from("workspaces")
      .select("*")
      .eq("id", workspaceId)
      .single();

    if (wsError || !wsData) {
      throw new PersistenceError("NOT_FOUND", `Workspace ${workspaceId} not found`);
    }

    // 3. Parallel fetch of workspace children
    const [membersRes, convsRes, nodesRes, edgesRes, groupsRes, meetingsRes] = await Promise.all([
      this.client.from("workspace_members").select("*").eq("workspace_id", workspaceId),
      this.client.from("conversations").select("*").eq("workspace_id", workspaceId).order("updated_at", { ascending: false }),
      this.client.from("canvas_nodes").select("*").eq("workspace_id", workspaceId),
      this.client.from("canvas_edges").select("*").eq("workspace_id", workspaceId),
      this.client.from("canvas_groups").select("*").eq("workspace_id", workspaceId),
      this.client.from("meetings").select("*").eq("workspace_id", workspaceId).order("started_at", { ascending: false }).limit(10),
    ]);

    if (membersRes.error) throw new PersistenceError("DATABASE_ERROR", membersRes.error.message);
    if (convsRes.error) throw new PersistenceError("DATABASE_ERROR", convsRes.error.message);
    if (nodesRes.error) throw new PersistenceError("DATABASE_ERROR", nodesRes.error.message);
    if (edgesRes.error) throw new PersistenceError("DATABASE_ERROR", edgesRes.error.message);
    if (groupsRes.error) throw new PersistenceError("DATABASE_ERROR", groupsRes.error.message);
    if (meetingsRes.error) throw new PersistenceError("DATABASE_ERROR", meetingsRes.error.message);

    const workspace: Workspace = mapWorkspaceRow(wsData);
    const members: WorkspaceMember[] = (membersRes.data || []).map(mapWorkspaceMemberRow);
    const conversations = (convsRes.data || []).map(mapConversationRow);

    // 4. Fetch active conversation messages if a conversation exists
    let activeMessages: MessageRecord[] = [];
    if (conversations.length > 0) {
      const activeConvId = conversations[0].id;
      const { data: msgData, error: msgError } = await this.client
        .from("messages")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("conversation_id", activeConvId)
        .order("created_at", { ascending: true });

      if (msgError) throw new PersistenceError("DATABASE_ERROR", msgError.message);
      activeMessages = (msgData || []).map(mapMessageRow);
    }

    return {
      workspace,
      members,
      conversations,
      activeConversationMessages: activeMessages,
      canvas: {
        workspaceId,
        revision: workspace.revision,
        nodes: (nodesRes.data || []).map(mapCanvasNodeRow),
        edges: (edgesRes.data || []).map(mapCanvasEdgeRow),
        groups: (groupsRes.data || []).map(mapCanvasGroupRow),
      },
      recentMeetings: (meetingsRes.data || []).map(mapMeetingRow),
    };
  }

  /**
   * Lists all members of a workspace.
   */
  async listMembers(actor: PersistenceActor, workspaceId: WorkspaceId): Promise<WorkspaceMember[]> {
    await requireWorkspaceMember(this.client, workspaceId, actor);

    const { data, error } = await this.client
      .from("workspace_members")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true });

    if (error) {
      throw new PersistenceError("DATABASE_ERROR", error.message);
    }

    return (data || []).map(mapWorkspaceMemberRow);
  }
}
