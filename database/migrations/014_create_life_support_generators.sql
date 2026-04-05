-- Migration: Create life_support_generators table
-- Description: Stores life support generator components

create table if not exists life_support_generators (
    uuid uuid primary key,
    name text not null,
    description text,
    class_name text not null,
    manufacturer_id uuid,
    size integer,
    grade integer,
    power_min numeric,
    power_max numeric,
    coolant_min numeric,
    coolant_max numeric,
    raw_data jsonb
);

-- Índices
create index if not exists idx_life_support_gen_manufacturer on life_support_generators(manufacturer_id);
create index if not exists idx_life_support_gen_class on life_support_generators(class_name);

comment on table life_support_generators is 'Registros de generadores de soporte vital (Life Support) extraídos de ship-items.json';
