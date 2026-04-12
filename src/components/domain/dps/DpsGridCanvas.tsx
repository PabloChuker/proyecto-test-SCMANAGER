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
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import type { WidgetId, ColumnKey, ColumnOrder } from "@/lib/dps-grid/dpsGridTypes";
import { CARD_GAP_PX } from "@/lib/dps-grid/dpsGridTypes";
import type { UseDpsGridLayoutResult } from "@/lib/dps-grid/useDpsGridLayout";
import { getUnit, getColumnPadding } from "@/lib/dps-grid/dpsGridGeometry";
import { DpsGridCard } from "./DpsGridCard";

// ── Configuración de columnas ─────────────────────────────────────────────────
const COLUMN_KEYS: ColumnKey[] = ["col0", "col1", "col2", "sidebar"];

// Widgets que ocupan siempre 2 columnas: solo van al sidebar.
// Bloquear su cruce en handleDragOver evita que el portal target cambie
// durante el drag (y con ello evita recrear los contextos WebGL).
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
  // Se usan refs (no state) para evitar re-renders innecesarios.
  // useLayoutEffect dispara antes del primer paint → no hay flash.
  const col0ElRef    = useRef<HTMLDivElement | null>(null);
  const col1ElRef    = useRef<HTMLDivElement | null>(null);
  const col2ElRef    = useRef<HTMLDivElement | null>(null);
  const sidebarElRef = useRef<HTMLDivElement | null>(null);

  const [colsReady, setColsReady] = useState(false);
  useLayoutEffect(() => { setColsReady(true); }, []);

  const getColEl = (col: ColumnKey): HTMLDivElement | null => {
    if (!colsReady) return null;
    if (col === "col0")    return col0ElRef.current;
    if (col === "col1")    return col1ElRef.current;
    if (col === "col2")    return col2ElRef.current;
    return sidebarElRef.current;
  };

  // ── Draft order ──────────────────────────────────────────────────────────────
  const [activeId, setActiveId] = useState<WidgetId | null>(null);
  const [draftOrder, setDraftOrder] = useState<ColumnOrder | null>(null);

  const liveOrder = draftOrder ?? columnOrder;

  // Lista plana de todos los ids: SortableContext los necesita en orden
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
  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || !active) return;

    const draggedId = active.id as string;
    const overId    = over.id as string;

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

      // Widgets de 2 columnas solo van al sidebar.
      // Bloquear el cruce aquí evita que su portal target cambie durante el
      // drag → los contextos WebGL nunca se destruyen mientras se arrastra.
      if (TWO_COL_IDS.has(draggedId) && targetCol !== "sidebar") return base;

      const sourceItems = base[sourceCol];
      const sourceIdx   = sourceItems.indexOf(draggedId as WidgetId);
      if (sourceIdx === -1) return base;

      const next = cloneOrder(base);

      if (sourceCol === targetCol) {
        // Reorden dentro de la misma columna
        const targetIdx = next[targetCol].indexOf(overId as WidgetId);
        if (targetIdx === -1 || targetIdx === sourceIdx) return base;
        next[targetCol] = arrayMove(next[targetCol], sourceIdx, targetIdx);
      } else {
        // Mover entre columnas
        next[sourceCol] = next[sourceCol].filter((id) => id !== draggedId);
        const overIdx = next[targetCol].indexOf(overId as WidgetId);
        if (overIdx === -1) {
          next[targetCol].push(draggedId as WidgetId);
        } else {
          next[targetCol].splice(overIdx, 0, draggedId as WidgetId);
        }
      }

      return next;
    });
  }, [columnOrder]);

  // ── Drag end (persistir) ─────────────────────────────────────────────────────
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    window.dispatchEvent(new Event("dnd:dragend"));
    const { active, over } = event;
    const draggedId = active.id as WidgetId;

    if (draftOrder) {
      if (TWO_COL_IDS.has(draggedId) && over) {
        // Para widgets 2-col, el draftOrder no se actualizó cross-column:
        // calcular columna final desde over.id
        const overId = over.id as string;
        const finalCol: ColumnKey = COLUMN_KEYS.includes(overId as ColumnKey)
          ? overId as ColumnKey
          : (findColumn(overId, columnOrder) ?? findColumn(draggedId, draftOrder) ?? "sidebar");
        // Solo permitir caer en sidebar para widgets 2-col
        const safeCol: ColumnKey = TWO_COL_IDS.has(draggedId) && finalCol !== "sidebar"
          ? "sidebar"
          : finalCol;
        const finalOrder = columnOrder[safeCol].filter(id => id !== draggedId);
        const overIdx = finalOrder.indexOf(overId as WidgetId);
        const insertIdx = overIdx >= 0 ? overIdx : finalOrder.length;
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
      {/* Contenedores de columna: solo son droppable zones + portal targets.
          Las tarjetas NO se renderizan aquí via React — se portalean desde
          el SortableContext de abajo. */}
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

      {/* Un único SortableContext para todas las tarjetas.
          Cada DpsGridCard se portalea a su columna via portalTarget.
          Las tarjetas nunca se desmontan al cruzar columnas:
          solo cambia el DOM node donde vive el portal. */}
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

      {/* Overlay ligero: solo muestra una pastilla con el nombre del widget. */}
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
// Zona droppable pura. No contiene tarjetas en el árbol React —
// las tarjetas llegan via createPortal desde el SortableContext superior.
// El flexbox sí ve los hijos portaleados porque son DOM children reales.
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
