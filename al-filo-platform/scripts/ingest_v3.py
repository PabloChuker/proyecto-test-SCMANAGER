#!/usr/bin/env python3
"""
=============================================================================
AL FILO — Datamining Pipeline v3.0 (Index-Aware)

Major improvement over v2: reads the INDEX FILES from scunpacked-data
(ships.json, ship-items.json, items.json, manufacturers.json, labels.json)
to get pre-classified data, real shop prices, and localized names.

Pipeline phases:
  Phase 0: Load index files into memory (lookups)
  Phase A: Insert all items + type-specific stats (from items/*.json)
  Phase B: Insert ships + hardpoints (from ships/*.json)
  Phase C: Link default loadouts (equippedItemId)
  Phase D: Insert real shops & inventory (from ship-items.json index)
  Phase E: Register game version

Source: https://github.com/StarCitizenWiki/scunpacked-data
Tool:   https://github.com/octfx/ScDataDumper

Usage:
  python ingest_v3.py --version 4.0.2
  python ingest_v3.py --version 4.0.2 --local-path ./data/scunpacked-data
  python ingest_v3.py --version 4.0.2 --dry-run
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
    def load_json(path: Path):
        with open(path, "rb") as f:
            return orjson.loads(f.read())
except ImportError:
    def load_json(path: Path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

load_dotenv()
console = Console()

# =============================================================================
# CONSTANTS
# =============================================================================

REPO_URL_DEFAULT = "https://github.com/StarCitizenWiki/scunpacked-data"

# ScDataDumper type → our ItemType enum
TYPE_MAP = {
    "Ship": "SHIP", "Vehicle": "VEHICLE", "Ground": "VEHICLE",
    "WeaponGun": "WEAPON", "WeaponMining": "MINING_LASER",
    "MissileLauncher": "WEAPON", "Missile": "MISSILE", "Torpedo": "TORPEDO",
    "Shield": "SHIELD", "Armor": "ARMOR",
    "PowerPlant": "POWER_PLANT", "Cooler": "COOLER",
    "QuantumDrive": "QUANTUM_DRIVE", "QuantumInterdictionGenerator": "QED",
    "Radar": "RADAR", "Avionics": "AVIONICS",
    "MainThruster": "THRUSTER", "ManneuveringThruster": "THRUSTER",
    "FuelTank": "FUEL_TANK", "FuelIntake": "FUEL_INTAKE",
    "Turret": "TURRET", "TurretBase": "TURRET",
    "CountermeasureLauncher": "COUNTERMEASURE",
    "MiningLaser": "MINING_LASER", "TractorBeam": "TRACTOR_BEAM",
    "SalvageModifier": "SALVAGE_HEAD", "EMP": "EMP",
    "Bomb": "BOMB", "BombLauncher": "WEAPON",
    "Ping": "RADAR", "SelfDestruct": "OTHER",
    "WeaponDefensive": "COUNTERMEASURE",
}

HP_CAT_MAP = {
    "WeaponGun": "WEAPON", "WeaponMining": "MINING",
    "MissileLauncher": "MISSILE_RACK", "Turret": "TURRET", "TurretBase": "TURRET",
    "Shield": "SHIELD", "PowerPlant": "POWER_PLANT", "Cooler": "COOLER",
    "QuantumDrive": "QUANTUM_DRIVE", "MainThruster": "THRUSTER_MAIN",
    "ManneuveringThruster": "THRUSTER_MANEUVERING", "Radar": "RADAR",
    "Avionics": "AVIONICS", "Armor": "ARMOR", "FuelTank": "FUEL_TANK",
    "FuelIntake": "FUEL_INTAKE", "CountermeasureLauncher": "COUNTERMEASURE",
    "TractorBeam": "TRACTOR_BEAM", "SalvageModifier": "SALVAGE",
}

TYPE_STATS_TABLE = {
    "WEAPON": "weapon_stats", "TURRET": "weapon_stats",
    "MISSILE": "missile_stats", "TORPEDO": "missile_stats",
    "SHIELD": "shield_stats", "POWER_PLANT": "power_stats",
    "COOLER": "cooling_stats", "QUANTUM_DRIVE": "quantum_stats",
    "MINING_LASER": "mining_stats", "THRUSTER": "thruster_stats",
}

JUNK_PATTERNS = {
    "door", "placeholder", "moveable", "flightblade",
    "debris", "seat", "bed", "toilet", "flair", "decal",
    "landing_gear", "light_controller", "beacon", "interior_",
    "selfDestruct", "selfdestruct", "ammo_box", "ammobox",
    "oxygencontainer", "oxygenregenerator", "oxygeninlet",
}

def is_junk(name: str) -> bool:
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
    except (ValueError, TypeError): return default

def si(val, default=None) -> Optional[int]:
    if val is None: return default
    try: return int(float(val))
    except (ValueError, TypeError): return default

def deep_get(d, *keys, default=None):
    for k in keys:
        if not isinstance(d, dict): return default
        d = d.get(k, default)
    return d


# =============================================================================
# PHASE 0: Load index files into memory
# =============================================================================

class IndexData:
    """Pre-loaded index data from the root JSON files."""

    def __init__(self, base_path: Path):
        self.manufacturers = {}   # code → full name
        self.labels = {}          # label_key → localized string
        self.ship_items_index = {} # className → {type, name, ...}
        self.items_index = {}     # className → {type, name, ...}
        self.shops_data = []      # raw shops array

        self._load(base_path)

    def _load(self, base: Path):
        # Manufacturers
        mfr_path = base / "manufacturers.json"
        if mfr_path.exists():
            try:
                raw = load_json(mfr_path)
                if isinstance(raw, list):
                    for m in raw:
                        if not isinstance(m, dict):
                            continue
                        code = str(m.get("Code") or m.get("code") or "").strip()
                        name = str(m.get("Name") or m.get("name") or code).strip()
                        if code:
                            self.manufacturers[code] = name
                            self.manufacturers[code.upper()] = name
                            self.manufacturers[code.lower()] = name
                elif isinstance(raw, dict):
                    for raw_code, data in raw.items():
                        code = str(raw_code).strip()
                        if isinstance(data, dict):
                            name = str(data.get("Name") or data.get("name") or code).strip()
                        else:
                            name = str(data).strip() if data else code
                        self.manufacturers[code] = name
                        self.manufacturers[str(code).upper()] = name
                        self.manufacturers[str(code).lower()] = name
            except Exception as e:
                console.print(f"[yellow]⚠ Error loading manufacturers.json: {e}[/]")
            console.print(f"[green]✓ Loaded {len(set(self.manufacturers.values()))} manufacturers[/]")

        # Labels (localized names)
        labels_path = base / "labels.json"
        if labels_path.exists():
            try:
                raw = load_json(labels_path)
                if isinstance(raw, dict):
                    self.labels = {str(k): str(v) for k, v in raw.items() if v is not None}
                elif isinstance(raw, list):
                    for entry in raw:
                        if isinstance(entry, dict):
                            key = str(entry.get("key") or entry.get("Key") or "")
                            val = str(entry.get("value") or entry.get("Value") or entry.get("english") or "")
                            if key and val:
                                self.labels[key] = val
            except Exception as e:
                console.print(f"[yellow]⚠ Error loading labels.json: {e}[/]")
            console.print(f"[green]✓ Loaded {len(self.labels)} labels[/]")

        # Ship items index (pre-classified component types)
        si_path = base / "ship-items.json"
        if si_path.exists():
            try:
                raw = load_json(si_path)
                if isinstance(raw, list):
                    for item in raw:
                        if not isinstance(item, dict):
                            continue
                        cn = str(item.get("ClassName") or item.get("className") or item.get("ref") or "").strip()
                        if cn:
                            self.ship_items_index[cn] = item
                            self.ship_items_index[cn.lower()] = item
                elif isinstance(raw, dict):
                    for raw_key, item in raw.items():
                        key = str(raw_key).strip()
                        if isinstance(item, dict) and key:
                            self.ship_items_index[key] = item
                            self.ship_items_index[key.lower()] = item
            except Exception as e:
                console.print(f"[yellow]⚠ Error loading ship-items.json: {e}[/]")
            console.print(f"[green]✓ Loaded {len(self.ship_items_index) // 2} ship-item index entries[/]")

        # Items index
        items_path = base / "items.json"
        if items_path.exists():
            try:
                raw = load_json(items_path)
                if isinstance(raw, list):
                    for item in raw:
                        if not isinstance(item, dict):
                            continue
                        cn = str(item.get("ClassName") or item.get("className") or item.get("ref") or "").strip()
                        if cn:
                            self.items_index[cn] = item
                            self.items_index[cn.lower()] = item
                elif isinstance(raw, dict):
                    for raw_key, item in raw.items():
                        key = str(raw_key).strip()
                        if isinstance(item, dict) and key:
                            self.items_index[key] = item
                            self.items_index[key.lower()] = item
            except Exception as e:
                console.print(f"[yellow]⚠ Error loading items.json: {e}[/]")
            console.print(f"[green]✓ Loaded {len(self.items_index) // 2} items index entries[/]")

    def resolve_manufacturer(self, raw_mfr) -> Optional[str]:
        """Resolve manufacturer code to full name."""
        if raw_mfr is None:
            return None
        if isinstance(raw_mfr, dict):
            code = str(raw_mfr.get("Code") or raw_mfr.get("code") or "").strip()
            name = raw_mfr.get("Name") or raw_mfr.get("name")
            if name:
                return str(name)
            return self.manufacturers.get(code, code) if code else None
        raw_str = str(raw_mfr).strip()
        return self.manufacturers.get(raw_str, self.manufacturers.get(raw_str.upper(), raw_str))

    def resolve_label(self, label_key) -> Optional[str]:
        """Resolve a label key (e.g. '@item_Name...') to its localized value."""
        if label_key is None:
            return None
        label_str = str(label_key).strip()
        if not label_str or not label_str.startswith("@"):
            return label_str if label_str else None
        clean = label_str.lstrip("@")
        return self.labels.get(clean) or self.labels.get(label_str) or label_str

    def get_item_type(self, class_name: str) -> Optional[str]:
        """Look up item type from the ship-items or items index."""
        entry = self.ship_items_index.get(class_name) or self.items_index.get(class_name)
        if not entry:
            entry = self.ship_items_index.get(class_name.lower()) or self.items_index.get(class_name.lower())
        if entry:
            raw_type = entry.get("Type") or entry.get("type") or entry.get("itemType")
            if raw_type:
                return TYPE_MAP.get(raw_type, None)
        return None

    def get_hardpoint_category(self, class_name: str) -> Optional[str]:
        """Look up hardpoint category from index data."""
        entry = self.ship_items_index.get(class_name) or self.ship_items_index.get(class_name.lower())
        if entry:
            raw_type = entry.get("Type") or entry.get("type")
            if raw_type:
                return HP_CAT_MAP.get(raw_type)
        return None


# =============================================================================
# PHASE A: Parse items + stats
# =============================================================================

def unwrap_item(raw):
    """
    Auto-detect and unwrap multiple scunpacked JSON formats:

    Format 1 (ScDataDumper new): {"ClassName": "x", "Type": "y", ...}
    Format 2 (stdItem wrapper):  {"stdItem": {"ClassName": ...}}
    Format 3 (Legacy Raw.Entity): {"Raw": {"Entity": {"__ref": "...", "Components": {...}}}}
    Format 4 (Single-key wrapper): {"item_name": {...data...}}
    """
    if not isinstance(raw, dict):
        return None

    # Format 1: Already has ClassName at top level
    if raw.get("ClassName") or raw.get("className"):
        return raw

    # Format 3: Legacy Raw.Entity (the user's actual format)
    raw_block = raw.get("Raw") or raw.get("raw")
    if isinstance(raw_block, dict):
        entity = raw_block.get("Entity") or raw_block.get("entity")
        if isinstance(entity, dict):
            # This is the legacy format. Extract what we can from Entity.
            return _unwrap_legacy_entity(entity, raw)

        # Raw might directly contain ClassName
        if raw_block.get("ClassName") or raw_block.get("className"):
            return {**raw, **raw_block}

    # Format 2: stdItem or other wrappers (including Item.stdItem nesting)
    # Check Item.stdItem first (ScDataDumper modern: {"Item": {"stdItem": {...}}})
    item_wrapper = raw.get("Item") or raw.get("item")
    if isinstance(item_wrapper, dict):
        std = item_wrapper.get("stdItem") or item_wrapper.get("StdItem")
        if isinstance(std, dict):
            # Merge stdItem data into top level, preserving Item-level fields
            merged = {**raw, **item_wrapper, **std}
            return merged

    for wrapper_key in ("stdItem", "StdItem", "data", "item", "Data"):
        inner = raw.get(wrapper_key)
        if isinstance(inner, dict) and (inner.get("ClassName") or inner.get("className") or inner.get("Type") or inner.get("Weapon")):
            return {**raw, **inner}

    # Format 4: Single-key dict where key is className
    if len(raw) == 1:
        key = list(raw.keys())[0]
        val = raw[key]
        if isinstance(val, dict):
            if not val.get("ClassName") and not val.get("className"):
                val["ClassName"] = key
            return val

    # Last resort: if it has Type/type, use as-is (caller uses filename for ref)
    if raw.get("Type") or raw.get("type"):
        return raw

    return None


def _unwrap_legacy_entity(entity: dict, original: dict) -> dict:
    """
    Extract item data from the legacy Raw.Entity format.

    Structure:
      Raw.Entity.__ref          → CIG UUID
      Raw.Entity.__path         → XML path (contains className)
      Raw.Entity.Components.SAttachableComponentParams.AttachDef →
        .Type, .SubType, .Size, .Grade, .Manufacturer, .Name, .Localization
    Also may have:
      Raw.Entity.Components.SHealthComponentParams → .Health
      Raw.Entity.Components.SCItemWeaponComponentParams → weapon data
      Raw.Entity.Components.SCItemShieldGeneratorParams → shield data
      Raw.Entity.Components.SCItemPowerPlantComponentParams → power data
      etc.
    """
    result = {}

    # Reference: __ref is CIG's UUID
    result["__ref"] = entity.get("__ref") or entity.get("__Ref") or ""

    # ClassName from __path (e.g. "libs/.../3_seat_bench_constellation.xml" → stem)
    path_str = entity.get("__path") or entity.get("__Path") or ""
    if path_str:
        # Extract filename without extension as className
        from pathlib import PurePosixPath
        result["__path"] = path_str
        stem = PurePosixPath(path_str).stem
        result["ClassName"] = stem

    # Dig into Components
    components = entity.get("Components") or entity.get("components") or {}

    # SAttachableComponentParams.AttachDef is the gold mine
    attach_params = (
        components.get("SAttachableComponentParams")
        or components.get("sAttachableComponentParams")
        or {}
    )
    attach_def = attach_params.get("AttachDef") or attach_params.get("attachDef") or {}

    if isinstance(attach_def, dict):
        result["Type"] = str(attach_def.get("Type") or attach_def.get("type") or "").strip()
        result["SubType"] = str(attach_def.get("SubType") or attach_def.get("subType") or "").strip()
        result["Size"] = attach_def.get("Size") or attach_def.get("size")
        result["Grade"] = str(attach_def.get("Grade") or attach_def.get("grade") or "").strip()
        result["Name"] = attach_def.get("Name") or attach_def.get("name") or ""
        result["Mass"] = attach_def.get("Mass") or attach_def.get("mass")

        # Manufacturer can be nested
        mfr = attach_def.get("Manufacturer") or attach_def.get("manufacturer")
        result["Manufacturer"] = mfr

        # Localization
        loc = attach_def.get("Localization") or attach_def.get("localization") or {}
        if isinstance(loc, dict):
            result["LocalizedName"] = loc.get("Name") or loc.get("name")
            result["Description"] = loc.get("Description") or loc.get("description")

    # SEntityPhysicsControllerParams for mass
    phys = components.get("SEntityPhysicsControllerParams") or {}
    if isinstance(phys, dict) and not result.get("Mass"):
        result["Mass"] = phys.get("PhysType", {}).get("Mass") if isinstance(phys.get("PhysType"), dict) else None

    # Health
    health_comp = components.get("SHealthComponentParams") or {}
    if isinstance(health_comp, dict):
        result["HitPoints"] = health_comp.get("Health") or health_comp.get("health")

    # Weapon data (SCItemWeaponComponentParams)
    weapon_comp = (
        components.get("SCItemWeaponComponentParams")
        or components.get("scItemWeaponComponentParams")
        or {}
    )
    if isinstance(weapon_comp, dict) and weapon_comp:
        weapon_data = {}

        # fireActions can be a dict, list, or contain nested SWeaponActionFireSingleParams
        fire_actions = (
            weapon_comp.get("fireActions") or weapon_comp.get("FireActions")
            or weapon_comp.get("fire") or weapon_comp.get("Fire")
        )
        if isinstance(fire_actions, dict):
            # Could be a single action or a wrapper with a named key
            if "fireRate" in fire_actions or "FireRate" in fire_actions:
                fire_actions = [fire_actions]
            else:
                # Try sub-keys like SWeaponActionFireSingleParams
                for sub_key in ("SWeaponActionFireSingleParams", "SWeaponActionFireRapidParams",
                                "SWeaponActionFireChargedParams", "SWeaponActionFireBeamParams"):
                    sub = fire_actions.get(sub_key)
                    if isinstance(sub, dict):
                        fire_actions = [sub]
                        break
                    elif isinstance(sub, list):
                        fire_actions = sub
                        break
                else:
                    fire_actions = [fire_actions]
        elif not isinstance(fire_actions, list):
            fire_actions = [{}]

        first_action = fire_actions[0] if fire_actions else {}
        if isinstance(first_action, dict):
            weapon_data["FireRate"] = (
                first_action.get("fireRate") or first_action.get("FireRate")
                or first_action.get("rateOfFire") or first_action.get("RateOfFire")
            )
            weapon_data["Speed"] = first_action.get("speed") or first_action.get("Speed")
            weapon_data["Range"] = first_action.get("range") or first_action.get("Range")

            # Damage: try multiple locations inside the fire action
            # 1. SProjectileDamage (direct)
            # 2. damage (nested)
            # 3. launchParams.SProjectile.damage
            # 4. ammunition reference with damage
            damage_info = None
            for dmg_key in ("SProjectileDamage", "damage", "Damage",
                            "SProjectile", "projectileDamage"):
                val = first_action.get(dmg_key)
                if isinstance(val, dict) and val:
                    damage_info = val
                    break

            # Try nested: launchParams -> SProjectile -> ... -> damage
            if not damage_info:
                launch = first_action.get("launchParams") or first_action.get("LaunchParams") or {}
                if isinstance(launch, dict):
                    proj = launch.get("SProjectile") or launch.get("projectile") or {}
                    if isinstance(proj, dict):
                        damage_info = proj.get("damage") or proj.get("Damage") or proj.get("bulletImpactDamage") or {}

            if isinstance(damage_info, dict) and damage_info:
                phys = damage_info.get("DamagePhysical") or damage_info.get("physical") or damage_info.get("Physical")
                energy = damage_info.get("DamageEnergy") or damage_info.get("energy") or damage_info.get("Energy")
                dist = damage_info.get("DamageDistortion") or damage_info.get("distortion") or damage_info.get("Distortion")
                therm = damage_info.get("DamageThermal") or damage_info.get("thermal") or damage_info.get("Thermal")
                weapon_data["Damage"] = {
                    "Physical": phys, "Energy": energy,
                    "Distortion": dist, "Thermal": therm,
                }
                # Compute Total if individual types exist
                total_parts = [sf(v, 0) for v in [phys, energy, dist, therm] if v is not None]
                if total_parts:
                    weapon_data["Damage"]["Total"] = sum(total_parts)

        result["Weapon"] = weapon_data

    # Shield data
    shield_comp = components.get("SCItemShieldGeneratorParams") or {}
    if isinstance(shield_comp, dict) and shield_comp:
        result["Shield"] = {
            "MaxShieldHealth": shield_comp.get("MaxShieldHealth") or shield_comp.get("maxShieldHealth"),
            "MaxShieldRegen": shield_comp.get("MaxShieldRegen") or shield_comp.get("maxShieldRegen"),
            "DownedRegenDelay": shield_comp.get("DownedRegenDelay") or shield_comp.get("downedRegenDelay"),
            "Absorption": shield_comp.get("Absorption") or shield_comp.get("absorption") or {},
        }

    # PowerPlant data
    power_comp = components.get("SCItemPowerPlantComponentParams") or {}
    if isinstance(power_comp, dict) and power_comp:
        result["PowerPlant"] = {
            "MaxPowerOutput": power_comp.get("MaxPowerOutput") or power_comp.get("maxPowerOutput"),
        }

    # Cooler data
    cooler_comp = components.get("SCItemCoolerParams") or {}
    if isinstance(cooler_comp, dict) and cooler_comp:
        result["Cooler"] = {
            "CoolingRate": cooler_comp.get("CoolingRate") or cooler_comp.get("coolingRate"),
            "SuppressionHeatFactor": cooler_comp.get("SuppressionHeatFactor"),
            "SuppressionIRFactor": cooler_comp.get("SuppressionIRFactor"),
        }

    # QuantumDrive data
    qd_comp = components.get("SCItemQuantumDriveParams") or {}
    if isinstance(qd_comp, dict) and qd_comp:
        result["QuantumDrive"] = {
            "MaxSpeed": qd_comp.get("driveSpeed") or qd_comp.get("DriveSpeed") or qd_comp.get("maxSpeed"),
            "SpoolUpTime": qd_comp.get("spoolUpTime") or qd_comp.get("SpoolUpTime"),
            "Cooldown": qd_comp.get("cooldownTime") or qd_comp.get("CooldownTime"),
            "FuelRate": qd_comp.get("quantumFuelRequirement") or qd_comp.get("fuelRate"),
        }

    # Power consumption (EntityComponentPowerConnection)
    power_conn = components.get("EntityComponentPowerConnection") or {}
    if isinstance(power_conn, dict):
        result["Power"] = {
            "PowerDraw": power_conn.get("PowerDraw") or power_conn.get("powerDraw")
                         or power_conn.get("PowerBase") or power_conn.get("powerBase"),
        }

    # Heat (EntityComponentHeatConnection)
    heat_conn = components.get("EntityComponentHeatConnection") or {}
    if isinstance(heat_conn, dict):
        result["Heat"] = {
            "ThermalOutput": heat_conn.get("ThermalEnergyDraw") or heat_conn.get("thermalEnergyDraw")
                            or heat_conn.get("Mass"),
        }

    # EM/IR from SAttachableComponentParams or dedicated params
    em_params = components.get("SItemPortContainerComponentParams") or {}

    return result


def parse_item(raw_original: dict, game_version: str, idx: IndexData, filename: str = "") -> Optional[dict]:
    """Parse an item from any scunpacked format variant (new or legacy)."""
    raw = unwrap_item(raw_original)
    if raw is None:
        return None

    # Extract reference (className)
    reference = ""
    for key in ("ClassName", "className", "class_name", "ref", "Reference", "__ref"):
        val = raw.get(key)
        if val and isinstance(val, str) and val.strip():
            reference = val.strip()
            break

    # Derive from filename as fallback
    if not reference and filename:
        reference = Path(filename).stem

    # If we got __ref (UUID) but also have a ClassName, prefer ClassName for reference
    # because our DB uses className as the linkable identifier
    class_name = raw.get("ClassName") or raw.get("className") or ""
    if class_name and isinstance(class_name, str) and class_name.strip():
        reference = class_name.strip()
    elif not reference:
        return None

    if not reference:
        return None

    # Extract type
    raw_type = ""
    for key in ("Type", "type", "ItemType", "itemType", "item_type", "Category"):
        val = raw.get(key)
        if val and isinstance(val, str) and val.strip():
            raw_type = val.strip()
            break

    item_type = TYPE_MAP.get(raw_type, None)

    # Try index lookup
    if not item_type:
        item_type = idx.get_item_type(reference)

    # Try by __path (legacy format: path contains type hint)
    if not item_type and raw.get("__path"):
        path_lower = str(raw["__path"]).lower()
        if "/weapon" in path_lower: item_type = "WEAPON"
        elif "/shield" in path_lower: item_type = "SHIELD"
        elif "/powerplant" in path_lower or "/power_plant" in path_lower: item_type = "POWER_PLANT"
        elif "/cooler" in path_lower: item_type = "COOLER"
        elif "/quantumdrive" in path_lower or "/quantum_drive" in path_lower: item_type = "QUANTUM_DRIVE"
        elif "/turret" in path_lower: item_type = "TURRET"
        elif "/missile" in path_lower: item_type = "MISSILE"
        elif "/thruster" in path_lower: item_type = "THRUSTER"
        elif "/mining" in path_lower: item_type = "MINING_LASER"

    # Infer from presence of sub-objects
    if not item_type:
        if raw.get("Weapon") or raw.get("weapon"): item_type = "WEAPON"
        elif raw.get("Shield") or raw.get("shield"): item_type = "SHIELD"
        elif raw.get("PowerPlant") or raw.get("powerPlant"): item_type = "POWER_PLANT"
        elif raw.get("Cooler") or raw.get("cooler"): item_type = "COOLER"
        elif raw.get("QuantumDrive") or raw.get("quantumDrive"): item_type = "QUANTUM_DRIVE"
        elif raw.get("Mining") or raw.get("mining"): item_type = "MINING_LASER"
        elif raw.get("Missile") or raw.get("missile"): item_type = "MISSILE"
        elif raw.get("Thruster") or raw.get("thruster"): item_type = "THRUSTER"
        else: item_type = "OTHER"

    # Extract name
    name = ""
    for key in ("Name", "name", "DisplayName", "displayName", "LocalizedName"):
        val = raw.get(key)
        if val and isinstance(val, str) and val.strip():
            name = val.strip()
            break
    if not name:
        name = reference

    if is_junk(name) or is_junk(reference):
        return None

    # Resolve localized name
    localized = raw.get("LocalizedName") or raw.get("displayName") or raw.get("localizedName")
    if isinstance(localized, str) and localized.startswith("@"):
        localized = idx.resolve_label(localized)

    # Resolve manufacturer
    manufacturer = idx.resolve_manufacturer(
        raw.get("Manufacturer") or raw.get("manufacturer") or raw.get("Mfr")
    )

    item = {
        "reference": reference,
        "name": name,
        "localizedName": str(localized) if localized and str(localized) != name else None,
        "className": reference,
        "type": item_type,
        "subType": str(raw.get("SubType") or raw.get("subType") or raw.get("sub_type") or "") or None,
        "size": si(raw.get("Size") or raw.get("size") or raw.get("ItemSize")),
        "grade": str(raw.get("Grade") or raw.get("grade") or "") or None,
        "manufacturer": manufacturer,
        "mass": sf(raw.get("Mass") or raw.get("mass")),
        "hitPoints": sf(raw.get("HitPoints") or raw.get("Health") or raw.get("hitPoints")),
        "gameVersion": game_version,
    }

    stats = extract_stats(raw, item_type, raw_original)

    # Extract child hardpoints for turrets/missile racks (they have their own ports)
    child_hardpoints = []
    child_defaults = []
    if item_type in ("TURRET", "MISSILE_RACK", "MINING_LASER"):
        # Search ALL possible locations for child ports
        child_ports = (
            deep_get(raw_original, "Item", "stdItem", "Ports")
            or deep_get(raw_original, "Item", "stdItem", "ItemPorts")
            or deep_get(raw_original, "stdItem", "Ports")
            or deep_get(raw_original, "stdItem", "ItemPorts")
            or raw.get("Ports") or raw.get("ports")
            or raw.get("ItemPorts") or raw.get("itemPorts")
            or raw.get("Parts") or raw.get("parts")
            or []
        )
        # Legacy SItemPortContainerComponentParams
        if not child_ports or (isinstance(child_ports, list) and len(child_ports) == 0):
            for src in [raw, raw_original]:
                legacy = (
                    deep_get(src, "Components", "SItemPortContainerComponentParams", "Ports")
                    or deep_get(src, "SItemPortContainerComponentParams", "Ports")
                    or deep_get(src, "Raw", "Entity", "Components", "SItemPortContainerComponentParams", "Ports")
                )
                if isinstance(legacy, list) and len(legacy) > 0:
                    child_ports = legacy
                    break

        # Also build a loadout map from the item's own default loadout
        item_loadout_map = {}
        item_loadout_src = (
            deep_get(raw_original, "Item", "stdItem", "Loadout")
            or deep_get(raw_original, "stdItem", "Loadout")
            or raw.get("Loadout") or raw.get("loadout")
            or []
        )
        if isinstance(item_loadout_src, list):
            for entry in item_loadout_src:
                if not isinstance(entry, dict):
                    continue
                pn = str(entry.get("PortName") or entry.get("portName") or entry.get("Name") or "").strip()
                cn = str(entry.get("ClassName") or entry.get("className") or entry.get("ItemClassName") or "").strip()
                if pn and cn:
                    item_loadout_map[pn] = cn

        if isinstance(child_ports, list):
            for port in child_ports:
                if not isinstance(port, dict):
                    continue
                pname = str(port.get("Name") or port.get("name") or port.get("PortName") or "").strip()
                if not pname or is_junk(pname):
                    continue
                psize = si(port.get("MaxSize") or port.get("maxSize") or port.get("Size"), 0)
                ptype = str(port.get("Type") or port.get("type") or "").strip()
                pcat = HP_CAT_MAP.get(ptype, None)

                # For turret child ports, default to WEAPON (they hold guns)
                if not pcat:
                    pcat = _infer_category_from_port(port, pname, item_loadout_map.get(pname, ""), idx)
                if not pcat or pcat == "OTHER":
                    pcat = "WEAPON"

                child_hardpoints.append({
                    "hardpointName": pname, "category": pcat,
                    "minSize": si(port.get("MinSize"), 0), "maxSize": psize,
                    "isFixed": str(port.get("Fixed") or "").lower() in ("true", "1"),
                    "isManned": False, "isInternal": False,
                })

                # Default item from port or loadout map
                equipped = (
                    str(port.get("DefaultItem") or port.get("defaultItem") or "").strip()
                    or item_loadout_map.get(pname, "")
                )
                if equipped and equipped != pname:
                    child_defaults.append({"hardpointName": pname, "itemReference": equipped})

    return {"item": item, "stats": stats, "statsTable": TYPE_STATS_TABLE.get(item_type),
            "hardpoints": child_hardpoints, "default_items": child_defaults}


def extract_stats(raw: dict, item_type: str, raw_original: dict = None) -> dict:
    if raw_original is None:
        raw_original = raw

    # -- Extract stdItem sub-objects from ORIGINAL unmerged JSON --
    std = (
        deep_get(raw_original, "Item", "stdItem")
        or deep_get(raw_original, "stdItem")
        or {}
    ) or {}
    if not isinstance(std, dict):
        std = {}

    # ResourceNetwork: CIG 4.0 power system
    res_net = std.get("ResourceNetwork") or raw.get("ResourceNetwork") or {}
    res_gen = res_net.get("Generation") or res_net.get("generation") or {} if isinstance(res_net, dict) else {}
    res_con = res_net.get("Consumption") or res_net.get("consumption") or {} if isinstance(res_net, dict) else {}

    # Temperature: CIG 4.0 thermal system
    temperature = std.get("Temperature") or raw.get("Temperature") or {}
    temp_calc = temperature.get("Calculated") or temperature.get("calculated") or {} if isinstance(temperature, dict) else {}

    # Durability
    durability = std.get("Durability") or raw.get("Durability") or {}

    # stdItem.Shield (for shields in new format)
    std_shield = std.get("Shield") or {}

    # Legacy power/heat/emissions
    power_legacy = raw.get("Power", raw.get("power", {})) or {}
    heat_legacy = raw.get("Heat", raw.get("heat", {})) or {}
    emissions = raw.get("Emissions", raw.get("emissions", {})) or {}
    emission_single = raw.get("Emission") if isinstance(raw.get("Emission"), dict) else {}

    # -- Build base stats from ALL sources --
    power_draw = (
        sf(_first(res_con, "Power", "power", "Energy", "energy"))
        or sf(_first(power_legacy, "PowerDraw", "draw", "RequestedPower"))
    )
    thermal_output = (
        sf(_first(temp_calc, "Overheat", "overheat", "ThermalOutput"))
        or sf(temperature.get("ThermalOutput") if isinstance(temperature, dict) else None)
        or sf(_first(heat_legacy, "ThermalOutput", "output", "ThermalEnergyDraw"))
    )
    em_sig = (
        sf(_first(emissions, "EM", "em"))
        or sf(emission_single.get("EM") if emission_single else None)
        or sf(raw.get("EmSignature"))
    )
    ir_sig = (
        sf(_first(emissions, "IR", "ir"))
        or sf(emission_single.get("IR") if emission_single else None)
        or sf(raw.get("IrSignature"))
    )
    power_output_net = sf(_first(res_gen, "Power", "power", "Energy", "energy"))

    base = {
        "powerDraw": power_draw,
        "thermalOutput": thermal_output,
        "emSignature": em_sig,
        "irSignature": ir_sig,
    }

    if item_type in ("WEAPON", "TURRET"):
        w = raw.get("Weapon", raw.get("weapon", {})) or {}
        if not w:
            w = std.get("Weapon") or {}

        fire_rate = sf(_first(w, "FireRate", "rateOfFire", "fireRate", "RateOfFire"))

        alpha = None
        dps = None
        dmg_phys = None
        dmg_energy = None
        dmg_distortion = None
        dmg_thermal = None

        # -- SOURCE 0: Weapon.Modes[0] from ORIGINAL --
        w_modes = (
            deep_get(raw_original, "Item", "stdItem", "Weapon", "Modes")
            or deep_get(raw_original, "Item", "Weapon", "Modes")
            or deep_get(raw_original, "stdItem", "Weapon", "Modes")
            or deep_get(raw, "Weapon", "Modes")
            or w.get("Modes") or w.get("modes")
            or []
        )
        if isinstance(w_modes, list) and len(w_modes) > 0:
            mode = w_modes[0] if isinstance(w_modes[0], dict) else {}
            mode_dps = sf(mode.get("DamagePerSecond") or mode.get("damagePerSecond"))
            mode_alpha = sf(mode.get("DamagePerShot") or mode.get("damagePerShot"))
            mode_fr = sf(mode.get("FireRate") or mode.get("fireRate") or mode.get("RateOfFire"))
            if mode_dps and mode_dps > 0:
                dps = mode_dps
            if mode_alpha and mode_alpha > 0:
                alpha = mode_alpha
            if mode_fr and mode_fr > 0:
                fire_rate = fire_rate or mode_fr
            if not fire_rate and dps and alpha and alpha > 0:
                fire_rate = round((dps / alpha) * 60.0, 2)

        # -- SOURCE 1: Weapon.Damage --
        if alpha is None:
            dmg = w.get("Damage", w.get("damage")) or {}
            if isinstance(dmg, dict):
                alpha = sf(dmg.get("Total") or dmg.get("total"))
                dmg_phys = sf(dmg.get("Physical") or dmg.get("physical"))
                dmg_energy = sf(dmg.get("Energy") or dmg.get("energy"))
                dmg_distortion = sf(dmg.get("Distortion") or dmg.get("distortion"))
                dmg_thermal = sf(dmg.get("Thermal") or dmg.get("thermal"))
                if alpha is None and any(v for v in [dmg_phys, dmg_energy, dmg_distortion, dmg_thermal] if v):
                    alpha = sum(v or 0 for v in [dmg_phys, dmg_energy, dmg_distortion, dmg_thermal])
            elif isinstance(dmg, (int, float)):
                alpha = sf(dmg)

        # -- SOURCE 2: Ammunition array --
        if alpha is None:
            ammo_sources = [
                w.get("Ammunition") or w.get("ammunition"),
                raw.get("Ammunition") or raw.get("ammunition"),
            ]
            for ammo_src in ammo_sources:
                if ammo_src is None:
                    continue
                ammo_list = ammo_src if isinstance(ammo_src, list) else [ammo_src]
                for ammo in ammo_list:
                    if not isinstance(ammo, dict):
                        continue
                    impact = ammo.get("ImpactDamage") or ammo.get("impactDamage") or ammo.get("Damage") or {}
                    if isinstance(impact, dict):
                        p = sf(impact.get("Physical") or impact.get("physical"))
                        e = sf(impact.get("Energy") or impact.get("energy"))
                        d = sf(impact.get("Distortion") or impact.get("distortion"))
                        t = sf(impact.get("Thermal") or impact.get("thermal"))
                        total = sum(v or 0 for v in [p, e, d, t])
                        if total > 0:
                            alpha = total
                            dmg_phys = dmg_phys or p
                            dmg_energy = dmg_energy or e
                            dmg_distortion = dmg_distortion or d
                            dmg_thermal = dmg_thermal or t
                            break
                if alpha is not None:
                    break

        # -- SOURCE 3: Legacy SAmmoContainerComponentParams --
        if alpha is None:
            ammo_container = deep_get(raw, "SAmmoContainerComponentParams") or deep_get(raw, "Components", "SAmmoContainerComponentParams") or {}
            if isinstance(ammo_container, dict):
                bullet = deep_get(ammo_container, "ammoParams", "projectileParams", "BulletProjectileParams") or {}
                dmg_info = deep_get(bullet, "damage", "DamageInfo") or deep_get(bullet, "damage") or {}
                if isinstance(dmg_info, dict):
                    p = sf(dmg_info.get("DamagePhysical") or dmg_info.get("Physical"))
                    e = sf(dmg_info.get("DamageEnergy") or dmg_info.get("Energy"))
                    d = sf(dmg_info.get("DamageDistortion") or dmg_info.get("Distortion"))
                    t = sf(dmg_info.get("DamageThermal") or dmg_info.get("Thermal"))
                    total = sum(v or 0 for v in [p, e, d, t])
                    if total > 0:
                        alpha = total
                        dmg_phys = p; dmg_energy = e; dmg_distortion = d; dmg_thermal = t

        # -- SOURCE 4: Flat fields --
        if alpha is None:
            alpha = sf(w.get("DamagePerShot") or raw.get("DamagePerShot"))

        # Speed and range
        w_speed = sf(_first(w, "Speed", "speed", "MuzzleVelocity"))
        w_range = sf(_first(w, "Range", "range", "MaxRange"))
        if not w_speed or not w_range:
            ammo = w.get("Ammunition") or raw.get("Ammunition") or []
            af = ammo[0] if isinstance(ammo, list) and ammo else (ammo if isinstance(ammo, dict) else {})
            if isinstance(af, dict):
                w_speed = w_speed or sf(af.get("Speed") or af.get("speed"))
                w_range = w_range or sf(af.get("Range") or af.get("range"))
        if w_modes and isinstance(w_modes, list) and len(w_modes) > 0 and isinstance(w_modes[0], dict):
            m0 = w_modes[0]
            w_speed = w_speed or sf(m0.get("Speed") or m0.get("speed"))
            w_range = w_range or sf(m0.get("Range") or m0.get("range"))

        if dps is None and alpha and fire_rate and fire_rate > 0:
            dps = round(alpha * (fire_rate / 60.0), 2)

        return {"dps": dps, "alphaDamage": alpha, "fireRate": fire_rate,
                "range": w_range, "speed": w_speed,
                "ammoCount": si(_first(w, "AmmoCount", "ammo", "MaxAmmoCount")),
                "damageType": w.get("DamageType") or w.get("damageType"),
                "dmgPhysical": dmg_phys, "dmgEnergy": dmg_energy,
                "dmgDistortion": dmg_distortion, "dmgThermal": dmg_thermal,
                "powerDraw": base["powerDraw"], "thermalOutput": base["thermalOutput"],
                "emSignature": base["emSignature"], "irSignature": base["irSignature"]}

    elif item_type == "SHIELD":
        # Try stdItem.Shield first (CIG 4.0), then legacy raw.Shield
        s = std_shield if isinstance(std_shield, dict) and std_shield else (raw.get("Shield", raw.get("shield", {})) or {})
        absorb = s.get("Absorption", s.get("absorption", {})) or {}
        dur_hp = sf(durability.get("Health")) if isinstance(durability, dict) else None
        return {"maxHp": sf(_first(s, "MaxShieldHealth", "hp", "Health", "maxHealth")) or dur_hp,
                "regenRate": sf(_first(s, "MaxShieldRegen", "regen", "RegenRate", "regenRate", "RegenerationTime")),
                "downedDelay": sf(_first(s, "DownedRegenDelay", "downDelay", "DownDelay", "RegenerationTime")),
                "dmgAbsPhysical": sf(deep_get(absorb, "Physical")),
                "dmgAbsEnergy": sf(deep_get(absorb, "Energy")),
                "dmgAbsDistortion": sf(deep_get(absorb, "Distortion")),
                "powerDraw": base["powerDraw"], "thermalOutput": base["thermalOutput"],
                "emSignature": base["emSignature"], "irSignature": base["irSignature"]}

    elif item_type == "POWER_PLANT":
        pp = raw.get("PowerPlant", raw.get("powerPlant", {})) or {}
        pp_output = (
            sf(_first(pp, "MaxPowerOutput", "output", "Output", "PowerOutput"))
            or power_output_net
        )
        return {"powerOutput": pp_output,
                "powerBase": sf(pp.get("PowerBase") or deep_get(power_legacy, "PowerBase")),
                "thermalOutput": base["thermalOutput"],
                "emSignature": base["emSignature"], "irSignature": base["irSignature"]}

    elif item_type == "COOLER":
        c = raw.get("Cooler", raw.get("cooler", {})) or {}
        cooling_rate = (
            sf(deep_get(raw_original, "Item", "stdItem", "ResourceNetwork", "Generation", "Coolant"))
            or sf(deep_get(std, "ResourceNetwork", "Generation", "Coolant"))
            or sf(_first(res_gen, "Coolant", "coolant"))
            or sf(_first(c, "CoolingRate", "rate", "Rate", "MaxCoolingRate"))
        )
        return {"coolingRate": cooling_rate,
                "suppressionHeat": sf(c.get("SuppressionHeatFactor")),
                "suppressionIR": sf(c.get("SuppressionIRFactor")),
                "powerDraw": base["powerDraw"], "thermalOutput": base["thermalOutput"],
                "emSignature": base["emSignature"], "irSignature": base["irSignature"]}

    elif item_type == "QUANTUM_DRIVE":
        q = raw.get("QuantumDrive", raw.get("quantumDrive", {})) or {}
        return {"maxSpeed": sf(_first(q, "MaxSpeed", "speed", "DriveSpeed", "driveSpeed", "JumpSpeed")),
                "maxRange": sf(_first(q, "MaxRange", "range", "Range")),
                "fuelRate": sf(_first(q, "FuelRate", "fuelRate", "FuelRequirement")),
                "spoolUpTime": sf(_first(q, "SpoolUpTime", "spoolUp", "SpoolTime")),
                "cooldownTime": sf(_first(q, "Cooldown", "cooldown", "CooldownTime")),
                "stage1Accel": sf(q.get("Stage1AccelerationRate")),
                "stage2Accel": sf(q.get("Stage2AccelerationRate")),
                "quantumType": q.get("DriveType") or q.get("type"),
                "powerDraw": base["powerDraw"], "thermalOutput": base["thermalOutput"],
                "emSignature": base["emSignature"], "irSignature": base["irSignature"]}

    elif item_type == "MINING_LASER":
        m = raw.get("Mining", raw.get("mining", {})) or {}
        return {"miningPower": sf(m.get("MiningPower")), "resistance": sf(m.get("Resistance")),
                "instability": sf(m.get("Instability")), "optimalRange": sf(m.get("OptimalRange")),
                "maxRange": sf(m.get("MaxRange")), "throttleRate": sf(m.get("ThrottleRate")),
                "powerDraw": base["powerDraw"], "thermalOutput": base["thermalOutput"]}

    elif item_type in ("MISSILE", "TORPEDO"):
        m = raw.get("Missile", raw.get("missile", {})) or {}
        d = m.get("Damage") or m.get("damage")
        dmg_val = None
        if isinstance(d, dict):
            dmg_val = sf(d.get("Total") or d.get("total"))
            if dmg_val is None:
                dmg_val = sum(sf(v, 0) for v in d.values() if isinstance(v, (int, float))) or None
        elif isinstance(d, (int, float)):
            dmg_val = sf(d)
        return {"damage": dmg_val,
                "lockTime": sf(m.get("LockTime")), "lockRange": sf(m.get("LockRange")),
                "trackingAngle": sf(m.get("TrackingAngle")),
                "speed": sf(m.get("Speed") or m.get("speed")),
                "fuelTime": sf(m.get("FuelTime")),
                "lockingType": m.get("LockingType") or m.get("trackingSignalType")}

    elif item_type == "THRUSTER":
        t = raw.get("Thruster", raw.get("thruster", {})) or {}
        return {"thrustCapacity": sf(t.get("ThrustCapacity")),
                "maxThrust": sf(_first(t, "MaxThrust", "thrust", "ThrustCapacity")),
                "fuelBurnRate": sf(t.get("FuelBurnRate")),
                "thrustType": t.get("ThrustType") or t.get("type"),
                "powerDraw": base["powerDraw"], "thermalOutput": base["thermalOutput"],
                "emSignature": base["emSignature"]}

    return {}

def _first(d: dict, *keys):
    """Return first non-None value from dict for any of the given keys."""
    if not isinstance(d, dict):
        return None
    for k in keys:
        v = d.get(k)
        if v is not None:
            return v
    return None


# =============================================================================
# PHASE B: Parse ships
# =============================================================================

def _unwrap_ship(raw: dict) -> dict:
    """Unwrap ship JSON: handle both new format and legacy Raw.Entity."""
    if not isinstance(raw, dict):
        return {}

    # New format: ClassName at top level
    if raw.get("ClassName") or raw.get("className"):
        return raw

    # Legacy: Raw.Entity
    raw_block = raw.get("Raw") or raw.get("raw")
    if isinstance(raw_block, dict):
        entity = raw_block.get("Entity") or raw_block.get("entity")
        if isinstance(entity, dict):
            return _extract_legacy_ship(entity, raw)

    return raw


def _extract_legacy_ship(entity: dict, original: dict) -> dict:
    """Extract ship data from legacy Raw.Entity format."""
    result = {}

    # Reference
    result["__ref"] = entity.get("__ref") or ""
    path_str = entity.get("__path") or ""
    if path_str:
        from pathlib import PurePosixPath
        result["ClassName"] = PurePosixPath(path_str).stem
        result["__path"] = path_str

    components = entity.get("Components") or entity.get("components") or {}

    # AttachDef for basic metadata
    attach_params = components.get("SAttachableComponentParams") or {}
    attach_def = attach_params.get("AttachDef") or {}
    if isinstance(attach_def, dict):
        result["Type"] = str(attach_def.get("Type") or "").strip()
        result["Name"] = attach_def.get("Name") or attach_def.get("name") or ""
        result["Manufacturer"] = attach_def.get("Manufacturer")
        result["Size"] = attach_def.get("Size") or attach_def.get("size")

        loc = attach_def.get("Localization") or {}
        if isinstance(loc, dict):
            result["LocalizedName"] = loc.get("Name") or loc.get("name")

    # Vehicle params (crew, cargo, flight)
    vehicle_comp = components.get("VehicleComponentParams") or {}
    if isinstance(vehicle_comp, dict):
        result["Crew"] = vehicle_comp.get("crewSize") or vehicle_comp.get("CrewSize")
        result["Career"] = vehicle_comp.get("career") or vehicle_comp.get("Career")
        result["Role"] = vehicle_comp.get("role") or vehicle_comp.get("Role")

    # Movement params for flight characteristics
    move_comp = components.get("SCItemVehicleMovementComponentParams") or {}
    ifcs_comp = components.get("IFCSParams") or components.get("ifcsParams") or {}
    if isinstance(ifcs_comp, dict):
        result["Ifcs"] = ifcs_comp

    # Physics for mass
    phys = components.get("SEntityPhysicsControllerParams") or {}
    if isinstance(phys, dict):
        phys_type = phys.get("PhysType") or {}
        if isinstance(phys_type, dict):
            result["Mass"] = phys_type.get("Mass")

    # ── HARDPOINTS from SItemPortContainerComponentParams.Ports ──
    port_container = components.get("SItemPortContainerComponentParams") or {}
    ports = []
    if isinstance(port_container, dict):
        ports = port_container.get("Ports") or port_container.get("ports") or []
        if not isinstance(ports, list):
            ports = []

    # ── DEFAULT LOADOUT from SEntityComponentDefaultLoadoutParams ──
    # -- DEFAULT LOADOUT from SEntityComponentDefaultLoadoutParams --
    loadout_comp = components.get("SEntityComponentDefaultLoadoutParams") or {}
    loadout_entries = {}  # port_name -> item_className

    if isinstance(loadout_comp, dict):
        loadout_data = loadout_comp.get("loadout") or loadout_comp.get("Loadout") or loadout_comp
        if isinstance(loadout_data, dict):
            _extract_loadout_entries(loadout_data, loadout_entries)

    # Also check for loadout at entity level
    if not loadout_entries:
        entity_loadout = entity.get("DefaultLoadout") or entity.get("defaultLoadout") or {}
        if isinstance(entity_loadout, dict):
            _extract_loadout_entries(entity_loadout, loadout_entries)

    result["_legacy_ports"] = ports
    result["_legacy_loadout"] = loadout_entries

    return result


def _extract_loadout_entries(loadout_data: dict, out: dict):
    """
    Recursively extract portName -> itemClassName mappings from CIG loadout format.
    """
    entries = None
    for key in ("entries", "Entries", "SItemPortLoadoutEntryParams",
                "Items", "items", "ports", "Ports"):
        val = loadout_data.get(key)
        if isinstance(val, list) and len(val) > 0:
            entries = val
            break

    # SItemPortLoadoutManualParams wrapper
    if entries is None:
        manual = loadout_data.get("SItemPortLoadoutManualParams") or {}
        if isinstance(manual, dict):
            sub = manual.get("entries") or manual.get("Entries") or []
            if isinstance(sub, list) and len(sub) > 0:
                entries = sub

    # Numeric-key dict (JSON array as object)
    if entries is None:
        numeric_keys = [k for k in loadout_data.keys() if k.isdigit()]
        if numeric_keys:
            entries = [loadout_data[k] for k in sorted(numeric_keys, key=int)
                       if isinstance(loadout_data[k], dict)]

    if not entries or not isinstance(entries, list):
        return

    for entry in entries:
        if not isinstance(entry, dict):
            continue

        port_name = ""
        for key in ("portName", "PortName", "itemPortName", "ItemPortName",
                     "port", "Port", "name", "Name"):
            val = entry.get(key)
            if val and isinstance(val, str) and val.strip():
                port_name = val.strip()
                break

        item_ref = _extract_entity_class(entry)

        if port_name and item_ref:
            out[port_name] = item_ref

        # Recurse into sub-loadouts (turrets, missile racks)
        for sub_key in ("loadout", "Loadout", "subLoadout", "SubLoadout"):
            sub = entry.get(sub_key)
            if isinstance(sub, dict):
                _extract_loadout_entries(sub, out)
            elif isinstance(sub, list):
                for s in sub:
                    if isinstance(s, dict):
                        _extract_loadout_entries(s, out)


def _extract_entity_class(entry: dict) -> str:
    """
    Extract item className from a loadout entry.
    Converts __path references to filename stems (our DB key format).
    """
    from pathlib import PurePosixPath

    for key in ("entityClassName", "EntityClassName", "ItemClassName",
                "itemClassName", "className", "ClassName"):
        val = entry.get(key)
        if val and isinstance(val, str) and val.strip():
            return val.strip()

    ecr = entry.get("entityClassReference") or entry.get("EntityClassReference")
    if ecr:
        if isinstance(ecr, str) and ecr.strip():
            return ecr.strip()
        if isinstance(ecr, dict):
            path = ecr.get("__path") or ecr.get("path") or ""
            if path and isinstance(path, str):
                stem = PurePosixPath(path).stem
                if stem:
                    return stem
            ref = ecr.get("__ref") or ecr.get("value") or ""
            if ref and isinstance(ref, str):
                return ref.strip()

    return ""


def parse_ship(raw_original: dict, game_version: str, idx: IndexData) -> Optional[dict]:
    raw = _unwrap_ship(raw_original)

    reference = raw.get("ClassName") or raw.get("className") or ""
    if not reference:
        # Try filename from __path
        path_str = raw.get("__path") or ""
        if path_str:
            from pathlib import PurePosixPath
            reference = PurePosixPath(path_str).stem
    if not reference:
        return None

    name = raw.get("Name") or raw.get("name") or reference
    localized = raw.get("LocalizedName") or raw.get("displayName")
    if isinstance(localized, str) and localized.startswith("@"):
        localized = idx.resolve_label(localized)

    raw_type = str(raw.get("Type") or raw.get("type") or "").strip()
    item_type = "VEHICLE" if raw_type in ("Vehicle", "Ground", "ground") else "SHIP"

    item = {
        "reference": reference, "name": name,
        "localizedName": str(localized) if localized and str(localized) != name else None,
        "className": reference,
        "type": item_type,
        "subType": raw.get("SubType") or raw.get("subType"),
        "size": si(raw.get("Size") or raw.get("size")),
        "manufacturer": idx.resolve_manufacturer(raw.get("Manufacturer") or raw.get("manufacturer")),
        "mass": sf(raw.get("Mass")),
        "gameVersion": game_version,
    }

    flight = raw.get("FlightCharacteristics", raw.get("flight", {})) or {}
    ifcs = raw.get("Ifcs", raw.get("ifcs", {})) or {}
    dims = raw.get("Dimensions", raw.get("dimensions", {})) or {}
    propulsion = raw.get("Propulsion", raw.get("propulsion", {})) or {}
    agility = raw.get("Agility", raw.get("agility", {})) or {}

    # Sub-objects inside FlightCharacteristics
    flight_speeds = flight.get("Speeds", flight.get("speeds", {})) or {}
    flight_ifcs = flight.get("IFCS", flight.get("Ifcs", flight.get("ifcs", {}))) or {}

    # SCM speed — confirmed paths from debug_stats.py:
    #   FlightCharacteristics.Speeds.Scm
    #   FlightCharacteristics.IFCS.ScmSpeed
    scm_speed = (
        sf(_first(flight_speeds, "Scm", "SCM", "scm"))
        or sf(_first(flight_ifcs, "ScmSpeed", "scmSpeed", "SCMSpeed"))
        or sf(_first(flight, "ScmSpeed", "scmSpeed", "SCMSpeed", "MaxSpeed", "maxSpeed"))
        or sf(_first(propulsion, "ScmSpeed", "scmSpeed", "MaxSpeed"))
        or sf(_first(ifcs, "ScmSpeed", "MaxSpeed"))
        or sf(raw.get("ScmSpeed"))
        or sf(raw.get("MaxSpeed"))
    )

    # Max/AFB speed — confirmed paths:
    #   FlightCharacteristics.Speeds.Max
    #   FlightCharacteristics.IFCS.MaxSpeed
    afb_speed = (
        sf(_first(flight_speeds, "Max", "max", "Afterburner", "afterburner"))
        or sf(_first(flight_ifcs, "MaxSpeed", "maxSpeed", "AfterburnerSpeed", "afterburnerSpeed"))
        or sf(_first(flight, "AfterburnerSpeed", "afterburnerSpeed", "MaxAfterburnerSpeed"))
        or sf(_first(propulsion, "AfterburnerSpeed", "afterburnerSpeed"))
        or sf(_first(ifcs, "AfterburnerSpeed"))
        or sf(raw.get("AfterburnerSpeed"))
    )

    # Pitch/Yaw/Roll from Agility or IFCS
    pitch_rate = (
        sf(_first(agility, "PitchRate", "pitchRate", "Pitch"))
        or sf(deep_get(ifcs, "Pitch", "Rate") if isinstance(ifcs.get("Pitch"), dict) else None)
        or sf(deep_get(agility, "Pitch", "Rate") if isinstance(agility.get("Pitch"), dict) else None)
    )
    yaw_rate = (
        sf(_first(agility, "YawRate", "yawRate", "Yaw"))
        or sf(deep_get(ifcs, "Yaw", "Rate") if isinstance(ifcs.get("Yaw"), dict) else None)
        or sf(deep_get(agility, "Yaw", "Rate") if isinstance(agility.get("Yaw"), dict) else None)
    )
    roll_rate = (
        sf(_first(agility, "RollRate", "rollRate", "Roll"))
        or sf(deep_get(ifcs, "Roll", "Rate") if isinstance(ifcs.get("Roll"), dict) else None)
        or sf(deep_get(agility, "Roll", "Rate") if isinstance(agility.get("Roll"), dict) else None)
    )

    # Fuel from Propulsion or root
    h2_fuel = sf(_first(propulsion, "FuelCapacity", "HydrogenFuelCapacity") or raw.get("HydrogenFuelCapacity"))
    qt_fuel = sf(raw.get("QuantumFuelCapacity") or _first(propulsion, "QuantumFuelCapacity"))

    # Cargo: can be a number or an object with SCU
    cargo_raw = raw.get("Cargo") or raw.get("cargo")
    if isinstance(cargo_raw, dict):
        cargo_val = sf(cargo_raw.get("CargoGrid") or cargo_raw.get("scu") or cargo_raw.get("SCU") or cargo_raw.get("Total"))
    else:
        cargo_val = sf(cargo_raw)

    ship = {
        "maxCrew": si(raw.get("Crew") or raw.get("crew")),
        "cargo": cargo_val,
        "scmSpeed": scm_speed,
        "afterburnerSpeed": afb_speed,
        "pitchRate": pitch_rate,
        "yawRate": yaw_rate,
        "rollRate": roll_rate,
        "maxAccelMain": sf(_first(flight, "Acceleration", "MaxAccelMain") or ifcs.get("MaxAccelMain")),
        "maxAccelRetro": sf(_first(flight, "Deceleration", "MaxAccelRetro") or ifcs.get("MaxAccelRetro")),
        "hydrogenFuelCap": h2_fuel,
        "quantumFuelCap": qt_fuel,
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
    default_items = []  # will be replaced by global_loadouts

    # ── HIERARCHICAL LOADOUT EXTRACTION ──
    # Instead of a flat loadout_map, build a list of {parentRef, portName, itemRef}
    # so Phase C can link children to the correct parent (turret item, not ship).
    global_loadouts = []

    def _walk_loadout_recursive(entries, parent_ref: str):
        """Walk loadout entries recursively, tracking parent."""
        if not isinstance(entries, list):
            return
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            port_name = str(
                entry.get("PortName") or entry.get("portName")
                or entry.get("Port") or entry.get("port")
                or entry.get("Name") or entry.get("name") or ""
            ).strip()
            item_ref = str(
                entry.get("ClassName") or entry.get("className")
                or entry.get("ItemClassName") or entry.get("itemClassName")
                or entry.get("EntityClassName") or entry.get("entityClassName")
                or entry.get("Item") or entry.get("item") or ""
            ).strip()
            if not item_ref:
                ecr = entry.get("entityClassReference") or entry.get("EntityClassReference")
                if isinstance(ecr, dict):
                    from pathlib import PurePosixPath
                    path = ecr.get("__path") or ""
                    item_ref = PurePosixPath(path).stem if path else (ecr.get("__ref") or "")
                elif isinstance(ecr, str):
                    item_ref = ecr.strip()

            if port_name and item_ref:
                global_loadouts.append({"parentRef": parent_ref, "portName": port_name, "itemRef": item_ref})

            # Recurse into sub-loadouts (turret guns, missile rack contents)
            for sub_key in ("Loadout", "loadout", "SubLoadout", "subLoadout"):
                sub = entry.get(sub_key)
                if isinstance(sub, list) and sub:
                    # Children belong to this entry's item, not the ship
                    child_parent = item_ref if item_ref else parent_ref
                    _walk_loadout_recursive(sub, child_parent)
                elif isinstance(sub, dict) and sub:
                    child_parent = item_ref if item_ref else parent_ref
                    _walk_loadout_recursive([sub], child_parent)

    raw_loadout = raw.get("Loadout") or raw.get("loadout") or []
    if isinstance(raw_loadout, list):
        _walk_loadout_recursive(raw_loadout, reference)
    elif isinstance(raw_loadout, dict):
        # Legacy dict format: flatten to list-like entries
        flat_entries = []
        _extract_loadout_entries(raw_loadout, {})  # ignore, just use the recursive version
        # Actually walk it properly
        legacy_out = {}
        _extract_loadout_entries(raw_loadout, legacy_out)
        for k, v in legacy_out.items():
            global_loadouts.append({"parentRef": reference, "portName": k, "itemRef": v})

    # Legacy loadout from Raw.Entity
    legacy_loadout = raw.get("_legacy_loadout") or {}
    if isinstance(legacy_loadout, dict):
        for k, v in legacy_loadout.items():
            if k and v:
                global_loadouts.append({"parentRef": reference, "portName": str(k).strip(), "itemRef": str(v).strip()})

    # Build a SHIP-LEVEL loadout map for _extract_parts_recursive (only direct children of the ship)
    ship_loadout_map = {}
    for entry in global_loadouts:
        if entry["parentRef"] == reference:
            ship_loadout_map[entry["portName"]] = entry["itemRef"]

    # Now extract hardpoints from "Parts" (ScDataDumper format) or other sources
    # Source 1: "Parts" — the ScDataDumper port/slot definitions
    raw_parts = raw.get("Parts") or raw.get("parts") or []
    if isinstance(raw_parts, list) and len(raw_parts) > 0:
        _extract_parts_recursive(raw_parts, hardpoints, default_items, ship_loadout_map, idx)

    # Source 2: "Hardpoints" (old scunpacked format)
    if len(hardpoints) == 0:
        raw_hps = raw.get("Hardpoints") or raw.get("hardpoints") or raw.get("Components") or []
        if isinstance(raw_hps, list):
            for hp in raw_hps:
                if not isinstance(hp, dict):
                    continue
                hp_name = hp.get("Name") or hp.get("name") or hp.get("HardpointName", "")
                if not hp_name or is_junk(hp_name):
                    continue
                hp_type = hp.get("Type") or hp.get("type") or hp.get("ItemType", "")
                category = HP_CAT_MAP.get(hp_type, "OTHER")
                equipped_ref = (hp.get("DefaultItem") or hp.get("defaultItem")
                                or hp.get("Equipped") or hp.get("equipped")
                                or hp.get("ItemClassName")
                                or ship_loadout_map.get(hp_name, ""))
                if category == "OTHER" and equipped_ref:
                    category = _resolve_category_from_index(equipped_ref, idx)
                hardpoints.append({
                    "hardpointName": hp_name, "category": category,
                    "minSize": si(hp.get("MinSize") or hp.get("minSize"), 0),
                    "maxSize": si(hp.get("MaxSize") or hp.get("maxSize") or hp.get("Size") or hp.get("size"), 0),
                    "isFixed": hp.get("Fixed", False), "isManned": hp.get("Manned", False),
                    "isInternal": category not in ("WEAPON", "MISSILE_RACK", "TURRET"),
                })
                if equipped_ref:
                    default_items.append({"hardpointName": hp_name, "itemReference": equipped_ref})

    # Source 3: Legacy ports (from Raw.Entity)
    legacy_ports = raw.get("_legacy_ports") or []
    if isinstance(legacy_ports, list) and len(legacy_ports) > 0 and len(hardpoints) == 0:
        for port in legacy_ports:
            if not isinstance(port, dict):
                continue
            port_name = str(port.get("Name") or port.get("name") or port.get("PortName") or "").strip()
            if not port_name or is_junk(port_name):
                continue
            min_size = si(port.get("MinSize") or port.get("minSize"), 0)
            max_size = si(port.get("MaxSize") or port.get("maxSize") or port.get("Size"), 0)
            category = _infer_category_from_port(port, port_name, ship_loadout_map.get(port_name, ""), idx)
            equipped_ref = ship_loadout_map.get(port_name, "")
            hardpoints.append({
                "hardpointName": port_name, "category": category,
                "minSize": min_size, "maxSize": max_size,
                "isFixed": False, "isManned": False,
                "isInternal": category not in ("WEAPON", "MISSILE_RACK", "TURRET"),
            })
            if equipped_ref:
                default_items.append({"hardpointName": port_name, "itemReference": equipped_ref})

    # NOTE: Source 4 (blind hardpoints from loadout) REMOVED — it created ghost slots

    return {"item": item, "ship": ship, "hardpoints": hardpoints, "default_items": global_loadouts}


def _extract_parts_recursive(parts: list, hardpoints: list, default_items: list,
                             loadout_map: dict, idx: IndexData, depth: int = 0):
    """
    Recursively walk the Parts tree to extract hardpoint slots.
    Parts is a nested tree: each part can have sub-parts (children).
    """
    if depth > 5:
        return

    for part in parts:
        if not isinstance(part, dict):
            continue

        port_name = str(
            part.get("Name") or part.get("name")
            or part.get("PortName") or part.get("portName") or ""
        ).strip()

        # Skip junk
        if is_junk(port_name):
            continue

        # Check if this part has relevant component data
        port_type = str(part.get("Type") or part.get("type") or "").strip()
        port_category = HP_CAT_MAP.get(port_type, None)
        min_size = si(part.get("MinSize") or part.get("minSize"), 0)
        max_size = si(part.get("MaxSize") or part.get("maxSize")
                      or part.get("Size") or part.get("size")
                      or part.get("ItemSize") or part.get("itemSize"), 0)

        # Check if there's a loadout entry for this port
        equipped_ref = loadout_map.get(port_name, "")

        # Also check if the part itself has an equipped item reference
        if not equipped_ref:
            equipped_ref = str(
                part.get("ClassName") or part.get("className")
                or part.get("ItemClassName") or part.get("itemClassName")
                or part.get("Item") or ""
            ).strip()
            # Don't use the port's own name as the equipped ref
            if equipped_ref == port_name:
                equipped_ref = ""

        # Determine category
        if not port_category:
            port_category = _infer_category_from_port(part, port_name, equipped_ref, idx)

        # Only add if port has a name AND (has a size > 0 OR has an equipped item OR has a recognized category)
        useful = (port_category and port_category != "OTHER") or equipped_ref or max_size > 0
        if port_name and useful:
            if not port_category:
                port_category = "OTHER"

            hardpoints.append({
                "hardpointName": port_name, "category": port_category,
                "minSize": min_size, "maxSize": max_size,
                "isFixed": str(part.get("Fixed") or part.get("fixed") or "").lower() in ("true", "1", "yes"),
                "isManned": str(part.get("Manned") or part.get("manned") or "").lower() in ("true", "1", "yes"),
                "isInternal": port_category not in ("WEAPON", "MISSILE_RACK", "TURRET"),
            })
            if equipped_ref:
                default_items.append({"hardpointName": port_name, "itemReference": equipped_ref})

        # Recurse into sub-parts
        children = part.get("Parts") or part.get("parts") or part.get("Children") or part.get("children") or []
        if isinstance(children, list) and len(children) > 0:
            _extract_parts_recursive(children, hardpoints, default_items, loadout_map, idx, depth + 1)


def _resolve_category_from_index(item_ref: str, idx: IndexData) -> str:
    """Resolve hardpoint category from an item reference using the index."""
    if not item_ref:
        return "OTHER"
    idx_cat = idx.get_hardpoint_category(item_ref)
    if idx_cat:
        return idx_cat
    idx_type = idx.get_item_type(item_ref)
    if idx_type:
        return {"WEAPON": "WEAPON", "TURRET": "TURRET", "MISSILE": "MISSILE_RACK",
                "SHIELD": "SHIELD", "POWER_PLANT": "POWER_PLANT", "COOLER": "COOLER",
                "QUANTUM_DRIVE": "QUANTUM_DRIVE", "MINING_LASER": "MINING",
                "THRUSTER": "THRUSTER_MAIN", "TRACTOR_BEAM": "TRACTOR_BEAM"}.get(idx_type, "OTHER")
    return "OTHER"


def _infer_category_from_port(port: dict, port_name: str, equipped_ref: str, idx: IndexData) -> str:
    """Infer hardpoint category from port metadata, name, or equipped item."""
    # Try port type field
    port_type = str(port.get("Type") or port.get("type") or "").strip()
    cat = HP_CAT_MAP.get(port_type)
    if cat:
        return cat

    # Try port types array
    port_types = port.get("Types") or port.get("types") or []
    if isinstance(port_types, list):
        for pt in port_types:
            pt_str = pt.get("Type") or pt.get("type") or "" if isinstance(pt, dict) else str(pt)
            mapped = HP_CAT_MAP.get(str(pt_str))
            if mapped:
                return mapped

    # Check equipped item type FIRST — if it's a TURRET item, this is a TURRET slot
    if equipped_ref:
        item_type = idx.get_item_type(equipped_ref)
        if item_type == "TURRET":
            return "TURRET"

    # Infer from name and tags
    combined = port_name.lower()
    tags = port.get("Tags") or port.get("tags") or ""
    if isinstance(tags, list):
        tags = " ".join(str(t) for t in tags)
    combined += " " + str(tags).lower()

    # CRITICAL: check turret BEFORE weapon — many turret ports have "weapon" in the name
    if "turret" in combined: return "TURRET"
    if "missile" in combined or "pylon" in combined: return "MISSILE_RACK"
    if "weapon" in combined or "gun" in combined: return "WEAPON"
    if "shield" in combined: return "SHIELD"
    if "power_plant" in combined or "powerplant" in combined: return "POWER_PLANT"
    if "cooler" in combined or "cool" in combined: return "COOLER"
    if "quantum" in combined: return "QUANTUM_DRIVE"
    if "thruster" in combined or "engine" in combined: return "THRUSTER_MAIN"
    if "radar" in combined or "scanner" in combined: return "RADAR"
    if "mining" in combined: return "MINING"
    if "fuel_tank" in combined: return "FUEL_TANK"
    if "fuel_intake" in combined: return "FUEL_INTAKE"
    if "armor" in combined: return "ARMOR"
    if "countermeasure" in combined: return "COUNTERMEASURE"

    # Last resort: resolve from equipped item type
    if equipped_ref:
        return _resolve_category_from_index(equipped_ref, idx)

    return "OTHER"


# =============================================================================
# PHASE D: Real shops from ship-items.json index
# =============================================================================

def ingest_shops_from_index(conn, idx: IndexData):
    """
    Extract shop data from the ship-items index.
    scunpacked-data's ship-items.json entries often have a "Shops" field
    with where each item is sold. If present, we use it.
    If not available, we fall back to the standalone shops data.
    """
    console.print("[cyan]→ Phase D: Ingesting shops from index data...[/]")

    # Collect all shop mentions from ship-items index
    shops_seen = {}  # (shop_name, location_name) → shop_id
    inventory_count = 0

    all_entries = list(idx.ship_items_index.values())
    # Deduplicate (we stored both original and lowercase keys)
    seen_refs = set()
    unique_entries = []
    for entry in all_entries:
        ref = entry.get("ClassName") or entry.get("className") or entry.get("ref") or id(entry)
        if ref not in seen_refs:
            seen_refs.add(ref)
            unique_entries.append(entry)

    for entry in unique_entries:
        shops_field = entry.get("Shops") or entry.get("shops") or entry.get("ShopData") or []
        if not shops_field or not isinstance(shops_field, list):
            continue

        item_ref = entry.get("ClassName") or entry.get("className") or entry.get("ref") or ""
        if not item_ref:
            continue

        # Resolve item ID in our DB
        item_id = resolve_item_id(conn, item_ref)
        if not item_id:
            continue

        for shop_entry in shops_field:
            if not isinstance(shop_entry, dict):
                continue

            shop_name = shop_entry.get("Name") or shop_entry.get("name") or ""
            location_name = shop_entry.get("Location") or shop_entry.get("location") or ""
            if not shop_name:
                continue

            # Parse location hierarchy
            loc_parts = location_name.split(",") if location_name else [shop_name]
            loc_name = loc_parts[0].strip() if loc_parts else "Unknown"
            parent_name = loc_parts[1].strip() if len(loc_parts) > 1 else None

            shop_key = (shop_name, loc_name)
            if shop_key not in shops_seen:
                # Create location
                loc_id = str(uuid.uuid4())
                conn.execute(text("""
                    INSERT INTO locations (id, name, type, "parentName", system)
                    VALUES (:id, :name, 'station', :parent, 'Stanton')
                    ON CONFLICT (name, "parentName") DO NOTHING
                """), {"id": loc_id, "name": loc_name, "parent": parent_name})

                row = conn.execute(text(
                    'SELECT id FROM locations WHERE name = :n AND ("parentName" = :p OR ("parentName" IS NULL AND :p IS NULL))'
                ), {"n": loc_name, "p": parent_name}).fetchone()
                real_loc_id = row[0] if row else loc_id

                # Create shop
                shop_id = str(uuid.uuid4())
                conn.execute(text("""
                    INSERT INTO shops (id, name, "locationId", "shopType")
                    VALUES (:id, :name, :lid, :type)
                    ON CONFLICT (name, "locationId") DO NOTHING
                """), {"id": shop_id, "name": shop_name, "lid": real_loc_id, "type": "components"})

                row = conn.execute(text(
                    'SELECT id FROM shops WHERE name = :n AND "locationId" = :l'
                ), {"n": shop_name, "l": real_loc_id}).fetchone()
                shops_seen[shop_key] = row[0] if row else shop_id
            else:
                shop_id = shops_seen[shop_key]

            # Insert inventory
            price_buy = sf(shop_entry.get("PriceBuy") or shop_entry.get("price") or shop_entry.get("BasePrice"))
            price_sell = sf(shop_entry.get("PriceSell") or shop_entry.get("sellPrice"))

            if price_buy is not None or price_sell is not None:
                conn.execute(text("""
                    INSERT INTO shop_inventory (id, "shopId", "itemId", "priceBuy", "priceSell", "isAvailable")
                    VALUES (:id, :sid, :iid, :buy, :sell, true)
                    ON CONFLICT ("shopId", "itemId") DO UPDATE SET
                        "priceBuy" = COALESCE(EXCLUDED."priceBuy", shop_inventory."priceBuy"),
                        "priceSell" = COALESCE(EXCLUDED."priceSell", shop_inventory."priceSell")
                """), {
                    "id": str(uuid.uuid4()), "sid": shops_seen[shop_key],
                    "iid": item_id, "buy": price_buy, "sell": price_sell,
                })
                inventory_count += 1

    console.print(f"[green]  ✓ {len(shops_seen)} shops, {inventory_count} inventory entries[/]")

    # If no shops found from index, seed mock data as fallback
    if len(shops_seen) == 0:
        console.print("[yellow]  ⚠ No shop data in index, seeding mock shops...[/]")
        seed_mock_shops(conn)


def seed_mock_shops(conn):
    """Fallback: insert realistic mock shops."""
    import random
    shops_data = [
        ("Area18", "city", "ArcCorp", [("Centermass", "weapons"), ("Dumper's Depot", "components")]),
        ("Orison", "city", "Crusader", [("Cousin Crow's Custom Crafts", "components")]),
        ("New Babbage", "city", "microTech", [("Omega Pro", "weapons"), ("Tammany and Sons", "components")]),
        ("Lorville", "city", "Hurston", [("Tammany and Sons", "components")]),
        ("Grim HEX", "station", "Crusader", [("Dumper's Depot", "components"), ("Skutters", "weapons")]),
    ]

    shop_ids = []
    for loc_name, loc_type, parent, shops in shops_data:
        loc_id = str(uuid.uuid4())
        conn.execute(text("""
            INSERT INTO locations (id, name, type, "parentName", system)
            VALUES (:id, :n, :t, :p, 'Stanton') ON CONFLICT (name, "parentName") DO NOTHING
        """), {"id": loc_id, "n": loc_name, "t": loc_type, "p": parent})
        row = conn.execute(text('SELECT id FROM locations WHERE name = :n AND "parentName" = :p'), {"n": loc_name, "p": parent}).fetchone()
        rlid = row[0] if row else loc_id

        for sname, stype in shops:
            sid = str(uuid.uuid4())
            conn.execute(text("""
                INSERT INTO shops (id, name, "locationId", "shopType")
                VALUES (:id, :n, :l, :t) ON CONFLICT (name, "locationId") DO NOTHING
            """), {"id": sid, "n": sname, "l": rlid, "t": stype})
            row = conn.execute(text('SELECT id FROM shops WHERE name = :n AND "locationId" = :l'), {"n": sname, "l": rlid}).fetchone()
            shop_ids.append(row[0] if row else sid)

    type_map = {"weapons": ["WEAPON", "MISSILE", "TURRET"], "components": ["SHIELD", "POWER_PLANT", "COOLER", "QUANTUM_DRIVE"]}
    for sid in shop_ids:
        row = conn.execute(text('SELECT "shopType" FROM shops WHERE id = :id'), {"id": sid}).fetchone()
        types = type_map.get(row[0] if row else "components", ["WEAPON", "SHIELD"])
        ph = ", ".join(f"'{t}'" for t in types)
        items = conn.execute(text(f"SELECT id FROM items WHERE type IN ({ph}) ORDER BY RANDOM() LIMIT 25")).fetchall()
        for (iid,) in items:
            bp = random.randint(500, 50000)
            conn.execute(text("""
                INSERT INTO shop_inventory (id, "shopId", "itemId", "priceBuy", "priceSell", "isAvailable")
                VALUES (:id, :s, :i, :b, :se, true) ON CONFLICT ("shopId", "itemId") DO NOTHING
            """), {"id": str(uuid.uuid4()), "s": sid, "i": iid, "b": bp, "se": int(bp * 0.55)})

    console.print(f"[green]  ✓ {len(shop_ids)} mock shops seeded[/]")


# =============================================================================
# DATABASE OPERATIONS (same as v2, compacted)
# =============================================================================

def upsert_item(conn, item: dict) -> str:
    item_id = str(uuid.uuid4())
    conn.execute(text("""
        INSERT INTO items (id, reference, name, "localizedName", "className", type,
            "subType", size, grade, manufacturer, mass, "hitPoints",
            "gameVersion", "createdAt", "updatedAt")
        VALUES (:id, :ref, :name, :lname, :cname, :type, :sub, :size, :grade,
            :mfr, :mass, :hp, :ver, NOW(), NOW())
        ON CONFLICT (reference) DO UPDATE SET
            name=EXCLUDED.name, "localizedName"=EXCLUDED."localizedName",
            "className"=EXCLUDED."className", type=EXCLUDED.type,
            "subType"=EXCLUDED."subType", size=EXCLUDED.size,
            grade=EXCLUDED.grade, manufacturer=EXCLUDED.manufacturer,
            mass=EXCLUDED.mass, "hitPoints"=EXCLUDED."hitPoints",
            "gameVersion"=EXCLUDED."gameVersion", "updatedAt"=NOW()
    """), {"id": item_id, "ref": item["reference"], "name": item["name"],
           "lname": item.get("localizedName"), "cname": item.get("className"),
           "type": item["type"], "sub": item.get("subType"), "size": item.get("size"),
           "grade": item.get("grade"), "mfr": item.get("manufacturer"),
           "mass": item.get("mass"), "hp": item.get("hitPoints"), "ver": item["gameVersion"]})
    row = conn.execute(text("SELECT id FROM items WHERE reference = :r"), {"r": item["reference"]}).fetchone()
    return row[0] if row else item_id


def upsert_stats(conn, table: str, item_id: str, stats: dict):
    filtered = {k: v for k, v in stats.items() if v is not None}
    if not filtered: return
    cols = ', '.join(f'"{k}"' for k in filtered)
    phs = ', '.join(f':{k}' for k in filtered)
    upd = ', '.join(f'"{k}"=EXCLUDED."{k}"' for k in filtered)
    conn.execute(text(f'INSERT INTO {table} (id, "itemId", {cols}) VALUES (:id, :iid, {phs}) ON CONFLICT ("itemId") DO UPDATE SET {upd}'),
                 {"id": str(uuid.uuid4()), "iid": item_id, **filtered})


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


def upsert_hardpoint(conn, parent_id: str, hp: dict):
    conn.execute(text("""
        INSERT INTO hardpoints (id, "parentItemId", "hardpointName", category,
            "minSize", "maxSize", "isFixed", "isManned", "isInternal")
        VALUES (:id, :pid, :name, :cat, :mins, :maxs, :fix, :man, :int)
        ON CONFLICT ("parentItemId", "hardpointName") DO UPDATE SET
            category=EXCLUDED.category, "minSize"=EXCLUDED."minSize",
            "maxSize"=EXCLUDED."maxSize", "isFixed"=EXCLUDED."isFixed",
            "isManned"=EXCLUDED."isManned", "isInternal"=EXCLUDED."isInternal"
    """), {"id": str(uuid.uuid4()), "pid": parent_id,
           "name": hp["hardpointName"], "cat": hp["category"],
           "mins": hp["minSize"], "maxs": hp["maxSize"],
           "fix": hp["isFixed"], "man": hp["isManned"], "int": hp["isInternal"]})


def resolve_item_id(conn, ref: str) -> Optional[str]:
    if not ref: return None
    ref = str(ref).strip()
    if not ref: return None

    # If ref looks like a path (contains / or .xml), convert to stem
    if "/" in ref or ref.endswith(".xml"):
        from pathlib import PurePosixPath
        ref = PurePosixPath(ref).stem

    # Try exact match on reference
    row = conn.execute(text("SELECT id FROM items WHERE reference = :r LIMIT 1"), {"r": ref}).fetchone()
    if row: return row[0]

    # Try exact match on className
    row = conn.execute(text('SELECT id FROM items WHERE "className" = :r LIMIT 1'), {"r": ref}).fetchone()
    if row: return row[0]

    # Try case-insensitive className
    row = conn.execute(text('SELECT id FROM items WHERE LOWER("className") = LOWER(:r) LIMIT 1'), {"r": ref}).fetchone()
    if row: return row[0]

    # Try case-insensitive name
    row = conn.execute(text("SELECT id FROM items WHERE LOWER(name) = LOWER(:r) LIMIT 1"), {"r": ref}).fetchone()
    if row: return row[0]

    # Try substring match on reference (for UUIDs that might be partial)
    if len(ref) > 8 and "-" in ref:
        row = conn.execute(text("SELECT id FROM items WHERE reference LIKE :r LIMIT 1"), {"r": f"%{ref}%"}).fetchone()
        if row: return row[0]

    return None


def link_default_item(conn, parent_id: str, hp_name: str, item_ref: str) -> bool:
    """
    Link an equipped item to a hardpoint. Uses fuzzy matching:
    1. Exact match on hardpointName
    2. Suffix match (ignore prefixes like 'hardpoint_')
    3. Contains match
    4. First unequipped slot of same parent
    """
    eid = resolve_item_id(conn, item_ref)
    if not eid:
        return False

    # 1. Exact match
    r = conn.execute(text(
        'UPDATE hardpoints SET "equippedItemId" = :e '
        'WHERE "parentItemId" = :p AND "hardpointName" = :h AND "equippedItemId" IS NULL'
    ), {"e": eid, "p": parent_id, "h": hp_name})
    if r.rowcount > 0:
        return True

    # Also try without the IS NULL constraint (override existing)
    r = conn.execute(text(
        'UPDATE hardpoints SET "equippedItemId" = :e '
        'WHERE "parentItemId" = :p AND "hardpointName" = :h'
    ), {"e": eid, "p": parent_id, "h": hp_name})
    if r.rowcount > 0:
        return True

    # 2. Get all hardpoints for this parent to do fuzzy matching
    rows = conn.execute(text(
        'SELECT id, "hardpointName", "equippedItemId" FROM hardpoints WHERE "parentItemId" = :p'
    ), {"p": parent_id}).fetchall()

    if not rows:
        return False

    available = [(row[0], row[1], row[2]) for row in rows]  # (id, name, equippedId)
    hp_lower = hp_name.lower()

    # Strip common prefixes for comparison
    def normalize(name: str) -> str:
        n = name.lower()
        for prefix in ("hardpoint_", "hp_", "port_", "slot_"):
            if n.startswith(prefix):
                n = n[len(prefix):]
        return n

    hp_norm = normalize(hp_name)

    # 2. Suffix/normalized match
    for hid, hname, heq in available:
        if normalize(hname) == hp_norm:
            conn.execute(text('UPDATE hardpoints SET "equippedItemId" = :e WHERE id = :id'),
                         {"e": eid, "id": hid})
            return True

    # 3. Contains match (hp_name contains hardpoint name or vice versa)
    for hid, hname, heq in available:
        hn_lower = hname.lower()
        if hp_lower in hn_lower or hn_lower in hp_lower:
            conn.execute(text('UPDATE hardpoints SET "equippedItemId" = :e WHERE id = :id'),
                         {"e": eid, "id": hid})
            return True

    # 4. First unequipped slot (for turrets where port names don't match loadout names)
    for hid, hname, heq in available:
        if heq is None:
            conn.execute(text('UPDATE hardpoints SET "equippedItemId" = :e WHERE id = :id'),
                         {"e": eid, "id": hid})
            return True

    # Debug: print what we couldn't match
    available_names = [row[1] for row in available]
    console.print(f"[yellow]  ? link_default_item MISS: parent={parent_id[:8]}.. port='{hp_name}' item='{item_ref[:40]}' available={available_names[:6]}[/]")

    return False


# =============================================================================
# FILE DISCOVERY + REPO SYNC
# =============================================================================

def find_data(base: Path) -> dict:
    dirs = {}
    for n in ["ships", "api/ships"]:
        d = base / n
        if d.exists(): dirs["ships"] = d; break
    for n in ["items", "api/items"]:
        d = base / n
        if d.exists(): dirs["items"] = d; break
    for k, p in dirs.items():
        console.print(f"[green]✓ {k}: {p} ({len(list(p.glob('*.json')))} files)[/]")
    return dirs

def sync_repo(local: Path, url: str) -> bool:
    if local.exists() and (local / ".git").exists():
        r = subprocess.run(["git", "pull", "--ff-only"], cwd=local, capture_output=True, text=True)
        if r.returncode != 0:
            console.print(f"[yellow]⚠ git pull failed: {r.stderr.strip()}[/]")
            return False
        console.print("[green]✓ Repo updated[/]")
    else:
        r = subprocess.run(["git", "clone", "--depth=1", url, str(local)], capture_output=True, text=True)
        if r.returncode != 0:
            console.print(f"[red]✗ Clone failed: {r.stderr.strip()}[/]")
            return False
        console.print("[green]✓ Repo cloned[/]")
    return True


# =============================================================================
# CLI
# =============================================================================

@click.command()
@click.option("--version", "game_version", required=True, help="Game version (e.g. 4.0.2)")
@click.option("--local-path", type=click.Path(), default=None)
@click.option("--dry-run", is_flag=True)
@click.option("--skip-clone", is_flag=True)
@click.option("--no-shops", is_flag=True, help="Skip shop ingestion")
@click.option("--create-tables", is_flag=True, help="Create database tables if they don't exist")
def main(game_version, local_path, dry_run, skip_clone, no_shops, create_tables):
    console.print("\n[bold blue]═══════════════════════════════════════════════[/]")
    console.print("[bold blue]  AL FILO — Datamining Pipeline v3.0 (Index)  [/]")
    console.print("[bold blue]═══════════════════════════════════════════════[/]\n")

    db_url = os.getenv("DATABASE_URL")
    if not db_url and not dry_run:
        console.print("[red]✗ DATABASE_URL not set[/]"); sys.exit(1)

    if create_tables and not dry_run:
        from sqlalchemy_utils import database_exists, create_database
        engine = create_engine(db_url)
        if not database_exists(engine.url):
            create_database(engine.url)
            console.print("[green]✓ Database created[/]")
        
        with engine.begin() as conn:
            console.print("[cyan]-> Creating tables...[/]")
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS items (
                    id UUID PRIMARY KEY,
                    reference TEXT UNIQUE NOT NULL,
                    name TEXT NOT NULL,
                    "localizedName" TEXT,
                    "className" TEXT,
                    type TEXT NOT NULL,
                    "subType" TEXT,
                    size INTEGER,
                    grade TEXT,
                    manufacturer TEXT,
                    mass DOUBLE PRECISION,
                    "hitPoints" DOUBLE PRECISION,
                    "gameVersion" TEXT NOT NULL,
                    "rawData" JSONB,
                    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                );
                CREATE TABLE IF NOT EXISTS weapon_stats (
                    id UUID PRIMARY KEY,
                    "itemId" UUID UNIQUE REFERENCES items(id) ON DELETE CASCADE,
                    dps DOUBLE PRECISION, "alphaDamage" DOUBLE PRECISION, "fireRate" DOUBLE PRECISION,
                    range DOUBLE PRECISION, speed DOUBLE PRECISION, "ammoCount" INTEGER,
                    "damageType" TEXT, "dmgPhysical" DOUBLE PRECISION, "dmgEnergy" DOUBLE PRECISION,
                    "dmgDistortion" DOUBLE PRECISION, "dmgThermal" DOUBLE PRECISION,
                    "powerDraw" DOUBLE PRECISION, "thermalOutput" DOUBLE PRECISION,
                    "emSignature" DOUBLE PRECISION, "irSignature" DOUBLE PRECISION
                );
                CREATE TABLE IF NOT EXISTS shield_stats (
                    id UUID PRIMARY KEY, "itemId" UUID UNIQUE REFERENCES items(id) ON DELETE CASCADE,
                    "maxHp" DOUBLE PRECISION, "regenRate" DOUBLE PRECISION, "downedDelay" DOUBLE PRECISION,
                    "dmgAbsPhysical" DOUBLE PRECISION, "dmgAbsEnergy" DOUBLE PRECISION, "dmgAbsDistortion" DOUBLE PRECISION,
                    "powerDraw" DOUBLE PRECISION, "thermalOutput" DOUBLE PRECISION,
                    "emSignature" DOUBLE PRECISION, "irSignature" DOUBLE PRECISION
                );
                CREATE TABLE IF NOT EXISTS power_stats (
                    id UUID PRIMARY KEY, "itemId" UUID UNIQUE REFERENCES items(id) ON DELETE CASCADE,
                    "powerOutput" DOUBLE PRECISION, "powerBase" DOUBLE PRECISION,
                    "thermalOutput" DOUBLE PRECISION, "emSignature" DOUBLE PRECISION, "irSignature" DOUBLE PRECISION
                );
                CREATE TABLE IF NOT EXISTS cooling_stats (
                    id UUID PRIMARY KEY, "itemId" UUID UNIQUE REFERENCES items(id) ON DELETE CASCADE,
                    "coolingRate" DOUBLE PRECISION, "suppressionHeat" DOUBLE PRECISION, "suppressionIR" DOUBLE PRECISION,
                    "powerDraw" DOUBLE PRECISION, "thermalOutput" DOUBLE PRECISION,
                    "emSignature" DOUBLE PRECISION, "irSignature" DOUBLE PRECISION
                );
                CREATE TABLE IF NOT EXISTS quantum_stats (
                    id UUID PRIMARY KEY, "itemId" UUID UNIQUE REFERENCES items(id) ON DELETE CASCADE,
                    "maxSpeed" DOUBLE PRECISION, "maxRange" DOUBLE PRECISION, "fuelRate" DOUBLE PRECISION,
                    "spoolUpTime" DOUBLE PRECISION, "cooldownTime" DOUBLE PRECISION,
                    "stage1Accel" DOUBLE PRECISION, "stage2Accel" DOUBLE PRECISION,
                    "quantumType" TEXT, "powerDraw" DOUBLE PRECISION, "thermalOutput" DOUBLE PRECISION,
                    "emSignature" DOUBLE PRECISION, "irSignature" DOUBLE PRECISION
                );
                CREATE TABLE IF NOT EXISTS mining_stats (
                    id UUID PRIMARY KEY, "itemId" UUID UNIQUE REFERENCES items(id) ON DELETE CASCADE,
                    "miningPower" DOUBLE PRECISION, resistance DOUBLE PRECISION, instability DOUBLE PRECISION,
                    "optimalRange" DOUBLE PRECISION, "maxRange" DOUBLE PRECISION, "throttleRate" DOUBLE PRECISION,
                    "powerDraw" DOUBLE PRECISION, "thermalOutput" DOUBLE PRECISION
                );
                CREATE TABLE IF NOT EXISTS missile_stats (
                    id UUID PRIMARY KEY, "itemId" UUID UNIQUE REFERENCES items(id) ON DELETE CASCADE,
                    damage DOUBLE PRECISION, "lockTime" DOUBLE PRECISION, "lockRange" DOUBLE PRECISION,
                    "trackingAngle" DOUBLE PRECISION, speed DOUBLE PRECISION, "fuelTime" DOUBLE PRECISION,
                    "lockingType" TEXT
                );
                CREATE TABLE IF NOT EXISTS thruster_stats (
                    id UUID PRIMARY KEY, "itemId" UUID UNIQUE REFERENCES items(id) ON DELETE CASCADE,
                    "thrustCapacity" DOUBLE PRECISION, "maxThrust" DOUBLE PRECISION, "fuelBurnRate" DOUBLE PRECISION,
                    "thrustType" TEXT, "powerDraw" DOUBLE PRECISION, "thermalOutput" DOUBLE PRECISION, "emSignature" DOUBLE PRECISION
                );
                CREATE TABLE IF NOT EXISTS ships (
                    id UUID PRIMARY KEY, "itemId" UUID UNIQUE REFERENCES items(id) ON DELETE CASCADE,
                    "maxCrew" INTEGER, cargo DOUBLE PRECISION, "scmSpeed" DOUBLE PRECISION, "afterburnerSpeed" DOUBLE PRECISION,
                    "pitchRate" DOUBLE PRECISION, "yawRate" DOUBLE PRECISION, "rollRate" DOUBLE PRECISION,
                    "maxAccelMain" DOUBLE PRECISION, "maxAccelRetro" DOUBLE PRECISION,
                    "hydrogenFuelCap" DOUBLE PRECISION, "quantumFuelCap" DOUBLE PRECISION,
                    "lengthMeters" DOUBLE PRECISION, "beamMeters" DOUBLE PRECISION, "heightMeters" DOUBLE PRECISION,
                    role TEXT, focus TEXT, career TEXT, "isSpaceship" BOOLEAN DEFAULT TRUE, "isGravlev" BOOLEAN DEFAULT FALSE,
                    "baseEmSignature" DOUBLE PRECISION, "baseIrSignature" DOUBLE PRECISION, "baseCsSignature" DOUBLE PRECISION
                );
                CREATE TABLE IF NOT EXISTS hardpoints (
                    id UUID PRIMARY KEY, "parentItemId" UUID REFERENCES items(id) ON DELETE CASCADE,
                    "hardpointName" TEXT NOT NULL, category TEXT NOT NULL,
                    "minSize" INTEGER DEFAULT 0, "maxSize" INTEGER DEFAULT 0,
                    "isFixed" BOOLEAN DEFAULT FALSE, "isManned" BOOLEAN DEFAULT FALSE, "isInternal" BOOLEAN DEFAULT FALSE,
                    "equippedItemId" UUID REFERENCES items(id) ON DELETE SET NULL,
                    UNIQUE("parentItemId", "hardpointName")
                );
                CREATE TABLE IF NOT EXISTS locations (
                    id UUID PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL,
                    "parentName" TEXT, system TEXT,
                    UNIQUE(name, "parentName")
                );
                CREATE TABLE IF NOT EXISTS shops (
                    id UUID PRIMARY KEY, name TEXT NOT NULL, "locationId" UUID REFERENCES locations(id) ON DELETE CASCADE,
                    "shopType" TEXT,
                    UNIQUE(name, "locationId")
                );
                CREATE TABLE IF NOT EXISTS shop_inventory (
                    id UUID PRIMARY KEY, "shopId" UUID REFERENCES shops(id) ON DELETE CASCADE,
                    "itemId" UUID REFERENCES items(id) ON DELETE CASCADE,
                    "priceBuy" DOUBLE PRECISION, "priceSell" DOUBLE PRECISION,
                    "isAvailable" BOOLEAN DEFAULT TRUE, stock INTEGER,
                    UNIQUE("shopId", "itemId")
                );
                CREATE TABLE IF NOT EXISTS game_versions (
                    id UUID PRIMARY KEY, version TEXT UNIQUE NOT NULL, source TEXT NOT NULL,
                    "itemCount" INTEGER DEFAULT 0, "processedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    notes TEXT
                );
            """))
            console.print("[green]✓ Tables created or verified[/]")

    repo_url = os.getenv("SCUNPACKED_REPO_URL", REPO_URL_DEFAULT)
    data_path = Path(local_path) if local_path else Path(os.getenv("SCUNPACKED_LOCAL_PATH", "./data/scunpacked-data"))

    if not skip_clone:
        sync_repo(data_path, repo_url)
    if not data_path.exists():
        console.print(f"[red]✗ Data dir not found: {data_path}[/]"); sys.exit(1)

    # Phase 0: Load indexes
    console.print("[cyan]→ Phase 0: Loading index files...[/]")
    idx = IndexData(data_path)

    dirs = find_data(data_path)

    # Parse items from individual JSON files
    all_items = []
    seen_refs = set()  # Deduplicate
    parse_errors = 0
    parse_skipped = 0

    if "items" in dirs:
        with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}")) as p:
            t = p.add_task("Parsing item files...")
            file_count = 0
            for f in sorted(dirs["items"].glob("**/*.json")):
                file_count += 1
                try:
                    raw = load_json(f)
                    entries = raw if isinstance(raw, list) else [raw]
                    for entry in entries:
                        if not isinstance(entry, dict):
                            continue
                        parsed = parse_item(entry, game_version, idx, filename=str(f))
                        if parsed and parsed["item"]["reference"] not in seen_refs:
                            all_items.append(parsed)
                            seen_refs.add(parsed["item"]["reference"])
                        else:
                            parse_skipped += 1
                except Exception as e:
                    parse_errors += 1
                    if parse_errors <= 3:
                        console.print(f"[yellow]⚠ Parse error in {f.name}: {type(e).__name__}: {e}[/]")
            p.remove_task(t)
        console.print(f"[green]✓ {len(all_items)} items from {file_count} files (skipped {parse_skipped}, errors {parse_errors})[/]")

    # If individual files yielded few items, also ingest from index files
    # This catches the case where items/ folder structure doesn't match expectations
    if len(all_items) < 100:
        console.print("[cyan]→ Phase A+: Ingesting items from index files (ship-items.json, items.json)...[/]")
        index_added = 0

        # From ship-items.json index
        seen_in_index = set()
        for key, entry in idx.ship_items_index.items():
            if not isinstance(entry, dict):
                continue
            ref = str(entry.get("ClassName") or entry.get("className") or key).strip()
            if not ref or ref in seen_refs or ref in seen_in_index:
                continue
            seen_in_index.add(ref)

            # Try to load the detailed JSON file for this item
            detail = None
            for items_dir_name in ["items", "api/items"]:
                candidate = data_path / items_dir_name / f"{ref}.json"
                if candidate.exists():
                    try:
                        detail = load_json(candidate)
                        if isinstance(detail, list):
                            detail = detail[0] if detail else None
                    except Exception:
                        pass
                    break

            # Use detailed file if found, otherwise use index entry
            source = detail if isinstance(detail, dict) else entry
            parsed = parse_item(source, game_version, idx, filename=ref)
            if parsed and parsed["item"]["reference"] not in seen_refs:
                all_items.append(parsed)
                seen_refs.add(parsed["item"]["reference"])
                index_added += 1

        # From items.json index
        for key, entry in idx.items_index.items():
            if not isinstance(entry, dict):
                continue
            ref = str(entry.get("ClassName") or entry.get("className") or key).strip()
            if not ref or ref in seen_refs or ref in seen_in_index:
                continue
            seen_in_index.add(ref)

            parsed = parse_item(entry, game_version, idx, filename=ref)
            if parsed and parsed["item"]["reference"] not in seen_refs:
                all_items.append(parsed)
                seen_refs.add(parsed["item"]["reference"])
                index_added += 1

        console.print(f"[green]  ✓ {index_added} additional items from index files[/]")

    # Diagnostic: show sample of first parsed items
    if all_items:
        console.print(f"[cyan]  Sample parsed items:[/]")
        for sample in all_items[:3]:
            si_item = sample["item"]
            console.print(f"    📦 {si_item['name']} ({si_item['type']}) ref={si_item['reference'][:40]}")
    else:
        # Debug: show what a sample file looks like
        console.print("[yellow]⚠ No items parsed! Showing debug info:[/]")
        if "items" in dirs:
            sample_files = list(dirs["items"].glob("**/*.json"))[:3]
            for sf_path in sample_files:
                try:
                    sample_raw = load_json(sf_path)
                    if isinstance(sample_raw, dict):
                        console.print(f"  File: {sf_path.name}")
                        console.print(f"  Top keys: {list(sample_raw.keys())[:10]}")
                    elif isinstance(sample_raw, list):
                        console.print(f"  File: {sf_path.name} (array of {len(sample_raw)})")
                        if sample_raw and isinstance(sample_raw[0], dict):
                            console.print(f"  First entry keys: {list(sample_raw[0].keys())[:10]}")
                except Exception as e:
                    console.print(f"  File: {sf_path.name} — error: {e}")

    # Parse ships
    ships = []
    ship_errors = 0
    if "ships" in dirs:
        with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}")) as p:
            t = p.add_task("Parsing ships...")
            for f in sorted(dirs["ships"].glob("*.json")):
                try:
                    raw = load_json(f)
                    entries = raw if isinstance(raw, list) else [raw]
                    for entry in entries:
                        parsed = parse_ship(entry, game_version, idx)
                        if parsed: ships.append(parsed)
                except Exception as e:
                    ship_errors += 1
                    if ship_errors <= 3:
                        console.print(f"[yellow]⚠ Ship parse error in {f.name}: {type(e).__name__}: {e}[/]")
            p.remove_task(t)
        console.print(f"[green]✓ {len(ships)} ships parsed (errors: {ship_errors})[/]")

    if not all_items and not ships:
        console.print("[red]✗ No data found[/]"); sys.exit(1)

    # Summary
    tbl = Table(title="Pipeline v3 -- Parse Summary")
    tbl.add_column("Category", style="cyan")
    tbl.add_column("Count", justify="right", style="green")
    tbl.add_row("Components", str(len(all_items)))
    tbl.add_row("Ships/Vehicles", str(len(ships)))
    tbl.add_row("Hardpoints", str(sum(len(s["hardpoints"]) for s in ships)))
    tbl.add_row("Default Items", str(sum(len(s["default_items"]) for s in ships)))
    tbl.add_row("Manufacturers (index)", str(len(idx.manufacturers) // 2))
    tbl.add_row("Labels (index)", str(len(idx.labels)))
    tbl.add_row("Ship-Items (index)", str(len(idx.ship_items_index) // 2))
    type_counts = {}
    for i in all_items:
        t = i["item"]["type"]
        type_counts[t] = type_counts.get(t, 0) + 1
    for t, c in sorted(type_counts.items()):
        tbl.add_row(f"  -- {t}", str(c))
    console.print(tbl)

    # Diagnostic: show ships with/without default items
    ships_with_defaults = [s for s in ships if len(s["default_items"]) > 0]
    ships_without = [s for s in ships if len(s["default_items"]) == 0]
    console.print(f"\n[cyan]  Ships with default loadout: {len(ships_with_defaults)}[/]")
    console.print(f"[cyan]  Ships without default loadout: {len(ships_without)}[/]")

    if ships_with_defaults:
        console.print("[cyan]  Sample ships WITH defaults:[/]")
        for s in ships_with_defaults[:3]:
            name = s["item"]["name"]
            hp_count = len(s["hardpoints"])
            di_count = len(s["default_items"])
            console.print(f"    {name}: {hp_count} hardpoints, {di_count} defaults")
            for d in s["default_items"][:3]:
                console.print(f"      {d.get('portName', d.get('hardpointName', '?'))} <- {d.get('itemRef', d.get('itemReference', '?'))[:50]}")

    if ships_without and not ships_with_defaults:
        console.print("[yellow]  WARNING: No ships have default loadouts![/]")
        console.print("[yellow]  Showing debug info for first ship:[/]")
        dbg = ships[0] if ships else None
        if dbg:
            console.print(f"    Name: {dbg['item']['name']}")
            console.print(f"    Ref: {dbg['item']['reference']}")
            console.print(f"    Hardpoints: {len(dbg['hardpoints'])}")
            # Show raw keys from the original ship JSON for debugging
            for f in sorted((data_path / "ships").glob("*.json"))[:1]:
                try:
                    raw_ship = load_json(f)
                    if isinstance(raw_ship, dict):
                        console.print(f"    Raw top keys: {list(raw_ship.keys())[:8]}")
                        raw_inner = raw_ship.get("Raw", {})
                        if isinstance(raw_inner, dict):
                            entity = raw_inner.get("Entity", {})
                            if isinstance(entity, dict):
                                comps = entity.get("Components", {})
                                console.print(f"    Entity keys: {list(entity.keys())[:8]}")
                                console.print(f"    Component keys: {list(comps.keys())[:15]}")
                                # Check for loadout
                                ldp = comps.get("SEntityComponentDefaultLoadoutParams")
                                console.print(f"    Has SEntityComponentDefaultLoadoutParams: {ldp is not None}")
                                if isinstance(ldp, dict):
                                    console.print(f"    Loadout keys: {list(ldp.keys())[:10]}")
                                    ld = ldp.get("loadout") or ldp.get("Loadout")
                                    if isinstance(ld, dict):
                                        console.print(f"    Loadout.loadout keys: {list(ld.keys())[:10]}")
                except Exception as e:
                    console.print(f"    Debug error: {e}")

    if dry_run:
        console.print("\n[yellow]DRY RUN — no database writes[/]\n"); return

    # Execute
    engine = create_engine(db_url)
    with engine.connect() as conn:
        # Phase A: Items + Stats
        console.print("\n[cyan]-> Phase A: Inserting items + stats...[/]")
        turret_hp_count = 0
        batch_size = 100
        for i, parsed in enumerate(all_items):
            with conn.begin():
                iid = upsert_item(conn, parsed["item"])
                if parsed["statsTable"] and parsed["stats"]:
                    upsert_stats(conn, parsed["statsTable"], iid, parsed["stats"])
                for hp in parsed.get("hardpoints", []):
                    upsert_hardpoint(conn, iid, hp)
                    turret_hp_count += 1
            if i % batch_size == 0:
                console.print(f"    -> Progress: {i}/{len(all_items)} items...")

        # Phase B: Ships + Hardpoints
        console.print("[cyan]-> Phase B: Inserting ships + hardpoints...[/]")
        for i, s in enumerate(ships):
            with conn.begin():
                iid = upsert_item(conn, s["item"])
                upsert_ship(conn, iid, s["ship"])
                for hp in s["hardpoints"]:
                    upsert_hardpoint(conn, iid, hp)
            if i % 25 == 0:
                console.print(f"    -> Progress: {i}/{len(ships)} ships...")

        console.print(f"[green]  -> {len(all_items)} items + {len(ships)} ships inserted[/]")

        # Phase C: Linking
        console.print("[cyan]-> Phase C: Linking default loadouts...[/]")
        with conn.begin():
            linked, missed = 0, 0
            missed_samples = []
            for s in ships:
                for d in s["default_items"]:
                    parent_ref = d.get("parentRef", s["item"]["reference"])
                    port_name = d.get("portName") or d.get("hardpointName", "")
                    item_ref = d.get("itemRef") or d.get("itemReference", "")
                    if not port_name or not item_ref: continue
                    pid = resolve_item_id(conn, parent_ref)
                    if pid and link_default_item(conn, pid, port_name, item_ref): linked += 1
                    else:
                        missed += 1
                        if len(missed_samples) < 5: missed_samples.append(f"{parent_ref}/{port_name} -> {item_ref}")
            for parsed in all_items:
                for d in parsed.get("default_items", []):
                    pid = resolve_item_id(conn, parsed["item"]["reference"])
                    port_name = d.get("portName") or d.get("hardpointName", "")
                    item_ref = d.get("itemRef") or d.get("itemReference", "")
                    if pid and port_name and item_ref and link_default_item(conn, pid, port_name, item_ref): linked += 1
        console.print(f"[green]  -> {linked} hardpoints linked[/]")

        if not no_shops:
            with conn.begin():
                ingest_shops_from_index(conn, idx)

        with conn.begin():
            conn.execute(text("""
                INSERT INTO game_versions (id, version, source, "itemCount", "processedAt")
                VALUES (:id, :v, 'scunpacked-data/v3', :c, :now)
                ON CONFLICT (version) DO UPDATE SET "itemCount"=:c, "processedAt"=:now
            """), {"id": str(uuid.uuid4()), "v": game_version,
                   "c": len(all_items) + len(ships), "now": datetime.utcnow()})

    console.print(f"\n[bold green]✅ Pipeline v3 complete — {game_version}[/]\n")


if __name__ == "__main__":
    main()
