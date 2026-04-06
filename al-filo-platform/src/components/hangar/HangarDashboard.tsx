"use client";

import { useState } from "react";
import { useHangarStore, type InsuranceType, type ItemLocation, type CCUChain } from "@/store/useHangarStore";
import { FleetGrid } from "./FleetGrid";
import { ImportModal } from "./ImportModal";
import { AddShipModal } from "./AddShipModal";
import { CCUGrid } from "./CCUGrid";
import { AddCCUModal } from "./AddCCUModal";
import { ChainList } from "./ChainList";
import { ChainBuilder } from "./ChainBuilder";

type TabType = "Fleet" | "CCUs" | "CCU Chains";

export function HangarDashboard() {
  const [activeTab, setActiveTab] = useState<TabType>("Fleet");
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddShipModal, setShowAddShipModal] = useState(false);
  const [showAddCCUModal, setShowAddCCUModal] = useState(false);
  const [showChainBuilder, setShowChainBuilder] = useState(false);
  const [editingChain, setEditingChain] = useState<CCUChain | undefined>(undefined);

  // Fleet filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterInsurance, setFilterInsurance] = useState<InsuranceType | "all">("all");
  const [filterLocation, setFilterLocation] = useState<ItemLocation | "all">("all");
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

  // ── Fleet stats ──
  const totalShips = ships.length;
  const totalFleetValue = ships.reduce((sum, ship) => sum + ship.pledgePrice, 0);
  const ltiCount = ships.filter((s) => s.insuranceType === "LTI").length;
  const months120Count = ships.filter((s) => s.insuranceType === "120_months").length;
  const otherInsuranceCount = ships.filter((s) => s.insuranceType !== "LTI" && s.insuranceType !== "120_months").length;
  const hangarCount = ships.filter((s) => s.location === "hangar").length;
  const buybackCount = ships.filter((s) => s.location === "buyback").length;

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

  // ── Filter and sort ships ──
  let filteredShips = ships.filter((ship) => {
    const matchesSearch = searchQuery === "" || ship.pledgeName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesInsurance = filterInsurance === "all" || ship.insuranceType === filterInsurance;
    const matchesLocation = filterLocation === "all" || ship.location === filterLocation;
    return matchesSearch && matchesInsurance && matchesLocation;
  });

  if (sortBy === "name") filteredShips.sort((a, b) => a.pledgeName.localeCompare(b.pledgeName));
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

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-zinc-800/50 pb-4">
        {(["Fleet", "CCUs", "CCU Chains"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium tracking-wide transition-all duration-300 border-b-2 ${
              activeTab === tab
                ? "border-amber-500 text-amber-500"
                : "border-transparent text-zinc-400 hover:text-zinc-300"
            }`}
          >
            {tab}
            {tab === "Fleet" && ships.length > 0 && (
              <span className="ml-2 text-[10px] text-zinc-500">{ships.length}</span>
            )}
            {tab === "CCUs" && ccus.length > 0 && (
              <span className="ml-2 text-[10px] text-zinc-500">{ccus.length}</span>
            )}
            {tab === "CCU Chains" && chains.length > 0 && (
              <span className="ml-2 text-[10px] text-zinc-500">{chains.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
         FLEET TAB
         ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "Fleet" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Ships" value={totalShips.toString()} />
            <StatCard label="Fleet Value" value={`$${totalFleetValue.toLocaleString()}`} />
            <StatCard label="Insurance" value={`LTI: ${ltiCount} | 120m: ${months120Count} | Other: ${otherInsuranceCount}`} />
            <StatCard label="Location" value={`Hangar: ${hangarCount} | Buyback: ${buybackCount}`} />
          </div>

          <div className="flex gap-3">
            <button onClick={() => setShowImportModal(true)} className="px-4 py-2 bg-amber-500/20 border border-amber-500/50 rounded-sm text-amber-400 text-sm font-medium hover:bg-amber-500/30 transition-all duration-300">
              Import Fleet
            </button>
            <button onClick={handleExport} className="px-4 py-2 bg-cyan-500/20 border border-cyan-500/50 rounded-sm text-cyan-400 text-sm font-medium hover:bg-cyan-500/30 transition-all duration-300">
              Export Fleet
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <input type="text" placeholder="Search by ship name..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 px-3 py-2 bg-zinc-900/60 border border-zinc-800/50 rounded-sm text-zinc-100 text-sm placeholder-zinc-500 focus:outline-none focus:border-amber-500/50 transition-all duration-300" />
            <select value={filterInsurance} onChange={(e) => setFilterInsurance(e.target.value as InsuranceType | "all")}
              className="px-3 py-2 bg-zinc-900/60 border border-zinc-800/50 rounded-sm text-zinc-100 text-sm focus:outline-none focus:border-amber-500/50 transition-all duration-300">
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
            <select value={filterLocation} onChange={(e) => setFilterLocation(e.target.value as ItemLocation | "all")}
              className="px-3 py-2 bg-zinc-900/60 border border-zinc-800/50 rounded-sm text-zinc-100 text-sm focus:outline-none focus:border-amber-500/50 transition-all duration-300">
              <option value="all">All Locations</option>
              <option value="hangar">Hangar</option>
              <option value="buyback">Buyback</option>
              <option value="ccu_chain">CCU Chain</option>
            </select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as "name" | "price" | "date")}
              className="px-3 py-2 bg-zinc-900/60 border border-zinc-800/50 rounded-sm text-zinc-100 text-sm focus:outline-none focus:border-amber-500/50 transition-all duration-300">
              <option value="name">Sort: Name</option>
              <option value="price">Sort: Price</option>
              <option value="date">Sort: Date</option>
            </select>
            <button onClick={() => setShowAddShipModal(true)} className="px-4 py-2 bg-amber-500/20 border border-amber-500/50 rounded-sm text-amber-400 text-sm font-medium hover:bg-amber-500/30 transition-all duration-300">
              Add Ship
            </button>
          </div>

          <FleetGrid ships={filteredShips} />
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
         CCUs TAB
         ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "CCUs" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total CCUs" value={totalCCUs.toString()} />
            <StatCard label="Total Spent" value={`$${totalCCUValue.toLocaleString()}`} />
            <StatCard label="Warbond" value={`${warbondCount} of ${totalCCUs}`} />
            <StatCard label="Location" value={`Hangar: ${ccuHangarCount} | Buyback: ${ccuBuybackCount}`} />
          </div>

          <div className="flex gap-3">
            <button onClick={() => setShowImportModal(true)} className="px-4 py-2 bg-amber-500/20 border border-amber-500/50 rounded-sm text-amber-400 text-sm font-medium hover:bg-amber-500/30 transition-all duration-300">
              Import CCUs
            </button>
            <button onClick={handleExport} className="px-4 py-2 bg-cyan-500/20 border border-cyan-500/50 rounded-sm text-cyan-400 text-sm font-medium hover:bg-cyan-500/30 transition-all duration-300">
              Export All
            </button>
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
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Chains" value={totalChains.toString()} />
            <StatCard label="Total Chain Cost" value={`$${totalChainCost.toLocaleString()}`} />
            <StatCard label="Status" value={`Active: ${inProgressChains} | Done: ${completedChains}`} />
            <StatCard label="Planning" value={`${chains.filter((c) => c.status === "planning").length} chains`} />
          </div>

          <div className="flex gap-3">
            <button onClick={() => handleOpenChainBuilder()} className="px-4 py-2 bg-amber-500/20 border border-amber-500/50 rounded-sm text-amber-400 text-sm font-medium hover:bg-amber-500/30 transition-all duration-300">
              New Chain
            </button>
            <button onClick={handleExport} className="px-4 py-2 bg-cyan-500/20 border border-cyan-500/50 rounded-sm text-cyan-400 text-sm font-medium hover:bg-cyan-500/30 transition-all duration-300">
              Export All
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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-4 bg-zinc-900/60 backdrop-blur-sm border border-zinc-800/50 rounded-sm">
      <p className="text-[11px] text-zinc-500 tracking-[0.12em] uppercase font-medium">{label}</p>
      <p className="text-sm text-zinc-100 font-medium mt-2">{value}</p>
    </div>
  );
}
