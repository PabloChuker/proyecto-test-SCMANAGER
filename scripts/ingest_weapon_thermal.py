#!/usr/bin/env python3
"""
=============================================================================
SC LABS — Weapon Thermal Data Ingest

Reads SWeaponSimplifiedHeatParams from scunpacked-data weapon JSON files
and generates SQL UPDATE statements to populate the weapon_guns table
with thermal data needed for sustained-DPS (heat-limited) calculation:

  heatPerSec    = rate_of_fire / 60 * heat_per_shot
  tToOverheat   = overheat_temperature / max(heatPerSec - cooling_per_second, eps)
  dutyCycle     = tToOverheat / (tToOverheat + overheat_fix_time)
  sustainedDps  = burstDps * dutyCycle

Fields populated (migration 046_weapon_thermal_fields.sql):
  - overheat_temperature  (SWeaponSimplifiedHeatParams.overheatTemperature)
  - cooling_per_second    (SWeaponSimplifiedHeatParams.coolingPerSecond)
  - overheat_fix_time     (SWeaponSimplifiedHeatParams.overheatFixTime)

Usage:
  # Clone scunpacked-data first:
  git clone https://github.com/StarCitizenWiki/scunpacked-data.git ./data/scunpacked-data

  # Generate SQL file:
  python scripts/ingest_weapon_thermal.py --data-path ./data/scunpacked-data --output thermal_update.sql

  # Or apply directly to DB (needs DATABASE_URL):
  python scripts/ingest_weapon_thermal.py --data-path ./data/scunpacked-data --apply
=============================================================================
"""

import os
import sys
import json
import argparse
from pathlib import Path
from typing import Optional

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


def deep_get(obj, *keys):
    """Safely traverse nested dicts."""
    for k in keys:
        if not isinstance(obj, dict):
            return None
        obj = obj.get(k)
    return obj


def find_heat_params(data: dict) -> Optional[dict]:
    """Find weapon heat params from scunpacked-data JSON.

    Primary path:
      Raw.Entity.Components.SCItemWeaponComponentParams
        .connectionParams.simplifiedHeatParams.SWeaponSimplifiedHeatParams
    """
    # Path 1: Raw entity component params (primary)
    raw_params = deep_get(data, "Raw", "Entity", "Components",
                          "SCItemWeaponComponentParams", "connectionParams",
                          "simplifiedHeatParams", "SWeaponSimplifiedHeatParams")
    if isinstance(raw_params, dict):
        return raw_params

    # Path 2: Alternate normalized location if scunpacked exposes it
    norm = deep_get(data, "Item", "stdItem", "Weapon", "Heat")
    if isinstance(norm, dict):
        return {
            "overheatTemperature": norm.get("OverheatTemperature") or norm.get("overheatTemperature"),
            "coolingPerSecond": norm.get("CoolingPerSecond") or norm.get("coolingPerSecond"),
            "overheatFixTime": norm.get("OverheatFixTime") or norm.get("overheatFixTime"),
        }

    # Path 3: Direct / flat paths
    for path_keys in [
        ("Components", "SWeaponSimplifiedHeatParams"),
        ("simplifiedHeatParams", "SWeaponSimplifiedHeatParams"),
    ]:
        params = deep_get(data, *path_keys)
        if isinstance(params, dict):
            return params

    params = data.get("SWeaponSimplifiedHeatParams")
    if isinstance(params, dict):
        return params

    return None


def extract_class_name(data: dict) -> Optional[str]:
    """Get the class_name / ClassName from the item data."""
    return (
        deep_get(data, "Item", "stdItem", "ClassName") or
        deep_get(data, "Item", "ClassName") or
        data.get("ClassName") or
        data.get("className") or
        deep_get(data, "stdItem", "ClassName") or
        data.get("Reference") or
        data.get("reference")
    )


def process_items_dir(items_path: Path) -> list:
    """Process all weapon JSON files in the items directory."""
    results = []

    if not items_path.exists():
        print(f"ERROR: Items directory not found: {items_path}")
        sys.exit(1)

    json_files = sorted(items_path.glob("*.json"))
    print(f"Scanning {len(json_files)} item files...")

    found = 0
    for fp in json_files:
        try:
            with open(fp, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, UnicodeDecodeError):
            continue

        heat = find_heat_params(data)
        if not heat:
            continue

        class_name = extract_class_name(data)
        if not class_name:
            class_name = fp.stem

        overheat_temp = heat.get("overheatTemperature")
        cooling = heat.get("coolingPerSecond")
        fix_time = heat.get("overheatFixTime")

        # Skip if all three are null (nothing to write)
        if overheat_temp is None and cooling is None and fix_time is None:
            continue

        item_name = (
            data.get("Name") or
            deep_get(data, "Item", "Name") or
            deep_get(data, "stdItem", "Name") or
            class_name
        )

        results.append({
            "class_name": class_name.lower(),
            "item_name": item_name,
            "overheat_temperature": overheat_temp,
            "cooling_per_second": cooling,
            "overheat_fix_time": fix_time,
        })
        found += 1

    print(f"Found {found} weapons with SWeaponSimplifiedHeatParams")
    return results


def generate_sql(results: list) -> str:
    """Generate SQL UPDATE statements."""
    lines = [
        "-- =============================================================================",
        "-- Auto-generated: weapon_guns thermal data from scunpacked-data",
        "-- Source: SWeaponSimplifiedHeatParams per weapon item",
        "-- =============================================================================",
        "",
    ]

    for r in results:
        sets = []
        if r["overheat_temperature"] is not None:
            sets.append(f"overheat_temperature = {r['overheat_temperature']}")
        if r["cooling_per_second"] is not None:
            sets.append(f"cooling_per_second = {r['cooling_per_second']}")
        if r["overheat_fix_time"] is not None:
            sets.append(f"overheat_fix_time = {r['overheat_fix_time']}")

        if not sets:
            continue

        set_clause = ", ".join(sets)
        cn = r["class_name"].replace("'", "''")
        lines.append(f"-- {r['item_name']}")
        lines.append(f"UPDATE weapon_guns SET {set_clause} WHERE lower(class_name) = '{cn}';")
        lines.append("")

    return "\n".join(lines)


def apply_to_db(sql: str):
    """Apply SQL to the database using DATABASE_URL."""
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("ERROR: DATABASE_URL not set. Cannot apply to DB.")
        sys.exit(1)

    try:
        from sqlalchemy import create_engine, text
        engine = create_engine(db_url)
        with engine.begin() as conn:
            for stmt in sql.split(";"):
                stmt = stmt.strip()
                if stmt and not stmt.startswith("--"):
                    conn.execute(text(stmt))
        print("Applied to database successfully.")
    except ImportError:
        print("ERROR: sqlalchemy not installed. Run: pip install sqlalchemy")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Ingest weapon thermal data from scunpacked-data")
    parser.add_argument("--data-path", required=True, help="Path to scunpacked-data repo root")
    parser.add_argument("--output", "-o", help="Write SQL to file instead of stdout")
    parser.add_argument("--apply", action="store_true", help="Apply directly to DATABASE_URL")
    args = parser.parse_args()

    data_root = Path(args.data_path)
    items_path = data_root / "items"

    if not items_path.exists():
        if data_root.glob("*.json"):
            items_path = data_root
        else:
            print(f"ERROR: Cannot find items at {items_path}")
            sys.exit(1)

    results = process_items_dir(items_path)

    if not results:
        print("No weapon thermal data found.")
        sys.exit(0)

    # Print summary
    print(f"\nSample entries:")
    for r in results[:5]:
        print(f"  {r['class_name']}: overheatTemp={r['overheat_temperature']}, "
              f"cooling/s={r['cooling_per_second']}, "
              f"fixTime={r['overheat_fix_time']}")
    if len(results) > 5:
        print(f"  ... and {len(results) - 5} more")

    sql = generate_sql(results)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(sql)
        print(f"\nSQL written to {args.output}")
    elif args.apply:
        apply_to_db(sql)
    else:
        print("\n--- Generated SQL ---")
        print(sql)


if __name__ == "__main__":
    main()
