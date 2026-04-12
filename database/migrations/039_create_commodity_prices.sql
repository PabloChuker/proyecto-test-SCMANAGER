-- =============================================================================
-- Migration 039: Create commodity_prices table
--
-- Stores buy/sell prices per commodity per station.
-- direction = 'buy'  → station buys from player (player sells here)
-- direction = 'sell'  → station sells to player (player buys here)
-- =============================================================================

CREATE TABLE IF NOT EXISTS commodity_prices (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  commodity_abbr text NOT NULL,            -- e.g. 'QUAN', 'GOLD', 'BEXA'
  station       text NOT NULL,             -- e.g. 'TDD Area 18', 'Levski'
  system        text NOT NULL,             -- e.g. 'Stanton', 'Pyro', 'Nyx'
  direction     text NOT NULL CHECK (direction IN ('buy', 'sell')),
  price         integer NOT NULL,          -- aUEC per SCU
  updated_at    timestamptz DEFAULT now(),
  UNIQUE(commodity_abbr, station, direction)
);

-- Index for fast lookups by commodity
CREATE INDEX IF NOT EXISTS idx_commodity_prices_abbr ON commodity_prices (commodity_abbr);
CREATE INDEX IF NOT EXISTS idx_commodity_prices_station ON commodity_prices (station);

-- RLS: readable by everyone (public price data)
ALTER TABLE commodity_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "commodity_prices_read_all"
  ON commodity_prices FOR SELECT
  USING (true);

-- Only service role can insert/update (admin/scripts)
CREATE POLICY "commodity_prices_admin_write"
  ON commodity_prices FOR ALL
  USING (auth.role() = 'service_role');
