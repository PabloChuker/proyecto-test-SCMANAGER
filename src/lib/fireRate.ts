// =============================================================================
// SC LABS — Real Fire Rate (server-tick quantization)
//
// Formula from VerseTools (https://versetools.games/formulas, "Rate of Fire"):
//
//     ticks    = ceil(1800 / listed_RPM)
//     real_RPM = 1800 / ticks
//
// Only sequence weapons (repeaters) are quantized. Gatlings use a continuous
// rapid-fire action that doesn't snap to server ticks. Single-entry cannons
// fire so slowly (100–150 RPM) that the 33 ms tick boundary never rounds them
// up. We approximate the discriminator with simple rules over name/className,
// since SC Labs doesn't have an explicit "fire_action_count" field in BD.
//
// Examples (validated by VerseTools in-game):
//   listed 750 RPM (Panther)  → ticks 3 → real 600 RPM (-20%)
//   listed 825 RPM (Sawbuck)  → ticks 3 → real 600 RPM (-27%)
//   listed 899 RPM (worst)    → ticks 3 → real 600 RPM (-33%)
//   listed 900 RPM (Buzzsaw)  → ticks 2 → real 900 RPM (sweet spot)
//   listed 1600 RPM (Mantis)  → Gatling, exempt
//   listed 100 RPM (Suckerpunch) → low-RPM cannon, exempt
//
// Used by /api/ships/[id]/route.ts → buildWeaponItem to override fireRate
// before sending componentStats to the LoadoutBuilder. The frontend stays
// agnostic about the quantization — it just receives the corrected fireRate.
// =============================================================================

const LOW_RPM_CANNON_THRESHOLD = 200; // below this, listed RPM never rounds up

export interface RealFireRateInput {
  listed: number | null | undefined;
  className?: string | null;
  name?: string | null;
  /** "Single", "Burst", "Auto", etc. — currently informational only. */
  fireMode?: string | null;
}

export interface RealFireRateResult {
  /** RPM that the weapon actually achieves in-game after tick quantization. */
  real: number;
  /** RPM as listed in the catalogue (raw rate_of_fire). */
  listed: number;
  /** True when the formula reduced the listed RPM (dead-zone weapons). */
  isQuantized: boolean;
  /** Reason classification (debug / future UI tooltip). */
  reason: "gatling" | "low-rpm-cannon" | "sequence-quantized" | "sequence-aligned" | "invalid";
}

/**
 * Heuristic to detect Gatling-style weapons. The class_name in scunpacked
 * data uses tokens like "LaserGatling", "BallisticGatling", "MGGatling".
 * The localized `name` also contains "Gatling" (e.g. "Mantis GT-220 Gatling").
 */
function isGatling(input: RealFireRateInput): boolean {
  const cls = (input.className ?? "").toLowerCase();
  const nm = (input.name ?? "").toLowerCase();
  return /gatling|gatlin/.test(cls) || /gatling/.test(nm);
}

export function computeRealFireRate(input: RealFireRateInput): RealFireRateResult {
  const listed = Number(input.listed ?? 0);
  if (!Number.isFinite(listed) || listed <= 0) {
    return { real: 0, listed: 0, isQuantized: false, reason: "invalid" };
  }

  if (isGatling(input)) {
    return { real: listed, listed, isQuantized: false, reason: "gatling" };
  }

  if (listed < LOW_RPM_CANNON_THRESHOLD) {
    return { real: listed, listed, isQuantized: false, reason: "low-rpm-cannon" };
  }

  const ticks = Math.ceil(1800 / listed);
  const real = 1800 / ticks;
  // Only mark as "quantized" if the result is meaningfully lower (>0.5 RPM diff).
  const isQuantized = listed - real > 0.5;
  return {
    real,
    listed,
    isQuantized,
    reason: isQuantized ? "sequence-quantized" : "sequence-aligned",
  };
}

/**
 * Convenience: return only the real RPM. Falls back to 0 if invalid.
 */
export function realFireRate(input: RealFireRateInput): number {
  return computeRealFireRate(input).real;
}
