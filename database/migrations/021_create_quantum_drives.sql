-- Migration: Create quantum_drives table
-- Description: Stores ship quantum drive component data

create table if not exists quantum_drives (
    uuid uuid primary key,
    name text not null,
    description text,
    class_name text not null,
    manufacturer_id uuid,
    size integer,
    grade integer,
    drive_speed numeric,
    cooldown_time numeric,
    spool_up_time numeric,
    fuel_rate numeric,
    mass numeric,
    raw_data jsonb
);

-- Índices
create index if not exists idx_quantum_drives_manufacturer on quantum_drives(manufacturer_id);
create index if not exists idx_quantum_drives_class on quantum_drives(class_name);
create index if not exists idx_quantum_drives_speed on quantum_drives(drive_speed);

comment on table quantum_drives is 'Registros de motores cuánticos (Quantum Drives) extraídos de ship-items.json';
