-- ==============================================================================
-- Phase 13.6: Message Concurrency & Atomic Append Procedure
--
-- Serializes concurrent message appends per conversation using row-level locking
-- (SELECT id FROM conversations WHERE id = ... FOR UPDATE).
--
-- Guarantees:
-- 1. Strictly monotonic, non-duplicate sequence assignment (MAX(sequence) + 1).
-- 2. Strict message idempotency: same (id, role, content, conversation_id, workspace_id)
--    returns the existing row without updating conversation.updated_at.
-- 3. Conflicting duplicate message ID (same id, differing content/role/conversation)
--    raises error code 23505 (unique_violation / conflict).
-- 4. Cross-workspace isolation: conversation tenancy is strictly validated.
-- 5. Updates conversations.updated_at ONLY for newly accepted messages.
-- 6. search_path is locked to public, extensions for security definer hardening.
-- 7. Revokes execute from public; grants to authenticated, service_role.
-- ==============================================================================

CREATE OR REPLACE FUNCTION append_message_tx(
  p_workspace_id UUID,
  p_conversation_id UUID,
  p_role TEXT,
  p_content TEXT,
  p_sender_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_conv RECORD;
  v_existing RECORD;
  v_next_seq BIGINT;
  v_new_msg RECORD;
BEGIN
  -- 1. Upfront role validation
  IF p_role NOT IN ('user', 'assistant', 'system') THEN
    RAISE EXCEPTION 'Invalid message role: %', p_role
      USING ERRCODE = '22023'; -- invalid_parameter_value
  END IF;

  -- 2. Upfront content validation
  IF p_content IS NULL OR length(trim(p_content)) = 0 THEN
    RAISE EXCEPTION 'Message content cannot be empty'
      USING ERRCODE = '22023'; -- invalid_parameter_value
  END IF;

  -- 3. Verify conversation tenancy and acquire row lock for concurrency serialization
  SELECT id INTO v_conv
  FROM conversations
  WHERE id = p_conversation_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversation % not found in workspace %', p_conversation_id, p_workspace_id
      USING ERRCODE = 'P0002'; -- no_data_found
  END IF;

  -- 4. Idempotency check if explicit message ID is supplied
  IF p_id IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM messages
    WHERE id = p_id;

    IF FOUND THEN
      IF v_existing.role = p_role 
         AND v_existing.content = p_content 
         AND v_existing.conversation_id = p_conversation_id 
         AND v_existing.workspace_id = p_workspace_id THEN
        -- Exact duplicate match: return existing message idempotently without touching updated_at
        RETURN to_jsonb(v_existing);
      ELSE
        -- Conflict: duplicate message ID with altered payload or conversation
        RAISE EXCEPTION 'Message % already exists with conflicting role, content, or tenancy', p_id
          USING ERRCODE = '23505'; -- unique_violation
      END IF;
    END IF;
  END IF;

  -- 5. Atomic sequence calculation under conversation row lock
  SELECT COALESCE(MAX(sequence), 0) + 1 INTO v_next_seq
  FROM messages
  WHERE conversation_id = p_conversation_id;

  -- 6. Insert new message
  INSERT INTO messages (
    id,
    workspace_id,
    conversation_id,
    role,
    content,
    sender_id,
    sequence,
    metadata,
    created_at,
    updated_at
  ) VALUES (
    COALESCE(p_id, gen_random_uuid()),
    p_workspace_id,
    p_conversation_id,
    p_role,
    p_content,
    p_sender_id,
    v_next_seq,
    COALESCE(p_metadata, '{}'::jsonb),
    timezone('utc'::text, now()),
    timezone('utc'::text, now())
  )
  RETURNING * INTO v_new_msg;

  -- 7. Touch conversation updated_at only for a newly accepted message
  UPDATE conversations
  SET updated_at = timezone('utc'::text, now())
  WHERE id = p_conversation_id;

  RETURN to_jsonb(v_new_msg);
END;
$$;

-- Security hardening: revoke public execution; grant exclusively to authenticated and service_role
REVOKE EXECUTE ON FUNCTION append_message_tx(UUID, UUID, TEXT, TEXT, TEXT, JSONB, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION append_message_tx(UUID, UUID, TEXT, TEXT, TEXT, JSONB, UUID) TO authenticated, service_role;
