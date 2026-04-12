// =============================================================================
// AL FILO — DpsGridCard
//
// Wrapper de posicionamiento absoluto para cada widget del DPS canvas.
// Usa `useDraggable` de dnd-kit solo para el drag desde el header (.rgl-drag-handle).
// La posición (x, y, w, h) viene del layout geométrico — nunca de CSS flex/grid.
// =============================================================================

"use client";

import { useDraggable } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import type { DpsCardRect } from "@/lib/dps-grid/dpsGridTypes";
import type { WidgetId } from "@/lib/dps-grid/dpsGridTypes";

interface DpsGridCardProps {
  id: WidgetId;
  rect: DpsCardRect;
  zIndex: number;
  isDragging: boolean;
  children: React.ReactNode;
}

export function DpsGridCard({ id, rect, zIndex, isDragging, children }: DpsGridCardProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef } = useDraggable({
    id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        position: "absolute",
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        zIndex,
        // Opacity reducida durante el drag para distinguir ghost del original
        opacity: isDragging ? 0.55 : 1,
        // Transición suave al snap (solo cuando no está dragging para no lagear)
        transition: isDragging ? "none" : "left 0.08s ease, top 0.08s ease",
        pointerEvents: isDragging ? "none" : "auto",
        // Evitar selección de texto al arrastrar
        userSelect: "none",
        // Contener el overflow del contenido (popovers necesitan override explícito)
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
      data-widget-id={id}
      {...attributes}
    >
      {/* El drag handle se adjunta aquí vía setActivatorNodeRef.
          El children es responsable de renderizar el .rgl-drag-handle header.
          Usamos un span invisible que envuelve el header internamente. */}
      <DragHandleInjector setActivatorNodeRef={setActivatorNodeRef} listeners={listeners}>
        {children}
      </DragHandleInjector>
    </div>
  );
}

// ── DragHandleInjector ────────────────────────────────────────────────────────
// Escucha el mousedown/pointerdown en el primer hijo con .rgl-drag-handle
// y activa el drag de dnd-kit. No modifica la estructura del DOM del widget.
import { useEffect, useRef } from "react";

function DragHandleInjector({
  setActivatorNodeRef,
  listeners,
  children,
}: {
  setActivatorNodeRef: (node: HTMLElement | null) => void;
  listeners: SyntheticListenerMap | undefined;
  children: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const handle = containerRef.current.querySelector<HTMLElement>(".rgl-drag-handle");
    setActivatorNodeRef(handle);
  });

  return (
    <div ref={containerRef} style={{ display: "contents" }} {...(listeners ?? {})}>
      {children}
    </div>
  );
}
