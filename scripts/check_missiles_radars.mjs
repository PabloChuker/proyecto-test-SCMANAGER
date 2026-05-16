import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

console.log('═══ MISSILES columns ═══');
const mcols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='missiles' AND table_schema='public' ORDER BY ordinal_position`;
console.log('  ', mcols.map(c => c.column_name).join(', '));

console.log('\n═══ Sample por name (missiles usa name, no class_name) ═══');
const igns = await sql`SELECT * FROM missiles WHERE name ILIKE '%FSKI%Ignite%' OR raw_data->>'className' = 'MISL_S02_IR_FSKI_Ignite' ORDER BY game_version DESC`;
for (const i of igns) {
  const nn = Object.entries(i).filter(([k,v]) => v != null && k !== 'raw_data' && k !== 'description');
  console.log(`\n  gv=${i.game_version}  populated cols=${nn.length}:`);
  for (const [k,v] of nn) console.log(`    ${k.padEnd(28)} = ${typeof v === 'string' ? v.slice(0,40) : v}`);
}

console.log('\n═══ MISSILE_LAUNCHERS columns ═══');
const lcols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='missile_launchers' AND table_schema='public' ORDER BY ordinal_position`;
console.log('  ', lcols.map(c => c.column_name).join(', '));

console.log('\n═══ Sample MRCK_S03_BEHR_Dual_S02 ═══');
const racks = await sql`SELECT * FROM missile_launchers WHERE class_name = 'MRCK_S03_BEHR_Dual_S02' ORDER BY game_version DESC`;
for (const r of racks) {
  const nn = Object.entries(r).filter(([k,v]) => v != null && k !== 'raw_data');
  console.log(`\n  gv=${r.game_version}  cols=${nn.length}:`);
  for (const [k,v] of nn) console.log(`    ${k.padEnd(20)} = ${typeof v === 'string' ? v.slice(0,40) : v}`);
}

console.log('\n═══ Missile_launchers cobertura por GV ═══');
const lc = await sql`SELECT game_version, COUNT(*)::int n, COUNT(*) FILTER (WHERE ports > 0)::int has_ports FROM missile_launchers GROUP BY game_version ORDER BY game_version DESC`;
for (const c of lc) console.log(`  gv=${c.game_version}  total=${c.n}  ports>0=${c.has_ports}`);

console.log('\n═══ RADARS columns ═══');
const rcols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='radars' AND table_schema='public' ORDER BY ordinal_position`;
console.log('  ', rcols.map(c => c.column_name).join(', '));

console.log('\n═══ RADARS cobertura por GV ═══');
for (const gv of ['4.8.0-live.11825000', '4.7.2', '4.7.0-LIVE.11518367']) {
  const [c] = await sql.unsafe(`
    SELECT COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE range_max_m > 0)::int as has_range_max,
      COUNT(*) FILTER (WHERE range_min_m > 0)::int as has_range_min,
      COUNT(*) FILTER (WHERE sensitivity > 0)::int as has_sens,
      COUNT(*) FILTER (WHERE piercing > 0)::int as has_pierce
    FROM radars WHERE game_version = $1
  `, [gv]);
  console.log(`  gv=${gv.padEnd(22)} total=${c.total} range_max=${c.has_range_max} range_min=${c.has_range_min} sens=${c.has_sens} pierce=${c.has_pierce}`);
}

console.log('\n═══ Sample RADR_GRNP_S01_Ecouter ═══');
const rads = await sql`
  SELECT game_version, range_max_m, range_min_m, sensitivity, piercing, power_consumption_min, em_max, ir_max, health
  FROM radars WHERE class_name = 'RADR_GRNP_S01_Ecouter' ORDER BY game_version DESC
`;
for (const r of rads) console.log(`  gv=${r.game_version}  range[${r.range_min_m}-${r.range_max_m}]  sens=${r.sensitivity}  pierce=${r.piercing}  pwr=${r.power_consumption_min}  em=${r.em_max}  ir=${r.ir_max}  hp=${r.health}`);

await sql.end({ timeout: 3 });
