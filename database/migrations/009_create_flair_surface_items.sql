-- Migration: Create flair_surface_items table
-- Description: Stores surface-mounted decorative items (Flair_Surface)

create table if not exists flair_surface_items (
    uuid uuid primary key,
    name text not null,
    description text,
    manufacturer_id uuid,
    size integer,
    grade integer,
    mass numeric,
    sub_type text,
    classification text,
    tags text[],
    raw_data jsonb
);

-- Índices
create index if not exists idx_flair_surface_name on flair_surface_items(name);
create index if not exists idx_flair_surface_manufacturer on flair_surface_items(manufacturer_id);

comment on table flair_surface_items is 'Registros de ítems decorativos de superficie (Flair_Surface) extraídos de ship-items.json';
