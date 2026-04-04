#!/usr/bin/env python3
"""
=============================================================================
AL FILO — Datamining Pipeline v2.0 (Mega Schema)

Targets the normalized schema v2 with separate stats tables.

Pipeline:
  Phase A: Insert all items + type-specific stats tables
  Phase B: Insert ships + hardpoints
  Phase C: Link default loadouts (equippedItemId on hardpoints)
  Phase D: Seed shops & inventory (mock + scunpacked if available)
  Phase E: Register game version

Usage:
  python ingest_v2.py --version 4.0.1
  python ingest_v2.py --version 4.0.1 --local-path ./data/scunpacked
  python ingest_v2.py --version 4.0.1 --dry-run
  python ingest_v2.py --version 4.0.1 --skip-clone --seed-shops
=============================================================================
"""

import os
import sys
import json
import uuid
import subprocess
from pathlib import Path
from datetime import datetime
from typing import Optional

import click
from dotenv import load_dotenv
from rich.console import Console
from rich.table import Table
from rich.progress import Progress, SpinnerColumn, TextColumn
from sqlalchemy import create_engine, text

try:
    import orjson
    def load_json(path: Path) -> dict:
        with open(path, "rb") as f:
            return orjson.loads(f.read())
except ImportError:
    def load_json(path: Path) -> dict:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

load_dotenv()
console = Console()

# =============================================================================
# CONSTANTS
# =============================================================================

# scunpacked type → our ItemType enum
TYPE_MAP = {
    "Ship": "SHIP", "Vehicle": "VEHICLE",
    "WeaponGun": "WEAPON", "WeaponMining": "MINING_LASER",
    "MissileLauncher": "WEAPON", "Missile": "MISSILE", "Torpedo": "TORPEDO",
    "Shield": "SHIELD", "Armor": "ARMOR",
    "PowerPlant": "POWER_PLANT", "Cooler": "COOLER",
    "QuantumDrive": "QUANTUM_DRIVE", "Radar": "RADAR", "Avionics": "AVIONICS",
    "MainThruster": "THRUSTER", "ManneuveringThruster": "THRUSTER",
    "FuelTank": "FUEL_TANK", "FuelIntake": "FUEL_INTAKE",
    "Turret": "TURRET", "TurretBase": "TURRET",
    "CountermeasureLauncher": "COUNTERMEASURE",
    "MiningLaser": "MINING_LASER", "TractorBeam": "TRACTOR_BEAM",
    "SalvageHead": "SALVAGE_HEAD", "EMP": "EMP", "QED": "QED",
}

# scunpacked type → HardpointCategory enum
HP_CAT_MAP = {
    "WeaponGun": "WEAPON", "WeaponMining": "MINING",
    "MissileLauncher": "MISSILE_RACK", "Turret": "TURRET", "TurretBase": "TURRET",
    "Shield": "SHIELD", "PowerPlant": "POWER_PLANT", "Cooler": "COOLER",
    "QuantumDrive": "QUANTUM_DRIVE", "MainThruster": "THRUSTER_MAIN",
    "ManneuveringThruster": "THRUSTER_MANEUVERING", "Radar": "RADAR",
    "Avionics": "AVIONICS", "Armor": "ARMOR", "FuelTank": "FUEL_TANK",
    "FuelIntake": "FUEL_INTAKE", "CountermeasureLauncher": "COUNTERMEASURE",
    "TractorBeam": "TRACTOR_BEAM", "SalvageHead": "SALVAGE",
}

# ItemType → which stats table to insert into
TYPE_STATS_TABLE = {
    "WEAPON": "weapon_stats", "TURRET": "weapon_stats",
    "MISSILE": "missile_stats", "TORPEDO": "missile_stats",
    "SHIELD": "shield_stats",
    "POWER_PLANT": "power_stats",
    "COOLER": "cooling_stats",
    "QUANTUM_DRIVE": "quantum_stats",
    "MINING_LASER": "mining_stats",
    "THRUSTER": "thruster_stats",
}

# Junk filters: skip these items/hardpoints entirely
JUNK_PATTERNS = {
    "door", "فلورستان", "placeholder", "moveable", "flightblade",
    "debris", "seat", "bed", "toilet", "flair", "decal",
    "landing_gear", "light_", "beacon", "interior",
}

def is_junk(name: str) -> bool:
    """Check if an item/hardpoint name is junk we should skip."""
    lower = (name or "").lower()
    return any(p in lower for p in JUNK_PATTERNS)


# =============================================================================
# SAFE EXTRACTORS
# =============================================================================

def sf(val, default=None) -> Optional[float]:
    if val is None: return default
    try:
        r = float(val)
        return r if r == r else default
    except (ValueError, TypeError):
        return default

def si(val, default=None) -> Optional[int]:
    if val is None: return default
    try: return int(float(val))
    except (ValueError, TypeError): return default

def mfr(raw: dict) -> Optional[str]:
    m = raw.get("Manufacturer") or raw.get("manufacturer")
    if isinstance(m, dict): return m.get("Name") or m.get("name") or m.get("Code")
    return m

def deep_get(d: dict, *keys, default=None):
    """Safely traverse nested dicts."""
    for k in keys:
        if not isinstance(d, dict): return default
        d = d.get(k, default)
    return d


# =============================================================================
# PHASE A: Parse & insert items + stats
# =============================================================================

def parse_item(raw: dict, game_version: str) -> Optional[dict]:
    """Parse a single item JSON. Returns None for junk items."""
    # Soporte para formato "Raw" de los JSONs locales del repo
    if "Raw" in raw and "Entity" in raw["Raw"]:
        entity = raw["Raw"]["Entity"]
        components = entity.get("Components", {})
        
        # Intentar obtener AttachDef para el tipo de item
        attach_params = (
            components.get("SAttachableComponentParams", {}) or
            components.get("SCItemWeaponComponentParams", {}) or
            {}
        )
        attach_def = attach_params.get("AttachDef", {})
        
        # Si no hay AttachDef, puede estar en otro lugar según la versión
        if not attach_def:
            for c_val in components.values():
                if isinstance(c_val, dict) and "AttachDef" in c_val:
                    attach_def = c_val["AttachDef"]
                    break

        loc = attach_def.get("Localization", {}).get("English", {})
        
        # Aplanar para compatibilidad con el resto del script
        raw = {
            "reference":     entity.get("__ref"),
            "className":     entity.get("__path", "").split("/")[-1].replace(".xml", ""),
            "name":          loc.get("Name") or entity.get("__ref", "Unknown"),
            "type":          attach_def.get("Type"),
            "subType":       attach_def.get("SubType"),
            "size":          attach_def.get("Size"),
            "grade":         attach_def.get("Grade"),
            "manufacturer":  attach_def.get("Manufacturer", {}).get("Code"),
            "mass":          attach_def.get("Inventory", {}).get("Mass"),
            "hitPoints":     components.get("SHealthComponentParams", {}).get("Health"),
            "_raw":          raw # Guardar el original para extract_stats
        }

    raw_type = raw.get("Type") or raw.get("type") or raw.get("ItemType", "")
    item_type = TYPE_MAP.get(raw_type, "OTHER")

    reference = raw.get("ClassName") or raw.get("className") or raw.get("reference", "")
    if not reference:
        return None

    name = raw.get("Name") or raw.get("name") or reference
    if is_junk(name) or is_junk(reference):
        return None

    item = {
        "reference": reference,
        "name": name,
        "localizedName": raw.get("LocalizedName") or raw.get("displayName"),
        "className": raw.get("ClassName") or raw.get("className"),
        "type": item_type,
        "subType": raw.get("SubType") or raw.get("subType"),
        "size": si(raw.get("Size") or raw.get("size")),
        "grade": raw.get("Grade") or raw.get("grade"),
        "manufacturer": mfr(raw),
        "mass": sf(raw.get("Mass")),
        "hitPoints": sf(raw.get("HitPoints") or raw.get("Health")),
        "gameVersion": game_version,
    }

    stats = extract_stats(raw, item_type)

    return {"item": item, "stats": stats, "statsTable": TYPE_STATS_TABLE.get(item_type)}


def extract_stats(raw: dict, item_type: str) -> dict:
    """Extract type-specific stats into the correct table shape."""
    power = raw.get("Power", raw.get("power", {})) or {}
    heat = raw.get("Heat", raw.get("heat", {})) or {}
    emissions = raw.get("Emissions", {}) or {}

    base_consumption = {
        "powerDraw": sf(deep_get(power, "PowerDraw") or deep_get(power, "draw")),
        "thermalOutput": sf(deep_get(heat, "ThermalOutput") or deep_get(heat, "output")),
        "emSignature": sf(deep_get(emissions, "EM") or raw.get("EmSignature")),
        "irSignature": sf(deep_get(emissions, "IR") or raw.get("IrSignature")),
    }

    if item_type in ("WEAPON", "TURRET"):
        w = raw.get("Weapon", raw.get("weapon", {})) or {}
        dmg = w.get("Damage", w.get("damage", {})) or {}
        alpha = sf(dmg.get("Total") or dmg.get("total"))
        if alpha is None and isinstance(dmg, dict):
            alpha = sum(sf(v, 0) for k, v in dmg.items() if isinstance(v, (int, float)))
            alpha = alpha if alpha > 0 else None
        fire_rate = sf(w.get("FireRate") or w.get("rateOfFire"))
        dps = None
        if alpha and fire_rate and fire_rate > 0:
            dps = round(alpha * (fire_rate / 60.0), 2)
        return {
            "dps": dps, "alphaDamage": alpha, "fireRate": fire_rate,
            "range": sf(w.get("Range") or w.get("range")),
            "speed": sf(w.get("Speed") or w.get("speed")),
            "ammoCount": si(w.get("AmmoCount") or w.get("ammo")),
            "damageType": w.get("DamageType") or w.get("damageType"),
            "dmgPhysical": sf(dmg.get("Physical")),
            "dmgEnergy": sf(dmg.get("Energy")),
            "dmgDistortion": sf(dmg.get("Distortion")),
            "dmgThermal": sf(dmg.get("Thermal")),
            **base_consumption,
        }

    elif item_type == "SHIELD":
        s = raw.get("Shield", raw.get("shield", {})) or {}
        absorb = s.get("Absorption", {}) or {}
        return {
            "maxHp": sf(s.get("MaxShieldHealth") or s.get("hp")),
            "regenRate": sf(s.get("MaxShieldRegen") or s.get("regen")),
            "downedDelay": sf(s.get("DownedRegenDelay") or s.get("downDelay")),
            "dmgAbsPhysical": sf(deep_get(absorb, "Physical")),
            "dmgAbsEnergy": sf(deep_get(absorb, "Energy")),
            "dmgAbsDistortion": sf(deep_get(absorb, "Distortion")),
            **base_consumption,
        }

    elif item_type == "POWER_PLANT":
        pp = raw.get("PowerPlant", raw.get("powerPlant", {})) or {}
        return {
            "powerOutput": sf(pp.get("MaxPowerOutput") or pp.get("output")),
            "powerBase": sf(pp.get("PowerBase") or deep_get(power, "PowerBase")),
            **{k: v for k, v in base_consumption.items() if k != "powerDraw"},
        }

    elif item_type == "COOLER":
        c = raw.get("Cooler", raw.get("cooler", {})) or {}
        return {
            "coolingRate": sf(c.get("CoolingRate") or c.get("rate")),
            "suppressionHeat": sf(c.get("SuppressionHeatFactor")),
            "suppressionIR": sf(c.get("SuppressionIRFactor")),
            **base_consumption,
        }

    elif item_type == "QUANTUM_DRIVE":
        q = raw.get("QuantumDrive", raw.get("quantumDrive", {})) or {}
        return {
            "maxSpeed": sf(q.get("MaxSpeed") or q.get("speed")),
            "maxRange": sf(q.get("MaxRange") or q.get("range")),
            "fuelRate": sf(q.get("FuelRate") or q.get("fuelRate")),
            "spoolUpTime": sf(q.get("SpoolUpTime") or q.get("spoolUp")),
            "cooldownTime": sf(q.get("Cooldown") or q.get("cooldown")),
            "stage1Accel": sf(q.get("Stage1AccelerationRate")),
            "stage2Accel": sf(q.get("Stage2AccelerationRate")),
            "quantumType": q.get("DriveType") or q.get("type"),
            **base_consumption,
        }

    elif item_type == "MINING_LASER":
        m = raw.get("Mining", raw.get("mining", {})) or {}
        return {
            "miningPower": sf(m.get("MiningPower") or m.get("power")),
            "resistance": sf(m.get("Resistance")),
            "instability": sf(m.get("Instability")),
            "optimalRange": sf(m.get("OptimalRange")),
            "maxRange": sf(m.get("MaxRange")),
            "throttleRate": sf(m.get("ThrottleRate")),
            "powerDraw": base_consumption["powerDraw"],
            "thermalOutput": base_consumption["thermalOutput"],
        }

    elif item_type in ("MISSILE", "TORPEDO"):
        m = raw.get("Missile", raw.get("missile", {})) or {}
        return {
            "damage": sf(m.get("Damage") if not isinstance(m.get("Damage"), dict) else m.get("Damage", {}).get("Total")),
            "lockTime": sf(m.get("LockTime") or m.get("lockTime")),
            "lockRange": sf(m.get("LockRange") or m.get("lockRange")),
            "trackingAngle": sf(m.get("TrackingAngle")),
            "speed": sf(m.get("Speed") or m.get("speed")),
            "fuelTime": sf(m.get("FuelTime")),
            "lockingType": m.get("LockingType") or m.get("trackingSignalType"),
        }

    elif item_type == "THRUSTER":
        t = raw.get("Thruster", raw.get("thruster", {})) or {}
        return {
            "thrustCapacity": sf(t.get("ThrustCapacity")),
            "maxThrust": sf(t.get("MaxThrust") or t.get("thrust")),
            "fuelBurnRate": sf(t.get("FuelBurnRate")),
            "thrustType": t.get("ThrustType") or t.get("type"),
            "powerDraw": base_consumption["powerDraw"],
            "thermalOutput": base_consumption["thermalOutput"],
            "emSignature": base_consumption["emSignature"],
        }

    return {}


# =============================================================================
# PHASE B: Parse ships and hardpoints
# =============================================================================

def parse_ship(raw: dict, game_version: str) -> Optional[dict]:
    """Parse a ship JSON into item + ship data + hardpoints + defaults."""
    reference = raw.get("ClassName") or raw.get("className", "")
    if not reference:
        return None

    name = raw.get("Name") or raw.get("name") or reference
    item_type = "VEHICLE" if raw.get("Type") == "Vehicle" else "SHIP"

    item = {
        "reference": reference, "name": name,
        "localizedName": raw.get("LocalizedName") or raw.get("displayName"),
        "className": raw.get("ClassName") or raw.get("className"),
        "type": item_type,
        "subType": raw.get("SubType") or raw.get("subType"),
        "size": si(raw.get("Size") or raw.get("size")),
        "manufacturer": mfr(raw),
        "mass": sf(raw.get("Mass")),
        "gameVersion": game_version,
    }

    flight = raw.get("FlightCharacteristics", raw.get("flight", {})) or {}
    ifcs = raw.get("Ifcs", {}) or {}
    dims = raw.get("Dimensions", {}) or {}

    ship = {
        "maxCrew": si(raw.get("Crew") or raw.get("crew")),
        "cargo": sf(raw.get("Cargo") or raw.get("cargo")),
        "scmSpeed": sf(flight.get("MaxSpeed") or flight.get("ScmSpeed") or ifcs.get("MaxSpeed")),
        "afterburnerSpeed": sf(flight.get("AfterburnerSpeed") or ifcs.get("AfterburnerSpeed")),
        "pitchRate": sf(deep_get(ifcs, "Pitch", "Rate") if isinstance(ifcs.get("Pitch"), dict) else None),
        "yawRate": sf(deep_get(ifcs, "Yaw", "Rate") if isinstance(ifcs.get("Yaw"), dict) else None),
        "rollRate": sf(deep_get(ifcs, "Roll", "Rate") if isinstance(ifcs.get("Roll"), dict) else None),
        "maxAccelMain": sf(ifcs.get("MaxAccelMain")),
        "maxAccelRetro": sf(ifcs.get("MaxAccelRetro")),
        "hydrogenFuelCap": sf(raw.get("HydrogenFuelCapacity")),
        "quantumFuelCap": sf(raw.get("QuantumFuelCapacity")),
        "lengthMeters": sf(dims.get("Length") or raw.get("Length")),
        "beamMeters": sf(dims.get("Width") or raw.get("Beam") or raw.get("Width")),
        "heightMeters": sf(dims.get("Height") or raw.get("Height")),
        "role": raw.get("Role") or raw.get("role"),
        "focus": raw.get("Focus") or raw.get("focus") or raw.get("Description"),
        "career": raw.get("Career") or raw.get("career"),
        "isSpaceship": item_type == "SHIP",
        "isGravlev": raw.get("IsGravlev", False),
        "baseEmSignature": sf(raw.get("BaseEmSignature")),
        "baseIrSignature": sf(raw.get("BaseIrSignature")),
        "baseCsSignature": sf(raw.get("BaseCsSignature")),
    }

    hardpoints = []
    default_items = []

    raw_hps = (raw.get("Hardpoints") or raw.get("hardpoints")
               or raw.get("Components") or raw.get("Loadout") or [])

    for hp in raw_hps:
        if not isinstance(hp, dict):
            continue
        hp_name = hp.get("Name") or hp.get("name") or hp.get("HardpointName", "")
        if not hp_name or is_junk(hp_name):
            continue

        hp_type = hp.get("Type") or hp.get("type") or hp.get("ItemType", "OTHER")
        category = HP_CAT_MAP.get(hp_type, "OTHER")

        hardpoints.append({
            "hardpointName": hp_name,
            "category": category,
            "minSize": si(hp.get("MinSize") or hp.get("minSize"), 0),
            "maxSize": si(hp.get("MaxSize") or hp.get("maxSize") or hp.get("Size") or hp.get("size"), 0),
            "isFixed": hp.get("Fixed", False),
            "isManned": hp.get("Manned", False),
            "isInternal": category not in ("WEAPON", "MISSILE_RACK", "TURRET"),
        })

        equipped_ref = (hp.get("DefaultItem") or hp.get("defaultItem")
                        or hp.get("Equipped") or hp.get("equipped")
                        or hp.get("ItemClassName") or hp.get("ClassName"))
        if equipped_ref:
            default_items.append({"hardpointName": hp_name, "itemReference": equipped_ref})

    return {"item": item, "ship": ship, "hardpoints": hardpoints, "default_items": default_items}


# =============================================================================
# DATABASE OPERATIONS
# =============================================================================

def upsert_item(conn, item: dict) -> str:
    """Insert or update an item. Returns its DB id."""
    item_id = str(uuid.uuid4())
    raw_json = json.dumps(item.get("_raw"), default=str) if item.get("_raw") else None

    conn.execute(text("""
        INSERT INTO items (id, reference, name, "localizedName", "className", type,
                          "subType", size, grade, manufacturer, mass, "hitPoints",
                          "gameVersion", "rawData", "createdAt", "updatedAt")
        VALUES (:id, :ref, :name, :lname, :cname, :type, :sub, :size, :grade,
                :mfr, :mass, :hp, :ver, CAST(:raw AS JSONB), NOW(), NOW())
        ON CONFLICT (reference) DO UPDATE SET
            name = EXCLUDED.name, "localizedName" = EXCLUDED."localizedName",
            "className" = EXCLUDED."className", type = EXCLUDED.type,
            "subType" = EXCLUDED."subType", size = EXCLUDED.size,
            grade = EXCLUDED.grade, manufacturer = EXCLUDED.manufacturer,
            mass = EXCLUDED.mass, "hitPoints" = EXCLUDED."hitPoints",
            "gameVersion" = EXCLUDED."gameVersion", "rawData" = EXCLUDED."rawData",
            "updatedAt" = NOW()
    """), {
        "id": item_id, "ref": item["reference"], "name": item["name"],
        "lname": item.get("localizedName"), "cname": item.get("className"),
        "type": item["type"], "sub": item.get("subType"), "size": item.get("size"),
        "grade": item.get("grade"), "mfr": item.get("manufacturer"),
        "mass": item.get("mass"), "hp": item.get("hitPoints"),
        "ver": item["gameVersion"], "raw": raw_json,
    })
    row = conn.execute(text("SELECT id FROM items WHERE reference = :r"), {"r": item["reference"]}).fetchone()
    return row[0] if row else item_id


def upsert_stats(conn, table: str, item_id: str, stats: dict):
    """Insert stats into the appropriate table. Uses dynamic SQL."""
    filtered = {k: v for k, v in stats.items() if v is not None}
    if not filtered:
        return

    cols = ', '.join(f'"{k}"' for k in filtered.keys())
    placeholders = ', '.join(f':{k}' for k in filtered.keys())
    updates = ', '.join(f'"{k}" = EXCLUDED."{k}"' for k in filtered.keys())

    sql = f"""
        INSERT INTO {table} (id, "itemId", {cols})
        VALUES (:id, :itemId, {placeholders})
        ON CONFLICT ("itemId") DO UPDATE SET {updates}
    """
    conn.execute(text(sql), {"id": str(uuid.uuid4()), "itemId": item_id, **filtered})


def upsert_ship(conn, item_id: str, ship: dict):
    conn.execute(text("""
        INSERT INTO ships (id, "itemId", "maxCrew", cargo, "scmSpeed", "afterburnerSpeed",
            "pitchRate", "yawRate", "rollRate", "maxAccelMain", "maxAccelRetro",
            "hydrogenFuelCap", "quantumFuelCap", "lengthMeters", "beamMeters", "heightMeters",
            role, focus, career, "isSpaceship", "isGravlev",
            "baseEmSignature", "baseIrSignature", "baseCsSignature")
        VALUES (:id, :itemId, :maxCrew, :cargo, :scmSpeed, :afterburnerSpeed,
            :pitchRate, :yawRate, :rollRate, :maxAccelMain, :maxAccelRetro,
            :hydrogenFuelCap, :quantumFuelCap, :lengthMeters, :beamMeters, :heightMeters,
            :role, :focus, :career, :isSpaceship, :isGravlev,
            :baseEmSignature, :baseIrSignature, :baseCsSignature)
        ON CONFLICT ("itemId") DO UPDATE SET
            "maxCrew"=EXCLUDED."maxCrew", cargo=EXCLUDED.cargo,
            "scmSpeed"=EXCLUDED."scmSpeed", "afterburnerSpeed"=EXCLUDED."afterburnerSpeed",
            "pitchRate"=EXCLUDED."pitchRate", "yawRate"=EXCLUDED."yawRate",
            "rollRate"=EXCLUDED."rollRate", "maxAccelMain"=EXCLUDED."maxAccelMain",
            "maxAccelRetro"=EXCLUDED."maxAccelRetro",
            "hydrogenFuelCap"=EXCLUDED."hydrogenFuelCap", "quantumFuelCap"=EXCLUDED."quantumFuelCap",
            "lengthMeters"=EXCLUDED."lengthMeters", "beamMeters"=EXCLUDED."beamMeters",
            "heightMeters"=EXCLUDED."heightMeters",
            role=EXCLUDED.role, focus=EXCLUDED.focus, career=EXCLUDED.career,
            "isSpaceship"=EXCLUDED."isSpaceship", "isGravlev"=EXCLUDED."isGravlev",
            "baseEmSignature"=EXCLUDED."baseEmSignature", "baseIrSignature"=EXCLUDED."baseIrSignature",
            "baseCsSignature"=EXCLUDED."baseCsSignature"
    """), {"id": str(uuid.uuid4()), "itemId": item_id, **ship})


def upsert_hardpoint(conn, parent_item_id: str, hp: dict):
    conn.execute(text("""
        INSERT INTO hardpoints (id, "parentItemId", "hardpointName", category,
            "minSize", "maxSize", "isFixed", "isManned", "isInternal")
        VALUES (:id, :pid, :name, :cat, :mins, :maxs, :fix, :man, :int)
        ON CONFLICT ("parentItemId", "hardpointName") DO UPDATE SET
            category=EXCLUDED.category, "minSize"=EXCLUDED."minSize",
            "maxSize"=EXCLUDED."maxSize", "isFixed"=EXCLUDED."isFixed",
            "isManned"=EXCLUDED."isManned", "isInternal"=EXCLUDED."isInternal"
    """), {
        "id": str(uuid.uuid4()), "pid": parent_item_id,
        "name": hp["hardpointName"], "cat": hp["category"],
        "mins": hp["minSize"], "maxs": hp["maxSize"],
        "fix": hp["isFixed"], "man": hp["isManned"], "int": hp["isInternal"],
    })


# =============================================================================
# PHASE C: Link default loadouts
# =============================================================================

def resolve_item_id(conn, ref: str) -> Optional[str]:
    if not ref:
        return None
    for field in ["reference", '"className"']:
        row = conn.execute(text(f"SELECT id FROM items WHERE {field} = :r LIMIT 1"), {"r": ref}).fetchone()
        if row: return row[0]
    row = conn.execute(text('SELECT id FROM items WHERE LOWER("className") = LOWER(:r) LIMIT 1'), {"r": ref}).fetchone()
    if row: return row[0]
    row = conn.execute(text("SELECT id FROM items WHERE LOWER(name) = LOWER(:r) LIMIT 1"), {"r": ref}).fetchone()
    return row[0] if row else None


def link_default_item(conn, parent_id: str, hp_name: str, item_ref: str) -> bool:
    equip_id = resolve_item_id(conn, item_ref)
    if not equip_id:
        return False
    r = conn.execute(text("""
        UPDATE hardpoints SET "equippedItemId" = :eid
        WHERE "parentItemId" = :pid AND "hardpointName" = :hp
    """), {"eid": equip_id, "pid": parent_id, "hp": hp_name})
    return r.rowcount > 0


# =============================================================================
# PHASE D: Shops
# =============================================================================

def seed_mock_shops(conn):
    """Insert realistic SC shops for testing the economy UI."""
    console.print("[cyan]→ Phase D: Seeding mock shops...[/]")

    shops_data = [
        {"loc": "Area18", "loc_type": "city", "parent": "ArcCorp", "system": "Stanton",
         "shops": [
             {"name": "Centermass", "type": "weapons"},
             {"name": "Dumper's Depot", "type": "components"},
         ]},
        {"loc": "Orison", "loc_type": "city", "parent": "Crusader", "system": "Stanton",
         "shops": [
             {"name": "Cousin Crow's Custom Crafts", "type": "components"},
         ]},
        {"loc": "New Babbage", "loc_type": "city", "parent": "microTech", "system": "Stanton",
         "shops": [
             {"name": "Omega Pro", "type": "weapons"},
             {"name": "Tammany and Sons", "type": "components"},
         ]},
        {"loc": "Lorville", "loc_type": "city", "parent": "Hurston", "system": "Stanton",
         "shops": [
             {"name": "Tammany and Sons", "type": "components"},
         ]},
        {"loc": "Port Olisar", "loc_type": "station", "parent": "Crusader", "system": "Stanton",
         "shops": [
             {"name": "Dumper's Depot", "type": "components"},
         ]},
        {"loc": "Grim HEX", "loc_type": "station", "parent": "Crusader", "system": "Stanton",
         "shops": [
             {"name": "Dumper's Depot", "type": "components"},
             {"name": "Skutters", "type": "weapons"},
         ]},
    ]

    shop_ids = []
    for loc_data in shops_data:
        loc_id = str(uuid.uuid4())
        conn.execute(text("""
            INSERT INTO locations (id, name, type, "parentName", system)
            VALUES (:id, :name, :type, :parent, :sys)
            ON CONFLICT (name, "parentName") DO UPDATE SET type = EXCLUDED.type
        """), {"id": loc_id, "name": loc_data["loc"], "type": loc_data["loc_type"],
               "parent": loc_data["parent"], "sys": loc_data["system"]})

        row = conn.execute(text(
            'SELECT id FROM locations WHERE name = :n AND "parentName" = :p'
        ), {"n": loc_data["loc"], "p": loc_data["parent"]}).fetchone()
        real_loc_id = row[0] if row else loc_id

        for shop in loc_data["shops"]:
            shop_id = str(uuid.uuid4())
            conn.execute(text("""
                INSERT INTO shops (id, name, "locationId", "shopType")
                VALUES (:id, :name, :lid, :type)
                ON CONFLICT (name, "locationId") DO UPDATE SET "shopType" = EXCLUDED."shopType"
            """), {"id": shop_id, "name": shop["name"], "lid": real_loc_id, "type": shop["type"]})

            row = conn.execute(text(
                'SELECT id FROM shops WHERE name = :n AND "locationId" = :l'
            ), {"n": shop["name"], "l": real_loc_id}).fetchone()
            shop_ids.append(row[0] if row else shop_id)

    # Populate inventory: grab up to 30 random items per shop of matching types
    import random
    shop_type_items = {
        "weapons": ["WEAPON", "MISSILE", "TURRET"],
        "components": ["SHIELD", "POWER_PLANT", "COOLER", "QUANTUM_DRIVE", "MINING_LASER"],
    }

    for shop_id in shop_ids:
        row = conn.execute(text('SELECT "shopType" FROM shops WHERE id = :id'), {"id": shop_id}).fetchone()
        if not row:
            continue
        shop_type = row[0] or "components"
        item_types = shop_type_items.get(shop_type, ["WEAPON", "SHIELD"])

        placeholders = ", ".join(f"'{t}'" for t in item_types)
        items = conn.execute(text(f"""
            SELECT id FROM items WHERE type IN ({placeholders})
            ORDER BY RANDOM() LIMIT 30
        """)).fetchall()

        for (item_id,) in items:
            base_price = random.randint(500, 50000)
            conn.execute(text("""
                INSERT INTO shop_inventory (id, "shopId", "itemId", "priceBuy", "priceSell", "isAvailable")
                VALUES (:id, :sid, :iid, :buy, :sell, true)
                ON CONFLICT ("shopId", "itemId") DO UPDATE SET
                    "priceBuy" = EXCLUDED."priceBuy", "priceSell" = EXCLUDED."priceSell"
            """), {
                "id": str(uuid.uuid4()), "sid": shop_id, "iid": item_id,
                "buy": base_price, "sell": int(base_price * 0.55),
            })

    console.print(f"[green]  ✓ {len(shop_ids)} shops seeded with inventory[/]")


# =============================================================================
# FILE DISCOVERY
# =============================================================================

def find_data_dirs(base: Path) -> dict:
    dirs = {}
    for name in ["ships", "api/ships"]:
        d = base / name
        if d.exists(): dirs["ships"] = d; break
    for name in ["items", "api/items"]:
        d = base / name
        if d.exists(): dirs["items"] = d; break
    for key, path in dirs.items():
        n = len(list(path.glob("*.json")))
        console.print(f"[green]✓ {key}: {path} ({n} files)[/]")
    return dirs


def sync_repo(local: Path, url: str) -> bool:
    if local.exists() and (local / ".git").exists():
        r = subprocess.run(["git", "pull", "--ff-only"], cwd=local, capture_output=True, text=True)
        if r.returncode != 0:
            console.print(f"[yellow]⚠ git pull failed: {r.stderr.strip()}[/]")
            return False
        console.print(f"[green]✓ Repo updated[/]")
    else:
        r = subprocess.run(["git", "clone", "--depth=1", url, str(local)], capture_output=True, text=True)
        if r.returncode != 0:
            console.print(f"[red]✗ Clone failed: {r.stderr.strip()}[/]")
            return False
        console.print("[green]✓ Repo cloned[/]")
    return True


# =============================================================================
# MAIN PIPELINE
# =============================================================================

@click.command()
@click.option("--version", "game_version", required=True, help="Game version (e.g. 4.0.1)")
@click.option("--local-path", type=click.Path(), default=None)
@click.option("--dry-run", is_flag=True)
@click.option("--skip-clone", is_flag=True)
@click.option("--seed-shops", is_flag=True, help="Seed mock shops even if scunpacked has none")
def main(game_version, local_path, dry_run, skip_clone, seed_shops):
    console.print("\n[bold blue]═══════════════════════════════════════════[/]")
    console.print("[bold blue]  AL FILO — Datamining Pipeline v2.0      [/]")
    console.print("[bold blue]═══════════════════════════════════════════[/]\n")

    db_url = os.getenv("DATABASE_URL")
    if not db_url and not dry_run:
        console.print("[red]✗ DATABASE_URL not set[/]"); sys.exit(1)

    repo_url = os.getenv("SCUNPACKED_REPO_URL", "https://github.com/StarCitizen-Datamining/scunpacked")
    data_path = Path(local_path) if local_path else Path(os.getenv("SCUNPACKED_LOCAL_PATH", "./data/scunpacked"))

    if not skip_clone:
        sync_repo(data_path, repo_url)
    if not data_path.exists():
        console.print(f"[red]✗ Data dir not found: {data_path}[/]"); sys.exit(1)

    dirs = find_data_dirs(data_path)

    # ── Parse everything ──
    all_items = []
    ships = []

    if "items" in dirs:
        with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}")) as p:
            t = p.add_task("Parsing items...")
            for f in sorted(dirs["items"].glob("**/*.json")):
                try:
                    raw = load_json(f)
                    entries = raw if isinstance(raw, list) else [raw]
                    for entry in entries:
                        parsed = parse_item(entry, game_version)
                        if parsed:
                            all_items.append(parsed)
                except Exception as e:
                    console.print(f"[yellow]⚠ {f.name}: {e}[/]")
            p.remove_task(t)
        console.print(f"[green]✓ {len(all_items)} items parsed[/]")

    if "ships" in dirs:
        with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}")) as p:
            t = p.add_task("Parsing ships...")
            for f in sorted(dirs["ships"].glob("*.json")):
                try:
                    raw = load_json(f)
                    entries = raw if isinstance(raw, list) else [raw]
                    for entry in entries:
                        parsed = parse_ship(entry, game_version)
                        if parsed:
                            ships.append(parsed)
                except Exception as e:
                    console.print(f"[yellow]⚠ {f.name}: {e}[/]")
            p.remove_task(t)
        console.print(f"[green]✓ {len(ships)} ships parsed[/]")

    if not all_items and not ships:
        console.print("[red]✗ No data to process[/]"); sys.exit(1)

    # ── Summary table ──
    tbl = Table(title="Parse Summary")
    tbl.add_column("Category", style="cyan")
    tbl.add_column("Count", justify="right", style="green")
    tbl.add_row("Components", str(len(all_items)))
    tbl.add_row("Ships/Vehicles", str(len(ships)))
    tbl.add_row("Total Hardpoints", str(sum(len(s["hardpoints"]) for s in ships)))
    tbl.add_row("Default Items to Link", str(sum(len(s["default_items"]) for s in ships)))
    type_counts = {}
    for i in all_items:
        t = i["item"]["type"]
        type_counts[t] = type_counts.get(t, 0) + 1
    for t, c in sorted(type_counts.items()):
        tbl.add_row(f"  └ {t}", str(c))
    console.print(tbl)

    if dry_run:
        console.print("\n[yellow]DRY RUN — no database writes[/]\n")
        return

    # ── Insert into DB ──
    engine = create_engine(db_url)
    with engine.begin() as conn:
        # Phase A: Items + Stats
        console.print("\n[cyan]→ Phase A: Inserting items + stats...[/]")
        for parsed in all_items:
            item_id = upsert_item(conn, parsed["item"])
            if parsed["statsTable"] and parsed["stats"]:
                upsert_stats(conn, parsed["statsTable"], item_id, parsed["stats"])

        # Phase B: Ships + Hardpoints
        console.print("[cyan]→ Phase B: Inserting ships + hardpoints...[/]")
        for s in ships:
            item_id = upsert_item(conn, s["item"])
            upsert_ship(conn, item_id, s["ship"])
            for hp in s["hardpoints"]:
                upsert_hardpoint(conn, item_id, hp)

        console.print(f"[green]  ✓ {len(all_items)} items + {len(ships)} ships inserted[/]")

        # Phase C: Link defaults
        console.print("[cyan]→ Phase C: Linking default loadouts...[/]")
        linked, missed = 0, 0
        for s in ships:
            pid = resolve_item_id(conn, s["item"]["reference"])
            if not pid:
                continue
            for d in s["default_items"]:
                if link_default_item(conn, pid, d["hardpointName"], d["itemReference"]):
                    linked += 1
                else:
                    missed += 1
        console.print(f"[green]  ✓ {linked} hardpoints linked[/]")
        if missed:
            console.print(f"[yellow]  ⚠ {missed} default items not found in DB[/]")

        # Phase D: Shops
        if seed_shops:
            seed_mock_shops(conn)

        # Phase E: Version
        conn.execute(text("""
            INSERT INTO game_versions (id, version, source, "itemCount", "processedAt")
            VALUES (:id, :ver, 'scunpacked', :cnt, :now)
            ON CONFLICT (version) DO UPDATE SET "itemCount" = :cnt, "processedAt" = :now
        """), {"id": str(uuid.uuid4()), "ver": game_version,
               "cnt": len(all_items) + len(ships), "now": datetime.utcnow()})

    console.print(f"\n[bold green]✅ Pipeline v2 complete — version {game_version}[/]\n")


if __name__ == "__main__":
    main()
