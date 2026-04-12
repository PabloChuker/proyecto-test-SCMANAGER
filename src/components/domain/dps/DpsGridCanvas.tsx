// =============================================================================
// AL FILO — DpsGridCanvas
//
// Canvas de posicionamiento absoluto para el DPS Calculator.
// Proporciona el DndContext de dnd-kit y traduce los eventos de drag
// a coordenadas de grilla discretas via useDpsGridLayout.
//
// Reglas:
//   - `position: relative` en el contenedor
//   - Cada tarjeta se posiciona con `position: absolute` + left/top/width/height
//   - El UNIT se recalcula con ResizeObserver
//   - NO se usa flex/grid gap para el espaciado (sale de la geometría)
// =============================================================================

"use client";

import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragMoveEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToParentElement } from "@dnd-kit/modifiers";

import type { WidgetId } from "@/lib/dps-grid/dpsGridTypes";
import type { DpsGridLayoutResult } from "@/lib/dps-grid/useDpsGridLayout";
import { getUnit, getCardRect, getCanvasHeight } from "@/lib/dps-grid/dpsGridGeometry";
import { DpsGridCard } from "./DpsGridCard";

// ── Props ──────────────────────────────────────────────────────────────────────
interface DpsGridCanvasProps {
  /** Resultado completo de useDpsGridLayout. */
  layout: DpsGridLayoutResult;
  /** Renderiza el contenido de un widget dado su id. */
  renderWidget: (id: WidgetId) => React.ReactNode;
}

// ── Componente ─────────────────────────────────────────────────────────────────
export function DpsGridCanvas({ layout, renderWidget }: DpsGridCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [gridWidth, setGridWidth] = useState(1400);

  const {
    cards,
    zOrder,
    dragWidgetId,
    startDrag,
    moveDrag,
    endDrag,
    cancelDrag,
  } = layout;

  // ResizeObserver para mantener el UNIT actualizado
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setGridWidth(w);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const unit = getUnit(gridWidth);
  const canvasHeight = getCanvasHeight(cards, unit);

  // ── dnd-kit sensors ────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        // Requiere al menos 4px de movimiento para activar el drag.
        // Esto evita que un click en el header se interprete como drag.
        distance: 4,
      },
    }),
  );

  // ── Handlers de dnd-kit ────────────────────────────────────────────────────
  function handleDragStart(event: DragStartEvent) {
    const id = event.active.id as WidgetId;
    // dnd-kit no nos da el offset del puntero sobre el widget directamente;
    // lo calculamos desde la rect del elemento activo.
    const activeRect = event.active.rect.current.initial;
    const canvasRect = containerRef.current?.getBoundingClientRect();
    const offsetX = activeRect
      ? (activeRect.left - (canvasRect?.left ?? 0))
      : 0;
    const offsetY = activeRect
      ? (activeRect.top - (canvasRect?.top ?? 0))
      : 0;
    startDrag(id, offsetX, offsetY);
  }

  function handleDragMove(event: DragMoveEvent) {
    moveDrag(event.delta.x, event.delta.y, unit);
  }

  function handleDragEnd(_event: DragEndEvent) {
    endDrag();
  }

  function handleDragCancel() {
    cancelDrag();
  }

  // ── Z-index por widget ────────────────────────────────────────────────────
  function getZIndex(id: WidgetId): number {
    const base = zOrder.indexOf(id);
    // Si está siendo arrastrado, va al tope
    if (id === dragWidgetId) return 1000;
    return base === -1 ? 1 : base + 1;
  }

  return (
    <DndContext
      sensors={sensors}
      modifiers={[restrictToParentElement]}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div
        ref={containerRef}
        style={{
          position: "relative",
          width: "100%",
          height: canvasHeight > 0 ? canvasHeight : "auto",
          minHeight: 400,
        }}
      >
        {cards.map((card) => {
          const rect = getCardRect(card, unit);
          const widgetNode = renderWidget(card.id);
          if (!widgetNode) return null;

          return (
            <DpsGridCard
              key={card.id}
              id={card.id}
              rect={rect}
              zIndex={getZIndex(card.id)}
              isDragging={dragWidgetId === card.id}
            >
              {widgetNode}
            </DpsGridCard>
          );
        })}
      </div>
    </DndContext>
  );
}
