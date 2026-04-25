"use client";

// =============================================================================
// CCUList — vista lista de CCUs / Upgrades (Fase T + T.1)
//
// Cada fila ahora muestra el MSRP de la nave de origen y de destino al lado
// del nombre, el VALOR REAL DEL SALTO (MSRP_to − MSRP_from), lo que el
// usuario pagó por el CCU y cuánto se ahorró respecto al salto puro
// (= jump − paid). Si saved > 0 → ahorro (verde). Si saved < 0 → sobreprecio
// (rojo). Si MSRPs no están disponibles aún (loading o nave no listada),
// los campos derivados muestran "—" sin romper la UI.
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import { useHangarStore, type HangarCCU } from "@/store/useHangarStore";
import { EditCCUModal } from "./EditCCUModal";
import { LOCATION_COLORS } from "./hangar-style";

interface CCUListProps {
  ccus: HangarCCU[];
}

interface ShipMsrpRow {
  reference: string;
  msrpUsd: number;
}

/**
 * Hook compartido: pre-fetcha el catálogo de naves con MSRP UNA sola vez al
 * montar la lista de CCUs. Devuelve un map `reference (lowercased) → msrp`.
 * Se cachea con SWR-like behavior porque /api/ccu/ships ya tiene Cache-Control
 * `s-maxage=300` en el backend.
 */
function useShipMsrpMap(): Map<string, number> {
  const [ships, setShips] = useState<ShipMsrpRow[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/ccu/ships?minPrice=0&maxPrice=99999")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setShips((d.ships ?? []) as ShipMsrpRow[]);
      })
      .catch(() => {
        // Falla silenciosa — la UI igual renderiza sin MSRP.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return useMemo(() => {
    const m = new Map<string, number>();
    for (const s of ships) {
      if (s.reference && s.msrpUsd > 0) {
        m.set(s.reference.toLowerCase(), s.msrpUsd);
      }
    }
    return m;
  }, [ships]);
}

function fmtUSD(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return "$" + Math.round(n).toLocaleString();
}

function fmtSigned(n: number): string {
  const abs = Math.abs(Math.round(n)).toLocaleString();
  if (n > 0) return "+$" + abs;
  if (n < 0) return "-$" + abs;
  return "$0";
}

export function CCUList({ ccus }: CCUListProps) {
  const msrpMap = useShipMsrpMap();

  if (ccus.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 border border-zinc-800/50 rounded-sm bg-zinc-900/30">
        <div className="text-center">
          <p className="text-zinc-400 text-sm">No CCUs in your inventory</p>
          <p className="text-zinc-500 text-xs mt-1">Add a CCU to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-sm border border-zinc-800/60 bg-zinc-900/40">
      <div className="hidden md:flex items-center gap-3 px-3 py-2 border-b border-zinc-800/60 bg-zinc-900/60 text-[9px] tracking-[0.15em] uppercase text-zinc-500 font-mono">
        <div className="flex-1">From ($MSRP) → To ($MSRP)</div>
        <div className="w-20 text-right" title="Real jump value: MSRP destination − MSRP origin">Jump</div>
        <div className="w-20 text-right" title="What you actually paid for this CCU">Paid</div>
        <div className="w-24 text-right" title="Discount you got: Jump − Paid. Green = saved money, red = paid more than the bare delta.">Saved</div>
        <div className="w-16 text-center">Type</div>
        <div className="w-24 text-center">Location</div>
        <div className="flex-1 max-w-[200px]">Notes</div>
        <div className="w-24 text-right">Actions</div>
      </div>
      <div className="divide-y divide-zinc-800/40">
        {ccus.map((ccu) => (
          <CCURow key={ccu.id} ccu={ccu} msrpMap={msrpMap} />
        ))}
      </div>
    </div>
  );
}

function CCURow({ ccu, msrpMap }: { ccu: HangarCCU; msrpMap: Map<string, number> }) {
  const [showEdit, setShowEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const removeCCU = useHangarStore((s) => s.removeCCU);
  const location = LOCATION_COLORS[ccu.location];

  // MSRPs por reference. Si no encontramos uno, dejamos null y mostramos "—".
  const fromMsrp = msrpMap.get((ccu.fromShipReference || "").toLowerCase()) ?? null;
  const toMsrp = msrpMap.get((ccu.toShipReference || "").toLowerCase()) ?? null;
  // Salto real (puro): destino − origen. Si falta cualquiera, null.
  const jumpValue =
    fromMsrp !== null && toMsrp !== null ? toMsrp - fromMsrp : null;
  // Ahorro: cuánto te ahorraste vs comprar el salto al precio puro de la
  // tienda. Positivo = bien (CCU más barato que el salto), negativo = mal.
  const saved = jumpValue !== null ? jumpValue - ccu.pricePaid : null;
  const savedPct =
    jumpValue !== null && jumpValue > 0
      ? (saved! / jumpValue) * 100
      : null;
  const savedColor =
    saved === null
      ? "text-zinc-600"
      : saved > 0
        ? "text-emerald-400"
        : saved < 0
          ? "text-rose-400"
          : "text-zinc-400";

  return (
    <div className="group flex items-center gap-3 px-3 py-2 hover:bg-zinc-800/30 transition-colors text-[12px]">
      {/* From ($X) → To ($Y) */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 truncate">
          <span className="text-zinc-300">{ccu.fromShip}</span>
          <span className="text-[10px] font-mono text-zinc-500 tabular-nums">
            ({fmtUSD(fromMsrp)})
          </span>
          <span className="text-zinc-600">→</span>
          <span className="text-cyan-300">{ccu.toShip}</span>
          <span className="text-[10px] font-mono text-cyan-500/70 tabular-nums">
            ({fmtUSD(toMsrp)})
          </span>
        </div>
      </div>

      {/* Jump value (puro) */}
      <div className="w-20 text-right hidden md:block font-mono tabular-nums text-zinc-300">
        {jumpValue !== null ? fmtUSD(jumpValue) : "—"}
      </div>

      {/* Paid */}
      <div className="w-20 text-right hidden md:block font-mono tabular-nums text-amber-300/80">
        ${ccu.pricePaid.toLocaleString()}
      </div>

      {/* Saved (= jump − paid) */}
      <div className={`w-24 text-right hidden md:block font-mono tabular-nums ${savedColor}`}>
        {saved !== null ? (
          <>
            <span>{fmtSigned(saved)}</span>
            {savedPct !== null && (
              <span className="text-[9px] opacity-70 ml-1">
                ({savedPct >= 0 ? "+" : ""}
                {savedPct.toFixed(0)}%)
              </span>
            )}
          </>
        ) : (
          "—"
        )}
      </div>

      {/* Type */}
      <div className="w-16 text-center hidden md:block">
        {ccu.isWarbond ? (
          <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-[2px] border bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
            WB
          </span>
        ) : (
          <span className="text-[9px] font-mono text-zinc-600">Std</span>
        )}
      </div>

      {/* Location */}
      <div className="w-24 text-center hidden md:block">
        <span className={`text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-[2px] border ${location?.bg ?? ""} ${location?.text ?? ""} ${location?.border ?? ""}`}>
          {ccu.location}
        </span>
      </div>

      {/* Notes */}
      <div className="flex-1 max-w-[200px] hidden md:block text-[10px] text-zinc-500 truncate">
        {ccu.notes || "—"}
      </div>

      {/* Actions */}
      <div className="w-24 flex justify-end gap-1 flex-shrink-0">
        <button
          onClick={() => setShowEdit(true)}
          className="text-[10px] px-2 py-1 text-zinc-400 hover:text-amber-300 border border-zinc-800/60 hover:border-amber-500/40 rounded-[2px] transition-colors"
          title="Edit"
        >
          Edit
        </button>
        {showDeleteConfirm ? (
          <button
            onClick={() => {
              removeCCU(ccu.id);
              setShowDeleteConfirm(false);
            }}
            className="text-[10px] px-2 py-1 text-rose-400 bg-rose-500/10 border border-rose-500/40 rounded-[2px]"
          >
            Confirm
          </button>
        ) : (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="text-[10px] px-2 py-1 text-zinc-500 hover:text-rose-400 border border-zinc-800/60 hover:border-rose-500/40 rounded-[2px] transition-colors"
            title="Delete"
          >
            ✕
          </button>
        )}
      </div>

      {showEdit && <EditCCUModal ccu={ccu} onClose={() => setShowEdit(false)} />}
    </div>
  );
}
