-- =============================================================================
-- Migración: 053_create_bombs
-- Módulo:    Naves y loadouts — Star Citizen
-- Generado por: scripts/import-bombs.mjs
-- =============================================================================
--
-- Bombs son explosivos que equipan ciertos racks (principalmente en bombers
-- como el Sabre Firebird, Retaliator, Eclipse, Polaris). En scunpacked están
-- marcados con `type: "Bomb"` en items.json — separadas de la tabla `missiles`
-- porque no tienen tracking (son gravity-drop) y sus stats relevantes son
-- distintos (ExplosionRadius, ArmTime, ignition delays).
--
-- DECISIONES DE DISEÑO (espejan el schema de missiles donde aplica)
--
-- · id               UUID canónico del juego (stdItem.UUID). PK natural.
-- · class_name       stdItem.ClassName. Identificador técnico.
-- · name             stdItem.Name. Nombre visible (ej "Colossus Bomb").
-- · description      stdItem.DescriptionText. Texto limpio.
-- · manufacturer_id  UUID del fabricante. Hoy todas FSKI (FireStorm Kinetics)
--                    pero el schema admite otros que aparezcan en el futuro.
-- · size / grade     Tamaño (3, 5, 10 actualmente) y grade (constante=1).
-- · sub_type         Bomb.<Subtype>: Utility (único presente hoy). Se separa
--                    del type principal "Bomb" para permitir variantes futuras
--                    (ej. Bomb.Cluster, Bomb.Nuclear).
-- · damage_total     stdItem.Bomb.DamageTotal. Suma física+energía+etc.
-- · damage_physical / energy / distortion / thermal / biochemical / stun
--                    Desglose del Bomb.Damage object. Permite mostrar tipo
--                    de daño dominante (importante para armor deflection).
-- · explosion_radius_min / max
--                    Rango del ExplosionRadius (hoy coinciden, pero CIG deja
--                    preparado el min vs max).
-- · arm_time         Segundos hasta que la bomba queda armada tras el drop.
-- · max_lifetime     Segundos antes que se autodestruya si no detona.
-- · is_cluster       Bombas cluster (sub-munición al detonar).
-- · requires_launcher
--                    Siempre true hoy — sugiere que van en racks especificos.
-- · durability_health HP de la bomba mientras cae (puede ser derribada).
-- · mass / width / height / length
--                    Dimensiones fisicas.
-- · raw_data         stdItem completo en JSONB para referencia futura.
--
-- · Timestamps       No se añaden — tabla de referencia estática del juego.
-- =============================================================================

create table if not exists bombs (
  id                   uuid    primary key,
  class_name           text    not null,
  name                 text    not null,
  description          text,
  manufacturer_id      uuid,
  size                 integer,
  grade                integer,
  sub_type             text,
  damage_total         numeric,
  damage_physical      numeric,
  damage_energy        numeric,
  damage_distortion    numeric,
  damage_thermal       numeric,
  damage_biochemical   numeric,
  damage_stun          numeric,
  explosion_radius_min numeric,
  explosion_radius_max numeric,
  arm_time             numeric,
  max_lifetime         numeric,
  is_cluster           boolean default false,
  requires_launcher    boolean default true,
  durability_health    numeric,
  mass                 numeric,
  width                numeric,
  height               numeric,
  length               numeric,
  raw_data             jsonb
);

-- Búsquedas por class_name (cruce con loadouts y otros datasets).
create index if not exists idx_bombs_class_name
  on bombs (class_name);

-- Filtrado por tamaño (determina el rack compatible).
create index if not exists idx_bombs_size
  on bombs (size);

-- Filtrado por subtipo (Utility, Cluster en el futuro, etc.).
create index if not exists idx_bombs_sub_type
  on bombs (sub_type)
  where sub_type is not null;

-- Búsquedas por fabricante.
create index if not exists idx_bombs_manufacturer_id
  on bombs (manufacturer_id)
  where manufacturer_id is not null;

comment on table bombs is 'Bombas de gravedad/utility extraídas de scunpacked/items.json (type="Bomb"). Separadas de missiles porque no tienen tracking y tienen stats propios (ExplosionRadius, ArmTime).';
