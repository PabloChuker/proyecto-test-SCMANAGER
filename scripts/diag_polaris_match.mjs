import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

console.log('=== ¿Match exacto Polaris hardpoint_names entre 4.8.0 y 4.7.2? ===');
const r = await sql`
  SELECT
    new.hardpoint_name AS new_name,
    old.hardpoint_name AS old_name,
    jsonb_array_length(COALESCE((old.loadout_json->'Loadout')::jsonb, '[]'::jsonb)) AS old_kids
  FROM ship_hardpoints new
  LEFT JOIN ship_hardpoints old
    ON new.ship_reference = old.ship_reference
   AND new.hardpoint_name = old.hardpoint_name
   AND old.game_version = '4.7.2'
  WHERE new.ship_reference = 'RSI_Polaris'
    AND new.game_version = '4.8.0-live.11825000'
    AND new.default_item_class LIKE 'Mount_Gimbal%'
  LIMIT 10
`;
for (const row of r) {
  console.log(`  ${row.new_name.padEnd(40)} match=${row.old_name ? 'YES' : 'NO'.padEnd(3)} old_kids=${row.old_kids ?? '-'}`);
}

console.log('\n=== Polaris hardpoint_names en 4.7.2 (turret/weapon) ===');
const old = await sql`
  SELECT hardpoint_name, default_item_class,
    jsonb_array_length(COALESCE((loadout_json->'Loadout')::jsonb, '[]'::jsonb)) as kids
  FROM ship_hardpoints
  WHERE ship_reference = 'RSI_Polaris' AND game_version = '4.7.2'
    AND (hardpoint_name LIKE '%turret%' OR hardpoint_name LIKE '%weapon%' OR default_item_class LIKE 'Mount_Gimbal%')
  ORDER BY hardpoint_name
  LIMIT 20
`;
for (const r of old) console.log(`  ${r.hardpoint_name.padEnd(45)} def=${(r.default_item_class||'NONE').padEnd(35)} kids=${r.kids}`);

console.log('\n=== Polaris hardpoint_names en 4.8.0 con Mount_Gimbal ===');
const newH = await sql`
  SELECT hardpoint_name, default_item_class
  FROM ship_hardpoints
  WHERE ship_reference = 'RSI_Polaris' AND game_version = '4.8.0-live.11825000'
    AND default_item_class LIKE 'Mount_Gimbal%'
  ORDER BY hardpoint_name
  LIMIT 20
`;
for (const r of newH) console.log(`  ${r.hardpoint_name.padEnd(45)} def=${r.default_item_class}`);

await sql.end({ timeout: 3 });
