import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

console.log('=== game_versions ===');
const versions = await sql`
  SELECT version, online, source, "processedAt"
  FROM game_versions
  ORDER BY "processedAt" DESC NULLS LAST
  LIMIT 6
`;
for (const v of versions) {
  const flag = v.online ? '✓ online ' : '  offline';
  console.log(`  ${flag}  ${v.version.padEnd(38)}  ${v.processedAt}`);
}

// Detectar el tag más reciente (lo que el endpoint va a usar como default)
const [defaultGv] = await sql`
  SELECT version FROM game_versions
  WHERE version !~* 'PTU' AND version ~ '^[0-9]+\\.[0-9]+'
    AND COALESCE(online, true) = true
  ORDER BY "processedAt" DESC NULLS LAST, version DESC
  LIMIT 1
`;
const GV = defaultGv?.version;
console.log(`\n>>> Endpoint default GV: ${GV}\n`);

console.log(`=== Cobertura crítica en ${GV} ===`);

const [shipsTotal] = await sql.unsafe(`SELECT COUNT(*)::int AS n FROM ships WHERE game_version = $1`, [GV]);
console.log(`  ships totales: ${shipsTotal.n}`);

const [armor] = await sql.unsafe(`
  SELECT COUNT(*)::int AS total, COUNT(armor_hp)::int AS with_hp,
         COUNT(*) FILTER (WHERE armor_hp > 0)::int AS positive
  FROM ship_resistances WHERE game_version = $1
`, [GV]);
console.log(`  ship_resistances:        total=${armor.total}  with_armor_hp=${armor.with_hp}  >0=${armor.positive}`);

const [hp] = await sql.unsafe(`
  SELECT COUNT(*)::int AS total, COUNT(parent_hp_id)::int AS with_parent,
         COUNT(default_item_class)::int AS with_default
  FROM ship_hardpoints WHERE game_version = $1
`, [GV]);
console.log(`  ship_hardpoints:         total=${hp.total}  with_parent_hp_id=${hp.with_parent}  with_default_item=${hp.with_default}`);

const [loadout] = await sql.unsafe(`
  SELECT COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE jsonb_array_length(COALESCE((loadout_json->'Loadout')::jsonb, '[]'::jsonb)) > 0)::int AS non_empty
  FROM ship_hardpoints
  WHERE game_version = $1 AND hardpoint_type IN ('Turret','MissileLauncher')
`, [GV]);
console.log(`  turret/launcher loadout: total=${loadout.total}  con Loadout poblado=${loadout.non_empty}`);

const [fuel] = await sql.unsafe(`
  SELECT COUNT(*)::int AS total,
         COUNT(hydrogen_capacity)::int AS h, COUNT(quantum_capacity)::int AS q
  FROM ship_fuel WHERE game_version = $1
`, [GV]);
console.log(`  ship_fuel:               total=${fuel.total}  hydrogen=${fuel.h}  quantum=${fuel.q}`);

const [pwr] = await sql.unsafe(`
  SELECT COUNT(*)::int AS total,
         COUNT(power_used_grouped_scm)::int AS grouped,
         COUNT(em_segment_groups_scm)::int AS em_groups
  FROM ship_power_reference WHERE game_version = $1
`, [GV]);
console.log(`  ship_power_reference:    total=${pwr.total}  grouped_scm=${pwr.grouped}  em_segments=${pwr.em_groups}`);

const [flight] = await sql.unsafe(`
  SELECT COUNT(*)::int AS total,
         COUNT(scm_speed)::int AS scm, COUNT(zero_to_scm)::int AS accel,
         COUNT(pitch_boosted)::int AS pitch
  FROM ship_flight_stats WHERE game_version = $1
`, [GV]);
console.log(`  ship_flight_stats:       total=${flight.total}  scm_speed=${flight.scm}  accel=${flight.accel}  pitch=${flight.pitch}`);

const [pools] = await sql.unsafe(`
  SELECT COUNT(DISTINCT ship_id)::int AS ships,
         COUNT(*) FILTER (WHERE item_type='Power' AND max_size>0)::int AS power_pools,
         COUNT(*) FILTER (WHERE item_type='Heat' AND max_size>0)::int AS heat_pools
  FROM ship_pools WHERE game_version = $1
`, [GV]);
console.log(`  ship_pools:              ships=${pools.ships}  Power>0=${pools.power_pools}  Heat>0=${pools.heat_pools}`);

const [ins] = await sql.unsafe(`
  SELECT COUNT(*)::int AS n FROM ship_insurance WHERE game_version = $1
`, [GV]);
console.log(`  ship_insurance:          total=${ins.n}`);

const [grids] = await sql.unsafe(`
  SELECT COUNT(*)::int AS n FROM cargo_grids WHERE game_version = $1
`, [GV]);
console.log(`  cargo_grids:             total=${grids.n}`);

console.log(`\n=== Avenger Titan (spot check) ===`);
const TITAN = '0079c5d5-1678-4f8c-85ba-18ca8f642af6';
const titanR = await sql`SELECT game_version, armor_hp, dmg_mult_physical, dmg_mult_energy FROM ship_resistances WHERE ship_id::text = ${TITAN} ORDER BY game_version DESC`;
for (const r of titanR) console.log(`  ship_resistances gv=${r.game_version}: armor=${r.armor_hp} phys=${r.dmg_mult_physical} energy=${r.dmg_mult_energy}`);
const titanF = await sql`SELECT game_version, hydrogen_capacity, quantum_capacity FROM ship_fuel WHERE ship_id::text = ${TITAN} ORDER BY game_version DESC`;
for (const r of titanF) console.log(`  ship_fuel gv=${r.game_version}: H=${r.hydrogen_capacity} Q=${r.quantum_capacity}`);

console.log(`\n=== Cutlass Black turret hierarchy ===`);
const [cutlass] = await sql.unsafe(`SELECT id::text FROM ships WHERE class_name ILIKE '%cutlass_black%' AND game_version = $1 LIMIT 1`, [GV]);
if (cutlass) {
  const ref = await sql.unsafe(`SELECT class_name FROM ships WHERE id::text = $1 LIMIT 1`, [cutlass.id]);
  const className = ref[0]?.class_name;
  const turrets = await sql.unsafe(`
    SELECT COUNT(*)::int AS n FROM ship_hardpoints
    WHERE ship_reference = $1 AND game_version = $2 AND hardpoint_type = 'Turret'
  `, [className, GV]);
  const kids = await sql.unsafe(`
    SELECT COUNT(*)::int AS n FROM ship_hardpoints
    WHERE ship_reference = $1 AND game_version = $2 AND parent_hp_id IS NOT NULL
  `, [className, GV]);
  console.log(`  ${className}: turrets=${turrets[0].n}  children con parent_hp_id=${kids[0].n}`);
}

console.log(`\n=== Sample naves grandes (que tenían Loadout vacío antes) ===`);
const samples = ['RSI_Polaris', 'AEGS_Vanguard_Warden', 'DRAK_Cutlass_Black', 'RSI_Perseus', 'ANVL_Liberator'];
for (const cn of samples) {
  const [s] = await sql.unsafe(`
    SELECT
      COUNT(*) FILTER (WHERE hardpoint_type IN ('Turret','MissileLauncher')
        AND jsonb_array_length(COALESCE((loadout_json->'Loadout')::jsonb, '[]'::jsonb)) > 0)::int AS populated,
      COUNT(*) FILTER (WHERE hardpoint_type IN ('Turret','MissileLauncher'))::int AS total,
      COUNT(parent_hp_id)::int AS kids
    FROM ship_hardpoints WHERE ship_reference = $1 AND game_version = $2
  `, [cn, GV]);
  console.log(`  ${cn.padEnd(30)} loadout=${s.populated}/${s.total}  kids=${s.kids}`);
}

await sql.end({ timeout: 3 });
