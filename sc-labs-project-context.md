# SC Labs Hangar Management System — Complete Project Context

**Last Updated:** April 7, 2026
**Status:** Active Development

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Chrome Extension (v1.2.0)](#chrome-extension-v120)
3. [Platform — Hangar Store](#platform--hangar-store)
4. [Platform — UI Components](#platform--ui-components)
5. [Known Issues & Recent Fixes](#known-issues--recent-fixes)
6. [Pending Tasks](#pending-tasks)
7. [Important Paths](#important-paths)

---

## 1. Project Overview

### What is SC Labs?

SC Labs is a community-driven fleet management tool for **Star Citizen** players. The project consists of two main components:

1. **Chrome Extension (SC Labs Hangar Importer)** — Scrapes player hangar data from robertsspaceindustries.com and exports to JSON
2. **Web Platform (al-filo-platform)** — Next.js-based frontend to manage ships, CCUs, and CCU upgrade chains

### Tech Stack

- **Extension:** Manifest V3, vanilla JavaScript
- **Platform:** Next.js (React), TypeScript, Zustand (state management), Tailwind CSS
- **Deployment:** GitHub → Vercel auto-deploy
- **Styling:** Dark theme with Tailwind; color accents (amber for primary, cyan for highlights)

### Repository Structure

```
Git Repo: C:\Users\carsd\OneDrive\Documentos\web alfilo
(mounted at /sessions/clever-loving-carson/mnt/web alfilo)

├── sc-labs-hangar-extension/     (Chrome Extension)
│   ├── manifest.json              (v1.2.0)
│   ├── content.js                 (RSI page scraper)
│   ├── popup.html                 (UI for exporting)
│   ├── popup.js                   (Export handler & stats)
│   ├── background.js              (MV3 service worker)
│   └── icons/                     (16x32x48x128 PNG)
│
└── al-filo-platform/              (Next.js Web App)
    ├── src/
    │   ├── app/
    │   │   ├── hangar/            (Hangar page)
    │   │   │   └── page.tsx
    │   │   ├── ships/             (Other modules)
    │   │   ├── dps/
    │   │   └── ...
    │   ├── components/hangar/     (Hangar UI components)
    │   │   ├── HangarDashboard.tsx
    │   │   ├── HangarShipCard.tsx
    │   │   ├── CCUCard.tsx
    │   │   ├── EditShipModal.tsx
    │   │   ├── EditCCUModal.tsx
    │   │   ├── AddShipModal.tsx
    │   │   ├── AddCCUModal.tsx
    │   │   ├── ImportModal.tsx
    │   │   ├── ChainBuilder.tsx
    │   │   ├── ChainList.tsx
    │   │   ├── FleetGrid.tsx
    │   │   └── CCUGrid.tsx
    │   └── store/
    │       └── useHangarStore.ts  (Zustand store)
    ├── public/
    │   ├── ships/                 (Ship thumbnails: *.jpg)
    │   └── videos/
    └── ...
```

---

## 2. Chrome Extension (v1.2.0)

### Overview

The extension scrapes Star Citizen hangar and buyback data from RSI account pages and exports it as JSON for import into the platform.

**Version:** 1.2.0
**Manifest Version:** 3
**Target Pages:** `https://robertsspaceindustries.com/account/pledges*` and `*/account/buy-back-pledges*`

### File Structure

| File | Purpose |
|------|---------|
| `manifest.json` | Extension metadata and permissions (v1.2.0) |
| `content.js` | Content script that runs on RSI pages, scrapes HTML, exports data |
| `popup.html` | Dark-themed UI with status, options, progress, stats, logs |
| `popup.js` | Popup controller: status check, export trigger, stats calculation |
| `background.js` | Service worker: message routing between popup and content script |
| `icons/` | 16x32x48x128 PNG icons (generated from SCLABS.jpg) |

### manifest.json

```json
{
  "manifest_version": 3,
  "name": "SC Labs Hangar Importer",
  "version": "1.2.0",
  "description": "Export your Star Citizen hangar and buyback pledges for use in SC Labs fleet management tools.",
  "permissions": ["activeTab"],
  "host_permissions": ["https://robertsspaceindustries.com/*"],
  "background": { "service_worker": "background.js" },
  "content_scripts": [
    {
      "matches": [
        "https://robertsspaceindustries.com/account/pledges*",
        "https://robertsspaceindustries.com/en/account/pledges*",
        "https://robertsspaceindustries.com/account/buy-back-pledges*",
        "https://robertsspaceindustries.com/en/account/buy-back-pledges*"
      ],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

### How content.js Works

The content script is injected on RSI account pages and performs these steps:

1. **Prevent double-injection:** Checks `window.__scLabsHangarInjected` flag
2. **Check login status:** Verifies user is on `/account/` page (login check)
3. **Fetch pages:** Paginated requests to hangar and buyback endpoints
4. **Parse HTML:** Converts HTML to DOM and extracts data
5. **Scrape data:** Extracts pledge details, images, prices, items
6. **Build export:** Formats as `{ version, exportedBy, exportDate, myHangar, myBuyBack }`
7. **Send progress:** Updates popup via `chrome.runtime.sendMessage()`

#### detectCategory() Function

Classifies pledges by name pattern. **FULL CODE:**

```javascript
function detectCategory(name) {
  const n = name.toLowerCase();

  // CCU / Upgrades — "Upgrade -", "Ship Upgrades -"
  if (n.startsWith("upgrade -") || n.startsWith("upgrade –") || n.startsWith("ship upgrades -") || n.startsWith("ship upgrade")) return "upgrade";

  // Ships (standalone)
  if (n.startsWith("standalone ship")) return "standalone_ship";

  // Game packages
  if (n.startsWith("package -") || n.startsWith("package –") || n.includes("starter pack") || n.includes("game package") || n.includes("squadron 42")) return "game_package";

  // Paints / Skins / Liveries (including BIS reward paints for ships)
  if (n.startsWith("paints -") || n.startsWith("paint -") || n.includes(" paint") ||
      n.includes("skin -") || n.includes("livery") || n.includes("coloration")) return "paint";
  // BIS (Best in Show) ship rewards are typically paints — but NOT pennants, trophies, charms
  if ((n.includes("bis ") || n.includes("best in show")) && n.includes("reward") &&
      !n.includes("pennant") && !n.includes("trophy") && !n.includes("charm") &&
      !n.includes("plushie") && !n.includes("figurine") && !n.includes("poster") &&
      !n.includes("coin") && !n.includes("badge") && !n.includes("helmet") &&
      !n.includes("armor") && !n.includes("gear")) return "paint";

  // Gear / Armor / Weapons / Tools / Suits / Packs
  if (n.startsWith("gear -") || n.startsWith("add-ons -") ||
      n.includes("armor") || n.includes("helmet") || n.includes("undersuit") ||
      n.includes("backpack") || n.includes("jacket") || n.includes("weapons pack") || n.includes("weapon pack") ||
      n.includes("multi-tool") || n.includes("knife") || n.includes("combat knife") ||
      n.includes("pistol") || n.includes("rifle") || n.includes("shotgun") || n.includes("smg") || n.includes("lmg") ||
      n.includes("grenade launcher") || n.includes("tractor beam") || n.includes("mining gadget") ||
      n.includes("repeater") || n.includes("cannon") || n.includes("laser cannon") ||
      n.includes("hazard suit") || n.includes("refinery suit") || n.includes("service uniform") ||
      n.includes("medical device") || n.includes("mask") || n.includes("flight blades") ||
      n.includes("bomb rack") || n.includes("weapon kit") || n.includes("upgrade kit") ||
      n.includes("quikflare") || n.includes("medivac") || n.includes("purifier") ||
      n.includes("gear pack") || n.includes("hydration pack")) return "gear";

  // Subscriber items
  if (n.startsWith("subscribers ") || n.startsWith("subscriber ") || n.includes("subscribers exclusive") ||
      n.includes("imperator reward") || n.includes("centurion reward") ||
      n.includes("vip grand admiral") || n.includes("vip high admiral")) return "subscriber";

  // Flair — decorations, trophies, rewards, coins, collectibles, event items
  if (n.includes("flair") || n.includes("trophy") || n.includes("pennant") ||
      n.includes("charm") || n.includes("plushie") || n.includes("figurine") || n.includes("poster") ||
      n.includes("calendar") || n.includes("statue") || n.includes("diorama") ||
      n.includes("bis ") || n.includes("best in show") ||
      n.includes("festival") || n.includes("citizencon") ||
      n.includes("holiday") || n.includes("hangar decoration") || n.includes("flower") ||
      n.includes("pet") || n.includes("stuffed") || n.includes("bobblehead") ||
      n.includes("space globe") || n.includes("display case") || n.includes("lamp") ||
      n.includes("rug") || n.includes("towel") || n.includes("mug") || n.includes("cup") ||
      n.includes("action figure") || n.includes("badge") || n.includes("pin") ||
      n.includes("challenge coin") || n.includes("coin") || n.includes("envelope") ||
      n.includes("year of the") || n.includes("coramor") ||
      n.includes("reward") || n.includes("goodies") || n.includes("t-shirt") ||
      n.includes("luminalia") || n.includes("invictus") ||
      n.includes("advent") || n.includes("referral bonus") ||
      n.includes("chair") || n.includes("couch") || n.includes("lounge") || n.includes("throne") ||
      n.includes("nightstand") || n.includes("loveseat") || n.includes("cushion") ||
      n.includes("vase") || n.includes("plant pot") || n.includes("bust") ||
      n.includes("banner") || n.includes("specimen tank") || n.includes("cargo collection") ||
      n.includes("display") || n.includes("die ship") || n.includes("toy pistol") ||
      n.includes("resource drive") || n.includes("salvaged") ||
      n.includes("pirate week") || n.includes("xenothreat") ||
      n.includes("birthday goodies") || n.includes("digital goodies") ||
      n.includes("killer creature") || n.includes("brands of the") ||
      n.includes("cold front") || n.includes("cuddly cargo") || n.includes("decorative cargo") ||
      n.includes("explorer") || n.includes("adventurer") ||
      n.includes("big winner") || n.includes("completion package") ||
      n.includes("patch collection") || n.includes("resupply") ||
      n.includes("academy") || n.includes("grx prototype") ||
      n.includes("coupon") || n.includes("gourd") || n.includes("ornate")) return "flair";

  // Packs / Bundles
  if (n.includes("packs -") || n.includes("bundle") || n.includes("combo") ||
      n.includes("master set")) return "gear";

  // UEC / Credits
  if (n.includes("uec") || n.includes("credits") || n.includes("starting money")) return "other";

  return "other";
}
```

#### parseCCUFromName() Function

Extracts CCU upgrade path from pledge name like `"Upgrade - Ship A to Ship B [- Edition]"`:

```javascript
function parseCCUFromName(name, price) {
  const m = name.match(/Upgrade\s*[-–]\s*(.+?)\s+to\s+(.+?)(?:\s+[-–]\s+(?:Standard|Warbond).*)?$/i);
  if (!m) return null;
  return {
    toSkuId: "",
    fromShipData: { id: 0, name: m[1].trim() },
    toShipData: { id: 0, name: m[2].trim().replace(/\s*[-–]\s*(Standard|Warbond).*$/i, "") },
    price,
  };
}
```

#### parseHangarPage() and parseBuybackPage()

**HTML Selectors for MY HANGAR** (`/account/pledges`):

```
ul.list-items > li                      (each pledge item)
  h3                                    (pledge name)
  input.js-pledge-id                    (RSI ID)
  input.js-pledge-value                 (price like "$55.00 USD")
  .date-col                             (created date)
  .items-col                            (contained items text)
  .image (style=background-image)       (pledge image)
  .with-images .item                    (each contained item)
    .title                              (item name)
    .kind                               (item type: Ship, Insurance, etc.)
    img                                 (item image)
  .without-images .item                 (items without images)
  .also-contains .item                  (also contains items)
  .js-gift                              (if giftable)
  .js-reclaim                           (if exchangeable)
```

**HTML Selectors for BUYBACK** (`/account/buy-back-pledges`):

```
article.pledge                          (each buyback item)
  h1                                    (pledge name)
  figure > img                          (image src)
  dl > dt/dd                            (metadata: Last Modified, Contained, Cost, Price, Value, etc.)
  .unavailable .caption                 (if "Not available")
```

**Key Fields Extracted:**

- **All items:** id, name, image URL, lastModification, contained, category, link, available
- **For upgrades (category="upgrade"):** ccuInfo { toSkuId, fromShipData, toShipData, price }
- **For other items:** elementData { price, shipInThisPackData[], alsoContainData[] }

#### Image Handling

- **Hangar items:** Image from CSS `background-image: url(...)` in `.image` element
- **Buyback items:** Image from `img src` attribute in `figure` or generic `img`
- **URL conversion:** Converts `/` prefix to RSI base URL, `//` to `https:`

#### Export Format

```typescript
{
  version: "1.0",
  exportedBy: "SC Labs Hangar Importer",
  exportDate: "2026-04-07T13:00:00.000Z",
  myHangar: [
    {
      id: "sclabs-...",
      name: "Standalone Ships - Cutlass Black - LTI",
      image: "https://...",
      lastModification: "March 25, 2026",
      contained: "Contains: Cutlass Black and 1 item",
      category: "standalone_ship",
      link: "https://robertsspaceindustries.com/account/pledges?...",
      available: true,
      isGiftable: false,
      isExchangeable: true,
      elementData: {
        price: 159.99,
        shipInThisPackData: [{ name: "Cutlass Black", image: "..." }],
        alsoContainData: ["Self-Land Hangar", "Lifetime Insurance"]
      }
    },
    ...
  ],
  myBuyBack: [...]
}
```

### popup.html

**Dark Theme UI** with orange/amber accents:

- **Header:** SC Labs logo (36x36), title "SC LABS", version badge (v1.1.0)
- **Status Area:** RSI connection indicator (dot color), status text, hint
- **Options Row:** Checkboxes for "My Hangar" (checked) and "Buyback" (checked)
- **Export Button:** Primary amber gradient button
- **Download Button:** Success green gradient button (hidden until export done)
- **Progress Bar:** Shows percent, animated fill bar
- **Stats Grid:** 3-column cards (Ships, CCUs, Paints, Gear, Flair, Subs, Total)
- **Log Area:** Monospace scrollable log with color-coded lines (info, success, warn, error)
- **Footer:** "SC LABS — Community Tools" link to sclabs.net

**Colors:**
- Primary: `#f59e0b` (amber-500)
- Background: `#09090b` (zinc-950)
- Borders: `#27272a` (zinc-700)
- Text: `#e4e4e7` (zinc-200)
- Cards: `#18181b` (zinc-900)

### popup.js

**Flow:**

1. **checkRSIStatus()** — Called on popup open
   - Queries active tab URL
   - Checks if on `robertsspaceindustries.com`
   - Sends `checkLogin` message to content script
   - Sets status dot: green (online) or red (offline)
   - Enables/disables export button

2. **Export Handler (btnExport click)**
   - Disables button, shows progress
   - Gets hangar/buyback checkbox states
   - Sends `exportHangar` action to content script
   - Listens for progress messages from content script

3. **Progress Updates (export-progress messages)**
   - Updates progress bar percentage
   - Updates status label and detail text
   - Appends log lines with timestamps
   - Color-codes logs by level (info, success, warn, error)

4. **Export Complete (export-complete message)**
   - Stores export data in `exportData` variable
   - Counts items by category
   - Updates stat cards (ships, ccus, paints, gear, flair, subs, total)
   - Shows stats grid and download button
   - Logs breakdown of item counts

5. **Download Handler (btnDownload click)**
   - Creates JSON blob
   - Triggers browser download as `sclabs-hangar_YYYY-MM-DD.json`

**Stat Calculation Logic:**

```typescript
const allItems = [...exportData.myHangar, ...exportData.myBuyBack];
const ships = allItems.filter(i => i.category === "standalone_ship" || i.category === "game_package").length;
const ccus = allItems.filter(i => i.category === "upgrade").length;
const paints = allItems.filter(i => i.category === "paint").length;
const gear = allItems.filter(i => i.category === "gear").length;
const flair = allItems.filter(i => i.category === "flair").length;
const subs = allItems.filter(i => i.category === "subscriber").length;
const total = allItems.length;
```

### background.js

**Service Worker (MV3):**

- **Message Routing:** Forwards `export-progress`, `export-complete`, `export-error` messages from content script to popup
- **Content Script Injection:** When user clicks extension icon on RSI, injects `content.js` if not already present
- **Logs:** Outputs `[SC Labs]` prefixed messages to console

---

## 3. Platform — Hangar Store (useHangarStore.ts)

**File:** `/sessions/clever-loving-carson/mnt/web alfilo/al-filo-platform/src/store/useHangarStore.ts`

### Type Definitions

```typescript
export type InsuranceType =
  | "LTI"
  | "120_months"
  | "72_months"
  | "48_months"
  | "24_months"
  | "6_months"
  | "3_months"
  | "unknown";

export type ItemLocation = "hangar" | "buyback" | "ccu_chain";

export type ItemCategory =
  | "standalone_ship"
  | "game_package"
  | "paint"
  | "flair"
  | "gear"
  | "subscriber"
  | "upgrade"
  | "other";

export interface HangarShip {
  id: string;                       // UUID
  shipReference: string;            // matches ships table reference (for linking)
  shipName: string;                 // actual ship name for image lookup ("Gladius", "Perseus")
  pledgeName: string;               // pledge name from RSI ("Standalone Ships - Cutlass Black")
  pledgePrice: number;              // USD
  insuranceType: InsuranceType;
  location: ItemLocation;           // "hangar", "buyback", "ccu_chain"
  itemCategory: ItemCategory;
  isGiftable: boolean;
  isMeltable: boolean;
  purchasedDate: string | null;     // ISO date
  imageUrl: string;                 // RSI CDN URL
  notes: string;
}

export interface HangarCCU {
  id: string;
  fromShip: string;                 // "Avenger" (ship name)
  fromShipReference: string;        // (for future ship table lookup)
  toShip: string;                   // "Aurora MR"
  toShipReference: string;
  pricePaid: number;                // USD
  isWarbond: boolean;
  location: Exclude<ItemLocation, "ccu_chain">; // "hangar" | "buyback"
  notes: string;
}

export interface CCUChainStep {
  fromShip: string;
  fromShipReference: string;
  toShip: string;
  toShipReference: string;
  ccuPrice: number;
  isOwned: boolean;                 // user has this CCU
  isCompleted: boolean;
  isWarbond: boolean;
}

export interface CCUChain {
  id: string;
  name: string;                     // "Avenger → Cutlass"
  startShip: string;
  startShipReference: string;
  targetShip: string;
  targetShipReference: string;
  steps: CCUChainStep[];
  status: "planning" | "in_progress" | "completed";
}
```

### detectItemCategory() Function

Detects item category from pledge name. **FULL CODE:**

```typescript
function detectItemCategory(name: string, rawCategory: string): ItemCategory {
  // If the extension already classified it, trust that
  if (rawCategory === "standalone_ship") return "standalone_ship";
  if (rawCategory === "game_package") return "game_package";
  if (rawCategory === "paint") return "paint";
  if (rawCategory === "gear") return "gear";
  if (rawCategory === "flair") return "flair";
  if (rawCategory === "subscriber") return "subscriber";
  if (rawCategory === "upgrade") return "upgrade";

  // Name-based detection for items with empty/unknown category
  const n = name.toLowerCase();

  // CCU / Upgrades
  if (n.startsWith("upgrade -") || n.startsWith("upgrade –") || n.startsWith("ship upgrades -") || n.startsWith("ship upgrade")) return "upgrade";

  // Ships
  if (n.startsWith("standalone ship")) return "standalone_ship";

  // Game packages
  if (n.startsWith("package -") || n.startsWith("package –") || n.includes("starter pack") || n.includes("game package") || n.includes("squadron 42")) return "game_package";

  // Paints / Skins / Liveries (including BIS reward paints for ships)
  if (n.startsWith("paints -") || n.startsWith("paint -") || n.includes(" paint") ||
      n.includes("skin -") || n.includes("livery") || n.includes("coloration")) return "paint";
  // BIS (Best in Show) ship rewards are typically paints — but NOT pennants, trophies, charms
  if ((n.includes("bis ") || n.includes("best in show")) && n.includes("reward") &&
      !n.includes("pennant") && !n.includes("trophy") && !n.includes("charm") &&
      !n.includes("plushie") && !n.includes("figurine") && !n.includes("poster") &&
      !n.includes("coin") && !n.includes("badge") && !n.includes("helmet") &&
      !n.includes("armor") && !n.includes("gear")) return "paint";

  // Gear / Armor / Weapons / Tools / Suits / Packs
  if (n.startsWith("gear -") || n.startsWith("add-ons -") ||
      n.includes("armor") || n.includes("helmet") || n.includes("undersuit") ||
      n.includes("backpack") || n.includes("jacket") || n.includes("weapons pack") || n.includes("weapon pack") ||
      n.includes("multi-tool") || n.includes("knife") || n.includes("combat knife") ||
      n.includes("pistol") || n.includes("rifle") || n.includes("shotgun") || n.includes("smg") || n.includes("lmg") ||
      n.includes("grenade launcher") || n.includes("tractor beam") || n.includes("mining gadget") ||
      n.includes("repeater") || n.includes("cannon") || n.includes("laser cannon") ||
      n.includes("hazard suit") || n.includes("refinery suit") || n.includes("service uniform") ||
      n.includes("medical device") || n.includes("mask") || n.includes("flight blades") ||
      n.includes("bomb rack") || n.includes("weapon kit") || n.includes("upgrade kit") ||
      n.includes("quikflare") || n.includes("medivac") || n.includes("purifier") ||
      n.includes("gear pack") || n.includes("hydration pack")) return "gear";

  // Subscriber items
  if (n.startsWith("subscribers ") || n.startsWith("subscriber ") || n.includes("subscribers exclusive") ||
      n.includes("imperator reward") || n.includes("centurion reward") ||
      n.includes("vip grand admiral") || n.includes("vip high admiral")) return "subscriber";

  // Flair — decorations, trophies, rewards, coins, collectibles, event items
  if (n.includes("flair") || n.includes("trophy") || n.includes("pennant") ||
      n.includes("charm") || n.includes("plushie") || n.includes("figurine") || n.includes("poster") ||
      n.includes("calendar") || n.includes("statue") || n.includes("diorama") ||
      n.includes("bis ") || n.includes("best in show") ||
      n.includes("festival") || n.includes("citizencon") ||
      n.includes("holiday") || n.includes("hangar decoration") || n.includes("flower") ||
      n.includes("pet") || n.includes("stuffed") || n.includes("bobblehead") ||
      n.includes("space globe") || n.includes("display case") || n.includes("lamp") ||
      n.includes("rug") || n.includes("towel") || n.includes("mug") || n.includes("cup") ||
      n.includes("action figure") || n.includes("badge") || n.includes("pin") ||
      n.includes("challenge coin") || n.includes("coin") || n.includes("envelope") ||
      n.includes("year of the") || n.includes("coramor") ||
      n.includes("reward") || n.includes("goodies") || n.includes("t-shirt") ||
      n.includes("luminalia") || n.includes("invictus") ||
      n.includes("advent") || n.includes("referral bonus") ||
      n.includes("chair") || n.includes("couch") || n.includes("lounge") || n.includes("throne") ||
      n.includes("nightstand") || n.includes("loveseat") || n.includes("cushion") ||
      n.includes("vase") || n.includes("plant pot") || n.includes("bust") ||
      n.includes("banner") || n.includes("specimen tank") || n.includes("cargo collection") ||
      n.includes("display") || n.includes("die ship") || n.includes("toy pistol") ||
      n.includes("resource drive") || n.includes("salvaged") ||
      n.includes("pirate week") || n.includes("xenothreat") ||
      n.includes("birthday goodies") || n.includes("digital goodies") ||
      n.includes("killer creature") || n.includes("brands of the") ||
      n.includes("cold front") || n.includes("cuddly cargo") || n.includes("decorative cargo") ||
      n.includes("explorer") || n.includes("adventurer") ||
      n.includes("big winner") || n.includes("completion package") ||
      n.includes("patch collection") || n.includes("resupply") ||
      n.includes("academy") || n.includes("grx prototype") ||
      n.includes("coupon") || n.includes("gourd") || n.includes("ornate")) return "flair";

  // Packs / Bundles
  if (n.includes("packs -") || n.includes("bundle") || n.includes("combo") ||
      n.includes("master set")) return "gear";

  return "other";
}
```

### parseSCLabsItems() Function

Converts extension JSON items to store HangarShip/HangarCCU format. **FULL CODE:**

```typescript
function parseSCLabsItems(items: any[], location: ItemLocation): {
  ships: Omit<HangarShip, "id">[];
  ccus: Omit<HangarCCU, "id">[];
  skipped: number;
  errors: string[];
} {
  const ships: Omit<HangarShip, "id">[] = [];
  const ccus: Omit<HangarCCU, "id">[] = [];
  const errors: string[] = [];
  const skipped = 0;

  for (const item of items) {
    try {
      const category = item.category || "";
      const name = item.name || "";

      if (category === "upgrade" && item.ccuInfo) {
        // Parse as CCU upgrade
        const ci = item.ccuInfo;
        const ccu: Omit<HangarCCU, "id"> = {
          fromShip: ci.fromShipData?.name || "",
          fromShipReference: "",
          toShip: ci.toShipData?.name || "",
          toShipReference: "",
          pricePaid: ci.price || 0,
          isWarbond: false,
          location: location === "ccu_chain" ? "hangar" : location,
          notes: "",
        };
        if (ccu.fromShip && ccu.toShip) {
          ccus.push(ccu);
        }
      } else {
        // Parse as item (ship, paint, flair, gear, subscriber, etc.)
        const ed = item.elementData || {};
        const shipList = ed.shipInThisPackData || [];
        const price = ed.price || 0;
        const alsoContains = ed.alsoContainData || [];
        const imageUrl = item.image || "";

        // Detect insurance from alsoContains and pledge name
        let insurance: InsuranceType = "unknown";
        const allTexts = [...alsoContains, name];
        for (const extra of allTexts) {
          const extraLower = String(extra).toLowerCase();
          if (extraLower.includes("lifetime")) { insurance = "LTI"; break; }
          if (extraLower.includes("120")) { insurance = "120_months"; break; }
          if (extraLower.includes("72")) { insurance = "72_months"; break; }
          if (extraLower.includes("48")) { insurance = "48_months"; break; }
          if (extraLower.includes("24")) { insurance = "24_months"; break; }
          if (extraLower.includes("10 year") || extraLower.includes("10year") || extraLower.includes("10-year")) { insurance = "120_months"; break; }
          if (extraLower.includes("6 month")) { insurance = "6_months"; break; }
          if (extraLower.includes("3 month")) { insurance = "3_months"; break; }
        }

        // Determine item category
        const itemCat = detectItemCategory(name, category);

        if ((itemCat === "standalone_ship" || itemCat === "game_package") && shipList.length > 0) {
          for (const shipInfo of shipList) {
            const sName = shipInfo.name || "";
            ships.push({
              shipReference: "",
              shipName: sName,
              pledgeName: name,
              pledgePrice: shipList.length === 1 ? price : 0,
              insuranceType: insurance,
              location,
              itemCategory: itemCat,
              isGiftable: item.isGiftable || false,
              isMeltable: item.isExchangeable || true,
              purchasedDate: item.lastModification ? parseDateString(item.lastModification) : null,
              imageUrl,
              notes: shipList.length > 1 ? `Part of package: ${name}` : "",
            });
          }
        } else {
          // Single item (ship without detailed data, paint, gear, flair, etc.)
          const extractedName = (itemCat === "standalone_ship" || itemCat === "game_package")
            ? extractShipNameFromPledge(name)
            : extractItemName(name);
          ships.push({
            shipReference: "",
            shipName: extractedName,
            pledgeName: name,
            pledgePrice: price,
            insuranceType: insurance,
            location,
            itemCategory: itemCat,
            isGiftable: item.isGiftable || false,
            isMeltable: item.isExchangeable || true,
            purchasedDate: item.lastModification ? parseDateString(item.lastModification) : null,
            imageUrl,
            notes: "",
          });
        }
      }
    } catch (err) {
      errors.push(
        `Failed to parse "${item.name || "unknown"}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return { ships, ccus, skipped, errors };
}
```

### Import/Export Flow

**importFromJSON(data)**

1. Calls `detectAndParseFormat(data)` to identify format (SC Labs, CCU Game, legacy, etc.)
2. Parses hangar items (location="hangar") and buyback items (location="buyback")
3. Adds parsed items to store with generated UUIDs
4. Returns summary with item counts, values, and errors

**Supported Formats:**

- **SC Labs Hangar Importer:** `{ version, exportedBy, myHangar, myBuyBack }`
- **SC Labs backup:** `[{ id, pledgeName, shipName, ... }]`
- **CCU Game:** `[{ type: "ship"|"ccu", reference, ... }]`
- **Legacy format:** `[{ kind: "Standalone Ship", title, ... }]`

**exportToJSON()**

Returns JSON string of current store state:

```json
{
  "version": "1.0",
  "exportDate": "2026-04-07T13:00:00.000Z",
  "ships": [...],
  "ccus": [...],
  "chains": [...]
}
```

### onRehydrateStorage() Backward Compatibility

When store rehydrates from localStorage, patches old items that lack `itemCategory` field:

```typescript
onRehydrateStorage: () => (state) => {
  if (state && state.ships) {
    let needsUpdate = false;
    const patched = state.ships.map((ship) => {
      if (!ship.itemCategory) {
        needsUpdate = true;
        return { ...ship, itemCategory: detectItemCategory(ship.pledgeName || ship.shipName || "", "") };
      }
      return ship;
    });
    if (needsUpdate) state.ships = patched;
  }
}
```

### Store Actions

```typescript
// Ships
addShip(ship: Omit<HangarShip, "id">) → void
removeShip(id: string) → void
updateShip(id: string, updates: Partial<HangarShip>) → void

// CCUs
addCCU(ccu: Omit<HangarCCU, "id">) → void
removeCCU(id: string) → void
updateCCU(id: string, updates: Partial<HangarCCU>) → void

// Chains
addChain(chain: Omit<CCUChain, "id">) → void
removeChain(id: string) → void
updateChain(id: string, updates: Partial<CCUChain>) → void

// Import/Export
importFromJSON(data: any) → { ships, ccus, summary, errors }
exportToJSON() → string (JSON)
clearAll() → void
```

---

## 4. Platform — UI Components

**Location:** `/sessions/clever-loving-carson/mnt/web alfilo/al-filo-platform/src/components/hangar/`

### Complete Component Listing

| Component | Purpose |
|-----------|---------|
| **HangarDashboard.tsx** | Main dashboard with tabs (My Fleet, Buyback, CCU Chains), filters, modals |
| **HangarShipCard.tsx** | Card displaying a single ship/item with image, price, insurance, actions |
| **CCUCard.tsx** | Card displaying a CCU upgrade with "from" → "to" ships |
| **EditShipModal.tsx** | Modal to edit ship name, category, price, insurance, location, notes |
| **EditCCUModal.tsx** | Modal to edit CCU price, location, warbond status, notes |
| **AddShipModal.tsx** | Modal to manually add a new ship to the hangar |
| **AddCCUModal.tsx** | Modal to manually add a new CCU to the hangar |
| **ImportModal.tsx** | Modal to paste/upload JSON export from extension or backup |
| **ChainBuilder.tsx** | Interactive builder for multi-step CCU upgrade chains |
| **ChainList.tsx** | Displays all CCU chains with status and steps |
| **FleetGrid.tsx** | Grid container for HangarShipCard components |
| **CCUGrid.tsx** | Grid container for CCUCard components |

### HangarShipCard.tsx

**Purpose:** Displays a ship with image, price, insurance badge, location badge, and action buttons.

**Key Features:**

- **Image Fallback Chain:** Local thumbnail → RSI CDN image → Category emoji
- **Local Thumbnails:** Maps `shipName` to `/ships/{slug}.jpg` files
- **SLUG_FIXES:** Common name mappings (e.g., "gladiator" → "t8c-gladiator")
- **Insurance Color Coding:** LTI (green), 120m (amber), 72m (amber), 48m (orange), etc.
- **Location Badges:** Hangar (cyan) or Buyback (orange)
- **Category Badges:** Ship, Package, Paint, Gear, Flair, etc.
- **Actions:** Edit, Move (↔ Fleet/Buyback), Delete

**resolveDisplayName() Function:**

Tries multiple sources for ship name:
1. Explicit `ship.shipName` field
2. Parse from `ship.notes` (e.g., "Ship: Cutlass")
3. Extract from `ship.pledgeName`

**getShipThumbUrl() Function:**

```typescript
function getShipThumbUrl(shipName: string): string {
  if (!shipName) return "";
  const lower = shipName.toLowerCase().trim();

  // Check fixed mappings first
  if (SLUG_FIXES[lower]) return `/ships/${SLUG_FIXES[lower]}.jpg`;

  const slug = lower
    .replace(/[''()]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/-$/, "");
  return `/ships/${slug}.jpg`;
}
```

**Colors:**

- **Insurance badges:** emerald (LTI), amber (120m, 72m), orange (48m, 24m), violet (6m), rose (3m)
- **Category badges:** cyan (ship), indigo (package), pink (paint), yellow (flair), teal (gear), violet (sub), sky (ccu)
- **Location badges:** cyan (hangar), orange (buyback)

### CCUCard.tsx

**Purpose:** Displays a CCU upgrade path with "from ship" → "to ship" visualization.

**Key Features:**

- **Image:** Shows thumbnail of "to" ship (the destination)
- **Layout:** Compact card with from/to ship names and arrow icon
- **Warbond Badge:** Shows if this is a warbond CCU
- **Standard Badge:** Shows if standard (non-warbond)
- **Price Display:** Price paid for the CCU
- **Ship References:** Shows short references (e.g., "AVNG" → "CUT")
- **Edit/Delete:** Action buttons with confirmation

### EditShipModal.tsx

**Purpose:** Edit ship properties (pledge name, category, price, insurance, location, notes, giftable/meltable).

**Features:**

- **Pledge Name Input:** Text field for pledge name
- **Category Dropdown:** All 8 categories (Ship, Package, Paint, Gear, Flair, Subscriber, CCU, Other)
- **Price Input:** Number field (min 0, step 0.01)
- **Insurance Dropdown:** LTI, 120m, 72m, 48m, 24m, 6m, 3m, Unknown
- **Location Dropdown:** Hangar, Buyback, CCU Chain
- **Checkboxes:** Giftable, Meltable
- **Notes Field:** Textarea for optional notes
- **Error Handling:** Validation for price field
- **Save/Cancel:** Action buttons

### EditCCUModal.tsx

**Purpose:** Edit CCU properties (price paid, location, warbond status, notes).

**Features:**

- **From/To Ships:** Read-only display
- **Price Paid:** Number input
- **Location:** Dropdown (Hangar/Buyback)
- **Warbond:** Checkbox
- **Notes:** Textarea
- **Save/Cancel:** Action buttons

### HangarDashboard.tsx

**Purpose:** Main dashboard with tabs, filters, modals, and stats.

**Tabs:**

1. **My Fleet** — Ships/items in "hangar" location
2. **Buyback** — Ships/items in "buyback" location
3. **CCU Chains** — Multi-step upgrade chains

**Features:**

- **Stats Cards:** Ship count, fleet value, item count, total investment
- **Filters:** Category (all, ships, packages, ccu, paints, gear, flair, subscriber, other), Insurance (LTI, 120m, etc.), Search
- **Sort:** By Name, Price, Date
- **Bulk Actions:** Bulk move buyback items to fleet, clear all (with confirmation)
- **Add/Import:** Buttons to import JSON, add ship, add CCU manually
- **Export/Backup:** Export current state as JSON

**Category Counts:**

Dynamically counts items in each category for filter chip labels.

---

## 5. Known Issues & Recent Fixes

### Fixed Issues

#### 1. Buyback Prices Not Showing

**Problem:** Buyback page scraper wasn't finding prices.

**Fix:** Added multiple selector fallbacks + USD pattern matching:

```javascript
// Try multiple selectors first
const priceEl = art.querySelector(".js-pledge-value, .price, .amount, .final-amount, .credit-amount, .store-price");
if (priceEl) price = parseFloat((priceEl.value || priceEl.textContent || "").replace(/[^0-9.]/g, "")) || 0;

// Fallback: look in dt/dd pairs
if (price === 0) {
  dts.forEach((dt, idx) => {
    const key = dt.textContent.trim().toLowerCase();
    if (key.includes("cost") || key.includes("price") || key.includes("value") || key.includes("pledge")) {
      const p = parseFloat((dds[idx]?.textContent || "").replace(/[^0-9.]/g, "")) || 0;
      if (p > 0) price = p;
    }
  });
}

// Fallback: scan all text for USD pattern
if (price === 0) {
  const usdMatch = art.textContent.match(/\$\s*(\d+(?:\.\d{2})?)\s*USD/);
  if (usdMatch) price = parseFloat(usdMatch[1]) || 0;
}
```

#### 2. CCU Photos Not Showing

**Problem:** CCUCard didn't have image lookup.

**Fix:** Added `getShipThumbUrl()` function and image fallback:

```typescript
const toShipThumb = getShipThumbUrl(ccu.toShip);
// ... in JSX:
{!imgError && toShipThumb ? (
  <img src={toShipThumb} alt={ccu.toShip} onError={() => setImgError(true)} />
) : (
  <div>⬆️</div>
)}
```

#### 3. Image URLs Not Absolute

**Problem:** RSI CDN URLs started with `/` or `//`, causing broken images.

**Fix:** Convert all image URLs to absolute in content.js and components:

```javascript
if (url.startsWith("//")) url = "https:" + url;
else if (url.startsWith("/")) url = RSI_BASE + url;

// In component:
let fallbackImg = "";
if (ship.imageUrl && !ship.imageUrl.includes("default-image")) {
  const raw = ship.imageUrl.trim();
  if (raw.startsWith("//")) fallbackImg = `https:${raw}`;
  else if (raw.startsWith("/")) fallbackImg = `https://robertsspaceindustries.com${raw}`;
  else fallbackImg = raw;
}
```

#### 4. BIS Rewards Miscategorized

**Problem:** "BIS ... Reward" items were being marked as flair instead of paint.

**Fix:** Updated `detectCategory()` to classify as paint (ships/liveries), but not pennants, trophies, coins, etc.:

```javascript
if ((n.includes("bis ") || n.includes("best in show")) && n.includes("reward") &&
    !n.includes("pennant") && !n.includes("trophy") && !n.includes("charm") &&
    !n.includes("plushie") && !n.includes("figurine") && !n.includes("poster") &&
    !n.includes("coin") && !n.includes("badge") && !n.includes("helmet") &&
    !n.includes("armor") && !n.includes("gear")) return "paint";
```

### Known Issues Not Yet Fixed

#### 1. OneDrive Sync with Git

**Problem:** OneDrive locks git files (`.git/index.lock` timeout), preventing `git push`.

**Workaround:** User must run git commands from PowerShell (not Command Prompt or WSL):

```powershell
cd "C:\Users\carsd\OneDrive\Documentos\web alfilo"
git add .
git commit -m "message"
git push
```

#### 2. Chrome Extension Installation

**Current Status:** Extension v1.2.0 built and ready, but needs to be reinstalled from ZIP after updates:

1. Go to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `/sessions/clever-loving-carson/mnt/web alfilo/sc-labs-hangar-extension/`

---

## 6. Pending Tasks

### User Action Required

1. **Git Push Latest Changes**
   - Updated files not yet pushed:
     - `al-filo-platform/src/store/useHangarStore.ts` (improved import logic, BIS reward handling)
     - `al-filo-platform/src/components/hangar/HangarShipCard.tsx` (image fallback fixes)
     - `al-filo-platform/src/components/hangar/CCUCard.tsx` (ship image lookup)
   - **Command (PowerShell):**
     ```powershell
     cd "C:\Users\carsd\OneDrive\Documentos\web alfilo"
     git add .
     git commit -m "refactor: improve hangar import logic and image handling"
     git push
     ```

2. **Reinstall Extension**
   - v1.2.0 is built and ready
   - Go to `chrome://extensions` → Developer mode → Load unpacked
   - Select `C:\Users\carsd\OneDrive\Documentos\web alfilo\sc-labs-hangar-extension`

3. **Test After Reinstall**
   - Export hangar from RSI
   - Verify: Buyback prices appear in JSON
   - Verify: CCU photos show in CCUCard
   - Verify: BIS rewards classified as paint
   - Import into platform
   - Check stats match export

4. **Eventually: Chrome Web Store Submission**
   - Get approval from reviewer
   - Use Chrome Web Store API to publish
   - v1.2.0 would be first public release

---

## 7. Important Paths

### Git Repository

- **Repo Root:** `/sessions/clever-loving-carson/mnt/web alfilo/` (C:\Users\carsd\OneDrive\Documentos\web alfilo)
- **Desktop Copy:** `/sessions/clever-loving-carson/mnt/Escritorio--web alfilo/` (C:\Users\carsd\OneDrive\Escritorio\web alfilo)

### Extension Files

- **Folder:** `/sessions/clever-loving-carson/mnt/web alfilo/sc-labs-hangar-extension/`
- **manifest.json:** v1.2.0
- **Icons:** `icons/icon16.png`, `icon32.png`, `icon48.png`, `icon128.png`

### Platform Files

- **App Root:** `/sessions/clever-loving-carson/mnt/web alfilo/al-filo-platform/`
- **Hangar Store:** `src/store/useHangarStore.ts`
- **Hangar Components:** `src/components/hangar/`
- **Hangar Page:** `src/app/hangar/page.tsx`

### Assets

- **Ship Images:** `al-filo-platform/public/ships/*.jpg` (slugified names)
- **SC Labs Logo:** `al-filo-platform/LOGOS/SCLABS.jpg` (used for extension icons)
- **Background Video:** `al-filo-platform/public/videos/bg.mp4`

### Key Configuration

- **Zustand Store Name:** `"sc-labs-hangar"` (localStorage key)
- **Extension Manifest Version:** 3
- **Next.js Version:** Latest (from package.json)
- **Node Version:** See `.nvmrc` or `package.json` engines field

---

## Summary for Next Session

To pick up exactly where we left off:

1. All extension code is complete and ready (v1.2.0)
2. All platform code is complete with recent fixes for images, prices, BIS rewards
3. User needs to git push changes from PowerShell
4. User needs to reinstall extension from Developer mode
5. After reimport, verify: buyback prices, CCU photos, BIS classifications
6. Eventually submit to Chrome Web Store

The codebase is production-ready. Main work is testing the fixes and ensuring data flows correctly end-to-end.

---

**Generated:** April 7, 2026 13:00 UTC
**For:** SC Labs Project
