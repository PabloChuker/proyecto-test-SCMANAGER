"""
SC Labs — ship_power_reference importer
Reads ships.json and generates INSERT statements for the ship_power_reference table.
FK: ship_id (ships.id) + game_version
Contiene datos de potencia, refrigeración, emisiones, escudos, combustible y QT por nave.
"""

import json
from datetime import datetime, timezone

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


def generate_ship_power_reference_inserts(json_data, version_name):
    """
    json_data: lista de ships de ships.json
    Retorna lista de strings INSERT para ship_power_reference.
    """
    sql = []

    for ship in json_data:
        uid = ship.get("UUID")
        if not uid or uid == NIL_UUID:
            continue

        pwr    = ship.get("Power") or {}
        cool   = ship.get("Cooling") or {}
        emiss  = ship.get("Emission") or {}
        st     = ship.get("ShieldsTotal") or {}
        dist   = ship.get("Distortion") or {}
        prop   = ship.get("Propulsion") or {}
        qt     = ship.get("QuantumTravel") or {}

        qt_range    = qt.get("Range")
        qt_range_km = qt_range / 1000 if qt_range is not None else None

        data = {
            "ship_id":                      uid,
            "power_generation_segments":    pwr.get("GenerationSegments"),
            "power_used_scm":               pwr.get("UsedSegmentsShields"),
            "power_used_nav":               pwr.get("UsedSegmentsQuantum"),
            "power_used_grouped_scm":       pwr.get("UsedSegmentsGrouped"),
            "power_used_grouped_nav":       None,
            "cooling_generation_segments":  cool.get("GenerationSegments"),
            "cooling_used_scm":             cool.get("UsedSegmentsShields"),
            "cooling_used_nav":             cool.get("UsedSegmentsQuantum"),
            "cooling_used_pct_scm":         cool.get("UsedSegmentsShieldsPct"),
            "cooling_used_pct_nav":         cool.get("UsedSegmentsQuantumPct"),
            "cooling_used_grouped_scm":     cool.get("UsedSegmentsShieldsGrouped"),
            "cooling_used_grouped_nav":     cool.get("UsedSegmentsQuantumGrouped"),
            "em_shields":                   emiss.get("EmShields"),
            "em_quantum":                   emiss.get("EmQuantum"),
            "ir_shields":                   emiss.get("IrShields"),
            "ir_quantum":                   emiss.get("IrQuantum"),
            "em_per_segment":               emiss.get("EmPerSegment"),
            "em_groups_scm":                emiss.get("EmGroupsShields"),
            "em_groups_nav":                emiss.get("EmGroupsQuantum"),
            "em_segment_groups_scm":        emiss.get("EmSegmentGroupsShields"),
            "em_segment_groups_nav":        emiss.get("EmSegmentGroupsQuantum"),
            "total_shield_hp":              st.get("Hp") or ship.get("ShieldHp"),
            "total_shield_regen":           st.get("Regen"),
            "total_shield_regen_raw":       st.get("RegenRaw"),
            "total_shield_regen_min_power": st.get("RegenMinPower"),
            "distortion_pool":              dist.get("Pool"),
            "fuel_capacity_hydrogen":       prop.get("FuelCapacity"),
            "fuel_intake_rate":             prop.get("FuelIntakeRate"),
            "fuel_usage_scm":               (prop.get("FuelUsage") or {}).get("Main"),
            "fuel_capacity_quantum":        qt.get("FuelCapacity"),
            "qt_range_km":                  qt_range_km,
            "qt_speed_ms":                  qt.get("Speed"),
            "qt_spool_time_s":              qt.get("SpoolTime"),
            "multi_pp_ratio":               None,
            "computed_at":                  "NOW()",
            "source_version":               None,
            "game_version":                 version_name,
        }

        cols = ", ".join(f'"{k}"' for k in data)
        vals = []
        for k, v in data.items():
            if k == "computed_at":
                vals.append("NOW()")
            else:
                vals.append(_sql_val(v))
        sql.append(f"INSERT INTO ship_power_reference ({cols}) VALUES ({', '.join(vals)}) ON CONFLICT (ship_id, game_version) DO NOTHING;")

    return sql
