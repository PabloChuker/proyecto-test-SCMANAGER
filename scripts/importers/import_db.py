"""
SC Labs — Import orchestrator
Reads scunpacked JSON files and generates a single SQL file with all INSERTs.

Usage:
    python import_db.py [--version 4.7.2] [--scunpacked-path <path>]

Environment variables (fallback):
    SCUNPACKED_LOCAL_PATH   path to scunpacked-data directory
    GAME_VERSION            game version string (e.g. "4.7.2")
"""

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

# Ships
from ships.import_ships                          import generate_ship_inserts
from ships.import_ship_flight_stats              import generate_ship_flight_stats_inserts
from ships.import_ship_resistances               import generate_ship_resistances_inserts
from ships.import_ship_fuel                      import generate_ship_fuel_inserts
from ships.import_ship_insurance                 import generate_ship_insurance_inserts
from ships.import_ship_hardpoints                import generate_ship_hardpoints_inserts
from ships.import_ship_power_reference           import generate_ship_power_reference_inserts
from ships.import_ship_pools                     import generate_ship_pools_inserts
from ships.import_cargo_grids                    import generate_cargo_grids_inserts

# Components — ship-items.json
from components.import_emps                      import generate_emps_inserts
from components.import_missiles                  import generate_missiles_inserts
from components.import_quantum_drives            import generate_quantum_drives_inserts
from components.import_weapon_defensives         import generate_weapon_defensives_inserts
from components.import_weapon_mining             import generate_weapon_mining_inserts

# Components — archivos individuales items/
from components.import_bombs                     import generate_bombs_inserts
from components.import_jump_drives               import generate_jump_drives_inserts
from components.import_weapon_salvage            import generate_weapon_salvage_inserts


# ---------------------------------------------------------------------------
# CLI arg parsing
# ---------------------------------------------------------------------------

def _get_arg(flag, default=None):
    args = sys.argv[1:]
    if flag in args:
        idx = args.index(flag)
        if idx + 1 < len(args):
            return args[idx + 1]
    return default


def _resolve_scunpacked(cli_path):
    if cli_path:
        return Path(cli_path)
    env = os.environ.get("SCUNPACKED_LOCAL_PATH")
    if env:
        return Path(env)
    return Path(__file__).parent.parent.parent / "scunpacked"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run():
    version        = _get_arg("--version") or os.environ.get("GAME_VERSION", "unknown")
    scunpacked_dir = _resolve_scunpacked(_get_arg("--scunpacked-path"))

    print(f"=== SC Labs SQL Generator ===")
    print(f"Version:    {version}")
    print(f"Scunpacked: {scunpacked_dir}")
    print()

    if not scunpacked_dir.exists():
        print(f"ERROR: scunpacked directory not found: {scunpacked_dir}")
        sys.exit(1)

    ships_json_path = scunpacked_dir / "ships.json"
    if not ships_json_path.exists():
        print(f"ERROR: Required file not found: {ships_json_path}")
        sys.exit(1)

    ship_items_path = scunpacked_dir / "ship-items.json"
    if not ship_items_path.exists():
        print(f"ERROR: Required file not found: {ship_items_path}")
        sys.exit(1)

    items_dir = scunpacked_dir / "items"
    if not items_dir.exists():
        print(f"ERROR: Required directory not found: {items_dir}")
        sys.exit(1)

    print("Loading ships.json...")
    with open(ships_json_path, encoding="utf-8") as f:
        ships_data = json.load(f)
    print(f"  {len(ships_data)} ships loaded.")

    print("Loading ship-items.json...")
    with open(ship_items_path, encoding="utf-8") as f:
        items_data = json.load(f)
    print(f"  {len(items_data)} items loaded.")
    print()

    # Generators: (table_name, function, data_source)
    GENERATORS = [
        # Ships
        ("ships",                 generate_ship_inserts,                ships_data),
        ("ship_flight_stats",     generate_ship_flight_stats_inserts,   ships_data),
        ("ship_resistances",      generate_ship_resistances_inserts,    ships_data),
        ("ship_fuel",             generate_ship_fuel_inserts,           ships_data),
        ("ship_insurance",        generate_ship_insurance_inserts,      ships_data),
        ("ship_hardpoints",       generate_ship_hardpoints_inserts,     ships_data),
        ("ship_power_reference",  generate_ship_power_reference_inserts, ships_data),
        ("ship_pools",            generate_ship_pools_inserts,          ships_data),
        ("cargo_grids",           generate_cargo_grids_inserts,         ships_data),
        # Components — ship-items.json
        ("emps",                  generate_emps_inserts,                items_data),
        ("missiles",              generate_missiles_inserts,            items_data),
        ("quantum_drives",        generate_quantum_drives_inserts,      items_data),
        ("weapon_defensives",     generate_weapon_defensives_inserts,   items_data),
        ("weapon_mining",         generate_weapon_mining_inserts,       items_data),
        # Components — archivos individuales items/
        ("bombs",                 generate_bombs_inserts,               items_dir),
        ("jump_drives",           generate_jump_drives_inserts,         items_dir),
        ("weapon_salvage",        generate_weapon_salvage_inserts,      items_dir),
    ]

    all_sections = {}
    print("--- Generating ---")
    for table, fn, data in GENERATORS:
        sqls = fn(data, version)
        all_sections[table] = sqls
        print(f"  {table:<45} {len(sqls):>5} statements")
    print()

    # Write output
    output_name = f"upload_v{version.replace('.', '_')}.sql"
    output_path = Path(__file__).parent / output_name

    total = 0
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(f"-- SC Labs BATCH INSERT\n")
        f.write(f"-- Game version: {version}\n")
        f.write(f"-- Generated by: scripts/importers/import_db.py\n\n")
        f.write("BEGIN;\n\n")

        for table, sqls in all_sections.items():
            if not sqls:
                continue
            count = sum(1 for s in sqls if s.startswith("INSERT"))
            f.write(f"-- ─── {table} ({count} rows) ───\n")
            for stmt in sqls:
                if stmt:
                    f.write(stmt + "\n")
            f.write("\n")
            total += count

        f.write("COMMIT;\n")

    print(f"Output: {output_path}")
    print(f"Total:  {total} INSERT statements")


if __name__ == "__main__":
    run()
