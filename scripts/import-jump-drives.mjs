#!/usr/bin/env node
// =============================================================================
// SC Labs — Jump Drive importer (from scunpacked/items.json)
//
// Lee scunpacked/items.json, filtra type="JumpDrive" y hace UPSERT idempotente
// en jump_drives.
//
// Uso:
//   node scripts/import-jump-drives.mjs            # aplica a Supabase
//   node scripts/import-jump-drives.mjs --dry      # plan, sin escribir
//
// Variables de entorno:
//   DATABASE_URL / DIRECT_URL  Supabase Postgres
//   SCUNPACKED_LOCAL_PATH      ruta al scunpacked-data. Default: ./scunpacked
//   GAME_VERSION               default: 4.7.0-LIVE.11518367
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import "dotenv/config";

const SCUNPACKED   = process.env.SCUNPACKED_LOCAL_PATH || "./scunpacked";
const GAME_VERSION = process.env.GAME_VERSION || "4.7.0-LIVE.11518367";
const DATABASE_URL = process.env.DIRECT_URL || process.env.DATABASE_URL;
const DRY          = process.argv.includes("--dry");

if (!DATABASE_URL && !DRY) {
  console.error("[ERR] DATABASE_URL / DIRECT_URL no seteada");
  process.exit(1);
}

function numOrNull(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const itemsPath = path.join(SCUNPACKED, "items.json");
if (!fs.existsSync(itemsPath)) {
  console.error(`[ERR] No existe ${itemsPath}`);
  process.exit(1);
}

console.log(`[INFO] Leyendo ${itemsPath}…`);
const items = JSON.parse(fs.readFileSync(itemsPath, "utf8"));
const jds = items.filter((it) => it.type === "JumpDrive");
console.log(`[INFO] JumpDrive candidatos: ${jds.length}`);

const rows = jds.map((it) => {
  const std = it.stdItem || {};
  const jd = std.JumpDrive || {};
  const dist = std.Distortion || {};
  const dura = std.Durability || {};
  const inv = std.InventoryOccupancy || {};
  const mfg = std.Manufacturer || {};
  return {
    uuid: it.reference || std.UUID,
    game_version: GAME_VERSION,
    name: it.name || std.Name || null,
    description: std.DescriptionText || std.Description || null,
    class_name: it.className,
    manufacturer_code: mfg.Code || it.manufacturer || null,
    size: numOrNull(it.size ?? std.Size),
    grade: numOrNull(it.grade ?? std.Grade),
    alignment_rate: numOrNull(jd.AlignmentRate),
    alignment_decay_rate: numOrNull(jd.AlignmentDecayRate),
    tuning_rate: numOrNull(jd.TuningRate),
    tuning_decay_rate: numOrNull(jd.TuningDecayRate),
    fuel_usage_efficiency_multiplier: numOrNull(jd.FuelUsageEfficiencyMultiplier),
    distortion_max: numOrNull(dist.Maximum),
    distortion_decay_rate: numOrNull(dist.DecayRate),
    distortion_decay_delay: numOrNull(dist.DecayDelay),
    distortion_warning_ratio: numOrNull(dist.WarningRatio),
    distortion_recovery_ratio: numOrNull(dist.RecoveryRatio),
    distortion_shutdown_time: numOrNull(dist.ShutdownTime),
    health: numOrNull(dura.Health),
    mass: numOrNull(std.Mass),
    width: numOrNull(std.Width),
    height: numOrNull(std.Height),
    length: numOrNull(std.Length),
    scu: numOrNull(inv.Volume?.SCU),
    raw_data: std,
  };
});

const seen = new Set();
const dedup = [];
for (const r of rows) {
  if (!r.uuid) continue;
  const k = `${r.uuid}|${r.game_version}`;
  if (seen.has(k)) continue;
  seen.add(k);
  dedup.push(r);
}

console.log(`[INFO] Filas únicas: ${dedup.length}`);
for (const r of dedup) {
  console.log(`  ${r.class_name?.padEnd(40)} ${(r.name||'?').padEnd(20)} s=${r.size} g=${r.grade}`);
}

if (DRY) {
  console.log("[DRY] Sin escritura.");
  process.exit(0);
}

const sql = postgres(DATABASE_URL, { ssl: "require", prepare: false, max: 1 });

async function main() {
  console.log(`\n[INFO] Conectando a ${DATABASE_URL.split("@")[1]?.split("/")[0]}…`);
  const mfgs = await sql`SELECT id, code FROM manufacturers WHERE code IS NOT NULL`;
  const mfgMap = new Map(mfgs.map((m) => [String(m.code).toUpperCase(), m.id]));

  let inserted = 0, updated = 0, skipped = 0;
  for (const r of dedup) {
    const manufacturer_id = r.manufacturer_code
      ? mfgMap.get(String(r.manufacturer_code).toUpperCase()) || null
      : null;
    try {
      const res = await sql`
        INSERT INTO jump_drives (
          uuid, game_version, name, description, class_name, manufacturer_id,
          size, grade,
          alignment_rate, alignment_decay_rate, tuning_rate, tuning_decay_rate,
          fuel_usage_efficiency_multiplier,
          distortion_max, distortion_decay_rate, distortion_decay_delay,
          distortion_warning_ratio, distortion_recovery_ratio, distortion_shutdown_time,
          health,
          mass, width, height, length, scu,
          raw_data
        ) VALUES (
          ${r.uuid}, ${r.game_version}, ${r.name}, ${r.description}, ${r.class_name}, ${manufacturer_id},
          ${r.size}, ${r.grade},
          ${r.alignment_rate}, ${r.alignment_decay_rate}, ${r.tuning_rate}, ${r.tuning_decay_rate},
          ${r.fuel_usage_efficiency_multiplier},
          ${r.distortion_max}, ${r.distortion_decay_rate}, ${r.distortion_decay_delay},
          ${r.distortion_warning_ratio}, ${r.distortion_recovery_ratio}, ${r.distortion_shutdown_time},
          ${r.health},
          ${r.mass}, ${r.width}, ${r.height}, ${r.length}, ${r.scu},
          ${sql.json(r.raw_data)}
        )
        ON CONFLICT (uuid, game_version) DO UPDATE SET
          name                              = EXCLUDED.name,
          description                       = EXCLUDED.description,
          class_name                        = EXCLUDED.class_name,
          manufacturer_id                   = EXCLUDED.manufacturer_id,
          size                              = EXCLUDED.size,
          grade                             = EXCLUDED.grade,
          alignment_rate                    = EXCLUDED.alignment_rate,
          alignment_decay_rate              = EXCLUDED.alignment_decay_rate,
          tuning_rate                       = EXCLUDED.tuning_rate,
          tuning_decay_rate                 = EXCLUDED.tuning_decay_rate,
          fuel_usage_efficiency_multiplier  = EXCLUDED.fuel_usage_efficiency_multiplier,
          distortion_max                    = EXCLUDED.distortion_max,
          distortion_decay_rate             = EXCLUDED.distortion_decay_rate,
          distortion_decay_delay            = EXCLUDED.distortion_decay_delay,
          distortion_warning_ratio          = EXCLUDED.distortion_warning_ratio,
          distortion_recovery_ratio         = EXCLUDED.distortion_recovery_ratio,
          distortion_shutdown_time          = EXCLUDED.distortion_shutdown_time,
          health                            = EXCLUDED.health,
          mass                              = EXCLUDED.mass,
          width                             = EXCLUDED.width,
          height                            = EXCLUDED.height,
          length                            = EXCLUDED.length,
          scu                               = EXCLUDED.scu,
          raw_data                          = EXCLUDED.raw_data
        RETURNING (xmax = 0) AS inserted
      `;
      if (res[0]?.inserted) inserted++;
      else updated++;
    } catch (e) {
      console.error(`[ERR] ${r.class_name}: ${e.message}`);
      skipped++;
    }
  }
  console.log(`\n[OK] Inserted: ${inserted} | Updated: ${updated} | Skipped: ${skipped}`);
  const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM jump_drives WHERE game_version = ${GAME_VERSION}`;
  console.log(`[OK] Total: ${count}`);
  await sql.end();
}

main().catch((e) => { console.error("[FATAL]", e); process.exit(1); });
