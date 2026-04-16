-- =============================================================================
-- Migración: 044_create_weapon_mining
-- Módulo:    Componentes — Mining Lasers (23 items en scunpacked)
-- =============================================================================
--
-- No existía tabla dedicada. Se diferencia de weapon_guns porque los mining
-- lasers tienen parámetros propios (laser power, throughput, stability,
-- resistance, optimal range, charge mode) que no caben en la tabla de armas.
--
-- Esta tabla va de la mano con la skill de Mining (que ya traducimos al 100%)
-- y con el Loadout Manager para naves de minería (Prospector, Mole).
-- =============================================================================

create table if not exists weapon_mining (
  id                          uuid     primary key,
  class_name                  text     not null unique,
  item_name                   text,
  name                        text     not null,
  description                 text,
  manufacturer_id             uuid,
  size                        integer,
  grade_number                integer,
  grade                       text,
  class                       text,

  -- CONSUMO DE ENERGÍA (network)
  power_consumption_min       numeric,
  power_consumption_max       numeric,
  coolant_consumption_min     numeric,
  coolant_consumption_max     numeric,

  -- EMISIONES
  em_max                      numeric,
  ir_max                      numeric,

  -- MECÁNICA DE MINADO
  mining_laser_power          numeric,            -- máxima potencia del láser (MW)
  optimal_range               numeric,            -- rango óptimo en m
  maximum_range               numeric,            -- rango máximo en m
  extraction_throughput       numeric,            -- mCU/s extraídos en modo extraction
  mining_modifier             numeric,            -- multiplicador de potencia
  resistance_modifier         numeric,            -- afecta materiales duros
  instability_modifier        numeric,            -- volatilidad del rock
  optimal_charge_window       numeric,            -- % óptimo del charge
  optimal_charge_rate         numeric,            -- % velocidad óptima
  shatter_damage              numeric,

  -- Durabilidad
  health                      numeric,
  distortion_shutdown_damage  numeric,
  distortion_shutdown_time    numeric,

  -- Dimensiones
  mass                        numeric,
  width                       numeric,
  height                      numeric,
  length                      numeric,
  scu                         numeric,

  raw_data                    jsonb
);

create index if not exists weapon_mining_size_idx on weapon_mining (size);
