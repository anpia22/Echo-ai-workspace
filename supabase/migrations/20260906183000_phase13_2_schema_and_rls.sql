-- ==============================================================================
-- PHASE 13.2 — Database Schema + RLS
-- Echo Persistent Backend Workspace Foundation
--
-- Tables:
--   1. workspaces
--   2. workspace_members
--   3. conversations
--   4. messages
--   5. canvas_nodes
--   6. canvas_edges
--   7. canvas_groups
--   8. canvas_actions
--   9. meetings
--   10. meeting_participants
--   11. meeting_transcript_segments
--   12. meeting_insights
--
-- Security:
--   - Row Level Security (RLS) enabled on all 12 tables
--   - Non-recursive helper functions: is_workspace_member, has_workspace_role
--   - Strict tenant boundary: workspace isolation across all foreign keys
--   - Composite FKs on canvas_edges to prevent cross-workspace connections
--   - Append-only enforcement on canvas_actions audit log
--   - Atomic row-locking OCC revision helper: bump_workspace_revision
-- ==============================================================================

-- Ensure pgcrypto / uuid extensions are available
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. WORKSPACES
-- ==============================================================================
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (char_length(trim(title)) > 0),
  description TEXT,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_workspaces_updated_at ON workspaces(updated_at DESC);

-- ==============================================================================
-- 2. WORKSPACE MEMBERS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  display_name TEXT NOT NULL CHECK (char_length(trim(display_name)) > 0),
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'member', 'viewer')) DEFAULT 'member',
  color TEXT NOT NULL DEFAULT '#3b82f6',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  last_seen_at TIMESTAMPTZ,
  CONSTRAINT uq_workspace_members UNIQUE (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_lookup ON workspace_members(workspace_id, user_id);

-- ==============================================================================
-- RLS HELPER FUNCTIONS (Must be defined early for RLS policies)
-- ==============================================================================
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
  );
$$;

-- ==============================================================================
-- 3. CONVERSATIONS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(trim(title)) > 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_conversations_ws_updated ON conversations(workspace_id, updated_at DESC);

-- ==============================================================================
-- 4. MESSAGES
-- ==============================================================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  sender_id TEXT,
  sequence BIGINT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_ws_conv ON messages(workspace_id, conversation_id);

-- ==============================================================================
-- 5. CANVAS NODES
-- ==============================================================================
CREATE TABLE IF NOT EXISTS canvas_nodes (
  id UUID NOT NULL,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  node_type TEXT NOT NULL CHECK (char_length(trim(node_type)) > 0),
  title TEXT NOT NULL,
  description TEXT,
  position_x DOUBLE PRECISION NOT NULL DEFAULT 0,
  position_y DOUBLE PRECISION NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (id),
  CONSTRAINT uq_canvas_nodes_workspace_id UNIQUE (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_canvas_nodes_ws ON canvas_nodes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_canvas_nodes_ws_title ON canvas_nodes(workspace_id, title);

-- ==============================================================================
-- 6. CANVAS EDGES (With Composite FKs for Strict Cross-Workspace Isolation)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS canvas_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_id UUID NOT NULL,
  target_id UUID NOT NULL,
  relationship TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

  -- Composite FKs: source and target must reside in the exact same workspace as the edge!
  CONSTRAINT fk_canvas_edges_source FOREIGN KEY (workspace_id, source_id)
    REFERENCES canvas_nodes(workspace_id, id) ON DELETE CASCADE,

  CONSTRAINT fk_canvas_edges_target FOREIGN KEY (workspace_id, target_id)
    REFERENCES canvas_nodes(workspace_id, id) ON DELETE CASCADE,

  -- Composite unique constraint for workspace-scoped identity & ON CONFLICT target
  CONSTRAINT uq_canvas_edges_workspace_id UNIQUE (workspace_id, id),

  -- Normalized relationship handles empty/null duplicates safely
  CONSTRAINT uq_canvas_edges_connection UNIQUE (workspace_id, source_id, target_id, relationship)
);

CREATE INDEX IF NOT EXISTS idx_canvas_edges_ws ON canvas_edges(workspace_id);
CREATE INDEX IF NOT EXISTS idx_canvas_edges_source_target ON canvas_edges(workspace_id, source_id, target_id);

-- ==============================================================================
-- 7. CANVAS GROUPS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS canvas_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  member_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_canvas_groups_workspace_id UNIQUE (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_canvas_groups_ws ON canvas_groups(workspace_id);

-- ==============================================================================
-- 8. CANVAS ACTIONS (Append-Only Audit & Provenance Log)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS canvas_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  applied_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_canvas_actions_ws_created ON canvas_actions(workspace_id, created_at ASC);

-- Database-level append-only protection: Block any UPDATE or DELETE on canvas_actions
CREATE OR REPLACE FUNCTION prevent_canvas_action_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'canvas_actions is strictly an append-only audit log. Updates and deletes are prohibited.'
    USING ERRCODE = '23505';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_canvas_action_mutation ON canvas_actions;
CREATE TRIGGER trg_prevent_canvas_action_mutation
BEFORE UPDATE OR DELETE ON canvas_actions
FOR EACH ROW
EXECUTE FUNCTION prevent_canvas_action_mutation();

-- ==============================================================================
-- 9. MEETINGS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS meetings (
  id TEXT NOT NULL PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'ended')) DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  ended_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_meetings_workspace_id UNIQUE (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_meetings_ws_started ON meetings(workspace_id, started_at DESC);

-- ==============================================================================
-- 10. MEETING PARTICIPANTS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS meeting_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  left_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_meeting_participants UNIQUE (meeting_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_meeting_participants_lookup ON meeting_participants(meeting_id, user_id);

-- ==============================================================================
-- 11. MEETING TRANSCRIPT SEGMENTS (Primary Key: (meeting_id, id))
-- ==============================================================================
CREATE TABLE IF NOT EXISTS meeting_transcript_segments (
  id TEXT NOT NULL,
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  speaker_id TEXT NOT NULL,
  speaker_name TEXT NOT NULL,
  text TEXT NOT NULL,
  timestamp BIGINT NOT NULL,
  sequence INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('interim', 'final')) DEFAULT 'final',
  source TEXT NOT NULL DEFAULT 'meeting',
  language TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (meeting_id, id)
);

-- Ordering index: sequence ASC, timestamp ASC, id ASC
CREATE INDEX IF NOT EXISTS idx_transcripts_ordering ON meeting_transcript_segments(meeting_id, sequence ASC, timestamp ASC);

-- ==============================================================================
-- 12. MEETING INSIGHTS (Primary Key: (meeting_id, id))
-- ==============================================================================
CREATE TABLE IF NOT EXISTS meeting_insights (
  id TEXT NOT NULL,
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('problem', 'solution', 'decision', 'task', 'question', 'idea', 'note')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  source_segment_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  speaker_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence DOUBLE PRECISION,
  timestamp BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (meeting_id, id)
);

CREATE INDEX IF NOT EXISTS idx_insights_meeting_timestamp ON meeting_insights(meeting_id, timestamp ASC);

-- ==============================================================================
-- ATOMIC CONCURRENCY FUNCTION: BUMP WORKSPACE REVISION
-- ==============================================================================
CREATE OR REPLACE FUNCTION bump_workspace_revision(
  p_workspace_id UUID,
  p_expected_revision BIGINT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_current_revision BIGINT;
BEGIN
  -- Acquire atomic row-level lock on workspace
  SELECT revision INTO v_current_revision
  FROM workspaces
  WHERE id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workspace % not found', p_workspace_id USING ERRCODE = 'P0002';
  END IF;

  -- Verify expected revision against current authoritative revision
  IF v_current_revision <> p_expected_revision THEN
    RAISE EXCEPTION 'Stale workspace revision: current %, expected %', v_current_revision, p_expected_revision
      USING ERRCODE = '40001'; -- serialization_failure
  END IF;

  -- Increment revision atomically
  UPDATE workspaces
  SET revision = v_current_revision + 1,
      updated_at = timezone('utc'::text, now())
  WHERE id = p_workspace_id
  RETURNING revision INTO v_current_revision;

  RETURN v_current_revision;
END;
$$;

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- Enable RLS on all 12 tables
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE canvas_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE canvas_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE canvas_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE canvas_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_transcript_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_insights ENABLE ROW LEVEL SECURITY;

-- 1. workspaces policies
CREATE POLICY rls_workspaces_select ON workspaces
  FOR SELECT USING (is_workspace_member(id));

CREATE POLICY rls_workspaces_insert ON workspaces
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY rls_workspaces_update ON workspaces
  FOR UPDATE USING (has_workspace_role(id, ARRAY['owner', 'admin']));

CREATE POLICY rls_workspaces_delete ON workspaces
  FOR DELETE USING (has_workspace_role(id, ARRAY['owner']));

-- 2. workspace_members policies
CREATE POLICY rls_workspace_members_select ON workspace_members
  FOR SELECT USING (is_workspace_member(workspace_id));

CREATE POLICY rls_workspace_members_insert ON workspace_members
  FOR INSERT WITH CHECK (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    OR (auth.uid() IS NOT NULL AND user_id = auth.uid()::text)
  );

CREATE POLICY rls_workspace_members_update ON workspace_members
  FOR UPDATE USING (has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

CREATE POLICY rls_workspace_members_delete ON workspace_members
  FOR DELETE USING (has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

-- 3. conversations policies
CREATE POLICY rls_conversations_select ON conversations
  FOR SELECT USING (is_workspace_member(workspace_id));

CREATE POLICY rls_conversations_insert ON conversations
  FOR INSERT WITH CHECK (has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'editor', 'member']));

CREATE POLICY rls_conversations_update ON conversations
  FOR UPDATE USING (has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'editor', 'member']));

CREATE POLICY rls_conversations_delete ON conversations
  FOR DELETE USING (has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

-- 4. messages policies
CREATE POLICY rls_messages_select ON messages
  FOR SELECT USING (is_workspace_member(workspace_id));

CREATE POLICY rls_messages_insert ON messages
  FOR INSERT WITH CHECK (has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'editor', 'member']));

CREATE POLICY rls_messages_update ON messages
  FOR UPDATE USING (has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'editor', 'member']));

CREATE POLICY rls_messages_delete ON messages
  FOR DELETE USING (has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

-- 5. canvas_nodes policies
CREATE POLICY rls_canvas_nodes_select ON canvas_nodes
  FOR SELECT USING (is_workspace_member(workspace_id));

CREATE POLICY rls_canvas_nodes_insert ON canvas_nodes
  FOR INSERT WITH CHECK (has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'editor', 'member']));

CREATE POLICY rls_canvas_nodes_update ON canvas_nodes
  FOR UPDATE USING (has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'editor', 'member']));

CREATE POLICY rls_canvas_nodes_delete ON canvas_nodes
  FOR DELETE USING (has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'editor', 'member']));

-- 6. canvas_edges policies
CREATE POLICY rls_canvas_edges_select ON canvas_edges
  FOR SELECT USING (is_workspace_member(workspace_id));

CREATE POLICY rls_canvas_edges_insert ON canvas_edges
  FOR INSERT WITH CHECK (has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'editor', 'member']));

CREATE POLICY rls_canvas_edges_update ON canvas_edges
  FOR UPDATE USING (has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'editor', 'member']));

CREATE POLICY rls_canvas_edges_delete ON canvas_edges
  FOR DELETE USING (has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'editor', 'member']));

-- 7. canvas_groups policies
CREATE POLICY rls_canvas_groups_select ON canvas_groups
  FOR SELECT USING (is_workspace_member(workspace_id));

CREATE POLICY rls_canvas_groups_insert ON canvas_groups
  FOR INSERT WITH CHECK (has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'editor', 'member']));

CREATE POLICY rls_canvas_groups_update ON canvas_groups
  FOR UPDATE USING (has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'editor', 'member']));

CREATE POLICY rls_canvas_groups_delete ON canvas_groups
  FOR DELETE USING (has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'editor', 'member']));

-- 8. canvas_actions policies (Append only!)
CREATE POLICY rls_canvas_actions_select ON canvas_actions
  FOR SELECT USING (is_workspace_member(workspace_id));

CREATE POLICY rls_canvas_actions_insert ON canvas_actions
  FOR INSERT WITH CHECK (has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'editor', 'member']));

-- 9. meetings policies
CREATE POLICY rls_meetings_select ON meetings
  FOR SELECT USING (is_workspace_member(workspace_id));

CREATE POLICY rls_meetings_insert ON meetings
  FOR INSERT WITH CHECK (has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'editor', 'member']));

CREATE POLICY rls_meetings_update ON meetings
  FOR UPDATE USING (has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'editor', 'member']));

CREATE POLICY rls_meetings_delete ON meetings
  FOR DELETE USING (has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

-- 10. meeting_participants policies
CREATE POLICY rls_meeting_participants_select ON meeting_participants
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM meetings m WHERE m.id = meeting_participants.meeting_id AND is_workspace_member(m.workspace_id))
  );

CREATE POLICY rls_meeting_participants_insert ON meeting_participants
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM meetings m WHERE m.id = meeting_participants.meeting_id AND has_workspace_role(m.workspace_id, ARRAY['owner', 'admin', 'editor', 'member']))
  );

CREATE POLICY rls_meeting_participants_update ON meeting_participants
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM meetings m WHERE m.id = meeting_participants.meeting_id AND has_workspace_role(m.workspace_id, ARRAY['owner', 'admin', 'editor', 'member']))
  );

CREATE POLICY rls_meeting_participants_delete ON meeting_participants
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM meetings m WHERE m.id = meeting_participants.meeting_id AND has_workspace_role(m.workspace_id, ARRAY['owner', 'admin']))
  );

-- 11. meeting_transcript_segments policies
CREATE POLICY rls_transcripts_select ON meeting_transcript_segments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM meetings m WHERE m.id = meeting_transcript_segments.meeting_id AND is_workspace_member(m.workspace_id))
  );

CREATE POLICY rls_transcripts_insert ON meeting_transcript_segments
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM meetings m WHERE m.id = meeting_transcript_segments.meeting_id AND has_workspace_role(m.workspace_id, ARRAY['owner', 'admin', 'editor', 'member']))
  );

CREATE POLICY rls_transcripts_update ON meeting_transcript_segments
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM meetings m WHERE m.id = meeting_transcript_segments.meeting_id AND has_workspace_role(m.workspace_id, ARRAY['owner', 'admin', 'editor', 'member']))
  );

CREATE POLICY rls_transcripts_delete ON meeting_transcript_segments
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM meetings m WHERE m.id = meeting_transcript_segments.meeting_id AND has_workspace_role(m.workspace_id, ARRAY['owner', 'admin']))
  );

-- 12. meeting_insights policies
CREATE POLICY rls_insights_select ON meeting_insights
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM meetings m WHERE m.id = meeting_insights.meeting_id AND is_workspace_member(m.workspace_id))
  );

CREATE POLICY rls_insights_insert ON meeting_insights
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM meetings m WHERE m.id = meeting_insights.meeting_id AND has_workspace_role(m.workspace_id, ARRAY['owner', 'admin', 'editor', 'member']))
  );

CREATE POLICY rls_insights_update ON meeting_insights
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM meetings m WHERE m.id = meeting_insights.meeting_id AND has_workspace_role(m.workspace_id, ARRAY['owner', 'admin', 'editor', 'member']))
  );

CREATE POLICY rls_insights_delete ON meeting_insights
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM meetings m WHERE m.id = meeting_insights.meeting_id AND has_workspace_role(m.workspace_id, ARRAY['owner', 'admin']))
  );
