// =============================================================================
// AL FILO — DPS Grid: tipos base
//
// La geometría UNIT define los ANCHOS de columna.
// Las alturas son content-sized (el contenido manda, sin scroll).
// Las posiciones son de columna + orden dentro de la columna.
// =============================================================================

// ── WidgetId ──────────────────────────────────────────────────────────────────
// Fase G.1: `strafe-profile` / `turning-profile` / `maneuver-radar` se unificaron
// en `flight-dynamics` (tarjeta 2-col con toggle 3D/Radar/Bars).
export type WidgetId =
  | "weapons" | "missiles"
  | "shields" | "powerplants" | "coolers"
  | "quantum" | "radar" | "utility"
  | "mining" | "salvage"
  | "power-grid"
  | "ship-selector" | "ship-card" | "loadout-detail"
  | "flight-dynamics" | "flight-dynamics-3d";

// ── Ancho de tarjeta en columnas (1 ó 2) ─────────────────────────────────────
export type CardWidth = 1 | 2;

// ── Clave de columna ──────────────────────────────────────────────────────────
// col0..col2 = zona A (1 columna cada una)
// sidebar    = zona B (2 columnas, cols 3-4)
export type ColumnKey = "col0" | "col1" | "col2" | "sidebar";

// ── Orden de tarjetas por columna ────────────────────────────────────────────
// Representa el layout completo. Se persiste en localStorage.
export type ColumnOrder = Record<ColumnKey, WidgetId[]>;

// ── Rectángulo de columna en px (solo anchos, Y sale del DOM) ────────────────
export interface DpsColumnRect {
  x: number;       // left del contenedor de columna
  w: number;       // ancho del contenedor (incluye el padding interno)
  colSpan: CardWidth;
}

// ── Constantes geométricas ────────────────────────────────────────────────────
export const GRID_COLUMNS        = 5;
export const ANCHOR_OFFSET_RATIO = 0.05;   // padding horizontal interior = 0.05 * UNIT
export const MARGIN_RATIO        = 0.10;   // gap horizontal entre tarjetas = 0.10 * UNIT
export const MIN_UNIT_PX         = 240;
export const MAX_UNIT_PX         = 390;

// Gap vertical entre tarjetas dentro de la misma columna (px fijo)
export const CARD_GAP_PX         = 4;

// v18 (Fase G.1): se unificaron Strafe/Turning/G-Forces en `flight-dynamics`.
// Bump para forzar a que todos los usuarios carguen el default nuevo (sidebar
// recibe `flight-dynamics` en vez de los 3 widgets pequeños dispersos).
export const LAYOUT_STORAGE_KEY      = "al-filo-loadout-layout-v18";
export const LAYOUT_CHECKPOINT_KEY   = "al-filo-loadout-layout-checkpoint-v1";
