#!/usr/bin/env node
/**
 * audit_supabase_state.mjs
 * Snapshot del estado actual de Supabase para auditoría pre-lanzamiento.
 * Lista tablas, cuenta filas, y reporta qué está poblado vs vacío.
 */
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// load .env manually (sin depender de dotenv)
const envPath = resolve(process.cwd(), ".env");
const envRaw = readFileSync(envPath, "utf8");
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL / DIRECT_URL en .env");
  process.exit(1);
}

const sql = postgres(url, { ssl: "require", max: 1 });

try {
  console.log("\n========== 1) TABLAS EN public SCHEMA ==========");
  const tables = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;
  console.log(tables.map((t) => t.table_name).join("\n"));

  console.log("\n========== 2) CONTEO DE FILAS POR TABLA ==========");
  const counts = [];
  for (const t of tables) {
    try {
      const [{ c }] = await sql.unsafe(`SELECT COUNT(*)::int AS c FROM public."${t.table_name}"`);
      counts.push({ table: t.table_name, rows: c });
    } catch (e) {
      counts.push({ table: t.table_name, rows: `ERR: ${e.message.slice(0, 60)}` });
    }
  }
  counts.sort((a, b) => String(a.table).localeCompare(String(b.table)));
  for (const c of counts) {
    const tag = typeof c.rows === "number" && c.rows === 0 ? " <-- VACIA" : "";
    console.log(`  ${String(c.table).padEnd(45)} ${String(c.rows).padStart(8)}${tag}`);
  }

  console.log("\n========== 3) TABLAS POWER MODEL (migrations 033-045) ==========");
  const powerTables = [
    "ship_power_reference",
    "ship_pools",
    "ships",
    "ship_hardpoints",
    "radars",
    "flight_controllers",
    "power_plants",
    "shields",
    "coolers",
    "quantum_drives",
    "weapon_guns",
  ];
  for (const t of powerTables) {
    try {
      const cols = await sql`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${t}
        ORDER BY ordinal_position
      `;
      if (cols.length === 0) {
        console.log(`  [${t}]  TABLA NO EXISTE`);
        continue;
      }
      const powerCols = cols.filter((c) =>
        /power|pip|capacit|energy|emission|consumption|throttle|coolant/i.test(c.column_name)
      );
      const [{ c: rowCount }] = await sql.unsafe(`SELECT COUNT(*)::int AS c FROM public."${t}"`);
      console.log(`  [${t}] filas=${rowCount}, cols-power=${powerCols.length}`);
      if (powerCols.length > 0) {
        for (const c of powerCols) console.log(`      - ${c.column_name} :: ${c.data_type}`);
      }
    } catch (e) {
      console.log(`  [${t}] ERR: ${e.message.slice(0, 80)}`);
    }
  }

  console.log("\n========== 4) MIGRACIONES PRISMA (si existe la tabla) ==========");
  try {
    const mig = await sql`
      SELECT migration_name, finished_at
      FROM _prisma_migrations
      ORDER BY finished_at DESC
      LIMIT 20
    `;
    if (mig.length === 0) console.log("  (tabla vacía)");
    else for (const m of mig) console.log(`  ${m.finished_at}  ${m.migration_name}`);
  } catch {
    console.log("  _prisma_migrations no existe (consistente con remoción de Prisma runtime)");
  }

  console.log("\n========== 5) MUESTRA weapon_capacitor_* y weapon_guns ==========");
  try {
    const cols = await sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'weapon_guns'
      ORDER BY ordinal_position
    `;
    console.log(`  weapon_guns cols (${cols.length}):`);
    for (const c of cols) console.log(`    ${c.column_name} :: ${c.data_type}`);

    const sample = await sql`
      SELECT *
      FROM weapon_guns
      WHERE lower(name) LIKE '%panther%' OR lower(name) LIKE '%rhino%'
      LIMIT 5
    `;
    console.log(`\n  muestras Panther/Rhino: ${sample.length} filas`);
    for (const row of sample) {
      console.log(
        `    - ${row.name || row.id || "?"}`,
        JSON.stringify(
          Object.fromEntries(
            Object.entries(row).filter(([k]) =>
              /name|capac|ammo|pip|regen|size|damage/i.test(k)
            )
          )
        )
      );
    }
  } catch (e) {
    console.log("  Error leyendo weapon_guns:", e.message);
  }
} finally {
  await sql.end({ timeout: 5 });
}
