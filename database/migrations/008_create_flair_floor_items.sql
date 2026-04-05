-- Migration: Create flair_floor_items table
-- Description: Stores floor-mounted decorative items (Flair_Floor)

create table if not exists flair_floor_items (
    uuid uuid primary key,
    name text not null,
    description text,
    manufacturer_id uuid,
    size integer,
    grade integer,
    classification text,
    raw_data jsonb
);

-- Índices para optimizar búsquedas comunes
create index if not exists idx_flair_floor_name on flair_floor_items(name);
create index if not exists idx_flair_floor_manufacturer on flair_floor_items(manufacturer_id);

comment on table flair_floor_items is 'Registros de ítems decorativos de suelo (Flair_Floor) extraídos de ship-items.json';
