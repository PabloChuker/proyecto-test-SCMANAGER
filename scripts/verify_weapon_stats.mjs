import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

const NEW = '4.8.0-live.11825000';

console.log('=== APAR_BallisticGatling_S4 ahora ===');
const r1 = await sql`
  SELECT alpha_physical, alpha_energy, rate_of_fire, damage_per_shot, dps_physical, ammo_speed, effective_range
  FROM weapon_guns WHERE class_name = 'APAR_BallisticGatling_S4' AND game_version = ${NEW}
`;
for (const r of r1) console.log(`  α_p=${r.alpha_physical} rate=${r.rate_of_fire} dps_p=${r.dps_physical} dmgShot=${r.damage_per_shot} ammoSpeed=${r.ammo_speed} effRange=${r.effective_range}`);

console.log('\n=== weapon_guns 4.8.0 coverage ahora ===');
const [cov] = await sql`
  SELECT COUNT(*) FILTER (WHERE alpha_physical > 0 OR alpha_energy > 0 OR alpha_distortion > 0 OR alpha_thermal > 0)::int as alpha_any,
    COUNT(*) FILTER (WHERE rate_of_fire > 0)::int as rate_pos,
    COUNT(*) FILTER (WHERE damage_per_shot > 0)::int as dmg_pos,
    COUNT(*)::int as total
  FROM weapon_guns WHERE game_version = ${NEW}
`;
console.log(`  total=${cov.total}  α_any>0=${cov.alpha_any}  rate>0=${cov.rate_pos}  dmgShot>0=${cov.dmg_pos}`);

console.log('\n=== Radars 4.8.0 coverage ahora ===');
const [rc] = await sql`
  SELECT COUNT(*)::int as total,
    COUNT(*) FILTER (WHERE range_max_m > 0)::int as has_range,
    COUNT(*) FILTER (WHERE sensitivity > 0)::int as has_sens
  FROM radars WHERE game_version = ${NEW}
`;
console.log(`  total=${rc.total}  range_max>0=${rc.has_range}  sensitivity>0=${rc.has_sens}`);

console.log('\n=== Coolers 4.8.0 coverage ahora ===');
const [cc] = await sql`
  SELECT COUNT(*)::int as total,
    COUNT(*) FILTER (WHERE cooling_generation > 0)::int as has_cooling,
    COUNT(*) FILTER (WHERE health > 0)::int as has_health
  FROM coolers WHERE game_version = ${NEW}
`;
console.log(`  total=${cc.total}  cooling>0=${cc.has_cooling}  health>0=${cc.has_health}`);

await sql.end({ timeout: 3 });
