"use client";

import { useState, useEffect } from "react";
import Header from "@/app/assets/header/Header";
import TradeRoutes from "@/components/trade/TradeRoutes";
import CommodityBrowser from "@/components/trade/CommodityBrowser";
import TerminalDirectory from "@/components/trade/TerminalDirectory";
import TradeWorkOrders from "@/components/trade/TradeWorkOrders";
import TradeDashboard from "@/components/trade/TradeDashboard";
import { PageVideoBackground } from "@/components/shared/PageVideoBackground";
import { useTradeWorkOrderStore } from "@/store/useTradeWorkOrderStore";
import { useTranslations } from "next-intl";

type Tab = "routes" | "commodities" | "terminals" | "workorders" | "dashboard";

const TABS: { id: Tab; label: string }[] = [
  { id: "routes", label: "Trade Routes" },
  { id: "commodities", label: "Commodities" },
  { id: "terminals", label: "Terminals" },
  { id: "workorders", label: "Work Orders" },
  { id: "dashboard", label: "Dashboard" },
];

export default function TradePage() {
  const [activeTab, setActiveTab] = useState<Tab>("routes");
  const requestTabSwitch = useTradeWorkOrderStore((s) => s.requestTabSwitch);
  const t = useTranslations("PageTitles");

  // When TradeRoutes fires "Send to WO", switch to the Work Orders tab
  useEffect(() => {
    if (requestTabSwitch > 0) {
      setActiveTab("workorders");
    }
  }, [requestTabSwitch]);

  return (
    <main className="relative min-h-screen text-zinc-100">
      <PageVideoBackground />

      <div className="relative z-10 flex flex-col min-h-screen">
        <Header subtitle={t("trade")} />

        {/* ── Contenido ── */}
        <div className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full">
          {/* Tab Navigation */}
          <div className="flex gap-2 mb-6 pb-4 border-b border-zinc-800/40 justify-center">
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
            {activeTab === "workorders" && <TradeWorkOrders />}
            {activeTab === "dashboard" && <TradeDashboard />}
          </div>
        </div>
      </div>
    </main>
  );
}
