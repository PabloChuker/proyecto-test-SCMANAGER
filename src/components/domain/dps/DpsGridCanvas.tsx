// =============================================================================
// AL FILO — DpsGridCanvas v5 (react-grid-layout)
//
// Reemplaza dnd-kit por react-grid-layout. RGL posiciona los widgets con
// position: absolute + CSS transforms — los componentes NUNCA se desmontan
// al mover, por lo que los contextos WebGL (Three.js) sobreviven.
//
// Grid: 5 columnas. col0-col2 = w:1, sidebar = w:2 (x:3).
// Alturas en unidades de ROW_H (30 px). Redimensionable y arrastrable
// desde .rgl-drag-handle (el header de WidgetShell).
// =============================================================================

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GridLayout, { WidthProvider } from "react-grid-layout";
import type { Layout } from "react-grid-layout";

import type { WidgetId, ColumnKey, ColumnOrder } from "@/lib/dps-grid/dpsGridTypes";
import type { UseDpsGridLayoutResult } from "@/lib/dps-grid/useDpsGridLayout";

// ── Constantes ────────────────────────────────────────────────────────────────

const AutoGrid = WidthProvider(GridLayout);

const COLUMN_KEYS: ColumnKey[] = ["col0", "col1", "col2", "sidebar"];
const COL_X: Record<ColumnKey, number> = { col0: 0, col1: 1, col2: 2, sidebar: 3 };
const TWO_COL_IDS = new Set<string>(["ship-card", "flight-dynamics-3d", "ship-selector"]);

const RGL_KEY = "al-filo-rgl-v1";
const ROW_H = 30;

/** Alturas por defecto (en filas de ROW_H px). */
const DEFAULT_H: Record<string, number> = {
  "ship-card":          16, // 480 px
  "flight-dynamics-3d": 16,
  "ship-selector":       4, // 120 px
  "strafe-profile":     10, // 300 px
  "turning-profile":    10,
  "power-grid":          8, // 240 px
  "combat-summary":      8,
  "maneuver-radar":      8,
  "dps-detail":          8,
  "balance":             6, // 180 px
};
const H_FALLBACK = 8;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convierte un ColumnOrder (legacy) a un array de Layout items para RGL. */
function toRgl(order: ColumnOrder): Layout[] {
  const out: Layout[] = [];
  for (const col of COLUMN_KEYS) {
    let y = 0;
    for (const id of order[col]) {
      const isTwoCol = TWO_COL_IDS.has(id);
      const w = isTwoCol ? 2 : 1;
      const h = DEFAULT_H[id] ?? H_FALLBACK;
      out.push({
        i: id, x: COL_X[col], y, w, h,
        minW: w, maxW: w,               // bloquear ancho
      });
      y += h;
    }
  }
  return out;
}

function loadSaved(): Layout[] | null {
  try {
    const raw = localStorage.getItem(RGL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function persist(layout: Layout[]) {
  try { localStorage.setItem(RGL_KEY, JSON.stringify(layout)); }
  catch { /* ignore */ }
}

/**
 * Fusiona un layout guardado con las posiciones por defecto:
 * - mantiene posiciones guardadas de widgets que siguen visibles,
 * - añade posiciones por defecto para widgets nuevos.
 */
function merge(saved: Layout[], defaults: Layout[], visible: Set<WidgetId>): Layout[] {
  const kept = saved.filter(l => visible.has(l.i as WidgetId));
  const keptIds = new Set(kept.map(l => l.i));
  for (const d of defaults) {
    if (!keptIds.has(d.i)) kept.push(d);
  }
  return kept;
}

// ── Componente ────────────────────────────────────────────────────────────────

interface DpsGridCanvasProps {
  layout: UseDpsGridLayoutResult;
  renderWidget: (id: WidgetId) => React.ReactNode;
}

export function DpsGridCanvas({ layout, renderWidget }: DpsGridCanvasProps) {
  const { columnOrder } = layout;

  // Lista plana de widgets visibles
  const visibleIds = useMemo(() => {
    const ids: WidgetId[] = [];
    for (const col of COLUMN_KEYS) ids.push(...columnOrder[col]);
    return ids;
  }, [columnOrder]);

  const visibleSet = useMemo(() => new Set(visibleIds), [visibleIds]);

  // SSR guard: CSSTransforms solo después de montar
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Layout RGL
  const [gridLayout, setGridLayout] = useState<Layout[]>(() => {
    const saved = loadSaved();
    const defaults = toRgl(columnOrder);
    return saved ? merge(saved, defaults, visibleSet) : defaults;
  });

  // Re-sync cuando cambian los widgets visibles (cambio de nave)
  const prevVisible = useRef(visibleIds);
  useEffect(() => {
    if (prevVisible.current === visibleIds) return;
    prevVisible.current = visibleIds;
    setGridLayout(prev => {
      const defaults = toRgl(columnOrder);
      return merge(prev, defaults, visibleSet);
    });
  }, [visibleIds, visibleSet, columnOrder]);

  // Persistir en cada cambio de layout
  const onLayoutChange = useCallback((cur: Layout[]) => {
    setGridLayout(cur);
    persist(cur);
  }, []);

  return (
    <AutoGrid
      layout={gridLayout}
      cols={5}
      rowHeight={ROW_H}
      draggableHandle=".rgl-drag-handle"
      onLayoutChange={onLayoutChange}
      compactType="vertical"
      containerPadding={[0, 0]}
      margin={[4, 4]}
      useCSSTransforms={mounted}
      isResizable
    >
      {visibleIds.map(id => (
        <div key={id} style={{ overflow: "hidden" }}>
          {renderWidget(id)}
        </div>
      ))}
    </AutoGrid>
  );
}
