"use client";

import { useState } from "react";
import { useHangarStore, type InsuranceType, type ItemLocation } from "@/store/useHangarStore";
import { FleetGrid } from "./FleetGrid";
import { ImportModal } from "./ImportModal";
import { AddShipModal } from "./AddShipModal";

type TabType = "Fleet" | "CCUs" | "CCU Chains";

export function HangarDashboard() {
  const [activeTab, setActiveTab] = useState<TabType>("Fleet");
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddShipModal, setShowAddShipModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterInsurance, setFilterInsurance] = useState<InsuranceType | "all">("all");
  const [filterLocation, setFilterLocation] = useState<ItemLocation | "all">("all");
  const [sortBy, setSortBy] = useState<"name" | "price" | "date">("name");

  const ships = useHangarStore((state) => state.ships);
  const exportToJSON = useHangarStore((state) => state.exportToJSON);

  // Calculate summary stats
  const totalShips = ships.length;
  const totalFleetValue = ships.reduce((sum, ship) => sum + ship.pledgePrice, 0);
  const ltiCount = ships.filter((s) => s.insuranceType === "LTI").length;
  const months120Count = ships.filter((s) => s.insuranceType === "120_months").length;
  const otherInsuranceCount = ships.filter((s) => s.insuranceType !== "LTI" && s.insuranceType !== "120_months").length;
  const hangarCount = ships.filter((s) => s.location === "hangar").length;
  const buybackCount = ships.filter((s) => s.location === "buyback").length;

  // Filter and sort ships
  let filteredShips = ships.filter((ship) => {
    const matchesSearch = searchQuery === "" || ship.pledgeName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesInsurance = filterInsurance === "all" || ship.insuranceType === filterInsurance;
    const matchesLocation = filterLocation === "all" || ship.location === filterLocation;
    return matchesSearch && matchesInsurance && matchesLocation;
  });

  if (sortBy === "name") {
    filteredShips.sort((a, b) => a.pledgeName.localeCompare(b.pledgeName));
  } else if (sortBy === "price") {
    filteredShips.sort((a, b) => b.pledgePrice - a.pledgePrice);
  } else if (sortBy === "date") {
    filteredShips.sort((a, b) => {
      const dateA = a.purchasedDate ? new Date(a.purchasedDate).getTime() : 0;
      const dateB = b.purchasedDate ? new Date(b.purchasedDate).getTime() : 0;
      return dateB - dateA;
    });
  }

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
          </button>
        ))}
      </div>

      {/* Fleet Tab Content */}
      {activeTab === "Fleet" && (
        <div className="space-y-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Ships" value={totalShips.toString()} />
            <StatCard label="Fleet Value" value={`$${totalFleetValue.toLocaleString()}`} />
            <StatCard label="Insurance" value={`LTI: ${ltiCount} | 120m: ${months120Count} | Other: ${otherInsuranceCount}`} />
            <StatCard label="Location" value={`Hangar: ${hangarCount} | Buyback: ${buybackCount}`} />
          </div>

          {/* Import/Export Buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => setShowImportModal(true)}
              className="px-4 py-2 bg-amber-500/20 border border-amber-500/50 rounded-sm text-amber-400 text-sm font-medium hover:bg-amber-500/30 transition-all duration-300"
            >
              Import Fleet
            </button>
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-cyan-500/20 border border-cyan-500/50 rounded-sm text-cyan-400 text-sm font-medium hover:bg-cyan-500/30 transition-all duration-300"
            >
              Export Fleet
            </button>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="Search by ship name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 px-3 py-2 bg-zinc-900/60 border border-zinc-800/50 rounded-sm text-zinc-100 text-sm placeholder-zinc-500 focus:outline-none focus:border-amber-500/50 transition-all duration-300"
            />
            <select
              value={filterInsurance}
              onChange={(e) => setFilterInsurance(e.target.value as InsuranceType | "all")}
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
              value={filterLocation}
              onChange={(e) => setFilterLocation(e.target.value as ItemLocation | "all")}
              className="px-3 py-2 bg-zinc-900/60 border border-zinc-800/50 rounded-sm text-zinc-100 text-sm focus:outline-none focus:border-amber-500/50 transition-all duration-300"
            >
              <option value="all">All Locations</option>
              <option value="hangar">Hangar</option>
              <option value="buyback">Buyback</option>
              <option value="ccu_chain">CCU Chain</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "name" | "price" | "date")}
              className="px-3 py-2 bg-zinc-900/60 border border-zinc-800/50 rounded-sm text-zinc-100 text-sm focus:outline-none focus:border-amber-500/50 transition-all duration-300"
            >
              <option value="name">Sort: Name</option>
              <option value="price">Sort: Price</option>
              <option value="date">Sort: Date</option>
            </select>
            <button
              onClick={() => setShowAddShipModal(true)}
              className="px-4 py-2 bg-amber-500/20 border border-amber-500/50 rounded-sm text-amber-400 text-sm font-medium hover:bg-amber-500/30 transition-all duration-300"
            >
              Add Ship
            </button>
          </div>

          {/* Fleet Grid */}
          <FleetGrid ships={filteredShips} />
        </div>
      )}

      {/* CCUs Tab Content */}
      {activeTab === "CCUs" && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <p className="text-zinc-400 text-sm">Coming Soon</p>
            <p className="text-zinc-500 text-xs mt-1">CCU management features are in development</p>
          </div>
        </div>
      )}

      {/* CCU Chains Tab Content */}
      {activeTab === "CCU Chains" && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <p className="text-zinc-400 text-sm">Coming Soon</p>
            <p className="text-zinc-500 text-xs mt-1">CCU chain tracking is in development</p>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && <ImportModal onClose={() => setShowImportModal(false)} />}

      {/* Add Ship Modal */}
      {showAddShipModal && <AddShipModal onClose={() => setShowAddShipModal(false)} />}
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
