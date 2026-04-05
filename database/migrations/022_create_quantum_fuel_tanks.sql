-- Migration: Create quantum_fuel_tanks table
-- Description: Stores ship quantum fuel tank component data

create table if not exists quantum_fuel_tanks (
    uuid uuid primary key,
    name text not null,
    description text,
    class_name text not null,
    manufacturer_id uuid,
    size integer,
    grade integer,
    capacity numeric,
    raw_data jsonb
);

-- Índices
create index if not exists idx_quantum_fuel_tanks_manufacturer on quantum_fuel_tanks(manufacturer_id);
create index if not exists idx_quantum_fuel_tanks_class on quantum_fuel_tanks(class_name);

comment on table quantum_fuel_tanks is 'Registros de tanques de combustible cuántico extraídos de ship-items.json';
