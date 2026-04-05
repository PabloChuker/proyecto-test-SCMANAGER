-- =============================================================================
-- Migración: 032_create_weapon_guns
-- Módulo:    Naves y loadouts — Star Citizen
-- Generado por: scripts/import-weapon-guns.js
-- =============================================================================
--
-- DECISIONES DE DISEÑO
--
-- · id / class_name / item_name / name / description / sub_type
--     Campos de identidad estándar. sub_type ∈ {Gun, Rocket, NoseMounted; NULL}.
--     "UNDEFINED" (3 registros) almacenado como NULL.
--
-- · size (1–12) / grade (1–7) / mass / width / height / length
--     Dimensiones físicas con variación real. mass va de 0 a 6.870.000.
--
-- · manufacturer_id
--     UUID del fabricante. 6/188 registros tienen nil UUID → NULL.
--     25 fabricantes distintos. Sin FK forzada.
--
-- · fire_mode / effective_range / rate_of_fire / weapon_capacity
--     Mecánica de disparo del arma. stdItem.Weapon presente en 183/188 registros.
--     fire_mode ∈ {Single, Rapid, Charge, Beam}.
--     effective_range: 225–10000 m. rate_of_fire: 2–1600 RPM.
--
-- · damage_per_shot / alpha_* / dps_*
--     Daño por disparo y DPS por tipo de daño, de stdItem.Weapon.Modes[0].
--     El array Modes siempre tiene exactamente 1 elemento.
--     TODOS los tipos (Physical, Energy, Distortion, Thermal, Biochemical, Stun)
--     tienen valores no-nulos en algún registro — ninguno es uniformemente cero.
--     alpha_*: daño por disparo (0–18500). dps_*: daño por segundo.
--
-- · pellets_per_shot (1 | 8) / heat_per_shot (0–50000)
--     pellets_per_shot=8 identifica escopetas (ScatterGun).
--
-- · spread_min / spread_max
--     Dispersión del arma de stdItem.Weapon.Modes[0].Spread. Varía 0–4.
--
-- · ammo_speed / ammo_range / ammo_capacity
--     Estadísticas balísticas del proyectil. stdItem.Ammunition presente en 180/188.
--     ammo_speed: 700–3000 m/s. ammo_range: distancia máxima del proyectil (1050–3998 m).
--     NOTA: ammo_range ≠ effective_range. El primero es el límite duro del proyectil;
--     el segundo es el rango de efectividad del arma (puede ser inferior).
--
-- · explosion_radius_min / explosion_radius_max
--     Solo rockets (9 registros). NULL para armas normales.
--     stdItem.Ammunition.ExplosionRadius presente solo cuando subType=Rocket.
--
-- · durability_health  (50–750000 HP; stdItem.Durability presente en 179/188)
-- · emission_em_max    (0–248; stdItem.Emission presente en 174/188)
--
-- · ports  (jsonb)
--     stdItem.Ports presente en 172/188. Array de slots de attachment con
--     PortName, Size, MinSize, MaxSize, Flags y EquippedItem.
--     Índice GIN para consultas sobre compatibilidad de attachments.
--
-- · Campos descartados:
--     subType / classification / Weapon.WeaponType / WeaponClass → constantes
--     Modes[0].RoundsPerMinute   → idéntico a Weapon.RateOfFire
--     Modes[0].AdsSpread         → idéntico a Spread en todos los registros
--     Modes[0].AmmoPerShot / WearPerShot → sin valor de consulta
--     Weapon.Damage.*            → derivable de alpha_* × rate_of_fire
--     Ammunition.ImpactDamage    → solapado con alpha_physical / alpha_energy
--     Ammunition.DetonationDamage→ solapado con alpha_* para rockets
--     Ammunition.Penetration.*   → mecánica interna del motor
--     Ammunition.Mass / Pierceability / FlightPhysics → constantes o basura
--     Durability.Resistance / Salvageable / Repairable → constantes
--     Emission.Em.Minimum / Decay / Ir → mínimo siempre 0; decay mínimo
--     InventoryOccupancy / DimensionOverrides → display/UI interno
--     tags / required_tags / entity_tags → etiquetado interno del juego
--
-- · Timestamps    No se añaden. Tabla de referencia estática del juego.
-- =============================================================================

create table if not exists weapon_guns (
  -- Identidad
  id                    uuid     primary key,
  class_name            text     not null,
  item_name             text,
  name                  text     not null,
  description           text,
  sub_type              text,
  size                  integer,
  grade                 integer,
  mass                  numeric,
  width                 numeric,
  height                numeric,
  length                numeric,
  manufacturer_id       uuid,
  -- Mecánica del arma
  fire_mode             text,
  effective_range       numeric,
  rate_of_fire          numeric,
  weapon_capacity       integer,
  -- Daño por disparo y DPS por tipo
  damage_per_shot       numeric,
  alpha_physical        numeric,
  alpha_energy          numeric,
  alpha_distortion      numeric,
  alpha_thermal         numeric,
  alpha_biochemical     numeric,
  alpha_stun            numeric,
  dps_physical          numeric,
  dps_energy            numeric,
  dps_distortion        numeric,
  dps_thermal           numeric,
  dps_biochemical       numeric,
  dps_stun              numeric,
  -- Parámetros del modo de disparo
  pellets_per_shot      integer,
  heat_per_shot         numeric,
  spread_min            numeric,
  spread_max            numeric,
  -- Munición
  ammo_speed            integer,
  ammo_range            integer,
  ammo_capacity         integer,
  explosion_radius_min  numeric,
  explosion_radius_max  numeric,
  -- Durabilidad y emisión
  durability_health     numeric,
  emission_em_max       numeric,
  -- Puertos de attachment
  ports                 jsonb
);

-- Búsquedas por class_name (cruce con loadouts y naves).
create index if not exists idx_weapon_guns_class_name
  on weapon_guns (class_name);

-- Filtrado por subtipo (Gun vs Rocket vs NoseMounted).
create index if not exists idx_weapon_guns_sub_type
  on weapon_guns (sub_type)
  where sub_type is not null;

-- Filtrado por tamaño (criterio principal de compatibilidad con mounts).
create index if not exists idx_weapon_guns_size
  on weapon_guns (size);

-- Filtrado por modo de disparo (Single / Rapid / Charge / Beam).
create index if not exists idx_weapon_guns_fire_mode
  on weapon_guns (fire_mode)
  where fire_mode is not null;

-- Ordenar / filtrar armas por daño total por disparo.
create index if not exists idx_weapon_guns_damage_per_shot
  on weapon_guns (damage_per_shot)
  where damage_per_shot is not null;

-- Búsquedas por fabricante (parcial: solo filas con fabricante asignado).
create index if not exists idx_weapon_guns_manufacturer_id
  on weapon_guns (manufacturer_id)
  where manufacturer_id is not null;

-- Consultas sobre slots de attachment disponibles (tamaño, tipo, arma equipada).
create index if not exists idx_weapon_guns_ports_gin
  on weapon_guns using gin (ports)
  where ports is not null;
