-- =============================================================================
-- Migration: rename ships.reference → ships.class_name
--
-- Context: the `reference` column stores the SC entity class name (e.g.
-- "AEGS_Avenger_Titan"), which is exactly what the game calls `className`.
-- A separate `class_name` column existed but was never populated nor read.
-- This migration drops the empty column and renames `reference` to `class_name`
-- so the DB column name matches the game's own terminology.
-- =============================================================================

-- 1. Drop the old (empty) class_name column if it exists
ALTER TABLE ships DROP COLUMN IF EXISTS class_name;

-- 2. Rename reference → class_name
ALTER TABLE ships RENAME COLUMN reference TO class_name;
