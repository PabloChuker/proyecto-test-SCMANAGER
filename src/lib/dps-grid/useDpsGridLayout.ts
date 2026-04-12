// =============================================================================
// AL FILO — DPS Grid: hook de layout
//
// Gestiona el estado discreto de todas las tarjetas del canvas:
//   - posiciones default (determinísticas, por categoría)
//   - overrides del usuario (cargados desde localStorage)
//   - drag activo (col/row provisional)
//   - z-order (último tocado = frente)
//   - persistencia
// =============================================================================

"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { DpsCardDef, SavedCardPos, WidgetId, CardWidth } from "./dpsGridTypes";
import { LAYOUT_STORAGE_KEY, ANCHOR_OFFSET_RATIO, ROW_HEIGHT_RATIO } from "./dpsGridTypes";
import { clampGridPos } from "./dpsGridGeometry";

// ── Posición default por categoría ────────────────────────────────────────────
// Se exporta para que LoadoutBuilder pueda declararla con su COLUMN_PLAN.
export type ColumnPlan1Col = WidgetId[][];  // [col0, col1, col2]
export type ColumnPlan2Col = WidgetId[];    // sidebar (arranca en col 3)
const SIDEBAR_START_COL = 3;

export function buildDefaultPositions(
  visible: Set<WidgetId>,
  blocks: Record<WidgetId, number>,
  columnPlan1Col: ColumnPlan1Col,
  columnPlan2Col: ColumnPlan2Col,
): Map<WidgetId, { col: number; row: number }> {
  const result = new Map<WidgetId, { col: number; row: number }>();

  // Zone A — 1-col en cols 0..2
  for (let col = 0; col < columnPlan1Col.length; col++) {
    let row = 0;
    for (const wId of columnPlan1Col[col]) {
      if (!visible.has(wId)) continue;
      result.set(wId, { col, row });
      row += blocks[wId];
    }
  }

  // Zone B — 2-col en cols 3-4
  {
    let row = 0;
    for (const wId of columnPlan2Col) {
      if (!visible.has(wId)) continue;
      result.set(wId, { col: SIDEBAR_START_COL, row });
      row += blocks[wId];
    }
  }

  return result;
}

// ── localStorage ──────────────────────────────────────────────────────────────
function loadSavedPositions(): SavedCardPos[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (p) =>
        p &&
        typeof p.id === "string" &&
        typeof p.col === "number" &&
        typeof p.row === "number",
    ) as SavedCardPos[];
  } catch {
    return null;
  }
}

function persistPositions(positions: SavedCardPos[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(positions));
  } catch {}
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export interface UseDpsGridLayoutOptions {
  visibleIds: Set<WidgetId>;
  widgetBlocks: Record<WidgetId, number>;
  widgetWidth: Record<WidgetId, CardWidth>;
  columnPlan1Col: ColumnPlan1Col;
  columnPlan2Col: ColumnPlan2Col;
}

export interface DpsGridLayoutResult {
  /** Tarjetas listas para renderizar (col/row ya resueltos, incluyendo drag). */
  cards: DpsCardDef[];
  /** Z-order: el último id de la lista es el de mayor z-index. */
  zOrder: WidgetId[];
  /** Id del widget en drag activo (o null). */
  dragWidgetId: WidgetId | null;
  /** Columna provisional durante el drag (para el ghost). */
  dragPreviewCol: number;
  /** Fila provisional durante el drag (para el ghost). */
  dragPreviewRow: number;
  /** Inicia el drag de un widget. */
  startDrag: (id: WidgetId, offsetX: number, offsetY: number) => void;
  /** Mueve el drag (llamar desde onDragMove de dnd-kit). */
  moveDrag: (deltaX: number, deltaY: number, unit: number) => void;
  /** Confirma la posición al soltar. */
  endDrag: () => void;
  /** Cancela el drag sin mover. */
  cancelDrag: () => void;
  /** Resetea el layout a los defaults. */
  resetLayout: () => void;
  /** True mientras el layout no se ha montado (evita flash). */
  layoutMounted: boolean;
}

export function useDpsGridLayout(opts: UseDpsGridLayoutOptions): DpsGridLayoutResult {
  const {
    visibleIds,
    widgetBlocks,
    widgetWidth,
    columnPlan1Col,
    columnPlan2Col,
  } = opts;

  const [layoutMounted, setLayoutMounted] = useState(false);
  const [userPositions, setUserPositions] = useState<Map<WidgetId, { col: number; row: number }>>(
    () => new Map(),
  );
  const [zOrder, setZOrder] = useState<WidgetId[]>([]);

  // Estado del drag
  const [dragWidgetId, setDragWidgetId] = useState<WidgetId | null>(null);
  const [dragPreviewCol, setDragPreviewCol] = useState(0);
  const [dragPreviewRow, setDragPreviewRow] = useState(0);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  // Posición de origen del drag (para restaurar en cancelación)
  const dragOriginRef = useRef<{ col: number; row: number }>({ col: 0, row: 0 });

  // Cargar desde localStorage en mount
  useEffect(() => {
    const saved = loadSavedPositions();
    if (saved && saved.length > 0) {
      const m = new Map<WidgetId, { col: number; row: number }>();
      for (const p of saved) m.set(p.id, { col: p.col, row: p.row });
      setUserPositions(m);
    }
    setLayoutMounted(true);
  }, []);

  // Defaults determinísticos
  const defaults = useMemo(
    () => buildDefaultPositions(visibleIds, widgetBlocks, columnPlan1Col, columnPlan2Col),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleIds, widgetBlocks],
  );

  // Posiciones finales: default + overrides del usuario
  const resolvedPositions = useMemo(() => {
    const pos = new Map<WidgetId, { col: number; row: number }>(defaults);
    for (const [id, p] of userPositions) {
      if (!visibleIds.has(id)) continue;
      const colSpan = widgetWidth[id];
      pos.set(id, clampGridPos(p.col, p.row, colSpan));
    }
    return pos;
  }, [defaults, userPositions, visibleIds, widgetWidth]);

  // Construir array DpsCardDef para render
  const cards = useMemo<DpsCardDef[]>(() => {
    if (!layoutMounted) return [];
    const result: DpsCardDef[] = [];
    for (const id of Array.from(visibleIds)) {
      const pos = resolvedPositions.get(id) ?? { col: 0, row: 0 };
      // Durante el drag, aplicar la posición provisional
      const col = dragWidgetId === id ? dragPreviewCol : pos.col;
      const row = dragWidgetId === id ? dragPreviewRow : pos.row;
      result.push({
        id,
        col,
        row,
        colSpan: widgetWidth[id],
        heightBlocks: widgetBlocks[id],
      });
    }
    // ship-selector al final para que su dropdown quede por encima
    result.sort((a, b) => {
      if (a.id === "ship-selector") return 1;
      if (b.id === "ship-selector") return -1;
      return 0;
    });
    return result;
  }, [layoutMounted, visibleIds, resolvedPositions, widgetWidth, widgetBlocks, dragWidgetId, dragPreviewCol, dragPreviewRow]);

  // Persistir cuando termina el drag
  useEffect(() => {
    if (dragWidgetId !== null || !layoutMounted) return;
    if (userPositions.size === 0) return;
    const slim: SavedCardPos[] = Array.from(userPositions.entries()).map(([id, p]) => ({
      id,
      col: p.col,
      row: p.row,
    }));
    persistPositions(slim);
  }, [dragWidgetId, userPositions, layoutMounted]);

  // ── Drag API ──────────────────────────────────────────────────────────────
  const startDrag = useCallback(
    (id: WidgetId, offsetX: number, offsetY: number) => {
      dragOffsetRef.current = { x: offsetX, y: offsetY };
      const current = userPositions.get(id) ??
        defaults.get(id) ?? { col: 0, row: 0 };
      dragOriginRef.current = current;
      setDragPreviewCol(current.col);
      setDragPreviewRow(current.row);
      setZOrder((prev) => {
        const filtered = prev.filter((x) => x !== id);
        filtered.push(id);
        return filtered;
      });
      setDragWidgetId(id);
    },
    [userPositions, defaults],
  );

  const moveDrag = useCallback(
    (deltaX: number, deltaY: number, unit: number) => {
      if (!dragWidgetId) return;
      const colSpan = widgetWidth[dragWidgetId];
      const origin = dragOriginRef.current;

      // Calculamos la posición de anclaje deseada sumando el delta acumulado
      // (dnd-kit nos da el delta total desde el inicio del drag)
      const anchorX = origin.col * unit + ANCHOR_OFFSET_RATIO * unit + deltaX;
      const anchorY = origin.row * ROW_HEIGHT_RATIO * unit + ANCHOR_OFFSET_RATIO * unit + deltaY;

      const colF = (anchorX - ANCHOR_OFFSET_RATIO * unit) / unit;
      const rowF = (anchorY - ANCHOR_OFFSET_RATIO * unit) / (ROW_HEIGHT_RATIO * unit);
      const snapped = clampGridPos(colF, rowF, colSpan);

      setDragPreviewCol(snapped.col);
      setDragPreviewRow(snapped.row);
    },
    [dragWidgetId, widgetWidth],
  );

  const endDrag = useCallback(() => {
    if (!dragWidgetId) return;
    setUserPositions((prev) => {
      const next = new Map(prev);
      next.set(dragWidgetId, { col: dragPreviewCol, row: dragPreviewRow });
      return next;
    });
    setDragWidgetId(null);
  }, [dragWidgetId, dragPreviewCol, dragPreviewRow]);

  const cancelDrag = useCallback(() => {
    setDragWidgetId(null);
  }, []);

  const resetLayout = useCallback(() => {
    setUserPositions(new Map());
    try {
      localStorage.removeItem(LAYOUT_STORAGE_KEY);
    } catch {}
  }, []);

  return {
    cards,
    zOrder,
    dragWidgetId,
    dragPreviewCol,
    dragPreviewRow,
    startDrag,
    moveDrag,
    endDrag,
    cancelDrag,
    resetLayout,
    layoutMounted,
  };
}
