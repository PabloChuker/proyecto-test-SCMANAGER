-- =============================================================================
-- Migración: 035_create_ship_pools
-- Módulo:    Límites de tamaño por familia (PowerPools)
-- =============================================================================
--
-- PROPÓSITO
--   Un ship.PowerPools.<Type>.Size determina qué tamaño máximo de componente
--   podés equipar para ese slot. El Avenger Titan por ejemplo:
--     { "Shield": 2, "WeaponGun": 4, "FlightController": -1 }
--   (−1 = no pool — unlimited / controller).
--
--   Es la columna que el ComponentPicker usa para filtrar "qué componente
--   puedo meter en este slot".
--
-- IDENTIDAD
--   PK compuesta (ship_id, item_type). Sin gen_random_uuid por simplicidad.
-- =============================================================================

create table if not exists ship_pools (
  ship_id        uuid     not null references ships(id) on delete cascade,
  item_type      text     not null,            -- "Shield" / "WeaponGun" / "FlightController"
  max_size       integer  not null,            -- -1 = ilimitado/controller
  min_size       integer,                      -- algunos pools tienen min
  primary key (ship_id, item_type)
);

create index if not exists ship_pools_ship_idx on ship_pools (ship_id);
