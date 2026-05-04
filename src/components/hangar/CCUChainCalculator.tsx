"use client";

// =============================================================================
// AL FILO — CCU Chain Calculator v1
//
// Visual CCU upgrade chain calculator with:
//   - Ship selection (From / To) with search + MSRP display
//   - Automatic cheapest-path calculation via Dijkstra
//   - Visual step-by-step chain display (timeline)
//   - Integration with user's owned CCUs from hangar store
//   - Warbond preference toggle
//   - Savings summary (vs direct upgrade)
//   - Alternative paths display
// =============================================================================

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useHangarStore, type HangarCCU, type HangarShip, type CCUChainStep, type InsuranceType } from "@/store/useHangarStore";
import type { ChainResult, ChainStep, PriceType, CostBreakdown, PaymentPriority } from "@/lib/ccu-engine";
// CCU.4 (2026-05-03): policy global persistida en localStorage para restringir
// el solver. Incluir = waypoints obligatorios; Excluir = ships globalmente prohibidos.
import {
  useChainPolicy,
  addForceInclude,
  removeForceInclude,
  addForceExclude,
  removeForceExclude,
  clearForceInclude,
  clearForceExclude,
} from "@/lib/ccuChainPolicy";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ShipOption {
  id: string;
  reference: string;
  name: string;
  manufacturer: string | null;
  msrpUsd: number;
  warbondUsd: number | null;
  isLimited: boolean;
  flightStatus: string;
  size: string | null;
  role: string | null;
}

// ─── Ship Search Dropdown ───────────────────────────────────────────────────

function ShipSearchSelect({
  label,
  value,
  onChange,
  ships,
  excludeId,
  filterFn,
}: {
  label: string;
  value: ShipOption | null;
  onChange: (ship: ShipOption | null) => void;
  ships: ShipOption[];
  excludeId?: string;
  filterFn?: (ship: ShipOption) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = useMemo(() => {
    let list = ships;
    if (excludeId) list = list.filter(s => s.id !== excludeId);
    if (filterFn) list = list.filter(filterFn);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.manufacturer?.toLowerCase().includes(q) ||
        s.reference.toLowerCase().includes(q)
      );
    }
    return list.slice(0, 50); // Limit results for performance
  }, [ships, excludeId, filterFn, search]);

  return (
    <div ref={panelRef} className="relative">
      <label className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5">{label}</label>
      <button
        onClick={() => { setOpen(!open); setTimeout(() => inputRef.current?.focus(), 50); }}
        className={`w-full text-left px-3 py-2.5 rounded-sm border transition-all duration-200
          ${value
            ? "bg-zinc-800/60 border-zinc-700/50 text-zinc-100"
            : "bg-zinc-900/60 border-zinc-800/50 text-zinc-500"
          }
          hover:border-amber-500/40 focus:border-amber-500/50`}
      >
        {value ? (
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium truncate">{value.name}</span>
            <span className="text-xs text-amber-400 font-mono ml-2">${value.msrpUsd.toLocaleString()}</span>
          </div>
        ) : (
          <span className="text-sm">Select ship...</span>
        )}
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700/60 rounded-sm shadow-2xl max-h-72 overflow-hidden">
          <div className="p-2 border-b border-zinc-800/50">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ships..."
              className="w-full px-2.5 py-1.5 bg-zinc-800/80 border border-zinc-700/40 rounded-sm text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50"
            />
          </div>
          <div className="overflow-y-auto max-h-56">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-xs text-zinc-600 text-center">No ships found</div>
            ) : (
              filtered.map((ship) => (
                <button
                  key={ship.id}
                  onClick={() => { onChange(ship); setOpen(false); setSearch(""); }}
                  className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-zinc-800/60 transition-colors border-b border-zinc-800/20
                    ${value?.id === ship.id ? "bg-amber-500/10" : ""}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-zinc-200 truncate">{ship.name}</p>
                    <p className="text-[10px] text-zinc-500">{ship.manufacturer} · {ship.size || "?"} · {ship.role || "Multi"}</p>
                  </div>
                  <div className="text-right ml-2 flex-shrink-0">
                    <p className="text-xs text-amber-400 font-mono">${ship.msrpUsd.toLocaleString()}</p>
                    {ship.warbondUsd && (
                      <p className="text-[10px] text-emerald-400 font-mono">${ship.warbondUsd.toLocaleString()} WB</p>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Availability badge helpers (CCU.6, 2026-05-03) ────────────────────────
// Categoriza el `pledge_availability` raw del Wiki en 3 buckets visuales:
//   "available" → ✓ verde (no se muestra badge, es el default esperado)
//   "limited"   → 🕒 ámbar — solo en eventos (Time-limited / Quantity-limited)
//   "unavailable" → 🚫 rojo — no se vende hoy (Reward-only, Out of production,
//                              Limited edition discontinued, etc.)
//   "unknown"   → sin badge (data faltante en ship_prices_canonical, no
//                            asumimos nada; el solver igual usa el cap teórico)
type AvailabilityCategory = "available" | "limited" | "unavailable" | "unknown";

function categorizeAvailability(raw: string | null | undefined): AvailabilityCategory {
  if (!raw) return "unknown";
  const r = raw.toLowerCase();
  if (r === "always available") return "available";
  if (r.includes("time-limited") || r === "time limited" || r.includes("quantity-limited")) {
    return "limited";
  }
  // Cualquier flavor de "limited edition", "reward", "not available", "out of
  // production", "no longer available", "promotion only" → no comprable hoy.
  if (
    r.includes("limited edition") ||
    r.includes("reward") ||
    r.includes("not available") ||
    r.includes("out of production") ||
    r.includes("no longer available") ||
    r.includes("promotion") ||
    r.includes("limited availability")
  ) {
    return "unavailable";
  }
  return "unknown";
}

function AvailabilityBadge({ raw, compact = false }: { raw: string | null | undefined; compact?: boolean }) {
  const cat = categorizeAvailability(raw);
  if (cat === "available" || cat === "unknown") return null; // no badge
  const isLimited = cat === "limited";
  const icon = isLimited ? "🕒" : "🚫";
  const cls = isLimited
    ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
    : "bg-red-500/15 text-red-400 border-red-500/30";
  const label = isLimited ? "EVENTO" : "NO DISPONIBLE";
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border ${cls}`}
      title={raw ?? undefined}
    >
      <span>{icon}</span>
      {!compact && <span>{label}</span>}
    </span>
  );
}

// ─── Insurance projection helpers (CCU.9 + CCU.10 + CCU.14, 2026-05-04) ────
// RSI rule (TEST Squadron FAQ + ORONST CCU Bible 2026):
//
//   "The insurance of the base ship is the ONLY insurance that carries forward.
//    If you build a $600 Carrack from a $40 Aurora, your Carrack will only have
//    6 months of insurance."
//
// Y al meltear:
//
//   "By melting a CCUed ship... you get the token ship back in your buybacks
//    and the equivalent of what was spent on the upgraded ship... in store
//    credits. The token retains its original insurance."
//
// O sea: SOLO el seguro del base ship llega al final, los CCUs intermedios
// (incluso si son Warbond LTI) NO suman seguro permanente — son aditivos sólo
// mientras existe la nave armada. Si meltás, perdés todo lo intermedio.
// Excepción rara: Warbond CCUs con LTI/10-year explícitos pueden sobrescribir
// (Nomad LTI Warbond, IAE 10-year). No hay flag canónico en BD para detectarlos
// fielmente, así que mostramos disclaimer pero no asumimos.

const INSURANCE_RANK: Record<InsuranceType, number> = {
  LTI: 100,
  "120_months": 80,
  "72_months": 60,
  "48_months": 50,
  "24_months": 40,
  "6_months": 20,
  "3_months": 10,
  unknown: 0,
};

function insuranceLabel(t: InsuranceType): string {
  switch (t) {
    case "LTI": return "LTI (Lifetime)";
    case "120_months": return "10 años";
    case "72_months": return "6 años";
    case "48_months": return "4 años";
    case "24_months": return "2 años";
    case "6_months": return "6 meses";
    case "3_months": return "3 meses";
    default: return "Desconocido";
  }
}

function insuranceColor(t: InsuranceType): { text: string; bg: string; border: string } {
  if (t === "LTI") {
    return { text: "text-emerald-300", bg: "bg-emerald-500/10", border: "border-emerald-500/40" };
  }
  if (t === "120_months") {
    return { text: "text-cyan-300", bg: "bg-cyan-500/10", border: "border-cyan-500/40" };
  }
  if (t === "72_months" || t === "48_months" || t === "24_months") {
    return { text: "text-amber-300", bg: "bg-amber-500/10", border: "border-amber-500/40" };
  }
  if (t === "6_months" || t === "3_months") {
    return { text: "text-red-300", bg: "bg-red-500/10", border: "border-red-500/40" };
  }
  return { text: "text-zinc-300", bg: "bg-zinc-800/40", border: "border-zinc-700/50" };
}

// Localiza la HangarShip que corresponde al base ship seleccionado.
// El `fromShip.name` puede venir con sufijo " (Hangar · LTI)" cuando se eligió
// desde Mi Flota — lo strippeamos para matchear contra hs.shipName.
function findBaseHangarShip(
  fromShip: ShipOption | null,
  fromSource: "store" | "fleet",
  hangarShips: HangarShip[],
): HangarShip | null {
  if (!fromShip || fromSource !== "fleet") return null;
  const cleanName = fromShip.name.replace(/\s*\([^)]+\)\s*$/, "").trim().toLowerCase();
  return (
    hangarShips.find((hs) => hs.shipName.toLowerCase() === cleanName) ??
    hangarShips.find((hs) => cleanName.endsWith(hs.shipName.toLowerCase())) ??
    null
  );
}

// ─── Insurance Projection Panel (CCU.9 + CCU.10 + CCU.14) ──────────────────

function InsuranceProjectionPanel({
  fromShip,
  fromSource,
  hangarShips,
  chain,
  ownedCCUs,
}: {
  fromShip: ShipOption | null;
  fromSource: "store" | "fleet";
  hangarShips: HangarShip[];
  chain: ChainResult;
  ownedCCUs: HangarCCU[];
}) {
  const baseShip = findBaseHangarShip(fromShip, fromSource, hangarShips);
  const baseInsurance: InsuranceType | "store-purchase" =
    fromSource === "store" ? "store-purchase" : (baseShip?.insuranceType ?? "unknown");

  // CCU.12 (2026-05-04): buscar si algún step del chain usa una CCU OWNED
  // del usuario marcada con `grantsInsurance` (Warbond LTI especial). Si hay
  // varias, gana la de mayor rank (LTI > 120m > etc.). Esa override reemplaza
  // el seguro del base.
  const overrideInsurance: InsuranceType | null = useMemo(() => {
    let best: InsuranceType | null = null;
    let bestRank = -1;
    for (const step of chain.steps) {
      // Solo CCUs owned tienen grantsInsurance — los CCUs comprados nuevos no
      // sabemos si son especiales hasta que se importan al hangar. Match por
      // par from/to ship name (heurística simple — coincide con cómo se
      // hidrata `ownedCCUs` en el solver).
      const owned = ownedCCUs.find(
        (c) =>
          c.fromShip.toLowerCase() === step.fromShip.name.toLowerCase() &&
          c.toShip.toLowerCase() === step.toShip.name.toLowerCase() &&
          c.grantsInsurance,
      );
      if (owned?.grantsInsurance) {
        const rank = INSURANCE_RANK[owned.grantsInsurance];
        if (rank > bestRank) {
          best = owned.grantsInsurance;
          bestRank = rank;
        }
      }
    }
    return best;
  }, [chain.steps, ownedCCUs]);

  // Insurance final efectivo: el override gana sobre el base si es mejor.
  const baseRank = baseInsurance === "store-purchase" ? -1 : INSURANCE_RANK[baseInsurance];
  const overrideRank = overrideInsurance ? INSURANCE_RANK[overrideInsurance] : -1;
  const effectiveInsurance: InsuranceType | "store-purchase" =
    overrideInsurance && overrideRank > baseRank ? overrideInsurance : baseInsurance;
  const overrideApplied = overrideInsurance !== null && overrideRank > baseRank;

  const isLti = effectiveInsurance === "LTI";
  const isShortInsurance =
    effectiveInsurance === "6_months" || effectiveInsurance === "3_months";
  const isStorePurchase = effectiveInsurance === "store-purchase";
  const isUnknown = effectiveInsurance === "unknown";

  // Para mostrar un sample LTI token sugerido (CCU.14)
  const suggestLtiToken = !isLti && (isShortInsurance || isStorePurchase || isUnknown);

  return (
    <div className="space-y-3">
      {/* CCU.9: banner principal de seguro proyectado */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Cuadro de seguro proyectado */}
        {effectiveInsurance !== "store-purchase" ? (
          <div className={`rounded-sm border ${insuranceColor(effectiveInsurance).border} ${insuranceColor(effectiveInsurance).bg} px-3 py-2.5`}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">🛡️</span>
              <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">
                Seguro al final de la cadena
              </span>
              {overrideApplied && (
                <span className="text-[8px] font-mono uppercase tracking-wider px-1 py-0.5 rounded-[2px] border bg-emerald-500/15 text-emerald-300 border-emerald-500/40">
                  ⭐ override CCU
                </span>
              )}
            </div>
            <p className={`text-base font-bold ${insuranceColor(effectiveInsurance).text}`}>
              {insuranceLabel(effectiveInsurance)}
            </p>
            {overrideApplied ? (
              <p className="text-[10px] text-zinc-500 mt-1 leading-snug">
                Override por <span className="text-emerald-300">CCU especial</span> en la cadena
                ({insuranceLabel(overrideInsurance!)}). Sobrescribe el seguro del base{" "}
                {baseShip && <span className="text-zinc-300">{baseShip.shipName}</span>}{" "}
                ({insuranceLabel(baseInsurance as InsuranceType)}).
              </p>
            ) : baseShip ? (
              <p className="text-[10px] text-zinc-500 mt-1 leading-snug">
                Heredado del base <span className="text-zinc-300">{baseShip.shipName}</span>.
                Los CCUs intermedios <strong>no suman</strong> seguro permanente.
              </p>
            ) : (
              <p className="text-[10px] text-zinc-500 mt-1 leading-snug">
                No tenemos info del base — podés marcar el seguro en Mi Flota.
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-sm border border-zinc-700/60 bg-zinc-900/40 px-3 py-2.5">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">🛡️</span>
              <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">
                Seguro al final de la cadena
              </span>
            </div>
            <p className="text-base font-bold text-zinc-300">
              Depende del base que compres
            </p>
            <p className="text-[10px] text-zinc-500 mt-1 leading-snug">
              Estás partiendo de la tienda. El seguro de la nave final será el del{" "}
              <strong>base ship</strong> que adquieras (típicamente 6 meses, salvo Warbond LTI).
            </p>
          </div>
        )}

        {/* CCU.10: warning de melt */}
        <div className="rounded-sm border border-orange-500/30 bg-orange-500/5 px-3 py-2.5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">⚠</span>
            <span className="text-[10px] font-mono uppercase tracking-widest text-orange-300">
              Si meltás esta nave después
            </span>
          </div>
          <p className="text-[11px] text-zinc-300 leading-snug">
            Recuperás <strong>solo el token base</strong>{baseShip ? ` (${baseShip.shipName})` : ""} al
            buyback con su seguro original.{" "}
            {chain.steps.length > 0 && (
              <>
                Los <strong>{chain.steps.length} CCUs</strong> intermedios se devuelven como{" "}
                <span className="text-violet-300">store credit al precio actual</span> (no al precio
                pagado), y la nave armada se pierde.
              </>
            )}
          </p>
        </div>
      </div>

      {/* CCU.14: tip de LTI token strategy */}
      {suggestLtiToken && (
        <div className="rounded-sm border border-cyan-500/30 bg-cyan-500/5 px-3 py-2 flex items-start gap-2">
          <span className="text-base mt-0.5">💡</span>
          <div className="text-[11px] text-zinc-300 leading-snug flex-1">
            <strong className="text-cyan-300">Tip:</strong> Para que esta cadena termine con{" "}
            <span className="text-emerald-300">LTI permanente</span>, considerá empezar desde un{" "}
            <strong>base con LTI</strong> — los más usados son{" "}
            <span className="text-zinc-100">C8X Pisces Warbond</span>,{" "}
            <span className="text-zinc-100">Aurora MR Warbond LTI</span> o{" "}
            <span className="text-zinc-100">Mustang Alpha Warbond LTI</span> (típicamente $35–$50,
            disponibles en IAE / Invictus / Foundation Festival).
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Chain Step Visual ──────────────────────────────────────────────────────

function ChainStepCard({ step, index, isLast }: { step: ChainStep; index: number; isLast: boolean }) {
  const priceColor =
    step.priceType === "hangar" ? "text-emerald-400" :
    step.priceType === "buyback-token" ? "text-violet-400" :
    step.priceType === "buyback-cash" ? "text-orange-400" :
    step.priceType === "warbond" ? "text-cyan-400" :
    "text-zinc-300";

  const priceBg =
    step.priceType === "hangar" ? "bg-emerald-500/10 border-emerald-500/20" :
    step.priceType === "buyback-token" ? "bg-violet-500/10 border-violet-500/20" :
    step.priceType === "buyback-cash" ? "bg-orange-500/10 border-orange-500/20" :
    step.priceType === "warbond" ? "bg-cyan-500/10 border-cyan-500/20" :
    "bg-zinc-800/40 border-zinc-700/30";

  const priceLabel =
    step.priceType === "hangar" ? "HANGAR" :
    step.priceType === "buyback-token" ? "BUYBACK (CRÉDITOS)" :
    step.priceType === "buyback-cash" ? "BUYBACK (EFECTIVO)" :
    step.priceType === "warbond" ? "WARBOND" :
    "STANDARD";

  const paymentIcon =
    step.paymentMethod === "none" ? "✓" :
    step.paymentMethod === "credits" ? "SC$" :
    "$";

  return (
    <div className="relative flex items-stretch">
      {/* Timeline connector */}
      <div className="flex flex-col items-center mr-4 flex-shrink-0">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
          step.priceType === "hangar"
            ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-400"
            : step.priceType === "buyback-token"
              ? "border-violet-500/60 bg-violet-500/15 text-violet-400"
              : step.priceType === "buyback-cash"
                ? "border-orange-500/60 bg-orange-500/15 text-orange-400"
                : step.priceType === "warbond"
                  ? "border-cyan-500/60 bg-cyan-500/15 text-cyan-400"
                  : "border-amber-500/60 bg-amber-500/15 text-amber-400"
        }`}>
          {index + 1}
        </div>
        {!isLast && (
          <div className="w-[2px] flex-1 bg-gradient-to-b from-zinc-600/50 to-zinc-800/30 my-1" />
        )}
      </div>

      {/* Step content */}
      <div className={`flex-1 rounded-sm border ${priceBg} p-3 mb-3`}>
        <div className="flex items-center justify-between gap-3">
          {/* From → To */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-zinc-300 font-medium truncate">{step.fromShip.name}</span>
              <svg className="w-4 h-4 text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
              <span className="text-[13px] text-zinc-100 font-semibold truncate">{step.toShip.name}</span>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                step.priceType === "hangar" ? "bg-emerald-500/20 text-emerald-400" :
                step.priceType === "buyback-token" ? "bg-violet-500/20 text-violet-400" :
                step.priceType === "buyback-cash" ? "bg-orange-500/20 text-orange-400" :
                step.priceType === "warbond" ? "bg-cyan-500/20 text-cyan-400" :
                "bg-zinc-700/30 text-zinc-400"
              }`}>
                {priceLabel}
              </span>
              {step.savingsVsStandard > 0 && (
                <span className="text-[10px] text-emerald-400">
                  Save ${step.savingsVsStandard.toFixed(2)}
                </span>
              )}
              {/* CCU.6: badge de disponibilidad del target. Sólo aparece si el
                  target NO es Always available (el caso bueno default). */}
              <AvailabilityBadge raw={step.targetAvailability} />
            </div>
          </div>

          {/* Price */}
          <div className="text-right flex-shrink-0">
            <p className={`text-lg font-mono font-bold ${priceColor}`}>
              {step.priceType === "hangar" ? (
                <span title={`Ya pagado: $${step.pricePaid.toFixed(2)}`}>$0</span>
              ) : (
                <span>{paymentIcon}{step.effectivePrice.toFixed(2)}</span>
              )}
            </p>
            {step.priceType === "hangar" && step.pricePaid > 0 && (
              <p className="text-[10px] text-emerald-500/60 font-mono">
                Ya pagado: ${step.pricePaid.toFixed(2)}
              </p>
            )}
            {step.priceType !== "standard" && step.priceType !== "hangar" && step.standardPrice !== step.effectivePrice && (
              <p className="text-[10px] text-zinc-500 line-through font-mono">
                ${step.standardPrice.toFixed(2)}
              </p>
            )}
          </div>
        </div>

        {/* Ship value comparison bar */}
        <div className="mt-2 pt-2 border-t border-zinc-700/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Valor Tienda</span>
              <span className="text-xs text-zinc-400 font-mono">${step.targetMsrp.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Te sale</span>
              <span className="text-xs text-amber-400 font-mono font-semibold">${step.acquiredCost.toFixed(2)}</span>
            </div>
            {step.savingsVsMsrp > 0 && (
              <span className="text-[10px] text-emerald-400 font-mono font-medium">
                -{((step.savingsVsMsrp / step.targetMsrp) * 100).toFixed(0)}%
              </span>
            )}
          </div>
          {step.savingsVsMsrp > 0 && (
            <div className="mt-1 w-full bg-zinc-800/60 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500/60 to-emerald-400/40 rounded-full transition-all"
                style={{ width: `${Math.min(100, ((step.targetMsrp - step.savingsVsMsrp) / step.targetMsrp) * 100)}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Savings Summary ────────────────────────────────────────────────────────

function SavingsSummary({ chain }: { chain: ChainResult }) {
  const savingsPercent = chain.directUpgradeCost > 0
    ? ((chain.totalSavingsVsDirect / chain.directUpgradeCost) * 100).toFixed(1)
    : "0";

  const bd = chain.costBreakdown;

  // CCU.6 (2026-05-03): contar steps por categoría de availability para el
  // badge global. "limited" = espera evento; "unavailable" = no comprable hoy.
  const availCounts = chain.steps.reduce(
    (acc, s) => {
      const cat = categorizeAvailability(s.targetAvailability);
      acc[cat] = (acc[cat] ?? 0) + 1;
      return acc;
    },
    { available: 0, limited: 0, unavailable: 0, unknown: 0 } as Record<AvailabilityCategory, number>,
  );
  const totalSteps = chain.steps.length;
  const blockingSteps = availCounts.unavailable;
  const eventSteps   = availCounts.limited;
  const completable  = blockingSteps === 0 && eventSteps === 0;

  return (
    <div className="space-y-4">
      {/* CCU.6: Badge global de disponibilidad — "Completable hoy" si todos los
          steps son Always available; "Requiere evento" si hay limited;
          "No completable" si hay unavailable. */}
      <div className={`rounded-sm border px-3 py-2 flex items-center gap-3 text-[12px] ${
        completable
          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
          : blockingSteps > 0
            ? "bg-red-500/10 border-red-500/30 text-red-300"
            : "bg-amber-500/10 border-amber-500/30 text-amber-300"
      }`}>
        <span className="text-base">{completable ? "✓" : blockingSteps > 0 ? "🚫" : "🕒"}</span>
        <span className="flex-1 font-medium">
          {completable && "Cadena completable hoy — todos los pasos están a la venta."}
          {!completable && blockingSteps > 0 && (
            <>
              {blockingSteps} {blockingSteps === 1 ? "paso requiere" : "pasos requieren"} naves no disponibles hoy
              {eventSteps > 0 && <> · {eventSteps} {eventSteps === 1 ? "paso solo" : "pasos solo"} en evento</>}
              {" · cadena teórica"}
            </>
          )}
          {!completable && blockingSteps === 0 && eventSteps > 0 && (
            <>
              {eventSteps} {eventSteps === 1 ? "paso solo se vende" : "pasos solo se venden"} en eventos (Time-limited).
              Vas a tener que esperar al próximo IAE / Invictus para completarla.
            </>
          )}
        </span>
        <span className="text-[10px] opacity-70">
          {availCounts.available}/{totalSteps} ✓
          {eventSteps > 0 && ` · ${eventSteps} 🕒`}
          {blockingSteps > 0 && ` · ${blockingSteps} 🚫`}
        </span>
      </div>

      {/* Cost breakdown: Efectivo / Créditos / En Hangar */}
      {/* Móvil: apilado vertical (cada tarjeta ocupa todo el ancho).
          sm+ (>=640px): las 3 tarjetas lado a lado como en desktop. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-zinc-900/60 border border-amber-500/30 rounded-sm p-3">
          <p className="text-[10px] text-amber-400 uppercase tracking-widest">Efectivo Necesario</p>
          <p className="text-xl font-mono font-bold text-amber-400 mt-1">${bd.cashTotal.toFixed(2)}</p>
          <p className="text-[10px] text-zinc-500 mt-1">
            {bd.warbondCount > 0 && <span className="text-cyan-400">{bd.warbondCount} WB</span>}
            {bd.warbondCount > 0 && bd.standardCount > 0 && " · "}
            {bd.standardCount > 0 && <span>{bd.standardCount} STD</span>}
            {bd.buybackCashCount > 0 && " · "}
            {bd.buybackCashCount > 0 && <span className="text-orange-400">{bd.buybackCashCount} BB</span>}
          </p>
        </div>
        <div className="bg-zinc-900/60 border border-violet-500/30 rounded-sm p-3">
          <p className="text-[10px] text-violet-400 uppercase tracking-widest">Créditos (Buyback)</p>
          <p className="text-xl font-mono font-bold text-violet-400 mt-1">${bd.creditsTotal.toFixed(2)}</p>
          {bd.buybackTokenCount > 0 && (
            <p className="text-[10px] text-zinc-500 mt-1">{bd.buybackTokenCount} CCU con token</p>
          )}
        </div>
        <div className="bg-zinc-900/60 border border-emerald-500/30 rounded-sm p-3">
          <p className="text-[10px] text-emerald-400 uppercase tracking-widest">Ya en Hangar</p>
          <p className="text-xl font-mono font-bold text-emerald-400 mt-1">${bd.hangarValue.toFixed(2)}</p>
          {bd.hangarCount > 0 && (
            <p className="text-[10px] text-zinc-500 mt-1">{bd.hangarCount} CCU listos para aplicar</p>
          )}
        </div>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-zinc-900/60 border border-zinc-800/50 rounded-sm p-3">
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Costo Total Cadena</p>
          <p className="text-xl font-mono font-bold text-amber-400 mt-1">${chain.totalCost.toFixed(2)}</p>
        </div>
        <div className="bg-zinc-900/60 border border-zinc-800/50 rounded-sm p-3">
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest">CCU Directo</p>
          <p className="text-xl font-mono font-bold text-zinc-400 mt-1">${chain.directUpgradeCost.toFixed(2)}</p>
        </div>
        <div className="bg-zinc-900/60 border border-emerald-500/20 rounded-sm p-3">
          <p className="text-[10px] text-emerald-400 uppercase tracking-widest">Ahorro Total</p>
          <p className={`text-xl font-mono font-bold mt-1 ${
            chain.totalSavingsVsDirect > 0 ? "text-emerald-400" : "text-red-400"
          }`}>
            {/* FIX 2026-04-26: signos estaban invertidos. Ahorro positivo
                ahora muestra "+$X" (verde), cadena más cara que directo
                muestra "-$X" (rojo), cero muestra "$0". */}
            {chain.totalSavingsVsDirect > 0
              ? `+$${chain.totalSavingsVsDirect.toFixed(2)}`
              : chain.totalSavingsVsDirect < 0
                ? `-$${Math.abs(chain.totalSavingsVsDirect).toFixed(2)}`
                : `$0.00`}
          </p>
        </div>
        <div className="bg-zinc-900/60 border border-zinc-800/50 rounded-sm p-3">
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Ahorro %</p>
          <p className={`text-xl font-mono font-bold mt-1 ${
            chain.totalSavingsVsDirect > 0 ? "text-emerald-400" : "text-red-400"
          }`}>
            {savingsPercent}%
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Policy Panel (Forzar Inclusión / Exclusión) ───────────────────────────
// CCU.4 (2026-05-03): inspirado en ccugame.app — listas globales del user
// para forzar que la cadena pase por X (waypoints) y/o nunca use Y. Persistido
// en localStorage via ccuChainPolicy.ts. Aplica a TODAS las cadenas hasta que
// el user borre las restricciones.

function PolicyPanel({
  ships,
  fromMsrp,
  toMsrp,
}: {
  ships: ShipOption[];
  fromMsrp: number | null;
  toMsrp: number | null;
}) {
  const policy = useChainPolicy();
  const [expanded, setExpanded] = useState(
    () => policy.include.length > 0 || policy.exclude.length > 0
  );
  const [pickerMode, setPickerMode] = useState<"include" | "exclude" | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const includeShips = useMemo(
    () => policy.include.map((id) => ships.find((s) => s.id === id)).filter((s): s is ShipOption => !!s),
    [policy.include, ships],
  );
  const excludeShips = useMemo(
    () => policy.exclude.map((id) => ships.find((s) => s.id === id)).filter((s): s is ShipOption => !!s),
    [policy.exclude, ships],
  );

  // Validación de waypoints: deben estar dentro del rango (fromMsrp, toMsrp).
  const isWaypointValid = useCallback(
    (msrp: number) => {
      if (fromMsrp == null || toMsrp == null) return true;
      return msrp > fromMsrp && msrp < toMsrp;
    },
    [fromMsrp, toMsrp],
  );

  // Lista filtrada para el picker.
  const pickerResults = useMemo(() => {
    if (!pickerMode) return [];
    const excludedIds = new Set(pickerMode === "include" ? policy.include : policy.exclude);
    const q = searchQuery.trim().toLowerCase();
    return ships
      .filter((s) => !excludedIds.has(s.id))
      .filter((s) => !q || s.name.toLowerCase().includes(q) || (s.manufacturer ?? "").toLowerCase().includes(q))
      .sort((a, b) => a.msrpUsd - b.msrpUsd)
      .slice(0, 30);
  }, [pickerMode, searchQuery, ships, policy.include, policy.exclude]);

  const handleAdd = useCallback(
    (shipId: string) => {
      if (pickerMode === "include") addForceInclude(shipId);
      else if (pickerMode === "exclude") addForceExclude(shipId);
      setPickerMode(null);
      setSearchQuery("");
    },
    [pickerMode],
  );

  const total = policy.include.length + policy.exclude.length;

  return (
    <div className="border border-zinc-800/60 rounded-sm bg-zinc-900/30">
      {/* Header colapsable */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-800/30 transition-colors rounded-sm"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          className={`text-zinc-400 transition-transform duration-200 ${expanded ? "" : "-rotate-90"}`}
        >
          <path d="M2 3.5 L5 6.5 L8 3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-[11px] font-mono uppercase tracking-[0.15em] text-zinc-300">Restricciones globales</span>
        {total > 0 && (
          <span className="text-[10px] text-zinc-500">
            • {policy.include.length} incluidas, {policy.exclude.length} excluidas
          </span>
        )}
        <span className="ml-auto text-[10px] text-zinc-600">aplica a todas tus cadenas</span>
      </button>

      {expanded && (
        <div className="border-t border-zinc-800/60 p-3 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Forzar Inclusión */}
            <div className="space-y-2">
              <div className="text-[10px] font-mono uppercase tracking-widest text-emerald-400">
                Forzar Inclusión <span className="text-zinc-600">({includeShips.length})</span>
              </div>
              <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                {includeShips.length === 0 && (
                  <span className="text-[11px] text-zinc-600 italic">Ninguna nave forzada</span>
                )}
                {includeShips.map((ship) => {
                  const valid = isWaypointValid(ship.msrpUsd);
                  return (
                    <span
                      key={ship.id}
                      className={`flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-sm border ${
                        valid
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                          : "bg-amber-500/10 border-amber-500/30 text-amber-400"
                      }`}
                      title={valid ? `${ship.name} ($${ship.msrpUsd})` : `${ship.name} ($${ship.msrpUsd}) — fuera del rango actual de la cadena`}
                    >
                      {!valid && <span>⚠</span>}
                      {ship.name} <span className="opacity-60">${ship.msrpUsd}</span>
                      <button
                        onClick={() => removeForceInclude(ship.id)}
                        className="ml-0.5 hover:text-white"
                        aria-label={`Quitar ${ship.name} de forzar inclusión`}
                      >×</button>
                    </span>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setPickerMode(pickerMode === "include" ? null : "include"); setSearchQuery(""); }}
                  className="text-[10px] px-2 py-1 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 rounded-sm transition-colors"
                >
                  {pickerMode === "include" ? "Cerrar" : "+ Agregar nave"}
                </button>
                {includeShips.length > 0 && (
                  <button
                    onClick={() => clearForceInclude()}
                    className="text-[10px] px-2 py-1 text-zinc-500 hover:text-red-400 transition-colors"
                  >
                    Limpiar todas
                  </button>
                )}
              </div>
            </div>

            {/* Forzar Exclusión */}
            <div className="space-y-2">
              <div className="text-[10px] font-mono uppercase tracking-widest text-red-400">
                Forzar Exclusión <span className="text-zinc-600">({excludeShips.length})</span>
              </div>
              <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                {excludeShips.length === 0 && (
                  <span className="text-[11px] text-zinc-600 italic">Ninguna nave bloqueada</span>
                )}
                {excludeShips.map((ship) => (
                  <span
                    key={ship.id}
                    className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-sm border bg-red-500/10 border-red-500/30 text-red-300"
                    title={`${ship.name} ($${ship.msrpUsd})`}
                  >
                    {ship.name} <span className="opacity-60">${ship.msrpUsd}</span>
                    <button
                      onClick={() => removeForceExclude(ship.id)}
                      className="ml-0.5 hover:text-white"
                      aria-label={`Quitar ${ship.name} de forzar exclusión`}
                    >×</button>
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setPickerMode(pickerMode === "exclude" ? null : "exclude"); setSearchQuery(""); }}
                  className="text-[10px] px-2 py-1 border border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-sm transition-colors"
                >
                  {pickerMode === "exclude" ? "Cerrar" : "+ Agregar nave"}
                </button>
                {excludeShips.length > 0 && (
                  <button
                    onClick={() => clearForceExclude()}
                    className="text-[10px] px-2 py-1 text-zinc-500 hover:text-red-400 transition-colors"
                  >
                    Limpiar todas
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Picker — search + lista filtrada */}
          {pickerMode && (
            <div className={`border rounded-sm p-2 space-y-2 ${
              pickerMode === "include" ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"
            }`}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Buscar nave para ${pickerMode === "include" ? "FORZAR INCLUSIÓN" : "FORZAR EXCLUSIÓN"}...`}
                autoFocus
                className="w-full bg-zinc-900/80 border border-zinc-700/60 rounded-sm px-2.5 py-1.5 text-[12px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500/60"
              />
              <div className="max-h-64 overflow-y-auto divide-y divide-zinc-800/50">
                {pickerResults.length === 0 && (
                  <div className="text-[11px] text-zinc-600 text-center py-4">Sin resultados</div>
                )}
                {pickerResults.map((ship) => (
                  <button
                    key={ship.id}
                    onClick={() => handleAdd(ship.id)}
                    className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-zinc-800/40 transition-colors"
                  >
                    <span className="text-[12px] text-zinc-200">{ship.name}</span>
                    <span className="text-[11px] text-zinc-500">${ship.msrpUsd}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tip explicativo */}
          <p className="text-[10px] text-zinc-600 leading-relaxed">
            Las naves <span className="text-emerald-400">incluidas</span> son <strong>waypoints obligatorios</strong> — la cadena pasará por todas ellas en orden ascendente de MSRP.
            Las <span className="text-red-400">excluidas</span> nunca aparecerán en la cadena.
            <span className="text-amber-400"> ⚠</span> indica que un waypoint está fuera del rango (start, target) y no puede aplicar — quitalo o cambiá las naves.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function CCUChainCalculator() {
  const [ships, setShips] = useState<ShipOption[]>([]);
  const [loadingShips, setLoadingShips] = useState(false);

  const [fromShip, setFromShip] = useState<ShipOption | null>(null);
  const [toShip, setToShip] = useState<ShipOption | null>(null);

  const [preferWarbond, setPreferWarbond] = useState(true);
  const [useOwnedCCUs, setUseOwnedCCUs] = useState(true);
  const [hasBuybackToken, setHasBuybackToken] = useState(false);
  const [paymentPriority, setPaymentPriority] = useState<PaymentPriority>("balanced");
  const [onlyAvailableNow, setOnlyAvailableNow] = useState(true); // true = armarla ya, false = esperar mejores precios
  const [maxSteps, setMaxSteps] = useState(15);

  // CCU.4 (2026-05-03): policy global del user (Forzar Inclusión/Exclusión).
  // Persistido en localStorage. El hook devuelve un objeto referencialmente
  // estable (cache en useSyncExternalStore) → no triggea re-render trap.
  const policy = useChainPolicy();
  const policyKey = useMemo(() => policy.include.join(",") + "|" + policy.exclude.join(","), [policy]);

  const [chain, setChain] = useState<ChainResult | null>(null);
  const [alternatives, setAlternatives] = useState<ChainResult[]>([]);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fromSource, setFromSource] = useState<"store" | "fleet">("store");
  // FEAT 2026-04-26: filtros del selector "Mi Flota" — location (hangar/
  // buyback) y tipo de seguro. Aplicables simultáneamente.
  const [fleetLocationFilter, setFleetLocationFilter] = useState<"all" | "hangar" | "buyback">("all");
  const [fleetInsuranceFilter, setFleetInsuranceFilter] = useState<"all" | "LTI" | "120_months" | "72_months" | "48_months" | "24_months" | "6_months" | "3_months">("all");

  // Get user's owned CCUs and ships from hangar store
  const ccus = useHangarStore((s) => s.ccus);
  const hangarShips = useHangarStore((s) => s.ships);

  // Build fleet ship options from user's hangar.
  // FEAT 2026-04-26: aplica filtros de location e insurance. Estos se
  // evalúan ANTES del dedupe por nombre, así si tenés dos RAFT (una LTI en
  // hangar, otra 72m en buyback) el filtro las distingue antes de quedarse
  // con la primera.
  //
  // CCU.13 (2026-05-04): variant rule audit — RSI requiere class_name EXACTO
  // entre el FROM del CCU y la nave del usuario. "Dragonfly Black" ≠
  // "Dragonfly Yellowjacket" aunque compartan tronco. Acá el matching elige
  // el ship con nombre MÁS LARGO (= más específico) cuando hay múltiples
  // candidatos, para evitar matchear "Dragonfly" genérico con "Dragonfly Black"
  // cuando en realidad existe otra "Dragonfly Yellowjacket" también.
  // El solver downstream (ccu_prices.from_ship_id) ya es estricto por UUID,
  // pero el bridge fleet→ship debe respetar la variante.
  const fleetShipOptions = useMemo(() => {
    const ownedNames = new Set<string>();
    const results: ShipOption[] = [];

    for (const hs of hangarShips) {
      if (hs.itemCategory !== "standalone_ship" && hs.itemCategory !== "game_package") continue;

      // CCU.15 (2026-05-04): pledges locked por RSI no se pueden usar como
      // base para CCU ("Pledges that have been locked cannot be upgraded or
      // altered further"). Las excluimos del selector silenciosamente.
      if (hs.isLocked) continue;

      // Filtros de columna izquierda
      if (fleetLocationFilter !== "all" && hs.location !== fleetLocationFilter) continue;
      if (fleetInsuranceFilter !== "all" && hs.insuranceType !== fleetInsuranceFilter) continue;

      const name = hs.shipName.toLowerCase();
      if (ownedNames.has(name)) continue;
      ownedNames.add(name);

      // CCU.13: collect all matching candidates, then pick the most specific
      // (longest-name) match. Si hay empate, preferimos el que tiene EXACT
      // match. Esto evita el caso "user tiene 'Dragonfly Yellowjacket' →
      // matchear erróneamente la primera 'Drake Dragonfly Black' que aparece".
      const candidates = ships.filter(s => {
        const sName = s.name.toLowerCase();
        return sName === name ||
          sName.endsWith(" " + name) || // "Aegis Gladius" ends with "Gladius"
          name.endsWith(" " + sName.split(" ").slice(1).join(" ").toLowerCase());
      });
      // Preferir exact match → luego longest-name match (más específico)
      const match =
        candidates.find(s => s.name.toLowerCase() === name) ??
        candidates.sort((a, b) => b.name.length - a.name.length)[0];
      if (match) {
        // Tag visible: location + insurance (resumida)
        const insTag = hs.insuranceType === "LTI" ? "LTI"
          : hs.insuranceType === "120_months" ? "120m"
          : hs.insuranceType === "72_months" ? "72m"
          : hs.insuranceType === "48_months" ? "48m"
          : hs.insuranceType === "24_months" ? "24m"
          : hs.insuranceType === "6_months" ? "6m"
          : hs.insuranceType === "3_months" ? "3m"
          : "";
        const locTag = hs.location === "buyback" ? "Buyback" : "Hangar";
        const tag = insTag ? `${locTag} · ${insTag}` : locTag;
        results.push({
          ...match,
          name: `${match.name} (${tag})`,
        });
      }
    }
    return results.sort((a, b) => a.msrpUsd - b.msrpUsd);
  }, [hangarShips, ships, fleetLocationFilter, fleetInsuranceFilter]);

  // ── Load ships list ──
  useEffect(() => {
    setLoadingShips(true);
    fetch("/api/ccu/ships")
      .then((r) => r.json())
      .then((d) => setShips(d.ships || []))
      .catch(() => setError("Failed to load ships"))
      .finally(() => setLoadingShips(false));
  }, []);

  // ── Calculate chain ──
  const calculate = useCallback(async () => {
    if (!fromShip || !toShip) return;
    setCalculating(true);
    setError(null);
    setChain(null);
    setAlternatives([]);

    try {
      // Build owned CCUs list from hangar store (with location!)
      const ownedCCUs = useOwnedCCUs
        ? ccus.map((ccu: HangarCCU) => ({
            fromShip: ccu.fromShip,
            toShip: ccu.toShip,
            pricePaid: ccu.pricePaid,
            location: ccu.location, // "hangar" | "buyback"
          }))
        : [];

      const res = await fetch("/api/ccu/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromShipId: fromShip.id,
          toShipId: toShip.id,
          ownedCCUs,
          preferWarbond,
          hasBuybackToken,
          paymentPriority,
          onlyAvailable: onlyAvailableNow,
          maxSteps,
          includeAlternatives: true,
          // CCU.4: policy global persistida en localStorage.
          forceIncludeShipIds: policy.include,
          forceExcludeShipIds: policy.exclude,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Calculation failed");

      setChain(data.chain);
      setAlternatives(data.alternatives || []);

      if (!data.chain) {
        // FIX 2026-04-26: mensaje contextual según el modo. En "Armarla Ya"
        // muchas concept ships (Ironclad Assault, Galaxy, Expanse, etc.) no
        // tienen edges en ccu_prices porque CIG todavía no vende CCUs
        // continuos hacia ellas — sólo se consiguen via warbond en eventos.
        // En ese caso "Esperar y Ahorrar" sí encuentra path porque genera
        // edges teóricos a precio standard cap. Lo decimos explícitamente.
        if (onlyAvailableNow) {
          setError(
            `No hay path disponible en "Armarla Ya" — ${toShip?.name ?? "el destino"} ` +
            `probablemente sea CONCEPT o limited (CIG no tiene CCU continuo hacia ella). ` +
            `Cambiá a "Esperar y Ahorrar" para ver el path teórico (precios estimados).`,
          );
        } else {
          setError(
            `No se encontró cadena entre estas naves. El destino puede no ser ` +
            `elegible para CCU (concept reciente o discontinuada).`,
          );
        }
      }
    } catch (err: any) {
      setError(err.message || "Calculation failed");
    } finally {
      setCalculating(false);
    }
    // policyKey es la representación stable string-ificada de policy.include +
    // policy.exclude. Cambia solo cuando cambian las listas → recalcula.
  }, [fromShip, toShip, preferWarbond, useOwnedCCUs, hasBuybackToken, paymentPriority, onlyAvailableNow, maxSteps, ccus, policy.include, policy.exclude, policyKey]);

  // ── Auto-calculate when ships change ──
  useEffect(() => {
    if (fromShip && toShip && fromShip.msrpUsd < toShip.msrpUsd) {
      calculate();
    } else {
      setChain(null);
      setAlternatives([]);
    }
  }, [fromShip, toShip, preferWarbond, useOwnedCCUs, hasBuybackToken, paymentPriority, onlyAvailableNow, maxSteps, policyKey]);

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100 tracking-wide">CCU Chain Calculator</h2>
          <p className="text-[11px] text-zinc-500 mt-0.5">Find the cheapest upgrade path using Warbond discounts and your owned CCUs</p>
        </div>
        {ccus.length > 0 && (
          <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded">
            {ccus.length} CCUs in inventory
          </span>
        )}
      </div>

      {/* ── Ship Selection ── */}
      {/* FIX 2026-04-26: layout en grid con DOS columnas que cada una tiene
          su propio div interno con header (toggle/spacer) + selector. Así
          quedan alineados verticalmente. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Columna izquierda: Nave Base */}
        <div>
          {/* From Ship source toggle */}
          <div className="flex items-center gap-1 mb-2 h-7">
            <button
              onClick={() => { setFromSource("fleet"); setFromShip(null); }}
              className={`px-2.5 py-1 text-[11px] rounded-sm transition-all ${
                fromSource === "fleet"
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  : "text-zinc-500 hover:text-zinc-400 border border-transparent"
              }`}
            >
              Mi Flota ({hangarShips.filter(s => s.itemCategory === "standalone_ship" || s.itemCategory === "game_package").length})
            </button>
            <button
              onClick={() => { setFromSource("store"); setFromShip(null); }}
              className={`px-2.5 py-1 text-[11px] rounded-sm transition-all ${
                fromSource === "store"
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                  : "text-zinc-500 hover:text-zinc-400 border border-transparent"
              }`}
            >
              Tienda
            </button>
          </div>
          <ShipSearchSelect
            label={fromSource === "fleet" ? "Nave Base (Mi Flota)" : "Nave Base (Tienda)"}
            value={fromShip}
            onChange={setFromShip}
            ships={fromSource === "fleet" ? fleetShipOptions : ships}
            excludeId={toShip?.id}
          />
          {/* FEAT 2026-04-26: filtros location + insurance, sólo en modo
              "Mi Flota". Aplicables simultáneamente. */}
          {fromSource === "fleet" && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px]">
              {/* Location */}
              <div className="flex items-center gap-1">
                <span className="text-zinc-500 uppercase tracking-wider mr-0.5">Ubic:</span>
                {(["all", "hangar", "buyback"] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => { setFleetLocationFilter(opt); setFromShip(null); }}
                    className={`px-1.5 py-0.5 rounded-sm transition-all ${
                      fleetLocationFilter === opt
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        : "text-zinc-500 hover:text-zinc-400 border border-transparent"
                    }`}
                  >
                    {opt === "all" ? "Todas" : opt === "hangar" ? "Hangar" : "Buyback"}
                  </button>
                ))}
              </div>
              {/* Insurance */}
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-zinc-500 uppercase tracking-wider mr-0.5">Seg:</span>
                {([
                  { v: "all" as const, l: "Todos" },
                  { v: "LTI" as const, l: "LTI" },
                  { v: "120_months" as const, l: "120m" },
                  { v: "72_months" as const, l: "72m" },
                  { v: "48_months" as const, l: "48m" },
                  { v: "24_months" as const, l: "24m" },
                  { v: "6_months" as const, l: "6m" },
                  { v: "3_months" as const, l: "3m" },
                ]).map((opt) => (
                  <button
                    key={opt.v}
                    onClick={() => { setFleetInsuranceFilter(opt.v); setFromShip(null); }}
                    className={`px-1.5 py-0.5 rounded-sm transition-all ${
                      fleetInsuranceFilter === opt.v
                        ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                        : "text-zinc-500 hover:text-zinc-400 border border-transparent"
                    }`}
                  >
                    {opt.l}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        {/* Columna derecha: Nave Objetivo. Spacer del mismo alto que el
            toggle (h-7 + mb-2 = 36px) para mantener la grilla alineada. */}
        <div>
          <div className="h-7 mb-2" aria-hidden="true" />
          <ShipSearchSelect
            label="Nave Objetivo"
            value={toShip}
            onChange={setToShip}
            ships={ships}
            excludeId={fromShip?.id}
            filterFn={fromShip ? (s) => s.msrpUsd > fromShip.msrpUsd : undefined}
          />
        </div>
      </div>

      {/* ── Validation message ── */}
      {fromShip && toShip && fromShip.msrpUsd >= toShip.msrpUsd && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-sm px-3 py-2">
          Target ship must have a higher MSRP than the base ship. {fromShip.name} (${fromShip.msrpUsd}) → {toShip.name} (${toShip.msrpUsd})
        </div>
      )}

      {/* ── Options ── */}
      <div className="flex flex-wrap items-center gap-4 py-2 px-3 bg-zinc-900/40 border border-zinc-800/30 rounded-sm">
        {/* Modo: Ya vs Esperar */}
        <div className="flex items-center gap-1 bg-zinc-800/60 rounded-sm p-0.5">
          <button
            onClick={() => setOnlyAvailableNow(true)}
            className={`px-2.5 py-1 text-[11px] rounded-sm transition-all ${
              onlyAvailableNow
                ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                : "text-zinc-500 hover:text-zinc-400"
            }`}
          >
            Armarla Ya
          </button>
          <button
            onClick={() => setOnlyAvailableNow(false)}
            className={`px-2.5 py-1 text-[11px] rounded-sm transition-all ${
              !onlyAvailableNow
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                : "text-zinc-500 hover:text-zinc-400"
            }`}
          >
            Esperar y Ahorrar
          </button>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={preferWarbond}
            onChange={(e) => setPreferWarbond(e.target.checked)}
            className="rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500/30"
          />
          <span className="text-xs text-zinc-400">Preferir Warbond</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={useOwnedCCUs}
            onChange={(e) => setUseOwnedCCUs(e.target.checked)}
            className="rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500/30"
          />
          <span className="text-xs text-zinc-400">
            Usar mis CCUs ({ccus.length})
          </span>
        </label>
        {useOwnedCCUs && ccus.some(c => c.location === "buyback") && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={hasBuybackToken}
              onChange={(e) => setHasBuybackToken(e.target.checked)}
              className="rounded border-zinc-600 bg-zinc-800 text-violet-500 focus:ring-violet-500/30"
            />
            <span className="text-xs text-zinc-400">
              Tengo token de buyback
            </span>
          </label>
        )}
        {/* Prioridad de pago */}
        <div className="flex items-center gap-1 bg-zinc-800/60 rounded-sm p-0.5">
          <button
            onClick={() => setPaymentPriority("prefer-cash")}
            className={`px-2 py-1 text-[11px] rounded-sm transition-all ${
              paymentPriority === "prefer-cash"
                ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                : "text-zinc-500 hover:text-zinc-400"
            }`}
            title="Minimize credit use, prioritize cash"
          >
            $ Efectivo
          </button>
          <button
            onClick={() => setPaymentPriority("balanced")}
            className={`px-2 py-1 text-[11px] rounded-sm transition-all ${
              paymentPriority === "balanced"
                ? "bg-zinc-600/30 text-zinc-300 border border-zinc-500/30"
                : "text-zinc-500 hover:text-zinc-400"
            }`}
            title="Balance between cash and credits"
          >
            Balance
          </button>
          <button
            onClick={() => setPaymentPriority("prefer-credits")}
            className={`px-2 py-1 text-[11px] rounded-sm transition-all ${
              paymentPriority === "prefer-credits"
                ? "bg-violet-500/20 text-violet-400 border border-violet-500/30"
                : "text-zinc-500 hover:text-zinc-400"
            }`}
            title="Maximizar uso de créditos (buyback), minimizar efectivo"
          >
            SC$ Créditos
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Max steps:</span>
          <select
            value={maxSteps}
            onChange={(e) => setMaxSteps(Number(e.target.value))}
            className="bg-zinc-800 border border-zinc-700/40 rounded text-xs text-zinc-300 px-2 py-1"
          >
            {[5, 10, 15, 20, 25].map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        <button
          onClick={calculate}
          disabled={!fromShip || !toShip || calculating}
          className="ml-auto px-4 py-1.5 bg-amber-500/20 border border-amber-500/40 text-amber-400 text-xs font-medium rounded-sm hover:bg-amber-500/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {calculating ? "Calculating..." : "Recalculate"}
        </button>
      </div>

      {/* ── Restricciones globales (CCU.4) ──
          Panel inline colapsable. Default: colapsado si las listas están vacías,
          expandido si el user ya tiene restricciones (para que las vea siempre). */}
      <PolicyPanel
        ships={ships}
        fromMsrp={fromShip?.msrpUsd ?? null}
        toMsrp={toShip?.msrpUsd ?? null}
      />

      {/* ── Error ── */}
      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-sm px-3 py-2 flex items-center gap-3">
          <span className="flex-1">{error}</span>
          {/* FIX 2026-04-26: si el error fue por modo "Armarla Ya" sin path,
              ofrecemos cambiar al modo teórico de un click. */}
          {onlyAvailableNow && error.includes("Armarla Ya") && (
            <button
              onClick={() => { setOnlyAvailableNow(false); setError(null); }}
              className="text-[11px] px-2.5 py-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-sm hover:bg-emerald-500/30 transition-all whitespace-nowrap"
            >
              ↻ Probar con &quot;Esperar y Ahorrar&quot;
            </button>
          )}
        </div>
      )}

      {/* ── Loading ── */}
      {calculating && (
        <div className="flex items-center justify-center py-12">
          <div className="w-4 h-4 border-2 border-zinc-800 border-t-amber-500 rounded-full animate-spin mr-3" />
          <span className="text-xs text-zinc-500 font-mono uppercase tracking-widest">
            Finding cheapest path...
          </span>
        </div>
      )}

      {/* ── Results ── */}
      {chain && !calculating && (
        <div className="space-y-6">
          {/* Summary cards */}
          <SavingsSummary chain={chain} />

          {/* CCU.9 + CCU.10 + CCU.12 + CCU.14 (2026-05-04): proyección de
              seguro al final de la cadena, warning de melt, override por
              Warbond LTI especial, y tip de LTI token. */}
          <InsuranceProjectionPanel
            fromShip={fromShip}
            fromSource={fromSource}
            hangarShips={hangarShips}
            chain={chain}
            ownedCCUs={ccus}
          />

          {/* Chain visualization */}
          <div className="bg-zinc-900/30 border border-zinc-800/40 rounded-sm p-4">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-sm font-semibold text-zinc-200 tracking-wide">Optimal Chain</h3>
              <span className="text-[10px] text-zinc-500 flex-1 truncate">
                {chain.startShip.name} → {chain.targetShip.name}
              </span>
              {/* FEAT 2026-04-26: Guardar la chain calculada en el store
                  para seguir su progreso. Auto-reserva las CCUs owned que
                  matcheen con los steps. */}
              <SaveChainButton chain={chain} />
            </div>

            {/* Start ship indicator */}
            <div className="flex items-center mb-3 ml-1">
              <div className="w-6 h-6 rounded-full bg-amber-500/20 border-2 border-amber-500/50 flex items-center justify-center mr-3">
                <span className="text-[10px] text-amber-400">▶</span>
              </div>
              <div>
                <p className="text-sm text-zinc-200 font-medium">{chain.startShip.name}</p>
                <p className="text-[10px] text-zinc-500">Base Ship · MSRP ${chain.startShip.msrpUsd.toLocaleString()}</p>
              </div>
            </div>

            {/* Steps */}
            <div className="ml-1">
              {chain.steps.map((step, i) => (
                <ChainStepCard
                  key={`${step.fromShip.id}-${step.toShip.id}`}
                  step={step}
                  index={i}
                  isLast={i === chain.steps.length - 1}
                />
              ))}
            </div>

            {/* Target ship indicator */}
            <div className="flex items-center mt-1 ml-1">
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 border-2 border-emerald-500/50 flex items-center justify-center mr-3">
                <span className="text-[10px] text-emerald-400">★</span>
              </div>
              <div>
                <p className="text-sm text-emerald-300 font-semibold">{chain.targetShip.name}</p>
                <p className="text-[10px] text-zinc-500">Target · MSRP ${chain.targetShip.msrpUsd.toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Alternative paths */}
          {alternatives.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-zinc-400 tracking-wide">Alternative Paths</h3>
              {alternatives.map((alt, ai) => (
                <div key={ai} className="bg-zinc-900/20 border border-zinc-800/30 rounded-sm p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-zinc-400">
                      Path {ai + 2} · {alt.stepsCount} steps
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-mono text-amber-400">${alt.totalCost.toFixed(2)}</span>
                      {alt.totalSavingsVsDirect > 0 && (
                        <span className="text-xs text-emerald-400">
                          Save ${alt.totalSavingsVsDirect.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[11px] text-zinc-500">{alt.startShip.name}</span>
                    {alt.steps.map((step, si) => (
                      <span key={si} className="flex items-center gap-1">
                        <span className="text-zinc-600">→</span>
                        <span className={`text-[11px] ${
                          step.priceType === "hangar" ? "text-emerald-400" :
                          step.priceType === "buyback-token" ? "text-violet-400" :
                          step.priceType === "buyback-cash" ? "text-orange-400" :
                          step.priceType === "warbond" ? "text-cyan-400" :
                          "text-zinc-400"
                        }`}>
                          {step.toShip.name}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Empty state ── */}
      {!chain && !calculating && fromShip && toShip && fromShip.msrpUsd < toShip.msrpUsd && !error && (
        <div className="text-center py-8 text-zinc-600 text-sm">
          Searching for optimal path...
        </div>
      )}
      {!fromShip || !toShip ? (
        <div className="text-center py-12 text-zinc-600 text-sm">
          Seleccioná una nave base y una nave objetivo para calcular la cadena de CCU más barata.
        </div>
      ) : null}

      {/* ── Saved chains ── */}
      {/* FEAT 2026-04-26: lista de cadenas guardadas en localStorage. Permite
          marcar steps completados y ver progreso a lo largo del tiempo. */}
      <SavedChainsSection />
    </div>
  );
}

// =============================================================================
// FEAT 2026-04-26 — Save chain button + saved chains list
// =============================================================================

function SaveChainButton({ chain }: { chain: ChainResult }) {
  const addChain = useHangarStore((s) => s.addChain);
  const setCCUReservation = useHangarStore((s) => s.setCCUReservation);
  const ccus = useHangarStore((s) => s.ccus);
  const [saved, setSaved] = useState<string | null>(null);
  const [showInput, setShowInput] = useState(false);
  const [name, setName] = useState("");

  const handleSave = useCallback(() => {
    const finalName = name.trim() ||
      `${chain.startShip.name} → ${chain.targetShip.name}`;

    const chainSteps: CCUChainStep[] = chain.steps.map((s) => ({
      fromShip: s.fromShip.name,
      fromShipReference: s.fromShip.reference,
      toShip: s.toShip.name,
      toShipReference: s.toShip.reference,
      ccuPrice: s.effectivePrice,
      isOwned: s.priceType === "hangar" || s.priceType === "buyback-token" || s.priceType === "buyback-cash",
      isCompleted: false,
      isWarbond: s.priceType === "warbond",
    }));

    const chainId = addChain({
      name: finalName,
      startShip: chain.startShip.name,
      startShipReference: chain.startShip.reference,
      targetShip: chain.targetShip.name,
      targetShipReference: chain.targetShip.reference,
      steps: chainSteps,
      status: "planning",
    });

    // Auto-reservar CCUs del inventario que matcheen con steps owned
    const norm = (s: string) => s.toLowerCase().trim();
    let reservedCount = 0;
    for (const step of chainSteps) {
      if (!step.isOwned) continue;
      const match = ccus.find(
        (c) =>
          norm(c.fromShip) === norm(step.fromShip) &&
          norm(c.toShip) === norm(step.toShip) &&
          !c.reservedForChainId,
      );
      if (match) {
        setCCUReservation(match.id, chainId);
        reservedCount++;
      }
    }

    setSaved(reservedCount > 0
      ? `Guardada · ${reservedCount} CCU${reservedCount > 1 ? "s" : ""} reservada${reservedCount > 1 ? "s" : ""}`
      : "Guardada");
    setName("");
    setShowInput(false);
    setTimeout(() => setSaved(null), 4000);
  }, [chain, name, addChain, ccus, setCCUReservation]);

  if (saved) {
    return (
      <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded-sm bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
        ✓ {saved}
      </span>
    );
  }

  if (showInput) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`${chain.startShip.name} → ${chain.targetShip.name}`}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") { setShowInput(false); setName(""); }
          }}
          className="bg-zinc-800 border border-zinc-700/50 rounded-sm text-[11px] text-zinc-200 px-2 py-1 w-48 focus:border-emerald-500/50 focus:outline-none"
        />
        <button
          onClick={handleSave}
          className="px-2 py-1 text-[10px] bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-sm hover:bg-emerald-500/30"
        >
          Guardar
        </button>
        <button
          onClick={() => { setShowInput(false); setName(""); }}
          className="px-1.5 py-1 text-[10px] text-zinc-500 hover:text-zinc-300"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setShowInput(true)}
      title="Guarda esta cadena en tu dispositivo para seguir su progreso paso a paso. Las CCUs owned se reservan automáticamente."
      className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider rounded-sm bg-zinc-800/60 border border-zinc-700/50 text-zinc-400 hover:bg-emerald-500/10 hover:text-emerald-300 hover:border-emerald-500/30 transition-all"
    >
      💾 Guardar Cadena
    </button>
  );
}

function SavedChainsSection() {
  const chains = useHangarStore((s) => s.chains);
  const removeChain = useHangarStore((s) => s.removeChain);
  const setChainStepCompleted = useHangarStore((s) => s.setChainStepCompleted);
  const [expanded, setExpanded] = useState(false);

  if (chains.length === 0) return null;

  const inProgress = chains.filter((c) => c.status === "in_progress");
  const planning = chains.filter((c) => c.status === "planning");
  const completed = chains.filter((c) => c.status === "completed");

  return (
    <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/30 transition-colors"
      >
        <span className="text-[11px] font-mono uppercase tracking-widest text-zinc-400">
          Cadenas Guardadas ({chains.length})
        </span>
        <div className="flex items-center gap-2 text-[10px] font-mono">
          {inProgress.length > 0 && (
            <span className="text-amber-400/80">{inProgress.length} en progreso</span>
          )}
          {planning.length > 0 && (
            <span className="text-cyan-400/80">{planning.length} pendiente{planning.length > 1 ? "s" : ""}</span>
          )}
          {completed.length > 0 && (
            <span className="text-emerald-400/60">{completed.length} completa{completed.length > 1 ? "s" : ""}</span>
          )}
        </div>
        <span className={`ml-auto text-[10px] text-zinc-500 transition-transform ${expanded ? "rotate-90" : ""}`}>▶</span>
      </button>

      {expanded && (
        <div className="border-t border-zinc-800/40 divide-y divide-zinc-800/40">
          {chains.map((chain) => {
            const completedSteps = chain.steps.filter((s) => s.isCompleted).length;
            const totalSteps = chain.steps.length;
            const pct = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

            return (
              <div key={chain.id} className="p-3 hover:bg-zinc-900/40 transition-colors">
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium truncate ${
                        chain.status === "completed" ? "text-emerald-300" :
                        chain.status === "in_progress" ? "text-amber-300" :
                        "text-zinc-200"
                      }`}>
                        {chain.name}
                      </span>
                      <span className="text-[9px] font-mono uppercase tracking-wider text-zinc-500">
                        {completedSteps} / {totalSteps}
                      </span>
                    </div>
                    <div className="text-[10px] text-zinc-500 mt-0.5 truncate">
                      {chain.startShip} → {chain.targetShip}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm(`Borrar la cadena "${chain.name}"? Esto libera las CCUs reservadas pero no las borra del inventario.`)) {
                        removeChain(chain.id);
                      }
                    }}
                    title="Borrar cadena"
                    className="text-zinc-600 hover:text-red-400 text-xs px-2"
                  >
                    ✕
                  </button>
                </div>
                {/* Progress bar */}
                <div className="h-1 bg-zinc-800/60 rounded-sm overflow-hidden mb-2">
                  <div
                    className={`h-full transition-all ${
                      chain.status === "completed" ? "bg-emerald-500" :
                      chain.status === "in_progress" ? "bg-amber-500" :
                      "bg-cyan-500/50"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {/* Steps */}
                <div className="space-y-1">
                  {chain.steps.map((step, i) => (
                    <label
                      key={i}
                      className="flex items-center gap-2 text-[11px] cursor-pointer hover:bg-zinc-800/30 px-1.5 py-1 rounded-sm"
                    >
                      <input
                        type="checkbox"
                        checked={step.isCompleted}
                        onChange={(e) => setChainStepCompleted(chain.id, i, e.target.checked)}
                        className="cursor-pointer accent-emerald-500"
                      />
                      <span className={`flex-1 ${step.isCompleted ? "line-through text-zinc-500" : "text-zinc-300"}`}>
                        {step.fromShip} → {step.toShip}
                      </span>
                      <span className={`text-[9px] font-mono ${step.isCompleted ? "text-zinc-600" : "text-zinc-500"}`}>
                        {step.isOwned ? "OWNED" : step.isWarbond ? "WB" : "STD"}
                      </span>
                      <span className={`font-mono tabular-nums ${step.isCompleted ? "text-zinc-600" : "text-amber-400/70"}`}>
                        ${step.ccuPrice.toFixed(0)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
