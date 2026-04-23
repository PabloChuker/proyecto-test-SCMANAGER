#!/usr/bin/env node
// =============================================================================
// SC Labs — Bomb importer (from scunpacked/items.json)
//
// Lee scunpacked/items.json, filtra items con type="Bomb", y genera un archivo
// seed SQL con INSERTs idempotentes (ON CONFLICT DO NOTHING).
//
// Uso:
//   node scripts/import-bombs.mjs
//
// Variables de entorno opcionales:
//   SCUNPACKED_LOCAL_PATH  ruta al scunpacked-data. Default: ./scunpacked
//   OUT_FILE               archivo de salida. Default: ./database/seeds/bombs_seed.sql
//
// Estrategia espejo de la tabla missiles:
//   - Sin tracking (bombas son gravity-drop / RequiresLauncher)
//   - Campos damage_* extraídos del stdItem.Bomb.Damage object
//   - explosion_radius_{min,max} del stdItem.Bomb.ExplosionRadius
//   - raw_data guarda el stdItem completo como JSONB para referencia futura
//
// El script NO escribe directo a Supabase — genera el SQL y el usuario decide
// cuándo aplicarlo (igual patrón que el resto de los seeds del proyecto).
// =============================================================================

import fs from "node:fs";
import path from "node:path";

const SCUNPACKED = process.env.SCUNPACKED_LOCAL_PATH || "./scunpacked";
const OUT_FILE = process.env.OUT_FILE || "./database/seeds/bombs_seed.sql";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** SQL-escape a text value (single-quote doubled). Returns 'NULL' when nullish. */
function sqlStr(v) {
  if (v === null || v === undefined) return "NULL";
  return "'" + String(v).replace(/'/g, "''") + "'";
}
function sqlNum(v) {
  if (v === null || v === undefined) return "NULL";
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : "NULL";
}
function sqlBool(v) {
  if (v === null || v === undefined) return "NULL";
  return v ? "true" : "false";
}
function sqlJsonb(obj) {
  if (obj === null || obj === undefined) return "NULL";
  // Serializar con single-quote escaping. cast a jsonb via :: .
  return "'" + JSON.stringify(obj).replace(/'/g, "''") + "'::jsonb";
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main() {
  const itemsPath = path.join(SCUNPACKED, "items.json");
  if (!fs.existsSync(itemsPath)) {
    console.error(`[import-bombs] no encontré ${itemsPath}`);
    console.error(`              definí SCUNPACKED_LOCAL_PATH o colocá scunpacked/ en el root del repo.`);
    process.exit(1);
  }

  console.log(`[import-bombs] leyendo ${itemsPath} ...`);
  const raw = fs.readFileSync(itemsPath, "utf8");
  const items = JSON.parse(raw);
  console.log(`[import-bombs] ${items.length} items totales en el archivo`);

  const bombs = items.filter((it) => (it?.type || "").toLowerCase() === "bomb");
  console.log(`[import-bombs] ${bombs.length} bombas detectadas (type === "Bomb")`);

  if (bombs.length === 0) {
    console.warn(`[import-bombs] ⚠ no se encontraron bombas — seed vacío.`);
    // Aun así generamos el archivo con header para que el pipeline sea consistente.
  }

  const rows = [];
  for (const b of bombs) {
    const std = b.stdItem || {};
    const bomb = std.Bomb || {};
    const damage = bomb.Damage || {};
    const explosion = bomb.ExplosionRadius || {};
    const dur = std.Durability || {};
    const mfr = std.Manufacturer || {};

    const id = b.reference || std.UUID;
    if (!id) {
      console.warn(`[import-bombs] ⚠ bomba sin UUID (${b.className ?? "?"}) — skip`);
      continue;
    }

    // sub_type: el Type de stdItem suele ser "Bomb.<SubType>" (ej "Bomb.Utility").
    // Tomamos la parte después del "." como sub_type. Fallback al subType del
    // objeto top-level.
    const typeStr = typeof std.Type === "string" ? std.Type : "";
    const subType = typeStr.includes(".")
      ? typeStr.split(".").slice(1).join(".") || null
      : b.subType || null;

    rows.push({
      id,
      class_name: b.className || std.ClassName || "",
      name: b.name || std.Name || "",
      description: std.DescriptionText || null,
      manufacturer_id: mfr.UUID || null,
      size: b.size ?? std.Size ?? null,
      grade: b.grade ?? std.Grade ?? null,
      sub_type: subType,
      damage_total: bomb.DamageTotal ?? null,
      damage_physical: damage.Physical ?? null,
      damage_energy: damage.Energy ?? null,
      damage_distortion: damage.Distortion ?? null,
      damage_thermal: damage.Thermal ?? null,
      damage_biochemical: damage.Biochemical ?? null,
      damage_stun: damage.Stun ?? null,
      explosion_radius_min: explosion.Minimum ?? null,
      explosion_radius_max: explosion.Maximum ?? null,
      arm_time: bomb.ArmTime ?? null,
      max_lifetime: bomb.MaxLifetime ?? null,
      is_cluster: bomb.IsCluster ?? false,
      requires_launcher: bomb.RequiresLauncher ?? true,
      durability_health: dur.Health ?? null,
      mass: std.Mass ?? null,
      width: std.Width ?? null,
      height: std.Height ?? null,
      length: std.Length ?? null,
      raw_data: std,
    });
  }

  // ─── Emit SQL ────────────────────────────────────────────────────────────
  const header = `-- =============================================================================
-- bombs_seed.sql
-- Generado por: scripts/import-bombs.mjs
-- Fecha:        ${new Date().toISOString().slice(0, 10)}
-- Origen:       scunpacked/items.json (${items.length} items totales,
--               ${bombs.length} de type="Bomb")
-- Importadas:   ${rows.length}
-- =============================================================================
-- Inserción idempotente: filas ya existentes se omiten sin error (ON CONFLICT
-- DO NOTHING). Para refrescar una bomba existente, borrarla primero o usar
-- UPDATE explícito.
-- =============================================================================

`;

  let body = "";
  if (rows.length > 0) {
    body += `insert into bombs (
  id, class_name, name, description, manufacturer_id, size, grade, sub_type,
  damage_total, damage_physical, damage_energy, damage_distortion,
  damage_thermal, damage_biochemical, damage_stun,
  explosion_radius_min, explosion_radius_max,
  arm_time, max_lifetime, is_cluster, requires_launcher,
  durability_health, mass, width, height, length, raw_data
) values\n`;
    const tuples = rows.map((r) => {
      return `(${sqlStr(r.id)}, ${sqlStr(r.class_name)}, ${sqlStr(r.name)}, ${sqlStr(r.description)}, ${sqlStr(r.manufacturer_id)}, ${sqlNum(r.size)}, ${sqlNum(r.grade)}, ${sqlStr(r.sub_type)}, ${sqlNum(r.damage_total)}, ${sqlNum(r.damage_physical)}, ${sqlNum(r.damage_energy)}, ${sqlNum(r.damage_distortion)}, ${sqlNum(r.damage_thermal)}, ${sqlNum(r.damage_biochemical)}, ${sqlNum(r.damage_stun)}, ${sqlNum(r.explosion_radius_min)}, ${sqlNum(r.explosion_radius_max)}, ${sqlNum(r.arm_time)}, ${sqlNum(r.max_lifetime)}, ${sqlBool(r.is_cluster)}, ${sqlBool(r.requires_launcher)}, ${sqlNum(r.durability_health)}, ${sqlNum(r.mass)}, ${sqlNum(r.width)}, ${sqlNum(r.height)}, ${sqlNum(r.length)}, ${sqlJsonb(r.raw_data)})`;
    });
    body += tuples.join(",\n") + "\non conflict (id) do nothing;\n";
  } else {
    body += "-- No bombs found in source.\n";
  }

  const output = header + body;
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, output, "utf8");
  console.log(`[import-bombs] ✅ escrito ${OUT_FILE} (${rows.length} filas, ${(output.length / 1024).toFixed(1)} KB)`);

  // Summary
  for (const r of rows) {
    console.log(`  - ${r.class_name.padEnd(40)} S${r.size}  ${r.name}  (dmg ${r.damage_total ?? "?"}, radius ${r.explosion_radius_max ?? "?"}m)`);
  }
}

main();
