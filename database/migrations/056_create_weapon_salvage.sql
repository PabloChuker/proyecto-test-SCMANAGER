-- =============================================================================
-- Migración: 055_create_weapon_salvage
-- Módulo:    Naves y loadouts — Star Citizen — componentes de salvage
-- Generado:  2026-04-24 (Fase M — Pablo/Garnok)
-- =============================================================================
--
-- CONTEXTO
--
-- Hasta esta migración los componentes de salvage (SalvageHead y
-- SalvageModifier) eran hardcode dentro de src/app/api/ships/[id]/route.ts
-- para que los widgets del LoadoutBuilder no quedaran vacíos en Vulture /
-- Fortune / Salvation / Reclaimer. No había tabla en Supabase.
--
-- Esta migración crea weapon_salvage como sink dedicado (equivalente a
-- weapon_mining para minería). El picker del LoadoutBuilder va a leer de
-- aquí en vez del hardcode, y el ingest de scunpacked va a poblarla igual
-- que el resto de equipment.
--
-- DECISIONES DE DISEÑO
--
-- · Tabla única con sub_type en vez de dos tablas (heads + modifiers)
--   siguiendo el patrón de weapon_attachments (Barrel/FiringMechanism/etc).
--   Ambos tipos comparten ~80% de columnas (físicas, manufacturer, size,
--   grade, class_name) y el split se hace vía WHERE sub_type = ... en los
--   consumers.
--
-- · PK compuesta (id, game_version) — convención establecida por Garnok
--   en weapon_mining / weapon_guns / missile_launchers. Permite tener
--   misma entidad en múltiples patches sin borrar historia.
--
-- · game_version default '4.7.0-LIVE.11518367' + FK a game_versions(version)
--   igual que weapon_mining.
--
-- · modifier_kind — columna derivada del className (Tractor / Scraper) que
--   el picker del hijo usa para filtrar en el LoadoutBuilder: un scraper
--   no puede ir en el slot del tractor ni viceversa. Para SalvageHead
--   queda NULL.
--
-- · Se guardan los multiplicadores de SalvageModifier (speed, radius,
--   extraction_efficiency) que son lo único que diferencia un modifier
--   de otro. Los heads son wrapper de tractor beam y no tienen stats
--   propias — sólo identidad + size.
--
-- · raw_data jsonb con el stdItem entero, para poder extraer más stats
--   en el futuro sin re-ingestar.
-- =============================================================================

CREATE TABLE IF NOT EXISTS weapon_salvage (
  id                          uuid            NOT NULL,
  game_version                varchar(50)     NOT NULL DEFAULT '4.7.0-LIVE.11518367',
  class_name                  text            NOT NULL,
  item_name                   text,
  name                        text,
  description                 text,
  manufacturer_id             uuid,
  sub_type                    text            NOT NULL,
  modifier_kind               text,
  size                        integer,
  grade                       integer,
  -- Stats SalvageModifier
  salvage_speed_multiplier    numeric,
  radius_multiplier           numeric,
  extraction_efficiency       numeric,
  -- Físicas
  mass                        numeric,
  width                       numeric,
  height                      numeric,
  length                      numeric,
  scu                         numeric,
  -- Source
  raw_data                    jsonb,
  CONSTRAINT weapon_salvage_pkey
    PRIMARY KEY (id, game_version),
  CONSTRAINT weapon_salvage_game_version_fkey
    FOREIGN KEY (game_version) REFERENCES game_versions(version),
  CONSTRAINT weapon_salvage_sub_type_chk
    CHECK (sub_type IN ('Head', 'Modifier')),
  CONSTRAINT weapon_salvage_modifier_kind_chk
    CHECK (
      (sub_type = 'Modifier' AND modifier_kind IN ('Tractor', 'Scraper'))
      OR (sub_type = 'Head' AND modifier_kind IS NULL)
      OR (sub_type = 'Modifier' AND modifier_kind IS NULL)
    )
);

-- Índices secundarios para el picker (filtra por sub_type + size + game_version)
CREATE INDEX IF NOT EXISTS weapon_salvage_sub_type_idx
  ON weapon_salvage (sub_type);

CREATE INDEX IF NOT EXISTS weapon_salvage_modifier_kind_idx
  ON weapon_salvage (modifier_kind);

CREATE INDEX IF NOT EXISTS weapon_salvage_size_idx
  ON weapon_salvage (size);

CREATE INDEX IF NOT EXISTS weapon_salvage_class_name_idx
  ON weapon_salvage (class_name);

COMMENT ON TABLE  weapon_salvage                        IS 'SalvageHead + SalvageModifier (tractor/scraper) de scunpacked. Alimenta el LoadoutBuilder para naves de salvage (Vulture/Fortune/Salvation/Reclaimer).';
COMMENT ON COLUMN weapon_salvage.sub_type               IS 'Head | Modifier';
COMMENT ON COLUMN weapon_salvage.modifier_kind          IS 'Sólo para sub_type=Modifier: Tractor | Scraper. NULL para Head.';
COMMENT ON COLUMN weapon_salvage.salvage_speed_multiplier IS 'stdItem.SalvageModifier.SalvageSpeedMultiplier — velocidad relativa de extracción.';
COMMENT ON COLUMN weapon_salvage.radius_multiplier       IS 'stdItem.SalvageModifier.RadiusMultiplier — radio de cobertura del beam.';
COMMENT ON COLUMN weapon_salvage.extraction_efficiency   IS 'stdItem.SalvageModifier.ExtractionEfficiency — fracción de material recuperado (0–1).';
