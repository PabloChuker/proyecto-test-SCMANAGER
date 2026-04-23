"use client";
// =============================================================================
// SC LABS — PerformanceToggle (Fase I.2)
//
// Botón en el header global que alterna entre modo "full" (animaciones,
// videos de fondo, 3D) y "light" (assets estáticos, menos GPU idle).
// Persistido por dispositivo en localStorage (ver usePerformanceStore).
//
// Estado visual:
//   - Full:  ícono Zap gris, label "Full"  (outline, bg zinc)
//   - Light: ícono Leaf verde, label "Light" (filled verde suave)
//
// i18n: las 4 claves PerformanceToggle.{labelFull,labelLight,titleFull,titleLight}
// están en messages/{en,es,de,fr,zh}.json.
// =============================================================================
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Leaf, Zap } from "lucide-react";
import { usePerformanceStore, useIsLight } from "@/store/usePerformanceStore";

export default function PerformanceToggle() {
  const t = useTranslations("PerformanceToggle");
  const toggle = usePerformanceStore((s) => s.toggle);
  const isLight = useIsLight();

  // Evita hydration mismatch: el estado persistido sólo está disponible
  // en el cliente. Antes del mount renderizamos el estado default ("full")
  // para que coincida con el HTML generado por el servidor.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const effectiveLight = mounted && isLight;
  const Icon = effectiveLight ? Leaf : Zap;
  const label = effectiveLight ? t("labelLight") : t("labelFull");
  const title = effectiveLight ? t("titleLight") : t("titleFull");

  const colorClasses = effectiveLight
    ? "text-green-400 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30"
    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 border border-transparent";

  return (
    <button
      onClick={toggle}
      title={title}
      aria-label={t("aria")}
      aria-pressed={effectiveLight}
      className={`flex items-center gap-1.5 h-8 px-2 rounded text-[11px] font-mono tracking-wider uppercase transition-colors ${colorClasses}`}
    >
      <Icon size={14} aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
