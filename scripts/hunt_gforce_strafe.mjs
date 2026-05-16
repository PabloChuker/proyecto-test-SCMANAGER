import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

const NEW = '4.8.0-live.11825000';
const TITAN = '0079c5d5-1678-4f8c-85ba-18ca8f642af6';

console.log('═══════════════════════════════════════════════════════════════');
console.log('PASO 1: Estado actual ship_flight_stats — Titan en TODAS las gvs');
console.log('═══════════════════════════════════════════════════════════════');
const r = await sql`
  SELECT game_version,
    scm_speed, max_speed, boost_speed_forward, boost_speed_backward,
    accel_forward, accel_backward, accel_up, accel_down, accel_strafe,
    accel_forward_g, accel_backward_g, accel_up_g, accel_down_g, accel_strafe_g,
    boost_mult_forward, boost_mult_backward, boost_mult_up, boost_mult_strafe,
    pitch, yaw, roll, pitch_boosted, yaw_boosted, roll_boosted,
    boost_capacitor_max, boost_regen_per_sec, boost_regen_time,
    zero_to_scm, zero_to_max, scm_to_zero
  FROM ship_flight_stats WHERE ship_id::text = ${TITAN} ORDER BY game_version DESC
`;
for (const row of r) {
  console.log(`\ngv=${row.game_version}`);
  console.log(`  scm=${row.scm_speed}  max=${row.max_speed}  boost_fwd=${row.boost_speed_forward}  boost_bwd=${row.boost_speed_backward}`);
  console.log(`  accel_fwd=${row.accel_forward}  bwd=${row.accel_backward}  up=${row.accel_up}  down=${row.accel_down}  strafe=${row.accel_strafe}`);
  console.log(`  g_fwd=${row.accel_forward_g}  g_bwd=${row.accel_backward_g}  g_up=${row.accel_up_g}  g_down=${row.accel_down_g}  g_strafe=${row.accel_strafe_g}`);
  console.log(`  boost_mult: fwd=${row.boost_mult_forward}  bwd=${row.boost_mult_backward}  up=${row.boost_mult_up}  strafe=${row.boost_mult_strafe}`);
  console.log(`  cap_max=${row.boost_capacitor_max}  regen=${row.boost_regen_per_sec}  regenTime=${row.boost_regen_time}`);
}

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('PASO 2: ¿Cobertura de campos accel y g_force en 4.7.2 vs 4.8.0?');
console.log('═══════════════════════════════════════════════════════════════');
for (const gv of [NEW, '4.7.2', '4.7.0-LIVE.11518367']) {
  const [c] = await sql.unsafe(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(accel_forward)::int AS afwd,
      COUNT(accel_strafe)::int AS astrafe,
      COUNT(accel_forward_g)::int AS gfwd,
      COUNT(accel_strafe_g)::int AS gstrafe,
      COUNT(boost_mult_strafe)::int AS bstrafe
    FROM ship_flight_stats WHERE game_version = $1
  `, [gv]);
  console.log(`  gv=${gv.padEnd(22)} total=${c.total}  accel_fwd=${c.afwd}  accel_strafe=${c.astrafe}  g_fwd=${c.gfwd}  g_strafe=${c.gstrafe}  boost_mult_strafe=${c.bstrafe}`);
}

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('PASO 3: ships.raw_data — buscar SAccelerationParams / FlightCharacteristics');
console.log('═══════════════════════════════════════════════════════════════');
const shipCols = await sql`
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='ships' ORDER BY column_name
`;
const shipJsonbCols = shipCols.filter(c => c.data_type === 'jsonb' || c.column_name === 'raw_data');
console.log('ships jsonb/raw cols:', shipJsonbCols.map(c => `${c.column_name}(${c.data_type})`).join(', '));

if (shipJsonbCols.length > 0) {
  for (const jc of shipJsonbCols) {
    const rrr = await sql.unsafe(`SELECT ${jc.column_name} FROM ships WHERE id::text = $1`, [TITAN]);
    if (rrr[0]?.[jc.column_name]) {
      const v = rrr[0][jc.column_name];
      const keys = typeof v === 'object' ? Object.keys(v) : [];
      console.log(`  ships.${jc.column_name} top-level keys:`, keys);
      if (typeof v === 'object') {
        for (const k of keys) {
          if (/flight|accel|g_force|strafe|thrust|maneuv|boost/i.test(k)) {
            console.log(`    ${k}:`, typeof v[k] === 'object' ? Object.keys(v[k]).join(',') : v[k]);
          }
        }
      }
    }
  }
}

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('PASO 4: ¿Hay otras tablas con datos de aceleración?');
console.log('═══════════════════════════════════════════════════════════════');
const cols = await sql`
  SELECT table_name, column_name FROM information_schema.columns
  WHERE table_schema='public'
    AND (column_name ILIKE '%g_force%' OR column_name ILIKE '%gforce%'
      OR column_name ILIKE '%strafe%' OR column_name ILIKE '%accel%'
      OR column_name ILIKE '%afterburner%' OR column_name ILIKE '%thrust%'
      OR column_name ILIKE '%maneuv%')
  ORDER BY table_name, column_name
`;
const byTable = new Map();
for (const c of cols) {
  if (!byTable.has(c.table_name)) byTable.set(c.table_name, []);
  byTable.get(c.table_name).push(c.column_name);
}
for (const [t, cs] of byTable) console.log(`  ${t}: ${cs.join(', ')}`);

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('PASO 5: main_thrusters / manneuver_thrusters de Titan (raw_data?)');
console.log('═══════════════════════════════════════════════════════════════');
for (const t of ['main_thrusters', 'manneuver_thrusters']) {
  try {
    const c = await sql.unsafe(`SELECT column_name FROM information_schema.columns WHERE table_name=$1 AND table_schema='public' ORDER BY column_name`, [t]);
    if (c.length === 0) { console.log(`  ${t}: NOT EXISTS`); continue; }
    console.log(`\n  ${t} (${c.length} cols): ${c.map(x => x.column_name).slice(0, 25).join(', ')}`);
    // Buscar thrusters de Titan
    const tit = await sql.unsafe(`SELECT * FROM ${t} WHERE class_name LIKE '%Avenger%' OR class_name LIKE '%Titan%' LIMIT 5`, []);
    for (const row of tit) {
      const keysNonNull = Object.entries(row).filter(([k,v]) => v != null && k !== 'raw_data');
      console.log(`    sample row class_name=${row.class_name} → ${keysNonNull.length} non-null cols`);
      if (row.raw_data) {
        console.log(`      raw_data keys:`, Object.keys(row.raw_data).slice(0, 20).join(','));
      }
    }
  } catch (e) { console.log(`  ${t} ERR: ${e.message?.slice(0,80)}`); }
}

await sql.end({ timeout: 3 });
