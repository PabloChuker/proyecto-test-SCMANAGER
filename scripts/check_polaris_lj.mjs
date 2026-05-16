import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

console.log('=== Polaris Mount_Gimbal hardpoints AHORA ===');
const r = await sql`
  SELECT hardpoint_name, default_item_class,
    jsonb_array_length(COALESCE((loadout_json->'Loadout')::jsonb,'[]'::jsonb)) AS n_loadout,
    loadout_json->'Loadout'->0->'ClassName' AS first_child
  FROM ship_hardpoints
  WHERE ship_reference = 'RSI_Polaris' AND game_version = '4.8.0-live.11825000'
    AND default_item_class LIKE 'Mount_Gimbal%'
  ORDER BY hardpoint_name
`;
for (const row of r) {
  console.log(`  ${row.hardpoint_name.padEnd(40)} def=${row.default_item_class.padEnd(35)} kids=${row.n_loadout} first=${row.first_child || ''}`);
}

console.log('\n=== Mount_Gimbal_S6 sources en 4.7.2 (any ship) ===');
const s = await sql`
  SELECT ship_reference, default_item_class, hardpoint_name,
    jsonb_array_length(COALESCE((loadout_json->'Loadout')::jsonb,'[]'::jsonb)) AS kids,
    loadout_json->'Loadout'->0->'ClassName' AS first
  FROM ship_hardpoints
  WHERE game_version = '4.7.2'
    AND default_item_class LIKE 'Mount_Gimbal_S6%'
    AND jsonb_array_length(COALESCE((loadout_json->'Loadout')::jsonb,'[]'::jsonb)) > 0
  LIMIT 5
`;
for (const row of s) console.log(`  ${row.ship_reference}/${row.hardpoint_name} def=${row.default_item_class} kids=${row.kids} first=${row.first}`);

console.log('\n=== Mount_Gimbal_S6 sources en 4.8.0 (any ship that has Loadout) ===');
const s2 = await sql`
  SELECT ship_reference, default_item_class, hardpoint_name,
    jsonb_array_length(COALESCE((loadout_json->'Loadout')::jsonb,'[]'::jsonb)) AS kids,
    loadout_json->'Loadout'->0->'ClassName' AS first
  FROM ship_hardpoints
  WHERE game_version = '4.8.0-live.11825000'
    AND default_item_class LIKE 'Mount_Gimbal_S6%'
    AND jsonb_array_length(COALESCE((loadout_json->'Loadout')::jsonb,'[]'::jsonb)) > 0
  LIMIT 10
`;
for (const row of s2) console.log(`  ${row.ship_reference}/${row.hardpoint_name} def=${row.default_item_class} kids=${row.kids} first=${row.first}`);

await sql.end({ timeout: 3 });
