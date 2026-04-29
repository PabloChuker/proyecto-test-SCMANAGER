#!/usr/bin/env node
// =============================================================================
// SC LABS — diagnose_game_versions.mjs
//
// Lista qué hay en la tabla `game_versions`. Útil para entender por qué el
// toggle LIVE/PTU del header muestra valores raros (caso "concept" como
// version el 2026-04-28).
//
// USO:  node scripts/diagnose_game_versions.mjs
//
// Requiere DATABASE_URL o DIRECT_URL en .env.
// =============================================================================

import postgres from "postgres";
import "dotenv/config";

const connectionString = process.env.DATABASE_URL ?? process.env.DIRECT_URL ?? "";
if (!connectionString) {
  console.error("ERROR: No DATABASE_URL ni DIRECT_URL en .env");
  process.exit(1);
}

const sql = postgres(connectionString, { max: 5, idle_timeout: 20, connect_timeout: 10 });

async function main() {
  console.log("=== diagnose_game_versions ===\n");
  try {
    // Schema: qué columnas tiene la tabla
    const cols = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='game_versions'
      ORDER BY ordinal_position
    `;
    console.log("Columnas de game_versions:");
    for (const c of cols) {
      console.log(`  ${c.column_name.padEnd(30)} ${c.data_type}${c.is_nullable === "NO" ? " NOT NULL" : ""}`);
    }
    console.log("");

    // Todas las rows
    const rows = await sql`SELECT * FROM game_versions`;
    console.log(`Total rows: ${rows.length}\n`);

    if (rows.length === 0) {
      console.log("(tabla vacía — el toggle del header no va a mostrar nada)");
      return;
    }

    // Mostrar todo
    console.log("Contenido completo:");
    for (const r of rows) {
      console.log("  " + JSON.stringify(r));
    }
    console.log("");

    // Análisis: ¿cuáles parecen versiones válidas?
    const VALID = /^\d+\.\d+(\.\d+)?/;
    const valid = rows.filter((r) => VALID.test(String(r.version ?? "")));
    const invalid = rows.filter((r) => !VALID.test(String(r.version ?? "")));

    console.log(`Versions con formato válido (X.Y[.Z]...): ${valid.length}`);
    for (const r of valid) {
      const branch = String(r.version).toUpperCase().includes("PTU") ? "PTU" : "LIVE";
      console.log(`  [${branch}] ${r.version}`);
    }
    console.log("");

    if (invalid.length > 0) {
      console.log(`⚠ Versions con formato INVÁLIDO (no aparecen en el toggle): ${invalid.length}`);
      for (const r of invalid) {
        console.log(`  ✗ "${r.version}"`);
      }
      console.log("");
      console.log("Si alguno de estos debería aparecer en el toggle, ajustá el regex");
      console.log("de isValidVersionString() en src/app/api/game-versions/route.ts.");
    }
  } catch (err) {
    console.error("FATAL:", err);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

main();
