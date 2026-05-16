import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

const NEW = '4.8.0-live.11825000';
const SRC = '4.7.0-LIVE.11518367';
const APPLY = process.argv.includes('--apply');

// FIX clave: ship_ids son DISTINTOS entre 4.8.0 y 4.7.0 (Garnok regeneró UUIDs).
// Match via ships.class_name. Y reemplazamos valores BASURA (g_*<0.01 cuando deberían ser >1)
// además de NULLs.

const FLIGHT_COLS = {
  // simples (solo COALESCE si NULL): valores que pueden ser bajos legítimamente
  coalesce: [
    'pitch', 'yaw', 'roll', 'pitch_boosted', 'yaw_boosted', 'roll_boosted',
    'boost_speed_forward', 'boost_speed_backward',
    'zero_to_scm', 'zero_to_max', 'scm_to_zero',
    'mass_empty', 'mass_loadout', 'mass_total',
  ],
  // overwrite si dst es NULL o "basura" (<0.01 absoluto): g-force, accel y boost_mult
  // accel en m/s² puede ser bajo, pero g-force/boost_mult de naves reales son >1
  // El dumper 4.8.0 está generando 0.0003 que es CLARO basura
  overwriteIfTrash: {
    'accel_forward_g': 0.5,
    'accel_backward_g': 0.5,
    'accel_up_g': 0.5,
    'accel_down_g': 0.5,
    'accel_strafe_g': 0.5,
    'accel_forward': 1,        // accel m/s² >1 para naves combate
    'accel_backward': 1,
    'accel_up': 1,
    'accel_down': 1,
    'accel_strafe': 1,
    'boost_mult_forward': 0.5, // multiplicador de boost — siempre >1
    'boost_mult_backward': 0.5,
    'boost_mult_up': 0.5,
    'boost_mult_strafe': 0.5,
    'boost_capacitor_max': 1,
    'boost_regen_per_sec': 0.1,
    'boost_regen_time': 0.1,
  },
};

console.log(`\n${APPLY ? '🚀 APPLY' : '🔍 DRY RUN'} ship_flight_stats backfill via class_name\n  NEW=${NEW}\n  SRC=${SRC}\n`);

// Match: dst (4.8.0) JOIN src (4.7.0) via ships.class_name
const baseJoin = `
  FROM ship_flight_stats dst
  JOIN ships sd ON sd.id = dst.ship_id AND sd.game_version = dst.game_version
  JOIN ships ss ON ss.class_name = sd.class_name AND ss.game_version = $2
  JOIN ship_flight_stats src ON src.ship_id = ss.id AND src.game_version = ss.game_version
  WHERE dst.game_version = $1
`;

// Dry: por cada col, contar candidates
console.log('── COALESCE columns (only fill NULL) ──');
for (const col of FLIGHT_COLS.coalesce) {
  const [{ n }] = await sql.unsafe(`
    SELECT COUNT(*)::int AS n ${baseJoin}
      AND dst.${col} IS NULL AND src.${col} IS NOT NULL
  `, [NEW, SRC]);
  if (n > 0) console.log(`  ${col.padEnd(28)} ${n}`);
}

console.log('\n── OVERWRITE-IF-TRASH columns (replace NULL or |x|<threshold) ──');
for (const [col, thresh] of Object.entries(FLIGHT_COLS.overwriteIfTrash)) {
  const [{ n }] = await sql.unsafe(`
    SELECT COUNT(*)::int AS n ${baseJoin}
      AND (dst.${col} IS NULL OR ABS(dst.${col}) < $3)
      AND src.${col} IS NOT NULL AND ABS(src.${col}) >= $3
  `, [NEW, SRC, thresh]);
  if (n > 0) console.log(`  ${col.padEnd(28)} thresh=${thresh}  ${n}`);
}

if (!APPLY) {
  console.log('\n⚠️ añadí --apply'); await sql.end({ timeout: 3 }); process.exit(0);
}

console.log('\n🚀 APPLYING\n');
// COALESCE batch
{
  const sets = FLIGHT_COLS.coalesce.map(c => `${c} = COALESCE(dst.${c}, src.${c})`).join(', ');
  const result = await sql.unsafe(`
    UPDATE ship_flight_stats AS dst
    SET ${sets}
    FROM ships sd, ships ss, ship_flight_stats src
    WHERE sd.id = dst.ship_id AND sd.game_version = dst.game_version
      AND ss.class_name = sd.class_name AND ss.game_version = $2
      AND src.ship_id = ss.id AND src.game_version = ss.game_version
      AND dst.game_version = $1
  `, [NEW, SRC]);
  console.log(`  ✓ COALESCE: ${result.count} rows touched`);
}

// OVERWRITE-IF-TRASH batch — uno por col porque el threshold varía
let trashFixed = 0;
for (const [col, thresh] of Object.entries(FLIGHT_COLS.overwriteIfTrash)) {
  const result = await sql.unsafe(`
    UPDATE ship_flight_stats AS dst
    SET ${col} = src.${col}
    FROM ships sd, ships ss, ship_flight_stats src
    WHERE sd.id = dst.ship_id AND sd.game_version = dst.game_version
      AND ss.class_name = sd.class_name AND ss.game_version = $2
      AND src.ship_id = ss.id AND src.game_version = ss.game_version
      AND dst.game_version = $1
      AND (dst.${col} IS NULL OR ABS(dst.${col}) < $3)
      AND src.${col} IS NOT NULL AND ABS(src.${col}) >= $3
  `, [NEW, SRC, thresh]);
  if (result.count > 0) {
    console.log(`  ✓ ${col.padEnd(28)} ${result.count}`);
    trashFixed += result.count;
  }
}
console.log(`\n✅ Total overwrites: ${trashFixed}`);

// Verificar Titan
const [t] = await sql`
  SELECT accel_forward_g, accel_strafe_g, accel_up_g, accel_down_g, accel_backward_g,
         boost_mult_forward, boost_mult_strafe, boost_mult_up,
         accel_forward, accel_strafe, mass_total
  FROM ship_flight_stats WHERE ship_id::text='0079c5d5-1678-4f8c-85ba-18ca8f642af6' AND game_version=${NEW}
`;
console.log(`\nTitan AHORA: g_fwd=${t.accel_forward_g} g_bwd=${t.accel_backward_g} g_up=${t.accel_up_g} g_down=${t.accel_down_g} g_strafe=${t.accel_strafe_g}`);
console.log(`             boost_mult: fwd=${t.boost_mult_forward} strafe=${t.boost_mult_strafe} up=${t.boost_mult_up}`);
console.log(`             accel_fwd=${t.accel_forward} accel_strafe=${t.accel_strafe} mass=${t.mass_total}`);

await sql.end({ timeout: 3 });
