#!/usr/bin/env node
// =============================================================================
// SC Labs — FPS Weapons importer
//
// Lee scripts/data/fps-weapons.json y hace bulk upsert en `fps_weapons`.
// Idempotente — corré después de actualizar el JSON cuando CIG balancea
// armas o se suman nuevas. Source: planilla curada por Pablo.
//
// Uso:
//   node scripts/import-fps-weapons.mjs            # aplica
//   node scripts/import-fps-weapons.mjs --dry      # cuenta sin escribir
//
// Variables de entorno: DATABASE_URL / DIRECT_URL (Supabase).
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import "dotenv/config";

const JSON_PATH = path.resolve("scripts/data/fps-weapons.json");
const DATABASE_URL = process.env.DIRECT_URL || process.env.DATABASE_URL;
const DRY = process.argv.includes("--dry");

if (!DATABASE_URL && !DRY) {
  console.error("[ERR] DATABASE_URL no seteada");
  process.exit(1);
}

if (!fs.existsSync(JSON_PATH)) {
  console.error(`[ERR] No se encuentra ${JSON_PATH}`);
  process.exit(1);
}

const weapons = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
console.log(`[INFO] Cargadas ${weapons.length} armas desde JSON`);

const types = weapons.reduce((acc, w) => {
  acc[w.type] = (acc[w.type] ?? 0) + 1;
  return acc;
}, {});
console.log("[INFO] Distribución por tipo:");
for (const [t, n] of Object.entries(types).sort((a, b) => b[1] - a[1])) {
  console.log(`         ${t.padEnd(20)} ${n}`);
}

if (DRY) {
  console.log("[DRY] No se escribió a Supabase.");
  process.exit(0);
}

const sql = postgres(DATABASE_URL, {
  ssl: "require",
  prepare: false,
  max: 1,
  idle_timeout: 20,
  connect_timeout: 30,
});

async function main() {
  console.log(`\n[INFO] Conectando a ${DATABASE_URL.split("@")[1]?.split("/")[0]}…`);

  const rows = weapons.map((w) => ({
    name: w.name,
    type: w.type,
    magazine: w.magazine,
    bullet_speed: w.bulletSpeed,
    alpha_damage: w.alphaDamage,
    max_firerate: w.maxFirerate,
    max_dps: w.maxDps,
    single_firerate: w.singleFirerate,
    single_dps: w.singleDps,
    burst_firerate: w.burstFirerate,
    burst_dps: w.burstDps,
    rapid_firerate: w.rapidFirerate,
    rapid_dps: w.rapidDps,
    volume_micro_scu: w.volumeMicroScu,
  }));

  const cols = [
    "name", "type", "magazine", "bullet_speed", "alpha_damage",
    "max_firerate", "max_dps", "single_firerate", "single_dps",
    "burst_firerate", "burst_dps", "rapid_firerate", "rapid_dps",
    "volume_micro_scu",
  ];

  // Estrategia: TRUNCATE + bulk insert. Más rápido y predecible que un loop
  // de upserts. Como `name` es la PK, esto reemplaza cualquier fila con
  // mismo nombre por la nueva versión del JSON.
  await sql`TRUNCATE TABLE fps_weapons`;
  await sql`INSERT INTO fps_weapons ${sql(rows, ...cols)}`;
  const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM fps_weapons`;
  console.log(`[OK] Filas en fps_weapons: ${count}`);

  await sql.end();
}

main().catch((e) => {
  console.error("[FATAL]", e);
  process.exit(1);
});
