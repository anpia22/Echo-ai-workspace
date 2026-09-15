-- ==============================================================================
-- Phase 13.9: Client Migration & Cutover (echo-conversations)
--
-- Provides atomic, server-authoritative stored procedure for migrating legacy
-- localStorage data (conversations, messages, canvas) into PostgreSQL workspaces.
--
-- Invariants & Hardening:
-- 1. Single atomic all-or-nothing transaction: any failure rolls back completely.
-- 2. Concurrency-safe sequence assignment with row locks (SELECT FOR UPDATE).
-- 3. Cross-workspace ID collision detection: aborts on collision.
-- 4. Non-destructive idempotency: reuses existing conversations, preserves
--    existing server messages, safely backfills missing messages on retry.
-- 5. Strict canvas 0+0+0 emptiness check (nodes + edges + groups = 0).
-- 6. Deterministic latest canvas selection (updatedAt DESC, id DESC).
-- 7. Server-authoritative timestamps (timezone('utc', now())).
-- 8. SECURITY DEFINER with search_path = public, extensions.
-- 9. Execution revoked from PUBLIC, granted to authenticated and service_role.
-- ==============================================================================

CREATE OR REPLACE FUNCTION migrate_workspace_tx(
  p_workspace_id UUID,
  p_actor_id TEXT,
  p_conversations JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_conv JSONB;
  v_msg JSONB;
  v_node JSONB;
  v_edge JSONB;
  v_group JSONB;
  v_conv_id UUID;
  v_msg_id UUID;
  v_node_id UUID;
  v_edge_id UUID;
  v_group_id UUID;
  v_source_id UUID;
  v_target_id UUID;
  v_title TEXT;
  v_role TEXT;
  v_content TEXT;
  v_next_sequence BIGINT;
  v_canvas_count BIGINT;
  v_imported_conversations INT := 0;
  v_imported_messages INT := 0;
  v_skipped_duplicates INT := 0;
  v_imported_nodes INT := 0;
  v_imported_edges INT := 0;
  v_imported_groups INT := 0;
  v_best_canvas JSONB := NULL;
  v_best_updated_at TEXT := '';
  v_best_id TEXT := '';
  v_curr_updated_at TEXT;
  v_curr_id TEXT;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
  -- 1. Authorization: verify actor write permission
  IF NOT has_workspace_role(p_workspace_id, ARRAY['owner', 'admin', 'editor', 'member']::TEXT[], p_actor_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: User % lacks write permission on workspace %', p_actor_id, p_workspace_id;
  END IF;

  -- 2. Validate workspace exists
  IF NOT EXISTS (SELECT 1 FROM workspaces WHERE id = p_workspace_id) THEN
    RAISE EXCEPTION 'NOT_FOUND: Workspace % does not exist', p_workspace_id;
  END IF;

  -- 3. Cross-Workspace Collision Pre-check & Payload Integrity
  IF p_conversations IS NOT NULL AND jsonb_typeof(p_conversations) = 'array' THEN
    FOR v_conv IN SELECT * FROM jsonb_array_elements(p_conversations)
    LOOP
      v_conv_id := (v_conv->>'id')::UUID;
      
      -- Check for conversation collision in another workspace
      IF EXISTS (
        SELECT 1 FROM conversations 
        WHERE id = v_conv_id AND workspace_id != p_workspace_id
      ) THEN
        RAISE EXCEPTION 'COLLISION: Conversation ID % already belongs to a different workspace', v_conv_id;
      END IF;

      -- Check for message collisions in another workspace or different conversation in same workspace
      IF v_conv->'messages' IS NOT NULL AND jsonb_typeof(v_conv->'messages') = 'array' THEN
        FOR v_msg IN SELECT * FROM jsonb_array_elements(v_conv->'messages')
        LOOP
          v_msg_id := (v_msg->>'id')::UUID;
          -- Check if message exists in another workspace
          IF EXISTS (
            SELECT 1 FROM messages
            WHERE id = v_msg_id AND workspace_id != p_workspace_id
          ) THEN
            RAISE EXCEPTION 'COLLISION: Message ID % already belongs to a different workspace', v_msg_id;
          END IF;

          -- Check if message exists in the same workspace but a different conversation
          IF EXISTS (
            SELECT 1 FROM messages
            WHERE id = v_msg_id AND workspace_id = p_workspace_id AND conversation_id != v_conv_id
          ) THEN
            RAISE EXCEPTION 'COLLISION: Message ID % already belongs to a different conversation in workspace %', v_msg_id, p_workspace_id;
          END IF;
        END LOOP;
      END IF;

      -- Check for canvas collisions in another workspace
      IF v_conv->'canvas' IS NOT NULL AND jsonb_typeof(v_conv->'canvas'->'nodes') = 'array' THEN
        FOR v_node IN SELECT * FROM jsonb_array_elements(v_conv->'canvas'->'nodes')
        LOOP
          v_node_id := (v_node->>'id')::UUID;
          IF EXISTS (
            SELECT 1 FROM canvas_nodes
            WHERE id = v_node_id AND workspace_id != p_workspace_id
          ) THEN
            RAISE EXCEPTION 'COLLISION: Canvas node ID % already belongs to a different workspace', v_node_id;
          END IF;
        END LOOP;
      END IF;

      IF v_conv->'canvas' IS NOT NULL AND jsonb_typeof(v_conv->'canvas'->'edges') = 'array' THEN
        FOR v_edge IN SELECT * FROM jsonb_array_elements(v_conv->'canvas'->'edges')
        LOOP
          v_edge_id := (v_edge->>'id')::UUID;
          IF EXISTS (
            SELECT 1 FROM canvas_edges
            WHERE id = v_edge_id AND workspace_id != p_workspace_id
          ) THEN
            RAISE EXCEPTION 'COLLISION: Canvas edge ID % already belongs to a different workspace', v_edge_id;
          END IF;
        END LOOP;
      END IF;

      IF v_conv->'canvas' IS NOT NULL AND jsonb_typeof(v_conv->'canvas'->'groups') = 'array' THEN
        FOR v_group IN SELECT * FROM jsonb_array_elements(v_conv->'canvas'->'groups')
        LOOP
          v_group_id := (v_group->>'id')::UUID;
          IF EXISTS (
            SELECT 1 FROM canvas_groups
            WHERE id = v_group_id AND workspace_id != p_workspace_id
          ) THEN
            RAISE EXCEPTION 'COLLISION: Canvas group ID % already belongs to a different workspace', v_group_id;
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  -- 4. Ingest Conversations and Messages
  IF p_conversations IS NOT NULL AND jsonb_typeof(p_conversations) = 'array' THEN
    FOR v_conv IN SELECT * FROM jsonb_array_elements(p_conversations)
    LOOP
      v_conv_id := (v_conv->>'id')::UUID;
      v_title := trim(COALESCE(v_conv->>'title', 'New Conversation'));
      IF v_title = '' THEN
        v_title := 'New Conversation';
      END IF;

      -- Check if conversation already exists in this workspace
      IF NOT EXISTS (
        SELECT 1 FROM conversations WHERE id = v_conv_id AND workspace_id = p_workspace_id
      ) THEN
        INSERT INTO conversations (
          id, workspace_id, title, metadata, created_at, updated_at
        ) VALUES (
          v_conv_id, p_workspace_id, v_title, '{}'::jsonb, v_now, v_now
        )
        ON CONFLICT (id) DO NOTHING;
        v_imported_conversations := v_imported_conversations + 1;
      END IF;

      -- Sequence Concurrency Lock: Lock the conversation row to serialize MAX(sequence) + 1
      PERFORM 1 FROM conversations 
      WHERE id = v_conv_id AND workspace_id = p_workspace_id 
      FOR UPDATE;

      -- Ingest Messages for this conversation
      IF v_conv->'messages' IS NOT NULL AND jsonb_typeof(v_conv->'messages') = 'array' THEN
        FOR v_msg IN SELECT * FROM jsonb_array_elements(v_conv->'messages')
        LOOP
          v_msg_id := (v_msg->>'id')::UUID;
          v_role := COALESCE(v_msg->>'role', 'user');
          IF v_role NOT IN ('user', 'assistant', 'system') THEN
            v_role := 'user';
          END IF;
          v_content := COALESCE(v_msg->>'content', '');

          -- Check if message already exists with identical identity (workspace, conversation, id)
          IF EXISTS (
            SELECT 1 FROM messages
            WHERE id = v_msg_id AND workspace_id = p_workspace_id AND conversation_id = v_conv_id
          ) THEN
            -- Exact duplicate match: preserve server record, skip duplicate
            v_skipped_duplicates := v_skipped_duplicates + 1;
          ELSIF EXISTS (
            SELECT 1 FROM messages
            WHERE id = v_msg_id
          ) THEN
            -- Conflict: message ID exists in another conversation or another workspace!
            RAISE EXCEPTION 'COLLISION: Message ID % already exists in a different conversation or workspace', v_msg_id;
          ELSE
            -- Missing message: compute next sequence under conversation lock
            SELECT COALESCE(MAX(sequence), 0) + 1
            INTO v_next_sequence
            FROM messages
            WHERE workspace_id = p_workspace_id AND conversation_id = v_conv_id;

            INSERT INTO messages (
              id, conversation_id, workspace_id, role, content, sender_id, sequence, metadata, created_at, updated_at
            ) VALUES (
              v_msg_id, v_conv_id, p_workspace_id, v_role, v_content, p_actor_id, v_next_sequence, '{}'::jsonb, v_now, v_now
            );

            v_imported_messages := v_imported_messages + 1;
          END IF;
        END LOOP;
      END IF;

      -- Track deterministic candidate for canvas import
      IF v_conv->'canvas' IS NOT NULL AND jsonb_typeof(v_conv->'canvas'->'nodes') = 'array' 
         AND jsonb_array_length(v_conv->'canvas'->'nodes') > 0 THEN
        v_curr_updated_at := COALESCE(v_conv->>'updatedAt', '');
        v_curr_id := COALESCE(v_conv->>'id', '');
        
        IF v_best_canvas IS NULL 
           OR v_curr_updated_at > v_best_updated_at 
           OR (v_curr_updated_at = v_best_updated_at AND v_curr_id > v_best_id) THEN
          v_best_canvas := v_conv->'canvas';
          v_best_updated_at := v_curr_updated_at;
          v_best_id := v_curr_id;
        END IF;
      END IF;

    END LOOP;
  END IF;

  -- 5. Deterministic Canvas Import (Strict 0+0+0 Emptiness Invariant)
  SELECT 
    (SELECT COUNT(*) FROM canvas_nodes WHERE workspace_id = p_workspace_id) +
    (SELECT COUNT(*) FROM canvas_edges WHERE workspace_id = p_workspace_id) +
    (SELECT COUNT(*) FROM canvas_groups WHERE workspace_id = p_workspace_id)
  INTO v_canvas_count;

  IF v_canvas_count = 0 AND v_best_canvas IS NOT NULL THEN
    -- A. Canvas Nodes
    IF v_best_canvas->'nodes' IS NOT NULL AND jsonb_typeof(v_best_canvas->'nodes') = 'array' THEN
      FOR v_node IN SELECT * FROM jsonb_array_elements(v_best_canvas->'nodes')
      LOOP
        v_node_id := (v_node->>'id')::UUID;
        INSERT INTO canvas_nodes (
          id, workspace_id, node_type, title, description, position_x, position_y, version, metadata, created_at, updated_at
        ) VALUES (
          v_node_id,
          p_workspace_id,
          COALESCE(v_node->>'nodeType', 'default'),
          COALESCE(v_node->>'title', 'Node'),
          v_node->>'description',
          COALESCE((v_node->'position'->>'x')::DOUBLE PRECISION, 0),
          COALESCE((v_node->'position'->>'y')::DOUBLE PRECISION, 0),
          1,
          '{}'::jsonb,
          v_now,
          v_now
        )
        ON CONFLICT (workspace_id, id) DO NOTHING;
        v_imported_nodes := v_imported_nodes + 1;
      END LOOP;
    END IF;

    -- B. Canvas Edges (Only if source & target exist in canvas_nodes of this workspace)
    IF v_best_canvas->'edges' IS NOT NULL AND jsonb_typeof(v_best_canvas->'edges') = 'array' THEN
      FOR v_edge IN SELECT * FROM jsonb_array_elements(v_best_canvas->'edges')
      LOOP
        v_edge_id := (v_edge->>'id')::UUID;
        v_source_id := (v_edge->>'sourceId')::UUID;
        v_target_id := (v_edge->>'targetId')::UUID;

        IF EXISTS (SELECT 1 FROM canvas_nodes WHERE workspace_id = p_workspace_id AND id = v_source_id)
           AND EXISTS (SELECT 1 FROM canvas_nodes WHERE workspace_id = p_workspace_id AND id = v_target_id) THEN
          INSERT INTO canvas_edges (
            id, workspace_id, source_id, target_id, relationship, created_at, updated_at
          ) VALUES (
            v_edge_id,
            p_workspace_id,
            v_source_id,
            v_target_id,
            COALESCE(v_edge->>'relationship', ''),
            v_now,
            v_now
          )
          ON CONFLICT (workspace_id, id) DO NOTHING;
          v_imported_edges := v_imported_edges + 1;
        END IF;
      END LOOP;
    END IF;

    -- C. Canvas Groups
    IF v_best_canvas->'groups' IS NOT NULL AND jsonb_typeof(v_best_canvas->'groups') = 'array' THEN
      FOR v_group IN SELECT * FROM jsonb_array_elements(v_best_canvas->'groups')
      LOOP
        v_group_id := (v_group->>'id')::UUID;
        INSERT INTO canvas_groups (
          id, workspace_id, title, member_ids, color, created_at, updated_at
        ) VALUES (
          v_group_id,
          p_workspace_id,
          COALESCE(v_group->>'title', 'Group'),
          COALESCE(v_group->'memberIds', '[]'::jsonb),
          v_group->>'color',
          v_now,
          v_now
        )
        ON CONFLICT (workspace_id, id) DO NOTHING;
        v_imported_groups := v_imported_groups + 1;
      END LOOP;
    END IF;
  END IF;

  -- 6. Return Structured Summary
  RETURN jsonb_build_object(
    'success', true,
    'targetWorkspaceId', p_workspace_id,
    'importedConversations', v_imported_conversations,
    'importedMessages', v_imported_messages,
    'importedNodes', v_imported_nodes,
    'importedEdges', v_imported_edges,
    'importedGroups', v_imported_groups,
    'skippedDuplicates', v_skipped_duplicates,
    'migratedAt', v_now
  );
END;
$$;

-- Security Hardening: Revoke from PUBLIC, Grant to authenticated & service_role
REVOKE EXECUTE ON FUNCTION migrate_workspace_tx(UUID, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION migrate_workspace_tx(UUID, TEXT, JSONB) TO authenticated, service_role;
