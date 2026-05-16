import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

console.log('=== Mount_Gimbal_S3 sources en 4.7.2 ===');
const s3 = await sql`
  SELECT ship_reference, hardpoint_name,
    jsonb_array_length(COALESCE((loadout_json->'Loadout')::jsonb,'[]'::jsonb)) AS kids,
    loadout_json->'Loadout'->0->'ClassName' AS first_child
  FROM ship_hardpoints
  WHERE game_version = '4.7.2'
    AND default_item_class = 'Mount_Gimbal_S3'
    AND jsonb_array_length(COALESCE((loadout_json->'Loadout')::jsonb,'[]'::jsonb)) > 0
  LIMIT 3
`;
for (const r of s3) console.log(`  ${r.ship_reference}/${r.hardpoint_name} kids=${r.kids} first=${r.first_child}`);

console.log('\n=== Polaris Mount_Gimbal_S3 id en 4.8.0 ===');
const ids = await sql`
  SELECT id::text, hardpoint_name, default_item_class
  FROM ship_hardpoints
  WHERE ship_reference = 'RSI_Polaris' AND game_version = '4.8.0-live.11825000'
    AND default_item_class = 'Mount_Gimbal_S3'
  LIMIT 3
`;
for (const r of ids) console.log(`  id=${r.id} hp=${r.hardpoint_name}`);

if (ids[0] && s3[0]) {
  // Probar el UPDATE manualmente
  console.log('\n=== Test UPDATE manual ===');
  const testId = ids[0].id;
  const srcLJ = (await sql.unsafe(`SELECT loadout_json FROM ship_hardpoints WHERE ship_reference = $1 AND game_version = '4.7.2' AND default_item_class = 'Mount_Gimbal_S3' AND jsonb_array_length(COALESCE((loadout_json->'Loadout')::jsonb,'[]'::jsonb)) > 0 LIMIT 1`, [s3[0].ship_reference]))[0].loadout_json;
  const srcArr = Array.isArray(srcLJ) ? srcLJ : srcLJ?.Loadout;
  console.log('src Loadout type:', Array.isArray(srcArr) ? `array of ${srcArr.length}` : 'unknown');
  const newDst = { ClassName: 'Mount_Gimbal_S3', Loadout: srcArr };
  const r = await sql.unsafe(`UPDATE ship_hardpoints SET loadout_json = $1::jsonb WHERE id = $2::uuid AND game_version = '4.8.0-live.11825000'`, [JSON.stringify(newDst), testId]);
  console.log(`UPDATE returned count: ${r.count}`);
  const after = await sql`SELECT jsonb_array_length(COALESCE((loadout_json->'Loadout')::jsonb,'[]'::jsonb)) AS kids FROM ship_hardpoints WHERE id::text = ${testId} AND game_version = '4.8.0-live.11825000'`;
  console.log('after kids:', after[0]?.kids);
}

await sql.end({ timeout: 3 });
