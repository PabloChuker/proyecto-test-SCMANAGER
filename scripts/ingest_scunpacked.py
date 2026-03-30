#!/usr/bin/env python3
"""
=============================================================================
AL FILO — Datamining Pipeline v1.0
Script de ingestión de datos desde el repositorio scunpacked.

Flujo:
  1. Clona/actualiza el repo scunpacked (o lee JSONs locales)
  2. Parsea los archivos de naves y componentes
  3. Transforma a nuestro modelo de datos
  4. Inserta/actualiza en PostgreSQL via SQLAlchemy

Uso:
  python ingest_scunpacked.py --version 4.0.1
  python ingest_scunpacked.py --version 4.0.1 --local-path ./data/scunpacked
  python ingest_scunpacked.py --version 4.0.1 --dry-run   # Solo muestra, no inserta
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
from sqlalchemy import (
    create_engine, MetaData, Table as SATable, Column,
    String, Float, Integer, Boolean, DateTime, JSON, Enum,
    insert, text, inspect
)
from sqlalchemy.dialects.postgresql import insert as pg_insert

# Intentar usar orjson para parsing rápido, fallback a json estándar
try:
    import orjson
    def load_json(path: Path) -> dict:
        with open(path, "rb") as f:
            return orjson.loads(f.read())
except ImportError:
    def load_json(path: Path) -> dict:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

load_dotenv(Path(__file__).parent.parent / ".env")
console = Console()

# =============================================================================
# CONSTANTES Y MAPEO
# =============================================================================

# Mapeo de tipos de scunpacked a nuestro enum ItemType
SCUNPACKED_TYPE_MAP = {
    "Ship":           "SHIP",
    "Vehicle":        "VEHICLE",
    "WeaponGun":      "WEAPON",
    "WeaponMining":   "MINING_LASER",
    "MissileLauncher":"WEAPON",
    "Missile":        "MISSILE",
    "Shield":         "SHIELD",
    "PowerPlant":     "POWER_PLANT",
    "Cooler":         "COOLER",
    "QuantumDrive":   "QUANTUM_DRIVE",
    "Turret":         "TURRET",
    "TurretBase":     "TURRET",
    "Armor":          "ARMOR",
    "Radar":          "RADAR",
    "Avionics":       "AVIONICS",
    "FuelTank":       "FUEL_TANK",
    "FuelIntake":     "FUEL_INTAKE",
    "CountermeasureLauncher": "COUNTERMEASURE",
    "MainThruster":   "THRUSTER",
    "ManneuveringThruster": "THRUSTER",
}

# Mapeo de categorías de hardpoint
HARDPOINT_CATEGORY_MAP = {
    "WeaponGun":        "WEAPON",
    "WeaponMining":     "MINING",
    "MissileLauncher":  "MISSILE_RACK",
    "Turret":           "TURRET",
    "TurretBase":       "TURRET",
    "Shield":           "SHIELD",
    "PowerPlant":       "POWER_PLANT",
    "Cooler":           "COOLER",
    "QuantumDrive":     "QUANTUM_DRIVE",
    "MainThruster":     "THRUSTER_MAIN",
    "ManneuveringThruster": "THRUSTER_MANEUVERING",
    "Radar":            "RADAR",
    "Avionics":         "AVIONICS",
    "Armor":            "ARMOR",
    "FuelTank":         "FUEL_TANK",
    "FuelIntake":       "FUEL_INTAKE",
    "CountermeasureLauncher": "COUNTERMEASURE",
}


# =============================================================================
# PASO 1: Clonar o actualizar el repositorio scunpacked
# =============================================================================

def sync_scunpacked_repo(local_path: Path, repo_url: str) -> bool:
    """Clona o hace pull del repositorio scunpacked."""
    if local_path.exists() and (local_path / ".git").exists():
        console.print("[cyan]→ Actualizando repositorio scunpacked...[/]")
        result = subprocess.run(
            ["git", "pull", "--ff-only"],
            cwd=local_path, capture_output=True, text=True
        )
        if result.returncode != 0:
            console.print(f"[yellow]⚠ Git pull falló: {result.stderr}[/]")
            return False
        console.print(f"[green]✓ Repo actualizado: {result.stdout.strip()}[/]")
    else:
        console.print(f"[cyan]→ Clonando scunpacked en {local_path}...[/]")
        # Clone con depth=1 para ahorrar espacio (no necesitamos historial)
        result = subprocess.run(
            ["git", "clone", "--depth=1", repo_url, str(local_path)],
            capture_output=True, text=True
        )
        if result.returncode != 0:
            console.print(f"[red]✗ Clone falló: {result.stderr}[/]")
            return False
        console.print("[green]✓ Repo clonado exitosamente[/]")
    return True


# =============================================================================
# PASO 2: Descubrir y leer los archivos JSON
# =============================================================================

def find_data_files(base_path: Path) -> dict:
    """
    Busca los directorios de datos dentro del repo scunpacked.
    La estructura típica es:
      scunpacked/
        ships/          → JSONs de naves con hardpoints y defaults
        items/          → JSONs de componentes individuales
        weapons/        → JSONs de armas (a veces dentro de items/)
    """
    locations = {}

    # scunpacked tiene varias estructuras posibles según la versión
    # Buscamos las carpetas más comunes
    for candidate_dir in ["ships", "api/ships"]:
        ship_dir = base_path / candidate_dir
        if ship_dir.exists():
            locations["ships"] = ship_dir
            break

    # Items/componentes pueden estar en varias ubicaciones
    for candidate_dir in ["items", "api/items"]:
        item_dir = base_path / candidate_dir
        if item_dir.exists():
            locations["items"] = item_dir
            break

    # Listar lo que encontramos
    if not locations:
        console.print("[red]✗ No se encontraron directorios de datos.[/]")
        console.print(f"  Estructura encontrada en {base_path}:")
        for p in sorted(base_path.iterdir()):
            if p.is_dir() and not p.name.startswith("."):
                console.print(f"    📁 {p.name}/")
    else:
        for key, path in locations.items():
            json_count = len(list(path.glob("*.json")))
            console.print(f"[green]✓ {key}: {path} ({json_count} archivos JSON)[/]")

    return locations


# =============================================================================
# PASO 3: Parsear datos de naves
# =============================================================================

def parse_ship(raw: dict, game_version: str) -> dict:
    """
    Transforma un JSON de nave de scunpacked a nuestro modelo.
    Retorna un dict con las claves: item, ship, hardpoints, default_items
    """
    # Extraer referencia única (CIG usa varios campos según la versión)
    reference = (
        raw.get("ClassName", "") or
        raw.get("className", "") or
        raw.get("reference", str(uuid.uuid4()))
    )

    # --- Item base ---
    item = {
        "reference":     reference,
        "name":          raw.get("Name", raw.get("name", reference)),
        "localizedName": raw.get("LocalizedName") or raw.get("displayName"),
        "className":     raw.get("ClassName") or raw.get("className"),
        "type":          "SHIP" if raw.get("Type") != "Vehicle" else "VEHICLE",
        "subType":       raw.get("SubType") or raw.get("subType"),
        "size":          safe_int(raw.get("Size") or raw.get("size")),
        "manufacturer":  extract_manufacturer(raw),
        "mass":          safe_float(raw.get("Mass")),
        "gameVersion":   game_version,
        "rawData":       raw,  # Guardamos el JSON completo para auditoría
    }

    # --- Datos extendidos de nave ---
    flight = raw.get("FlightCharacteristics", raw.get("flight", {})) or {}
    ifcs = raw.get("Ifcs", {}) or {}
    dimensions = raw.get("Dimensions", {}) or {}

    ship = {
        "maxCrew":          safe_int(raw.get("Crew") or raw.get("crew")),
        "cargo":            safe_float(raw.get("Cargo") or raw.get("cargo")),
        "maxSpeed":         safe_float(
            flight.get("MaxSpeed") or
            flight.get("ScmSpeed") or
            ifcs.get("MaxSpeed")
        ),
        "afterburnerSpeed": safe_float(
            flight.get("AfterburnerSpeed") or
            ifcs.get("AfterburnerSpeed")
        ),
        "pitchRate":        safe_float(ifcs.get("Pitch", {}).get("Rate") if isinstance(ifcs.get("Pitch"), dict) else None),
        "yawRate":          safe_float(ifcs.get("Yaw", {}).get("Rate") if isinstance(ifcs.get("Yaw"), dict) else None),
        "rollRate":         safe_float(ifcs.get("Roll", {}).get("Rate") if isinstance(ifcs.get("Roll"), dict) else None),
        "hydrogenFuelCap":  safe_float(raw.get("HydrogenFuelCapacity")),
        "quantumFuelCap":   safe_float(raw.get("QuantumFuelCapacity")),
        "isSpaceship":      raw.get("Type") != "Vehicle",
        "isGravlev":        raw.get("IsGravlev", False),
        "lengthMeters":     safe_float(dimensions.get("Length") or raw.get("Length")),
        "beamMeters":       safe_float(dimensions.get("Width") or raw.get("Beam") or raw.get("Width")),
        "heightMeters":     safe_float(dimensions.get("Height") or raw.get("Height")),
        "role":             raw.get("Role") or raw.get("role"),
        "focus":            raw.get("Focus") or raw.get("focus") or raw.get("Description"),
        "career":           raw.get("Career") or raw.get("career"),
    }

    # --- Hardpoints y default loadout ---
    hardpoints = []
    default_items = []  # Items que vienen equipados de fábrica

    raw_hardpoints = (
        raw.get("Hardpoints", []) or
        raw.get("hardpoints", []) or
        raw.get("Components", []) or
        raw.get("Loadout", []) or
        []
    )

    for hp in raw_hardpoints:
        if not isinstance(hp, dict):
            continue

        hp_name = hp.get("Name") or hp.get("name") or hp.get("HardpointName", "unknown")
        hp_type = hp.get("Type") or hp.get("type") or hp.get("ItemType", "OTHER")
        category = HARDPOINT_CATEGORY_MAP.get(hp_type, "OTHER")

        hardpoint = {
            "hardpointName": hp_name,
            "category":      category,
            "minSize":       safe_int(hp.get("MinSize") or hp.get("minSize"), 0),
            "maxSize":       safe_int(hp.get("MaxSize") or hp.get("maxSize") or hp.get("Size") or hp.get("size"), 0),
            "isFixed":       hp.get("Fixed", False),
            "isManned":      hp.get("Manned", False),
            "isInternal":    category not in ("WEAPON", "MISSILE_RACK", "TURRET"),
        }

        # Item equipado por defecto
        equipped_ref = (
            hp.get("DefaultItem") or
            hp.get("defaultItem") or
            hp.get("Equipped") or
            hp.get("equipped") or
            hp.get("ItemClassName") or
            hp.get("ClassName")
        )
        if equipped_ref:
            default_items.append({
                "hardpointName": hp_name,
                "itemReference":  equipped_ref,
            })

        hardpoints.append(hardpoint)

    return {
        "item":          item,
        "ship":          ship,
        "hardpoints":    hardpoints,
        "default_items": default_items,
    }


# =============================================================================
# PASO 4: Parsear componentes individuales
# =============================================================================

def parse_component(raw: dict, game_version: str) -> dict:
    """
    Transforma un JSON de componente de scunpacked a nuestro modelo.
    Retorna un dict con: item, stats
    """
    # Soporte para formato "Raw" de los JSONs locales del repo
    # scunpacked tiene los datos reales en Entity.Components
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
            # Buscar en el árbol de componentes si hay algún AttachDef
            for c_val in components.values():
                if isinstance(c_val, dict) and "AttachDef" in c_val:
                    attach_def = c_val["AttachDef"]
                    break

        loc = attach_def.get("Localization", {}).get("English", {})
        
        # Aplanar para compatibilidad
        raw = {
            "reference":     entity.get("__ref"),
            "className":     entity.get("__path", "").split("/")[-1].replace(".xml", ""),
            "name":          loc.get("Name") or entity.get("__ref", "Unknown"),
            "localizedName": loc.get("Name"),
            "type":          attach_def.get("Type"),
            "subType":       attach_def.get("SubType"),
            "size":          attach_def.get("Size"),
            "grade":         attach_def.get("Grade"),
            "manufacturer":  attach_def.get("Manufacturer", {}).get("Code"),
            # Reinyectar el raw para que extract_component_stats funcione
            "Raw":           raw["Raw"] 
        }

    raw_type = raw.get("Type") or raw.get("type") or raw.get("ItemType", "OTHER")
    item_type = SCUNPACKED_TYPE_MAP.get(raw_type, "OTHER")

    reference = (
        raw.get("ClassName", "") or
        raw.get("className", "") or
        raw.get("reference", str(uuid.uuid4()))
    )

    item = {
        "reference":     reference,
        "name":          raw.get("Name", raw.get("name", reference)),
        "localizedName": raw.get("LocalizedName") or raw.get("displayName"),
        "className":     raw.get("ClassName") or raw.get("className"),
        "type":          item_type,
        "subType":       raw.get("SubType") or raw.get("subType"),
        "size":          safe_int(raw.get("Size") or raw.get("size")),
        "grade":         raw.get("Grade") or raw.get("grade"),
        "manufacturer":  extract_manufacturer(raw),
        "mass":          safe_float(raw.get("Mass")),
        "hitPoints":     safe_float(raw.get("HitPoints") or raw.get("Health")),
        "gameVersion":   game_version,
        "rawData":       raw,
    }

    # --- Stats específicas según tipo ---
    stats = extract_component_stats(raw, item_type)

    return {"item": item, "stats": stats}


def extract_component_stats(raw: dict, item_type: str) -> dict:
    """Extrae las estadísticas relevantes según el tipo de componente."""
    stats = {}

    # Consumo universal (la mayoría de componentes lo tiene)
    power = raw.get("Power", raw.get("power", {})) or {}
    heat = raw.get("Heat", raw.get("heat", {})) or {}
    stats["powerDraw"]     = safe_float(power.get("PowerDraw") or power.get("draw"))
    stats["thermalOutput"] = safe_float(heat.get("ThermalOutput") or heat.get("output") or heat.get("Mass"))
    stats["emSignature"]   = safe_float(raw.get("EmSignature") or raw.get("Emissions", {}).get("EM"))
    stats["irSignature"]   = safe_float(raw.get("IrSignature") or raw.get("Emissions", {}).get("IR"))

    if item_type == "WEAPON":
        weapon = raw.get("Weapon", raw.get("weapon", {})) or {}
        damage = weapon.get("Damage", weapon.get("damage", {})) or {}
        stats["alphaDamage"] = safe_float(
            damage.get("Total") or damage.get("total") or
            sum(safe_float(v) for v in damage.values() if isinstance(v, (int, float)))
        )
        stats["fireRate"]    = safe_float(weapon.get("FireRate") or weapon.get("rateOfFire"))
        stats["range"]       = safe_float(weapon.get("Range") or weapon.get("range"))
        stats["speed"]       = safe_float(weapon.get("Speed") or weapon.get("speed"))
        stats["ammoCount"]   = safe_int(weapon.get("AmmoCount") or weapon.get("ammo"))
        stats["damageType"]  = weapon.get("DamageType") or weapon.get("damageType")

        # Calcular DPS
        if stats["alphaDamage"] and stats["fireRate"] and stats["fireRate"] > 0:
            stats["dps"] = round(stats["alphaDamage"] * (stats["fireRate"] / 60.0), 2)

    elif item_type == "SHIELD":
        shield = raw.get("Shield", raw.get("shield", {})) or {}
        stats["shieldHp"]        = safe_float(shield.get("MaxShieldHealth") or shield.get("hp"))
        stats["shieldRegen"]     = safe_float(shield.get("MaxShieldRegen") or shield.get("regen"))
        stats["shieldDownDelay"] = safe_float(shield.get("DownedRegenDelay") or shield.get("downDelay"))

    elif item_type == "POWER_PLANT":
        pp = raw.get("PowerPlant", raw.get("powerPlant", {})) or {}
        stats["powerOutput"] = safe_float(pp.get("MaxPowerOutput") or pp.get("output"))

    elif item_type == "COOLER":
        cooler = raw.get("Cooler", raw.get("cooler", {})) or {}
        stats["coolingRate"] = safe_float(cooler.get("CoolingRate") or cooler.get("rate"))

    elif item_type == "QUANTUM_DRIVE":
        qd = raw.get("QuantumDrive", raw.get("quantumDrive", {})) or {}
        stats["quantumSpeed"]    = safe_float(qd.get("MaxSpeed") or qd.get("speed"))
        stats["quantumRange"]    = safe_float(qd.get("MaxRange") or qd.get("range"))
        stats["quantumCooldown"] = safe_float(qd.get("Cooldown") or qd.get("cooldown"))
        stats["quantumSpoolUp"]  = safe_float(qd.get("SpoolUpTime") or qd.get("spoolUp"))

    return stats


# =============================================================================
# PASO 5: Insertar en PostgreSQL
# =============================================================================

def insert_to_database(
    ships: list[dict],
    components: list[dict],
    game_version: str,
    db_url: str,
    dry_run: bool = False
):
    """
    Inserta todos los datos parseados en PostgreSQL.
    Usa UPSERT (INSERT ON CONFLICT UPDATE) para ser idempotente.

    El proceso tiene DOS FASES:
      Fase A: Insertar todos los items (naves + componentes) y hardpoints.
      Fase B: Vincular los default items a sus hardpoints.

    La Fase B va después porque un default item podría ser un componente
    que aún no existía en la DB cuando se insertó el hardpoint.
    """
    engine = create_engine(db_url)

    if dry_run:
        console.print("\n[yellow]🔍 DRY RUN — No se escribirá en la base de datos[/]")
        show_summary(ships, components)

        # Mostrar también qué default items se vincularían
        total_defaults = sum(len(s["default_items"]) for s in ships)
        console.print(f"\n[cyan]→ Default items a vincular: {total_defaults}[/]")
        for s in ships[:3]:
            name = s["item"]["name"]
            defaults = s["default_items"]
            if defaults:
                console.print(f"  🚀 {name}:")
                for d in defaults[:5]:
                    console.print(f"     └ {d['hardpointName']} ← {d['itemReference']}")
                if len(defaults) > 5:
                    console.print(f"     └ ... y {len(defaults) - 5} más")
        return

    with engine.begin() as conn:
        # ══════════════════════════════════════════════════════════════════
        # FASE A: Insertar todos los items, ships, hardpoints y stats
        # ══════════════════════════════════════════════════════════════════

        console.print("\n[cyan]→ Fase A: Insertando items y hardpoints...[/]")

        count = 0
        for ship_data in ships:
            item_id = upsert_item(conn, ship_data["item"])
            upsert_ship(conn, item_id, ship_data["ship"])

            for hp in ship_data["hardpoints"]:
                upsert_hardpoint(conn, item_id, hp)
            
            count += 1
            if count % 50 == 0:
                console.print(f"  .. {count} naves procesadas")

        count = 0
        for comp_data in components:
            item_id = upsert_item(conn, comp_data["item"])
            if any(v is not None for v in comp_data["stats"].values()):
                upsert_component_stats(conn, item_id, comp_data["stats"])
            
            count += 1
            if count % 500 == 0:
                console.print(f"  .. {count} componentes procesados")

        console.print(f"[green]  ✓ {len(ships)} naves + {len(components)} componentes insertados[/]")

        # ══════════════════════════════════════════════════════════════════
        # FASE B: Vincular default items a hardpoints
        # ══════════════════════════════════════════════════════════════════

        console.print("[cyan]→ Fase B: Vinculando default loadouts...[/]")

        linked = 0
        not_found = 0
        for ship_data in ships:
            ship_item_id = resolve_item_id(conn, ship_data["item"]["reference"])
            if not ship_item_id:
                continue

            for default in ship_data["default_items"]:
                success = link_default_item(
                    conn,
                    parent_item_id=ship_item_id,
                    hardpoint_name=default["hardpointName"],
                    item_reference=default["itemReference"],
                )
                if success:
                    linked += 1
                else:
                    not_found += 1

        console.print(f"[green]  ✓ {linked} hardpoints vinculados con su default item[/]")
        if not_found > 0:
            console.print(f"[yellow]  ⚠ {not_found} default items no encontrados en la DB (componentes no ingestados)[/]")

        # ══════════════════════════════════════════════════════════════════
        # Registrar versión procesada
        # ══════════════════════════════════════════════════════════════════

        conn.execute(text("""
            INSERT INTO game_versions (id, version, source, "itemCount", "processedAt")
            VALUES (:id, :version, :source, :count, :now)
            ON CONFLICT (version) DO UPDATE SET
                "itemCount" = :count,
                "processedAt" = :now
        """), {
            "id": str(uuid.uuid4()),
            "version": game_version,
            "source": "scunpacked",
            "count": len(ships) + len(components),
            "now": datetime.utcnow(),
        })

    console.print(f"\n[green]✓ Base de datos actualizada con versión {game_version}[/]")
    show_summary(ships, components)


def upsert_item(conn, item_data: dict) -> str:
    """Inserta o actualiza un item. Retorna el ID."""
    item_id = str(uuid.uuid4())

    # Serializar rawData a JSON string para PostgreSQL
    raw_data = item_data.get("rawData")
    if raw_data is not None:
        raw_data = json.dumps(raw_data, default=str)

    conn.execute(text("""
        INSERT INTO items (id, reference, name, "localizedName", "className", type,
                          "subType", size, grade, manufacturer, mass, "hitPoints",
                          "gameVersion", "rawData", "createdAt", "updatedAt")
        VALUES (:id, :reference, :name, :localizedName, :className, :type,
                :subType, :size, :grade, :manufacturer, :mass, :hitPoints,
                :gameVersion, :rawData, NOW(), NOW())
        ON CONFLICT (reference) DO UPDATE SET
            name = EXCLUDED.name,
            "localizedName" = EXCLUDED."localizedName",
            "className" = EXCLUDED."className",
            type = EXCLUDED.type,
            "subType" = EXCLUDED."subType",
            size = EXCLUDED.size,
            grade = EXCLUDED.grade,
            manufacturer = EXCLUDED.manufacturer,
            mass = EXCLUDED.mass,
            "hitPoints" = EXCLUDED."hitPoints",
            "gameVersion" = EXCLUDED."gameVersion",
            "rawData" = EXCLUDED."rawData",
            "updatedAt" = NOW()
        RETURNING id
    """), {
        "id": item_id,
        "reference": item_data["reference"],
        "name": item_data["name"],
        "localizedName": item_data.get("localizedName"),
        "className": item_data.get("className"),
        "type": item_data["type"],
        "subType": item_data.get("subType"),
        "size": item_data.get("size"),
        "grade": item_data.get("grade"),
        "manufacturer": item_data.get("manufacturer"),
        "mass": item_data.get("mass"),
        "hitPoints": item_data.get("hitPoints"),
        "gameVersion": item_data["gameVersion"],
        "rawData": raw_data,
    })

    # Obtener el ID real (puede ser el existente si hubo conflict)
    result = conn.execute(text(
        "SELECT id FROM items WHERE reference = :ref"
    ), {"ref": item_data["reference"]})
    row = result.fetchone()
    return row[0] if row else item_id


def upsert_ship(conn, item_id: str, ship_data: dict):
    """Inserta o actualiza datos extendidos de nave."""
    conn.execute(text("""
        INSERT INTO ships (id, "itemId", "maxCrew", cargo, "maxSpeed",
                          "afterburnerSpeed", "pitchRate", "yawRate", "rollRate",
                          "hydrogenFuelCap", "quantumFuelCap", "isSpaceship",
                          "isGravlev", "lengthMeters", "beamMeters", "heightMeters",
                          role, focus, career)
        VALUES (:id, :itemId, :maxCrew, :cargo, :maxSpeed,
                :afterburnerSpeed, :pitchRate, :yawRate, :rollRate,
                :hydrogenFuelCap, :quantumFuelCap, :isSpaceship,
                :isGravlev, :lengthMeters, :beamMeters, :heightMeters,
                :role, :focus, :career)
        ON CONFLICT ("itemId") DO UPDATE SET
            "maxCrew" = EXCLUDED."maxCrew",
            cargo = EXCLUDED.cargo,
            "maxSpeed" = EXCLUDED."maxSpeed",
            "afterburnerSpeed" = EXCLUDED."afterburnerSpeed",
            "pitchRate" = EXCLUDED."pitchRate",
            "yawRate" = EXCLUDED."yawRate",
            "rollRate" = EXCLUDED."rollRate",
            "hydrogenFuelCap" = EXCLUDED."hydrogenFuelCap",
            "quantumFuelCap" = EXCLUDED."quantumFuelCap",
            "isSpaceship" = EXCLUDED."isSpaceship",
            "isGravlev" = EXCLUDED."isGravlev",
            "lengthMeters" = EXCLUDED."lengthMeters",
            "beamMeters" = EXCLUDED."beamMeters",
            "heightMeters" = EXCLUDED."heightMeters",
            role = EXCLUDED.role,
            focus = EXCLUDED.focus,
            career = EXCLUDED.career
    """), {"id": str(uuid.uuid4()), "itemId": item_id, **ship_data})


def upsert_hardpoint(conn, parent_item_id: str, hp_data: dict):
    """
    Inserta o actualiza un hardpoint.
    Usa un constraint natural (parentItemId + hardpointName) para UPSERT.
    """
    conn.execute(text("""
        INSERT INTO hardpoints (id, "parentItemId", "hardpointName", category,
                               "minSize", "maxSize", "isFixed", "isManned", "isInternal")
        VALUES (:id, :parentItemId, :hardpointName, :category,
                :minSize, :maxSize, :isFixed, :isManned, :isInternal)
        ON CONFLICT ("parentItemId", "hardpointName")
        DO UPDATE SET
            category = EXCLUDED.category,
            "minSize" = EXCLUDED."minSize",
            "maxSize" = EXCLUDED."maxSize",
            "isFixed" = EXCLUDED."isFixed",
            "isManned" = EXCLUDED."isManned",
            "isInternal" = EXCLUDED."isInternal"
    """), {
        "id": str(uuid.uuid4()),
        "parentItemId": parent_item_id,
        **hp_data
    })


def upsert_component_stats(conn, item_id: str, stats: dict):
    """Inserta o actualiza stats de componente."""
    # Filtrar solo valores no-None
    filtered = {k: v for k, v in stats.items() if v is not None}
    if not filtered:
        return

    conn.execute(text("""
        INSERT INTO component_stats (id, "itemId", dps, "alphaDamage", "fireRate",
            range, speed, "ammoCount", "damageType", "shieldHp", "shieldRegen",
            "shieldDownDelay", "powerOutput", "coolingRate", "quantumSpeed",
            "quantumRange", "quantumCooldown", "quantumSpoolUp", "powerDraw",
            "thermalOutput", "emSignature", "irSignature")
        VALUES (:id, :itemId, :dps, :alphaDamage, :fireRate,
            :range, :speed, :ammoCount, :damageType, :shieldHp, :shieldRegen,
            :shieldDownDelay, :powerOutput, :coolingRate, :quantumSpeed,
            :quantumRange, :quantumCooldown, :quantumSpoolUp, :powerDraw,
            :thermalOutput, :emSignature, :irSignature)
        ON CONFLICT ("itemId") DO UPDATE SET
            dps = COALESCE(EXCLUDED.dps, component_stats.dps),
            "alphaDamage" = COALESCE(EXCLUDED."alphaDamage", component_stats."alphaDamage"),
            "fireRate" = COALESCE(EXCLUDED."fireRate", component_stats."fireRate"),
            range = COALESCE(EXCLUDED.range, component_stats.range),
            speed = COALESCE(EXCLUDED.speed, component_stats.speed),
            "ammoCount" = COALESCE(EXCLUDED."ammoCount", component_stats."ammoCount"),
            "damageType" = COALESCE(EXCLUDED."damageType", component_stats."damageType"),
            "shieldHp" = COALESCE(EXCLUDED."shieldHp", component_stats."shieldHp"),
            "shieldRegen" = COALESCE(EXCLUDED."shieldRegen", component_stats."shieldRegen"),
            "shieldDownDelay" = COALESCE(EXCLUDED."shieldDownDelay", component_stats."shieldDownDelay"),
            "powerOutput" = COALESCE(EXCLUDED."powerOutput", component_stats."powerOutput"),
            "coolingRate" = COALESCE(EXCLUDED."coolingRate", component_stats."coolingRate"),
            "quantumSpeed" = COALESCE(EXCLUDED."quantumSpeed", component_stats."quantumSpeed"),
            "quantumRange" = COALESCE(EXCLUDED."quantumRange", component_stats."quantumRange"),
            "quantumCooldown" = COALESCE(EXCLUDED."quantumCooldown", component_stats."quantumCooldown"),
            "quantumSpoolUp" = COALESCE(EXCLUDED."quantumSpoolUp", component_stats."quantumSpoolUp"),
            "powerDraw" = COALESCE(EXCLUDED."powerDraw", component_stats."powerDraw"),
            "thermalOutput" = COALESCE(EXCLUDED."thermalOutput", component_stats."thermalOutput"),
            "emSignature" = COALESCE(EXCLUDED."emSignature", component_stats."emSignature"),
            "irSignature" = COALESCE(EXCLUDED."irSignature", component_stats."irSignature")
    """), {
        "id": str(uuid.uuid4()),
        "itemId": item_id,
        "dps": stats.get("dps"),
        "alphaDamage": stats.get("alphaDamage"),
        "fireRate": stats.get("fireRate"),
        "range": stats.get("range"),
        "speed": stats.get("speed"),
        "ammoCount": stats.get("ammoCount"),
        "damageType": stats.get("damageType"),
        "shieldHp": stats.get("shieldHp"),
        "shieldRegen": stats.get("shieldRegen"),
        "shieldDownDelay": stats.get("shieldDownDelay"),
        "powerOutput": stats.get("powerOutput"),
        "coolingRate": stats.get("coolingRate"),
        "quantumSpeed": stats.get("quantumSpeed"),
        "quantumRange": stats.get("quantumRange"),
        "quantumCooldown": stats.get("quantumCooldown"),
        "quantumSpoolUp": stats.get("quantumSpoolUp"),
        "powerDraw": stats.get("powerDraw"),
        "thermalOutput": stats.get("thermalOutput"),
        "emSignature": stats.get("emSignature"),
        "irSignature": stats.get("irSignature"),
    })


def resolve_item_id(conn, item_ref: str) -> Optional[str]:
    """
    Resuelve una referencia de item a su UUID interno en la tabla items.

    scunpacked usa indistintamente ClassName, Reference o Name para
    identificar los default items de un hardpoint. Esta función busca
    en los tres campos para maximizar la probabilidad de match.

    Orden de búsqueda:
      1. reference (exacto) — el UUID de CIG
      2. className (exacto) — el nombre de clase interno
      3. className (case-insensitive) — por si hay diferencias de casing
      4. name (case-insensitive) — último recurso
    """
    if not item_ref:
        return None

    # Intento 1: Buscar por reference (match exacto, más confiable)
    result = conn.execute(text(
        'SELECT id FROM items WHERE reference = :ref LIMIT 1'
    ), {"ref": item_ref})
    row = result.fetchone()
    if row:
        return row[0]

    # Intento 2: Buscar por className (match exacto)
    result = conn.execute(text(
        'SELECT id FROM items WHERE "className" = :ref LIMIT 1'
    ), {"ref": item_ref})
    row = result.fetchone()
    if row:
        return row[0]

    # Intento 3: className case-insensitive
    result = conn.execute(text(
        'SELECT id FROM items WHERE LOWER("className") = LOWER(:ref) LIMIT 1'
    ), {"ref": item_ref})
    row = result.fetchone()
    if row:
        return row[0]

    # Intento 4: name case-insensitive (último recurso)
    result = conn.execute(text(
        'SELECT id FROM items WHERE LOWER(name) = LOWER(:ref) LIMIT 1'
    ), {"ref": item_ref})
    row = result.fetchone()
    if row:
        return row[0]

    return None


def link_default_item(
    conn,
    parent_item_id: str,
    hardpoint_name: str,
    item_reference: str,
) -> bool:
    """
    Busca el item por su reference y actualiza el equippedItemId del hardpoint.

    Retorna True si se vinculó exitosamente, False si no se encontró el item
    o el hardpoint.
    """
    # Resolver el ID real del componente
    equipped_id = resolve_item_id(conn, item_reference)
    if not equipped_id:
        return False

    # Actualizar el hardpoint
    result = conn.execute(text("""
        UPDATE hardpoints
        SET "equippedItemId" = :equippedId
        WHERE "parentItemId" = :parentId
          AND "hardpointName" = :hpName
    """), {
        "equippedId": equipped_id,
        "parentId": parent_item_id,
        "hpName": hardpoint_name,
    })

    return result.rowcount > 0


# =============================================================================
# UTILIDADES
# =============================================================================

def safe_float(val, default=None) -> Optional[float]:
    """Convierte un valor a float de forma segura."""
    if val is None:
        return default
    try:
        result = float(val)
        return result if result == result else default  # NaN check
    except (ValueError, TypeError):
        return default


def safe_int(val, default=None) -> Optional[int]:
    """Convierte un valor a int de forma segura."""
    if val is None:
        return default
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return default


def extract_manufacturer(raw: dict) -> Optional[str]:
    """Extrae el fabricante de varias posibles ubicaciones en el JSON."""
    mfr = raw.get("Manufacturer") or raw.get("manufacturer")
    if isinstance(mfr, dict):
        return mfr.get("Name") or mfr.get("name") or mfr.get("Code")
    return mfr


def show_summary(ships: list, components: list):
    """Muestra un resumen en consola de lo procesado."""
    table = Table(title="📊 Resumen de Ingestión")
    table.add_column("Categoría", style="cyan")
    table.add_column("Cantidad", style="green", justify="right")

    table.add_row("Naves/Vehículos", str(len(ships)))
    table.add_row("Componentes", str(len(components)))

    total_hardpoints = sum(len(s["hardpoints"]) for s in ships)
    table.add_row("Hardpoints totales", str(total_hardpoints))

    # Contar por tipo de componente
    type_counts = {}
    for c in components:
        t = c["item"]["type"]
        type_counts[t] = type_counts.get(t, 0) + 1
    for t, count in sorted(type_counts.items()):
        table.add_row(f"  └ {t}", str(count))

    console.print(table)

    # Mostrar algunas naves de ejemplo
    if ships:
        console.print("\n[cyan]Ejemplo de naves parseadas:[/]")
        for s in ships[:5]:
            name = s["item"]["name"]
            hp_count = len(s["hardpoints"])
            mfr = s["item"].get("manufacturer", "???")
            console.print(f"  🚀 {name} ({mfr}) — {hp_count} hardpoints")


# =============================================================================
# CLI PRINCIPAL
# =============================================================================

@click.command()
@click.option("--version", "game_version", required=True, help="Versión del juego (ej: 4.0.1)")
@click.option("--local-path", type=click.Path(), default=None, help="Ruta local al repo scunpacked")
@click.option("--dry-run", is_flag=True, help="Solo parsear y mostrar, no escribir en DB")
@click.option("--skip-clone", is_flag=True, help="No intentar clonar/actualizar el repo")
def main(game_version: str, local_path: str, dry_run: bool, skip_clone: bool):
    """
    🔧 AL FILO — Pipeline de Datamining v1.0
    Ingesta datos de scunpacked a PostgreSQL.
    """
    console.print("\n[bold blue]═══════════════════════════════════════[/]")
    console.print("[bold blue]  AL FILO — Datamining Pipeline v1.0  [/]")
    console.print("[bold blue]═══════════════════════════════════════[/]\n")

    db_url = os.getenv("DATABASE_URL")
    if not db_url and not dry_run:
        console.print("[red]✗ DATABASE_URL no configurada en .env[/]")
        sys.exit(1)

    repo_url = os.getenv(
        "SCUNPACKED_REPO_URL",
        "https://github.com/StarCitizenWiki/scunpacked-data.git"
    )
    console.print(f"[yellow]Depuración: repo_url es {repo_url}[/]")

    # Determinar ruta local
    data_path = Path(local_path) if local_path else Path(
        os.getenv("SCUNPACKED_LOCAL_PATH", "./data/scunpacked")
    )

    # Paso 1: Sincronizar repo
    if not skip_clone:
        if not sync_scunpacked_repo(data_path, repo_url):
            console.print("[yellow]⚠ Continuando con datos locales existentes...[/]")

    if not data_path.exists():
        console.print(f"[red]✗ Directorio de datos no encontrado: {data_path}[/]")
        console.print("  Ejecutá primero sin --skip-clone o especificá --local-path")
        sys.exit(1)

    # Paso 2: Descubrir archivos
    console.print(f"\n[cyan]→ Buscando datos en: {data_path}[/]")
    locations = find_data_files(data_path)

    # Paso 3: Parsear naves
    ships = []
    if "ships" in locations:
        with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}")) as progress:
            task = progress.add_task("Parseando naves...", total=None)
            for json_file in sorted(locations["ships"].glob("*.json")):
                try:
                    raw = load_json(json_file)
                    # Algunos archivos son arrays, otros son objetos
                    if isinstance(raw, list):
                        for entry in raw:
                            ships.append(parse_ship(entry, game_version))
                    else:
                        ships.append(parse_ship(raw, game_version))
                except Exception as e:
                    console.print(f"[yellow]⚠ Error parseando {json_file.name}: {e}[/]")
            progress.remove_task(task)
        console.print(f"[green]✓ {len(ships)} naves parseadas[/]")

    # Paso 4: Parsear componentes
    components = []
    if "items" in locations:
        with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}")) as progress:
            task = progress.add_task("Parseando componentes...", total=None)
            for json_file in sorted(locations["items"].glob("**/*.json")):
                try:
                    raw = load_json(json_file)
                    if isinstance(raw, list):
                        for entry in raw:
                            components.append(parse_component(entry, game_version))
                    else:
                        components.append(parse_component(raw, game_version))
                except Exception as e:
                    console.print(f"[yellow]⚠ Error parseando {json_file.name}: {e}[/]")
            progress.remove_task(task)
        console.print(f"[green]✓ {len(components)} componentes parseados[/]")

    if not ships and not components:
        console.print("[red]✗ No se encontraron datos para procesar.[/]")
        console.print("  Verificá la estructura del directorio scunpacked.")
        sys.exit(1)

    # Paso 5: Insertar en base de datos
    insert_to_database(ships, components, game_version, db_url, dry_run)

    console.print("\n[bold green]✅ Pipeline completado exitosamente![/]\n")


if __name__ == "__main__":
    main()
