// =============================================================================
// AL FILO — DpsGridCard
//
// El drag solo se activa desde el header .rgl-drag-handle.
// No se propagan listeners al resto del contenido (evita conflictos con
// botones, inputs, canvas Three.js, etc.).
// =============================================================================

"use client";

import { useCallback, useEffect, useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import type { WidgetId } from "@/lib/dps-grid/dpsGridTypes";

interface DpsGridCardProps {
  id: WidgetId;
  children: React.ReactNode;
  isActive?: boolean;
}

export function DpsGridCard({ id, children, isActive = false }: DpsGridCardProps) {
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
    // Bloquear interacción con el contenido mientras se arrastra
    userSelect: isDragging ? "none" : undefined,
  };

  return (
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
}
