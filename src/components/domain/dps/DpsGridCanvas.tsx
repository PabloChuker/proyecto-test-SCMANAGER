// =============================================================================
// AL FILO — DpsGridCanvas v4
//
// Arquitectura: un único SortableContext plano con todas las tarjetas.
// Cada tarjeta se portalea a su contenedor de columna (DropColumn).
// Las tarjetas NUNCA se desmontan al cruzar columnas — solo cambia el
// portal target — por lo que los contextos WebGL (Three.js) sobreviven.
//
// Grid: 5 columnas iguales (repeat(5, UNIT px)).
// col0..col2 = zona de 1 col. sidebar = zona de 2 cols (gridColumn 4/span 2).
//
// Posición de drop: cuando over.id es el contenedor de columna (dnd-kit no
// detecta la tarjeta concreta), se calcula la posición de inserción leyendo
// directamente las posiciones Y del DOM via data-widget-id.
// =============================================================================

"use client";

import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import type { WidgetId, ColumnKey, ColumnOrder } from "@/lib/dps-grid/dpsGridTypes";
import { CARD_GAP_PX } from "@/lib/dps-grid/dpsGridTypes";
import type { UseDpsGridLayoutResult } from "@/lib/dps-grid/useDpsGridLayout";
import { getUnit, getColumnPadding } from "@/lib/dps-grid/dpsGridGeometry";
import { DpsGridCard } from "./DpsGridCard";

// ── Configuración de columnas ─────────────────────────────────────────────────
const COLUMN_KEYS: ColumnKey[] = ["col0", "col1", "col2", "sidebar"];

// Widgets de 2 columnas: solo van al sidebar.
const TWO_COL_IDS = new Set<string>(["ship-card", "flight-dynamics-3d", "ship-selector"]);

// ── Helpers ───────────────────────────────────────────────────────────────────
function findColumn(id: string, order: ColumnOrder): ColumnKey | null {
  for (const key of COLUMN_KEYS) {
    if (order[key].includes(id as WidgetId)) return key;
  }
  return null;
}

function cloneOrder(order: ColumnOrder): ColumnOrder {
  return {
    col0:    [...order.col0],
    col1:    [...order.col1],
    col2:    [...order.col2],
    sidebar: [...order.sidebar],
  };
}

// Dado el centro Y del elemento arrastrado y el contenedor de columna,
// devuelve el índice de inserción recorriendo los data-widget-id del DOM.
// La tarjeta del propio dragged (excludeId) se ignora al calcular posiciones.
// Devuelve el índice de inserción en colItems según la posición Y del pointer.
// colItems debe ser la lista SIN la tarjeta arrastrada para que las posiciones
// del DOM sean estables (la tarjeta arrastrada tiene un transform que sigue al pointer).
function getInsertIndexByY(
  colEl: HTMLElement,
  pointerY: number,
  colItems: WidgetId[],
): number {
  for (let i = 0; i < colItems.length; i++) {
    const cardEl = colEl.querySelector(`[data-widget-id="${colItems[i]}"]`);
    if (!cardEl) continue;
    const rect = cardEl.getBoundingClientRect();
    if (pointerY < rect.top + rect.height / 2) return i;
  }
  return colItems.length;
}

// ── Props ──────────────────────────────────────────────────────────────────────
interface DpsGridCanvasProps {
  layout: UseDpsGridLayoutResult;
  renderWidget: (id: WidgetId) => React.ReactNode;
}

// ── Componente ─────────────────────────────────────────────────────────────────
export function DpsGridCanvas({ layout, renderWidget }: DpsGridCanvasProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1400);

  const { columnOrder, moveCard } = layout;

  // ResizeObserver para mantener UNIT actualizado
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setContainerWidth(w);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const unit = getUnit(containerWidth);
  const colPadding = getColumnPadding(unit);

  // ── Portal targets: refs a los contenedores de columna ──────────────────────
  const col0ElRef    = useRef<HTMLDivElement | null>(null);
  const col1ElRef    = useRef<HTMLDivElement | null>(null);
  const col2ElRef    = useRef<HTMLDivElement | null>(null);
  const sidebarElRef = useRef<HTMLDivElement | null>(null);

  // Trigger re-render antes del primer paint para que los portales se resuelvan
  const [colsReady, setColsReady] = useState(false);
  useLayoutEffect(() => { setColsReady(true); }, []);

  const getColEl = (col: ColumnKey): HTMLDivElement | null => {
    if (!colsReady) return null;
    if (col === "col0")    return col0ElRef.current;
    if (col === "col1")    return col1ElRef.current;
    if (col === "col2")    return col2ElRef.current;
    return sidebarElRef.current;
  };

  // Lee los refs sin pasar por state (para usar dentro de handlers)
  const getColElImmediate = (col: ColumnKey): HTMLDivElement | null => {
    if (col === "col0")    return col0ElRef.current;
    if (col === "col1")    return col1ElRef.current;
    if (col === "col2")    return col2ElRef.current;
    return sidebarElRef.current;
  };


  // ── Draft order ──────────────────────────────────────────────────────────────
  const [activeId, setActiveId] = useState<WidgetId | null>(null);
  const [draftOrder, setDraftOrder] = useState<ColumnOrder | null>(null);

  const liveOrder = draftOrder ?? columnOrder;

  // Lista plana de todos los ids para el SortableContext
  const allItems = [
    ...liveOrder.col0,
    ...liveOrder.col1,
    ...liveOrder.col2,
    ...liveOrder.sidebar,
  ];

  // Mapa id → columna (para el portalTarget de cada tarjeta)
  const itemToCol = new Map<WidgetId, ColumnKey>();
  for (const key of COLUMN_KEYS) {
    for (const id of liveOrder[key]) itemToCol.set(id, key);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  // ── Drag start ───────────────────────────────────────────────────────────────
  const handleDragStart = useCallback((event: DragStartEvent) => {
    window.dispatchEvent(new Event("dnd:dragstart"));
    setActiveId(event.active.id as WidgetId);
    setDraftOrder(cloneOrder(columnOrder));
  }, [columnOrder]);

  // ── Drag over (movimiento en tiempo real) ────────────────────────────────────
  // Cuando over.id es un contenedor de columna (dnd-kit no resuelve la tarjeta
  // concreta en layouts multi-columna con portales), calculamos la posición de
  // inserción leyendo directamente las posiciones Y del DOM.
  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || !active) return;

    const draggedId = active.id as string;
    const overId    = over.id as string;

    // Posición Y actual del pointer: activatorEvent.clientY (pointerdown original)
    // + event.delta.y (desplazamiento acumulado). Es la forma fiable de obtener
    // el Y actual durante drag: window/document NO reciben pointermove porque
    // dnd-kit llama a setPointerCapture() al iniciar el drag.
    const activatorY = (event.activatorEvent as PointerEvent).clientY ?? 0;
    const pointerY   = activatorY + event.delta.y;

    const colElMap: Record<ColumnKey, HTMLDivElement | null> = {
      col0:    col0ElRef.current,
      col1:    col1ElRef.current,
      col2:    col2ElRef.current,
      sidebar: sidebarElRef.current,
    };

    setDraftOrder((prev) => {
      const base = prev ?? cloneOrder(columnOrder);

      const sourceCol = findColumn(draggedId, base);
      if (!sourceCol) return base;

      // Determinar columna destino
      let targetCol: ColumnKey | null = null;
      if (COLUMN_KEYS.includes(overId as ColumnKey)) {
        targetCol = overId as ColumnKey;
      } else {
        targetCol = findColumn(overId, base);
      }
      if (!targetCol) return base;

      // Widgets de 2 columnas: solo van al sidebar
      if (TWO_COL_IDS.has(draggedId) && targetCol !== "sidebar") return base;

      const next = cloneOrder(base);

      // Quitar la tarjeta arrastrada de donde esté ahora
      next[sourceCol] = next[sourceCol].filter((id) => id !== draggedId);

      // Ítems de la columna destino sin la tarjeta arrastrada (posiciones DOM estables)
      const targetItems = next[targetCol].filter((id) => id !== (draggedId as WidgetId));

      // Posición de inserción siempre por Y del pointer
      let insertIdx: number;
      if (colElMap[targetCol]) {
        insertIdx = getInsertIndexByY(colElMap[targetCol]!, pointerY, targetItems);
      } else {
        insertIdx = targetItems.length;
      }

      targetItems.splice(insertIdx, 0, draggedId as WidgetId);
      next[targetCol] = targetItems;

      return next;
    });
  }, [columnOrder]);

  // ── Drag end (persistir) ─────────────────────────────────────────────────────
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    window.dispatchEvent(new Event("dnd:dragend"));
    const { active, over } = event;
    const draggedId = active.id as WidgetId;

    const activatorY = (event.activatorEvent as PointerEvent).clientY ?? 0;
    const pointerY   = activatorY + event.delta.y;

    if (draftOrder) {
      if (TWO_COL_IDS.has(draggedId) && over) {
        // Para widgets 2-col, draftOrder no se actualizó cross-column:
        // calcular columna y posición final ahora
        const overId = over.id as string;
        const finalCol: ColumnKey = COLUMN_KEYS.includes(overId as ColumnKey)
          ? overId as ColumnKey
          : (findColumn(overId, columnOrder) ?? findColumn(draggedId, draftOrder) ?? "sidebar");
        const safeCol: ColumnKey = finalCol !== "sidebar" ? "sidebar" : finalCol;

        const existingItems = columnOrder[safeCol].filter(id => id !== draggedId);
        let insertIdx: number;

        if (!COLUMN_KEYS.includes(overId as ColumnKey)) {
          const overIdx = existingItems.indexOf(overId as WidgetId);
          insertIdx = overIdx >= 0 ? overIdx : existingItems.length;
        } else if (getColElImmediate(safeCol)) {
          insertIdx = getInsertIndexByY(getColElImmediate(safeCol)!, pointerY, existingItems);
        } else {
          insertIdx = existingItems.length;
        }

        moveCard(draggedId, safeCol, insertIdx);
      } else {
        const targetCol = findColumn(draggedId, draftOrder);
        if (targetCol) {
          const targetIdx = draftOrder[targetCol].indexOf(draggedId);
          moveCard(draggedId, targetCol, targetIdx);
        }
      }
    }

    setActiveId(null);
    setDraftOrder(null);
  }, [draftOrder, columnOrder, moveCard]);

  const handleDragCancel = useCallback(() => {
    window.dispatchEvent(new Event("dnd:dragend"));
    setActiveId(null);
    setDraftOrder(null);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────────
  const gridCols = `repeat(5, ${unit}px)`;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {/* Contenedores de columna: droppable zones + portal targets. */}
      <div
        ref={outerRef}
        style={{ display: "grid", gridTemplateColumns: gridCols, alignItems: "start" }}
      >
        <DropColumn
          columnKey="col0"
          padding={colPadding}
          setRef={(n) => { col0ElRef.current = n; }}
          isEmpty={liveOrder.col0.filter(id => id !== activeId).length === 0}
        />
        <DropColumn
          columnKey="col1"
          padding={colPadding}
          setRef={(n) => { col1ElRef.current = n; }}
          isEmpty={liveOrder.col1.filter(id => id !== activeId).length === 0}
        />
        <DropColumn
          columnKey="col2"
          padding={colPadding}
          setRef={(n) => { col2ElRef.current = n; }}
          isEmpty={liveOrder.col2.filter(id => id !== activeId).length === 0}
        />
        <DropColumn
          columnKey="sidebar"
          gridColumn="4 / span 2"
          padding={colPadding}
          setRef={(n) => { sidebarElRef.current = n; }}
          isEmpty={liveOrder.sidebar.filter(id => id !== activeId).length === 0}
        />
      </div>

      {/* Un único SortableContext — tarjetas portaleadas a su columna. */}
      <SortableContext items={allItems} strategy={verticalListSortingStrategy}>
        {allItems.map((id) => {
          const col = itemToCol.get(id);
          return (
            <DpsGridCard
              key={id}
              id={id}
              isActive={activeId === id}
              portalTarget={col ? getColEl(col) : null}
            >
              {renderWidget(id)}
            </DpsGridCard>
          );
        })}
      </SortableContext>

      <DragOverlay dropAnimation={null}>
        {activeId ? (
          <div style={{
            background: "rgba(24,24,27,0.92)",
            border: "1px solid rgba(234,179,8,0.45)",
            borderRadius: "2px",
            padding: "4px 10px",
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}>
            <span style={{
              fontSize: "9px",
              fontFamily: "monospace",
              color: "#a1a1aa",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
            }}>
              {activeId.replace(/-/g, " ")}
            </span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// ── DropColumn ─────────────────────────────────────────────────────────────────
function DropColumn({
  columnKey,
  gridColumn,
  padding,
  isEmpty,
  setRef,
}: {
  columnKey: ColumnKey;
  gridColumn?: string;
  padding: number;
  isEmpty: boolean;
  setRef: (node: HTMLDivElement | null) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnKey });

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        setRef(node);
      }}
      style={{
        ...(gridColumn ? { gridColumn } : {}),
        paddingInline: padding,
        display: "flex",
        flexDirection: "column",
        gap: CARD_GAP_PX,
        minHeight: 40,
        outline: isOver && isEmpty
          ? "1px dashed rgba(234,179,8,0.25)"
          : "none",
      }}
    />
  );
}
