-- =============================================================================
-- Migración: 038_alter_flight_controllers_power_model  (v2 — ALTER, no CREATE)
-- Módulo:    Catálogo de Flight Controllers
-- =============================================================================
--
-- CONTEXTO
--   `flight_controllers` ya existe. Columnas actuales:
--     uuid (PK), name, description, class_name, manufacturer_id, size, grade,
--     power_min, power_max, coolant_min, coolant_max, raw_data.
--
--   Ya tiene energía base (naming legacy: power_min/max, coolant_min/max) —
--   NO renombramos para no romper consumidores. Agregamos ALIAS estándar
--   (power_consumption_*, coolant_consumption_*) que el ingest rellena, y
--   los campos que faltan del modelo energético completo.
--
-- OJO
--   · PK es `uuid` (no `id`). Mantenida.
--   · Los alias nuevos y los viejos pueden coexistir — ingest_power_model.py
--     los deja en sincro. El código de front/back nuevo usa los *consumption_*,
--     el código viejo sigue con power_min/max.
-- =============================================================================

alter table if exists flight_controllers
  -- Alias estándar (se llenan a partir de power_min/max existentes)
  add column if not exists power_consumption_min    numeric,
  add column if not exists power_consumption_max    numeric,
  add column if not exists coolant_consumption_min  numeric,
  add column if not exists coolant_consumption_max  numeric,
  -- Perfil pips
  add column if not exists pips                     integer,
  add column if not exists power_ranges             jsonb,
  -- Emisiones
  add column if not exists em_max                   numeric,
  add column if not exists ir_max                   numeric,
  -- Distorsión / salud
  add column if not exists health                         numeric,
  add column if not exists distortion_shutdown_damage     numeric,
  add column if not exists distortion_decay_delay         numeric,
  add column if not exists distortion_decay_rate          numeric,
  add column if not exists distortion_warning_ratio       numeric,
  add column if not exists distortion_shutdown_time       numeric,
  -- Dimensiones / meta
  add column if not exists mass          numeric,
  add column if not exists width         numeric,
  add column if not exists height        numeric,
  add column if not exists length        numeric,
  add column if not exists scu           numeric,
  add column if not exists price         numeric,
  add column if not exists game_version  varchar;

create index if not exists fc_class_name_idx on flight_controllers (class_name);
create index if not exists fc_size_idx       on flight_controllers (size);
create index if not exists fc_grade_idx      on flight_controllers (grade);

comment on column flight_controllers.power_consumption_min is
  'Alias de power_min (naming consistente con el resto del catálogo). Llenado por ingest.';
comment on column flight_controllers.power_consumption_max is
  'Alias de power_max.';
