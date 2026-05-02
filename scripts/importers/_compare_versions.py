"""
Compara la estructura de ships.json entre 4.7 y 4.7.2.
Busca la misma nave en ambas versiones y muestra las diferencias de keys.
"""
import json

PATH_47  = r"C:\Users\Usuario\Desktop\scunpacked 4.7\scunpacked-data\ships.json"
PATH_472 = r"C:\Users\Usuario\Desktop\scunpacked 4.7.2\ships.json"
NIL      = "00000000-0000-0000-0000-000000000000"

with open(PATH_47,  encoding="utf-8") as f: data_47  = json.load(f)
with open(PATH_472, encoding="utf-8") as f: data_472 = json.load(f)

print(f"4.7  → {len(data_47)}  ships")
print(f"4.7.2 → {len(data_472)} ships")
print()

# Índice por ClassName
idx_47  = {s["ClassName"]: s for s in data_47  if s.get("ClassName")}
idx_472 = {s["ClassName"]: s for s in data_472 if s.get("ClassName")}

only_47  = set(idx_47)  - set(idx_472)
only_472 = set(idx_472) - set(idx_47)
common   = set(idx_47)  & set(idx_472)

print(f"Solo en 4.7:   {len(only_47)}")
print(f"Solo en 4.7.2: {len(only_472)}")
print(f"Comunes:       {len(common)}")
print()

if only_472:
    print("=== Naves NUEVAS en 4.7.2 ===")
    for cn in sorted(only_472): print(f"  {cn}")
    print()

# Toma una nave spaceship común y compara top-level keys
spaceship = next((cn for cn in common if idx_47[cn].get("IsSpaceship")), None)
if not spaceship:
    spaceship = next(iter(common))

s47  = idx_47[spaceship]
s472 = idx_472[spaceship]

keys_47  = set(s47.keys())
keys_472 = set(s472.keys())

print(f"=== Comparación de keys top-level para: {spaceship} ===")
print(f"  Solo en 4.7:   {sorted(keys_47  - keys_472)}")
print(f"  Solo en 4.7.2: {sorted(keys_472 - keys_47)}")
print(f"  Comunes:       {sorted(keys_47  & keys_472)}")
print()

# Para cada subobject importante, compara keys
SUBOBJECTS = [
    "FlightCharacteristics", "Armor", "Propulsion", "QuantumTravel",
    "Insurance", "Emission", "Cooling", "Power", "ShieldsTotal",
    "Distortion", "ShieldController", "Manufacturer",
]

for key in SUBOBJECTS:
    v47  = s47.get(key)
    v472 = s472.get(key)
    if v47 is None and v472 is None:
        continue
    if isinstance(v47, dict) and isinstance(v472, dict):
        k47  = set(v47.keys())
        k472 = set(v472.keys())
        if k47 != k472:
            print(f"  {key}: keys changed")
            print(f"    Solo en 4.7:   {sorted(k47 - k472)}")
            print(f"    Solo en 4.7.2: {sorted(k472 - k47)}")
        else:
            # Compara valores para detectar si hay datos vs None/0
            diffs = []
            for k in k47:
                val47  = v47[k]
                val472 = v472[k]
                if type(val47) != type(val472):
                    diffs.append(f"    {k}: {type(val47).__name__} → {type(val472).__name__}")
                elif val47 != val472:
                    diffs.append(f"    {k}: {repr(val47)[:50]} → {repr(val472)[:50]}")
            if diffs:
                print(f"  {key}: mismos keys, valores cambiados:")
                for d in diffs[:10]: print(d)
    elif v47 is None and v472 is not None:
        print(f"  {key}: NOT IN 4.7, present in 4.7.2 → {type(v472).__name__}")
    elif v47 is not None and v472 is None:
        print(f"  {key}: present in 4.7, NOT IN 4.7.2")
    elif type(v47) != type(v472):
        print(f"  {key}: type changed {type(v47).__name__} → {type(v472).__name__}")

print()

# Compara FlightCharacteristics en detalle
print("=== FlightCharacteristics detalle ===")
fc47  = s47.get("FlightCharacteristics") or {}
fc472 = s472.get("FlightCharacteristics") or {}
for sub in ["Speeds", "AngularRates", "AngularRatesBoosted", "Acceleration", "Afterburner", "Timing", "IFCS"]:
    v47  = fc47.get(sub)
    v472 = fc472.get(sub)
    if isinstance(v47, dict) and isinstance(v472, dict):
        same = (set(v47.keys()) == set(v472.keys()))
        vals_same = (v47 == v472)
        if not same:
            print(f"  {sub}: keys diff — solo 4.7: {set(v47.keys())-set(v472.keys())} | solo 4.7.2: {set(v472.keys())-set(v47.keys())}")
        elif not vals_same:
            for k in v47:
                if v47[k] != v472[k]:
                    print(f"  {sub}.{k}: {repr(v47[k])[:40]} → {repr(v472[k])[:40]}")
        else:
            print(f"  {sub}: idéntico")
    elif v47 is None and v472 is None:
        print(f"  {sub}: ausente en ambos")
    else:
        print(f"  {sub}: 4.7={type(v47).__name__} | 4.7.2={type(v472).__name__}")

print()

# Muestra sample de Loadout[0] de ambas versiones
print("=== Loadout[0] keys ===")
l47  = s47.get("Loadout")  or []
l472 = s472.get("Loadout") or []
if l47 and l472:
    k47  = set(l47[0].keys())
    k472 = set(l472[0].keys())
    print(f"  Solo en 4.7:   {sorted(k47 - k472)}")
    print(f"  Solo en 4.7.2: {sorted(k472 - k47)}")
    print(f"  Comunes: {sorted(k47 & k472)}")

print()

# Muestra CargoGrids[0] de ambas versiones
print("=== CargoGrids[0] ===")
cg47  = s47.get("CargoGrids")  or []
cg472 = s472.get("CargoGrids") or []
if cg47:  print(f"  4.7:   {cg47[0]}")
if cg472: print(f"  4.7.2: {cg472[0]}")
