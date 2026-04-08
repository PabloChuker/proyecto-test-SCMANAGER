"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { NAV_MODULES } from "./navigation";
import { useAuth } from "@/contexts/AuthContext";

interface HeaderProps {
  subtitle?: string;
}

export default function Header({ subtitle }: HeaderProps) {
  const pathname = usePathname();
  const { user, profile, loading, signInWithDiscord, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const isActive = (mod: (typeof NAV_MODULES)[number]) => {
    if (pathname === mod.href) return true;
    if (pathname.startsWith(mod.href + "/")) return true;
    if (mod.matchPaths?.some((p) => pathname.startsWith(p))) return true;
    return false;
  };

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

        {/* ── Center: Navigation ── */}
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
                <span className="absolute -bottom-0.5 left-0 right-0 h-px bg-amber-500/0 group-hover:bg-amber-500/40 transition-all duration-300" />
              </Link>
            );
          })}
        </nav>

        {/* ── Right: Auth ── */}
        <div className="flex items-center gap-2">
          {loading ? (
            <div className="w-6 h-6 rounded-full bg-zinc-800 animate-pulse" />
          ) : user ? (
            <div ref={menuRef} className="relative flex items-center">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-1.5 hover:opacity-80 transition-opacity cursor-pointer"
              >
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt=""
                    className="w-7 h-7 rounded-full border border-amber-500/30"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs">
                    👤
                  </div>
                )}
                <span className="text-[10px] text-zinc-400 tracking-wider hidden md:inline">
                  {profile?.display_name ?? user.user_metadata?.full_name ?? "Perfil"}
                </span>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={`text-zinc-500 transition-transform duration-200 ${menuOpen ? "rotate-180" : ""}`}>
                  <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {/* Dropdown */}
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-44 rounded-lg border border-zinc-800/70 bg-zinc-900/95 backdrop-blur-xl shadow-xl shadow-black/30 py-1 z-50">
                  <Link
                    href="/profile"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800/60 hover:text-zinc-100 transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="8" r="4" />
                      <path d="M20 21a8 8 0 0 0-16 0" />
                    </svg>
                    Perfil
                  </Link>
                  <Link
                    href="/friends"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800/60 hover:text-zinc-100 transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    Social
                  </Link>
                  <Link
                    href="/party"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800/60 hover:text-zinc-100 transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-4-4h-4" />
                      <circle cx="19" cy="7" r="4" />
                    </svg>
                    Party
                  </Link>
                  <div className="my-1 border-t border-zinc-800/50" />
                  <button
                    onClick={() => { setMenuOpen(false); signOut(); }}
                    className="flex items-center gap-2.5 px-3 py-2 text-xs text-red-400/80 hover:bg-red-500/10 hover:text-red-400 transition-colors w-full text-left"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    Cerrar Sesion
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={signInWithDiscord}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#5865F2]/20 hover:bg-[#5865F2]/30 border border-[#5865F2]/30 text-[10px] tracking-wider text-[#5865F2] transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
              Login
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
