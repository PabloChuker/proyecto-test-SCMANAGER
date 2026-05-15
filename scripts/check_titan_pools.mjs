import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

const TITAN_ID = '0079c5d5-1678-4f8c-85ba-18ca8f642af6';

const pools = await sql`SELECT item_type, max_size, min_size, game_version FROM ship_pools WHERE ship_id::text = ${TITAN_ID} ORDER BY game_version, item_type`;
console.log('=== ship_pools (ambas GVs) ===');
for (const p of pools) console.log(`  ${p.item_type.padEnd(22)} max=${p.max_size}  min=${p.min_size}  gv=${p.game_version}`);

const refs = await sql`
  SELECT game_version, power_used_grouped_scm, cooling_used_grouped_scm,
         em_segment_groups_scm
  FROM ship_power_reference WHERE ship_id::text = ${TITAN_ID}
  ORDER BY game_version
`;
console.log('\n=== ship_power_reference grouped ===');
for (const r of refs) {
  console.log(`\n  gv=${r.game_version}`);
  console.log(`    power_used_grouped_scm:    ${JSON.stringify(r.power_used_grouped_scm)}`);
  console.log(`    cooling_used_grouped_scm:  ${JSON.stringify(r.cooling_used_grouped_scm)}`);
  console.log(`    em_segment_groups_scm:     ${JSON.stringify(r.em_segment_groups_scm)?.slice(0, 200)}`);
}

await sql.end({ timeout: 3 });
