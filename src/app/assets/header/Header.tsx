"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { NAV_MODULES } from "./navigation";

/**
 * SC LABS — Shared Header Component
 *
 * Usage:
 *   import Header from "@/app/assets/header/Header";
 *   <Header />
 *
 * Props:
 *   subtitle — optional text shown next to the logo (e.g. "DPS Calculator")
 *              When omitted, the active module's label is used automatically.
 */
interface HeaderProps {
  subtitle?: string;
}

export default function Header({ subtitle }: HeaderProps) {
  const pathname = usePathname();

  /** Check if a nav module matches the current path */
  const isActive = (mod: typeof NAV_MODULES[number]) => {
    if (pathname === mod.href) return true;
    if (pathname.startsWith(mod.href + "/")) return true;
    if (mod.matchPaths?.some((p) => pathname.startsWith(p))) return true;
    return false;
  };

  /** Derive subtitle from the active module if not provided */
  const activeModule = NAV_MODULES.find((m) => isActive(m));
  const displaySubtitle = subtitle || activeModule?.label || "";

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-xl">
      <div className="px-4 sm:px-6 flex items-center justify-between h-12">
        {/* ── Left: Logo + Subtitle ── */}
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <Image
              src="/sclabs-logo.png"
              alt="SC LABS"
              width={24}
              height={24}
              className="rounded-sm"
            />
            <span className="text-xs tracking-[0.15em] uppercase text-zinc-500 hover:text-zinc-300 transition-colors">
              SC Labs
            </span>
          </Link>

          {displaySubtitle && (
            <>
              <div className="h-4 w-px bg-zinc-800" />
              <span className="text-xs tracking-[0.12em] uppercase text-amber-500 font-medium">
                {displaySubtitle}
              </span>
            </>
          )}
        </div>

        {/* ── Center/Right: Navigation ── */}
        <nav className="hidden sm:flex items-center gap-5 text-[10px] tracking-[0.12em] uppercase text-zinc-600">
          {NAV_MODULES.map((mod) => {
            const active = isActive(mod);
            return active ? (
              <span
                key={mod.key}
                className="text-amber-500 border-b border-amber-500/30 pb-0.5"
              >
                {mod.label}
              </span>
            ) : (
              <Link
                key={mod.key}
                href={mod.href}
                className="relative hover:text-zinc-300 transition-colors duration-200 group"
              >
                {mod.label}
                {/* Hover glow underline */}
                <span className="absolute -bottom-0.5 left-0 right-0 h-px bg-amber-500/0 group-hover:bg-amber-500/40 transition-all duration-300" />
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
