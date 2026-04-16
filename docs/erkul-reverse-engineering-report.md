# Destilación Erkul — Informe Completo de Reverse-Engineering

**Fecha:** 2026-04-16
**Nave de prueba:** Asgard (Anvil Aerospace) — Dropship, S4
**Config stock:** 2× Maelstrom PP (20 cada una), 3× Arctic Cooler, 4× FullStop Shield, 6× Panther S3 (1 dual + 4 single), 1× Rhino S4 (turret)
**Herramienta:** erkul.games/live/calculator v4.7.1-LIVE.11592622
**Versión del juego:** 4.7.0-PTU.11509651

---

## 1. Modelo de Power del Asgard

### 1.1 Power Output Total

El Asgard tiene 2 power plants Maelstrom (rating 20 cada una, idénticas).
Fórmula de diminishing returns para plantas idénticas (ya implementada en useLoadoutStore):

```
Total = floor(rating × factor(n))
factor(n=2) = 1.24
Total = floor(20 × 1.24) = floor(24.8) = 24
```

**Erkul confirma: OUTPUT = 24 puntos**

### 1.2 Columnas de Power (Power Grid)

El Asgard tiene **9 columnas de power** con los siguientes máximos:

| Col | Sistema       | Max Pips | Default | Notas |
|-----|---------------|----------|---------|-------|
| 0   | Weapons       | 4        | 4       | Todas las armas en 1 columna |
| 1   | Shields       | 6        | 4       | 4× FullStop S2 |
| 2   | Thrusters     | 16       | 4       | 6 main + 12 maneuver (cap efectivo: 8) |
| 3   | Desconocido   | 1        | 0       | Sin efecto visible |
| 4   | Radar         | 5        | 1       | Surveyor S2 |
| 5   | Life Support  | 2        | 2       | Siempre al máximo |
| 6   | Cooler 1      | 4        | 4       | Arctic S2 |
| 7   | Cooler 2      | 4        | 4       | Arctic S2 |
| 8   | Cooler 3      | 4        | 4       | Arctic S2 |

**Total default:** 1+4+4+0+1+2+4+4+4 = 24 (usa TODO el output)

### 1.3 Relación Output ↔ Pips

Cada pip consume 1 punto de output. El total de pips asignados no puede exceder el output total (24).
Cuando `total_pips_asignados > output`, los sistemas se throttlean (cap efectivo).

---

## 2. Sweep de Weapons (Col 0: 1-4 pips)

**Config base:** shields=4, thrusters=4, radar=1, lifesupport=2, coolers=4+4+4

### 2.1 DPS y Munición por Pip

| Pip | Panther S3 (single) ||| Panther S3 (dual) || Rhino S4 (turret) ||| Total Pilot | Turret |
|-----|-------|------|------|-------|------|-------|------|------|-------------|--------|
|     | DPS   | Fire | Ammo | DPS   | Ammo | DPS   | Fire | Ammo | DPS         | DPS    |
| 1   | 72    | 3.8s | 48   | 144   | 96   | 212   | 3.8s | 96   | 433         | 212    |
| 2   | 127   | 7.7s | 96   | 254   | 192  | 375   | 7.7s | 192  | 764         | 375    |
| 3   | 171   | 11.5s| 144  | 342   | 288  | 505   | 11.5s| 288  | ~1,027      | 505    |
| 4   | 207   | 15.4s| 192  | 413   | 384  | 610   | 15.4s| 384  | 1,239       | 610    |

### 2.2 Fórmulas Descubiertas — Munición (Energy Weapons)

**La munición escala LINEALMENTE con los pips:**

```
ammo_at_pip = base_ammo × pip
```

Donde `base_ammo` es la munición base a 1 pip (del pool de 4 max):

| Arma | Base (1 pip) | Full (4 pips) | Ratio |
|------|--------------|---------------|-------|
| Panther S3 single | 48 | 192 | ×4 exacto |
| Panther S3 dual | 96 | 384 | ×4 exacto (2× single) |
| Rhino S4 | 96 | 384 | ×4 exacto |

**Fórmula general validada:**

```
ammo = base_ammo_per_pip × current_pips
     = (full_ammo / max_pips) × current_pips
     = full_ammo × (current_pips / max_pips)
```

### 2.3 ⚠️ PROBLEMA CON DATOS DE BD

Nuestro seed `weapon_capacitor_seed.sql` tiene:
- **Panther S3:** requestedAmmoLoad=18187, regenCostPerBullet=48.5
- **Rhino S4:** requestedAmmoLoad=27262.5, regenCostPerBullet=72.7

Fórmula actual en `HardpointSlot.tsx`:

```typescript
rounds = Math.round(requestedAmmoLoad × (pips/maxPips) / regenCostPerBullet)
```

| Arma | Nuestra fórmula (pip 4) | Erkul (pip 4) | Error |
|------|-------------------------|---------------|-------|
| Panther S3 | 18187/48.5 = **375** | **192** | +95% (casi 2×) |
| Rhino S4 | 27262.5/72.7 = **375** | **384** | -2.3% (casi OK) |

**Diagnóstico:**
- Para el Rhino, nuestra fórmula da 375 vs Erkul 384 — CERCANO pero no exacto
- Para el Panther, nuestra fórmula da 375 vs Erkul 192 — OFF por un factor de ~2×
- Ambas armas dan 375 con nuestros datos, pero Erkul muestra 192 y 384 (ratio 1:2)
- **Los datos del seed para el Panther probablemente están duplicados o provienen de una versión diferente del juego**
- Necesitamos re-extraer los datos de capacitor directamente del scunpacked-data actualizado

### 2.4 Sustained DPS vs Pips

El DPS sustained NO escala linealmente. Erkul calcula:

```
sustained_dps = total_damage_in_burst / (burst_time + reload_time)
```

Donde burst_time = ammo / fire_rate_per_second, y reload_time ≈ 25.2s (constante para el Panther).

### 2.5 Signatures por Weapon Pips

| Pip | EM | IR | CS | Consumption | Free Output |
|-----|----|----|----|-----------|----|
| 1 | 6.0K | 29.0K | 30.4K | 19% | 3 |
| 2 | 6.3K | 29.9K | 30.4K | 20% | 2 |
| 3 | 6.5K | 30.8K | 30.4K | 21% | 1 |
| 4 | 6.7K | 31.7K | 30.4K | 21% | 0 |

**EM:** +0.23K por pip (~233 por pip)
**IR:** +0.9K por pip (~900 por pip)
**CS:** constante (30.4K) — NO se afecta por pips de weapon

---

## 3. Sweep de Shields (Col 1: 1-6 pips)

**Config base:** weapons=1, thrusters=2, radar=1, lifesupport=2, coolers=4+4+4

### 3.1 Resultado: Shields NO Cambian con Shield Pips

| Pip | Shield HP | Shield Regen | Phys Res | Energy Res | Dist Res | Boost Regen |
|-----|-----------|-------------|----------|------------|----------|-------------|
| 1   | 52,800    | 439 hp/s    | 4.4%     | -32.6%     | 78.5%    | 53.3s       |
| 2   | 52,800    | 439 hp/s    | 4.4%     | -32.6%     | 78.5%    | 44.4s       |
| 3   | 52,800    | 439 hp/s    | 4.4%     | -32.6%     | 78.5%    | 38.1s       |
| 4   | 52,800    | 439 hp/s    | 4.4%     | -32.6%     | 78.5%    | 33.3s       |
| 5   | 52,800    | 439 hp/s    | 4.4%     | -32.6%     | 78.5%    | 29.6s       |
| 6   | 52,800    | 439 hp/s    | 4.4%     | -32.6%     | 78.5%    | 26.7s       |

**Hallazgos clave:**
1. **Shield HP: constante** — los pips de shield NO cambian el HP total
2. **Shield Regen: constante a 439 hp/s** — PERO este valor cambia con thrusters (ver §4)
3. **Resistencias: constantes** — no cambian con pips
4. **Boost Regen Time: DECRECE** con más shield pips (53.3s → 26.7s)

### 3.2 Boost Regen Time vs Shield Pips

```
boost_regen_time ≈ 160 / (shield_pips + 2)
```

Verificación: pip 1 → 160/3=53.3 ✓, pip 4 → 160/6=26.7... no, 160/6=26.7 pero pip 4 da 33.3.

Patrón real: 53.3, 44.4, 38.1, 33.3, 29.6, 26.7
Inversas: 0.01876, 0.02252, 0.02625, 0.03003, 0.03378, 0.03745
Delta: ~0.00375 por pip constante.

**Fórmula de boost regen:**
```
1/boost_regen_time = base_rate + increment × pips
base_rate ≈ 0.01501
increment ≈ 0.003745

boost_regen_time = 1 / (0.01501 + 0.003745 × shield_pips)
```

### 3.3 Signatures por Shield Pips

| Pip | EM | IR | CS | Consumption |
|-----|----|----|----|-----------| 
| 1 | 5.2K | 26.1K | 30.4K | 16% |
| 2 | 5.4K | 27.0K | 30.4K | 17% |
| 3 | 5.6K | 27.9K | 30.4K | 18% |
| 4 | 5.9K | 28.8K | 30.4K | 19% |
| 5 | 6.1K | 29.7K | 30.4K | 19% |
| 6 | 6.3K | 30.6K | 30.4K | 20% |

**EM:** +0.22K por pip (~220 por pip)
**IR:** +0.9K por pip (~900 por pip)
**CS:** constante
**Consumption:** +0.8% por pip

---

## 4. Sweep de Thrusters (Col 2: 1-16 pips)

**Config base:** weapons=1, shields=1, radar=1, lifesupport=2, coolers=1+1+1

### 4.1 Resultado: Velocidad y Rotación NO Cambian

| Pip | SCM Speed | Boost Fwd | Nav Max | Pitch/Yaw/Roll | Boosted P/Y/R | Boost Regen |
|-----|-----------|-----------|---------|----------------|---------------|-------------|
| 1-16 | 203 | 425 | 1,075 | 33/28/95 | 39/33/114 | 53.3s |

**TODOS los valores de movimiento son CONSTANTES sin importar los pips de thruster.**
Los thrusters en el power triangle NO afectan la velocidad, aceleración ni rotación del Asgard.

### 4.2 Lo que SÍ Cambia: Signatures y Consumption

| Pip | EM | IR | CS | Consumption | Free Output |
|-----|----|----|----|-----------|----|
| 1 | 2.8K | 11.4K | 30.4K | 52% | 15 |
| 2 | 3.2K | 12.6K | 30.4K | 59% | 14 |
| 3 | 3.6K | 14.1K | 30.4K | 66% | 13 |
| 4 | 4.0K | 15.6K | 30.4K | 75% | 12 |
| 5 | 4.6K | 17.0K | 30.4K | 85% | 11 |
| 6 | 5.0K | 18.3K | 30.4K | 92% | 10 |
| 7 | 5.4K | 19.7K | 30.4K | 101% | 9 |
| **8** | **5.4K** | **21.0K** | **30.4K** | **111%** | **8** |
| 9-16 | 5.4K | 21.0K | 30.4K | 111% | 8 |

**Cap efectivo: 8 pips.** Los pips 9-16 no producen ningún cambio adicional.

### 4.3 Shield Regen Cambia con Thruster Pips (!)

Descubrimiento inesperado: la regeneración de shields mostrada en el panel derecho cambia significativamente con los thrusters:

| Thruster Pip | Shield Regen (hp/s) |
|--------------|-------------------|
| 1 | 219 |
| 2 | 439 |
| 3 | 658 |
| 4 | 1,019 |
| 5 | 1,473 |
| 6 | 1,693 |
| 7 | 2,053 |
| 8+ | 2,508 |

**Esto requiere investigación adicional.** Puede ser:
1. Un efecto real donde el consumo total de power afecta la distribución de energía a los shields
2. Un artefacto del parser de texto (poco probable — verificado manualmente a pip 4 = 1,019)

### 4.4 Fórmulas de Signature (Thrusters)

**EM crece linealmente hasta pip 7, luego se estabiliza:**

```
EM(pip) ≈ 2400 + 430 × pip    (pips 1-7)
EM(pip) = 5400                  (pips 8+)
```

**IR crece linealmente hasta pip 8:**

```
IR(pip) ≈ 10000 + 1370 × pip   (pips 1-8)
IR(pip) = 21000                 (pips 8+)
```

### 4.5 Consumption (Thrusters)

```
consumption(pip) ≈ 45 + 8.3 × pip   (pips 1-8)
```

Los thrusters son el mayor consumidor de power del Asgard. A pip 8, consumen el 111% del output — un overload.

---

## 5. Sweep de Radar (Col 4: 1-5 pips)

**Config base:** weapons=1, shields=1, thrusters=4, lifesupport=2, coolers=1+1+1

| Pip | EM | IR | CS | Consumption | Free Output |
|-----|----|----|----|-----------|----|
| 1 | 4.0K | 15.6K | 30.4K | 75% | 12 |
| 2 | 4.5K | 17.1K | 30.4K | 83% | 11 |
| 3 | 4.9K | 18.6K | 30.4K | 92% | 10 |
| 4 | 5.4K | 20.1K | 30.4K | 100% | 9 |
| 5 | 5.4K | 21.6K | 30.4K | 108% | 8 |

**EM:** +0.35K por pip (350/pip), caps at 5.4K
**IR:** +1.5K por pip (1500/pip)
**CS:** constante
**Shield regen:** constante a 1,019 (thrusters at 4)
**Velocidad/rotación:** sin cambios

---

## 6. Sweep de Coolers (Cols 6-8: 1-4 pips cada uno)

**Config base:** weapons=1, shields=1, thrusters=4, radar=1, lifesupport=2

| Pip (×3) | Total Pips | EM | IR | CS | Consumption | Free Output |
|----------|------------|----|----|----|-----------|----|
| 1 | 3 | 4.0K | 15.6K | 30.4K | 75% | 12 |
| 2 | 6 | 4.7K | 19.4K | 30.4K | 43% | 9 |
| 3 | 9 | 5.4K | 24.0K | 30.4K | 27% | 6 |
| 4 | 12 | 6.0K | 29.0K | 30.4K | 19% | 3 |

**Descubrimiento crucial: Los coolers REDUCEN masivamente el consumption:**

```
consumption con coolers × 3 pips = 75%
consumption con coolers × 12 pips = 19%
```

Los coolers convierten power en coolant. A más coolant, menos heat buildup, lo que reduce el consumption % general del ship.

**Fórmula de signatures (coolers):**

```
EM aumenta: +0.67K por pip total (~670/pip total)
IR aumenta significativamente: +1.5K por pip total (~1500/pip total)
```

Los coolers aumentan EM/IR pero reducen dramaticamente el thermal stress (consumption).

---

## 7. Hallazgos Universales — Reglas del Power System

### 7.1 Lo que NO cambia con pips

| Stat | Cambia? | Notas |
|------|---------|-------|
| SCM Speed | ❌ | Constante en todos los sweeps |
| Boost Speed (fwd/bwd) | ❌ | Constante |
| Nav Max Speed | ❌ | Constante |
| Pitch/Yaw/Roll | ❌ | Constante |
| Boosted Pitch/Yaw/Roll | ❌ | Constante |
| Shield HP total | ❌ | Siempre 52,800 |
| Shield Resistances | ❌* | Depende de config, no de pips |
| CS (Cross Section) | ❌ | Siempre 30.4K |
| Missile damage | ❌ | Siempre 51,200 |
| Alpha damage | ❌ | Constante por arma |

### 7.2 Lo que SÍ cambia con pips

| Stat | Afectado por | Relación |
|------|-------------|----------|
| EM Signature | Weapons, Shields, Thrusters, Radar, Coolers | Lineal por pip, con cap |
| IR Signature | Weapons, Shields, Thrusters, Radar, Coolers | Lineal por pip |
| Consumption % | Todas las columnas | Suma de consumo individual |
| Weapon Ammo | Weapon pips | Lineal exacto (base × pip) |
| Weapon DPS (sustained) | Weapon pips | No lineal (depende de burst duration) |
| Weapon Fire Time | Weapon pips | Lineal (proporcional a ammo) |
| Boost Regen Time | Shield pips | Inversamente proporcional |
| Shield Regen (hp/s)* | Thruster pips (?) | Requiere verificación |

### 7.3 Fórmula General de Signatures

Cada sistema contribuye EM e IR proporcional a sus pips asignados:

```
total_EM = base_EM + Σ(system_em_per_pip × system_pips)
total_IR = base_IR + Σ(system_ir_per_pip × system_pips)
```

Contribuciones EM por pip:
- Weapons: ~233/pip
- Shields: ~220/pip
- Thrusters: ~430/pip (mayor contribuidor)
- Radar: ~350/pip
- Coolers: ~223/pip per total pip

Contribuciones IR por pip:
- Weapons: ~900/pip
- Shields: ~900/pip
- Thrusters: ~1,370/pip (mayor contribuidor)
- Radar: ~1,500/pip
- Coolers: ~500/pip per total pip

---

## 8. Correcciones Necesarias en SC Labs

### 8.1 CRÍTICO — Datos de Capacitor de Armas

Los datos en `weapon_capacitor_seed.sql` producen valores incorrectos:

| Arma | DB requestedAmmoLoad | DB regenCostPerBullet | Fórmula resultado (4 pips) | Erkul real (4 pips) |
|------|---------------------|----------------------|---------------------------|-------------------|
| Panther S3 | 18,187 | 48.5 | **375** | **192** |
| Rhino S4 | 27,262.5 | 72.7 | **375** | **384** |

**Acción:** Re-ejecutar `ingest_weapon_capacitor.py` contra la versión 4.7.1 del scunpacked-data. Los valores probablemente cambiaron con un balance patch.

### 8.2 CRÍTICO — Fórmula de Ammo en HardpointSlot.tsx

La fórmula actual es conceptualmente correcta:

```typescript
rounds = Math.round(requestedAmmoLoad × (pips/maxPips) / regenCostPerBullet)
```

**Pero depende de datos correctos en la BD.** Con datos correctos, esta fórmula produce valores exactos (Erkul confirma escalado lineal por pip).

### 8.3 IMPORTANTE — weaponMaxPips

El `weaponMaxPips` viene de `pools.WeaponGun` en el store. Para el Asgard es 4.
**Verificar que este valor se está pasando correctamente a HardpointSlot.** El flujo es:

```
ship_pools table → useLoadoutStore computeStats → weaponMaxPips → LoadoutBuilder ctx → HpGroup → HardpointSlot
```

### 8.4 MEJORA — computeStats.ts no modela pips

El archivo `src/lib/computeStats.ts` hace sumas simples de DPS, shieldHP, etc. **NO tiene lógica de power pips.** Toda la lógica de pips está en `useLoadoutStore.ts computeStats()`.

El `computeStats.ts` legacy debería ser deprecado a favor de la implementación en el store.

### 8.5 MEJORA — Signatures deberían escalar con pips

Actualmente la UI muestra signatures fijas (del component data). Deberían escalar con la asignación de pips:

```
component_em = em_base + (em_max - em_base) × (pips / max_pips)
component_ir = ir_base + (ir_max - ir_base) × (pips / max_pips)
```

### 8.6 MEJORA — Boost Regen Time

Agregar cálculo de boost regen time basado en shield pips:

```
boost_regen_time = 1 / (base_rate + increment × shield_pips)
```

### 8.7 MEJORA — Consumption % 

Implementar cálculo de consumption basado en la suma de consumo por sistema:

```
consumption_pct = Σ(system_power_draw(pips)) / total_power_output × 100
```

---

## 9. Datos Crudos de Referencia — Config Default del Asgard

Con la configuración stock/default (weapons=4, shields=4, thrusters=4, radar=1, coolers=12):

| Stat | Valor |
|------|-------|
| SCM Speed | 203 m/s |
| Boost Forward | 425 m/s |
| Boost Backward | 240 m/s |
| Nav Max | 1,075 m/s |
| Pitch/Yaw/Roll | 33/28/95 deg/s |
| Boosted P/Y/R | 39/33/114 deg/s |
| Shield HP | 52,800 |
| Shield Regen | 1,019 hp/s |
| Shield Type | Bubble |
| Phys Resistance | 10.2% |
| Energy Resistance | -26.8% |
| Distortion Resistance | 83.1% |
| EM | 6.7K |
| IR | 31.7K |
| CS | 30.4K |
| Consumption | 21% |
| Output | 0/24 (todo asignado) |
| Pilot DPS (sustained) | 1,239 |
| Turret DPS (sustained) | 610 |
| Pilot Alpha | 262 |
| Turret Alpha | 131 |
| Missiles | 51,200 total dmg |
| Full Boost Regen | 33.3s |

---

## 10. Próximos Pasos

1. **Re-ingestar datos de capacitor** — ejecutar ingest contra scunpacked-data v4.7.1
2. **Validar weaponMaxPips** — asegurar que el valor 4 llega desde ship_pools hasta HardpointSlot
3. **Push código pendiente** — los cambios en HardpointSlot, LoadoutBuilder, API routes y store necesitan subirse
4. **Implementar signature scaling** — hacer que EM/IR escalen con pips en la UI
5. **Probar con otra nave** — repetir sweep con una nave de un solo power plant para validar fórmulas

---

*Generado automáticamente por SC Labs reverse-engineering tool, 2026-04-16*
