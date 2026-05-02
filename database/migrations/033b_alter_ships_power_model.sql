-- =============================================================================
-- Migración: 033_alter_ships_power_model  (v2 — ALTER, no CREATE)
-- Módulo:    Naves y loadouts — Star Citizen
-- =============================================================================
--
-- CONTEXTO
--   La tabla `ships` ya existe en producción con 21 columnas (id uuid PK,
--   reference, name, manufacturer, manufacturer_id, role, size, max_crew,
--   mass, cargo_capacity, msrp_usd, warbond_usd, is_ccu_eligible, is_limited,
--   flight_status, deflection_physical/energy/distortion, glb_key, game_version,
--   updated_at).
--
--   Esta migración NO recrea la tabla — sólo agrega las columnas necesarias
--   para el modelo de power/energy/emissions (docs/power-model-investigation.md).
--   Todas las columnas nuevas son NULLable y usan IF NOT EXISTS, así que la
--   migración es idempotente y no destructiva.
--
-- DECISIONES
--   · class_name              ClassName CryEngine (ej. "AEGS_Avenger_Titan").
--                             Se agrega SIN UNIQUE — el UNIQUE se añade en
--                             una migración posterior después de backfill.
--   · Se preserva `reference` (campo existente) y `manufacturer` (text).
--   · deflection_*            Ya existente — se interpreta como armor_*_mult.
--                             No se renombra para no romper código consumidor.
--   · Nuevos campos de armor  armor_health (hp del casco).
--   · Nuevos campos de shield shield_face_type (Bubble/Quadrant), reconfig,
--                             realloc, elec_charge_dmg.
--   · length_m/width_m/height_m  dimensiones físicas en metros.
--   · mass_empty_kg / mass_loadout_kg / mass_total_kg
--     Desglose de masa (la col existente `mass` se deja como fallback).
--   · raw_data                snapshot JSONB completo del ship summary.
-- =============================================================================

alter table if exists ships
  add column if not exists class_name                 text,
  add column if not exists description                text,
  add column if not exists career                     text,
  add column if not exists length_m                   numeric,
  add column if not exists width_m                    numeric,
  add column if not exists height_m                   numeric,
  add column if not exists mass_empty_kg              numeric,
  add column if not exists mass_loadout_kg            numeric,
  add column if not exists mass_total_kg              numeric,
  add column if not exists crew                       integer,
  add column if not exists is_spaceship               boolean default true,
  add column if not exists is_gravlev                 boolean default false,
  add column if not exists cargo_scu                  numeric,
  add column if not exists stowage_scu                numeric,
  -- Armor ship-level (health + multiplicadores).
  -- Los multiplicadores ya existen como deflection_physical/energy/distortion;
  -- NO se duplican — sólo agregamos armor_health.
  add column if not exists armor_health               numeric,
  -- Shield controller (ship-level, no del componente Shield).
  add column if not exists shield_face_type           text,
  add column if not exists shield_reconfig_cooldown   numeric,
  add column if not exists shield_max_reallocation    numeric,
  add column if not exists shield_max_elec_charge_dmg numeric,
  -- Meta
  add column if not exists source_version             text,
  add column if not exists imported_at                timestamptz default now(),
  add column if not exists raw_data                   jsonb;

create index if not exists ships_class_name_idx   on ships (class_name);
create index if not exists ships_role_idx         on ships (role);
create index if not exists ships_size_idx         on ships (size);

-- NOTA: ships_manufacturer_idx ya existe implícitamente sobre manufacturer_id
--       si la tabla existente lo tiene. Si no, se crea safe con IF NOT EXISTS.
create index if not exists ships_manufacturer_idx on ships (manufacturer_id);
