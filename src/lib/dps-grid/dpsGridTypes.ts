// =============================================================================
// AL FILO — DPS Grid: tipos base
//
// Toda la geometría parte de `UNIT` = ancho de 1 columna en px.
// Las posiciones son coordenadas discretas (col, row) que se proyectan
// a px en tiempo de render. NUNCA se guardan píxeles, siempre discretas.
// =============================================================================

// ── WidgetId ──────────────────────────────────────────────────────────────────
// Re-exportado aquí para que los helpers de grid no dependan de LoadoutBuilder.
export type WidgetId =
  | "weapons" | "missiles" | "strafe-profile" | "turning-profile"
  | "shields" | "powerplants" | "coolers" | "maneuver-radar"
  | "quantum" | "radar" | "utility" | "combat-summary"
  | "power-grid" | "signatures" | "balance"
  | "ship-selector" | "ship-card" | "dps-detail"
  | "flight-dynamics-3d";

// ── Ancho de tarjeta en columnas (1 ó 2) ─────────────────────────────────────
export type CardWidth = 1 | 2;

// ── Definición de una tarjeta en el grid ─────────────────────────────────────
// Las coordenadas son discretas. La altura la define `heightBlocks` (cada
// bloque = 0.25 * UNIT). El contenido nunca colapsa la tarjeta.
export interface DpsCardDef {
  id: WidgetId;
  col: number;          // columna de anclaje [0, GRID_COLUMNS - colSpan]
  row: number;          // fila de anclaje [0, GRID_ROWS)
  colSpan: CardWidth;   // 1 = 1 columna, 2 = sidebar
  heightBlocks: number; // número de bloques verticales (cada bloque = 0.25 UNIT)
}

// ── Rectángulo en píxeles (derivado de DpsCardDef + UNIT) ────────────────────
export interface DpsCardRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ── Posición persistida en localStorage ──────────────────────────────────────
export interface SavedCardPos {
  id: WidgetId;
  col: number;
  row: number;
}

// ── Estado del drag activo ────────────────────────────────────────────────────
export interface DragState {
  widgetId: WidgetId;
  // offset puntero desde la esquina top-left del widget (en px)
  offsetX: number;
  offsetY: number;
  // posición provisional durante el drag (snap continuo)
  previewCol: number;
  previewRow: number;
}

// ── Constantes geométricas ────────────────────────────────────────────────────
export const GRID_COLUMNS        = 5;
export const GRID_ROWS           = 100;
export const ROW_HEIGHT_RATIO    = 0.25;   // altura de 1 fila = 0.25 * UNIT
export const ANCHOR_OFFSET_RATIO = 0.05;   // margen interior = 0.05 * UNIT
export const MARGIN_RATIO        = 0.10;   // gap total entre cards = 0.10 * UNIT
export const MIN_UNIT_PX         = 240;
export const MAX_UNIT_PX         = 390;

export const LAYOUT_STORAGE_KEY  = "al-filo-layout-v11";
