// =============================================================================
// AL FILO — DPS Grid: hook de layout v2
//
// Estado: orden de tarjetas por columna (ColumnOrder).
// Las alturas son content-sized — no se almacenan.
// El drag reordena tarjetas dentro de / entre columnas.
// =============================================================================

"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { WidgetId, ColumnKey, ColumnOrder, CardWidth } from "./loadoutGridTypes";
import { LAYOUT_STORAGE_KEY, LAYOUT_CHECKPOINT_KEY } from "./loadoutGridTypes";
import { getUnit } from "./loadoutGridGeometry";

// ── Tipos de plan de columnas ─────────────────────────────────────────────────
export type ColumnPlan1Col = WidgetId[][];  // [col0, col1, col2]
export type ColumnPlan2Col = WidgetId[];    // sidebar

// ── Default layout ────────────────────────────────────────────────────────────
export function buildDefaultColumnOrder(
  visible: Set<WidgetId>,
  columnPlan1Col: ColumnPlan1Col,
  columnPlan2Col: ColumnPlan2Col,
): ColumnOrder {
  const keys: ColumnKey[] = ["col0", "col1", "col2"];
  const result: ColumnOrder = { col0: [], col1: [], col2: [], sidebar: [] };

  for (let i = 0; i < columnPlan1Col.length; i++) {
    result[keys[i]] = columnPlan1Col[i].filter((id) => visible.has(id));
  }
  result.sidebar = columnPlan2Col.filter((id) => visible.has(id));

  return result;
}

// ── localStorage ──────────────────────────────────────────────────────────────
function loadSavedOrder(): ColumnOrder | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Validate shape
    const keys: ColumnKey[] = ["col0", "col1", "col2", "sidebar"];
    for (const k of keys) {
      if (!Array.isArray(parsed[k])) return null;
    }
    return parsed as ColumnOrder;
  } catch {
    return null;
  }
}

function persistOrder(order: ColumnOrder) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(order));
  } catch {}
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export interface UseDpsGridLayoutOptions {
  visibleIds: Set<WidgetId>;
  widgetWidth: Record<WidgetId, CardWidth>;
  columnPlan1Col: ColumnPlan1Col;
  columnPlan2Col: ColumnPlan2Col;
  containerWidth?: number;
}

export interface UseDpsGridLayoutResult {
  /** Orden de widgets por columna (ya filtrado por visibilidad). */
  columnOrder: ColumnOrder;
  /** UNIT calculado del ancho del contenedor (para anchos de columna). */
  unit: number;
  /** Mueve una tarjeta a una columna en un índice. */
  moveCard: (id: WidgetId, toColumn: ColumnKey, toIndex: number) => void;
  /** Guarda el layout actual como punto de restauración ("Save Layout"). */
  saveLayout: () => void;
  /** Resetea al layout guardado (checkpoint) o al default si no hay ninguno. */
  resetLayout: () => void;
  /** True mientras el layout no se ha montado (evita flash). */
  layoutMounted: boolean;
}

export function useDpsGridLayout(opts: UseDpsGridLayoutOptions): UseDpsGridLayoutResult {
  const {
    visibleIds,
    widgetWidth,
    columnPlan1Col,
    columnPlan2Col,
    containerWidth = 1400,
  } = opts;

  const [layoutMounted, setLayoutMounted] = useState(false);
  const [savedOrder, setSavedOrder] = useState<ColumnOrder | null>(null);

  // Cargar desde localStorage en mount
  useEffect(() => {
    const loaded = loadSavedOrder();
    setSavedOrder(loaded);
    setLayoutMounted(true);
  }, []);

  // Default derivado de los planes de columna
  const defaultOrder = useMemo(
    () => buildDefaultColumnOrder(visibleIds, columnPlan1Col, columnPlan2Col),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleIds],
  );

  // Orden activo: merge del saved con el default para ids nuevos o visibilidad
  const columnOrder = useMemo<ColumnOrder>(() => {
    if (!savedOrder) return defaultOrder;

    // Ids presentes en el saved order que siguen siendo visibles
    const keys: ColumnKey[] = ["col0", "col1", "col2", "sidebar"];
    const placed = new Set<WidgetId>();
    const merged: ColumnOrder = { col0: [], col1: [], col2: [], sidebar: [] };

    for (const k of keys) {
      merged[k] = (savedOrder[k] ?? []).filter((id) => visibleIds.has(id));
      merged[k].forEach((id) => placed.add(id));
    }

    // Ids visibles que no están en el saved → los añadimos en la columna default
    for (const k of keys) {
      for (const id of defaultOrder[k]) {
        if (!placed.has(id)) {
          merged[k].push(id);
          placed.add(id);
        }
      }
    }

    return merged;
  }, [savedOrder, defaultOrder, visibleIds]);

  const moveCard = useCallback(
    (id: WidgetId, toColumn: ColumnKey, toIndex: number) => {
      setSavedOrder((prev) => {
        const base = prev ?? defaultOrder;
        const next: ColumnOrder = {
          col0: [...base.col0],
          col1: [...base.col1],
          col2: [...base.col2],
          sidebar: [...base.sidebar],
        };
        // Quitar de la columna actual
        const keys: ColumnKey[] = ["col0", "col1", "col2", "sidebar"];
        for (const k of keys) {
          next[k] = next[k].filter((x) => x !== id);
        }
        // Insertar en la columna destino
        const clamped = Math.max(0, Math.min(toIndex, next[toColumn].length));
        next[toColumn].splice(clamped, 0, id);

        persistOrder(next);
        return next;
      });
    },
    [defaultOrder],
  );

  // Save the current columnOrder as the user's explicit restore point
  const saveLayout = useCallback(() => {
    try {
      localStorage.setItem(LAYOUT_CHECKPOINT_KEY, JSON.stringify(columnOrder));
    } catch {}
  }, [columnOrder]);

  // Restore to the saved checkpoint (if any), otherwise back to hardcoded default
  const resetLayout = useCallback(() => {
    try {
      const checkpoint = localStorage.getItem(LAYOUT_CHECKPOINT_KEY);
      if (checkpoint) {
        const parsed = JSON.parse(checkpoint) as ColumnOrder;
        setSavedOrder(parsed);
        persistOrder(parsed);
      } else {
        setSavedOrder(null);
        localStorage.removeItem(LAYOUT_STORAGE_KEY);
      }
    } catch {
      setSavedOrder(null);
      try { localStorage.removeItem(LAYOUT_STORAGE_KEY); } catch {}
    }
  }, []);

  const unit = getUnit(containerWidth);

  return { columnOrder, unit, moveCard, saveLayout, resetLayout, layoutMounted };
}
