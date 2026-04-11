'use strict';

/**
 * import-turrets.js
 * =================
 * Genera los dos archivos SQL del módulo Turrets a partir de ship-items.json.
 *
 * Archivos generados:
 *   db/migrations/029_create_turrets.sql   — DDL de la tabla e índices
 *   db/seeds/turrets_seed.sql              — INSERT de torretas canónicas
 *
 * Diseñado para re-ejecutarse tras cada actualización de ship-items.json.
 * Ambos archivos se sobreescriben en cada ejecución.
 *
 * Uso:
 *   node scripts/import-turrets.js
 *   node scripts/import-turrets.js --dry-run
 *   node scripts/import-turrets.js --input=ruta/ship-items.json
 *   node scripts/import-turrets.js --output=ruta/custom_seed.sql
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
const SEED   = ARGS.output ? path.resolve(ARGS.output) : path.join(ROOT, 'database', 'seeds',      'turrets_seed.sql');
const MIG    =                                            path.join(ROOT, 'database', 'migrations', '029_create_turrets.sql');

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

// =============================================================================
// CRITERIOS DE FILTRADO
//
//   Regla 1 — stdItem.UUID válido (no null, no nil UUID)
//     Los 275 registros Turret tienen UUID válido (0 nil UUIDs).
//
//   Regla 2 — name no vacío ni PLACEHOLDER
//     4 registros con Name = "<= PLACEHOLDER =>" y 1 con Name vacío (mount_gimbal_salvage).
//
//   Regla 3 — className no empieza por "test_" (case-insensitive)
//     Defensa en profundidad. No hay registros test_* en el dataset actual.
// =============================================================================

function isCanonical(record) {
  const std = record.stdItem;

  if (!std)                                   return false;  // regla 1
  if (!std.UUID || std.UUID === NIL_UUID)     return false;  // regla 1

  const name = (std.Name || '').trim();
  if (!name || name === '<= PLACEHOLDER =>')  return false;  // regla 2

  if ((record.className || '').toLowerCase().startsWith('test_')) return false;  // regla 3

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
//   id                    ← stdItem.UUID  (= reference)
//   class_name            ← stdItem.ClassName
//   item_name             ← itemName  (slug lowercase)
//   name                  ← stdItem.Name
//   description           ← stdItem.DescriptionText  (texto limpio, sin header de metadatos)
//   sub_type              ← subType  (top-level); "UNDEFINED" → NULL
//   size                  ← stdItem.Size   (varía entre 1 y 12)
//   grade                 ← stdItem.Grade  (constante 1, incluido por consistencia de esquema)
//   mass                  ← stdItem.Mass   (varía 0–51392)
//   width                 ← stdItem.Width
//   height                ← stdItem.Height
//   length                ← stdItem.Length
//   manufacturer_id       ← stdItem.Manufacturer.UUID  (null si nil UUID)
//   durability_health     ← stdItem.Durability.Health  (HP en combate, varía 1–1.000.000)
//   durability_lifetime   ← stdItem.Durability.Lifetime  (opcional: 25, 720 o 2160)
//   ports                 ← stdItem.Ports  (array jsonb completo; 1–17 puertos por torreta)
//   movements             ← stdItem.Turret.MovementList  (array jsonb; config ejes yaw/pitch)
//
// Campos descartados:
//   type / classification      → "Turret" constante / derivable de sub_type
//   tags / required_tags       → etiquetado interno del juego, sin valor de consulta
//   RotationStyle              → constante "SingleAxis" en todos los 268 registros con Turret
//   Durability.Salvageable / Repairable → constantes (1) en todos los registros
//   Durability.Resistance      → umbrales siempre 0; multipliers 0/1 sin diferenciación útil
//   Interactions               → strings de UI del juego
//   DescriptionData            → redundante (Item Type, Manufacturer, Size ya en otros campos)
//   InventoryOccupancy / DimensionOverrides → cálculo interno del motor, display/UI
//   Distortion                 → presente en 20% de registros, parámetros del motor
//   ResourceNetwork            → extremadamente raro (2/275, 0.7%)
//   Seat                       → extremadamente raro (1/275, 0.4%)
//   stdItem.Description        → contiene header de metadatos; usar DescriptionText
// =============================================================================

function transform(record) {
  const std    = record.stdItem;
  const mfr    = std.Manufacturer;
  const mfrId  = (mfr && mfr.UUID && mfr.UUID !== NIL_UUID) ? mfr.UUID : null;
  const dur    = std.Durability || null;
  const turret = std.Turret     || null;

  const subTypeRaw = clean(record.subType);
  const sub_type   = (subTypeRaw && subTypeRaw.toUpperCase() !== 'UNDEFINED') ? subTypeRaw : null;

  const ports     = (std.Ports && std.Ports.length > 0)
                      ? std.Ports
                      : null;
  const movements = (turret && turret.MovementList && turret.MovementList.length > 0)
                      ? turret.MovementList
                      : null;

  return {
    id:                  std.UUID,
    class_name:          clean(std.ClassName),
    item_name:           clean(record.itemName),
    name:                clean(std.Name),
    description:         cleanDesc(std.DescriptionText),
    sub_type,
    size:                std.Size   != null ? std.Size   : null,
    grade:               std.Grade  != null ? std.Grade  : null,
    mass:                std.Mass   != null ? std.Mass   : null,
    width:               std.Width  != null ? std.Width  : null,
    height:              std.Height != null ? std.Height : null,
    length:              std.Length != null ? std.Length : null,
    manufacturer_id:     mfrId,
    durability_health:   dur ? (dur.Health   != null ? dur.Health   : null) : null,
    durability_lifetime: dur ? (dur.Lifetime != null ? dur.Lifetime : null) : null,
    ports,
    movements,
  };
}

// =============================================================================
// GENERADOR — DDL (migración)
// =============================================================================

function buildMigrationSQL() {
  return [
    '-- =============================================================================',
    '-- Migración: 029_create_turrets',
    '-- Módulo:    Naves y loadouts — Star Citizen',
    '-- Generado por: scripts/import-turrets.js',
    '-- =============================================================================',
    '--',
    '-- DECISIONES DE DISEÑO',
    '--',
    '-- · id                UUID canónico del juego (stdItem.UUID = reference). PK natural.',
    '--',
    '-- · class_name        ClassName del juego. Identifica la instancia de torreta',
    '--                     específica de la nave',
    '--                     (ej. AEGS_Redeemer_SCItem_Remote_Turret_Front).',
    '--',
    '-- · sub_type          Subtipo: GunTurret, MannedTurret, BallTurret, PDCTurret,',
    '--                     TopTurret, MissileTurret, Utility, NoseMounted, CanardTurret,',
    '--                     BottomTurret. 1 registro con subType="UNDEFINED" → NULL.',
    '--',
    '-- · size              Varía entre 1 y 12. Determina el arma máxima que puede montar.',
    '--',
    '-- · grade             Constante (1) en el dataset actual. Se incluye por consistencia',
    '--                     con el esquema estándar de ítems.',
    '--',
    '-- · mass / width / height / length',
    '--                     Dimensiones físicas con variación real entre registros.',
    '--                     mass varía de 0 a 51.392.',
    '--',
    '-- · durability_health    HP de la torreta en combate. Rango: 1–1.000.000.',
    '-- · durability_lifetime  Vida útil opcional (92/270 registros). Valores: 25, 720, 2160.',
    '--',
    '-- · ports             Array jsonb con los puertos de arma (1–17 por torreta).',
    '--                     Contiene: PortName, Size, MinSize, MaxSize, Uneditable,',
    '--                     EquippedItem (UUID del arma por defecto), Flags, Tags, Types.',
    '--                     Índice GIN para consultas sobre contenido del array.',
    '--',
    '-- · movements         Array jsonb con la configuración de ejes de rotación yaw/pitch',
    '--                     (stdItem.Turret.MovementList): velocidad, límites de ángulo,',
    '--                     aceleración, tiempo de rampa.',
    '--                     RotationStyle="SingleAxis" en todos los registros → omitido.',
    '--',
    '-- · manufacturer_id   UUID del fabricante. NULL para 16 registros con nil UUID.',
    '--                     Sin FK forzada.',
    '--',
    '-- · description       stdItem.DescriptionText (texto limpio, sin header de metadatos).',
    '--',
    '-- · Campos descartados:',
    '--     type / classification      → constante "Turret" / derivable de sub_type',
    '--     tags / required_tags       → etiquetado interno del juego',
    '--     RotationStyle              → constante "SingleAxis" en todos los registros',
    '--     Salvageable / Repairable   → constantes (1) en todos los registros',
    '--     Durability.Resistance      → umbrales siempre 0, sin valor diferenciador',
    '--     Interactions               → strings de UI del juego',
    '--     DescriptionData            → redundante con otros campos ya en la tabla',
    '--     InventoryOccupancy / DimensionOverrides → display/UI interno',
    '--     Distortion                 → 20% de registros, parámetros del motor',
    '--     ResourceNetwork            → extremadamente raro (0.7%)',
    '--     Seat                       → extremadamente raro (0.4%)',
    '--',
    '-- · Timestamps        No se añaden. Tabla de referencia estática del juego.',
    '-- =============================================================================',
    '',
    'create table if not exists turrets (',
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
    '  durability_health     numeric,',
    '  durability_lifetime   numeric,',
    '  ports                 jsonb,',
    '  movements             jsonb',
    ');',
    '',
    '-- Búsquedas por class_name (cruce con loadouts y otros datasets).',
    'create index if not exists idx_turrets_class_name',
    '  on turrets (class_name);',
    '',
    '-- Filtrado por subtipo (GunTurret, MannedTurret, PDCTurret, etc.).',
    'create index if not exists idx_turrets_sub_type',
    '  on turrets (sub_type)',
    '  where sub_type is not null;',
    '',
    '-- Filtrado por tamaño de torreta (determina qué armas acepta).',
    'create index if not exists idx_turrets_size',
    '  on turrets (size);',
    '',
    '-- Búsquedas por fabricante (parcial: solo filas con fabricante asignado).',
    'create index if not exists idx_turrets_manufacturer_id',
    '  on turrets (manufacturer_id)',
    '  where manufacturer_id is not null;',
    '',
    '-- Consultas sobre puertos de arma (tamaño de puerto, arma equipada por defecto, etc.).',
    'create index if not exists idx_turrets_ports_gin',
    '  on turrets using gin (ports)',
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
  lines.push('-- turrets_seed.sql');
  lines.push('-- Generado por: scripts/import-turrets.js');
  lines.push(`-- Fecha:        ${now}`);
  lines.push(`-- Origen:       ship-items.json (${stats.total} registros totales, ${stats.ofType} de type Turret)`);
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
  lines.push('insert into turrets (');
  lines.push('  id, class_name, item_name, name, description,');
  lines.push('  sub_type, size, grade, mass, width, height, length,');
  lines.push('  manufacturer_id, durability_health, durability_lifetime,');
  lines.push('  ports, movements');
  lines.push(')');
  lines.push('values');

  for (let i = 0; i < rows.length; i++) {
    const r   = rows[i];
    const sep = i < rows.length - 1 ? ',' : '';
    lines.push(
      `  (${sqlLiteral(r.id)}, ${sqlLiteral(r.class_name)}, ${sqlLiteral(r.item_name)}, ${sqlLiteral(r.name)}, ${sqlLiteral(r.description)},` +
      `\n   ${sqlLiteral(r.sub_type)}, ${sqlLiteral(r.size)}, ${sqlLiteral(r.grade)}, ${sqlLiteral(r.mass)}, ${sqlLiteral(r.width)}, ${sqlLiteral(r.height)}, ${sqlLiteral(r.length)},` +
      `\n   ${sqlLiteral(r.manufacturer_id)}, ${sqlLiteral(r.durability_health)}, ${sqlLiteral(r.durability_lifetime)},` +
      `\n   ${sqlLiteral(r.ports)}, ${sqlLiteral(r.movements)})${sep}`
    );
  }

  lines.push('on conflict (id) do nothing;');
  lines.push('');
  lines.push(`-- ${rows.length} torreta(s) insertada(s).`);

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
  const ofType = data.filter(r => r.type === 'Turret');

  // Registrar motivos de exclusión para el seed
  const excluded = ofType
    .filter(r => !isCanonical(r))
    .map(r => {
      const reasons = [];
      const std = r.stdItem;
      if (!std || !std.UUID || std.UUID === NIL_UUID)            reasons.push('nil/missing UUID');
      if (std && !(std.Name || '').trim())                       reasons.push('name vacío');
      if ((std?.Name || '').trim() === '<= PLACEHOLDER =>')      reasons.push('PLACEHOLDER');
      if ((r.className || '').toLowerCase().startsWith('test_')) reasons.push('test_*');
      return { className: r.className, reasons };
    });

  const canonical = ofType.filter(isCanonical);
  const rows      = canonical.map(transform);
  const stats     = { total: data.length, ofType: ofType.length, excluded };

  // Distribución de subtipos
  const subTypeCounts = {};
  rows.forEach(r => {
    const st = r.sub_type || 'NULL';
    subTypeCounts[st] = (subTypeCounts[st] || 0) + 1;
  });

  console.log(SEP);
  console.log('import-turrets.js');
  console.log(SEP);
  console.log(`Registros totales en fuente:    ${stats.total}`);
  console.log(`Registros type=Turret:          ${stats.ofType}`);
  console.log(`Canónicos (pasan filtros):      ${rows.length}`);
  console.log(`Excluidos:                      ${stats.ofType - rows.length}`);

  if (excluded.length > 0) {
    console.warn('');
    console.warn('Detalle de exclusiones:');
    excluded.forEach(e => console.warn(`  ${e.className}  →  ${e.reasons.join(', ')}`));
  }

  console.log('');
  console.log('Distribución de sub_type:');
  Object.entries(subTypeCounts)
    .sort(([, a], [, b]) => b - a)
    .forEach(([st, n]) => console.log(`  ${st.padEnd(20)} ${n}`));

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
