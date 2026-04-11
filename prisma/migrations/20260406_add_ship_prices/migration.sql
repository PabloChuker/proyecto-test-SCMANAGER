-- =============================================================================
-- AL FILO — Migration: Add MSRP & Warbond prices to ships table
-- Run this in Supabase SQL Editor or via psql
-- =============================================================================

-- Add pledge price columns
ALTER TABLE ships ADD COLUMN IF NOT EXISTS msrp_usd DOUBLE PRECISION;
ALTER TABLE ships ADD COLUMN IF NOT EXISTS warbond_usd DOUBLE PRECISION;

-- Index for price-based queries (e.g., CCU chain optimizer)
CREATE INDEX IF NOT EXISTS idx_ships_msrp ON ships (msrp_usd) WHERE msrp_usd IS NOT NULL;

-- Verify
SELECT COUNT(*) AS total_ships FROM ships;
