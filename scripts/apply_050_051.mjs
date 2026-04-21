// Aplicar migraciones 050 y 051 a Supabase prod.
// Uso: node scripts/apply_050_051.mjs
import postgres from 'postgres';
import fs from 'node:fs';
import path from 'node:path';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[ERR] DATABASE_URL no seteada');
  process.exit(1);
}

const sql = postgres(DATABASE_URL, {
  ssl: 'require',
  prepare: false, // Supabase pooler
  max: 1,
  idle_timeout: 20,
  connect_timeout: 30,
});

async function tableExists(name) {
  const r = await sql`
    SELECT to_regclass(${'public.' + name}) AS oid
  `;
  return r[0].oid !== null;
}

async function countRows(name) {
  try {
    const r = await sql.unsafe(`SELECT COUNT(*)::int AS c FROM ${name}`);
    return r[0].c;
  } catch {
    return null;
  }
}

async function applyFile(file) {
  const full = path.join('database/migrations', file);
  const sqlText = fs.readFileSync(full, 'utf8');
  console.log(`\n[run] ${file} (${sqlText.length.toLocaleString()} bytes)`);
  // postgres.js admite multi-statement con sql.unsafe
  await sql.unsafe(sqlText);
  console.log(`[ok] ${file} aplicada`);
}

async function main() {
  console.log('=== SC Labs — Aplicar 050 + 051 ===');
  console.log('host:', DATABASE_URL.split('@')[1]?.split('/')[0]);

  // Estado previo
  console.log('\n--- Estado previo ---');
  for (const t of [
    'mining_materials',
    'mining_material_signatures',
    'mining_locations',
    'mining_location_yields',
    'mining_material_signature_variants',
  ]) {
    const exists = await tableExists(t);
    const c = exists ? await countRows(t) : null;
    console.log(`  ${t}: ${exists ? `exists, rows=${c}` : 'MISSING'}`);
  }

  // 050
  const yields050Exists = await tableExists('mining_location_yields');
  const yields050Count = yields050Exists ? await countRows('mining_location_yields') : 0;
  if (yields050Exists && yields050Count >= 360) {
    console.log('\n[skip] 050 ya parece aplicada (mining_location_yields tiene >=360 filas)');
  } else {
    await applyFile('050_create_mining_material_deposits.sql');
  }

  // 051
  const variantsExists = await tableExists('mining_material_signature_variants');
  if (variantsExists) {
    const vc = await countRows('mining_material_signature_variants');
    console.log(`\n[info] mining_material_signature_variants ya existe con ${vc} filas. Re-aplicando 051 (idempotente)…`);
  }
  await applyFile('051_mining_material_finder_enrich.sql');

  // Estado final
  console.log('\n--- Estado final ---');
  for (const t of [
    'mining_materials',
    'mining_material_signatures',
    'mining_locations',
    'mining_location_yields',
    'mining_material_signature_variants',
  ]) {
    const c = await countRows(t);
    console.log(`  ${t}: rows=${c}`);
  }

  // Sanity check: Gold debería tener 4 firmas
  const gold = await sql`
    SELECT radar_signature
    FROM mining_material_signature_variants
    WHERE material_name = 'Gold' AND method = 'Ship'
    ORDER BY sort_order ASC
  `;
  console.log(`\n[check] Gold ship firmas: [${gold.map(g => g.radar_signature).join(', ')}]`);

  // Muestra 5 yields
  const sample = await sql`
    SELECT location_name, method, material_name, chance_pct
    FROM mining_location_yields
    ORDER BY chance_pct DESC
    LIMIT 5
  `;
  console.log('\n[check] Top-5 yields por chance_pct:');
  for (const r of sample) {
    console.log(`  ${r.location_name} (${r.method}) → ${r.material_name}: ${r.chance_pct}%`);
  }

  await sql.end();
  console.log('\n✅ Listo.');
}

main().catch(async (e) => {
  console.error('[FAIL]', e.message);
  console.error(e);
  try { await sql.end(); } catch {}
  process.exit(1);
});
