import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });
const NEW = '4.8.0-live.11825000';

const SHIPS = ['DRAK_Cutlass_Black','RSI_Polaris','RSI_Perseus','AEGS_Vanguard_Warden','ANVL_Liberator','MISC_Reclaimer','DRAK_Ironclad','DRAK_Pitbull'];

for (const cn of SHIPS) {
  const [s] = await sql.unsafe(`
    SELECT s.id::text AS id, sr.armor_hp, sf.hydrogen_capacity, sf.quantum_capacity,
      spr.power_used_grouped_scm IS NOT NULL AS has_pwr,
      sfs.pitch_boosted, sfs.accel_forward
    FROM ships s
    LEFT JOIN ship_resistances sr ON sr.ship_id=s.id AND sr.game_version=s.game_version
    LEFT JOIN ship_fuel sf ON sf.ship_id=s.id AND sf.game_version=s.game_version
    LEFT JOIN ship_power_reference spr ON spr.ship_id=s.id AND spr.game_version=s.game_version
    LEFT JOIN ship_flight_stats sfs ON sfs.ship_id=s.id AND sfs.game_version=s.game_version
    WHERE s.class_name = $1 AND s.game_version = $2
    LIMIT 1
  `, [cn, NEW]);
  if (!s) { console.log(`  ${cn.padEnd(28)} NOT IN 4.8.0`); continue; }
  const [hp] = await sql.unsafe(`
    SELECT COUNT(*) FILTER (WHERE jsonb_array_length(COALESCE((loadout_json->'Loadout')::jsonb,'[]'::jsonb))>0)::int AS pop,
           COUNT(*) FILTER (WHERE hardpoint_type IN ('Turret','MissileLauncher'))::int AS tot
    FROM ship_hardpoints WHERE ship_reference = $1 AND game_version = $2
  `, [cn, NEW]);
  const flag = (s.armor_hp && s.hydrogen_capacity && s.has_pwr && s.pitch_boosted) ? '✓' : '⚠';
  console.log(`  ${flag} ${cn.padEnd(28)} armor=${(s.armor_hp||'-').toString().padEnd(5)} H=${(s.hydrogen_capacity||'-').toString().padEnd(7)} Q=${(s.quantum_capacity||'-').toString().padEnd(5)} pwr=${s.has_pwr?'Y':'N'} pitch=${s.pitch_boosted||'-'} acc=${s.accel_forward||'-'} turrets=${hp.pop}/${hp.tot}`);
}
await sql.end({ timeout: 3 });
