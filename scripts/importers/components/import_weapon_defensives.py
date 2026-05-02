"""
SC Labs — weapon_defensives importer
Lee ship-items.json y genera INSERTs para la tabla weapon_defensives.
Fuente: items con type == 'WeaponDefensive'.
PK: (id, game_version)
"""

import json
import re

NIL_UUID = "00000000-0000-0000-0000-000000000000"


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


def generate_weapon_defensives_inserts(items_data, version_name):
    """
    items_data: lista de items de ship-items.json
    Retorna lista de strings INSERT para weapon_defensives.
    """
    sql = []

    for record in items_data:
        if record.get("type") != "WeaponDefensive":
            continue
        std = record.get("stdItem")
        if not _is_canonical(std):
            continue

        wd   = std.get("WeaponDefensive") or {}
        sig  = wd.get("Signatures") or {}
        ir   = sig.get("Infrared") or {}
        em_s = sig.get("Electromagnetic") or {}
        cs   = sig.get("CrossSection") or {}
        w    = std.get("Weapon") or {}
        inv  = std.get("InventoryOccupancy") or {}
        dims = inv.get("Dimensions") or {}

        # Spread del primer modo si existe
        modes = w.get("Modes") or []
        mode  = modes[0] if modes else {}
        spread = mode.get("Spread") or mode.get("SpreadParams") or {}

        data = {
            "id":              std["UUID"],
            "class_name":      _clean(std.get("ClassName")),
            "item_name":       _clean(record.get("itemName")),
            "name":            _clean(std.get("Name")),
            "description":     _clean(std.get("DescriptionText")) or _clean(std.get("Description")),
            "defensive_type":  _clean(wd.get("Type")),
            "size":            std.get("Size"),
            "grade":           std.get("Grade"),
            "mass":            std.get("Mass"),
            "width":           dims.get("Width"),
            "height":          dims.get("Height"),
            "length":          dims.get("Length"),
            "manufacturer_id": _manuf_id(std.get("Manufacturer")),
            "capacity":        wd.get("Capacity") if wd else w.get("Capacity"),
            "initial_capacity": wd.get("InitialCapacity"),
            "sig_ir_start":    ir.get("Start"),
            "sig_ir_end":      ir.get("End"),
            "sig_em_start":    em_s.get("Start"),
            "sig_em_end":      em_s.get("End"),
            "sig_cs_start":    cs.get("Start"),
            "sig_cs_end":      cs.get("End"),
            "effective_range": w.get("EffectiveRange"),
            "rate_of_fire":    w.get("RateOfFire"),
            "spread_min":      spread.get("Min") or spread.get("MinSpread"),
            "spread_max":      spread.get("Max") or spread.get("MaxSpread"),
            "game_version":    version_name,
        }

        cols = ", ".join(f'"{k}"' for k in data)
        vals = ", ".join(_sql_val(v) for v in data.values())
        sql.append(f"INSERT INTO weapon_defensives ({cols}) VALUES ({vals}) ON CONFLICT (id, game_version) DO NOTHING;")

    return sql
