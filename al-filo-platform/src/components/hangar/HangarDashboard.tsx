"use client";

import { useState } from "react";
import { useHangarStore, type InsuranceType, type ItemCategory, type CCUChain } from "@/store/useHangarStore";
import { FleetGrid } from "./FleetGrid";
import { ImportModal } from "./ImportModal";
import { AddShipModal } from "./AddShipModal";
import { CCUGrid } from "./CCUGrid";
import { AddCCUModal } from "./AddCCUModal";
import { ChainList } from "./ChainList";
import { ChainBuilder } from "./ChainBuilder";

type TabType = "My Fleet" | "Buyback" | "CCU Chains";

const CATEGORY_OPTIONS: { value: ItemCategory | "all" | "ccu"; label: string }[] = [
  { value: "all", label: "All Items" },
  { value: "standalone_ship", label: "Ships" },
  { value: "game_package", label: "Packages" },
  { value: "ccu", label: "CCU / Upgrades" },
  { value: "paint", label: "Paints" },
  { value: "gear", label: "Gear / Armor" },
  { value: "flair", label: "Flair" },
  { value: "subscriber", label: "Subscriber" },
  { value: "other", label: "Other" },
];

export function HangarDashboard() {
  const [activeTab, setActiveTab] = useState<TabType>("My Fleet");
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddShipModal, setShowAddShipModal] = useState(false);
  const [showAddCCUModal, setShowAddCCUModal] = useState(false);
  const [showChainBuilder, setShowChainBuilder] = useState(false);
  const [editingChain, setEditingChain] = useState<CCUChain | undefined>(undefined);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showBulkMoveConfirm, setShowBulkMoveConfirm] = useState(false);

  // Shared filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterInsurance, setFilterInsurance] = useState<InsuranceType | "all">("all");
  const [filterCategory, setFilterCategory] = useState<ItemCategory | "all" | "ccu">("all");
  const [sortBy, setSortBy] = useState<"name" | "price" | "date">("name");

  const ships = useHangarStore((state) => state.ships);
  const ccus = useHangarStore((state) => state.ccus);
  const chains = useHangarStore((state) => state.chains);
  const exportToJSON = useHangarStore((state) => state.exportToJSON);
  const clearAll = useHangarStore((state) => state.clearAll);
  const updateShip = useHangarStore((state) => state.updateShip);

  // ── Split by location ──
  const fleetShips = ships.filter((s) => s.location === "hangar");
  const buybackShips = ships.filter((s) => s.location === "buyback");
  const fleetCCUs = ccus.filter((c) => c.location === "hangar");
  const buybackCCUs = ccus.filter((c) => c.location === "buyback");

  // ── Category counts (for active tab) ──
  const getCountsByCategory = (items: typeof ships, ccuItems: typeof ccus) => {
    const counts: Record<string, number> = { all: items.length + ccuItems.length, ccu: ccuItems.length };
    items.forEach((s) => { counts[s.itemCategory] = (counts[s.itemCategory] || 0) + 1; });
    return counts;
  };

  const isFleetTab = activeTab === "My Fleet";
  const isBuybackTab = activeTab === "Buyback";
  const sourceShips = isFleetTab ? fleetShips : isBuybackTab ? buybackShips : [];
  const sourceCCUs = isFleetTab ? fleetCCUs : isBuybackTab ? buybackCCUs : [];
  const categoryCounts = getCountsByCategory(sourceShips, sourceCCUs);

  // ── Fleet stats ──
  const fleetShipCount = fleetShips.filter((s) => s.itemCategory === "standalone_ship" || s.itemCategory === "game_package").length;
  const fleetValue = fleetShips.reduce((sum, s) => sum + s.pledgePrice, 0) + fleetCCUs.reduce((sum, c) => sum + c.pricePaid, 0);
  const buybackValue = buybackShips.reduce((sum, s) => sum + s.pledgePrice, 0) + buybackCCUs.reduce((sum, c) => sum + c.pricePaid, 0);
  const totalCCUValue = ccus.reduce((sum, c) => sum + c.pricePaid, 0);

  // ── Filter and sort items ──
  const showCCUs = filterCategory === "all" || filterCategory === "ccu";
  const showItems = filterCategory !== "ccu";

  let filteredShips = showItems ? sourceShips.filter((ship) => {
    const name = (ship.shipName || ship.pledgeName || "").toLowerCase();
    const matchesSearch = searchQuery === "" || name.includes(searchQuery.toLowerCase()) || ship.pledgeName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesInsurance = filterInsurance === "all" || ship.insuranceType === filterInsurance;
    const matchesCategory = filterCategory === "all" || ship.itemCategory === filterCategory;
    return matchesSearch && matchesInsurance && matchesCategory;
  }) : [];

  if (sortBy === "name") filteredShips.sort((a, b) => (a.shipName || a.pledgeName).localeCompare(b.shipName || b.pledgeName));
  else if (sortBy === "price") filteredShips.sort((a, b) => b.pledgePrice - a.pledgePrice);
  else if (sortBy === "date") filteredShips.sort((a, b) => {
    const dateA = a.purchasedDate ? new Date(a.purchasedDate).getTime() : 0;
    const dateB = b.purchasedDate ? new Date(b.purchasedDate).getTime() : 0;
    return dateB - dateA;
  });

  let filteredCCUs = showCCUs ? sourceCCUs.filter((ccu) => {
    const matchesSearch = searchQuery === "" ||
      ccu.fromShip.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ccu.toShip.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  }) : [];

  if (sortBy === "name") filteredCCUs.sort((a, b) => a.fromShip.localeCompare(b.fromShip));
  else if (sortBy === "price") filteredCCUs.sort((a, b) => b.pricePaid - a.pricePaid);

  const handleExport = () => {
    const json = exportToJSON();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `hangar-backup-${new Date().toISOString().split("T")[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleBulkMoveToFleet = () => {
    buybackShips.forEach((ship) => { updateShip(ship.id, { location: "hangar" }); });
    setShowBulkMoveConfirm(false);
  };

  const handleOpenChainBuilder = (chain?: CCUChain) => { setEditingChain(chain); setShowChainBuilder(true); };
  const handleCloseChainBuilder = () => { setShowChainBuilder(false); setEditingChain(undefined); };

  // Reset category filter when switching tabs
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setFilterCategory("all");
    setSearchQuery("");
  };

  // Tab config
  const TABS: { id: TabType; label: string; count: number }[] = [
    { id: "My Fleet", label: "My Fleet", count: fleetShips.length + fleetCCUs.length },
    { id: "Buyback", label: "Buyback", count: buybackShips.length + buybackCCUs.length },
    { id: "CCU Chains", label: "CCU Chains", count: chains.length },
  ];

  return (
    <div className="space-y-6">
      {/* ── Tab Navigation ── */}
      <div className="flex gap-1 border-b border-zinc-800/50 pb-4 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`px-4 py-2 text-sm font-medium tracking-wide transition-all duration-300 border-b-2 whitespace-nowrap ${
              activeTab === tab.id
                ? "border-amber-500 text-amber-400"
                : "border-transparent text-zinc-400 hover:text-zinc-300"
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={`ml-2 text-[10px] ${activeTab === tab.id ? "text-amber-500/70" : "text-zinc-600"}`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}

        {/* Import / Export / Clear */}
        <div className="ml-auto flex gap-2 pl-4 items-center">
          <button onClick={() => setShowImportModal(true)} className="px-3 py-1.5 bg-amber-500/20 border border-amber-500/50 rounded-sm text-amber-400 text-[12px] font-medium hover:bg-amber-500/30 transition-all duration-300">Import</button>
          <button onClick={handleExport} className="px-3 py-1.5 bg-cyan-500/20 border border-cyan-500/50 rounded-sm text-cyan-400 text-[12px] font-medium hover:bg-cyan-500/30 transition-all duration-300">Export</button>
          {showClearConfirm ? (
            <div className="flex gap-1.5 items-center">
              <span className="text-[11px] text-red-400">Clear all?</span>
              <button onClick={() => { clearAll(); setShowClearConfirm(false); }} className="px-2 py-1 bg-red-500/30 border border-red-500/50 rounded-sm text-red-400 text-[11px] font-medium hover:bg-red-500/40 transition-all duration-300">Yes</button>
              <button onClick={() => setShowClearConfirm(false)} className="px-2 py-1 bg-zinc-800/50 border border-zinc-700/50 rounded-sm text-zinc-400 text-[11px] hover:bg-zinc-800 transition-all duration-300">No</button>
            </div>
          ) : (
            <button onClick={() => setShowClearConfirm(true)} className="px-3 py-1.5 bg-red-500/10 border border-red-500/30 rounded-sm text-red-400/70 text-[12px] font-medium hover:bg-red-500/20 hover:text-red-400 transition-all duration-300">Clear</button>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
         MY FLEET / BUYBACK TAB — All items by location
         ════════════════════════════════════════════════════════════════════════ */}
      {(activeTab === "My Fleet" || activeTab === "Buyback") && (
        <div className="space-y-5">
          {/* Stats */}
          {activeTab === "My Fleet" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Active Ships" value={fleetShipCount.toString()} accent="cyan" />
              <StatCard label="Fleet Value" value={`$${fleetValue.toLocaleString()}`} accent="emerald" />
              <StatCard label="All Items" value={(fleetShips.length + fleetCCUs.length).toString()} />
              <StatCard label="Total Investment" value={`$${(fleetValue + buybackValue + totalCCUValue).toLocaleString()}`} accent="amber" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Buyback Items" value={(buybackShips.length + buybackCCUs.length).toString()} accent="orange" />
              <StatCard label="Buyback Value" value={`$${buybackValue.toLocaleString()}`} accent="amber" />
              <StatCard label="Ships" value={buybackShips.filter((s) => s.itemCategory === "standalone_ship" || s.itemCategory === "game_package").length.toString()} />
              <StatCard label="CCUs" value={buybackCCUs.length.toString()} />
            </div>
          )}

          {/* Buyback info banner with bulk move */}
          {activeTab === "Buyback" && buybackShips.length > 0 && (
            <div className="p-3 bg-orange-500/10 border border-orange-500/20 rounded-sm flex items-center justify-between gap-4">
              <p className="text-[12px] text-orange-300/80">
                Use <span className="text-orange-300">&quot;→ Fleet&quot;</span> on each card to move items, or move them all at once.
              </p>
              {showBulkMoveConfirm ? (
                <div className="flex gap-1.5 items-center shrink-0">
                  <span className="text-[11px] text-cyan-400">Move {buybackShips.length} to fleet?</span>
                  <button onClick={handleBulkMoveToFleet} className="px-2 py-1 bg-cyan-500/30 border border-cyan-500/50 rounded-sm text-cyan-400 text-[11px] font-medium hover:bg-cyan-500/40 transition-all duration-300">Yes</button>
                  <button onClick={() => setShowBulkMoveConfirm(false)} className="px-2 py-1 bg-zinc-800/50 border border-zinc-700/50 rounded-sm text-zinc-400 text-[11px] hover:bg-zinc-800 transition-all duration-300">No</button>
                </div>
              ) : (
                <button onClick={() => setShowBulkMoveConfirm(true)} className="shrink-0 px-3 py-1.5 bg-cyan-500/20 border border-cyan-500/50 rounded-sm text-cyan-400 text-[11px] font-medium hover:bg-cyan-500/30 transition-all duration-300">Move All to Fleet</button>
              )}
            </div>
          )}

          {/* Empty fleet → redirect to buyback */}
          {activeTab === "My Fleet" && fleetShips.length === 0 && fleetCCUs.length === 0 && (buybackShips.length > 0 || buybackCCUs.length > 0) && (
            <div className="text-center py-16 px-8">
              <p className="text-lg text-zinc-400 font-medium mb-2">Your fleet is empty</p>
              <p className="text-sm text-zinc-500 mb-4 max-w-lg mx-auto">
                All your items ({buybackShips.length + buybackCCUs.length}) are in the Buyback tab. You can move them to your active fleet.
              </p>
              <button onClick={() => handleTabChange("Buyback")} className="px-6 py-2.5 bg-orange-500/20 border border-orange-500/50 rounded-sm text-orange-400 text-sm font-medium hover:bg-orange-500/30 transition-all duration-300">Go to Buyback Tab</button>
            </div>
          )}

          {/* Category filter chips */}
          {(sourceShips.length > 0 || sourceCCUs.length > 0) && (
            <>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORY_OPTIONS.map((opt) => {
                  const count = categoryCounts[opt.value] || 0;
                  if (count === 0 && opt.value !== "all") return null;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setFilterCategory(opt.value)}
                      className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all duration-200 ${
                        filterCategory === opt.value
                          ? "bg-amber-500/30 text-amber-400 border border-amber-500/50"
                          : "bg-zinc-800/50 text-zinc-400 border border-zinc-700/30 hover:border-zinc-600/50"
                      }`}
                    >
                      {opt.label}
                      {count > 0 && <span className="ml-1.5 text-[9px] opacity-60">{count}</span>}
                    </button>
                  );
                })}
              </div>

              {/* Search + sort + actions */}
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  placeholder="Search items..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 px-3 py-2 bg-zinc-900/60 border border-zinc-800/50 rounded-sm text-zinc-100 text-sm placeholder-zinc-500 focus:outline-none focus:border-amber-500/50 transition-all duration-300"
                />
                <select value={filterInsurance} onChange={(e) => setFilterInsurance(e.target.value as InsuranceType | "all")} className="px-3 py-2 bg-zinc-900/60 border border-zinc-800/50 rounded-sm text-zinc-100 text-sm focus:outline-none focus:border-amber-500/50 transition-all duration-300">
                  <option value="all">All Insurance</option>
                  <option value="LTI">LTI</option>
                  <option value="120_months">120 Months</option>
                  <option value="72_months">72 Months</option>
                  <option value="48_months">48 Months</option>
                  <option value="24_months">24 Months</option>
                  <option value="6_months">6 Months</option>
                  <option value="3_months">3 Months</option>
                  <option value="unknown">Unknown</option>
                </select>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value as "name" | "price" | "date")} className="px-3 py-2 bg-zinc-900/60 border border-zinc-800/50 rounded-sm text-zinc-100 text-sm focus:outline-none focus:border-amber-500/50 transition-all duration-300">
                  <option value="name">Sort: Name</option>
                  <option value="price">Sort: Price</option>
                  <option value="date">Sort: Date</option>
                </select>
                <button onClick={() => setShowAddShipModal(true)} className="px-4 py-2 bg-amber-500/20 border border-amber-500/50 rounded-sm text-amber-400 text-sm font-medium hover:bg-amber-500/30 transition-all duration-300">Add Ship</button>
                {(filterCategory === "all" || filterCategory === "ccu") && (
                  <button onClick={() => setShowAddCCUModal(true)} className="px-4 py-2 bg-cyan-500/20 border border-cyan-500/50 rounded-sm text-cyan-400 text-sm font-medium hover:bg-cyan-500/30 transition-all duration-300">Add CCU</button>
                )}
              </div>

              {/* Items grid */}
              {filteredShips.length > 0 && <FleetGrid ships={filteredShips} />}

              {/* CCUs grid (inline within the same tab) */}
              {filteredCCUs.length > 0 && (
                <div className="space-y-3">
                  {filteredShips.length > 0 && filterCategory === "all" && (
                    <h3 className="text-[12px] text-zinc-500 tracking-[0.12em] uppercase font-medium pt-2 border-t border-zinc-800/30">
                      CCU / Upgrades ({filteredCCUs.length})
                    </h3>
                  )}
                  <CCUGrid ccus={filteredCCUs} />
                </div>
              )}

              {filteredShips.length === 0 && filteredCCUs.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-sm text-zinc-500">No items match your filters.</p>
                </div>
              )}
            </>
          )}

          {/* Truly empty state */}
          {sourceShips.length === 0 && sourceCCUs.length === 0 && !(activeTab === "My Fleet" && (buybackShips.length > 0 || buybackCCUs.length > 0)) && (
            <EmptyState
              title={activeTab === "My Fleet" ? "No active fleet" : "No buyback items"}
              description={activeTab === "My Fleet" ? "Import your hangar using the SC Labs extension or add items manually." : "Import your hangar using the SC Labs extension to see buyback items here."}
              onImport={() => setShowImportModal(true)}
            />
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
         CCU CHAINS TAB
         ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "CCU Chains" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Chains" value={chains.length.toString()} accent="purple" />
            <StatCard label="Total Chain Cost" value={`$${chains.reduce((sum, chain) => sum + chain.steps.reduce((s, step) => s + step.ccuPrice, 0), 0).toLocaleString()}`} />
            <StatCard label="Status" value={`Active: ${chains.filter((c) => c.status === "in_progress").length} | Done: ${chains.filter((c) => c.status === "completed").length}`} />
            <StatCard label="Planning" value={`${chains.filter((c) => c.status === "planning").length} chains`} />
          </div>
          <div className="flex gap-3">
            <button onClick={() => handleOpenChainBuilder()} className="px-4 py-2 bg-amber-500/20 border border-amber-500/50 rounded-sm text-amber-400 text-sm font-medium hover:bg-amber-500/30 transition-all duration-300">New Chain</button>
          </div>
          <ChainList chains={chains} onEditChain={handleOpenChainBuilder} />
        </div>
      )}

      {/* ── Modals ── */}
      {showImportModal && <ImportModal onClose={() => setShowImportModal(false)} />}
      {showAddShipModal && <AddShipModal onClose={() => setShowAddShipModal(false)} />}
      {showAddCCUModal && <AddCCUModal onClose={() => setShowAddCCUModal(false)} />}
      {showChainBuilder && <ChainBuilder chain={editingChain} onClose={handleCloseChainBuilder} />}
    </div>
  );
}

// ─── Reusable Components ─────────────────────────────────────────────────────

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  const borderColor = accent === "cyan" ? "border-cyan-500/20" : accent === "emerald" ? "border-emerald-500/20" : accent === "amber" ? "border-amber-500/20" : accent === "orange" ? "border-orange-500/20" : accent === "purple" ? "border-purple-500/20" : "border-zinc-800/50";
  return (
    <div className={`p-4 bg-zinc-900/60 backdrop-blur-sm border ${borderColor} rounded-sm`}>
      <p className="text-[11px] text-zinc-500 tracking-[0.12em] uppercase font-medium">{label}</p>
      <p className="text-sm text-zinc-100 font-medium mt-2">{value}</p>
    </div>
  );
}

function EmptyState({ title, description, onImport }: { title: string; description: string; onImport: () => void }) {
  return (
    <div className="text-center py-16 px-8">
      <p className="text-lg text-zinc-400 font-medium mb-2">{title}</p>
      <p className="text-sm text-zinc-500 mb-6 max-w-md mx-auto">{description}</p>
      <button onClick={onImport} className="px-6 py-2.5 bg-amber-500/20 border border-amber-500/50 rounded-sm text-amber-400 text-sm font-medium hover:bg-amber-500/30 transition-all duration-300">Import Hangar</button>
    </div>
  );
}
