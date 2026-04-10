// =============================================================================
// SC LABS — Loaner helpers
//
// Client-side utilities for resolving the loaner ships that come with a given
// pledge ship, based on the RSI Loaner Ship Matrix stored in the database.
//
// Data source:
//   https://support.robertsspaceindustries.com/hc/en-us/articles/360003093114
//
// The matrix is persisted in Supabase (table `ship_loaners`, seeded by
// prisma/migrations/20260410_ship_loaners/migration.sql). These helpers query
// the matrix via `/api/loaners?ship=<name>` and normalize ship names so small
// spelling differences (manufacturer prefixes, punctuation, casing) still match.
// =============================================================================

// Manufacturer prefixes to strip before matching.
// Keep in sync with MFR_PREFIXES in components/hangar/HangarShipCard.tsx.
const MFR_PREFIXES = [
  "Aegis Dynamics", "Aegis", "Anvil Aerospace", "Anvil", "Argo Astronautics", "Argo",
  "Aopoa", "Banu", "BIRC", "C.O.", "CO", "Consolidated Outland",
  "Crusader Industries", "Crusader", "Drake Interplanetary", "Drake",
  "Esperia", "Gatac", "Greycat Industrial", "Greycat",
  "Kruger Intergalactic", "Kruger", "MISC", "Musashi Industrial",
  "Origin Jumpworks", "Origin", "Roberts Space Industries", "RSI",
  "Tumbril Land Systems", "Tumbril", "Vanduul", "mirai",
];

// Edition / suffix patterns that should not affect matching.
const EDITION_SUFFIX_RE =
  /\s*[-–]?\s*(standard|warbond|best in show|anniversary|iae|invictus|bis|citizencon|10 year|lti).*$/i;

/**
 * Normalize a ship display name for matrix lookup.
 *
 * Rules (must match the normalization used when seeding `ship_loaners`):
 *   1. Lowercase
 *   2. Strip manufacturer prefix (e.g. "Anvil F7C Hornet" → "f7c hornet")
 *   3. Strip edition suffixes (Warbond, LTI, Best in Show, etc.)
 *   4. Strip punctuation: / . , ' ( ) & +
 *      (keeps dashes, alphanumerics, and single spaces)
 *   5. Collapse whitespace
 *
 * Examples:
 *   "Origin 400i"                              → "400i"
 *   "Anvil Carrack Expedition"                 → "carrack expedition"
 *   "600i Explorer & Executive"                → "600i explorer executive"
 *   "MISC Hull D"                              → "hull d"
 */
export function normalizeShipName(name: string): string {
  if (!name) return "";
  let n = name.trim();

  // 1. Strip edition suffixes first (before lowercasing so regex is cleaner).
  n = n.replace(EDITION_SUFFIX_RE, "");

  // 2. Lowercase.
  n = n.toLowerCase().trim();

  // 3. Strip manufacturer prefix (case-insensitive).
  for (const mfr of MFR_PREFIXES) {
    const p = mfr.toLowerCase() + " ";
    if (n.startsWith(p)) {
      n = n.slice(p.length).trim();
      break;
    }
  }

  // 4. Strip punctuation: / . , ' ( ) & + "
  //    Replace with space so "w/C8X" becomes "w c8x", then collapse below.
  n = n.replace(/[\/.,'()&+"]/g, " ");

  // 5. Collapse whitespace.
  n = n.replace(/\s+/g, " ").trim();

  return n;
}

export interface LoanerApiResponse {
  query: string;
  normalized: string;
  pledgedName: string | null;
  loaners: { name: string; normalized: string; note: string | null }[];
}

/**
 * Fetch the loaners for a given ship name from the API.
 *
 * Returns an empty array if the ship has no loaners or the request fails.
 * Uses a session-level in-memory cache to avoid re-querying the same ship
 * multiple times during a single page visit.
 */
const loanerCache = new Map<string, LoanerApiResponse["loaners"]>();

export async function getLoanersFor(shipName: string): Promise<LoanerApiResponse["loaners"]> {
  const normalized = normalizeShipName(shipName);
  if (!normalized) return [];

  if (loanerCache.has(normalized)) {
    return loanerCache.get(normalized)!;
  }

  try {
    const res = await fetch(`/api/loaners?ship=${encodeURIComponent(shipName)}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      loanerCache.set(normalized, []);
      return [];
    }
    const data: LoanerApiResponse = await res.json();
    const loaners = data.loaners ?? [];
    loanerCache.set(normalized, loaners);
    return loaners;
  } catch (err) {
    console.error("[getLoanersFor] fetch failed:", err);
    loanerCache.set(normalized, []);
    return [];
  }
}
