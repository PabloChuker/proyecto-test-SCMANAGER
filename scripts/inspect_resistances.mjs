import postgres from "postgres";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const envRaw = readFileSync(resolve(process.cwd(), ".env"), "utf8");
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const sql = postgres(process.env.DIRECT_URL || process.env.DATABASE_URL, {
  ssl: "require",
  max: 1,
});

try {
  console.log("========== ship_resistances exists? ==========");
  const exists = await sql`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'ship_resistances'
    ) AS ok
  `;
  console.log("  exists:", exists[0].ok);

  if (exists[0].ok) {
    console.log("\n========== ship_resistances columns ==========");
    const cols = await sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'ship_resistances'
      ORDER BY ordinal_position
    `;
    for (const c of cols) console.log(`  ${c.column_name} :: ${c.data_type}`);

    console.log("\n========== ship_resistances row count ==========");
    const cnt = await sql`SELECT COUNT(*) AS n FROM ship_resistances`;
    console.log("  rows:", cnt[0].n);

    console.log("\n========== ship_resistances sample (Asgard/Panther/Corsair) ==========");
    const sample = await sql`
      SELECT sr.*
      FROM ship_resistances sr
      JOIN ships s ON s.id::text = sr.ship_id::text
      WHERE s.name ILIKE ANY(ARRAY['%asgard%','%panther%','%corsair%','%gladius%','%cutter%'])
      LIMIT 10
    `;
    for (const row of sample) console.log("  ", JSON.stringify(row));
  }

  console.log("\n========== ships.deflection_* sample ==========");
  const def = await sql`
    SELECT name, deflection_physical, deflection_energy, deflection_distortion
    FROM ships
    WHERE name ILIKE ANY(ARRAY['%asgard%','%panther%','%corsair%','%gladius%','%cutter%'])
    LIMIT 10
  `;
  for (const r of def) console.log("  ", JSON.stringify(r));
} finally {
  await sql.end({ timeout: 5 });
}
