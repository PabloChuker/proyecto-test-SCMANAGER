# SC Labs — Investigación del Modelo de Energía y Emisiones

**Fecha:** 16 de abril de 2026
**Autor:** análisis de `scunpacked/` + `src/data/*.json` + `database/migrations/`
**Scope:** Entender las interacciones reales de energía, enfriamiento y emisiones del juego para alimentar el LoadoutBuilder (sclabs.space/dps) con datos fieles, sin inventar nada.
**Estado:** Modelo identificado. Schema Supabase propuesto en §8.

---

## 1. Resumen ejecutivo

Después de bucear `scunpacked/` (291 naves + 4852 items) y los JSONs `src/data/power-network-lookup.json` (786 componentes) y `src/data/ship-power-data.json` (291 naves), la conclusión es:

- **La mayoría del modelo ya está extraído** en `power-network-lookup.json`. No tenemos que reinventar la rueda, pero hay que agregarlo a Supabase con relaciones claras y completar los campos faltantes (IR por componente, pipas reales, rangos de `PowerRanges`, emisiones por modo).
- **La regla de agregación por tipo es LINEAL** para consumo en SCM: `UsedSegmentsGrouped[Type] == sum(pMax)` de cada componente de ese tipo en el loadout (validado en Avenger Titan, Hammerhead, Cutlass Black, 890 Jump).
- **La generación de una planta de potencia NO es lineal cuando hay varias**: el Hammerhead con 2×24 reporta `GenerationSegments = 30`, no 48. La no-linealidad está dictada por una constante ship-level (`MaxPowerGeneration` del XML del juego) que scunpacked ya aplicó al vuelo. Por eso, **la fuente de verdad de la generación por nave es `ships.json[N].Power.GenerationSegments`**, no la suma de `genP` del catálogo.
- **Las emisiones (Em / Ir) son agregadas de forma combinada** por scunpacked usando un coeficiente ship-level (`EmPerSegment ≈ 495.33` en el Avenger Titan). No es trivial reproducirlas sin conservar la agregación scunpacked para el loadout default.
- **`src/lib/computeStats.ts` actualmente suma `powerDraw` y `emSignature` de forma naïve** y es por eso que los números no coinciden con Erkul/juego. La solución no es cambiar el modelo, es alimentarlo con los datos correctos desde Supabase y aplicar las reglas canónicas.

**Decisión estratégica:** Almacenar **dos fuentes** en Supabase:

1. **Catálogo de componentes** (tablas por tipo, ya existen 6 de las 10 necesarias) con `pMin`, `pMax`, `cMin`, `cMax`, `em`, `ir`, `pips`, `ranges`. Para cálculos en caliente cuando el usuario cambia componentes.
2. **Snapshot de stock por nave** (`ship_power_reference`) con los valores pre-calculados de `ships.json` (`GenerationSegments`, `UsedSegmentsShields/Quantum`, `UsedSegmentsGrouped`, `EmGroupsShields/Quantum`, `IrShields/Quantum`). Fuente de verdad para loadout stock; validador de precisión para loadout custom.

---

## 2. Hallazgos del dataset `scunpacked/`

### 2.1 Estructura de `scunpacked/ships.json` (291 naves)

Cada nave tiene, además de los specs básicos, 3 bloques clave que son la **fuente de verdad** del modelo energético:

```jsonc
{
  "ClassName": "AEGS_Avenger_Titan",
  "Power": {
    "GenerationSegments": 15,                    // output real de las PPs (post-cap ship-level)
    "UsedSegmentsShields": 25.1,                 // consumo total en modo SCM
    "UsedSegmentsQuantum": 19.1,                 // consumo total en modo Nav (QT on, shields off)
    "UsedSegmentsGrouped": {                     // consumo por familia
      "FlightController": 4, "WeaponGun": 3.1, "Radar": 5,
      "Cooler": 6, "Shield": 6, "LifeSupportGenerator": 1
    }
  },
  "Cooling": {
    "GenerationSegments": 68,                    // capacidad de disipación de los coolers
    "UsedSegmentsShields": 37.1,
    "UsedSegmentsQuantum": 29.1,
    "UsedSegmentsShieldsGrouped": { "LifeSupportGenerator": 1, "PowerPlant": 25.1, "Radar": 5, "Shield": 6 },
    "UsedSegmentsQuantumGrouped":  { "LifeSupportGenerator": 1, "PowerPlant": 19.1, "QuantumDrive": 4, "Radar": 5 },
    "UsedSegmentsShieldsPct": 0.55,
    "UsedSegmentsQuantumPct": 0.43
  },
  "Emission": {
    "EmShields": 24227, "EmQuantum": 37449,      // EM total en SCM vs Nav
    "IrShields": 8714,  "IrQuantum": 6835,       // IR total en SCM vs Nav
    "EmPerSegment": 495.33,                      // factor global de la nave
    "EmGroupsShields": { "Cooler": 3278, "PowerPlant": 13676, "Radar": 1980, "Shield": 3278, "WeaponGun": 1671, "LifeSupportGenerator": 344 },
    "EmGroupsQuantum": { "Cooler": 3278, "PowerPlant": 13676, "Radar": 1980, "QuantumDrive": 16500, "WeaponGun": 1671, "LifeSupportGenerator": 344 },
    "EmSegmentGroupsShields": { "Cooler": 6, "FlightController": 4, "LifeSupportGenerator": 1, "Radar": 5, "Shield": 6, "WeaponGun": 3.1 }
  },
  "PowerPools": {                                // tamaños máximos por familia (caps del loadout)
    "WeaponGun": { "Size": 4 }, "Shield": { "Size": 2 }, "FlightController": { "Size": -1 }
  },
  "ShieldsTotal": { "Hp": 5400, "Regen": 339, "RegenRaw": 514, "RegenMinPower": 342.67 }
}
```

**Clave:** estos valores ya están **calculados por scunpacked** aplicando la lógica del juego. Si los importamos tal cual, tenemos la verdad del stock loadout.

### 2.2 Catálogo de componentes (`scunpacked/ship-items.json`)

4852 items, con `type` normalizado (10 familias relevantes):

| Familia                          | Items | Tabla migración existente     |
|----------------------------------|------:|-------------------------------|
| `PowerPlant`                     |    87 | ✓ `020_create_power_plants`   |
| `Shield`                         |    72 | ✓ `027_create_shields`        |
| `Cooler`                         |    80 | ✓ `005_create_coolers`        |
| `QuantumDrive`                   |    62 | ✓ `021_create_quantum_drives` |
| `QuantumInterdictionGenerator`   |     6 | ✓ `023_create_quantum_interdiction_generators` |
| `Radar`                          |    70 | ✗ falta                       |
| `FlightController`               |   209 | ✗ falta                       |
| `LifeSupportGenerator`           |    13 | ✓ `014_create_life_support_generators` |
| `WeaponGun`                      |   188 | ✓ `032_create_weapon_guns`    |
| `WeaponMining`                   |    23 | ✗ falta (tabla propia)        |
| `MainThruster` / `ManneuverThruster` | 339/778 | ✓ `015` / `016`           |
| `MissileLauncher` / `Missile`    | 129/66 | ✓ `018` / `017`              |

**Gaps en el esquema existente** (ya hay buenas tablas pero les faltan columnas del modelo de energía):

1. **`power_plants`**: sólo tiene `power_generation` (un valor único). Le falta `power_consumption_min/max`, `coolant_consumption_min/max`, y las **PowerRanges** que son las 3 pipas.
2. **`shields`**: ya tiene `power_consumption_min/max` + `em_max` ✓. Le falta **pipas**, **ranges**, e **`ir_max`**.
3. **`coolers`**: tiene `power_consumption_min/max`, `em_max`, `ir_max`, `cooling_generation` ✓. Le falta **pipas**, **ranges**, **coolant_consumption_min/max**.
4. **`quantum_drives`**: faltan `power_consumption_min/max`, `em_max`, `ir_max`, `pipas`, `ranges`. Sólo tiene specs físicas.
5. **`weapon_guns`**: tiene `emission_em_max` ✓, pero le faltan `power_consumption_min/max` y `coolant_consumption_min/max`. El `heat_per_shot` es otra capa (termal interno del arma, no el power network).
6. **Falta completamente** la tabla `radars` (70 items) — crucial para el LoadoutBuilder.
7. **Falta completamente** la tabla `flight_controllers` (209 items) — es el mayor consumidor de energía del ship.

### 2.3 Anatomía de un `stdItem` con ResourceNetwork

Ejemplo concreto: **Juno Starwerk Endurance (S1 Grade B, Power Plant)** — el PP que usa el Avenger Titan.

```jsonc
"stdItem": {
  "UUID": "49d355d9-b5a5-454a-a6e8-dedb4bdffa02",
  "ClassName": "POWR_JUST_S01_Endurance_SCItem",
  "Type": "PowerPlant.Power",
  "Size": 1, "Grade": 2,
  "Name": "Endurance",

  "ResourceNetwork": {
    "DefaultPriority": 50,                 // prioridad cuando hay déficit
    "Generation": { "Power": 15 },         // genP de power-network-lookup.json
    "Usage": {
      "Power":   { "Minimum": 15, "Maximum": 15 },   // la PP es rígida (off/on)
      "Coolant": { "Minimum": 15, "Maximum": 15 }
    },
    "States": [{                            // estados operacionales
      "Name": "Online",
      "Deltas": [
        { "Resource": "Power",   "Type": "Generation",  "Rate": 15 },
        { "Resource": "Coolant", "Type": "Consumption", "Rate": 0  }
      ],
      "PowerRanges": [                      // las 3 pipas configurables
        { "Start": 0, "Modifier": 1, "RegisterRange": 0 },
        { "Start": 0, "Modifier": 1, "RegisterRange": 0 },
        { "Start": 0, "Modifier": 1, "RegisterRange": 0 }
      ],
      "Signature": { "EM": 7430 }
    }]
  },

  "Emission": { "Em": { "Maximum": 7430, "Minimum": 0, "Decay": 0.15 }, "Ir": 0 },
  "Distortion": {
    "Maximum": 4050, "DecayDelay": 1.5, "DecayRate": 270,
    "WarningRatio": 0.75, "ShutdownTime": 16.5,
    "PowerRatioAtMaxDistortion": 0,    // cuánto output queda al sufrir max distorsión
    "PowerChangeOnlyAtMaxDistortion": 1
  },
  "Durability": { "Health": 270, "Resistance": { ... } },
  "Temperature": {
    "Calculated": {
      "CoolingThreshold": 29.9,          // grados C en que el cooler tiene que empezar a actuar
      "IrThreshold": 49.9,               // grados en que empieza a emitir IR
      "Maximum": 131.9, "Overheat": 109.9
    }
  }
}
```

**Observaciones importantes:**

- `ResourceNetwork.Usage.Power.Minimum == Maximum == 15` → esta PP tiene **una sola pip** (rígida). No es regulable. Los 3 entries de `PowerRanges` son todos idénticos (`Modifier: 1`), confirmando que PPs son binarias: online = 15, offline = 0.
- `Signature.EM = 7430` (cuando está online) coincide con `Emission.Em.Maximum = 7430`.
- `Distortion.Maximum = 4050` + `ShutdownTime = 16.5s` + `DecayRate = 270/s` → si sufre 4050 puntos de daño distorsión, se apaga 16.5 segundos; cada segundo recuperas 270 de distorsión si no te siguen pegando.

### 2.4 Anatomía de un Shield regulable (Bulwark S1)

Ejemplo de `power-network-lookup.json` (del BASL Bulwark S1, 2 de los cuales equipa el Avenger Titan):

```jsonc
"SHLD_BASL_S01_Bulwark_SCItem": {
  "type": "Shield",
  "pMin": 2, "pMax": 3,                   // pipas 1 = consume 2, pipas 3 = consume 3
  "cMin": 1.7, "cMax": 3,
  "em": 1490, "pips": 2,
  "ranges": [
    { "m": 0.7,  "r": 0, "s": 0 },        // pip 0: modifier 0.7, start 0, registerRange 0
    { "m": 0.85, "r": 1, "s": 1 },        // pip 1: modifier 0.85, start 1
    { "m": 1.0,  "r": 1, "s": 2 }         // pip 2 (max): modifier 1.0, start 2
  ]
}
```

Interpretación (según comportamiento in-game):

- El usuario tiene un slider de 0 a 3 pipas para shields.
- En pip 0: shield off, consume 0, regen 0.
- En pip 1 (`start: 1`, `modifier: 0.7`): consume `pMin + (pMax-pMin)*0.7 ≈ 2.7` (pero en la práctica el sistema interpola entre `pMin=2` y `pMax=3` por modifier) → shield regen al 70% del máximo.
- En pip 2 (`modifier: 0.85`): ~85% del regen.
- En pip 3 (`start: 2`, `modifier: 1.0`): `pMax=3` consumo, regen al 100%.

**Nota:** el significado exacto de `Modifier / Start / RegisterRange` es un tema a cerrar con una ronda de ingeniería inversa sobre el comportamiento en juego, pero la estructura está capturada y podemos almacenarla tal cual.

### 2.5 QT Drive y la diferencia SCM vs Nav

Del Avenger Titan:

```
Power.UsedSegmentsShields (SCM): 25.1    // shields + coolers + guns + FC + radar + LS
Power.UsedSegmentsQuantum (Nav): 19.1    // FC + radar + LS + QT (2) + coolers + guns (sin shields)

UsedSegmentsShieldsGrouped:  { FC: 4, WeaponGun: 3.1, Radar: 5, Cooler: 6, Shield: 6, LifeSupport: 1 }
UsedSegmentsQuantumGrouped:  { FC: 4, WeaponGun: 3.1, Radar: 5, Cooler: 6, QT: 2,     LifeSupport: 1 }
```

**Ley confirmada:**
- **Modo SCM**: shields ON, QT OFF.
- **Modo Nav (Quantum)**: shields OFF, QT ON.
- Todo lo demás (FC, Radar, Cooler, Guns, LS) consume igual en ambos modos.

Este modo switch es visible en la UI del LoadoutBuilder (toggle `SCM ↔ NAV`) y ya lo contempla el diseño.

---

## 3. Validación del modelo lineal de consumo

Cálculo: `UsedSegmentsGrouped[type] == sum(pMax[i]) for i in loadout of that type`.

Comparación contra 4 naves de stock:

| Nave              | Tipo             | ships.json reporta | catálogo (sum pMax) | Match |
|-------------------|------------------|-------------------:|--------------------:|-------|
| Avenger Titan     | FlightController |                  4 |                   4 | ✓     |
| Avenger Titan     | Radar            |                  5 |                   5 | ✓     |
| Avenger Titan     | Cooler (×2)      |                  6 |                   6 | ✓     |
| Avenger Titan     | Shield (×2)      |                  6 |                   6 | ✓     |
| Avenger Titan     | LifeSupport      |                  1 |                   1 | ✓     |
| Hammerhead        | Shield (×2)      |                 10 |                  10 | ✓     |
| Hammerhead        | Cooler (×2)      |                 10 |                  10 | ✓     |
| Cutlass Black     | Shield           |                  3 |                   3 | ✓     |
| Cutlass Black     | Radar            |                  6 |                   6 | ✓     |
| 890 Jumper        | Shield           |                 12 |                  12 | ✓     |

**Conclusión:** el consumo por tipo es la **suma directa de `pMax`**. Esto vale para SCM. El `UsedSegmentsQuantum` se obtiene reemplazando `Shield` por `QuantumDrive` en la suma.

---

## 4. Descubrimiento crítico: la generación NO es lineal multi-PP

Cuando una nave tiene múltiples power plants, la generación reportada **no es** la suma de sus `genP`:

| Nave                          | n PPs | `genP` cada uno | catálogo sum | `ship.Power.GenerationSegments` | ratio |
|-------------------------------|------:|-----------------|-------------:|--------------------------------:|------:|
| Avenger Titan                 |     1 | [15]            |           15 |                              15 | 1.000 |
| Cutlass Black                 |     1 | [18]            |           18 |                              18 | 1.000 |
| Hammerhead                    |     2 | [24, 24]        |           48 |                              30 | 0.625 |
| Idris-P                       |     2 | [29, 29]        |           58 |                              38 | 0.655 |
| Starfarer Gemini              |     2 | [24, 24]        |           48 |                              30 | 0.625 |
| Perseus                       |     2 | [24, 24]        |           48 |                              30 | 0.625 |
| Paladin                       |     3 | [20, 20, 20]    |           60 |                              33 | 0.550 |
| Scorpius Antares              |     3 | [16, 16, 16]    |           48 |                              21 | 0.438 |
| Javelin                       |     4 | [29, 29, 29, 29]|          116 |                              76 | 0.655 |

**Patrón observado:** con 2 PPs del mismo tamaño, `ship.GenerationSegments ≈ primary + (extras × ~0.25)`. Con 3 o 4 PPs la regla varía por nave, indicando un parámetro ship-level (`MaxPowerGeneration` del XML original de CIG) que scunpacked ya aplicó.

**Implicación de diseño:** **nunca sumes ingenuamente** `genP` para naves multi-PP. Siempre consultá `ship_power_reference.generation_segments` de Supabase (snapshot) como verdad, y sólo usá las componentes del catálogo cuando el usuario cambie alguna PP — en ese caso, aplicá el mismo ratio empírico por nave (que también guardaremos como `ship_multipp_ratio`).

---

## 5. Modelo de emisiones (Em / Ir)

### 5.1 `EmPerSegment` es ship-specific

Del Avenger Titan:

```
Emission.EmPerSegment = 495.33
Emission.EmGroupsShields.Cooler = 3278   // 6 segments × ? = 3278 → coef ≈ 546.3
Emission.EmGroupsShields.Shield = 3278   // 6 segments × ≈546.3
Emission.EmGroupsShields.PowerPlant = 13676   // 25.1 segments × ≈544.9
```

Los coeficientes no son exactamente `EmPerSegment`. El algoritmo que aplica scunpacked usa `EmPerSegment` combinado con un ajuste por grupo (probablemente un `GroupMultiplier` en el XML original). No lo podemos reproducir sin los datos XML crudos.

**Decisión:** almacenar la agregación `EmGroupsShields/Quantum` y los totales `EmShields/EmQuantum/IrShields/IrQuantum` tal cual vienen de scunpacked. Para loadouts modificados, usar una **aproximación conservadora**: `ΔEm ≈ sum(em_componente_nuevo) − sum(em_componente_original)` aplicada sobre el total, y marcar claramente en la UI que es "estimación sobre la base stock" (o sea: si cambiás solo el shield, tomamos `EmShields_original − em_stock_shield + em_new_shield`).

### 5.2 `IrShields` / `IrQuantum`

Sólo los coolers tienen `ir` en el catálogo (cooler Bracer S1 = 7260). Los demás componentes no reportan `ir` en `power-network-lookup.json`. Sin embargo, el ship-level reporta `IrShields = 8714` para el Avenger Titan, que es mayor al `ir` total de coolers (14520). Eso significa que `IrShields` **no es la suma directa** de los Ir de los componentes; es una agregación ponderada por consumo de energía + temperatura.

**Decisión:** igual que con EM, mirror del snapshot; aproximación `Δ` cuando el usuario cambia algo.

### 5.3 Por qué Shield ≠ Shield en EmGroupsQuantum

```
EmGroupsShields:  { Shield: 3278, QuantumDrive: absent }
EmGroupsQuantum:  { Shield: absent, QuantumDrive: 16500 }
```

Confirma la regla SCM/Nav: el shield no emite cuando está apagado (modo Nav); el QT emite 16500 de Em cuando activo (es muy ruidoso, lógica del juego).

---

## 6. El modelo de Cooling

```
Cooling.GenerationSegments: 68            // capacidad ship-level (similar a Power.GenerationSegments)
Cooling.UsedSegmentsShields: 37.1         // calor producido en SCM (los componentes "consumen" cooling)
Cooling.UsedSegmentsQuantum: 29.1         // calor producido en Nav
Cooling.UsedSegmentsShieldsPct: 0.55      // 55% capacidad usada en SCM
Cooling.UsedSegmentsQuantumPct: 0.43

Cooling.UsedSegmentsShieldsGrouped:
  { LifeSupport: 1, PowerPlant: 25.1, Radar: 5, Shield: 6 }
Cooling.UsedSegmentsQuantumGrouped:
  { LifeSupport: 1, PowerPlant: 19.1, QuantumDrive: 4, Radar: 5 }
```

**Observación:** **PowerPlant y QT también consumen cooling**, pero **no se computan en Power**. Hay una relación 1:1 entre `cMin/cMax` (coolant consumption) en el catálogo y estos valores:

- Endurance PP: `cMin=15, cMax=15` → aporta 25.1 a cooling en SCM? No, aporta 15 (porque 25.1 es el total de consumidores, no del PP).
- En realidad, `PowerPlant: 25.1` en el grouped es el **calor total generado por la máquina cuando corre a 25.1 segmentos de Power**, no el `cMax` del PP. La PP convierte energía en calor, y la cantidad de calor escala con el consumo de la red.

Esta es una sutileza importante: el `cMin/cMax` del catálogo es **cuánto COOLANT el componente demanda cuando está activo**. El total de calor de la nave es dominado por la PP y escala con `UsedSegmentsShields/Quantum`.

**Fórmula propuesta (para validación posterior):**

```
calor_total_SCM ≈ UsedSegmentsShields + calor_propio_PP_shields
                ≈ UsedSegmentsShields + (PP_cMax × factor_conversion)
```

pero como `UsedSegmentsShieldsGrouped.PowerPlant == UsedSegmentsShields`, el agregado ship-level ya lo incluye todo. Lo que hay que verificar es **que nuestro cálculo desde catálogo arroja el mismo valor**.

---

## 7. `src/data/*.json` — estado actual de la extracción

### 7.1 `power-network-lookup.json` (786 entries, 19kB)

Cobertura por tipo:

| Tipo                              | Items | `em` | `ir` | `pips/ranges` | `genP`/`genC` |
|-----------------------------------|------:|-----:|-----:|:--------------|:--------------|
| FlightController                  |   209 |   ✗  |   ✗  | ✓             | n/a           |
| WeaponGun                         |   174 |   ✓  |   ✗  | ✗ (solo pMin/pMax) | n/a       |
| PowerPlant                        |    82 |   ✓  |   ✗  | ✗             | ✓ `genP`      |
| Cooler                            |    80 |   ✓  |   ✓  | ✓             | ✓ `genC`      |
| Shield                            |    72 |   ✓  |   ✗  | ✓             | n/a           |
| Radar                             |    67 |   ✓  |   ✗  | ✓             | n/a           |
| QuantumDrive                      |    62 |   ✓  |   ✗  | ✓             | n/a           |
| WeaponMining                      |    23 |   ✗  |   ✗  | ✗             | n/a           |
| LifeSupportGenerator              |    12 |   ✓  |   ✗  | ✓             | n/a           |
| QuantumInterdictionGenerator      |     5 |   ✓  |   ✗  | ✗             | n/a           |

**Gaps a cerrar en Supabase:**
1. FlightController: le falta `em` (y toda la nave tiene un FC, contribuye mucho al EM).
2. Todas las familias: les falta `ir`. Sólo coolers lo traen.
3. WeaponGun y PowerPlant: les falta `pips/ranges`.
4. Precisión de `pMin/pMax` en FC: hay que confirmar que se interpreta como "consume este mínimo siempre y este máximo en combate".

### 7.2 `ship-power-data.json` (291 naves, 30kB)

Por nave:

```jsonc
"AEGS_Avenger_Titan": { "gen": 15, "pools": { "Shield": 2, "WeaponGun": 4 } }
```

Sólo captura **generación total** y **pool sizes**. No captura `UsedSegmentsShields/Quantum`, `UsedSegmentsGrouped`, ni las emisiones agregadas. **Este es el principal déficit** a llenar en Supabase.

---

## 8. Propuesta de schema Supabase

Migraciones nuevas (033–041). Todas siguen el mismo patrón de las existentes: PK = UUID del juego, comentarios exhaustivos, `raw_data jsonb` de respaldo.

### 8.1 Tabla maestra `ships`

```sql
create table if not exists ships (
  id                      uuid    primary key,          -- ships.json[n].UUID
  class_name              text    not null unique,      -- "AEGS_Avenger_Titan"
  name                    text    not null,
  description             text,
  career                  text,
  role                    text,
  manufacturer_id         uuid,
  size                    integer,
  length_m                numeric,
  width_m                 numeric,
  height_m                numeric,
  mass_empty_kg           numeric,
  mass_loadout_kg         numeric,
  crew                    integer,
  is_spaceship            boolean,
  is_gravlev              boolean,
  cargo_scu               numeric,
  stowage_scu             numeric,
  -- Armor (single row, ships raramente tienen armaduras variables)
  armor_health            numeric,
  armor_physical_mult     numeric,
  armor_energy_mult       numeric,
  armor_distortion_mult   numeric,
  -- Shield controller
  shield_face_type        text,      -- "Bubble" / "Quadrant" / "Omni"
  shield_reconfig_cooldown numeric,
  shield_max_reallocation numeric,
  raw_data                jsonb
);

create index ships_class_name_idx on ships (class_name);
create index ships_manufacturer_idx on ships (manufacturer_id);
```

### 8.2 Tabla `ship_power_reference` — **el snapshot scunpacked**

Fuente de verdad para stock loadout.

```sql
create table if not exists ship_power_reference (
  ship_id                       uuid primary key references ships(id) on delete cascade,
  -- Power
  power_generation_segments     numeric,            -- Power.GenerationSegments
  power_used_scm                numeric,            -- Power.UsedSegmentsShields
  power_used_nav                numeric,            -- Power.UsedSegmentsQuantum
  power_used_grouped_scm        jsonb,              -- Power.UsedSegmentsGrouped (SCM-mode approximation)
  power_used_grouped_nav        jsonb,              -- UsedSegmentsQuantumGrouped (derived)
  -- Cooling
  cooling_generation_segments   numeric,
  cooling_used_scm              numeric,
  cooling_used_nav              numeric,
  cooling_used_pct_scm          numeric,
  cooling_used_pct_nav          numeric,
  cooling_used_grouped_scm      jsonb,
  cooling_used_grouped_nav      jsonb,
  -- Emissions
  em_shields                    numeric,
  em_quantum                    numeric,
  ir_shields                    numeric,
  ir_quantum                    numeric,
  em_per_segment                numeric,
  em_groups_scm                 jsonb,              -- por familia
  em_groups_nav                 jsonb,
  em_segment_groups_scm         jsonb,
  em_segment_groups_nav         jsonb,
  -- Shields aggregate
  total_shield_hp               numeric,
  total_shield_regen            numeric,
  total_shield_regen_raw        numeric,
  total_shield_regen_min_power  numeric,
  distortion_pool               numeric,
  -- Propulsion aggregate
  fuel_capacity_hydrogen        numeric,
  fuel_capacity_quantum         numeric,
  qt_range_km                   numeric,
  qt_speed_ms                   numeric,
  qt_spool_time_s               numeric,
  -- Meta
  multi_pp_ratio                numeric,            -- shipGen / sum(genP) — derived para re-compute futuro
  computed_at                   timestamptz default now(),
  source_version                text                  -- "scunpacked-2026-04-11" etc
);
```

### 8.3 Tabla `ship_pools` — límites por familia

```sql
create table if not exists ship_pools (
  ship_id       uuid    references ships(id) on delete cascade,
  item_type     text    not null,            -- "Shield", "WeaponGun", "FlightController"
  max_size      integer not null,            -- -1 = unlimited
  primary key (ship_id, item_type)
);
```

### 8.4 Tabla `ship_hardpoints` — slots físicos de cada nave

```sql
create table if not exists ship_hardpoints (
  id                uuid primary key default gen_random_uuid(),
  ship_id           uuid not null references ships(id) on delete cascade,
  hardpoint_name    text not null,            -- "hardpoint_power_plant"
  display_name      text,
  parent_hp_id      uuid references ship_hardpoints(id) on delete cascade,  -- para turrets con sub-HP
  item_type         text not null,            -- "PowerPlant" / "Shield" / ...
  item_sub_type     text,                     -- "PowerPlant.Power" / etc
  min_size          integer,
  max_size          integer,
  editable          boolean,
  editable_children boolean,
  stock_item_id     uuid,                     -- FK lógica al catálogo (no forzamos FK: el item puede ser placeholder)
  unique (ship_id, hardpoint_name)
);

create index ship_hardpoints_ship_idx on ship_hardpoints (ship_id);
```

### 8.5 Tablas nuevas de catálogo

**Radares** (falta):

```sql
create table if not exists radars (
  id                          uuid primary key,
  class_name                  text not null unique,
  item_name                   text,
  name                        text not null,
  description                 text,
  manufacturer_id             uuid,
  size                        integer,
  grade_number                integer,
  grade                       text,
  class                       text,
  -- Potencia
  power_consumption_min       numeric,
  power_consumption_max       numeric,
  coolant_consumption_min     numeric,
  coolant_consumption_max     numeric,
  pips                        integer,
  power_ranges                jsonb,             -- [{ start, modifier, register_range }, ...]
  -- Detección
  range_max_m                 numeric,
  cooldown_s                  numeric,
  sensitivity                 jsonb,             -- por tipo de firma { ir, em, cs, rs, db }
  piercing                    jsonb,
  -- Emisiones
  em_max                      numeric,
  ir_max                      numeric,
  -- Durabilidad
  health                      numeric,
  distortion_shutdown_damage  numeric,
  distortion_decay_delay      numeric,
  distortion_decay_rate       numeric,
  distortion_shutdown_time    numeric,
  mass                        numeric,
  width                       numeric,
  height                      numeric,
  length                      numeric,
  scu                         numeric,
  raw_data                    jsonb
);
```

**Flight Controllers** (falta — 209 items, es el componente más ubicuo):

```sql
create table if not exists flight_controllers (
  id                          uuid primary key,
  class_name                  text not null unique,
  name                        text not null,
  manufacturer_id             uuid,
  size                        integer,
  grade_number                integer,
  -- Potencia
  power_consumption_min       numeric,
  power_consumption_max       numeric,
  coolant_consumption_min     numeric,
  coolant_consumption_max     numeric,
  pips                        integer,
  power_ranges                jsonb,
  em_max                      numeric,
  ir_max                      numeric,
  -- Durabilidad y distorsión
  health                      numeric,
  distortion_shutdown_damage  numeric,
  distortion_shutdown_time    numeric,
  mass                        numeric,
  raw_data                    jsonb
);
```

### 8.6 Extensiones a tablas existentes (ALTER TABLE migrations)

Para cerrar los gaps identificados:

```sql
-- 035_extend_power_plants.sql
alter table power_plants add column if not exists power_consumption_min numeric;
alter table power_plants add column if not exists power_consumption_max numeric;
alter table power_plants add column if not exists coolant_consumption_min numeric;
alter table power_plants add column if not exists coolant_consumption_max numeric;
alter table power_plants add column if not exists pips integer;
alter table power_plants add column if not exists power_ranges jsonb;
alter table power_plants add column if not exists ir_max numeric;

-- 036_extend_shields.sql
alter table shields add column if not exists pips integer;
alter table shields add column if not exists power_ranges jsonb;
alter table shields add column if not exists coolant_consumption_min numeric;
alter table shields add column if not exists coolant_consumption_max numeric;
alter table shields add column if not exists ir_max numeric;

-- 037_extend_coolers.sql
alter table coolers add column if not exists pips integer;
alter table coolers add column if not exists power_ranges jsonb;
alter table coolers add column if not exists coolant_consumption_min numeric;
alter table coolers add column if not exists coolant_consumption_max numeric;

-- 038_extend_quantum_drives.sql
alter table quantum_drives add column if not exists power_consumption_min numeric;
alter table quantum_drives add column if not exists power_consumption_max numeric;
alter table quantum_drives add column if not exists coolant_consumption_min numeric;
alter table quantum_drives add column if not exists coolant_consumption_max numeric;
alter table quantum_drives add column if not exists pips integer;
alter table quantum_drives add column if not exists power_ranges jsonb;
alter table quantum_drives add column if not exists em_max numeric;
alter table quantum_drives add column if not exists ir_max numeric;

-- 039_extend_weapon_guns.sql
alter table weapon_guns add column if not exists power_consumption_min numeric;
alter table weapon_guns add column if not exists power_consumption_max numeric;
alter table weapon_guns add column if not exists coolant_consumption_min numeric;
alter table weapon_guns add column if not exists coolant_consumption_max numeric;
alter table weapon_guns add column if not exists ir_max numeric;
```

### 8.7 Resumen de migraciones nuevas

| # (propuesto) | Migración                        | Naturaleza            |
|:-------------:|----------------------------------|-----------------------|
| 033           | `create_ships`                   | Nueva tabla maestra   |
| 034           | `create_ship_power_reference`    | **Nueva — snapshot**  |
| 035           | `create_ship_pools`              | Nueva relación        |
| 036           | `create_ship_hardpoints`         | Nueva relación        |
| 037           | `create_radars`                  | Nueva tabla catálogo  |
| 038           | `create_flight_controllers`      | Nueva tabla catálogo  |
| 039           | `extend_power_plants_energy`     | ALTER TABLE           |
| 040           | `extend_shields_energy`          | ALTER TABLE           |
| 041           | `extend_coolers_energy`          | ALTER TABLE           |
| 042           | `extend_quantum_drives_energy`   | ALTER TABLE           |
| 043           | `extend_weapon_guns_energy`      | ALTER TABLE           |

(Además, dejamos limpia la numeración: el `024_*` faltante no lo reabrimos para no arriesgar migraciones ya aplicadas.)

---

## 9. Pipeline de ingesta propuesto

Un solo script en `scripts/ingest_power_model.py` que:

1. Lee `scunpacked/ship-items.json` → UPSERT en `power_plants`, `shields`, `coolers`, `radars`, `flight_controllers`, `quantum_drives`, `weapon_guns`, `life_support_generators` (todas las tablas de catálogo), llenando también las columnas nuevas (`power_ranges`, `pips`, `coolant_consumption_*`, `ir_max`).
2. Lee `scunpacked/ships.json` → UPSERT en `ships`, `ship_power_reference`, `ship_pools`.
3. Lee cada `scunpacked/ships/*.json` individual → UPSERT en `ship_hardpoints` (67 entries para el Avenger Titan, por ejemplo).
4. Calcula `multi_pp_ratio = ship.Power.GenerationSegments / sum(genP_of_loadout_PPs)` y lo escribe en `ship_power_reference`.
5. Escribe un log de diferencias (catálogo vs snapshot) para QA.

El mismo script se puede re-correr en cada versión nueva del juego (scunpacked tags por build). El `source_version` en `ship_power_reference` nos permite auditar desfases.

---

## 10. Reglas que el front-end debe implementar

### 10.1 Dos modos de cálculo en `computeStats.ts`

```
IF loadout === stock_loadout:
    usar ship_power_reference (verdad absoluta)
ELSE:
    recalcular desde catálogo:
    - power.generation = apply_multi_pp_ratio(sum(genP of equipped PPs))
    - power.used_scm   = sum(pMax of non-QT equipped) by type
    - power.used_nav   = sum(pMax of non-Shield equipped + QT) by type
    - em.scm           = reference.em_groups_scm - em_stock_delta + em_new_delta
    (y mismo patrón para cooling, ir)
```

### 10.2 UI debe indicar fuente

- Stock: badge verde "Datos del juego".
- Custom: badge amarillo "Estimación (loadout modificado)" + tooltip explicando la aproximación.

### 10.3 Respetar SCM vs NAV

El toggle ya existe en el panel. Hay que conectar:
- SCM → `power_used_scm`, `em_groups_scm`, `cooling_used_scm`, shields ON, QT OFF.
- NAV → `power_used_nav`, `em_groups_nav`, `cooling_used_nav`, shields OFF, QT ON.

### 10.4 Power grid visualization

El `PowerStatusGrid` puede dibujar:
- Barra `generation` = `power_generation_segments`
- Barra `consumption` = `power_used_scm` o `power_used_nav` según toggle
- Chips por familia desde `power_used_grouped_*`

---

## 11. Gaps conocidos / trabajo de seguimiento

1. **PowerRanges semantics**: qué significa exactamente `Modifier / Start / RegisterRange`. Hipótesis: `Start` es el número de pip mínimo en que el componente enciende, `Modifier` escala `pMax`, `RegisterRange` indica si ese tick de pip "cuenta" en la barra de power. Validar mirando el juego o Erkul.
2. **`EmPerSegment` fórmula exacta**: scunpacked ya lo resuelve. Si queremos reproducir para loadouts custom con mayor fidelidad, hay que inspeccionar el código de scunpacked (GitHub: [scunpacked](https://github.com/StarCitizenTools/scunpacked)).
3. **Weapon heat**: `heat_per_shot` está en la migración `032_weapon_guns` pero no lo unimos con el cooling system. En realidad son dos sistemas separados en juego (el heat interno de un arma puede "overheat" el arma, distinto del cooling network). No es blocker para el LoadoutBuilder.
4. **QT fuel rate**: `QuantumDrive.fuel_rate` está en la tabla pero la unidad no está documentada (probablemente `L/km`). Habrá que verificar con datos in-game.
5. **Radar detection ranges**: `Radar.range_max_m` no está en scunpacked con ese nombre; probablemente hay que derivarlo de `SignatureDetection` rules.

---

## 12. Checklist de implementación para la siguiente sesión

- [ ] Ejecutar las migraciones 033–043 en Supabase (staging primero, luego prod).
- [ ] Escribir el script `scripts/ingest_power_model.py` y correrlo para poblar las tablas.
- [ ] Crear endpoint `/api/ships/:id/power` que devuelva `ship_power_reference + ship_pools + stock hardpoints` en un solo round-trip.
- [ ] Refactorizar `src/lib/computeStats.ts` para consumir el snapshot cuando el loadout es stock y el catálogo+reglas cuando hay overrides.
- [ ] Conectar el toggle SCM/NAV a las dos vistas `scm` vs `nav`.
- [ ] QA contra Erkul con 3 naves: Avenger Titan (stock), Hammerhead (multi-PP), 890 Jumper (grande).

---

**Fin del informe.**

**Fuentes:**
- `scunpacked/ships.json` (291 naves, verdad agregada).
- `scunpacked/ship-items.json` (4852 items, `stdItem.ResourceNetwork`).
- `scunpacked/ships/*.json` (archivos individuales con `Loadout` detallado).
- `src/data/power-network-lookup.json` (786 componentes ya extraídos).
- `src/data/ship-power-data.json` (291 naves, sólo `gen` + `pools`).
- `database/migrations/*.sql` (tablas existentes de componentes).
- `src/lib/computeStats.ts` (lógica de agregación actual).
