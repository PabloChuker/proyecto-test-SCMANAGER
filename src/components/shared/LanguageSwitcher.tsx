"use client";
// =============================================================================
// SC LABS — LanguageSwitcher
// Dropdown que setea la cookie NEXT_LOCALE y recarga la página.
// Sin URL routing: la cookie es suficiente para que next-intl detecte
// el idioma en el próximo request RSC.
// =============================================================================

import { useTransition, useState, useRef, useEffect } from "react";
import { useLocale } from "next-intl";
import { LOCALES, LOCALE_COOKIE, LOCALE_LABELS, type Locale } from "@/i18n/config";

const FLAG: Record<Locale, string> = {
  en: "🇬🇧",
  es: "🇪🇸",
  de: "🇩🇪",
  fr: "🇫🇷",
  zh: "🇨🇳",
};

export default function LanguageSwitcher() {
  const current = useLocale() as Locale;
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const pick = (loc: Locale) => {
    // 1 year, path=/
    document.cookie = `${LOCALE_COOKIE}=${loc}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    setOpen(false);
    startTransition(() => {
      // Hard refresh so RSC re-renders with the new locale messages.
      window.location.reload();
    });
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 h-8 px-2 rounded text-[11px] font-mono tracking-wider uppercase text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors"
        title={LOCALE_LABELS[current]}
      >
        <span className="text-sm leading-none">{FLAG[current]}</span>
        <span className="hidden sm:inline">{current}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-40 rounded-lg border border-zinc-800/70 bg-zinc-900/95 backdrop-blur-xl shadow-xl shadow-black/30 z-50 overflow-hidden">
          {LOCALES.map((loc) => (
            <button
              key={loc}
              onClick={() => pick(loc)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors ${
                loc === current
                  ? "bg-amber-500/10 text-amber-300"
                  : "text-zinc-300 hover:bg-zinc-800/60"
              }`}
            >
              <span className="text-sm leading-none">{FLAG[loc]}</span>
              <span className="flex-1 text-left">{LOCALE_LABELS[loc]}</span>
              {loc === current && <span className="text-[10px] text-amber-400">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
