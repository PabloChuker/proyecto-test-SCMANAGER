-- Migration: Create quantum_interdiction_generators table
-- Description: Stores quantum interdiction and jamming component data

create table if not exists quantum_interdiction_generators (
    uuid uuid primary key,
    name text not null,
    description text,
    class_name text not null,
    manufacturer_id uuid,
    size integer,
    grade integer,
    jamming_range numeric,
    interdiction_range numeric,
    pulse_charge_time numeric,
    pulse_radius numeric,
    raw_data jsonb
);

-- Índices
create index if not exists idx_qig_manufacturer on quantum_interdiction_generators(manufacturer_id);
create index if not exists idx_qig_class on quantum_interdiction_generators(class_name);

comment on table quantum_interdiction_generators is 'Registros de generadores de interdicción cuántica extraídos de ship-items.json';
