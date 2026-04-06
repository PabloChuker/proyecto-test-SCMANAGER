-- Migration: Create flair_wall_items table
-- Description: Stores wall-mounted decorative items (Flair_Wall)

create table if not exists flair_wall_items (
    uuid uuid primary key,
    name text not null,
    description text,
    manufacturer_id uuid,
    size integer,
    grade integer,
    sub_type text,
    classification text,
    raw_data jsonb
);

-- Índices
create index if not exists idx_flair_wall_name on flair_wall_items(name);
create index if not exists idx_flair_wall_manufacturer on flair_wall_items(manufacturer_id);

comment on table flair_wall_items is 'Registros de ítems decorativos de pared (Flair_Wall) extraídos de ship-items.json';
