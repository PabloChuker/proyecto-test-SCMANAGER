-- =============================================================================
-- Migración: 036_alter_ship_hardpoints_power_model  (v2 — ALTER, no CREATE)
-- Módulo:    Hardpoints físicos de la nave
-- =============================================================================
--
-- CONTEXTO
--   `ship_hardpoints` ya existe en producción con estas columnas:
--     id (uuid PK), ship_reference (text), hardpoint_name, hardpoint_type,
--     max_size, min_size, editable (bool), item_types, default_item_class,
--     default_item_uuid, default_item_name, default_item_type,
--     default_item_manufacturer, default_item_grade, loadout_json (jsonb),
--     created_at
--
--   En el modelo actual el vínculo con ships es por `ship_reference` (text)
--   que matchea `ships.reference`. Para habilitar JOINs duros por UUID y
--   soportar HARDPOINTS ANIDADOS (ej: turretas → sub-hardpoints de armas),
--   agregamos:
--
--   · ship_id       uuid — FK lógica a ships(id). Se mantiene ship_reference
--                          para retrocompat con código existente. El backfill
--                          lo hace el script ingest_power_model.py.
--   · parent_hp_id  uuid — self-ref para anidar turret sub-slots.
--   · stock_item_id uuid — referencia al catálogo (power_plants.id,
--                          shields.id, etc.) del item STOCK de este slot.
--                          Permite identificar la categoría real del item
--                          cuando default_item_uuid es sólo el class_name.
--   · stock_loadout jsonb — snapshot del loadout inicial (sin modificar)
--                          para poder resetear.
--   · position_index int — orden visual dentro del grupo (para UI).
--   · notes         text — hints manuales (opcional).
--
-- SAFE: todas las columnas son NULLable y usan IF NOT EXISTS.
-- =============================================================================

alter table if exists ship_hardpoints
  add column if not exists ship_id         uuid,
  add column if not exists parent_hp_id    uuid,
  add column if not exists stock_item_id   uuid,
  add column if not exists stock_loadout   jsonb,
  add column if not exists position_index  integer,
  add column if not exists notes           text;

-- Índices para los JOINs frecuentes
create index if not exists sh_ship_id_idx    on ship_hardpoints (ship_id);
create index if not exists sh_parent_id_idx  on ship_hardpoints (parent_hp_id);
create index if not exists sh_ship_ref_idx   on ship_hardpoints (ship_reference);
create index if not exists sh_hp_type_idx    on ship_hardpoints (hardpoint_type);

-- NOTA: no se añade FK dura `ship_id REFERENCES ships(id)` en esta migración.
--       Se agregará en una segunda pasada después de que ingest_power_model.py
--       haga el backfill. Idem para parent_hp_id REFERENCES ship_hardpoints(id).
