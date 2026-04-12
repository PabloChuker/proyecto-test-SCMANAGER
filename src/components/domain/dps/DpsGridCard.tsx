// =============================================================================
// AL FILO — DpsGridCard
//
// Tarjeta sortable. Usa useSortable de @dnd-kit/sortable.
// El drag se activa solo desde el header .rgl-drag-handle.
// La altura es content-sized (auto) — sin heights fijos.
// =============================================================================

"use client";

import { useEffect, useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { WidgetId } from "@/lib/dps-grid/dpsGridTypes";

interface DpsGridCardProps {
  id: WidgetId;
  children: React.ReactNode;
  /** True cuando este item es el que está siendo arrastrado (muestra ghost). */
  isActive?: boolean;
}

export function DpsGridCard({ id, children, isActive = false }: DpsGridCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  // Adjuntar listeners solo al .rgl-drag-handle header
  useEffect(() => {
    if (!containerRef.current) return;
    const handle = containerRef.current.querySelector<HTMLElement>(".rgl-drag-handle");
    setActivatorNodeRef(handle ?? null);
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? "none" : transition,
    // El item original se vuelve semi-transparente mientras el DragOverlay lo sigue
    opacity: isDragging ? 0.35 : 1,
    // Evitar que el ghost colapse
    position: "relative",
  };

  return (
    <div ref={(node) => { setNodeRef(node); (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node; }} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}
