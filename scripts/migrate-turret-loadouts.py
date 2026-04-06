#!/usr/bin/env python3
"""
SC LABS — Migrate Turret Loadouts
==================================
Reads scunpacked ship JSONs to find turret hardpoints that have weapon
sub-loadouts, then updates the ship_hardpoints table in the database
with the proper loadout_json so the DPS calculator can display turret weapons.

The original extract script saved loadout_json for gimbals on wing/body
hardpoints, but NOT for turrets. This script fixes that.

Usage:
  pip install psycopg2-binary
  python3 scripts/migrate-turret-loadouts.py

Requires: scripts/data/scunpacked/ships/ directory with ship JSONs.
"""

import json
import os
import sys
from pathlib import Path

try:
    import psycopg2
except ImportError:
    print("ERROR: psycopg2 not installed. Run: pip install psycopg2-binary")
    sys.exit(1)

# ─── Config ──────────────────────────────────────────────────────────────────

SHIPS_DIR = Path(__file__).parent / "data" / "scunpacked" / "ships"

DB_URL = os.environ.get(
    "DIRECT_URL",
    os.environ.get(
        "DATABASE_URL",
        "postgresql://postgres.htqfrcxtsghhcmimxdad:CQpCrOz0HzmWF5Ok@aws-1-us-west-2.pooler.supabase.com:5432/postgres"
    )
)

# Types that indicate weapon mounts inside turrets (not displays, seats, etc.)
WEAPON_TYPES = {
    "WeaponGun.Gun",
    "Turret.GunTurret",
    "TurretBase.MannedTurret",
    "TurretBase.RemoteTurret",
    "TractorBeam.UNDEFINED",
    "MissileLauncher.MissileRack",
}

# Types to skip (screens, attachments, etc.)
SKIP_TYPES = {
    "Display.UNDEFINED",
    "SeatAccess.UNDEFINED",
    "WeaponAttachment.Barrel",
    "WeaponAttachment.FiringMechanism",
    "WeaponAttachment.PowerArray",
    "WeaponAttachment.Ventilation",
    "Flair_Cockpit.Flair_Hanging",
    "Usable",
}


def is_weapon_entry(entry):
    """Check if a loadout entry is a weapon/gimbal (not a display/seat/etc)."""
    entry_type = entry.get("Type", "")
    if entry_type in SKIP_TYPES:
        return False
    if not entry.get("ClassName"):
        return False
    # Check if it's a weapon, gimbal, or turret type
    if entry_type in WEAPON_TYPES:
        return True
    # Check ItemTypes
    for it in entry.get("ItemTypes", []):
        t = it.get("Type", "")
        st = it.get("SubType", "")
        full = f"{t}.{st}" if st else t
        if full in WEAPON_TYPES or t in ("WeaponGun", "Turret", "TurretBase", "TractorBeam", "MissileLauncher"):
            return True
    return False


def extract_turret_loadout(turret_entry):
    """
    Extract weapon loadout from a turret entry.
    Returns a list of dicts suitable for loadout_json.

    Structure: turret → [gimbal/weapon entries] → each may have nested weapons
    """
    loadout = turret_entry.get("Loadout", [])
    if not loadout:
        return []

    result = []
    for entry in loadout:
        if not is_weapon_entry(entry):
            continue

        # This is a gimbal or weapon inside the turret
        child = {
            "HardpointName": entry.get("HardpointName", ""),
            "ClassName": entry.get("ClassName", ""),
            "UUID": entry.get("UUID", ""),
            "Name": entry.get("Name", ""),
            "Type": entry.get("Type", ""),
            "MaxSize": entry.get("MaxSize", 0),
            "Size": entry.get("MaxSize", 0),
            "Grade": entry.get("Grade"),
        }

        # Check if this gimbal has nested weapons (gimbal → weapon)
        sub_loadout = entry.get("Loadout", [])
        nested_weapons = []
        for sub in sub_loadout:
            if is_weapon_entry(sub):
                nested_weapons.append({
                    "HardpointName": sub.get("HardpointName", ""),
                    "ClassName": sub.get("ClassName", ""),
                    "UUID": sub.get("UUID", ""),
                    "Name": sub.get("Name", ""),
                    "Type": sub.get("Type", ""),
                    "MaxSize": sub.get("MaxSize", 0),
                    "Size": sub.get("MaxSize", 0),
                    "Grade": sub.get("Grade"),
                })

        if nested_weapons:
            child["Children"] = nested_weapons

        result.append(child)

    return result


def main():
    print("🔧 Turret Loadout Migration Script (from scunpacked JSONs)")
    print("=" * 60)

    if not SHIPS_DIR.exists():
        print(f"ERROR: Ships directory not found: {SHIPS_DIR}")
        sys.exit(1)

    # 1. Read all ship JSONs and extract turret loadouts
    ship_turrets = {}  # ship_reference → {hardpoint_name → loadout_json}

    json_files = sorted(SHIPS_DIR.glob("*.json"))
    print(f"\n📂 Found {len(json_files)} ship JSON files")

    for jf in json_files:
        try:
            with open(jf) as f:
                data = json.load(f)
        except Exception as e:
            print(f"  ⚠️  Error reading {jf.name}: {e}")
            continue

        ship_ref = data.get("ClassName", "")
        if not ship_ref:
            continue

        loadout_entries = data.get("Loadout", [])
        turrets_found = {}

        for entry in loadout_entries:
            hp_name = entry.get("HardpointName", "")
            entry_type = entry.get("Type", "")
            class_name = entry.get("ClassName", "")

            # Is this a turret? (MannedTurret, RemoteTurret, or GunTurret with weapons)
            is_turret = (
                "TurretBase" in entry_type or
                "turret" in hp_name.lower() or
                "turret" in class_name.lower()
            )

            if not is_turret:
                continue

            # Extract weapon loadout from this turret
            weapon_loadout = extract_turret_loadout(entry)

            if weapon_loadout:
                turrets_found[hp_name] = {
                    "class_name": class_name,
                    "loadout_json": weapon_loadout,
                }

        if turrets_found:
            ship_turrets[ship_ref] = turrets_found

    total_turrets = sum(len(v) for v in ship_turrets.values())
    print(f"🎯 Found {total_turrets} turrets with weapons across {len(ship_turrets)} ships\n")

    if total_turrets == 0:
        print("Nothing to update!")
        return

    # 2. Connect to DB and update
    print(f"📡 Connecting to database...")
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    print("✅ Connected\n")

    updated = 0
    not_found = 0
    already_ok = 0

    for ship_ref, turrets in sorted(ship_turrets.items()):
        for hp_name, turret_data in turrets.items():
            loadout_json = json.dumps(turret_data["loadout_json"])

            # Check if this hardpoint exists in DB
            cur.execute(
                """SELECT id, loadout_json FROM ship_hardpoints
                   WHERE ship_reference = %s AND hardpoint_name = %s""",
                (ship_ref, hp_name)
            )
            row = cur.fetchone()

            if not row:
                not_found += 1
                continue

            hp_id = row[0]
            existing_loadout = row[1]

            # Skip if already has loadout data
            if existing_loadout and isinstance(existing_loadout, list) and len(existing_loadout) > 0:
                already_ok += 1
                continue

            # Update!
            cur.execute(
                "UPDATE ship_hardpoints SET loadout_json = %s WHERE id = %s",
                (loadout_json, hp_id)
            )
            updated += 1
            weapon_names = [
                w.get("Name", w.get("ClassName", "?"))
                for w in turret_data["loadout_json"]
            ]
            print(f"  ✅ {ship_ref} / {hp_name}: {weapon_names}")

    conn.commit()
    cur.close()
    conn.close()

    # 3. Summary
    print(f"\n{'=' * 60}")
    print(f"✅ Updated:    {updated} turret hardpoints")
    print(f"⏭️  Already OK: {already_ok} (had loadout_json)")
    print(f"❓ Not in DB:  {not_found} (ship/hardpoint not found)")
    print(f"{'=' * 60}")
    print(f"\n🎉 Done! Now push and redeploy to see turret weapons in the DPS calculator.")


if __name__ == "__main__":
    main()
