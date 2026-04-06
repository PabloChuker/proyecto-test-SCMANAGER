"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import BlueprintBrowser from "./BlueprintBrowser";
import CraftingCalculator from "./CraftingCalculator";
import MaterialBrowser from "./MaterialBrowser";
import QualitySimulator from "./QualitySimulator";

const SIDEBAR_ITEMS = [
  { key: "dps", href: "/dps", label: "DPS Calculator", icon: "/icons/DPS_calculator.png" },
  { key: "ships", href: "/components?tab=ships", label: "Ships", icon: "/icons/Ships.png" },
  { key: "weapons", href: "/components?tab=weapons", label: "Weapons", icon: "/icons/weapons.png" },
  { key: "missiles", href: "/components?tab=missiles", label: "Missiles", icon: "/icons/missile.png" },
  { key: "emps", href: "/components?tab=emps", label: "EMP Generators", icon: "/icons/emp.png" },
  { key: "shields", href: "/components?tab=shields", label: "Shields", icon: "/icons/shilds.png" },
  { key: "power_plants", href: "/components?tab=power_plants", label: "Power Plants", icon: "/icons/power_plants.png" },
  { key: "coolers", href: "/components?tab=coolers", label: "Coolers", icon: "/icons/coolers.png" },
  { key: "quantum_drives", href: "/components?tab=quantum_drives", label: "Quantum Drives", icon: "/icons/Quantum_drives.png" },
  { key: "qed", href: "/components?tab=qed", label: "QED Generators", icon: "/icons/interdict_pulse.png" },
  { key: "mining", href: "/mining", label: "Mining Tools", icon: "/icons/mining_lasers.png" },
  { key: "turrets", href: "/components?tab=turrets", label: "Turrets", icon: "/icons/weapons.png" },
];

const TABS = [
  { id: "blueprints", label: "Blueprints", icon: "📐" },
  { id: "calculator", label: "Calculator", icon: "🧮" },
  { id: "materials", label: "Materials", icon: "⚗" },
  { id: "quality", label: "Quality Sim", icon: "⚙" },
];

export default function CraftingPage() {
  const [activeTab, setActiveTab] = useState("blueprints");

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex">
      <video
        autoPlay loop muted playsInline
        className="fixed inset-0 w-full h-full object-cover opacity-15 pointer-events-none z-0"
      >
        <source src="/videos/crafting.mp4" type="video/mp4" />
      </video>
      <div className="fixed inset-0 bg-gradient-to-b from-zinc-950/60 via-zinc-950/80 to-zinc-950/95 pointer-events-none z-0" />

      <aside className="w-12 sm:w-14 flex-shrink-0 bg-zinc-950/90 border-r border-zinc-800/50 flex flex-col items-center py-3 gap-1 z-20 sticky top-0 h-screen overflow-y-auto">
        <Link href="/" className="mb-3 opacity-60 hover:opacity-100 transition-opacity">
          <Image src="/sclabs-logo.png" alt="SC LABS" width={24} height={24} className="rounded-sm" />
        </Link>
        <div className="w-6 h-px bg-zinc-800 mb-2" />

        {SIDEBAR_ITEMS.map((item) => {
          const isActive = item.key === "crafting";
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
        <header className="sticky top-0 z-40 border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-xl">
          <div className="px-4 sm:px-6 flex items-center justify-between h-12">
            <div className="flex items-center gap-3">
              <Link href="/" className="text-xs tracking-[0.15em] uppercase text-zinc-600 hover:text-zinc-400 transition-colors">
                SC Labs
              </Link>
              <div className="h-4 w-px bg-zinc-800" />
              <span className="text-xs tracking-[0.12em] uppercase text-amber-500 font-medium">
                Crafting & Fabrication
              </span>
            </div>

            <nav className="hidden sm:flex items-center gap-5 text-[10px] tracking-[0.12em] uppercase text-zinc-600">
              <span className="text-amber-500 border-b border-amber-500/30 pb-0.5">Crafting</span>
              <Link href="/dps" className="hover:text-zinc-400 transition-colors">DPS</Link>
              <Link href="/compare" className="hover:text-zinc-400 transition-colors">Compare</Link>
              <Link href="/components" className="hover:text-zinc-400 transition-colors">Components</Link>
            </nav>
          </div>
        </header>

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
            {activeTab === "blueprints" && <BlueprintBrowser />}
            {activeTab === "calculator" && <CraftingCalculator />}
            {activeTab === "materials" && <MaterialBrowser />}
            {activeTab === "quality" && <QualitySimulator />}
          </div>
        </div>
      </div>
    </main>
  );
}