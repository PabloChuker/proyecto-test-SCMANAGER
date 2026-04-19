# Ingest Star Citizen 4.7.1-live — runbook

**Status (2026-04-19):** SCAFFOLDING — los phase stubs de `ingest_v4.py` están vacíos, hay que rellenarlos desde `ingest_v3.py`.

## TL;DR

Cuando Roberts Space Industries empuje el dump de datamining `4.7.1` a `scunpacked-data`:

```powershell
# 1. Clonar o refrescar el checkout local
cd C:\datos\
git clone https://github.com/StarCitizenWiki/scunpacked-data
# (o si ya existe: git -C scunpacked-data pull --ff-only)

# 2. Dry run (no toca BD)
cd C:\Users\carsd\OneDrive\Escritorio\Sc_LABS\proyecto-test-SCMANAGER
python scripts/ingest_v4.py --version 4.7.1-live --dry-run --local-path C:\datos\scunpacked-data

# 3. Aplicar migración 051 (dataset_versions) en Supabase antes de correr real
#    (ver TODO en header del script)

# 4. Aplicar real
python scripts/ingest_v4.py --version 4.7.1-live --local-path C:\datos\scunpacked-data
```

## Cambios específicos que trae 4.7.1 (que tocan la ingesta)

1. **Hull B (RSI)** — cargo hauler mediano. Se espera como `Ship` type con hardpoints standard. Debería entrar por `phase_b_ships` sin fricciones, siempre que el dump scunpacked lo incluya (a veces hay retraso de 1–2 semanas entre el release en vivo y el dump).

2. **Ground vehicle nuevo** — (confirmar nombre exacto leyendo `labels.json`). Tiene que ir a `vehicles` como type `VEHICLE` según `TYPE_MAP`. Actualmente no tenemos tabla `vehicles` separada — decisión pendiente: reusar `ships` con flag `is_vehicle=true` o crear tabla dedicada.

3. **Thermal profile refinado en weapon_guns** — algunas armas ajustaron `thermal_per_shot` y `thermal_dissipation`. La migración 046 añadió las columnas; la ingesta debe refrescarlas con `ON CONFLICT DO UPDATE`.

4. **Mining signatures refresh** — `mining_compiled.json` de gstool/citizen-starter ya está en versión `4.7.1-live`. Los seeds de migración 050 se alinean. **No hay que re-ingerir** a menos que gstool publique un update con más yields.

## Tablas que tocará la ingesta

- `ships`, `ship_hardpoints`, `ship_pools`, `ship_power_reference`
- `weapon_guns` (incluyendo `thermal_per_shot`, `thermal_dissipation`, `energy_per_shot`, `ammo_capacity`)
- `missiles`, `missile_launchers`
- `shields`, `power_plants`, `coolers`, `quantum_drives`, `quantum_interdiction_generators`, `emps`
- `scanners` (⚠ migración 025 incompleta, resolver antes — task #12)
- `turrets`, `weapon_attachments`, `weapon_defensives`, `weapon_mining`
- `radars`, `flight_controllers`, `life_support_generators`, `fuel_intakes`, `fuel_tanks`, `main_thrusters`, `manneuver_thrusters`
- `armors`, `cargo_grids`, `containers`, `paints`
- **Nueva:** `dataset_versions` (requiere migración 051 — TODO)

## Guard rails antes de correr en prod

1. **Backup Supabase.** El dashboard tiene la opción de snapshot — hacer uno manual antes de la primera corrida de 4.7.1, por si algún `ON CONFLICT DO UPDATE` mal escrito rompe un campo crítico (ej. sobrescribir `power_draw` de power plants con NULL).

2. **Dry run obligatorio.** Correr siempre con `--dry-run` primero y revisar que los counts (`items: X`, `ships: Y`) sean razonables — si `items: 0` algo está muy mal con el `local-path`.

3. **Snapshot de `ships` antes del upsert.** Después del primer ingest de 4.7.1 vamos a querer comparar qué cambió:
   ```sql
   CREATE TABLE ships_snapshot_pre_471 AS SELECT * FROM ships;
   -- correr ingest
   SELECT s1.id, s1.name, s1.scm_speed AS old, s2.scm_speed AS new
   FROM ships_snapshot_pre_471 s1
   JOIN ships s2 ON s2.id = s1.id
   WHERE s1.scm_speed <> s2.scm_speed;
   ```

4. **Política de rollback.** Si el ingest rompe algo crítico:
   ```sql
   TRUNCATE ships RESTART IDENTITY CASCADE;
   INSERT INTO ships SELECT * FROM ships_snapshot_pre_471;
   ```
   (cuidado con FKs — puede requerir re-ingestar hardpoints también).

## Tareas pendientes para completar el scaffolding

- [ ] Copiar lógica real de `ingest_v3.py` a los phase stubs de `ingest_v4.py`.
- [ ] Crear `database/migrations/051_create_dataset_versions.sql`.
- [ ] Decidir si Hull B va a `ships` o a nueva tabla `vehicles`.
- [ ] Añadir `thermal_profile` handling en phase_a (weapon_guns).
- [ ] Validar que `TYPE_MAP['GroundVehicle']` / `'HullCargoModule'` matchean los nombres reales en el dump 4.7.1.
- [ ] Testear el script end-to-end contra un Supabase de staging (no prod) en una branch antes de mergear.

## Riesgos conocidos

- **Retraso del dump.** scunpacked-data suele tardar 3–10 días después del live release en hacer push del dump completo. Si Hull B no aparece, el script no falla — solo loguea warning en phase_b.
- **Colisión de IDs.** El mismo `id` de un componente puede tener cambios no-retrocompatibles en un patch (ej. `Attrition-2` pasó de size 1 a size 2 en un patch pasado). El `ON CONFLICT DO UPDATE` rescribe todo — hay que chequear que ningún loadout apunte al viejo antes de correr.
- **Ammo capacity sigue en 0 para 104 armas.** Task #10. Hasta que se pueble, el sustained DPS de balísticas queda roto. Se puede fixear manualmente con un seed (`scripts/populate_ammo_capacity.mjs` — no existe aún, TODO).

---

Redactado por el audit nocturno del 2026-04-19. Actualizar cuando corra la primera ingesta real de 4.7.1.
