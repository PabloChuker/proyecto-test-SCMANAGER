-- =============================================================================
-- Migración: 039_extend_power_plants_energy
-- Módulo:    Completar el modelo de energía en power_plants
-- =============================================================================
--
-- PROPÓSITO
--   La tabla power_plants existente tiene `power_generation` (output) y
--   `em_max`, pero le faltan:
--     · power_consumption_min/max: algunas plantas dinámicas tienen un rango
--     · coolant_consumption_min/max: la PP también consume coolant
--     · pips / power_ranges: tier config (la mayoría de PPs son pips=0, rígidas)
--     · ir_max: IR baseline (muchas PPs son ir=0 pero el schema debe soportarlo)
--
-- SEGURIDAD
--   IF NOT EXISTS en cada ALTER para que sea idempotente (Supabase permite
--   re-correr migraciones por error).
-- =============================================================================

alter table power_plants add column if not exists power_consumption_min   numeric;
alter table power_plants add column if not exists power_consumption_max   numeric;
alter table power_plants add column if not exists coolant_consumption_min numeric;
alter table power_plants add column if not exists coolant_consumption_max numeric;
alter table power_plants add column if not exists pips                    integer;
alter table power_plants add column if not exists power_ranges            jsonb;
alter table power_plants add column if not exists ir_max                  numeric;

-- COMENTARIOS
comment on column power_plants.power_consumption_min is
  'RN.Usage.Power.Minimum. Usually equal to Maximum for rigid plants.';
comment on column power_plants.power_consumption_max is
  'RN.Usage.Power.Maximum. For variable-output plants, upper pip consumption.';
comment on column power_plants.power_ranges is
  '3-tier pip config: [{"s": start, "m": modifier, "r": register_range}, ...]';
