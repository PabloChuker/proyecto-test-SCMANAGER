"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Header from "@/app/assets/header/Header";
import TradeRoutes from "@/components/trade/TradeRoutes";
import CommodityBrowser from "@/components/trade/CommodityBrowser";
import TerminalDirectory from "@/components/trade/TerminalDirectory";
import TradeWorkOrders from "@/components/trade/TradeWorkOrders";
import TradeDashboard from "@/components/trade/TradeDashboard";
import ActiveRoutePanel from "@/components/trade/ActiveRoutePanel";
import { PageVideoBackground } from "@/components/shared/PageVideoBackground";
import { useTradeWorkOrderStore } from "@/store/useTradeWorkOrderStore";
import { useTranslations } from "next-intl";

type Tab =
  | "routes"
  | "commodities"
  | "terminals"
  | "workorders"
  | "activeRoute"
  | "dashboard";

const VALID_TABS: Tab[] = [
  "routes",
  "commodities",
  "terminals",
  "workorders",
  "activeRoute",
  "dashboard",
];

export default function TradePage() {
  const searchParams = useSearchParams();
  // Fase E.E2 — permitir que una notificación payout_pending/transferred
  // aterrice directamente en el tab "Active Route" (o cualquier otro) vía
  // /trade?tab=<tab>[&settle=<groupId>]. ActiveRoutePanel lee `settle` por
  // su cuenta.
  const initialTab: Tab = (() => {
    const t = searchParams?.get("tab");
    return VALID_TABS.includes(t as Tab) ? (t as Tab) : "routes";
  })();
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const requestTabSwitch = useTradeWorkOrderStore((s) => s.requestTabSwitch);
  const requestActiveRouteTab = useTradeWorkOrderStore(
    (s) => s.requestActiveRouteTab,
  );
  const t = useTranslations("PageTitles");
  const tt = useTranslations("Trade.tabs");
  const TABS: { id: Tab; label: string }[] = [
    { id: "routes", label: tt("routes") },
    { id: "commodities", label: tt("commodities") },
    { id: "terminals", label: tt("terminals") },
    { id: "workorders", label: tt("workorders") },
    { id: "activeRoute", label: tt("activeRoute") },
    { id: "dashboard", label: tt("dashboard") },
  ];

  // When TradeRoutes fires "Send to WO", switch to the Work Orders tab
  useEffect(() => {
    if (requestTabSwitch > 0) {
      setActiveTab("workorders");
    }
  }, [requestTabSwitch]);

  // When the mining sell-route flow fires a handoff, land on Active Route.
  // ActiveRoutePanel consumes pendingActiveRouteGroupId on mount/change to
  // auto-select the freshly created route group.
  useEffect(() => {
    if (requestActiveRouteTab > 0) {
      setActiveTab("activeRoute");
    }
  }, [requestActiveRouteTab]);

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
            {activeTab === "activeRoute" && <ActiveRoutePanel />}
            {activeTab === "dashboard" && <TradeDashboard />}
          </div>
        </div>
      </div>
    </main>
  );
}
