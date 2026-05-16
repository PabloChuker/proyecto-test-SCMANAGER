# Schema de Supabase — Mapa para el frontend

> Generado a partir del schema_audit y los SQLs que produce `import_db.py`.
> Tabla por tabla, columna por columna, con notas y queries de ejemplo.

---

## 0) Conceptos transversales

### 0.1 Versionado: PK compuesta `(id, game_version)`

**Todas las tablas de datos del juego usan PK compuesta `(uuid|id, game_version)`.**
Esto permite que coexistan múltiples versiones del juego en la misma BD
(`4.7.2-LIVE.x`, `4.8.0-PTU.y`, etc.) sin pisarse.

- Para el frontend, **siempre** filtrar por `game_version`:
  ```sql
  SELECT * FROM ships WHERE game_version = '4.8.0-live.11825000';
  ```
- Si querés "la versión activa" actual, consultá primero `game_versions`:
  ```sql
  SELECT version FROM game_versions
  WHERE online = true
  ORDER BY created_at DESC LIMIT 1;
  ```

### 0.2 Excepciones (PK simple, sin versión)

| Tabla                  | PK         | Notas                                      |
|------------------------|------------|--------------------------------------------|
| `manufacturers`        | `(id)`     | Fabricantes globales (no se versionan).    |
| `paints`               | `(uuid)`   | Skins / paintwork — no versionan en BD.    |
| `flair_*_items`        | `(uuid)` o `(id)` | Decoración (no versionan).        |
| `transponders`         | `(id)`     | Tabla vacía hoy.                           |
| `self_destruct_systems`| `(id)`     | Sistemas de autodestrucción.               |
| `containers`           | `(id)`     | Containers físicos.                        |

### 0.3 Foreign Keys clave

```
ships.manufacturer_id              -> manufacturers.id
ship_flight_stats.ship_id          -> ships.id  (1:1)
ship_resistances.ship_id           -> ships.id  (1:1)
ship_fuel.ship_id                  -> ships.id  (1:1)
ship_insurance.ship_id             -> ships.id  (1:1)
ship_power_reference.ship_id       -> ships.id  (1:1)
ship_hardpoints.ship_id            -> ships.id  (1:N, ~100 por nave)
ship_pools.ship_id                 -> ships.id  (1:N, 7 tipos por nave)
cargo_grids.ship_id                -> ships.id  (1:N)
turrets.ship_id                    -> ships.id  (turrets fijos)

<cualquier_tabla>.manufacturer_id  -> manufacturers.id
<cualquier_tabla>.game_version     -> game_versions.version
```

### 0.4 ON CONFLICT DO NOTHING

Los importers usan `ON CONFLICT (id, game_version) DO NOTHING`, así que
**re-aplicar la misma versión NO actualiza datos existentes**. Si Garnok te
pasa una corrección, hay que aplicarla con un tag de versión nuevo
(por ejemplo `4.8.0-live.11825000-fix1`).

---

## 1) Tablas raíz / referencia

### `game_versions`
| Columna   | Tipo      | Notas                                    |
|-----------|-----------|------------------------------------------|
| `version` | text PK   | Ej. `"4.8.0-live.11825000"`              |
| `online`  | boolean   | Si está visible al público en la web     |
| `source`  | text      | `"labs-datadumper"` para nuestros dumps  |
| `notes`   | text      | Texto libre                              |
| `created_at` | timestamptz | Auto                                  |

### `manufacturers` (1000 filas)
| Columna       | Tipo    | Notas                                          |
|---------------|---------|------------------------------------------------|
| `id`          | uuid PK | UUID del fabricante                            |
| `name`        | text    | "Aegis Dynamics", "Anvil Aerospace"            |
| `code`        | text    | "AEGS", "ANVL" (prefijo en class_name)         |
| `description` | text    | Lore breve                                     |

> Hay 1000 filas porque incluye TODOS los manufacturers de DataForge,
> también los de armor/weapons FPS. Para el filtro de **naves**, derivá
> el code desde `ships.class_name.split('_')[0]`.

---

## 2) Naves (ship_*)

### `ships` (~615 filas, 271 IsSpaceship + vehiculos ground)
| Columna                       | Tipo      | Notas                                                       |
|-------------------------------|-----------|-------------------------------------------------------------|
| `id`                          | uuid      | PK con game_version                                         |
| `class_name`                  | text      | "AEGS_Avenger_Stalker" — clave para juntar con 3D y items   |
| `name`                        | text      | "Aegis Avenger Stalker" — display                           |
| `role`                        | text      | "Light Fighter", "Cargo", "Anti-Air"                        |
| `career`                      | text      | "Combat", "Cargo", "Exploration"                            |
| `size`                        | integer   | 1=snub, 2=small, 3=med, 4=large, 5=capital                  |
| `cargo_capacity`              | integer   | SCU                                                         |
| `stowage_scu`                 | numeric   | Almacenaje personal (uSCU)                                  |
| `manufacturer_id`             | uuid FK   |                                                             |
| `description`                 | text      | Marketing copy completo                                     |
| `length_m`, `width_m`, `height_m` | numeric | Dimensiones                                              |
| `mass_empty_kg`, `mass_loadout_kg`, `mass_total_kg` | numeric |                                       |
| `crew`                        | integer   | Tripulación mínima                                          |
| `is_spaceship`, `is_gravlev`, `is_vehicle` | boolean | Categoria                                          |
| `deflection_physical/_energy/_distortion` | numeric | Deflexion base (no escudo)                         |
| `shield_face_type`            | text      | "Bubble"/"Faceted"                                          |
| `shield_reconfig_cooldown`    | numeric   |                                                             |
| `shield_max_reallocation`     | numeric   |                                                             |
| `shield_max_elec_charge_dmg`  | numeric   |                                                             |
| `game_version`                | text PK   |                                                             |

### `ship_flight_stats` (1:1 con ships)
Velocidad y movilidad — lo que se muestra como "Performance".
| Columna                                  | Tipo    | Origen / Notas                                                              |
|------------------------------------------|---------|-----------------------------------------------------------------------------|
| `scm_speed`                              | numeric | Velocidad SCM (m/s). Origen: IFCS item `Controller_Flight`                  |
| `max_speed`                              | numeric | Top speed                                                                   |
| `boost_speed_forward` / `_backward`      | numeric | Boost                                                                       |
| `pitch`, `yaw`, `roll`                   | numeric | Rates SCM (deg/s)                                                           |
| `pitch_boosted`, `yaw_boosted`, `roll_boosted` | numeric | Rates con boost                                                       |
| `accel_forward/backward/up/down/strafe`  | numeric | m/s²                                                                        |
| `accel_*_g`                              | numeric | Misma aceleración en G (visualizar como "0.8 G")                            |
| `boost_mult_forward/backward/up/strafe`  | numeric | Multiplicador de boost                                                      |
| `boost_capacitor_max`, `boost_regen_per_sec`, `boost_regen_time` | numeric | Capacitor de afterburner                            |
| `zero_to_scm`, `zero_to_max`, `scm_to_zero` | numeric | Tiempos 0→Scm, 0→Max, frenada (s)                                        |
| `mass_empty`, `mass_loadout`, `mass_total` | numeric | Duplicado de ships.* (conveniencia)                                       |

### `ship_resistances` (1:1)
Resistencias / firmas.
| Columna | Tipo | Notas |
|---------|------|-------|
| `armor_hp` | numeric | HP del armor item equipado por default |
| `dmg_mult_physical/energy/distortion/thermal/biochemical/stun` | numeric | Multiplicador de daño recibido |
| `sig_mult_cross_section/infrared/electromagnetic` | numeric | Multiplicadores de firma |
| `pen_resist_base/physical/energy/distortion` | numeric | Resistencia de penetración |
| `base_em_signature`, `base_ir_signature`, `base_cs_signature` | numeric | Firmas base |
| `cross_section_x/y/z` | numeric | Tamaño efectivo de firma (m²) |
| `em_total_shields/quantum`, `ir_total_shields/quantum` | numeric | Firma con shields/QT activos |

### `ship_fuel` (1:1)
**CAMPO CLAVE** para mostrar autonomía. Hasta 4.7.2 estaba vacía — corregido en
el último dumper leyendo los items `FuelTank`/`QuantumFuelTank`/`FuelIntake` del loadout.
| Columna                       | Tipo    | Notas                                                  |
|-------------------------------|---------|--------------------------------------------------------|
| `hydrogen_capacity`           | numeric | SCU de tanque principal (suma de todos los FuelTank)   |
| `fuel_intake_rate`            | numeric | Tasa de skimming de hidrógeno (suma de FuelIntake)     |
| `fuel_usage_main/retro/maneuvering` | numeric | Consumo (no siempre presente)                    |
| `maneuvering_time_till_empty` | numeric | Segundos hasta vaciar tanque maniobrando               |
| `intake_to_main_ratio`        | numeric |                                                         |
| `quantum_capacity`            | numeric | SCU de tanque cuántico (suma QuantumFuelTank)          |
| `quantum_spool_time`          | numeric | Tiempo de spool del Quantum Drive equipado             |
| `quantum_travel_time_po`      | numeric | Tiempo Port Olisar → ArcCorp (referencia)              |
| `quantum_fuel_usage_po`       | numeric | Fuel consumido en ese viaje                            |
| `power_used_quantum`          | numeric | Power que consume el QT                                |

### `ship_insurance` (1:1)
| Columna | Tipo | Notas |
|---------|------|-------|
| `expedited_cost` | numeric | aUEC del reclamo expedited |
| `expedited_claim_time` | numeric | Segundos |
| `standard_claim_time` | numeric | Segundos |

### `ship_hardpoints` (1:N, ~37k filas total — ~120 por nave)
Cada slot de hardpoint con su item default.
| Columna                       | Tipo      | Notas                                                                 |
|-------------------------------|-----------|-----------------------------------------------------------------------|
| `id`                          | uuid PK   | Compuesta con game_version                                            |
| `ship_id`                     | uuid FK   |                                                                       |
| `ship_reference`              | text      | `class_name` de la nave (denormalizado para joins rápidos)            |
| `hardpoint_name`              | text      | "hardpoint_weapon_left", "hardpoint_thruster_main_left_1", etc.       |
| `hardpoint_type`              | text      | "WeaponGun", "Cooler", "PowerPlant", "Thruster", "FuelTank", ...      |
| `max_size`, `min_size`        | integer   | Size constraints del slot                                             |
| `editable`                    | boolean   | Si el jugador puede cambiar el item                                   |
| `item_types`                  | text      | Tipos válidos para este slot (CSV o JSON)                             |
| `default_item_class`          | text      | class_name del item equipado por default                              |
| `default_item_uuid`           | uuid      | UUID del item                                                         |
| `default_item_name`           | text      | Display                                                               |
| `default_item_type`           | text      | "WeaponGun", "MissileLauncher", etc                                   |
| `default_item_manufacturer`   | text      | Code (ej. "BEHR")                                                     |
| `default_item_grade`          | integer   | 1-5                                                                   |
| `loadout_json`                | jsonb     | Sub-loadout (turrets con guns adentro, etc)                           |
| `parent_hp_id`                | uuid      | Si es un hardpoint anidado (gun dentro de turret), apunta al parent   |
| `stock_item_id`               | uuid      | Item de fábrica (alias del default)                                   |
| `stock_loadout`               | jsonb     | Loadout raw                                                           |
| `position_index`              | integer   | Orden                                                                 |
| `notes`                       | text      | Notas                                                                 |

> **Frontend tip:** para construir un "loadout tree" agrupá por
> `parent_hp_id IS NULL` (raíces) y luego anida.

### `ship_pools` (1:N, ~7 filas por nave)
Pools de recursos del SCM/Nav. Una fila por tipo.
| Columna       | Tipo    | Notas                                                              |
|---------------|---------|--------------------------------------------------------------------|
| `ship_id`     | uuid    | FK                                                                 |
| `item_type`   | text    | "Power", "Heat", "Fuel", "Shield", "Avionics", "WeaponAmmoLoad", "WeaponRegen" |
| `max_size`    | numeric | Capacidad. Después del fix: viene del Power Plant / Cooler / FuelTank reales |
| `min_size`    | numeric | Mínimo (raro, casi siempre NULL)                                   |
| `game_version`| text    |                                                                    |

> PK: `(ship_id, item_type, game_version)`

### `ship_power_reference` (1:1, ~584 filas)
**Tabla precomputada** con el balance energético de la nave (qué consume y
qué genera). Útil para mostrar "Power balance" sin recalcular en el frontend.

| Columna                             | Tipo    | Notas                                                |
|-------------------------------------|---------|------------------------------------------------------|
| `power_generation_segments`         | jsonb   | Array de los PowerPlant equipados                    |
| `power_used_scm` / `power_used_nav` | numeric | Consumo en modo SCM y Nav                            |
| `power_used_grouped_scm/_nav`       | jsonb   | Breakdown por grupo (weapons, shields, propulsion)   |
| `cooling_generation_segments`       | jsonb   | Array de Coolers equipados                           |
| `cooling_used_scm/_nav`             | numeric |                                                       |
| `cooling_used_pct_scm/_nav`         | numeric | % de cooling usado                                    |
| `cooling_used_grouped_scm/_nav`     | jsonb   |                                                       |
| `em_shields`, `em_quantum`          | numeric | Firma EM con/sin escudos                              |
| `ir_shields`, `ir_quantum`          | numeric | Firma IR                                              |
| `em_per_segment`                    | jsonb   | EM emitido por cada segmento del PP                   |
| `em_groups_scm/_nav`                | jsonb   |                                                       |
| `em_segment_groups_scm/_nav`        | jsonb   |                                                       |
| `total_shield_hp`                   | numeric | Suma de los escudos equipados                         |
| `total_shield_regen` / `_raw` / `_min_power` | numeric | Regen del shield (incluido power floor)       |
| `distortion_pool`                   | numeric | Pool de distortion del shield                         |
| `fuel_capacity_hydrogen`            | numeric | (duplicado de ship_fuel.hydrogen_capacity)            |
| `fuel_intake_rate`                  | numeric | (duplicado)                                           |
| `fuel_usage_scm`                    | numeric | Fuel/s en SCM                                         |
| `fuel_capacity_quantum`             | numeric | (duplicado de ship_fuel.quantum_capacity)             |
| `qt_range_km`                       | numeric | Rango QT con el tanque lleno (km)                     |
| `qt_speed_ms`                       | numeric | Velocidad QT (m/s)                                    |
| `qt_spool_time_s`                   | numeric |                                                       |
| `multi_pp_ratio`                    | numeric | Si tiene N power plants, fracción de uso              |
| `computed_at`                       | timestamp |                                                     |
| `source_version`                    | text    |                                                       |

### `cargo_grids` (1:N por nave)
| Columna           | Tipo    | Notas                                                  |
|-------------------|---------|--------------------------------------------------------|
| `id`              | uuid    | PK                                                     |
| `class_name`      | text    | class_name del cargo grid en el .p4k                   |
| `name`            | text    |                                                        |
| `scu_capacity`    | numeric | SCU físicos del grid                                   |
| `dimensions`      | text    | "8x4x2" o JSON                                         |
| `mass`            | numeric |                                                        |
| `volume_scu`      | numeric | (= scu_capacity típicamente)                           |
| `instance_count`  | integer | Cuántos hay en esa nave                                |
| `display_order`   | integer |                                                        |
| `ship_id`         | uuid FK |                                                        |

---

## 3) Items de naves (ship items)

Todos comparten un esquema base: `id|uuid`, `class_name`, `name`, `description`,
`manufacturer_id`, `size`, `grade`, `mass`, `width`, `height`, `length`, `scu`,
`raw_data`, `game_version`. Abajo solo las columnas **específicas** de cada uno.

### `weapon_guns` (~360)
Cañones (pilot-controlled y turrets).
- `sub_type`: "Energy", "Ballistic"
- `fire_mode`: "Single", "Auto", "Burst"
- `effective_range`, `rate_of_fire` (rpm)
- `weapon_capacity` (ammo box pilot energy)
- `damage_per_shot` (total) + breakdown:
  - `alpha_physical`, `alpha_energy`, `alpha_distortion`, `alpha_thermal`, `alpha_biochemical`, `alpha_stun`
  - `dps_*` (mismas categorías)
- `pellets_per_shot`, `heat_per_shot`, `spread_min/max`
- `ammo_speed`, `ammo_range`, `ammo_capacity`
- `explosion_radius_min/max`, `durability_health`
- `emission_em_max`, `ir_max`, `penetration_distance`, `max_penetration_thickness`
- `power_consumption_min/max`, `coolant_consumption_min/max`
- `is_energy_weapon` (boolean)
- `ammo_regen_per_sec`, `regen_cost_per_bullet`, `max_ammo_load`, `regen_cooldown`
- `overheat_temperature`, `cooling_per_second`, `overheat_fix_time`
- `ports` jsonb

### `missiles` (~130) — PK `(uuid, game_version)`
- `tracking_signal_type`: "EM"/"IR"/"CrossSection"/"Hybrid"
- `lock_range_min`, `lock_range_max`, `lock_time`
- `damage_total`, `linear_speed`
- `is_cluster` (bool)

### `bombs` (~6)
- `sub_type`, `damage_*` (5 tipos), `explosion_radius_min/max`
- `arm_time`, `max_lifetime`, `is_cluster`, `requires_launcher`
- `durability_health`

### `emps` (~14)
- `radius`, `charge_time`, `cooldown_time`, `distortion_damage`

### `weapon_defensives` (~318)
Flares / chaff / decoys.
- `defensive_type`: "Flare"/"Chaff"/"Decoy"/"Noise"
- `capacity`, `initial_capacity`
- `sig_ir_start/_end`, `sig_em_start/_end`, `sig_cs_start/_end`
- `effective_range`, `rate_of_fire`, `spread_min/max`

### `weapon_mining` (~44)
- `class`, `grade_number`/`grade` (texto)
- `mining_laser_power`, `optimal_range`, `maximum_range`
- `extraction_throughput`
- `mining_modifier`, `resistance_modifier`, `instability_modifier`
- `optimal_charge_window`, `optimal_charge_rate`, `shatter_damage`
- `resistance`, `instability`, `throttle_rate`, `throttle_min`, `heat_output`, `module_slots`

### `weapon_salvage` (~38)
- `sub_type`, `modifier_kind`
- `salvage_speed_multiplier`, `radius_multiplier`, `extraction_efficiency`

### `missile_launchers` (~260)
- `missile_count`, `missiles_label` (display)
- `durability_health`, `ports` (jsonb — ports anidados con cada misil)

### `turrets` (~665) — incluye `ship_id` cuando es turret fijo
- `sub_type`: "RemoteTurret"/"ManualTurret"/etc
- `durability_health`, `durability_lifetime`
- `ports` (jsonb — guns que aloja)
- `movements` (jsonb — pitch/yaw limits, speed)

### `jump_drives` (~24)
- `alignment_rate`, `alignment_decay_rate`
- `tuning_rate`, `tuning_decay_rate`
- `fuel_usage_efficiency_multiplier`
- `distortion_max/_decay_rate/_decay_delay/_warning_ratio/_recovery_ratio/_shutdown_time`
- `health`

### `quantum_drives` (~119)
- `drive_speed`, `cooldown_time`, `spool_up_time`, `fuel_rate`
- `power_consumption_min/max`, `coolant_consumption_min/max`
- `pips`, `power_ranges` (jsonb)
- `em_max`, `ir_max`, `health`
- `distortion_*`

### `flight_controllers` (~419)
- `power_min/_max`, `coolant_min/_max` (consumo)
- `power_consumption_min/max`, `coolant_consumption_min/max`
- `pips`, `power_ranges`
- `em_max`, `ir_max`, `health`
- `distortion_*`
- `price`

### `life_support_generators` (~20)
- `power_min/_max`, `coolant_min/_max`

### `quantum_interdiction_generators` (~6)
- `jamming_range`, `interdiction_range`
- `pulse_charge_time`, `pulse_radius`, `pulse_discharge_time`, `pulse_cooldown_time`
- `jammer_max_power_draw`, `base_power_draw_fraction`
- `pulse_power_fraction`, `jammer_power_fraction`
- `power_consumption_min/max`, `em_*`, `ir_max`

### `coolers` (~153)
- `class`, `grade_number`/`grade`
- `cooling_generation` ← **clave** (W de cooling)
- `power_consumption_min/max`
- `em_max`, `ir_max`, `health`
- `distortion_*`, `price`

### `power_plants` (~164)
- `class`, `grade_number`/`grade`
- `power_generation` ← **clave** (W generados)
- `power_consumption_min/max` (self-consumption en modo silent)
- `coolant_consumption_min/max`
- `pips`, `power_ranges` (jsonb — niveles power slider)
- `em_max`, `ir_max`, `health`
- `distortion_*`, `price`

### `shields` (~138)
- `class`, `grade_number`/`grade`
- `pool_hp`, `max_shield_regen`, `regen_time`
- `damaged_regen_delay`, `downed_regen_delay`
- `power_consumption_min/max`, `coolant_consumption_min/max`
- `pips`, `power_ranges`
- `ir_max`, `em_max`
- `distortion_shutdown_damage/_decay_delay/_decay_rate/_warning_ratio/_shutdown_time`
- `physical_resistance_min/_max`, `energy_resistance_min/_max`, `distortion_resistance_min/_max`
- `physical_absorption_min/_max`, `energy_absorption_min/_max`, `distortion_absorption_min/_max`
- `price`

### `containers` (~22)
- `capacity_scu`, `mass`, `volume_scu`

### `radars` (~137)
- `sub_type`
- `sensitivity`, `ground_vehicle_sensitivity_addition`
- `range_max_m`, `range_min_m`, `piercing`
- `sensitivity_profile` (jsonb)
- `em_max`, `em_min`, `ir_max`, `health`
- `distortion_*`

### `transponders` (vacía hoy — 0 filas)
Schema definido por si llegan datos.

### `self_destruct_systems` (~7)
- `sd_damage`, `sd_min_radius`, `sd_radius`
- `sd_min_phys_radius`, `sd_phys_radius`, `sd_time`

### `paints` (~897, sin game_version)
- `class_name`, `item_name`
- `tags` (text[]), `required_tags` (text[])
- `raw_data` jsonb

---

## 4) FPS / Personal

### `armor_items` (~2293)
- `class_name`, `name`, `type`, `subtype`
- `size`, `grade`
- `damage_reduction` (%)
- `temp_min_celsius`, `temp_max_celsius`
- `radiation_capacity_rem`, `radiation_scrub_rem_s`
- `carrying_capacity_uscu`
- `mass`, `width`, `height`, `length`
- `manufacturer_code`, `manufacturer_name`, `manufacturer_uuid` (denormalizado)
- `rarity`, `description`, `description_lore`
- `raw_data` jsonb

### `fps_weapon_items` (~397)
Armas FPS (rifles, pistolas, etc.).
- `class_name`, `name`, `type`, `subtype`
- `size`, `grade`, `item_type`, `damage_class`
- `attachments_summary` (jsonb)
- `effective_range_m`, `ammo_speed`, `rate_of_fire_rpm`, `magazine_size`
- `weapon_class_struct`, `effective_range_struct`, `rate_of_fire_struct` (jsonb)
- `capacity`, `fire_mode_default`
- `damage_alpha_total` + `damage_alpha_physical/energy/thermal/distortion/biochemical/stun`
- `dps_total` + `dps_*` (mismas categorías)
- `spread_min/max`, `spread_first_attack`, `spread_attack`, `spread_decay`
- `mass`, `width`, `height`, `length`
- `manufacturer_code/_name/_uuid`, `rarity`, `description`, `description_lore`
- `raw_data` jsonb

---

## 5) Crafting / Resources

### `blueprints` (~1044)
- `uuid` PK, `key` (clave humana), `kind`
- `category_uuid`
- `output_uuid`, `output_class`, `output_type`, `output_subtype`, `output_grade`, `output_name`
- `tier_index`, `craft_time_seconds`, `default` (boolean)

### `blueprint_materials` (~3944)
Por blueprint, qué se necesita.
- `blueprint_uuid`, `group_key`, `group_name`
- `required_count` (cuántos items del grupo se piden)
- `resource_uuid`, `resource_name`, `quantity_scu`, `min_quality`
- `modifier_property_uuid`, `modifier_property_key`
- `modifier_quality_min/_max`
- `modifier_at_min_quality`, `modifier_at_max_quality`

### `blueprint_rewardpool` (~394)
Por blueprint, posibles pools de recompensa adicionales.
- `blueprint_uuid`, `pool_uuid`, `pool_key`

### `resources` (~194)
Materiales crafting.
- `uuid`, `key`, `name`, `description`
- `refined_uuid` (apunta al refinado, si éste es un raw)
- `refined_name`
- `validate_default_cargo_box`, `has_default_cargo_containers` (bool)

### `resources_box_sizes` (~1314)
Tamaños de caja para cada recurso.
- `uuid` PK, `box_size`, `resource_uuid`

---

## 6) Flair (decoración)

### `flair_cockpit_items` (~11)
- `class_name`, `name`, `mass`, `volume_scu`

### `flair_floor_items` (~18) — `flair_surface_items` (~61) — `flair_wall_items` (~26)
Esquema similar: `uuid`, `name`, `manufacturer_id`, `size`, `grade`,
`sub_type` (donde corresponde), `classification`, `tags` (cuando aplica),
`raw_data` jsonb.

---

## 7) Tablas que NO maneja el datadumper (otras fuentes)

Estas existen en la BD pero las llenan otros sistemas (no `import_db.py`):
- `activity_sessions`, `activity_types`, `admin_users`
- `ccu_prices`, `ship_price`, `ship_prices_canonical`, `ship_loaners`
- `commodity_prices`, `trade_*`
- `mining_*` (mining ledger del clan)
- `community_events`, `event_*`
- `profiles`, `friendships`, `parties`, `party_members`, `org_*`, `organizations`
- `user_inventory`, `user_loadouts`, `user_wishlist`, `referral_codes`
- `chain_comments`, `chain_votes`, `shared_chains`, `loadout_items`, `loot_items`
- `notifications`, `system_settings`

**Para el frontend que muestra naves/items**: ignorá todo lo de arriba.

---

## 8) Recetas de queries que el frontend va a usar mucho

### 8.1 Ficha completa de una nave (1 query principal + 4 paralelas)
```sql
-- Header
SELECT s.*, m.name AS manufacturer_name, m.code AS manufacturer_code
FROM ships s
LEFT JOIN manufacturers m ON s.manufacturer_id = m.id
WHERE s.class_name = $1 AND s.game_version = $2;

-- Stats
SELECT * FROM ship_flight_stats WHERE ship_id = $ship_id AND game_version = $2;
SELECT * FROM ship_resistances  WHERE ship_id = $ship_id AND game_version = $2;
SELECT * FROM ship_fuel         WHERE ship_id = $ship_id AND game_version = $2;
SELECT * FROM ship_insurance    WHERE ship_id = $ship_id AND game_version = $2;
SELECT * FROM ship_power_reference WHERE ship_id = $ship_id AND game_version = $2;

-- Hardpoints (loadout default)
SELECT * FROM ship_hardpoints
WHERE ship_id = $ship_id AND game_version = $2
ORDER BY parent_hp_id NULLS FIRST, position_index;

-- Pools (7 rows: Power/Heat/Fuel/Shield/Avionics/WeaponAmmoLoad/WeaponRegen)
SELECT item_type, max_size, min_size
FROM ship_pools WHERE ship_id = $ship_id AND game_version = $2;

-- Cargo
SELECT * FROM cargo_grids
WHERE ship_id = $ship_id AND game_version = $2
ORDER BY display_order;
```

### 8.2 Lista de naves filtrada
```sql
SELECT id, class_name, name, role, career, size,
       cargo_capacity, crew, is_spaceship,
       (SELECT name FROM manufacturers WHERE id = ships.manufacturer_id) AS manufacturer_name
FROM ships
WHERE game_version = $1
  AND ($2::int IS NULL OR size = $2)
  AND ($3::text IS NULL OR role ILIKE '%' || $3 || '%')
ORDER BY name;
```

### 8.3 Filtrar items de un tipo (ej: power plants compatibles con size 2)
```sql
SELECT id, class_name, name, grade, power_generation,
       em_max, ir_max, mass, scu
FROM power_plants
WHERE game_version = $1 AND size = 2
ORDER BY power_generation DESC;
```

### 8.4 Resolver el item equipado en un hardpoint
El hardpoint trae `default_item_uuid` + `default_item_type`. Para sacar los stats,
hacés JOIN con la tabla correspondiente según `default_item_type`:

| `hardpoint_type` / `default_item_type`     | Tabla a joinear           |
|--------------------------------------------|---------------------------|
| `WeaponGun`                                | `weapon_guns`             |
| `MissileLauncher`                          | `missile_launchers`       |
| `Missile`                                  | `missiles`                |
| `Turret`                                   | `turrets`                 |
| `Shield` / `ShieldController`              | `shields`                 |
| `PowerPlant`                               | `power_plants`            |
| `Cooler`                                   | `coolers`                 |
| `Radar`                                    | `radars`                  |
| `QuantumDrive`                             | `quantum_drives`          |
| `JumpDrive`                                | `jump_drives`             |
| `Controller_Flight` / `FlightController`   | `flight_controllers`      |
| `LifeSupportGenerator`                     | `life_support_generators` |
| `WeaponDefensive` / `CountermeasureLauncher` | `weapon_defensives`     |
| `MiningModifier`/`MiningWeapon`            | `weapon_mining`           |
| `SalvageHead`/`SalvageModifier`            | `weapon_salvage`          |
| `QIG` / `QuantumInterdictionGenerator`     | `quantum_interdiction_generators` |
| `Container`                                | `containers`              |
| `SelfDestruct`                             | `self_destruct_systems`   |
| `Transponder`                              | `transponders`            |

### 8.5 Naves con cargo grid (cargo > 0)
```sql
SELECT DISTINCT s.class_name, s.name, SUM(cg.scu_capacity) AS total_scu
FROM ships s
JOIN cargo_grids cg ON cg.ship_id = s.id AND cg.game_version = s.game_version
WHERE s.game_version = $1
GROUP BY s.class_name, s.name
HAVING SUM(cg.scu_capacity) > 0
ORDER BY total_scu DESC;
```

---

## 9) Modelos 3D (R2 — NO en Supabase)

Los `.glb` no están en la BD. Viven en **Cloudflare R2** con este layout:

```
<bucket>/models/<version>/<class_name>.glb
<bucket>/models/<version>/manifest.json
```

### `manifest.json` por versión
Ejemplo de contenido:
```json
{
  "version": "4.8.0-live.11825000",
  "updated_at": "2026-05-15T16:32:11Z",
  "count": 271,
  "meta": { "channel": "PTU", "source": "labs-datadumper" },
  "ships": {
    "AEGS_Avenger_Stalker": {
      "key": "models/4.8.0-live.11825000/AEGS_Avenger_Stalker.glb",
      "url": "https://pub-xxx.r2.dev/models/4.8.0-live.11825000/AEGS_Avenger_Stalker.glb",
      "size_bytes": 13056012,
      "uploaded_at": "2026-05-15T16:32:11Z"
    },
    "ANVL_Carrack": { ... }
  }
}
```

### Cómo el frontend resuelve la URL del GLB

**Opción A — Construir directo (más rápido, sin red extra):**
```ts
const glbUrl = `${R2_PUBLIC_BASE_URL}/models/${gameVersion}/${classNameOfShip}.glb`;
```
Si el .glb no existe en esa versión, `<model-viewer>` devolverá 404 — entonces
mostrá un placeholder.

**Opción B — Leer el manifest para saber qué naves tienen modelo:**
```ts
const manifest = await fetch(
  `${R2_PUBLIC_BASE_URL}/models/${gameVersion}/manifest.json`
).then(r => r.json());

const availableClassNames = Object.keys(manifest.ships);
const modelUrl = manifest.ships[className]?.url;
```
Esta opción te permite **listar las naves que tienen modelo 3D** sin hacer
un HEAD por cada una. El manifest tiene `Cache-Control: public, max-age=60`,
así que poniendo un SWR/React Query por encima la performance está bien.

### Estado actual del bucket
- `R2_BUCKET` configurado en `.env` (no public por default — habilitar
  Public Access en R2 dashboard para `R2_PUBLIC_BASE_URL`)
- La GUI del datadumper (pestaña "Modelos 3D (R2)") permite:
  - Seleccionar naves con checkbox
  - Configurar LOD, MIP, materials, attachments, interior, lights
  - Extraer GLB local → carpeta `output/<canal>/models/<version>/`
  - Subir a R2 (incremental — head_object salta lo ya subido)
  - Abrir carpeta para explorar manualmente

---

## 10) Estado de cobertura (al 14-05-2026)

Conteos aproximados con la versión `4.8.0-live.11825000`:

| Dato                          | Cobertura     | Notas                                  |
|-------------------------------|---------------|----------------------------------------|
| `ships`                       | 615 / 615     | OK                                     |
| `ship_flight_stats.scm_speed` | 271 / 314 IsSpaceship | Resto sin item Controller_Flight |
| `ship_flight_stats.accel_*`   | 278 / 314     |                                        |
| `ship_fuel.hydrogen_capacity` | 266 / 314     | Naves con FuelTank en loadout          |
| `ship_fuel.quantum_capacity`  | 201 / 314     | Naves con QuantumFuelTank              |
| `ship_pools.MainPower`        | ~270 / 314    |                                        |
| `ship_pools.MainHeat`         | 272 / 314     |                                        |
| `ship_hardpoints`             | 37,148 filas  | ~120 por nave promedio                 |
| `cargo_grids`                 | 245 filas     | Solo naves con grid (~50 ships)        |
| `ship_insurance`              | 586 / 615     |                                        |

> Si Garnok detecta huecos, casi siempre es por **naves variant** que heredan
> del Vehicle XML base — el dumper ya las matchea con fallback.

---

## 11) Cuando algo no aparece — checklist

1. ¿Estás filtrando por la `game_version` correcta?
   ```sql
   SELECT version, online FROM game_versions ORDER BY created_at DESC;
   ```
2. ¿La tabla `ships` tiene esa nave?
   ```sql
   SELECT id, class_name, name FROM ships
   WHERE class_name ILIKE '%avenger%' AND game_version = '4.8.0-live.11825000';
   ```
3. Si una columna está NULL para muchas naves, probablemente sea un dato que
   CIG **mudó al item equipado en el loadout** y todavía no se está leyendo.
   Anota cuáles y mandalo al pipeline.
4. Si una tabla tiene 0 filas pero esperabas datos:
   - Verificá que la versión esté importada: `SELECT COUNT(*) FROM <tabla> WHERE game_version = '...'`
   - Verificá que el SQL haya corrido sin errores (log del importer).
