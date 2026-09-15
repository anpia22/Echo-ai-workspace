-- ==============================================================================
-- Phase 13.8: Collaboration & Room State Persistence
--
-- Provides schema and atomic stored procedures for:
-- 1. collaboration_rooms: Durable room session records, tenancy, lifecycle,
--    server-authoritative timestamps, and last-known recovery state.
-- 2. collaboration_room_participants: Historical attendee records with composite
--    foreign key (workspace_id, room_id) to strictly enforce DB-level tenancy.
-- 3. create_collaboration_room_tx: Idempotent room creation with actor role validation.
-- 4. close_collaboration_room_tx: Row-locked room termination with async recovery.
--
-- Security:
-- - SECURITY DEFINER with search_path = public, extensions
-- - Internal has_workspace_role validation
-- - Revoke execute from PUBLIC; grant to authenticated, service_role
-- ==============================================================================

-- 1. COLLABORATION ROOMS
CREATE TABLE IF NOT EXISTS collaboration_rooms (
  id TEXT NOT NULL PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'closed')) DEFAULT 'active',
  created_by TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_known_state JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  closed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_collaboration_rooms_ws_id UNIQUE (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_collaboration_rooms_ws_created ON collaboration_rooms(workspace_id, created_at DESC);

-- 2. COLLABORATION ROOM PARTICIPANTS (Historical sessions only)
CREATE TABLE IF NOT EXISTS collaboration_room_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id TEXT NOT NULL,
  workspace_id UUID NOT NULL,
  user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  left_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT fk_collab_participant_room FOREIGN KEY (workspace_id, room_id)
    REFERENCES collaboration_rooms(workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT uq_collab_room_user UNIQUE (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_collab_participants_room ON collaboration_room_participants(workspace_id, room_id, joined_at ASC);

-- 3. ROW LEVEL SECURITY
ALTER TABLE collaboration_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE collaboration_room_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_collaboration_rooms_select ON collaboration_rooms
  FOR SELECT TO authenticated, service_role
  USING (is_workspace_member(workspace_id));

CREATE POLICY rls_collaboration_rooms_insert ON collaboration_rooms
  FOR INSERT TO authenticated, service_role
  WITH CHECK (has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'editor', 'member']::TEXT[]));

CREATE POLICY rls_collaboration_rooms_update ON collaboration_rooms
  FOR UPDATE TO authenticated, service_role
  USING (has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'editor', 'member']::TEXT[]));

CREATE POLICY rls_collaboration_rooms_delete ON collaboration_rooms
  FOR DELETE TO authenticated, service_role
  USING (has_workspace_role(workspace_id, ARRAY['owner', 'admin']::TEXT[]));

CREATE POLICY rls_collab_participants_select ON collaboration_room_participants
  FOR SELECT TO authenticated, service_role
  USING (is_workspace_member(workspace_id));

CREATE POLICY rls_collab_participants_insert ON collaboration_room_participants
  FOR INSERT TO authenticated, service_role
  WITH CHECK (has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'editor', 'member']::TEXT[]));

CREATE POLICY rls_collab_participants_update ON collaboration_room_participants
  FOR UPDATE TO authenticated, service_role
  USING (has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'editor', 'member']::TEXT[]));

CREATE POLICY rls_collab_participants_delete ON collaboration_room_participants
  FOR DELETE TO authenticated, service_role
  USING (has_workspace_role(workspace_id, ARRAY['owner', 'admin']::TEXT[]));

-- 4. STORED PROCEDURES

CREATE OR REPLACE FUNCTION create_collaboration_room_tx(
  p_workspace_id UUID,
  p_room_id TEXT,
  p_title TEXT,
  p_actor_id TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_existing RECORD;
  v_new_room RECORD;
  v_title TEXT;
BEGIN
  -- Internal actor role authorization check
  IF NOT has_workspace_role(p_workspace_id, ARRAY['owner', 'admin', 'editor', 'member']::TEXT[], p_actor_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: Actor % lacks write permission in workspace %', p_actor_id, p_workspace_id
      USING ERRCODE = '42501';
  END IF;

  v_title := COALESCE(NULLIF(trim(p_title), ''), 'Echo Collaboration Room');

  -- Idempotency check: does room exist?
  SELECT * INTO v_existing
  FROM collaboration_rooms
  WHERE id = p_room_id;

  IF FOUND THEN
    IF v_existing.workspace_id = p_workspace_id THEN
      -- Same workspace: return existing record idempotently
      RETURN to_jsonb(v_existing);
    ELSE
      -- Collision: ID belongs to a different workspace
      RAISE EXCEPTION 'Room ID % already exists in another workspace', p_room_id
        USING ERRCODE = '23505'; -- unique_violation
    END IF;
  END IF;

  -- Insert active room with server-authoritative timestamps
  INSERT INTO collaboration_rooms (
    id,
    workspace_id,
    title,
    status,
    created_by,
    metadata,
    created_at,
    updated_at
  ) VALUES (
    p_room_id,
    p_workspace_id,
    v_title,
    'active',
    p_actor_id,
    COALESCE(p_metadata, '{}'::jsonb),
    timezone('utc'::text, now()),
    timezone('utc'::text, now())
  )
  RETURNING * INTO v_new_room;

  RETURN to_jsonb(v_new_room);
END;
$$;

CREATE OR REPLACE FUNCTION close_collaboration_room_tx(
  p_workspace_id UUID,
  p_room_id TEXT,
  p_actor_id TEXT,
  p_last_known_state JSONB DEFAULT NULL,
  p_title TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_room RECORD;
  v_title TEXT;
  v_recovered RECORD;
BEGIN
  -- Internal actor role authorization check
  IF NOT has_workspace_role(p_workspace_id, ARRAY['owner', 'admin', 'editor', 'member']::TEXT[], p_actor_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: Actor % lacks write permission in workspace %', p_actor_id, p_workspace_id
      USING ERRCODE = '42501';
  END IF;

  -- Concurrency serialization via row-level lock
  SELECT * INTO v_room
  FROM collaboration_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- ASYNC RECOVERY PATH:
    -- If start persistence failed or was dropped, atomically create in 'closed' status
    v_title := COALESCE(NULLIF(trim(p_title), ''), 'Echo Collaboration Room');

    INSERT INTO collaboration_rooms (
      id,
      workspace_id,
      title,
      status,
      created_by,
      last_known_state,
      created_at,
      closed_at,
      updated_at
    ) VALUES (
      p_room_id,
      p_workspace_id,
      v_title,
      'closed',
      p_actor_id,
      p_last_known_state,
      timezone('utc'::text, now()),
      timezone('utc'::text, now()),
      timezone('utc'::text, now())
    )
    RETURNING * INTO v_recovered;

    RETURN to_jsonb(v_recovered);
  END IF;

  -- Tenancy check
  IF v_room.workspace_id != p_workspace_id THEN
    RAISE EXCEPTION 'Room % belongs to a different workspace', p_room_id
      USING ERRCODE = '42501';
  END IF;

  -- Idempotency check: if already closed, return existing record
  IF v_room.status = 'closed' THEN
    IF p_last_known_state IS NOT NULL AND v_room.last_known_state IS NULL THEN
      UPDATE collaboration_rooms
      SET last_known_state = p_last_known_state,
          updated_at = timezone('utc'::text, now())
      WHERE id = p_room_id
      RETURNING * INTO v_room;
    END IF;
    RETURN to_jsonb(v_room);
  END IF;

  -- Transition active -> closed
  UPDATE collaboration_rooms
  SET status = 'closed',
      closed_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now()),
      last_known_state = COALESCE(p_last_known_state, last_known_state)
  WHERE id = p_room_id
  RETURNING * INTO v_room;

  RETURN to_jsonb(v_room);
END;
$$;

-- Security hardening: revoke public execution; grant exclusively to authenticated and service_role
REVOKE EXECUTE ON FUNCTION create_collaboration_room_tx(UUID, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_collaboration_room_tx(UUID, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION close_collaboration_room_tx(UUID, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION close_collaboration_room_tx(UUID, TEXT, TEXT, JSONB, TEXT) TO authenticated, service_role;
