// =============================================================================
// AL FILO — DPS Grid: detección de colisiones
//
// Utilidades para detectar solapamientos en espacio discreto.
// Reservado para uso futuro (el layout v12 usa columnas stacked,
// sin posicionamiento libre, por lo que no hay solapamientos posibles).
// =============================================================================

import type { WidgetId } from "./loadoutGridTypes";

// ── Rect discreto ────────────────────────────────────────────────────────────
interface DiscreteRect {
  id: WidgetId;
  col: number;
  row: number;
  colSpan: number;
  heightBlocks: number;
}

// ── Overlap en espacio discreto ───────────────────────────────────────────────
export function doesOverlap(a: DiscreteRect, b: DiscreteRect): boolean {
  if (a.id === b.id) return false;
  const aRight  = a.col + a.colSpan;
  const aBottom = a.row + a.heightBlocks;
  const bRight  = b.col + b.colSpan;
  const bBottom = b.row + b.heightBlocks;
  if (aRight <= b.col) return false;
  if (bRight <= a.col) return false;
  if (aBottom <= b.row) return false;
  if (bBottom <= a.row) return false;
  return true;
}

export function canPlaceRect(rect: DiscreteRect, others: DiscreteRect[]): boolean {
  return others.every((other) => !doesOverlap(rect, other));
}
