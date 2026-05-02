"""
Busca la logica de deflection_physical=11 y deflection_energy=9
para la Avenger Titan en los datos de 4.7.
Prueba todas las formulas posibles con los campos disponibles.
"""
import json, math

PATH_47  = r"C:\Users\Usuario\Desktop\scunpacked 4.7\scunpacked-data\ships.json"
PATH_IND = r"C:\Users\Usuario\Desktop\scunpacked 4.7\scunpacked-data\ships\aegs_avenger_titan.json"

with open(PATH_47,  encoding="utf-8") as f: data_47 = json.load(f)
with open(PATH_IND, encoding="utf-8") as f: ind     = json.load(f)

# Avenger en ships.json resumido
avenger = next(s for s in data_47 if s.get("ClassName") == "AEGS_Avenger_Titan")

print("=== Avenger Titan - ships.json (resumen 4.7) ===")
print("Armor keys:", list(avenger.get("Armor", {}).keys()))
armor = avenger.get("Armor") or {}
for k, v in armor.items():
    if isinstance(v, dict):
        print(f"  {k}: {v}")
    else:
        print(f"  {k} = {v}")

print()
print("=== Avenger Titan - archivo individual 4.7 ===")
armor_i = ind.get("Armor") or {}
dm  = armor_i.get("DamageMultipliers") or {}
rm  = armor_i.get("ResistanceMultipliers") or {}
pr  = armor_i.get("PenetrationResistance") or {}
sm  = armor_i.get("SignalMultipliers") or {}

print(f"  DM.Physical={dm.get('Physical')}  DM.PhysChange={dm.get('PhysicalChange')}")
print(f"  DM.Energy={dm.get('Energy')}      DM.EnergyChange={dm.get('EnergyChange')}")
print(f"  RM.Physical={rm.get('Physical')}  RM.Energy={rm.get('Energy')}")
print()

TARGET_P = 11
TARGET_E = 9

print("=== Probando formulas que den Physical=11 y Energy=9 ===")
candidates_p = []
candidates_e = []

# Valores base
dm_p = dm.get("Physical", 0)
dm_e = dm.get("Energy", 0)
rm_p = rm.get("Physical", 0)
rm_e = rm.get("Energy", 0)
hp   = armor_i.get("Health", 0)

formulas = {
    "round((1-DM_p)*100)":              lambda p,e: round((1-p)*100),
    "round((1-DM_e)*100)":              lambda p,e: round((1-e)*100),
    "round(abs(DM_pChange)*100)":       lambda p,e: round(abs(dm.get('PhysicalChange',0))*100),
    "round(abs(DM_eChange)*100)":       lambda p,e: round(abs(dm.get('EnergyChange',0))*100),
    "round((1-RM_p)*100)":              lambda p,e: round((1-rm_p)*100),
    "round((1-RM_e)*100)":              lambda p,e: round((1-rm_e)*100),
    "round((1-DM_p*RM_p)*100)":        lambda p,e: round((1-p*rm_p)*100),
    "round((1-DM_e*RM_e)*100)":        lambda p,e: round((1-e*rm_e)*100),
    "round((1-DM_p)*100/2)":           lambda p,e: round((1-p)*100/2),
    "round((1-DM_e)*100/4)":           lambda p,e: round((1-e)*100/4),
    "round(abs(DM_pChange)*100/2)":    lambda p,e: round(abs(dm.get('PhysicalChange',0))*100/2),
    "round(abs(DM_eChange)*100/4)":    lambda p,e: round(abs(dm.get('EnergyChange',0))*100/4),
    "round((RM_p-1)*-100)":            lambda p,e: round((rm_p-1)*-100),
    "round((RM_e-1)*100)":             lambda p,e: round((rm_e-1)*100),
    "int((1-DM_p)*100)":               lambda p,e: int((1-p)*100),
    "int((1-DM_e)*100)":               lambda p,e: int((1-e)*100),
    "int(abs(DM_pChange)*100)":        lambda p,e: int(abs(dm.get('PhysicalChange',0))*100),
    "round((1-DM_p)*100-9)":           lambda p,e: round((1-p)*100)-9,
    "HP*DM_p/1000":                    lambda p,e: round(hp*p/1000),
    "round((1-DM_p*RM_p)*100/2)":     lambda p,e: round((1-p*rm_p)*100/2),
}

print(f"  {'Formula':<45} {'val_P':>7}  {'val_E':>7}  {'match_P':>7}  {'match_E':>7}")
for name, fn in formulas.items():
    try:
        val_p = fn(dm_p, dm_p)
        val_e = fn(dm_e, dm_e)
        match_p = "YES" if val_p == TARGET_P else ""
        match_e = "YES" if val_e == TARGET_E else ""
        if match_p or match_e:
            print(f"  {name:<45} {val_p:>7}  {val_e:>7}  {match_p:>7}  {match_e:>7}  <---")
        else:
            print(f"  {name:<45} {val_p:>7}  {val_e:>7}  {match_p:>7}  {match_e:>7}")
    except:
        pass

# Brute force: busca cualquier combinacion que de exactamente 11 y 9
print()
print("=== Brute force: combinaciones aritmeticas simples ===")
values = {
    "DM_p": dm_p, "DM_e": dm_e,
    "DM_pC": abs(dm.get('PhysicalChange',0)), "DM_eC": abs(dm.get('EnergyChange',0)),
    "RM_p": rm_p, "RM_e": rm_e,
    "HP": hp/1000,
}
mults = [1, 2, 3, 4, 5, 10, 25, 50, 100]
for vname, vval in values.items():
    for m in mults:
        r1 = round((1-vval)*m)
        r2 = round(vval*m)
        r3 = int((1-vval)*m)
        for label, r in [(f"round((1-{vname})*{m})", r1),
                         (f"round({vname}*{m})", r2),
                         (f"int((1-{vname})*{m})", r3)]:
            if r in (TARGET_P, TARGET_E):
                print(f"  {label:<50} = {r}  {'<-- PHYSICAL!' if r==TARGET_P else '<-- ENERGY!'}")
