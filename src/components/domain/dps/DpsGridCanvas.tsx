// =============================================================================
// AL FILO — DpsGridCanvas v5 (react-grid-layout)
//
// Grid: 5 columnas. col0-col2 = w:1, sidebar = w:2 (x:3).
// Auto-height: un ResizeObserver mide el contenido real de cada widget y
// ajusta h en tiempo real. rowHeight=1 → precisión de ~4 px.
// Drag solo desde .rgl-drag-handle (header de WidgetShell).
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
const ROW_H = 1;                               // 1 px por fila → alto preciso
const MARGIN: [number, number] = [4, 4];        // gap entre tarjetas
const MARGIN_Y = MARGIN[1];

/** px de contenido → unidades h de RGL. */
function pxToH(px: number): number {
  return Math.max(1, Math.ceil((px + MARGIN_Y) / (ROW_H + MARGIN_Y)));
}

// h inicial generoso; el ResizeObserver lo corrige en el primer frame.
const H_INIT = pxToH(300);

// ── Helpers ───────────────────────────────────────────────────────────────────

function toRgl(order: ColumnOrder): Layout[] {
  const out: Layout[] = [];
  for (const col of COLUMN_KEYS) {
    let y = 0;
    for (const id of order[col]) {
      const w = TWO_COL_IDS.has(id) ? 2 : 1;
      out.push({ i: id, x: COL_X[col], y, w, h: H_INIT, minW: w, maxW: w });
      y += H_INIT;
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

function persistLayout(layout: Layout[]) {
  try { localStorage.setItem(RGL_KEY, JSON.stringify(layout)); } catch { /* noop */ }
}

function mergeSavedWithDefaults(
  saved: Layout[],
  defaults: Layout[],
  visible: Set<WidgetId>,
): Layout[] {
  const kept = saved.filter(l => visible.has(l.i as WidgetId));
  const keptIds = new Set(kept.map(l => l.i));
  for (const d of defaults) if (!keptIds.has(d.i)) kept.push(d);
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

  // SSR guard
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // ── Layout state ──────────────────────────────────────────────────────────
  const [gridLayout, setGridLayout] = useState<Layout[]>(() => {
    const saved = loadSaved();
    const defaults = toRgl(columnOrder);
    return saved ? mergeSavedWithDefaults(saved, defaults, visibleSet) : defaults;
  });

  // Re-sync cuando cambian los widgets visibles (cambio de nave)
  const prevVisible = useRef(visibleIds);
  useEffect(() => {
    if (prevVisible.current === visibleIds) return;
    prevVisible.current = visibleIds;
    setGridLayout(prev => mergeSavedWithDefaults(prev, toRgl(columnOrder), visibleSet));
  }, [visibleIds, visibleSet, columnOrder]);

  // ── Auto-height via ResizeObserver ────────────────────────────────────────
  const roRef = useRef<ResizeObserver | null>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    const ro = new ResizeObserver(entries => {
      // No auto-height mientras se arrastra (evita saltos)
      if (draggingRef.current) return;

      const updates = new Map<string, number>();
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.autoId;
        if (!id) continue;
        const px = entry.target.scrollHeight;
        if (px <= 0) continue;
        updates.set(id, pxToH(px));
      }
      if (updates.size === 0) return;

      setGridLayout(prev => {
        let changed = false;
        const next = prev.map(item => {
          const newH = updates.get(item.i);
          if (newH != null && newH !== item.h) {
            changed = true;
            return { ...item, h: newH };
          }
          return item;
        });
        return changed ? next : prev;
      });
    });
    roRef.current = ro;
    return () => { ro.disconnect(); roRef.current = null; };
  }, []);

  // ── Persistencia (debounced) ──────────────────────────────────────────────
  const persistTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const handleLayoutChange = useCallback((cur: Layout[]) => {
    setGridLayout(cur);
    clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => persistLayout(cur), 500);
  }, []);

  const handleDragStart = useCallback(() => { draggingRef.current = true; }, []);
  const handleDragStop = useCallback(() => { draggingRef.current = false; }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AutoGrid
      layout={gridLayout}
      cols={5}
      rowHeight={ROW_H}
      draggableHandle=".rgl-drag-handle"
      onLayoutChange={handleLayoutChange}
      onDragStart={handleDragStart}
      onDragStop={handleDragStop}
      compactType="vertical"
      containerPadding={[0, 0]}
      margin={MARGIN}
      useCSSTransforms={mounted}
      isResizable={false}
    >
      {visibleIds.map(id => (
        <div key={id}>
          <div
            data-auto-id={id}
            ref={el => { if (el) roRef.current?.observe(el); }}
          >
            {renderWidget(id)}
          </div>
        </div>
      ))}
    </AutoGrid>
  );
}
