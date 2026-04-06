-- =============================================================================
-- Migración: 031_create_weapon_defensives
-- Módulo:    Naves y loadouts — Star Citizen
-- Generado por: scripts/import-weapon-defensives.js
-- =============================================================================
--
-- DECISIONES DE DISEÑO
--
-- · id               UUID canónico del juego (stdItem.UUID = reference). PK natural.
--                    Los 168 registros tienen UUID válido; 0 nil UUIDs.
--
-- · defensive_type   Tipo de contrameddida: "Flare" (85 registros) o "Chaff" (83).
--                    Principal diferenciador funcional entre lanzadores.
--
-- · size             0, 1 o 2. Determina la bahía de nave requerida.
--
-- · grade            Constante (1) en el dataset actual. Se incluye por
--                    consistencia con el esquema estándar de ítems.
--
-- · mass / width / height / length
--                    Dimensiones físicas con variación real entre registros.
--
-- · manufacturer_id  UUID del fabricante. 0 nil UUIDs: todos los 148 registros
--                    canónicos tienen fabricante válido. Sin FK forzada.
--
-- · capacity / initial_capacity
--                    stdItem.WeaponDefensive.Capacity e InitialCapacity.
--                    Rango 1–600. Indican cuántas contrameddidas puede disparar.
--
-- · sig_ir_* / sig_em_* / sig_cs_*
--                    Firmas de la contrameddida lanzada (Infrared, Electromagnetic,
--                    CrossSection). Cada una con Start y End en unidades del juego.
--                    Infrared: 20000–80000. EM: 20000–150000. CS: 6500–100000.
--                    Decibel: Start=0, End=0 constante → omitido.
--
-- · effective_range  Rango efectivo en metros (144–1080). stdItem.Weapon.
-- · rate_of_fire     Cadencia de disparo en RPM (50–450). stdItem.Weapon.
-- · spread_min/max   Dispersión mínima/máxima del lanzador (0–4 / 0–10).
--                    De stdItem.Weapon.Modes[0].Spread.
--
-- · Campos descartados:
--     subType / classification      → constantes "CountermeasureLauncher"
--     Weapon.WeaponType/WeaponClass → constantes "WeaponDefensive/CountermeasureLauncher"
--     Weapon.FireMode               → correlaciona 1:1 con defensive_type (redundante)
--     Weapon.Damage.*               → todo cero (lanzadores no infligen daño directo)
--     Weapon.Modes[0] daños         → todo cero (DamagePerShot, Alpha*, DPS*)
--     Weapon.Modes[0].AdsSpread     → idéntico a Spread en todos los registros
--     Durability.*                  → constantes (Health=1000, Resistance=1.0)
--     Signatures.Decibel            → Start=0, End=0 en los 168 registros
--     InventoryOccupancy            → constante (0.22×0.8×2.21, 0.084 SCU)
--     DimensionOverrides            → override de UI, constante 0.75³
--     tags / required_tags          → presentes en <5% de registros
--
-- · Timestamps       No se añaden. Tabla de referencia estática del juego.
-- =============================================================================

create table if not exists weapon_defensives (
  id                uuid     primary key,
  class_name        text     not null,
  item_name         text,
  name              text     not null,
  description       text,
  defensive_type    text,
  size              integer,
  grade             integer,
  mass              numeric,
  width             numeric,
  height            numeric,
  length            numeric,
  manufacturer_id   uuid,
  capacity          integer,
  initial_capacity  integer,
  sig_ir_start      numeric,
  sig_ir_end        numeric,
  sig_em_start      numeric,
  sig_em_end        numeric,
  sig_cs_start      numeric,
  sig_cs_end        numeric,
  effective_range   numeric,
  rate_of_fire      numeric,
  spread_min        numeric,
  spread_max        numeric
);

-- Búsquedas por class_name (cruce con loadouts y datos de naves).
create index if not exists idx_weapon_defensives_class_name
  on weapon_defensives (class_name);

-- Filtrado por tipo (Flare vs Chaff — diferenciador principal).
create index if not exists idx_weapon_defensives_defensive_type
  on weapon_defensives (defensive_type)
  where defensive_type is not null;

-- Filtrado por tamaño de bahía.
create index if not exists idx_weapon_defensives_size
  on weapon_defensives (size);

-- Filtrado por capacidad (número de contrameddidas disponibles).
create index if not exists idx_weapon_defensives_capacity
  on weapon_defensives (capacity);

-- Búsquedas por fabricante (parcial: solo filas con fabricante asignado).
create index if not exists idx_weapon_defensives_manufacturer_id
  on weapon_defensives (manufacturer_id)
  where manufacturer_id is not null;
