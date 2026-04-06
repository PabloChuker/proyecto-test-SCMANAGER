"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Header from "@/app/assets/header/Header";
import { SIDEBAR_ITEMS } from "@/app/assets/header/navigation";
import MiningLoadoutCalculator from "./MiningLoadoutCalculator";
import WorkOrderCalculator from "./WorkOrderCalculator";
import RockCalculator from "./RockCalculator";
import RefineryDataTable from "./RefineryDataTable";

const TABS = [
  { id: "loadout", label: "Loadout Calculator", icon: "⛏" },
  { id: "workorder", label: "Work Order", icon: "📈" },
  { id: "rock", label: "Rock Calculator", icon: "🪨" },
  { id: "refinery", label: "Refinery Data", icon: "🏚" },
];

export default function MiningPage() {
  const [activeTab, setActiveTab] = useState("loadout");

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <video
        autoPlay loop muted playsInline
        className="fixed inset-0 w-full h-full object-cover opacity-15 pointer-events-none z-0"
      >
        <source src="/videos/mineria.mp4" type="video/mp4" />
      </video>
      <div className="fixed inset-0 bg-gradient-to-b from-zinc-950/60 via-zinc-950/80 to-zinc-950/95 pointer-events-none z-0" />

      <Header subtitle="Mining & Industry" />

      <div className="flex flex-1 min-h-0">
        <aside className="w-12 sm:w-14 flex-shrink-0 bg-zinc-950/90 border-r border-zinc-800/50 flex flex-col items-center py-3 gap-1 z-20 sticky top-12 h-[calc(100vh-3rem)] overflow-y-auto">
          {SIDEBAR_ITEMS.map((item) => {
            const isActive = item.key === "mining";
            return (
              <Link
                key={item.key}
                href={item.href}
                title={item.label}
                className={`
                  w-9 h-9 sm:w-10 sm:h-10 rounded flex items-center justify-center transition-all duration-150
                  ${isActive
                    ? "bg-amber-500/15 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.3)]"
                    : "hover:bg-zinc-800/40"
                  }
                `}
              >
                <Image
                  src={item.icon}
                  alt={item.label}
                  width={22}
                  height={22}
                  className={`transition-opacity ${isActive ? "opacity-100" : "opacity-40 hover:opacity-70"}`}
                />
              </Link>
            );
          })}
        </aside>

        <div className="flex-1 z-10 relative flex flex-col min-w-0">
          <div className="relative px-4 py-3 flex-1 overflow-y-auto">
            <div className="mb-4 border-b border-zinc-800/60 flex gap-2">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    px-4 py-2 text-sm tracking-[0.1em] uppercase transition-all duration-200
                    ${activeTab === tab.id
                      ? "text-amber-400 border-b-2 border-amber-500"
                      : "text-zinc-500 hover:text-zinc-400 border-b-2 border-transparent"
                    }
                  `}
                >
                  <span className="mr-1">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="mt-6">
              {activeTab === "loadout" && <MiningLoadoutCalculator />}
              {activeTab === "workorder" && <WorkOrderCalculator />}
              {activeTab === "rock" && <RockCalculator />}
              {activeTab === "refinery" && <RefineryDataTable />}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
