-- =============================================================================
-- Migración: 061_create_fps_weapons
-- Módulo:    Tools — FPS weapons data
-- Generado:  2026-04-25 (Pablo)
-- =============================================================================
--
-- Tabla con la data maestra de armas FPS de Star Citizen — alpha damage,
-- fire rate por modo (single/burst/rapid), magazine, bullet speed, volumen.
-- Source: planilla curada por Pablo a partir de in-game testing. Se actualiza
-- vía script ingest cuando CIG balancea armas.
--
-- PK = name. No usamos UUIDs porque la "name" es la identidad de marketing
-- y no hay multi-versión de armas FPS (a diferencia de naves/components).
-- =============================================================================

CREATE TABLE IF NOT EXISTS fps_weapons (
  name              text          NOT NULL PRIMARY KEY,
  type              text          NOT NULL,
  magazine          numeric,
  bullet_speed      numeric,
  alpha_damage      numeric,
  max_firerate      numeric,
  max_dps           numeric,
  single_firerate   numeric,
  single_dps        numeric,
  burst_firerate    numeric,
  burst_dps         numeric,
  rapid_firerate    numeric,
  rapid_dps         numeric,
  volume_micro_scu  numeric,
  source            text          NOT NULL DEFAULT 'pablo-sheet',
  imported_at       timestamptz   NOT NULL DEFAULT NOW(),
  updated_at        timestamptz   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fps_weapons_type_idx     ON fps_weapons (type);
CREATE INDEX IF NOT EXISTS fps_weapons_max_dps_idx  ON fps_weapons (max_dps DESC);

COMMENT ON TABLE  fps_weapons              IS 'Armas FPS de Star Citizen con stats por modo de fuego.';
COMMENT ON COLUMN fps_weapons.type         IS 'Ballistic, Energy (Laser/Electron/Plasma), Rocket, Foam Dart, etc.';
COMMENT ON COLUMN fps_weapons.alpha_damage IS 'Daño por disparo (alpha).';
COMMENT ON COLUMN fps_weapons.max_dps      IS 'DPS al máximo fire rate disponible (cap superior teórico).';
