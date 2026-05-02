"""
SC Labs — bombs importer
Lee archivos individuales items/bomb_*.json y genera INSERTs para la tabla bombs.
Estructura: { Raw, Item: { type: 'Bomb', stdItem: { Bomb: {...} } } }
PK: (id, game_version)
"""

import json
import os
import re
from pathlib import Path

NIL_UUID = "00000000-0000-0000-0000-000000000000"
FILE_PREFIX = re.compile(r"^bomb_", re.IGNORECASE)


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


def generate_bombs_inserts(items_dir, version_name):
    """
    items_dir: ruta al directorio items/ de scunpacked (str o Path).
    Escanea bomb_*.json y retorna lista de strings INSERT para bombs.
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
        if not item or item.get("type") != "Bomb":
            continue
        std = item.get("stdItem")
        if not _is_canonical(std):
            continue

        b    = std.get("Bomb") or {}
        dmg  = b.get("Damage") or {}
        erad = b.get("ExplosionRadius") or {}
        dur  = std.get("Durability") or {}
        inv  = std.get("InventoryOccupancy") or {}
        dims = inv.get("Dimensions") or {}

        data = {
            "id":                    std["UUID"],
            "class_name":            _clean(std.get("ClassName")),
            "name":                  _clean(std.get("Name")),
            "description":           _clean(std.get("DescriptionText")) or _clean(std.get("Description")),
            "manufacturer_id":       _manuf_id(std.get("Manufacturer")),
            "size":                  std.get("Size"),
            "grade":                 std.get("Grade"),
            "sub_type":              _clean(item.get("subType")),
            "damage_total":          b.get("DamageTotal"),
            "damage_physical":       dmg.get("Physical"),
            "damage_energy":         dmg.get("Energy"),
            "damage_distortion":     dmg.get("Distortion"),
            "damage_thermal":        dmg.get("Thermal"),
            "damage_biochemical":    dmg.get("Biochemical"),
            "damage_stun":           dmg.get("Stun"),
            "explosion_radius_min":  erad.get("Minimum"),
            "explosion_radius_max":  erad.get("Maximum"),
            "arm_time":              b.get("ArmTime"),
            "max_lifetime":          b.get("MaxLifetime"),
            "is_cluster":            bool(b.get("IsCluster")) if b else None,
            "requires_launcher":     bool(b.get("RequiresLauncher")) if b else None,
            "durability_health":     dur.get("Health"),
            "mass":                  std.get("Mass"),
            "width":                 dims.get("Width"),
            "height":                dims.get("Height"),
            "length":                dims.get("Length"),
            "raw_data":              std,
            "game_version":          version_name,
        }

        cols = ", ".join(f'"{k}"' for k in data)
        vals = ", ".join(_sql_val(v) for v in data.values())
        sql.append(f"INSERT INTO bombs ({cols}) VALUES ({vals}) ON CONFLICT (id, game_version) DO NOTHING;")

    return sql
