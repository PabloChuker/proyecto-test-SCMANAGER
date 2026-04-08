# SC LABS (Al Filo Platform) — Project Context for Collaborators

**Version:** April 2026
**Repo:** github.com/PabloChuker/proyecto-test-SCMANAGER
**Live:** sclabs.vercel.app
**Team:** Pablo (lead), Sr. Frost, Xoli, Killy (security)

---

## 1. What Is This

SC LABS is a Star Citizen companion platform. It provides tools for ship analysis, loadout building, DPS calculation, mining optimization, crafting, and fleet/hangar management. Everything is 100% legal, client-side first, no direct RSI integration. Pro-user security always.

**Key principle:** "nada de tiendas fuera de CIG, siempre superlegales, siempre a favor del usuario y de su seguridad"

---

## 2. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 16.2.1 |
| UI | React | 19.2.4 |
| Language | TypeScript | ^5 |
| State | Zustand | ^5.0.12 |
| CSS | Tailwind CSS | ^4 |
| Icons | Lucide React | ^0.474.0 |
| ORM | Prisma Client | ^6.19.2 |
| DB | PostgreSQL (Supabase) | — |
| Deploy | Vercel | — |

---

## 3. Design System

| Element | Value |
|---------|-------|
| Background | zinc-950 |
| Cards/Panels | zinc-900, zinc-800/50 borders |
| Primary accent | amber-500 |
| Hover accent | cyan-500 |
| Success | emerald-400 |
| Error | red-400 |
| Border radius | rounded-sm |
| Glass effect | backdrop-blur-sm |
| Uppercase labels | text-[11px] tracking-[0.12em] uppercase text-zinc-500 |
| Font | System default (Geist via Next.js) |

All pages use a background video (`/public/videos/*.mp4`) and the shared Header component.

---

## 4. Project Structure

```
al-filo-platform/
  src/
    app/                    # Next.js App Router pages & API routes
      api/
        catalog/route.ts    # Component catalog (GET+POST)
        components/route.ts # Component search (GET+POST)
        components/browse/route.ts  # Component browsing (GET+POST)
        mining/lasers/route.ts      # Mining lasers
        ships/route.ts      # Ship list with search, filter, sort (GET+POST)
        ships/[id]/route.ts # Ship detail with hardpoints & loadout
        ships/compare/route.ts  # Compare up to 3 ships (GET+POST)
      assets/header/
        Header.tsx          # Shared header component
        navigation.ts       # NAV_MODULES & SIDEBAR_ITEMS config
      compare/page.tsx      # Ship comparator
      components/page.tsx   # Components browser
      crafting/page.tsx     # Crafting system
      dps/page.tsx          # DPS calculator
      hangar/page.tsx       # Hangar manager
      mining/page.tsx       # Mining tools
      ships/page.tsx        # Ship grid/browser
      ships/[id]/page.tsx   # Individual ship detail
    components/
      compare/              # ShipComparator, ShipSearchDropdown, charts
      dps/                  # PowerStatusGrid, RadarChart, StatsPanel
      hangar/               # HangarDashboard, FleetGrid, CCUGrid, ChainBuilder, modals
      ships/                # ShipCard, LoadoutBuilder, HardpointGroup, ComponentPicker
    lib/
      api-security.ts       # Input sanitization, rate limiting, security headers
      computeStats.ts       # Statistical calculations
      prisma.ts             # PrismaClient singleton
    store/
      useHangarStore.ts     # Fleet, CCUs, CCU Chains (localStorage)
      useLoadoutStore.ts    # Ship loadout state
    types/
      ships.ts              # Ship TypeScript interfaces
    data/
      crafting/             # blueprints.json, categories.json, materials.json
      mining/               # minerals, modules, refineries, refining-methods
      power-network-lookup.json
      ship-power-data.json
  public/
    ships/                  # 300+ ship thumbnails: {slug}.jpg
    icons/                  # Component type icons
    videos/                 # Background videos per section
  scripts/
    ingest_v3.py            # Main data ingestion from scunpacked-data
    populate_prices.mjs     # Ship MSRP price population
  prisma/
    migrations/             # SQL migration files
```

---

## 5. Database Schema (PostgreSQL on Supabase)

### Connection
```
DATABASE_URL (pooled, port 6543) for Prisma queries
DIRECT_URL (port 5432) for migrations
```

### Core Tables

**ships** — Main ship data
- id (uuid PK), reference (unique), name, manufacturer, role, size
- max_crew, mass, cargo_capacity, game_version
- msrp_usd (DOUBLE, nullable) — MSRP pledge price in USD
- warbond_usd (DOUBLE, nullable) — Warbond discount price

**ship_flight_stats** — Flight performance (FK: ship_id)
- scm_speed, max_speed, pitch, yaw, roll, boost speeds, accelerations

**ship_fuel** — Fuel & derived stats (FK: ship_id)
- hydrogen_capacity, quantum_fuel_capacity, quantum_range, shield_hp_total, hull_hp

**ship_hardpoints** — Mount points (FK: ship_reference)
- hardpoint_name, hardpoint_type, min_size, max_size
- default_item_class, default_item_name, default_item_uuid
- loadout_json (JSONB — nested children for turrets/gimbals)

**Component tables** (all have class_name as unique identifier):
- weapon_guns, shields, power_plants, coolers, quantum_drives

**Economy tables:**
- locations, shops, shop_inventory (with priceBuy/priceSell in aUEC)

**items** — Central entity table (Prisma-managed, used by some legacy queries)

### Important Notes
- Ship `id` is UUID type — must cast with `::text` when comparing to string params
- The `ships` table uses snake_case columns (e.g., `cargo_capacity`, `max_crew`)
- API responses use camelCase (e.g., `cargoCapacity`, `maxCrew`)
- The `reference` field is CIG's internal identifier (e.g., "AEGS_Avenger")

---

## 6. API Routes

All routes support both GET (backward compat) and POST (secure). POST is preferred.

### POST /api/ships
```json
Body: { "search": "", "manufacturer": "", "role": "", "page": 1, "limit": 24, "sortBy": "name", "sortOrder": "ASC" }
Response: { "data": [...], "meta": { "total", "page", "limit", "totalPages", "manufacturers": [] } }
```
Each ship in data: `{ id, reference, name, manufacturer, type, size, gameVersion, msrpUsd, warbondUsd, ship: { maxCrew, mass, cargo, scmSpeed, afterburnerSpeed, role, focus, career } }`

**CRITICAL:** Response format is `{ data: [...] }` NOT `{ ships: [...] }`

### GET /api/ships/[id]
Returns full ship with nested hardpoints, component stats, power network data.
`{ data: { ...ship, msrpUsd, warbondUsd, ship: { ...allStats } }, flatHardpoints: [...], shipPower: {...} }`

### POST /api/ships/compare
```json
Body: { "ids": ["uuid1", "uuid2", "uuid3"] }
```
Max 3 ships. Returns full comparison data.

### POST /api/catalog
```json
Body: { "type?", "types?", "minSize?", "maxSize?", "search?", "limit?" }
```

### POST /api/components
```json
Body: { "category", "maxSize", "minSize", "search", "limit" }
```

### POST /api/components/browse
```json
Body: { "table", "search", "size", "sort", "dir", "limit", "offset" }
```
Table validated against whitelist.

---

## 7. Security Layer

**Killy (security expert) audited the project.** All API calls were converted from GET to POST. Key security measures:

### api-security.ts exports:
- `sanitizeString(input, maxLength)` — strips SQL injection, null bytes, control chars
- `validateInt(value, default, min, max)` — clamp integers
- `validateSortColumn(input, whitelist, default)` — whitelist-only sort columns
- `validateSortDir(input)` — only ASC/DESC
- `validateWhitelist(input, allowed, default)` — strict value validation
- `parsePostBody(request)` — safe JSON parsing, max 50KB
- `validateIds(input, maxCount)` — UUID/reference validation, safe chars only
- `secureHeaders()` — standard security response headers

### middleware.ts:
- Rate limiting: 120 req/min per IP on /api/ routes (429 response)
- Security headers: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, HSTS, Permissions-Policy
- POST responses get `Cache-Control: no-store`

### Rules for all API development:
1. ALL user input MUST go through sanitizeString() or validateInt()
2. Sort columns MUST be validated against a whitelist (SORT_MAP)
3. Table names MUST be validated against ALLOWED_TABLES
4. Use parameterized queries ($1, $2...) — NEVER string interpolation
5. POST body parsed via parsePostBody() with size limit
6. All responses include secureHeaders()

---

## 8. Navigation System

Centralized in `src/app/assets/header/navigation.ts`:

```typescript
export const NAV_MODULES: NavModule[] = [
  { key: "dps",        label: "DPS Calculator",  href: "/dps" },
  { key: "ships",      label: "Ships",           href: "/ships",      matchPaths: ["/ships/"] },
  { key: "compare",    label: "Comparator",      href: "/compare" },
  { key: "components", label: "Components",       href: "/components" },
  { key: "mining",     label: "Mining",           href: "/mining" },
  { key: "crafting",   label: "Crafting",         href: "/crafting" },
  { key: "hangar",     label: "Hangar",           href: "/hangar" },
];
```

To add a new section: add entry to NAV_MODULES, create page in `src/app/{key}/page.tsx`.

---

## 9. Hangar Manager Module

### Architecture
- Client-side first (localStorage via Zustand persist)
- Key: `"sc-labs-hangar"` in localStorage
- 3 tabs: Fleet | CCUs | CCU Chains

### Store (useHangarStore.ts)

**Types:**
```typescript
InsuranceType = "LTI" | "120_months" | "72_months" | "48_months" | "24_months" | "6_months" | "3_months" | "unknown"
ItemLocation = "hangar" | "buyback" | "ccu_chain"

HangarShip { id, shipReference, pledgeName, pledgePrice, insuranceType, location, isGiftable, isMeltable, purchasedDate, notes }
HangarCCU { id, fromShip, fromShipReference, toShip, toShipReference, pricePaid, isWarbond, location: "hangar"|"buyback", notes }
CCUChainStep { fromShip, fromShipReference, toShip, toShipReference, ccuPrice, isOwned, isCompleted, isWarbond }
CCUChain { id, name, startShip, startShipReference, targetShip, targetShipReference, steps: CCUChainStep[], status: "planning"|"in_progress"|"completed" }
```

**Actions:** addShip/removeShip/updateShip, addCCU/removeCCU/updateCCU, addChain/removeChain/updateChain, importFromJSON (Guildswarm/CCU Game/native), exportToJSON, clearAll

### Components
- `HangarDashboard.tsx` — Main orchestrator, 3 tabs with filters and stats
- `FleetGrid.tsx` / `HangarShipCard.tsx` — Ship grid display
- `CCUGrid.tsx` / `CCUCard.tsx` — CCU inventory display
- `ChainList.tsx` / `ChainBuilder.tsx` — CCU chain management with savings calculation
- `AddShipModal.tsx` — Search ships via POST API, auto-fill MSRP price
- `AddCCUModal.tsx` — 3-step flow (from ship -> to ship -> details), shows MSRP
- `EditShipModal.tsx` / `EditCCUModal.tsx` — Edit pledge info
- `ImportModal.tsx` — Drag & drop JSON import (Guildswarm, CCU Game, native)

### CCU System Concepts
- **CCU (Cross-Chassis Upgrade):** Converts one ship to another by paying the price difference
- **Warbond:** Discounted CCU that requires new money (not store credit)
- **Chain/Ladder:** Series of CCUs to reach a target ship at lower total cost than direct upgrade
- **Buyback:** CCU was melted but can be re-purchased from buyback queue
- **Savings calculation:** Chain Cost vs Direct CCU Price (targetMSRP - startMSRP)

---

## 10. Ship Images

Convention: `/public/ships/{slug}.jpg`

Helper function to get ship thumbnail URL:
```typescript
function getShipThumbUrl(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `/ships/${slug}.jpg`;
}
```

---

## 11. Known Issues & React 19 Gotchas

1. **useRef requires initial value:** `useRef<T | undefined>(undefined)` — not just `useRef<T>()`
2. **API response format:** Always `{ data: [...] }` not `{ ships: [...] }`
3. **UUID comparison:** In raw SQL, use `id::text = $1` when comparing UUID column to string parameter
4. **SWC binary:** Not available in some CI — use `npx tsc --noEmit` for type checking instead of `next build`
5. **HangarCCU location:** Type is `"hangar" | "buyback"` — NOT the full `ItemLocation` union (excludes "ccu_chain")
6. **Click propagation:** Buttons inside clickable cards need `e.stopPropagation()`
7. **Strict mode off:** tsconfig has `strict: false`, `noImplicitAny: false` — be aware of implicit any types

---

## 12. Development Workflow

### Local Dev
```bash
cd al-filo-platform
npm run dev
# Opens on localhost:3000
```

### Deploy
```bash
git add -A && git commit -m "description" && git push
# Vercel auto-deploys from master branch
```

### Type Check
```bash
npx tsc --noEmit
# Some pre-existing errors in HardpointGroup.tsx, LoadoutBuilder.tsx are known
```

### Database Changes
1. Write SQL migration in `prisma/migrations/`
2. Run against Supabase SQL Editor or via script
3. Update Prisma schema if needed
4. Regenerate client: `npx prisma generate`

### Data Ingestion
```bash
# Python virtual environment
cd scripts && source venv/bin/activate
python ingest_v3.py  # Loads ship data from scunpacked-data
```

---

## 13. File Conventions

- **Pages:** `src/app/{module}/page.tsx` — "use client" with video bg + Header
- **Components:** `src/components/{module}/ComponentName.tsx` — PascalCase
- **API routes:** `src/app/api/{resource}/route.ts` — GET+POST with shared handler function
- **Stores:** `src/store/use{Name}Store.ts` — Zustand with persist middleware
- **Types:** `src/types/{domain}.ts`
- **Static data:** `src/data/{domain}/*.json`

---

## 14. Pending / Future Work

- [ ] Supabase sync option for hangar data (user chose "local default + sync optional")
- [ ] Auto-calculate CCU chain savings in chain builder (needs all MSRP populated)
- [ ] Ship prices: ~120 ships still unmatched (special editions, new variants)
- [ ] Warbond prices (separate from MSRP, not yet populated)
- [ ] Consider rotating Supabase password
- [ ] Delete .env.bak file

---

## 15. Quick Reference: Adding a New Module

1. Add to `NAV_MODULES` in `src/app/assets/header/navigation.ts`
2. Create `src/app/{key}/page.tsx` with:
   ```tsx
   "use client";
   import Header from "@/app/assets/header";
   export default function Page() {
     return (
       <div className="relative min-h-screen bg-zinc-950 text-zinc-100">
         <video src="/videos/bg.mp4" autoPlay loop muted className="fixed inset-0 w-full h-full object-cover opacity-20 -z-10" />
         <Header subtitle="Module Name" />
         <main className="max-w-7xl mx-auto px-4 pt-24 pb-16">
           {/* Content */}
         </main>
       </div>
     );
   }
   ```
3. If API needed: create `src/app/api/{resource}/route.ts` using POST with api-security.ts
4. If state needed: create `src/store/use{Name}Store.ts` with Zustand + persist

---

*This document was generated to ensure all collaborators work from the same knowledge base. Load this into your Claude session as system context before starting work on SC LABS.*
