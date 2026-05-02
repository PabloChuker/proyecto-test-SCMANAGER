"""
Imprime los valores reales que cada importer leería para una nave concreta,
y cuenta cuántos ships tienen NULL en campos críticos.
"""
import json, sys
sys.path.insert(0, ".")

PATH = r"C:\Users\Usuario\Desktop\scunpacked 4.7.2\ships.json"
NIL  = "00000000-0000-0000-0000-000000000000"

with open(PATH, encoding="utf-8") as f:
    data = json.load(f)

spaceship = next(s for s in data if s.get("UUID") and s["UUID"] != NIL and s.get("IsSpaceship"))
cn = spaceship["ClassName"]
print(f"Nave de referencia: {cn}\n")

# ── ship_flight_stats ──────────────────────────────────────────────────────
fc     = spaceship.get("FlightCharacteristics") or {}
speeds = fc.get("Speeds") or {}
ang    = fc.get("AngularRates") or {}
ang_b  = fc.get("AngularRatesBoosted") or {}
accel  = fc.get("Acceleration") or {}
raw    = accel.get("Raw") or {}
rawg   = accel.get("RawG") or {}
bm     = accel.get("BoostMultipliers") or {}
ab     = fc.get("Afterburner") or {}
timing = fc.get("Timing") or {}

print("=== ship_flight_stats ===")
print(f"  scm_speed:           {speeds.get('Scm')}")
print(f"  max_speed:           {speeds.get('Max')}")
print(f"  boost_speed_forward: {speeds.get('BoostForward')}")
print(f"  pitch:               {ang.get('Pitch')}")
print(f"  accel_forward:       {raw.get('Forward')}")
print(f"  accel_forward_g:     {rawg.get('Forward')}")
print(f"  boost_mult_forward:  {bm.get('Forward')}")
print(f"  boost_capacitor_max: {ab.get('CapacitorMax')}")
print(f"  zero_to_scm:         {timing.get('ZeroToScm')}")
print()

# ── ship_resistances ──────────────────────────────────────────────────────
armor = spaceship.get("Armor") or {}
dmg_m = armor.get("DamageMultipliers") or {}
sig_m = armor.get("SignalMultipliers") or {}
pen_r = armor.get("PenetrationResistance") or {}
emiss = spaceship.get("Emission") or {}
cs    = spaceship.get("CrossSection") or {}

print("=== ship_resistances ===")
print(f"  armor_hp:                 {armor.get('Health')}")
print(f"  DamageMultipliers keys:   {list(dmg_m.keys())}")
print(f"  dmg_mult_physical:        {dmg_m.get('Physical')}")
print(f"  dmg_mult_energy:          {dmg_m.get('Energy')}")
print(f"  dmg_mult_biochemical:     {dmg_m.get('Biochemical')}  ← en DamageMultipliers?")
print(f"  SignalMultipliers keys:   {list(sig_m.keys())}")
print(f"  sig_mult_cross_section:   {sig_m.get('CrossSection')}")
print(f"  sig_mult_infrared:        {sig_m.get('Infrared')}")
print(f"  PenetrationResistance:    {pen_r}")
print(f"  EmShields:                {emiss.get('EmShields')}")
print(f"  IrShields:                {emiss.get('IrShields')}")
print(f"  CrossSection:             {cs}")
print()

# ── ship_fuel ─────────────────────────────────────────────────────────────
prop       = spaceship.get("Propulsion") or {}
fuel_usage = prop.get("FuelUsage") or {}
qt         = spaceship.get("QuantumTravel") or {}
pwr        = spaceship.get("Power") or {}

print("=== ship_fuel ===")
print(f"  FuelCapacity:          {prop.get('FuelCapacity')}")
print(f"  FuelIntakeRate:        {prop.get('FuelIntakeRate')}")
print(f"  FuelUsage.Main:        {fuel_usage.get('Main')}")
print(f"  FuelUsage.Retro:       {fuel_usage.get('Retro')}")
print(f"  FuelUsage.Maneuvering: {fuel_usage.get('Maneuvering')}")
print(f"  ManeuveringTimeTill:   {prop.get('ManeuveringTimeTillEmpty')}")
print(f"  IntakeToMainFuelRatio: {prop.get('IntakeToMainFuelRatio')}")
print(f"  QT.FuelCapacity:       {qt.get('FuelCapacity')}")
print(f"  QT.SpoolTime:          {qt.get('SpoolTime')}")
print(f"  QT.PortOlisarTime:     {qt.get('PortOlisarToArcCorpTime')}")
print(f"  Power.UsedSegsQuantum: {pwr.get('UsedSegmentsQuantum')}")
print()

# ── ship_power_reference ──────────────────────────────────────────────────
cool = spaceship.get("Cooling") or {}
st   = spaceship.get("ShieldsTotal") or {}
dist = spaceship.get("Distortion") or {}

print("=== ship_power_reference ===")
print(f"  Power.GenerationSegments:    {pwr.get('GenerationSegments')}")
print(f"  Power.UsedSegmentsShields:   {pwr.get('UsedSegmentsShields')}")
print(f"  Power.UsedSegmentsQuantum:   {pwr.get('UsedSegmentsQuantum')}")
print(f"  Power.UsedSegmentsGrouped:   {pwr.get('UsedSegmentsGrouped')}")
print(f"  Cooling.GenerationSegments:  {cool.get('GenerationSegments')}")
print(f"  Cooling.UsedSegmentsShields: {cool.get('UsedSegmentsShields')}")
print(f"  Cooling.UsedSegmentsQuantum: {cool.get('UsedSegmentsQuantum')}")
print(f"  ShieldsTotal.Hp:             {st.get('Hp')}")
print(f"  ShieldsTotal.Regen:          {st.get('Regen')}")
print(f"  ShieldHp:                    {spaceship.get('ShieldHp')}")
print(f"  Distortion.Pool:             {dist.get('Pool')}")
print(f"  Emission.EmShields:          {emiss.get('EmShields')}")
print(f"  Emission.EmPerSegment:       {emiss.get('EmPerSegment')}")
print()

# ── ship_pools ────────────────────────────────────────────────────────────
pools = spaceship.get("PowerPools") or {}
print("=== ship_pools ===")
for k, v in pools.items():
    print(f"  {k}: ItemType={v.get('ItemType')}, Size={v.get('Size')}")
print()

# ── NULL counts across all ships ─────────────────────────────────────────
print("=== NULL count en campos críticos (de 293 ships) ===")
fields = {
    "FlightCharacteristics.Speeds.Scm":    lambda s: ((s.get("FlightCharacteristics") or {}).get("Speeds") or {}).get("Scm"),
    "Armor.Health":                         lambda s: (s.get("Armor") or {}).get("Health"),
    "Propulsion.FuelCapacity":             lambda s: (s.get("Propulsion") or {}).get("FuelCapacity"),
    "QuantumTravel.FuelCapacity":          lambda s: (s.get("QuantumTravel") or {}).get("FuelCapacity"),
    "Insurance.ExpeditedCost":             lambda s: (s.get("Insurance") or {}).get("ExpeditedCost"),
    "Power.GenerationSegments":            lambda s: (s.get("Power") or {}).get("GenerationSegments"),
    "Cooling.GenerationSegments":          lambda s: (s.get("Cooling") or {}).get("GenerationSegments"),
    "ShieldsTotal.Hp":                     lambda s: (s.get("ShieldsTotal") or {}).get("Hp"),
    "PowerPools (has any)":               lambda s: bool(s.get("PowerPools")),
    "CargoGrids (has any)":               lambda s: bool(s.get("CargoGrids")),
    "Loadout (has any)":                  lambda s: bool(s.get("Loadout")),
}
for name, fn in fields.items():
    nulls = sum(1 for s in data if fn(s) is None or fn(s) is False)
    print(f"  {name:<45} NULL/absent: {nulls:>3} / {len(data)}")
