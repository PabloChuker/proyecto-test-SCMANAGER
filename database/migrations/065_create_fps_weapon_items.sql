-- =============================================================================
-- Migración: 065_create_fps_weapon_items
-- Módulo:    Crafting — FPS weapon base stats
-- Generado:  2026-04-27 (Frost)
-- =============================================================================
--
-- CONTEXTO
--
-- Igual que la migración 064 hizo para armaduras (armor_items), esta crea la
-- tabla `fps_weapon_items` con stats base de armas FPS para que el módulo de
-- crafteo pueda calcular FINAL = BASE × (1 + sum_pct/100) y mostrarlo en la
-- UI junto al porcentaje (mismo comportamiento que SCCrafter).
--
-- FUENTE DE DATOS
--
-- scunpacked-data/fps-items.json → cada arma tiene DOS bloques de datos:
--
-- · stdItem.DescriptionData — strings de display:
--     "Item Type":        "Sniper Rifle"
--     "Class":            "Ballistic"
--     "Magazine Size":    "15"
--     "Rate Of Fire":     "120 rpm"
--     "Effective Range":  "80 m"
--     "Attachments":      "Optics (S3), Barrel (S2), Underbarrel (S2)"
--
-- · stdItem.Weapon — stats numéricos completos:
--     RateOfFire: 225, Capacity: 15, EffectiveRange: 1600,
--     Damage.Alpha.{Physical,Energy,Thermal,Distortion,Biochemical,Stun},
--     Damage.Dps.{Physical,Energy,...},
--     Spread: { Minimum, Maximum, FirstAttack, Attack, Decay },
--     Modes: [{ Name, DamagePerShot, DamagePerSecond, RoundsPerMinute, ... }]
--
-- DECISIONES DE DISEÑO
--
-- · Mismo patrón que armor_items: PK (uuid, game_version), FK a game_versions
--   ON DELETE CASCADE, raw_data jsonb para fallback.
--
-- · Solo importamos `type=WeaponPersonal` (las armas reales). Los
--   `WeaponAttachment` (cañón, culata, mira, etc.) se quedan fuera porque no
--   tienen stats de damage/firerate que sirvan como BASE para los modifiers
--   de crafteo; sus efectos modifican otras stats que no podemos enlazar
--   directo.
--
-- · Damage desglosado por tipo (Physical, Energy, Thermal, Distortion,
--   Biochemical, Stun) porque no sabemos a priori qué tipo usa cada arma —
--   ballistic usa Physical, energy weapons usan Energy/Thermal, etc. El
--   total `damage_alpha_total` es la suma para uso simple.
--
-- · DPS desglosado igual. Útil para tools/comparador de armas más adelante.
--
-- · Spread del modo "Single" (hipfire, ojos abiertos) — el más representativo
--   y consistente entre armas. Los modos burst/rapid se quedan en raw_data.
--
-- · Para el modifier `weapon_damage` el JOIN usa `damage_alpha_total`. Para
--   `weapon_firerate` usa `rate_of_fire_rpm`. Recoil (handling/kick/smoothness)
--   no tiene BASE en scunpacked → la UI seguirá mostrando solo el % combinado.
-- =============================================================================

CREATE TABLE IF NOT EXISTS fps_weapon_items (
  uuid                       uuid          NOT NULL,
  game_version               varchar(50)   NOT NULL DEFAULT '4.7.0-LIVE.11518367',
  class_name                 text          NOT NULL,
  name                       text          NOT NULL,
  type                       text,             -- "WeaponPersonal"
  subtype                    text,             -- "Medium", "Light", "Heavy"
  size                       integer,
  grade                      integer,

  -- DescriptionData parsed (display-friendly strings)
  item_type                  text,             -- "Sniper Rifle", "Pistol", "SMG"...
  damage_class               text,             -- "Ballistic", "Energy", "Foam Dart"...
  attachments_summary        text,             -- "Optics (S3), Barrel (S2), ..."
  effective_range_m          numeric(10,2),    -- parsed de "80 m"
  rate_of_fire_rpm           numeric(10,2),    -- parsed de "120 rpm"
  magazine_size              integer,          -- parsed de "15"

  -- stdItem.Weapon (stats estructurados)
  weapon_class_struct        text,             -- "Medium" (del struct, no display)
  effective_range_struct     numeric(10,2),    -- en metros, valor numérico exacto
  rate_of_fire_struct        numeric(10,2),    -- RPM del struct
  capacity                   integer,          -- capacity del struct
  fire_mode_default          text,             -- "Single", "Burst", "Rapid"

  -- Damage Alpha (per shot) por tipo de daño
  damage_alpha_total         numeric(10,2),    -- suma de todos los tipos
  damage_alpha_physical      numeric(10,2),
  damage_alpha_energy        numeric(10,2),
  damage_alpha_thermal       numeric(10,2),
  damage_alpha_distortion    numeric(10,2),
  damage_alpha_biochemical   numeric(10,2),
  damage_alpha_stun          numeric(10,2),

  -- DPS por tipo de daño
  dps_total                  numeric(10,2),
  dps_physical               numeric(10,2),
  dps_energy                 numeric(10,2),
  dps_thermal                numeric(10,2),
  dps_distortion             numeric(10,2),
  dps_biochemical            numeric(10,2),
  dps_stun                   numeric(10,2),

  -- Spread (modo Single, hipfire)
  spread_min                 numeric(8,2),
  spread_max                 numeric(8,2),
  spread_first_attack        numeric(8,2),
  spread_attack              numeric(8,2),
  spread_decay               numeric(8,2),

  -- Físicas
  mass                       numeric,
  width                      numeric,
  height                     numeric,
  length                     numeric,

  -- Manufacturer
  manufacturer_code          text,
  manufacturer_name          text,
  manufacturer_uuid          uuid,

  -- Otros
  rarity                     text,
  description                text,             -- stdItem.Description: full + lore
  description_lore           text,             -- stdItem.DescriptionText: solo lore
  raw_data                   jsonb,            -- DescriptionData + Weapon completos
  imported_at                timestamptz   NOT NULL DEFAULT NOW(),

  CONSTRAINT fps_weapon_items_pkey
    PRIMARY KEY (uuid, game_version),
  CONSTRAINT fps_weapon_items_game_version_fkey
    FOREIGN KEY (game_version) REFERENCES game_versions(version) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS fps_weapon_items_class_name_idx ON fps_weapon_items (class_name);
CREATE INDEX IF NOT EXISTS fps_weapon_items_type_idx       ON fps_weapon_items (type);
CREATE INDEX IF NOT EXISTS fps_weapon_items_item_type_idx  ON fps_weapon_items (item_type);
CREATE INDEX IF NOT EXISTS fps_weapon_items_subtype_idx    ON fps_weapon_items (subtype);

COMMENT ON TABLE  fps_weapon_items                          IS 'Stats base de armas FPS personales (WeaponPersonal). Sirven como BASE para FINAL = BASE × (1+pct/100) en el modulo de crafteo. Joineado con blueprints vía class_name = blueprints.output_class.';
COMMENT ON COLUMN fps_weapon_items.damage_alpha_total       IS 'Daño por disparo total (suma de todos los tipos). Usado como BASE para el modifier weapon_damage.';
COMMENT ON COLUMN fps_weapon_items.rate_of_fire_rpm         IS 'Cadencia de fuego en RPM, parseada de DescriptionData. Usado como BASE para el modifier weapon_firerate.';
COMMENT ON COLUMN fps_weapon_items.rate_of_fire_struct      IS 'Cadencia de fuego del struct stdItem.Weapon.RateOfFire (puede diferir del display de DescriptionData).';
COMMENT ON COLUMN fps_weapon_items.spread_min               IS 'Spread mínimo en modo Single (hipfire, ojos abiertos). Modes burst/rapid en raw_data.';
COMMENT ON COLUMN fps_weapon_items.raw_data                 IS 'stdItem.DescriptionData + stdItem.Weapon completos en JSON. Fallback para campos no parseados (modes per fire-mode, ads_spread, magazine info, attachments...).';
