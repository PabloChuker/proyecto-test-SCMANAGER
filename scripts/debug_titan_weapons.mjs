#!/usr/bin/env node
import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

const rows = await sql`
  SELECT hardpoint_name, hardpoint_type, default_item_class, loadout_json
  FROM ship_hardpoints
  WHERE ship_reference = 'AEGS_Avenger_Titan'
    AND game_version = '4.8.0-live.11825000'
    AND (hardpoint_name LIKE '%weapon%' OR hardpoint_name LIKE '%turret%' OR hardpoint_name LIKE '%gun%' OR default_item_class LIKE 'Mount_Gimbal%')
  ORDER BY hardpoint_name
`;
console.log(`Found ${rows.length} weapon/turret/gun hardpoints in 4.8.0:\n`);
for (const r of rows) {
  console.log(`=== ${r.hardpoint_name} ===`);
  console.log(`type=${r.hardpoint_type}  default=${r.default_item_class}`);
  const lj = r.loadout_json;
  if (!lj) { console.log('  loadout_json = null'); continue; }
  // Es array o objeto?
  if (Array.isArray(lj)) {
    console.log(`  loadout_json IS ARRAY with ${lj.length} entries`);
    for (let i = 0; i < lj.length; i++) {
      const e = lj[i];
      const cls = e?.ClassName || e?.className;
      const loadoutArr = Array.isArray(e?.Loadout) ? e.Loadout : null;
      const childrenArr = Array.isArray(e?.Children) ? e.Children : null;
      console.log(`    [${i}] ${cls}  Loadout=${loadoutArr ? loadoutArr.length : 'null'}  Children=${childrenArr ? childrenArr.length : 'null'}`);
    }
  } else if (typeof lj === 'object') {
    const cls = lj.ClassName || lj.className;
    const loadoutArr = Array.isArray(lj.Loadout) ? lj.Loadout : null;
    const childrenArr = Array.isArray(lj.Children) ? lj.Children : null;
    console.log(`  loadout_json IS OBJECT  ClassName=${cls}  Loadout=${loadoutArr ? loadoutArr.length : 'null'}  Children=${childrenArr ? childrenArr.length : 'null'}`);
    if (loadoutArr && loadoutArr.length > 0) {
      for (let i = 0; i < loadoutArr.length; i++) {
        const e = loadoutArr[i];
        const ecls = e?.ClassName || e?.className;
        const eloadout = Array.isArray(e?.Loadout) ? e.Loadout.length : 'null';
        const echildren = Array.isArray(e?.Children) ? e.Children.length : 'null';
        console.log(`    Loadout[${i}] = ${ecls}  Loadout=${eloadout}  Children=${echildren}`);
      }
    }
  } else {
    console.log('  loadout_json type:', typeof lj);
  }
  console.log('');
}

await sql.end({ timeout: 3 });
