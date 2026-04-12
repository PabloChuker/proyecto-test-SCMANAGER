// =============================================================================
// AL FILO — DPS Grid: detección de colisiones y validación de posiciones
//
// Todas las comparaciones trabajan en espacio discreto (col, row) para evitar
// errores de floating-point al comparar rectángulos en píxeles.
// =============================================================================

import type { DpsCardDef } from "./dpsGridTypes";
import { GRID_COLUMNS as GRID_COLUMNS_CONST, GRID_ROWS as GRID_ROWS_CONST } from "./dpsGridTypes";

// ── Overlap en espacio discreto ───────────────────────────────────────────────
/**
 * Determina si dos tarjetas se solapan en espacio de grilla (col, row).
 * Las tarjetas NO se solapan si son el mismo widget (comparamos por id).
 */
export function doesOverlap(a: DpsCardDef, b: DpsCardDef): boolean {
  if (a.id === b.id) return false;

  const aRight  = a.col + a.colSpan;
  const aBottom = a.row + a.heightBlocks;
  const bRight  = b.col + b.colSpan;
  const bBottom = b.row + b.heightBlocks;

  // Sin solape si uno está completamente a la izquierda, derecha, arriba o abajo
  if (aRight <= b.col) return false;
  if (bRight <= a.col) return false;
  if (aBottom <= b.row) return false;
  if (bBottom <= a.row) return false;

  return true;
}

// ── Validación de posición ────────────────────────────────────────────────────
/**
 * Devuelve `true` si `card` puede colocarse en su (col, row) actual sin
 * solaparse con ninguna de las otras tarjetas en `others`.
 */
export function canPlaceCard(card: DpsCardDef, others: DpsCardDef[]): boolean {
  for (const other of others) {
    if (doesOverlap(card, other)) return false;
  }
  return true;
}

// ── Búsqueda de posición libre más cercana ────────────────────────────────────
/**
 * Intenta encontrar la posición libre más cercana a (card.col, card.row)
 * para una tarjeta de colSpan y heightBlocks dados.
 *
 * Estrategia: búsqueda en espiral hacia abajo — primero busca en la columna
 * solicitada bajando filas; si no hay hueco, prueba columnas adyacentes.
 * Devuelve null si no encuentra ninguna posición libre en el canvas.
 */
export function findNearestFreePosition(
  card: DpsCardDef,
  others: DpsCardDef[],
): { col: number; row: number } | null {
  const maxCol = GRID_COLUMNS_CONST - card.colSpan;

  // Orden de búsqueda: columna preferida primero, luego adyacentes
  const colCandidates: number[] = [];
  colCandidates.push(card.col);
  for (let delta = 1; delta <= maxCol; delta++) {
    if (card.col + delta <= maxCol) colCandidates.push(card.col + delta);
    if (card.col - delta >= 0)      colCandidates.push(card.col - delta);
  }

  for (const col of colCandidates) {
    // Filas hacia abajo desde la preferida, luego desde 0
    const rowStart = col === card.col ? card.row : 0;
    for (let row = rowStart; row < GRID_ROWS_CONST; row++) {
      const candidate: DpsCardDef = { ...card, col, row };
      if (canPlaceCard(candidate, others)) {
        return { col, row };
      }
    }
  }

  return null;
}

// ── Resolución de layout sin solapamientos ────────────────────────────────────
/**
 * Dado un array de tarjetas (posiblemente con solapamientos), devuelve un
 * nuevo array con posiciones ajustadas para que ninguna se solape.
 * Las tarjetas anteriores tienen prioridad; las posteriores se mueven.
 */
export function resolveLayout(cards: DpsCardDef[]): DpsCardDef[] {
  const placed: DpsCardDef[] = [];

  for (const card of cards) {
    if (canPlaceCard(card, placed)) {
      placed.push(card);
    } else {
      const free = findNearestFreePosition(card, placed);
      placed.push(free ? { ...card, ...free } : card);
    }
  }

  return placed;
}
