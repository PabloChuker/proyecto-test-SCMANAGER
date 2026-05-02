"""
SC Labs — ship_flight_stats importer
Reads ships.json and generates INSERT statements for the ship_flight_stats table.
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


def generate_ship_flight_stats_inserts(json_data, version_name):
    """
    json_data: lista de ships de ships.json
    Retorna lista de strings INSERT para ship_flight_stats.
    Solo genera filas para naves que tengan FlightCharacteristics.
    """
    sql = []

    for ship in json_data:
        uid = ship.get("UUID")
        if not uid or uid == NIL_UUID:
            continue

        fc = ship.get("FlightCharacteristics")
        if not fc:
            continue

        speeds  = fc.get("Speeds") or {}
        ang     = fc.get("AngularRates") or {}
        ang_b   = fc.get("AngularRatesBoosted") or {}
        accel   = fc.get("Acceleration") or {}
        raw     = accel.get("Raw") or {}
        rawg    = accel.get("RawG") or {}
        bm      = accel.get("BoostMultipliers") or {}
        ab      = fc.get("Afterburner") or {}
        timing  = fc.get("Timing") or {}

        data = {
            "id":                   uid,
            "ship_id":              uid,
            "scm_speed":            speeds.get("Scm"),
            "max_speed":            speeds.get("Max"),
            "boost_speed_forward":  speeds.get("BoostForward"),
            "boost_speed_backward": speeds.get("BoostBackward"),
            "pitch":                ang.get("Pitch"),
            "yaw":                  ang.get("Yaw"),
            "roll":                 ang.get("Roll"),
            "pitch_boosted":        ang_b.get("Pitch"),
            "yaw_boosted":          ang_b.get("Yaw"),
            "roll_boosted":         ang_b.get("Roll"),
            "accel_forward":        raw.get("Forward"),
            "accel_backward":       raw.get("Backward"),
            "accel_up":             raw.get("Up"),
            "accel_down":           raw.get("Down"),
            "accel_strafe":         raw.get("Strafe"),
            "accel_forward_g":      rawg.get("Forward"),
            "accel_backward_g":     rawg.get("Backward"),
            "accel_up_g":           rawg.get("Up"),
            "accel_down_g":         rawg.get("Down"),
            "accel_strafe_g":       rawg.get("Strafe"),
            "boost_mult_forward":   bm.get("Forward"),
            "boost_mult_backward":  bm.get("Backward"),
            "boost_mult_up":        bm.get("Up"),
            "boost_mult_strafe":    bm.get("Strafe"),
            "boost_capacitor_max":  ab.get("CapacitorMax"),
            "boost_regen_per_sec":  ab.get("CapacitorRegenPerSec"),
            "boost_regen_time":     ab.get("RegenTime"),
            "zero_to_scm":          timing.get("ZeroToScm"),
            "zero_to_max":          timing.get("ZeroToMax"),
            "scm_to_zero":          timing.get("ScmToZero"),
            "mass_empty":           ship.get("Mass"),
            "mass_loadout":         ship.get("MassLoadout"),
            "mass_total":           ship.get("MassTotal"),
            "game_version":         version_name,
        }

        cols = ", ".join(f'"{k}"' for k in data)
        vals = ", ".join(_sql_val(v) for v in data.values())
        sql.append(f"INSERT INTO ship_flight_stats ({cols}) VALUES ({vals}) ON CONFLICT (id, game_version) DO NOTHING;")

    return sql
