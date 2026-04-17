-- =============================================================================
-- Migración: 046_weapon_thermal_fields
-- Módulo:    Datos térmicos de armas para cálculo de DPS sostenido
-- =============================================================================
--
-- Fuente: SWeaponSimplifiedHeatParams de cada arma en scunpacked-data
--   Raw.Entity.Components.SCItemWeaponComponentParams
--     .connectionParams.simplifiedHeatParams.SWeaponSimplifiedHeatParams
--
-- Campos clave para la fórmula de DPS sostenido heat-limited (armas balísticas):
--
--   heatPerSec      = rate_of_fire / 60 * heat_per_shot
--   tToOverheat     = overheat_temperature / (heatPerSec - cooling_per_second)
--   dutyCycle       = tToOverheat / (tToOverheat + overheat_fix_time)
--   sustainedDps    = burstDps * dutyCycle
--
-- Para armas láser (capacitor-limited) se usa la fórmula de 045 en su lugar:
--   fireTime        = weapon_capacity / (drainPerSec - maxRegenPerSec)
--   reloadTime      = weapon_capacity / maxRegenPerSec
--   dutyCycle       = fireTime / (fireTime + reloadTime)
--
-- Ejemplo APAR S4 Ballistic Gatling (Revenant):
--   heat_per_shot=0.5309735, rate_of_fire≈1200 → heatPerSec ≈ 10.62
--   cooling_per_second=31.7 → la tasa de enfriamiento supera el calentamiento
--   → nunca llega al overheat → sustainedDps ≈ burstDps (caso sin limitación)
--
-- Ejemplo CF-337 Panther en Asgard:
--   heatPerSec alto frente a cooling bajo → overheat real
--   tToOverheat ≈ overheat_temp / (heatPerSec - cooling)
-- =============================================================================

-- Per-weapon thermal data (from SWeaponSimplifiedHeatParams)
alter table weapon_guns add column if not exists overheat_temperature  numeric;
alter table weapon_guns add column if not exists cooling_per_second    numeric;
alter table weapon_guns add column if not exists overheat_fix_time     numeric;

comment on column weapon_guns.overheat_temperature is 'Temperatura de overheat del arma (SWeaponSimplifiedHeatParams.overheatTemperature)';
comment on column weapon_guns.cooling_per_second   is 'Enfriamiento en grados/seg a full-power (SWeaponSimplifiedHeatParams.coolingPerSecond)';
comment on column weapon_guns.overheat_fix_time    is 'Segundos de penalización tras overheat (SWeaponSimplifiedHeatParams.overheatFixTime)';
