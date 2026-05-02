-- =============================================================================
-- Migración: 042_extend_quantum_drives_energy
-- Módulo:    Completar el modelo de energía en quantum_drives
-- =============================================================================
--
-- La tabla quantum_drives creada en 021 tiene sólo specs (drive_speed,
-- cooldown, spool_up, fuel_rate, mass) pero le faltan TODOS los campos
-- de energía y emisiones.
--
-- Agregamos:
--   · power_consumption_min/max (QT consume 2 pips fijos en casi todas)
--   · coolant_consumption_min/max
--   · pips / power_ranges
--   · em_max / ir_max (QT tiene em_max altísimo: Expedition S1 = 15000)
--   · distortion_* (como todo componente activo)
--   · health / dimensiones (completar consistencia con otras tablas)
-- =============================================================================

alter table quantum_drives add column if not exists power_consumption_min       numeric;
alter table quantum_drives add column if not exists power_consumption_max       numeric;
alter table quantum_drives add column if not exists coolant_consumption_min     numeric;
alter table quantum_drives add column if not exists coolant_consumption_max     numeric;
alter table quantum_drives add column if not exists pips                        integer;
alter table quantum_drives add column if not exists power_ranges                jsonb;
alter table quantum_drives add column if not exists em_max                      numeric;
alter table quantum_drives add column if not exists ir_max                      numeric;

alter table quantum_drives add column if not exists health                      numeric;
alter table quantum_drives add column if not exists distortion_shutdown_damage  numeric;
alter table quantum_drives add column if not exists distortion_decay_delay      numeric;
alter table quantum_drives add column if not exists distortion_decay_rate       numeric;
alter table quantum_drives add column if not exists distortion_shutdown_time    numeric;

alter table quantum_drives add column if not exists width                       numeric;
alter table quantum_drives add column if not exists height                      numeric;
alter table quantum_drives add column if not exists length                      numeric;
alter table quantum_drives add column if not exists scu                         numeric;

comment on column quantum_drives.em_max is
  'Emission.Em.Maximum. QT drives son MUY ruidosos (Expedition S1 = 15000).';
comment on column quantum_drives.fuel_rate is
  'QuantumDrive.FuelRate. Consumo de quantum fuel. Unidad probable: L/km.';
