-- Migration: Create fuel_tanks table
-- Description: Stores fuel tank components (Hydrogen and Quantum)

create table if not exists fuel_tanks (
    uuid uuid primary key,
    name text not null,
    description text,
    class_name text not null,
    manufacturer_id uuid,
    size integer,
    grade integer,
    sub_type text,
    quantum_fuel_capacity numeric,
    raw_data jsonb
);

-- Índices
create index if not exists idx_fuel_tanks_manufacturer on fuel_tanks(manufacturer_id);
create index if not exists idx_fuel_tanks_class on fuel_tanks(class_name);

comment on table fuel_tanks is 'Registros de tanques de combustible (Hydrogen/Quantum) extraídos de ship-items.json';
