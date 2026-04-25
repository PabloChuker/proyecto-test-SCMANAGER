-- =============================================================================
-- Migración: 058_create_jump_drives
-- Módulo:    Naves y loadouts — Star Citizen — Jump Drives
-- Generado:  2026-04-25 (Fase P.1 — Pablo)
-- =============================================================================
--
-- CONTEXTO
--
-- En SC el Jump Drive es un módulo separado del Quantum Drive. El QT drive
-- mueve la nave dentro de un sistema; el Jump Drive permite saltos
-- inter-sistema atravesando jump points. Ambos son "navegación cuántica" en
-- el HUD pero son items distintos en items.json (type=JumpDrive vs
-- type=QuantumDrive).
--
-- En la práctica solo las naves capital (890 Jump, Bengal, Idris, Javelin,
-- Polaris) traen un Jump Drive equipado por default — el resto no. Pero la
-- tabla nos permite poblarlos en el catalog para que el picker los muestre
-- y el LoadoutBuilder los pueda renderizar junto al QT drive.
--
-- DECISIONES DE DISEÑO
--
-- · PK compuesta (uuid, game_version) — convención de Garnok establecida en
--   weapon_mining / weapon_guns / quantum_interdiction_generators. FK a
--   game_versions(version) con default 4.7.0-LIVE.11518367.
--
-- · Stats clave del std.JumpDrive: AlignmentRate / AlignmentDecayRate /
--   TuningRate / TuningDecayRate / FuelUsageEfficiencyMultiplier. Determinan
--   qué tan rápido se alinea el JD a un jump point y cuánto fuel quema.
--
-- · Distortion + Durability se incluyen porque el JD puede sobrecargarse y
--   romperse, mismo modelo de daño que el QT drive.
--
-- · Sin power_consumption_*: los JumpDrives en scunpacked no consumen power
--   continuo (solo QuantumFuel durante el salto). Si CIG cambia esto en el
--   futuro se puede ALTER TABLE.
-- =============================================================================

CREATE TABLE IF NOT EXISTS jump_drives (
  uuid                              uuid             NOT NULL,
  game_version                      varchar(50)      NOT NULL DEFAULT '4.7.0-LIVE.11518367',
  name                              text,
  description                       text,
  class_name                        text,
  manufacturer_id                   uuid,
  size                              integer,
  grade                             integer,

  -- Stats funcionales (std.JumpDrive)
  alignment_rate                    numeric,
  alignment_decay_rate              numeric,
  tuning_rate                       numeric,
  tuning_decay_rate                 numeric,
  fuel_usage_efficiency_multiplier  numeric,

  -- Distortion (std.Distortion)
  distortion_max                    numeric,
  distortion_decay_rate             numeric,
  distortion_decay_delay            numeric,
  distortion_warning_ratio          numeric,
  distortion_recovery_ratio         numeric,
  distortion_shutdown_time          numeric,

  -- Durabilidad
  health                            numeric,

  -- Físicas
  mass                              numeric,
  width                             numeric,
  height                            numeric,
  length                            numeric,
  scu                               numeric,

  -- Source
  raw_data                          jsonb,

  CONSTRAINT jump_drives_pkey
    PRIMARY KEY (uuid, game_version),
  CONSTRAINT jump_drives_game_version_fkey
    FOREIGN KEY (game_version) REFERENCES game_versions(version)
);

CREATE INDEX IF NOT EXISTS jump_drives_size_idx       ON jump_drives (size);
CREATE INDEX IF NOT EXISTS jump_drives_class_name_idx ON jump_drives (class_name);

COMMENT ON TABLE  jump_drives                                  IS 'Jump Drives (type=JumpDrive de scunpacked). Módulo independiente del Quantum Drive — habilita saltos inter-sistema. Mayoritariamente equipado en capital ships.';
COMMENT ON COLUMN jump_drives.alignment_rate                    IS 'std.JumpDrive.AlignmentRate — velocidad a la que el JD se alinea con un jump point.';
COMMENT ON COLUMN jump_drives.tuning_rate                       IS 'std.JumpDrive.TuningRate — qué tan rápido sintoniza la frecuencia del jump.';
COMMENT ON COLUMN jump_drives.fuel_usage_efficiency_multiplier  IS 'std.JumpDrive.FuelUsageEfficiencyMultiplier — multiplicador del consumo de QuantumFuel durante el salto.';
COMMENT ON COLUMN jump_drives.distortion_max                    IS 'std.Distortion.Maximum — daño de distortion antes de shutdown.';
