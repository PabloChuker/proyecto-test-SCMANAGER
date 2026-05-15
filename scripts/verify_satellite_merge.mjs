#!/usr/bin/env node
import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

const TITAN_ID = '0079c5d5-1678-4f8c-85ba-18ca8f642af6';
const CURR_GV = '4.8.0-live.11825000';

async function loadShipRowMerged(table) {
  const allRows = await sql.unsafe(
    `SELECT * FROM ${table} WHERE ship_id::text = $1 ORDER BY (game_version = $2) DESC, game_version DESC`,
    [TITAN_ID, CURR_GV],
  );
  if (allRows.length === 0) return null;
  if (allRows.length === 1) return allRows[0];
  const merged = { ...allRows[allRows.length - 1] };
  for (let i = allRows.length - 2; i >= 0; i--) {
    for (const k of Object.keys(allRows[i])) {
      if (allRows[i][k] != null && allRows[i][k] !== '') merged[k] = allRows[i][k];
    }
  }
  return merged;
}

console.log('Verifying merged data for AEGS_Avenger_Titan...\n');

for (const table of ['ship_flight_stats', 'ship_power_reference', 'ship_resistances']) {
  const merged = await loadShipRowMerged(table);
  const totalFields = merged ? Object.keys(merged).length : 0;
  const nonNull = merged ? Object.values(merged).filter(v => v != null && v !== '').length : 0;
  console.log(`\n=== ${table} ===`);
  console.log(`  Total fields: ${totalFields}, non-NULL después del merge: ${nonNull}`);
  // Mostrar algunos campos críticos
  if (merged) {
    const critical = {
      ship_flight_stats: ['pitch_boosted', 'yaw_boosted', 'roll_boosted', 'zero_to_scm', 'accel_forward'],
      ship_power_reference: ['power_generation_segments', 'em_shields', 'total_shield_hp', 'fuel_capacity_hydrogen', 'qt_range_km'],
      ship_resistances: ['armor_hp', 'dmg_mult_physical', 'dmg_mult_energy', 'cross_section_x', 'cross_section_y'],
    }[table] || [];
    for (const f of critical) {
      console.log(`    ${f.padEnd(35)} = ${merged[f] ?? 'NULL'} (gv=${merged.game_version})`);
    }
  }
}

// Ship pools
const poolsAll = await sql`SELECT item_type, max_size, game_version FROM ship_pools WHERE ship_id::text = ${TITAN_ID}`;
const byItem = new Map();
for (const r of poolsAll) {
  if (r.game_version === CURR_GV && Number(r.max_size) > 0) byItem.set(r.item_type, r);
}
for (const r of poolsAll) {
  if (byItem.has(r.item_type)) continue;
  if (Number(r.max_size) > 0) byItem.set(r.item_type, r);
}
for (const r of poolsAll) {
  if (byItem.has(r.item_type)) continue;
  byItem.set(r.item_type, r);
}
console.log('\n=== ship_pools merged ===');
for (const r of byItem.values()) {
  console.log(`  ${r.item_type.padEnd(20)} max_size=${r.max_size} (gv=${r.game_version})`);
}

await sql.end({ timeout: 3 });
