// =============================================================================
// SC LABS — stat-tokens (Loadout.6 + Loadout.7, 2026-05-04)
//
// Tokens canónicos para stat values en todos los widgets del LoadoutBuilder.
// Pablo (2026-05-04): "todos los tamaños siguen diferentes acá hay que
// normalizarlos" + "la selección de colores debe tener coherencia: si es DPS
// un color, si es Cross Section otro, si es escudo otro, pero ser coherente
// en todos lados".
//
// Reglas:
//   1. TAMAÑO. Hay 3 niveles legibles, NO más:
//      · STAT_VAL_HERO  → primary numbers (DPS sostenido, escudo HP, hull
//        HP, thermal balance, missile dmg, power balance, quantum range).
//        TODO valor relevante usa este size — uniforme entre stats.
//      · STAT_VAL_SUB   → secundario (burst, alpha, shield regen, armor HP).
//        Para mostrar más info sin shoutear, pero igual legible.
//      · STAT_LABEL     → unidades + labels minúsculos (dps, hp, km, defl).
//   2. COLOR. Cada concepto tiene UN color. Aparece igual en todo el builder
//      (ship-card, loadout-detail, ttk, armor-check, power-grid, picker
//      hover).
//   3. font-mono + tabular-nums siempre. Bold en hero, medium en sub.
//
// Si querés agregar un stat nuevo: SIEMPRE crear su token acá. NUNCA
// hardcodear color o size en el JSX del widget. Esto evita el drift que
// Pablo sigue notando ("text-2xl, text-xl, text-lg, text-xs juntos").
// =============================================================================

// ── Tamaños (Tailwind classes, listas para concatenar) ────────────────────────

/** Hero stat — primary number en cada bloque del loadout-detail.
 *  Antes: mezcla de text-2xl / text-xl / text-lg. Ahora: SIEMPRE text-xl. */
export const STAT_VAL_HERO =
  "text-xl font-mono font-bold tabular-nums leading-none";

/** Stat secundario — regen, armor, alpha, complementarios al hero.
 *  Antes: mezcla de text-sm / text-xs / text-base. Ahora: SIEMPRE text-base. */
export const STAT_VAL_SUB =
  "text-base font-mono font-bold tabular-nums leading-none";

/** Label/unit — "dps", "hp", "km", "balance". Siempre 10px. */
export const STAT_LABEL =
  "text-[10px] font-mono text-zinc-500 tracking-wider uppercase";

/** Sub-label en zinc más oscuro — usado para metadata extra ("supply 850 ·
 *  demand 600", "1.2k–8k km · 100% pips"). */
export const STAT_LABEL_SOFT =
  "text-[10px] font-mono text-zinc-600 tracking-wide";

/** Section header — el "SUSTAINED DPS" / "THERMAL BALANCE" arriba de
 *  cada bloque. */
export const STAT_SECTION =
  "text-[11px] font-mono text-zinc-500 tracking-[0.15em] uppercase";

// ── Colores por concepto (hex consistentes) ───────────────────────────────────

/**
 * Color por categoría de stat. SIEMPRE consultar este objeto antes de
 * hardcodear `text-orange-400` o `style={{color:"#fbbf24"}}` en un widget.
 *
 * Reglas mnemo:
 *   · Ofensiva (DPS / alpha / burst / missile dmg / TTK ofensivo) → orange/red
 *   · Defensiva escudo → blue
 *   · Defensiva casco / armor → emerald
 *   · Térmico (cooling / thermal balance / EM heat) → cyan
 *   · Power (output / draw / balance) → amber
 *   · Movilidad (quantum / radar / range / speed) → sky
 *   · Firmas (EM / IR / cross-section) → purple
 *   · Distortion / EMP → fuchsia
 *   · HP físico (hull) → zinc-300
 */
export const STAT_COLOR = {
  // ── Ofensiva ─────────────────────────────────────────────────────────────
  /** DPS sostenido — el hero del bloque WEAPONS. */
  dpsSustained: "#fb923c",   // orange-400
  /** Burst DPS — pico instantáneo. */
  dpsBurst:     "#ef4444",   // red-500
  /** Alpha damage — daño por shot. */
  alpha:        "#f87171",   // red-400 (más suave que burst)
  /** Missile damage — daño total del misil. */
  missile:      "#fb923c",   // orange-400 (mismo tono que DPS — son ofensiva)
  /** TTK total combinado. */
  ttk:          "#fb923c",   // orange-400

  // ── Defensiva ───────────────────────────────────────────────────────────
  /** Shield HP. */
  shield:       "#3b82f6",   // blue-500
  /** Shield regen rate. */
  shieldRegen:  "#60a5fa",   // blue-400
  /** Hull HP. */
  hull:         "#d4d4d8",   // zinc-300
  /** Armor HP. */
  armor:        "#10b981",   // emerald-500

  // ── Térmico / Cooling ───────────────────────────────────────────────────
  /** Thermal balance / cooling supply. */
  thermal:      "#06b6d4",   // cyan-500
  /** Thermal overload. */
  thermalBad:   "#ef4444",   // red-500 (alarm)

  // ── Power ──────────────────────────────────────────────────────────────
  /** Power balance / output / draw. */
  power:        "#eab308",   // yellow-500
  /** Power overload. */
  powerBad:     "#ef4444",   // red-500

  // ── Movilidad / Range ──────────────────────────────────────────────────
  /** Quantum range. */
  quantum:      "#06b6d4",   // cyan-500
  /** Radar lock range. */
  radar:        "#22d3ee",   // cyan-400
  /** Speed (SCM, AFB, max nav). */
  speed:        "#0ea5e9",   // sky-500

  // ── Firmas / Detección ────────────────────────────────────────────────
  /** EM signature. */
  em:           "#a78bfa",   // violet-400
  /** IR signature. */
  ir:           "#fb923c",   // orange-400 (sí, repite — IR es heat)
  /** Cross-Section (CS) — área visible al radar. */
  crossSection: "#c084fc",   // purple-400

  // ── Resistencias (deflection + damage mult) ───────────────────────────
  /** Resistencia / deflection física. */
  physical:     "#fbbf24",   // amber-400
  /** Resistencia / deflection energía. */
  energy:       "#22d3ee",   // cyan-400
  /** Resistencia / deflection distortion. */
  distortion:   "#a78bfa",   // violet-400
} as const;

// Helper type por si querés narrower
export type StatColorKey = keyof typeof STAT_COLOR;
