"""
SC Labs — weapon_salvage importer
Lee archivos individuales items/{salvage_head_*,salvage_modifier_*,*tractorbeam*,...}.json
y genera INSERTs para la tabla weapon_salvage.

Unifica 3 tipos de Item.type en la misma tabla (la BD discrimina por sub_type + modifier_kind):
  - SalvageHead     → sub_type=Head,     modifier_kind=NULL
  - TractorBeam     → sub_type=Head,     modifier_kind=NULL
  - SalvageModifier → sub_type=Modifier, modifier_kind=Scraper|Tractor

PK: (id, game_version)
"""

import json
import os
import re
from pathlib import Path

NIL_UUID = "00000000-0000-0000-0000-000000000000"
FILE_PREFIX = re.compile(
    r"^(salvage_head_|salvage_modifier_|wep_tractorbeam_|wep_towingbeam_|grin_tractorbeam_|grin_tractor_)",
    re.IGNORECASE,
)
ALLOWED_TYPES = {"SalvageHead", "SalvageModifier", "TractorBeam"}


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


def _taxonomy(item_type, class_name):
    """Resuelve sub_type y modifier_kind según el tipo del item."""
    if item_type == "SalvageModifier":
        cls_lower = (class_name or "").lower()
        kind = "Scraper" if "scraper" in cls_lower else ("Tractor" if "tractor" in cls_lower else None)
        return "Modifier", kind
    # SalvageHead y TractorBeam → Head
    return "Head", None


def generate_weapon_salvage_inserts(items_dir, version_name):
    """
    items_dir: ruta al directorio items/ de scunpacked (str o Path).
    Escanea prefijos relevantes y retorna lista de strings INSERT para weapon_salvage.
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
        if not item or item.get("type") not in ALLOWED_TYPES:
            continue
        std = item.get("stdItem")
        if not _is_canonical(std):
            continue

        cls_name = _clean(std.get("ClassName"))
        sub_type, modifier_kind = _taxonomy(item.get("type"), cls_name)

        smod = std.get("SalvageModifier") or {}
        inv  = std.get("InventoryOccupancy") or {}
        dims = inv.get("Dimensions") or {}
        vol  = inv.get("Volume") or {}

        data = {
            "id":                       std["UUID"],
            "game_version":             version_name,
            "class_name":               cls_name,
            "item_name":                _clean(item.get("itemName")),
            "name":                     _clean(std.get("Name")),
            "description":              _clean(std.get("DescriptionText")) or _clean(std.get("Description")),
            "manufacturer_id":          _manuf_id(std.get("Manufacturer")),
            "sub_type":                 sub_type,
            "modifier_kind":            modifier_kind,
            "size":                     std.get("Size"),
            "grade":                    std.get("Grade"),
            "salvage_speed_multiplier": smod.get("SalvageSpeedMultiplier"),
            "radius_multiplier":        smod.get("RadiusMultiplier"),
            "extraction_efficiency":    smod.get("ExtractionEfficiency"),
            "mass":                     std.get("Mass"),
            "width":                    dims.get("Width"),
            "height":                   dims.get("Height"),
            "length":                   dims.get("Length"),
            "scu":                      vol.get("SCU"),
            "raw_data":                 std,
        }

        cols = ", ".join(f'"{k}"' for k in data)
        vals = ", ".join(_sql_val(v) for v in data.values())
        sql.append(f"INSERT INTO weapon_salvage ({cols}) VALUES ({vals}) ON CONFLICT (id, game_version) DO NOTHING;")

    return sql
