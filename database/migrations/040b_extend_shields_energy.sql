-- =============================================================================
-- Migración: 040_extend_shields_energy
-- Módulo:    Completar el modelo de energía en shields
-- =============================================================================
--
-- Agrega a shields:
--   · pips / power_ranges (config pip tier — el slider in-game)
--   · coolant_consumption_min/max
--   · ir_max (los shields no emiten IR significativa en scunpacked pero
--             dejamos la columna para consistencia)
-- =============================================================================

alter table shields add column if not exists pips                    integer;
alter table shields add column if not exists power_ranges            jsonb;
alter table shields add column if not exists coolant_consumption_min numeric;
alter table shields add column if not exists coolant_consumption_max numeric;
alter table shields add column if not exists ir_max                  numeric;

comment on column shields.power_ranges is
  '3-tier pip config: [{"s": start, "m": modifier, "r": register_range}, ...]. '
  'Ej. Bulwark S1: [{s:0,m:0.7,r:0},{s:1,m:0.85,r:1},{s:2,m:1.0,r:1}]';
