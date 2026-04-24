#!/usr/bin/env node
// =============================================================================
// SC Labs — Weapon Salvage importer (from scunpacked/items.json)
//
// Lee scunpacked/items.json, filtra items con type="SalvageHead" o
// type="SalvageModifier", y hace UPSERT idempotente en weapon_salvage.
//
// Uso:
//   node scripts/import-weapon-salvage.mjs               # aplica a Supabase
//   node scripts/import-weapon-salvage.mjs --dry         # sólo imprime el plan
//
// Variables de entorno:
//   DATABASE_URL / DIRECT_URL  Supabase Postgres (obligatoria)
//   SCUNPACKED_LOCAL_PATH      ruta al scunpacked-data. Default: ./scunpacked
//   GAME_VERSION               override. Default: 4.7.0-LIVE.11518367
//
// DECISIONES
//   · Una sola tabla (weapon_salvage) con sub_type Head|Modifier — mismo
//     patrón que weapon_attachments.
//   · PK compuesta (id, game_version) — convención de Garnok; permite
//     múltiples patches sin romper historia.
//   · modifier_kind derivado del className: 'Tractor' si className contiene
//     "Tractor", 'Scraper' si contiene "Scraper", NULL para Head.
//   · manufacturer_id buscado por code (GRIN/MISC/RSI/DRAK) contra la
//     tabla manufacturers; NULL si no hace match (placeholders/templates).
//   · ON CONFLICT (id, game_version) DO UPDATE para re-ejecutar sin errores.
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import "dotenv/config";

const SCUNPACKED    = process.env.SCUNPACKED_LOCAL_PATH || "./scunpacked";
const GAME_VERSION  = process.env.GAME_VERSION || "4.7.0-LIVE.11518367";
const DATABASE_URL  = process.env.DIRECT_URL || process.env.DATABASE_URL;
const DRY           = process.argv.includes("--dry");

if (!DATABASE_URL && !DRY) {
  console.error("[ERR] DATABASE_URL / DIRECT_URL no seteada");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveModifierKind(className) {
  const n = String(className || "").toLowerCase();
  if (n.includes("tractor")) return "Tractor";
  if (n.includes("scraper")) return "Scraper";
  return null;
}

function numOrNull(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Load items.json
// ---------------------------------------------------------------------------

const itemsPath = path.join(SCUNPACKED, "items.json");
if (!fs.existsSync(itemsPath)) {
  console.error(`[ERR] No se encuentra ${itemsPath}`);
  console.error(`      SCUNPACKED_LOCAL_PATH apunta a ${SCUNPACKED}. Revisá o descargá el repo:`);
  console.error(`      curl -L -o ${SCUNPACKED}/items.json https://media.githubusercontent.com/media/StarCitizenWiki/scunpacked-data/master/items.json`);
  process.exit(1);
}

console.log(`[INFO] Leyendo ${itemsPath}…`);
const items = JSON.parse(fs.readFileSync(itemsPath, "utf8"));
console.log(`[INFO] Total items en fuente: ${items.length}`);

const salvage = items.filter(
  (it) => it.type === "SalvageHead" || it.type === "SalvageModifier"
);
console.log(`[INFO] SalvageHead + SalvageModifier candidatos: ${salvage.length}`);

// ---------------------------------------------------------------------------
// Build rows
// ---------------------------------------------------------------------------

const rows = salvage.map((it) => {
  const std = it.stdItem || {};
  const mod = std.SalvageModifier || {};
  const mfg = std.Manufacturer || {};
  const subType = it.type === "SalvageHead" ? "Head" : "Modifier";
  const modifierKind = subType === "Modifier" ? deriveModifierKind(it.className) : null;

  return {
    id: it.reference || std.UUID,
    game_version: GAME_VERSION,
    class_name: it.className,
    item_name: it.itemName || null,
    name: it.name || std.Name || null,
    description: std.DescriptionText || std.Description || null,
    manufacturer_code: mfg.Code || it.manufacturer || null,
    sub_type: subType,
    modifier_kind: modifierKind,
    size: numOrNull(it.size ?? std.Size),
    grade: numOrNull(it.grade ?? std.Grade),
    salvage_speed_multiplier: numOrNull(mod.SalvageSpeedMultiplier),
    radius_multiplier: numOrNull(mod.RadiusMultiplier),
    extraction_efficiency: numOrNull(mod.ExtractionEfficiency),
    mass: numOrNull(std.Mass),
    width: numOrNull(std.Width),
    height: numOrNull(std.Height),
    length: numOrNull(std.Length),
    scu: numOrNull(std.InventoryOccupancy?.Volume?.SCU),
    raw_data: std,
  };
});

// Dedup por id+game_version (por si scunpacked tiene duplicados)
const seen = new Set();
const dedup = [];
for (const r of rows) {
  if (!r.id) continue;
  const k = `${r.id}|${r.game_version}`;
  if (seen.has(k)) continue;
  seen.add(k);
  dedup.push(r);
}

console.log(`[INFO] Filas únicas a importar: ${dedup.length}`);
console.log(
  `       Breakdown sub_type: ` +
    JSON.stringify(
      dedup.reduce((acc, r) => {
        const k = r.sub_type + (r.modifier_kind ? `/${r.modifier_kind}` : "");
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {})
    )
);

if (DRY) {
  console.log("\n[DRY] Primeras 3 filas:");
  dedup.slice(0, 3).forEach((r) => {
    const { raw_data, ...rest } = r;
    console.log("  " + JSON.stringify(rest));
  });
  console.log("[DRY] (no se escribió a Supabase)");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Upsert
// ---------------------------------------------------------------------------

const sql = postgres(DATABASE_URL, {
  ssl: "require",
  prepare: false,
  max: 1,
  idle_timeout: 20,
  connect_timeout: 30,
});

async function main() {
  console.log(`\n[INFO] Conectando a ${DATABASE_URL.split("@")[1]?.split("/")[0]}…`);

  // Build manufacturer_code → id lookup (single query)
  const mfgs = await sql`SELECT id, code FROM manufacturers WHERE code IS NOT NULL`;
  const mfgMap = new Map(mfgs.map((m) => [String(m.code).toUpperCase(), m.id]));
  console.log(`[INFO] ${mfgMap.size} manufacturers cargados en lookup.`);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const r of dedup) {
    const manufacturer_id = r.manufacturer_code
      ? mfgMap.get(String(r.manufacturer_code).toUpperCase()) || null
      : null;

    try {
      const res = await sql`
        INSERT INTO weapon_salvage (
          id, game_version, class_name, item_name, name, description,
          manufacturer_id, sub_type, modifier_kind, size, grade,
          salvage_speed_multiplier, radius_multiplier, extraction_efficiency,
          mass, width, height, length, scu, raw_data
        )
        VALUES (
          ${r.id}, ${r.game_version}, ${r.class_name}, ${r.item_name},
          ${r.name}, ${r.description},
          ${manufacturer_id}, ${r.sub_type}, ${r.modifier_kind},
          ${r.size}, ${r.grade},
          ${r.salvage_speed_multiplier}, ${r.radius_multiplier}, ${r.extraction_efficiency},
          ${r.mass}, ${r.width}, ${r.height}, ${r.length}, ${r.scu},
          ${sql.json(r.raw_data)}
        )
        ON CONFLICT (id, game_version) DO UPDATE SET
          class_name              = EXCLUDED.class_name,
          item_name               = EXCLUDED.item_name,
          name                    = EXCLUDED.name,
          description             = EXCLUDED.description,
          manufacturer_id         = EXCLUDED.manufacturer_id,
          sub_type                = EXCLUDED.sub_type,
          modifier_kind           = EXCLUDED.modifier_kind,
          size                    = EXCLUDED.size,
          grade                   = EXCLUDED.grade,
          salvage_speed_multiplier= EXCLUDED.salvage_speed_multiplier,
          radius_multiplier       = EXCLUDED.radius_multiplier,
          extraction_efficiency   = EXCLUDED.extraction_efficiency,
          mass                    = EXCLUDED.mass,
          width                   = EXCLUDED.width,
          height                  = EXCLUDED.height,
          length                  = EXCLUDED.length,
          scu                     = EXCLUDED.scu,
          raw_data                = EXCLUDED.raw_data
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

  const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM weapon_salvage WHERE game_version = ${GAME_VERSION}`;
  console.log(`[OK] Total en weapon_salvage para ${GAME_VERSION}: ${count}`);

  await sql.end();
}

main().catch((e) => {
  console.error("[FATAL]", e);
  process.exit(1);
});
