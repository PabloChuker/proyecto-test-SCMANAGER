# VerseTools — Fórmulas (Star Citizen) · referencia canónica para SC Labs

> Fuente: <https://versetools.games/formulas> · Extraído: 2026-05-02
>
> Validado in-game con error <1.5 % por el autor de VerseTools. Esta es la
> fuente de verdad para SC Labs: si nuestro código difiere de acá, nuestro
> código está mal (a menos que haya razón documentada). El doc completo
> `.docx` está en `/sessions/.../mnt/Sc_LABS/VerseTools_Formulas_SC.docx`.

---

## 1. Sistema de Energía

**Total Power Output**

```
Single Power Plant:
    Total Power = Plant Output

Multiple Power Plants (pairing penalty):
    Each PP contributes = ceil( Output / 2 ) + Size
    Total Power = Σ( ceil( Output_i / 2 ) + Size_i )
```

Validado en Sabre (S1), Valkyrie (S2) y Redeemer (S3) con 6 configuraciones.
Ej: SonicLite (13) + JS-300 (17) en Sabre → ceil(13/2)+1 + ceil(17/2)+1 = 8+10 = 18 pips.

**Total Power Used**

```
Total Power Used = sum(Component Pips) + Weapon Pips + Thruster Pips + Tool Pips + Tractor Pips
```

**Weapon Power Pool**

```
Max Weapon Pips = min( Ship Pool Size, ceil(Total Weapon Power Cost) )
```

**Power Band Modifier**

```
Band Modifier at Pips:
    Pips <= 0  → 0       (off)
    no bands   → 1       (full)
    otherwise  → eficiencia de la banda más alta cuyo umbral <= Pips
```

**Min Pip Block (band-gap)**

```
Min Block = Band 2 Threshold - Band 1 Threshold   (si tiene 2+ bandas)
Min Block = 1                                       (single band)
```

**Default Allocation**

| Componente | Default |
|---|---|
| Weapons | 50 % del pool |
| Shields | 50 % del max, mínimo el threshold |
| Coolers | pip mínimo de banda |
| Life Support | 1 pip (siempre on) |
| Radar | max(1, round(Power Cost × Idle Fraction)) |
| QD | 0 pips (off al spawn) |
| Tools | 1 pip (MOLE: 2 pips por turret) |
| Tractor | 2-pip block |

---

## 2. Armas & DPS

**Energy Weapon Ammo (pooled)**

```
Effective Magazine = Base Magazine × Ship Ammo Multiplier
Magazine Cap       = floor(Effective Magazine)
Ammo at Pips(N)    = min( round(N × Effective Magazine / Total Weapon Power), Magazine Cap )
```

**Ballistic Weapon Burst**

```
Burst Rounds = floor(Heat Capacity / Heat Per Shot)
Burst Time   = Burst Rounds / (Cyclic Rate / 60)
```

**Alpha Damage**

```
Alpha = Physical + Energy + Distortion + Thermal
```

**Sustained DPS (10 s window)**

```
Ballistic:
    Cycle Time  = Burst Time + Overheat Cooldown
    Full Cycles = floor(10 / Cycle Time)
    Remaining   = 10 - Full Cycles × Cycle Time
    Total Dmg   = Full Cycles × Burst Dmg + min(Remaining, Burst Time) × RPS × Alpha

Energy:
    Regen Time = Regen Delay + Base Magazine / Regen Rate
    Cycle Time = Burst Time + Regen Time
```

**Energy Sustained Ratio**

```
Sustained Ratio(N) = (300 × N) / (300 × N + Cyclic Rate RPM)
where 300 = Regen Constant = (Magazine/Restock Cycles) × Regen Rate × 60 = (75/3) × 15 = 300
```

---

## 3. Cadencia de Disparo — DPS Real

```
ticks    = ceil(1800 / listed_RPM)
real_RPM = 1800 / ticks
```

Solo aplica a sequence weapons con 2+ entries (repeaters). Gatlings y single-entry cannons NO se ven afectados.

**Dead Zone**: cualquier sequence weapon con RPM listado **601–899 → real 600 RPM**. Ejemplo: Sawbuck 825 RPM real = 600 RPM (-27 % loss).

| Listed | Ticks | Real | Loss | |
|---|---|---|---|---|
| 300 | 6 | 300 | 0 % | sweet spot |
| 350 | 6 | 300 | 14 % | |
| 360 | 5 | 360 | 0 % | sweet spot |
| 450 | 4 | 450 | 0 % | sweet spot |
| 500 | 4 | 450 | 10 % | |
| 600 | 3 | 600 | 0 % | sweet spot |
| 750 | 3 | 600 | 20 % | |
| 825 | 3 | 600 | 27 % | |
| 899 | 3 | 600 | 33 % | worst case |
| 900 | 2 | 900 | 0 % | sweet spot |

---

## 4. Escudos

**Total Shield HP**

```
Total Shield HP = sum(Shield Health) para TODOS los shields (primary + reserve)
```

Solo los **primeros 2 shields son primary** (regen + HP + power pips). Los demás son reserve (solo HP, sin regen).

**Shield Regen (linear)**

```
Shield Regen Rate = Max Regen × (Allocated Pips / Max Pips)

    Max Regen      = sum(Regen Speed)        solo primary
    Allocated Pips = sum(Current Pips)       solo primary
    Max Pips       = sum(max(1, Power Ceiling - 1))  solo primary
```

**Regen Time**

```
Regen Time = Total Shield HP / Shield Regen Rate
```

**Shield Power Distribution**

```
Phase 1: dar a cada shield su mínimo (band-gap) primero
Phase 2: distribuir pips restantes hasta el max de cada shield

Min Pips = Band 2 Threshold - Band 1 Threshold   (per shield)
Max Pips = Power Ceiling - 1                      (per shield)
```

**Resistances & Absorptions** (lineal con pips)

```
Resist at Pips = resistMin + (resistMax - resistMin) × (Pips / Max Pips)
    + reduce damage al shield, − amplifica
    Shield Damage = Incoming × (1 - Resist)

Absorption at Pips = absMin + (absMax - absMin) × (Pips / Max Pips)
    1.0 = 100 % al shield, 0 al hull
    0.45 = 45 % shield / 55 % bleeds
    Hull Bleedthrough = Incoming × (1 - Absorption)

Per damage type: Physical, Energy, Distortion
```

---

## 5. Firmas (EM / IR / CS)

**EM Signature**

```
EM = sum(Component EM)

    Power Plants: emMax × (Total Power Used / Total Power Output)
    Weapons:      emSignature  (si weapon pool > 0; sino 0)
    Others:       emMax × Band Modifier at Current Pips
                  (Shields, Coolers, QD, Life Support, Radar)
```

**El multiplicador `signalEM` del armor NO se aplica** al total mostrado.

**IR Signature**

```
IR = irMax × max( MCF, Demand / Supply ) × Armor signalIR

    irMax  = sum(Cooler irSignature × Band Modifier)  para coolers activos
    MCF    = promedio ponderado de Min Consumption Fraction
    Demand = demanda total de cooling
    Supply = supply total de cooling al pip actual
```

A diferencia de EM, **el multiplicador IR del armor SÍ se aplica**.

**CS — Cross Section**

```
CS = Base Hull CS × Armor CS Multiplier

Estimación (cuando no hay base validado):
    CS ≈ 253 × mass^0.33 × CS Multiplier^1.4
```

12 ships validados in-game: Arrow (7.4k), Gladius (9.7k), Hawk (11.2k), Eclipse (4.3k), Talon (3.0k), 400i (19.7k), Vanguard (22.7k), Andromeda (23.9k), Spirit C1 (24.7k), 600i (24.7k), Starlancer TAC (18.2k), Polaris (42.4k).

CS multipliers comunes: stealth 0.55–0.85 (Eclipse 0.6, Prowler 0.55, Ghost 0.72), standard 1.0–1.5, heavy 1.13–1.4 (Hornets 1.13, Vanguard 1.33, Starfarer 1.4).

---

## 6. Armadura

**Deflection**

```
if Weapon Alpha <= Armor Deflect Value → Damage = 0
if Weapon Alpha >  Armor Deflect Value → daño completo

Umbrales separados Physical / Energy.
```

**Damage per Shot — CONFIRMED**

```
Armor Damage = Weapon Alpha × Damage Modifier

    < 1.0 → reduce damage; = 1.0 → full; > 1.0 → amplifica
    per type: Physical, Energy, Distortion

Shots to Strip = ceil( Armor HP / (Weapon Alpha × Damage Modifier) )
```

Validado: Asgard 0.50 energy → 11.6 % obs ≈ 11.5 %. Guardian MX 1.10 → 42 % = 42 %. Polaris 0.60 → 5.0 % = 5.0 %.

**Hull Bleedthrough** (bajo investigación)

Datos observados Ion vs Asgard sin shields:

```
Shot 1 (armor 100 %) → 3 % hull
Shot 5 (armor 42 %)  → 4–5 % hull
Shot 9 (armor 0 %)   → 7 % hull
```

Polaris no mostró bleedthrough en 20 shots → capitales pueden tener regla distinta.

**Durability** — bajo investigación (NO controla armor damage según testing).

**Penetration**

```
Fuse Penetration       = chance al fuse
Component Penetration  = chance a componentes internos
0.0 = full protección, 1.0 = sin protección
```

---

## 7. Refrigeración

**Cooling Supply (per cooler)**

```
Cooler Supply = coolingRate × pips × bandMod(pips) / maxPips
    maxPips = powerMax - 1
    bandMod = eficiencia al pip actual
    Pips = 0 → Supply = 0
```

**Cooling Demand**

```
Total Demand = PP_IDLE + Σ(pips × weight)
PP_IDLE = 0.04
```

| Componente | Weight (heat/pip) | Tier |
|---|---|---|
| Life Support | 2.300 | high |
| Quantum Drive | 2.070 | high |
| Radar | 1.988 | high |
| Shields | 1.978 | high |
| Thrusters | 1.032 | low |
| Tools/Tractors | 0.966 | low |
| Coolers | 0.939 | low |
| Weapons | 0.900 | low |

**Cooling %**

```
Cooling % = round(Total Demand / Total Supply × 100)
```

Validado en Aurora MK II, Guardian, Guardian MX, Crusader Intrepid, Asgard. Error máx 2 %. Per-ship overrides en Polaris y Mercury Star Runner.

⚠️ El multiplier 2.5 del config de resource network NO se aplica al display real (refutado in-game).

---

## 8. Vuelo & Propulsores

**Rotation Rate Scaling**

```
Thruster Multiplier = (Current Thruster Pips - 1) / (Max Thruster Pips - 1)
                       (si Max Pips <= 1: Multiplier = 1)

Rotation Rate = Base Rate + Thruster Multiplier × (Boosted Rate - Base Rate)
```

Linear interpolation entre base (1 pip) y boosted (max pips). Aplica a pitch, yaw, roll independientemente.

---

## 9. Minería

**Mining Power con Modules**

```
Combined Power Mult = product(Module Power Multiplier)  multiplicativo
Combined Min Power  = round(Laser Min Power × Combined Mult)
Combined Max Power  = round(Laser Max Power × Combined Mult)
```

**Stat Modifiers** (Instability, Optimal Window, etc) — **aditivos**:

```
Total Stat = Laser Base + sum(Module Adjustment)
```

47 locaciones mapeadas en Stanton, Pyro, Nyx con distribución completa.

---

## 10. Radar

**Lock Range**

```
Pip Fraction = min(Current Pips / Max Pips, 1)
Lock Range   = round( Min Lock Distance + (Max - Min) × Pip Fraction )
```

**Min Pips**

```
Radar Min Pips = max(1, round(Power Cost × Idle Consumption Fraction))
                   (típico Idle Fraction = 0.25)
```

---

## 11. Viajes Cuánticos

**Range**

```
Range (Gm)         = Quantum Fuel Capacity (SCU) / Fuel Rate (SCU/Gm)
Fuel Rate (SCU/Gm) = mSCU per Gm ÷ 1000
```

**Fuel Used**

```
Fuel Used (SCU) = Distance (Gm) × Fuel Rate (SCU/Gm)
Tank %          = Fuel Used / Quantum Fuel Capacity
```

**Travel Time** (aprox — ignora ramp stage-1/stage-2)

```
Cruise Time = Distance / Drive Speed
Total Time  ≈ Cruise + Spool + Calibration + Cooldown
```

**Tasas típicas**: Military 10–14 mSCU/Gm · Competition ~16 · Civilian ~18 · Industrial ~26 · Capital S4 47–120 (890J, Idris, Javelin).

⚠️ Mass NO afecta significativamente SCU/Gm.

---

## 12. Carga

```
SCU Per Grid = floor(Width / 1.25) × floor(Length / 1.25) × floor(Height / 1.25)
Total Cargo  = sum(SCU Per Grid) para todos los grids del default loadout
```

---

## 13. Crafting

**Quality Modifier**

```
t = (Clamped Quality - Range Start) / (Range End - Range Start)
Modifier = Start Mult + t × (End Mult - Start Mult)

Clamped Quality = clamp(Quality, Range Start, Range End)
Quality range: 0 – 1000
```

**Combined Modifier** (multi-ingredient)

```
Combined Modifier = product(Ingredient Modifier)  per stat (multiplicativo)
1.0 = neutro, > 1.0 buff, < 1.0 nerf
```

**Dismantle**

```
Returned Quantity = floor(Original Quantity × 0.5)
Recursos < 0.01 SCU no devuelven nada.
```

---

## 14. Contratos

- 38 reputation scopes con 224 ranks totales
- 54 tiers de rep reward (rango -640,000 a +64,000)
- Cada contrato: success/failure rep amount + completion/abandon cooldowns
- Data merged: mission broker (legacy: rewards/locations) + contract generator (current: blueprints/rep/chains)

---

## Notas finales

- El sitio es un proyecto comunitario de VerseTools (no oficial CIG/RSI).
- Todas las fórmulas marcadas "CONFIRMED" están validadas in-game.
- Las "bajo investigación" (Hull Bleedthrough exacta, Durability) deben usarse con disclaimer.
- Para verificar cambios: el sitio se actualiza con cada patch del juego.
