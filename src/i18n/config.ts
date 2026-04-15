// =============================================================================
// SC LABS — i18n config
// Cookie-based locale (no URL routing). The cookie name matches the
// next-intl convention so the library's helpers pick it up automatically.
// =============================================================================

export const LOCALES = ["en", "es", "de", "fr", "zh"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_COOKIE = "NEXT_LOCALE";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  es: "Español",
  de: "Deutsch",
  fr: "Français",
  zh: "中文",
};

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

/** Picks the best locale from an Accept-Language header, falling back to default. */
export function pickLocaleFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  const parts = header
    .split(",")
    .map((p) => p.trim().split(";")[0].toLowerCase());
  for (const p of parts) {
    const base = p.split("-")[0];
    if (isLocale(base)) return base as Locale;
  }
  return DEFAULT_LOCALE;
}
