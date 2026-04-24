-- =============================================================================
-- Migración: 057_extend_quantum_interdiction_generators
-- Módulo:    Naves y loadouts — Star Citizen — QIG / QED / QDMP
-- Generado:  2026-04-24 (Fase N.1 — Pablo/Garnok)
-- =============================================================================
--
-- CONTEXTO
--
-- La tabla quantum_interdiction_generators existía con stats funcionales
-- (jamming_range, interdiction_range, pulse_charge_time, pulse_radius) pero
-- le faltaban los campos de energía y emisiones que el LoadoutBuilder usa
-- para alimentar el power grid y el signature panel.
--
-- Esta migración suma las columnas que siguen la convención de weapon_mining
-- / weapon_guns / shields:
--   - power_consumption_min / max   (MW — del ResourceNetwork.States)
--   - em_max / em_min / em_decay    (Emission.Em — firma EM cuando active)
--   - ir_max                        (Emission.Ir — firma térmica)
--   - pulse_discharge_time          (Pulse.DischargeTimeSecs)
--   - pulse_cooldown_time           (Pulse.CooldownTimeSecs)
--   - jammer_max_power_draw         (Jammer.MaxPowerDraw — MW pico)
--   - base / pulse / jammer         power_fraction (reparto interno del juego)
--
-- No tocamos el PK compuesto (uuid, game_version) ni la FK a game_versions —
-- ya existen desde la migración 049.
-- =============================================================================

ALTER TABLE quantum_interdiction_generators
  ADD COLUMN IF NOT EXISTS power_consumption_min      numeric,
  ADD COLUMN IF NOT EXISTS power_consumption_max      numeric,
  ADD COLUMN IF NOT EXISTS em_max                     numeric,
  ADD COLUMN IF NOT EXISTS em_min                     numeric,
  ADD COLUMN IF NOT EXISTS em_decay                   numeric,
  ADD COLUMN IF NOT EXISTS ir_max                     numeric,
  ADD COLUMN IF NOT EXISTS pulse_discharge_time       numeric,
  ADD COLUMN IF NOT EXISTS pulse_cooldown_time        numeric,
  ADD COLUMN IF NOT EXISTS jammer_max_power_draw      numeric,
  ADD COLUMN IF NOT EXISTS base_power_draw_fraction   numeric,
  ADD COLUMN IF NOT EXISTS pulse_power_fraction       numeric,
  ADD COLUMN IF NOT EXISTS jammer_power_fraction      numeric;

COMMENT ON COLUMN quantum_interdiction_generators.power_consumption_min     IS 'MW mínimo — del ResourceNetwork.States[Online].Deltas[Consumption/Power].Rate con MinimumFraction aplicada.';
COMMENT ON COLUMN quantum_interdiction_generators.power_consumption_max     IS 'MW máximo — del ResourceNetwork.States[Online].Deltas[Consumption/Power].Rate pico.';
COMMENT ON COLUMN quantum_interdiction_generators.em_max                    IS 'EM signature máximo (stdItem.Emission.Em.Maximum). Ej: Reynie = 17000.';
COMMENT ON COLUMN quantum_interdiction_generators.em_min                    IS 'EM signature mínimo (stdItem.Emission.Em.Minimum).';
COMMENT ON COLUMN quantum_interdiction_generators.em_decay                  IS 'EM decay rate (stdItem.Emission.Em.Decay).';
COMMENT ON COLUMN quantum_interdiction_generators.ir_max                    IS 'IR / thermal signature (stdItem.Emission.Ir). 0 en todos los QIGs actuales.';
COMMENT ON COLUMN quantum_interdiction_generators.pulse_discharge_time      IS 'stdItem.QIG.Pulse.DischargeTimeSecs — duración del pulso (dispatcha el interdicte).';
COMMENT ON COLUMN quantum_interdiction_generators.pulse_cooldown_time       IS 'stdItem.QIG.Pulse.CooldownTimeSecs — tiempo entre pulsos.';
COMMENT ON COLUMN quantum_interdiction_generators.jammer_max_power_draw     IS 'stdItem.QIG.Jammer.MaxPowerDraw — consumo pico del jammer en modo activo.';
COMMENT ON COLUMN quantum_interdiction_generators.base_power_draw_fraction  IS 'stdItem.QIG.BasePowerDrawFraction — fracción del power plant que consume en estado online.';
COMMENT ON COLUMN quantum_interdiction_generators.pulse_power_fraction      IS 'stdItem.QIG.PulsePowerFraction — fracción extra consumida durante el pulso.';
COMMENT ON COLUMN quantum_interdiction_generators.jammer_power_fraction     IS 'stdItem.QIG.JammerPowerFraction — fracción extra consumida con jammer activo.';
