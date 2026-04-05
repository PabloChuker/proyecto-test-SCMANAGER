'use strict';

/**
 * import-power_plants.js
 * ======================
 * Genera los dos archivos SQL del módulo PowerPlants a partir de ship-items.json.
 *
 * Archivos generados:
 *   db/migrations/020_create_power_plants.sql   — DDL de la tabla e índices
 *   db/seeds/power_plants_seed.sql              — INSERT de plantas canónicas
 *
 * Todas las columnas funcionales se extraen desde rutas profundas del JSON —
 * no desde atajos de nivel superior. Mapeo validado con el ítem JS-500.
 *
 * Uso:
 *   node scripts/import-power_plants.js
 *   node scripts/import-power_plants.js --dry-run
 *   node scripts/import-power_plants.js --input=ruta/ship-items.json
 *   node scripts/import-power_plants.js --output=ruta/custom_seed.sql
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
const SEED   = ARGS.output ? path.resolve(ARGS.output) : path.join(ROOT, 'database', 'seeds',      'power_plants_seed.sql');
const MIG    =                                            path.join(ROOT, 'database', 'migrations', '020_create_power_plants.sql');

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

// =============================================================================
// CRITERIOS DE FILTRADO
//
//   Regla 1 — stdItem.UUID válido (no null, no nil UUID)
//     Los 87 registros PowerPlant tienen UUID válido (0 nil UUIDs).
//
//   Regla 2 — name no vacío ni PLACEHOLDER
//     10 registros tienen Name = "<= PLACEHOLDER =>":
//       - 2 prefijo test_* (test_RN_powerplant_no_fuel, test_station_power_plant)
//       - 4 _Template (POWR_S01..S04_Template)
//       - 4 especiales (MASTER_PowerPlant, POWR_PyroOutpost, Power_Chemline_Generator,
//                       satellite_power_plant_test)
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
// MAPEO EXACTO DE RUTAS (validado con JS-500):
//
// IDENTIDAD
//   id                        ← stdItem.UUID
//   class_name                ← stdItem.ClassName  (= record.className)
//   item_name                 ← record.itemName
//   name                      ← stdItem.Name
//   description               ← stdItem.DescriptionText  (texto limpio)
//                               fallback: stdItem.Description si DescriptionText vacío
//
// FABRICANTE
//   manufacturer_id           ← stdItem.Manufacturer.UUID
//                               NULL si nil UUID (15/87 registros)
//
// CLASIFICACIÓN ERKUL
//   size                      ← stdItem.Size  (0–4)
//   grade_number              ← stdItem.Grade  (1–4)
//   grade                     ← stdItem.DescriptionData["Grade"]  (A/B/C/D/Bespoke)
//                               presente en 74/87 registros
//   class                     ← stdItem.DescriptionData["Class"]  (Military/Industrial/
//                               Competition/Stealth/Civilian)  presente en 74/87
//
// MÉTRICA PRINCIPAL
//   power_generation          ← stdItem.ResourceNetwork.Generation.Power  (10–10000)
//                               presente en 82/87; los 5 sin dato son todos PLACEHOLDER
//                               → en registros canónicos presente en 77/77
//
// EMISIÓN
//   em_max                    ← stdItem.Emission.Em.Maximum  (0–14400)
//                               presente en 82/87
//
// DURABILIDAD
//   health                    ← stdItem.Durability.Health  (1–420000)
//                               presente en 86/87
//
// DISTORSIÓN  (stdItem.Distortion — presente en 82/87)
//   distortion_shutdown_damage ← stdItem.Distortion.Maximum  (10–115000)
//   distortion_decay_delay     ← stdItem.Distortion.DecayDelay  (1.5–6 s)
//   distortion_decay_rate      ← stdItem.Distortion.DecayRate  (0.67–7666.67 /s)
//   distortion_warning_ratio   ← stdItem.Distortion.WarningRatio  (constante 0.75)
//   distortion_shutdown_time   ← stdItem.Distortion.ShutdownTime  (11.5–21 s)
//                               tiempo hasta apagado al llegar a Maximum
//
// DIMENSIONES  (stdItem.InventoryOccupancy — presente en 87/87)
//   mass                      ← stdItem.Mass  (0–540000)
//   width                     ← stdItem.InventoryOccupancy.Dimensions.Width
//   height                    ← stdItem.InventoryOccupancy.Dimensions.Height
//   length                    ← stdItem.InventoryOccupancy.Dimensions.Length
//   scu                       ← stdItem.InventoryOccupancy.Volume.SCU  (0–2.1)
//
// PRECIO
//   price                     ← NULL (ship-items.json no incluye pricing data)
//
// RESPALDO
//   raw_data                  ← stdItem completo (jsonb)
//
// Campos descartados:
//   subType / classification  → subType=Power (86) + 1 UNDEFINED; constante
//   stdItem.Temperature       → InternalTemperatureGeneration constante 0
//   stdItem.Interactions      → presentes en 86/87, strings de UI del juego
//   stdItem.DimensionOverrides → override de display; cálculo interno
//   stdItem.Emission.Ir       → constante 0 en todos los registros
//   stdItem.Emission.Em.Minimum / Em.Decay → mínimo constante, decay pequeño
//   stdItem.Distortion.RecoveryRatio        → constante 0
//   stdItem.Distortion.PowerRatioAtMaxDistortion → constante 0
//   stdItem.Distortion.PowerChangeOnlyAtMaxDistortion → constante 0
//   stdItem.ResourceNetwork.States          → datos de estado interno del motor
//   stdItem.ResourceNetwork.Repair          → mecánica interna de reparación
//   stdItem.Tags                            → presente solo en 5/87 registros
// =============================================================================

function transform(record) {
  const std  = record.stdItem;
  const mfr  = std.Manufacturer;
  const mfrId = (mfr && mfr.UUID && mfr.UUID !== NIL_UUID) ? mfr.UUID : null;

  const dd   = std.DescriptionData || null;
  const rn   = std.ResourceNetwork  || null;
  const em   = std.Emission         || null;
  const dur  = std.Durability       || null;
  const dist = std.Distortion       || null;
  const inv  = std.InventoryOccupancy || null;
  const dims = inv ? (inv.Dimensions || null) : null;
  const vol  = inv ? (inv.Volume     || null) : null;

  // description: preferir DescriptionText (texto limpio sin header de metadatos)
  const description = cleanDesc(std.DescriptionText) || cleanDesc(std.Description);

  return {
    id:                         std.UUID,
    class_name:                 clean(std.ClassName),
    item_name:                  clean(record.itemName),
    name:                       clean(std.Name),
    description,
    manufacturer_id:            mfrId,
    size:                       num(std.Size),
    grade_number:               num(std.Grade),
    grade:                      dd  ? clean(dd['Grade'])    : null,
    class:                      dd  ? clean(dd['Class'])    : null,
    power_generation:           rn  ? num(rn.Generation?.Power)       : null,
    em_max:                     em  ? num(em.Em?.Maximum)             : null,
    health:                     dur ? num(dur.Health)                  : null,
    distortion_shutdown_damage: dist ? num(dist.Maximum)              : null,
    distortion_decay_delay:     dist ? num(dist.DecayDelay)           : null,
    distortion_decay_rate:      dist ? num(dist.DecayRate)            : null,
    distortion_warning_ratio:   dist ? num(dist.WarningRatio)         : null,
    distortion_shutdown_time:   dist ? num(dist.ShutdownTime)         : null,
    mass:                       num(std.Mass),
    width:                      dims ? num(dims.Width)                : null,
    height:                     dims ? num(dims.Height)               : null,
    length:                     dims ? num(dims.Length)               : null,
    scu:                        vol  ? num(vol.SCU)                   : null,
    price:                      null,   // no disponible en ship-items.json
    raw_data:                   std,
  };
}

// =============================================================================
// GENERADOR — DDL (migración)
// =============================================================================

function buildMigrationSQL() {
  return [
    '-- =============================================================================',
    '-- Migración: 020_create_power_plants',
    '-- Módulo:    Naves y loadouts — Star Citizen',
    '-- Generado por: scripts/import-power_plants.js',
    '-- =============================================================================',
    '--',
    '-- DECISIONES DE DISEÑO',
    '--',
    '-- · id                   UUID canónico del juego (stdItem.UUID). PK natural.',
    '--                        Los 87 registros tienen UUID válido; 0 nil UUIDs.',
    '--',
    '-- · grade / class        De stdItem.DescriptionData["Grade"] / ["Class"].',
    '--                        Presentes en 74/87 registros. Nullable.',
    '--                        grade ∈ {A, B, C, D, Bespoke}',
    '--                        class ∈ {Military, Industrial, Competition, Stealth, Civilian}',
    '--',
    '-- · grade_number         stdItem.Grade (1–4). Campo numérico estándar del sistema.',
    '--',
    '-- · size                 stdItem.Size (0–4). El 0 son plants de infraestructura.',
    '--',
    '-- · manufacturer_id      stdItem.Manufacturer.UUID. 15/87 registros tienen nil UUID',
    '--                        → NULL. 9 fabricantes distintos. Sin FK forzada.',
    '--',
    '-- · power_generation     stdItem.ResourceNetwork.Generation.Power (10–10000).',
    '--                        Fuente validada con JS-500. Presente en 82/87;',
    '--                        los 5 sin dato son todos PLACEHOLDER y quedan excluidos.',
    '--                        En registros canónicos: 77/77 tienen este dato.',
    '--',
    '-- · em_max               stdItem.Emission.Em.Maximum (0–14400; 34 valores distintos).',
    '--                        Presente en 82/87 registros.',
    '--',
    '-- · health               stdItem.Durability.Health (1–420000; 56 valores distintos).',
    '--                        Presente en 86/87 registros.',
    '--',
    '-- · distortion_shutdown_damage  stdItem.Distortion.Maximum (10–115000).',
    '-- · distortion_decay_delay      stdItem.Distortion.DecayDelay (1.5–6 s).',
    '-- · distortion_decay_rate       stdItem.Distortion.DecayRate (0.67–7666.67 /s).',
    '-- · distortion_warning_ratio    stdItem.Distortion.WarningRatio (constante 0.75;',
    '--                               incluido porque Erkul lo muestra explícitamente).',
    '-- · distortion_shutdown_time    stdItem.Distortion.ShutdownTime (11.5–21 s).',
    '--                               Tiempo hasta apagado al alcanzar Maximum.',
    '--                               Todos los campos de distorsión: presentes en 82/87.',
    '--',
    '-- · mass                 stdItem.Mass (0–540000; 24 valores distintos).',
    '-- · width/height/length  stdItem.InventoryOccupancy.Dimensions.* (todos presentes).',
    '-- · scu                  stdItem.InventoryOccupancy.Volume.SCU (0–2.1).',
    '--',
    '-- · price                NULL. ship-items.json no incluye datos de precio.',
    '--                        Columna reservada para futura integración con fuente',
    '--                        de precios (API de mercado, uex.space, etc.).',
    '--',
    '-- · raw_data             stdItem completo como jsonb de respaldo.',
    '--                        No sustituye a las columnas funcionales.',
    '--',
    '-- · Campos descartados:',
    '--     subType / classification               → constante "Power"',
    '--     Temperature.InternalTemperatureGeneration → constante 0',
    '--     Interactions                           → strings de UI del juego (86/87)',
    '--     DimensionOverrides                     → override display/UI interno',
    '--     Emission.Ir / Em.Minimum / Em.Decay    → Ir constante 0, otros sin valor',
    '--     Distortion.RecoveryRatio / PowerRatioAtMaxDistortion → constantes 0',
    '--     ResourceNetwork.States / Repair        → datos internos del motor',
    '--     stdItem.Tags                           → presentes en solo 5/87',
    '--',
    '-- · Timestamps           No se añaden. Tabla de referencia estática del juego.',
    '-- =============================================================================',
    '',
    'create table if not exists power_plants (',
    '  -- Identidad',
    '  id                          uuid     primary key,',
    '  class_name                  text     not null,',
    '  item_name                   text,',
    '  name                        text     not null,',
    '  description                 text,',
    '  -- Fabricante',
    '  manufacturer_id             uuid,',
    '  -- Clasificación Erkul',
    '  size                        integer,',
    '  grade_number                integer,',
    '  grade                       text,',
    '  class                       text,',
    '  -- Métricas principales',
    '  power_generation            numeric,',
    '  em_max                      numeric,',
    '  health                      numeric,',
    '  -- Distorsión',
    '  distortion_shutdown_damage  numeric,',
    '  distortion_decay_delay      numeric,',
    '  distortion_decay_rate       numeric,',
    '  distortion_warning_ratio    numeric,',
    '  distortion_shutdown_time    numeric,',
    '  -- Dimensiones y masa',
    '  mass                        numeric,',
    '  width                       numeric,',
    '  height                      numeric,',
    '  length                      numeric,',
    '  scu                         numeric,',
    '  -- Precio (fuente externa pendiente)',
    '  price                       numeric,',
    '  -- Respaldo técnico',
    '  raw_data                    jsonb',
    ');',
    '',
    '-- Búsquedas por class_name (cruce con loadouts y naves).',
    'create index if not exists idx_power_plants_class_name',
    '  on power_plants (class_name);',
    '',
    '-- Filtrado por tamaño (criterio principal de compatibilidad).',
    'create index if not exists idx_power_plants_size',
    '  on power_plants (size);',
    '',
    '-- Filtrado por clase de planta (Military, Civilian, Stealth, etc.).',
    'create index if not exists idx_power_plants_class',
    '  on power_plants (class)',
    '  where class is not null;',
    '',
    '-- Filtrado por grado (A/B/C/D/Bespoke).',
    'create index if not exists idx_power_plants_grade',
    '  on power_plants (grade)',
    '  where grade is not null;',
    '',
    '-- Ordenar / filtrar por generación de energía (columna clave de Erkul).',
    'create index if not exists idx_power_plants_power_generation',
    '  on power_plants (power_generation)',
    '  where power_generation is not null;',
    '',
    '-- Búsquedas por fabricante.',
    'create index if not exists idx_power_plants_manufacturer_id',
    '  on power_plants (manufacturer_id)',
    '  where manufacturer_id is not null;',
    '',
    '-- Búsquedas en raw_data (jsonb) para campos no modelados.',
    'create index if not exists idx_power_plants_raw_data_gin',
    '  on power_plants using gin (raw_data)',
    '  where raw_data is not null;',
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
  lines.push('-- power_plants_seed.sql');
  lines.push('-- Generado por: scripts/import-power_plants.js');
  lines.push(`-- Fecha:        ${now}`);
  lines.push(`-- Origen:       ship-items.json (${stats.total} registros totales, ${stats.ofType} de type PowerPlant)`);
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
  lines.push('insert into power_plants (');
  lines.push('  id, class_name, item_name, name, description,');
  lines.push('  manufacturer_id,');
  lines.push('  size, grade_number, grade, class,');
  lines.push('  power_generation, em_max, health,');
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
      `\n   ${sqlLiteral(r.power_generation)}, ${sqlLiteral(r.em_max)}, ${sqlLiteral(r.health)},` +
      `\n   ${sqlLiteral(r.distortion_shutdown_damage)}, ${sqlLiteral(r.distortion_decay_delay)}, ${sqlLiteral(r.distortion_decay_rate)},` +
      `\n   ${sqlLiteral(r.distortion_warning_ratio)}, ${sqlLiteral(r.distortion_shutdown_time)},` +
      `\n   ${sqlLiteral(r.mass)}, ${sqlLiteral(r.width)}, ${sqlLiteral(r.height)}, ${sqlLiteral(r.length)}, ${sqlLiteral(r.scu)},` +
      `\n   ${sqlLiteral(r.price)},` +
      `\n   ${sqlLiteral(r.raw_data)})${sep}`
    );
  }

  lines.push('on conflict (id) do nothing;');
  lines.push('');
  lines.push(`-- ${rows.length} planta(s) de energía insertada(s).`);

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
  const ofType = data.filter(r => r.type === 'PowerPlant');

  // Registrar motivos de exclusión
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

  // Distribución de size / grade / class
  const sizeDist  = {};
  const classDist = {};
  const gradeDist = {};
  rows.forEach(r => {
    const sz = r.size   != null ? String(r.size)  : 'NULL';
    const cl = r.class  || 'NULL';
    const gr = r.grade  || 'NULL';
    sizeDist[sz]  = (sizeDist[sz]  || 0) + 1;
    classDist[cl] = (classDist[cl] || 0) + 1;
    gradeDist[gr] = (gradeDist[gr] || 0) + 1;
  });

  // Coverage stats
  const withPower = rows.filter(r => r.power_generation != null).length;
  const withEm    = rows.filter(r => r.em_max           != null).length;
  const withDist  = rows.filter(r => r.distortion_shutdown_damage != null).length;
  const withGrade = rows.filter(r => r.grade            != null).length;
  const withClass = rows.filter(r => r.class            != null).length;

  console.log(SEP);
  console.log('import-power_plants.js');
  console.log(SEP);
  console.log(`Registros totales en fuente:   ${stats.total}`);
  console.log(`Registros type=PowerPlant:     ${stats.ofType}`);
  console.log(`Canónicos (pasan filtros):     ${rows.length}`);
  console.log(`Excluidos:                     ${stats.ofType - rows.length}`);

  if (excluded.length > 0) {
    console.warn('');
    console.warn('Detalle de exclusiones:');
    excluded.forEach(e => console.warn(`  ${e.className}  →  ${e.reasons.join(', ')}`));
  }

  console.log('');
  console.log('Cobertura de campos clave:');
  console.log(`  power_generation      ${withPower}/${rows.length}`);
  console.log(`  em_max                ${withEm}/${rows.length}`);
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

  writeFile(MIG,  buildMigrationSQL());
  console.log('');
  console.log(`Migración escrita en:  ${MIG}`);

  writeFile(SEED, buildSeedSQL(rows, stats));
  console.log(`Seed escrito en:       ${SEED}`);
  console.log(SEP);
}

main();
