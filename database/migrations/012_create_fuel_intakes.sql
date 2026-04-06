-- Migration: Create fuel_intakes table
-- Description: Stores fuel intake components

create table if not exists fuel_intakes (
    uuid uuid primary key,
    name text not null,
    description text,
    class_name text not null,
    manufacturer_id uuid,
    size integer,
    grade integer,
    fuel_push_rate numeric,
    minimum_rate numeric,
    sub_type text,
    raw_data jsonb
);

-- Índices
create index if not exists idx_fuel_intakes_manufacturer on fuel_intakes(manufacturer_id);
create index if not exists idx_fuel_intakes_class on fuel_intakes(class_name);

comment on table fuel_intakes is 'Registros de tomas de combustible (Fuel Intakes) extraídos de ship-items.json';
