#!/usr/bin/env node
// =============================================================================
// SC Labs — Quantum Interdiction Generator importer (from scunpacked/items.json)
//
// Lee scunpacked/items.json, filtra items con type="QuantumInterdictionGenerator"
// y hace UPSERT idempotente en quantum_interdiction_generators.
//
// Uso:
//   node scripts/import-qigs.mjs               # aplica a Supabase
//   node scripts/import-qigs.mjs --dry         # plan, sin escribir
//
// Variables de entorno:
//   DATABASE_URL / DIRECT_URL  Supabase Postgres
//   SCUNPACKED_LOCAL_PATH      ruta al scunpacked-data. Default: ./scunpacked
//   GAME_VERSION               default: 4.7.0-LIVE.11518367
//
// DECISIONES
//   · Power consumption: extraído del ResourceNetwork.States[Online].Deltas
//     filtrando Type="Consumption" AND Resource="Power". El Rate es el
//     consumo base; si hay MinimumFraction < 1, el consumption_min =
//     Rate * MinimumFraction y el consumption_max = Rate. Si no hay state
//     Online (algunos templates), usamos el primer state que tenga Power.
//   · Emissions: stdItem.Emission.Em.{Maximum,Minimum,Decay} + Emission.Ir.
//     Si Ir es un número usamos ese valor; si es un objeto {Maximum...}
//     tomamos Maximum.
//   · Stats funcionales: vienen del std.QuantumInterdictionGenerator (fracciones
//     de power, Jammer.MaxPowerDraw, Pulse.{ChargeTimeSecs, DischargeTimeSecs,
//     CooldownTimeSecs, RadiusMeters}, JammingRange, InterdictionRange).
//   · UPSERT por PK compuesta (uuid, game_version). No borra rows — sólo
//     sobrescribe las columnas que llenamos.
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

/**
 * Del ResourceNetwork.States busca el state "Online" (o fallback al primero
 * con Power). Devuelve {min, max} del consumo.
 */
function extractPower(std) {
  const rn = std?.ResourceNetwork;
  const states = Array.isArray(rn?.States) ? rn.States : [];
  if (states.length === 0) return { min: null, max: null };
  // Priorizar state Online; fallback al primero con Power.
  let chosen = states.find((s) => s?.Name === "Online");
  if (!chosen) {
    chosen = states.find((s) =>
      (s?.Deltas || []).some(
        (d) => d?.Type === "Consumption" && d?.Resource === "Power",
      ),
    );
  }
  if (!chosen) return { min: null, max: null };
  const pwrDelta = (chosen.Deltas || []).find(
    (d) => d?.Type === "Consumption" && d?.Resource === "Power",
  );
  if (!pwrDelta) return { min: null, max: null };
  const rate = numOrNull(pwrDelta.Rate);
  if (rate === null) return { min: null, max: null };
  const minFrac = numOrNull(pwrDelta.MinimumFraction) ?? 1;
  return { min: rate * minFrac, max: rate };
}

/** Emisiones: {em_max, em_min, em_decay, ir_max}. */
function extractEmission(std) {
  const emObj = std?.Emission?.Em ?? {};
  const ir = std?.Emission?.Ir;
  const irMax =
    typeof ir === "number"
      ? ir
      : numOrNull(ir?.Maximum) ?? numOrNull(ir);
  return {
    em_max: numOrNull(emObj.Maximum),
    em_min: numOrNull(emObj.Minimum),
    em_decay: numOrNull(emObj.Decay),
    ir_max: irMax,
  };
}

// ---------------------------------------------------------------------------
// Load items.json
// ---------------------------------------------------------------------------

const itemsPath = path.join(SCUNPACKED, "items.json");
if (!fs.existsSync(itemsPath)) {
  console.error(`[ERR] No se encuentra ${itemsPath}`);
  console.error(`      SCUNPACKED_LOCAL_PATH apunta a ${SCUNPACKED}.`);
  console.error(`      Tip: curl -L -o ${SCUNPACKED}/items.json https://media.githubusercontent.com/media/StarCitizenWiki/scunpacked-data/master/items.json`);
  process.exit(1);
}

console.log(`[INFO] Leyendo ${itemsPath}…`);
const items = JSON.parse(fs.readFileSync(itemsPath, "utf8"));
const qigs = items.filter((it) => it.type === "QuantumInterdictionGenerator");
console.log(`[INFO] QIG candidatos: ${qigs.length}`);

const rows = qigs.map((it) => {
  const std = it.stdItem || {};
  const qig = std.QuantumInterdictionGenerator || {};
  const pulse = qig.Pulse || {};
  const jammer = qig.Jammer || {};
  const mfg = std.Manufacturer || {};
  const power = extractPower(std);
  const em = extractEmission(std);

  return {
    uuid: it.reference || std.UUID,
    game_version: GAME_VERSION,
    name: it.name || std.Name || null,
    class_name: it.className || null,
    description: std.DescriptionText || std.Description || null,
    manufacturer_code: mfg.Code || it.manufacturer || null,
    size: numOrNull(it.size ?? std.Size),
    grade: numOrNull(it.grade ?? std.Grade),
    // Existing functional stats
    jamming_range: numOrNull(qig.JammingRange),
    interdiction_range: numOrNull(qig.InterdictionRange),
    pulse_charge_time: numOrNull(pulse.ChargeTimeSecs),
    pulse_radius: numOrNull(pulse.RadiusMeters),
    // New fields (migration 057)
    power_consumption_min: power.min,
    power_consumption_max: power.max,
    em_max: em.em_max,
    em_min: em.em_min,
    em_decay: em.em_decay,
    ir_max: em.ir_max,
    pulse_discharge_time: numOrNull(pulse.DischargeTimeSecs),
    pulse_cooldown_time: numOrNull(pulse.CooldownTimeSecs),
    jammer_max_power_draw: numOrNull(jammer.MaxPowerDraw),
    base_power_draw_fraction: numOrNull(qig.BasePowerDrawFraction),
    pulse_power_fraction: numOrNull(qig.PulsePowerFraction),
    jammer_power_fraction: numOrNull(qig.JammerPowerFraction),
    raw_data: std,
  };
});

// Dedup
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
  console.log(
    `  ${(r.class_name || "?").padEnd(36)} ${(r.name || "?").padEnd(22)} s=${r.size} ` +
      `pwr=${r.power_consumption_min?.toFixed(2) ?? "—"}/${r.power_consumption_max?.toFixed(2) ?? "—"} ` +
      `em=${r.em_max ?? "—"} jamPwr=${r.jammer_max_power_draw ?? "—"} ` +
      `jamR=${r.jamming_range} interdictR=${r.interdiction_range}`,
  );
}

if (DRY) {
  console.log("[DRY] Sin escritura.");
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
  const mfgs = await sql`SELECT id, code FROM manufacturers WHERE code IS NOT NULL`;
  const mfgMap = new Map(mfgs.map((m) => [String(m.code).toUpperCase(), m.id]));
  console.log(`[INFO] ${mfgMap.size} manufacturers cargados.`);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const r of dedup) {
    const manufacturer_id = r.manufacturer_code
      ? mfgMap.get(String(r.manufacturer_code).toUpperCase()) || null
      : null;
    try {
      const res = await sql`
        INSERT INTO quantum_interdiction_generators (
          uuid, game_version, name, class_name, description,
          manufacturer_id, size, grade,
          jamming_range, interdiction_range, pulse_charge_time, pulse_radius,
          power_consumption_min, power_consumption_max,
          em_max, em_min, em_decay, ir_max,
          pulse_discharge_time, pulse_cooldown_time,
          jammer_max_power_draw,
          base_power_draw_fraction, pulse_power_fraction, jammer_power_fraction,
          raw_data
        ) VALUES (
          ${r.uuid}, ${r.game_version}, ${r.name}, ${r.class_name}, ${r.description},
          ${manufacturer_id}, ${r.size}, ${r.grade},
          ${r.jamming_range}, ${r.interdiction_range}, ${r.pulse_charge_time}, ${r.pulse_radius},
          ${r.power_consumption_min}, ${r.power_consumption_max},
          ${r.em_max}, ${r.em_min}, ${r.em_decay}, ${r.ir_max},
          ${r.pulse_discharge_time}, ${r.pulse_cooldown_time},
          ${r.jammer_max_power_draw},
          ${r.base_power_draw_fraction}, ${r.pulse_power_fraction}, ${r.jammer_power_fraction},
          ${sql.json(r.raw_data)}
        )
        ON CONFLICT (uuid, game_version) DO UPDATE SET
          name                     = EXCLUDED.name,
          class_name               = EXCLUDED.class_name,
          description              = EXCLUDED.description,
          manufacturer_id          = EXCLUDED.manufacturer_id,
          size                     = EXCLUDED.size,
          grade                    = EXCLUDED.grade,
          jamming_range            = EXCLUDED.jamming_range,
          interdiction_range       = EXCLUDED.interdiction_range,
          pulse_charge_time        = EXCLUDED.pulse_charge_time,
          pulse_radius             = EXCLUDED.pulse_radius,
          power_consumption_min    = EXCLUDED.power_consumption_min,
          power_consumption_max    = EXCLUDED.power_consumption_max,
          em_max                   = EXCLUDED.em_max,
          em_min                   = EXCLUDED.em_min,
          em_decay                 = EXCLUDED.em_decay,
          ir_max                   = EXCLUDED.ir_max,
          pulse_discharge_time     = EXCLUDED.pulse_discharge_time,
          pulse_cooldown_time      = EXCLUDED.pulse_cooldown_time,
          jammer_max_power_draw    = EXCLUDED.jammer_max_power_draw,
          base_power_draw_fraction = EXCLUDED.base_power_draw_fraction,
          pulse_power_fraction     = EXCLUDED.pulse_power_fraction,
          jammer_power_fraction    = EXCLUDED.jammer_power_fraction,
          raw_data                 = EXCLUDED.raw_data
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
  const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM quantum_interdiction_generators WHERE game_version = ${GAME_VERSION}`;
  console.log(`[OK] Total en tabla para ${GAME_VERSION}: ${count}`);
  await sql.end();
}

main().catch((e) => {
  console.error("[FATAL]", e);
  process.exit(1);
});
