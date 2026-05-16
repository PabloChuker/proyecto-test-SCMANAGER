import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

console.log('=== Polaris hardpoints en 4.8.0 con hardpoint_type=Turret ===');
const hps = await sql`
  SELECT hardpoint_name, hardpoint_type, default_item_class
  FROM ship_hardpoints
  WHERE ship_reference = 'RSI_Polaris' AND game_version = '4.8.0-live.11825000'
    AND hardpoint_type = 'Turret'
  ORDER BY hardpoint_name
`;
for (const r of hps) console.log(`  ${r.hardpoint_name.padEnd(50)} default=${r.default_item_class || 'NONE'}`);

console.log(`\nTotal turret hardpoints: ${hps.length}`);

console.log('\n=== Polaris hardpoints "weapon" en 4.8.0 (cualquier type) ===');
const wp = await sql`
  SELECT hardpoint_name, hardpoint_type, default_item_class
  FROM ship_hardpoints
  WHERE ship_reference = 'RSI_Polaris' AND game_version = '4.8.0-live.11825000'
    AND (hardpoint_name ILIKE '%weapon%' OR default_item_class ILIKE '%weapon%' OR default_item_class ILIKE '%gatling%' OR default_item_class ILIKE '%cannon%' OR default_item_class ILIKE '%laser%' OR default_item_class ILIKE '%mass%')
  ORDER BY hardpoint_name
  LIMIT 30
`;
for (const r of wp) console.log(`  type=${r.hardpoint_type?.padEnd(20)} name=${r.hardpoint_name.padEnd(50)} default=${r.default_item_class || 'NONE'}`);

console.log(`\n=== Distribución de hardpoint_types Polaris 4.8.0 ===`);
const types = await sql`
  SELECT hardpoint_type, COUNT(*)::int as n
  FROM ship_hardpoints
  WHERE ship_reference = 'RSI_Polaris' AND game_version = '4.8.0-live.11825000'
  GROUP BY hardpoint_type
  ORDER BY n DESC
`;
for (const r of types) console.log(`  ${(r.hardpoint_type||'NULL').padEnd(28)} ${r.n}`);

console.log(`\n=== Polaris hardpoints 4.7.2 con weapons ===`);
const wp472 = await sql`
  SELECT hardpoint_name, hardpoint_type, default_item_class
  FROM ship_hardpoints
  WHERE ship_reference = 'RSI_Polaris' AND game_version = '4.7.2'
    AND hardpoint_type = 'Turret'
    AND default_item_class IS NOT NULL
  ORDER BY hardpoint_name
  LIMIT 15
`;
for (const r of wp472) console.log(`  ${r.hardpoint_name.padEnd(50)} default=${r.default_item_class}`);

await sql.end({ timeout: 3 });
