"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import Header from "@/app/assets/header/Header";
import { SIDEBAR_ITEMS } from "@/app/assets/header/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import InventoryTab from "./InventoryTab";
import WishlistTab from "./WishlistTab";
import LoadoutsTab from "./LoadoutsTab";

type Tab = "inventory" | "wishlist" | "loadouts";

export default function MyAccountPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("inventory");

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <div className="text-zinc-500 animate-pulse">Cargando...</div>
      </main>
    );
  }

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: "inventory", label: "Inventario", icon: "📦" },
    { key: "wishlist", label: "Wishlist", icon: "⭐" },
    { key: "loadouts", label: "Loadouts", icon: "🔧" },
  ];

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <video autoPlay loop muted playsInline className="fixed inset-0 w-full h-full object-cover opacity-15 pointer-events-none z-0">
        <source src="/videos/mineria.mp4" type="video/mp4" />
      </video>
      <div className="fixed inset-0 bg-gradient-to-b from-zinc-950/60 via-zinc-950/80 to-zinc-950/95 pointer-events-none z-0" />
      <Header subtitle="Mi Cuenta" />

      <div className="flex flex-1 min-h-0">
        <aside className="w-12 sm:w-14 flex-shrink-0 bg-zinc-950/90 border-r border-zinc-800/50 flex flex-col items-center py-3 gap-1 z-20 sticky top-12 h-[calc(100vh-3rem)] overflow-y-auto">
          {SIDEBAR_ITEMS.map((item) => (
            <Link key={item.key} href={item.href} title={item.label} className="w-9 h-9 sm:w-10 sm:h-10 rounded flex items-center justify-center hover:bg-zinc-800/40">
              <Image src={item.icon} alt={item.label} width={22} height={22} className="opacity-40 hover:opacity-70" />
            </Link>
          ))}
        </aside>

        <div className="flex-1 z-10 relative px-4 py-6 overflow-y-auto">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Tabs */}
            <div className="flex gap-2 border-b border-zinc-800/60 pb-2">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-4 py-2 text-sm tracking-wider uppercase transition-all ${
                    tab === t.key
                      ? "text-amber-400 border-b-2 border-amber-500"
                      : "text-zinc-500 hover:text-zinc-400 border-b-2 border-transparent"
                  }`}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            {tab === "inventory" && <InventoryTab />}
            {tab === "wishlist" && <WishlistTab />}
            {tab === "loadouts" && <LoadoutsTab />}
          </div>
        </div>
      </div>
    </main>
  );
}
