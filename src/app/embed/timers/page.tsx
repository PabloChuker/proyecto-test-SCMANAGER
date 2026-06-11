"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import ExecHangarTimer from "@/components/timers/ExecHangarTimer";
import ContestedZonePanel from "@/components/timers/ContestedZonePanel";
import CompboardTracker from "@/components/timers/CompboardTracker";
import UmbraPluginBoot from "@/components/embed/UmbraPluginBoot";

// Versión embebible de Pyro Timers (plugin de Umbra): sin Header del sitio y
// sin el video de fondo (dentro de una ventana chica es ruido y ancho de
// banda). Mismas tres tabs que /timers.
export default function TimersEmbedPage() {
  const [activeTab, setActiveTab] = useState("hangar");
  const tt = useTranslations("Timers.tabs");

  const TABS = [
    { id: "hangar", label: tt("hangar"), icon: "⏱" },
    { id: "cz", label: tt("cz"), icon: "🎯" },
    { id: "compboard", label: tt("compboard"), icon: "📋" },
  ];

  return (
    <main className="h-screen bg-zinc-950 text-zinc-100 flex flex-col overflow-hidden">
      <UmbraPluginBoot />
      <div className="flex-1 min-h-0 flex flex-col px-4 py-3 overflow-y-auto">
        <div className="mb-4 border-b border-zinc-800/60 flex gap-2 justify-center">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                px-4 py-2 text-sm tracking-[0.1em] uppercase transition-all duration-200
                ${
                  activeTab === tab.id
                    ? "text-amber-400 border-b-2 border-amber-500"
                    : "text-zinc-500 hover:text-zinc-400 border-b-2 border-transparent"
                }
              `}
            >
              <span className="mr-1.5">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
        <div className="mt-2">
          {activeTab === "hangar" && <ExecHangarTimer />}
          {activeTab === "cz" && <ContestedZonePanel />}
          {activeTab === "compboard" && <CompboardTracker />}
        </div>
      </div>
    </main>
  );
}
