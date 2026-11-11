-- P0.1 security hardening (found by the live probe scratch/live_check_security.mjs, 2026-11-10).
--
-- Findings this fixes:
--   1. Any signed-in user could insert themselves into workspace_members as OWNER of any workspace
--      whose id they knew, then read its private data.
--   2. Anyone holding only the public (anon) key, signed in or not, could call append_message_tx,
--      create_meeting_tx and create_collaboration_room_tx for any workspace, naming any actor.
--   3. is_workspace_member / has_workspace_role answered for ANY user id (membership oracle).
--   4. At the database level an admin could demote the owner or promote themselves to owner.
--
-- Model after this migration: the browser never touches these tables or functions. Every read and
-- write goes through the Next.js API, which uses the service-role key and enforces roles in code.
-- The public/anon and signed-in roles keep only what the row-level read policies give them.
--
-- Everything runs in one transaction: if any statement fails, nothing changes.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Database functions: callable by the server (service_role) only.
--    Dynamic, so overloaded signatures are all covered.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'create_workspace_with_owner',
        'apply_canvas_mutation_tx',
        'append_message_tx',
        'create_meeting_tx',
        'end_meeting_tx',
        'create_collaboration_room_tx',
        'close_collaboration_room_tx',
        'migrate_workspace_tx',
        'bump_workspace_revision'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. Membership helpers: only answer about the caller (or for the server).
--    Row-level read policies call these with the default (the caller), so they keep working.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_workspace_member(
  p_workspace_id UUID,
  p_user_id TEXT DEFAULT auth.uid()::text
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id = p_user_id
      AND (p_user_id = auth.uid()::text OR (auth.jwt() ->> 'role') = 'service_role')
  );
$$;

CREATE OR REPLACE FUNCTION has_workspace_role(
  p_workspace_id UUID,
  p_required_roles TEXT[],
  p_user_id TEXT DEFAULT auth.uid()::text
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id = p_user_id
      AND role = ANY(p_required_roles)
      AND (p_user_id = auth.uid()::text OR (auth.jwt() ->> 'role') = 'service_role')
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Tables: no client-side writes at all.
--    Drop every INSERT / UPDATE / DELETE / ALL policy, and remove write privileges as a second layer.
--    The server's service-role client bypasses row-level security and is unaffected.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      AND tablename IN (
        'workspaces', 'workspace_members', 'conversations', 'messages',
        'canvas_nodes', 'canvas_edges', 'canvas_groups', 'canvas_actions',
        'meetings', 'meeting_participants', 'meeting_transcript_segments', 'meeting_insights',
        'collaboration_rooms', 'collaboration_room_participants'
      )
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END
$$;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON
  workspaces, workspace_members, conversations, messages,
  canvas_nodes, canvas_edges, canvas_groups, canvas_actions,
  meetings, meeting_participants, meeting_transcript_segments, meeting_insights,
  collaboration_rooms, collaboration_room_participants
FROM anon, authenticated;

-- Server-only tables (row-level security on, no policies): also remove all direct privileges.
REVOKE ALL ON ai_usage_events, workspace_invites FROM anon, authenticated;

COMMIT;
