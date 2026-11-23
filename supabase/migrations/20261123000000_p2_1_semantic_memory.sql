-- P2.1 Workspace-wide semantic memory (v1: canvas nodes and chat messages).
--
-- One row per source item (a node or a message) holding its text and an embedding, so the server
-- can answer "what did we decide about X?" by finding the closest items inside one workspace.
--
-- Embedding model: nvidia/nemotron-3.5-embed-1b asked for 1024 dimensions (see
-- scratch/probe_embeddings.mjs). Changing the model or size later means re-embedding everything
-- and a new column or table, so the model name is stored on every row.
--
-- Security model (same as the hardening migration): server-only. The browser never reads or
-- writes this table or calls the search function; the Next.js API checks the caller's workspace
-- role and then uses the service-role key. Row-level security is on with no policies, and all
-- privileges are removed from anon and authenticated.
--
-- Safe to run more than once. Everything runs in one transaction.

BEGIN;

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS memory_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('node', 'message')),
  source_id UUID NOT NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 8000),
  content_hash TEXT NOT NULL,
  embedding extensions.vector(1024) NOT NULL,
  embedding_model TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_memory_chunks_source UNIQUE (workspace_id, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_memory_chunks_ws ON memory_chunks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_memory_chunks_conv ON memory_chunks(conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_memory_chunks_embedding
  ON memory_chunks USING hnsw (embedding extensions.vector_cosine_ops);

ALTER TABLE memory_chunks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON memory_chunks FROM PUBLIC, anon, authenticated;
GRANT ALL ON memory_chunks TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Search: closest chunks inside ONE workspace (never across workspaces).
--    Similarity is cosine similarity (1 = identical direction). Count is clamped to 1..20.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION match_memory_chunks(
  p_workspace_id UUID,
  p_query_embedding extensions.vector(1024),
  p_match_count INTEGER DEFAULT 8,
  p_min_similarity DOUBLE PRECISION DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  source_type TEXT,
  source_id UUID,
  conversation_id UUID,
  content TEXT,
  similarity DOUBLE PRECISION
)
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $$
  SELECT
    m.id,
    m.source_type,
    m.source_id,
    m.conversation_id,
    m.content,
    1 - (m.embedding <=> p_query_embedding) AS similarity
  FROM memory_chunks m
  WHERE m.workspace_id = p_workspace_id
    AND 1 - (m.embedding <=> p_query_embedding) >= p_min_similarity
  ORDER BY m.embedding <=> p_query_embedding
  LIMIT greatest(1, least(coalesce(p_match_count, 8), 20));
$$;

REVOKE ALL ON FUNCTION match_memory_chunks(UUID, extensions.vector, INTEGER, DOUBLE PRECISION)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION match_memory_chunks(UUID, extensions.vector, INTEGER, DOUBLE PRECISION)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Cleanup: when a node or message is deleted, its memory row goes too, so the assistant can
--    never cite something that no longer exists. (Conversation and workspace deletes cascade.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION delete_memory_chunk_for_source()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  DELETE FROM memory_chunks
  WHERE workspace_id = OLD.workspace_id
    AND source_type = TG_ARGV[0]
    AND source_id = OLD.id;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION delete_memory_chunk_for_source() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_memory_chunk_cleanup_node ON canvas_nodes;
CREATE TRIGGER trg_memory_chunk_cleanup_node
  AFTER DELETE ON canvas_nodes
  FOR EACH ROW EXECUTE FUNCTION delete_memory_chunk_for_source('node');

DROP TRIGGER IF EXISTS trg_memory_chunk_cleanup_message ON messages;
CREATE TRIGGER trg_memory_chunk_cleanup_message
  AFTER DELETE ON messages
  FOR EACH ROW EXECUTE FUNCTION delete_memory_chunk_for_source('message');

COMMIT;
