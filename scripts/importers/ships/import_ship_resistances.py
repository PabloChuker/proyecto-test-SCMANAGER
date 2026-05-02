"""
SC Labs — ship_resistances importer
Reads ships.json and generates INSERT statements for the ship_resistances table.
FK: ship_id (ships.id) + game_version
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


def generate_ship_resistances_inserts(json_data, version_name):
    """
    json_data: lista de ships de ships.json
    Retorna lista de strings INSERT para ship_resistances.
    """
    sql = []

    for ship in json_data:
        uid = ship.get("UUID")
        if not uid or uid == NIL_UUID:
            continue

        armor  = ship.get("Armor") or {}
        dmg_m  = armor.get("DamageMultipliers") or {}
        sig_m  = armor.get("SignalMultipliers") or {}
        pen_r  = armor.get("PenetrationResistance") or {}
        emiss  = ship.get("Emission") or {}
        cs     = ship.get("CrossSection") or {}

        data = {
            "id":                       uid,
            "ship_id":                  uid,
            "armor_hp":                 armor.get("Health"),
            "dmg_mult_physical":        dmg_m.get("Physical"),
            "dmg_mult_energy":          dmg_m.get("Energy"),
            "dmg_mult_distortion":      dmg_m.get("Distortion"),
            "dmg_mult_thermal":         dmg_m.get("Thermal"),
            "dmg_mult_biochemical":     dmg_m.get("Biochemical"),
            "dmg_mult_stun":            dmg_m.get("Stun"),
            "sig_mult_cross_section":   sig_m.get("CrossSection"),
            "sig_mult_infrared":        sig_m.get("Infrared"),
            "sig_mult_electromagnetic": sig_m.get("Electromagnetic"),
            "pen_resist_base":          pen_r.get("Base"),
            "pen_resist_physical":      pen_r.get("Physical"),
            "pen_resist_energy":        pen_r.get("Energy"),
            "pen_resist_distortion":    pen_r.get("Distortion"),
            "base_em_signature":        None,
            "base_ir_signature":        None,
            "base_cs_signature":        None,
            "cross_section_x":          cs.get("X"),
            "cross_section_y":          cs.get("Y"),
            "cross_section_z":          cs.get("Z"),
            "em_total_shields":         emiss.get("EmShields"),
            "em_total_quantum":         emiss.get("EmQuantum"),
            "ir_total_shields":         emiss.get("IrShields"),
            "ir_total_quantum":         emiss.get("IrQuantum"),
            "game_version":             version_name,
        }

        cols = ", ".join(f'"{k}"' for k in data)
        vals = ", ".join(_sql_val(v) for v in data.values())
        sql.append(f"INSERT INTO ship_resistances ({cols}) VALUES ({vals}) ON CONFLICT (id, game_version) DO NOTHING;")

    return sql
