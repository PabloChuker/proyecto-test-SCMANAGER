import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

console.log('=== weapon_guns: campos populated por game_version ===');
const tables = ['weapon_guns'];
for (const t of tables) {
  const cols = await sql.unsafe(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = $1 AND table_schema = 'public'
    ORDER BY ordinal_position
  `, [t]);
  console.log(`\n${t} columnas: ${cols.length}`);
  console.log('  ', cols.map(c=>c.column_name).join(', ').slice(0, 800));
}

console.log('\n=== APAR_BallisticGatling_S4 stats por game_version ===');
const rows = await sql`
  SELECT game_version, class_name, name, size,
    alpha_physical, alpha_energy, alpha_distortion, alpha_thermal,
    rate_of_fire_rpm, ammo_speed, range_effective,
    damage_per_shot, dps as dps_field, sustained_dps, fire_rate_rpm,
    energy_max, energy_per_shot, regen_cost_per_bullet
  FROM weapon_guns
  WHERE class_name = 'APAR_BallisticGatling_S4'
  ORDER BY game_version DESC
`.catch(e => { console.log('ERR:', e.message); return []; });
for (const r of rows) {
  console.log(`  gv=${r.game_version} alpha_p=${r.alpha_physical} alpha_e=${r.alpha_energy} alpha_d=${r.alpha_distortion} alpha_t=${r.alpha_thermal} rate=${r.rate_of_fire_rpm} dps=${r.dps_field} sustdps=${r.sustained_dps} dmgShot=${r.damage_per_shot} energyMax=${r.energy_max}`);
}

console.log('\n=== AMRS_LaserCannon_S3 stats por game_version ===');
const rows2 = await sql`
  SELECT game_version, class_name, size,
    alpha_physical, alpha_energy, alpha_distortion, alpha_thermal,
    rate_of_fire_rpm, damage_per_shot, dps as dps_field, sustained_dps,
    energy_max, energy_per_shot
  FROM weapon_guns
  WHERE class_name = 'AMRS_LaserCannon_S3'
  ORDER BY game_version DESC
`.catch(e => { console.log('ERR:', e.message); return []; });
for (const r of rows2) {
  console.log(`  gv=${r.game_version} alpha_p=${r.alpha_physical} alpha_e=${r.alpha_energy} alpha_d=${r.alpha_distortion} alpha_t=${r.alpha_thermal} rate=${r.rate_of_fire_rpm} dps=${r.dps_field} dmgShot=${r.damage_per_shot}`);
}

console.log('\n=== Stat coverage por gv (weapon_guns) ===');
const cov = await sql`
  SELECT game_version,
    COUNT(*)::int as total,
    COUNT(alpha_physical)::int as has_alpha_p,
    COUNT(alpha_energy)::int as has_alpha_e,
    COUNT(rate_of_fire_rpm)::int as has_rate,
    COUNT(damage_per_shot)::int as has_dmgshot,
    COUNT(*) FILTER (WHERE alpha_physical > 0 OR alpha_energy > 0)::int as has_any_alpha
  FROM weapon_guns
  GROUP BY game_version
  ORDER BY game_version DESC
`;
for (const r of cov) {
  console.log(`  gv=${r.game_version.padEnd(22)} total=${r.total} alpha_p=${r.has_alpha_p} alpha_e=${r.has_alpha_e} rate=${r.has_rate} dmgShot=${r.has_dmgshot} ANY_alpha>0=${r.has_any_alpha}`);
}

console.log('\n=== Coolers cobertura ===');
const cool = await sql`
  SELECT game_version, COUNT(*)::int as n,
    COUNT(cooling_rate)::int as has_rate,
    COUNT(*) FILTER (WHERE cooling_rate > 0)::int as positive
  FROM coolers GROUP BY game_version ORDER BY game_version DESC
`.catch(e => { console.log('ERR:', e.message); return []; });
for (const r of cool) console.log(`  gv=${r.game_version.padEnd(22)} total=${r.n} has_rate=${r.has_rate} positive=${r.positive}`);

console.log('\n=== Radars cobertura ===');
const rad = await sql`
  SELECT column_name FROM information_schema.columns WHERE table_name='radars' AND table_schema='public'
`;
console.log('  radars cols:', rad.map(r => r.column_name).join(', '));
const rad2 = await sql`SELECT game_version, COUNT(*)::int AS n FROM radars GROUP BY game_version ORDER BY game_version DESC`;
for (const r of rad2) console.log(`  gv=${r.game_version.padEnd(22)} total=${r.n}`);

await sql.end({ timeout: 3 });
