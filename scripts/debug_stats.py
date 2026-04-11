#!/usr/bin/env python3
"""
AL FILO — debug_stats.py
Recursive key searcher for scunpacked-data JSONs.
Finds exact paths to speed, damage, and DPS fields so we stop guessing.

Usage:
  python debug_stats.py
  python debug_stats.py --data-path ./data/scunpacked-data
  python debug_stats.py --ship AEGS_Gladius --weapon laser
"""

import json
import sys
import re
from pathlib import Path
import click


def load_json(path: Path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def recursive_search(obj, patterns: list[str], path: str = "", max_depth: int = 12, results: list = None):
    """
    Walk a JSON structure recursively. When a KEY matches any pattern,
    print the full path and the value (truncated if large).
    """
    if results is None:
        results = []
    if max_depth <= 0:
        return results

    if isinstance(obj, dict):
        for key, val in obj.items():
            current_path = f"{path} -> {key}" if path else key
            key_lower = key.lower()

            # Check if this key matches any pattern
            matched = any(p in key_lower for p in patterns)
            if matched:
                if isinstance(val, (int, float)):
                    results.append((current_path, val))
                elif isinstance(val, str):
                    results.append((current_path, val[:80]))
                elif isinstance(val, dict):
                    # Show a summary of the dict
                    results.append((current_path, f"{{dict with {len(val)} keys: {list(val.keys())[:6]}}}"))
                    # Also recurse into it to find sub-values
                    recursive_search(val, patterns, current_path, max_depth - 1, results)
                elif isinstance(val, list):
                    results.append((current_path, f"[list of {len(val)} items]"))
                    for i, item in enumerate(val[:3]):
                        recursive_search(item, patterns, f"{current_path}[{i}]", max_depth - 1, results)
                elif val is None:
                    results.append((current_path, "null"))
                else:
                    results.append((current_path, str(val)[:80]))
            else:
                # Recurse even if key doesn't match (the value might contain matching keys)
                recursive_search(val, patterns, current_path, max_depth - 1, results)

    elif isinstance(obj, list):
        for i, item in enumerate(obj[:5]):  # Limit to first 5 items
            recursive_search(item, patterns, f"{path}[{i}]", max_depth - 1, results)

    return results


def find_file(base: Path, name_patterns: list[str], subdir: str) -> Path | None:
    """Find first JSON file matching any pattern in the given subdirectory."""
    search_dir = base / subdir
    if not search_dir.exists():
        # Try without subdir
        search_dir = base
    for f in sorted(search_dir.glob("**/*.json")):
        fname_lower = f.stem.lower()
        if any(p.lower() in fname_lower for p in name_patterns):
            return f
    return None


def print_results(title: str, results: list):
    print(f"\n{'=' * 70}")
    print(f"  {title}")
    print(f"{'=' * 70}")
    if not results:
        print("  (no matches found)")
    else:
        for path, value in results:
            print(f"  {path}")
            print(f"    = {value}")
            print()


@click.command()
@click.option("--data-path", type=click.Path(), default="./data/scunpacked-data",
              help="Path to scunpacked-data repo")
@click.option("--ship", default="stalker,gladius,aurora",
              help="Comma-separated ship name patterns to search for")
@click.option("--weapon", default="panther,repeater,laser_cannon,ballistic",
              help="Comma-separated weapon name patterns to search for")
def main(data_path, ship, weapon):
    base = Path(data_path)
    if not base.exists():
        print(f"ERROR: Data path not found: {base}")
        print("Try: python debug_stats.py --data-path /path/to/scunpacked-data")
        sys.exit(1)

    ship_patterns = [s.strip() for s in ship.split(",")]
    weapon_patterns = [w.strip() for w in weapon.split(",")]

    # ─────────────────────────────────────────────
    # PART 1: Ship — search for speed/velocity keys
    # ─────────────────────────────────────────────
    ship_file = find_file(base, ship_patterns, "ships")
    if ship_file:
        print(f"\n>>> SHIP FILE: {ship_file.name}")
        raw = load_json(ship_file)

        # Show top-level keys first
        if isinstance(raw, dict):
            print(f"    Top-level keys ({len(raw)}): {list(raw.keys())}")
            print()

        # Search for speed-related keys
        speed_patterns = ["speed", "scm", "velocity", "afterburner", "cruise", "mav", "thrust"]
        results = recursive_search(raw, speed_patterns)
        print_results(f"SHIP: Speed-related keys in {ship_file.name}", results)

        # Also search for flight/agility/propulsion structure
        struct_patterns = ["flight", "agility", "propulsion", "ifcs", "maneuver"]
        results2 = recursive_search(raw, struct_patterns, max_depth=3)
        print_results(f"SHIP: Flight/Agility structure in {ship_file.name}", results2)
    else:
        print(f"\n>>> No ship file found matching: {ship_patterns}")
        print(f"    Searched in: {base / 'ships'}")
        ships_dir = base / "ships"
        if ships_dir.exists():
            files = sorted(ships_dir.glob("*.json"))[:10]
            print(f"    Available files ({len(list(ships_dir.glob('*.json')))} total):")
            for f in files:
                print(f"      {f.name}")

    # ─────────────────────────────────────────────
    # PART 2: Weapon — search for damage/dps keys
    # ─────────────────────────────────────────────
    weapon_file = find_file(base, weapon_patterns, "items")
    if weapon_file:
        print(f"\n>>> WEAPON FILE: {weapon_file.name}")
        raw = load_json(weapon_file)

        # Unwrap if needed
        if isinstance(raw, dict) and "Raw" in raw and "Entity" not in raw.get("Raw", {}):
            pass  # Already flat
        elif isinstance(raw, dict) and "Raw" in raw:
            entity = raw.get("Raw", {}).get("Entity", {})
            if entity:
                print(f"    (Legacy Raw.Entity format detected)")
                print(f"    Entity keys: {list(entity.keys())[:10]}")
                comps = entity.get("Components", {})
                print(f"    Component keys: {list(comps.keys())[:15]}")

        if isinstance(raw, dict):
            print(f"    Top-level keys ({len(raw)}): {list(raw.keys())}")

        # Search for damage-related keys
        damage_patterns = ["damage", "dps", "alpha", "impact", "detonation", "ammunition", "ammo"]
        results = recursive_search(raw, damage_patterns)
        print_results(f"WEAPON: Damage-related keys in {weapon_file.name}", results)

        # Also search for weapon/fire structure
        fire_patterns = ["weapon", "fire", "rate", "burst", "projectile"]
        results2 = recursive_search(raw, fire_patterns)
        print_results(f"WEAPON: Weapon/Fire structure in {weapon_file.name}", results2)
    else:
        print(f"\n>>> No weapon file found matching: {weapon_patterns}")
        print(f"    Searched in: {base / 'items'}")
        items_dir = base / "items"
        if items_dir.exists():
            # Show some weapon-looking files
            all_files = sorted(items_dir.glob("**/*.json"))
            weapon_ish = [f for f in all_files if any(w in f.stem.lower() for w in ["weapon", "gun", "cannon", "laser", "repeater", "gatling", "scatter"])][:10]
            if weapon_ish:
                print(f"    Weapon-like files found:")
                for f in weapon_ish:
                    print(f"      {f.name}")
            else:
                print(f"    Total files: {len(all_files)}")
                for f in all_files[:10]:
                    print(f"      {f.name}")

    # ─────────────────────────────────────────────
    # PART 3: Bonus — check a shield and power plant too
    # ─────────────────────────────────────────────
    shield_file = find_file(base, ["shield", "palisade", "aspis"], "items")
    if shield_file:
        print(f"\n>>> SHIELD FILE: {shield_file.name}")
        raw = load_json(shield_file)
        if isinstance(raw, dict):
            print(f"    Top-level keys: {list(raw.keys())}")
        shield_patterns = ["shield", "health", "regen", "hp", "absorb"]
        results = recursive_search(raw, shield_patterns)
        print_results(f"SHIELD: Health/Regen keys in {shield_file.name}", results)

    power_file = find_file(base, ["power", "js-300", "fierell"], "items")
    if power_file:
        print(f"\n>>> POWER PLANT FILE: {power_file.name}")
        raw = load_json(power_file)
        if isinstance(raw, dict):
            print(f"    Top-level keys: {list(raw.keys())}")
        power_patterns = ["power", "output", "draw", "capacity"]
        results = recursive_search(raw, power_patterns)
        print_results(f"POWER: Output/Draw keys in {power_file.name}", results)

    print("\n" + "=" * 70)
    print("  Done! Copy-paste the output above and send it to Claude.")
    print("=" * 70 + "\n")


if __name__ == "__main__":
    main()
