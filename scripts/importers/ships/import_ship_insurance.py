"""
SC Labs — ship_insurance importer
Reads ships.json and generates INSERT statements for the ship_insurance table.
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


def generate_ship_insurance_inserts(json_data, version_name):
    """
    json_data: lista de ships de ships.json
    Retorna lista de strings INSERT para ship_insurance.
    Solo genera filas para naves que tengan datos de Insurance.
    """
    sql = []

    for ship in json_data:
        uid = ship.get("UUID")
        if not uid or uid == NIL_UUID:
            continue

        ins = ship.get("Insurance") or {}
        if not ins:
            continue

        data = {
            "id":                   uid,
            "ship_id":              uid,
            "expedited_cost":       ins.get("ExpeditedCost"),
            "expedited_claim_time": ins.get("ExpeditedClaimTime"),
            "standard_claim_time":  ins.get("StandardClaimTime"),
            "game_version":         version_name,
        }

        cols = ", ".join(f'"{k}"' for k in data)
        vals = ", ".join(_sql_val(v) for v in data.values())
        sql.append(f"INSERT INTO ship_insurance ({cols}) VALUES ({vals}) ON CONFLICT (id, game_version) DO NOTHING;")

    return sql
