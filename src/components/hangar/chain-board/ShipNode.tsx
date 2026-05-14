"use client";

// =============================================================================
// SC LABS — ShipNode (Chain Board v2.2, 2026-05-05)
//
// Custom node de @xyflow/react. Replica el card del mockup, dark theme.
// Muestra:
//   · Foto + nombre + manufacturer + role + precio en tienda
//   · Si tiene edge entrante (incomingPathCost > 0): el costo acumulado
//     hasta esta nave + la diferencia vs MSRP (ahorro o sobreprecio).
// Handles: target en LEFT, source en RIGHT.
// =============================================================================

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { CatalogShip } from "./types";

export type ShipNodeData = {
  ship: CatalogShip;
  selected?: boolean;
  hasIncoming?: boolean;
  /** Costo acumulado para llegar a esta nave por la cadena. Si es 0 o
   *  undefined, la nave es base (no se muestra el comparativo). */
  incomingPathCost?: number;
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

  // Calcular el ahorro/sobreprecio si hay incomingPathCost
  const showCost = d.hasIncoming && typeof d.incomingPathCost === "number" && d.incomingPathCost > 0;
  const diff = showCost ? ship.msrpUsd - (d.incomingPathCost ?? 0) : 0;
  const savings = diff > 0; // verdadero ahorro si pagaste menos que MSRP
  const overpay = diff < 0;

  return (
    <div
      className={`relative w-[180px] rounded-md ${ringClass} bg-zinc-900/95 backdrop-blur-sm transition-all`}
      onClick={(e) => {
        e.stopPropagation();
        d.onSelect?.(id);
      }}
    >
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

      {/* Top labels alineadas con handles */}
      <div className="flex items-center justify-between px-2 pt-1.5 pb-0.5 text-[8px] font-mono uppercase tracking-widest">
        <span className="text-zinc-500">From</span>
        <span className="text-zinc-500">To</span>
      </div>

      {/* Foto */}
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

      {/* Cuerpo */}
      <div className="px-2 pt-1.5 pb-2 space-y-0.5">
        <p className="text-[12px] font-semibold text-zinc-100 truncate leading-tight">
          {ship.name}
        </p>
        <p className="text-[9px] text-zinc-500 italic truncate leading-tight">
          {ship.manufacturer ?? "—"}
          {ship.role ? ` · ${ship.role}` : ""}
        </p>

        {/* Precios: MSRP siempre, y si hay path → tu costo + diff */}
        <div className="pt-0.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[8px] font-mono uppercase tracking-wider text-zinc-500">
              Tienda
            </span>
            <span className="text-[12px] font-mono font-bold text-zinc-300">
              ${ship.msrpUsd.toFixed(2)}
            </span>
          </div>
          {showCost && (
            <>
              <div className="flex items-baseline justify-between">
                <span className="text-[8px] font-mono uppercase tracking-wider text-cyan-500">
                  Tu costo
                </span>
                <span className="text-[12px] font-mono font-bold text-cyan-300">
                  ${(d.incomingPathCost ?? 0).toFixed(2)}
                </span>
              </div>
              <div className="flex items-baseline justify-between mt-0.5 px-1 py-0.5 rounded-[2px] bg-zinc-950/60">
                <span className="text-[8px] font-mono uppercase tracking-wider text-zinc-600">
                  {savings ? "Ahorrás" : overpay ? "De más" : "Sin diff"}
                </span>
                <span
                  className={`text-[11px] font-mono font-bold ${
                    savings ? "text-emerald-400" : overpay ? "text-rose-400" : "text-zinc-500"
                  }`}
                >
                  {/*
                    2026-05-13 (Audit P0-4): quitar prefijo "−" / "+". El
                    label arriba ("Ahorrás" / "De más") y el color (verde /
                    rojo) ya indican el signo. Antes "Ahorrás −$70" leía como
                    pérdida — el mismo bug que el header global resolvimos
                    en la primera auditoría, faltaba en este componente.
                  */}
                  ${Math.abs(diff).toFixed(2)}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Botones EDIT PATH / DELETE */}
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
                ? "Cambiar tipo de upgrade entrante"
                : "Esta nave no tiene un upgrade entrante"
            }
          >
            Edit
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
