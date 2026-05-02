#!/usr/bin/env node
// =============================================================================
// Análisis de la discrepancia Panther S3 vs Erkul (auditoría 2026-04-26)
//
// Erkul muestra 192 rounds @ 4 pips para el Panther S3.
// Nuestra fórmula (045_weapon_capacitor_fields.sql):
//   rounds = requested_ammo_load × (pips / max_weapon_pips) / regen_cost_per_bullet
//
// El ejemplo de esa migración usa el Panther en el Asgard (max_weapon_pips=4):
//   4 pips / 4 → 100% → 18187 / 48.5 ≈ 375 rounds   ← NO coincide con Erkul
//
// Hipótesis más probable (verificar con la query de abajo):
//   El Panther S3 tiene max_weapon_pips ≠ 4. Si max=8:
//   4 pips / 8 → 50% → requested_ammo_load / (2 × regen_cost_per_bullet) ≈ 192
//
// Para validar:
//   1. Ejecutar este script contra prod y ver requested_ammo_load / regen_cost_per_bullet del S3.
//   2. Consultar ship_pools.max_pips del Panther S3 en los hardpoints donde monta.
//   3. Verificar en scunpacked-data el campo SWeaponRegenConsumerParams del S3.
//
// Fix probable: el ingest asume max_weapon_pips=4 globalmente en lugar de leerlo
// del loadout de cada nave/hardpoint. El extractor versión-aware debe joinear
// ship_hardpoints → ship_pools para derivar el pips real por contexto de nave.
// =============================================================================
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
