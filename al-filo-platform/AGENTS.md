<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# SC Labs — Guía para agentes IA (Claude / Cursor / Copilot)

> Este archivo es la **memoria persistente** del proyecto. Cualquier agente que entre al repo debe leerlo **antes** de tocar código. Está pensado para evitar que se pierda contexto entre sesiones.

## 0. Resumen de 30 segundos

**SC Labs** es una plataforma de Star Citizen (fleet manager + DPS calculator + ship DB) construida con Next.js 16 App Router, React 19, TypeScript, Tailwind v4 y Supabase (Postgres + postgres.js, no Prisma). El owner es **Pablo** y prefiere comunicación en **español**. Usa **PowerShell** en Windows, con **single quotes** en los comandos git. El repo está en `PabloChuker/proyecto-test-SCMANAGER`, branch por default `master`. Deploy automático en Vercel al pushear a `master`.

---

## 1. Capacidades del agente en este entorno (Cowork / Claude Code)

Un agente corriendo en este proyecto tiene acceso REAL a:

### 1.1 Git (lectura + escritura a GitHub)
- `git` está instalado y el remote `origin` apunta a `https://github.com/PabloChuker/proyecto-test-SCMANAGER.git`.
- Las credenciales están configuradas a nivel del host — `git fetch`, `git pull`, `git push` funcionan sin pedir auth.
- Branch por default: `master`.
- **IMPORTANTE**: nunca hacer `--force`, nunca amend, nunca `reset --hard` sin que Pablo lo pida explícitamente. Siempre crear commits nuevos.
- Pablo siempre pide mensajes con un scope tipo `feat(hangar):`, `fix(dps):`, `chore:` etc.
- Si `git status` se cuelga o falla con `Operation not permitted`, probablemente hay `.git/index.lock` o `.git/objects/maintenance.lock` por un VS Code abierto. Pedile a Pablo que cierre el editor; el agente no puede borrar esos archivos por permisos.

### 1.2 Supabase (lectura + escritura vía `DATABASE_URL`)
- Las credenciales viven en `.env` en el root del proyecto. **Nunca** exponerlas en respuestas al usuario ni committearlas.
- Variables relevantes:
  - `DATABASE_URL` → pooler de Supabase (puerto 6543, transaction mode) — usar esto para queries desde scripts one-off.
  - `DIRECT_URL` → conexión directa (puerto 5432) — usar para migraciones largas o `CREATE INDEX CONCURRENTLY`.
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` → para el client.
- El paquete `postgres` (postgres.js v3.4.x) ya está instalado en `node_modules`. No hace falta instalar nada para correr SQL one-off.

**Snippet para ejecutar SQL desde el agente (probado y funcionando):**

```bash
cd "/sessions/friendly-festive-ptolemy/mnt/web alfilo/al-filo-platform" && node -e "
require('dotenv').config();
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', prepare: false });
(async () => {
  try {
    const rows = await sql\`SELECT COUNT(*) FROM ship_loaners\`;
    console.log(rows);
    await sql.end();
  } catch (e) { console.error('ERROR:', e.message); process.exit(1); }
})();
"
```

Notas clave:
- Siempre usar `ssl: 'require'` (Supabase lo exige).
- Siempre usar `prepare: false` con el pooler (port 6543), sino tira error de prepared statements.
- Para correr migraciones grandes (múltiples statements), leer el archivo `.sql` con `fs.readFileSync` y hacer `await sql.unsafe(contenido)`.

**El agente PUEDE y DEBE ofrecerse a correr migraciones él mismo** — no pedirle a Pablo que abra el SQL Editor de Supabase salvo que explícitamente diga que prefiere hacerlo manual.

### 1.3 Otras herramientas disponibles
- **Bash sandbox** (Ubuntu 22, Node 22, npm 10, python, curl, etc.)
- **File tools** (Read / Write / Edit) con acceso total al workspace `web alfilo/al-filo-platform`
- **Gmail MCP** (leer / buscar / crear drafts — no enviar sin confirmación)
- **Claude in Chrome** (navegación, scraping, screenshots)
- **MCP registry** + **plugins** (búsqueda e instalación de connectores)
- **Scheduled tasks** (crear tareas recurrentes / one-off)
- **Skills** disponibles: `docx`, `pdf`, `pptx`, `xlsx`, `schedule`, `setup-cowork`, `skill-creator` — están en `../.claude/skills/` y se invocan con la herramienta Skill.

---

## 2. Convenciones del owner (Pablo)

- **Idioma**: siempre responder en español rioplatense. Usa "vos", "podés", "tenés".
- **Shell**: PowerShell en Windows. Los comandos git que le pases tienen que usar single quotes (`'...'`), no double quotes.
- **Workdir**: `C:\Users\carsd\OneDrive\Escritorio\web alfilo\al-filo-platform`
- **Branching**: trabaja directo en `master`, no usa feature branches salvo pedido explícito.
- **Commits**: prefiere commits semánticos con scope (`feat(hangar):`, `fix(dps):`, etc.). Puede aceptar un solo commit grande o varios chicos si el trabajo es lógicamente separable — preguntale si no está claro.
- **Deploy**: es automático vía Vercel. Push a master = deploy a prod. No hay staging separado todavía.
- **Verificación de tipos**: antes de decir "terminé" el agente tiene que correr `npx tsc --noEmit` y filtrar errores SOLO de los archivos que tocó (hay errores preexistentes de otras partes del repo — no son problema del agente, no mentarlos como si fueran bugs introducidos).

---

## 3. Stack técnico

| Capa | Tecnología | Notas |
|---|---|---|
| Framework | Next.js 16.2.1 App Router | Ver `<!-- BEGIN:nextjs-agent-rules -->` arriba |
| UI | React 19 + TypeScript + Tailwind v4 | Tailwind usa `@theme` inline, no `tailwind.config.js` |
| State | Zustand con persist middleware | Store en `src/store/useHangarStore.ts`, `useLoadoutStore.ts`, etc. |
| DB | Supabase Postgres + `postgres` (postgres.js v3) | **NO Prisma** para queries — se usa `sql` importado desde `@/lib/db` |
| Migraciones | SQL crudo en `prisma/migrations/<timestamp>_<name>/migration.sql` | La carpeta se llama `prisma/` pero NO se usa el cliente Prisma, solo la convención de carpetas |
| Auth | Supabase auth (si existe) | Revisar `src/lib/supabase.ts` o similar antes de asumir |
| Hosting | Vercel | Push a master → build automático |

### Reglas del stack
- **Nunca** importar de `@prisma/client`. El import correcto es `import { sql } from '@/lib/db'`.
- Para endpoints API nuevos, seguir el patrón de los existentes en `src/app/api/*/route.ts`:
  - `export const dynamic = "force-dynamic"` si la respuesta depende de query params
  - `export const revalidate = N` si se quiere cache
  - Wrap con `secureHeaders` desde `@/lib/api-security`
- RLS: todas las tablas tienen que tener Row Level Security habilitada. Para datos públicos de solo lectura (como `ship_loaners`) la policy estándar es `CREATE POLICY ... FOR SELECT USING (true)` y las escrituras denegadas.

---

## 4. Módulos clave y dónde viven

### 4.1 Hangar (fleet manager)
- **Store**: `src/store/useHangarStore.ts`
  - Tipo principal: `HangarShip` con campos `id`, `shipReference`, `shipName`, `pledgeName`, `pledgePrice`, `insuranceType`, `location`, `itemCategory`, `acquisitionType?` (`"pledge" | "in_game"`), `isLoaner?`, `loanerOf?`.
  - `addShip()` **devuelve el `id` generado** — usar eso para linkear loaners.
  - `removeShip()` hace **cascade** de loaners: al borrar la nave padre, también borra todos los ships donde `loanerOf === id`.
- **UI**:
  - `src/components/hangar/HangarShipCard.tsx` — la tarjeta. Muestra badges: `IN GAME` (emerald), `LOANER` (sky blue), categoría, insurance, location.
  - `src/components/hangar/EditShipModal.tsx` — edición inline.
- **Import**: `parseSCLabsItems()` en `useHangarStore.ts` parsea el formato del importador de SC Labs Hangar (JSON con `myHangar`, `myBuyBack`, `elementData`, `ccuInfo`).

### 4.2 Ships grid + context menu
- `src/app/ships/ShipsGrid.tsx` — grid con filtros, paginación, y click-derecho.
- `src/components/ships/ShipContextMenu.tsx` — menú contextual con:
  - "Agregar al Hangar" → subheader con dos opciones: **Pledge Store** (amber, `＄`) y **Compra In-Game** (emerald, `⛁`)
  - "Agregar a Wishlist"
  - "Ver detalles" / "Abrir en DPS Calc"
- Cuando se agrega como **Pledge**, el handler también hace `await getLoanersFor(target.name)` y auto-agrega cada loaner al hangar con `isLoaner: true`, `loanerOf: parentId`, `isMeltable: false`. **Cuando se agrega como In-Game, NO se agregan loaners** (intencional — los loaners son un mecanismo de la tienda RSI).

### 4.3 DPS Calculator / Loadout Builder
- **Store**: `src/store/useLoadoutStore.ts`
  - Módulo de energía (PowerManagementPanel): los shields se representan como **una sola columna combinada** (no una por generador), matcheando el HUD del juego. Ver el bloque "Shields: accumulate into a single combined power column" en el store.
  - El `SHIELD_POWER_ID = "__shields_combined__"` es el id sintético de esa instancia combinada.
- **UI clave**:
  - `src/components/ships/PowerManagementPanel.tsx` — el grid de energía. **No necesita lógica especial para shields**, el store ya entrega una sola instancia combinada.
  - `src/components/ships/LoadoutBuilder.tsx` — el builder completo.
  - `src/components/ships/HardpointGroup.tsx` — agrupa hardpoints por categoría/tamaño.

### 4.4 Loaner Ship Matrix (RSI)
- **Tabla**: `ship_loaners` en Supabase (112 filas, snapshot 2026-04-08, patch 4.7.1-live.11592622).
- **Migración**: `prisma/migrations/20260410_ship_loaners/migration.sql`.
- **Columnas clave**: `pledged_name`, `pledged_name_normalized`, `loaner_name`, `loaner_name_normalized`, `sort_order`, `note`.
- **Unique index**: `(pledged_name_normalized, loaner_name_normalized)`.
- **Fuente canónica**: https://support.robertsspaceindustries.com/hc/en-us/articles/360003093114-Loaner-Ship-Matrix — si RSI actualiza el matrix, hay que re-scrapear y hacer un `TRUNCATE + INSERT` vía nueva migración. El WebFetch tool tira 403 contra este dominio; hay que usar Claude in Chrome MCP (`navigate` + `get_page_text`).
- **API**: `GET /api/loaners?ship=<name>` devuelve los loaners de esa nave. Sin query param devuelve el matrix completo agrupado.
- **Helper client-side**: `src/lib/loaners.ts`
  - `normalizeShipName(name)` — lowercase, strip manufacturer prefix, strip edition suffix, strip puntuación `[\/.,'()&+"]`, collapse whitespace.
  - `getLoanersFor(shipName)` — con caché en memoria (Map) a nivel sesión.
  - **Importante**: la normalización tiene que ser **idéntica** en TS y en el SQL seed, sino los matches fallan.

### 4.5 CCUs y CCU Chains
- Store: también en `useHangarStore.ts` (`ccus`, `chains`).
- Parsing de nombres CCU: `cleanCCUShipName()` quita sufijos tipo "Standard Edition", "Warbond Edition", "LTI", "IAE", etc.

---

## 5. Changelog reciente (tareas completadas)

| Fecha | Tarea | Commit/status |
|---|---|---|
| 2026-04-10 | **Task A** — Fix shields como columna única en Power Management | En `useLoadoutStore.ts`, bloque `SHIELD_POWER_ID` |
| 2026-04-10 | **Task C** — Split "Agregar al Hangar" en Pledge Store vs Compra In-Game + badge IN GAME | `ShipContextMenu.tsx`, `HangarShipCard.tsx`, `useHangarStore.ts` |
| 2026-04-10 | **Task D** — Loaner Ship Matrix integration (tabla + API + auto-add + badge LOANER + cascade remove) | Migración `20260410_ship_loaners`, endpoint `/api/loaners`, `src/lib/loaners.ts`, updates en store + UI |

Tabla `ship_loaners` en Supabase: **112 filas cargadas y verificadas**.

---

## 6. Comandos útiles (copy-paste friendly para el agente)

### 6.1 Type check solo de archivos relevantes
```bash
cd "/sessions/friendly-festive-ptolemy/mnt/web alfilo/al-filo-platform" && npx tsc --noEmit 2>&1 | grep -E "(useHangarStore|ShipContextMenu|HangarShipCard|loaners)"
```

### 6.2 Contar filas en una tabla de Supabase
```bash
node -e "require('dotenv').config();const p=require('postgres');const s=p(process.env.DATABASE_URL,{ssl:'require',prepare:false});s\`SELECT COUNT(*) FROM ship_loaners\`.then(r=>{console.log(r);s.end();})"
```

### 6.3 Correr una migración SQL entera
```bash
node -e "
require('dotenv').config();
const fs = require('fs');
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', prepare: false });
const file = 'prisma/migrations/YYYYMMDD_name/migration.sql';
(async () => {
  try {
    const contents = fs.readFileSync(file, 'utf8');
    await sql.unsafe(contents);
    console.log('migration OK');
    await sql.end();
  } catch (e) { console.error('ERROR:', e.message); process.exit(1); }
})();
"
```

### 6.4 Git — chequeo + commit + push (desde PowerShell del usuario)
```powershell
cd 'C:\Users\carsd\OneDrive\Escritorio\web alfilo\al-filo-platform'
git status
git add <files>
git commit -m 'feat(scope): mensaje'
git push origin master
```

---

## 7. Troubleshooting común

### `git status` se cuelga / `Operation not permitted` en `.git/index.lock`
Un VS Code o git GUI está abierto en la carpeta. Pablo tiene que cerrarlo. El agente no puede borrar locks por permisos del sandbox (Cowork file delete).

### `/api/loaners` devuelve 500
- Verificar que la tabla `ship_loaners` existe y tiene filas (ver snippet 6.2).
- Verificar que las env vars de Supabase están seteadas en Vercel (Project Settings → Environment Variables).
- Confirmar que local y prod apuntan al mismo proyecto Supabase.

### `PrepareStatementError` o similar con postgres.js
Estás usando el pooler (port 6543) sin `prepare: false`. Agregalo al config.

### Loaner de una nave no aparece cuando esperabas
Mismatch de normalización. Correr:
```sql
SELECT pledged_name, pledged_name_normalized FROM ship_loaners WHERE pledged_name ILIKE '%<fragmento>%';
```
Y comparar contra lo que devuelve `normalizeShipName(shipName)` en `src/lib/loaners.ts`. Si hay drift, ajustar ambos.

### Errores de TypeScript preexistentes
El repo tiene errores TS preexistentes en archivos tipo `HardpointGroup.tsx`, `LoadoutBuilder.tsx`, `RadarChart.tsx`, `ShipsGrid.tsx`, etc. **No son responsabilidad del agente** salvo que la tarea explícitamente pida arreglarlos. Filtrar siempre con grep a los archivos tocados.

---

## 8. Lo que NO hacer

- No usar `@prisma/client`. Nunca. Usar `sql` de `@/lib/db`.
- No committear `.env` ni pegar sus valores en respuestas/chats.
- No hacer `git push --force` ni `reset --hard` sin pedido explícito.
- No instalar dependencias pesadas sin avisar (prisma CLI, nuevos ORM, etc.).
- No asumir que el webfetch de RSI support funciona — tira 403. Usar Claude in Chrome MCP.
- No crear archivos `README.md` o docs extra salvo que Pablo los pida.
- No romper la normalización de nombres entre TS y SQL (tienen que matchear).
- No tocar `PowerManagementPanel.tsx` pensando que el bug de shields está ahí — está en el store.
- No usar localStorage/sessionStorage en artifacts tipo React (Cowork environment restriction). En la app real sí se usa, vía Zustand persist.

---

## 9. Si sos un nuevo agente leyendo esto por primera vez

1. Leé este archivo entero antes de hacer nada.
2. Leé el `package.json` para ver scripts y deps.
3. Si vas a tocar el hangar: leé `src/store/useHangarStore.ts` y `src/components/hangar/HangarShipCard.tsx` completos primero.
4. Si vas a tocar el DPS: leé `src/store/useLoadoutStore.ts` (es largo) y `src/components/ships/PowerManagementPanel.tsx`.
5. Si vas a tocar la DB: verificá con el snippet 6.2 que podés conectarte antes de escribir código.
6. Preguntá a Pablo en español, corto y al grano. No hagas essays ni formatos con bullets gigantes en chat. Este archivo es la excepción porque es doc.
7. Al terminar: `tsc --noEmit` filtrado + resumen corto en español + ofrecer commit/push.

---

_Última actualización: 2026-04-10. Si agregás capacidades nuevas, features grandes, o cambiás convenciones, actualizá este archivo en el mismo commit._
