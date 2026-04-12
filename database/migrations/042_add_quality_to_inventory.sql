-- =============================================================================
-- Migracion: 042_add_quality_to_inventory
-- Modulo:    Mining & Industry
-- Fecha:     2026-04-12
-- =============================================================================
--
-- Adds quality column to mining_inventory so material quality
-- (0-1000 scale) is tracked when orders are collected.
-- =============================================================================

ALTER TABLE mining_inventory
  ADD COLUMN IF NOT EXISTS quality INTEGER;

-- Also add quality to movements for audit trail
ALTER TABLE mining_movements
  ADD COLUMN IF NOT EXISTS quality INTEGER;
