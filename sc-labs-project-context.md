# SC Labs — Project Context

**Last Updated:** April 11, 2026
**Status:** Active development — post-refactor (flat repo structure)
**Deployment:** sclabs.space (Vercel auto-deploy from `master`)
**Repository:** github.com/PabloChuker/proyecto-test-SCMANAGER

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Repository Structure (post-refactor)](#2-repository-structure-post-refactor)
3. [Tech Stack](#3-tech-stack)
4. [Application Modules](#4-application-modules)
5. [Database Layer](#5-database-layer)
6. [DPS / LoadoutBuilder (current focus)](#6-dps--loadoutbuilder-current-focus)
7. [Hangar Store & Chrome Extension](#7-hangar-store--chrome-extension)
8. [Known Quirks & Workarounds](#8-known-quirks--workarounds)
9. [Important Paths](#9-important-paths)
10. [Working State & Open Threads](#10-working-state--open-threads)

---

## 1. Project Overview

SC Labs is a community-driven fleet management and ship analysis platform for **Star Citizen** players. It started as a hangar importer + CCU planner and has grown into a multi-module tool that covers:

- **Hangar management** — import pledges/buybacks, CCU chains, fleet value
- **Ship analysis** — DPS/loadout builder with flight dynamics, 3D viewer
- **Crafting & mining & cargo** — resources, boxes, cargo grids
- **Trade** — commodities, terminals, routes
- **Org / party / friends / streamers** — social features
- **Activities / profiles / auth** — account plumbing via Supabase

It consists of two pieces that ship together:

1. **Web platform** — Next.js 16 App Router app (this repo)
2. **Chrome extension** — `sc-labs-hangar-extension/` folder, scrapes RSI hangar pages and exports JSON for import into the platform

---

## 2. Repository Structure (post-refactor)

On April 11, 2026 the repo was flattened (commit `150fab5 refactor(repo): unify src structure and remove legacy directories`). **There is no more `al-filo-platform/` subfolder.** Next.js lives at the repo root.

```
proyecto-test-SCMANAGER/                 ← repo root (also Next.js root)
│
├── package.json                         ← name: "sc-manager-canonical" v1.0.0
├── next.config.mjs                      ← Next 16.2.1
├── tsconfig.json                        ← TS 5, strict
├── eslint.config.mjs
├── postcss.config.mjs                   ← Tailwind v4
├── .env.example
├── .gitignore
├── .claude/                             ← local AI settings (not shipped)
├── sc-labs-project-context.md           ← this file
│
├── src/
│   ├── app/                             ← Next.js App Router
│   │   ├── layout.tsx                   ← root layout
│   │   ├── page.tsx                     ← landing
│   │   ├── globals.css
│   │   ├── assets/header/               ← header images
│   │   ├── api/                         ← route handlers
│   │   │   ├── activities/
│   │   │   ├── auth/
│   │   │   ├── cargo-grids/
│   │   │   ├── catalog/                 ← /api/catalog route.ts
│   │   │   ├── ccu/
│   │   │   ├── components/              ← /api/components/browse/, /route.ts
│   │   │   ├── crafting/
│   │   │   ├── loaners/
│   │   │   ├── mining/
│   │   │   ├── referral/
│   │   │   ├── ships/                   ← /api/ships/[id]/, /compare/, /route.ts
│   │   │   └── trade/
│   │   ├── activities/
│   │   ├── auth/
│   │   ├── cargo/
│   │   ├── compare/
│   │   ├── components/                  ← components browser page
│   │   ├── crafting/
│   │   ├── dps/                         ← DPS/LoadoutBuilder page (sclabs.space/dps)
│   │   ├── friends/
│   │   ├── hangar/
│   │   ├── login/
│   │   ├── mining/
│   │   ├── my-account/
│   │   ├── org/
│   │   ├── party/
│   │   ├── profile/
│   │   ├── ships/
│   │   ├── streamers/
│   │   └── trade/
│   │
│   ├── components/
│   │   ├── cargo/                       ← CargoGrid3D.tsx, CargoPage.tsx
│   │   ├── compare/
│   │   ├── components/                  ← generic/shared primitives
│   │   ├── domain/
│   │   │   └── dps/                     ← PowerStatusGrid, StatsPanel
│   │   ├── hangar/                      ← AddShipModal, CCUCard, ChainBuilder,
│   │   │                                  CCUGrid, ChainList, EditShipModal,
│   │   │                                  EditCCUModal, FleetGrid, CCUChainCalculator…
│   │   ├── notifications/
│   │   ├── shared/
│   │   │   ├── PageVideoBackground.tsx
│   │   │   ├── charts/                  ← RadarChart.tsx
│   │   │   └── flight-dynamics/         ← RotationModule, ShipViewer3D,
│   │   │                                  ShipFlightDynamicsSingle/Comparator, utils/
│   │   ├── ships/                       ← LoadoutBuilder.tsx (main DPS UI),
│   │   │                                  ComponentPicker, HardpointGroup/Slot,
│   │   │                                  PowerManagementPanel, ShipCard, ShipHero,
│   │   │                                  ShipFilters, ShipSelector, ShipSpecSheet,
│   │   │                                  ShipSpecs, StatGauge, loadout-utils.ts
│   │   ├── streamers/
│   │   └── trade/                       ← CommodityBrowser, TerminalDirectory, TradeRoutes
│   │
│   ├── contexts/
│   │   └── AuthContext.tsx
│   │
│   ├── data/                            ← static JSON data
│   │   ├── activities/
│   │   ├── crafting/
│   │   ├── mining/
│   │   ├── power-network-lookup.json
│   │   └── ship-power-data.json
│   │
│   ├── lib/
│   │   ├── api-security.ts
│   │   ├── ccu-engine.ts
│   │   ├── computeStats.ts              ← ship/loadout stats aggregator
│   │   ├── db.ts                        ← postgres client (`postgres` pkg)
│   │   ├── loaners.ts
│   │   ├── notifications.ts
│   │   ├── shipGlb.ts                   ← GLB model resolver (R2 / local)
│   │   ├── workOrderStore.ts
│   │   └── supabase/
│   │       ├── admin.ts                 ← service-role client
│   │       ├── client.ts                ← browser client
│   │       ├── middleware.ts
│   │       └── server.ts                ← RSC/route-handler client
│   │
│   ├── store/
│   │   ├── useHangarStore.ts            ← Zustand hangar store (unchanged from old)
│   │   └── useLoadoutStore.ts           ← Zustand loadout store
│   │
│   └── types/
│       └── ships.ts
│
├── database/                            ← SQL-only (no Prisma runtime)
│   ├── migrations/                      ← 32 numbered + 3 legacy
│   │   ├── 001_create_manufacturers.sql
│   │   ├── 002_create_armors.sql
│   │   ├── …
│   │   ├── 032_create_weapon_guns.sql
│   │   ├── legacy_001_satellite_tables.sql
│   │   ├── legacy_002_fix_crew.sql
│   │   └── legacy_003_fix_hardpoints.sql
│   └── seeds/                           ← matching per-table seeds
│
├── prisma/                              ← schema + migrations folder preserved
│                                          after runtime removal (commit 5ad4652)
│
├── docs/
│   ├── architecture/
│   │   └── diagrams/
│   ├── archive/
│   │   ├── legacy-sql/                  ← equipment_load, fix_crew_and_children,
│   │   │                                  hardpoints_remaining, satellite_tables
│   │   └── old-setup.md                 ← [ARCHIVED] Phase 1 setup notes
│   └── business/
│       └── SCLABS_Analisis_Competitivo.docx
│
├── scripts/                             ← ingest / import / migration utilities
│   ├── data/
│   ├── importers/
│   ├── sql/
│   ├── ingest_scunpacked.py
│   ├── ingest_v2.py
│   ├── ingest_v3.py
│   ├── extract_ship_hardpoints.py
│   ├── debug_stats.py  debug_missing.py  debug_unpacked.py
│   ├── migrate-turret-loadouts.{mjs,py}
│   ├── populate_prices.mjs
│   ├── seed-glb-keys.mjs
│   ├── upload-glb-r2.mjs
│   └── ship_hardpoints_export.csv
│
├── public/                              ← static assets (ship thumbnails, videos…)
├── precios_naves/                       ← scraped ship prices data
├── sc-labs-hangar-extension/            ← Chrome Extension (Manifest V3)
│
├── cws-*.png / cws-icon-128.png         ← Chrome Web Store assets
├── SC_Labs_Hangar_Manager_Proposal.docx
├── GuildSwarm_Analysis_Report.pdf
├── PRIVACY_POLICY.md
├── INSTRUCCIONES_MERGE_XOLI.md
└── chart-preview.html
```

---

## 3. Tech Stack

**Runtime / Framework**

- Next.js **16.2.1** (App Router, React Server Components)
- React **19.2.4**, React DOM **19.2.4**
- TypeScript 5 (strict)
- Babel: `babel-plugin-react-compiler` 1.0.0

**Styling**

- Tailwind CSS v4 (`@tailwindcss/postcss`)
- `clsx` + `tailwind-merge`
- `lucide-react` icons
- Dark theme, amber-primary / cyan-accents design language

**State**

- Zustand 5 (`useHangarStore`, `useLoadoutStore`)

**Data / DB**

- Supabase (`@supabase/ssr`, `@supabase/supabase-js`) — auth + database
- `postgres` (Porsager) — direct SQL client in `src/lib/db.ts`
- Raw SQL migrations (no Prisma runtime after commit `5ad4652`)
- Schemas still preserved in `prisma/` for reference

**3D / Visualization**

- Three.js `0.183.2` + `@types/three` — flight dynamics & cargo grids
- `react-grid-layout` 1.5 — DPS LoadoutBuilder grid
- `html-to-image` — screenshot/export

**Infra / misc**

- AWS S3 client (`@aws-sdk/client-s3`) — Cloudflare R2 for GLB models
- `dotenv` for scripts

**Deployment**

- Vercel auto-deploy on push to `master`
- Domain: **sclabs.space**
- Build command: `next build`
- Project name (Vercel): uses repo root directly (no subdir thanks to the refactor)

---

## 4. Application Modules

| Route                | Purpose                                                                        |
|----------------------|--------------------------------------------------------------------------------|
| `/`                  | Landing page                                                                   |
| `/login`, `/auth`    | Supabase-based auth flows                                                      |
| `/my-account`, `/profile` | User account management                                                    |
| `/hangar`            | Hangar dashboard (ships, buyback, CCU chains) — backed by `useHangarStore`     |
| `/ships`             | Ship browser / detail pages                                                    |
| `/dps`               | **DPS / LoadoutBuilder** — main analysis UI (current focus area)               |
| `/compare`           | Side-by-side ship comparison                                                   |
| `/components`        | Component / hardpoint catalog browser                                          |
| `/cargo`             | Cargo grid visualizer (3D) with ship selector                                  |
| `/crafting`          | Crafting materials / recipes (joined with resources + box sizes)               |
| `/mining`            | Mining gadgets / refinery data                                                 |
| `/trade`             | Commodity browser, terminal directory, trade route planner                    |
| `/activities`        | Activities catalog                                                             |
| `/org`, `/party`, `/friends`, `/streamers` | Social features                                          |

API route handlers live under `src/app/api/*` and mirror most of these modules (`catalog`, `ships`, `components`, `ccu`, `cargo-grids`, `crafting`, `mining`, `trade`, `loaners`, `activities`, `referral`, `auth`).

---

## 5. Database Layer

**State:** Prisma runtime removed in commit `5ad4652 chore(repo): remove prisma runtime and preserve sql migrations`. The app talks to Postgres via:

1. **Supabase** for auth + RLS-gated reads/writes, through `src/lib/supabase/{client,server,admin,middleware}.ts`
2. **Direct `postgres` client** in `src/lib/db.ts` for server-side queries that don't need Supabase's layers

Migrations and seeds are plain SQL, applied manually or via scripts (not by Prisma). The `prisma/` folder still exists with the old schema as documentation.

### Migrations (`database/migrations/`)

Numbered `001…032`, one table per file:

```
001_create_manufacturers          017_create_missiles
002_create_armors                  018_create_missile_launchers
003_create_cargo_grids             019_create_paints
004_create_containers              020_create_power_plants
005_create_coolers                 021_create_quantum_drives
006_create_emps                    022_create_quantum_fuel_tanks
007_create_flair_cockpit_items     023_create_quantum_interdiction_generators
008_create_flair_floor_items       025_create_scanners                 ← note: 024 skipped
009_create_flair_surface_items     026_create_self_destruct_systems
010_create_flair_wall_items        027_create_shields
011_create_flight_controllers      028_create_transponders
012_create_fuel_intakes            029_create_turrets
013_create_fuel_tanks              030_create_weapon_attachments
014_create_life_support_generators 031_create_weapon_defensives
015_create_main_thrusters          032_create_weapon_guns
016_create_manneuver_thrusters
```

Plus three legacy files kept for history:

```
legacy_001_satellite_tables.sql
legacy_002_fix_crew.sql
legacy_003_fix_hardpoints.sql
```

⚠️ **Known gaps to sanity-check before production use:**
- `024_*` is missing from the numbered sequence
- Typo in file name: `016_create_manneuver_thrusters.sql` (should be "maneuver")

### Seeds (`database/seeds/`)

One seed file per table. Several still have placeholder markers in their filenames indicating data that needs to be sourced:

```
scanners_seed___BUSCAR___.sql
transponders_seed___BUSCAR___.sql
weapon_attachments_seed___BUSCAR.sql
main_thrusters_seed_____.sql
manneuver_thrusters_seed_____.sql
paints_seed_____.sql
```

The top-level orchestrator is `001_equipment_load.sql`.

### Archived SQL

Historical SQL that no longer runs in prod lives in `docs/archive/legacy-sql/`:
`equipment_load.sql`, `fix_crew_and_children.sql`, `hardpoints_remaining.sql`, `satellite_tables.sql`.

### Ingestion scripts (`scripts/`)

- `ingest_scunpacked.py`, `ingest_v2.py`, `ingest_v3.py` — pull data from the SC datamining repo
- `extract_ship_hardpoints.py` → `ship_hardpoints_export.csv`
- `migrate-turret-loadouts.{mjs,py}` — one-off migrations
- `populate_prices.mjs` — prices from `precios_naves/`
- `seed-glb-keys.mjs`, `upload-glb-r2.mjs` — GLB ship models to Cloudflare R2
- `debug_stats.py`, `debug_missing.py`, `debug_unpacked.py` — diagnostics

---

## 6. DPS / LoadoutBuilder (current focus)

Route: `sclabs.space/dps`
Main file: `src/components/ships/LoadoutBuilder.tsx`

### What it does

A per-ship combat/power analysis board built on `react-grid-layout`. Users pick a ship, the builder pulls its hardpoints, and renders a dynamic grid of widgets covering weapons, missiles, shields, power plants, coolers, quantum drives, radar, utility, flight dynamics (3D), signatures, power grid, power management, turning/strafe profiles, combat summary, and more.

### Grid model

- **20 columns** internal grid = **5 visual units × 4 subcolumns** (each visual unit is 0.25 wide steps)
- `rowHeight = colWidth` (square cells) driven by a `ResizeObserver` on the grid container
- Widgets have fixed widths (`WIDGET_W` map) and heights computed from actual content per ship via `widgetContentHeightPx` → `pxToSubunits`
- Heights snap to multiples of 0.25 vertical units, widths stay fixed
- Margins `[12, 12]` between cards preserved

### Default layout

`COLUMN_LAYOUT` distributes 18 widgets across 5 columns (`x: 0, 4, 8, 12, 16`). `flight-dynamics-3d` is a wide widget (w=8) that sits below columns 8 and 12. User-dragged positions persist in `localStorage` under key `al-filo-layout-v3` (bumped from `v2` on reset).

### Recent fixes

- `8fb0806 LoadoutBuilder: dynamic per-ship widget heights + original 5-column default layout`
  Replaced the static `DEFAULT_LAYOUT` with a dynamic builder that distributes widgets across 5 columns and sizes each widget's height based on the actual number of hardpoints for the current ship. Fixes Pablo's "desperdigado" (scattered) complaint after the initial react-grid-layout refactor.

- `aa112fb fix(LoadoutBuilder): move layout hooks above early returns (Rules of Hooks)`
  Fixed a client-side crash (`sclabs.space/dps` showing "This page couldn't load") caused by placing `useMemo` hooks (`visibleIds`, `widgetHeights`, `layout`) **after** the early `if (!shipInfo) return null` returns. When React re-rendered from loading → loaded, the number of hooks called changed, violating the Rules of Hooks. All hooks are now defined on lines ~454–614, before the early returns at ~669–671.

- `150fab5 refactor(repo): unify src structure and remove legacy directories`
  Removed the `al-filo-platform/` subfolder. All paths in this file and any scripts should reference the flat structure going forward.

### Related files

- `src/components/ships/loadout-utils.ts` — helpers
- `src/components/ships/HardpointGroup.tsx`, `HardpointSlot.tsx`
- `src/components/ships/PowerManagementPanel.tsx`, `ComponentPicker.tsx`, `StatGauge.tsx`
- `src/components/domain/dps/PowerStatusGrid.tsx`, `StatsPanel.tsx`
- `src/components/shared/flight-dynamics/*` — 3D viewer, rotation module, dynamics comparator
- `src/components/shared/charts/RadarChart.tsx`
- `src/lib/computeStats.ts` — stats aggregator
- `src/lib/shipGlb.ts` — GLB model resolver
- `src/store/useLoadoutStore.ts`

---

## 7. Hangar Store & Chrome Extension

These modules were the original SC Labs surface and remain in the refactored repo largely unchanged. The store, components, import/export flow, and detection logic described in previous versions of this file still apply; only paths have moved.

### Hangar Store — `src/store/useHangarStore.ts`

- Types: `InsuranceType`, `ItemLocation`, `ItemCategory`, `HangarShip`, `HangarCCU`, `CCUChainStep`, `CCUChain`
- Actions: `addShip/removeShip/updateShip`, CCU equivalents, chain actions, `importFromJSON`, `exportToJSON`, `clearAll`
- `detectItemCategory()` — trusts extension-provided category, else falls back to name-based detection (ships, packages, paints, gear, flair, subscriber, upgrade, other)
- `parseSCLabsItems()` — converts extension JSON → store shapes, detects insurance from `alsoContains`
- `onRehydrateStorage()` — backfills `itemCategory` for pre-existing stored ships
- Supported import formats: SC Labs Hangar Importer (extension), SC Labs backup, CCU Game, legacy
- Persistence: Zustand persist, localStorage key `"sc-labs-hangar"`

### Hangar UI — `src/components/hangar/`

`HangarDashboard` (not currently present as `HangarDashboard.tsx` in the flat tree — verify), `FleetGrid`, `CCUGrid`, `HangarShipCard` (note: this file wasn't in the `ls` above — check if it was renamed), `CCUCard`, `AddShipModal`, `AddCCUModal`, `EditShipModal`, `EditCCUModal`, `ChainBuilder`, `ChainList`, `CCUChainCalculator`. Ship thumbnails in `public/ships/*.jpg`, slug-based lookup with `SLUG_FIXES` overrides.

### Chrome Extension — `sc-labs-hangar-extension/`

**Version 1.2.0**, Manifest V3. Runs on `robertsspaceindustries.com/account/pledges*` and `…/buy-back-pledges*`. Scrapes hangar + buyback HTML, classifies via `detectCategory()` (same rules as the store), exports JSON in the format:

```ts
{ version: "1.0", exportedBy, exportDate, myHangar: [...], myBuyBack: [...] }
```

Files: `manifest.json`, `content.js`, `popup.html`, `popup.js`, `background.js`, `icons/`.

Known fixes already in v1.2.0: buyback price selector fallbacks, CCU image lookup (`getShipThumbUrl`), absolute image URL conversion, BIS-rewards-as-paint classification.

Chrome Web Store assets (icon 128, promo marquee/small, screenshot) live at the repo root (`cws-*.png`) for submission.

---

## 8. Known Quirks & Workarounds

### CRLF ↔ LF phantom diffs (after `git pull` on Windows)

After pulling on Windows with default `autocrlf`, `git status` will show hundreds of "modified" files (~276 at last check) with diffs where the insertions and deletions match exactly (e.g. 39/39). **These are not real changes** — they're pure line-ending flips. Do **not** commit them.

Fix options:
1. `git checkout .` at the repo root to discard them (safe when there's no real WIP)
2. Add a `.gitattributes` with `* text=auto eol=lf` to lock line endings and prevent recurrence

### OneDrive locks on `.git/index.lock`

OneDrive sometimes holds `.git/index.lock` open, causing `git push` or even `git status` to fail with "unable to unlink". Workarounds:
- Run git from **PowerShell** (not Command Prompt or WSL) on the OneDrive path
- Or pause OneDrive sync temporarily
- The "desktop" (Escritorio) copy is usually more reliable than the OneDrive-synced "Documentos" copy

### Vercel path issues from nested directories

Historically, running `git add al-filo-platform/src/...` from inside the `al-filo-platform/` directory created doubled paths like `al-filo-platform/al-filo-platform/src/...`. This is now moot after the `150fab5` flat-structure refactor — **Next.js lives at the repo root**, so always run git/Next commands from the repo root.

### Rules of Hooks in LoadoutBuilder

All `useMemo`/`useState`/`useCallback` calls in `LoadoutBuilder.tsx` must be declared **before** any `if (!shipInfo) return null` style early return. See commit `aa112fb` for the fix template. Adding new hooks after the early returns will silently break the page when the ship data transitions between loading and loaded states.

---

## 9. Important Paths

### Git & environment

- **Repo root (canonical working copy):** `C:\Users\carsd\OneDrive\Escritorio\Sc_LABS\proyecto-test-SCMANAGER`
- **Mount for this AI session:** `/sessions/friendly-festive-ptolemy/mnt/Sc_LABS/proyecto-test-SCMANAGER`
- **Remote:** `github.com/PabloChuker/proyecto-test-SCMANAGER`
- **Active working branch:** `master` — contains the full refactor + our LoadoutBuilder fixes. This is the canonical branch going forward.
- **Other branches on remote:**
  - `master-backup`, `master-old` — pre-refactor safety snapshots
  - `refactor/repo-restructure` — older refactor branch (behind `master`, superseded)
  - `refactor/base-limpia` — mentioned in the refactor report as "nueva base del proyecto", but **not yet present on remote**. If/when Xoli pushes it, evaluate whether to migrate. For now we work directly on `master`.
- **Environment file:** `.env` at repo root (template in `.env.example`). Expects `DATABASE_URL`, `REDIS_URL`, `SCUNPACKED_REPO_URL`, `SCUNPACKED_LOCAL_PATH`, `GAME_VERSION`. Supabase keys + any Cloudflare R2 credentials live alongside (not in `.env.example`).

### Key source files to remember

- `src/components/ships/LoadoutBuilder.tsx` — main DPS UI
- `src/components/ships/loadout-utils.ts`
- `src/lib/computeStats.ts` — stats aggregator
- `src/lib/db.ts` — postgres client
- `src/lib/supabase/{client,server,admin,middleware}.ts`
- `src/lib/shipGlb.ts` — GLB resolver (R2)
- `src/store/useHangarStore.ts`, `src/store/useLoadoutStore.ts`
- `src/contexts/AuthContext.tsx`
- `src/data/ship-power-data.json`, `src/data/power-network-lookup.json`

### Static assets

- **Ship thumbnails:** `public/ships/*.jpg` (slugified)
- **Background videos:** `public/videos/bg.mp4`
- **Ship GLB models:** hosted on Cloudflare R2, resolved via `src/lib/shipGlb.ts`

### Extension

- **Folder:** `sc-labs-hangar-extension/`
- **Install for dev:** `chrome://extensions` → Developer mode → Load unpacked → select that folder
- **Web Store assets at repo root:** `cws-icon-128.png`, `cws-promo-marquee.png`, `cws-promo-small.png`, `cws-screenshot-1.png`

### Docs & business

- `docs/architecture/diagrams/` — architecture diagrams
- `docs/archive/` — `old-setup.md`, `legacy-sql/`
- `docs/business/SCLABS_Analisis_Competitivo.docx`
- `SC_Labs_Hangar_Manager_Proposal.docx` (root)
- `GuildSwarm_Analysis_Report.pdf` (root)
- `PRIVACY_POLICY.md`
- `INSTRUCCIONES_MERGE_XOLI.md` — collaborator merge instructions

---

## 10. Refactor Report Summary (`informe_refactor_scmanager`)

A 2-page refactor report was shared on 2026-04-11 summarizing the cleanup that landed in `master`. Key points that are **not** already captured elsewhere in this document:

### Cambios principales (confirmed)

- Legacy structures removed (`al-filo-platform/`, duplicates) — ✅ in commit `150fab5`
- Component reorg into `domain/` / `shared/` / layout folders — ✅ visible in `src/components/{domain,shared}/`
- `RadarChart` unified, imports cleaned up — ✅ now single file in `src/components/shared/charts/`
- Prisma runtime fully removed — ✅ commit `5ad4652`, **0 active Prisma references** in code
- Direct SQL via `postgres.js` (Porsager) against Supabase Postgres — ✅ in `src/lib/db.ts`
- `prisma/migrations/` preserved as historical SQL only
- `package.json` / `package-lock.json` cleaned up

### Estado final (per the report)

- **0 referencias activas a Prisma** in runtime code
- ~14 historical references remaining only in docs/logs (safe to leave)
- Build compiles correctly — production failures were due to **env vars**, not code
- **~54 TypeScript errors** exist but are **non-blocking** (tech debt to clean up over time)

### ⚠️ Vercel — config fixes still required

These are the root cause of the `sclabs.space/dps` production breakage and need to be applied in the Vercel dashboard (not in code):

1. **Root Directory → `.`** (currently still pointing at the removed `al-filo-platform/` subfolder)
2. **Verify environment variables** are present on Vercel: `DATABASE_URL`, Supabase keys, Cloudflare R2 credentials, etc.
3. **Confirm production branch** is `master`

Until Root Directory is fixed on Vercel, the deployment will keep failing regardless of what we push.

### Branch strategy (from the report)

- Report proposes a new branch `refactor/base-limpia` as "nueva base del proyecto" with `master` kept as backup
- **Current reality (2026-04-11):** `refactor/base-limpia` does **not** exist on remote yet. We continue working on `master`, which already contains all the refactor work. If/when `refactor/base-limpia` appears, revisit.

### Siguiente paso estratégico (per the report)

**Unificar modelo de datos** — align the three representations:
1. JSON files in `src/data/` (`ship-power-data.json`, `power-network-lookup.json`, activities/crafting/mining)
2. TypeScript types in `src/types/ships.ts` (and any inline types in components)
3. PostgreSQL schema in `database/migrations/`

This is the top-priority follow-up work after the structural refactor.

---

## 11. Working State & Open Threads

### ✅ Recently finished (2026-04-11)

- Refactor report received and merged into this context doc
- Dynamic per-ship widget heights + 5-column default layout in LoadoutBuilder (`8fb0806`)
- Rules-of-Hooks crash on `/dps` fixed (`aa112fb`)
- Repo flattened, legacy directories removed (`150fab5`)
- Prisma runtime removed, SQL migrations preserved (`5ad4652`)
- Context document rewritten to reflect the flat structure

### 🟡 In progress / to revisit

- **Unify data model** — align JSON (`src/data/`) ↔ TS types (`src/types/ships.ts`) ↔ DB schema (`database/migrations/`). This is the headline next task from the refactor report.
- **Database work** — 32 SQL migrations are in place; gaps to fix:
  - `024_*` is missing from the numbered sequence
  - Typo in filename: `016_create_manneuver_thrusters.sql` (should be "maneuver")
  - Seeds with placeholder markers (missing source data):
    `scanners_seed___BUSCAR___`, `transponders_seed___BUSCAR___`,
    `weapon_attachments_seed___BUSCAR`, `main_thrusters_seed_____`,
    `manneuver_thrusters_seed_____`, `paints_seed_____`
- **~54 non-blocking TypeScript errors** remaining after the refactor — tech debt to clean up incrementally
- **`docs/architecture/diagrams/`** currently only has one Gemini-generated PNG — no written architecture doc yet

### 🔴 Open follow-ups (infrastructure)

- **Fix Vercel config** (Root Directory → `.`, verify env vars, confirm production branch = `master`). This is blocking production deployments.
- Add a `.gitattributes` (`* text=auto eol=lf`) to lock line endings so the CRLF/LF phantom-diff issue stops recurring after every `git pull` on Windows
- Eventually: Chrome Web Store submission of extension v1.2.0

### 🎯 Suggested next tasks when resuming

1. **Vercel dashboard** — change Root Directory to `.` and verify env vars (unblocks prod)
2. **Data model unification** — start the JSON ↔ TS ↔ SQL alignment (the headline refactor-report next step)
3. **Database gaps** — fill the `024_*` migration gap, fix `manneuver_thrusters` typo, complete the `__BUSCAR__` / `_____` seed files
4. **Line endings** — add `.gitattributes` + one-time normalization to kill the phantom diffs
5. **TS cleanup** — incremental chip-away at the ~54 non-blocking TypeScript errors
6. **Architecture doc** — write a proper `docs/architecture/` overview (data flow: RSI extension → hangar store / SC-unpacked ingest → Postgres → API routes → client)
7. **Smoke test `/dps`** on prod once Vercel is fixed, to confirm our LoadoutBuilder fixes render correctly

---

**Generated:** 2026-04-11 (flat-structure refactor edition, consolidated with `informe_refactor_scmanager.pdf`)
**Previous version:** 2026-04-07 (described the removed `al-filo-platform/` subfolder layout — now superseded)
