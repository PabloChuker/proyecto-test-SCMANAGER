"""
SC Labs — emps importer
Lee ship-items.json y genera INSERTs para la tabla emps.
Fuente: items con type == 'EMP'.
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


def generate_emps_inserts(items_data, version_name):
    """
    items_data: lista de items de ship-items.json
    Retorna lista de strings INSERT para emps.
    """
    sql = []

    for record in items_data:
        if record.get("type") != "EMP":
            continue
        std = record.get("stdItem")
        if not _is_canonical(std):
            continue

        emp = std.get("Emp") or {}

        data = {
            "id":                std["UUID"],
            "class_name":        _clean(std.get("ClassName")),
            "name":              _clean(std.get("Name")),
            "description":       _clean(std.get("DescriptionText")) or _clean(std.get("Description")),
            "manufacturer_id":   _manuf_id(std.get("Manufacturer")),
            "size":              std.get("Size"),
            "grade":             std.get("Grade"),
            "radius":            emp.get("EmpRadius"),
            "charge_time":       emp.get("ChargeTime"),
            "cooldown_time":     emp.get("CooldownTime"),
            "distortion_damage": emp.get("DistortionDamage"),
            "game_version":      version_name,
        }

        cols = ", ".join(f'"{k}"' for k in data)
        vals = ", ".join(_sql_val(v) for v in data.values())
        sql.append(f"INSERT INTO emps ({cols}) VALUES ({vals}) ON CONFLICT (id, game_version) DO NOTHING;")

    return sql
