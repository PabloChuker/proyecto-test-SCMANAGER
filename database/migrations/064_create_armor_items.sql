-- =============================================================================
-- Migración: 064_create_armor_items
-- Módulo:    Crafting — FPS armor base stats
-- Generado:  2026-04-27 (Frost)
-- =============================================================================
--
-- CONTEXTO
--
-- Los blueprints de crafteo (tabla `blueprints` + `blueprint_materials`)
-- definen QUÉ se puede craftear y CON QUÉ modificadores de calidad. Pero los
-- stats BASE del item resultante (damage reduction inicial, temperatura
-- min/max, radiación, etc.) no estaban importados — se necesitan para
-- calcular el FINAL stat que ve el usuario:
--
--   FINAL = BASE × (1 + sum_of_quality_modifiers / 100)
--
-- Esta es la fórmula que usa SCCrafter, verificada contra capturas de
-- usuario en Q0/250/500/750/1000 con coincidencia exacta.
--
-- FUENTE DE DATOS
--
-- scunpacked-data/fps-items.json → cada item tiene `stdItem.DescriptionData`
-- como strings parseables:
--
--   "Item Type":           "Heavy Armor"
--   "Damage Reduction":    "40%"
--   "Temp. Rating":        "-70 / 100 °C"
--   "Radiation Protection":"26800 REM"
--   "Radiation Scrub Rate":"145.8 REM/s"
--   "Carrying Capacity":   "8.0 µSCU"
--
-- DECISIONES DE DISEÑO
--
-- · PK compuesta (uuid, game_version) — convención de Garnok establecida en
--   jump_drives, weapon_mining, weapon_guns, quantum_interdiction_generators.
--
-- · FK a game_versions(version) ON DELETE CASCADE — al borrar una versión de
--   juego se limpian sus items asociados (DB team requirement).
--
-- · damage_reduction como NUMERIC(5,4) — guardamos como decimal (0.4000 para
--   40%) para multiplicar directo en el cálculo FINAL = BASE × (1+pct/100).
--
-- · raw_data jsonb — guardamos el stdItem.DescriptionData completo por si
--   más adelante queremos exponer otros campos sin re-importar todo.
--
-- · Índice en class_name (sin game_version) porque las queries habituales
--   son JOIN blueprints.output_class = armor_items.class_name AND
--   armor_items.game_version = (latest). Index en (class_name) cubre el
--   primer predicado y el filtro por game_version usa el PK index.
-- =============================================================================

CREATE TABLE IF NOT EXISTS armor_items (
  uuid                       uuid          NOT NULL,
  game_version               varchar(50)   NOT NULL DEFAULT '4.7.0-LIVE.11518367',
  class_name                 text          NOT NULL,
  name                       text          NOT NULL,
  type                       text,             -- "Char_Armor_Legs", "Char_Armor_Torso", etc.
  subtype                    text,             -- "Light", "Medium", "Heavy"
  size                       integer,
  grade                      integer,

  -- Stats parsed from stdItem.DescriptionData
  damage_reduction           numeric(5,4),     -- 0.4000 (parsed from "40%")
  temp_min_celsius           numeric(6,2),     -- -70.00 (from "Temp. Rating: -70 / 100 °C")
  temp_max_celsius           numeric(6,2),     -- 100.00
  radiation_capacity_rem     integer,          -- 26800 (from "26800 REM")
  radiation_scrub_rem_s      numeric(6,2),     -- 145.80 (from "145.8 REM/s")
  carrying_capacity_uscu     numeric(12,3),    -- 8.000 (from "8.0 µSCU"); precisión amplia porque las mochilas usan "105K µSCU" = 105000

  -- Físicas
  mass                       numeric,
  width                      numeric,
  height                     numeric,
  length                     numeric,

  -- Manufacturer
  manufacturer_code          text,             -- "CDS"
  manufacturer_name          text,             -- "Clark Defense Systems"
  manufacturer_uuid          uuid,

  -- Otros
  rarity                     text,             -- "Uncommon", "Common", etc.
  description                text,             -- stdItem.Description: texto completo con prefijo de stats + lore
  description_lore           text,             -- stdItem.DescriptionText: solo lore (sin prefijo de stats)

  -- Source
  raw_data                   jsonb,            -- stdItem.DescriptionData completo (key/value de stats parseable)
  imported_at                timestamptz   NOT NULL DEFAULT NOW(),

  CONSTRAINT armor_items_pkey
    PRIMARY KEY (uuid, game_version),
  CONSTRAINT armor_items_game_version_fkey
    FOREIGN KEY (game_version) REFERENCES game_versions(version) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS armor_items_class_name_idx ON armor_items (class_name);
CREATE INDEX IF NOT EXISTS armor_items_type_idx       ON armor_items (type);
CREATE INDEX IF NOT EXISTS armor_items_subtype_idx    ON armor_items (subtype);

COMMENT ON TABLE  armor_items                         IS 'Stats base de armaduras FPS de Star Citizen — sirven como BASE para el cálculo FINAL = BASE × (1+pct/100) en el módulo de crafteo. Joineado con blueprints vía class_name = blueprints.output_class.';
COMMENT ON COLUMN armor_items.damage_reduction        IS 'Damage reduction como decimal (0.4 = 40%). Parseado de stdItem.DescriptionData["Damage Reduction"].';
COMMENT ON COLUMN armor_items.temp_min_celsius        IS 'Temperatura mínima soportada en °C. Parseado de "Temp. Rating: -X / Y °C".';
COMMENT ON COLUMN armor_items.temp_max_celsius        IS 'Temperatura máxima soportada en °C.';
COMMENT ON COLUMN armor_items.radiation_capacity_rem  IS 'Capacidad de absorción de radiación en REM antes de fallar.';
COMMENT ON COLUMN armor_items.radiation_scrub_rem_s   IS 'Velocidad a la que la armadura disipa la radiación acumulada (REM/s).';
COMMENT ON COLUMN armor_items.carrying_capacity_uscu  IS 'Capacidad de carga del item en µSCU (no del personaje).';
COMMENT ON COLUMN armor_items.description             IS 'stdItem.Description del JSON — texto completo con prefijo de stats (Item Type, Damage Reduction, etc.) + lore en lineas siguientes.';
COMMENT ON COLUMN armor_items.description_lore        IS 'stdItem.DescriptionText del JSON — solo el lore (sin prefijo de stats), apto para mostrar en UI.';
COMMENT ON COLUMN armor_items.raw_data                IS 'stdItem.DescriptionData completo en JSON — fallback si necesitamos exponer campos no parseados.';
