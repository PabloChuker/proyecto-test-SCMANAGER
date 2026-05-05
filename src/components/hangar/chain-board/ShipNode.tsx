"use client";

// =============================================================================
// SC LABS — ShipNode (CB.10, Fase 1)
//
// Custom node de @xyflow/react que renderiza una nave del ChainBoard como una
// card visual con:
//   · Foto (top, ~120px alto)
//   · Etiquetas "Upgrade from" / "Upgrade to" en bordes top/bottom (= los
//     puertos donde se conectan las edges entrantes/salientes)
//   · Nombre · Manufacturer · categoría
//   · Precio MSRP
//   · Botón DELETE (✕) en hover
//
// Diseño inspirado en el mockup que pasó Pablo (Ship Upgrade Planner):
//   - Border azul/zinc según role (base/intermediate/target)
//   - Handles en top y bottom para crear edges drag-and-drop
//   - Drag-to-move libre por el canvas
// =============================================================================

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { BoardCard } from "./types";

// El payload custom que ReactFlow guarda en `node.data`. Tiene que ser un
// Record<string, unknown> compatible — extendemos BoardCard.
export type ShipNodeData = BoardCard & {
  /** Callback para borrar la card. Se inyecta desde el board, no persiste. */
  onRemove?: (cardId: string) => void;
};

function ShipNodeImpl({ data, selected }: NodeProps) {
  const card = data as ShipNodeData;
  const role = card.role ?? "intermediate";

  // Color del outline según rol — coherente con el mockup:
  //   base  = amber (de donde arrancás)
  //   target = emerald (a donde querés llegar)
  //   intermediate = zinc/blue
  const roleStyle = (() => {
    if (role === "base") return {
      border: "border-amber-500/60",
      bg: "bg-amber-500/10",
      label: "BASE",
      labelColor: "text-amber-300 bg-amber-500/15 border-amber-500/40",
    };
    if (role === "target") return {
      border: "border-emerald-500/60",
      bg: "bg-emerald-500/10",
      label: "TARGET",
      labelColor: "text-emerald-300 bg-emerald-500/15 border-emerald-500/40",
    };
    return {
      border: "border-zinc-700/60",
      bg: "bg-zinc-900/80",
      label: null as string | null,
      labelColor: "",
    };
  })();

  const selectedRing = selected
    ? "ring-2 ring-cyan-500/60 ring-offset-2 ring-offset-zinc-950"
    : "";

  const originIcon = card.origin === "fleet" ? "📦" : card.origin === "store" ? "🛒" : "✏️";

  return (
    <div
      className={`group relative w-[200px] rounded-md border-2 ${roleStyle.border} ${roleStyle.bg} ${selectedRing} backdrop-blur-sm shadow-lg transition-all hover:shadow-xl`}
    >
      {/* Handle TOP — puerto entrante "Upgrade from" del próximo nodo arriba */}
      <Handle
        type="target"
        position={Position.Top}
        id="in"
        className="!w-3 !h-3 !bg-zinc-600 !border-zinc-400 hover:!bg-cyan-500 transition-colors"
      />

      {/* Label "Upgrade from" arriba */}
      <div className="absolute -top-5 left-0 right-0 text-center text-[9px] font-mono uppercase tracking-widest text-zinc-500">
        upgrade from
      </div>

      {/* Foto */}
      <div className="relative h-[100px] overflow-hidden rounded-t bg-zinc-800/50">
        {card.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.imageUrl}
            alt={card.shipName}
            className="absolute inset-0 w-full h-full object-cover"
            draggable={false}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.opacity = "0.2";
            }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-3xl text-zinc-700">
            🚀
          </div>
        )}
        {/* Overlay con role badge */}
        {roleStyle.label && (
          <div className={`absolute top-1.5 left-1.5 text-[8px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-[2px] border ${roleStyle.labelColor}`}>
            {roleStyle.label}
          </div>
        )}
        {/* Origen badge top-right */}
        <div
          className="absolute top-1.5 right-1.5 text-[10px] bg-zinc-950/80 rounded-sm px-1 py-0.5"
          title={`Origen: ${card.origin}`}
        >
          {originIcon}
        </div>
      </div>

      {/* Cuerpo */}
      <div className="p-2 space-y-0.5">
        <p className="text-[12px] font-medium text-zinc-100 truncate">
          {card.shipName}
        </p>
        {card.manufacturer && (
          <p className="text-[9px] text-zinc-500 font-mono truncate">
            {card.manufacturer}
          </p>
        )}
        <div className="flex items-baseline gap-1.5 pt-1">
          <span className="text-[14px] font-mono font-bold text-amber-400">
            ${card.msrpUsd.toFixed(2)}
          </span>
          {card.warbondUsd != null && card.warbondUsd !== card.msrpUsd && (
            <span className="text-[10px] font-mono text-cyan-400">
              WB ${card.warbondUsd.toFixed(0)}
            </span>
          )}
        </div>
      </div>

      {/* Botón DELETE (visible en hover) */}
      {card.onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            card.onRemove?.(card.cardId);
          }}
          className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 bg-rose-500/80 hover:bg-rose-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center transition-all z-10"
          title="Quitar del canvas"
          // CB.10: el evento de drag de @xyflow tiene que NO disparar cuando
          // clickeás el botón. ReactFlow respeta nodrag class por convención.
          aria-label="Eliminar nave"
        >
          ✕
        </button>
      )}

      {/* Label "Upgrade to" abajo */}
      <div className="absolute -bottom-5 left-0 right-0 text-center text-[9px] font-mono uppercase tracking-widest text-zinc-500">
        upgrade to
      </div>

      {/* Handle BOTTOM — puerto saliente al próximo nodo */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="out"
        className="!w-3 !h-3 !bg-zinc-600 !border-zinc-400 hover:!bg-cyan-500 transition-colors"
      />
    </div>
  );
}

export const ShipNode = memo(ShipNodeImpl);
