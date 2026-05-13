"use client";

// =============================================================================
// SC LABS — useShipsCatalog hook (Chain Board P1-6, 2026-05-13)
//
// Hook compartido que centraliza el fetch a /api/ccu/ships.
// Antes 3 componentes (ChainBoardWorkspace, ChainBoardInventoryColumn,
// ChainBoardStoreColumn) hacían el mismo fetch independientemente, lo que
// causaba:
//   - 3 requests redundantes al cargar la página
//   - Posibles divergencias si el cache de Next refrescaba en distintos
//     momentos para cada uno
//   - Catch silenciosos sin logging (`.catch(() => {})`)
//
// Esta versión usa un module-level cache + una sola promesa in-flight. Si
// 3 componentes piden el catalog al mismo tiempo, una sola request sale al
// servidor. Si después un cuarto consumer monta, recibe el cache instantáneo.
// =============================================================================

import { useEffect, useState } from "react";
import { getShipThumbUrl } from "../HangarShipCard";
import type { CatalogShip } from "./types";

interface RawCatalogRow {
  id: string;
  reference?: string;
  name: string;
  manufacturer: string | null;
  msrpUsd: number;
  warbondUsd: number | null;
  flightStatus?: string | null;
  pledgeAvailability?: string | null;
}

// Module-level cache. Persiste mientras la SPA esté montada (no entre reloads).
let _cache: CatalogShip[] | null = null;
let _inflight: Promise<CatalogShip[]> | null = null;

/** Fuerza un re-fetch del catalog (descarta cache). Útil después de
 *  imports/updates que cambian el set de naves disponibles. */
export function invalidateShipsCatalog(): void {
  _cache = null;
  _inflight = null;
}

async function fetchCatalog(): Promise<CatalogShip[]> {
  if (_cache) return _cache;
  if (_inflight) return _inflight;
  _inflight = fetch("/api/ccu/ships")
    .then((r) => {
      if (!r.ok) throw new Error(`/api/ccu/ships status ${r.status}`);
      return r.json();
    })
    .then((d) => {
      const arr = Array.isArray(d?.ships) ? (d.ships as RawCatalogRow[]) : [];
      const mapped: CatalogShip[] = arr.map((x) => ({
        id: String(x.id ?? ""),
        reference: String(x.reference ?? ""),
        name: String(x.name ?? ""),
        manufacturer: x.manufacturer ?? null,
        role: x.flightStatus ?? null,
        msrpUsd: Number(x.msrpUsd) || 0,
        warbondUsd: x.warbondUsd != null ? Number(x.warbondUsd) : null,
        imageUrl: getShipThumbUrl(String(x.name ?? "")),
      }));
      _cache = mapped;
      _inflight = null;
      return mapped;
    })
    .catch((e) => {
      console.warn("[useShipsCatalog] fetch failed:", e?.message ?? e);
      _inflight = null;
      return [] as CatalogShip[];
    });
  return _inflight;
}

interface UseShipsCatalogResult {
  catalog: CatalogShip[];
  loading: boolean;
}

/** Hook: devuelve el catálogo cacheado y un flag de loading. Re-renderiza
 *  el componente cuando el fetch completa. Múltiples consumidores comparten
 *  el cache module-level (una sola request en vuelo). */
export function useShipsCatalog(): UseShipsCatalogResult {
  const [catalog, setCatalog] = useState<CatalogShip[]>(_cache ?? []);
  const [loading, setLoading] = useState<boolean>(!_cache);

  useEffect(() => {
    let cancelled = false;
    if (_cache) {
      setCatalog(_cache);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchCatalog().then((arr) => {
      if (cancelled) return;
      setCatalog(arr);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { catalog, loading };
}
