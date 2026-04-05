-- =============================================================================
-- Migración: 018_create_missile_launchers
-- Módulo:    Naves y loadouts — Star Citizen
-- Generado por: scripts/import-missile-launchers.js
-- =============================================================================
--
-- DECISIONES DE DISEÑO
--
-- · id               UUID canónico del juego (stdItem.UUID = reference). PK natural.
--                    Los 129 registros tienen UUID válido; 0 nil UUIDs.
--
-- · size             Rango 1–10. Determina el tamaño de misil que puede lanzar.
--
-- · grade            Constante (1) en el dataset actual. Se incluye por
--                    consistencia con el esquema estándar de ítems.
--
-- · mass / width / height / length
--                    Dimensiones físicas con variación real. mass: {0, 1, 20, 100}.
--
-- · manufacturer_id  UUID del fabricante. 0 nil UUIDs: todos los 125 registros
--                    canónicos tienen fabricante válido. 15 fabricantes distintos.
--                    Sin FK forzada.
--
-- · missile_count    stdItem.MissileRack.MissileCount. Valores: 1 o 2.
--                    Representa el número de misiles disparados por ciclo de fuego.
--                    Es el ÚNICO campo del sub-objeto MissileRack.
--
-- · missiles_label   stdItem.DescriptionData["Missiles"]. Etiqueta legible del
--                    formato "2xS2", "8xS3", "4xS4", etc. (NxSM = N misiles
--                    de tamaño M). Presente en 92/125 registros canónicos.
--                    Complementa a ports para una vista rápida de capacidad.
--
-- · durability_health stdItem.Durability.Health. Rango: 200–35000 (7 valores
--                    distintos). Presente en 126/129 registros.
--
-- · ports            stdItem.Ports. Array jsonb con los slots de misil del
--                    lanzador. Presente en 123/129 registros. Conteo de ports
--                    por lanzador: 1–32. Tamaños de port: 1–12.
--                    Port.Types ∈ {Missile.Missile, Missile.Torpedo,
--                    Missile.GroundVehicleMissile, AttachedPart}.
--                    Índice GIN para consultas sobre tamaño y tipo de slot.
--
-- · Campos descartados:
--     subType / classification           → constantes "MissileRack"
--     stdItem.ResourceNetwork            → configuración interna del motor
--     stdItem.InventoryOccupancy / DimensionOverrides → display/UI interno
--     Durability.Salvageable / Repairable / Resistance → constantes
--     Tags / RequiredTags                → etiquetado de compatibilidad por nave
--     Interactions                       → presente en 1/129 registros
--     DescriptionData["Item Type"] / ["Manufacturer"] / ["Size"] → redundantes
--     stdItem.Description                → usa DescriptionText (texto limpio)
--
-- · Timestamps       No se añaden. Tabla de referencia estática del juego.
-- =============================================================================

create table if not exists missile_launchers (
  id                uuid    primary key,
  class_name        text    not null,
  item_name         text,
  name              text    not null,
  description       text,
  size              integer,
  grade             integer,
  mass              numeric,
  width             numeric,
  height            numeric,
  length            numeric,
  manufacturer_id   uuid,
  missile_count     integer,
  missiles_label    text,
  durability_health numeric,
  ports             jsonb
);

-- Búsquedas por class_name (cruce con loadouts y datos de naves).
create index if not exists idx_missile_launchers_class_name
  on missile_launchers (class_name);

-- Filtrado por tamaño (determina qué tamaño de misil acepta).
create index if not exists idx_missile_launchers_size
  on missile_launchers (size);

-- Filtrado por número de misiles por ciclo de fuego (1 o 2).
create index if not exists idx_missile_launchers_missile_count
  on missile_launchers (missile_count)
  where missile_count is not null;

-- Búsquedas por fabricante (parcial: solo filas con fabricante asignado).
create index if not exists idx_missile_launchers_manufacturer_id
  on missile_launchers (manufacturer_id)
  where manufacturer_id is not null;

-- Consultas sobre slots de misil (tipo, tamaño, EquippedItem).
create index if not exists idx_missile_launchers_ports_gin
  on missile_launchers using gin (ports)
  where ports is not null;
