// =============================================================================
// AL FILO — DpsGridCanvas v3
//
// Fix cross-column drag: el item se mueve en tiempo real entre columnas
// durante el drag (onDragOver), no solo en onDragEnd. Esto permite que
// cada SortableContext vea el item correcto y calcule la posición de drop.
// =============================================================================

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
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

const COLUMNS: { key: ColumnKey; colSpan: 1 | 2 }[] = [
  { key: "col0",    colSpan: 1 },
  { key: "col1",    colSpan: 1 },
  { key: "col2",    colSpan: 1 },
  { key: "sidebar", colSpan: 2 },
];

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

  // ── Draft order: espejo local del columnOrder que se actualiza en tiempo real
  // mientras el usuario arrastra. Al soltar se persiste via moveCard().
  // Al cancelar se descarta. Permite que cada SortableContext vea el item
  // en la columna correcta durante el drag cross-column.
  const [activeId, setActiveId] = useState<WidgetId | null>(null);
  const [draftOrder, setDraftOrder] = useState<ColumnOrder | null>(null);

  // El orden que los SortableContexts ven durante el drag
  const liveOrder = draftOrder ?? columnOrder;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  // ── Drag start ───────────────────────────────────────────────────────────
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as WidgetId);
    setDraftOrder(cloneOrder(columnOrder));
  }, [columnOrder]);

  // ── Drag over (movimiento en tiempo real) ────────────────────────────────
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

      // Sin cambio si ya está en la misma posición
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
          // Drop en la columna pero no sobre una card: añadir al final
          next[targetCol].push(draggedId as WidgetId);
        } else {
          next[targetCol].splice(overIdx, 0, draggedId as WidgetId);
        }
      }

      return next;
    });
  }, [columnOrder]);

  // ── Drag end (persistir) ────────────────────────────────────────────────
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active } = event;
    const draggedId = active.id as WidgetId;

    if (draftOrder) {
      const targetCol = findColumn(draggedId, draftOrder);
      if (targetCol) {
        const targetIdx = draftOrder[targetCol].indexOf(draggedId);
        moveCard(draggedId, targetCol, targetIdx);
      }
    }

    setActiveId(null);
    setDraftOrder(null);
  }, [draftOrder, moveCard]);

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    setDraftOrder(null);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  const gridCols = `repeat(3, ${unit}px) ${unit * 2}px`;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div
        ref={outerRef}
        style={{ display: "grid", gridTemplateColumns: gridCols, alignItems: "start" }}
      >
        {COLUMNS.map(({ key }) => (
          <DroppableColumn
            key={key}
            columnKey={key}
            widgetIds={liveOrder[key]}
            padding={colPadding}
            renderWidget={renderWidget}
            activeId={activeId}
          />
        ))}
      </div>

      {/* Overlay ligero: solo muestra una pastilla con el nombre del widget.
          NO renderiza el contenido del widget para evitar instanciar Two.js /
          SVG pesado / Three.js por segunda vez mientras el drag está activo. */}
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

// ── DroppableColumn ────────────────────────────────────────────────────────────
function DroppableColumn({
  columnKey,
  widgetIds,
  padding,
  renderWidget,
  activeId,
}: {
  columnKey: ColumnKey;
  widgetIds: WidgetId[];
  padding: number;
  renderWidget: (id: WidgetId) => React.ReactNode;
  activeId: WidgetId | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnKey });

  return (
    <div
      ref={setNodeRef}
      style={{
        paddingInline: padding,
        display: "flex",
        flexDirection: "column",
        gap: CARD_GAP_PX,
        minHeight: 40,
        outline: isOver && widgetIds.filter(id => id !== activeId).length === 0
          ? "1px dashed rgba(234,179,8,0.25)"
          : "none",
      }}
    >
      <SortableContext items={widgetIds} strategy={verticalListSortingStrategy}>
        {widgetIds.map((id) => (
          <DpsGridCard key={id} id={id} isActive={activeId === id}>
            {renderWidget(id)}
          </DpsGridCard>
        ))}
      </SortableContext>
    </div>
  );
}
