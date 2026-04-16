-- =============================================================================
-- Migración: 041_extend_coolers_energy
-- Módulo:    Completar modelo de energía en coolers
-- =============================================================================
--
-- Agrega a coolers:
--   · pips / power_ranges
--   · coolant_consumption_min/max (el cooler también "mueve" coolant, que
--     en el game engine es un resource aparte del heat)
-- =============================================================================

alter table coolers add column if not exists pips                    integer;
alter table coolers add column if not exists power_ranges            jsonb;
alter table coolers add column if not exists coolant_consumption_min numeric;
alter table coolers add column if not exists coolant_consumption_max numeric;

comment on column coolers.power_ranges is
  '3-tier pip config. Ej. Bracer S1: mod=[0.7, 0.85, 1.0]';
comment on column coolers.cooling_generation is
  'RN.Generation.Coolant. Cantidad de coolant producido por segundo.';
