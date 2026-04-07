// =============================================================================
// AL FILO — useHangarStore
//
// Zustand store for managing the Hangar module:
// - Ships (Standalone Ships)
// - CCUs (Ship Upgrades)
// - CCU Chains (Multi-step upgrade paths)
//
// Persists to localStorage with "sc-labs-hangar" key
// =============================================================================

import { create } from "zustand";
import { persist } from "zustand/middleware";

// =============================================================================
// Type Definitions
// =============================================================================

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
  id: string; // UUID generated on add
  shipReference: string; // matches ships table reference
  shipName: string; // actual ship name ("Gladius", "Perseus") for image lookup
  pledgeName: string; // "Standalone Ships - Cutlass Black"
  pledgePrice: number; // USD
  insuranceType: InsuranceType;
  location: ItemLocation;
  itemCategory: ItemCategory; // what kind of pledge item this is
  isGiftable: boolean;
  isMeltable: boolean;
  purchasedDate: string | null; // ISO date
  imageUrl: string; // RSI CDN image URL
  notes: string;
}

export interface HangarCCU {
  id: string;
  fromShip: string; // ship name
  fromShipReference: string; // reference
  toShip: string;
  toShipReference: string;
  pricePaid: number;
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
  isOwned: boolean; // user has this CCU
  isCompleted: boolean;
  isWarbond: boolean;
}

export interface CCUChain {
  id: string;
  name: string;
  startShip: string;
  startShipReference: string;
  targetShip: string;
  targetShipReference: string;
  steps: CCUChainStep[];
  status: "planning" | "in_progress" | "completed";
}

// =============================================================================
// Store State & Actions
// =============================================================================

export interface HangarStoreState {
  ships: HangarShip[];
  ccus: HangarCCU[];
  chains: CCUChain[];

  // Ship actions
  addShip: (ship: Omit<HangarShip, "id">) => void;
  removeShip: (id: string) => void;
  updateShip: (id: string, updates: Partial<HangarShip>) => void;

  // CCU actions
  addCCU: (ccu: Omit<HangarCCU, "id">) => void;
  removeCCU: (id: string) => void;
  updateCCU: (id: string, updates: Partial<HangarCCU>) => void;

  // Chain actions
  addChain: (chain: Omit<CCUChain, "id">) => void;
  removeChain: (id: string) => void;
  updateChain: (id: string, updates: Partial<CCUChain>) => void;

  // Import/Export
  importFromJSON: (
    data: any
  ) => { ships: number; ccus: number; summary: ImportSummary | null; errors: string[] };
  exportToJSON: () => string;
  clearAll: () => void;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate a UUID v4
 */
function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Parse SC Labs Hangar Importer format JSON
 * Structure: { version, myHangar: [...], myBuyBack: [...] }
 * Each item: { id, name, image, lastModification, contained, link, available, category,
 *              elementData?: { price, shipInThisPackData, alsoContainData },
 *              ccuInfo?: { toSkuId, fromShipData, toShipData, price } }
 */
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

/**
 * Detect the item category from name and raw category
 */
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

  // Paints / Skins / Liveries
  if (n.startsWith("paints -") || n.startsWith("paint -") || n.includes(" paint") ||
      n.includes("skin -") || n.includes("livery") || n.includes("coloration")) return "paint";

  // Gear / Armor / Weapons / Tools / Suits
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
      n.includes("quikflare") || n.includes("medivac") || n.includes("purifier")) return "gear";

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
      n.includes("collection") || n.includes("master set") ||
      n.includes("gear pack") || n.includes("hydration pack")) return "gear";

  return "other";
}

/**
 * Extract clean item name from pledge names like "Paints - Hermes - Tripline Paint"
 */
function extractItemName(pledgeName: string): string {
  let name = pledgeName;
  const prefixes = ["Paints - ", "Paint - ", "Gear - ", "Subscribers Store - ", "Subscribers - "];
  for (const p of prefixes) {
    if (name.startsWith(p)) { name = name.slice(p.length); break; }
  }
  return name.trim();
}

/**
 * Extract ship name from pledge name like "Standalone Ships - Perseus - 10 Year"
 */
function extractShipNameFromPledge(pledgeName: string): string {
  let name = pledgeName;
  // Remove prefixes
  const prefixes = ["Standalone Ships - ", "Package - "];
  for (const p of prefixes) {
    if (name.startsWith(p)) { name = name.slice(p.length); break; }
  }
  // Remove suffixes like "- 10 Year", "- Best in Show 2955 Edition", "- upgraded"
  name = name.replace(/\s*-\s*(10 Year|Best in Show.*|upgraded|Warbond.*|Standard Edition.*|IAE.*|Invictus.*)$/i, "");
  return name.trim();
}

/**
 * Parse date strings like "March 15, 2026" to ISO
 */
function parseDateString(dateStr: string): string | null {
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d.toISOString();
  } catch {
    return null;
  }
}

/**
 * Legacy format parser (older format with kind/title/value)
 */
function parseLegacyFormat(data: any[]): {
  ships: Omit<HangarShip, "id">[];
  ccus: Omit<HangarCCU, "id">[];
  errors: string[];
} {
  const ships: Omit<HangarShip, "id">[] = [];
  const ccus: Omit<HangarCCU, "id">[] = [];
  const errors: string[] = [];

  for (const item of data) {
    try {
      const kind = item.kind || "";
      const title = item.title || "";

      if (kind === "Standalone Ship" || kind.includes("Standalone")) {
        ships.push({
          shipReference: item.shipReference || "",
          shipName: extractShipNameFromPledge(title),
          pledgeName: title,
          pledgePrice: parseFloat(item.value) || 0,
          insuranceType: parseInsuranceType(item.insurance),
          location: "hangar",
          itemCategory: "standalone_ship",
          isGiftable: item.isGiftable === true,
          isMeltable: item.isReclaimable === true,
          purchasedDate: item.date ? new Date(item.date).toISOString() : null,
          imageUrl: "",
          notes: "",
        });
      } else if (kind === "CCU" || kind.includes("Upgrade")) {
        if (item.fromShip && item.toShip) {
          ccus.push({
            fromShip: item.fromShip,
            fromShipReference: item.fromShipReference || "",
            toShip: item.toShip,
            toShipReference: item.toShipReference || "",
            pricePaid: parseFloat(item.pricePaid || item.value) || 0,
            isWarbond: item.isWarbond === true,
            location: "hangar",
            notes: "",
          });
        }
      }
    } catch (err) {
      errors.push(`Failed to parse "${item.title || "unknown"}"`);
    }
  }

  return { ships, ccus, errors };
}

/**
 * Parse CCU Game fleetview.json format
 * Similar structure but slightly different field names
 */
function parseCCUGameFormat(data: any[]): {
  ships: Omit<HangarShip, "id">[];
  ccus: Omit<HangarCCU, "id">[];
  errors: string[];
} {
  const ships: Omit<HangarShip, "id">[] = [];
  const ccus: Omit<HangarCCU, "id">[] = [];
  const errors: string[] = [];

  if (!Array.isArray(data)) {
    errors.push("CCU Game format: expected an array");
    return { ships, ccus, errors };
  }

  for (const item of data) {
    try {
      const type = item.type || item.kind || "";
      const name = item.name || item.title || "";

      if (
        type === "ship" ||
        type === "Standalone Ship" ||
        type.toLowerCase().includes("ship")
      ) {
        const ship: Omit<HangarShip, "id"> = {
          shipReference: item.reference || item.shipReference || "",
          shipName: item.shipName || extractShipNameFromPledge(name),
          pledgeName: name,
          pledgePrice: parseFloat(item.price || item.value) || 0,
          insuranceType: parseInsuranceType(
            item.insurance || item.insuranceType
          ),
          location: "hangar",
          itemCategory: "standalone_ship",
          isGiftable: item.giftable === true || item.giftable === "true",
          isMeltable: item.meltable === true || item.meltable === "true",
          purchasedDate: item.purchasedDate
            ? new Date(item.purchasedDate).toISOString()
            : null,
          imageUrl: item.imageUrl || "",
          notes: item.notes || item.description || "",
        };
        ships.push(ship);
      } else if (
        type === "ccu" ||
        type === "CCU" ||
        type.toLowerCase().includes("upgrade")
      ) {
        const fromShip = item.fromShip || "";
        const toShip = item.toShip || "";

        if (fromShip && toShip) {
          const ccu: Omit<HangarCCU, "id"> = {
            fromShip: fromShip,
            fromShipReference: item.fromReference || item.fromShipReference || "",
            toShip: toShip,
            toShipReference: item.toReference || item.toShipReference || "",
            pricePaid: parseFloat(item.price || item.pricePaid) || 0,
            isWarbond: item.warbond === true || item.warbond === "true",
            location: "hangar",
            notes: item.notes || item.description || "",
          };
          ccus.push(ccu);
        }
      }
    } catch (err) {
      errors.push(
        `Failed to parse item "${item.name || item.title || "unknown"}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return { ships, ccus, errors };
}

/**
 * Parse insurance string to insurance type
 */
function parseInsuranceType(value: any): InsuranceType {
  if (!value) return "unknown";

  const str = String(value).toLowerCase().trim();

  if (str.includes("lti") || str.includes("lifetime")) return "LTI";
  if (str.includes("120")) return "120_months";
  if (str.includes("72")) return "72_months";
  if (str.includes("48")) return "48_months";
  if (str.includes("24")) return "24_months";
  if (str.includes("6")) return "6_months";
  if (str.includes("3")) return "3_months";

  return "unknown";
}

/**
 * Detect format of imported data and parse accordingly.
 * Supports: SC Labs Hangar Importer, CCU Game, SC Labs backup, legacy formats
 */
function detectAndParseFormat(data: any): {
  ships: Omit<HangarShip, "id">[];
  ccus: Omit<HangarCCU, "id">[];
  summary: ImportSummary | null;
  errors: string[];
} {
  // ── SC Labs / myHangar+myBuyBack format: { version, myHangar: [...], myBuyBack: [...] }
  if (data && !Array.isArray(data) && (data.myHangar || data.myBuyBack)) {
    const allShips: Omit<HangarShip, "id">[] = [];
    const allCCUs: Omit<HangarCCU, "id">[] = [];
    const allErrors: string[] = [];
    let totalSkipped = 0;

    // Parse hangar items (location = "hangar")
    const hangarItems = data.myHangar || [];
    if (hangarItems.length > 0) {
      const h = parseSCLabsItems(hangarItems, "hangar");
      allShips.push(...h.ships);
      allCCUs.push(...h.ccus);
      allErrors.push(...h.errors);
      totalSkipped += h.skipped;
    }

    // Parse buyback items (location = "buyback")
    const buybackItems = data.myBuyBack || [];
    if (buybackItems.length > 0) {
      const b = parseSCLabsItems(buybackItems, "buyback");
      allShips.push(...b.ships);
      allCCUs.push(...b.ccus);
      allErrors.push(...b.errors);
      totalSkipped += b.skipped;
    }

    const isSCLabs = data.exportedBy && String(data.exportedBy).includes("SC Labs");
    const summary: ImportSummary = {
      format: isSCLabs ? "SC Labs Hangar Importer" : "SC Labs v" + (data.version || "1.0"),
      hangarItemCount: hangarItems.length,
      buybackItemCount: buybackItems.length,
      shipsFound: allShips.length,
      ccusFound: allCCUs.length,
      skippedItems: totalSkipped,
      totalValue: allShips.reduce((s, sh) => s + sh.pledgePrice, 0) +
                  allCCUs.reduce((s, c) => s + c.pricePaid, 0),
    };

    return { ships: allShips, ccus: allCCUs, summary, errors: allErrors };
  }

  // From here on, data should be an array
  if (!Array.isArray(data) || data.length === 0) {
    return {
      ships: [], ccus: [], summary: null,
      errors: ["Invalid data format: expected SC Labs JSON or array"],
    };
  }

  const firstItem = data[0];

  // ── SC Labs own backup format (has id, pledgeName)
  if (firstItem.id && (firstItem.pledgeName || firstItem.fromShip) && !firstItem.kind && !firstItem.type) {
    const ships = data.filter((item) => item.pledgeName && !item.fromShip) as Omit<HangarShip, "id">[];
    const ccus = data.filter((item) => item.fromShip && item.toShip) as Omit<HangarCCU, "id">[];
    return { ships, ccus, summary: { format: "SC Labs backup", hangarItemCount: data.length, buybackItemCount: 0, shipsFound: ships.length, ccusFound: ccus.length, skippedItems: 0, totalValue: 0 }, errors: [] };
  }

  // ── CCU Game format (has 'type' or 'reference')
  if (firstItem.type || firstItem.reference) {
    const result = parseCCUGameFormat(data);
    return { ...result, summary: { format: "CCU Game", hangarItemCount: data.length, buybackItemCount: 0, shipsFound: result.ships.length, ccusFound: result.ccus.length, skippedItems: 0, totalValue: 0 } };
  }

  // ── Legacy format (has 'kind' or 'title')
  if (firstItem.kind || firstItem.title) {
    const result = parseLegacyFormat(data);
    return { ...result, summary: { format: "Legacy format", hangarItemCount: data.length, buybackItemCount: 0, shipsFound: result.ships.length, ccusFound: result.ccus.length, skippedItems: 0, totalValue: 0 } };
  }

  return { ships: [], ccus: [], summary: null, errors: ["Unrecognized format"] };
}

/**
 * Import summary for UI display
 */
export interface ImportSummary {
  format: string;
  hangarItemCount: number;
  buybackItemCount: number;
  shipsFound: number;
  ccusFound: number;
  skippedItems: number;
  totalValue: number;
}

// =============================================================================
// Zustand Store
// =============================================================================

export const useHangarStore = create<HangarStoreState>()(
  persist(
    (set, get) => ({
      ships: [],
      ccus: [],
      chains: [],

      // =========================================================================
      // Ship Actions
      // =========================================================================

      addShip: (ship) => {
        set((state) => ({
          ships: [
            ...state.ships,
            {
              ...ship,
              id: generateUUID(),
            },
          ],
        }));
      },

      removeShip: (id) => {
        set((state) => ({
          ships: state.ships.filter((ship) => ship.id !== id),
        }));
      },

      updateShip: (id, updates) => {
        set((state) => ({
          ships: state.ships.map((ship) =>
            ship.id === id ? { ...ship, ...updates } : ship
          ),
        }));
      },

      // =========================================================================
      // CCU Actions
      // =========================================================================

      addCCU: (ccu) => {
        set((state) => ({
          ccus: [
            ...state.ccus,
            {
              ...ccu,
              id: generateUUID(),
            },
          ],
        }));
      },

      removeCCU: (id) => {
        set((state) => ({
          ccus: state.ccus.filter((ccu) => ccu.id !== id),
        }));
      },

      updateCCU: (id, updates) => {
        set((state) => ({
          ccus: state.ccus.map((ccu) =>
            ccu.id === id ? { ...ccu, ...updates } : ccu
          ),
        }));
      },

      // =========================================================================
      // Chain Actions
      // =========================================================================

      addChain: (chain) => {
        set((state) => ({
          chains: [
            ...state.chains,
            {
              ...chain,
              id: generateUUID(),
            },
          ],
        }));
      },

      removeChain: (id) => {
        set((state) => ({
          chains: state.chains.filter((chain) => chain.id !== id),
        }));
      },

      updateChain: (id, updates) => {
        set((state) => ({
          chains: state.chains.map((chain) =>
            chain.id === id ? { ...chain, ...updates } : chain
          ),
        }));
      },

      // =========================================================================
      // Import/Export
      // =========================================================================

      importFromJSON: (data) => {
        const { ships: parsedShips, ccus: parsedCCUs, summary, errors } =
          detectAndParseFormat(data);

        set((state) => ({
          ships: [
            ...state.ships,
            ...parsedShips.map((ship) => ({
              ...ship,
              id: generateUUID(),
            })),
          ],
          ccus: [
            ...state.ccus,
            ...parsedCCUs.map((ccu) => ({
              ...ccu,
              id: generateUUID(),
            })),
          ],
        }));

        return {
          ships: parsedShips.length,
          ccus: parsedCCUs.length,
          summary,
          errors,
        };
      },

      exportToJSON: () => {
        const state = get();
        const exportData = {
          version: "1.0",
          exportDate: new Date().toISOString(),
          ships: state.ships,
          ccus: state.ccus,
          chains: state.chains,
        };
        return JSON.stringify(exportData, null, 2);
      },

      clearAll: () => {
        set({
          ships: [],
          ccus: [],
          chains: [],
        });
      },
    }),
    {
      name: "sc-labs-hangar", // localStorage key
      onRehydrateStorage: () => (state) => {
        // Backward compatibility: assign itemCategory to old items that lack it
        if (state && state.ships) {
          let needsUpdate = false;
          const patched = state.ships.map((ship) => {
            if (!ship.itemCategory) {
              needsUpdate = true;
              return { ...ship, itemCategory: detectItemCategory(ship.pledgeName || ship.shipName || "", "") as ItemCategory };
            }
            return ship;
          });
          if (needsUpdate) {
            state.ships = patched;
          }
        }
      },
    }
  )
);

export default useHangarStore;
