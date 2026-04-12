// =============================================================================
// AL FILO — DPS Grid: helpers geométricos
//
// TODAS las dimensiones derivan de `unit` (ancho de 1 columna en px).
// Spec (2026-04-11):
//
//   anchorX(col)  = col * unit + 0.05 * unit
//   anchorY(row)  = row * 0.25 * unit + 0.05 * unit
//
//   CARD_WIDTH(n) = (n - 0.10) * unit          (n = 1 ó 2)
//   cardHeight(X) = (0.25 * X - 0.10) * unit
//
//   Separación entre dos tarjetas adyacentes = 0.10 * unit (MARGIN_RATIO * unit)
//   El contenido NUNCA colapsa la tarjeta.
// =============================================================================

import type { DpsCardDef, DpsCardRect, CardWidth } from "./dpsGridTypes";
import {
  GRID_COLUMNS,
  GRID_ROWS,
  ROW_HEIGHT_RATIO,
  ANCHOR_OFFSET_RATIO,
  MARGIN_RATIO,
  MIN_UNIT_PX,
  MAX_UNIT_PX,
} from "./dpsGridTypes";

// ── UNIT ──────────────────────────────────────────────────────────────────────
/** Calcula el ancho de 1 columna en px, clampeado entre MIN y MAX. */
export function getUnit(containerWidth: number): number {
  const raw = containerWidth / GRID_COLUMNS;
  return Math.max(MIN_UNIT_PX, Math.min(MAX_UNIT_PX, raw));
}

// ── Posición de anclaje ───────────────────────────────────────────────────────
/** Coordenada X del top-left de una tarjeta en col `col`. */
export function getAnchorX(col: number, unit: number): number {
  return col * unit + ANCHOR_OFFSET_RATIO * unit;
}

/** Coordenada Y del top-left de una tarjeta en row `row`. */
export function getAnchorY(row: number, unit: number): number {
  return row * ROW_HEIGHT_RATIO * unit + ANCHOR_OFFSET_RATIO * unit;
}

/** Posición de anclaje (x, y) de una tarjeta. */
export function getAnchorPosition(
  col: number,
  row: number,
  unit: number,
): { x: number; y: number } {
  return { x: getAnchorX(col, unit), y: getAnchorY(row, unit) };
}

// ── Dimensiones ───────────────────────────────────────────────────────────────
/** Ancho en px de una tarjeta según su colSpan. */
export function getCardWidth(colSpan: CardWidth, unit: number): number {
  return (colSpan - MARGIN_RATIO) * unit;
}

/** Alto en px de una tarjeta según su número de bloques. */
export function getCardHeight(heightBlocks: number, unit: number): number {
  return (ROW_HEIGHT_RATIO * heightBlocks - MARGIN_RATIO) * unit;
}

// ── Rectángulo completo ───────────────────────────────────────────────────────
/** Proyecta una DpsCardDef a un DpsCardRect en píxeles. */
export function getCardRect(card: DpsCardDef, unit: number): DpsCardRect {
  return {
    x: getAnchorX(card.col, unit),
    y: getAnchorY(card.row, unit),
    w: getCardWidth(card.colSpan, unit),
    h: getCardHeight(card.heightBlocks, unit),
  };
}

// ── Snap de puntero a grid ────────────────────────────────────────────────────
/**
 * Convierte una posición de puntero (px relativas al canvas) al par (col, row)
 * más cercano de la grilla, clampeando para que la tarjeta de `colSpan` quede
 * completamente dentro del canvas.
 *
 * `offsetX/Y` es la distancia desde la esquina top-left del widget al puntero,
 * para que el snap tenga en cuenta desde dónde se agarró la tarjeta.
 */
export function snapPointerToGrid(
  pointerX: number,
  pointerY: number,
  colSpan: CardWidth,
  unit: number,
  offsetX = 0,
  offsetY = 0,
): { col: number; row: number } {
  // Top-left deseado del widget
  const rawX = pointerX - offsetX;
  const rawY = pointerY - offsetY;

  // Invertimos getAnchorX/Y para recuperar coordenadas fraccionarias
  const colF = (rawX - ANCHOR_OFFSET_RATIO * unit) / unit;
  const rowF = (rawY - ANCHOR_OFFSET_RATIO * unit) / (ROW_HEIGHT_RATIO * unit);

  return clampGridPos(colF, rowF, colSpan);
}

// ── Clamp de posición en grilla ───────────────────────────────────────────────
/** Redondea y clampea (col, row) para que una tarjeta de `colSpan` quede dentro. */
export function clampGridPos(
  colF: number,
  rowF: number,
  colSpan: CardWidth,
): { col: number; row: number } {
  const maxCol = GRID_COLUMNS - colSpan;
  return {
    col: Math.max(0, Math.min(maxCol, Math.round(colF))),
    row: Math.max(0, Math.min(GRID_ROWS - 1, Math.round(rowF))),
  };
}

// ── Alto total del canvas ─────────────────────────────────────────────────────
/**
 * Alto mínimo del canvas para mostrar todas las tarjetas con un pequeño pad
 * inferior. Devuelve 0 si no hay tarjetas.
 */
export function getCanvasHeight(cards: DpsCardDef[], unit: number): number {
  if (cards.length === 0) return 0;
  let maxBottomRow = 0;
  for (const card of cards) {
    const bottomRow = card.row + card.heightBlocks;
    if (bottomRow > maxBottomRow) maxBottomRow = bottomRow;
  }
  return (maxBottomRow * ROW_HEIGHT_RATIO + ANCHOR_OFFSET_RATIO) * unit + 16;
}
