"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { NAV_SECTIONS } from "./navigation";
import { useAuth } from "@/contexts/AuthContext";
import NotificationBell from "@/components/notifications/NotificationBell";
import LanguageSwitcher from "@/components/shared/LanguageSwitcher";
import PerformanceToggle from "@/components/shared/PerformanceToggle";
import ReferralRotator from "@/components/shared/ReferralRotator";
import { DonateButton } from "@/components/shared/DonateButton";
import dynamic from "next/dynamic";

// REINSTALL 2026-04-28: GameVersionToggle re-implementado basado en datos
// reales de Supabase. Confirmamos formato "X.Y.Z-{branch}.{build}" en el
// row "4.7.0-LIVE.11518367" del Avenger Titan. Se carga client-only via
// dynamic({ssr:false}) para evitar romper el SSR si el store/endpoint
// tienen cualquier issue.
const GameVersionToggle = dynamic(
  () => import("@/components/shared/GameVersionToggle"),
  { ssr: false, loading: () => null },
);

interface HeaderProps {
  subtitle?: string;
}

export default function Header({ subtitle }: HeaderProps) {
  const pathname = usePathname();
  const t = useTranslations("Header.sections");
  const tm = useTranslations("Header.menu");
  const th = useTranslations("Header");
  const { user, profile, loading, signInWithDiscord, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  // Fase R.5 (2026-05-02): drawer móvil — sólo visible <md.
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setActiveSection(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Cerrar drawer móvil cuando el usuario navega a una ruta nueva.
  useEffect(() => {
    setMobileDrawerOpen(false);
  }, [pathname]);

  const isSectionActive = (section: (typeof NAV_SECTIONS)[number]) => {
    if (section.items) {
      return section.items.some(
        (item) => pathname === item.href || pathname.startsWith(item.href + "/")
      );
    }
    return pathname === section.href || pathname.startsWith((section.href ?? "") + "/");
  };

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-xl">
      {/*
        grid-cols-[1fr_auto_1fr] guarantees the center column is always
        pixel-perfect centered regardless of left/right content width.
      */}
      <div className="grid grid-cols-[1fr_auto_1fr] px-4 sm:px-6 h-[72px] items-center">

        {/* ── Left: Logo + optional subtitle ── */}
        {/* Móvil: gap reducido (más aire) y solo el logo. Desktop: gap-3 + texto. */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Branding.1 (2026-05-02): logo header +30% (44 → 58) con drop-shadow
              ambar para resaltar la insignia. relative z-10 garantiza que pueda
              sobresalir del header (h-72) sin ser tapado por el border-b. */}
          <Link
            href="/"
            className="relative z-10 flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <Image
              src="/sclabs-logo.png"
              alt="SC LABS"
              width={58}
              height={58}
              className="rounded-sm drop-shadow-[0_0_10px_rgba(232,137,12,0.3)]"
              priority
            />
            {/* "SC Labs" textual solo desde sm+ — en móvil el logo basta y libera espacio. */}
            <span className="hidden sm:inline text-xs tracking-[0.15em] uppercase text-zinc-500 hover:text-zinc-300 transition-colors">
              SC Labs
            </span>
          </Link>

          {subtitle && (
            <>
              {/* Subtitle visible en todos los breakpoints (es contexto de página),
                  pero el separador vertical sólo desde sm+ para liberar 4px en móvil. */}
              <div className="hidden sm:block h-4 w-px bg-zinc-800" />
              <span className="text-[10px] sm:text-xs tracking-[0.1em] sm:tracking-[0.12em] uppercase text-amber-500 font-medium">
                {subtitle}
              </span>
            </>
          )}
          {/* Toggle Live / PTU. Cada módulo que toque tablas con game_version
              debe usar useGameVersionParam() para concatenar `?gv=` al fetch.
              Móvil (<md): se mueve al drawer (sigue accesible, libera espacio). */}
          <div className="hidden md:flex items-center gap-3">
            <div className="h-4 w-px bg-zinc-800 ml-1" />
            <GameVersionToggle />
          </div>

          {/* Hamburger — visible sólo <md. Toggle del drawer móvil. */}
          <button
            type="button"
            onClick={() => setMobileDrawerOpen((v) => !v)}
            className="md:hidden ml-1 w-9 h-9 flex items-center justify-center rounded hover:bg-zinc-800/40 transition-colors text-zinc-300"
            aria-label={mobileDrawerOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileDrawerOpen}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {mobileDrawerOpen ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </>
              ) : (
                <>
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </>
              )}
            </svg>
          </button>
        </div>

        {/* ── Center: Section nav — grid column keeps it truly centered ── */}
        <nav
          ref={navRef}
          className="hidden sm:flex items-center gap-2"
        >
          {NAV_SECTIONS.map((section) => {
            const isOpen = activeSection === section.key;
            const isActive = isSectionActive(section);
            const sectionLabel = t.has(section.key) ? t(section.key) : section.label;

            if (!section.items) {
              return (
                <Link
                  key={section.key}
                  href={section.href!}
                  className={`px-3 py-2 text-[10px] tracking-[0.15em] uppercase transition-colors duration-200 ${
                    isActive ? "text-amber-400" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {sectionLabel}
                </Link>
              );
            }

            return (
              <div key={section.key} className="relative">
                <button
                  onClick={() => setActiveSection(isOpen ? null : section.key)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-[10px] tracking-[0.15em] uppercase transition-colors duration-200 ${
                    isActive || isOpen ? "text-amber-400" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {sectionLabel}
                  <svg
                    width="8"
                    height="8"
                    viewBox="0 0 10 10"
                    fill="none"
                    className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                  >
                    <path
                      d="M2 4l3 3 3-3"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>

                {isOpen && (
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 min-w-[148px] rounded-lg border border-zinc-800/70 bg-zinc-900/95 backdrop-blur-xl shadow-xl shadow-black/30 py-1 z-50">
                    {section.items.map((item) => {
                      const itemActive =
                        pathname === item.href || pathname.startsWith(item.href + "/");
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setActiveSection(null)}
                          className={`flex items-center px-3 py-2 text-[11px] tracking-wider transition-colors ${
                            itemActive
                              ? "text-amber-500 bg-amber-500/10"
                              : "text-zinc-300 hover:bg-zinc-800/60 hover:text-zinc-100"
                          }`}
                        >
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* ── Right: Referral rotator + Performance + Lang + Auth ──
            Fase S (2026-04-25): ReferralRotator queda al inicio de la zona
            derecha — visualmente entre el último menú central (TOOLS) y el
            toggle FULL/LITE. Se oculta solo en mobile (<md).
            Fase R.5 (2026-05-02): cada item secundario se esconde por
            breakpoint para evitar overflow en móvil. NotificationBell + auth
            siempre visibles. Lo escondido aparece dentro del drawer móvil. */}
        <div className="flex items-center gap-2 justify-end">
          <div className="hidden md:flex items-center"><ReferralRotator /></div>
          {/* FEAT 2026-04-26: botón de donación PayPal (hosted_button_id en
              el componente). Visible desde sm+, escondido en mobile. */}
          <div className="hidden md:flex items-center"><DonateButton /></div>
          <div className="hidden lg:flex items-center"><PerformanceToggle /></div>
          <div className="hidden sm:flex items-center"><LanguageSwitcher /></div>
          {loading ? (
            <div className="w-6 h-6 rounded-full bg-zinc-800 animate-pulse" />
          ) : user ? (
            <div ref={menuRef} className="relative flex items-center gap-1">
              <NotificationBell />
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
                  {profile?.display_name ?? user.user_metadata?.full_name ?? th("profileFallback")}
                </span>
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  className={`text-zinc-500 transition-transform duration-200 ${menuOpen ? "rotate-180" : ""}`}
                >
                  <path
                    d="M2 4l3 3 3-3"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              {/* User dropdown */}
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-44 rounded-lg border border-zinc-800/70 bg-zinc-900/95 backdrop-blur-xl shadow-xl shadow-black/30 py-1 z-50">
                  <Link href="/profile" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800/60 hover:text-zinc-100 transition-colors">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4" /><path d="M20 21a8 8 0 0 0-16 0" /></svg>
                    {tm("profile")}
                  </Link>
                  <div className="my-1 border-t border-zinc-800/50" />
                  <Link href="/my-account" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800/60 hover:text-zinc-100 transition-colors">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 7h-3a2 2 0 0 1-2-2V2" /><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M12 18v-6" /><path d="M9 15h6" /></svg>
                    {tm("myAccount")}
                  </Link>
                  <div className="my-1 border-t border-zinc-800/50" />
                  <button onClick={() => { setMenuOpen(false); signOut(); }} className="flex items-center gap-2.5 px-3 py-2 text-xs text-red-400/80 hover:bg-red-500/10 hover:text-red-400 transition-colors w-full text-left">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                    {tm("logout")}
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
              {/* Texto solo desde sm+ — en móvil el ícono Discord ya es reconocible. */}
              <span className="hidden sm:inline">{th("login")}</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Mobile drawer (Fase R.5) — sólo se renderiza/visible <md ──
          Se despliega hacia abajo del header sticky. Replica las 5 NAV_SECTIONS
          como accordion expandido + los items secundarios (GVT / Referral /
          Donate / Lang) que en desktop viven en las zonas left/right. */}
      {mobileDrawerOpen && (
        <div className="md:hidden border-t border-zinc-800/50 bg-zinc-950/95 backdrop-blur-xl max-h-[80vh] overflow-y-auto">
          <div className="px-4 py-3 space-y-3">

            {/* Game Version Toggle (movido del left) */}
            <div className="flex items-center justify-between border-b border-zinc-800/50 pb-3">
              <span className="text-[10px] tracking-[0.15em] uppercase text-zinc-500">Game Version</span>
              <GameVersionToggle />
            </div>

            {/* Navegación: las 5 secciones expandidas */}
            <nav className="space-y-1">
              {NAV_SECTIONS.map((section) => {
                const sectionLabel = t.has(section.key) ? t(section.key) : section.label;
                if (!section.items) {
                  return (
                    <Link
                      key={section.key}
                      href={section.href!}
                      onClick={() => setMobileDrawerOpen(false)}
                      className="block px-3 py-2.5 text-sm tracking-wide text-zinc-200 hover:bg-zinc-800/40 rounded transition-colors"
                    >
                      {sectionLabel}
                    </Link>
                  );
                }
                return (
                  <div key={section.key} className="space-y-0.5">
                    <div className="px-3 pt-3 pb-1 text-[10px] tracking-[0.18em] uppercase text-amber-500/80 font-medium">
                      {sectionLabel}
                    </div>
                    {section.items.map((item) => {
                      const itemActive = pathname === item.href || pathname.startsWith(item.href + "/");
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMobileDrawerOpen(false)}
                          className={`block px-5 py-2 text-sm tracking-wide rounded transition-colors ${
                            itemActive
                              ? "text-amber-400 bg-amber-500/10"
                              : "text-zinc-300 hover:bg-zinc-800/40 hover:text-zinc-100"
                          }`}
                        >
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
            </nav>

            {/* Items secundarios (movidos del right) — alineados horizontalmente */}
            <div className="border-t border-zinc-800/50 pt-3 flex items-center justify-between gap-3 flex-wrap">
              <ReferralRotator />
              <div className="flex items-center gap-2">
                <DonateButton />
                <LanguageSwitcher />
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
