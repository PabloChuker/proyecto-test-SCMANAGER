"""Detalle de FlightCharacteristics, Loadout, CargoGrids y PowerPools."""
import json

PATH = r"C:\Users\Usuario\Desktop\scunpacked 4.7.2\ships.json"
NIL  = "00000000-0000-0000-0000-000000000000"

with open(PATH, encoding="utf-8") as f:
    data = json.load(f)

ship = next(s for s in data if s.get("UUID") and s["UUID"] != NIL and s.get("IsSpaceship"))
print(f"=== {ship['ClassName']} ===\n")

# FlightCharacteristics deep
fc = ship["FlightCharacteristics"]
print("--- FlightCharacteristics.IFCS ---")
for k, v in fc["IFCS"].items():
    print(f"  {k} = {repr(v)}")

print("\n--- FlightCharacteristics.Speeds ---")
for k, v in fc["Speeds"].items():
    print(f"  {k} = {repr(v)}")

print("\n--- FlightCharacteristics.AngularRates ---")
for k, v in fc["AngularRates"].items():
    print(f"  {k} = {repr(v)}")

print("\n--- FlightCharacteristics.AngularRatesBoosted ---")
for k, v in fc["AngularRatesBoosted"].items():
    print(f"  {k} = {repr(v)}")

print("\n--- FlightCharacteristics.Acceleration ---")
for k, v in fc["Acceleration"].items():
    if isinstance(v, dict):
        print(f"  {k}: dict  keys={list(v.keys())}")
    else:
        print(f"  {k} = {repr(v)}")

print("\n    Acceleration.Raw:")
for k, v in fc["Acceleration"]["Raw"].items():
    print(f"      {k} = {v}")
print("    Acceleration.BoostMultipliers:")
for k, v in fc["Acceleration"].get("BoostMultipliers", {}).items():
    print(f"      {k} = {v}")

print("\n--- FlightCharacteristics.Afterburner ---")
for k, v in fc["Afterburner"].items():
    print(f"  {k} = {repr(v)}")

print("\n--- FlightCharacteristics.Timing ---")
for k, v in fc["Timing"].items():
    print(f"  {k} = {repr(v)}")

# Propulsion
prop = ship["Propulsion"]
print("\n--- Propulsion ---")
for k, v in prop.items():
    if isinstance(v, dict):
        print(f"  {k}: dict  {v}")
    else:
        print(f"  {k} = {repr(v)}")

# QuantumTravel
qt = ship.get("QuantumTravel") or {}
print("\n--- QuantumTravel ---")
for k, v in qt.items():
    print(f"  {k} = {repr(v)}")

# PowerPools
pp = ship.get("PowerPools") or {}
print("\n--- PowerPools ---")
for k, v in pp.items():
    if isinstance(v, dict):
        print(f"  {k}: dict  keys={list(v.keys())} = {v}")
    else:
        print(f"  {k} = {v}")

# ShieldsTotal
st = ship.get("ShieldsTotal") or {}
print("\n--- ShieldsTotal ---")
for k, v in st.items():
    print(f"  {k} = {v}")

# Loadout first few items
print("\n--- Loadout (first 3 items) ---")
for i, hp in enumerate(ship.get("Loadout", [])[:3]):
    print(f"  [{i}]")
    for k, v in hp.items():
        if isinstance(v, list):
            print(f"    {k}: list[{len(v)}]")
        elif isinstance(v, dict):
            print(f"    {k}: dict  keys={list(v.keys())[:6]}")
        else:
            print(f"    {k} = {repr(v)[:80]}")

# CargoGrids
print("\n--- CargoGrids ---")
for cg in ship.get("CargoGrids", []):
    for k, v in cg.items():
        print(f"  {k} = {repr(v)}")
