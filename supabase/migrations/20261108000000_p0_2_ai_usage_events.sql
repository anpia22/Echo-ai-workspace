-- ==============================================================================
-- P0.2 — AI usage log
--
-- One row per AI request. Written by the server (service role) from /api/analyze.
-- Read by: rate limiting (now), monitoring (P0.3), admin panel (P1.6).
--
-- Privacy: stores no prompt, response, canvas or transcript content. Anonymous
-- callers are identified only by a salted hash of their IP (actor_key = 'ip:<hash>').
--
-- Safe to re-run (IF NOT EXISTS). The app works without this table (it falls back to
-- per-instance in-memory limiting), but limits are only reliable across instances and
-- restarts once it exists.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  -- 'user:<auth user id>' for signed-in callers, 'ip:<salted hash>' for anonymous/demo
  actor_key TEXT NOT NULL,
  user_id TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  route TEXT NOT NULL,
  model TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'ok', 'error', 'timeout', 'unavailable')),
  http_status INTEGER,
  latency_ms INTEGER,
  error_code TEXT
);

-- Rate-limit lookups: "requests by this actor in the last window"
CREATE INDEX IF NOT EXISTS idx_ai_usage_actor_time
  ON ai_usage_events (actor_key, created_at DESC);

-- Admin / monitoring queries: "everything in the last N days"
CREATE INDEX IF NOT EXISTS idx_ai_usage_time
  ON ai_usage_events (created_at DESC);

-- Server-only table: RLS on with NO policies means anon/authenticated clients can read
-- and write nothing; the service-role key used by the server bypasses RLS.
ALTER TABLE ai_usage_events ENABLE ROW LEVEL SECURITY;
