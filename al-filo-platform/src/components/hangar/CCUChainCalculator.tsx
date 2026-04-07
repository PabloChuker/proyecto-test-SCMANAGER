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
import { useHangarStore, type HangarCCU } from "@/store/useHangarStore";
import type { ChainResult, ChainStep } from "@/lib/ccu-engine";

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

// ─── Chain Step Visual ──────────────────────────────────────────────────────

function ChainStepCard({ step, index, isLast }: { step: ChainStep; index: number; isLast: boolean }) {
  const priceColor =
    step.priceType === "owned" ? "text-emerald-400" :
    step.priceType === "warbond" ? "text-cyan-400" :
    "text-zinc-300";

  const priceBg =
    step.priceType === "owned" ? "bg-emerald-500/10 border-emerald-500/20" :
    step.priceType === "warbond" ? "bg-cyan-500/10 border-cyan-500/20" :
    "bg-zinc-800/40 border-zinc-700/30";

  const priceLabel =
    step.priceType === "owned" ? "OWNED" :
    step.priceType === "warbond" ? "WARBOND" :
    "STANDARD";

  return (
    <div className="relative flex items-stretch">
      {/* Timeline connector */}
      <div className="flex flex-col items-center mr-4 flex-shrink-0">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
          step.priceType === "owned"
            ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-400"
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
                step.priceType === "owned" ? "bg-emerald-500/20 text-emerald-400" :
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
            </div>
          </div>

          {/* Price */}
          <div className="text-right flex-shrink-0">
            <p className={`text-lg font-mono font-bold ${priceColor}`}>
              {step.priceType === "owned" ? "$0" : `$${step.effectivePrice.toFixed(2)}`}
            </p>
            {step.priceType !== "standard" && step.standardPrice !== step.effectivePrice && (
              <p className="text-[10px] text-zinc-500 line-through font-mono">
                ${step.standardPrice.toFixed(2)}
              </p>
            )}
          </div>
        </div>

        {/* Cumulative bar */}
        <div className="mt-2 pt-2 border-t border-zinc-700/20 flex items-center justify-between">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Cumulative</span>
          <span className="text-xs text-zinc-400 font-mono">${step.cumulativeCost.toFixed(2)}</span>
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

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="bg-zinc-900/60 border border-zinc-800/50 rounded-sm p-3">
        <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Chain Cost</p>
        <p className="text-xl font-mono font-bold text-amber-400 mt-1">${chain.totalCost.toFixed(2)}</p>
      </div>
      <div className="bg-zinc-900/60 border border-zinc-800/50 rounded-sm p-3">
        <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Direct CCU</p>
        <p className="text-xl font-mono font-bold text-zinc-400 mt-1">${chain.directUpgradeCost.toFixed(2)}</p>
      </div>
      <div className="bg-zinc-900/60 border border-emerald-500/20 rounded-sm p-3">
        <p className="text-[10px] text-emerald-400 uppercase tracking-widest">Total Savings</p>
        <p className={`text-xl font-mono font-bold mt-1 ${
          chain.totalSavingsVsDirect > 0 ? "text-emerald-400" : "text-red-400"
        }`}>
          {chain.totalSavingsVsDirect > 0 ? "-" : "+"}${Math.abs(chain.totalSavingsVsDirect).toFixed(2)}
        </p>
      </div>
      <div className="bg-zinc-900/60 border border-zinc-800/50 rounded-sm p-3">
        <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Savings %</p>
        <p className={`text-xl font-mono font-bold mt-1 ${
          chain.totalSavingsVsDirect > 0 ? "text-emerald-400" : "text-red-400"
        }`}>
          {savingsPercent}%
        </p>
      </div>
      <div className="bg-zinc-900/60 border border-zinc-800/50 rounded-sm p-3 col-span-2 sm:col-span-1">
        <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Steps</p>
        <p className="text-lg font-mono text-zinc-300 mt-1">{chain.stepsCount}</p>
      </div>
      <div className="bg-zinc-900/60 border border-emerald-500/10 rounded-sm p-3">
        <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Owned</p>
        <p className="text-lg font-mono text-emerald-400 mt-1">{chain.ownedStepsCount}</p>
      </div>
      <div className="bg-zinc-900/60 border border-cyan-500/10 rounded-sm p-3">
        <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Warbond</p>
        <p className="text-lg font-mono text-cyan-400 mt-1">{chain.warbondStepsCount}</p>
      </div>
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
  const [maxSteps, setMaxSteps] = useState(15);

  const [chain, setChain] = useState<ChainResult | null>(null);
  const [alternatives, setAlternatives] = useState<ChainResult[]>([]);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get user's owned CCUs from hangar store
  const ccus = useHangarStore((s) => s.ccus);

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
      // Build owned CCUs list from hangar store
      const ownedCCUs = useOwnedCCUs
        ? ccus.map((ccu: HangarCCU) => ({
            fromShip: ccu.fromShip,
            toShip: ccu.toShip,
            pricePaid: ccu.pricePaid,
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
          maxSteps,
          includeAlternatives: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Calculation failed");

      setChain(data.chain);
      setAlternatives(data.alternatives || []);

      if (!data.chain) {
        setError("No upgrade path found between these ships. The target ship may be limited or ineligible for CCU.");
      }
    } catch (err: any) {
      setError(err.message || "Calculation failed");
    } finally {
      setCalculating(false);
    }
  }, [fromShip, toShip, preferWarbond, useOwnedCCUs, maxSteps, ccus]);

  // ── Auto-calculate when ships change ──
  useEffect(() => {
    if (fromShip && toShip && fromShip.msrpUsd < toShip.msrpUsd) {
      calculate();
    } else {
      setChain(null);
      setAlternatives([]);
    }
  }, [fromShip, toShip, preferWarbond, useOwnedCCUs, maxSteps]);

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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ShipSearchSelect
          label="From Ship (Base)"
          value={fromShip}
          onChange={setFromShip}
          ships={ships}
          excludeId={toShip?.id}
        />
        <ShipSearchSelect
          label="To Ship (Target)"
          value={toShip}
          onChange={setToShip}
          ships={ships}
          excludeId={fromShip?.id}
          filterFn={fromShip ? (s) => s.msrpUsd > fromShip.msrpUsd : undefined}
        />
      </div>

      {/* ── Validation message ── */}
      {fromShip && toShip && fromShip.msrpUsd >= toShip.msrpUsd && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-sm px-3 py-2">
          Target ship must have a higher MSRP than the base ship. {fromShip.name} (${fromShip.msrpUsd}) → {toShip.name} (${toShip.msrpUsd})
        </div>
      )}

      {/* ── Options ── */}
      <div className="flex flex-wrap items-center gap-4 py-2 px-3 bg-zinc-900/40 border border-zinc-800/30 rounded-sm">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={preferWarbond}
            onChange={(e) => setPreferWarbond(e.target.checked)}
            className="rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500/30"
          />
          <span className="text-xs text-zinc-400">Prefer Warbond</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={useOwnedCCUs}
            onChange={(e) => setUseOwnedCCUs(e.target.checked)}
            className="rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500/30"
          />
          <span className="text-xs text-zinc-400">
            Use my CCUs ({ccus.length})
          </span>
        </label>
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

      {/* ── Error ── */}
      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-sm px-3 py-2">
          {error}
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

          {/* Chain visualization */}
          <div className="bg-zinc-900/30 border border-zinc-800/40 rounded-sm p-4">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-sm font-semibold text-zinc-200 tracking-wide">Optimal Chain</h3>
              <span className="text-[10px] text-zinc-500">
                {chain.startShip.name} → {chain.targetShip.name}
              </span>
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
                          step.priceType === "owned" ? "text-emerald-400" :
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
      {!chain && !calculating && !error && fromShip && toShip && fromShip.msrpUsd < toShip.msrpUsd && (
        <div className="text-center py-12">
          <p className="text-zinc-500 text-sm">Click "Recalculate" to find the cheapest path</p>
        </div>
      )}
      {!fromShip && !toShip && (
        <div className="text-center py-16">
          <div className="text-4xl mb-3 opacity-20">⬆️</div>
          <p className="text-zinc-500 text-sm">Select a base ship and target ship to calculate the cheapest upgrade chain</p>
          <p className="text-zinc-600 text-xs mt-1">The calculator will use Warbond discounts and your owned CCUs to minimize cost</p>
        </div>
      )}
    </div>
  );
}
