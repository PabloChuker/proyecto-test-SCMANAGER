# SC Labs — Auditoría de Capa de Datos

**Fecha:** 2026-04-26
**Autor:** Auditoría asistida por IA (sesión Pablo)
**Objetivo:** documentar el origen real de cada tabla en Supabase y dejar la base para construir un **extractor automatizado versión-aware** que actualice el catálogo del juego en cada patch de Star Citizen sin tocar las tablas internas de la plataforma.

---

## 0. TL;DR — qué hay y qué hay que hacer

- **~70 tablas en Supabase**, de las cuales ~42 son catálogo del juego (extraídas de scunpacked + RSI), ~17 son internas de SC Labs (cuentas, hangares de users, mining/trade sessions), 5 son lookups y 1 es agregador externo (UEX).
- **3 fuentes de verdad externas**: scunpacked (datamining oficial CIG) para naves/componentes, RSI store/wiki para precios USD, UEX API para precios in-game de commodities.
- **El extractor versión-aware es viable** pero hoy está fragmentado en ~30 scripts sueltos, sin orquestador, sin dry-run global, sin gating por `game_version`. Acá proponemos un orquestador único `scripts/ingest_game_version.mjs` con fases ordenadas, dry-run, diff vs prod, y rollback.
- **Riesgos detectados antes de cualquier ingest masivo**:
  - Colisión de numeración de migraciones 033-044 (dos archivos por número, orden alfabético no determinístico).
  - 4 tablas con migración pero sin existencia confirmada en prod (`scanners`, `main_thrusters`, `manneuver_thrusters`, `parties`).
  - Tabla `parties` creada manualmente en Studio sin migración versionada.
  - 6 seeds con sufijo `__BUSCAR__` o `_____` (data faltante).
  - Discrepancia conocida en `weapon_guns` Panther S3 (caso bloqueante para calibración Erkul).
- **NUNCA tocar en un ingest del juego**: tablas internas (sección 2), tablas externas no-juego (sección 3), tablas de auditoría/RLS (sección 6).

---

## 1. Categorías de tablas — clasificación por origen

| Categoría | Cantidad | Refresca con cada game version? | Ejemplo |
|-----------|----------|---------------------------------|---------|
| **A. Catálogo del juego** | ~42 | ✅ Sí, full refresh | `ships`, `weapon_guns`, `quantum_drives` |
| **B. Externos no-juego (agregadores)** | 4-5 | ⚠️ Distinto ciclo (cron diario/horario) | `commodity_prices`, `trade_prices`, `trade_terminals`, `trade_commodities` |
| **C. Internas de usuario** | ~17 | ❌ Nunca tocar | `profiles`, `friendships`, `mining_sessions`, `trade_work_orders` |
| **D. Lookup / enum** | ~5 | ⚠️ Sólo si CIG cambia el modelo | `mining_materials`, `crafting_categories`, `activity_types` |
| **E. Internas de soporte (referrals, notifs, RLS)** | ~3 | ❌ Nunca tocar | `referral_codes`, `notifications`, `profiles_public` (view) |

---

## 2. Inventario detallado — tablas internas (NO TOCAR en game-version refresh)

Estas tablas son state de los usuarios. Cualquier extractor que las modifique destruye datos de la comunidad.

### 2.1 Cuentas y social
| Tabla | Migración | Notas |
|-------|-----------|-------|
| `profiles` | (creada por Supabase Auth + ALTERs propios) | PII columns (discord_id, last_seen, first_name, etc.). Ver lockdown en mig 063. |
| `profiles_public` (VIEW) | `063_lockdown_profiles_pii.sql` | View con sólo columnas safe. Crear si no existe en prod. |
| `friendships` | (faltante en repo, manual) | requester_id / addressee_id / status. |
| `parties` | **MANUAL** (no hay archivo en `database/migrations/`) | Creada en Studio. Columnas extendidas por `054_add_party_lifecycle.sql`. |
| `party_members` | (manual / inferida) | Join table. |
| `organizations` | (faltante en repo) | Created via app. |
| `org_members` | (faltante en repo) | Join table. |
| `notifications` | (faltante en repo) | Notificaciones in-app. |

### 2.2 Mining
| Tabla | Migración | Notas |
|-------|-----------|-------|
| `mining_sessions` | `033_create_mining_sessions.sql` | Sesiones de minería. |
| `mining_members` | `034_create_mining_members.sql` | Miembros por sesión. |
| `mining_work_orders` | `035_create_mining_work_orders.sql` | Work orders (extracciones). |
| `mining_inventory` | `036_create_mining_inventory.sql` | Inventario por sesión. + `038_add_inventory_quality_location.sql` + `042_add_quality_to_inventory.sql`. |
| `mining_member_ledger` | `037_create_mining_member_ledger.sql` | Ledger acumulado por persona. |
| `mining_stop_distributions` | `046_create_mining_stop_distributions.sql` | Distribuciones por stop + `052_add_closed_status_to_distributions.sql`. |
| `mining_pending_payouts` | `047_create_mining_pending_payouts.sql` | Pagos pendientes. |
| `mining_settlement_ledger` | `048_create_mining_settlement_ledger.sql` | Ledger de transferencias. |

### 2.3 Trade
| Tabla | Migración | Notas |
|-------|-----------|-------|
| `trade_work_orders` | `043_create_trade_work_orders.sql` | Trade runs. |
| `trade_wo_participants` | (parte de 043) | + `044_add_avatar_to_trade_wo_participants.sql`. |
| `trade_wo_expenses` | (parte de 043) | Gastos por WO. |

### 2.4 Soporte / engagement
| Tabla | Migración | Notas |
|-------|-----------|-------|
| `referral_codes` | `060_create_referral_codes.sql` + `062_referral_codes_unique_user.sql` | Códigos STAR-XXXX. |
| `activity_sessions` | (inferida del ActivityManager) | Sesiones de raffle/loot. |

---

## 3. Inventario detallado — externos no-juego (ciclo distinto al patch de SC)

Datos que NO vienen del cliente del juego sino de comunidades/agregadores. Tienen su propio ciclo de actualización (cron horario o diario), no atado a la versión del juego.

| Tabla | Fuente | Script | Frecuencia |
|-------|--------|--------|------------|
| `commodity_prices` | UEX API (`api.uexcorp.space/2.0/commodities_prices_all`) | `scripts/importers/import-uex-prices.mjs` | Scheduled task `uex-commodity-price-sync` (cada hora aprox.) |
| `trade_commodities`, `trade_terminals`, `trade_prices` | UEX-style (mismo proveedor, esquema viejo) | Endpoints `/api/trade/*` los consultan; ingesta histórica no documentada en repo | Estables (no cambian con cada patch del juego) |
| `ship_price` (RSI store) | RSI Pledge Store + Star Citizen Wiki | `scripts/populate_prices.mjs` (USD hardcoded de wiki) | Manual cada vez que CIG cambia precios |
| `referral_codes` (entries de devs) | RSI Referral Program | Manual / seed | Una vez |

**Observación crítica:** los códigos scunpacked ≠ UEX para varios minerales (`BORS→BORA`, `OURA→OURAT`, `ASLA→ASLAR`, etc.). El extractor del juego NO debe tocar `commodity_prices` ni `trade_commodities`. Si CIG agrega un mineral nuevo, hay que actualizar el mapa de traducción en `src/data/mining/mineral-commodity-map.ts`.

---

## 4. Inventario detallado — catálogo del juego (lo que el extractor refresca)

Estas son las tablas a las que apunta el extractor versión-aware. Se reemplazan **completamente** en cada game version (delete + insert idempotente con `ON CONFLICT DO UPDATE`).

### 4.1 Tablas de naves
| Tabla | Migración | Fuente | Script de ingesta |
|-------|-----------|--------|-------------------|
| `ships` | (legacy/manual) + `033_alter_ships_power_model.sql` | scunpacked `ships/*.json` | `scripts/ingest_scunpacked.py` + `ingest_v3.py` |
| `ship_flight_stats` | `legacy_001_satellite_tables.sql` | scunpacked flight model | `ingest_scunpacked.py` |
| `ship_resistances` | `legacy_001_satellite_tables.sql` | scunpacked armor + dmg multipliers | `ingest_scunpacked.py` |
| `ship_fuel` | `legacy_001_satellite_tables.sql` | scunpacked fuel/quantum | `ingest_scunpacked.py` |
| `ship_insurance` | `legacy_001_satellite_tables.sql` | scunpacked insurance metadata | `ingest_scunpacked.py` |
| `ship_pools` | `035_create_ship_pools.sql` | scunpacked ResourceNetwork (max_size = pips, NO dimensiones) | `ingest_power_model.mjs` |
| `ship_power_reference` | `034_create_ship_power_reference.sql` | scunpacked power model derived | `ingest_power_model.mjs` |
| `ship_hardpoints` | (faltante en repo, inferida) + `036_alter_ship_hardpoints_power_model.sql` | scunpacked hardpoints + default loadouts | `ingest_phase3_fast.mjs` + `extract_ship_hardpoints.py` |
| `ship_price` | (parte de mig anterior) + `059_add_acquisition_method_to_ship_price.sql` | RSI store / wiki | `populate_prices.mjs` |

### 4.2 Componentes / hardpoints (uno por categoría)
| Tabla | Migración | Fuente |
|-------|-----------|--------|
| `manufacturers` | `001_create_manufacturers.sql` | scunpacked + RSI |
| `armors` | `002_create_armors.sql` | scunpacked items |
| `cargo_grids` | `003_create_cargo_grids.sql` | scunpacked |
| `containers` | `004_create_containers.sql` | scunpacked |
| `coolers` | `005_create_coolers.sql` + `041_extend_coolers_energy.sql` | scunpacked |
| `emps` | `006_create_emps.sql` | scunpacked |
| `flair_cockpit_items` / `flair_floor_items` / `flair_surface_items` / `flair_wall_items` | 007-010 | scunpacked decoration |
| `flight_controllers` | `011_create_flight_controllers.sql` + `038_alter_flight_controllers_power_model.sql` | scunpacked |
| `fuel_intakes` | `012_create_fuel_intakes.sql` | scunpacked |
| `fuel_tanks` | `013_create_fuel_tanks.sql` | scunpacked |
| `life_support_generators` | `014_create_life_support_generators.sql` | scunpacked |
| `main_thrusters` | `015_create_main_thrusters.sql` | scunpacked — **GAP: tabla NO existe en prod** |
| `manneuver_thrusters` | `016_create_manneuver_thrusters.sql` | scunpacked — **GAP: tabla NO existe en prod (typo en nombre: maneuver vs manneuver)** |
| `missiles` | `017_create_missiles.sql` | scunpacked |
| `missile_launchers` | `018_create_missile_launchers.sql` | scunpacked |
| `paints` | `019_create_paints.sql` | scunpacked + RSI store — **VACÍA en prod** |
| `power_plants` | `020_create_power_plants.sql` + `039_extend_power_plants_energy.sql` | scunpacked + ResourceNetwork |
| `quantum_drives` | `021_create_quantum_drives.sql` + `042_extend_quantum_drives_energy.sql` | scunpacked |
| `quantum_fuel_tanks` | `022_create_quantum_fuel_tanks.sql` | scunpacked |
| `quantum_interdiction_generators` | `023_create_quantum_interdiction_generators.sql` + `057_extend_quantum_interdiction_generators.sql` | scunpacked + 3 sintéticos (Mantis/Cutlass Blue/Guardian QI) |
| `radars` | (parte de items genéricos) + `037_alter_radars_power_model.sql` | scunpacked |
| `scanners` | `025_create_scanners.sql` | scunpacked — **GAP: tabla NO existe en prod** |
| `self_destruct_systems` | `026_create_self_destruct_systems.sql` | scunpacked |
| `shields` | `027_create_shields.sql` + `040_extend_shields_energy.sql` | scunpacked |
| `transponders` | `028_create_transponders.sql` | scunpacked — **VACÍA en prod** |
| `turrets` | `029_create_turrets.sql` | scunpacked |
| `weapon_attachments` | `030_create_weapon_attachments.sql` | scunpacked — **VACÍA en prod** |
| `weapon_defensives` | `031_create_weapon_defensives.sql` | scunpacked (chaff, flares) |
| `weapon_guns` | `032_create_weapon_guns.sql` + `043_extend_weapon_guns_energy.sql` + `045_weapon_capacitor_fields.sql` + `046_weapon_thermal_fields.sql` | scunpacked |
| `weapon_mining` | `044_create_weapon_mining.sql` + `054_weapon_mining_compat_cols.sql` | scunpacked (reemplaza `mining_lasers` viejo) |
| `weapon_salvage` | `056_create_weapon_salvage.sql` | scunpacked + manual (Fase M) |
| `bombs` | `053_create_bombs.sql` | scunpacked |
| `jump_drives` | `058_create_jump_drives.sql` | scunpacked |
| `fps_weapons` | `061_create_fps_weapons.sql` | Excel manual (296 rows desde planilla) |
| `loaners` | (faltante en repo, manual) | RSI loaner matrix |

### 4.3 Loaner / pricing satellites
| Tabla | Migración | Fuente |
|-------|-----------|--------|
| `loaners` | (no en repo) | RSI loaner matrix manual |
| `ship_price` | (parte de mig anterior) + `059_add_acquisition_method_to_ship_price.sql` | RSI store + wiki + `populate_prices.mjs` |

---

## 5. Lookup / enum tables

| Tabla | Migración | Fuente | Refresh? |
|-------|-----------|--------|----------|
| `mining_materials` | `050_create_mining_material_deposits.sql` | scunpacked + manual | Sólo si CIG agrega minerales nuevos |
| `mining_material_signatures` | `050_create_mining_material_deposits.sql` | scunpacked rocks | Sólo si CIG cambia detección |
| `mining_locations` | `050_create_mining_material_deposits.sql` | datos de mapa (PU) | Cada nueva location |
| `crafting_categories` / `crafting_blueprints` / `crafting_materials` | (faltante en repo, JSON-only) | `src/data/crafting/*.json` | Cada nuevo crafting patch |
| `activity_types` | (faltante en repo, JSON-only) | `src/data/activities/activity-types.json` | Estable |

---

## 6. Riesgos y gaps detectados

### 6.1 Bloqueantes (resolver antes del próximo ingest masivo)
1. **Colisión de numeración 033-044**: 12 pares de migraciones con el mismo número. Aplicarlas en orden alfabético es no-determinístico (depende del filesystem). **Acción**: renumerar las del power_model bumpeando a 033b/034b/etc., o reescribir el aplicador para leer ambos archivos por número.
2. **Tabla `parties` sin migración**: existe en prod, no en repo. **Acción**: dump del schema de prod → escribir `065_codify_parties_table.sql` retroactivo (con `IF NOT EXISTS`).
3. **3 tablas con migración pero ausentes en prod**: `scanners`, `main_thrusters`, `manneuver_thrusters`. **Acción**: o aplicar las migraciones (con typo de `manneuver` corregido), o eliminar los archivos para reflejar la realidad.
4. **Discrepancia Panther S3 weapon_guns**: ningún campo de DB explica los 192 rounds @ 4 pips de Erkul. 60% de `weapon_guns` tiene `ammo_capacity=0` y 53% tiene `max_ammo_load=NULL`. **Acción**: rever el mapping del ingest scunpacked vs Erkul.

### 6.2 Importantes (deuda técnica)
5. **Seeds sin data**: `scanners_seed___BUSCAR___.sql`, `transponders_seed___BUSCAR___.sql`, `weapon_attachments_seed___BUSCAR.sql`, `main_thrusters_seed_____.sql`, `manneuver_thrusters_seed_____.sql`, `paints_seed_____.sql`. **Acción**: scrapear scunpacked + RSI para llenarlas, o documentar como "fuera de scope".
6. **JSON `power-network-lookup.json` está vacío** pero importado en código. **Acción**: o lo populamos con un script de derivación, o eliminamos las imports.
7. **Mig 024 saltada** (no existe `024_*.sql`). **Acción**: revisar si fue migración fallida o numeración intencional; documentar.
8. **Scripts duplicados**: `ingest_v2.py` / `ingest_v3.py` / `ingest_v4.py` / `ingest_phase3_fast.mjs` / `ingest_power_fast.mjs`. **Acción**: marcar uno como canonical, mover el resto a `scripts/_archive/`.

### 6.3 Posible mejoría
9. Faltan columnas `game_version` y `source_version` en muchas tablas de catálogo. Hoy sólo `ships` las tiene. **Acción**: en una migración futura agregar `game_version TEXT, source_version TEXT, ingested_at TIMESTAMPTZ` a TODAS las tablas de catálogo. Sin esto no se puede hacer rollback selectivo.
10. No hay tabla `game_versions` que registre qué versión está vigente. **Acción**: crear `game_versions(version TEXT PK, scunpacked_commit TEXT, applied_at TIMESTAMPTZ, applied_by TEXT, notes TEXT)`. El extractor inserta una row al inicio y otra al final con tablas afectadas.

---

## 7. Pipeline propuesto — extractor versión-aware

### 7.1 Arquitectura
```
scripts/ingest_game_version.mjs        ← orquestador único, nuevo
├── 0_preflight.mjs                    ← verifica .env, conectividad, DRY_RUN flag
├── 1_pull_scunpacked.mjs              ← git fetch + checkout en SCUNPACKED_LOCAL_PATH
├── 2_register_version.mjs             ← INSERT en game_versions(version, ...)
├── 3_ingest_catalog/                  ← una fase por categoría, en orden topológico
│   ├── a_manufacturers.mjs
│   ├── b_components.mjs               ← coolers, power_plants, shields, ..., en paralelo
│   ├── c_weapons.mjs                  ← weapon_guns, weapon_mining, weapon_salvage
│   ├── d_ships_metadata.mjs           ← ships, ship_flight_stats, ship_resistances, ship_fuel
│   ├── e_ships_power.mjs              ← ship_pools, ship_power_reference (depende de power_plants)
│   ├── f_hardpoints.mjs               ← ship_hardpoints + default loadouts (depende de todo arriba)
│   └── g_misc.mjs                     ← bombs, fps_weapons, jump_drives, paints, transponders, etc.
├── 4_diff_vs_prod.mjs                 ← reporta qué filas cambian, agrega, eliminan
├── 5_apply.mjs                        ← gated por --apply (sin esto, sólo dry-run)
└── 6_postflight.mjs                   ← UPDATE game_versions SET completed_at, valida row counts
```

### 7.2 Reglas no-negociables
- **Nunca tocar las tablas de la sección 2 ni 3** (regex de tablas-a-saltar hardcoded en preflight).
- **Idempotente**: cada fase usa `INSERT ... ON CONFLICT (id) DO UPDATE SET ...`. Nunca `TRUNCATE`. (TRUNCATE + INSERT dispara cascadas y borra datos derivados.)
- **Diff antes de aplicar**: la fase 4 imprime un resumen tipo `manufacturers: +2 / -0 / 58 unchanged`. Si algún diff es sospechoso (ej: 100% de las filas marcadas para DELETE), el script aborta y pide confirmación interactiva.
- **`--dry-run` por defecto**, `--apply` requerido para escribir. Después de un dry-run exitoso, el comando muestra el `--apply` exacto para correr.
- **Rollback**: cada fase guarda un snapshot de las filas afectadas en `scripts/_snapshots/{version}/{table}.json` antes de tocar. Para rollback, replay del snapshot.
- **Auditoría**: cada INSERT/UPDATE incluye `source_version = current.scunpacked_commit` y `ingested_at = NOW()`.

### 7.3 Comando objetivo
```bash
# dry-run obligatorio primero
node scripts/ingest_game_version.mjs --version 4.7.2 --scunpacked-commit a1b2c3d

# si el diff se ve sano:
node scripts/ingest_game_version.mjs --version 4.7.2 --scunpacked-commit a1b2c3d --apply

# rollback selectivo si algo sale mal:
node scripts/ingest_game_version.mjs --rollback-version 4.7.2 --tables ships,weapon_guns
```

### 7.4 Trabajo previo necesario antes de poder construir el orquestador
1. Resolver gaps 6.1.1 a 6.1.4 (colisión 033-044, parties, tablas missing, discrepancia Panther).
2. Agregar `game_version`, `source_version`, `ingested_at` a TODAS las tablas de catálogo (mig 064 propuesta).
3. Crear tabla `game_versions` (mig 065 propuesta).
4. Consolidar los scripts duplicados (`ingest_v2/v3/v4`, `ingest_power_fast` vs `ingest_power_model`).

---

## 8. Roadmap recomendado (priorizado)

| # | Tarea | Esfuerzo | Bloqueante para extractor? |
|---|-------|----------|----------------------------|
| 1 | Fix colisión 033-044 (renumerar) | 1-2h | ✅ Sí |
| 2 | Codificar tabla `parties` retroactiva (mig 065) | 30min | ✅ Sí |
| 3 | Decidir destino de `scanners`/`main_thrusters`/`manneuver_thrusters` | 1h investigar | ✅ Sí |
| 4 | Migración 064: agregar `game_version, source_version, ingested_at` a las 42 tablas de catálogo | 2-3h | ✅ Sí |
| 5 | Migración 066 (post-064): crear `game_versions` registro | 30min | ✅ Sí |
| 6 | Investigar discrepancia Panther S3 (Erkul vs DB) | 2-4h | ⚠️ Idealmente sí |
| 7 | Mover `ingest_v2/v4`, `ingest_power_fast` a `scripts/_archive/` | 30min | ❌ No (limpieza) |
| 8 | Construir `scripts/ingest_game_version.mjs` orquestador | 1-2 días | — (es el deliverable) |
| 9 | Llenar seeds `__BUSCAR__` (scanners/transponders/paints/etc.) | 1 día scraping | ❌ Eventual |
| 10 | Migración para aplicar `063_lockdown_profiles_pii.sql` en prod (sigue pendiente del incidente del 25/04) | 5min | ❌ No (seguridad, no extractor) |

---

## 9. Anexos

### A. Scripts de ingesta existentes (resumen)
Revisar `scripts/` para detalle. Los relevantes para el catálogo del juego:
- **Canonical ingestores activos**: `ingest_scunpacked.py`, `ingest_power_model.mjs`, `ingest_phase3_fast.mjs`
- **Importadores específicos**: `import-bombs.mjs`, `import-jump-drives.mjs`, `import-qigs.mjs`, `import-weapon-salvage.mjs`, `import-fps-weapons.mjs`, `import-concept-ships.mjs`
- **RSI prices**: `populate_prices.mjs`
- **UEX (NO catálogo)**: `importers/import-uex-prices.mjs`
- **Auditoría (no escribe)**: `audit_ship_pools.mjs`, `audit_supabase_state.mjs`, `audit_panther_rhino.mjs`, `_audit-mining.mjs`

### B. JSONs de seed en `src/data/`
Los críticos a sincronizar con DB en cada game version:
- `src/data/ship-power-data.json` ↔ `ships` + `ship_pools` + `ship_power_reference`
- `src/data/mining/refineries.json` ↔ `refineries` (si existe en DB)
- `src/data/mining/refining-methods.json` ↔ `refining_methods`
- `src/data/mining/minerals.json` ↔ `mining_materials`

### C. Tablas que probablemente **no existen en repo** pero sí en prod
Inferidas del código pero sin migración encontrada:
- `friendships`, `parties`, `party_members`, `organizations`, `org_members`, `notifications`, `loaners`, `ship_hardpoints`, `radars`, `crafting_*`, `activity_*`, `refineries`, `refining_methods`

**Acción urgente**: dump del schema de prod (`pg_dump --schema-only`) y commit como `database/migrations/legacy_004_dump_prod_schema.sql` para tener referencia auditable.

### D. Variables de entorno que el extractor va a necesitar
```
DATABASE_URL=postgres://...           # ya existe
DIRECT_URL=postgres://...             # ya existe
SCUNPACKED_REPO_URL=https://...       # ya existe
SCUNPACKED_LOCAL_PATH=./data/scunpacked  # ya existe
GAME_VERSION=4.7.2                    # nuevo, opcional (puede pasar como --version)
SUPABASE_SERVICE_ROLE_KEY=...         # FALTANTE — necesario para bypass RLS en algunas tablas
```

---

**Próximo paso sugerido para Pablo**: priorizar los items 1-5 del roadmap antes de pedir el extractor. Eso desbloquea el resto.
