"""
SC Labs — cargo_grids importer (ship-sourced)
Reads ships.json and generates INSERT statements for the cargo_grids table.
FK: ship_id (ships.id) + game_version
Cada entrada de CargoGrids de un ship genera una fila.
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


def generate_cargo_grids_inserts(json_data, version_name):
    """
    json_data: lista de ships de ships.json
    Retorna lista de strings INSERT para cargo_grids.
    """
    sql = []

    for ship in json_data:
        uid = ship.get("UUID")
        if not uid or uid == NIL_UUID:
            continue

        for idx, cg in enumerate(ship.get("CargoGrids") or []):
            grid_uuid = cg.get("UUID")
            if not grid_uuid or grid_uuid == NIL_UUID:
                continue

            x   = cg.get("X") or 0
            y   = cg.get("Y") or 0
            z   = cg.get("Z") or 0
            scu = cg.get("SCU") or 0

            data = {
                "id":             grid_uuid,
                "class_name":     cg.get("Class") or "",
                "name":           cg.get("Class") or "",
                "scu_capacity":   scu,
                "dimensions":     {"x": x, "y": y, "z": z},
                "mass":           None,
                "volume_scu":     scu,
                "instance_count": 1,
                "display_order":  idx,
                "ship_id":        uid,
                "game_version":   version_name,
            }

            cols = ", ".join(f'"{k}"' for k in data)
            vals = ", ".join(_sql_val(v) for v in data.values())
            sql.append(f"INSERT INTO cargo_grids ({cols}) VALUES ({vals}) ON CONFLICT (id, game_version) DO NOTHING;")

    return sql
