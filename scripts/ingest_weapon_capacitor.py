#!/usr/bin/env python3
"""
=============================================================================
SC LABS — Weapon Capacitor Data Ingest

Reads SWeaponRegenConsumerParams from scunpacked-data weapon JSON files
and generates SQL UPDATE statements to populate the weapon_guns table
with capacitor/regeneration data needed for the ammo formula:

  rounds = requested_ammo_load × (pips / max_weapon_pips) / regen_cost_per_bullet

Usage:
  # Clone scunpacked-data first:
  git clone https://github.com/StarCitizenWiki/scunpacked-data.git ./data/scunpacked-data

  # Run the script:
  python scripts/ingest_weapon_capacitor.py --data-path ./data/scunpacked-data

  # Or apply directly to DB:
  python scripts/ingest_weapon_capacitor.py --data-path ./data/scunpacked-data --apply

  # Generate SQL file only:
  python scripts/ingest_weapon_capacitor.py --data-path ./data/scunpacked-data --output capacitor_update.sql
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


def find_regen_params(data: dict) -> Optional[dict]:
    """Find weapon capacitor/regen params from scunpacked-data JSON.

    Tries multiple paths in order of reliability:
      1. Item.stdItem.Weapon.Capacitor (cleanest, normalized by scunpacked)
      2. Raw.Entity.Components.SCItemWeaponComponentParams.weaponRegenConsumerParams.SWeaponRegenConsumerParams
      3. Various fallback locations
    """
    # Path 1: Normalized Capacitor block (preferred)
    cap = deep_get(data, "Item", "stdItem", "Weapon", "Capacitor")
    if isinstance(cap, dict) and cap.get("CostPerBullet") is not None:
        return {
            "requestedAmmoLoad": cap.get("RequestedAmmoLoad") or cap.get("requestedAmmoLoad"),
            "regenerationCostPerBullet": cap.get("CostPerBullet") or cap.get("costPerBullet"),
            "maxAmmoLoad": cap.get("MaxAmmoLoad") or cap.get("maxAmmoLoad"),
            "maxRegenPerSec": cap.get("MaxRegenPerSec") or cap.get("maxRegenPerSec"),
            "regenerationCooldown": cap.get("RegenerationCooldown") or cap.get("regenerationCooldown"),
        }

    # Path 2: Raw entity component params
    raw_params = deep_get(data, "Raw", "Entity", "Components",
                          "SCItemWeaponComponentParams", "weaponRegenConsumerParams",
                          "SWeaponRegenConsumerParams")
    if isinstance(raw_params, dict):
        return raw_params

    # Path 3: Direct / flat paths
    for path_keys in [
        ("Components", "SWeaponRegenConsumerParams"),
        ("weaponRegenConsumerParams", "SWeaponRegenConsumerParams"),
    ]:
        params = deep_get(data, *path_keys)
        if isinstance(params, dict):
            return params

    params = data.get("SWeaponRegenConsumerParams")
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

        # Only process weapon items (WeaponGun type)
        item_type = (
            deep_get(data, "Item", "stdItem", "Type") or
            deep_get(data, "Item", "Type") or
            data.get("Type") or ""
        )
        # Also check Raw path
        if not item_type:
            item_type = deep_get(data, "Raw", "Entity", "Components",
                                 "SAttachableComponentParams", "AttachDef", "Type") or ""

        regen = find_regen_params(data)
        if not regen:
            continue

        class_name = extract_class_name(data)
        if not class_name:
            # Use filename without extension as fallback
            class_name = fp.stem

        requested_ammo_load = regen.get("requestedAmmoLoad")
        regen_cost = regen.get("regenerationCostPerBullet")
        max_ammo = regen.get("maxAmmoLoad")
        max_regen = regen.get("maxRegenPerSec")
        cooldown = regen.get("regenerationCooldown")

        if requested_ammo_load is None and regen_cost is None:
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
            "requested_ammo_load": requested_ammo_load,
            "regen_cost_per_bullet": regen_cost,
            "max_ammo_load": int(max_ammo) if max_ammo is not None else None,
            "max_regen_per_sec": max_regen,
            "regen_cooldown": cooldown,
        })
        found += 1

    print(f"Found {found} weapons with SWeaponRegenConsumerParams")
    return results


def generate_sql(results: list) -> str:
    """Generate SQL UPDATE statements."""
    lines = [
        "-- =============================================================================",
        "-- Auto-generated: weapon_guns capacitor data from scunpacked-data",
        "-- Source: SWeaponRegenConsumerParams per weapon item",
        "-- =============================================================================",
        "",
    ]

    for r in results:
        sets = []
        if r["requested_ammo_load"] is not None:
            sets.append(f"requested_ammo_load = {r['requested_ammo_load']}")
        if r["regen_cost_per_bullet"] is not None:
            sets.append(f"regen_cost_per_bullet = {r['regen_cost_per_bullet']}")
        if r["max_ammo_load"] is not None:
            sets.append(f"max_ammo_load = {r['max_ammo_load']}")
        if r["max_regen_per_sec"] is not None:
            sets.append(f"max_regen_per_sec = {r['max_regen_per_sec']}")
        if r["regen_cooldown"] is not None:
            sets.append(f"regen_cooldown = {r['regen_cooldown']}")

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
        print("✅ Applied to database successfully.")
    except ImportError:
        print("ERROR: sqlalchemy not installed. Run: pip install sqlalchemy")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Ingest weapon capacitor data from scunpacked-data")
    parser.add_argument("--data-path", required=True, help="Path to scunpacked-data repo root")
    parser.add_argument("--output", "-o", help="Write SQL to file instead of stdout")
    parser.add_argument("--apply", action="store_true", help="Apply directly to DATABASE_URL")
    args = parser.parse_args()

    data_root = Path(args.data_path)
    items_path = data_root / "items"

    if not items_path.exists():
        # Try as direct items directory
        if data_root.glob("*.json"):
            items_path = data_root
        else:
            print(f"ERROR: Cannot find items at {items_path}")
            sys.exit(1)

    results = process_items_dir(items_path)

    if not results:
        print("No weapon capacitor data found.")
        sys.exit(0)

    # Print summary
    print(f"\nSample entries:")
    for r in results[:5]:
        print(f"  {r['class_name']}: ammoLoad={r['requested_ammo_load']}, "
              f"costPerBullet={r['regen_cost_per_bullet']}, "
              f"maxAmmo={r['max_ammo_load']}, maxRegen={r['max_regen_per_sec']}")
    if len(results) > 5:
        print(f"  ... and {len(results) - 5} more")

    sql = generate_sql(results)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(sql)
        print(f"\n✅ SQL written to {args.output}")
    elif args.apply:
        apply_to_db(sql)
    else:
        print("\n--- Generated SQL ---")
        print(sql)


if __name__ == "__main__":
    main()
