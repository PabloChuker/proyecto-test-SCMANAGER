import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

const NEW = '4.8.0-live.11825000';
const APPLY = process.argv.includes('--apply');

// Source priority: probamos primero 4.7.0 (donde sabemos que están), después 4.7.2
const SRC_PRIORITY = ['4.7.0-LIVE.11518367', '4.7.2'];

const FLIGHT_COLS = [
  'scm_speed', 'max_speed', 'boost_speed_forward', 'boost_speed_backward',
  'pitch', 'yaw', 'roll', 'pitch_boosted', 'yaw_boosted', 'roll_boosted',
  'accel_forward', 'accel_backward', 'accel_up', 'accel_down', 'accel_strafe',
  'accel_forward_g', 'accel_backward_g', 'accel_up_g', 'accel_down_g', 'accel_strafe_g',
  'boost_mult_forward', 'boost_mult_backward', 'boost_mult_up', 'boost_mult_strafe',
  'boost_capacitor_max', 'boost_regen_per_sec', 'boost_regen_time',
  'zero_to_scm', 'zero_to_max', 'scm_to_zero',
  'mass_empty', 'mass_loadout', 'mass_total',
];

console.log(`\n${APPLY ? '🚀 APPLY' : '🔍 DRY RUN'} ship_flight_stats backfill priority chain\n`);

for (const SRC of SRC_PRIORITY) {
  console.log(`\n──── Source: ${SRC} ────`);
  // Para cada columna, cuántas filas se updatearían
  for (const col of FLIGHT_COLS) {
    const [{ n }] = await sql.unsafe(`
      SELECT COUNT(*)::int AS n
      FROM ship_flight_stats dst
      JOIN ship_flight_stats src ON dst.ship_id = src.ship_id
      WHERE dst.game_version = $1 AND src.game_version = $2
        AND dst.${col} IS NULL AND src.${col} IS NOT NULL
    `, [NEW, SRC]);
    if (n > 0) console.log(`  ${col.padEnd(28)} → ${n} a backfillear`);
  }

  if (APPLY) {
    const setClauses = FLIGHT_COLS.map(c => `${c} = COALESCE(dst.${c}, src.${c})`).join(', ');
    const result = await sql.unsafe(`
      UPDATE ship_flight_stats AS dst
      SET ${setClauses}
      FROM ship_flight_stats AS src
      WHERE dst.ship_id = src.ship_id
        AND dst.game_version = $1
        AND src.game_version = $2
    `, [NEW, SRC]);
    console.log(`  ✓ APPLIED: ${result.count} rows touched`);
  }
}

if (!APPLY) {
  console.log(`\n⚠️ añadí --apply`);
} else {
  console.log(`\n══ Coverage AHORA en 4.8.0 ══`);
  const [c] = await sql.unsafe(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(accel_forward)::int AS afwd,
      COUNT(accel_strafe)::int AS astrafe,
      COUNT(accel_forward_g)::int AS gfwd,
      COUNT(accel_strafe_g)::int AS gstrafe,
      COUNT(boost_mult_strafe)::int AS bstrafe,
      COUNT(boost_mult_forward)::int AS bfwd,
      COUNT(boost_mult_up)::int AS bup,
      COUNT(mass_total)::int AS mass
    FROM ship_flight_stats WHERE game_version = $1
  `, [NEW]);
  console.log(`  total=${c.total} accel_fwd=${c.afwd} accel_strafe=${c.astrafe} g_fwd=${c.gfwd} g_strafe=${c.gstrafe} boost_mult_fwd=${c.bfwd} bup=${c.bup} bstrafe=${c.bstrafe} mass=${c.mass}`);

  // Titan después
  const [t] = await sql`
    SELECT accel_forward_g, accel_strafe_g, boost_mult_forward, boost_mult_strafe, mass_total
    FROM ship_flight_stats WHERE ship_id::text='0079c5d5-1678-4f8c-85ba-18ca8f642af6' AND game_version=${NEW}
  `;
  console.log(`  Titan: g_fwd=${t.accel_forward_g} g_strafe=${t.accel_strafe_g} boost_mult_fwd=${t.boost_mult_forward} bstrafe=${t.boost_mult_strafe} mass=${t.mass_total}`);
}

await sql.end({ timeout: 3 });
