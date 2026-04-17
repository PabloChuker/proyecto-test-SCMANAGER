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
  console.log("========== Panther / Rhino en weapon_guns ==========");
  const rows = await sql`
    SELECT name, class_name, size, weapon_capacity, ammo_capacity,
           ammo_regen_per_sec, regen_cost_per_bullet, max_ammo_load,
           rate_of_fire, is_energy_weapon, alpha_energy, dps_energy
    FROM weapon_guns
    WHERE name ILIKE '%panther%' OR name ILIKE '%rhino%' OR class_name ILIKE '%panther%' OR class_name ILIKE '%rhino%'
    ORDER BY name
  `;
  if (rows.length === 0) {
    console.log("  (sin resultados)");
  } else {
    for (const r of rows) {
      console.log(JSON.stringify(r, null, 2));
    }
  }

  console.log("\n========== ¿Existe tabla scanners? ==========");
  const t = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('scanners', 'main_thrusters', 'manneuver_thrusters')
  `;
  console.log("  Tablas encontradas:", t.map((x) => x.table_name));

  console.log("\n========== ship_power_reference sample (Asgard + 2 filas random) ==========");
  const asgardRef = await sql`
    SELECT * FROM ship_power_reference
    WHERE ship_id IN (SELECT id FROM ships WHERE name ILIKE '%asgard%')
    LIMIT 2
  `;
  for (const row of asgardRef) {
    console.log(JSON.stringify(row, null, 2));
  }

  console.log("\n========== ship_pools sample (Asgard) ==========");
  const asgardPools = await sql`
    SELECT pool_type, max_pips, default_pips, base_power, group_key
    FROM ship_pools
    WHERE ship_id IN (SELECT id FROM ships WHERE name ILIKE '%asgard%')
    ORDER BY pool_type
    LIMIT 30
  `;
  for (const row of asgardPools) console.log("  ", row);

  console.log("\n========== ships sin power_reference ==========");
  const missing = await sql`
    SELECT s.name FROM ships s
    LEFT JOIN ship_power_reference r ON r.ship_id = s.id
    WHERE r.ship_id IS NULL
    ORDER BY s.name
  `;
  console.log(`  Total: ${missing.length}`);
  for (const m of missing) console.log(`    - ${m.name}`);
} finally {
  await sql.end({ timeout: 5 });
}
