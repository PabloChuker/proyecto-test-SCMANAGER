// =============================================================================
// AL FILO — DpsGridCanvas v2
//
// Layout: CSS grid de 5 columnas (3 × 1-col + 1 × 2-col sidebar).
// Anchos: UNIT-based (se recalculan con ResizeObserver).
// Alturas: content-sized (auto). Sin heightBlocks fijos.
// Gap vertical: CARD_GAP_PX (fijo, pequeño).
// Drag: dnd-kit sortable, dentro y entre columnas.
// =============================================================================

"use client";

import { useEffect, useRef, useState } from "react";
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

import type { WidgetId, ColumnKey } from "@/lib/dps-grid/dpsGridTypes";
import { CARD_GAP_PX } from "@/lib/dps-grid/dpsGridTypes";
import type { UseDpsGridLayoutResult } from "@/lib/dps-grid/useDpsGridLayout";
import { getUnit, getColumnPadding } from "@/lib/dps-grid/dpsGridGeometry";
import { DpsGridCard } from "./DpsGridCard";

// ── Configuración de columnas ─────────────────────────────────────────────────
const COLUMNS: { key: ColumnKey; colSpan: 1 | 2 }[] = [
  { key: "col0",    colSpan: 1 },
  { key: "col1",    colSpan: 1 },
  { key: "col2",    colSpan: 1 },
  { key: "sidebar", colSpan: 2 },
];

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

  // ── Drag state ────────────────────────────────────────────────────────────
  const [activeId, setActiveId] = useState<WidgetId | null>(null);
  // Columna sobre la que está el puntero (para drop en columna vacía)
  const [overColumn, setOverColumn] = useState<ColumnKey | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as WidgetId);
  }

  function handleDragOver(event: DragOverEvent) {
    const overId = event.over?.id;
    if (!overId) { setOverColumn(null); return; }
    // Si el over es un ColumnKey, lo guardamos
    if (COLUMNS.some((c) => c.key === overId)) {
      setOverColumn(overId as ColumnKey);
    } else {
      setOverColumn(null);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    setOverColumn(null);
    if (!over || !active) return;

    const draggedId = active.id as WidgetId;
    const overId = over.id as string;

    // Determinar columna destino y índice
    let targetColumn: ColumnKey | null = null;
    let targetIndex = 0;

    if (COLUMNS.some((c) => c.key === overId)) {
      // Drop en el área de una columna vacía o al final
      targetColumn = overId as ColumnKey;
      targetIndex = columnOrder[targetColumn].length;
    } else {
      // Drop sobre otra tarjeta
      for (const { key } of COLUMNS) {
        const idx = columnOrder[key].indexOf(overId as WidgetId);
        if (idx !== -1) {
          targetColumn = key;
          targetIndex = idx;
          break;
        }
      }
    }

    if (!targetColumn) return;

    // Ajustar índice: si el item se mueve dentro de la misma columna hacia abajo,
    // la posición de destino ya considera el hueco dejado al sacar el item.
    const sourceColumn = findColumn(draggedId, columnOrder);
    if (sourceColumn === targetColumn) {
      const sourceIndex = columnOrder[sourceColumn].indexOf(draggedId);
      if (sourceIndex === targetIndex) return; // sin cambio
    }

    moveCard(draggedId, targetColumn, targetIndex);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  // gridTemplateColumns: 3 cols de 1*UNIT + sidebar de 2*UNIT
  const gridCols = `repeat(3, ${unit}px) ${unit * 2}px`;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => { setActiveId(null); setOverColumn(null); }}
    >
      <div
        ref={outerRef}
        style={{ display: "grid", gridTemplateColumns: gridCols, alignItems: "start" }}
      >
        {COLUMNS.map(({ key }) => (
          <DroppableColumn
            key={key}
            columnKey={key}
            widgetIds={columnOrder[key]}
            padding={colPadding}
            isOver={overColumn === key}
            renderWidget={renderWidget}
            activeId={activeId}
          />
        ))}
      </div>

      {/* DragOverlay: muestra el widget mientras se arrastra */}
      <DragOverlay dropAnimation={null}>
        {activeId ? (
          <div style={{ opacity: 0.85, pointerEvents: "none" }}>
            {renderWidget(activeId)}
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
  isOver,
  renderWidget,
  activeId,
}: {
  columnKey: ColumnKey;
  widgetIds: WidgetId[];
  padding: number;
  isOver: boolean;
  renderWidget: (id: WidgetId) => React.ReactNode;
  activeId: WidgetId | null;
}) {
  const { setNodeRef } = useDroppable({ id: columnKey });

  return (
    <div
      ref={setNodeRef}
      style={{
        paddingInline: padding,
        display: "flex",
        flexDirection: "column",
        gap: CARD_GAP_PX,
        // Indicador sutil cuando el drag está sobre esta columna vacía
        outline: isOver && widgetIds.length === 0
          ? "1px dashed rgba(234,179,8,0.3)"
          : "none",
        minHeight: 40,
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

// ── Helper ────────────────────────────────────────────────────────────────────
function findColumn(
  id: WidgetId,
  order: UseDpsGridLayoutResult["columnOrder"],
): ColumnKey | null {
  for (const key of ["col0", "col1", "col2", "sidebar"] as ColumnKey[]) {
    if (order[key].includes(id)) return key;
  }
  return null;
}
