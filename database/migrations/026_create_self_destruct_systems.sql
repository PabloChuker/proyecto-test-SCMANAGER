-- =============================================================================
-- Migración: 026_create_self_destruct_systems
-- Módulo:    Naves y loadouts — Star Citizen
-- Generado por: db/scripts/import-self-destruct-systems.js
-- =============================================================================
--
-- DECISIONES DE DISEÑO
--
-- · id                UUID canónico del juego (stdItem.UUID = reference). PK natural.
--
-- · class_name        ClassName del juego. Codifica el tiempo de cuenta atrás
--                     (ej. VHCL_SelfDestruct_30s). Principal diferenciador entre
--                     registros, dado que todos comparten el mismo name.
--
-- · name / description
--                     Todos los registros actuales tienen name = "Self Destruct Unit".
--                     description se almacena como NULL cuando coincide con name
--                     (el JSON los tiene idénticos y no aporta información extra).
--
-- · size / grade      Siempre 1 en el dataset actual. Se incluyen porque son
--                     campos estándar del esquema de ítems y pueden variar en
--                     actualizaciones futuras.
--
-- · manufacturer_id   Siempre NULL: todos los registros tienen nil UUID
--                     (00000000-...). Se incluye por consistencia con el esquema
--                     de ítems. Sin FK forzada.
--
-- · sd_*              Campos del sub-objeto stdItem.SelfDestruct. Son los únicos
--                     datos que diferencian entre los 7 sistemas disponibles.
--                     sd_time = segundos de cuenta atrás antes de la detonación.
--                     Radios en metros.
--
-- · Omitidos          tags / classification / mass / width / height / length:
--                     constantes en todos los registros, sin valor de consulta.
--                     Emission: ausente en 1 registro, todo ceros donde existe.
--                     ResourceNetwork / Interactions / InventoryOccupancy:
--                     estructuras internas del motor sin valor de juego directo.
--
-- · Timestamps        No se añaden. Tabla de referencia estática del juego.
-- =============================================================================

create table if not exists self_destruct_systems (
  id                  uuid     primary key,
  class_name          text     not null,
  item_name           text,
  name                text     not null,
  description         text,
  size                integer,
  grade               integer,
  manufacturer_id     uuid,
  sd_damage           numeric  not null,
  sd_min_radius       numeric  not null,
  sd_radius           numeric  not null,
  sd_min_phys_radius  numeric  not null,
  sd_phys_radius      numeric  not null,
  sd_time             numeric  not null
);

-- Búsquedas por class_name (cruce con otros datasets del juego).
create index if not exists idx_self_destruct_systems_class_name
  on self_destruct_systems (class_name);

-- Búsquedas por tiempo de detonación (filtro principal entre variantes).
create index if not exists idx_self_destruct_systems_sd_time
  on self_destruct_systems (sd_time);

-- Búsquedas por radio de explosión.
create index if not exists idx_self_destruct_systems_sd_radius
  on self_destruct_systems (sd_radius);

-- Búsquedas por fabricante (parcial: solo filas con fabricante asignado).
create index if not exists idx_self_destruct_systems_manufacturer_id
  on self_destruct_systems (manufacturer_id)
  where manufacturer_id is not null;
