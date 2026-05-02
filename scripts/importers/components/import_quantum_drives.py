"""
SC Labs — quantum_drives importer
Lee ship-items.json y genera INSERTs para la tabla quantum_drives.
Fuente: items con type == 'QuantumDrive'.
PK: (uuid, game_version)
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


def generate_quantum_drives_inserts(items_data, version_name):
    """
    items_data: lista de items de ship-items.json
    Retorna lista de strings INSERT para quantum_drives.
    """
    sql = []

    for record in items_data:
        if record.get("type") != "QuantumDrive":
            continue
        std = record.get("stdItem")
        if not _is_canonical(std):
            continue

        qd    = std.get("QuantumDrive") or {}
        sj    = qd.get("StandardJump") or {}
        rn    = std.get("ResourceNetwork") or {}
        usg   = rn.get("Usage") or {}
        pwr   = usg.get("Power") or {}
        cool  = usg.get("Coolant") or {}
        states = rn.get("States") or []
        online = next((s for s in states if isinstance(s, dict) and s.get("Name") == "Online"), states[0] if states else None)
        power_ranges = (online or {}).get("PowerRanges") if isinstance(online, dict) else None
        if not isinstance(power_ranges, list):
            power_ranges = None

        em   = std.get("Emission") or {}
        em_e = em.get("Em") or {}
        em_i = em.get("Ir") or {}
        dur  = std.get("Durability") or {}
        dist = std.get("Distortion") or {}
        inv  = std.get("InventoryOccupancy") or {}
        dims = inv.get("Dimensions") or {}
        vol  = inv.get("Volume") or {}

        data = {
            "uuid":                       std["UUID"],
            "name":                       _clean(std.get("Name")),
            "description":                _clean(std.get("DescriptionText")) or _clean(std.get("Description")),
            "class_name":                 _clean(std.get("ClassName")),
            "manufacturer_id":            _manuf_id(std.get("Manufacturer")),
            "size":                       std.get("Size"),
            "grade":                      std.get("Grade"),
            "drive_speed":                sj.get("DriveSpeed"),
            "cooldown_time":              sj.get("CooldownTime"),
            "spool_up_time":              sj.get("SpoolUpTime"),
            "fuel_rate":                  qd.get("QuantumFuelRequirement"),
            "mass":                       std.get("Mass"),
            "raw_data":                   std,
            "game_version":               version_name,
            "power_consumption_min":      pwr.get("Minimum"),
            "power_consumption_max":      pwr.get("Maximum"),
            "coolant_consumption_min":    cool.get("Minimum"),
            "coolant_consumption_max":    cool.get("Maximum"),
            "pips":                       len(power_ranges) if power_ranges else None,
            "power_ranges":               power_ranges,
            "em_max":                     em_e.get("Maximum"),
            "ir_max":                     em_i.get("Maximum"),
            "health":                     dur.get("Health"),
            "distortion_shutdown_damage": dist.get("Maximum"),
            "distortion_decay_delay":     dist.get("DecayDelay"),
            "distortion_decay_rate":      dist.get("DecayRate"),
            "distortion_shutdown_time":   dist.get("ShutdownTime"),
            "width":                      dims.get("Width"),
            "height":                     dims.get("Height"),
            "length":                     dims.get("Length"),
            "scu":                        vol.get("SCU"),
        }

        cols = ", ".join(f'"{k}"' for k in data)
        vals = ", ".join(_sql_val(v) for v in data.values())
        sql.append(f"INSERT INTO quantum_drives ({cols}) VALUES ({vals}) ON CONFLICT (uuid, game_version) DO NOTHING;")

    return sql
