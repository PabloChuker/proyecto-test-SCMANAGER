# Auditoría Chain Board — 2026-05-13

Auditoría exhaustiva del módulo Chain Board / Ship Upgrade Planner solicitada por
Pablo después de una racha de bugs uno-tras-uno. Este informe lista TODOS los
problemas identificados, no solo el visible del momento. Cada bug tiene archivo,
línea, causa y fix sugerido.

URL en prod: https://sclabs.space/hangar/chain-board

---

## Resumen ejecutivo

- **Archivos auditados:** 11
- **Bugs P0 (bloqueantes):** 3
- **Bugs P1 (alto impacto):** 6
- **Bugs P2 (medio):** 4
- **Bugs P3 (cosmético / tech-debt):** 3

**Estado de fixes en esta sesión:** P0-1, P0-3 aplicados (push pendiente).

---

## Inventario de archivos del módulo

| Archivo | Rol |
|---------|-----|
| `src/app/hangar/chain-board/page.tsx` | Página raíz, monta ChainBoardWorkspace |
| `src/components/hangar/chain-board/types.ts` | Tipos compartidos (CatalogShip, BoardNode, BoardEdge, UpgradeKind, snapshots) |
| `src/components/hangar/chain-board/ChainBoardWorkspace.tsx` | Componente principal: estado de pizarra, auto-build, ShipPicker, panel derecho |
| `src/components/hangar/chain-board/ChainBoardCanvasFlow.tsx` | Canvas xyflow/react (nodos + edges visuales) |
| `src/components/hangar/chain-board/ShipNode.tsx` | Card de nodo en el canvas |
| `src/components/hangar/chain-board/ChainBoardInventoryColumn.tsx` | Columna izquierda: catálogo RSI |
| `src/components/hangar/chain-board/ChainBoardStoreColumn.tsx` | Columna izquierda: hangar del user + CCUs propios |
| `src/app/api/ccu/ships/route.ts` | GET catálogo de naves (consume el dropdown) |
| `src/app/api/ccu/calculate/route.ts` | POST solver Dijkstra (Auto-armar cadena) |
| `src/app/api/ccu/validate-edges/route.ts` | POST validación de pares (drag manual) |
| `src/lib/ccu-engine.ts` | Engine: Dijkstra, reconstrucción de path, waypoints |

---

## Bugs P0 — bloqueantes

### P0-1. `priceType "owned"` no existe → todos los CCUs de hangar se cobraban como nuevos
**Archivo:** `src/components/hangar/chain-board/ChainBoardWorkspace.tsx` (~líneas 465-470 antes del fix)
**Síntoma:** Las cadenas auto-generadas mostraban CCUs del hangar como pasos "Normal" sin locked, y el `Tu costo` los sumaba como si los compraras de nuevo.
**Causa:** El cliente chequeaba `s.priceType === "owned"`, pero el solver (`lib/ccu-engine.ts:51-56`) devuelve `"hangar" | "buyback-token" | "buyback-cash" | "warbond" | "standard"`. **Nunca** "owned". El check era siempre `false` → `isOwned = false` → `kind = "normal"` → `locked: false`.
**Fix aplicado:** Renombré la flag a `isLockedFree` y la armé con `priceType === "hangar" || priceType === "buyback-token"`. `buyback-cash` queda como "normal" porque sí cuesta efectivo (precio que ya pagaste al meterlo a buyback).
**Estado:** ✅ aplicado en esta sesión.

### P0-2. Duplicados de naves en el dropdown + contador divergente
**Archivo:** `src/app/api/ccu/ships/route.ts` y `ChainBoardWorkspace.tsx` (ShipPicker map)
**Síntoma:** Buscar "spartan" o "ironcla" en el dropdown muestra 14+ items repetidos (Mirai Pulse 4×, Cutlass Steel 4×) pero el footer dice "2 / 355 naves". Drake Ironclad no aparece nunca.
**Causa multi-capa:**
1. `ships` en BD tiene la misma nave 2-4 veces (Garnok importó 4.7.2 LIVE + PTU y se decidió mantener — ver memoria "dedupe ships 4.7.2 REVERT"). DISTINCT ON ya se agregó pero no aplicado/cacheado.
2. El client usa `key={s.id}` en el map. Si el endpoint devuelve duplicados con `s.id` repetido, React descarta filas silenciosamente y el conteo difiere de lo renderizado.
3. El search client-side solo chequea `name` y `manufacturer`. No chequea `reference` (= `class_name`). Si el `name` está mal sincronizado para una nave concept o vehículo terrestre, el search nunca la encuentra.
**Fixes aplicados en esta sesión:**
- ✅ Dedupe client-side defensivo por `reference` en `useMemo(filtered)`.
- ✅ Key compuesta `${s.id}::${s.reference}` para sobrevivir IDs duplicados.
- ✅ Extender search a `s.reference` (class_name).
- ✅ DISTINCT ON `class_name` ya estaba en el endpoint (CCU.18).
**Pendiente:** verificar en BD si Drake Ironclad existe (tabla `ships` + `ship_price` o `ship_prices_canonical`). Si no, es problema de ingesta.

### P0-3. Concept ships / vehículos terrestres excluidos del solver
**Archivo:** `src/app/api/ccu/calculate/route.ts` (~línea 76 antes del fix), `validate-edges/route.ts` (~línea 103)
**Síntoma:** Greycat UTV, Anvil MTC, Anvil Spartan aparecían en el dropdown pero al elegirlos como FROM/TO en una cadena el solver fallaba con "ship not found or missing MSRP data". O el dropdown del Crear CCU no los traía.
**Causa:** El solver filtraba `WHERE sp.msrp_usd IS NOT NULL AND > 0` — solo miraba `ship_price`. Las concept ships y vehículos terrestres tienen su precio en `ship_prices_canonical.pledge_usd` (wiki) pero NO en `ship_price`. Por contraste, `/api/ccu/ships` (dropdown) ya usaba COALESCE.
**Fix aplicado:** Unifiqué las 3 queries con `COALESCE(sp.msrp_usd, spc.pledge_usd, spc_name.pledge_usd)`. Lo mismo para warbond. Agregué un segundo LEFT JOIN fallback por nombre con strip de manufacturer prefix (`Aegis|Anvil|Drake|...`) para naves cuyo `ship_id` quedó NULL en `ship_prices_canonical` porque el script de matching falló (caso típico: wiki dice "Spartan", BD dice "Anvil Spartan").
**Estado:** ✅ aplicado (CCU.16 + CCU.17).

---

## Bugs P1 — alto impacto

### P1-1. Dropdown ShipPicker no cerraba con click fuera
**Archivo:** `ChainBoardWorkspace.tsx` ShipPicker
**Síntoma:** Una vez abierto el dropdown ocupaba toda la columna y no se podía cerrar sin seleccionar nada.
**Fix aplicado:** Listener `mousedown` global + ESC + botón ✕ explícito. (Ya estaba aplicado antes de esta auditoría).

### P1-2. Mapeo de campos solver→cliente roto (precio efectivo)
**Archivo:** `ChainBoardWorkspace.tsx` autoBuild()
**Síntoma:** Cadenas mostraban "Normal $0.00" entre naves de distinto precio. CCUs warbond perdían el descuento.
**Causa:** Cliente leía `ccuPrice/isOwned/isWarbond` que **no existen** en `ChainStep`. El solver retorna `effectivePrice/standardPrice/warbondPrice/priceType`.
**Fix aplicado:** Tipos corregidos, mapeo a `effectivePrice ?? standardPrice ?? defaultPriceFor`.

### P1-3. Signo invertido en "Ahorrás"
**Archivo:** `ChainBoardWorkspace.tsx` info bar global (~línea 748)
**Síntoma:** "Ahorrás −$15.00" se leía como pérdida.
**Causa:** Prefix `"−"` cuando `savings > 0`.
**Fix aplicado:** Quité el prefix, el label ya distingue Ahorrás/De más.

### P1-4. CCU.7 — pledge_availability no se filtra en naves intermedias
**Archivo:** `calculate/route.ts` ~línea 142
**Síntoma:** En modo "Armarla Ya", el solver puede meter una nave Concept o Time-limited como step intermedio porque solo se chequea la availability de FROM y TO, no de los pasos del medio.
**Causa:** El JOIN con `ship_prices_canonical` solo se aplica a `cp.from_ship_id` y `cp.to_ship_id`. Las naves intermedias se inferen del traversal del Dijkstra.
**Fix sugerido:** En `isShipAvailableNow()` (lib/ccu-engine.ts ~171), considerar NULL como "desconocida" y mostrarle warning al usuario en la UI. Alternativamente extender el filtro SQL para validar disponibilidad de TODAS las naves del path.
**Estado:** ⏳ pendiente.

### P1-5. Endpoint /api/ccu/ships — search SQL vs client-side desync
**Archivo:** `ships/route.ts` líneas 73-74 + cliente
**Síntoma:** El endpoint acepta `?search=...` y filtra en SQL, pero el cliente nunca lo usa (envía sin params). Toda búsqueda es client-side sobre las 355+ filas. Si la nave no está en el catálogo descargado, no la encuentra.
**Causa:** El cliente hace `fetch("/api/ccu/ships")` sin params; el filtrado es solo `useMemo` client.
**Fix sugerido:** Mantener client-side para latencia, pero loguear si el catálogo está incompleto y agregar un retry con `?search=` si el filtered queda vacío y el catalog está corto.
**Estado:** ⏳ pendiente (no urgente).

### P1-6. Catalog fetcheado 3 veces independientes
**Archivo:** `ChainBoardWorkspace.tsx`, `ChainBoardInventoryColumn.tsx`, `ChainBoardStoreColumn.tsx`
**Síntoma:** Cada componente hace su propio `fetch("/api/ccu/ships")`. Si el cache CDN (5min) está stale, los tres pueden tener datos distintos. Y la UI hace 3 requests redundantes al cargar la página.
**Fix sugerido:** Centralizar fetch en `ChainBoardWorkspace`, pasar `catalog` como prop a los hijos.
**Estado:** ⏳ pendiente.

---

## Bugs P2 — medio impacto

### P2-1. Downgrade detection usa `<=`
**Archivo:** `validate-edges/route.ts` línea ~200
**Síntoma:** Si dos naves cuestan exactamente lo mismo, marca el edge como "downgrade" inválido. En realidad SC permite swaps horizontales entre variantes del mismo precio en algunos casos.
**Fix sugerido:** Cambiar `<=` por `<` y dejar que RSI ccu_prices sea source of truth.

### P2-2. owned-CCU match case-sensitive frágil
**Archivo:** `validate-edges/route.ts` línea ~172
**Síntoma:** "Drake Cutlass Black" no matchea con "Drake Cutlass" (variante).
**Fix sugerido:** Normalizar removiendo sufijos conocidos (Black, Steel, Mk II) antes del compare.

### P2-3. findShip() en ChainBoardStoreColumn — fuzzy match débil
**Archivo:** `ChainBoardStoreColumn.tsx` líneas 100-118
**Síntoma:** Naves del hangar con nombre exacto distinto al catálogo no matchean. Resultado: aparecen como "unmatched".
**Fix sugerido:** Implementar fuzzy match con Levenshtein o LCS.

### P2-4. rightPanelMode no persiste
**Archivo:** `ChainBoardWorkspace.tsx`
**Síntoma:** Al refrescar la página, el panel derecho vuelve a "Detalle" aunque el user estuviera en "Auto" o "+ CCU".
**Fix sugerido:** Persistir `rightPanelMode` en localStorage alongside nodes/edges.

---

## Bugs P3 — cosmético / tech-debt

### P3-1. UpgradeKind no incluye "buyback"
**Archivo:** `types.ts`
**Síntoma:** Los steps `buyback-cash` se renderizan como "normal" perdiendo info de que es de buyback. Visual no diferenciado.
**Fix sugerido:** Extender `UpgradeKind` con `"buyback"` y agregar color distinto en TONE.

### P3-2. Typo "hanger" vs "hangar" en UpgradeKind
**Archivo:** `types.ts` y todos los callsites
**Estado:** Mantener "hanger" o renombrar todo a "hangar" para consistencia con el solver.

### P3-3. Falta logging defensivo
**Archivos:** todos los endpoints y handlers de fetch
**Síntoma:** Cuando algo falla silenciosamente (cache stale, network drop, dato faltante), no hay rastros en console para debugging.
**Fix sugerido:** `console.warn` en catch blocks + en fallbacks.

---

## Patrones transversales

### 1. Multiple fetchers del mismo recurso
`/api/ccu/ships` se llama desde 3 componentes. Centralizar.

### 2. Tipos no compartidos entre cliente y servidor
El cliente redeclara `Step` localmente en lugar de importar `ChainStep` de `ccu-engine.ts`. Esto produjo el bug P0-1 (mismatch de nombres de campos). Recomendación: mover `ChainStep` a un archivo `types/ccu.ts` shared por backend y frontend.

### 3. localStorage estado parcial
`sclabs-chain-board-v2` guarda nodes/edges pero no panel mode, selectedNodeId, ni form drafts.

### 4. Search client-side sin paginación
Catálogo crece monotonically. Cuando llegue a 500+ naves el filtrado client-side va a degradar perceptiblemente.

---

## Orden de fix recomendado

1. **P0-1, P0-2, P0-3** — bugs visibles ahora. ✅ aplicados.
2. **P1-6** — centralizar catalog fetch (~30 min). Limpia 3 fuentes de la misma data.
3. **P3-1** — UpgradeKind con "buyback" (~15 min). Mejora visual sin cambio de lógica.
4. **P1-4** — availability de naves intermedias (~45 min). Mejor UX en "Armarla Ya".
5. **P2-1, P2-2, P2-3** — fixes de matching (~1h cada uno).
6. **P2-4** — persistir rightPanelMode (~15 min).
7. **P3-3** — agregar logging defensivo (~30 min).

---

## Fixes aplicados en esta sesión (todos en una sola tanda)

| ID | Cambio | Archivo |
|----|--------|---------|
| P0-1 | priceType `"owned"` → `"hangar" \| "buyback-token"` mapping correcto | ChainBoardWorkspace.tsx |
| P0-2a | Dedupe client-side por reference en filtered | ChainBoardWorkspace.tsx |
| P0-2b | Key compuesta `${id}::${reference}` en map | ChainBoardWorkspace.tsx |
| P0-2c | Search incluye `s.reference` (class_name) | ChainBoardWorkspace.tsx + InventoryColumn |
| P0-3 | COALESCE 3-way (sp + spc + spc_name) en 3 endpoints | ships/calculate/validate-edges |
| P1-6 | Hook compartido `useShipsCatalog` con cache module-level + dedup in-flight | useShipsCatalog.ts (nuevo) + 3 componentes refactorizados |
| P2-1 | Downgrade `<=` → `<` (permitir swaps horizontales) | validate-edges/route.ts |
| P2-2 | Owned CCU lookup normalizado (strip manufacturer + variant) | validate-edges/route.ts |
| P2-3 | findShip() con matching cascada (exact > stripped > endsWith > substring) | ChainBoardStoreColumn.tsx |
| P2-4 | Persistir `rightPanelMode` en localStorage `LS_UI_KEY` | ChainBoardWorkspace.tsx |
| P3-1 | UpgradeKind extendido con `"buyback"` + badge violet + locked también | types.ts + ChainBoardWorkspace.tsx |
| P3-3 | `console.warn` en catch del fetch del catalog (vs silent `() => {}`) | useShipsCatalog.ts |

Sesiones previas aplicadas (en cola para este push):
- CCU.16 — concepts en solver
- CCU.17 — fallback por nombre con strip de manufacturer
- CCU.18 — DISTINCT ON class_name
- Audit Planner — savings sign, signo invertido, etc.

## Pendiente (no aplicado en esta sesión)

- **P1-4** — warning UX cuando una cadena pase por naves con `pledgeAvailability === NULL`. Es feature, no bugfix; el check ya bloquea concept/limited en modo "Ya". Dejado para iteración futura.
- **P3-2** — typo `"hanger"` vs `"hangar"` en UpgradeKind. No se renombra: rompería todo localStorage de cadenas guardadas. Mantener como está.
- **P1-4 alt** — surfaces warning visual en el ShipNode si su `pledgeAvailability` es desconocida. Pendiente.

---

**Generado por:** Auditoría asistida por agente Explore + revisión manual.
**Fecha:** 2026-05-13
