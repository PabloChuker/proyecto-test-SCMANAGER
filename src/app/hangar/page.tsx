"use client";

import Header from "@/app/assets/header/Header";
import { HangarDashboard } from "@/components/hangar/HangarDashboard";
import { useTranslations } from "next-intl";
import { BgVideo } from "@/components/shared/BgVideo";

export default function HangarPage() {
  const t = useTranslations("PageTitles");
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <BgVideo src="/videos/bg.mp4" className="fixed inset-0 w-full h-full object-cover opacity-15 pointer-events-none z-0" />
      <div className="fixed inset-0 bg-gradient-to-b from-zinc-950/60 via-zinc-950/80 to-zinc-950/95 pointer-events-none z-0" />
      <Header subtitle={t("hangar")} />
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <HangarDashboard />
      </div>
    </main>
  );
}
