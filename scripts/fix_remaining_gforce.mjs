import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });
const NEW = '4.8.0-live.11825000';
const SRC = '4.7.0-LIVE.11518367';

console.log('=== Naves con g_bwd <0.01 en 4.8.0 (probables basura)===');
const [c1] = await sql`
  SELECT COUNT(*)::int AS n FROM ship_flight_stats
  WHERE game_version=${NEW} AND accel_backward_g IS NOT NULL AND ABS(accel_backward_g) < 0.01
`;
console.log(`  n=${c1.n}`);

console.log('\n=== Coverage final ALL G-force/strafe fields ===');
const [c] = await sql`
  SELECT
    COUNT(*) FILTER (WHERE accel_forward_g > 0.01)::int as g_fwd,
    COUNT(*) FILTER (WHERE accel_backward_g > 0.01)::int as g_bwd,
    COUNT(*) FILTER (WHERE accel_up_g > 0.01)::int as g_up,
    COUNT(*) FILTER (WHERE accel_down_g > 0.01)::int as g_down,
    COUNT(*) FILTER (WHERE accel_strafe_g > 0.01)::int as g_strafe,
    COUNT(*) FILTER (WHERE accel_strafe > 1)::int as accel_strafe,
    COUNT(*) FILTER (WHERE boost_mult_strafe > 0.5)::int as bstrafe,
    COUNT(*)::int as total
  FROM ship_flight_stats WHERE game_version=${NEW}
`;
console.log(`  total=${c.total}  g_fwd>0.01=${c.g_fwd}  g_bwd>0.01=${c.g_bwd}  g_up>0.01=${c.g_up}  g_down>0.01=${c.g_down}  g_strafe>0.01=${c.g_strafe}  accel_strafe>1=${c.accel_strafe}  boost_mult_strafe>0.5=${c.bstrafe}`);

// Hacer un segundo pase con threshold MÁS bajo (0.01) para llenar las que quedaron
console.log('\n=== Segundo pase: threshold relajado (0.01) ===');
for (const col of ['accel_forward_g', 'accel_backward_g', 'accel_up_g', 'accel_down_g', 'accel_strafe_g']) {
  const r = await sql.unsafe(`
    UPDATE ship_flight_stats AS dst
    SET ${col} = src.${col}
    FROM ships sd, ships ss, ship_flight_stats src
    WHERE sd.id = dst.ship_id AND sd.game_version = dst.game_version
      AND ss.class_name = sd.class_name AND ss.game_version = $2
      AND src.ship_id = ss.id AND src.game_version = ss.game_version
      AND dst.game_version = $1
      AND (dst.${col} IS NULL OR ABS(dst.${col}) < 0.01)
      AND src.${col} IS NOT NULL AND ABS(src.${col}) >= 0.01
  `, [NEW, SRC]);
  console.log(`  ${col.padEnd(22)} ${r.count} rows`);
}

const [c2] = await sql`
  SELECT
    COUNT(*) FILTER (WHERE accel_forward_g > 0.01)::int as g_fwd,
    COUNT(*) FILTER (WHERE accel_backward_g > 0.01)::int as g_bwd,
    COUNT(*) FILTER (WHERE accel_up_g > 0.01)::int as g_up,
    COUNT(*) FILTER (WHERE accel_down_g > 0.01)::int as g_down,
    COUNT(*) FILTER (WHERE accel_strafe_g > 0.01)::int as g_strafe,
    COUNT(*)::int as total
  FROM ship_flight_stats WHERE game_version=${NEW}
`;
console.log(`\n=== Coverage POST segundo pase ===`);
console.log(`  g_fwd=${c2.g_fwd}/${c2.total} g_bwd=${c2.g_bwd} g_up=${c2.g_up} g_down=${c2.g_down} g_strafe=${c2.g_strafe}`);

// Titan post
const [t] = await sql`SELECT accel_forward_g, accel_backward_g, accel_up_g, accel_down_g, accel_strafe_g, boost_mult_strafe FROM ship_flight_stats WHERE ship_id::text='0079c5d5-1678-4f8c-85ba-18ca8f642af6' AND game_version=${NEW}`;
console.log(`\nTitan: g_fwd=${t.accel_forward_g} g_bwd=${t.accel_backward_g} g_up=${t.accel_up_g} g_down=${t.accel_down_g} g_strafe=${t.accel_strafe_g} bstrafe=${t.boost_mult_strafe}`);

await sql.end({ timeout: 3 });
