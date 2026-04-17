#!/usr/bin/env node
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
  console.log("========== ship_pools cols ==========");
  const cols = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ship_pools'
    ORDER BY ordinal_position
  `;
  for (const c of cols) console.log(`  ${c.column_name} :: ${c.data_type}`);

  console.log("\n========== ship_pools Asgard sample ==========");
  const sample = await sql`
    SELECT * FROM ship_pools
    WHERE ship_id IN (SELECT id FROM ships WHERE name ILIKE '%asgard%')
    LIMIT 20
  `;
  for (const row of sample) console.log("  ", JSON.stringify(row));

  console.log("\n========== weapon_guns: distribución ammo_capacity ==========");
  const amm = await sql`
    SELECT
      COUNT(*) FILTER (WHERE ammo_capacity = 0) AS zero,
      COUNT(*) FILTER (WHERE ammo_capacity IS NULL) AS nulls,
      COUNT(*) FILTER (WHERE ammo_capacity > 0) AS populated,
      MIN(ammo_capacity) AS min, MAX(ammo_capacity) AS max,
      COUNT(*) AS total
    FROM weapon_guns
  `;
  console.log("  ", amm[0]);

  console.log("\n========== weapon_guns: distribución max_ammo_load ==========");
  const load = await sql`
    SELECT
      COUNT(*) FILTER (WHERE max_ammo_load = 0) AS zero,
      COUNT(*) FILTER (WHERE max_ammo_load IS NULL) AS nulls,
      COUNT(*) FILTER (WHERE max_ammo_load > 0) AS populated,
      MIN(max_ammo_load) AS min, MAX(max_ammo_load) AS max
    FROM weapon_guns
  `;
  console.log("  ", load[0]);

  console.log("\n========== weapon_guns: weapon_capacity vs max_ammo_load ==========");
  const summary = await sql`
    SELECT sub_type,
           COUNT(*) AS n,
           AVG(weapon_capacity)::int AS avg_cap,
           AVG(max_ammo_load)::int AS avg_load,
           AVG(regen_cost_per_bullet)::numeric(10,2) AS avg_regen,
           COUNT(*) FILTER (WHERE is_energy_weapon) AS energy,
           COUNT(*) FILTER (WHERE NOT is_energy_weapon) AS ballistic
    FROM weapon_guns
    GROUP BY sub_type
    ORDER BY sub_type
  `;
  for (const s of summary) console.log("  ", s);

  console.log("\n========== ships con score esperado de 'Panther' en hardpoints ==========");
  const hp = await sql`
    SELECT s.name, COUNT(*) AS hp_count
    FROM ships s
    JOIN ship_hardpoints h ON h.ship_id = s.id
    WHERE h.component_name ILIKE '%panther%' OR h.component_class ILIKE '%panther%'
    GROUP BY s.name
    ORDER BY s.name
    LIMIT 10
  `;
  for (const r of hp) console.log("  ", r);

  console.log("\n========== radars en lugar de scanners ==========");
  const radarSample = await sql`
    SELECT name, class_name, sub_type, size FROM radars LIMIT 10
  `;
  for (const r of radarSample) console.log("  ", r);
} finally {
  await sql.end({ timeout: 5 });
}
