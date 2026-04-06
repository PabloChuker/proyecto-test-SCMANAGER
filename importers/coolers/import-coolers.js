'use strict';

/**
 * import-coolers.js
 * =================
 * Genera los dos archivos SQL del módulo Coolers a partir de ship-items.json.
 *
 * Archivos generados:
 *   db/migrations/005_create_coolers.sql   — DDL de la tabla e índices
 *   db/seeds/coolers_seed.sql              — INSERT de coolers canónicos
 *
 * Todas las columnas funcionales se extraen desde rutas profundas del JSON.
 * Mapeo validado con el ítem Blizzard (COOL_AEGS_S03_Blizzard_SCItem).
 *
 * NOTA SOBRE CONSUMO DE ENERGÍA:
 *   Se usan dos columnas separadas: power_consumption_min y power_consumption_max.
 *   Fuente: stdItem.ResourceNetwork.Usage.Power.Minimum / .Maximum
 *   Validado: Blizzard → min=2, max=5.
 *   15/73 coolers tienen min=max (valores reales del JSON, no artefacto de relleno).
 *   Este patrón debe aplicarse a todo componente con Usage.Power.Minimum + .Maximum.
 *
 * Uso:
 *   node scripts/import-coolers.js
 *   node scripts/import-coolers.js --dry-run
 *   node scripts/import-coolers.js --input=ruta/ship-items.json
 *   node scripts/import-coolers.js --output=ruta/custom_seed.sql
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
const SEED   = ARGS.output ? path.resolve(ARGS.output) : path.join(ROOT, 'database', 'seeds',      'coolers_seed.sql');
const MIG    =                                            path.join(ROOT, 'database', 'migrations', '005_create_coolers.sql');

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

// =============================================================================
// CRITERIOS DE FILTRADO
//
//   Regla 1 — stdItem.UUID válido (no null, no nil UUID)
//     Los 73 registros canónicos tienen UUID válido; 0 nil UUIDs propios.
//     (Los 3 con nil UUID en Manufacturer se incluyen con manufacturer_id=NULL)
//
//   Regla 2 — name no vacío ni PLACEHOLDER
//     7 registros tienen Name = "<= PLACEHOLDER =>":
//       - 5 _Template (COOL_Template, COOL_S01..S04_Template)
//       - 2 capital ships sin datos públicos:
//           COOL_RSI_S04_Bengal_SCItem
//           COOL_AEGS_S04_Javelin_SCItem
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
// MAPEO EXACTO DE RUTAS (validado con Blizzard / COOL_AEGS_S03_Blizzard_SCItem):
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
//                               NULL si nil UUID (3/73: Exotherm, Algid, Serac —
//                               coolers embebidos con "Unknown Manufacturer")
//
// CLASIFICACIÓN ERKUL
//   size                      ← stdItem.Size  (0–4)
//   grade_number              ← stdItem.Grade  (1–4)
//   grade                     ← stdItem.DescriptionData["Grade"]  (A/B/C/D/Bespoke)
//                               presente en 72/73 registros
//   class                     ← stdItem.DescriptionData["Class"]  (Military/Civilian/
//                               Industrial/Stealth/Competition)  presente en 72/73
//
// MÉTRICAS PRINCIPALES
//   cooling_generation        ← stdItem.ResourceNetwork.Generation.Coolant  (14–102 /s)
//                               VALIDADO: Blizzard → RN.Generation.Coolant = 60 ✓
//                               Presente en 73/73 registros canónicos.
//                               NOTA: NO usar stdItem.CoolingGeneration (no existe)
//                               NI item.cooling (nivel superior, no fiable)
//
// CONSUMO DE ENERGÍA  — DOS COLUMNAS SEPARADAS (73/73 con ambas)
//   power_consumption_min     ← stdItem.ResourceNetwork.Usage.Power.Minimum  (1–5 pips)
//   power_consumption_max     ← stdItem.ResourceNetwork.Usage.Power.Maximum  (1–6 pips)
//
//   Justificación del split:
//     El JSON trae Minimum y Maximum de forma independiente y con valores distintos
//     en la mayoría de registros. Modelo correcto: dos columnas.
//     Validado: Blizzard → min=2, max=5.
//     15/73 coolers tienen min=max (ej. Fridan: 1/1, FrostStarSL: 1/1).
//     Estos son valores reales del JSON — no artefacto. Se insertan tal cual.
//     NO se rellena uno con el otro cuando uno falta; se deja NULL (aunque en
//     la práctica ambos están presentes en los 73 registros canónicos).
//
//   em_max                    ← stdItem.Emission.Em.Maximum  (250–2970; 73/73)
//
//   ir_max                    ← stdItem.Emission.Ir  (2270–15000; 41 valores distintos)
//                               Campo variable — NO constante. Presente en 73/73.
//
//   health                    ← stdItem.Durability.Health  (73/73)
//
// DISTORSIÓN  (stdItem.Distortion — presente en 73/73)
//   distortion_shutdown_damage ← stdItem.Distortion.Maximum
//   distortion_decay_delay     ← stdItem.Distortion.DecayDelay  (1.5 / 3 / 4.5 / 6 s)
//   distortion_decay_rate      ← stdItem.Distortion.DecayRate
//   distortion_warning_ratio   ← stdItem.Distortion.WarningRatio  (constante 0.75;
//                                incluido porque Erkul lo muestra explícitamente)
//   distortion_shutdown_time   ← stdItem.Distortion.ShutdownTime  (16.5–21 s;
//                                4 valores distintos → no constante)
//
// DIMENSIONES  (stdItem.InventoryOccupancy — presente en 73/73)
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
//   subType                                   → constante "UNDEFINED" en todos
//   Distortion.RecoveryRatio                  → constante 0
//   Emission.Em.Minimum / Em.Decay            → sin variabilidad funcional
//   ResourceNetwork.States / Repair           → internos del motor
//   ResourceNetwork.Usage.Coolant.*           → mecánica interna de circulación
//   DimensionOverrides                        → override display/UI interno
//   Temperature                               → InternalTemperatureGeneration = 0
//   Interactions                              → strings de UI del juego
// =============================================================================

function transform(record) {
  const std  = record.stdItem;
  const mfr  = std.Manufacturer;
  const mfrId = (mfr && mfr.UUID && mfr.UUID !== NIL_UUID) ? mfr.UUID : null;

  const dd   = std.DescriptionData   || null;
  const rn   = std.ResourceNetwork   || null;
  const dist = std.Distortion        || null;
  const em   = std.Emission          || null;
  const dur  = std.Durability        || null;
  const inv  = std.InventoryOccupancy || null;
  const dims = inv ? (inv.Dimensions || null) : null;
  const vol  = inv ? (inv.Volume     || null) : null;

  // Power: extraer Minimum y Maximum de forma completamente independiente.
  // Nunca copiar uno al otro — si uno falta, se deja NULL.
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
    // Métrica principal — ruta profunda, validada con Blizzard
    cooling_generation:          rn   ? num(rn.Generation?.Coolant)   : null,
    // Consumo de energía — mínimo y máximo por separado
    power_consumption_min:       pwrUsage ? num(pwrUsage.Minimum)     : null,
    power_consumption_max:       pwrUsage ? num(pwrUsage.Maximum)     : null,
    // Emisión e IR
    em_max:                      em   ? num(em.Em?.Maximum)           : null,
    ir_max:                      em   ? num(em.Ir)                    : null,
    // Vida
    health:                      dur  ? num(dur.Health)               : null,
    // Distorsión
    distortion_shutdown_damage:  dist ? num(dist.Maximum)             : null,
    distortion_decay_delay:      dist ? num(dist.DecayDelay)          : null,
    distortion_decay_rate:       dist ? num(dist.DecayRate)           : null,
    distortion_warning_ratio:    dist ? num(dist.WarningRatio)        : null,
    distortion_shutdown_time:    dist ? num(dist.ShutdownTime)        : null,
    // Dimensiones
    mass:                        num(std.Mass),
    width:                       dims ? num(dims.Width)               : null,
    height:                      dims ? num(dims.Height)              : null,
    length:                      dims ? num(dims.Length)              : null,
    scu:                         vol  ? num(vol.SCU)                  : null,
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
  lines.push('-- coolers_seed.sql');
  lines.push('-- Generado por: scripts/import-coolers.js');
  lines.push(`-- Fecha:        ${now}`);
  lines.push(`-- Origen:       ship-items.json (${stats.total} registros totales, ${stats.ofType} de type Cooler)`);
  lines.push(`-- Importados:   ${rows.length}  |  Excluidos: ${stats.ofType - rows.length}`);
  lines.push('-- =============================================================================');
  lines.push('--');
  lines.push('-- power_consumption_min ← stdItem.ResourceNetwork.Usage.Power.Minimum');
  lines.push('-- power_consumption_max ← stdItem.ResourceNetwork.Usage.Power.Maximum');
  lines.push('-- Ambos campos presentes en 73/73 canónicos. Blizzard: min=2, max=5.');
  lines.push('-- 15/73 coolers tienen min=max (ej. Fridan 1/1) — valores reales del JSON.');

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
  lines.push('insert into coolers (');
  lines.push('  id, class_name, item_name, name, description,');
  lines.push('  manufacturer_id,');
  lines.push('  size, grade_number, grade, class,');
  lines.push('  cooling_generation,');
  lines.push('  power_consumption_min, power_consumption_max,');
  lines.push('  em_max, ir_max, health,');
  lines.push('  distortion_shutdown_damage, distortion_decay_delay, distortion_decay_rate,');
  lines.push('  distortion_warning_ratio, distortion_shutdown_time,');
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
      `\n   ${sqlLiteral(r.cooling_generation)},` +
      `\n   ${sqlLiteral(r.power_consumption_min)}, ${sqlLiteral(r.power_consumption_max)},` +
      `\n   ${sqlLiteral(r.em_max)}, ${sqlLiteral(r.ir_max)}, ${sqlLiteral(r.health)},` +
      `\n   ${sqlLiteral(r.distortion_shutdown_damage)}, ${sqlLiteral(r.distortion_decay_delay)}, ${sqlLiteral(r.distortion_decay_rate)},` +
      `\n   ${sqlLiteral(r.distortion_warning_ratio)}, ${sqlLiteral(r.distortion_shutdown_time)},` +
      `\n   ${sqlLiteral(r.mass)}, ${sqlLiteral(r.width)}, ${sqlLiteral(r.height)}, ${sqlLiteral(r.length)}, ${sqlLiteral(r.scu)},` +
      `\n   ${sqlLiteral(r.price)},` +
      `\n   ${sqlLiteral(r.raw_data)})${sep}`
    );
  }

  lines.push('on conflict (id) do nothing;');
  lines.push('');
  lines.push(`-- ${rows.length} cooler(s) insertado(s).`);

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
  const ofType = data.filter(r => r.type === 'Cooler');

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
  const withCool   = cv(r => r.cooling_generation   != null);
  const withPwrMin = cv(r => r.power_consumption_min != null);
  const withPwrMax = cv(r => r.power_consumption_max != null);
  const withPwrDiff = rows.filter(r =>
    r.power_consumption_min != null &&
    r.power_consumption_max != null &&
    r.power_consumption_min !== r.power_consumption_max
  ).length;
  const withEm     = cv(r => r.em_max               != null);
  const withIr     = cv(r => r.ir_max               != null);
  const withDist   = cv(r => r.distortion_shutdown_damage != null);
  const withGrade  = cv(r => r.grade                != null);
  const withClass  = cv(r => r.class                != null);

  console.log(SEP);
  console.log('import-coolers.js');
  console.log(SEP);
  console.log(`Registros totales en fuente:   ${stats.total}`);
  console.log(`Registros type=Cooler:         ${stats.ofType}`);
  console.log(`Canónicos (pasan filtros):     ${rows.length}`);
  console.log(`Excluidos:                     ${stats.ofType - rows.length}`);

  if (excluded.length > 0) {
    console.log('');
    console.log('Detalle de exclusiones:');
    excluded.forEach(e => console.log(`  ${e.className}  →  ${e.reasons.join(', ')}`));
  }

  console.log('');
  console.log('Cobertura de campos clave:');
  console.log(`  cooling_generation    ${withCool}/${rows.length}`);
  console.log(`  power_consumption_min ${withPwrMin}/${rows.length}`);
  console.log(`  power_consumption_max ${withPwrMax}/${rows.length}`);
  console.log(`    → min < max (range)   ${withPwrDiff}/${rows.length}`);
  console.log(`    → min = max (flat)    ${rows.length - withPwrDiff}/${rows.length}`);
  console.log(`  em_max                ${withEm}/${rows.length}`);
  console.log(`  ir_max                ${withIr}/${rows.length}`);
  console.log(`  distortion_*          ${withDist}/${rows.length}`);
  console.log(`  grade (letra)         ${withGrade}/${rows.length}`);
  console.log(`  class                 ${withClass}/${rows.length}`);

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
