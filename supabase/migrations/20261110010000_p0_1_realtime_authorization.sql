-- P0.1 live-sync (Realtime) access control.
--
-- Before: live rooms were public channels named echo-room:<random id>. Anyone with the public key
-- and the id (no account, no workspace membership) could listen to the canvas and presence, and
-- inject canvas / cursor / call-signalling events.
--
-- After: the app joins PRIVATE channels named echo-room:<workspace id>:<room id>. Supabase checks
-- the policies below on realtime.messages for every join and every message: only signed-in
-- members of that workspace may receive (SELECT) or send (INSERT), for broadcast and presence.
-- Anonymous visitors, strangers and the old un-namespaced topic names are refused.
--
-- Also required, in the Supabase dashboard (not SQL): Realtime > Settings > turn OFF
-- "Allow public access". Otherwise public (non-private) channels are still open.
--
-- Known limit: policies cannot tell broadcast event types apart, so a workspace member with the
-- viewer role can still send canvas events to other members' screens (not to the database).
--
-- One transaction: if any statement fails, nothing changes.

BEGIN;

-- The workspace id embedded in a room topic, or NULL for anything that is not
-- echo-room:<uuid>:<room id> (including the old echo-room:<room id> form).
CREATE OR REPLACE FUNCTION public.echo_room_workspace_id(p_topic TEXT)
RETURNS UUID
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_topic ~* '^echo-room:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[^:[:space:]]+$'
    THEN substring(p_topic FROM 11 FOR 36)::uuid
    ELSE NULL
  END
$$;

DROP POLICY IF EXISTS echo_room_members_receive ON realtime.messages;
CREATE POLICY echo_room_members_receive ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    extension IN ('broadcast', 'presence')
    AND public.is_workspace_member(public.echo_room_workspace_id(realtime.topic()))
  );

DROP POLICY IF EXISTS echo_room_members_send ON realtime.messages;
CREATE POLICY echo_room_members_send ON realtime.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    extension IN ('broadcast', 'presence')
    AND public.is_workspace_member(public.echo_room_workspace_id(realtime.topic()))
  );

COMMIT;
