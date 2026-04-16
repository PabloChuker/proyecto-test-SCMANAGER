#!/usr/bin/env node
/**
 * ingest_phase3_fast.mjs — Bulk-load ship hardpoint stock loadout data.
 *
 * Strategy: Build all rows in memory, insert into a staging table via
 * a single bulk COPY, then do one UPDATE ... FROM staging query.
 */

import "dotenv/config";
import postgres from "postgres";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SCUNPACKED = join(ROOT, "scunpacked");

const connectionString = process.env.DATABASE_URL ?? process.env.DIRECT_URL ?? "";
if (!connectionString) { console.error("❌ No DATABASE_URL"); process.exit(1); }

const sql = postgres(connectionString, { max: 3, idle_timeout: 20, connect_timeout: 15, prepare: false });

function loadJSON(p) { return JSON.parse(readFileSync(p, "utf8")); }

console.log("═══════════════════════════════════════════════════════════════");
console.log("  Phase 3: Bulk hardpoint stock loadout ingest");
console.log("═══════════════════════════════════════════════════════════════");

const t0 = Date.now();

// 1. Pre-load reference→id
const rows = await sql`SELECT id, reference FROM ships WHERE reference IS NOT NULL`;
const refToId = {};
for (const r of rows) refToId[r.reference?.toLowerCase()] = r.id;
console.log(`Mapped ${Object.keys(refToId).length} ships`);

// 2. Collect all hardpoint updates
const shipsDir = join(SCUNPACKED, "ships");
const shipFiles = readdirSync(shipsDir).filter(f => f.endsWith(".json"));
console.log(`Found ${shipFiles.length} ship files`);

const hpRows = [];
for (const file of shipFiles) {
  try {
    const shipData = loadJSON(join(shipsDir, file));
    const cn = shipData.ClassName;
    const dbId = refToId[cn?.toLowerCase()];
    if (!dbId) continue;

    const loadout = shipData.Loadout ?? [];
    let posIdx = 0;
    for (const hp of loadout) {
      if (!hp.HardpointName) continue;
      hpRows.push({
        ship_ref: cn,
        hp_name: hp.HardpointName,
        ship_id: dbId,
        stock_loadout: JSON.stringify(hp),
        position_index: posIdx++,
      });
    }
  } catch (err) {
    console.error(`⚠ ${file}: ${err.message}`);
  }
}
console.log(`Collected ${hpRows.length} hardpoint updates`);

// 3. Create staging table, bulk insert, then update
console.log("Creating staging table...");
await sql`DROP TABLE IF EXISTS _hp_staging`;
await sql`CREATE TEMP TABLE _hp_staging (
  ship_ref text,
  hp_name text,
  ship_id uuid,
  stock_loadout jsonb,
  position_index int
)`;

// Bulk insert in chunks of 500
const CHUNK = 500;
let inserted = 0;
for (let i = 0; i < hpRows.length; i += CHUNK) {
  const chunk = hpRows.slice(i, i + CHUNK);
  await sql`INSERT INTO _hp_staging ${sql(chunk, "ship_ref", "hp_name", "ship_id", "stock_loadout", "position_index")}`;
  inserted += chunk.length;
  process.stdout.write(`\rInserted: ${inserted}/${hpRows.length}`);
}
console.log("");

// 4. Single UPDATE from staging
console.log("Running bulk UPDATE...");
const result = await sql`
  UPDATE ship_hardpoints sh SET
    ship_id = stg.ship_id,
    stock_loadout = stg.stock_loadout,
    position_index = stg.position_index
  FROM _hp_staging stg
  WHERE sh.ship_reference = stg.ship_ref
    AND sh.hardpoint_name = stg.hp_name`;
console.log(`Updated ${result.count} hardpoint rows`);

// 5. Cleanup
await sql`DROP TABLE IF EXISTS _hp_staging`;

// Phase 4: multi_pp_ratio
console.log("\n⚡ Phase 4: multi_pp_ratio...");
const p4 = await sql`
  WITH ship_pp AS (
    SELECT sh.ship_id, SUM(pp.power_generation) AS total_gen_catalog
    FROM ship_hardpoints sh
    JOIN power_plants pp ON pp.class_name = sh.stock_loadout->>'ClassName'
    WHERE sh.hardpoint_type = 'PowerPlant' AND sh.ship_id IS NOT NULL
    GROUP BY sh.ship_id
  )
  UPDATE ship_power_reference spr
  SET multi_pp_ratio = CASE WHEN spp.total_gen_catalog > 0
    THEN spr.power_generation_segments / spp.total_gen_catalog ELSE NULL END,
    computed_at = now()
  FROM ship_pp spp WHERE spr.ship_id = spp.ship_id`;
console.log(`Updated ${p4.count} ships with multi_pp_ratio`);

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\n✅ Done in ${elapsed}s`);
await sql.end();
