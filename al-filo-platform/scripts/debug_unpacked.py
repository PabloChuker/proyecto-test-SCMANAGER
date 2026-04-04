import json
from pathlib import Path

# Configura la ruta a tu carpeta scunpacked
path = Path("./data/scunpacked")

print(f"--- DIAGNÓSTICO DE DATOS ---")
print(f"Buscando en: {path.absolute()}")

# Vamos a buscar un archivo que sepamos que existe (ej: la Avenger Titan)
# para ver qué tiene adentro exactamente.
for f in path.glob("**/aegs_avenger_titan.json"):
    print(f"\n[ARCHIVO ENCONTRADO]: {f}")
    with open(f, "r", encoding="utf-8") as file:
        data = json.load(file)
        
        # Imprimir las llaves principales para entender la estructura
        print(f"Llaves principales: {list(data.keys())}")
        
        # Si tiene 'Raw', ver qué hay en Components
        if "Raw" in data:
            entity = data["Raw"].get("Entity", {})
            components = entity.get("Components", {})
            print(f"Componentes encontrados: {list(components.keys())}")
            
            # Ver si están los Hardpoints (Ports)
            for key in components.keys():
                if "Port" in key:
                    print(f"!!! POSIBLE CONTENEDOR DE HARDPOINTS: {key}")
                    
        # Si es el formato viejo, buscar 'Hardpoints' arriba
        if "Hardpoints" in data:
            print("!!! Formato plano: Hardpoints encontrados en la raíz.")

print("\n--- FIN DEL DIAGNÓSTICO ---")