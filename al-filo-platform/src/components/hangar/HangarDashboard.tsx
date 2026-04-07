"use client";

import { useState } from "react";
import { useHangarStore, type InsuranceType, type CCUChain } from "@/store/useHangarStore";
import { FleetGrid } from "./FleetGrid";
import { ImportModal } from "./ImportModal";
import { AddShipModal } from "./AddShipModal";
import { CCUGrid } from "./CCUGrid";
import { AddCCUModal } from "./AddCCUModal";
import { ChainList } from "./ChainList";
import { ChainBuilder } from "./ChainBuilder";

type TabType = "My Fleet" | "Buyback" | "CCUs" | "CCU Chains";

export function HangarDashboard() {
  const [activeTab, setActiveTab] = useState<TabType>("My Fleet");
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddShipModal, setShowAddShipModal] = useState(false);
  const [showAddCCUModal, setShowAddCCUModal] = useState(false);
  const [showChainBuilder, setShowChainBuilder] = useState(false);
  const [editingChain, setEditingChain] = useState<CCUChain | undefined>(undefined);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Shared filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterInsurance, setFilterInsurance] = useState<InsuranceType | "all">("all");
  const [sortBy, setSortBy] = useState<"name" | "price" | "date">("name");

  // CCU filters
  const [ccuSearch, setCcuSearch] = useState("");
  const [ccuFilterLocation, setCcuFilterLocation] = useState<"all" | "hangar" | "buyback">("all");
  const [ccuFilterWarbond, setCcuFilterWarbond] = useState<"all" | "warbond" | "standard">("all");
  const [ccuSortBy, setCcuSortBy] = useState<"from" | "to" | "price">("from");

  const ships = useHangarStore((state) => state.ships);
  const ccus = useHangarStore((state) => state.ccus);
  const chains = useHangarStore((state) => state.chains);
  const exportToJSON = useHangarStore((state) => state.exportToJSON);
  const clearAll = useHangarStore((state) => state.clearAll);

  // ── Split ships by location ──
  const fleetShips = ships.filter((s) => s.location === "hangar");
  const buybackShips = ships.filter((s) => s.location === "buyback");

  // ── Fleet stats (active hangar) ──
  const fleetValue = fleetShips.reduce((sum, s) => sum + s.pledgePrice, 0);
  const fleetLti = fleetShips.filter((s) => s.insuranceType === "LTI").length;
  const fleet120 = fleetShips.filter((s) => s.insuranceType === "120_months").length;
  const fleetOther = fleetShips.length - fleetLti - fleet120;

  // ── Buyback stats ──
  const buybackValue = buybackShips.reduce((sum, s) => sum + s.pledgePrice, 0);
  const buybackLti = buybackShips.filter((s) => s.insuranceType === "LTI").length;
  const buyback120 = buybackShips.filter((s) => s.insuranceType === "120_months").length;
  const buybackOther = buybackShips.length - buybackLti - buyback120;

  // ── CCU stats ──
  const totalCCUs = ccus.length;
  const totalCCUValue = ccus.reduce((sum, ccu) => sum + ccu.pricePaid, 0);
  const warbondCount = ccus.filter((c) => c.isWarbond).length;
  const ccuHangarCount = ccus.filter((c) => c.location === "hangar").length;
  const ccuBuybackCount = ccus.filter((c) => c.location === "buyback").length;

  // ── Chain stats ──
  const totalChains = chains.length;
  const totalChainCost = chains.reduce((sum, chain) => sum + chain.steps.reduce((s, step) => s + step.ccuPrice, 0), 0);
  const completedChains = chains.filter((c) => c.status === "completed").length;
  const inProgressChains = chains.filter((c) => c.status === "in_progress").length;

  // ── Determine which ships to show based on tab ──
  const isFleetTab = activeTab === "My Fleet";
  const isBuybackTab = activeTab === "Buyback";
  const sourceShips = isFleetTab ? fleetShips : isBuybackTab ? buybackShips : [];

  // ── Filter and sort ships ──
  let filteredShips = sourceShips.filter((ship) => {
    const name = (ship.shipName || ship.pledgeName || "").toLowerCase();
    const matchesSearch = searchQuery === "" || name.includes(searchQuery.toLowerCase()) || ship.pledgeName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesInsurance = filterInsurance === "all" || ship.insuranceType === filterInsurance;
    return matchesSearch && matchesInsurance;
  });

  if (sortBy === "name") filteredShips.sort((a, b) => (a.shipName || a.pledgeName).localeCompare(b.shipName || b.pledgeName));
  else if (sortBy === "price") filteredShips.sort((a, b) => b.pledgePrice - a.pledgePrice);
  else if (sortBy === "date") filteredShips.sort((a, b) => {
    const dateA = a.purchasedDate ? new Date(a.purchasedDate).getTime() : 0;
    const dateB = b.purchasedDate ? new Date(b.purchasedDate).getTime() : 0;
    return dateB - dateA;
  });

  // ── Filter and sort CCUs ──
  let filteredCCUs = ccus.filter((ccu) => {
    const matchesSearch = ccuSearch === "" ||
      ccu.fromShip.toLowerCase().includes(ccuSearch.toLowerCase()) ||
      ccu.toShip.toLowerCase().includes(ccuSearch.toLowerCase());
    const matchesLocation = ccuFilterLocation === "all" || ccu.location === ccuFilterLocation;
    const matchesWarbond = ccuFilterWarbond === "all" ||
      (ccuFilterWarbond === "warbond" && ccu.isWarbond) ||
      (ccuFilterWarbond === "standard" && !ccu.isWarbond);
    return matchesSearch && matchesLocation && matchesWarbond;
  });

  if (ccuSortBy === "from") filteredCCUs.sort((a, b) => a.fromShip.localeCompare(b.fromShip));
  else if (ccuSortBy === "to") filteredCCUs.sort((a, b) => a.toShip.localeCompare(b.toShip));
  else if (ccuSortBy === "price") filteredCCUs.sort((a, b) => b.pricePaid - a.pricePaid);

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

  const handleOpenChainBuilder = (chain?: CCUChain) => {
    setEditingChain(chain);
    setShowChainBuilder(true);
  };

  const handleCloseChainBuilder = () => {
    setShowChainBuilder(false);
    setEditingChain(undefined);
  };

  // Tab config
  const TABS: { id: TabType; label: string; count: number; color: string }[] = [
    { id: "My Fleet", label: "My Fleet", count: fleetShips.length, color: "cyan" },
    { id: "Buyback", label: "Buyback", count: buybackShips.length, color: "orange" },
    { id: "CCUs", label: "CCUs", count: ccus.length, color: "amber" },
    { id: "CCU Chains", label: "CCU Chains", count: chains.length, color: "purple" },
  ];

  return (
    <div className="space-y-6">
      {/* ── Tab Navigation ── */}
      <div className="flex gap-1 border-b border-zinc-800/50 pb-4 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
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

        {/* Import / Export / Clear — right side */}
        <div className="ml-auto flex gap-2 pl-4 items-center">
          <button
            onClick={() => setShowImportModal(true)}
            className="px-3 py-1.5 bg-amber-500/20 border border-amber-500/50 rounded-sm text-amber-400 text-[12px] font-medium hover:bg-amber-500/30 transition-all duration-300"
          >
            Import
          </button>
          <button
            onClick={handleExport}
            className="px-3 py-1.5 bg-cyan-500/20 border border-cyan-500/50 rounded-sm text-cyan-400 text-[12px] font-medium hover:bg-cyan-500/30 transition-all duration-300"
          >
            Export
          </button>
          {showClearConfirm ? (
            <div className="flex gap-1.5 items-center">
              <span className="text-[11px] text-red-400">Clear all?</span>
              <button
                onClick={() => { clearAll(); setShowClearConfirm(false); }}
                className="px-2 py-1 bg-red-500/30 border border-red-500/50 rounded-sm text-red-400 text-[11px] font-medium hover:bg-red-500/40 transition-all duration-300"
              >
                Yes
              </button>
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-2 py-1 bg-zinc-800/50 border border-zinc-700/50 rounded-sm text-zinc-400 text-[11px] hover:bg-zinc-800 transition-all duration-300"
              >
                No
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowClearConfirm(true)}
              className="px-3 py-1.5 bg-red-500/10 border border-red-500/30 rounded-sm text-red-400/70 text-[12px] font-medium hover:bg-red-500/20 hover:text-red-400 transition-all duration-300"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
         MY FLEET TAB — Active hangar ships
         ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "My Fleet" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Active Ships" value={fleetShips.length.toString()} accent="cyan" />
            <StatCard label="Fleet Value" value={`$${fleetValue.toLocaleString()}`} accent="emerald" />
            <StatCard label="Insurance" value={`LTI: ${fleetLti} | 120m: ${fleet120} | Other: ${fleetOther}`} />
            <StatCard label="Total Investment" value={`$${(fleetValue + buybackValue + totalCCUValue).toLocaleString()}`} accent="amber" />
          </div>

          <ShipFilters
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            filterInsurance={filterInsurance}
            onInsuranceChange={setFilterInsurance}
            sortBy={sortBy}
            onSortChange={setSortBy}
            onAddShip={() => setShowAddShipModal(true)}
            placeholder="Search active fleet..."
          />

          {fleetShips.length === 0 && filteredShips.length === 0 ? (
            <EmptyState
              title="No active fleet"
              description="Your active fleet will show ships you currently own. Import your hangar from Guild Swarm or add ships manually."
              onImport={() => setShowImportModal(true)}
            />
          ) : (
            <FleetGrid ships={filteredShips} />
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
         BUYBACK TAB — Available for repurchase
         ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "Buyback" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Buyback Items" value={buybackShips.length.toString()} accent="orange" />
            <StatCard label="Buyback Value" value={`$${buybackValue.toLocaleString()}`} accent="amber" />
            <StatCard label="Insurance" value={`LTI: ${buybackLti} | 120m: ${buyback120} | Other: ${buybackOther}`} />
            <StatCard label="Available" value={`${buybackShips.length} pledges`} />
          </div>

          {/* Info banner */}
          <div className="p-3 bg-orange-500/10 border border-orange-500/20 rounded-sm">
            <p className="text-[12px] text-orange-300/80">
              These are pledges available for repurchase with store credit or buyback tokens. They are not part of your active fleet.
            </p>
          </div>

          <ShipFilters
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            filterInsurance={filterInsurance}
            onInsuranceChange={setFilterInsurance}
            sortBy={sortBy}
            onSortChange={setSortBy}
            onAddShip={() => setShowAddShipModal(true)}
            placeholder="Search buyback pledges..."
          />

          {buybackShips.length === 0 && filteredShips.length === 0 ? (
            <EmptyState
              title="No buyback items"
              description="Import your hangar from Guild Swarm to see your buyback pledges here."
              onImport={() => setShowImportModal(true)}
            />
          ) : (
            <FleetGrid ships={filteredShips} />
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
         CCUs TAB
         ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "CCUs" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total CCUs" value={totalCCUs.toString()} accent="amber" />
            <StatCard label="Total Spent" value={`$${totalCCUValue.toLocaleString()}`} />
            <StatCard label="Warbond" value={`${warbondCount} of ${totalCCUs}`} />
            <StatCard label="Location" value={`Hangar: ${ccuHangarCount} | Buyback: ${ccuBuybackCount}`} />
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <input type="text" placeholder="Search by ship name..." value={ccuSearch} onChange={(e) => setCcuSearch(e.target.value)}
              className="flex-1 px-3 py-2 bg-zinc-900/60 border border-zinc-800/50 rounded-sm text-zinc-100 text-sm placeholder-zinc-500 focus:outline-none focus:border-amber-500/50 transition-all duration-300" />
            <select value={ccuFilterLocation} onChange={(e) => setCcuFilterLocation(e.target.value as "all" | "hangar" | "buyback")}
              className="px-3 py-2 bg-zinc-900/60 border border-zinc-800/50 rounded-sm text-zinc-100 text-sm focus:outline-none focus:border-amber-500/50 transition-all duration-300">
              <option value="all">All Locations</option>
              <option value="hangar">Hangar</option>
              <option value="buyback">Buyback</option>
            </select>
            <select value={ccuFilterWarbond} onChange={(e) => setCcuFilterWarbond(e.target.value as "all" | "warbond" | "standard")}
              className="px-3 py-2 bg-zinc-900/60 border border-zinc-800/50 rounded-sm text-zinc-100 text-sm focus:outline-none focus:border-amber-500/50 transition-all duration-300">
              <option value="all">All Types</option>
              <option value="warbond">Warbond Only</option>
              <option value="standard">Standard Only</option>
            </select>
            <select value={ccuSortBy} onChange={(e) => setCcuSortBy(e.target.value as "from" | "to" | "price")}
              className="px-3 py-2 bg-zinc-900/60 border border-zinc-800/50 rounded-sm text-zinc-100 text-sm focus:outline-none focus:border-amber-500/50 transition-all duration-300">
              <option value="from">Sort: From Ship</option>
              <option value="to">Sort: To Ship</option>
              <option value="price">Sort: Price</option>
            </select>
            <button onClick={() => setShowAddCCUModal(true)} className="px-4 py-2 bg-amber-500/20 border border-amber-500/50 rounded-sm text-amber-400 text-sm font-medium hover:bg-amber-500/30 transition-all duration-300">
              Add CCU
            </button>
          </div>

          <CCUGrid ccus={filteredCCUs} />
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
         CCU CHAINS TAB
         ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "CCU Chains" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Chains" value={totalChains.toString()} accent="purple" />
            <StatCard label="Total Chain Cost" value={`$${totalChainCost.toLocaleString()}`} />
            <StatCard label="Status" value={`Active: ${inProgressChains} | Done: ${completedChains}`} />
            <StatCard label="Planning" value={`${chains.filter((c) => c.status === "planning").length} chains`} />
          </div>

          <div className="flex gap-3">
            <button onClick={() => handleOpenChainBuilder()} className="px-4 py-2 bg-amber-500/20 border border-amber-500/50 rounded-sm text-amber-400 text-sm font-medium hover:bg-amber-500/30 transition-all duration-300">
              New Chain
            </button>
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

function ShipFilters({
  searchQuery, onSearchChange, filterInsurance, onInsuranceChange, sortBy, onSortChange, onAddShip, placeholder,
}: {
  searchQuery: string; onSearchChange: (v: string) => void;
  filterInsurance: InsuranceType | "all"; onInsuranceChange: (v: InsuranceType | "all") => void;
  sortBy: "name" | "price" | "date"; onSortChange: (v: "name" | "price" | "date") => void;
  onAddShip: () => void; placeholder: string;
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <input
        type="text"
        placeholder={placeholder}
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        className="flex-1 px-3 py-2 bg-zinc-900/60 border border-zinc-800/50 rounded-sm text-zinc-100 text-sm placeholder-zinc-500 focus:outline-none focus:border-amber-500/50 transition-all duration-300"
      />
      <select
        value={filterInsurance}
        onChange={(e) => onInsuranceChange(e.target.value as InsuranceType | "all")}
        className="px-3 py-2 bg-zinc-900/60 border border-zinc-800/50 rounded-sm text-zinc-100 text-sm focus:outline-none focus:border-amber-500/50 transition-all duration-300"
      >
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
      <select
        value={sortBy}
        onChange={(e) => onSortChange(e.target.value as "name" | "price" | "date")}
        className="px-3 py-2 bg-zinc-900/60 border border-zinc-800/50 rounded-sm text-zinc-100 text-sm focus:outline-none focus:border-amber-500/50 transition-all duration-300"
      >
        <option value="name">Sort: Name</option>
        <option value="price">Sort: Price</option>
        <option value="date">Sort: Date</option>
      </select>
      <button
        onClick={onAddShip}
        className="px-4 py-2 bg-amber-500/20 border border-amber-500/50 rounded-sm text-amber-400 text-sm font-medium hover:bg-amber-500/30 transition-all duration-300"
      >
        Add Ship
      </button>
    </div>
  );
}

function EmptyState({ title, description, onImport }: { title: string; description: string; onImport: () => void }) {
  return (
    <div className="text-center py-16 px-8">
      <p className="text-lg text-zinc-400 font-medium mb-2">{title}</p>
      <p className="text-sm text-zinc-500 mb-6 max-w-md mx-auto">{description}</p>
      <button
        onClick={onImport}
        className="px-6 py-2.5 bg-amber-500/20 border border-amber-500/50 rounded-sm text-amber-400 text-sm font-medium hover:bg-amber-500/30 transition-all duration-300"
      >
        Import Hangar
      </button>
    </div>
  );
}
