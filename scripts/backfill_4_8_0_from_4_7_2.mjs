import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

const NEW = '4.8.0-live.11825000';
const OLD = '4.7.2';

// Tablas con PK (ship_id, game_version) — JOIN por ship_id
// Por tabla: { columns_to_backfill }
const TABLES = {
  ship_resistances: [
    'armor_hp', 'dmg_mult_physical', 'dmg_mult_energy', 'dmg_mult_distortion',
    'dmg_mult_thermal', 'dmg_mult_biochemical', 'dmg_mult_stun',
    'sig_mult_cross_section', 'sig_mult_infrared', 'sig_mult_electromagnetic',
    'pen_resist_base', 'pen_resist_physical', 'pen_resist_energy', 'pen_resist_distortion',
    'base_em_signature', 'base_ir_signature', 'base_cs_signature',
    'cross_section_x', 'cross_section_y', 'cross_section_z',
    'em_total_shields', 'em_total_quantum', 'ir_total_shields', 'ir_total_quantum',
  ],
  ship_fuel: [
    'hydrogen_capacity', 'fuel_intake_rate', 'fuel_usage_main', 'fuel_usage_retro',
    'fuel_usage_maneuvering', 'maneuvering_time_till_empty', 'intake_to_main_ratio',
    'quantum_capacity', 'quantum_spool_time', 'quantum_travel_time_po',
    'quantum_fuel_usage_po', 'power_used_quantum',
  ],
  ship_power_reference: [
    'power_generation_segments', 'power_used_scm', 'power_used_nav',
    'power_used_grouped_scm', 'power_used_grouped_nav',
    'cooling_generation_segments', 'cooling_used_scm', 'cooling_used_nav',
    'cooling_used_pct_scm', 'cooling_used_pct_nav',
    'cooling_used_grouped_scm', 'cooling_used_grouped_nav',
    'em_shields', 'em_quantum', 'ir_shields', 'ir_quantum',
    'em_per_segment', 'em_groups_scm', 'em_groups_nav',
    'em_segment_groups_scm', 'em_segment_groups_nav',
    'total_shield_hp', 'total_shield_regen', 'total_shield_regen_raw', 'total_shield_regen_min_power',
    'distortion_pool', 'fuel_capacity_hydrogen', 'fuel_intake_rate', 'fuel_usage_scm',
    'fuel_capacity_quantum', 'qt_range_km', 'qt_speed_ms', 'qt_spool_time_s', 'multi_pp_ratio',
  ],
  ship_flight_stats: [
    'scm_speed', 'max_speed', 'boost_speed_forward', 'boost_speed_backward',
    'pitch', 'yaw', 'roll', 'pitch_boosted', 'yaw_boosted', 'roll_boosted',
    'accel_forward', 'accel_backward', 'accel_up', 'accel_down', 'accel_strafe',
    'accel_forward_g', 'accel_backward_g', 'accel_up_g', 'accel_down_g', 'accel_strafe_g',
    'boost_mult_forward', 'boost_mult_backward', 'boost_mult_up', 'boost_mult_strafe',
    'boost_capacitor_max', 'boost_regen_per_sec', 'boost_regen_time',
    'zero_to_scm', 'zero_to_max', 'scm_to_zero',
    'mass_empty', 'mass_loadout', 'mass_total',
  ],
  ship_insurance: [
    'expedited_cost', 'expedited_claim_time', 'standard_claim_time',
  ],
};

console.log(`\n🔍 DRY RUN — contando filas a updatear por tabla`);
console.log(`   NEW=${NEW}   SRC=${OLD}\n`);

// DRY RUN: counts
for (const [table, cols] of Object.entries(TABLES)) {
  const nullCond = cols.map(c => `dst.${c} IS NULL AND src.${c} IS NOT NULL`).join(' OR ');
  const [{ n }] = await sql.unsafe(`
    SELECT COUNT(*)::int AS n
    FROM ${table} dst
    JOIN ${table} src ON dst.ship_id = src.ship_id
    WHERE dst.game_version = $1 AND src.game_version = $2
      AND (${nullCond})
  `, [NEW, OLD]);
  console.log(`  ${table.padEnd(28)} filas a updatear: ${n}`);
}

// ship_pools dry
const [{ n: poolsN }] = await sql.unsafe(`
  SELECT COUNT(*)::int AS n
  FROM ship_pools dst
  JOIN ship_pools src ON dst.ship_id = src.ship_id AND dst.item_type = src.item_type
  WHERE dst.game_version = $1 AND src.game_version = $2
    AND COALESCE(dst.max_size, 0) = 0 AND COALESCE(src.max_size, 0) > 0
`, [NEW, OLD]);
console.log(`  ship_pools                   filas con max_size=0 a updatear: ${poolsN}`);

// ship_hardpoints dry — loadout_json donde Loadout vacío + parent_hp_id NULL
const [{ n: hpLoadout }] = await sql.unsafe(`
  SELECT COUNT(*)::int AS n
  FROM ship_hardpoints dst
  JOIN ship_hardpoints src
    ON dst.ship_reference = src.ship_reference
   AND dst.hardpoint_name = src.hardpoint_name
  WHERE dst.game_version = $1 AND src.game_version = $2
    AND dst.hardpoint_type IN ('Turret','MissileLauncher')
    AND jsonb_array_length(COALESCE((dst.loadout_json->'Loadout')::jsonb, '[]'::jsonb)) = 0
    AND jsonb_array_length(COALESCE((src.loadout_json->'Loadout')::jsonb, '[]'::jsonb)) > 0
`, [NEW, OLD]);
console.log(`  ship_hardpoints              turret/launcher con Loadout vacío: ${hpLoadout}`);

// APPLY (sólo si el ARG es --apply)
const APPLY = process.argv.includes('--apply');

if (!APPLY) {
  console.log(`\n⚠️  DRY RUN — añadí --apply para ejecutar`);
  await sql.end({ timeout: 3 });
  process.exit(0);
}

console.log(`\n🚀 APLICANDO BACKFILL\n`);

for (const [table, cols] of Object.entries(TABLES)) {
  const setClauses = cols.map(c => `${c} = COALESCE(dst.${c}, src.${c})`).join(', ');
  const result = await sql.unsafe(`
    UPDATE ${table} AS dst
    SET ${setClauses}
    FROM ${table} AS src
    WHERE dst.ship_id = src.ship_id
      AND dst.game_version = $1
      AND src.game_version = $2
  `, [NEW, OLD]);
  console.log(`  ✓ ${table.padEnd(28)} → ${result.count} filas modificadas`);
}

// ship_pools
const poolsResult = await sql.unsafe(`
  UPDATE ship_pools AS dst
  SET max_size = src.max_size,
      min_size = COALESCE(dst.min_size, src.min_size)
  FROM ship_pools AS src
  WHERE dst.ship_id = src.ship_id
    AND dst.item_type = src.item_type
    AND dst.game_version = $1
    AND src.game_version = $2
    AND COALESCE(dst.max_size, 0) = 0
    AND COALESCE(src.max_size, 0) > 0
`, [NEW, OLD]);
console.log(`  ✓ ship_pools                   → ${poolsResult.count} pools backfilled`);

// ship_hardpoints loadout_json — solo Turret/MissileLauncher con Loadout vacío
const hpResult = await sql.unsafe(`
  UPDATE ship_hardpoints AS dst
  SET loadout_json = src.loadout_json
  FROM ship_hardpoints AS src
  WHERE dst.ship_reference = src.ship_reference
    AND dst.hardpoint_name = src.hardpoint_name
    AND dst.game_version = $1
    AND src.game_version = $2
    AND dst.hardpoint_type IN ('Turret','MissileLauncher')
    AND jsonb_array_length(COALESCE((dst.loadout_json->'Loadout')::jsonb, '[]'::jsonb)) = 0
    AND jsonb_array_length(COALESCE((src.loadout_json->'Loadout')::jsonb, '[]'::jsonb)) > 0
`, [NEW, OLD]);
console.log(`  ✓ ship_hardpoints loadout_json → ${hpResult.count} hardpoints backfilled`);

console.log(`\n✅ Backfill completo`);
await sql.end({ timeout: 3 });
