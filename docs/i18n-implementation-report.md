# SC Labs — Informe de Internacionalización (i18n)

**Fecha:** Abril 2026
**Scope:** Traducción de la plataforma SC Labs a 5 idiomas
**Estado:** Core de producto completo. Social pages y tech debt opcional diferido.

---

## 1. Objetivo

Habilitar soporte multi-idioma en la plataforma web de SC Labs (`sclabs.space`) para ampliar el alcance más allá de la comunidad hispanohablante, preservando la terminología del universo de Star Citizen.

**Idiomas cubiertos:**

- **EN** — inglés (idioma base del juego)
- **ES** — español (idioma original de la plataforma)
- **DE** — alemán
- **FR** — francés
- **ZH** — chino simplificado

---

## 2. Arquitectura técnica

### 2.1 Librería

- **next-intl `v4.9.1`** — librería de i18n oficialmente compatible con Next.js App Router y React Server Components.
- Elegida sobre `next-i18next` por mejor integración con React 19 / Next 16 y soporte nativo de server components.

### 2.2 Routing y detección de idioma

- **Estrategia:** cookie-based routing (sin prefijos de URL tipo `/en/…` ni `/es/…`).
- **Cookie:** `NEXT_LOCALE` persistida en el navegador.
- **Switch de idioma:** componente `LanguageSwitcher` en el header; al cambiar, reescribe la cookie y refresca.
- **Rationale:** las URLs permanecen limpias (`sclabs.space/dps`, no `sclabs.space/en/dps`), evita romper enlaces compartidos y no requiere duplicar rutas.

### 2.3 Estructura de archivos de mensajes

```
proyecto-test-SCMANAGER/
├── messages/
│   ├── en.json        ← 786 claves, 19 namespaces
│   ├── es.json        ← 786 claves, 19 namespaces
│   ├── de.json        ← 786 claves, 19 namespaces
│   ├── fr.json        ← 786 claves, 19 namespaces
│   └── zh.json        ← 786 claves, 19 namespaces
├── src/
│   ├── i18n.ts                       ← config de next-intl
│   ├── middleware.ts                 ← lectura de cookie NEXT_LOCALE
│   └── components/shared/
│       └── LanguageSwitcher.tsx      ← dropdown de cambio de idioma
```

### 2.4 Namespaces implementados (19)

| Namespace          | Alcance                                                       |
|--------------------|---------------------------------------------------------------|
| `Cargo`            | Visualizador de grid de carga 3D                              |
| `Common`           | Strings compartidos (save, cancel, loading, etc.)             |
| `Compare`          | Comparación lado a lado de naves                              |
| `Components`       | Browser de componentes / hardpoints                           |
| `Crafting`         | Materiales y recetas de crafting                              |
| `Hangar`           | Dashboard de hangar, CCUs, chains, ships                      |
| `Header`           | Header global y navegación                                    |
| `Landing`          | Página de inicio                                              |
| `LanguageSwitcher` | Dropdown de idioma                                            |
| `LoadoutBuilder`   | DPS / armamento / widgets del LoadoutBuilder                  |
| `Login`            | Flujos de auth                                                |
| `Mining`           | Rock, refinery, WOC, loadout calc, dashboard                  |
| `MyAccount`        | Gestión de cuenta                                             |
| `Nav`              | Menú principal                                                |
| `Notifications`    | Sistema de notificaciones                                     |
| `PageTitles`       | Títulos de pestaña / subtítulos por página                    |
| `Profile`          | Perfil público                                                |
| `Ships`            | Browser de naves, filtros, specs                              |
| `Trade`            | Routes, commodities, terminals, work orders, dashboard        |

### 2.5 API de traducción usada

**Hook principal (client components):**

```tsx
"use client";
import { useTranslations } from "next-intl";

export default function MyComponent() {
  const t = useTranslations("Namespace");
  return <button>{t("saveButton")}</button>;
}
```

**Interpolación de parámetros:**

```tsx
t("ordersCount", { count: 5 })
// → "5 orders"  (EN)
// → "5 órdenes" (ES)
```

**Rich interpolation con componentes React:**

```tsx
t.rich("confirmSnapshot", {
  completed: (chunks) => <span className="text-emerald-400">{chunks}</span>,
})
// key: "...mark the order as <completed>completed</completed>."
```

**Plurales (ICU):**

```json
{
  "membersCount": "{n, plural, =0 {no members} one {# member} other {# members}}"
}
```

---

## 3. Reglas de traducción aplicadas

### 3.1 Términos que NO se traducen

Se preserva la terminología canónica del universo Star Citizen en todos los idiomas:

- **Nombres de naves:** Hull C, 890 Jump, Aurora MR, Reclaimer…
- **Armas y componentes:** MaxOx NN-13, Behring M7A, Omnisky VI…
- **Manufacturers:** RSI, Anvil, Drake, Aegis, MISC, Origin…
- **Materiales y minerales:** Quantainium, Agricium, Laranite…
- **Stations / ubicaciones:** CRU-L1, Area18, Orison, GrimHEX…
- **Unidades:** SCU, aUEC, UEC, mSCU, cSCU…
- **Conceptos de gameplay:** CCU, pledge, buyback, hangar, party, WO…
- **Commodities:** Medical Supplies, WiDoW, Neon…

**Rationale:** los jugadores buscan ítems por nombre canónico en wikis, foros y Spectrum. Traducirlos rompería la búsqueda y confundiría a la comunidad internacional.

### 3.2 Lo que SÍ se traduce

- Títulos de secciones, labels de UI, botones
- Mensajes de error y estado (loading, saving, saved…)
- Tooltips, placeholders, descripciones
- Tabs, headers de columnas de tablas
- Mensajes de confirmación, modales
- Estados semánticos (draft → borrador / Entwurf / brouillon / 草稿)

---

## 4. Metodología de trabajo

Dividido en tres sesiones por fatiga acumulada y tamaño del scope.

### Sesión 1 — Core y hangar

- Configuración inicial de next-intl, middleware, cookie, LanguageSwitcher.
- Namespaces base: `Common`, `Nav`, `Header`, `PageTitles`, `Landing`, `Login`, `MyAccount`, `Profile`.
- Hangar completo: `HangarDashboard`, `FleetGrid`, `CCUGrid`, modales add/edit, ChainBuilder, ChainList, CCUChainCalculator.
- Ships browser, filters, specs, compare.
- Cargo 3D viewer, Components browser, Crafting.
- LoadoutBuilder (DPS) y todos sus sub-widgets.

### Sesión 2 — Mining

Cinco archivos, 5 sub-namespaces dedicados dentro de `Mining`:

- `Mining.rock` — `RockAnalyzer` (rock scanner, yield calc)
- `Mining.refinery` — `RefineryDataTable` (bonos por refinería/mineral)
- `Mining.woc` — `WorkOrderCalculator` (888 líneas — créate work order)
- `Mining.loadout` — `MiningLoadoutCalculator` (637 líneas — láseres, módulos, stats)
- `Mining.dashboard` — `WorkOrderDashboard` (1249 líneas — tabs, inventory, crew shares, stats)

### Sesión 3 — Trade

Dos archivos, dos sub-namespaces:

- `Trade.wo` — `TradeWorkOrderCalculator` (1561 líneas — formulario completo + modal split)
- `Trade.wod` — `TradeWorkOrderDashboard` (255 líneas — listado + stats)

### Post-sesión — Polish

- Refactor de los helpers fuera de componente en `WorkOrderDashboard` (`typeLabel`, `statusBadge`, `mvReasonLabel`) para que acepten el translator como argumento y leer de `Mining.dashboard.{orderType,statusBadge,mvReason}.*`.

---

## 5. Patrones y desafíos técnicos resueltos

### 5.1 Shadowing del hook `t`

**Problema:** `useTranslations` devuelve un objeto convencionalmente llamado `t`. Varios componentes ya usaban `t` como variable local en `.map((t) => …)` de arrays de tabs, categorías y expense types.

**Solución:** renombrar la variable local (`t → tb`, `t → et`, `t → typ`, `t → tr`) cuando hay colisión. En `Object.entries(stats.byType).map(([t, d]) …)` se renombró el destructured a `typ` para preservar acceso al hook.

### 5.2 Hooks después de early returns (Rules of Hooks)

**Problema:** en `LoadoutBuilder.tsx`, los `useMemo` de `visibleIds`, `widgetHeights` y `layout` se declaraban después de `if (!shipInfo) return null`. Al cambiar de loading → loaded, la cantidad de hooks variaba y React crasheaba con "rendered more hooks than during the previous render".

**Solución:** subir todos los hooks (líneas ~454–614) antes de cualquier early return (líneas ~669–671).

### 5.3 Rich interpolation para HTML inline

**Problema:** strings como `"Create one from <b>+ New WO</b> or send from Trade Routes"` mezclan texto y markup.

**Solución:** `t.rich("createHint", { btn: (chunks) => <span className="text-amber-400">{chunks}</span> })` con placeholders `<btn>…</btn>` en los JSON. Permite a cada idioma ubicar el énfasis en la posición gramatical correcta.

### 5.4 Helpers fuera del componente

**Problema:** `typeLabel`, `statusBadge`, `mvReasonLabel` estaban declarados como funciones top-level fuera del componente y no podían usar hooks.

**Solución:** se refactorizaron para aceptar el translator como primer argumento, y en los callsites se pasa el `t` del componente: `typeLabel(t, order.type)`.

### 5.5 Arrays de opciones con labels hardcoded

**Problema:** arrays como `const ROLES = [{ id: "pilot", label: "Pilot" }, …]` definidos fuera del componente, renderizados en `<option>{r.label}</option>`.

**Solución:** strip del campo `label`, dejar sólo `{ id: "pilot" }`, y al renderizar usar `t(\`role.${r.id}\`)`. Los labels viven en los JSON con estructuras anidadas `role: { pilot, escort, scout, … }`.

### 5.6 Valores persistidos en DB vs. claves conocidas

**Problema:** campos como `p.role` pueden venir de DB con valores legacy no incluidos en el enum `ROLES`. Llamar `t(\`role.${r.role}\`)` con una clave desconocida lanza error en next-intl.

**Solución:** fallback defensivo: `ROLES.some((ro) => ro.id === r.role) ? t(\`role.${r.role}\`) : r.role`. Si la clave existe en el JSON, se traduce; si no, se muestra el valor raw.

### 5.7 Ingeniería reversa del build de Vercel

Durante las sesiones no se corría `next build` localmente ("no trabajamos en local"). Cada batch se pusheaba a `master` y Vercel auto-deployaba. El feedback de errores de compilación / Rules of Hooks venía desde los logs de producción.

**Mitigación:** scripts de Python que revisaban sintaxis de JSON y cobertura de claves antes de push, y verificación visual con `grep` de strings sospechosos en español/inglés residuales.

---

## 6. Flujo de trabajo por batch

Cada tanda seguía el mismo ciclo:

1. **Identificar archivos** con strings hardcoded (`grep` por `">[A-Z]`, `placeholder="`, `title="`).
2. **Añadir import** de `useTranslations` y declarar el hook con el namespace.
3. **Reemplazar strings** por llamadas `t("key")`, preservando la estructura JSX.
4. **Generar script Python** que inyecta las claves en los 5 JSONs simultáneamente con las cinco traducciones.
5. **Commit y push** a `master` con mensaje estandarizado: `i18n(<module>): translate <files> + add <namespaces> across EN/ES/DE/FR/ZH`.
6. **Verificar build en Vercel** y screenshot / smoke test en cada idioma.
7. **Iterar** si aparecían errores (build rojo o strings olvidados).

---

## 7. Resultados finales

### 7.1 Cobertura

- **19 namespaces** × 5 idiomas = **95 bundles de traducción**
- **786 claves por idioma** (consistencia paridad total entre locales)
- **~20 archivos de componentes** tocados
- Core de producto cubierto al 100 %: landing, auth, perfil, hangar, ships, DPS, compare, components, cargo, crafting, mining, trade, notifications

### 7.2 Performance

- next-intl hace lazy-load por ruta del JSON del idioma activo — no se envía el bundle completo.
- Cambio de idioma en caliente (sin re-autenticación).
- SSR/RSC preservado — las páginas server-rendered también quedan traducidas.

### 7.3 Mantenibilidad

- Fuente única de verdad: los 5 JSON en `messages/`.
- Patrón consistente para añadir strings: agregar clave en los 5 JSON + `t("key")` en el componente.
- Scripts Python reutilizables para inyectar namespaces nuevos en bloque.

---

## 8. Tech debt consciente (no implementado)

Decisiones explícitas de diferir para futuras sesiones:

1. **Social pages** (~3325 líneas)
   - `friends/page.tsx` (490L)
   - `party/page.tsx` (405L)
   - `org/page.tsx` (425L)
   - `activities/page.tsx` (67L)
   - `activities/ActivityManager.tsx` (1938L) ← el grande
2. **~54 errores TypeScript** no bloqueantes heredados del refactor previo.
3. **Seeds de SQL incompletos** — 6 archivos con marcador `__BUSCAR__` / `_____` que requieren datos del juego no disponibles.
4. **Gap numérico en migraciones** — `024_*` salteado, typo en `016_create_manneuver_thrusters.sql` (debería ser "maneuver"). Cosmético, riesgoso renombrar migraciones ya aplicadas en producción.
5. **Arquitectura doc** — `docs/architecture/diagrams/` tiene sólo un PNG generado por Gemini, sin overview escrito.

---

## 9. Cómo añadir un nuevo string / namespace (runbook)

**Para agregar un string a un namespace existente:**

1. Editar los 5 archivos `messages/{en,es,de,fr,zh}.json` agregando la misma clave con la traducción correspondiente.
2. En el componente, llamar `t("miNuevaClave")` donde haya un hook con el namespace apropiado.

**Para agregar un namespace nuevo:**

1. Crear el namespace en los 5 JSON (paridad obligatoria para evitar errores en tiempo de render).
2. En el componente nuevo: `const t = useTranslations("NuevoNamespace");`
3. Testear cambiando de idioma en producción con el `LanguageSwitcher`.

**Para agregar un idioma nuevo (ej. `ja` japonés):**

1. Crear `messages/ja.json` con paridad completa de claves respecto a `en.json`.
2. Añadir `ja` al array de locales soportados en `src/i18n.ts`.
3. Registrar la opción en `LanguageSwitcher.tsx`.
4. Auditar rendering para fuentes CJK si aplica.

---

## 10. Commits relevantes

Rama de trabajo: `master` (auto-deploy a Vercel).

Todos los commits siguen el formato:

```
i18n(<module>): <action> + add <namespaces> across EN/ES/DE/FR/ZH
```

Ejemplos:

- `i18n(mining): translate WorkOrderCalculator, MiningLoadoutCalculator, WorkOrderDashboard + add rock/refinery/woc/loadout/dashboard namespaces across EN/ES/DE/FR/ZH`
- `i18n(trade): translate TradeWorkOrderCalculator + TradeWorkOrderDashboard across EN/ES/DE/FR/ZH (Trade.wo, Trade.wod namespaces)`
- `i18n(mining): translate WorkOrderDashboard helpers (typeLabel, statusBadge, mvReasonLabel)`

---

**Fin del informe.**
