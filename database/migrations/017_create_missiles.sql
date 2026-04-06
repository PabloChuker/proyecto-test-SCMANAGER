-- Migration: Create missiles table
-- Description: Stores missile and torpedo data

create table if not exists missiles (
    uuid uuid primary key,
    name text not null,
    description text,
    manufacturer_id uuid,
    size integer,
    grade integer,
    tracking_signal_type text,
    lock_range_min numeric,
    lock_range_max numeric,
    lock_time numeric,
    damage_total numeric,
    linear_speed numeric,
    is_cluster boolean default false,
    raw_data jsonb
);

-- Índices
create index if not exists idx_missiles_manufacturer on missiles(manufacturer_id);
create index if not exists idx_missiles_tracking on missiles(tracking_signal_type);

comment on table missiles is 'Registros de misiles y torpedos extraídos de ship-items.json';
