'use strict';

/**
 * import-missile-launchers.js
 * ===========================
 * Genera los dos archivos SQL del módulo MissileLaunchers a partir de ship-items.json.
 *
 * Archivos generados:
 *   db/migrations/018_create_missile_launchers.sql   — DDL de la tabla e índices
 *   db/seeds/missile_launchers_seed.sql              — INSERT de lanzadores canónicos
 *
 * Diseñado para re-ejecutarse tras cada actualización de ship-items.json.
 * Ambos archivos se sobreescriben en cada ejecución.
 *
 * Uso:
 *   node scripts/import-missile-launchers.js
 *   node scripts/import-missile-launchers.js --dry-run
 *   node scripts/import-missile-launchers.js --input=ruta/ship-items.json
 *   node scripts/import-missile-launchers.js --output=ruta/custom_seed.sql
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
const SEED   = ARGS.output ? path.resolve(ARGS.output) : path.join(ROOT, 'database', 'seeds',      'missile_launchers_seed.sql');
const MIG    =                                            path.join(ROOT, 'database', 'migrations', '018_create_missile_launchers.sql');

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

// =============================================================================
// CRITERIOS DE FILTRADO
//
//   Regla 1 — stdItem.UUID válido (no null, no nil UUID)
//     Los 129 registros MissileLauncher tienen UUID válido (0 nil UUIDs).
//
//   Regla 2 — name no vacío ni PLACEHOLDER
//     2 registros con Name = "<= PLACEHOLDER =>": MRCK_S02_TMBL_Storm_AA_Custom,
//     MRCK_S01_TMBL_Storm_AA_Custom.
//     2 registros con Name vacío: MRCK_S02_ORIG_100i_Dual_S02,
//     MRCK_S02_ORIG_125a_Quad_S02.
//
//   Regla 3 — className no empieza por "test_" (case-insensitive)
//     No hay registros test_* en el dataset actual. Defensa en profundidad.
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
//   id               ← stdItem.UUID  (= reference)
//   class_name       ← stdItem.ClassName
//   item_name        ← itemName  (slug lowercase)
//   name             ← stdItem.Name
//   description      ← stdItem.DescriptionText  (texto limpio)
//   size             ← stdItem.Size  (1–10)
//   grade            ← stdItem.Grade  (constante 1; incluido por convención de esquema)
//   mass             ← stdItem.Mass  (varía: 0, 1, 20, 100)
//   width            ← stdItem.Width
//   height           ← stdItem.Height
//   length           ← stdItem.Length
//   manufacturer_id  ← stdItem.Manufacturer.UUID  (0 nil UUIDs: todos válidos)
//   missile_count    ← stdItem.MissileRack.MissileCount  (1 o 2; ciclos de disparo)
//   missiles_label   ← stdItem.DescriptionData["Missiles"]  ("2xS2", "8xS3", etc.)
//                      Presente en 92/125 registros válidos.
//   durability_health← stdItem.Durability.Health  (200–35000; presente en 126/129)
//   ports            ← stdItem.Ports  (array jsonb de slots de misil; 1–32 puertos;
//                      presente en 123/129)
//
// Campos descartados:
//   subType / classification
//     → constantes "MissileRack" / "Ship.MissileLauncher.MissileRack"
//
//   stdItem.ResourceNetwork
//     → configuración de red de recursos del motor. Presente en 126/129 pero solo
//       contiene parámetros internos (IsNetworked, DefaultPriority, etc.). Sin valor
//       de juego directo.
//
//   stdItem.InventoryOccupancy / DimensionOverrides
//     → dimensiones de UI/inventario. Cálculo interno del motor.
//
//   stdItem.Durability.Salvageable / Repairable / Resistance
//     → constantes en todos los registros (Salvageable=1, Repairable=1,
//       Resistance todo Multiplier=1 / Threshold=0).
//
//   stdItem.Tags / RequiredTags
//     → etiquetado interno del juego. RequiredTags restringe uso a naves específicas
//       (44 valores distintos) — dato útil pero de relaciones, no de la torreta en sí.
//
//   stdItem.Interactions
//     → strings de UI del juego. Presente en solo 1/129 registros.
//
//   stdItem.DescriptionData["Item Type"] / ["Manufacturer"] / ["Size"]
//     → redundantes: Item Type derivable del type/subType, Manufacturer en
//       manufacturer_id, Size en size.
//
//   stdItem.Description
//     → puede contener header de metadatos. Usar DescriptionText (texto limpio).
// =============================================================================

function transform(record) {
  const std = record.stdItem;
  const mfr = std.Manufacturer;
  const mfrId = (mfr && mfr.UUID && mfr.UUID !== NIL_UUID) ? mfr.UUID : null;

  const mr   = std.MissileRack    || null;
  const dur  = std.Durability     || null;
  const dd   = std.DescriptionData || null;
  const ports = std.Ports && std.Ports.length > 0 ? std.Ports : null;

  return {
    id:                std.UUID,
    class_name:        clean(std.ClassName),
    item_name:         clean(record.itemName),
    name:              clean(std.Name),
    description:       cleanDesc(std.DescriptionText),
    size:              std.Size   != null ? std.Size   : null,
    grade:             std.Grade  != null ? std.Grade  : null,
    mass:              std.Mass   != null ? std.Mass   : null,
    width:             std.Width  != null ? std.Width  : null,
    height:            std.Height != null ? std.Height : null,
    length:            std.Length != null ? std.Length : null,
    manufacturer_id:   mfrId,
    missile_count:     mr  ? (mr.MissileCount  != null ? mr.MissileCount  : null) : null,
    missiles_label:    dd  ? clean(dd['Missiles'])                                 : null,
    durability_health: dur ? (dur.Health       != null ? dur.Health       : null) : null,
    ports,
  };
}

// =============================================================================
// GENERADOR — DDL (migración)
// =============================================================================

function buildMigrationSQL() {
  return [
    '-- =============================================================================',
    '-- Migración: 018_create_missile_launchers',
    '-- Módulo:    Naves y loadouts — Star Citizen',
    '-- Generado por: scripts/import-missile-launchers.js',
    '-- =============================================================================',
    '--',
    '-- DECISIONES DE DISEÑO',
    '--',
    '-- · id               UUID canónico del juego (stdItem.UUID = reference). PK natural.',
    '--                    Los 129 registros tienen UUID válido; 0 nil UUIDs.',
    '--',
    '-- · size             Rango 1–10. Determina el tamaño de misil que puede lanzar.',
    '--',
    '-- · grade            Constante (1) en el dataset actual. Se incluye por',
    '--                    consistencia con el esquema estándar de ítems.',
    '--',
    '-- · mass / width / height / length',
    '--                    Dimensiones físicas con variación real. mass: {0, 1, 20, 100}.',
    '--',
    '-- · manufacturer_id  UUID del fabricante. 0 nil UUIDs: todos los 125 registros',
    '--                    canónicos tienen fabricante válido. 15 fabricantes distintos.',
    '--                    Sin FK forzada.',
    '--',
    '-- · missile_count    stdItem.MissileRack.MissileCount. Valores: 1 o 2.',
    '--                    Representa el número de misiles disparados por ciclo de fuego.',
    '--                    Es el ÚNICO campo del sub-objeto MissileRack.',
    '--',
    '-- · missiles_label   stdItem.DescriptionData["Missiles"]. Etiqueta legible del',
    '--                    formato "2xS2", "8xS3", "4xS4", etc. (NxSM = N misiles',
    '--                    de tamaño M). Presente en 92/125 registros canónicos.',
    '--                    Complementa a ports para una vista rápida de capacidad.',
    '--',
    '-- · durability_health stdItem.Durability.Health. Rango: 200–35000 (7 valores',
    '--                    distintos). Presente en 126/129 registros.',
    '--',
    '-- · ports            stdItem.Ports. Array jsonb con los slots de misil del',
    '--                    lanzador. Presente en 123/129 registros. Conteo de ports',
    '--                    por lanzador: 1–32. Tamaños de port: 1–12.',
    '--                    Port.Types ∈ {Missile.Missile, Missile.Torpedo,',
    '--                    Missile.GroundVehicleMissile, AttachedPart}.',
    '--                    Índice GIN para consultas sobre tamaño y tipo de slot.',
    '--',
    '-- · Campos descartados:',
    '--     subType / classification           → constantes "MissileRack"',
    '--     stdItem.ResourceNetwork            → configuración interna del motor',
    '--     stdItem.InventoryOccupancy / DimensionOverrides → display/UI interno',
    '--     Durability.Salvageable / Repairable / Resistance → constantes',
    '--     Tags / RequiredTags                → etiquetado de compatibilidad por nave',
    '--     Interactions                       → presente en 1/129 registros',
    '--     DescriptionData["Item Type"] / ["Manufacturer"] / ["Size"] → redundantes',
    '--     stdItem.Description                → usa DescriptionText (texto limpio)',
    '--',
    '-- · Timestamps       No se añaden. Tabla de referencia estática del juego.',
    '-- =============================================================================',
    '',
    'create table if not exists missile_launchers (',
    '  id                uuid    primary key,',
    '  class_name        text    not null,',
    '  item_name         text,',
    '  name              text    not null,',
    '  description       text,',
    '  size              integer,',
    '  grade             integer,',
    '  mass              numeric,',
    '  width             numeric,',
    '  height            numeric,',
    '  length            numeric,',
    '  manufacturer_id   uuid,',
    '  missile_count     integer,',
    '  missiles_label    text,',
    '  durability_health numeric,',
    '  ports             jsonb',
    ');',
    '',
    '-- Búsquedas por class_name (cruce con loadouts y datos de naves).',
    'create index if not exists idx_missile_launchers_class_name',
    '  on missile_launchers (class_name);',
    '',
    '-- Filtrado por tamaño (determina qué tamaño de misil acepta).',
    'create index if not exists idx_missile_launchers_size',
    '  on missile_launchers (size);',
    '',
    '-- Filtrado por número de misiles por ciclo de fuego (1 o 2).',
    'create index if not exists idx_missile_launchers_missile_count',
    '  on missile_launchers (missile_count)',
    '  where missile_count is not null;',
    '',
    '-- Búsquedas por fabricante (parcial: solo filas con fabricante asignado).',
    'create index if not exists idx_missile_launchers_manufacturer_id',
    '  on missile_launchers (manufacturer_id)',
    '  where manufacturer_id is not null;',
    '',
    '-- Consultas sobre slots de misil (tipo, tamaño, EquippedItem).',
    'create index if not exists idx_missile_launchers_ports_gin',
    '  on missile_launchers using gin (ports)',
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
  lines.push('-- missile_launchers_seed.sql');
  lines.push('-- Generado por: scripts/import-missile-launchers.js');
  lines.push(`-- Fecha:        ${now}`);
  lines.push(`-- Origen:       ship-items.json (${stats.total} registros totales, ${stats.ofType} de type MissileLauncher)`);
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
  lines.push('insert into missile_launchers (');
  lines.push('  id, class_name, item_name, name, description,');
  lines.push('  size, grade, mass, width, height, length,');
  lines.push('  manufacturer_id, missile_count, missiles_label, durability_health,');
  lines.push('  ports');
  lines.push(')');
  lines.push('values');

  for (let i = 0; i < rows.length; i++) {
    const r   = rows[i];
    const sep = i < rows.length - 1 ? ',' : '';
    lines.push(
      `  (${sqlLiteral(r.id)}, ${sqlLiteral(r.class_name)}, ${sqlLiteral(r.item_name)}, ${sqlLiteral(r.name)}, ${sqlLiteral(r.description)},` +
      `\n   ${sqlLiteral(r.size)}, ${sqlLiteral(r.grade)}, ${sqlLiteral(r.mass)}, ${sqlLiteral(r.width)}, ${sqlLiteral(r.height)}, ${sqlLiteral(r.length)},` +
      `\n   ${sqlLiteral(r.manufacturer_id)}, ${sqlLiteral(r.missile_count)}, ${sqlLiteral(r.missiles_label)}, ${sqlLiteral(r.durability_health)},` +
      `\n   ${sqlLiteral(r.ports)})${sep}`
    );
  }

  lines.push('on conflict (id) do nothing;');
  lines.push('');
  lines.push(`-- ${rows.length} lanzador(es) de misiles insertado(s).`);

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
  const ofType = data.filter(r => r.type === 'MissileLauncher');

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

  // Distribución de missile_count
  const mcCounts = {};
  rows.forEach(r => {
    const mc = r.missile_count != null ? String(r.missile_count) : 'NULL';
    mcCounts[mc] = (mcCounts[mc] || 0) + 1;
  });

  // Distribución de size
  const szCounts = {};
  rows.forEach(r => {
    const s = r.size != null ? String(r.size) : 'NULL';
    szCounts[s] = (szCounts[s] || 0) + 1;
  });

  console.log(SEP);
  console.log('import-missile-launchers.js');
  console.log(SEP);
  console.log(`Registros totales en fuente:      ${stats.total}`);
  console.log(`Registros type=MissileLauncher:   ${stats.ofType}`);
  console.log(`Canónicos (pasan filtros):        ${rows.length}`);
  console.log(`Excluidos:                        ${stats.ofType - rows.length}`);

  if (excluded.length > 0) {
    console.warn('');
    console.warn('Detalle de exclusiones:');
    excluded.forEach(e => console.warn(`  ${e.className}  →  ${e.reasons.join(', ')}`));
  }

  console.log('');
  console.log('Distribución de missile_count:');
  Object.entries(mcCounts)
    .sort(([a], [b]) => Number(a) - Number(b))
    .forEach(([mc, n]) => console.log(`  missile_count=${mc.padEnd(4)} ${n}`));

  console.log('');
  console.log('Distribución de size:');
  Object.entries(szCounts)
    .sort(([a], [b]) => Number(a) - Number(b))
    .forEach(([s, n]) => console.log(`  size=${s.padEnd(3)} ${n}`));

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
