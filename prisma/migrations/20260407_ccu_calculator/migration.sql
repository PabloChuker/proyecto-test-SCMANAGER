-- =============================================================================
-- AL FILO — Migration: CCU Calculator tables
-- Run this in Supabase SQL Editor or via psql
--
-- Tables:
--   ccu_prices       — Current CCU upgrade prices (standard + warbond)
--   price_history    — Historical price snapshots for ships
-- =============================================================================

-- ─── 1. CCU Prices ──────────────────────────────────────────────────────────
-- Each row = one possible CCU upgrade from ship A to ship B.
-- RSI only sells CCUs where target MSRP > source MSRP.
-- Warbond prices are optional (only during sales events).

CREATE TABLE IF NOT EXISTS ccu_prices (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  from_ship_id    UUID NOT NULL REFERENCES ships(id),
  to_ship_id      UUID NOT NULL REFERENCES ships(id),

  -- Prices in USD
  standard_price  DOUBLE PRECISION NOT NULL,    -- target_msrp - source_msrp
  warbond_price   DOUBLE PRECISION,             -- NULL if no warbond available

  -- Availability flags
  is_available     BOOLEAN DEFAULT true,         -- Currently purchasable on RSI store
  is_warbond_available BOOLEAN DEFAULT false,    -- Warbond variant currently on sale
  is_limited       BOOLEAN DEFAULT false,        -- Limited availability (event-only)

  -- Metadata
  source           VARCHAR(50) DEFAULT 'calculated', -- 'calculated', 'manual', 'scraped'
  last_verified    TIMESTAMPTZ DEFAULT NOW(),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate from→to pairs
  CONSTRAINT uq_ccu_from_to UNIQUE (from_ship_id, to_ship_id),
  -- Can't upgrade to yourself
  CONSTRAINT chk_different_ships CHECK (from_ship_id != to_ship_id)
);

-- Indexes for pathfinding queries
CREATE INDEX IF NOT EXISTS idx_ccu_from ON ccu_prices (from_ship_id) WHERE is_available = true;
CREATE INDEX IF NOT EXISTS idx_ccu_to ON ccu_prices (to_ship_id) WHERE is_available = true;
CREATE INDEX IF NOT EXISTS idx_ccu_price ON ccu_prices (standard_price);
CREATE INDEX IF NOT EXISTS idx_ccu_warbond ON ccu_prices (warbond_price) WHERE warbond_price IS NOT NULL;

-- ─── 2. Price History ───────────────────────────────────────────────────────
-- Tracks MSRP changes over time (for "price increase alerts")

CREATE TABLE IF NOT EXISTS price_history (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ship_id         UUID NOT NULL REFERENCES ships(id),
  msrp_usd        DOUBLE PRECISION NOT NULL,
  warbond_usd     DOUBLE PRECISION,
  recorded_at     TIMESTAMPTZ DEFAULT NOW(),
  event_name      VARCHAR(100),                  -- e.g. "IAE 2953", "Invictus 2954"
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_price_history_ship ON price_history (ship_id, recorded_at DESC);

-- ─── 3. Ships table additions ───────────────────────────────────────────────
-- Add columns for CCU eligibility tracking

ALTER TABLE ships ADD COLUMN IF NOT EXISTS is_ccu_eligible BOOLEAN DEFAULT true;
ALTER TABLE ships ADD COLUMN IF NOT EXISTS is_limited BOOLEAN DEFAULT false;
ALTER TABLE ships ADD COLUMN IF NOT EXISTS flight_status VARCHAR(30) DEFAULT 'flight_ready';
  -- Values: 'concept', 'in_development', 'flight_ready'

-- ─── 4. Seed calculated CCU prices ─────────────────────────────────────────
-- Auto-generate all valid CCU pairs from existing ships with MSRP data.
-- Standard CCU price = target_msrp - source_msrp (RSI rule).
-- This INSERT populates the ccu_prices table with ALL valid combinations.

INSERT INTO ccu_prices (from_ship_id, to_ship_id, standard_price, is_available, source)
SELECT
  s1.id AS from_ship_id,
  s2.id AS to_ship_id,
  ROUND((s2.msrp_usd - s1.msrp_usd)::numeric, 2) AS standard_price,
  true AS is_available,
  'calculated' AS source
FROM ships s1
CROSS JOIN ships s2
WHERE s1.msrp_usd IS NOT NULL
  AND s2.msrp_usd IS NOT NULL
  AND s2.msrp_usd > s1.msrp_usd
  AND s1.id != s2.id
ON CONFLICT (from_ship_id, to_ship_id) DO NOTHING;

-- ─── Verify ─────────────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM ccu_prices) AS total_ccu_prices,
  (SELECT COUNT(*) FROM ccu_prices WHERE warbond_price IS NOT NULL) AS with_warbond,
  (SELECT COUNT(*) FROM price_history) AS price_history_rows;
