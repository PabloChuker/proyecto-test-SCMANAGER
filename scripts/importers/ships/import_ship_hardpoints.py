"""
SC Labs — ship_hardpoints importer
Reads ships.json and generates INSERT statements for the ship_hardpoints table.
FK: ship_id (ships.id) + game_version
Cada entrada del array Loadout de un ship genera una fila.
"""

import json
import uuid

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


def generate_ship_hardpoints_inserts(json_data, version_name):
    """
    json_data: lista de ships de ships.json
    Retorna lista de strings INSERT para ship_hardpoints.
    """
    sql = []

    for ship in json_data:
        uid = ship.get("UUID")
        cn  = ship.get("ClassName")
        if not uid or uid == NIL_UUID:
            continue

        for idx, hp in enumerate(ship.get("Loadout") or []):
            hp_name = hp.get("HardpointName")
            if not hp_name:
                continue

            item_types_list = hp.get("ItemTypes") or []
            if not item_types_list:
                item_types_str = None
            elif isinstance(item_types_list[0], str):
                item_types_str = ", ".join(item_types_list)
            else:
                item_types_str = json.dumps(item_types_list, ensure_ascii=False)

            stock_uuid = hp.get("UUID")
            if stock_uuid == NIL_UUID:
                stock_uuid = None

            sub_loadout = hp.get("Loadout") or None

            hp_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{uid}/{hp_name}"))

            data = {
                "id":                        hp_id,
                "ship_reference":            cn,
                "hardpoint_name":            hp_name,
                "hardpoint_type":            hp.get("Type"),
                "max_size":                  hp.get("MaxSize"),
                "min_size":                  hp.get("MinSize"),
                "editable":                  hp.get("Editable") or False,
                "item_types":                item_types_str,
                "default_item_class":        hp.get("ClassName"),
                "default_item_uuid":         stock_uuid,
                "default_item_name":         hp.get("Name"),
                "default_item_type":         hp.get("Type"),
                "default_item_manufacturer": hp.get("ManufacturerName"),
                "default_item_grade":        hp.get("Grade"),
                "loadout_json":              hp,
                "ship_id":                   uid,
                "parent_hp_id":              None,
                "stock_item_id":             stock_uuid,
                "stock_loadout":             sub_loadout,
                "position_index":            idx,
                "notes":                     None,
                "game_version":              version_name,
            }

            cols = ", ".join(f'"{k}"' for k in data)
            vals = ", ".join(_sql_val(v) for v in data.values())
            sql.append(f"INSERT INTO ship_hardpoints ({cols}) VALUES ({vals}) ON CONFLICT (id, game_version) DO NOTHING;")

    return sql
