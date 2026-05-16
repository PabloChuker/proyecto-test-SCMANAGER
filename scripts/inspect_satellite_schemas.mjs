import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

const TABLES = ['ship_resistances', 'ship_fuel', 'ship_power_reference', 'ship_flight_stats', 'ship_pools', 'ship_insurance', 'ship_hardpoints'];

for (const t of TABLES) {
  console.log(`\n========= ${t} =========`);
  const cols = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = ${t} AND table_schema = 'public'
    ORDER BY ordinal_position
  `;
  for (const c of cols) {
    console.log(`  ${c.column_name.padEnd(40)} ${c.data_type.padEnd(20)} null=${c.is_nullable}`);
  }
}

await sql.end({ timeout: 3 });
