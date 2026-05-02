"""
SC Labs — jump_drives importer
Lee archivos individuales items/jdrv_*.json y genera INSERTs para la tabla jump_drives.
Estructura: { Raw, Item: { type: 'JumpDrive', stdItem: { JumpDrive: {...} } } }
PK: (uuid, game_version)
"""

import json
import os
import re
from pathlib import Path

NIL_UUID = "00000000-0000-0000-0000-000000000000"
FILE_PREFIX = re.compile(r"^jdrv_", re.IGNORECASE)


def _sql_val(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, (dict, list)):
        return "'" + json.dumps(v, ensure_ascii=False).replace("'", "''") + "'"
    if isinstance(v, str):
        return "'" + v.replace("'", "''") + "'"
    return str(v)


def _clean(v):
    if v is None:
        return None
    s = str(v).strip()
    return None if (not s or s == "<= PLACEHOLDER =>") else s


def _manuf_id(m):
    if not m:
        return None
    uid = m.get("UUID") if isinstance(m, dict) else None
    return None if (not uid or uid == NIL_UUID) else uid


def _is_canonical(std):
    if not std:
        return False
    uid = std.get("UUID")
    if not uid or uid == NIL_UUID:
        return False
    name = (std.get("Name") or "").strip()
    if not name or name == "<= PLACEHOLDER =>":
        return False
    cls = (std.get("ClassName") or "").strip()
    if not cls or re.match(r"^test_", cls, re.IGNORECASE):
        return False
    if re.search(r"_Template$", cls, re.IGNORECASE):
        return False
    return True


def generate_jump_drives_inserts(items_dir, version_name):
    """
    items_dir: ruta al directorio items/ de scunpacked (str o Path).
    Escanea jdrv_*.json y retorna lista de strings INSERT para jump_drives.
    """
    items_dir = Path(items_dir)
    sql = []

    for fname in sorted(os.listdir(items_dir)):
        if not FILE_PREFIX.match(fname) or not fname.endswith(".json"):
            continue
        try:
            with open(items_dir / fname, encoding="utf-8") as f:
                d = json.load(f)
        except Exception:
            continue

        item = d.get("Item") or d.get("item")
        if not item or item.get("type") != "JumpDrive":
            continue
        std = item.get("stdItem")
        if not _is_canonical(std):
            continue

        jd   = std.get("JumpDrive") or {}
        dist = std.get("Distortion") or {}
        dur  = std.get("Durability") or {}
        inv  = std.get("InventoryOccupancy") or {}
        dims = inv.get("Dimensions") or {}
        vol  = inv.get("Volume") or {}

        data = {
            "uuid":                           std["UUID"],
            "game_version":                   version_name,
            "name":                           _clean(std.get("Name")),
            "description":                    _clean(std.get("DescriptionText")) or _clean(std.get("Description")),
            "class_name":                     _clean(std.get("ClassName")),
            "manufacturer_id":                _manuf_id(std.get("Manufacturer")),
            "size":                           std.get("Size"),
            "grade":                          std.get("Grade"),
            "alignment_rate":                 jd.get("AlignmentRate"),
            "alignment_decay_rate":           jd.get("AlignmentDecayRate"),
            "tuning_rate":                    jd.get("TuningRate"),
            "tuning_decay_rate":              jd.get("TuningDecayRate"),
            "fuel_usage_efficiency_multiplier": jd.get("FuelUsageEfficiencyMultiplier"),
            "distortion_max":                 dist.get("Maximum"),
            "distortion_decay_rate":          dist.get("DecayRate"),
            "distortion_decay_delay":         dist.get("DecayDelay"),
            "distortion_warning_ratio":       dist.get("WarningRatio"),
            "distortion_recovery_ratio":      dist.get("RecoveryRatio"),
            "distortion_shutdown_time":       dist.get("ShutdownTime"),
            "health":                         dur.get("Health"),
            "mass":                           std.get("Mass"),
            "width":                          dims.get("Width"),
            "height":                         dims.get("Height"),
            "length":                         dims.get("Length"),
            "scu":                            vol.get("SCU"),
            "raw_data":                       std,
        }

        cols = ", ".join(f'"{k}"' for k in data)
        vals = ", ".join(_sql_val(v) for v in data.values())
        sql.append(f"INSERT INTO jump_drives ({cols}) VALUES ({vals}) ON CONFLICT (uuid, game_version) DO NOTHING;")

    return sql
