import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

console.log('=== ¿Existen tablas scanners / transponders / ping ? ===');
const t = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`;
for (const x of t) console.log(`  ${x.table_name}`);

console.log('\n=== ports json del MISSILE_LAUNCHER (puede tener detection range?) ===');
const ml = await sql`SELECT class_name, ports FROM missile_launchers WHERE class_name='MRCK_S03_BEHR_Dual_S02' AND game_version='4.7.0-LIVE.11518367'`;
if (ml[0]?.ports) {
  console.log(JSON.stringify(ml[0].ports, null, 2).slice(0, 2000));
}
