"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import minerals from "@/data/mining/minerals.json";
import refineries from "@/data/mining/refineries.json";
import refiningMethods from "@/data/mining/refining-methods.json";

// ─── Types ───────────────────────────────────────────────────────────────────

type TabMode = "ship" | "roc" | "salvage" | "share";

interface Expense {
  id: string;
  claimant: string;
  name: string;
  amount: number;
}

interface CrewMember {
  id: string;
  name: string;
  shareType: "equal" | "fixed";
  share: number;
}

interface CompositeSellRow {
  id: string;
  amount: number;
}

interface Mineral {
  id: string;
  name: string;
  type: string;
  tier: string;
  basePrice: number;
  abbr: string;
}

interface Refinery {
  id: string;
  name: string;
  system?: string;
  bonuses: Record<string, number>;
}

interface RefiningMethod {
  id: string;
  name: string;
  yieldMultiplier: number;
  timeMultiplier: number;
  costMultiplier: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TAB_CONFIG: { key: TabMode; label: string; icon: string }[] = [
  { key: "ship", label: "SHIP MINING", icon: "⛏" },
  { key: "roc", label: "ROC / FPS", icon: "💎" },
  { key: "salvage", label: "SALVAGE", icon: "♻" },
  { key: "share", label: "SHARE AUEC", icon: "🏛" },
];

const MOTRADER_FEE_PERCENT = 3.75;
const REFINERY_FEE_PERCENT = 5;

// ─── Color map for ore tier ─────────────────────────────────────────────────
function tierColor(tier: string): string {
  switch (tier) {
    case "premium": return "border-amber-500 bg-amber-500/20 text-amber-300";
    case "high": return "border-red-500 bg-red-500/15 text-red-300";
    case "mid": return "border-blue-500 bg-blue-500/15 text-blue-300";
    case "low": return "border-zinc-600 bg-zinc-700/40 text-zinc-300";
    default: return "border-zinc-700 bg-zinc-800/40 text-zinc-500";
  }
}

function tierColorSelected(tier: string): string {
  switch (tier) {
    case "premium": return "border-amber-400 bg-amber-500/50 text-amber-100 shadow-[0_0_10px_rgba(245,158,11,0.3)]";
    case "high": return "border-red-400 bg-red-500/40 text-red-100 shadow-[0_0_10px_rgba(239,68,68,0.3)]";
    case "mid": return "border-blue-400 bg-blue-500/40 text-blue-100 shadow-[0_0_10px_rgba(59,130,246,0.3)]";
    case "low": return "border-emerald-400 bg-emerald-500/30 text-emerald-100 shadow-[0_0_10px_rgba(16,185,129,0.3)]";
    default: return "border-zinc-500 bg-zinc-600/40 text-zinc-300";
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatAuec(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return v.toLocaleString("en-US");
  return v.toFixed(0);
}

function padZero(n: number): string {
  return n.toString().padStart(2, "0");
}

// ─── Timer Hook ──────────────────────────────────────────────────────────────

function useTimer() {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running]);

  const toggle = () => setRunning((r) => !r);
  const reset = () => { setRunning(false); setSeconds(0); };

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const display = `${padZero(h)}:${padZero(m)}:${padZero(s)}`;

  return { display, running, toggle, reset };
}

// ═════════════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════

export default function WorkOrderCalculator() {
  const typedMinerals = minerals as Mineral[];
  const typedRefineries = refineries as Refinery[];
  const typedMethods = refiningMethods as RefiningMethod[];

  // ── Tab state ──
  const [mode, setMode] = useState<TabMode>("ship");

  // ── Ore & refining state (Ship Mining) ──
  const [selectedRefinery, setSelectedRefinery] = useState(typedRefineries[0]?.id || "");
  const [selectedMethod, setSelectedMethod] = useState(typedMethods[0]?.id || "");
  const [selectedOres, setSelectedOres] = useState<Set<string>>(new Set());
  const [oreQuantities, setOreQuantities] = useState<Record<string, number>>({});

  // ── Selling state ──
  const [sellerName, setSellerName] = useState("You");
  const [sellPrice, setSellPrice] = useState(0);
  const [shareUnrefined, setShareUnrefined] = useState(false);
  const [showCompositeModal, setShowCompositeModal] = useState(false);
  const [compositeRows, setCompositeRows] = useState<CompositeSellRow[]>([
    { id: "c1", amount: 0 },
  ]);

  // ── Expenses state ──
  const [expenses, setExpenses] = useState<Expense[]>([
    { id: "exp1", claimant: "You", name: "Refinery Fee", amount: 0 },
  ]);

  // ── moTrader toggle ──
  const [includeMotrader, setIncludeMotrader] = useState(true);

  // ── Crew / Profit Shares ──
  const [crew, setCrew] = useState<CrewMember[]>([
    { id: "crew1", name: "You", shareType: "equal", share: 1 },
  ]);
  const [newMemberName, setNewMemberName] = useState("");

  // ── Timer ──
  const timer = useTimer();

  // ── Derived minerals for current tab ──
  const tabMinerals = useMemo(() => {
    if (mode === "ship") return typedMinerals.filter((m) => m.type === "ship");
    if (mode === "roc") return typedMinerals.filter((m) => m.type === "hand");
    if (mode === "salvage") return typedMinerals.filter((m) => m.type === "salvage");
    return [];
  }, [mode, typedMinerals]);

  const refinery = typedRefineries.find((r) => r.id === selectedRefinery);
  const method = typedMethods.find((m) => m.id === selectedMethod);

  // ── Unit label per mode ──
  const unitLabel = mode === "ship" ? "cSCU" : mode === "roc" ? "mSCU" : "SCU";

  // ── Calculate refined value (ship mining only) ──
  const refinedValue = useMemo(() => {
    if (mode !== "ship" || !refinery || !method) return 0;
    let total = 0;
    selectedOres.forEach((oreId) => {
      const qty = oreQuantities[oreId] || 0;
      if (qty <= 0) return;
      const mineral = typedMinerals.find((m) => m.id === oreId);
      if (!mineral) return;
      const bonus = refinery.bonuses[oreId] || 0;
      const refined = qty * (method.yieldMultiplier + bonus / 100);
      total += refined * mineral.basePrice;
    });
    return Math.round(total);
  }, [mode, selectedOres, oreQuantities, refinery, method, typedMinerals]);

  // ── Auto-set sell price from refined value when available ──
  const effectiveSellPrice = mode === "ship" && sellPrice === 0 && refinedValue > 0
    ? refinedValue
    : sellPrice;

  // ── Calculate total expenses ──
  const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  // ── moTrader fee ──
  const motraderFee = includeMotrader
    ? Math.round(effectiveSellPrice * MOTRADER_FEE_PERCENT / 100)
    : 0;

  // ── Net profit ──
  const netProfit = effectiveSellPrice - totalExpenses - motraderFee;

  // ── Crew payouts ──
  const totalShares = crew.reduce((sum, m) => sum + m.share, 0);
  const crewPayouts = crew.map((m) => ({
    ...m,
    payout: totalShares > 0 ? Math.round((netProfit * m.share) / totalShares) : 0,
  }));

  // ── Ore toggle ──
  const toggleOre = useCallback((oreId: string) => {
    setSelectedOres((prev) => {
      const next = new Set(prev);
      if (next.has(oreId)) {
        next.delete(oreId);
        setOreQuantities((q) => { const c = { ...q }; delete c[oreId]; return c; });
      } else {
        next.add(oreId);
      }
      return next;
    });
  }, []);

  const selectAllOres = () => {
    setSelectedOres(new Set(tabMinerals.map((m) => m.id)));
  };

  const selectNoneOres = () => {
    setSelectedOres(new Set());
    setOreQuantities({});
  };

  // ── Reset on tab change ──
  useEffect(() => {
    setSelectedOres(new Set());
    setOreQuantities({});
    setSellPrice(0);
  }, [mode]);

  // ── Expense helpers ──
  const addExpense = () => {
    setExpenses([...expenses, {
      id: `exp${Date.now()}`,
      claimant: sellerName,
      name: "",
      amount: 0,
    }]);
  };

  const clearExpenses = () => {
    setExpenses([]);
  };

  const updateExpense = (id: string, field: keyof Expense, value: any) => {
    setExpenses(expenses.map((e) => e.id === id ? { ...e, [field]: value } : e));
  };

  const removeExpense = (id: string) => {
    setExpenses(expenses.filter((e) => e.id !== id));
  };

  // ── Crew helpers ──
  const addCrewMember = () => {
    const name = newMemberName.trim() || `Crew ${crew.length + 1}`;
    setCrew([...crew, {
      id: `crew${Date.now()}`,
      name,
      shareType: "equal",
      share: 1,
    }]);
    setNewMemberName("");
  };

  const clearCrew = () => {
    setCrew([{ id: "crew1", name: sellerName, shareType: "equal", share: 1 }]);
  };

  const removeCrewMember = (id: string) => {
    if (crew.length > 1) setCrew(crew.filter((m) => m.id !== id));
  };

  // ── Composite sell price modal helpers ──
  const compositeTotal = compositeRows.reduce((sum, r) => sum + (r.amount || 0), 0);

  const addCompositeRow = () => {
    setCompositeRows([...compositeRows, { id: `cr${Date.now()}`, amount: 0 }]);
  };

  const acceptComposite = () => {
    setSellPrice(compositeTotal);
    setShowCompositeModal(false);
  };

  // ── Yield for ship mining ──
  const getYield = (oreId: string, qty: number) => {
    if (!refinery || !method || qty <= 0) return 0;
    const bonus = refinery.bonuses[oreId] || 0;
    return Math.round(qty * (method.yieldMultiplier + bonus / 100) * 100) / 100;
  };

  // ═════════════════════════════════════════════════════════════════════════════
  //  RENDER
  // ═════════════════════════════════════════════════════════════════════════════

  return (
    <div className="max-w-6xl mx-auto space-y-0">
      {/* ── Tab Bar ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-0 mb-6 border border-zinc-700/60 rounded-lg overflow-hidden">
        {TAB_CONFIG.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setMode(tab.key)}
            className={`py-3 text-center text-xs tracking-[0.1em] uppercase font-bold transition-all
              ${mode === tab.key
                ? "bg-amber-500 text-zinc-900 shadow-[0_0_15px_rgba(245,158,11,0.3)]"
                : "bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200"
              }`}
          >
            <div className="text-lg mb-0.5">{tab.icon}</div>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Main Content (two panels) ───────────────────────────────── */}
      <div className={`grid gap-6 ${mode === "share" ? "grid-cols-1 max-w-xl mx-auto" : "grid-cols-1 lg:grid-cols-2"}`}>
        {/* ═══════════════════════════════════════════════════════════ */}
        {/* LEFT PANEL — Materials / Ore Chooser                       */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {mode !== "share" && (
          <div className="bg-zinc-900/70 border border-amber-500/30 rounded-lg overflow-hidden">
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-amber-500/20 bg-zinc-900/50">
              <h3 className="text-sm font-bold tracking-[0.1em] uppercase text-amber-400">
                {mode === "ship" ? "Ship Ores / Refining" : mode === "roc" ? "Mineable Gems" : "Salvage"}
              </h3>
              <span className="text-zinc-600 cursor-help text-lg" title="Select materials and enter quantities">❓</span>
            </div>

            <div className="p-4 space-y-4">
              {/* ── Refinery + Method dropdowns (ship only) ── */}
              {mode === "ship" && (
                <>
                  <select
                    value={selectedRefinery}
                    onChange={(e) => setSelectedRefinery(e.target.value)}
                    className="w-full bg-zinc-800/70 border border-zinc-700 rounded px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-amber-500/50"
                  >
                    {typedRefineries.map((ref) => (
                      <option key={ref.id} value={ref.id}>
                        {ref.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={selectedMethod}
                    onChange={(e) => setSelectedMethod(e.target.value)}
                    className="w-full bg-zinc-800/70 border border-zinc-700 rounded px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-amber-500/50"
                  >
                    {typedMethods.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </>
              )}

              {/* ── Ore Chooser Grid ── */}
              <div>
                <div className="text-[10px] tracking-[0.15em] uppercase text-amber-500 font-bold mb-2">
                  Ore Chooser:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {tabMinerals.map((mineral) => {
                    const isSelected = selectedOres.has(mineral.id);
                    return (
                      <button
                        key={mineral.id}
                        onClick={() => toggleOre(mineral.id)}
                        className={`px-2.5 py-1 rounded text-[11px] font-bold tracking-wider border transition-all
                          ${isSelected ? tierColorSelected(mineral.tier) : tierColor(mineral.tier)}
                          hover:brightness-110`}
                      >
                        {mineral.abbr || mineral.id}
                      </button>
                    );
                  })}
                  {/* ALL / NONE buttons */}
                  <button
                    onClick={selectAllOres}
                    className="px-2.5 py-1 rounded text-[11px] font-bold tracking-wider border border-blue-500 bg-blue-500/30 text-blue-200 hover:bg-blue-500/50 transition-all"
                  >
                    ALL
                  </button>
                  <button
                    onClick={selectNoneOres}
                    className="px-2.5 py-1 rounded text-[11px] font-bold tracking-wider border border-zinc-500 bg-zinc-700/50 text-zinc-200 hover:bg-zinc-600/50 transition-all"
                  >
                    NONE
                  </button>
                </div>
              </div>

              {/* ── Material Table ── */}
              <div>
                <div className="flex items-center justify-between text-[10px] tracking-[0.15em] uppercase text-zinc-500 font-bold border-b border-zinc-700/50 pb-1 mb-2">
                  <span className="flex-1">Material</span>
                  <span className="w-24 text-right">
                    QTY<br />
                    <span className="text-zinc-600">({unitLabel})</span>
                  </span>
                  {mode === "ship" && (
                    <span className="w-20 text-right">
                      Yield<br />
                      <span className="text-zinc-600">({unitLabel})</span>
                    </span>
                  )}
                </div>

                {selectedOres.size === 0 && (
                  <p className="text-center text-amber-600 text-sm py-4 italic">
                    No ore is selected
                  </p>
                )}

                <div className="space-y-1">
                  {tabMinerals
                    .filter((m) => selectedOres.has(m.id))
                    .map((mineral) => (
                      <div
                        key={mineral.id}
                        className="flex items-center gap-2 py-1 border-b border-zinc-800/40"
                      >
                        <span className="flex-1 text-xs font-bold text-zinc-200 uppercase tracking-wider">
                          {mineral.name}
                        </span>
                        <input
                          type="number"
                          min="0"
                          value={oreQuantities[mineral.id] || ""}
                          onChange={(e) =>
                            setOreQuantities((prev) => ({
                              ...prev,
                              [mineral.id]: parseFloat(e.target.value) || 0,
                            }))
                          }
                          className="w-24 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1 text-sm text-right text-amber-200 font-mono focus:outline-none focus:border-amber-400"
                          placeholder="0"
                        />
                        {mode === "ship" && (
                          <span className="w-20 text-right text-xs font-mono text-zinc-400">
                            {getYield(mineral.id, oreQuantities[mineral.id] || 0)}
                          </span>
                        )}
                      </div>
                    ))}
                </div>
              </div>

              {/* ── Salvage info box ── */}
              {mode === "salvage" && (
                <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 mt-2">
                  <div className="flex items-start gap-2">
                    <span className="text-blue-400 text-sm">ℹ</span>
                    <div>
                      <div className="text-sm font-bold text-zinc-200">Cargo & Component Salvage?</div>
                      <p className="text-[11px] text-zinc-400 mt-1">
                        Use the composite add tool <span className="inline-block w-4 h-4 bg-zinc-700 rounded text-[9px] text-center leading-4">📦</span> to add component and cargo sales to the <strong className="text-zinc-300">Final Sell Price</strong> of this order.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Timer (ship mining only) ── */}
              {mode === "ship" && (
                <div className="mt-4">
                  <div
                    className={`w-full rounded-lg py-3 text-center font-mono text-2xl font-bold cursor-pointer select-none transition-all
                      ${timer.running
                        ? "bg-emerald-500 text-zinc-900 shadow-[0_0_15px_rgba(16,185,129,0.4)]"
                        : "bg-amber-500 text-zinc-900 shadow-[0_0_10px_rgba(245,158,11,0.3)]"
                      }`}
                    onClick={timer.toggle}
                    onContextMenu={(e) => { e.preventDefault(); timer.reset(); }}
                    title="Click to start/stop — Right-click to reset"
                  >
                    {timer.display}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* RIGHT PANEL — Selling & Profit Sharing                     */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <div className="bg-zinc-900/70 border border-zinc-700/60 rounded-lg overflow-hidden">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700/40 bg-zinc-900/50">
            <h3 className="text-sm font-bold tracking-[0.1em] uppercase text-zinc-300">
              Selling & Profit Sharing
            </h3>
            <span className="text-zinc-600 cursor-help text-lg" title="Set sell price and split profits">❓</span>
          </div>

          <div className="p-4 space-y-5">
            {/* ── Market Price UEX section ── */}
            {mode !== "share" && (
              <div className="border border-zinc-700/40 rounded-lg p-3 text-center">
                <div className="text-[10px] tracking-[0.15em] uppercase text-amber-500 font-bold mb-1">
                  Market Price (UEX):
                </div>
                <div className="text-xs text-zinc-500 italic">No stores found</div>
              </div>
            )}

            {/* ── Seller / Purser ── */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] tracking-[0.15em] uppercase text-amber-500 font-bold">
                Seller / Purser:
              </span>
              <input
                type="text"
                value={sellerName}
                onChange={(e) => setSellerName(e.target.value)}
                className="bg-transparent text-right text-lg font-bold text-zinc-100 focus:outline-none border-b border-transparent focus:border-amber-500/50 w-40"
              />
            </div>

            {/* ── Final Sell Price / Share Amount ── */}
            <div>
              <div className="text-[10px] tracking-[0.15em] uppercase text-amber-500 font-bold mb-2">
                {mode === "share" ? "Share Amount (Gross Profit):" : "Final Sell Price (Gross Profit):"}
              </div>
              {mode === "share" && (
                <p className="text-[11px] text-zinc-500 mb-2">
                  Type in the aUEC amount you want to share
                </p>
              )}
              <div className="flex items-center gap-2 bg-zinc-800/50 border border-zinc-700 rounded-lg p-2">
                <button
                  className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center hover:bg-amber-500/30 transition-colors text-sm"
                  onClick={() => setSellPrice(0)}
                  title="Reset price"
                >
                  ↺
                </button>
                <input
                  type="number"
                  min="0"
                  value={sellPrice || ""}
                  onChange={(e) => setSellPrice(parseFloat(e.target.value) || 0)}
                  className="flex-1 bg-transparent text-right text-lg font-mono font-bold text-zinc-100 focus:outline-none"
                  placeholder="0"
                />
                <span className="text-xs text-zinc-500 font-bold">aUEC</span>
                {mode !== "share" && (
                  <button
                    className="w-8 h-8 rounded bg-zinc-700/50 border border-zinc-600 text-zinc-400 flex items-center justify-center hover:bg-zinc-600/50 transition-colors text-[11px]"
                    onClick={() => setShowCompositeModal(true)}
                    title="Composite Sell Price"
                  >
                    📦
                  </button>
                )}
              </div>
            </div>

            {/* ── Share Unrefined Value toggle (ship only) ── */}
            {mode === "ship" && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShareUnrefined(!shareUnrefined)}
                  className={`w-10 h-5 rounded-full transition-all relative
                    ${shareUnrefined ? "bg-amber-500" : "bg-zinc-700"}`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all
                      ${shareUnrefined ? "left-5" : "left-0.5"}`}
                  />
                </button>
                <span className="text-[11px] text-zinc-400">Share Unrefined Value</span>
              </div>
            )}

            {/* ── Expenses ── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] tracking-[0.15em] uppercase text-amber-500 font-bold">
                  Expenses:
                </span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={addExpense}
                    className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                  >
                    <span className="text-sm">⊕</span> ADD EXPENSE
                  </button>
                  <button
                    onClick={clearExpenses}
                    className="text-[10px] font-bold text-red-400 hover:text-red-300 flex items-center gap-1"
                  >
                    <span className="text-sm">⊗</span> CLEAR ALL
                  </button>
                </div>
              </div>

              <div className="border border-amber-500/20 rounded-lg overflow-hidden">
                {/* Expenses table header */}
                <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 px-3 py-1.5 bg-zinc-800/40 text-[10px] tracking-[0.1em] uppercase text-zinc-500 font-bold border-b border-zinc-700/40">
                  <span>Claimant</span>
                  <span>Expense Name</span>
                  <span className="text-right">Amount</span>
                  <span></span>
                </div>

                {expenses.length === 0 && (
                  <div className="px-3 py-3 text-center text-xs text-zinc-600 italic">
                    No Expenses
                  </div>
                )}

                {expenses.map((exp) => (
                  <div
                    key={exp.id}
                    className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 px-3 py-1.5 border-b border-zinc-800/30 items-center"
                  >
                    <input
                      type="text"
                      value={exp.claimant}
                      onChange={(e) => updateExpense(exp.id, "claimant", e.target.value)}
                      className="bg-transparent text-xs text-zinc-200 focus:outline-none border-b border-transparent focus:border-amber-500/50"
                    />
                    <input
                      type="text"
                      value={exp.name}
                      onChange={(e) => updateExpense(exp.id, "name", e.target.value)}
                      placeholder="Expense name"
                      className="bg-transparent text-xs text-zinc-200 focus:outline-none border-b border-transparent focus:border-amber-500/50"
                    />
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        value={exp.amount || ""}
                        onChange={(e) => updateExpense(exp.id, "amount", parseFloat(e.target.value) || 0)}
                        className="w-20 bg-transparent text-xs text-right font-mono text-zinc-200 focus:outline-none border-b border-transparent focus:border-amber-500/50"
                        placeholder="0"
                      />
                      <span className="text-[10px] text-zinc-600">aUEC</span>
                    </div>
                    <button
                      onClick={() => removeExpense(exp.id)}
                      className="text-red-500 hover:text-red-400 text-sm"
                    >
                      ⊗
                    </button>
                  </div>
                ))}

                {/* Total expenses row */}
                <div className="px-3 py-2 bg-zinc-800/20 flex justify-between items-center text-xs">
                  <span className="text-zinc-400 font-bold">Total Expenses:</span>
                  <span className="font-mono font-bold text-zinc-200">
                    {formatAuec(totalExpenses)} <span className="text-zinc-600 text-[10px]">aUEC</span>
                  </span>
                </div>
              </div>
            </div>

            {/* ── moTrader Transfer Fee ── */}
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setIncludeMotrader(!includeMotrader)}
                className={`w-10 h-5 rounded-full transition-all relative
                  ${includeMotrader ? "bg-amber-500" : "bg-zinc-700"}`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all
                    ${includeMotrader ? "left-5" : "left-0.5"}`}
                />
              </button>
              <span className="text-[11px] text-zinc-400">Include moTrader Transfer Fee</span>
            </div>

            {/* ── Profit Shares ── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] tracking-[0.15em] uppercase text-amber-500 font-bold">
                  Profit Shares:
                </span>
                <button
                  onClick={clearCrew}
                  className="text-[10px] font-bold text-red-400 hover:text-red-300 flex items-center gap-1"
                >
                  <span className="text-sm">⊗</span> CLEAR ALL
                </button>
              </div>

              {/* Add member input */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-zinc-600 text-lg">👥</span>
                <input
                  type="text"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addCrewMember()}
                  placeholder="Type a session user or friend nam..."
                  className="flex-1 bg-transparent text-xs text-zinc-200 border-b border-zinc-700 focus:outline-none focus:border-amber-500/50 pb-1"
                />
                <button
                  onClick={addCrewMember}
                  className="text-amber-400 hover:text-amber-300 text-xl leading-none"
                  title="Add member"
                >
                  +
                </button>
              </div>

              {/* Crew table */}
              <div className="border border-amber-500/20 rounded-lg overflow-hidden">
                <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-3 py-1.5 bg-zinc-800/40 text-[10px] tracking-[0.1em] uppercase text-zinc-500 font-bold border-b border-zinc-700/40">
                  <span>Username</span>
                  <span>Share</span>
                  <span></span>
                  <span className="text-right">aUEC</span>
                  <span>Note</span>
                </div>

                {crewPayouts.map((member) => (
                  <div
                    key={member.id}
                    className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-3 py-2 border-b border-zinc-800/30 items-center"
                  >
                    <span className="text-xs font-bold text-zinc-200">{member.name}</span>
                    <select
                      value={member.shareType}
                      onChange={(e) =>
                        setCrew(crew.map((c) => c.id === member.id
                          ? { ...c, shareType: e.target.value as "equal" | "fixed" }
                          : c
                        ))
                      }
                      className="bg-zinc-800/50 border border-zinc-700 rounded text-[10px] text-zinc-300 px-1.5 py-0.5 focus:outline-none"
                    >
                      <option value="equal">⚖</option>
                      <option value="fixed">💰</option>
                    </select>
                    <input
                      type="number"
                      min="0"
                      value={member.share}
                      onChange={(e) =>
                        setCrew(crew.map((c) => c.id === member.id
                          ? { ...c, share: parseFloat(e.target.value) || 0 }
                          : c
                        ))
                      }
                      className="w-12 bg-transparent text-xs text-center font-mono text-zinc-200 border-b border-zinc-700 focus:outline-none focus:border-amber-500/50"
                    />
                    <span className={`text-xs font-mono font-bold text-right min-w-[60px] ${member.payout > 0 ? "text-amber-400" : "text-zinc-500"}`}>
                      {formatAuec(member.payout)}
                    </span>
                    <button
                      onClick={() => removeCrewMember(member.id)}
                      className="text-zinc-600 hover:text-zinc-400 text-sm"
                      title="Remove"
                    >
                      📥
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer Note ────────────────────────────────────────────── */}
      <div className="mt-6 bg-blue-500/5 border border-blue-500/20 rounded-lg p-4 flex items-start gap-3">
        <span className="text-blue-400 text-lg">ℹ</span>
        <p className="text-xs text-zinc-400 leading-relaxed">
          <strong className="text-zinc-300">NOTE:</strong> This is a standalone calculator. If you want to work on more than one order,
          store consecutive orders or share your work orders with friends then consider logging in and
          creating/joining a <strong className="text-zinc-300">session</strong> from the dashboard.
          Work orders inside Sessions can be captured automatically from the game or by uploading screenshots using OCR.
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* Composite Sell Price Modal                                      */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {showCompositeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border-2 border-amber-500 rounded-xl p-6 w-full max-w-md shadow-[0_0_30px_rgba(245,158,11,0.2)]">
            <h3 className="text-xl font-bold text-zinc-100 mb-4">Composite Sell Price</h3>

            <div className="flex justify-end mb-3">
              <button
                onClick={addCompositeRow}
                className="text-[11px] font-bold text-amber-400 hover:text-amber-300"
              >
                + ADD ROW
              </button>
            </div>

            <div className="space-y-2 mb-4">
              {compositeRows.map((row, i) => (
                <div key={row.id} className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-zinc-800 text-center text-xs leading-6 text-zinc-500">{i + 1}</span>
                  <input
                    type="number"
                    min="0"
                    value={row.amount || ""}
                    onChange={(e) =>
                      setCompositeRows(compositeRows.map((r) =>
                        r.id === row.id ? { ...r, amount: parseFloat(e.target.value) || 0 } : r
                      ))
                    }
                    className="flex-1 bg-zinc-800/50 border border-zinc-700 rounded px-3 py-2 text-sm font-mono text-right text-zinc-100 focus:outline-none focus:border-amber-500"
                    placeholder="0"
                  />
                  <span className="text-xs text-zinc-500">aUEC</span>
                  <button
                    onClick={() => setCompositeRows(compositeRows.filter((r) => r.id !== row.id))}
                    className="text-red-500 hover:text-red-400"
                  >
                    ⊗
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between py-3 border-t border-zinc-700">
              <span className="text-sm text-zinc-300 font-bold">Final Total:</span>
              <span className="text-xl font-mono font-bold text-amber-400">
                {formatAuec(compositeTotal)} <span className="text-sm text-zinc-500">aUEC</span>
              </span>
            </div>

            <p className="text-[11px] text-zinc-600 mb-4">
              Use <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400">Tab</kbd> to add a new row.
              Use <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400">Enter</kbd> to accept and return.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowCompositeModal(false)}
                className="flex-1 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm font-bold hover:bg-zinc-700 transition-colors flex items-center justify-center gap-2"
              >
                <span className="text-red-400">⊗</span> CANCEL
              </button>
              <button
                onClick={acceptComposite}
                className="flex-1 py-2.5 rounded-lg bg-amber-500 text-zinc-900 text-sm font-bold hover:bg-amber-400 transition-colors flex items-center justify-center gap-2"
              >
                <span>✓</span> ACCEPT
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
