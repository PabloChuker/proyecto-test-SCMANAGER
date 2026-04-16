-- =============================================================================
-- Migración: 045_weapon_capacitor_fields
-- Módulo:    Datos de capacitor/regeneración de armas para cálculo de munición
-- =============================================================================
--
-- Fuente: SWeaponRegenConsumerParams de cada arma en scunpacked-data
--
-- Campos clave para la fórmula de munición sostenida:
--   rounds = requested_ammo_load × (pips / max_weapon_pips) / regen_cost_per_bullet
--
-- Ejemplo CF-337 Panther en Asgard (4 pips máx):
--   1 pip  → 18187 × 0.25 / 48.5 ≈  94 rounds
--   2 pips → 18187 × 0.50 / 48.5 ≈ 188 rounds
--   4 pips → 18187 × 1.00 / 48.5 ≈ 375 rounds
-- =============================================================================

-- Per-weapon capacitor/regen data (from SWeaponRegenConsumerParams)
alter table weapon_guns add column if not exists requested_ammo_load      numeric;
alter table weapon_guns add column if not exists regen_cost_per_bullet    numeric;
alter table weapon_guns add column if not exists max_ammo_load            integer;
alter table weapon_guns add column if not exists max_regen_per_sec        numeric;
alter table weapon_guns add column if not exists regen_cooldown           numeric;

comment on column weapon_guns.requested_ammo_load   is 'Total energy pool for weapon capacitor (SWeaponRegenConsumerParams.requestedAmmoLoad)';
comment on column weapon_guns.regen_cost_per_bullet  is 'Energy cost to regenerate 1 bullet (SWeaponRegenConsumerParams.regenerationCostPerBullet)';
comment on column weapon_guns.max_ammo_load          is 'Max bullets in capacitor pool (SWeaponRegenConsumerParams.maxAmmoLoad)';
comment on column weapon_guns.max_regen_per_sec      is 'Max bullet regen rate per second at full power (SWeaponRegenConsumerParams.maxRegenPerSec)';
comment on column weapon_guns.regen_cooldown         is 'Seconds after last shot before regen starts (SWeaponRegenConsumerParams.regenerationCooldown)';
