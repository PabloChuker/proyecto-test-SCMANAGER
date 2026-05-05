"use client";

// =============================================================================
// SC LABS — MyHangarColumn (Chain Board v2, 2026-05-05)
//
// Columna 2 del Chain Board: lista los CCUs que el usuario tiene en su hangar
// (HangarCCU del store local). Cada CCU es draggable como entidad — al
// soltar en el canvas, se generan 2 nodos (FROM + TO) + edge entre ellos.
//
// Inspirado en el panel "My Hanger" del mockup Ship Upgrade Planner — con
// header colapsable "Upgrade - X to Y Edition".
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import { useHangarStore } from "@/store/useHangarStore";
import { getShipThumbUrl } from "../HangarShipCard";
import {
  HANGAR_CCU_MIME,
  type CatalogShip,
  type HangarCcuPayload,
  type UpgradeKind,
} from "./types";

interface RawCatalogRow {
  id: string;
  reference?: string;
  name: string;
  manufacturer: string | null;
  msrpUsd: number;
  warbondUsd: number | null;
  flightStatus?: string | null;
}

export function ChainBoardStoreColumn() {
  const ccus = useHangarStore((s) => s.ccus);

  // Catálogo para resolver name → CatalogShip completo (necesario para drop).
  const [catalog, setCatalog] = useState<CatalogShip[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/ccu/ships")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const arr = Array.isArray(d?.ships) ? (d.ships as RawCatalogRow[]) : [];
        setCatalog(
          arr.map((x) => ({
            id: String(x.id ?? ""),
            reference: String(x.reference ?? ""),
            name: String(x.name ?? ""),
            manufacturer: x.manufacturer ?? null,
            role: x.flightStatus ?? null,
            msrpUsd: Number(x.msrpUsd) || 0,
            warbondUsd: x.warbondUsd != null ? Number(x.warbondUsd) : null,
            imageUrl: getShipThumbUrl(String(x.name ?? "")),
          })),
        );
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoadingCatalog(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Matchear nombre del hangar item contra el catálogo (longest-suffix match).
  const findShip = useMemo(() => {
    return (rawName: string): CatalogShip | null => {
      const name = (rawName ?? "").toLowerCase().trim();
      if (!name) return null;
      const candidates = catalog.filter((s) => {
        const sName = s.name.toLowerCase();
        return (
          sName === name ||
          sName.endsWith(" " + name) ||
          name.endsWith(" " + sName.split(" ").slice(1).join(" ").toLowerCase())
        );
      });
      if (candidates.length === 0) return null;
      return (
        candidates.find((s) => s.name.toLowerCase() === name) ??
        candidates.sort((a, b) => b.name.length - a.name.length)[0]
      );
    };
  }, [catalog]);

  type Row = {
    id: string;
    fromName: string;
    toName: string;
    fromShip: CatalogShip | null;
    toShip: CatalogShip | null;
    pricePaid: number;
    isWarbond: boolean;
    location: "hangar" | "buyback";
  };

  const rows = useMemo<Row[]>(() => {
    return ccus.map((c) => ({
      id: c.id,
      fromName: c.fromShip,
      toName: c.toShip,
      fromShip: findShip(c.fromShip),
      toShip: findShip(c.toShip),
      pricePaid: c.pricePaid,
      isWarbond: !!c.isWarbond,
      location: c.location,
    }));
  }, [ccus, findShip]);

  return (
    <div className="h-full flex flex-col bg-zinc-900/40 border border-zinc-800/60 rounded-md overflow-hidden">
      <div className="px-3 pt-3 pb-2 border-b border-zinc-800/50 flex items-center justify-between">
        <h2 className="text-[12px] font-semibold tracking-wide text-zinc-200">
          My Hangar
        </h2>
        <span className="text-[9px] font-mono text-zinc-600">{rows.length} CCUs</span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {loadingCatalog && (
          <p className="text-[11px] text-zinc-500 italic px-2 py-4 text-center">
            Cargando...
          </p>
        )}
        {!loadingCatalog && rows.length === 0 && (
          <p className="text-[11px] text-zinc-500 italic px-2 py-6 text-center leading-snug">
            Tu hangar no tiene CCUs.
            <br />
            <span className="text-[9px] text-zinc-600">Importá el hangar primero desde la extensión.</span>
          </p>
        )}

        {rows.map((row) => {
          const draggable = !!row.fromShip && !!row.toShip;
          const kind: UpgradeKind = row.location === "buyback"
            ? "hanger" // CCU comprado en buyback se aplica desde el hangar
            : row.isWarbond
            ? "warbond"
            : "normal";
          const titleText = `Upgrade — ${row.fromName} → ${row.toName}`;

          return (
            <div
              key={row.id}
              draggable={draggable}
              onDragStart={(e) => {
                if (!draggable || !row.fromShip || !row.toShip) return;
                const payload: HangarCcuPayload = {
                  from: row.fromShip,
                  to: row.toShip,
                  kind,
                  price: row.pricePaid,
                };
                e.dataTransfer.setData(HANGAR_CCU_MIME, JSON.stringify(payload));
                e.dataTransfer.effectAllowed = "copy";
              }}
              className={`bg-zinc-900/60 border border-zinc-800/60 rounded-sm overflow-hidden transition-colors ${
                draggable
                  ? "hover:border-cyan-500/40 cursor-grab active:cursor-grabbing"
                  : "opacity-50 cursor-not-allowed"
              }`}
              title={
                draggable
                  ? `Arrastrá ${titleText} al canvas`
                  : "Faltan datos en el catálogo para una de las naves"
              }
            >
              {/* Header */}
              <div className="px-2 py-1 bg-zinc-950/40 border-b border-zinc-800/40 flex items-center justify-between">
                <span className="text-[9px] font-mono uppercase tracking-wider text-zinc-400 truncate">
                  {row.isWarbond ? "Warbond" : row.location === "buyback" ? "Buyback" : "Standard"}
                </span>
                <span className="text-[10px] font-mono text-zinc-300">
                  ${row.pricePaid.toFixed(2)}
                </span>
              </div>

              {/* FROM card */}
              <div className="flex items-center gap-1.5 p-1.5">
                {row.fromShip?.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.fromShip.imageUrl}
                    alt=""
                    className="w-10 h-7 object-cover rounded-sm border border-zinc-800/60 shrink-0"
                    draggable={false}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.opacity = "0.2";
                    }}
                  />
                ) : (
                  <div className="w-10 h-7 rounded-sm bg-zinc-800/60 border border-zinc-800/60 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-zinc-200 truncate">{row.fromName}</p>
                  <p className="text-[9px] text-zinc-500 italic truncate">
                    {row.fromShip?.manufacturer ?? "—"}
                  </p>
                </div>
                <span className="text-[10px] font-mono text-zinc-400 shrink-0">
                  ${row.fromShip?.msrpUsd.toFixed(0) ?? "—"}
                </span>
              </div>

              {/* Connector */}
              <div className="px-2 py-0.5 text-center text-[9px] font-mono text-cyan-500/70 border-y border-zinc-800/40">
                ↓ Upgrade
              </div>

              {/* TO card */}
              <div className="flex items-center gap-1.5 p-1.5">
                {row.toShip?.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.toShip.imageUrl}
                    alt=""
                    className="w-10 h-7 object-cover rounded-sm border border-zinc-800/60 shrink-0"
                    draggable={false}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.opacity = "0.2";
                    }}
                  />
                ) : (
                  <div className="w-10 h-7 rounded-sm bg-zinc-800/60 border border-zinc-800/60 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-cyan-300 truncate">{row.toName}</p>
                  <p className="text-[9px] text-zinc-500 italic truncate">
                    {row.toShip?.manufacturer ?? "—"}
                  </p>
                </div>
                <span className="text-[10px] font-mono text-cyan-400 shrink-0">
                  ${row.toShip?.msrpUsd.toFixed(0) ?? "—"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
