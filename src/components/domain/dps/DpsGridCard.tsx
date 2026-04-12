// =============================================================================
// AL FILO — DpsGridCard
//
// El drag solo se activa desde el header .rgl-drag-handle.
// No se propagan listeners al resto del contenido (evita conflictos con
// botones, inputs, canvas Three.js, etc.).
//
// portalTarget: si se pasa, la tarjeta se renderiza en ese DOM node via
// createPortal. El componente nunca se desmonta al cambiar de columna —
// solo cambia su portal target — lo que preserva contextos WebGL.
// =============================================================================

"use client";

import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { WidgetId } from "@/lib/dps-grid/dpsGridTypes";

interface DpsGridCardProps {
  id: WidgetId;
  children: React.ReactNode;
  isActive?: boolean;
  portalTarget?: HTMLElement | null;
}

export function DpsGridCard({ id, children, isActive = false, portalTarget }: DpsGridCardProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  // Adjuntar el activator ref solo al header .rgl-drag-handle
  useEffect(() => {
    const handle = containerRef.current?.querySelector<HTMLElement>(".rgl-drag-handle");
    setActivatorNodeRef(handle ?? null);
  });

  // Solo iniciar drag si el puntero bajó sobre .rgl-drag-handle y NO sobre
  // elementos interactivos (botones, inputs, selects, anchors, canvas).
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".rgl-drag-handle")) return;
      if (target.closest("button, input, select, textarea, a, canvas")) return;
      listeners?.onPointerDown?.(e as unknown as PointerEvent);
    },
    [listeners],
  );

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? "none" : transition,
    opacity: isDragging ? 0.35 : 1,
    position: "relative",
    userSelect: isDragging ? "none" : undefined,
  };

  const card = (
    <div
      ref={(node) => {
        setNodeRef(node);
        (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }}
      style={style}
      {...attributes}
      onPointerDown={handlePointerDown}
      // No spreadeamos {...listeners} aquí — usamos handlePointerDown filtrado
    >
      {children}
    </div>
  );

  // Portalear al contenedor de columna si está disponible.
  // Cambiar el portalTarget mueve el DOM pero NO desmonta el componente React,
  // así los contextos WebGL (Three.js) sobreviven al cambio de columna.
  if (portalTarget) {
    return createPortal(card, portalTarget);
  }
  return card;
}
