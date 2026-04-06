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

export interface HangarShip {
  id: string; // UUID generated on add
  shipReference: string; // matches ships table reference
  pledgeName: string; // "Standalone Ships - Cutlass Black"
  pledgePrice: number; // USD
  insuranceType: InsuranceType;
  location: ItemLocation;
  isGiftable: boolean;
  isMeltable: boolean;
  purchasedDate: string | null; // ISO date
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
  ) => { ships: number; ccus: number; errors: string[] };
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
 * Parse Guildswarm format JSON
 * Expected structure: array of items with fields like "title", "value", "insurance", "kind", "isGiftable", "isReclaimable", "date", "items"
 */
function parseGuildswarmFormat(data: any[]): {
  ships: Omit<HangarShip, "id">[];
  ccus: Omit<HangarCCU, "id">[];
  errors: string[];
} {
  const ships: Omit<HangarShip, "id">[] = [];
  const ccus: Omit<HangarCCU, "id">[] = [];
  const errors: string[] = [];

  if (!Array.isArray(data)) {
    errors.push("Guildswarm format: expected an array");
    return { ships, ccus, errors };
  }

  for (const item of data) {
    try {
      const kind = item.kind || "";
      const title = item.title || "";
      const value = item.value || "";

      if (kind === "Standalone Ship" || kind.includes("Standalone")) {
        // Parse as ship
        const ship: Omit<HangarShip, "id"> = {
          shipReference: item.shipReference || value,
          pledgeName: title,
          pledgePrice: parseFloat(item.value) || 0,
          insuranceType: parseInsuranceType(item.insurance),
          location: "hangar",
          isGiftable: item.isGiftable === true || item.isGiftable === "true",
          isMeltable: item.isReclaimable === true || item.isReclaimable === "true",
          purchasedDate: item.date ? new Date(item.date).toISOString() : null,
          notes: item.notes || "",
        };
        ships.push(ship);
      } else if (kind === "CCU" || kind.includes("Upgrade")) {
        // Parse as CCU
        const fromShip = item.fromShip || "";
        const toShip = item.toShip || "";

        if (fromShip && toShip) {
          const ccu: Omit<HangarCCU, "id"> = {
            fromShip: fromShip,
            fromShipReference: item.fromShipReference || "",
            toShip: toShip,
            toShipReference: item.toShipReference || "",
            pricePaid: parseFloat(item.pricePaid || item.value) || 0,
            isWarbond: item.isWarbond === true || item.isWarbond === "true",
            location: "hangar",
            notes: item.notes || "",
          };
          ccus.push(ccu);
        }
      }
    } catch (err) {
      errors.push(
        `Failed to parse item "${item.title || "unknown"}": ${err instanceof Error ? err.message : String(err)}`
      );
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
          pledgeName: name,
          pledgePrice: parseFloat(item.price || item.value) || 0,
          insuranceType: parseInsuranceType(
            item.insurance || item.insuranceType
          ),
          location: "hangar",
          isGiftable: item.giftable === true || item.giftable === "true",
          isMeltable: item.meltable === true || item.meltable === "true",
          purchasedDate: item.purchasedDate
            ? new Date(item.purchasedDate).toISOString()
            : null,
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
 * Detect format of imported data and parse accordingly
 */
function detectAndParseFormat(data: any): {
  ships: Omit<HangarShip, "id">[];
  ccus: Omit<HangarCCU, "id">[];
  errors: string[];
} {
  if (!Array.isArray(data) || data.length === 0) {
    return {
      ships: [],
      ccus: [],
      errors: ["Invalid data format: expected non-empty array"],
    };
  }

  // Check first item to detect format
  const firstItem = data[0];

  // Check for our own backup format (has id, shipReference, pledgeName)
  if (
    firstItem.id &&
    (firstItem.pledgeName || firstItem.fromShip) &&
    !firstItem.kind &&
    !firstItem.type
  ) {
    // Our own format - just filter ships and ccus
    const ships = data.filter(
      (item) => item.pledgeName && !item.fromShip
    ) as Omit<HangarShip, "id">[];
    const ccus = data.filter(
      (item) => item.fromShip && item.toShip
    ) as Omit<HangarCCU, "id">[];
    return { ships, ccus, errors: [] };
  }

  // Check for CCU Game format (has 'type' or 'reference' fields)
  if (firstItem.type || firstItem.reference) {
    return parseCCUGameFormat(data);
  }

  // Default to Guildswarm format
  return parseGuildswarmFormat(data);
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
        const { ships: parsedShips, ccus: parsedCCUs, errors } =
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
    }
  )
);

export default useHangarStore;
