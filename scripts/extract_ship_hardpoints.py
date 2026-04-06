#!/usr/bin/env python3
"""
SC LABS — Extractor de ship_hardpoints desde sc-unpacked JSON
=============================================================
Lee los JSONs individuales de cada nave en scripts/data/scunpacked/ships/
y genera un CSV listo para importar a Supabase.

Estructura de la tabla ship_hardpoints:
  - ship_reference: text (ClassName de la nave, ej: "AEGS_Avenger_Titan")
  - hardpoint_name: text (punto de montaje, ej: "hardpoint_weapon_class2_nose")
  - hardpoint_type: text (tipo inferido del hardpoint: Weapon, Shield, PowerPlant, etc.)
  - max_size: integer
  - min_size: integer
  - editable: boolean (si el jugador puede cambiar el item)
  - item_types: text (tipos aceptados, ej: "Turret.Gun|Turret.GunTurret|WeaponGun.Gun")
  - default_item_class: text (ClassName del item por defecto, ej: "Mount_Gimbal_S3")
  - default_item_uuid: text (UUID del item por defecto)
  - default_item_name: text (nombre del item, ej: "VariPuck S3 Gimbal Mount")
  - default_item_type: text (tipo del item, ej: "Turret.GunTurret")
  - default_item_manufacturer: text
  - default_item_grade: integer
  - loadout_json: text (JSON string del Loadout anidado - items dentro del item)

Solo extrae hardpoints RELEVANTES para el DPS calculator:
  - Weapons (guns, turrets, gimbals)
  - Missiles (racks, launchers)
  - Shields
  - Power Plants
  - Coolers
  - Quantum Drives
  - Radar
  - Countermeasures
  - Armor

Ignora: Controllers, Thrusters, Doors, Seats, Displays, Lights, etc.

Uso:
  python3 extract_ship_hardpoints.py
  → Genera: ship_hardpoints_export.csv
"""

import json
import csv
import os
import sys
from pathlib import Path

# ─── Configuración ──────────────────────────────────────────────────────────

SHIPS_DIR = Path(__file__).parent / "data" / "scunpacked" / "ships"
OUTPUT_CSV = Path(__file__).parent / "ship_hardpoints_export.csv"

# Tipos de hardpoint RELEVANTES para el DPS calculator
# Se infiere del nombre del hardpoint O del Type del item
RELEVANT_HP_PATTERNS = {
    "hardpoint_weapon":       "Weapon",
    "hardpoint_turret":       "Weapon",
    "hardpoint_missile":      "Weapon",      # missile racks son weapons
    "hardpoint_shield":       "Shield",
    "hardpoint_power_plant":  "PowerPlant",
    "hardpoint_cooler":       "Cooler",
    "hardpoint_quantum_drive":"QuantumDrive",
    "hardpoint_quantum_fuel":  "QuantumFuelTank",
    "hardpoint_radar":        "Radar",
    "hardpoint_countermeasure":"Countermeasure",
    "hardpoint_armor":        "Armor",
    "hardpoint_fuel_tank":    "FuelTank",
    "hardpoint_fuel_intake":  "FuelIntake",
    "hardpoint_engine_attach":"MainThruster",
    "hardpoint_lifesupport":  "LifeSupport",
}

# Tipos de item que nos interesan (por si el nombre del hardpoint no matchea)
RELEVANT_ITEM_TYPES = {
    "WeaponGun",    "Turret",       "MissileLauncher", "BombLauncher",
    "Shield",       "PowerPlant",   "Cooler",          "QuantumDrive",
    "Radar",        "WeaponDefensive", "Armor",        "FuelTank",
    "FuelIntake",   "MainThruster", "ManneuverThruster",
    "LifeSupportGenerator",
}

# Tipos que NO nos interesan (skip)
SKIP_TYPES = {
    "EnergyController", "DoorController", "CoolerController", "ShieldController",
    "FlightController", "LightController", "CommsController", "WeaponController",
    "MissileController", "CapacitorAssignmentController", "FuelController",
    "SelfDestruct", "Seat", "SeatAccess", "SeatDashboard", "Display",
    "Light", "Room", "Scanner", "Ping", "Transponder", "Door",
    "CargoGrid", "EMP", "LandingSystem", "DockingCollar", "Paints",
    "AirTrafficController", "WeaponRegenPool", "Relay", "Misc",
    "ControlPanel", "Button", "Sensor", "Lightgroup", "Decal",
    "NOITEM_Vehicle", "Avionics",
}


def infer_hardpoint_type(hp_name: str, item_type: str = "") -> str:
    """Infiere el tipo de hardpoint desde su nombre o el tipo del item."""
    hp_lower = hp_name.lower()

    # Match por nombre del hardpoint
    for pattern, hp_type in RELEVANT_HP_PATTERNS.items():
        if hp_lower.startswith(pattern):
            return hp_type

    # Match por tipo del item (Type campo, ej: "Turret.GunTurret")
    if item_type:
        main_type = item_type.split(".")[0]
        if main_type in RELEVANT_ITEM_TYPES:
            return main_type

    return ""


def is_relevant_hardpoint(hp: dict) -> bool:
    """Determina si un hardpoint es relevante para el DPS calculator."""
    hp_name = hp.get("HardpointName", "")
    item_type = hp.get("Type", "")

    # Si podemos inferir un tipo relevante, es relevante
    if infer_hardpoint_type(hp_name, item_type):
        return True

    # Chequear ItemTypes
    for it in hp.get("ItemTypes", []):
        t = it.get("Type", "")
        if t in RELEVANT_ITEM_TYPES:
            return True

    return False


def format_item_types(hp: dict) -> str:
    """Formatea los ItemTypes como string separado por |"""
    types = []
    for it in hp.get("ItemTypes", []):
        t = it.get("Type", "")
        st = it.get("SubType", "")
        if st:
            types.append(f"{t}.{st}")
        elif t:
            types.append(t)
    return "|".join(types)


def serialize_loadout(loadout: list) -> str:
    """Serializa el loadout anidado como JSON string, filtrando solo items relevantes."""
    if not loadout:
        return ""

    relevant_items = []
    for item in loadout:
        entry = {
            "HardpointName": item.get("HardpointName", ""),
            "MaxSize": item.get("MaxSize", 0),
            "MinSize": item.get("MinSize", 0),
        }
        # Solo agregar datos del item si tiene ClassName (es un item real, no slot vacío)
        if "ClassName" in item:
            entry["ClassName"] = item["ClassName"]
            entry["UUID"] = item.get("UUID", "")
            entry["Name"] = item.get("Name", "")
            entry["Type"] = item.get("Type", "")
            entry["ManufacturerName"] = item.get("ManufacturerName", "")
            entry["Grade"] = item.get("Grade", 0)

        if "ItemTypes" in item:
            entry["ItemTypes"] = format_item_types(item)

        # Recursivo: si el sub-item tiene su propio loadout relevante
        sub_loadout = item.get("Loadout", [])
        if sub_loadout:
            # Solo mantener items de arma/misil (no weapon attachments como BAR1, MEC, POW, VEN)
            relevant_sub = [s for s in sub_loadout
                          if s.get("Type", "").split(".")[0] not in ("WeaponAttachment", "Misc", "Battery", "JumpDrive")]
            if relevant_sub:
                entry["Loadout"] = json.loads(serialize_loadout(relevant_sub)) if relevant_sub else []

        relevant_items.append(entry)

    return json.dumps(relevant_items, ensure_ascii=False)


def process_ship(ship_file: Path) -> list:
    """Procesa un archivo JSON de nave y retorna filas para el CSV."""
    with open(ship_file, "r", encoding="utf-8") as f:
        ship = json.load(f)

    ship_ref = ship.get("ClassName", "")
    if not ship_ref:
        return []

    loadout = ship.get("Loadout", [])
    rows = []

    for hp in loadout:
        hp_name = hp.get("HardpointName", "")
        if not hp_name:
            continue

        # Filtrar solo hardpoints relevantes
        if not is_relevant_hardpoint(hp):
            continue

        item_type = hp.get("Type", "")
        hp_type = infer_hardpoint_type(hp_name, item_type)

        # Datos del item por defecto
        default_class = hp.get("ClassName", "")
        default_uuid = hp.get("UUID", "")
        default_name = hp.get("Name", "")
        default_type = item_type
        default_manufacturer = hp.get("ManufacturerName", "")
        default_grade = hp.get("Grade", 0)

        # Serializar loadout anidado (gimbal→weapon, rack→missiles)
        sub_loadout = hp.get("Loadout", [])
        loadout_json = serialize_loadout(sub_loadout) if sub_loadout else ""

        rows.append({
            "ship_reference":           ship_ref,
            "hardpoint_name":           hp_name,
            "hardpoint_type":           hp_type,
            "max_size":                 hp.get("MaxSize", 0),
            "min_size":                 hp.get("MinSize", 0),
            "editable":                 hp.get("Editable", False),
            "item_types":               format_item_types(hp),
            "default_item_class":       default_class,
            "default_item_uuid":        default_uuid,
            "default_item_name":        default_name,
            "default_item_type":        default_type,
            "default_item_manufacturer":default_manufacturer,
            "default_item_grade":       default_grade,
            "loadout_json":             loadout_json,
        })

    return rows


def main():
    if not SHIPS_DIR.exists():
        print(f"ERROR: No se encontró el directorio {SHIPS_DIR}")
        sys.exit(1)

    ship_files = sorted(SHIPS_DIR.glob("*.json"))
    print(f"Encontradas {len(ship_files)} naves en {SHIPS_DIR}")

    all_rows = []
    ship_count = 0

    for sf in ship_files:
        try:
            rows = process_ship(sf)
            if rows:
                all_rows.extend(rows)
                ship_count += 1
        except Exception as e:
            print(f"  ERROR procesando {sf.name}: {e}")

    # Escribir CSV
    if not all_rows:
        print("No se generaron filas.")
        sys.exit(1)

    fieldnames = [
        "ship_reference", "hardpoint_name", "hardpoint_type",
        "max_size", "min_size", "editable", "item_types",
        "default_item_class", "default_item_uuid", "default_item_name",
        "default_item_type", "default_item_manufacturer", "default_item_grade",
        "loadout_json",
    ]

    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(all_rows)

    print(f"\nResultado:")
    print(f"  Naves procesadas:   {ship_count}")
    print(f"  Hardpoints totales: {len(all_rows)}")
    print(f"  CSV generado:       {OUTPUT_CSV}")

    # Stats por tipo
    type_counts = {}
    for r in all_rows:
        t = r["hardpoint_type"] or "Unknown"
        type_counts[t] = type_counts.get(t, 0) + 1

    print(f"\n  Hardpoints por tipo:")
    for t, c in sorted(type_counts.items(), key=lambda x: -x[1]):
        print(f"    {t:25s} {c:5d}")

    # Preview: Avenger Titan
    titan_rows = [r for r in all_rows if r["ship_reference"] == "AEGS_Avenger_Titan"]
    if titan_rows:
        print(f"\n  Preview — Aegis Avenger Titan ({len(titan_rows)} hardpoints):")
        for r in titan_rows:
            loadout_preview = ""
            if r["loadout_json"]:
                try:
                    items = json.loads(r["loadout_json"])
                    names = [i.get("Name", "?") for i in items if i.get("Name")]
                    loadout_preview = f" → [{', '.join(names)}]"
                except:
                    pass
            print(f"    {r['hardpoint_name']:45s} {r['hardpoint_type']:18s} S{r['max_size']} "
                  f"{'[E]' if r['editable'] else '   '} "
                  f"{r['default_item_name'] or '(empty)':30s}{loadout_preview}")


if __name__ == "__main__":
    main()
