-- Public read-only share links.
--
-- An owner or admin can publish a workspace's canvas and conversations to anyone holding the link,
-- no account needed. Only a SHA-256 hash of the secret token is stored, links can expire and can be
-- revoked at any time. Anonymous visitors never touch the database or Realtime directly: the
-- Next.js API checks the token and returns a fixed, sanitized view (no user ids, no emails, no
-- meeting transcripts).
--
-- Server-only table: row-level security on, no policies, and no privileges for the public roles.

BEGIN;

CREATE TABLE IF NOT EXISTS workspace_public_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_workspace_public_links_workspace
  ON workspace_public_links(workspace_id, created_at DESC);

ALTER TABLE workspace_public_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON workspace_public_links FROM anon, authenticated;

COMMIT;
