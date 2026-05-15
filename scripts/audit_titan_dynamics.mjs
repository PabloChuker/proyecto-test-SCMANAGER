#!/usr/bin/env node
import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

const NEW_GV = '4.8.0-live.11825000';
const OLD_GV = '4.7.2';

function compareRow(title, r48, r472, fields) {
  console.log(`\n=== ${title} ===`);
  if (!r48 && !r472) { console.log('  NO ROW en ninguna GV'); return; }
  if (!r48) { console.log(`  ✗ NO ROW en 4.8.0  /  ✓ ROW en 4.7.2`); return; }
  if (!r472) { console.log(`  ROW en 4.8.0  /  NO ROW en 4.7.2`); }
  console.log(`  ${'FIELD'.padEnd(38)} ${'4.8.0'.padEnd(15)} ${'4.7.2'.padEnd(15)} STATUS`);
  console.log('  ' + '-'.repeat(80));
  let missing = 0;
  for (const f of fields) {
    const v48 = r48?.[f];
    const v472 = r472?.[f];
    const is48Missing = v48 == null || v48 === 0 || v48 === '';
    const has472 = v472 != null && v472 !== 0 && v472 !== '';
    const status = is48Missing && has472 ? '✗ falta' : is48Missing ? '·' : '✓';
    if (is48Missing && has472) missing++;
    console.log(`  ${f.padEnd(38)} ${String(v48 ?? 'NULL').padEnd(15)} ${String(v472 ?? 'NULL').padEnd(15)} ${status}`);
  }
  console.log(`  → ${missing} fields ausentes en 4.8.0 que existen en 4.7.2`);
}

// 1. ships row
const shipsCols = (await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_name='ships' ORDER BY ordinal_position
`).map(c => c.column_name);

const ships48 = (await sql`SELECT * FROM ships WHERE class_name='AEGS_Avenger_Titan' AND game_version=${NEW_GV}`)[0];
const ships472 = (await sql`SELECT * FROM ships WHERE class_name='AEGS_Avenger_Titan' AND game_version=${OLD_GV}`)[0];
const flightFields = shipsCols.filter(c =>
  /^(scm|nav|boost|accel|pitch|yaw|roll|mass|hp|cargo|crew|h2|qt|power|size|role|focus|hydrogen|quantum|shield|hull|afterburner|boosted)/i.test(c)
);
compareRow('ships (campos flight + datos básicos)', ships48, ships472, flightFields);

// 2. ship_flight_stats
const sfsCols = (await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_name='ship_flight_stats' ORDER BY ordinal_position
`).map(c => c.column_name);
console.log(`\nship_flight_stats columns: ${sfsCols.join(', ')}`);

const sfs48 = (await sql`SELECT * FROM ship_flight_stats WHERE ship_id=${ships48?.id} AND game_version=${NEW_GV} LIMIT 1`)[0];
const sfs472 = (await sql`SELECT * FROM ship_flight_stats WHERE ship_id=${ships472?.id} AND game_version=${OLD_GV} LIMIT 1`)[0];
compareRow('ship_flight_stats', sfs48, sfs472, sfsCols);

// 3. ship_power_reference
const sprCols = (await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_name='ship_power_reference' ORDER BY ordinal_position
`).map(c => c.column_name);
console.log(`\nship_power_reference columns: ${sprCols.join(', ')}`);

const spr48 = (await sql`SELECT * FROM ship_power_reference WHERE ship_id=${ships48?.id} AND game_version=${NEW_GV} LIMIT 1`)[0];
const spr472 = (await sql`SELECT * FROM ship_power_reference WHERE ship_id=${ships472?.id} AND game_version=${OLD_GV} LIMIT 1`)[0];
compareRow('ship_power_reference', spr48, spr472, sprCols);

// 4. ship_pools
const spCols = (await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_name='ship_pools' ORDER BY ordinal_position
`).map(c => c.column_name);

const sp48 = await sql`SELECT * FROM ship_pools WHERE ship_id=${ships48?.id} AND game_version=${NEW_GV}`;
const sp472 = await sql`SELECT * FROM ship_pools WHERE ship_id=${ships472?.id} AND game_version=${OLD_GV}`;
console.log(`\n=== ship_pools (count rows per ship) ===`);
console.log(`  Titan 4.8.0: ${sp48.length} pools  / Titan 4.7.2: ${sp472.length} pools`);
if (sp48.length > 0) {
  console.log('  Sample 4.8.0:');
  for (const p of sp48.slice(0, 5)) console.log('   ', JSON.stringify(p));
}
if (sp472.length > 0 && sp48.length === 0) {
  console.log('  Sample 4.7.2 (que falta en 4.8.0):');
  for (const p of sp472.slice(0, 5)) console.log('   ', JSON.stringify(p));
}

// 5. ship_resistances
const sr48 = (await sql`SELECT * FROM ship_resistances WHERE ship_id=${ships48?.id} AND game_version=${NEW_GV}`)[0];
const sr472 = (await sql`SELECT * FROM ship_resistances WHERE ship_id=${ships472?.id} AND game_version=${OLD_GV}`)[0];
const srCols = sr472 ? Object.keys(sr472) : [];
compareRow('ship_resistances', sr48, sr472, srCols);

await sql.end({ timeout: 3 });
