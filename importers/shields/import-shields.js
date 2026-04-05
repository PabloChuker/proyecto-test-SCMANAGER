'use strict';

/**
 * import-shields.js
 * =================
 * Genera los dos archivos SQL del módulo Shields a partir de ship-items.json.
 *
 * Archivos generados:
 *   db/migrations/027_create_shields.sql   — DDL de la tabla e índices
 *   db/seeds/shields_seed.sql              — INSERT de escudos canónicos
 *
 * Todas las columnas funcionales se extraen desde rutas profundas del JSON.
 * Mapeo validado con el ítem FR-76 (SHLD_GODI_S02_FR76_SCItem).
 *
 * NOTA SOBRE CONSUMO DE ENERGÍA:
 *   Se usan dos columnas separadas: power_consumption_min y power_consumption_max.
 *   Fuente: stdItem.ResourceNetwork.Usage.Power.Minimum / .Maximum
 *   Validado: FR-76 → min=1, max=4.
 *   11/66 escudos tienen min=max (valores reales del JSON, no artefacto de relleno).
 *   Este patrón debe aplicarse a todo componente con Usage.Power.Minimum + .Maximum.
 *
 * Uso:
 *   node scripts/import-shields.js
 *   node scripts/import-shields.js --dry-run
 *   node scripts/import-shields.js --input=ruta/ship-items.json
 *   node scripts/import-shields.js --output=ruta/custom_seed.sql
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

const ROOT = path.resolve(__dirname, '..', '..');

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
const SEED   = ARGS.output ? path.resolve(ARGS.output) : path.join(ROOT, 'database', 'seeds',      'shields_seed.sql');
const MIG    =                                            path.join(ROOT, 'database', 'migrations', '027_create_shields.sql');

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

// =============================================================================
// CRITERIOS DE FILTRADO
//
//   Regla 1 — stdItem.UUID válido (no null, no nil UUID)
//     Los 66 registros canónicos tienen UUID válido; 0 nil UUIDs.
//
//   Regla 2 — name no vacío ni PLACEHOLDER
//     6 registros tienen Name = "<= PLACEHOLDER =>":
//       - 4 _Template (SHLD_S01..S04_Template)
//       - 2 capital ships sin datos públicos:
//           SHLD_GODI_S04_Bengal_SCItem
//           SHLD_GODI_S04_Javelin_SCItem
//     Todos tienen Name PLACEHOLDER → la regla 2 los caza a todos.
//     Las reglas 3 y 4 añaden defensa en profundidad.
//
//   Regla 3 — className no empieza por "test_" (case-insensitive)
//
//   Regla 4 — className no termina en "_Template" (case-insensitive)
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

function num(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
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
// MAPEO EXACTO DE RUTAS (validado con FR-76 / SHLD_GODI_S02_FR76_SCItem):
//
// IDENTIDAD
//   id                        ← stdItem.UUID
//   class_name                ← stdItem.ClassName  (= record.className)
//   item_name                 ← record.itemName
//   name                      ← stdItem.Name
//   description               ← stdItem.DescriptionText  (texto limpio sin header)
//                               fallback: stdItem.Description si DescriptionText vacío
//
// FABRICANTE
//   manufacturer_id           ← stdItem.Manufacturer.UUID
//                               NULL si nil UUID (1/66 registros)
//
// CLASIFICACIÓN ERKUL
//   size                      ← stdItem.Size  (0–4)
//   grade_number              ← stdItem.Grade  (1–4)
//   grade                     ← stdItem.DescriptionData["Grade"]  (A/B/C/D/Bespoke)
//                               presente en 64/66 registros
//   class                     ← stdItem.DescriptionData["Class"]  (Military/Civilian/
//                               Industrial/Stealth/Competition)  presente en 64/66
//
// SHIELD CORE  (stdItem.Shield — 66/66)
//   pool_hp                   ← stdItem.Shield.MaxShieldHealth
//   max_shield_regen          ← stdItem.Shield.MaxShieldRegen
//   regen_time                ← stdItem.Shield.RegenerationTime
//   damaged_regen_delay       ← stdItem.Shield.DamagedDelay
//   downed_regen_delay        ← stdItem.Shield.DownedDelay
//
// CONSUMO DE ENERGÍA  — DOS COLUMNAS SEPARADAS (66/66 con ambas)
//   power_consumption_min     ← stdItem.ResourceNetwork.Usage.Power.Minimum  (1–5 pips)
//   power_consumption_max     ← stdItem.ResourceNetwork.Usage.Power.Maximum  (1–6 pips)
//
//   Justificación del split:
//     El JSON trae Minimum y Maximum de forma independiente y con valores distintos
//     en la mayoría de registros. Modelo correcto: dos columnas.
//     Validado: FR-76 → min=1, max=4.
//     11/66 escudos tienen min=max (ej. Bamoty: 3/3, Trenta: 3/3, PIN: 1/1).
//     Estos son valores reales del JSON — no artefacto. Se insertan tal cual.
//     NO se rellena uno con el otro cuando uno falta; se deja NULL (aunque en
//     la práctica ambos están presentes en los 66 registros canónicos).
//
// DISTORSIÓN  (stdItem.Distortion — 66/66)
//   distortion_shutdown_damage ← stdItem.Distortion.Maximum
//   distortion_decay_delay     ← stdItem.Distortion.DecayDelay
//   distortion_decay_rate      ← stdItem.Distortion.DecayRate
//   distortion_warning_ratio   ← stdItem.Distortion.WarningRatio  (constante 0.75;
//                                incluido porque Erkul lo muestra explícitamente)
//   distortion_shutdown_time   ← stdItem.Distortion.ShutdownTime  (16.5–21 s;
//                                4 valores distintos → no constante)
//
// EMISIÓN / VIDA
//   em_max                    ← stdItem.Emission.Em.Maximum  (66/66)
//   health                    ← stdItem.Durability.Health    (66/66)
//
// RESISTENCIAS  (stdItem.Shield.Resistance — 66/66)
//   physical_resistance_min   ← stdItem.Shield.Resistance.Physical.Minimum
//   physical_resistance_max   ← stdItem.Shield.Resistance.Physical.Maximum
//   energy_resistance_min     ← stdItem.Shield.Resistance.Energy.Minimum
//   energy_resistance_max     ← stdItem.Shield.Resistance.Energy.Maximum
//                               Nota: puede ser negativo (vulnerabilidad)
//   distortion_resistance_min ← stdItem.Shield.Resistance.Distortion.Minimum
//   distortion_resistance_max ← stdItem.Shield.Resistance.Distortion.Maximum
//   — Thermal/Biochemical/Stun: constantes 0 en todos los registros → descartadas
//
// ABSORCIONES  (stdItem.Shield.Absorption — 66/66)
//   physical_absorption_min   ← stdItem.Shield.Absorption.Physical.Minimum
//   physical_absorption_max   ← stdItem.Shield.Absorption.Physical.Maximum
//   energy_absorption_min     ← stdItem.Shield.Absorption.Energy.Minimum
//   energy_absorption_max     ← stdItem.Shield.Absorption.Energy.Maximum
//   distortion_absorption_min ← stdItem.Shield.Absorption.Distortion.Minimum
//   distortion_absorption_max ← stdItem.Shield.Absorption.Distortion.Maximum
//   — Thermal/Biochemical/Stun: constantes 1 en todos los registros → descartadas
//
// DIMENSIONES  (stdItem.InventoryOccupancy — 66/66)
//   mass                      ← stdItem.Mass
//   width                     ← stdItem.InventoryOccupancy.Dimensions.Width
//   height                    ← stdItem.InventoryOccupancy.Dimensions.Height
//   length                    ← stdItem.InventoryOccupancy.Dimensions.Length
//   scu                       ← stdItem.InventoryOccupancy.Volume.SCU
//
// PRECIO
//   price                     ← NULL (ship-items.json no incluye pricing data)
//
// RESPALDO
//   raw_data                  ← stdItem completo (jsonb)
//
// Campos descartados:
//   Resistance.Thermal / Biochemical / Stun  → constantes 0
//   Absorption.Thermal / Biochemical / Stun  → constantes 1
//   Distortion.RecoveryRatio                 → constante 0
//   Emission.Ir / Em.Minimum / Em.Decay      → Ir constante 0
//   ResourceNetwork.States / Repair / Generation → internos del motor
//   DimensionOverrides                       → override display/UI interno
//   Temperature                              → InternalTemperatureGeneration = 0
//   Interactions                             → strings de UI del juego
//   stdItem.Tags                             → presentes en pocos registros
// =============================================================================

function transform(record) {
  const std  = record.stdItem;
  const mfr  = std.Manufacturer;
  const mfrId = (mfr && mfr.UUID && mfr.UUID !== NIL_UUID) ? mfr.UUID : null;

  const dd   = std.DescriptionData  || null;
  const sh   = std.Shield            || null;
  const rn   = std.ResourceNetwork   || null;
  const dist = std.Distortion        || null;
  const em   = std.Emission          || null;
  const dur  = std.Durability        || null;
  const inv  = std.InventoryOccupancy || null;
  const dims = inv ? (inv.Dimensions || null) : null;
  const vol  = inv ? (inv.Volume     || null) : null;

  const res  = sh ? (sh.Resistance || null) : null;
  const abs  = sh ? (sh.Absorption || null) : null;

  // Power: extraer Minimum y Maximum de forma independiente
  // Nunca copiar uno al otro — si uno falta, se deja NULL
  const pwrUsage = rn ? (rn.Usage?.Power || null) : null;

  // description: preferir DescriptionText (texto limpio sin header de metadatos)
  const description = cleanDesc(std.DescriptionText) || cleanDesc(std.Description);

  return {
    id:                          std.UUID,
    class_name:                  clean(std.ClassName),
    item_name:                   clean(record.itemName),
    name:                        clean(std.Name),
    description,
    manufacturer_id:             mfrId,
    size:                        num(std.Size),
    grade_number:                num(std.Grade),
    grade:                       dd   ? clean(dd['Grade']) : null,
    class:                       dd   ? clean(dd['Class']) : null,
    // Shield core
    pool_hp:                     sh   ? num(sh.MaxShieldHealth)   : null,
    max_shield_regen:            sh   ? num(sh.MaxShieldRegen)    : null,
    regen_time:                  sh   ? num(sh.RegenerationTime)  : null,
    damaged_regen_delay:         sh   ? num(sh.DamagedDelay)      : null,
    downed_regen_delay:          sh   ? num(sh.DownedDelay)       : null,
    // Consumo de energía — mínimo y máximo por separado
    power_consumption_min:       pwrUsage ? num(pwrUsage.Minimum)  : null,
    power_consumption_max:       pwrUsage ? num(pwrUsage.Maximum)  : null,
    // Distorsión
    distortion_shutdown_damage:  dist ? num(dist.Maximum)         : null,
    distortion_decay_delay:      dist ? num(dist.DecayDelay)      : null,
    distortion_decay_rate:       dist ? num(dist.DecayRate)       : null,
    distortion_warning_ratio:    dist ? num(dist.WarningRatio)    : null,
    distortion_shutdown_time:    dist ? num(dist.ShutdownTime)    : null,
    // Emisión y vida
    em_max:                      em   ? num(em.Em?.Maximum)       : null,
    health:                      dur  ? num(dur.Health)           : null,
    // Resistencias
    physical_resistance_min:     res?.Physical    ? num(res.Physical.Minimum)    : null,
    physical_resistance_max:     res?.Physical    ? num(res.Physical.Maximum)    : null,
    energy_resistance_min:       res?.Energy      ? num(res.Energy.Minimum)      : null,
    energy_resistance_max:       res?.Energy      ? num(res.Energy.Maximum)      : null,
    distortion_resistance_min:   res?.Distortion  ? num(res.Distortion.Minimum)  : null,
    distortion_resistance_max:   res?.Distortion  ? num(res.Distortion.Maximum)  : null,
    // Absorciones
    physical_absorption_min:     abs?.Physical    ? num(abs.Physical.Minimum)    : null,
    physical_absorption_max:     abs?.Physical    ? num(abs.Physical.Maximum)    : null,
    energy_absorption_min:       abs?.Energy      ? num(abs.Energy.Minimum)      : null,
    energy_absorption_max:       abs?.Energy      ? num(abs.Energy.Maximum)      : null,
    distortion_absorption_min:   abs?.Distortion  ? num(abs.Distortion.Minimum)  : null,
    distortion_absorption_max:   abs?.Distortion  ? num(abs.Distortion.Maximum)  : null,
    // Dimensiones
    mass:                        num(std.Mass),
    width:                       dims ? num(dims.Width)  : null,
    height:                      dims ? num(dims.Height) : null,
    length:                      dims ? num(dims.Length) : null,
    scu:                         vol  ? num(vol.SCU)     : null,
    // Precio
    price:                       null,
    // Respaldo
    raw_data:                    std,
  };
}

// =============================================================================
// GENERADOR — SEED (datos)
// =============================================================================

function buildSeedSQL(rows, stats) {
  const now   = new Date().toISOString().slice(0, 10);
  const lines = [];

  lines.push('-- =============================================================================');
  lines.push('-- shields_seed.sql');
  lines.push('-- Generado por: scripts/import-shields.js');
  lines.push(`-- Fecha:        ${now}`);
  lines.push(`-- Origen:       ship-items.json (${stats.total} registros totales, ${stats.ofType} de type Shield)`);
  lines.push(`-- Importados:   ${rows.length}  |  Excluidos: ${stats.ofType - rows.length}`);
  lines.push('-- =============================================================================');
  lines.push('--');
  lines.push('-- power_consumption_min ← stdItem.ResourceNetwork.Usage.Power.Minimum');
  lines.push('-- power_consumption_max ← stdItem.ResourceNetwork.Usage.Power.Maximum');
  lines.push('-- Ambos campos presentes en 66/66 canónicos. FR-76: min=1, max=4.');
  lines.push('-- 11/66 escudos tienen min=max (ej. Bamoty 3/3) — valores reales del JSON.');

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
  lines.push('insert into shields (');
  lines.push('  id, class_name, item_name, name, description,');
  lines.push('  manufacturer_id,');
  lines.push('  size, grade_number, grade, class,');
  lines.push('  pool_hp, max_shield_regen, regen_time, damaged_regen_delay, downed_regen_delay,');
  lines.push('  power_consumption_min, power_consumption_max,');
  lines.push('  distortion_shutdown_damage, distortion_decay_delay, distortion_decay_rate,');
  lines.push('  distortion_warning_ratio, distortion_shutdown_time,');
  lines.push('  em_max, health,');
  lines.push('  physical_resistance_min, physical_resistance_max,');
  lines.push('  energy_resistance_min, energy_resistance_max,');
  lines.push('  distortion_resistance_min, distortion_resistance_max,');
  lines.push('  physical_absorption_min, physical_absorption_max,');
  lines.push('  energy_absorption_min, energy_absorption_max,');
  lines.push('  distortion_absorption_min, distortion_absorption_max,');
  lines.push('  mass, width, height, length, scu,');
  lines.push('  price,');
  lines.push('  raw_data');
  lines.push(')');
  lines.push('values');

  for (let i = 0; i < rows.length; i++) {
    const r   = rows[i];
    const sep = i < rows.length - 1 ? ',' : '';
    lines.push(
      `  (${sqlLiteral(r.id)}, ${sqlLiteral(r.class_name)}, ${sqlLiteral(r.item_name)}, ${sqlLiteral(r.name)}, ${sqlLiteral(r.description)},` +
      `\n   ${sqlLiteral(r.manufacturer_id)},` +
      `\n   ${sqlLiteral(r.size)}, ${sqlLiteral(r.grade_number)}, ${sqlLiteral(r.grade)}, ${sqlLiteral(r.class)},` +
      `\n   ${sqlLiteral(r.pool_hp)}, ${sqlLiteral(r.max_shield_regen)}, ${sqlLiteral(r.regen_time)}, ${sqlLiteral(r.damaged_regen_delay)}, ${sqlLiteral(r.downed_regen_delay)},` +
      `\n   ${sqlLiteral(r.power_consumption_min)}, ${sqlLiteral(r.power_consumption_max)},` +
      `\n   ${sqlLiteral(r.distortion_shutdown_damage)}, ${sqlLiteral(r.distortion_decay_delay)}, ${sqlLiteral(r.distortion_decay_rate)},` +
      `\n   ${sqlLiteral(r.distortion_warning_ratio)}, ${sqlLiteral(r.distortion_shutdown_time)},` +
      `\n   ${sqlLiteral(r.em_max)}, ${sqlLiteral(r.health)},` +
      `\n   ${sqlLiteral(r.physical_resistance_min)}, ${sqlLiteral(r.physical_resistance_max)},` +
      `\n   ${sqlLiteral(r.energy_resistance_min)}, ${sqlLiteral(r.energy_resistance_max)},` +
      `\n   ${sqlLiteral(r.distortion_resistance_min)}, ${sqlLiteral(r.distortion_resistance_max)},` +
      `\n   ${sqlLiteral(r.physical_absorption_min)}, ${sqlLiteral(r.physical_absorption_max)},` +
      `\n   ${sqlLiteral(r.energy_absorption_min)}, ${sqlLiteral(r.energy_absorption_max)},` +
      `\n   ${sqlLiteral(r.distortion_absorption_min)}, ${sqlLiteral(r.distortion_absorption_max)},` +
      `\n   ${sqlLiteral(r.mass)}, ${sqlLiteral(r.width)}, ${sqlLiteral(r.height)}, ${sqlLiteral(r.length)}, ${sqlLiteral(r.scu)},` +
      `\n   ${sqlLiteral(r.price)},` +
      `\n   ${sqlLiteral(r.raw_data)})${sep}`
    );
  }

  lines.push('on conflict (id) do nothing;');
  lines.push('');
  lines.push(`-- ${rows.length} escudo(s) insertado(s).`);

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
  const ofType = data.filter(r => r.type === 'Shield');

  // Registrar motivos de exclusión
  const excluded = ofType
    .filter(r => !isCanonical(r))
    .map(r => {
      const reasons = [];
      const std = r.stdItem;
      const cn  = (r.className || '').toLowerCase();
      if (!std || !std.UUID || std.UUID === NIL_UUID)        reasons.push('nil/missing UUID');
      if (std && !(std.Name || '').trim())                   reasons.push('name vacío');
      if ((std?.Name || '').trim() === '<= PLACEHOLDER =>')  reasons.push('PLACEHOLDER');
      if (cn.startsWith('test_'))                            reasons.push('test_*');
      if (cn.endsWith('_template'))                          reasons.push('_Template');
      return { className: r.className, reasons };
    });

  const canonical = ofType.filter(isCanonical);
  const rows      = canonical.map(transform);
  const stats     = { total: data.length, ofType: ofType.length, excluded };

  // Distribución
  const sizeDist  = {};
  const classDist = {};
  const gradeDist = {};
  rows.forEach(r => {
    const sz = r.size  != null ? String(r.size) : 'NULL';
    const cl = r.class  || 'NULL';
    const gr = r.grade  || 'NULL';
    sizeDist[sz]  = (sizeDist[sz]  || 0) + 1;
    classDist[cl] = (classDist[cl] || 0) + 1;
    gradeDist[gr] = (gradeDist[gr] || 0) + 1;
  });

  // Coverage
  const cv = fn => rows.filter(fn).length;
  const withPoolHp   = cv(r => r.pool_hp             != null);
  const withPwrMin   = cv(r => r.power_consumption_min != null);
  const withPwrMax   = cv(r => r.power_consumption_max != null);
  const withPwrDiff  = rows.filter(r =>
    r.power_consumption_min != null &&
    r.power_consumption_max != null &&
    r.power_consumption_min !== r.power_consumption_max
  ).length;
  const withDist     = cv(r => r.distortion_shutdown_damage != null);
  const withGrade    = cv(r => r.grade              != null);
  const withClass    = cv(r => r.class              != null);
  const withResPhys  = cv(r => r.physical_resistance_max   != null);
  const withAbsPhys  = cv(r => r.physical_absorption_max   != null);

  console.log(SEP);
  console.log('import-shields.js');
  console.log(SEP);
  console.log(`Registros totales en fuente:   ${stats.total}`);
  console.log(`Registros type=Shield:         ${stats.ofType}`);
  console.log(`Canónicos (pasan filtros):     ${rows.length}`);
  console.log(`Excluidos:                     ${stats.ofType - rows.length}`);

  if (excluded.length > 0) {
    console.log('');
    console.log('Detalle de exclusiones:');
    excluded.forEach(e => console.log(`  ${e.className}  →  ${e.reasons.join(', ')}`));
  }

  console.log('');
  console.log('Cobertura de campos clave:');
  console.log(`  pool_hp               ${withPoolHp}/${rows.length}`);
  console.log(`  power_consumption_min ${withPwrMin}/${rows.length}`);
  console.log(`  power_consumption_max ${withPwrMax}/${rows.length}`);
  console.log(`    → min < max (range)   ${withPwrDiff}/${rows.length}`);
  console.log(`    → min = max (flat)    ${rows.length - withPwrDiff}/${rows.length}`);
  console.log(`  distortion_*          ${withDist}/${rows.length}`);
  console.log(`  grade (letra)         ${withGrade}/${rows.length}`);
  console.log(`  class                 ${withClass}/${rows.length}`);
  console.log(`  resistencias          ${withResPhys}/${rows.length}`);
  console.log(`  absorciones           ${withAbsPhys}/${rows.length}`);

  console.log('');
  console.log('Distribución size:');
  Object.entries(sizeDist).sort(([a],[b]) => Number(a)-Number(b))
    .forEach(([k,n]) => console.log(`  size=${k.padEnd(4)} ${n}`));

  console.log('');
  console.log('Distribución class:');
  Object.entries(classDist).sort(([,a],[,b]) => b-a)
    .forEach(([k,n]) => console.log(`  ${k.padEnd(14)} ${n}`));

  console.log('');
  console.log('Distribución grade:');
  Object.entries(gradeDist).sort(([,a],[,b]) => b-a)
    .forEach(([k,n]) => console.log(`  ${k.padEnd(10)} ${n}`));

  if (ARGS.dryRun) {
    console.log('');
    console.log('[--dry-run] No se escribió ningún archivo.');
    console.log(SEP);
    return;
  }

  writeFile(SEED, buildSeedSQL(rows, stats));
  console.log('');
  console.log(`Seed escrito en:       ${SEED}`);
  console.log(SEP);
}

main();
