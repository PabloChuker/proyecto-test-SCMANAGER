import os
import json
from pathlib import Path
from sqlalchemy import create_engine, text

def main():
    # 1. Configuración de conexión
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("ERROR: No se encontró la variable DATABASE_URL")
        return
        
    engine = create_engine(db_url, isolation_level="AUTOCOMMIT")
    
    # 2. Ruta de los archivos (Ya estamos dentro de scunpacked)
    path = Path(".") 
    ships_dir = path / "ships"
    
    if not ships_dir.exists():
        print(f"ERROR: No se encuentra la carpeta {ships_dir.absolute()}")
        return

    files = list(ships_dir.glob("*.json"))
    print(f"--- INICIO: Procesando {len(files)} naves ---")

    with engine.connect() as conn:
        for ship_file in files:
            try:
                with open(ship_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                
                ref = data.get("ClassName")
                if not ref: continue
                
                # Insertar o actualizar la Nave
                res = conn.execute(text("""
                    INSERT INTO ships (reference, name, manufacturer, game_version)
                    VALUES (:ref, :name, :mfr, '4.0.2')
                    ON CONFLICT (reference) DO UPDATE SET updated_at = NOW()
                    RETURNING id
                """), {
                    "ref": ref, 
                    "name": data.get("Name", ref),
                    "mfr": data.get("Manufacturer", {}).get("Name") if isinstance(data.get("Manufacturer"), dict) else data.get("Manufacturer")
                })
                sid = res.fetchone()[0]

                # PROCESAR HARDPOINTS (LOADOUT)
                loadout = data.get("Loadout") or data.get("loadout") or []
                
                if loadout:
                    inserted_count = 0
                    for item in loadout:
                        hp_name = item.get("PortName") or item.get("LocalName") or item.get("Name")
                        hp_size = item.get("Size") or item.get("PortSize") or 0
                        
                        if hp_name:
                            try:
                                # Inserción simple para evitar el error de ON CONFLICT
                                conn.execute(text("""
                                    INSERT INTO ship_hardpoints (ship_id, hardpoint_name, max_size)
                                    VALUES (:sid, :name, :sz)
                                    ON CONFLICT DO NOTHING
                                """), {
                                    "sid": sid, 
                                    "name": str(hp_name), 
                                    "sz": int(hp_size)
                                })
                                inserted_count += 1
                            except:
                                pass # Si uno falla, seguimos con el siguiente
                    
                    print(f" > Nave OK: {ref} ({inserted_count} hardpoints guardados)")
                else:
                    print(f" > Nave OK: {ref} (Sin loadout)")

            except Exception as e:
                print(f" ! Error procesando {ship_file.name}: {e}")

    print("\n--- FIN DEL PROCESO: Revisá Supabase ---")

if __name__ == "__main__":
    main()