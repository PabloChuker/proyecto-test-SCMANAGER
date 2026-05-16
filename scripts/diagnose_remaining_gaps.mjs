import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });
const NEW = '4.8.0-live.11825000';
const OLD = '4.7.2';

console.log('=== ship_pools: distribución por item_type ===');
const dist = await sql`
  SELECT game_version, item_type,
         COUNT(*)::int AS n_rows,
         COUNT(*) FILTER (WHERE max_size > 0)::int AS positive,
         AVG(max_size)::numeric(10,2) AS avg_max
  FROM ship_pools
  WHERE game_version IN (${NEW}, ${OLD})
  GROUP BY game_version, item_type
  ORDER BY game_version DESC, item_type
`;
for (const r of dist) {
  console.log(`  gv=${r.game_version.padEnd(22)} item=${r.item_type.padEnd(22)} rows=${r.n_rows} positive=${r.positive} avg=${r.avg_max}`);
}

console.log('\n=== ship_pools Titan ===');
const titan = await sql`SELECT game_version, item_type, max_size FROM ship_pools WHERE ship_id::text = '0079c5d5-1678-4f8c-85ba-18ca8f642af6' ORDER BY game_version DESC, item_type`;
for (const t of titan) console.log(`  gv=${t.game_version}  ${t.item_type.padEnd(22)} max=${t.max_size}`);

console.log('\n=== ship_hardpoints parent_hp_id (children) ===');
const [hp48] = await sql.unsafe(`
  SELECT COUNT(*)::int AS n, COUNT(parent_hp_id)::int AS kids
  FROM ship_hardpoints WHERE game_version = $1
`, [NEW]);
const [hp47] = await sql.unsafe(`
  SELECT COUNT(*)::int AS n, COUNT(parent_hp_id)::int AS kids
  FROM ship_hardpoints WHERE game_version = $1
`, [OLD]);
console.log(`  4.8.0: total=${hp48.n}  with parent_hp_id=${hp48.kids}`);
console.log(`  4.7.2: total=${hp47.n}  with parent_hp_id=${hp47.kids}`);

console.log('\n=== Hardpoint constraints / PK ===');
const constraints = await sql`
  SELECT conname, contype, pg_get_constraintdef(oid) AS def
  FROM pg_constraint
  WHERE conrelid = 'ship_hardpoints'::regclass
`;
for (const c of constraints) console.log(`  ${c.contype} ${c.conname}: ${c.def}`);

console.log('\n=== Sample child rows 4.7.2 ===');
const samples = await sql`
  SELECT hardpoint_name, ship_reference, hardpoint_type, parent_hp_id
  FROM ship_hardpoints
  WHERE game_version = ${OLD} AND parent_hp_id IS NOT NULL
    AND ship_reference = 'DRAK_Cutlass_Black'
  LIMIT 10
`;
for (const s of samples) console.log(`  ${s.ship_reference}  ${s.hardpoint_name.padEnd(50)} type=${s.hardpoint_type}  parent=${s.parent_hp_id?.slice(0,8)}...`);

console.log('\n=== ¿Esas filas children ya existen en 4.8.0? ===');
const [cnt] = await sql.unsafe(`
  SELECT COUNT(*)::int AS n
  FROM ship_hardpoints src
  WHERE src.game_version = $1 AND src.parent_hp_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM ship_hardpoints dst
      WHERE dst.game_version = $2
        AND dst.ship_reference = src.ship_reference
        AND dst.hardpoint_name = src.hardpoint_name
    )
`, [OLD, NEW]);
console.log(`  Children del 4.7.2 que NO existen en 4.8.0: ${cnt.n}`);

const [cnt2] = await sql.unsafe(`
  SELECT COUNT(*)::int AS n
  FROM ship_hardpoints src
  WHERE src.game_version = $1 AND src.parent_hp_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM ship_hardpoints dst
      WHERE dst.game_version = $2
        AND dst.ship_reference = src.ship_reference
        AND dst.hardpoint_name = src.hardpoint_name
    )
`, [OLD, NEW]);
console.log(`  Children del 4.7.2 que SÍ existen en 4.8.0 (sin parent_hp_id): ${cnt2.n}`);

await sql.end({ timeout: 3 });
