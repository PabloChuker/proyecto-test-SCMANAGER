'use strict';

/**
 * import-weapon-guns.js
 * =====================
 * Genera los dos archivos SQL del módulo WeaponGuns a partir de ship-items.json.
 *
 * Archivos generados:
 *   db/migrations/032_create_weapon_guns.sql   — DDL de la tabla e índices
 *   db/seeds/weapon_guns_seed.sql              — INSERT de armas canónicas
 *
 * Diseñado para re-ejecutarse tras cada actualización de ship-items.json.
 * Ambos archivos se sobreescriben en cada ejecución.
 *
 * Uso:
 *   node scripts/import-weapon-guns.js
 *   node scripts/import-weapon-guns.js --dry-run
 *   node scripts/import-weapon-guns.js --input=ruta/ship-items.json
 *   node scripts/import-weapon-guns.js --output=ruta/custom_seed.sql
 *
 * Requisitos:
 *   - Node.js >= 14 (solo stdlib: fs, path)
 *   - ship-items.json en la raíz del proyecto
 */

const fs   = require('fs');
const path = require('path');

// =============================================================================
// RUTAS
// =============================================================================

const ROOT   = path.resolve(__dirname, '..', '..');

function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach(a => {
    if (a === '--dry-run') { args.dryRun = true; return; }
    const m = a.match(/^--(\w+)=(.+)$/);
    if (m) args[m[1]] = m[2];
  });
  return args;
}

const ARGS   = parseArgs();
const SOURCE = ARGS.input  ? path.resolve(ARGS.input)  : path.join(ROOT, 'ship-items.json');
const SEED   = ARGS.output ? path.resolve(ARGS.output) : path.join(ROOT, 'database', 'seeds',      'weapon_guns_seed.sql');
const MIG    =                                            path.join(ROOT, 'database', 'migrations', '032_create_weapon_guns.sql');

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

// =============================================================================
// CRITERIOS DE FILTRADO
//
//   Regla 1 — stdItem.UUID válido (no null, no nil UUID)
//     Los 188 registros WeaponGun tienen UUID válido (0 nil UUIDs).
//
//   Regla 2 — name no vacío ni PLACEHOLDER
//     8 registros tienen Name = "<= PLACEHOLDER =>".
//
//   Regla 3 — className no empieza por "test_" (case-insensitive)
//     1 registro de prueba: test_gats_gattlings_s3.
//
//   Regla 4 — className no termina en "_Template" (case-insensitive)
//     No hay registros _Template en el dataset actual. Defensa en profundidad.
// =============================================================================

function isCanonical(record) {
  const std = record.stdItem;

  if (!std)                                   return false;  // regla 1
  if (!std.UUID || std.UUID === NIL_UUID)     return false;  // regla 1

  const name = (std.Name || '').trim();
  if (!name || name === '<= PLACEHOLDER =>')  return false;  // regla 2

  const cn = (record.className || '').toLowerCase();
  if (cn.startsWith('test_'))                 return false;  // regla 3
  if (cn.endsWith('_template'))               return false;  // regla 4

  return true;
}

// =============================================================================
// LIMPIEZA
// =============================================================================

function clean(str) {
  if (str == null) return null;
  const r = str.replace(/[\u00a0\s]+$/g, '').trim();
  return r === '' ? null : r;
}

function cleanDesc(str) {
  if (str == null) return null;
  const s = str.replace(/[\u00a0\s]+$/g, '').trim();
  if (!s || s === '<= PLACEHOLDER =>') return null;
  return s;
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number')             return String(value);
  if (typeof value === 'object')             return "'" + JSON.stringify(value).replace(/'/g, "''") + "'::jsonb";
  return "'" + String(value).replace(/'/g, "''") + "'";
}

// =============================================================================
// TRANSFORMACIÓN — JSON → fila de tabla
//
// Mapeo de campos:
//
// IDENTIDAD
//   id               ← stdItem.UUID  (= reference)
//   class_name       ← stdItem.ClassName
//   item_name        ← itemName  (slug lowercase)
//   name             ← stdItem.Name
//   description      ← stdItem.DescriptionText  (texto limpio)
//   sub_type         ← subType  (Gun | Rocket | NoseMounted; "UNDEFINED" → NULL)
//   size             ← stdItem.Size  (1–12)
//   grade            ← stdItem.Grade  (1–7, casi siempre 1)
//   mass             ← stdItem.Mass  (varía 0–6.870.000)
//   width            ← stdItem.Width
//   height           ← stdItem.Height
//   length           ← stdItem.Length
//   manufacturer_id  ← stdItem.Manufacturer.UUID  (null si nil UUID; 6/188 nil)
//
// MECÁNICA DEL ARMA  (stdItem.Weapon — presente en 183/188)
//   fire_mode        ← stdItem.Weapon.FireMode  (Single | Rapid | Charge | Beam)
//   effective_range  ← stdItem.Weapon.EffectiveRange  (225–10000 m)
//   rate_of_fire     ← stdItem.Weapon.RateOfFire  (2–1600 RPM)
//   weapon_capacity  ← stdItem.Weapon.Capacity  (3–15000 rondas)
//
// DAÑO POR DISPARO  (stdItem.Weapon.Modes[0] — siempre exactamente 1 modo)
//   damage_per_shot  ← Modes[0].DamagePerShot  (total; 0–18500)
//   alpha_physical   ← Modes[0].AlphaPhysical   (todos varían con valores ≠0)
//   alpha_energy     ← Modes[0].AlphaEnergy
//   alpha_distortion ← Modes[0].AlphaDistortion
//   alpha_thermal    ← Modes[0].AlphaThermal
//   alpha_biochemical← Modes[0].AlphaBiochemical
//   alpha_stun       ← Modes[0].AlphaStun
//   dps_physical     ← Modes[0].DpsPhysical      (todos varían con valores ≠0)
//   dps_energy       ← Modes[0].DpsEnergy
//   dps_distortion   ← Modes[0].DpsDistortion
//   dps_thermal      ← Modes[0].DpsThermal
//   dps_biochemical  ← Modes[0].DpsBiochemical
//   dps_stun         ← Modes[0].DpsStun
//   pellets_per_shot ← Modes[0].PelletsPerShot  (1 normal, 8 = escopeta)
//   heat_per_shot    ← Modes[0].HeatPerShot  (0–50000)
//   spread_min       ← Modes[0].Spread.Minimum  (0–4)
//   spread_max       ← Modes[0].Spread.Maximum  (0–4)
//
// MUNICIÓN  (stdItem.Ammunition — presente en 180/188)
//   ammo_speed       ← stdItem.Ammunition.Speed  (700–3000 m/s)
//   ammo_range       ← stdItem.Ammunition.Range  (1050–3998 m — distancia máx. proyectil)
//   ammo_capacity    ← stdItem.Ammunition.Capacity  (0–4440 rondas)
//   explosion_radius_min ← stdItem.Ammunition.ExplosionRadius.Minimum  (rockets: 0.5–20)
//   explosion_radius_max ← stdItem.Ammunition.ExplosionRadius.Maximum  (rockets: 4–30)
//
// DURABILIDAD Y EMISIÓN
//   durability_health← stdItem.Durability.Health  (50–750000 HP; presente en 179/188)
//   emission_em_max  ← stdItem.Emission.Em.Maximum  (0–248; presente en 174/188)
//
// PUERTOS  (jsonb — presente en 172/188)
//   ports            ← stdItem.Ports  (slots de attachment; 1–N puertos por arma)
//
// Campos descartados:
//   subType/classification/Weapon.WeaponType/WeaponClass  → constantes o derivables
//   Weapon.Modes[0].RoundsPerMinute  → idéntico a Weapon.RateOfFire
//   Weapon.Modes[0].AdsSpread        → idéntico a Spread en todos los registros
//   Weapon.Modes[0].AmmoPerShot      → casi siempre 0 o 1, sin valor diferenciador
//   Weapon.Modes[0].WearPerShot      → varía pero no es dato de juego visible
//   Weapon.Damage.*                  → derivable de alpha_* y rate_of_fire
//   Ammunition.ImpactDamage          → solapado con alpha_physical / alpha_energy del modo
//   Ammunition.DetonationDamage      → solapado con alpha_* para rockets
//   Ammunition.Penetration.*         → BasePenetrationDistance, NearRadius, FarRadius —
//                                      mecánica interna del motor, sin valor de consulta directo
//   Ammunition.Mass / Pierceability / FlightPhysics / PhysicalDimensions → constantes o basura
//   Durability.Salvageable/Repairable/Resistance → constantes en todos los registros
//   Emission.Em.Minimum / Decay / Ir            → mínimo siempre 0; Decay pequeño; Ir omitido
//   stdItem.InventoryOccupancy / DimensionOverrides → display/UI interno
//   tags / required_tags / entity_tags  → etiquetado interno del juego
// =============================================================================

function transform(record) {
  const std  = record.stdItem;
  const wep  = std.Weapon     || null;
  const ammo = std.Ammunition || null;
  const dur  = std.Durability || null;
  const em   = std.Emission   || null;
  const mfr  = std.Manufacturer;
  const mfrId = (mfr && mfr.UUID && mfr.UUID !== NIL_UUID) ? mfr.UUID : null;

  const subTypeRaw = clean(record.subType);
  const sub_type   = (subTypeRaw && subTypeRaw.toUpperCase() !== 'UNDEFINED') ? subTypeRaw : null;

  const mode        = wep && wep.Modes && wep.Modes.length > 0 ? wep.Modes[0] : null;
  const spread      = mode ? (mode.Spread || null) : null;
  const explRadius  = ammo ? (ammo.ExplosionRadius || null) : null;
  const ports       = std.Ports && std.Ports.length > 0 ? std.Ports : null;

  return {
    // Identidad
    id:                   std.UUID,
    class_name:           clean(std.ClassName),
    item_name:            clean(record.itemName),
    name:                 clean(std.Name),
    description:          cleanDesc(std.DescriptionText),
    sub_type,
    size:                 std.Size   != null ? std.Size   : null,
    grade:                std.Grade  != null ? std.Grade  : null,
    mass:                 std.Mass   != null ? std.Mass   : null,
    width:                std.Width  != null ? std.Width  : null,
    height:               std.Height != null ? std.Height : null,
    length:               std.Length != null ? std.Length : null,
    manufacturer_id:      mfrId,
    // Mecánica del arma
    fire_mode:            wep ? clean(wep.FireMode)         : null,
    effective_range:      wep ? (wep.EffectiveRange != null ? wep.EffectiveRange : null) : null,
    rate_of_fire:         wep ? (wep.RateOfFire     != null ? wep.RateOfFire     : null) : null,
    weapon_capacity:      wep ? (wep.Capacity       != null ? wep.Capacity       : null) : null,
    // Daño por disparo
    damage_per_shot:      mode ? (mode.DamagePerShot   != null ? mode.DamagePerShot   : null) : null,
    alpha_physical:       mode ? (mode.AlphaPhysical   != null ? mode.AlphaPhysical   : null) : null,
    alpha_energy:         mode ? (mode.AlphaEnergy     != null ? mode.AlphaEnergy     : null) : null,
    alpha_distortion:     mode ? (mode.AlphaDistortion != null ? mode.AlphaDistortion : null) : null,
    alpha_thermal:        mode ? (mode.AlphaThermal    != null ? mode.AlphaThermal    : null) : null,
    alpha_biochemical:    mode ? (mode.AlphaBiochemical!= null ? mode.AlphaBiochemical: null) : null,
    alpha_stun:           mode ? (mode.AlphaStun       != null ? mode.AlphaStun       : null) : null,
    dps_physical:         mode ? (mode.DpsPhysical     != null ? mode.DpsPhysical     : null) : null,
    dps_energy:           mode ? (mode.DpsEnergy       != null ? mode.DpsEnergy       : null) : null,
    dps_distortion:       mode ? (mode.DpsDistortion   != null ? mode.DpsDistortion   : null) : null,
    dps_thermal:          mode ? (mode.DpsThermal      != null ? mode.DpsThermal      : null) : null,
    dps_biochemical:      mode ? (mode.DpsBiochemical  != null ? mode.DpsBiochemical  : null) : null,
    dps_stun:             mode ? (mode.DpsStun         != null ? mode.DpsStun         : null) : null,
    pellets_per_shot:     mode ? (mode.PelletsPerShot  != null ? mode.PelletsPerShot  : null) : null,
    heat_per_shot:        mode ? (mode.HeatPerShot     != null ? mode.HeatPerShot     : null) : null,
    spread_min:           spread ? (spread.Minimum != null ? spread.Minimum : null) : null,
    spread_max:           spread ? (spread.Maximum != null ? spread.Maximum : null) : null,
    // Munición
    ammo_speed:           ammo ? (ammo.Speed    != null ? ammo.Speed    : null) : null,
    ammo_range:           ammo ? (ammo.Range    != null ? ammo.Range    : null) : null,
    ammo_capacity:        ammo ? (ammo.Capacity != null ? ammo.Capacity : null) : null,
    explosion_radius_min: explRadius ? (explRadius.Minimum != null ? explRadius.Minimum : null) : null,
    explosion_radius_max: explRadius ? (explRadius.Maximum != null ? explRadius.Maximum : null) : null,
    // Durabilidad y emisión
    durability_health:    dur ? (dur.Health           != null ? dur.Health           : null) : null,
    emission_em_max:      em  ? (em.Em && em.Em.Maximum != null ? em.Em.Maximum      : null) : null,
    // Puertos
    ports,
  };
}

// =============================================================================
// GENERADOR — DDL (migración)
// =============================================================================

function buildMigrationSQL() {
  return [
    '-- =============================================================================',
    '-- Migración: 032_create_weapon_guns',
    '-- Módulo:    Naves y loadouts — Star Citizen',
    '-- Generado por: scripts/import-weapon-guns.js',
    '-- =============================================================================',
    '--',
    '-- DECISIONES DE DISEÑO',
    '--',
    '-- · id / class_name / item_name / name / description / sub_type',
    '--     Campos de identidad estándar. sub_type ∈ {Gun, Rocket, NoseMounted; NULL}.',
    '--     "UNDEFINED" (3 registros) almacenado como NULL.',
    '--',
    '-- · size (1–12) / grade (1–7) / mass / width / height / length',
    '--     Dimensiones físicas con variación real. mass va de 0 a 6.870.000.',
    '--',
    '-- · manufacturer_id',
    '--     UUID del fabricante. 6/188 registros tienen nil UUID → NULL.',
    '--     25 fabricantes distintos. Sin FK forzada.',
    '--',
    '-- · fire_mode / effective_range / rate_of_fire / weapon_capacity',
    '--     Mecánica de disparo del arma. stdItem.Weapon presente en 183/188 registros.',
    '--     fire_mode ∈ {Single, Rapid, Charge, Beam}.',
    '--     effective_range: 225–10000 m. rate_of_fire: 2–1600 RPM.',
    '--',
    '-- · damage_per_shot / alpha_* / dps_*',
    '--     Daño por disparo y DPS por tipo de daño, de stdItem.Weapon.Modes[0].',
    '--     El array Modes siempre tiene exactamente 1 elemento.',
    '--     TODOS los tipos (Physical, Energy, Distortion, Thermal, Biochemical, Stun)',
    '--     tienen valores no-nulos en algún registro — ninguno es uniformemente cero.',
    '--     alpha_*: daño por disparo (0–18500). dps_*: daño por segundo.',
    '--',
    '-- · pellets_per_shot (1 | 8) / heat_per_shot (0–50000)',
    '--     pellets_per_shot=8 identifica escopetas (ScatterGun).',
    '--',
    '-- · spread_min / spread_max',
    '--     Dispersión del arma de stdItem.Weapon.Modes[0].Spread. Varía 0–4.',
    '--',
    '-- · ammo_speed / ammo_range / ammo_capacity',
    '--     Estadísticas balísticas del proyectil. stdItem.Ammunition presente en 180/188.',
    '--     ammo_speed: 700–3000 m/s. ammo_range: distancia máxima del proyectil (1050–3998 m).',
    '--     NOTA: ammo_range ≠ effective_range. El primero es el límite duro del proyectil;',
    '--     el segundo es el rango de efectividad del arma (puede ser inferior).',
    '--',
    '-- · explosion_radius_min / explosion_radius_max',
    '--     Solo rockets (9 registros). NULL para armas normales.',
    '--     stdItem.Ammunition.ExplosionRadius presente solo cuando subType=Rocket.',
    '--',
    '-- · durability_health  (50–750000 HP; stdItem.Durability presente en 179/188)',
    '-- · emission_em_max    (0–248; stdItem.Emission presente en 174/188)',
    '--',
    '-- · ports  (jsonb)',
    '--     stdItem.Ports presente en 172/188. Array de slots de attachment con',
    '--     PortName, Size, MinSize, MaxSize, Flags y EquippedItem.',
    '--     Índice GIN para consultas sobre compatibilidad de attachments.',
    '--',
    '-- · Campos descartados:',
    '--     subType / classification / Weapon.WeaponType / WeaponClass → constantes',
    '--     Modes[0].RoundsPerMinute   → idéntico a Weapon.RateOfFire',
    '--     Modes[0].AdsSpread         → idéntico a Spread en todos los registros',
    '--     Modes[0].AmmoPerShot / WearPerShot → sin valor de consulta',
    '--     Weapon.Damage.*            → derivable de alpha_* × rate_of_fire',
    '--     Ammunition.ImpactDamage    → solapado con alpha_physical / alpha_energy',
    '--     Ammunition.DetonationDamage→ solapado con alpha_* para rockets',
    '--     Ammunition.Penetration.*   → mecánica interna del motor',
    '--     Ammunition.Mass / Pierceability / FlightPhysics → constantes o basura',
    '--     Durability.Resistance / Salvageable / Repairable → constantes',
    '--     Emission.Em.Minimum / Decay / Ir → mínimo siempre 0; decay mínimo',
    '--     InventoryOccupancy / DimensionOverrides → display/UI interno',
    '--     tags / required_tags / entity_tags → etiquetado interno del juego',
    '--',
    '-- · Timestamps    No se añaden. Tabla de referencia estática del juego.',
    '-- =============================================================================',
    '',
    'create table if not exists weapon_guns (',
    '  -- Identidad',
    '  id                    uuid     primary key,',
    '  class_name            text     not null,',
    '  item_name             text,',
    '  name                  text     not null,',
    '  description           text,',
    '  sub_type              text,',
    '  size                  integer,',
    '  grade                 integer,',
    '  mass                  numeric,',
    '  width                 numeric,',
    '  height                numeric,',
    '  length                numeric,',
    '  manufacturer_id       uuid,',
    '  -- Mecánica del arma',
    '  fire_mode             text,',
    '  effective_range       numeric,',
    '  rate_of_fire          numeric,',
    '  weapon_capacity       integer,',
    '  -- Daño por disparo y DPS por tipo',
    '  damage_per_shot       numeric,',
    '  alpha_physical        numeric,',
    '  alpha_energy          numeric,',
    '  alpha_distortion      numeric,',
    '  alpha_thermal         numeric,',
    '  alpha_biochemical     numeric,',
    '  alpha_stun            numeric,',
    '  dps_physical          numeric,',
    '  dps_energy            numeric,',
    '  dps_distortion        numeric,',
    '  dps_thermal           numeric,',
    '  dps_biochemical       numeric,',
    '  dps_stun              numeric,',
    '  -- Parámetros del modo de disparo',
    '  pellets_per_shot      integer,',
    '  heat_per_shot         numeric,',
    '  spread_min            numeric,',
    '  spread_max            numeric,',
    '  -- Munición',
    '  ammo_speed            integer,',
    '  ammo_range            integer,',
    '  ammo_capacity         integer,',
    '  explosion_radius_min  numeric,',
    '  explosion_radius_max  numeric,',
    '  -- Durabilidad y emisión',
    '  durability_health     numeric,',
    '  emission_em_max       numeric,',
    '  -- Puertos de attachment',
    '  ports                 jsonb',
    ');',
    '',
    '-- Búsquedas por class_name (cruce con loadouts y naves).',
    'create index if not exists idx_weapon_guns_class_name',
    '  on weapon_guns (class_name);',
    '',
    '-- Filtrado por subtipo (Gun vs Rocket vs NoseMounted).',
    'create index if not exists idx_weapon_guns_sub_type',
    '  on weapon_guns (sub_type)',
    '  where sub_type is not null;',
    '',
    '-- Filtrado por tamaño (criterio principal de compatibilidad con mounts).',
    'create index if not exists idx_weapon_guns_size',
    '  on weapon_guns (size);',
    '',
    '-- Filtrado por modo de disparo (Single / Rapid / Charge / Beam).',
    'create index if not exists idx_weapon_guns_fire_mode',
    '  on weapon_guns (fire_mode)',
    '  where fire_mode is not null;',
    '',
    '-- Ordenar / filtrar armas por daño total por disparo.',
    'create index if not exists idx_weapon_guns_damage_per_shot',
    '  on weapon_guns (damage_per_shot)',
    '  where damage_per_shot is not null;',
    '',
    '-- Búsquedas por fabricante (parcial: solo filas con fabricante asignado).',
    'create index if not exists idx_weapon_guns_manufacturer_id',
    '  on weapon_guns (manufacturer_id)',
    '  where manufacturer_id is not null;',
    '',
    '-- Consultas sobre slots de attachment disponibles (tamaño, tipo, arma equipada).',
    'create index if not exists idx_weapon_guns_ports_gin',
    '  on weapon_guns using gin (ports)',
    '  where ports is not null;',
    '',
  ].join('\n');
}

// =============================================================================
// GENERADOR — SEED (datos)
// =============================================================================

function buildSeedSQL(rows, stats) {
  const now   = new Date().toISOString().slice(0, 10);
  const lines = [];

  lines.push('-- =============================================================================');
  lines.push('-- weapon_guns_seed.sql');
  lines.push('-- Generado por: scripts/import-weapon-guns.js');
  lines.push(`-- Fecha:        ${now}`);
  lines.push(`-- Origen:       ship-items.json (${stats.total} registros totales, ${stats.ofType} de type WeaponGun)`);
  lines.push(`-- Importados:   ${rows.length}  |  Excluidos: ${stats.ofType - rows.length}`);
  lines.push('-- =============================================================================');

  if (stats.excluded.length > 0) {
    lines.push('--');
    lines.push(`-- Excluidos (${stats.excluded.length}/${stats.ofType}):`);
    for (const ex of stats.excluded) {
      lines.push(`--   ${ex.className}  →  ${ex.reasons.join(', ')}`);
    }
  }

  if (rows.length === 0) {
    lines.push('--');
    lines.push('-- Sin registros que importar en este ciclo.');
    lines.push('-- No se genera INSERT.');
    return lines.join('\n');
  }

  lines.push('');
  lines.push('-- Inserción idempotente: filas ya existentes se omiten sin error.');
  lines.push('insert into weapon_guns (');
  lines.push('  id, class_name, item_name, name, description,');
  lines.push('  sub_type, size, grade, mass, width, height, length, manufacturer_id,');
  lines.push('  fire_mode, effective_range, rate_of_fire, weapon_capacity,');
  lines.push('  damage_per_shot,');
  lines.push('  alpha_physical, alpha_energy, alpha_distortion, alpha_thermal, alpha_biochemical, alpha_stun,');
  lines.push('  dps_physical, dps_energy, dps_distortion, dps_thermal, dps_biochemical, dps_stun,');
  lines.push('  pellets_per_shot, heat_per_shot, spread_min, spread_max,');
  lines.push('  ammo_speed, ammo_range, ammo_capacity, explosion_radius_min, explosion_radius_max,');
  lines.push('  durability_health, emission_em_max,');
  lines.push('  ports');
  lines.push(')');
  lines.push('values');

  for (let i = 0; i < rows.length; i++) {
    const r   = rows[i];
    const sep = i < rows.length - 1 ? ',' : '';
    lines.push(
      `  (${sqlLiteral(r.id)}, ${sqlLiteral(r.class_name)}, ${sqlLiteral(r.item_name)}, ${sqlLiteral(r.name)}, ${sqlLiteral(r.description)},` +
      `\n   ${sqlLiteral(r.sub_type)}, ${sqlLiteral(r.size)}, ${sqlLiteral(r.grade)}, ${sqlLiteral(r.mass)}, ${sqlLiteral(r.width)}, ${sqlLiteral(r.height)}, ${sqlLiteral(r.length)}, ${sqlLiteral(r.manufacturer_id)},` +
      `\n   ${sqlLiteral(r.fire_mode)}, ${sqlLiteral(r.effective_range)}, ${sqlLiteral(r.rate_of_fire)}, ${sqlLiteral(r.weapon_capacity)},` +
      `\n   ${sqlLiteral(r.damage_per_shot)},` +
      `\n   ${sqlLiteral(r.alpha_physical)}, ${sqlLiteral(r.alpha_energy)}, ${sqlLiteral(r.alpha_distortion)}, ${sqlLiteral(r.alpha_thermal)}, ${sqlLiteral(r.alpha_biochemical)}, ${sqlLiteral(r.alpha_stun)},` +
      `\n   ${sqlLiteral(r.dps_physical)}, ${sqlLiteral(r.dps_energy)}, ${sqlLiteral(r.dps_distortion)}, ${sqlLiteral(r.dps_thermal)}, ${sqlLiteral(r.dps_biochemical)}, ${sqlLiteral(r.dps_stun)},` +
      `\n   ${sqlLiteral(r.pellets_per_shot)}, ${sqlLiteral(r.heat_per_shot)}, ${sqlLiteral(r.spread_min)}, ${sqlLiteral(r.spread_max)},` +
      `\n   ${sqlLiteral(r.ammo_speed)}, ${sqlLiteral(r.ammo_range)}, ${sqlLiteral(r.ammo_capacity)}, ${sqlLiteral(r.explosion_radius_min)}, ${sqlLiteral(r.explosion_radius_max)},` +
      `\n   ${sqlLiteral(r.durability_health)}, ${sqlLiteral(r.emission_em_max)},` +
      `\n   ${sqlLiteral(r.ports)})${sep}`
    );
  }

  lines.push('on conflict (id) do nothing;');
  lines.push('');
  lines.push(`-- ${rows.length} arma(s) de nave insertada(s).`);

  return lines.join('\n');
}

// =============================================================================
// UTILIDAD — escritura segura
// =============================================================================

function writeFile(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

// =============================================================================
// MAIN
// =============================================================================

function main() {
  const SEP = '─'.repeat(60);

  if (!fs.existsSync(SOURCE)) {
    console.error(`ERROR: No se encontró ${SOURCE}`);
    process.exit(1);
  }

  const data   = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
  const ofType = data.filter(r => r.type === 'WeaponGun');

  // Registrar motivos de exclusión para el seed
  const excluded = ofType
    .filter(r => !isCanonical(r))
    .map(r => {
      const reasons = [];
      const std = r.stdItem;
      const cn  = (r.className || '').toLowerCase();
      if (!std || !std.UUID || std.UUID === NIL_UUID)       reasons.push('nil/missing UUID');
      if (std && !(std.Name || '').trim())                  reasons.push('name vacío');
      if ((std?.Name || '').trim() === '<= PLACEHOLDER =>') reasons.push('PLACEHOLDER');
      if (cn.startsWith('test_'))                           reasons.push('test_*');
      if (cn.endsWith('_template'))                         reasons.push('_Template');
      return { className: r.className, reasons };
    });

  const canonical = ofType.filter(isCanonical);
  const rows      = canonical.map(transform);
  const stats     = { total: data.length, ofType: ofType.length, excluded };

  // Distribución de sub_type
  const subTypeCounts = {};
  rows.forEach(r => {
    const st = r.sub_type || 'NULL';
    subTypeCounts[st] = (subTypeCounts[st] || 0) + 1;
  });

  // Distribución de fire_mode
  const fireModeCounts = {};
  rows.forEach(r => {
    const fm = r.fire_mode || 'NULL';
    fireModeCounts[fm] = (fireModeCounts[fm] || 0) + 1;
  });

  console.log(SEP);
  console.log('import-weapon-guns.js');
  console.log(SEP);
  console.log(`Registros totales en fuente:   ${stats.total}`);
  console.log(`Registros type=WeaponGun:      ${stats.ofType}`);
  console.log(`Canónicos (pasan filtros):     ${rows.length}`);
  console.log(`Excluidos:                     ${stats.ofType - rows.length}`);

  if (excluded.length > 0) {
    console.warn('');
    console.warn('Detalle de exclusiones:');
    excluded.forEach(e => console.warn(`  ${e.className}  →  ${e.reasons.join(', ')}`));
  }

  console.log('');
  console.log('Distribución de sub_type:');
  Object.entries(subTypeCounts)
    .sort(([, a], [, b]) => b - a)
    .forEach(([st, n]) => console.log(`  ${st.padEnd(18)} ${n}`));

  console.log('');
  console.log('Distribución de fire_mode:');
  Object.entries(fireModeCounts)
    .sort(([, a], [, b]) => b - a)
    .forEach(([fm, n]) => console.log(`  ${fm.padEnd(18)} ${n}`));

  if (ARGS.dryRun) {
    console.log('');
    console.log('[--dry-run] No se escribió ningún archivo.');
    console.log(SEP);
    return;
  }

  writeFile(MIG,  buildMigrationSQL());
  console.log('');
  console.log(`Migración escrita en:  ${MIG}`);

  writeFile(SEED, buildSeedSQL(rows, stats));
  console.log(`Seed escrito en:       ${SEED}`);
  console.log(SEP);
}

main();
