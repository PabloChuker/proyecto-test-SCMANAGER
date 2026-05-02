"""
Compara los valores de deflection/armor entre 4.7 y 4.7.2 para las mismas naves.
"""
import json

PATH_47  = r"C:\Users\Usuario\Desktop\scunpacked 4.7\scunpacked-data\ships.json"
PATH_472 = r"C:\Users\Usuario\Desktop\scunpacked 4.7.2\ships.json"

with open(PATH_47,  encoding="utf-8") as f: data_47  = json.load(f)
with open(PATH_472, encoding="utf-8") as f: data_472 = json.load(f)

idx_47  = {s["ClassName"]: s for s in data_47  if s.get("ClassName")}
idx_472 = {s["ClassName"]: s for s in data_472 if s.get("ClassName")}

# Naves spaceship comunes
spaceships = [cn for cn in idx_47 if idx_47[cn].get("IsSpaceship") and cn in idx_472][:10]

print("Comparacion Armor.ResistanceMultipliers (campo que usamos para deflection_*)")
print(f"{'ClassName':<40} {'campo':<12} {'4.7':>10}  {'4.7.2':>10}")
print("-" * 78)

for cn in spaceships:
    s47  = idx_47[cn]
    s472 = idx_472[cn]
    armor47  = (s47.get("Armor")  or {}).get("ResistanceMultipliers") or {}
    armor472 = (s472.get("Armor") or {}).get("ResistanceMultipliers") or {}

    for field in ["Physical", "Energy", "Distortion"]:
        v47  = armor47.get(field)
        v472 = armor472.get(field)
        changed = " <-- CHANGED" if v47 != v472 else ""
        print(f"  {cn:<38} {field:<12} {str(v47):>10}  {str(v472):>10}{changed}")
    print()

# Busca TODOS los campos relacionados con armor/resistance para ver si hay
# otro campo que diera los valores enteros (11, 9, 0) en 4.7
print()
print("=== Todos los subcampos de Armor para la primera nave ===")
cn  = spaceships[0]
s47 = idx_47[cn]

def print_nested(d, prefix="", depth=0):
    if depth > 3:
        return
    if isinstance(d, dict):
        for k, v in d.items():
            if isinstance(v, dict):
                print(f"  {prefix}{k}:")
                print_nested(v, prefix + "  ", depth + 1)
            else:
                print(f"  {prefix}{k} = {v}")

armor47 = s47.get("Armor") or {}
print(f"  {cn} - Armor (4.7):")
print_nested(armor47)
