"""
SC Labs — ship_pools importer
Reads ships.json and generates INSERT statements for the ship_pools table.
FK: ship_id (ships.id) + game_version
Cada entrada de PowerPools de un ship genera una fila (un pool por tipo de ítem).
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


def generate_ship_pools_inserts(json_data, version_name):
    """
    json_data: lista de ships de ships.json
    Retorna lista de strings INSERT para ship_pools.
    """
    sql = []

    for ship in json_data:
        uid = ship.get("UUID")
        if not uid or uid == NIL_UUID:
            continue

        pools = ship.get("PowerPools") or {}
        for pool_key, pool_val in pools.items():
            if not isinstance(pool_val, dict):
                continue

            data = {
                "ship_id":      uid,
                "item_type":    pool_val.get("ItemType") or pool_key,
                "max_size":     pool_val.get("Size"),
                "min_size":     None,
                "game_version": version_name,
            }

            cols = ", ".join(f'"{k}"' for k in data)
            vals = ", ".join(_sql_val(v) for v in data.values())
            sql.append(f"INSERT INTO ship_pools ({cols}) VALUES ({vals}) ON CONFLICT (ship_id, item_type, game_version) DO NOTHING;")

    return sql
