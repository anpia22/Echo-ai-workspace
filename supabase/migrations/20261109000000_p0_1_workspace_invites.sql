-- P0.1: workspace invite links.
--
-- Only a SHA-256 hash of the invite token is stored, so a database leak cannot be used to join
-- workspaces. The raw token is shown once to the person who creates the invite.
-- Access is through the server's service-role client only: RLS is enabled with no policies,
-- so anon/authenticated clients can read and write nothing here.

CREATE TABLE IF NOT EXISTS workspace_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  expires_at TIMESTAMPTZ NOT NULL,
  max_uses INTEGER CHECK (max_uses IS NULL OR max_uses > 0),
  use_count INTEGER NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_workspace_invites_workspace ON workspace_invites(workspace_id, created_at DESC);

ALTER TABLE workspace_invites ENABLE ROW LEVEL SECURITY;
