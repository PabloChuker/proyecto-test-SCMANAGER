import os
import json
from pathlib import Path
import click
from sqlalchemy import create_engine, text

def sf(val, default=0.0):
    try: return float(val) if val is not None else default
    except: return default

def si(val, default=0):
    try: return int(float(val)) if val is not None else default
    except: return default

@click.command()
@click.option("--version", required=True)
@click.option("--local-path", default="./data")
def main(version, local_path):
    db_url = os.getenv("DATABASE_URL")
    engine = create_engine(db_url)
    path = Path(local_path)
    
    ships_dir = path / "ships"
    print(f"-> Buscando naves en: {ships_dir.absolute()}")
    
    if not ships_dir.exists():
        print(f"Error: No existe la carpeta {ships_dir}")
        return

    files = list(ships_dir.glob("*.json"))
    print(f"-> Se encontraron {len(files)} archivos JSON.")

    with engine.connect() as conn:
        for ship_file in files:
            with open(ship_file, "r", encoding="utf-8") as f:
                raw = json.load(f)
            
            s_list = raw if isinstance(raw, list) else [raw]
            for s in s_list:
                ref = s.get("ClassName")
                if not ref: continue
                
                print(f"   > Insertando nave: {ref}")
                
                # Usamos una transacción por cada nave para asegurar que se guarde
                with conn.begin():
                    # Insertar Nave
                    res = conn.execute(text("""
                        INSERT INTO ships (reference, name, manufacturer, scm_speed, cargo_capacity, game_version)
                        VALUES (:ref, :name, :mfr, :scm, :cargo, :ver)
                        ON CONFLICT (reference) DO UPDATE SET name = EXCLUDED.name
                        RETURNING id
                    """), {
                        "ref": ref,
                        "name": s.get("Name", ref),
                        "mfr": s.get("Manufacturer", {}).get("Name"),
                        "scm": sf(s.get("FlightCharacteristics", {}).get("ScmSpeed")),
                        "cargo": sf(s.get("Cargo")),
                        "ver": version
                    })
                    sid = res.fetchone()[0]

                    # Insertar Hardpoints
                    for hp in s.get("Hardpoints", []):
                        conn.execute(text("""
                            INSERT INTO ship_hardpoints (ship_id, hardpoint_name, max_size)
                            VALUES (:sid, :name, :sz)
                            ON CONFLICT DO NOTHING
                        """), {"sid": sid, "name": hp.get("Name"), "sz": si(hp.get("MaxSize"))})

    print("✅ Proceso terminado. Refrescá Supabase.")

if __name__ == "__main__":
    main()