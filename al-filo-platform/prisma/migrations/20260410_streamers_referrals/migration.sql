-- =============================================================================
-- SC LABS — Migration: Streamers / Referral tracking
-- Run this in the Supabase SQL Editor or via psql.
--
-- Tables:
--   referral_visits  — One row per visit to SC Labs that carried a ?ref=CODE.
--                      Used internally to measure which streamers bring users.
-- =============================================================================

CREATE TABLE IF NOT EXISTS referral_visits (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Streamer/creator code from the ?ref= query param.
  -- Normalized lowercase, max 32 chars on the client, but keep headroom.
  ref_code     VARCHAR(64) NOT NULL,

  -- Path/URL the visitor landed on (first page of the session).
  landing_path TEXT,

  -- Optional HTTP referer (ej: twitch.tv, youtube.com, discord.gg)
  http_referer TEXT,

  -- Browser fingerprint-ish data (not PII)
  user_agent   TEXT,

  -- Visitor country from x-vercel-ip-country (if available)
  country      VARCHAR(8),

  -- Logged-in user that triggered the visit (NULL if anonymous)
  user_id      UUID,

  -- When the visit was recorded
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for internal queries: "how many visits for streamer X in the last 7 days"
CREATE INDEX IF NOT EXISTS idx_referral_visits_ref_code_created
  ON referral_visits (ref_code, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_referral_visits_created
  ON referral_visits (created_at DESC);

-- Row Level Security — only service role / admin tools can read/write.
-- We don't expose this data to clients, only to the internal endpoint.
ALTER TABLE referral_visits ENABLE ROW LEVEL SECURITY;

-- Deny-all by default. Writes happen through the service role via the
-- /api/referral/track endpoint; reads happen server-side from admin tooling.
DROP POLICY IF EXISTS "deny all" ON referral_visits;
CREATE POLICY "deny all" ON referral_visits
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);
