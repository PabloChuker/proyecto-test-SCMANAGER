import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

console.log('=== Titan 4.7.0 fuente original ===');
const r470 = await sql`
  SELECT f.accel_forward_g, f.accel_backward_g, f.accel_up_g, f.accel_down_g, f.accel_strafe_g
  FROM ships s JOIN ship_flight_stats f ON f.ship_id=s.id AND f.game_version=s.game_version
  WHERE s.class_name='AEGS_Avenger_Titan' AND s.game_version='4.7.0-LIVE.11518367'
`;
for (const r of r470) console.log(`  g_fwd=${r.accel_forward_g} g_bwd=${r.accel_backward_g} g_up=${r.accel_up_g} g_down=${r.accel_down_g} g_strafe=${r.accel_strafe_g}`);

console.log('\n=== Titan 4.8.0 actual ===');
const r480 = await sql`
  SELECT accel_forward_g, accel_backward_g, accel_up_g, accel_down_g, accel_strafe_g
  FROM ship_flight_stats WHERE ship_id::text='0079c5d5-1678-4f8c-85ba-18ca8f642af6' AND game_version='4.8.0-live.11825000'
`;
for (const r of r480) console.log(`  g_fwd=${r.accel_forward_g} g_bwd=${r.accel_backward_g} g_up=${r.accel_up_g} g_down=${r.accel_down_g} g_strafe=${r.accel_strafe_g}`);

// Cuántas naves tienen ahora g_strafe vs NULL en 4.8.0
const [c] = await sql`
  SELECT COUNT(*)::int as total,
    COUNT(accel_strafe_g)::int as has_strafe_g,
    COUNT(*) FILTER (WHERE accel_strafe_g > 0.1)::int as positive,
    COUNT(boost_mult_strafe)::int as has_b_strafe
  FROM ship_flight_stats WHERE game_version='4.8.0-live.11825000'
`;
console.log(`\n=== 4.8.0 coverage AHORA ===`);
console.log(`  total=${c.total} accel_strafe_g=${c.has_strafe_g} (>0.1: ${c.positive}) boost_mult_strafe=${c.has_b_strafe}`);

await sql.end({ timeout: 3 });
