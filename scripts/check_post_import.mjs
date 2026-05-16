import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

const GV = '4.8.0-live.11825000';
const OLD = '4.7.2';

console.log('=== game_versions table ===');
const versions = await sql`
  SELECT version, online, source, "processedAt", notes
  FROM game_versions
  WHERE version IN (${GV}, ${OLD}, '4.8.0-live.11825000-fix2')
  ORDER BY "processedAt" DESC NULLS LAST
`;
for (const v of versions) {
  console.log(`  ${v.version.padEnd(35)} online=${v.online}  processedAt=${v.processedAt}`);
}

console.log(`\n=== ship_resistances.armor_hp en ${GV} ===`);
const [armor] = await sql`
  SELECT
    COUNT(*)::int AS total,
    COUNT(armor_hp)::int AS with_armor,
    COUNT(*) FILTER (WHERE armor_hp > 0)::int AS positive
  FROM ship_resistances WHERE game_version = ${GV}
`;
console.log(`  total=${armor.total}  with_armor_hp=${armor.with_armor}  >0=${armor.positive}`);

console.log(`\n=== ship_hardpoints.parent_hp_id en ${GV} ===`);
const [hp] = await sql`
  SELECT
    COUNT(*)::int AS total,
    COUNT(parent_hp_id)::int AS with_parent
  FROM ship_hardpoints WHERE game_version = ${GV}
`;
console.log(`  total=${hp.total}  with_parent_hp_id=${hp.with_parent}`);

console.log(`\n=== ship_hardpoints.loadout_json Loadout populated en ${GV} ===`);
const [loadout] = await sql`
  SELECT
    COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE jsonb_array_length(COALESCE((loadout_json->'Loadout')::jsonb, '[]'::jsonb)) > 0)::int AS non_empty
  FROM ship_hardpoints
  WHERE game_version = ${GV}
    AND hardpoint_type IN ('Turret','MissileLauncher')
`;
console.log(`  turrets/launchers total=${loadout.total}  con Loadout poblado=${loadout.non_empty}`);

console.log(`\n=== ship_fuel hydrogen/quantum en ${GV} ===`);
const [fuel] = await sql`
  SELECT
    COUNT(*)::int AS total,
    COUNT(hydrogen_capacity)::int AS with_h,
    COUNT(quantum_capacity)::int AS with_q
  FROM ship_fuel WHERE game_version = ${GV}
`;
console.log(`  total=${fuel.total}  with_hydrogen=${fuel.with_h}  with_quantum=${fuel.with_q}`);

console.log(`\n=== ship_power_reference.power_used_grouped_scm en ${GV} ===`);
const [pwr] = await sql`
  SELECT
    COUNT(*)::int AS total,
    COUNT(power_used_grouped_scm)::int AS with_grouped
  FROM ship_power_reference WHERE game_version = ${GV}
`;
console.log(`  total=${pwr.total}  with_grouped=${pwr.with_grouped}`);

console.log(`\n=== Avenger Titan ship_resistances (verificación específica) ===`);
const titan = await sql`
  SELECT game_version, armor_hp, dmg_mult_physical, dmg_mult_energy
  FROM ship_resistances
  WHERE ship_id::text = '0079c5d5-1678-4f8c-85ba-18ca8f642af6'
  ORDER BY game_version DESC
`;
for (const t of titan) {
  console.log(`  gv=${t.game_version}  armor_hp=${t.armor_hp}  phys=${t.dmg_mult_physical}  energy=${t.dmg_mult_energy}`);
}

console.log(`\n=== Cutlass Black turret children (test del fix #2) ===`);
const cutlass = await sql`
  SELECT class_name FROM ships
  WHERE class_name ILIKE '%cutlass_black%' AND game_version = ${GV}
  LIMIT 1
`;
if (cutlass[0]) {
  const ref = cutlass[0].class_name;
  const [parents] = await sql`
    SELECT COUNT(*)::int AS n FROM ship_hardpoints
    WHERE ship_reference = ${ref} AND game_version = ${GV}
      AND hardpoint_type = 'Turret'
  `;
  const [children] = await sql`
    SELECT COUNT(*)::int AS n FROM ship_hardpoints
    WHERE ship_reference = ${ref} AND game_version = ${GV}
      AND parent_hp_id IS NOT NULL
  `;
  console.log(`  ship=${ref}  turrets=${parents.n}  children con parent_hp_id=${children.n}`);
}

await sql.end({ timeout: 3 });
