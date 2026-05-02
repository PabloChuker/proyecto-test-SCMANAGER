"""
SC Labs — weapon_mining importer
Lee ship-items.json y genera INSERTs para la tabla weapon_mining.
Fuente: items con type == 'WeaponMining'.
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


def generate_weapon_mining_inserts(items_data, version_name):
    """
    items_data: lista de items de ship-items.json
    Retorna lista de strings INSERT para weapon_mining.
    """
    sql = []

    for record in items_data:
        if record.get("type") != "WeaponMining":
            continue
        std = record.get("stdItem")
        if not _is_canonical(std):
            continue

        dd   = std.get("DescriptionData") or {}
        ml   = std.get("MiningLaser") or {}
        mods = ml.get("Modifiers") or {}
        rn   = std.get("ResourceNetwork") or {}
        usg  = rn.get("Usage") or {}
        pwr  = usg.get("Power") or {}
        cool = usg.get("Coolant") or {}
        em   = std.get("Emission") or {}
        em_e = em.get("Em") or {}
        em_i = em.get("Ir") or {}
        dur  = std.get("Durability") or {}
        dist = std.get("Distortion") or {}
        inv  = std.get("InventoryOccupancy") or {}
        dims = inv.get("Dimensions") or {}
        vol  = inv.get("Volume") or {}

        data = {
            "id":                       std["UUID"],
            "class_name":               _clean(std.get("ClassName")),
            "item_name":                _clean(record.get("itemName")),
            "name":                     _clean(std.get("Name")),
            "description":              _clean(std.get("DescriptionText")) or _clean(std.get("Description")),
            "manufacturer_id":          _manuf_id(std.get("Manufacturer")),
            "size":                     std.get("Size"),
            "grade_number":             std.get("Grade"),
            "grade":                    _clean(dd.get("Grade")),
            "class":                    _clean(dd.get("Class")),
            "power_consumption_min":    pwr.get("Minimum"),
            "power_consumption_max":    pwr.get("Maximum"),
            "coolant_consumption_min":  cool.get("Minimum"),
            "coolant_consumption_max":  cool.get("Maximum"),
            "em_max":                   em_e.get("Maximum"),
            "ir_max":                   em_i.get("Maximum"),
            "mining_laser_power":       ml.get("PowerTransfer"),
            "optimal_range":            ml.get("OptimalRange"),
            "maximum_range":            ml.get("MaximumRange"),
            "extraction_throughput":    ml.get("ExtractionThroughput"),
            "mining_modifier":          None,
            "resistance_modifier":      mods.get("Resistance"),
            "instability_modifier":     mods.get("Instability"),
            "optimal_charge_window":    mods.get("OptimalChargeWindow"),
            "optimal_charge_rate":      mods.get("OptimalChargeRate"),
            "shatter_damage":           None,
            "health":                   dur.get("Health"),
            "distortion_shutdown_damage": dist.get("Maximum"),
            "distortion_shutdown_time": dist.get("ShutdownTime"),
            "mass":                     std.get("Mass"),
            "width":                    dims.get("Width"),
            "height":                   dims.get("Height"),
            "length":                   dims.get("Length"),
            "scu":                      vol.get("SCU"),
            "raw_data":                 std,
            "resistance":               mods.get("Resistance"),
            "instability":              mods.get("Instability"),
            "throttle_rate":            ml.get("ThrottleLerpSpeed"),
            "throttle_min":             ml.get("ThrottleMinimum"),
            "heat_output":              None,
            "module_slots":             None,
            "game_version":             version_name,
        }

        cols = ", ".join(f'"{k}"' for k in data)
        vals = ", ".join(_sql_val(v) for v in data.values())
        sql.append(f"INSERT INTO weapon_mining ({cols}) VALUES ({vals}) ON CONFLICT (id, game_version) DO NOTHING;")

    return sql
