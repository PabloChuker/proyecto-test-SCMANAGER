"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import Header from "@/app/assets/header/Header";
import ExecHangarTimer from "@/components/timers/ExecHangarTimer";
import ContestedZonePanel from "@/components/timers/ContestedZonePanel";
import CompboardTracker from "@/components/timers/CompboardTracker";

export default function TimersPage() {
  const [activeTab, setActiveTab] = useState("hangar");
  const t = useTranslations("PageTitles");
  const tt = useTranslations("Timers.tabs");

  const TABS = [
    { id: "hangar", label: tt("hangar"), icon: "⏱" },
    { id: "cz", label: tt("cz"), icon: "🎯" },
    { id: "compboard", label: tt("compboard"), icon: "📋" },
  ];

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <video
        autoPlay
        loop
        muted
        playsInline
        className="fixed inset-0 w-full h-full object-cover opacity-15 pointer-events-none z-0"
      >
        <source src="/videos/industria.mp4" type="video/mp4" />
      </video>
      <div className="fixed inset-0 bg-gradient-to-b from-zinc-950/60 via-zinc-950/80 to-zinc-950/95 pointer-events-none z-0" />

      <Header subtitle={t("timers")} />

      <div className="flex-1 z-10 relative flex flex-col min-w-0">
        <div className="relative px-4 py-3 flex-1 overflow-y-auto">
          {/* Tab nav */}
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

          {/* Tab content */}
          <div className="mt-6">
            {activeTab === "hangar" && <ExecHangarTimer />}
            {activeTab === "cz" && <ContestedZonePanel />}
            {activeTab === "compboard" && <CompboardTracker />}
          </div>
        </div>
      </div>
    </main>
  );
}
