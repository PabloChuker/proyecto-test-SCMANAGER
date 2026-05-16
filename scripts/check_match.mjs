import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

console.log('=== ¿Cuántos ship_ids match entre 4.8.0 y 4.7.0? ===');
const [c1] = await sql`
  SELECT COUNT(*)::int AS n FROM ship_flight_stats a
  JOIN ship_flight_stats b ON a.ship_id = b.ship_id
  WHERE a.game_version='4.8.0-live.11825000' AND b.game_version='4.7.0-LIVE.11518367'
`;
console.log('  matches by ship_id:', c1.n);

// Quizá hay que joinear por class_name o ship_reference
console.log('\n=== Match por class_name (via ships) ===');
const [c2] = await sql`
  SELECT COUNT(*)::int AS n FROM ships sa
  JOIN ships sb ON sa.class_name = sb.class_name
  WHERE sa.game_version='4.8.0-live.11825000' AND sb.game_version='4.7.0-LIVE.11518367'
`;
console.log('  ships match by class_name:', c2.n);

const [c3] = await sql`
  SELECT COUNT(*)::int AS n
  FROM ship_flight_stats fa
  JOIN ships sa ON sa.id = fa.ship_id AND sa.game_version = fa.game_version
  JOIN ships sb ON sb.class_name = sa.class_name AND sb.game_version = '4.7.0-LIVE.11518367'
  JOIN ship_flight_stats fb ON fb.ship_id = sb.id AND fb.game_version = sb.game_version
  WHERE fa.game_version='4.8.0-live.11825000' AND fa.boost_mult_strafe IS NULL AND fb.boost_mult_strafe IS NOT NULL
`;
console.log('  potencial backfill via class_name match:', c3.n);

console.log('\n=== Titan ship_id en cada GV ===');
const titanRows = await sql`SELECT game_version, id::text FROM ships WHERE class_name='AEGS_Avenger_Titan' ORDER BY game_version DESC`;
for (const t of titanRows) console.log(`  gv=${t.game_version} id=${t.id}`);

console.log('\n=== Titan flight stats por GV (joining manual) ===');
const titans = await sql`
  SELECT s.game_version, s.id::text, f.boost_mult_forward, f.boost_mult_strafe, f.accel_forward_g, f.accel_strafe_g
  FROM ships s LEFT JOIN ship_flight_stats f ON f.ship_id = s.id AND f.game_version = s.game_version
  WHERE s.class_name='AEGS_Avenger_Titan' ORDER BY s.game_version DESC
`;
for (const t of titans) console.log(`  gv=${t.game_version}  boost_mult_fwd=${t.boost_mult_forward}  bstrafe=${t.boost_mult_strafe}  g_fwd=${t.accel_forward_g}  g_strafe=${t.accel_strafe_g}`);

await sql.end({ timeout: 3 });
