-- Migration: Create paints table
-- Description: Stores ship livery and paint data

create table if not exists paints (
    uuid uuid primary key,
    name text not null,
    description text,
    class_name text not null,
    item_name text,
    manufacturer_id uuid,
    tags text[],
    required_tags text[],
    raw_data jsonb
);

-- Índices
create index if not exists idx_paints_manufacturer on paints(manufacturer_id);
create index if not exists idx_paints_class on paints(class_name);
create index if not exists idx_paints_required_tags on paints using gin(required_tags);

comment on table paints is 'Registros de pinturas y libreas de naves extraídos de ship-items.json';
