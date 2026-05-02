-- =============================================================================
-- Migración: 037_alter_radars_power_model  (v2 — ALTER, no CREATE)
-- Módulo:    Catálogo de radares
-- =============================================================================
--
-- CONTEXTO
--   `radars` ya existe. Columnas actuales:
--     uuid (PK), name, description, class_name, manufacturer_id, size, grade,
--     sub_type, sensitivity (numeric), ground_vehicle_sensitivity_addition,
--     mass, raw_data, game_version.
--
--   El schema actual es DEMASIADO POBRE para el modelo de power que estamos
--   armando. Los radares consumen power y coolant, emiten EM/IR, y tienen
--   un perfil multi-etapa (pips 0/1/2) como shields y PPs.
--
-- OJO
--   · La PK es `uuid` (no `id`). No la tocamos.
--   · `sensitivity` ya existe como numeric — lo dejamos.
--     Agregamos `sensitivity_profile jsonb` para dicts como
--     `{ "cross_section": 1.0, "em": 0.6, "ir": 0.4 }` de piercing.
--   · Todas las columnas nuevas son NULL-safe.
-- =============================================================================

alter table if exists radars
  -- ============ ENERGÍA ============
  add column if not exists power_consumption_min    numeric,
  add column if not exists power_consumption_max    numeric,
  add column if not exists coolant_consumption_min  numeric,
  add column if not exists coolant_consumption_max  numeric,
  add column if not exists pips                     integer,
  add column if not exists power_ranges             jsonb,
  -- ============ RANGO / DETECCIÓN ============
  add column if not exists range_max_m              numeric,
  add column if not exists range_min_m              numeric,
  add column if not exists piercing                 jsonb,         -- penetración por tipo de emisión
  add column if not exists sensitivity_profile      jsonb,         -- multiplicadores por signature type
  -- ============ EMISIONES ============
  add column if not exists em_max                   numeric,
  add column if not exists em_min                   numeric,
  add column if not exists ir_max                   numeric,
  -- ============ DISTORSIÓN / SALUD ============
  add column if not exists health                   numeric,
  add column if not exists distortion_shutdown_damage  numeric,
  add column if not exists distortion_decay_delay      numeric,
  add column if not exists distortion_decay_rate       numeric,
  add column if not exists distortion_warning_ratio    numeric,
  add column if not exists distortion_shutdown_time    numeric,
  -- ============ DIMENSIONES ============
  add column if not exists width  numeric,
  add column if not exists height numeric,
  add column if not exists length numeric,
  add column if not exists scu    numeric;

create index if not exists radars_class_name_idx   on radars (class_name);
create index if not exists radars_size_idx         on radars (size);
create index if not exists radars_grade_idx        on radars (grade);

comment on column radars.power_ranges is
  'Array JSONB con los 3 segmentos pip: [{s:0,m:0.5,r:0},{s:1,m:0.75,r:0.5},{s:2,m:1,r:1}] — mode, mix, range.';
comment on column radars.pips is
  'Número de pips [0|1|2] como los demás componentes (consistente con power_plants/quantum_drives).';
comment on column radars.piercing is
  'Penetración del haz del radar por tipo de signature (JSON dict).';
