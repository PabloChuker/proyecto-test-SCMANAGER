import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

console.log('=== Cobertura catalog tables por game_version ===');
const tables = ['weapon_guns', 'coolers', 'radars', 'power_plants', 'shields', 'quantum_drives', 'missile_launchers', 'missiles', 'bombs'];
for (const t of tables) {
  try {
    const rows = await sql.unsafe(`
      SELECT game_version, COUNT(*)::int AS n
      FROM ${t}
      GROUP BY game_version
      ORDER BY game_version DESC NULLS LAST
    `, []);
    const summary = rows.map(r => `${r.game_version ?? 'NULL'}=${r.n}`).join(', ');
    console.log(`  ${t.padEnd(22)} ${summary}`);
  } catch (e) {
    console.log(`  ${t.padEnd(22)} ERR: ${e.message?.slice(0,60)}`);
  }
}

console.log('\n=== Sample class_names del Avenger Titan loadout_json ===');
const hps = await sql`
  SELECT hardpoint_name, hardpoint_type, default_item_class, loadout_json
  FROM ship_hardpoints
  WHERE ship_reference = 'AEGS_Avenger_Titan' AND game_version = '4.8.0-live.11825000'
  ORDER BY hardpoint_type
`;
for (const hp of hps) {
  const lj = hp.loadout_json;
  let entries = [];
  if (Array.isArray(lj)) entries = lj;
  else if (lj?.Loadout) entries = lj.Loadout;
  else if (lj?.ClassName) entries = [lj];
  const sample = entries.slice(0, 2).map(e => e.ClassName || e.className).join('|');
  console.log(`  ${hp.hardpoint_name.padEnd(45)} type=${(hp.hardpoint_type||'').padEnd(14)} default=${(hp.default_item_class||'').padEnd(35)} children=${sample}`);
}

console.log('\n=== Probe específico: ¿existe COOL_AEGS_S01_Bracer en weapon_guns/coolers? ===');
const probes = ['COOL_AEGS_S01_Bracer', 'COOL_AEGS_S01_Bracer_SCItem', 'KLWE_LaserCannon_S04', 'Mount_Gimbal_S04_VariPuck'];
for (const cn of probes) {
  for (const t of ['weapon_guns', 'coolers', 'radars', 'power_plants', 'shields', 'quantum_drives']) {
    try {
      const r = await sql.unsafe(`SELECT class_name, game_version FROM ${t} WHERE class_name = $1 LIMIT 5`, [cn]);
      if (r.length > 0) {
        console.log(`  ${cn.padEnd(38)} ${t.padEnd(20)} ${r.map(x=>x.game_version).join(',')}`);
      }
    } catch {}
  }
}

await sql.end({ timeout: 3 });
