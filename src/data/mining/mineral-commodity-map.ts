// =============================================================================
// SC LABS — Mineral → Commodity mapping
//
// Bridge between the Mining domain (which stores refined ores in
// `mining_inventory.mineral_id` using scunpacked codes) and the Trade domain
// (which stores sales under `trade_work_orders.commodity_code` using the UEX
// 4-letter abbreviations).
//
// Most mineral_ids match the commodity_abbr 1:1. The exceptions live in
// OVERRIDES below. Non-sellable materials (ICE, INER — used for scoop/refining
// side effects only) are listed in NOT_SELLABLE so the UI can grey out the
// "Sell on route" button.
//
// When we eventually move this to a DB table (Fase C), this file becomes the
// seed for `trade_commodities.mining_ref_id`.
// =============================================================================

import minerals from "./minerals.json";

// Mineral ids whose commodity_abbr differs from the mineral_id itself.
const OVERRIDES: Record<string, string> = {
  BERL: "BERY", // Beryl
};

// Mineral ids that cannot be sold in the in-game commodity market.
const NOT_SELLABLE = new Set<string>(["ICE", "INER"]);

type Mineral = { id: string; name: string };
const typed = minerals as Mineral[];
const BY_ID: Record<string, Mineral> = Object.fromEntries(
  typed.map((m) => [m.id, m])
);

export interface CommodityMatch {
  code: string;   // commodity_abbr expected by trade_work_orders
  name: string;   // human-readable label
}

/** Resolve a mining inventory row to its Trade commodity counterpart. */
export function getCommodityForMineral(
  mineralId: string
): CommodityMatch | null {
  if (!mineralId) return null;
  if (NOT_SELLABLE.has(mineralId)) return null;
  const code = OVERRIDES[mineralId] ?? mineralId;
  const name = BY_ID[mineralId]?.name ?? mineralId;
  return { code, name };
}

/** Convenience: is this mineral eligible to appear in a Trade WO? */
export function isMineralSellable(mineralId: string): boolean {
  return !!getCommodityForMineral(mineralId);
}
