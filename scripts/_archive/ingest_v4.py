#!/usr/bin/env python3
"""
=============================================================================
SC LABS — Datamining Pipeline v4.0 (Star Citizen 4.7.1-live)

⚠ STATUS: SCAFFOLDING ONLY (2026-04-19) — no corre todavía contra prod.
   Diseñado para ingestar el patch 4.7.1-live que agregó:
     - Hull B (RSI cargo hauler de mediana escala)
     - Vehículo terrestre nuevo (TBD: confirmar nombre exacto en parche)
     - Cambios en signatures de minería (citizen-starter-guide refresca)
     - Tweaks balísticos en weapon_guns (varios DPS/RoF cambiaron)

Major changes vs ingest_v3.py:
  - Soporta el nuevo campo "thermalProfile" (más granular post-4.7) en
    weapon_guns para alinear con el cálculo de sustained DPS de Erkul.
  - Filtra explícitamente "Vehicle" + "Ground" como hardpoints separados
    para no contaminar el catálogo de naves.
  - Idempotencia total: cada `INSERT` lleva `ON CONFLICT DO UPDATE` para
    poder re-correr el script sin duplicar datos ni romper FKs existentes.
  - Versiona la ingesta en `dataset_versions` (nueva tabla, ver TODO abajo)
    para rastrear qué patch trajo qué fila.

Pipeline phases (heredado de v3, no cambia):
  Phase 0: Load index files (ships.json, items.json, ship-items.json,
           manufacturers.json, labels.json) en memoria.
  Phase A: Insert/Update items + type-specific stats (items/*.json).
  Phase B: Insert/Update ships + hardpoints (ships/*.json).
  Phase C: Link default loadouts (equippedItemId).
  Phase D: Insert real shops & inventory (ship-items.json index).
  Phase E: Register game version en `dataset_versions`.

Source: https://github.com/StarCitizenWiki/scunpacked-data
Tool:   https://github.com/octfx/ScDataDumper

Usage:
  python ingest_v4.py --version 4.7.1-live --dry-run
  python ingest_v4.py --version 4.7.1-live
  python ingest_v4.py --version 4.7.1-live --only ships
  python ingest_v4.py --version 4.7.1-live --only weapons --skip-vehicles

⚠ TODOs antes de correrlo en prod:
  1. Crear migración 051_create_dataset_versions.sql con la tabla
     `dataset_versions(version TEXT PRIMARY KEY, patch_date DATE,
      items_total INT, ships_total INT, ingested_at TIMESTAMPTZ)`.
  2. Decidir si Hull B ya está en scunpacked-data tag 4.7.1 (puede que
     siga en 4.7.0 si Roberts Space Industries tardó en pushear el dump).
  3. Añadir mapping específico para el ground vehicle nuevo en TYPE_MAP.
  4. Validar que el campo `thermalProfile` existe en items/*.json — si no,
     el populate de los thermal_fields (migración 046) tiene que seguir
     viniendo del CSV manual.
=============================================================================
"""

import os
import sys
import json
import uuid
import argparse
import subprocess
from pathlib import Path
from datetime import datetime
from typing import Optional

# ----- Imports opcionales (no fallar si falta alguno en dev) -----
try:
    import click
except ImportError:
    click = None  # se usa argparse abajo si no está click

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

try:
    from rich.console import Console
    from rich.table import Table
    console = Console()
    USE_RICH = True
except ImportError:
    console = None
    USE_RICH = False

try:
    from sqlalchemy import create_engine, text
    HAS_SQL = True
except ImportError:
    HAS_SQL = False

try:
    import orjson
    def load_json(path: Path):
        with open(path, "rb") as f:
            return orjson.loads(f.read())
except ImportError:
    def load_json(path: Path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)


# =============================================================================
# CONSTANTS
# =============================================================================

REPO_URL_DEFAULT = "https://github.com/StarCitizenWiki/scunpacked-data"
GAME_VERSION_DEFAULT = "4.7.1-live"

# ScDataDumper type → our ItemType enum (heredado v3, ampliado 4.7.1)
TYPE_MAP = {
    "Ship": "SHIP",
    "Vehicle": "VEHICLE",
    "Ground": "VEHICLE",
    "WeaponGun": "WEAPON",
    "WeaponMining": "MINING_LASER",
    "MissileLauncher": "WEAPON",
    "Missile": "MISSILE",
    "Torpedo": "TORPEDO",
    "Shield": "SHIELD",
    "Armor": "ARMOR",
    "PowerPlant": "POWER_PLANT",
    "Cooler": "COOLER",
    "QuantumDrive": "QUANTUM_DRIVE",
    "QuantumInterdictionGenerator": "QED",
    "Radar": "RADAR",
    "Avionics": "AVIONICS",
    "MainThruster": "THRUSTER",
    "ManneuveringThruster": "THRUSTER",
    "FuelTank": "FUEL_TANK",
    "FuelIntake": "FUEL_INTAKE",
    "Turret": "TURRET",
    "TurretBase": "TURRET",
    "CountermeasureLauncher": "COUNTERMEASURE",
    "MiningLaser": "MINING_LASER",
    "TractorBeam": "TRACTOR_BEAM",
    "SalvageModifier": "SALVAGE_HEAD",
    "EMP": "EMP",
    "Bomb": "BOMB",
    "BombLauncher": "WEAPON",
    "Ping": "RADAR",
    "SelfDestruct": "OTHER",
    "WeaponDefensive": "COUNTERMEASURE",
    # 4.7.1 nuevos (placeholder — confirmar nombres reales en items/*.json)
    "GroundVehicle": "VEHICLE",
    "HullCargoModule": "OTHER",
}


# =============================================================================
# PHASE STUBS
# =============================================================================

def phase_0_load_indexes(local_path: Path) -> dict:
    """
    Carga los index files de scunpacked-data en memoria.
    Returns dict con 'ships', 'ship_items', 'items', 'manufacturers', 'labels'.

    TODO: copiar implementación de ingest_v3.py phase_0 — sin cambios para 4.7.1.
    """
    print("[v4] phase_0_load_indexes — STUB")
    return {}


def phase_a_items(indexes: dict, conn, dry_run: bool) -> int:
    """
    Phase A: Insert/Update items + type-specific stats.
    En 4.7.1 hay que prestar atención a thermalProfile y al nuevo campo
    energyDamage (separado de damage físico) en weapon_guns.

    TODO:
      - Reusar la lógica de ingest_v3 phase_a.
      - Añadir UPDATE explícito de thermal_per_shot, thermal_dissipation
        cuando el item es WeaponGun y trae thermalProfile.
      - Manejar correctamente el nuevo SubItem type 'HullCargoModule'.
    """
    print("[v4] phase_a_items — STUB")
    return 0


def phase_b_ships(indexes: dict, conn, dry_run: bool) -> int:
    """
    Phase B: Insert/Update ships + hardpoints.
    4.7.1 trae:
      - Hull B (RSI cargo): hardpoint layout extenso, validar size matches
      - Ground vehicle nuevo: tiene que ir a tabla `vehicles` (NO ships)

    TODO:
      - Verificar tabla `vehicles` existe (puede ser que falte migración).
      - Si scunpacked-data 4.7.1 todavía no contiene Hull B, log warning
        pero no abortar.
    """
    print("[v4] phase_b_ships — STUB")
    return 0


def phase_c_loadouts(indexes: dict, conn, dry_run: bool) -> int:
    """
    Phase C: Link default loadouts (equippedItemId per hardpoint).
    Sin cambios respecto a v3.
    """
    print("[v4] phase_c_loadouts — STUB")
    return 0


def phase_d_shops(indexes: dict, conn, dry_run: bool) -> int:
    """
    Phase D: Insert real shops & inventory (ship-items.json index).
    Confirmar que los nuevos terminals 4.7.1 (ej. Pyro outposts agregados
    en este patch) se agreguen sin colisión de PK.
    """
    print("[v4] phase_d_shops — STUB")
    return 0


def phase_e_register_version(version: str, indexes: dict, conn, dry_run: bool) -> None:
    """
    Phase E: Registrar la versión en `dataset_versions`.
    TODO: requiere migración 051 (ver header).
    """
    print(f"[v4] phase_e_register_version — STUB (version={version})")


# =============================================================================
# CLI ENTRYPOINT
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="SC Labs ingest v4 — Star Citizen 4.7.1-live (scaffolding)",
    )
    parser.add_argument("--version", default=GAME_VERSION_DEFAULT,
                        help=f"Game version a ingerir (default: {GAME_VERSION_DEFAULT})")
    parser.add_argument("--local-path", type=Path,
                        default=Path("./data/scunpacked-data"),
                        help="Ruta local al checkout de scunpacked-data")
    parser.add_argument("--dry-run", action="store_true",
                        help="No escribir a la BD, solo loguear lo que se haría")
    parser.add_argument("--only", choices=["items", "ships", "loadouts", "shops"],
                        default=None, help="Correr solo una phase específica")
    parser.add_argument("--skip-vehicles", action="store_true",
                        help="Saltarse vehículos terrestres (útil para test)")
    args = parser.parse_args()

    print(f"[v4] SC LABS — ingest v4.0 — game version {args.version}")
    print(f"[v4] local_path = {args.local_path}")
    print(f"[v4] dry_run = {args.dry_run}, only = {args.only}, "
          f"skip_vehicles = {args.skip_vehicles}")

    if not args.local_path.exists():
        print(f"[v4] ⚠ local_path no existe: {args.local_path}")
        print(f"[v4]    Cloná scunpacked-data primero: git clone {REPO_URL_DEFAULT}")
        sys.exit(1)

    # Conexión a BD (placeholder — usar DATABASE_URL de .env)
    conn = None
    if not args.dry_run and HAS_SQL:
        db_url = os.getenv("DATABASE_URL")
        if not db_url:
            print("[v4] ⚠ DATABASE_URL no seteado en env — abortando")
            sys.exit(1)
        engine = create_engine(db_url)
        conn = engine.connect()
        print(f"[v4] conectado a {db_url.split('@')[-1]}")

    # Pipeline
    indexes = phase_0_load_indexes(args.local_path)

    counts = {}
    if args.only is None or args.only == "items":
        counts["items"] = phase_a_items(indexes, conn, args.dry_run)
    if args.only is None or args.only == "ships":
        counts["ships"] = phase_b_ships(indexes, conn, args.dry_run)
    if args.only is None or args.only == "loadouts":
        counts["loadouts"] = phase_c_loadouts(indexes, conn, args.dry_run)
    if args.only is None or args.only == "shops":
        counts["shops"] = phase_d_shops(indexes, conn, args.dry_run)

    phase_e_register_version(args.version, indexes, conn, args.dry_run)

    print("[v4] DONE — counts:")
    for k, v in counts.items():
        print(f"      {k}: {v}")

    if conn is not None:
        conn.close()


if __name__ == "__main__":
    main()
