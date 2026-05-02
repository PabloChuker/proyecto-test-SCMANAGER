"""
SC Labs — ship_fuel importer
Reads ships.json and generates INSERT statements for the ship_fuel table.
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


def generate_ship_fuel_inserts(json_data, version_name):
    """
    json_data: lista de ships de ships.json
    Retorna lista de strings INSERT para ship_fuel.
    """
    sql = []

    for ship in json_data:
        uid = ship.get("UUID")
        if not uid or uid == NIL_UUID:
            continue

        prop       = ship.get("Propulsion") or {}
        fuel_usage = prop.get("FuelUsage") or {}
        qt         = ship.get("QuantumTravel") or {}
        pwr        = ship.get("Power") or {}

        data = {
            "id":                         uid,
            "ship_id":                    uid,
            "hydrogen_capacity":          prop.get("FuelCapacity"),
            "fuel_intake_rate":           prop.get("FuelIntakeRate"),
            "fuel_usage_main":            fuel_usage.get("Main"),
            "fuel_usage_retro":           fuel_usage.get("Retro"),
            "fuel_usage_maneuvering":     fuel_usage.get("Maneuvering"),
            "maneuvering_time_till_empty": prop.get("ManeuveringTimeTillEmpty"),
            "intake_to_main_ratio":       prop.get("IntakeToMainFuelRatio"),
            "quantum_capacity":           qt.get("FuelCapacity"),
            "quantum_spool_time":         qt.get("SpoolTime"),
            "quantum_travel_time_po":     qt.get("PortOlisarToArcCorpTime"),
            "quantum_fuel_usage_po":      qt.get("PortOlisarToArcCorpFuel"),
            "power_used_quantum":         pwr.get("UsedSegmentsQuantum"),
            "game_version":               version_name,
        }

        cols = ", ".join(f'"{k}"' for k in data)
        vals = ", ".join(_sql_val(v) for v in data.values())
        sql.append(f"INSERT INTO ship_fuel ({cols}) VALUES ({vals}) ON CONFLICT (id, game_version) DO NOTHING;")

    return sql
