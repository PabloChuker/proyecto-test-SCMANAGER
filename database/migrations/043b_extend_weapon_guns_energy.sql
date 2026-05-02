-- =============================================================================
-- Migración: 043_extend_weapon_guns_energy
-- Módulo:    Completar el modelo de energía en weapon_guns
-- =============================================================================
--
-- La tabla weapon_guns (032) tiene `heat_per_shot`, `rate_of_fire`,
-- `weapon_capacity`, pero le faltan los consumos de energía del power network.
--
-- DIFERENCIACIÓN IMPORTANTE:
--   · heat_per_shot pertenece al sistema INTERNO del arma (overheat de cañón,
--     cooldown, shotsToOverheat). NO es el coolant network.
--   · power_consumption_min/max son del power network ship-level.
--   · ballistic vs energy weapons:
--       - Balística: power_consumption_* ≈ 0 (no consume pips), finito en ammo.
--       - Energía: power_consumption_* > 0, ammo infinita (regen con power).
--
-- Agregamos también coolant_consumption_* (algunas armas de energía sí usan
-- coolant del network) y is_energy_weapon para filtros en UI.
-- =============================================================================

alter table weapon_guns add column if not exists power_consumption_min   numeric;
alter table weapon_guns add column if not exists power_consumption_max   numeric;
alter table weapon_guns add column if not exists coolant_consumption_min numeric;
alter table weapon_guns add column if not exists coolant_consumption_max numeric;
alter table weapon_guns add column if not exists ir_max                  numeric;
alter table weapon_guns add column if not exists is_energy_weapon        boolean;
alter table weapon_guns add column if not exists ammo_regen_per_sec      numeric;

comment on column weapon_guns.is_energy_weapon is
  'TRUE si es laser/distortion/plasma (ammo infinita, consume power). FALSE si ballistic (ammo finita).';
comment on column weapon_guns.ammo_regen_per_sec is
  'Para armas de energía: cuánta "ammo" (ciclos) regenera con power máx/s.';
