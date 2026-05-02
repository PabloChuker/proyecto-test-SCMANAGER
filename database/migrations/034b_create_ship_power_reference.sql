-- =============================================================================
-- Migración: 034_create_ship_power_reference
-- Módulo:    Power & Emissions snapshot (scunpacked)
-- =============================================================================
--
-- PROPÓSITO
--   Snapshot de los agregados pre-calculados por scunpacked (ships.json)
--   para el LOADOUT STOCK de cada nave. Es la FUENTE DE VERDAD cuando el
--   usuario no ha modificado el loadout.
--
--   Si el usuario cambia algún componente en LoadoutBuilder, el front-end
--   aplica un "delta" sobre estos valores (ver docs/power-model-investigation.md §10).
--
-- CAMPOS CLAVE
--   · power_generation_segments: ships.json[n].Power.GenerationSegments
--     NOTA CRÍTICA: en naves multi-PP este valor NO es sum(genP de cada PP).
--     Ejemplo: Hammerhead con 2×24 genP reporta 30 (ratio 0.625).
--     Por eso guardamos también multi_pp_ratio para reproducir el cap
--     cuando el usuario cambie una PP.
--
--   · power_used_scm / power_used_nav
--     Modo SCM: shields ON, QT OFF. Modo Nav: shields OFF, QT ON.
--
--   · power_used_grouped_scm / _nav (jsonb)
--     Dict `{ "Shield": 6, "Cooler": 6, ... }` listo para pintar la UI.
--
--   · em_groups_scm / _nav (jsonb)
--     Emisiones EM agregadas por familia. No es suma directa del catálogo
--     (ver §5 del informe). Lo tomamos tal cual vino de scunpacked.
--
-- IDENTIDAD
--   PK = ship_id (1:1 con ships). on delete cascade.
-- =============================================================================

create table if not exists ship_power_reference (
  ship_id                        uuid primary key references ships(id) on delete cascade,

  -- ============ POWER ============
  power_generation_segments      numeric,         -- ships.json: Power.GenerationSegments
  power_used_scm                 numeric,         -- Power.UsedSegmentsShields
  power_used_nav                 numeric,         -- Power.UsedSegmentsQuantum
  power_used_grouped_scm         jsonb,           -- Power.UsedSegmentsGrouped (SCM)
  power_used_grouped_nav         jsonb,           -- UsedSegmentsQuantumGrouped (derived)

  -- ============ COOLING ============
  cooling_generation_segments    numeric,         -- Cooling.GenerationSegments
  cooling_used_scm               numeric,         -- Cooling.UsedSegmentsShields
  cooling_used_nav               numeric,         -- Cooling.UsedSegmentsQuantum
  cooling_used_pct_scm           numeric,         -- 0..1
  cooling_used_pct_nav           numeric,
  cooling_used_grouped_scm       jsonb,           -- Cooling.UsedSegmentsShieldsGrouped
  cooling_used_grouped_nav       jsonb,

  -- ============ EMISSIONS ============
  em_shields                     numeric,         -- Emission.EmShields (total SCM)
  em_quantum                     numeric,         -- Emission.EmQuantum (total Nav)
  ir_shields                     numeric,         -- Emission.IrShields
  ir_quantum                     numeric,         -- Emission.IrQuantum
  em_per_segment                 numeric,         -- Emission.EmPerSegment
  em_groups_scm                  jsonb,           -- EmGroupsShields
  em_groups_nav                  jsonb,           -- EmGroupsQuantum
  em_segment_groups_scm          jsonb,           -- EmSegmentGroupsShields
  em_segment_groups_nav          jsonb,

  -- ============ SHIELDS TOTAL ============
  total_shield_hp                numeric,         -- ShieldsTotal.Hp
  total_shield_regen             numeric,         -- ShieldsTotal.Regen
  total_shield_regen_raw         numeric,         -- ShieldsTotal.RegenRaw
  total_shield_regen_min_power   numeric,         -- ShieldsTotal.RegenMinPower
  distortion_pool                numeric,         -- Distortion.Pool

  -- ============ PROPULSION / QT ============
  fuel_capacity_hydrogen         numeric,         -- Propulsion.FuelCapacity
  fuel_intake_rate               numeric,         -- Propulsion.FuelIntakeRate
  fuel_usage_scm                 numeric,         -- Propulsion.FuelUsage (si existe)
  fuel_capacity_quantum          numeric,         -- QuantumTravel.FuelCapacity
  qt_range_km                    numeric,         -- QuantumTravel.Range
  qt_speed_ms                    numeric,         -- QuantumTravel.Speed
  qt_spool_time_s                numeric,         -- QuantumTravel.SpoolTime

  -- ============ META ============
  -- Ratio empírico (generación real / suma catálogo de PPs stock).
  -- Usado para aproximar generación cuando el usuario cambia una PP.
  multi_pp_ratio                 numeric,

  computed_at                    timestamptz default now(),
  source_version                 text
);

create index if not exists spr_ship_idx on ship_power_reference (ship_id);
