"""
SC Labs — Ships importer
Reads ships.json from scunpacked and generates SQL INSERT statements for the ships table.
id comes directly from ships.json UUID field (same UUID used in satellite tables for ship_id FK).
"""

import json

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


def _safe_str(v):
    return str(v) if v is not None else None


def _manuf_id(m):
    if not m:
        return None
    uid = m.get("UUID") if isinstance(m, dict) else None
    return None if (not uid or uid == NIL_UUID) else uid


def generate_ship_inserts(json_data, version_name):
    """
    Returns a list of SQL INSERT statements for the ships table.
    id is taken from the UUID field in ships.json so that satellite tables
    can reference it correctly via ship_id FK.
    """
    if not isinstance(json_data, list):
        print("Error: se esperaba lista de ships.")
        return []

    sql_commands = []
    skipped = 0

    for ship in json_data:
        cn  = ship.get("ClassName")
        uid = ship.get("UUID")
        if not cn or not uid or uid == NIL_UUID:
            skipped += 1
            continue

        manuf  = ship.get("Manufacturer") or {}
        shield = ship.get("ShieldController") or {}
        armor  = ship.get("Armor") or {}
        defl   = armor.get("Deflection") or {}

        data = {
            "id":                         uid,
            "class_name":                 cn,
            "name":                       _safe_str(ship.get("Name")),
            "role":                       _safe_str(ship.get("Role")),
            "career":                     _safe_str(ship.get("Career")),
            "size":                       ship.get("Size"),
            "cargo_capacity":             ship.get("Cargo"),
            "stowage_scu":                ship.get("Stowage"),
            "manufacturer_id":            _manuf_id(manuf),
            "description":                _safe_str(ship.get("DescriptionText") or ship.get("Description")),
            "length_m":                   ship.get("Length"),
            "width_m":                    ship.get("Width"),
            "height_m":                   ship.get("Height"),
            "mass_empty_kg":              ship.get("Mass"),
            "mass_loadout_kg":            ship.get("MassLoadout"),
            "mass_total_kg":              ship.get("MassTotal"),
            "crew":                       ship.get("Crew"),
            "is_spaceship":               ship.get("IsSpaceship"),
            "is_gravlev":                 ship.get("IsGravlev"),
            "is_vehicle":                 ship.get("IsVehicle"),
            "deflection_physical":        defl.get("Physical"),
            "deflection_energy":          defl.get("Energy"),
            "deflection_distortion":      defl.get("Distortion"),
            "shield_face_type":           _safe_str(shield.get("FaceType")),
            "shield_reconfig_cooldown":   shield.get("ReconfigurationCooldown"),
            "shield_max_reallocation":    shield.get("MaxReallocation"),
            "shield_max_elec_charge_dmg": shield.get("MaxElectricalChargeDamageRate"),
            "game_version":               version_name,
        }

        cols = ", ".join(f'"{k}"' for k in data)
        vals = ", ".join(_sql_val(v) for v in data.values())
        sql_commands.append(f"INSERT INTO ships ({cols}) VALUES ({vals}) ON CONFLICT (id, game_version) DO NOTHING;")

    if skipped:
        print(f"  Skipped {skipped} ships (no ClassName or nil UUID).")

    return sql_commands
