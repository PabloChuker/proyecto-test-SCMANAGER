"use client";

// =============================================================================
// SC LABS — ShipNode (Chain Board v2, 2026-05-05)
//
// Custom node de @xyflow/react para el canvas. Replica el diseño del mockup
// "Ship Upgrade Planner" — foto + nombre + manufacturer + role + precio +
// EDIT PATH / DELETE — con tema oscuro.
//
// Handles:
//   · target en el lado IZQUIERDO  (label "Upgrade from")
//   · source en el lado DERECHO    (label "Upgrade to")
// El user dragea de un handle a otro para crear un CCU edge entre dos naves.
// =============================================================================

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { CatalogShip } from "./types";

// xyflow requiere que el `data` de un Node extienda Record<string, unknown>.
// Modelamos los campos tipados como intersección — TS los infiere bien y la
// constraint del lib se respeta.
export type ShipNodeData = {
  ship: CatalogShip;
  /** True si este nodo está seleccionado (highlight cyan). */
  selected?: boolean;
  /** True si tiene una edge entrante — habilita el botón EDIT PATH. */
  hasIncoming?: boolean;
  /** Callbacks inyectados por el board. */
  onEditPath?: (nodeId: string) => void;
  onDelete?: (nodeId: string) => void;
  onSelect?: (nodeId: string) => void;
} & Record<string, unknown>;

function ShipNodeImpl({ id, data }: NodeProps) {
  const d = data as unknown as ShipNodeData;
  const ship = d.ship;
  const isSelected = d.selected;

  const ringClass = isSelected
    ? "ring-2 ring-cyan-400/80 shadow-[0_0_24px_rgba(34,211,238,0.25)]"
    : "ring-1 ring-cyan-500/30";

  return (
    <div
      className={`relative w-[170px] rounded-md ${ringClass} bg-zinc-900/95 backdrop-blur-sm transition-all`}
      onClick={(e) => {
        e.stopPropagation();
        d.onSelect?.(id);
      }}
    >
      {/* ── Handles + labels "Upgrade from" / "Upgrade to" ─────────────── */}
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!w-3 !h-3 !bg-zinc-700 !border-2 !border-cyan-400 hover:!bg-cyan-500 transition-colors !-left-[6px]"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!w-3 !h-3 !bg-zinc-700 !border-2 !border-cyan-400 hover:!bg-cyan-500 transition-colors !-right-[6px]"
      />

      {/* Top labels alineadas con los handles */}
      <div className="flex items-center justify-between px-2 pt-1.5 pb-0.5 text-[8px] font-mono uppercase tracking-widest">
        <span className="text-zinc-500">Upgrade from</span>
        <span className="text-zinc-500">Upgrade to</span>
      </div>

      {/* ── Foto ───────────────────────────────────────────────────────── */}
      <div className="relative h-[70px] mx-1.5 overflow-hidden rounded-sm bg-zinc-800/60">
        {ship.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ship.imageUrl}
            alt={ship.name}
            className="w-full h-full object-cover"
            draggable={false}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.opacity = "0.2";
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-2xl text-zinc-700">
            🚀
          </div>
        )}
      </div>

      {/* ── Cuerpo ─────────────────────────────────────────────────────── */}
      <div className="px-2 pt-1.5 pb-2 space-y-0.5">
        <p className="text-[12px] font-semibold text-zinc-100 truncate leading-tight">
          {ship.name}
        </p>
        <p className="text-[9px] text-zinc-500 italic truncate leading-tight">
          {ship.manufacturer ?? "—"}
          {ship.role ? ` · ${ship.role}` : ""}
        </p>
        <p className="text-[14px] font-mono font-bold text-cyan-300 pt-0.5">
          ${ship.msrpUsd.toFixed(2)}
        </p>

        {/* Botones EDIT PATH / DELETE — la convención `nodrag` evita que
            xyflow registre el click como inicio de drag del nodo. */}
        <div className="flex gap-1 pt-1">
          <button
            type="button"
            disabled={!d.hasIncoming}
            onClick={(e) => {
              e.stopPropagation();
              d.onEditPath?.(id);
            }}
            className={`nodrag flex-1 text-[9px] font-mono uppercase tracking-wider px-1.5 py-1 rounded-sm border transition-colors ${
              d.hasIncoming
                ? "border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/15 cursor-pointer"
                : "border-zinc-800 text-zinc-700 cursor-not-allowed"
            }`}
            title={
              d.hasIncoming
                ? "Cambiar tipo de upgrade entrante (Normal → WB → Hanger → ...)"
                : "Esta nave no tiene un upgrade entrante"
            }
          >
            Edit Path
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              d.onDelete?.(id);
            }}
            className="nodrag flex-1 text-[9px] font-mono uppercase tracking-wider px-1.5 py-1 rounded-sm border border-rose-500/40 text-rose-300 hover:bg-rose-500/15 cursor-pointer transition-colors"
            title="Quitar del canvas"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export const ShipNode = memo(ShipNodeImpl);
