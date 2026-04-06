-- Migration: Create manneuver_thrusters table
-- Description: Stores maneuver thruster components for ships

create table if not exists manneuver_thrusters (
    uuid uuid primary key,
    name text not null,
    description text,
    class_name text not null,
    manufacturer_id uuid,
    size integer,
    grade integer,
    thrust_capacity numeric,
    fuel_burn_rate numeric,
    thruster_type text,
    mass numeric,
    health numeric,
    raw_data jsonb
);

-- Índices
create index if not exists idx_manneuver_thrusters_manufacturer on manneuver_thrusters(manufacturer_id);
create index if not exists idx_manneuver_thrusters_class on manneuver_thrusters(class_name);
create index if not exists idx_manneuver_thrusters_type on manneuver_thrusters(thruster_type);

comment on table manneuver_thrusters is 'Registros de propulsores de maniobra (Maneuver Thrusters) extraídos de ship-items.json';
