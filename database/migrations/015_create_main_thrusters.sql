-- Migration: Create main_thrusters table
-- Description: Stores main thruster components for ships

create table if not exists main_thrusters (
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
create index if not exists idx_main_thrusters_manufacturer on main_thrusters(manufacturer_id);
create index if not exists idx_main_thrusters_class on main_thrusters(class_name);
create index if not exists idx_main_thrusters_type on main_thrusters(thruster_type);

comment on table main_thrusters is 'Registros de propulsores principales (Main Thrusters) extraídos de ship-items.json';
