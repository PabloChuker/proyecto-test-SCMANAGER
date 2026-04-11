'use strict';

/**
 * import-manufacturers.js
 * =======================
 * Genera los dos archivos SQL necesarios para desplegar la tabla manufacturers
 * en Supabase (o cualquier PostgreSQL) a partir de manufacturers.json.
 *
 * Archivos generados:
 *   db/migrations/001_create_manufacturers.sql  — DDL de la tabla e índices
 *   db/seeds/manufacturers_seed.sql             — INSERT de fabricantes canónicos
 *
 * Diseñado para ser re-ejecutado tras cada actualización de manufacturers.json.
 * Ambos archivos se sobreescriben en cada ejecución.
 *
 * Uso:
 *   node scripts/import-manufacturers.js             → genera ambos archivos
 *   node scripts/import-manufacturers.js --dry-run   → solo imprime estadísticas
 *
 * Requisitos:
 *   - Node.js >= 14 (solo usa módulos de stdlib: fs, path)
 *   - manufacturers.json en la raíz del proyecto
 */

const fs   = require('fs');
const path = require('path');

// =============================================================================
// RUTAS
// =============================================================================

const ROOT      = path.resolve(__dirname, '..', '..');
const SOURCE    = path.join(ROOT, 'manufacturers.json');
const MIGRATION = path.join(ROOT, 'database', 'migrations', '001_create_manufacturers.sql');
const SEED      = path.join(ROOT, 'database', 'seeds', 'manufacturers_seed.sql');

// =============================================================================
// CRITERIOS DE FILTRADO
//
// Un registro se considera canónico (entra en la tabla) solo si supera
// TODAS las reglas. Basta con fallar una para ser excluido.
//
//   Regla 1 — code !== null
//     El dataset contiene 923 registros "fantasma" con code=null generados
//     automáticamente cuando un ítem del juego referencia un fabricante que
//     no tiene código asignado. No son fabricantes canónicos.
//
//   Regla 2 — name no vacío
//     2 registros tienen código pero name="". Sin nombre no hay fabricante útil.
//     Códigos afectados: FTA, NYX_A.
//
//   Regla 3 — name !== "<= PLACEHOLDER =>"
//     9 registros tienen código asignado (OUTL, TRMI, UILO_A/B/C, etc.) pero
//     son entradas reservadas sin datos reales.
//
//   Regla 4 — name no empieza por "@item_"
//     Claves de localización sin resolver que filtraron incorrectamente.
//     Ejemplos: @item_NameUrsa_Black_White_Grey
//
//   Regla 5 — name no contiene la palabra "Livery"
//     Esquemas visuales de naves (RAFT Anchor Livery, Lynx Nebula Livery…).
//     No son fabricantes.
// =============================================================================

function isCanonical(record) {
  const { code, name } = record;

  if (code === null || code === undefined)   return false;  // regla 1
  if (!name || name.trim() === '')           return false;  // regla 2
  if (name.trim() === '<= PLACEHOLDER =>')   return false;  // regla 3
  if (name.startsWith('@item_'))             return false;  // regla 4
  if (/\bLivery\b/i.test(name))             return false;  // regla 5

  return true;
}

// =============================================================================
// LIMPIEZA DE VALORES
// =============================================================================

/**
 * Elimina trailing non-breaking spaces (\u00a0) y espacios normales.
 * Varios campos Description del JSON terminan con \u00a0 por artefacto
 * del CMS de origen.
 */
function clean(str) {
  if (str == null) return null;
  return str.replace(/[\u00a0\s]+$/g, '').trim();
}

/**
 * Convierte un valor JS a literal SQL seguro.
 * - null / undefined → NULL
 * - string           → 'valor' (comillas simples escapadas)
 */
function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  return "'" + String(value).replace(/'/g, "''") + "'";
}

// =============================================================================
// DETECCIÓN DE COLISIONES DE CODE
//
// code no tiene restricción UNIQUE en la tabla porque el dataset origen
// contiene colisiones que no pueden resolverse automáticamente.
// Esta función las detecta e informa, sin bloquear la importación.
// =============================================================================

function detectCollisions(rows) {
  const seen       = {};
  const collisions = [];

  for (const row of rows) {
    if (!row.code) continue;

    if (seen[row.code] === undefined) {
      seen[row.code] = row.name;
    } else if (seen[row.code] !== row.name) {
      const already = collisions.find(c => c.code === row.code);
      if (!already) {
        collisions.push({ code: row.code, first: seen[row.code], second: row.name });
      }
    }
  }

  return collisions;
}

// =============================================================================
// GENERADOR — DDL (migración)
//
// Produce el CREATE TABLE e índices.
// Este bloque define la estructura; no depende del contenido de manufacturers.json.
// Se regenera junto al seed para mantener ambos archivos siempre en sincronía.
// =============================================================================

function buildMigrationSQL() {
  return [
    '-- =============================================================================',
    '-- Migración: 001_create_manufacturers',
    '-- Módulo:    Naves y loadouts — Star Citizen',
    '-- Generado por: scripts/import-manufacturers.js',
    '-- =============================================================================',
    '--',
    '-- DECISIONES DE DISEÑO',
    '--',
    '-- · id          UUID canónico del juego (campo `reference` del JSON).',
    '--               Es el único identificador 100% único en los registros fuente.',
    '--',
    '-- · name        Nombre del fabricante. NOT NULL. Tipo text (convención Supabase/PG).',
    '--',
    '-- · code        Shortcode del juego (ej. "RSI", "DRAK"). NULLABLE.',
    '--               NO se aplica UNIQUE porque el dataset origen contiene colisiones',
    '--               conocidas (ej. "MIS" asignado a Mirai y a MISC).',
    '--               Se indexa parcialmente para rendimiento en búsquedas.',
    '--',
    '-- · description Texto narrativo. NULLABLE (~10% de fabricantes no tienen descripción).',
    '--',
    '-- · Timestamps  No se añaden: tabla de referencia estática del juego.',
    '--               Convención del proyecto: solo donde haya auditoría real.',
    '-- =============================================================================',
    '',
    'create table if not exists manufacturers (',
    '  id          uuid  primary key,',
    '  name        text  not null,',
    '  code        text,',
    '  description text',
    ');',
    '',
    '-- Índice parcial sobre code (solo filas con code asignado).',
    'create index if not exists idx_manufacturers_code',
    '  on manufacturers (code)',
    '  where code is not null;',
    '',
    '-- Índice sobre name para búsquedas y futuros joins desde ships.',
    'create index if not exists idx_manufacturers_name',
    '  on manufacturers (name);',
    '',
  ].join('\n');
}

// =============================================================================
// GENERADOR — SEED (datos)
//
// Produce un INSERT ... ON CONFLICT DO NOTHING idempotente.
// Seguro de re-ejecutar: filas ya existentes se omiten sin error.
// =============================================================================

function buildSeedSQL(rows, collisions, sourceTotal) {
  const now   = new Date().toISOString().slice(0, 10);
  const lines = [];

  lines.push('-- =============================================================================');
  lines.push('-- manufacturers_seed.sql');
  lines.push('-- Generado por: scripts/import-manufacturers.js');
  lines.push(`-- Fecha:        ${now}`);
  lines.push(`-- Origen:       manufacturers.json (${sourceTotal} registros totales)`);
  lines.push(`-- Importados:   ${rows.length}  |  Excluidos: ${sourceTotal - rows.length}`);
  lines.push('-- =============================================================================');

  if (collisions.length > 0) {
    lines.push('--');
    lines.push(`-- AVISO: ${collisions.length} colisión/es de code en el dataset origen.`);
    lines.push('-- code NO tiene UNIQUE constraint. Colisiones a resolver manualmente.');
    lines.push('--');
    for (const c of collisions) {
      lines.push(`--   code="${c.code}"  →  "${c.first}"  vs  "${c.second}"`);
    }
  }

  lines.push('');
  lines.push('-- Inserción idempotente: filas ya existentes se omiten sin error.');
  lines.push('insert into manufacturers (id, name, code, description)');
  lines.push('values');

  for (let i = 0; i < rows.length; i++) {
    const r   = rows[i];
    const sep = i < rows.length - 1 ? ',' : '';
    lines.push(
      `  (${sqlLiteral(r.id)}, ${sqlLiteral(r.name)}, ${sqlLiteral(r.code)}, ${sqlLiteral(r.description)})${sep}`
    );
  }

  lines.push('on conflict (id) do nothing;');
  lines.push('');
  lines.push(`-- ${rows.length} fabricantes.`);

  return lines.join('\n');
}

// =============================================================================
// UTILIDAD — escritura segura de archivo
// Crea el directorio si no existe antes de escribir.
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
  const dryRun = process.argv.includes('--dry-run');

  // — Leer fuente ——————————————————————————————————————————————————————————————
  if (!fs.existsSync(SOURCE)) {
    console.error(`ERROR: No se encontró ${SOURCE}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));

  // — Filtrar ——————————————————————————————————————————————————————————————————
  const canonical = data.filter(isCanonical);

  // — Transformar ——————————————————————————————————————————————————————————————
  const rows = canonical.map(r => ({
    id:          r.reference,
    name:        clean(r.name),
    code:        r.code !== null ? clean(String(r.code)) : null,  // numérico → string
    description: r.Description != null ? clean(r.Description) : null,
  }));

  // — Analizar colisiones ——————————————————————————————————————————————————————
  const collisions = detectCollisions(rows);

  // — Informe a consola ————————————————————————————————————————————————————————
  const SEP = '─'.repeat(60);
  console.log(SEP);
  console.log('import-manufacturers.js');
  console.log(SEP);
  console.log(`Registros en fuente:    ${data.length}`);
  console.log(`Registros canónicos:    ${rows.length}`);
  console.log(`Excluidos:              ${data.length - rows.length}`);
  console.log(`Colisiones de code:     ${collisions.length}`);

  if (collisions.length > 0) {
    console.warn('');
    console.warn('AVISO — Colisiones de code (no bloquean la importación):');
    for (const c of collisions) {
      console.warn(`  code="${c.code}":  "${c.first}"  vs  "${c.second}"`);
    }
  }

  if (dryRun) {
    console.log('');
    console.log('[--dry-run] No se escribió ningún archivo.');
    console.log(SEP);
    return;
  }

  // — Escribir archivos ————————————————————————————————————————————————————————
  writeFile(MIGRATION, buildMigrationSQL());
  console.log('');
  console.log(`Migración escrita en:  ${MIGRATION}`);

  writeFile(SEED, buildSeedSQL(rows, collisions, data.length));
  console.log(`Seed escrito en:       ${SEED}`);
  console.log(SEP);
}

main();
