import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

const NEW = '4.8.0-live.11825000';
const OLD = '4.7.2';

// Catalog tables que matchean por class_name y tienen game_version.
// Excluimos: paints (no afectado), flair_* (no afectado), turrets (heredan de weapon_guns)
const CATALOG = [
  'weapon_guns',
  'coolers',
  'radars',
  'power_plants',
  'shields',
  'quantum_drives',
  'missile_launchers',
  'missiles',
  'bombs',
  'jump_drives',
  'flight_controllers',
  'life_support_generators',
  'weapon_defensives',
  'weapon_mining',
  'weapon_salvage',
  'quantum_interdiction_generators',
  'emps',
  'transponders',
  'containers',
  'self_destruct_systems',
  'turrets',
];

const APPLY = process.argv.includes('--apply');

console.log(`\n${APPLY ? '🚀 APPLY' : '🔍 DRY RUN'} — backfill catalog ${NEW} ← ${OLD}\n`);

// Columnas a NO tocar (PK, metadata, match key)
const SKIP_COLS = new Set([
  'id', 'uuid', 'class_name', 'name', 'item_name', 'description',
  'game_version', 'raw_data', 'manufacturer_id',
  'mass', 'width', 'height', 'length', 'scu', // físicas no cambian
  'price', // pueden cambiar entre patches
]);

for (const table of CATALOG) {
  try {
    // Get all columns
    const cols = await sql.unsafe(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = $1 AND table_schema = 'public'
    `, [table]);
    const colNames = cols.map(c => c.column_name);

    // Detect match column — prefer class_name, fallback to uuid (radars)
    const matchCol = colNames.includes('class_name') ? 'class_name'
                    : colNames.includes('uuid') ? 'uuid'
                    : null;
    if (!matchCol) {
      console.log(`  ${table.padEnd(36)} SKIP — no class_name/uuid`);
      continue;
    }

    // Stat columns: all NOT in SKIP_COLS + NOT the matchCol
    const statCols = colNames.filter(c => !SKIP_COLS.has(c) && c !== matchCol && c !== 'game_version');
    if (statCols.length === 0) {
      console.log(`  ${table.padEnd(36)} SKIP — no stat cols`);
      continue;
    }

    // Build COALESCE SET clause
    const setClauses = statCols.map(c => `${c} = COALESCE(dst.${c}, src.${c})`).join(', ');

    // DRY: count rows que se verán afectadas
    if (!APPLY) {
      const [{ n }] = await sql.unsafe(`
        SELECT COUNT(*)::int AS n
        FROM ${table} dst
        JOIN ${table} src ON dst.${matchCol} = src.${matchCol}
        WHERE dst.game_version = $1 AND src.game_version = $2
      `, [NEW, OLD]);
      console.log(`  ${table.padEnd(36)} ${statCols.length} cols → ${n} match rows`);
    } else {
      const result = await sql.unsafe(`
        UPDATE ${table} AS dst
        SET ${setClauses}
        FROM ${table} AS src
        WHERE dst.${matchCol} = src.${matchCol}
          AND dst.game_version = $1
          AND src.game_version = $2
      `, [NEW, OLD]);
      console.log(`  ✓ ${table.padEnd(36)} (${statCols.length} cols) → ${result.count} rows`);
    }
  } catch (e) {
    console.log(`  ✗ ${table.padEnd(36)} ERROR: ${e.message?.slice(0, 80)}`);
  }
}

if (!APPLY) console.log(`\n⚠️  añadí --apply para ejecutar`);
else console.log(`\n✅ Backfill catalog completo`);

await sql.end({ timeout: 3 });
