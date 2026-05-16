import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

console.log('=== Polaris 4.8.0 Mount_Gimbal_S4 hardpoints — loadout_json ===');
const r = await sql`
  SELECT hardpoint_name, default_item_class, loadout_json
  FROM ship_hardpoints
  WHERE ship_reference = 'RSI_Polaris' AND game_version = '4.8.0-live.11825000'
    AND default_item_class LIKE 'Mount_Gimbal%'
  LIMIT 3
`;
for (const row of r) {
  console.log(`\nhp=${row.hardpoint_name}  default=${row.default_item_class}`);
  console.log('loadout_json:', JSON.stringify(row.loadout_json, null, 2).slice(0, 800));
}

console.log('\n=== Avenger Titan 4.8.0 Mount_Gimbal_S4 (referencia funcional) ===');
const t = await sql`
  SELECT hardpoint_name, default_item_class, loadout_json
  FROM ship_hardpoints
  WHERE ship_reference = 'AEGS_Avenger_Titan' AND game_version = '4.8.0-live.11825000'
    AND default_item_class LIKE 'Mount_Gimbal%'
  LIMIT 1
`;
for (const row of t) {
  console.log(`\nhp=${row.hardpoint_name}  default=${row.default_item_class}`);
  console.log('loadout_json:', JSON.stringify(row.loadout_json, null, 2).slice(0, 800));
}

console.log('\n=== ¿Existe RSI_Polaris en ship_hardpoints en 4.7.2? ===');
const c = await sql`SELECT COUNT(*)::int AS n FROM ship_hardpoints WHERE ship_reference = 'RSI_Polaris' AND game_version = '4.7.2'`;
console.log('  count:', c[0].n);

const c2 = await sql`SELECT COUNT(*)::int AS n FROM ship_hardpoints WHERE ship_reference = 'RSI_Polaris' AND game_version = '4.7.0-LIVE.11518367'`;
console.log('  4.7.0 count:', c2[0].n);

await sql.end({ timeout: 3 });
