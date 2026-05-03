#!/usr/bin/env node
// =============================================================================
// load_rsi_prices_canonical.mjs
// =============================================================================
// Carga `data/rsi_prices_canonical.json` (extraído del Star Citizen Wiki) en la
// tabla `ship_prices_canonical` (ver migración 067).
//
// Usa postgres.js + DATABASE_URL del .env para saltar RLS (consistente con el
// patrón de import-uex-prices.mjs).
//
// Ejecución:
//   node scripts/load_rsi_prices_canonical.mjs              # carga + match nombres
//   node scripts/load_rsi_prices_canonical.mjs --dry-run    # solo reporta, no escribe
//
// Idempotente: usa UPSERT ON CONFLICT (ship_name) DO UPDATE.
// =============================================================================

import 'dotenv/config';
import postgres from 'postgres';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'data', 'rsi_prices_canonical.json');
const DRY_RUN = process.argv.includes('--dry-run');

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error('ERROR: DATABASE_URL no está definido en .env');
  process.exit(1);
}

// ── Parser helpers ───────────────────────────────────────────────────────────

function parseAuec(value) {
  // "1,117,935 aUEC" → 1117935
  if (value == null || value === '') return null;
  if (typeof value === 'number') return value;
  const m = String(value).match(/[\d,]+(?:\.\d+)?/);
  if (!m) return null;
  return Number(m[0].replace(/,/g, ''));
}

function parseDate(value) {
  // El JSON ya tiene ISO strings de python (ej "2018-04-18T00:00:00").
  if (!value) return null;
  if (value instanceof Date) return value;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d;
}

function normalizeShipName(name) {
  // Para matching fuzzy: lowercase + sin espacios extras + sin manufacturer.
  // "RSI Constellation Andromeda" → "constellation andromeda"
  // "Anvil Hornet F7C-R Tracker" → "hornet f7c-r tracker"
  return String(name)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(JSON_PATH)) {
    console.error(`ERROR: ${JSON_PATH} no existe. Generalo primero con el extractor xlsx.`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  console.log(`✓ Cargado ${raw.length} ships desde JSON`);

  // Conexión Postgres
  const sql = postgres(DB_URL, {
    ssl: 'require',
    max: 1,
    idle_timeout: 5,
    connect_timeout: 30,
  });

  try {
    // ── 1. Cargar todos los ships de la BD una vez para matching ──
    const dbShips = await sql`SELECT id, name FROM ships`;
    console.log(`✓ ${dbShips.length} ships en BD para matching`);

    // Mapa por nombre normalizado → uuid
    const nameToId = new Map();
    for (const row of dbShips) {
      nameToId.set(normalizeShipName(row.name), row.id);
    }

    // Match función — intenta exact match, después fuzzy (contains both ways).
    function findShipId(rsiName) {
      const norm = normalizeShipName(rsiName);
      // Exact
      if (nameToId.has(norm)) return nameToId.get(norm);
      // Fuzzy: BD name termina con RSI name (ej "Aegis Aurora MR" ends with "Aurora MR")
      for (const [bdName, id] of nameToId) {
        if (bdName.endsWith(' ' + norm) || norm.endsWith(' ' + bdName)) return id;
      }
      // Substring (ej "Hornet F7C" matches "Anvil Hornet F7C Mk I")
      for (const [bdName, id] of nameToId) {
        if (bdName.includes(norm) || norm.includes(bdName)) return id;
      }
      return null;
    }

    // ── 2. Preparar rows ──
    const rows = [];
    let matched = 0;
    let unmatched = [];
    for (const r of raw) {
      const shipId = findShipId(r.name);
      if (shipId) matched++; else unmatched.push(r.name);
      rows.push({
        ship_name: r.name,
        ship_id: shipId,
        manufacturer: r.manufacturer || null,
        career: r.career || null,
        role: r.role || null,
        size: r.size || null,
        production_state: r.production_state || null,
        pledge_availability: r.pledge_availability || null,
        pledge_usd: r.pledge_usd != null ? Number(r.pledge_usd) : null,
        orig_pledge_usd: r.orig_pledge_usd != null ? Number(r.orig_pledge_usd) : null,
        warbond_usd: r.warbond_usd != null ? Number(r.warbond_usd) : null,
        orig_warbond_usd: r.orig_warbond_usd != null ? Number(r.orig_warbond_usd) : null,
        loaner: r.loaner || null,
        avg_purchase_auec: parseAuec(r.avg_purchase_auec),
        avg_daily_rental_auec: parseAuec(r.avg_daily_rental_auec),
        concept_date: parseDate(r.concept_date),
      });
    }

    console.log(`\n=== Match contra ships(id) ===`);
    console.log(`  Matched:   ${matched}/${rows.length} (${Math.round(100*matched/rows.length)}%)`);
    console.log(`  Unmatched: ${unmatched.length} (estos quedarán con ship_id=null)`);
    if (unmatched.length > 0 && unmatched.length <= 20) {
      console.log(`    ${unmatched.join(', ')}`);
    } else if (unmatched.length > 20) {
      console.log(`    Primeros 20: ${unmatched.slice(0, 20).join(', ')}`);
    }

    if (DRY_RUN) {
      console.log(`\n--- DRY RUN — sin escribir ---`);
      console.log(`Sample primeros 3 rows que se insertarían:`);
      console.log(JSON.stringify(rows.slice(0, 3), null, 2));
      return;
    }

    // ── 3. UPSERT batch ──
    console.log(`\nEscribiendo ${rows.length} rows en ship_prices_canonical...`);
    let inserted = 0;
    let updated = 0;

    for (const row of rows) {
      const result = await sql`
        INSERT INTO ship_prices_canonical (
          ship_name, ship_id, manufacturer, career, role, size,
          production_state, pledge_availability,
          pledge_usd, orig_pledge_usd, warbond_usd, orig_warbond_usd,
          loaner, avg_purchase_auec, avg_daily_rental_auec, concept_date,
          synced_at
        ) VALUES (
          ${row.ship_name}, ${row.ship_id}, ${row.manufacturer}, ${row.career}, ${row.role}, ${row.size},
          ${row.production_state}, ${row.pledge_availability},
          ${row.pledge_usd}, ${row.orig_pledge_usd}, ${row.warbond_usd}, ${row.orig_warbond_usd},
          ${row.loaner}, ${row.avg_purchase_auec}, ${row.avg_daily_rental_auec}, ${row.concept_date},
          NOW()
        )
        ON CONFLICT (ship_name) DO UPDATE SET
          ship_id              = EXCLUDED.ship_id,
          manufacturer         = EXCLUDED.manufacturer,
          career               = EXCLUDED.career,
          role                 = EXCLUDED.role,
          size                 = EXCLUDED.size,
          production_state     = EXCLUDED.production_state,
          pledge_availability  = EXCLUDED.pledge_availability,
          pledge_usd           = EXCLUDED.pledge_usd,
          orig_pledge_usd      = EXCLUDED.orig_pledge_usd,
          warbond_usd          = EXCLUDED.warbond_usd,
          orig_warbond_usd     = EXCLUDED.orig_warbond_usd,
          loaner               = EXCLUDED.loaner,
          avg_purchase_auec    = EXCLUDED.avg_purchase_auec,
          avg_daily_rental_auec= EXCLUDED.avg_daily_rental_auec,
          concept_date         = EXCLUDED.concept_date,
          synced_at            = NOW()
        RETURNING (xmax = 0) AS inserted
      `;
      if (result[0].inserted) inserted++; else updated++;
    }

    console.log(`✓ Done. Inserted: ${inserted}, Updated: ${updated}`);

    // ── 4. Verify counts ──
    const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM ship_prices_canonical`;
    const [{ count: linked }] = await sql`SELECT COUNT(*)::int AS count FROM ship_prices_canonical WHERE ship_id IS NOT NULL`;
    const [{ count: withWb }] = await sql`SELECT COUNT(*)::int AS count FROM ship_prices_canonical WHERE warbond_usd IS NOT NULL`;
    console.log(`\n=== Estado final de ship_prices_canonical ===`);
    console.log(`  Total rows:           ${count}`);
    console.log(`  Linked a ships(id):   ${linked} (${Math.round(100*linked/count)}%)`);
    console.log(`  Con warbond_usd real: ${withWb} (${Math.round(100*withWb/count)}%)`);

  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
