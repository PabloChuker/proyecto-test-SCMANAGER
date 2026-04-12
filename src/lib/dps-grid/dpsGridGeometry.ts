// =============================================================================
// AL FILO — DPS Grid: helpers geométricos
//
// Solo define ANCHOS y posiciones X de columna.
// Las alturas las determina el contenido (content-sized).
// =============================================================================

import type { CardWidth } from "./dpsGridTypes";
import {
  GRID_COLUMNS,
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

// ── Posición X de una columna ─────────────────────────────────────────────────
/** Left del contenedor de una columna (incluye el anchor offset). */
export function getColumnX(col: number, unit: number): number {
  return col * unit;
}

// ── Ancho de columna ──────────────────────────────────────────────────────────
/**
 * Ancho del CONTENEDOR de columna en px.
 * Equivale a colSpan * UNIT.
 * El padding horizontal interno = ANCHOR_OFFSET_RATIO * unit en cada lado,
 * dando un gap visual de MARGIN_RATIO * unit entre columnas adyacentes.
 */
export function getColumnWidth(colSpan: CardWidth, unit: number): number {
  return colSpan * unit;
}

/**
 * Padding horizontal interno de cada columna (en px).
 * Se aplica como `padding-inline` al contenedor de la columna.
 * → Gap visible entre card y borde de columna = ANCHOR_OFFSET_RATIO * unit
 * → Gap visible entre tarjetas de columnas adyacentes = MARGIN_RATIO * unit
 */
export function getColumnPadding(unit: number): number {
  return ANCHOR_OFFSET_RATIO * unit;
}

/**
 * Ancho efectivo de la tarjeta dentro de la columna (px).
 * = columna ancho - 2 * padding lateral
 */
export function getCardWidth(colSpan: CardWidth, unit: number): number {
  return (colSpan - MARGIN_RATIO) * unit;
}

// ── Ancho total del canvas ────────────────────────────────────────────────────
/** Ancho total del canvas para 5 columnas. */
export function getCanvasWidth(unit: number): number {
  return GRID_COLUMNS * unit;
}
