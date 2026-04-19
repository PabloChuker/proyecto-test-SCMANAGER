"""
Genera la migración 051: enriquece el Material Finder con la data de star-head.de.

Entradas:
  - data/starhead_mining.json     → /mining endpoint (540 yields)
  - data/starhead_signatures.json → mapping (Ship-mining) material → [rock signatures]
  - database/migrations/050_create_mining_material_deposits.sql (seed gstool.org)

Salida:
  - database/migrations/051_mining_material_finder_enrich.sql

Estrategia:
  1. Nueva tabla mining_material_signature_variants (material, method, radar_signature, sort_order).
  2. UPSERT de locations de star-head (las granulares ARC L1..L5, etc.) sin borrar las de 050.
  3. UPSERT de yields con normalización de nombres.
  4. INSERT de variantes de firmas (1..N por material).

La migración es idempotente (ON CONFLICT DO UPDATE / DO NOTHING).
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path
from collections import defaultdict

REPO = Path(__file__).resolve().parent.parent
DATA_DIR = REPO / "data"
MIG_DIR = REPO / "database" / "migrations"

DATASET = "4.7.1-live"
SOURCE_TAG = "star-head.de"

# -----------------------------------------------------------------------------
# Normalización
# -----------------------------------------------------------------------------

# Star-head nombre → nombre canónico usado en 050
MATERIAL_REMAP = {
    "Pressuriced Ice": "Pressurized Ice",  # typo en star-head
    # Star-head usa "Aluminum", 050 tiene "Aluminum" en materiales pero "Aluminium"
    # colado en signatures. Normalizamos a "Aluminum".
    "Aluminium": "Aluminum",
}

METHOD_REMAP = {
    "Ship": "Ship",
    "GroundVehicle": "ROC",
    "FPS": "Hand",
}

# -----------------------------------------------------------------------------
# Sistema por ubicación (star-head no lo trae explícito)
# -----------------------------------------------------------------------------

def system_for(name: str, slug: str | None) -> str:
    s = (slug or "").lower()
    n = name.lower()
    if s.startswith("pyro") or "pyro" in s or "pyro" in n:
        return "Pyro"
    if s.startswith("nyx"):
        return "Nyx"
    if s.startswith("stanton_"):
        return "Stanton"
    # Lagrange points, known moons & planets
    stanton_markers = (
        "arc_l", "cru_l", "mic-l", "mic_l", "hur_l",
        "aberdeen", "cellin", "daymar", "yela", "aaronhalo",
        "arial", "magda", "ita", "wala", "calliope", "clio", "euterpe",
        "lyria", "hurston", "microtech",
    )
    if any(m in s for m in stanton_markers):
        return "Stanton"
    return "Stanton"  # default conservador


# -----------------------------------------------------------------------------
# Lectura de inputs
# -----------------------------------------------------------------------------

def load_inputs():
    mining = json.loads((DATA_DIR / "starhead_mining.json").read_text(encoding="utf-8"))
    sigs = json.loads((DATA_DIR / "starhead_signatures.json").read_text(encoding="utf-8"))
    return mining, sigs


# -----------------------------------------------------------------------------
# SQL escaping
# -----------------------------------------------------------------------------

def esc(s: str) -> str:
    return s.replace("'", "''")


# -----------------------------------------------------------------------------
# Construcción SQL
# -----------------------------------------------------------------------------

def build_migration(mining: list, sigs: dict) -> str:
    lines: list[str] = []
    add = lines.append

    add("-- =============================================================================")
    add("-- Migracion: 051_mining_material_finder_enrich")
    add("-- Modulo:    Mining — Material Finder (enriquece 050 con data de star-head.de)")
    add(f"-- Fecha:     2026-04-19")
    add("-- Source:    https://api.star-head.de/mining + frontend bundle signatures")
    add("-- Version:   " + DATASET)
    add("--")
    add("-- Que hace:")
    add("--   1. CREATE TABLE mining_material_signature_variants (firmas multiples por")
    add("--      material x metodo, extraidas del bundle de star-head.de).")
    add("--   2. UPSERT de locations granulares (ARC L1..L5 separados, etc.).")
    add("--   3. UPSERT de yields con chance_pct + combinations resumidas en note.")
    add("--   4. No borra nada de 050: es aditivo.")
    add("-- =============================================================================")
    add("")

    # -------------------------------------------------------------------------
    # 1) Tabla multi-firma
    # -------------------------------------------------------------------------
    add("-- 1) Tabla de firmas multiples por (material, metodo)")
    add("CREATE TABLE IF NOT EXISTS mining_material_signature_variants (")
    add("  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),")
    add("  material_name     TEXT NOT NULL,")
    add("  method            TEXT NOT NULL CHECK (method IN ('Ship','ROC','Hand')),")
    add("  radar_signature   INTEGER NOT NULL,")
    add("  sort_order        INTEGER NOT NULL DEFAULT 0,")
    add("  source            TEXT,")
    add("  dataset_version   TEXT NOT NULL,")
    add("  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),")
    add("")
    add("  UNIQUE (material_name, method, radar_signature, dataset_version)")
    add(");")
    add("")
    add("CREATE INDEX IF NOT EXISTS idx_mmsv_material ON mining_material_signature_variants(material_name);")
    add("CREATE INDEX IF NOT EXISTS idx_mmsv_method   ON mining_material_signature_variants(method);")
    add("CREATE INDEX IF NOT EXISTS idx_mmsv_sig      ON mining_material_signature_variants(radar_signature);")
    add("")
    add("ALTER TABLE mining_material_signature_variants ENABLE ROW LEVEL SECURITY;")
    add("DO $$ BEGIN")
    add("  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='mmsv_public_read') THEN")
    add("    CREATE POLICY mmsv_public_read ON mining_material_signature_variants FOR SELECT USING (true);")
    add("  END IF;")
    add("END $$;")
    add("")

    # -------------------------------------------------------------------------
    # 2) Insertar variantes de firmas
    # -------------------------------------------------------------------------
    add("-- 2) Seed de variantes (Ship mining). star-head bundle mapping.")
    add("INSERT INTO mining_material_signature_variants")
    add("  (material_name, method, radar_signature, sort_order, source, dataset_version) VALUES")
    by_mat: dict[str, list[int]] = sigs["by_material"]
    rows: list[str] = []
    for raw_mat in sorted(by_mat.keys()):
        mat = MATERIAL_REMAP.get(raw_mat, raw_mat)
        for i, sig in enumerate(sorted(set(by_mat[raw_mat]))):
            rows.append(
                f"  ('{esc(mat)}', 'Ship', {sig}, {i}, '{SOURCE_TAG}', '{DATASET}')"
            )
    add(",\n".join(rows))
    add("ON CONFLICT (material_name, method, radar_signature, dataset_version) DO NOTHING;")
    add("")

    # -------------------------------------------------------------------------
    # 3) Locations granulares desde star-head
    # -------------------------------------------------------------------------
    add("-- 3) Locations granulares de star-head (ARC L1..L5, moons, planets)")
    # Unique locations
    locs_map: dict[tuple[str, str], dict] = {}
    for r in mining:
        co = r.get("celestialObject") or {}
        name = co.get("name")
        if not name:
            continue
        slug = (co.get("details") or {}).get("slug")
        sysname = system_for(name, slug)
        key = (name, sysname)
        if key not in locs_map:
            locs_map[key] = {"type": co.get("type"), "slug": slug, "parent_id": co.get("parentId")}

    add("INSERT INTO mining_locations (name, system, dataset_version) VALUES")
    loc_rows = []
    for (name, sysname) in sorted(locs_map.keys()):
        loc_rows.append(f"  ('{esc(name)}', '{esc(sysname)}', '{DATASET}')")
    add(",\n".join(loc_rows))
    add("ON CONFLICT (name, system, dataset_version) DO NOTHING;")
    add("")

    # -------------------------------------------------------------------------
    # 4) Yields
    # -------------------------------------------------------------------------
    add("-- 4) Yields granulares de star-head (~540 filas)")
    add("--    chance_pct = probability (campo 'probability' del endpoint /mining)")
    add("INSERT INTO mining_location_yields")
    add("  (location_name, system, method, material_name, chance_pct, dataset_version) VALUES")
    yield_rows: list[str] = []
    seen: set[tuple[str, str, str, str]] = set()
    for r in mining:
        co = r.get("celestialObject") or {}
        cm = r.get("commodity") or {}
        loc_name = co.get("name")
        mat_name_raw = cm.get("name")
        if not loc_name or not mat_name_raw:
            continue
        mat_name = MATERIAL_REMAP.get(mat_name_raw, mat_name_raw)
        method = METHOD_REMAP.get(r.get("miningMethod", ""))
        if not method:
            continue
        sysname = system_for(loc_name, (co.get("details") or {}).get("slug"))
        chance = r.get("probability")
        if chance is None:
            continue
        key = (loc_name, sysname, method, mat_name)
        if key in seen:
            continue  # dedupe
        seen.add(key)
        # Clamp 0..100
        pct = max(0.0, min(100.0, float(chance)))
        yield_rows.append(
            f"  ('{esc(loc_name)}', '{esc(sysname)}', '{method}', '{esc(mat_name)}', {pct:.2f}, '{DATASET}')"
        )
    add(",\n".join(yield_rows))
    add("ON CONFLICT (location_name, system, method, material_name, dataset_version) DO UPDATE SET")
    add("  chance_pct = EXCLUDED.chance_pct,")
    add("  updated_at = now();")
    add("")

    # -------------------------------------------------------------------------
    # 5) Agregar materials que estén en star-head pero no en 050
    # -------------------------------------------------------------------------
    add("-- 5) Asegurar que todo material referenciado en yields existe en mining_materials")
    add("--    (insert safe — si ya existe, no hace nada).")
    add("INSERT INTO mining_materials (name, dataset_version) VALUES")
    mat_rows = []
    seen_mats = set()
    for raw_mat in sorted(by_mat.keys()) + sorted(
        {MATERIAL_REMAP.get(r["commodity"]["name"], r["commodity"]["name"]) for r in mining if r.get("commodity")}
    ):
        mat = MATERIAL_REMAP.get(raw_mat, raw_mat)
        if mat in seen_mats:
            continue
        seen_mats.add(mat)
        mat_rows.append(f"  ('{esc(mat)}', '{DATASET}')")
    add(",\n".join(mat_rows))
    add("ON CONFLICT (name) DO NOTHING;")
    add("")

    add("-- =============================================================================")
    add("-- FIN 051")
    add(f"-- Stats: {len(loc_rows)} locations, {len(yield_rows)} yields, {len(rows)} signature variants")
    add("-- =============================================================================")

    return "\n".join(lines) + "\n"


def main() -> None:
    mining, sigs = load_inputs()
    sql = build_migration(mining, sigs)
    out = MIG_DIR / "051_mining_material_finder_enrich.sql"
    out.write_text(sql, encoding="utf-8")
    print(f"[ok] wrote {out} — {len(sql):,} bytes, {sql.count(chr(10))} lines")


if __name__ == "__main__":
    main()
