#!/usr/bin/env node
// =============================================================================
// SC Labs — Concept ships importer (Fase R.2)
//
// Lee /tmp/sc-vehicles/fy*.json (dump de fleetyards.net), filtra por
// productionStatus='in-concept', y hace INSERT idempotente en `ships` +
// `ship_price` para las naves que aún no están en la BD.
//
// flight_status='concept' para todas. Si onSale=true en fleetyards
// (concepto que se está vendiendo activamente) se inserta el pledgePrice
// como msrp_usd; si no, queda null.
//
// Uso: SCUNPACKED_LOCAL_PATH=/tmp/sc-vehicles node scripts/import-concept-ships.mjs
// (la variable apunta al directorio con los fy*.json)
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import "dotenv/config";

const SOURCE_DIR = process.env.FLEETYARDS_DIR || "/tmp/sc-vehicles";
const DATABASE_URL = process.env.DIRECT_URL || process.env.DATABASE_URL;
const DRY = process.argv.includes("--dry");

if (!DATABASE_URL && !DRY) {
  console.error("[ERR] DATABASE_URL no seteada");
  process.exit(1);
}

// ── Manufacturer code → UUID (canonical, los más usados por ships) ───────────
const MFR_BY_CODE = {
  RSI:  "093e6eba-93fa-4dad-b3dd-38966934e34e",
  ANVL: "b922abdb-0634-4358-9eee-60118f3cf3a7",
  AEGS: "cf4a74bf-eb2c-462a-9b78-f7f2724c31d2", // Aegis Dynamics (AEG en BD)
  DRAK: "6116471c-891d-4830-8968-650b6deafc00",
  MISC: "74b1d2f4-f820-4935-a25c-b11f68d72f55", // Musashi (MIS en BD)
  ORIG: "1e47a9ec-a3f0-431d-be0e-377712e1ed84",
  CRUS: "63685f47-b0cc-4ebe-8f16-72793a5cd6e0",
  CNOU: "ec227ef3-fb08-4897-abdb-579eb4e87c25",
  TMBL: "bb1024bc-b82e-491c-820c-36662c36feb3",
  GAMA: "31907472-a884-4ebc-86db-cd4f7797e514", // Gatac (GAM en BD)
  BANU: "2b5ba252-e826-4356-ac0d-8d88007ea386",
};

const KEEP_CAPS = new Set([
  "cv","rc","tr","mr","mk","mh","dur","max","mis","ex","lx","qi","ii","iii","i",
  "a","r","b","c","d","e",
]);

function toClassName(scId, mfrCode) {
  const parts = scId.split("_");
  const rest = parts.slice(1);
  const mapped = rest.map((p) => {
    if (KEEP_CAPS.has(p.toLowerCase())) return p.toUpperCase();
    if (p.length <= 2) return p.toUpperCase();
    return p[0].toUpperCase() + p.slice(1).toLowerCase();
  });
  return mfrCode + "_" + mapped.join("_");
}

// ── Parse fleetyards dump ─────────────────────────────────────────────────────
const dumpFiles = fs.readdirSync(SOURCE_DIR)
  .filter((f) => /^fy\d+\.json$/.test(f))
  .map((f) => path.join(SOURCE_DIR, f));

if (dumpFiles.length === 0) {
  console.error(`[ERR] No fy*.json files in ${SOURCE_DIR}`);
  process.exit(1);
}

const all = [];
for (const f of dumpFiles) {
  try {
    const d = JSON.parse(fs.readFileSync(f, "utf8"));
    all.push(...(d.items || []));
  } catch {}
}
console.log(`[INFO] Total ships from fleetyards: ${all.length}`);

const concepts = all.filter((s) => s.productionStatus === "in-concept");
console.log(`[INFO] In-concept: ${concepts.length}`);

// Display name por manufacturer (cómo se muestra el prefijo de la nave en SC Labs).
// "Roberts Space Industries" → "RSI", etc.
const MFR_DISPLAY = {
  RSI: "RSI", ANVL: "Anvil", AEGS: "Aegis", DRAK: "Drake", MISC: "MISC",
  ORIG: "Origin", CRUS: "Crusader", CNOU: "Consolidated Outland",
  TMBL: "Tumbril", GAMA: "Gatac", BANU: "Banu",
};

// Resolver class_name + manufacturer_id
const planned = concepts.map((c) => {
  const mfrCode = (c.manufacturer || {}).code || "";
  const className = toClassName(c.scIdentifier, mfrCode);
  const mfrId = MFR_BY_CODE[mfrCode] ?? null;
  const displayPrefix = MFR_DISPLAY[mfrCode] || mfrCode;
  return {
    className,
    name: `${displayPrefix} ${c.name}`,
    role: c.classification || null,
    crew: c.crew?.max ?? null,
    description: c.description ?? null,
    focus: c.focus || null,
    mfrId,
    msrp: c.pledgePrice && c.onSale ? Number(c.pledgePrice) : null,
    pledgePriceLabel: c.pledgePriceLabel,
    onSale: !!c.onSale,
    isLimited: false, // Si más adelante aparece info, el usuario lo marca a mano
    image: (c.media?.angledView?.url) || null,
    storeUrl: c.links?.storeUrl ?? null,
  };
});

// ── Aplicar a Supabase ────────────────────────────────────────────────────────
const sql = postgres(DATABASE_URL, { ssl: "require", prepare: false, max: 1 });

async function main() {
  console.log(`\n[INFO] Conectando a ${DATABASE_URL.split("@")[1]?.split("/")[0]}…`);

  // Quiénes ya existen?
  const existingClasses = new Set(
    (await sql`SELECT class_name FROM ships`).map((r) => r.class_name),
  );

  let inserted = 0, skippedExists = 0, skippedNoMfr = 0, priceInserts = 0;
  for (const p of planned) {
    if (existingClasses.has(p.className)) {
      console.log(`  ↩ EXISTS  ${p.className}`);
      skippedExists++;
      continue;
    }
    if (!p.mfrId) {
      console.log(`  ✗ NO MFR  ${p.className}  (mfr code missing)`);
      skippedNoMfr++;
      continue;
    }
    if (DRY) {
      console.log(`  + DRY     ${p.className.padEnd(30)} | ${p.name.padEnd(28)} | concept | msrp=${p.msrp}`);
      continue;
    }
    try {
      // INSERT en ships
      const [{ id }] = await sql`
        INSERT INTO ships (
          class_name, name, role, crew, description,
          manufacturer_id, flight_status, game_version,
          is_spaceship, is_vehicle, is_gravlev,
          imported_at
        ) VALUES (
          ${p.className}, ${p.name}, ${p.role}, ${p.crew}, ${p.description},
          ${p.mfrId}, 'concept', '4.7.0-LIVE.11518367',
          true, false, false,
          NOW()
        )
        RETURNING id
      `;
      // Y el row de ship_price (con msrp si está on-sale, sino null pero
      // necesitamos la fila para el JOIN que hace ships listing API)
      await sql`
        INSERT INTO ship_price (id, msrp_usd, warbond_usd, is_ccu_eligible, is_limited, acquisition_method)
        VALUES (${id}, ${p.msrp}, ${null}, false, ${p.isLimited}, 'STORE')
        ON CONFLICT (id) DO UPDATE SET
          msrp_usd = COALESCE(EXCLUDED.msrp_usd, ship_price.msrp_usd),
          is_limited = EXCLUDED.is_limited
      `;
      priceInserts++;
      inserted++;
      console.log(`  ✓ INSERT  ${p.className.padEnd(30)} | ${p.name.padEnd(28)} | concept | msrp=${p.msrp ?? "—"}`);
    } catch (e) {
      console.error(`  ✗ ERR     ${p.className}: ${e.message}`);
    }
  }

  console.log(`\n[OK] inserted=${inserted}  exists=${skippedExists}  noMfr=${skippedNoMfr}  priceRows=${priceInserts}`);
  await sql.end();
}

main().catch((e) => { console.error("[FATAL]", e); process.exit(1); });
