-- =============================================================================
-- Migration 038: Add quality and location fields to mining tables
-- =============================================================================

-- Add quality + location to mining_inventory
ALTER TABLE mining_inventory
  ADD COLUMN IF NOT EXISTS quality smallint DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS location text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS location_system text DEFAULT NULL;

-- Add quality to mining_work_orders ores JSONB (no schema change needed since ores is jsonb,
-- but we add a comment for documentation)
COMMENT ON COLUMN mining_inventory.quality IS 'Material quality 0-1000 (game unit, manually entered in work order)';
COMMENT ON COLUMN mining_inventory.location IS 'Station/refinery where the material is currently stored';
COMMENT ON COLUMN mining_inventory.location_system IS 'Star system (Stanton, Pyro, Nyx) of the location';
