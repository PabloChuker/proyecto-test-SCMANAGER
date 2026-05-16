import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

console.log('=== APAR_BallisticGatling_S4 ===');
const r1 = await sql`
  SELECT game_version, alpha_physical, alpha_energy, alpha_distortion, alpha_thermal,
    dps_physical, dps_energy, rate_of_fire, damage_per_shot, ammo_speed, effective_range,
    power_consumption_min, power_consumption_max, emission_em_max, ir_max
  FROM weapon_guns WHERE class_name = 'APAR_BallisticGatling_S4' ORDER BY game_version DESC
`;
for (const r of r1) console.log(`  gv=${r.game_version}\n    α_p=${r.alpha_physical} α_e=${r.alpha_energy} α_d=${r.alpha_distortion} dps_p=${r.dps_physical} rate=${r.rate_of_fire} dmgShot=${r.damage_per_shot} ammoSpeed=${r.ammo_speed} effRange=${r.effective_range}\n    pwrMin=${r.power_consumption_min} pwrMax=${r.power_consumption_max} EM=${r.emission_em_max} IR=${r.ir_max}`);

console.log('\n=== AMRS_LaserCannon_S3 ===');
const r2 = await sql`
  SELECT game_version, alpha_physical, alpha_energy, alpha_distortion, alpha_thermal,
    dps_physical, dps_energy, rate_of_fire, damage_per_shot, ammo_speed, effective_range,
    power_consumption_min, power_consumption_max
  FROM weapon_guns WHERE class_name = 'AMRS_LaserCannon_S3' ORDER BY game_version DESC
`;
for (const r of r2) console.log(`  gv=${r.game_version}\n    α_p=${r.alpha_physical} α_e=${r.alpha_energy} α_d=${r.alpha_distortion} dps_e=${r.dps_energy} rate=${r.rate_of_fire} dmgShot=${r.damage_per_shot} ammoSpeed=${r.ammo_speed} effRange=${r.effective_range} pwrMin=${r.power_consumption_min} pwrMax=${r.power_consumption_max}`);

console.log('\n=== weapon_guns 4.8.0 stats coverage ===');
const cov = await sql`
  SELECT game_version,
    COUNT(*)::int as total,
    COUNT(*) FILTER (WHERE alpha_physical > 0 OR alpha_energy > 0 OR alpha_distortion > 0 OR alpha_thermal > 0)::int as alpha_any,
    COUNT(rate_of_fire)::int as has_rate,
    COUNT(*) FILTER (WHERE rate_of_fire > 0)::int as rate_positive,
    COUNT(damage_per_shot)::int as has_dmgshot,
    COUNT(*) FILTER (WHERE damage_per_shot > 0)::int as dmgshot_pos,
    COUNT(*) FILTER (WHERE dps_physical > 0 OR dps_energy > 0)::int as dps_any
  FROM weapon_guns GROUP BY game_version ORDER BY game_version DESC
`;
for (const r of cov) console.log(`  gv=${r.game_version.padEnd(22)} total=${r.total} α_any>0=${r.alpha_any} rate>0=${r.rate_positive}/${r.has_rate} dmgShot>0=${r.dmgshot_pos}/${r.has_dmgshot} dps_any>0=${r.dps_any}`);

console.log('\n=== coolers stats coverage ===');
const cool = await sql`
  SELECT column_name FROM information_schema.columns WHERE table_name='coolers' AND table_schema='public'
`;
console.log('  coolers cols:', cool.map(r => r.column_name).join(', '));

console.log('\n=== Coolers 4.8.0 coverage ===');
const c2 = await sql`SELECT game_version, COUNT(*)::int as n FROM coolers GROUP BY game_version ORDER BY game_version DESC`;
for (const r of c2) console.log(`  gv=${r.game_version} n=${r.n}`);

console.log('\n=== Radars cols ===');
const rcols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='radars' AND table_schema='public'`;
console.log('  radars cols:', rcols.map(r=>r.column_name).join(', '));

await sql.end({ timeout: 3 });
