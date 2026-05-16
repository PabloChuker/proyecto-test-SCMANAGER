import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

console.log('═══ PASO 1: Inspeccionar TODAS las columnas jsonb por radar/scanner data ═══');

// Primero, listamos todas las tablas con columnas jsonb
const blobs = await sql`
  SELECT table_name, column_name FROM information_schema.columns
  WHERE table_schema='public' AND (data_type='jsonb' OR column_name='raw_data')
  ORDER BY table_name
`;

// Para radars específicamente: dump raw_data COMPLETO
console.log('\n══ radars.raw_data full content (RADR_GRNP_S01_Ecouter) ══');
const r = await sql`SELECT game_version, raw_data FROM radars WHERE class_name='RADR_GRNP_S01_Ecouter' ORDER BY game_version DESC`;
for (const row of r) {
  console.log(`\n--- gv=${row.game_version} ---`);
  console.log(JSON.stringify(row.raw_data, null, 2).slice(0, 2500));
}

console.log('\n══ buscar profundamente keys con "range" o "detect" en ANY jsonb ══');
// Walk recursivamente en busca de cualquier key con range/detect
function walkKeys(obj, path = '', results = []) {
  if (!obj || typeof obj !== 'object') return results;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => walkKeys(v, `${path}[${i}]`, results));
    return results;
  }
  for (const k of Object.keys(obj)) {
    const p = path ? `${path}.${k}` : k;
    if (/range|detect|scanner|lock|sensitiv|piercing|signal/i.test(k)) {
      results.push({ path: p, value: obj[k] });
    }
    if (typeof obj[k] === 'object') walkKeys(obj[k], p, results);
  }
  return results;
}

for (const row of r) {
  const found = walkKeys(row.raw_data);
  console.log(`\n--- gv=${row.game_version} matches (${found.length}) ---`);
  for (const f of found.slice(0, 30)) {
    const vs = typeof f.value === 'object' ? JSON.stringify(f.value).slice(0,80) : f.value;
    console.log(`  ${f.path}: ${vs}`);
  }
}

console.log('\n══ Tablas que podrían tener radar info ══');
const tables = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name ILIKE '%scan%' OR table_name ILIKE '%radar%' OR table_name ILIKE '%detect%' OR table_name ILIKE '%pings%' OR table_name ILIKE '%electronic%')`;
for (const t of tables) console.log(`  ${t.table_name}`);

console.log('\n══ ALL ports columns en missile_launchers (ya backfilled) ══');
const ml = await sql`SELECT class_name, ports FROM missile_launchers WHERE class_name='MRCK_S03_BEHR_Dual_S02' LIMIT 1`;
console.log(JSON.stringify(ml[0]?.ports, null, 2));

// Si hay tablas extras, dump sus columnas
console.log('\n══ Búsqueda transversal: cualquier columna con "range" en su nombre ══');
const cols = await sql`SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND (column_name ILIKE '%range%' OR column_name ILIKE '%detect%' OR column_name ILIKE '%scanner%' OR column_name ILIKE '%piercing%' OR column_name ILIKE '%sensit%')`;
for (const c of cols) console.log(`  ${c.table_name}.${c.column_name} (${c.data_type})`);

console.log('\n══ Búsqueda profunda en TODAS las raw_data de catálogo ══');
const catTables = ['weapon_guns', 'shields', 'power_plants', 'coolers', 'quantum_drives', 'flight_controllers'];
for (const t of catTables) {
  try {
    const sample = await sql.unsafe(`SELECT raw_data FROM ${t} LIMIT 1`);
    if (sample[0]?.raw_data) {
      const found = walkKeys(sample[0].raw_data);
      if (found.length > 0) console.log(`  ${t}: keys con range/detect:`, found.slice(0,3).map(f=>f.path).join(', '));
    }
  } catch {}
}

await sql.end({ timeout: 3 });
