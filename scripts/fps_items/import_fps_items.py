import json
import re


# ─── Parsers de strings de DescriptionData ────────────────────────────────────
# El JSON de scunpacked guarda los stats como strings con formatos fijos:
#   "Damage Reduction": "40%"
#   "Temp. Rating": "-70 / 100 °C"
#   "Radiation Protection": "26800 REM"
#   "Radiation Scrub Rate": "145.8 REM/s"
#   "Carrying Capacity": "8.0 µSCU"   (a veces "105K µSCU" para mochilas)
# Las funciones siguientes los pasan a tipos Python apropiados.

def parse_percent(s):
    """'40%' → 0.4000  (decimal listo para multiplicar)."""
    if not s:
        return None
    m = re.match(r"^\s*([-+]?[\d.]+)\s*%\s*$", s)
    return float(m.group(1)) / 100 if m else None


def parse_temp_rating(s):
    """'-70 / 100 °C' → (-70.0, 100.0). Devuelve (None, None) si no parsea."""
    if not s:
        return (None, None)
    m = re.match(r"^\s*(-?[\d.]+)\s*/\s*(-?[\d.]+)\s*°C\s*$", s)
    return (float(m.group(1)), float(m.group(2))) if m else (None, None)


def parse_rem(s):
    """'26800 REM' → 26800."""
    if not s:
        return None
    m = re.match(r"^\s*([\d.]+)\s*REM\s*$", s)
    return int(float(m.group(1))) if m else None


def parse_rem_per_s(s):
    """'145.8 REM/s' → 145.8."""
    if not s:
        return None
    m = re.match(r"^\s*([\d.]+)\s*REM/s\s*$", s)
    return float(m.group(1)) if m else None


def parse_uscu(s):
    """'8.0 µSCU' → 8.0;  '105K µSCU' → 105000.0  (sufijo K = ×1000)."""
    if not s:
        return None
    m = re.match(r"^\s*([\d.]+)\s*([Kk]?)\s*µSCU\s*$", s)
    if not m:
        return None
    val = float(m.group(1))
    if m.group(2).upper() == "K":
        val *= 1000
    return val


def parse_rpm(s):
    """'120 rpm' → 120.0."""
    if not s:
        return None
    m = re.match(r"^\s*([\d.]+)\s*rpm\s*$", s, re.IGNORECASE)
    return float(m.group(1)) if m else None


def parse_meters(s):
    """'80 m' → 80.0."""
    if not s:
        return None
    m = re.match(r"^\s*([\d.]+)\s*m\s*$", s)
    return float(m.group(1)) if m else None


def parse_int(s):
    """'15' → 15. Devuelve None si no es entero válido."""
    if s is None:
        return None
    try:
        return int(str(s).strip())
    except (ValueError, TypeError):
        return None


# ─── Helpers de generación SQL ────────────────────────────────────────────────

def _sql_literal(v):
    """Convierte un valor Python a literal SQL apto para concatenar.

    Maneja None → NULL, bool → TRUE/FALSE, números → str, dict/list →
    JSON encoded con cast ::jsonb, y strings → escape de comillas simples.
    """
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, (dict, list)):
        encoded = json.dumps(v, ensure_ascii=False).replace("'", "''")
        return f"'{encoded}'::jsonb"
    # string (incluye uuids serializados como str)
    return "'" + str(v).replace("'", "''") + "'"


# ─── Importador principal ─────────────────────────────────────────────────────

def generate_armor_inserts(json_data, version_name):
    """
    Recibe el array completo de fps-items.json y la versión del juego.

    Filtra items cuyo `type` empieza con "Char_Armor_" (Arms, Backpack,
    Helmet, Legs, Torso, Undersuit), salta placeholders sin stats reales,
    parsea los strings de stdItem.DescriptionData y genera un INSERT por
    item para la tabla armor_items.

    Retorna una lista de strings con los comandos SQL.
    """
    sql_commands = []

    if not isinstance(json_data, list):
        print("Error: Se esperaba una lista [ ... ], pero se recibió otro formato.")
        return []

    skipped = {
        "non_armor": 0,
        "placeholder": 0,
        "no_std_item": 0,
        "no_uuid": 0,
        "no_class_name": 0,
    }

    for item in json_data:
        item_type = item.get("type", "") or ""
        if not item_type.startswith("Char_Armor_"):
            skipped["non_armor"] += 1
            continue

        std_item = item.get("stdItem")
        if not std_item:
            skipped["no_std_item"] += 1
            continue

        # En SC hay items vanduul y de prueba que aparecen como placeholders
        # sin stats reales — los saltamos.
        name = std_item.get("Name") or ""
        if not name or "PLACEHOLDER" in name:
            skipped["placeholder"] += 1
            continue

        std_uuid = std_item.get("UUID")
        if not std_uuid:
            skipped["no_uuid"] += 1
            continue

        class_name = std_item.get("ClassName") or item.get("className")
        if not class_name:
            skipped["no_class_name"] += 1
            continue

        desc_data = std_item.get("DescriptionData", {}) or {}
        manuf = std_item.get("Manufacturer", {}) or {}

        # Parse stats de DescriptionData (algunas claves pueden faltar — ej.
        # mochilas no tienen Damage Reduction ni Temp. Rating)
        damage_reduction = parse_percent(desc_data.get("Damage Reduction"))
        temp_min, temp_max = parse_temp_rating(desc_data.get("Temp. Rating"))
        rad_capacity = parse_rem(desc_data.get("Radiation Protection"))
        rad_scrub = parse_rem_per_s(desc_data.get("Radiation Scrub Rate"))
        carrying = parse_uscu(desc_data.get("Carrying Capacity"))

        # Diccionario columna → valor. El orden se preserva en Python 3.7+
        # y se usa para construir el INSERT.
        data = {
            "uuid": std_uuid,
            "game_version": version_name,
            "class_name": class_name,
            "name": name,
            "type": item_type,
            "subtype": item.get("subType"),
            "size": std_item.get("Size"),
            "grade": std_item.get("Grade"),
            "damage_reduction": damage_reduction,
            "temp_min_celsius": temp_min,
            "temp_max_celsius": temp_max,
            "radiation_capacity_rem": rad_capacity,
            "radiation_scrub_rem_s": rad_scrub,
            "carrying_capacity_uscu": carrying,
            "mass": std_item.get("Mass"),
            "width": std_item.get("Width"),
            "height": std_item.get("Height"),
            "length": std_item.get("Length"),
            "manufacturer_code": manuf.get("Code"),
            "manufacturer_name": manuf.get("Name"),
            "manufacturer_uuid": manuf.get("UUID"),
            "rarity": std_item.get("Rarity"),
            "description": std_item.get("Description"),
            "description_lore": std_item.get("DescriptionText"),
            "raw_data": desc_data,  # → ::jsonb por _sql_literal
        }

        columns = ", ".join(data.keys())
        values_str = ", ".join(_sql_literal(v) for v in data.values())

        sql = f"INSERT INTO armor_items ({columns}) VALUES ({values_str});"
        sql_commands.append(sql)

    print(f"Procesados: {len(sql_commands)} items de armadura.")
    print(f"Saltados:   {skipped}")

    return sql_commands


# ─── Importador de armas ──────────────────────────────────────────────────────

def generate_weapon_inserts(json_data, version_name):
    """
    Recibe el array completo de fps-items.json y la versión del juego.

    Filtra items cuyo `type` es "WeaponPersonal" (armas reales — no
    attachments). Salta placeholders. Combina dos fuentes de datos:
      · stdItem.DescriptionData → strings de display (rate of fire, range...)
      · stdItem.Weapon          → stats numéricos completos (damage, dps,
                                  spread, modes...)

    Genera un INSERT por arma para la tabla fps_weapon_items.
    Retorna una lista de strings con los comandos SQL.
    """
    sql_commands = []

    if not isinstance(json_data, list):
        print("Error: Se esperaba una lista [ ... ], pero se recibió otro formato.")
        return []

    skipped = {
        "non_weapon": 0,
        "attachment": 0,
        "placeholder": 0,
        "no_std_item": 0,
        "no_uuid": 0,
        "no_class_name": 0,
    }

    for item in json_data:
        item_type = item.get("type", "") or ""
        if item_type == "WeaponAttachment":
            skipped["attachment"] += 1
            continue
        if item_type != "WeaponPersonal":
            skipped["non_weapon"] += 1
            continue

        std_item = item.get("stdItem")
        if not std_item:
            skipped["no_std_item"] += 1
            continue

        name = std_item.get("Name") or ""
        if not name or "PLACEHOLDER" in name:
            skipped["placeholder"] += 1
            continue

        std_uuid = std_item.get("UUID")
        if not std_uuid:
            skipped["no_uuid"] += 1
            continue

        class_name = std_item.get("ClassName") or item.get("className")
        if not class_name:
            skipped["no_class_name"] += 1
            continue

        desc_data = std_item.get("DescriptionData", {}) or {}
        weapon = std_item.get("Weapon", {}) or {}
        manuf = std_item.get("Manufacturer", {}) or {}

        # Damage Alpha por tipo (stdItem.Weapon.Damage.Alpha)
        damage = weapon.get("Damage", {}) or {}
        alpha = damage.get("Alpha", {}) or {}
        dps = damage.get("Dps", {}) or {}

        # Spread del modo Single (hipfire). Si el arma solo tiene burst/rapid
        # cogemos el primero disponible.
        modes = weapon.get("Modes", []) or []
        single_mode = next((m for m in modes if m.get("Name") == "Single"), None)
        if single_mode is None and modes:
            single_mode = modes[0]
        spread = (single_mode or {}).get("Spread", {}) or weapon.get("Spread", {}) or {}

        # Composite raw_data (para fallback futuro)
        raw_combined = {
            "DescriptionData": desc_data,
            "Weapon": weapon,
        }

        data = {
            "uuid": std_uuid,
            "game_version": version_name,
            "class_name": class_name,
            "name": name,
            "type": item_type,
            "subtype": item.get("subType"),
            "size": std_item.get("Size"),
            "grade": std_item.get("Grade"),

            # DescriptionData
            "item_type": desc_data.get("Item Type"),
            "damage_class": desc_data.get("Class"),
            "attachments_summary": desc_data.get("Attachments"),
            "effective_range_m": parse_meters(desc_data.get("Effective Range")),
            "rate_of_fire_rpm": parse_rpm(desc_data.get("Rate Of Fire")),
            "magazine_size": parse_int(desc_data.get("Magazine Size")),

            # stdItem.Weapon (struct)
            "weapon_class_struct": weapon.get("WeaponClass"),
            "effective_range_struct": weapon.get("EffectiveRange"),
            "rate_of_fire_struct": weapon.get("RateOfFire"),
            "capacity": weapon.get("Capacity"),
            "fire_mode_default": weapon.get("FireMode"),

            # Damage Alpha
            "damage_alpha_total": damage.get("AlphaTotal"),
            "damage_alpha_physical": alpha.get("Physical"),
            "damage_alpha_energy": alpha.get("Energy"),
            "damage_alpha_thermal": alpha.get("Thermal"),
            "damage_alpha_distortion": alpha.get("Distortion"),
            "damage_alpha_biochemical": alpha.get("Biochemical"),
            "damage_alpha_stun": alpha.get("Stun"),

            # DPS
            "dps_total": damage.get("DpsTotal"),
            "dps_physical": dps.get("Physical"),
            "dps_energy": dps.get("Energy"),
            "dps_thermal": dps.get("Thermal"),
            "dps_distortion": dps.get("Distortion"),
            "dps_biochemical": dps.get("Biochemical"),
            "dps_stun": dps.get("Stun"),

            # Spread (modo Single)
            "spread_min": spread.get("Minimum"),
            "spread_max": spread.get("Maximum"),
            "spread_first_attack": spread.get("FirstAttack"),
            "spread_attack": spread.get("Attack"),
            "spread_decay": spread.get("Decay"),

            # Físicas
            "mass": std_item.get("Mass"),
            "width": std_item.get("Width"),
            "height": std_item.get("Height"),
            "length": std_item.get("Length"),

            # Manufacturer
            "manufacturer_code": manuf.get("Code"),
            "manufacturer_name": manuf.get("Name"),
            "manufacturer_uuid": manuf.get("UUID"),

            # Otros
            "rarity": std_item.get("Rarity"),
            "description": std_item.get("Description"),
            "description_lore": std_item.get("DescriptionText"),
            "raw_data": raw_combined,
        }

        columns = ", ".join(data.keys())
        values_str = ", ".join(_sql_literal(v) for v in data.values())

        sql = f"INSERT INTO fps_weapon_items ({columns}) VALUES ({values_str});"
        sql_commands.append(sql)

    print(f"Procesados: {len(sql_commands)} armas FPS.")
    print(f"Saltados:   {skipped}")

    return sql_commands
