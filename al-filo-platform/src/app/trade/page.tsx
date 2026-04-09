"use client";

import { useState } from "react";
import Header from "@/app/assets/header/Header";
import TradeRoutes from "@/components/trade/TradeRoutes";
import CommodityBrowser from "@/components/trade/CommodityBrowser";
import TerminalDirectory from "@/components/trade/TerminalDirectory";
import { PageVideoBackground } from "@/components/shared/PageVideoBackground";

type Tab = "routes" | "commodities" | "terminals";

const TABS: { id: Tab; label: string }[] = [
  { id: "routes", label: "Trade Routes" },
  { id: "commodities", label: "Commodities" },
  { id: "terminals", label: "Terminals" },
];

export default function TradePage() {
  const [activeTab, setActiveTab] = useState<Tab>("routes");

  return (
    <main className="relative min-h-screen text-zinc-100">
      <PageVideoBackground />

      <div className="relative z-10 flex flex-col min-h-screen">
        <Header subtitle="Trade System" />

        {/* ── Contenido ── */}
        <div className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full">
          {/* Tab Navigation */}
          <div className="flex gap-2 mb-6 pb-4 border-b border-zinc-800/40">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  px-3 py-2 text-xs font-mono uppercase tracking-widest rounded-sm
                  transition-all duration-200
                  ${
                    activeTab === tab.id
                      ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                      : "text-zinc-400 hover:text-zinc-200 border border-transparent hover:border-zinc-700/60"
                  }
                `}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="space-y-6">
            {activeTab === "routes" && <TradeRoutes />}
            {activeTab === "commodities" && <CommodityBrowser />}
            {activeTab === "terminals" && <TerminalDirectory />}
          </div>
        </div>
      </div>
    </main>
  );
}
