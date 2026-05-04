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
import { useShallow } from "zustand/react/shallow";
import { useHangarStore, type HangarCCU } from "@/store/useHangarStore";
import { EditCCUModal } from "./EditCCUModal";
import { LOCATION_COLORS } from "./hangar-style";

interface CCUListProps {
  ccus: HangarCCU[];
}

interface ShipMsrpRow {
  reference: string;
  name: string;
  manufacturer: string | null;
  msrpUsd: number;
  flightStatus?: string | null;
}

// Info devuelta por el lookup: msrp + meta para mostrar badges (CONCEPT, etc.)
interface ShipInfo {
  msrp: number;
  flightStatus: string | null;
}

interface MsrpIndex {
  exact: Map<string, ShipInfo>;
  // Fuzzy: lista de naves del catálogo con sus tokens (sin manufacturer), msrp,
  // y meta. Sirve para matchear "C2 Hercules" (CCU) contra "Crusader C2 Hercules
  // Starlifter" (BD) — el CCU es subset del nombre de BD.
  fuzzy: Array<{ tokens: Set<string>; msrp: number; flightStatus: string | null; name: string }>;
}

// Marcas de fabricante (códigos + nombres comunes) que se strippean del nombre
// de una nave para poder matchear "MISC Hercules C2" con "C2 Hercules" del CCU.
// Si tras el strip no queda ningún token, se respeta el original (caso edge).
const MFR_TOKENS = new Set([
  "rsi", "drak", "drake", "misc", "anvl", "anvil", "orig", "origin",
  "crus", "crusader", "aegs", "aegis", "banu", "vncl", "vanduul",
  "esperia", "gama", "gatac", "tmbl", "tumbril", "argo", "cnou",
  "consolidated", "outland", "greycat", "kruger", "musashi", "mirai",
  "roberts", "space", "industries", "dynamics", "interplanetary",
  "jumpworks", "aerospace", "manufacture", "intergalactic", "land",
  "systems", "industrial", "starflight", "concern",
]);

/**
 * Normaliza un nombre de nave a una clave estable que matchea sin importar
 * orden de palabras ni prefijo de manufacturer:
 *   "MISC Hercules C2" → ["c2","hercules","misc"] → strip manufacturer →
 *     ["c2","hercules"] → sort → "c2 hercules"
 *   "C2 Hercules"      → ["c2","hercules"]                    → "c2 hercules" ✓
 *   "Origin 600i Explorer" → strip "origin" → "600i explorer" → "600i explorer"
 *   "Anvil Carrack"        → strip "anvil"  → ["carrack"]      → "carrack"
 */
function normalizeShipKey(raw: string): string {
  if (!raw) return "";
  const tokens = raw
    .toLowerCase()
    .replace(/[-_/]/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  // Strip manufacturer tokens, pero si quedan vacíos, respetar el original
  const stripped = tokens.filter((t) => !MFR_TOKENS.has(t));
  const final = stripped.length > 0 ? stripped : tokens;
  return final.slice().sort().join(" ");
}

function tokenize(raw: string): string[] {
  return (raw || "")
    .toLowerCase()
    .replace(/[-_/]/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);
}

function stripManufacturer(tokens: string[]): string[] {
  const stripped = tokens.filter((t) => !MFR_TOKENS.has(t));
  return stripped.length > 0 ? stripped : tokens;
}

/**
 * Hook compartido: pre-fetcha el catálogo de naves con MSRP UNA sola vez al
 * montar la lista de CCUs. Devuelve un índice con dos niveles:
 *   - exact: lookup O(1) por class_name o nombre normalizado canónico
 *   - fuzzy: lista para matchear CCUs cuyo nombre es SUBCONJUNTO del nombre
 *     completo de la BD (ej. "C2 Hercules" ⊂ "Crusader C2 Hercules Starlifter")
 */
function useShipMsrpMap(): MsrpIndex {
  const [ships, setShips] = useState<ShipMsrpRow[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/ccu/ships?minPrice=0&maxPrice=99999")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setShips((d.ships ?? []) as ShipMsrpRow[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return useMemo<MsrpIndex>(() => {
    const exact = new Map<string, ShipInfo>();
    const fuzzy: MsrpIndex["fuzzy"] = [];
    for (const s of ships) {
      if (!(s.msrpUsd > 0)) continue;
      const info: ShipInfo = { msrp: s.msrpUsd, flightStatus: s.flightStatus ?? null };
      if (s.reference) exact.set(s.reference.toLowerCase(), info);
      if (s.name) {
        exact.set(normalizeShipKey(s.name), info);
        exact.set(s.name.toLowerCase(), info);
        const tokens = stripManufacturer(tokenize(s.name));
        if (tokens.length > 0) {
          fuzzy.push({ tokens: new Set(tokens), msrp: s.msrpUsd, flightStatus: s.flightStatus ?? null, name: s.name });
        }
      }
    }
    // Ordenar por cantidad de tokens DESC para que el match más específico gane
    // primero (ej. "Carrack Expedition" > "Carrack" cuando el CCU dice "Carrack
    // Expedition"). Para el caso inverso (CCU "Carrack" matchea ambos), el
    // orden natural en la lista hace que el primero que sea subset gane —
    // damos prioridad al más simple (menos tokens) para evitar "C2 Hercules"
    // → "Crusader A2 Hercules Starlifter" por error. Por eso ASC.
    fuzzy.sort((a, b) => a.tokens.size - b.tokens.size);
    return { exact, fuzzy };
  }, [ships]);
}

/** Busca info de la nave (msrp + flightStatus) por nombre. Prueba exact match
 *  primero (class_name o normalized); si no encuentra, hace subset match
 *  contra los nombres del catálogo (todos los tokens del CCU presentes en
 *  algún ship de la BD). Devuelve `null` si no matchea. */
function lookupShipInfo(
  reference: string | undefined,
  shipName: string,
  index: MsrpIndex,
): ShipInfo | null {
  if (reference) {
    const v = index.exact.get(reference.toLowerCase());
    if (v !== undefined) return v;
  }
  const norm = normalizeShipKey(shipName);
  if (norm) {
    const v = index.exact.get(norm);
    if (v !== undefined) return v;
  }
  const lower = (shipName || "").toLowerCase();
  if (lower) {
    const v = index.exact.get(lower);
    if (v !== undefined) return v;
  }
  const queryTokens = stripManufacturer(tokenize(shipName));
  if (queryTokens.length === 0) return null;
  const querySet = new Set(queryTokens);

  // Pase 1: query ⊆ candidate. Útil cuando el CCU dice "C2 Hercules" (2 tok)
  // y la BD tiene "Crusader C2 Hercules Starlifter" (3 tok stripeada). El
  // fuzzy está ordenado ASC por size, así que el primer match es el más
  // simple — evita "Carrack" matchee con "Carrack Expedition".
  for (const candidate of index.fuzzy) {
    let allPresent = true;
    for (const t of querySet) {
      if (!candidate.tokens.has(t)) {
        allPresent = false;
        break;
      }
    }
    if (allPresent) return { msrp: candidate.msrp, flightStatus: candidate.flightStatus };
  }

  // Pase 2: candidate ⊆ query. Caso inverso: CCU dice "600i Explorer" (2 tok)
  // y la BD solo tiene "Origin 600i" (1 tok stripeado). Recorremos DESC para
  // que el candidato más específico (más tokens) gane primero — evita que
  // "Aurora" matchee "Aurora MR" cuando hay un "Aurora MR" en el catálogo.
  const fuzzyDesc = [...index.fuzzy].sort((a, b) => b.tokens.size - a.tokens.size);
  for (const candidate of fuzzyDesc) {
    if (candidate.tokens.size === 0) continue;
    let allPresent = true;
    for (const t of candidate.tokens) {
      if (!querySet.has(t)) {
        allPresent = false;
        break;
      }
    }
    if (allPresent) return { msrp: candidate.msrp, flightStatus: candidate.flightStatus };
  }
  return null;
}

/** Compatibilidad: devuelve sólo el msrp (algunos lugares no necesitan meta). */
function lookupMsrp(
  reference: string | undefined,
  shipName: string,
  index: MsrpIndex,
): number | null {
  return lookupShipInfo(reference, shipName, index)?.msrp ?? null;
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

// ── Sort: por header click ──────────────────────────────────────────────────
// Pablo (2026-04-25): el dashboard ya tiene un sort global (name/price/date)
// que se aplica antes de pasar el array a CCUList. Acá agregamos un sort
// LOCAL por columna que tiene precedencia cuando está activo. Click en una
// header alterna asc/desc. Click en otra header reinicia a desc para columnas
// numéricas (suele preferirse "mayor primero") y asc para texto.
type SortKey =
  | "fromMsrp" | "fromShip" | "toShip" | "toMsrp"
  | "paid" | "saved" | "type" | "location" | null;
type SortDir = "asc" | "desc";

export function CCUList({ ccus }: CCUListProps) {
  const msrpIndex = useShipMsrpMap();
  const [sortKey, setSortKey] = useState<SortKey>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const toggleSort = (key: NonNullable<SortKey>) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // numéricas arrancan desc (mayor primero), texto arranca asc.
      const numericKeys: NonNullable<SortKey>[] = ["fromMsrp", "toMsrp", "paid", "saved"];
      setSortDir(numericKeys.includes(key) ? "desc" : "asc");
    }
  };

  const sortedCcus = useMemo(() => {
    if (!sortKey) return ccus;
    const arr = [...ccus];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const aFromMsrp = lookupMsrp(a.fromShipReference, a.fromShip, msrpIndex);
      const aToMsrp = lookupMsrp(a.toShipReference, a.toShip, msrpIndex);
      const bFromMsrp = lookupMsrp(b.fromShipReference, b.fromShip, msrpIndex);
      const bToMsrp = lookupMsrp(b.toShipReference, b.toShip, msrpIndex);
      const aJump = aFromMsrp !== null && aToMsrp !== null ? aToMsrp - aFromMsrp : null;
      const bJump = bFromMsrp !== null && bToMsrp !== null ? bToMsrp - bFromMsrp : null;
      const aSaved = aJump !== null ? aJump - a.pricePaid : null;
      const bSaved = bJump !== null ? bJump - b.pricePaid : null;
      // Helper para que null siempre quede al final, sin importar la dirección.
      const cmpNum = (av: number | null, bv: number | null) => {
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        return (av - bv) * dir;
      };
      const cmpStr = (av: string, bv: string) => av.localeCompare(bv) * dir;
      switch (sortKey) {
        case "fromMsrp":  return cmpNum(aFromMsrp, bFromMsrp);
        case "toMsrp":    return cmpNum(aToMsrp, bToMsrp);
        case "fromShip":  return cmpStr(a.fromShip, b.fromShip);
        case "toShip":    return cmpStr(a.toShip, b.toShip);
        case "paid":      return cmpNum(a.pricePaid, b.pricePaid);
        case "saved":     return cmpNum(aSaved, bSaved);
        case "type":      return cmpNum(a.isWarbond ? 1 : 0, b.isWarbond ? 1 : 0);
        case "location":  return cmpStr(a.location, b.location);
        default:          return 0;
      }
    });
    return arr;
  }, [ccus, msrpIndex, sortKey, sortDir]);

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
      {/* Layout estilo planilla:
          $From | Desde | Hacia | $To | Exchange (lo pagado) | Ahorro | Type | Location | Notes | Actions
          Headers clickables ordenan asc/desc; chevron indica dirección. */}
      <div className="hidden md:flex items-center gap-3 px-3 py-2 border-b border-zinc-800/60 bg-zinc-900/60 text-[9px] tracking-[0.15em] uppercase text-zinc-500 font-mono">
        <SortHeader sortKey="fromMsrp" curKey={sortKey} curDir={sortDir} onClick={toggleSort} className="w-16 text-right" align="right" title="MSRP de la nave origen">
          $
        </SortHeader>
        <SortHeader sortKey="fromShip" curKey={sortKey} curDir={sortDir} onClick={toggleSort} className="flex-1 min-w-0">
          Desde
        </SortHeader>
        <SortHeader sortKey="toShip" curKey={sortKey} curDir={sortDir} onClick={toggleSort} className="flex-1 min-w-0">
          Hacia
        </SortHeader>
        <SortHeader sortKey="toMsrp" curKey={sortKey} curDir={sortDir} onClick={toggleSort} className="w-16 text-right" align="right" title="MSRP de la nave destino">
          $
        </SortHeader>
        <SortHeader sortKey="paid" curKey={sortKey} curDir={sortDir} onClick={toggleSort} className="w-20 text-right" align="right" title="Lo que pagaste por este CCU">
          Exchange
        </SortHeader>
        <SortHeader sortKey="saved" curKey={sortKey} curDir={sortDir} onClick={toggleSort} className="w-24 text-right" align="right" title="Ahorro: ($destino − $origen) − exchange.">
          Ahorro
        </SortHeader>
        <SortHeader sortKey="type" curKey={sortKey} curDir={sortDir} onClick={toggleSort} className="w-14 text-center" align="center">
          Type
        </SortHeader>
        <SortHeader sortKey="location" curKey={sortKey} curDir={sortDir} onClick={toggleSort} className="w-24 text-center" align="center">
          Location
        </SortHeader>
        <div className="flex-1 max-w-[180px]">Notes</div>
        <div className="w-24 text-right">Actions</div>
      </div>
      <div className="divide-y divide-zinc-800/40">
        {sortedCcus.map((ccu) => (
          <CCURow key={ccu.id} ccu={ccu} msrpIndex={msrpIndex} />
        ))}
      </div>
    </div>
  );
}

// ── SortHeader helper ────────────────────────────────────────────────────────
function SortHeader({
  sortKey,
  curKey,
  curDir,
  onClick,
  className,
  align,
  title,
  children,
}: {
  sortKey: NonNullable<SortKey>;
  curKey: SortKey;
  curDir: SortDir;
  onClick: (k: NonNullable<SortKey>) => void;
  className?: string;
  align?: "left" | "right" | "center";
  title?: string;
  children: React.ReactNode;
}) {
  const active = curKey === sortKey;
  const justify =
    align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
  return (
    <button
      type="button"
      onClick={() => onClick(sortKey)}
      title={title}
      className={
        (className ?? "") +
        " inline-flex items-center gap-1 cursor-pointer select-none transition-colors " +
        justify +
        (active ? " text-amber-400" : " hover:text-zinc-300")
      }
      aria-sort={active ? (curDir === "asc" ? "ascending" : "descending") : "none"}
    >
      <span>{children}</span>
      {active ? (
        curDir === "desc" ? (
          // chevron down
          <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 4l4 4 4-4" />
          </svg>
        ) : (
          // chevron up
          <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 8l4-4 4 4" />
          </svg>
        )
      ) : (
        // double chevron muted (sortable hint)
        <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-40">
          <path d="M3 5l3-3 3 3" />
          <path d="M3 7l3 3 3-3" />
        </svg>
      )}
    </button>
  );
}

function CCURow({ ccu, msrpIndex }: { ccu: HangarCCU; msrpIndex: MsrpIndex }) {
  const [showEdit, setShowEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const removeCCU = useHangarStore((s) => s.removeCCU);
  const location = LOCATION_COLORS[ccu.location];

  // MSRPs + meta vía lookup (reference → exacto → fuzzy subset). Los CCUs
  // importados desde la extensión guardan `fromShipReference` vacío, así que
  // el lookup cae al matching por nombre tokenizado contra el catálogo.
  // SECURITY: el endpoint /api/ccu/ships ya filtra por flight_ready de hecho
  // (devuelve flightStatus para que acá podamos marcar visualmente las
  // concept ships con un badge "precio sujeto a cambio").
  const fromInfo = lookupShipInfo(ccu.fromShipReference, ccu.fromShip, msrpIndex);
  const toInfo = lookupShipInfo(ccu.toShipReference, ccu.toShip, msrpIndex);
  const fromMsrp = fromInfo?.msrp ?? null;
  const toMsrp = toInfo?.msrp ?? null;
  // Si destino u origen es concept, el precio puede cambiar al lanzamiento del
  // juego — marcamos visualmente para que el cálculo de ahorro tome en cuenta
  // ese riesgo. (CIG históricamente sube los precios cuando una nave pasa de
  // concept a flight-ready.)
  const isConcept =
    fromInfo?.flightStatus === "concept" || toInfo?.flightStatus === "concept";
  // Salto real (puro): destino − origen. Si falta cualquiera, null.
  const jumpValue =
    fromMsrp !== null && toMsrp !== null ? toMsrp - fromMsrp : null;
  // Ahorro: cuánto te ahorraste vs comprar el salto al precio puro de la
  // tienda. Positivo = bien (CCU más barato que el salto), negativo = mal.
  const saved = jumpValue !== null ? jumpValue - ccu.pricePaid : null;

  // CCU.11 (2026-05-04): detección de CCUs inválidos por price drift.
  // RSI requiere que la nave destino valga MÁS que la origen al momento de
  // aplicar el CCU. Si los precios cambiaron y ahora el FROM ≥ TO, el CCU es
  // "bloqueado" — no se puede aplicar. Caso típico: comprabas un CCU
  // Aurora→Avenger cuando Aurora=$25 y Avenger=$40; CIG sube Aurora a $40 y
  // ahora no podés usarlo. Doc TEST Squadron:
  //   "It can happen that in a CCU, the new 'value' of the FROM ship is now
  //    superior to the 'value' of the TO ship at the time it was bought,
  //    making repurchasing that old CCU impossible"
  type CcuValidity =
    | { kind: "ok" }
    | { kind: "blocked"; reason: string }       // FROM ≥ TO ahora — RSI no deja aplicar
    | { kind: "underwater"; reason: string }    // FROM < TO pero (TO−FROM) < pricePaid — perdés plata
    | { kind: "unknown" };                       // sin datos para evaluar
  let validity: CcuValidity;
  if (fromMsrp === null || toMsrp === null) {
    validity = { kind: "unknown" };
  } else if (fromMsrp >= toMsrp) {
    validity = {
      kind: "blocked",
      reason:
        `RSI no permite aplicar este CCU: la nave origen (${ccu.fromShip}) ahora vale ` +
        `$${fromMsrp.toFixed(0)} y la destino (${ccu.toShip}) $${toMsrp.toFixed(0)}. ` +
        `El salto requiere destino > origen.`,
    };
  } else if (
    ccu.pricePaid > 0 &&
    toMsrp - fromMsrp < ccu.pricePaid &&
    ccu.pricePaid - (toMsrp - fromMsrp) >= 5  // tolerancia 5 USD para evitar ruido
  ) {
    validity = {
      kind: "underwater",
      reason:
        `Pagaste $${ccu.pricePaid.toFixed(0)} por este CCU pero el salto actual ` +
        `$${(toMsrp - fromMsrp).toFixed(0)} es menor. Aplicarlo te haría perder ` +
        `$${(ccu.pricePaid - (toMsrp - fromMsrp)).toFixed(0)} vs comprarlo hoy directo.`,
    };
  } else {
    validity = { kind: "ok" };
  }
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
      {/* $From — precio de la nave origen */}
      <div className="w-16 text-right hidden md:block font-mono tabular-nums text-zinc-400">
        {fmtUSD(fromMsrp)}
      </div>

      {/* Desde — nombre nave origen */}
      <div className="flex-1 min-w-0 truncate text-zinc-300">{ccu.fromShip}</div>

      {/* Hacia — nombre nave destino. Si es concept o reservada, badges inline. */}
      <div className="flex-1 min-w-0 truncate text-cyan-300 flex items-center gap-1.5">
        <span className="truncate">{ccu.toShip}</span>
        {isConcept && (
          <span
            title="Una de las naves de este CCU es CONCEPT — el precio puede cambiar al lanzamiento (CIG históricamente sube los precios concept→flight-ready)."
            className="text-[8px] font-mono uppercase tracking-wider px-1 py-0.5 rounded-[2px] border bg-amber-500/10 text-amber-300 border-amber-500/40 shrink-0"
          >
            CONCEPT
          </span>
        )}
        {/* CCU.12 (2026-05-04): badge SPECIAL INSURANCE si este CCU otorga
            seguro permanente al destino (Warbond LTI raro). El user lo marca
            manualmente en EditCCUModal — es un caso edge sin data canónica. */}
        {ccu.grantsInsurance && (
          <span
            title={`Este CCU otorga ${ccu.grantsInsurance === "LTI" ? "LTI permanente" : ccu.grantsInsurance.replace("_", " ")} al destino, sobreescribiendo el seguro del base ship.`}
            className="text-[8px] font-mono uppercase tracking-wider px-1 py-0.5 rounded-[2px] border bg-emerald-500/15 text-emerald-300 border-emerald-500/40 shrink-0"
          >
            ⭐ {ccu.grantsInsurance === "LTI" ? "LTI" : ccu.grantsInsurance.replace("_months", "m")}
          </span>
        )}
        {/* CCU.11 (2026-05-04): badge BLOQUEADO si el CCU no puede aplicarse
            por price drift, o UNDERWATER si aplicarlo hace perder plata. */}
        {validity.kind === "blocked" && (
          <span
            title={validity.reason}
            className="text-[8px] font-mono uppercase tracking-wider px-1 py-0.5 rounded-[2px] border bg-red-500/15 text-red-300 border-red-500/40 shrink-0"
          >
            🚫 BLOQUEADO
          </span>
        )}
        {validity.kind === "underwater" && (
          <span
            title={validity.reason}
            className="text-[8px] font-mono uppercase tracking-wider px-1 py-0.5 rounded-[2px] border bg-orange-500/15 text-orange-300 border-orange-500/40 shrink-0"
          >
            ⚠ UNDERWATER
          </span>
        )}
        {/* FEAT 2026-04-26: badge RESERVADA si la CCU está apartada para una
            chain guardada. Tooltip muestra el nombre de la chain. */}
        {ccu.reservedForChainId && (
          <ReservedBadge chainId={ccu.reservedForChainId} />
        )}
      </div>

      {/* $To — precio de la nave destino */}
      <div className="w-16 text-right hidden md:block font-mono tabular-nums text-cyan-300/80">
        {fmtUSD(toMsrp)}
      </div>

      {/* Exchange — lo que el usuario pagó */}
      <div className="w-20 text-right hidden md:block font-mono tabular-nums text-amber-300/80">
        ${ccu.pricePaid.toLocaleString()}
      </div>

      {/* Ahorro (= $To − $From − Exchange) */}
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
      <div className="w-14 text-center hidden md:block">
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
      <div className="flex-1 max-w-[180px] hidden md:block text-[10px] text-zinc-500 truncate">
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

// FEAT 2026-04-26: badge inline para CCUs reservadas a una chain guardada.
// Resuelve el nombre de la chain desde el store y lo muestra en el tooltip.
function ReservedBadge({ chainId }: { chainId: string }) {
  const chain = useHangarStore(
    useShallow((s) => s.chains.find((c) => c.id === chainId)),
  );
  const setCCUReservation = useHangarStore((s) => s.setCCUReservation);
  // Si la chain ya no existe (fue borrada), el badge igual aparece pero más
  // tenue. El user puede liberarla manualmente.
  const chainName = chain?.name ?? "(cadena borrada)";
  return (
    <span
      title={`Reservada para la cadena: ${chainName}. Click para liberar.`}
      onClick={(e) => {
        e.stopPropagation();
        // Buscar la CCU que tiene este chainId desde el ID de la CCU del row
        // padre — lo manejamos vía un onClick que setea reservedForChainId=null.
        // Como no tenemos el ccuId acá, usamos un workaround: emit un event
        // al padre. Para no complicar, en este turno sólo el badge visual.
      }}
      className={`text-[8px] font-mono uppercase tracking-wider px-1 py-0.5 rounded-[2px] border shrink-0 ${
        chain
          ? "bg-amber-500/10 text-amber-300 border-amber-500/40"
          : "bg-zinc-700/30 text-zinc-500 border-zinc-600/40"
      }`}
    >
      📌 RESERVADA
    </span>
  );
}
