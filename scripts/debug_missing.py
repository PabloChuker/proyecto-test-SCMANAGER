#!/usr/bin/env python3
"""
AL FILO — debug_missing.py
Finds exact JSON paths for: Power, Heat, EM/IR signatures, Crew, Cargo,
Turret weapon chains, and Bespoke weapon flags.

Usage:
  python debug_missing.py
  python debug_missing.py --data-path ./data/scunpacked-data
"""

import json
import sys
from pathlib import Path
import click


def load_json(path: Path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def deep_search(obj, patterns: list[str], path: str = "", max_depth: int = 12,
                results: list = None, max_results: int = 40):
    if results is None:
        results = []
    if max_depth <= 0 or len(results) >= max_results:
        return results

    if isinstance(obj, dict):
        for key, val in obj.items():
            if len(results) >= max_results:
                break
            current = f"{path}.{key}" if path else key
            if any(p in key.lower() for p in patterns):
                if isinstance(val, (int, float)):
                    results.append((current, val))
                elif isinstance(val, str):
                    results.append((current, val[:60]))
                elif isinstance(val, dict):
                    results.append((current, f"<dict {len(val)} keys: {list(val.keys())[:5]}>"))
                    deep_search(val, patterns, current, max_depth - 1, results, max_results)
                elif isinstance(val, list):
                    results.append((current, f"<list len={len(val)}>"))
                    for i, item in enumerate(val[:2]):
                        deep_search(item, patterns, f"{current}[{i}]", max_depth - 1, results, max_results)
                elif val is None:
                    results.append((current, "null"))
                else:
                    results.append((current, str(val)[:60]))
            else:
                deep_search(val, patterns, current, max_depth - 1, results, max_results)
    elif isinstance(obj, list):
        for i, item in enumerate(obj[:3]):
            deep_search(item, patterns, f"{path}[{i}]", max_depth - 1, results, max_results)
    return results


def find_file(base: Path, name_patterns: list[str], subdir: str) -> Path | None:
    d = base / subdir
    if not d.exists():
        d = base
    for f in sorted(d.glob("**/*.json")):
        if any(p.lower() in f.stem.lower() for p in name_patterns):
            return f
    return None


def show(title: str, results: list):
    print(f"\n{'=' * 72}")
    print(f"  {title}")
    print(f"{'=' * 72}")
    if not results:
        print("  (no matches)")
    for path, val in results:
        print(f"  {path}")
        print(f"    => {val}")


@click.command()
@click.option("--data-path", type=click.Path(), default="./data/scunpacked-data")
def main(data_path):
    base = Path(data_path)
    if not base.exists():
        print(f"ERROR: {base} not found")
        sys.exit(1)

    # ─── 1. CAPITAL SHIP: Crew + Cargo ───
    print("\n" + "=" * 72)
    print("  SECTION 1: CREW & CARGO (Capital Ship)")
    print("=" * 72)

    ship_file = find_file(base, ["hammerhead", "idris", "reclaimer", "carrack", "constellation"], "ships")
    if ship_file:
        print(f"\n>>> File: {ship_file.name}")
        raw = load_json(ship_file)
        if isinstance(raw, dict):
            print(f"    Top keys: {list(raw.keys())}")

        show("Crew keys", deep_search(raw, ["crew", "seat", "manned", "occupant", "pilot"]))
        show("Cargo keys", deep_search(raw, ["cargo", "scu", "grid", "inventory", "storage"]))
    else:
        print("  No capital ship file found!")
        ships_dir = base / "ships"
        if ships_dir.exists():
            for f in sorted(ships_dir.glob("*.json"))[:10]:
                print(f"    {f.name}")

    # ─── 2. POWER PLANT: PowerDraw, PowerOutput ───
    print("\n" + "=" * 72)
    print("  SECTION 2: POWER PLANT")
    print("=" * 72)

    pp_file = find_file(base, ["power", "js-300", "js300", "fierell", "genoa", "drassus"], "items")
    if pp_file:
        print(f"\n>>> File: {pp_file.name}")
        raw = load_json(pp_file)
        if isinstance(raw, dict):
            print(f"    Top keys: {list(raw.keys())}")
            std = raw.get("Item", {}).get("stdItem", {}) if isinstance(raw.get("Item"), dict) else {}
            if std:
                print(f"    Item.stdItem keys: {list(std.keys())}")

        show("Power keys", deep_search(raw, ["power", "output", "draw", "capacity", "base"]))
        show("EM/IR keys", deep_search(raw, ["em", "ir", "signature", "stealth", "detection"]))
    else:
        print("  No power plant file found!")

    # ─── 3. COOLER: CoolingRate, ThermalOutput ───
    print("\n" + "=" * 72)
    print("  SECTION 3: COOLER")
    print("=" * 72)

    cool_file = find_file(base, ["cooler", "bracer", "snowfall", "zero-rush", "ultraflow"], "items")
    if cool_file:
        print(f"\n>>> File: {cool_file.name}")
        raw = load_json(cool_file)
        if isinstance(raw, dict):
            print(f"    Top keys: {list(raw.keys())}")
            std = raw.get("Item", {}).get("stdItem", {}) if isinstance(raw.get("Item"), dict) else {}
            if std:
                print(f"    Item.stdItem keys: {list(std.keys())}")

        show("Thermal/Cool keys", deep_search(raw, ["cool", "thermal", "heat", "temperature", "rate"]))
        show("EM/IR keys", deep_search(raw, ["em", "ir", "signature"]))
    else:
        print("  No cooler file found!")

    # ─── 4. SHIELD: EM/IR during operation ───
    print("\n" + "=" * 72)
    print("  SECTION 4: SHIELD (EM/IR signatures)")
    print("=" * 72)

    sh_file = find_file(base, ["shield", "palisade", "aspis", "sukoran", "forte"], "items")
    if sh_file:
        print(f"\n>>> File: {sh_file.name}")
        raw = load_json(sh_file)
        if isinstance(raw, dict):
            print(f"    Top keys: {list(raw.keys())}")
            std = raw.get("Item", {}).get("stdItem", {}) if isinstance(raw.get("Item"), dict) else {}
            if std:
                print(f"    Item.stdItem keys: {list(std.keys())}")

        show("Shield keys", deep_search(raw, ["shield", "health", "regen", "hp", "absorb"]))
        show("Power/EM/IR keys", deep_search(raw, ["power", "draw", "em", "ir", "signature", "thermal"]))
    else:
        print("  No shield file found!")

    # ─── 5. TURRET: Child weapons, DPS chain ───
    print("\n" + "=" * 72)
    print("  SECTION 5: TURRET (Hammerhead weapon chain)")
    print("=" * 72)

    if ship_file:
        raw = load_json(ship_file)
        show("Turret keys", deep_search(raw, ["turret", "manned"], max_results=20))

        loadout = raw.get("Loadout") or []
        if isinstance(loadout, list):
            turret_entries = [e for e in loadout if isinstance(e, dict) and "turret" in str(e.get("PortName", "")).lower()]
            print(f"\n  Turret loadout entries ({len(turret_entries)}):")
            for e in turret_entries[:5]:
                port = e.get("PortName", "?")
                cls = e.get("ClassName", "?")
                sub = e.get("Loadout", [])
                sub_count = len(sub) if isinstance(sub, list) else 0
                print(f"    {port} -> {cls} (sub-items: {sub_count})")
                if isinstance(sub, list):
                    for s in sub[:3]:
                        if isinstance(s, dict):
                            print(f"      {s.get('PortName', '?')} -> {s.get('ClassName', '?')}")

    # ─── 6. BESPOKE WEAPON (Ares Ion/Inferno) ───
    print("\n" + "=" * 72)
    print("  SECTION 6: BESPOKE WEAPONS (Ares)")
    print("=" * 72)

    ares_file = find_file(base, ["ares", "ion", "inferno"], "ships")
    if ares_file:
        print(f"\n>>> File: {ares_file.name}")
        raw = load_json(ares_file)
        show("Bespoke/Fixed keys", deep_search(raw, ["bespoke", "fixed", "unremovable", "lock"], max_results=15))

        parts = raw.get("Parts") or []
        if isinstance(parts, list):
            weapon_parts = []
            def find_weapons(p_list, depth=0):
                if depth > 4: return
                for p in p_list:
                    if not isinstance(p, dict): continue
                    name = p.get("Name", "")
                    if any(w in name.lower() for w in ["weapon", "gun", "hardpoint_weapon"]):
                        weapon_parts.append(p)
                    children = p.get("Parts") or []
                    if isinstance(children, list):
                        find_weapons(children, depth + 1)
            find_weapons(parts)
            print(f"\n  Weapon-related parts ({len(weapon_parts)}):")
            for wp in weapon_parts[:5]:
                print(f"    {wp.get('Name', '?')} -- Size: {wp.get('MaxSize', '?')}, Type: {wp.get('Type', '?')}")
                print(f"      All keys: {list(wp.keys())[:10]}")
    else:
        print("  No Ares file found")

    print("\n" + "=" * 72)
    print("  Done! Send this output to Claude for the final data fixes.")
    print("=" * 72 + "\n")


if __name__ == "__main__":
    main()
