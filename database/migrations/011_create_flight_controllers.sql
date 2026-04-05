-- Migration: Create flight_controllers table
-- Description: Stores flight controller components (Flight Blades)

create table if not exists flight_controllers (
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
create index if not exists idx_flight_controllers_manufacturer on flight_controllers(manufacturer_id);
create index if not exists idx_flight_controllers_class on flight_controllers(class_name);

comment on table flight_controllers is 'Registros de controladores de vuelo (Flight Blades) extraídos de ship-items.json';
