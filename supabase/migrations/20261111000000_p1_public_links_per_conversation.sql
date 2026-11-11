-- Public share links now cover ONE conversation (its chat and its own canvas), not the whole
-- workspace. Found when a shared link showed another conversation in a dropdown and drew the
-- workspace-wide canvas, which merges every conversation's nodes on top of each other.
--
-- Links made before this migration were workspace-wide: they are switched off here, so nothing
-- keeps exposing more than one conversation. Create new links per conversation.

BEGIN;

ALTER TABLE workspace_public_links
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE;

UPDATE workspace_public_links
SET revoked_at = timezone('utc'::text, now())
WHERE conversation_id IS NULL
  AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_workspace_public_links_conversation
  ON workspace_public_links(conversation_id);

COMMIT;
