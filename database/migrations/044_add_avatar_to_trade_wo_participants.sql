-- =============================================================================
-- Migration 044 — Add avatar_url to trade_wo_participants
--
-- Adds an optional avatar_url column so we can render the Discord/RSI avatar
-- of each participant in the Trade Work Order UI. The value is sourced from
-- profiles.avatar_url at the time the member is added (either manually or via
-- "Cargar Party"); it is stored as a snapshot so the UI doesn't have to join
-- against profiles on every render.
-- =============================================================================

ALTER TABLE trade_wo_participants
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Backfill from profiles where we have a user_id linkage
UPDATE trade_wo_participants p
   SET avatar_url = pr.avatar_url
  FROM profiles pr
 WHERE p.user_id = pr.id
   AND p.avatar_url IS NULL
   AND pr.avatar_url IS NOT NULL;
