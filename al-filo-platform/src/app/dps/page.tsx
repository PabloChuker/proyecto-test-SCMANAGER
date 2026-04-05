"use client";

import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import LoadoutBuilder from "@/components/ships/LoadoutBuilder";

// ─── SVG Icon helper ────────────────────────────────────────────────────────
function SvgIcon({ children, vb = "0 0 24 24" }: { children: React.ReactNode; vb?: string }) {
  return (
    <svg viewBox={vb} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      {children}
    </svg>
  );
}

// ─── Sidebar navigation items ───────────────────────────────────────────────
const SIDEBAR_ITEMS = [
  {
    key: "dps", href: "/dps", label: "DPS Calculator",
    icon: <SvgIcon><circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /><path d="M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></SvgIcon>,
  },
  {
    key: "ships", href: "/components?tab=ships", label: "Ships",
    icon: <SvgIcon><path d="M12 2L4 9l1 11h14l1-11L12 2z" /><path d="M8 20v-4h8v4" /></SvgIcon>,
  },
  {
    key: "weapons", href: "/components?tab=weapons", label: "Weapons",
    icon: <SvgIcon><circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /><path d="M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></SvgIcon>,
  },
  {
    key: "missiles", href: "/components?tab=missiles", label: "Missiles",
    icon: <SvgIcon><path d="M4 20L20 4" /><path d="M15 4h5v5" /><path d="M4 15l3 3" /><path d="M7 12l3 3" /></SvgIcon>,
  },
  {
    key: "emps", href: "/components?tab=emps", label: "EMP Generators",
    icon: <SvgIcon><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /><path d="M8 2h8" /></SvgIcon>,
  },
  {
    key: "shields", href: "/components?tab=shields", label: "Shields",
    icon: <SvgIcon><path d="M12 3L4 7v6c0 5.25 3.38 9.76 8 11 4.62-1.24 8-5.75 8-11V7l-8-4z" /></SvgIcon>,
  },
  {
    key: "power_plants", href: "/components?tab=power_plants", label: "Power Plants",
    icon: <SvgIcon><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></SvgIcon>,
  },
  {
    key: "coolers", href: "/components?tab=coolers", label: "Coolers",
    icon: <SvgIcon><path d="M12 2v20M17 7l-10 10M22 12H2M17 17L7 7" /><circle cx="12" cy="12" r="3" /></SvgIcon>,
  },
  {
    key: "quantum_drives", href: "/components?tab=quantum_drives", label: "Quantum Drives",
    icon: <SvgIcon><circle cx="12" cy="12" r="4" /><ellipse cx="12" cy="12" rx="10" ry="4" /><ellipse cx="12" cy="12" rx="4" ry="10" /></SvgIcon>,
  },
  {
    key: "qed", href: "/components?tab=qed", label: "QED Generators",
    icon: <SvgIcon><circle cx="12" cy="12" r="8" strokeDasharray="4 2" /><circle cx="12" cy="12" r="3" /><path d="M12 4v3M12 17v3M4 12h3M17 12h3" /></SvgIcon>,
  },
  {
    key: "mining", href: "/components?tab=mining", label: "Mining Lasers",
    icon: <SvgIcon><path d="M14 4l-4 16" /><path d="M8 8l-4 4 4 4" /><path d="M16 8l4 4-4 4" /></SvgIcon>,
  },
  {
    key: "turrets", href: "/components?tab=turrets", label: "Turrets",
    icon: <SvgIcon><rect x="6" y="14" width="12" height="6" rx="1" /><path d="M12 14V8" /><circle cx="12" cy="6" r="2" /><path d="M8 8l-2-2M16 8l2-2" /></SvgIcon>,
  },
];

export default function DpsPage() {
  const pathname = usePathname();

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex">
      {/* ── Background video ── */}
      <video
        autoPlay loop muted playsInline
        className="fixed inset-0 w-full h-full object-cover opacity-15 pointer-events-none z-0"
      >
        <source src="/videos/dps.mp4" type="video/mp4" />
      </video>
      <div className="fixed inset-0 bg-gradient-to-b from-zinc-950/60 via-zinc-950/80 to-zinc-950/95 pointer-events-none z-0" />

      {/* ═══ Sidebar ═══ */}
      <aside className="w-12 sm:w-14 flex-shrink-0 bg-zinc-950/90 border-r border-zinc-800/50 flex flex-col items-center py-3 gap-1 z-20 sticky top-0 h-screen overflow-y-auto">
        {/* Logo */}
        <Link href="/" className="mb-3 opacity-60 hover:opacity-100 transition-opacity">
          <Image src="/sclabs-logo.png" alt="SC LABS" width={24} height={24} className="rounded-sm" />
        </Link>
        <div className="w-6 h-px bg-zinc-800 mb-2" />

        {SIDEBAR_ITEMS.map((item) => {
          const isActive = item.key === "dps";
          return (
            <Link
              key={item.key}
              href={item.href}
              title={item.label}
              className={`
                w-9 h-9 sm:w-10 sm:h-10 rounded flex items-center justify-center transition-all duration-150
                ${isActive
                  ? "bg-amber-500/15 text-amber-400 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.3)]"
                  : "text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/40"
                }
              `}
            >
              {item.icon}
            </Link>
          );
        })}
      </aside>

      {/* ═══ Main Content ═══ */}
      <div className="flex-1 z-10 relative flex flex-col min-w-0">
        {/* ── Header ── */}
        <header className="sticky top-0 z-40 border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-xl">
          <div className="px-4 sm:px-6 flex items-center justify-between h-12">
            <div className="flex items-center gap-3">
              <Link href="/" className="text-xs tracking-[0.15em] uppercase text-zinc-600 hover:text-zinc-400 transition-colors">
                SC Labs
              </Link>
              <div className="h-4 w-px bg-zinc-800" />
              <span className="text-xs tracking-[0.12em] uppercase text-amber-500 font-medium">
                DPS Calculator
              </span>
            </div>

            <nav className="hidden sm:flex items-center gap-5 text-[10px] tracking-[0.12em] uppercase text-zinc-600">
              <span className="text-amber-500 border-b border-amber-500/30 pb-0.5">DPS Calc</span>
              <Link href="/ships" className="hover:text-zinc-400 transition-colors">Naves</Link>
              <Link href="/compare" className="hover:text-zinc-400 transition-colors">Comparar</Link>
              <Link href="/components" className="hover:text-zinc-400 transition-colors">Componentes</Link>
            </nav>
          </div>
        </header>

        {/* ── Content ── */}
        <div className="relative px-4 py-3 flex-1">
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-20">
                <div className="w-4 h-4 border-2 border-zinc-800 border-t-amber-500 rounded-full animate-spin mr-3" />
                <span className="text-xs text-zinc-600 font-mono uppercase tracking-widest">
                  Loading calculator...
                </span>
              </div>
            }
          >
            <LoadoutBuilder shipId="AEGS_Avenger_Titan" />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
