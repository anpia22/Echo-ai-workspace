-- ==============================================================================
-- PHASE 13.3 — Database Transaction Helpers & Stored Procedures
-- Echo Persistent Backend Workspace
--
-- Stored procedures providing true single-transaction guarantees for:
--   1. Atomic workspace creation (workspace + initial owner member in 1 tx)
--   2. Atomic canvas mutation (lock revision, check OCC, mutate, log action, bump revision in 1 tx)
--
-- SECURITY & INTEGRITY ARCHITECTURE:
-- Both procedures are SECURITY DEFINER with explicit search paths.
-- CRITICAL DEFENSE: They DO NOT blindly trust a client-supplied user/actor ID.
-- When called by regular authenticated users via PostgREST/client RPC, the function
-- extracts auth.uid() as authoritative. Client-supplied IDs that do not match auth.uid()
-- are rejected with ERRCODE 42501 (insufficient_privilege).
-- Execution from anon and PUBLIC is strictly revoked.
--
-- CANVAS EDGE IDENTITY & INTEGRITY:
-- Edge ID is authoritative (keyed by (workspace_id, id)).
-- If a logical edge (source_id, target_id, relationship) already exists under a
-- different ID, the mutation rejects the conflict (ERRCODE 23505) rather than silently
-- replacing or aliasing the requested ID.
--
-- CANVAS GROUP INTEGRITY:
-- memberIds must be a JSON array.
-- Every member ID must be a valid UUID.
-- Every member ID must exist as a canvas_node in the same workspace.
-- Duplicate member IDs within the group are rejected.
-- Malformed payloads raise a validation error (ERRCODE 22023).
-- Any failure causes the entire function invocation to roll back.
-- ==============================================================================

-- 1. Atomic Workspace Creation Function
CREATE OR REPLACE FUNCTION create_workspace_with_owner(
  p_id UUID,
  p_title TEXT,
  p_description TEXT,
  p_settings JSONB,
  p_user_id TEXT,
  p_display_name TEXT,
  p_color TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_workspace workspaces%ROWTYPE;
  v_member workspace_members%ROWTYPE;
  v_ws_id UUID;
  v_effective_actor TEXT;
  v_caller_role TEXT;
BEGIN
  -- Authoritative identity determination
  v_caller_role := auth.role();
  IF v_caller_role IS DISTINCT FROM 'service_role' THEN
    -- Client/user execution: actor is strictly auth.uid()
    v_effective_actor := auth.uid()::text;
    IF v_effective_actor IS NULL THEN
      RAISE EXCEPTION 'Unauthorized: Caller must be authenticated' USING ERRCODE = '42501';
    END IF;
    -- Reject spoofed user_id if client tried to supply someone else's ID
    IF p_user_id IS NOT NULL AND p_user_id <> v_effective_actor THEN
      RAISE EXCEPTION 'Forbidden: User ID does not match authenticated session' USING ERRCODE = '42501';
    END IF;
  ELSE
    -- Trusted server-side execution via service_role key
    v_effective_actor := p_user_id;
    IF v_effective_actor IS NULL OR trim(v_effective_actor) = '' THEN
      RAISE EXCEPTION 'Unauthorized: User ID required for service-role execution' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_ws_id := COALESCE(p_id, gen_random_uuid());

  -- Step 1: Insert workspace with revision = 1 (matching Phase 13.2 schema DEFAULT 1 & 1-based contract)
  INSERT INTO workspaces (id, title, description, settings, revision)
  VALUES (v_ws_id, p_title, p_description, COALESCE(p_settings, '{}'::jsonb), 1)
  RETURNING * INTO v_workspace;

  -- Step 2: Insert initial owner member in the same transaction
  INSERT INTO workspace_members (workspace_id, user_id, display_name, role, color)
  VALUES (v_ws_id, v_effective_actor, COALESCE(p_display_name, 'Owner'), 'owner', COALESCE(p_color, '#3b82f6'))
  RETURNING * INTO v_member;

  RETURN jsonb_build_object(
    'workspace', to_jsonb(v_workspace),
    'member', to_jsonb(v_member)
  );
END;
$$;

-- Revoke public/anon execution; allow only authenticated users and service_role
REVOKE EXECUTE ON FUNCTION create_workspace_with_owner(UUID, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_workspace_with_owner(UUID, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- 2. Atomic Canvas Mutation Function
CREATE OR REPLACE FUNCTION apply_canvas_mutation_tx(
  p_workspace_id UUID,
  p_actor_id TEXT,
  p_expected_revision BIGINT,
  p_upsert_nodes JSONB DEFAULT '[]'::jsonb,
  p_delete_node_ids JSONB DEFAULT '[]'::jsonb,
  p_upsert_edges JSONB DEFAULT '[]'::jsonb,
  p_delete_edge_ids JSONB DEFAULT '[]'::jsonb,
  p_upsert_groups JSONB DEFAULT '[]'::jsonb,
  p_delete_group_ids JSONB DEFAULT '[]'::jsonb,
  p_action JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_effective_actor TEXT;
  v_caller_role TEXT;
  v_current_revision BIGINT;
  v_new_revision BIGINT;
  v_node_elem JSONB;
  v_edge_elem JSONB;
  v_group_elem JSONB;
  v_del_id TEXT;
  v_applied_nodes INT := 0;
  v_applied_edges INT := 0;
  v_applied_groups INT := 0;
  v_action_record canvas_actions%ROWTYPE;
  v_member_id TEXT;
  v_req_edge_id UUID;
  v_source_id UUID;
  v_target_id UUID;
  v_rel TEXT;
  v_existing_logical_edge_id UUID;
BEGIN
  -- Step 1: Authoritative identity determination
  v_caller_role := auth.role();
  IF v_caller_role IS DISTINCT FROM 'service_role' THEN
    -- Client/user execution: actor is strictly auth.uid()
    v_effective_actor := auth.uid()::text;
    IF v_effective_actor IS NULL THEN
      RAISE EXCEPTION 'Unauthorized: Caller must be authenticated' USING ERRCODE = '42501';
    END IF;
    -- Reject spoofed actor_id if client passed someone else's ID
    IF p_actor_id IS NOT NULL AND p_actor_id <> v_effective_actor THEN
      RAISE EXCEPTION 'Forbidden: Actor ID does not match authenticated session' USING ERRCODE = '42501';
    END IF;
  ELSE
    -- Trusted server-side execution via service_role key
    v_effective_actor := p_actor_id;
    IF v_effective_actor IS NULL OR trim(v_effective_actor) = '' THEN
      RAISE EXCEPTION 'Unauthorized: Actor ID required for service-role execution' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Step 2: Authorize actor in workspace_members (must have editor/admin/owner role)
  IF NOT has_workspace_role(p_workspace_id, ARRAY['owner', 'admin', 'editor', 'member'], v_effective_actor) THEN
    RAISE EXCEPTION 'Forbidden: Actor % lacks write permission in workspace %', v_effective_actor, p_workspace_id
      USING ERRCODE = '42501';
  END IF;

  -- Step 3: Lock workspace row and validate revision
  SELECT revision INTO v_current_revision
  FROM workspaces
  WHERE id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workspace % not found', p_workspace_id USING ERRCODE = 'P0002';
  END IF;

  IF p_expected_revision IS NOT NULL AND v_current_revision <> p_expected_revision THEN
    RAISE EXCEPTION 'Stale workspace revision: current %, expected %', v_current_revision, p_expected_revision
      USING ERRCODE = '40001';
  END IF;

  -- Step 4: Delete requested nodes (cascades edges automatically)
  IF p_delete_node_ids IS NOT NULL AND jsonb_array_length(p_delete_node_ids) > 0 THEN
    FOR v_del_id IN SELECT jsonb_array_elements_text(p_delete_node_ids)
    LOOP
      DELETE FROM canvas_nodes WHERE workspace_id = p_workspace_id AND id = v_del_id::uuid;
    END LOOP;
  END IF;

  -- Step 5: Upsert nodes
  IF p_upsert_nodes IS NOT NULL AND jsonb_array_length(p_upsert_nodes) > 0 THEN
    FOR v_node_elem IN SELECT jsonb_array_elements(p_upsert_nodes)
    LOOP
      INSERT INTO canvas_nodes (id, workspace_id, node_type, title, description, position_x, position_y, updated_at)
      VALUES (
        (v_node_elem->>'id')::uuid,
        p_workspace_id,
        v_node_elem->>'nodeType',
        v_node_elem->>'title',
        v_node_elem->>'description',
        COALESCE((v_node_elem->>'positionX')::double precision, 0),
        COALESCE((v_node_elem->>'positionY')::double precision, 0),
        timezone('utc'::text, now())
      )
      ON CONFLICT (workspace_id, id) DO UPDATE SET
        node_type = EXCLUDED.node_type,
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        position_x = EXCLUDED.position_x,
        position_y = EXCLUDED.position_y,
        version = canvas_nodes.version + 1,
        updated_at = EXCLUDED.updated_at;

      v_applied_nodes := v_applied_nodes + 1;
    END LOOP;
  END IF;

  -- Step 6: Delete requested edges
  IF p_delete_edge_ids IS NOT NULL AND jsonb_array_length(p_delete_edge_ids) > 0 THEN
    FOR v_del_id IN SELECT jsonb_array_elements_text(p_delete_edge_ids)
    LOOP
      DELETE FROM canvas_edges WHERE workspace_id = p_workspace_id AND id = v_del_id::uuid;
    END LOOP;
  END IF;

  -- Step 7: Upsert edges (authoritative edge ID + logical conflict detection)
  IF p_upsert_edges IS NOT NULL AND jsonb_array_length(p_upsert_edges) > 0 THEN
    FOR v_edge_elem IN SELECT jsonb_array_elements(p_upsert_edges)
    LOOP
      v_req_edge_id := (v_edge_elem->>'id')::uuid;
      v_source_id := (v_edge_elem->>'sourceId')::uuid;
      v_target_id := (v_edge_elem->>'targetId')::uuid;
      v_rel := COALESCE(v_edge_elem->>'relationship', '');

      IF v_req_edge_id IS NULL THEN
        RAISE EXCEPTION 'Edge validation error: Edge ID is required' USING ERRCODE = '22023';
      END IF;

      -- Check if logical edge (source_id, target_id, relationship) already exists with another ID
      SELECT id INTO v_existing_logical_edge_id
      FROM canvas_edges
      WHERE workspace_id = p_workspace_id
        AND source_id = v_source_id
        AND target_id = v_target_id
        AND relationship = v_rel;

      IF v_existing_logical_edge_id IS NOT NULL AND v_existing_logical_edge_id <> v_req_edge_id THEN
        RAISE EXCEPTION 'Edge conflict: Logical edge between % and % with relationship % already exists with ID %, conflicting with requested ID %',
          v_source_id, v_target_id, v_rel, v_existing_logical_edge_id, v_req_edge_id
          USING ERRCODE = '23505';
      END IF;

      -- Upsert with authoritative edge ID
      INSERT INTO canvas_edges (id, workspace_id, source_id, target_id, relationship, updated_at)
      VALUES (v_req_edge_id, p_workspace_id, v_source_id, v_target_id, v_rel, timezone('utc'::text, now()))
      ON CONFLICT (workspace_id, id) DO UPDATE SET
        source_id = EXCLUDED.source_id,
        target_id = EXCLUDED.target_id,
        relationship = EXCLUDED.relationship,
        updated_at = EXCLUDED.updated_at;

      v_applied_edges := v_applied_edges + 1;
    END LOOP;
  END IF;

  -- Step 8: Delete requested groups
  IF p_delete_group_ids IS NOT NULL AND jsonb_array_length(p_delete_group_ids) > 0 THEN
    FOR v_del_id IN SELECT jsonb_array_elements_text(p_delete_group_ids)
    LOOP
      DELETE FROM canvas_groups WHERE workspace_id = p_workspace_id AND id = v_del_id::uuid;
    END LOOP;
  END IF;

  -- Step 9: Validate and upsert groups (strict deep validation)
  IF p_upsert_groups IS NOT NULL AND jsonb_array_length(p_upsert_groups) > 0 THEN
    FOR v_group_elem IN SELECT jsonb_array_elements(p_upsert_groups)
    LOOP
      -- 1. Validate group ID
      IF (v_group_elem->>'id') IS NULL OR (v_group_elem->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'Group validation error: Invalid or malformed group ID %', (v_group_elem->>'id') USING ERRCODE = '22023';
      END IF;

      -- 2. Validate group title
      IF (v_group_elem->>'title') IS NULL OR trim(v_group_elem->>'title') = '' THEN
        RAISE EXCEPTION 'Group validation error: Group title cannot be empty' USING ERRCODE = '22023';
      END IF;

      -- 3. Validate memberIds is a JSON array
      IF (v_group_elem->'memberIds') IS NULL OR jsonb_typeof(v_group_elem->'memberIds') <> 'array' THEN
        RAISE EXCEPTION 'Group validation error: memberIds must be a JSON array for group %', (v_group_elem->>'id')
          USING ERRCODE = '22023';
      END IF;

      -- 4. Validate each member ID: non-empty, valid UUID format, and exists in this workspace
      FOR v_member_id IN SELECT jsonb_array_elements_text(v_group_elem->'memberIds')
      LOOP
        IF v_member_id IS NULL OR trim(v_member_id) = '' OR v_member_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
          RAISE EXCEPTION 'Group validation error: Malformed or invalid UUID member ID % in group %', v_member_id, (v_group_elem->>'id')
            USING ERRCODE = '22023';
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM canvas_nodes WHERE workspace_id = p_workspace_id AND id = v_member_id::uuid
        ) THEN
          RAISE EXCEPTION 'Group member % does not exist in workspace %', v_member_id, p_workspace_id
            USING ERRCODE = '23503';
        END IF;
      END LOOP;

      -- 5. Reject duplicate member IDs within the group
      IF (
        SELECT COUNT(*) FROM jsonb_array_elements_text(v_group_elem->'memberIds') AS m
      ) <> (
        SELECT COUNT(DISTINCT m) FROM jsonb_array_elements_text(v_group_elem->'memberIds') AS m
      ) THEN
        RAISE EXCEPTION 'Group validation error: Duplicate member IDs detected in group %', (v_group_elem->>'id')
          USING ERRCODE = '22023';
      END IF;

      INSERT INTO canvas_groups (id, workspace_id, title, member_ids, color, updated_at)
      VALUES (
        (v_group_elem->>'id')::uuid,
        p_workspace_id,
        v_group_elem->>'title',
        COALESCE(v_group_elem->'memberIds', '[]'::jsonb),
        v_group_elem->>'color',
        timezone('utc'::text, now())
      )
      ON CONFLICT (workspace_id, id) DO UPDATE SET
        title = EXCLUDED.title,
        member_ids = EXCLUDED.member_ids,
        color = EXCLUDED.color,
        updated_at = EXCLUDED.updated_at;

      v_applied_groups := v_applied_groups + 1;
    END LOOP;
  END IF;

  -- Step 10: Append canvas action if provided (strictly append-only)
  IF p_action IS NOT NULL AND (p_action->>'actionType') IS NOT NULL THEN
    INSERT INTO canvas_actions (id, workspace_id, conversation_id, action_type, payload, metadata, applied_by)
    VALUES (
      COALESCE((p_action->>'id')::uuid, gen_random_uuid()),
      p_workspace_id,
      (p_action->>'conversationId')::uuid,
      p_action->>'actionType',
      COALESCE(p_action->'payload', '{}'::jsonb),
      COALESCE(p_action->'metadata', '{}'::jsonb),
      v_effective_actor
    )
    RETURNING * INTO v_action_record;
  END IF;

  -- Step 11: Increment workspace revision exactly once in the transaction
  UPDATE workspaces
  SET revision = v_current_revision + 1,
      updated_at = timezone('utc'::text, now())
  WHERE id = p_workspace_id
  RETURNING revision INTO v_new_revision;

  RETURN jsonb_build_object(
    'accepted', true,
    'workspaceId', p_workspace_id,
    'newRevision', v_new_revision,
    'appliedNodeCount', v_applied_nodes,
    'appliedEdgeCount', v_applied_edges,
    'appliedGroupCount', v_applied_groups
  );
END;
$$;

-- Revoke public/anon execution; allow only authenticated users and service_role
REVOKE EXECUTE ON FUNCTION apply_canvas_mutation_tx(UUID, TEXT, BIGINT, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION apply_canvas_mutation_tx(UUID, TEXT, BIGINT, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB) TO authenticated, service_role;
