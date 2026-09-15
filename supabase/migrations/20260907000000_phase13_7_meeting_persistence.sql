-- ==============================================================================
-- Phase 13.7: Meeting History Persistence & Atomic Transactions
--
-- Provides server-authoritative, atomic stored procedures for:
-- 1. create_meeting_tx: Idempotent meeting creation with actor membership check
--    and server-authoritative started_at timestamp.
-- 2. end_meeting_tx: Row-locked meeting termination with actor membership check,
--    server-authoritative ended_at timestamp (now()), idempotency, and recovery
--    for dropped/failed start persistence.
--
-- Security:
-- - SECURITY DEFINER with search_path = public, extensions
-- - Explicit internal has_workspace_role() check for actor
-- - Revoke execute from PUBLIC; grant only to authenticated, service_role
-- ==============================================================================

CREATE OR REPLACE FUNCTION create_meeting_tx(
  p_workspace_id UUID,
  p_meeting_id TEXT,
  p_title TEXT,
  p_actor_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_existing RECORD;
  v_new_meeting RECORD;
  v_title TEXT;
BEGIN
  -- Security check: actor must be an active workspace member with write role
  IF NOT has_workspace_role(p_workspace_id, ARRAY['owner', 'admin', 'editor', 'member']::TEXT[], p_actor_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: Actor % lacks write permission in workspace %', p_actor_id, p_workspace_id
      USING ERRCODE = '42501'; -- insufficient_privilege
  END IF;

  v_title := COALESCE(NULLIF(trim(p_title), ''), 'Untitled Meeting');

  -- Idempotency check: does meeting ID already exist?
  SELECT * INTO v_existing
  FROM meetings
  WHERE id = p_meeting_id;

  IF FOUND THEN
    IF v_existing.workspace_id = p_workspace_id THEN
      -- Same workspace: return existing record idempotently
      RETURN to_jsonb(v_existing);
    ELSE
      -- Collision: ID already belongs to a different workspace
      RAISE EXCEPTION 'Meeting ID % already exists in another workspace', p_meeting_id
        USING ERRCODE = '23505'; -- unique_violation
    END IF;
  END IF;

  -- Insert new active meeting with server-authoritative timestamp
  INSERT INTO meetings (
    id,
    workspace_id,
    title,
    status,
    started_at,
    ended_at,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    p_meeting_id,
    p_workspace_id,
    v_title,
    'active',
    timezone('utc'::text, now()),
    NULL,
    p_actor_id,
    timezone('utc'::text, now()),
    timezone('utc'::text, now())
  )
  RETURNING * INTO v_new_meeting;

  RETURN to_jsonb(v_new_meeting);
END;
$$;

CREATE OR REPLACE FUNCTION end_meeting_tx(
  p_workspace_id UUID,
  p_meeting_id TEXT,
  p_actor_id TEXT,
  p_title TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_meeting RECORD;
  v_title TEXT;
  v_recovered RECORD;
BEGIN
  -- Security check: actor must be an active workspace member with write role
  IF NOT has_workspace_role(p_workspace_id, ARRAY['owner', 'admin', 'editor', 'member']::TEXT[], p_actor_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: Actor % lacks write permission in workspace %', p_actor_id, p_workspace_id
      USING ERRCODE = '42501'; -- insufficient_privilege
  END IF;

  -- Acquire row-level lock for concurrency serialization
  SELECT * INTO v_meeting
  FROM meetings
  WHERE id = p_meeting_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- ASYNC RECOVERY PATH:
    -- If meeting start persistence failed or was dropped, create the record directly in 'ended' status.
    v_title := COALESCE(NULLIF(trim(p_title), ''), 'Untitled Meeting');

    INSERT INTO meetings (
      id,
      workspace_id,
      title,
      status,
      started_at,
      ended_at,
      created_by,
      created_at,
      updated_at
    ) VALUES (
      p_meeting_id,
      p_workspace_id,
      v_title,
      'ended',
      timezone('utc'::text, now()),
      timezone('utc'::text, now()),
      p_actor_id,
      timezone('utc'::text, now()),
      timezone('utc'::text, now())
    )
    RETURNING * INTO v_recovered;

    RETURN to_jsonb(v_recovered);
  END IF;

  -- Tenancy validation: ensure meeting belongs to caller workspace
  IF v_meeting.workspace_id != p_workspace_id THEN
    RAISE EXCEPTION 'Meeting % belongs to a different workspace', p_meeting_id
      USING ERRCODE = '42501'; -- insufficient_privilege
  END IF;

  -- Idempotency check: if already ended, return existing record without modifying ended_at
  IF v_meeting.status = 'ended' THEN
    RETURN to_jsonb(v_meeting);
  END IF;

  -- Transition active -> ended using server-authoritative timestamp
  UPDATE meetings
  SET status = 'ended',
      ended_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  WHERE id = p_meeting_id
  RETURNING * INTO v_meeting;

  RETURN to_jsonb(v_meeting);
END;
$$;

-- Security hardening: revoke public execution; grant exclusively to authenticated and service_role
REVOKE EXECUTE ON FUNCTION create_meeting_tx(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_meeting_tx(UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION end_meeting_tx(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION end_meeting_tx(UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;
