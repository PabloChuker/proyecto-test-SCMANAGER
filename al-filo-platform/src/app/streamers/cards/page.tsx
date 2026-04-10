"use client";
// =============================================================================
// SC LABS — /streamers/cards — Ship Info Card Generator
//
// Ship selector + preview de ShipInfoCard + picker de tema + toggle horizontal/
// vertical + export a PNG + copia de URL para OBS Browser Source.
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Header from "@/app/assets/header/Header";
import ShipInfoCard from "@/components/streamers/ShipInfoCard";
import {
  CARD_THEMES,
  type CardVariant,
} from "@/components/streamers/ship-card-themes";
import type { ShipDetailResponseV2 } from "@/types/ships";

// ── Tipos de la lista de naves ──
interface ShipListItem {
  reference: string;
  name: string;
  manufacturer: string | null;
  role: string | null;
  size: string | null;
}

interface ShipsListResponse {
  data: ShipListItem[];
  meta: { total: number };
}

export default function StreamerCardsPage() {
  // Ship search
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<ShipListItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Selected ship
  const [selectedReference, setSelectedReference] = useState<string | null>(null);
  const [shipDetail, setShipDetail] = useState<ShipDetailResponseV2 | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Card config
  const [themeKey, setThemeKey] = useState<string>("black");
  const [variant, setVariant] = useState<CardVariant>("horizontal");

  // Export state
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);

  // ── Search ships ──
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch("/api/ships", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            search: search.trim(),
            limit: 30,
            sortBy: "name",
            sortOrder: "ASC",
          }),
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const json: ShipsListResponse = await res.json();
        setSearchResults(json.data || []);
      } catch (e) {
        console.error("Search ships failed:", e);
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 250);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [search]);

  // ── Load ship detail when selected ──
  useEffect(() => {
    if (!selectedReference) {
      setShipDetail(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const res = await fetch(`/api/ships/${encodeURIComponent(selectedReference)}`);
        if (!res.ok) throw new Error("HTTP " + res.status);
        const json: ShipDetailResponseV2 = await res.json();
        if (!cancelled) setShipDetail(json);
      } catch (e) {
        console.error("Load ship failed:", e);
        if (!cancelled) setDetailError("No se pudo cargar la nave");
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedReference]);

  // ── Export PNG ──
  const handleExportPng = useCallback(async () => {
    if (!shipDetail) return;
    setExporting(true);
    try {
      const { toPng } = await import("html-to-image");
      const node = document.getElementById("sclabs-ship-card");
      if (!node) throw new Error("Card node not found");
      const dataUrl = await toPng(node, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor:
          CARD_THEMES.find((t) => t.key === themeKey)?.bg ?? "#000000",
      });
      // Trigger download
      const link = document.createElement("a");
      const safeName = (shipDetail.data.localizedName || shipDetail.data.name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      link.download = `sclabs-${safeName}-${variant}-${themeKey}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error("Export PNG failed:", e);
      alert("No se pudo exportar la imagen. Mirá la consola.");
    } finally {
      setExporting(false);
    }
  }, [shipDetail, themeKey, variant]);

  // ── Copy OBS URL ──
  const obsUrl = useMemo(() => {
    if (typeof window === "undefined" || !selectedReference) return "";
    const url = new URL("/streamers/overlay", window.location.origin);
    url.searchParams.set("ship", selectedReference);
    url.searchParams.set("theme", themeKey);
    url.searchParams.set("variant", variant);
    return url.toString();
  }, [selectedReference, themeKey, variant]);

  const handleCopyUrl = useCallback(async () => {
    if (!obsUrl) return;
    try {
      await navigator.clipboard.writeText(obsUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e) {
      console.error("Copy failed:", e);
    }
  }, [obsUrl]);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <video
        autoPlay
        loop
        muted
        playsInline
        className="fixed inset-0 w-full h-full object-cover opacity-10 pointer-events-none z-0"
      >
        <source src="/media/videos/bg.mp4" type="video/mp4" />
      </video>
      <div className="fixed inset-0 bg-gradient-to-b from-zinc-950/70 via-zinc-950/85 to-zinc-950/95 pointer-events-none z-0" />

      <Header subtitle="Streamers · Ship Cards" />

      <div className="relative z-10 flex-1 w-full max-w-[1600px] mx-auto px-4 sm:px-6 py-6">
        {/* Breadcrumb */}
        <div className="mb-4 flex items-center gap-2 text-[10px] font-mono tracking-widest uppercase text-zinc-600">
          <Link href="/streamers" className="hover:text-zinc-400 transition-colors">
            ← Streamers
          </Link>
          <span className="text-zinc-800">/</span>
          <span className="text-amber-500">Ship Cards</span>
        </div>

        <div className="grid grid-cols-12 gap-4 lg:gap-6">
          {/* ═══ Controls column ═══ */}
          <aside className="col-span-12 lg:col-span-4 xl:col-span-3 space-y-4">
            {/* Ship search */}
            <div className="border border-zinc-800/60 bg-zinc-900/40 rounded p-4">
              <div className="text-[10px] tracking-[0.18em] uppercase font-mono text-amber-500 mb-2">
                ➊ Elegí una nave
              </div>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar: hull b, cutlass, carrack…"
                className="w-full px-3 py-2 bg-zinc-900/80 border border-zinc-800 rounded text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500/40"
              />
              <div className="mt-2 max-h-64 overflow-y-auto">
                {searchLoading ? (
                  <div className="text-[10px] text-zinc-600 py-2 text-center">
                    Buscando…
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="text-[10px] text-zinc-700 py-2 text-center">
                    Sin resultados
                  </div>
                ) : (
                  <ul className="divide-y divide-zinc-800/40">
                    {searchResults.map((s) => (
                      <li key={s.reference}>
                        <button
                          onClick={() => setSelectedReference(s.reference)}
                          className={`w-full text-left px-2 py-1.5 text-xs transition-colors ${
                            selectedReference === s.reference
                              ? "bg-amber-500/10 text-amber-300"
                              : "text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200"
                          }`}
                        >
                          <div className="truncate">{s.name}</div>
                          {s.manufacturer && (
                            <div className="text-[9px] font-mono text-zinc-600 tracking-wider uppercase mt-0.5">
                              {s.manufacturer}
                            </div>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Variant */}
            <div className="border border-zinc-800/60 bg-zinc-900/40 rounded p-4">
              <div className="text-[10px] tracking-[0.18em] uppercase font-mono text-amber-500 mb-2">
                ➋ Orientación
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setVariant("horizontal")}
                  className={`py-2 text-[10px] tracking-widest uppercase font-mono rounded transition-colors border ${
                    variant === "horizontal"
                      ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                      : "bg-zinc-900/60 border-zinc-800 text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  ▭ Horizontal
                </button>
                <button
                  onClick={() => setVariant("vertical")}
                  className={`py-2 text-[10px] tracking-widest uppercase font-mono rounded transition-colors border ${
                    variant === "vertical"
                      ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                      : "bg-zinc-900/60 border-zinc-800 text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  ▯ Vertical
                </button>
              </div>
            </div>

            {/* Theme picker */}
            <div className="border border-zinc-800/60 bg-zinc-900/40 rounded p-4">
              <div className="text-[10px] tracking-[0.18em] uppercase font-mono text-amber-500 mb-2">
                ➌ Tema
              </div>
              <div className="grid grid-cols-3 gap-2">
                {CARD_THEMES.map((t) => {
                  const active = themeKey === t.key;
                  return (
                    <button
                      key={t.key}
                      onClick={() => setThemeKey(t.key)}
                      title={t.label}
                      className={`relative rounded border transition-all ${
                        active
                          ? "border-amber-500/60 ring-1 ring-amber-500/30"
                          : "border-zinc-800 hover:border-zinc-700"
                      }`}
                      style={{
                        backgroundColor: t.bg,
                        height: 44,
                      }}
                    >
                      <span
                        className="absolute inset-0 flex items-center justify-center text-[9px] font-mono tracking-wider uppercase"
                        style={{ color: t.accent }}
                      >
                        {t.label.split(" ")[0]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Export actions */}
            <div className="border border-zinc-800/60 bg-zinc-900/40 rounded p-4 space-y-2">
              <div className="text-[10px] tracking-[0.18em] uppercase font-mono text-amber-500 mb-1">
                ➍ Exportar
              </div>
              <button
                onClick={handleExportPng}
                disabled={!shipDetail || exporting}
                className="w-full py-2 text-[10px] tracking-widest uppercase font-mono rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {exporting ? "Generando…" : "↓ Descargar PNG"}
              </button>
              <button
                onClick={handleCopyUrl}
                disabled={!shipDetail}
                className="w-full py-2 text-[10px] tracking-widest uppercase font-mono rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {copied ? "✓ URL copiada" : "⧉ Copiar URL para OBS"}
              </button>
              {obsUrl && (
                <div className="mt-2 p-2 bg-zinc-950/60 border border-zinc-800 rounded font-mono text-[9px] text-zinc-500 break-all">
                  {obsUrl}
                </div>
              )}
            </div>

            {/* Help */}
            <div className="text-[10px] text-zinc-600 leading-relaxed font-mono">
              <p className="mb-1 text-zinc-500 tracking-wider uppercase">Tip OBS</p>
              <p>
                Pegá la URL en una fuente &quot;Browser&quot; de OBS.
                {variant === "horizontal"
                  ? " Dimensiones sugeridas: 1600 × 480."
                  : " Dimensiones sugeridas: 720 × 1280."}
              </p>
            </div>
          </aside>

          {/* ═══ Preview column ═══ */}
          <section className="col-span-12 lg:col-span-8 xl:col-span-9">
            <div className="border border-zinc-800/60 bg-zinc-950/60 rounded p-6 min-h-[640px] flex items-center justify-center overflow-hidden">
              {!selectedReference ? (
                <div className="text-center">
                  <div className="text-xs text-zinc-600 font-mono tracking-wider uppercase">
                    Seleccioná una nave para empezar
                  </div>
                </div>
              ) : detailLoading ? (
                <div className="text-xs text-zinc-500 font-mono animate-pulse">
                  Cargando datos de la nave…
                </div>
              ) : detailError ? (
                <div className="text-xs text-red-400 font-mono">{detailError}</div>
              ) : !shipDetail ? (
                <div className="text-xs text-zinc-500 font-mono">Sin datos</div>
              ) : (
                <div
                  style={{
                    width: variant === "horizontal" ? 1600 * 0.55 : 720 * 0.48,
                    height: variant === "horizontal" ? 480 * 0.55 : 1280 * 0.48,
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      transform:
                        variant === "horizontal" ? "scale(0.55)" : "scale(0.48)",
                      transformOrigin: "top left",
                    }}
                  >
                    <ShipInfoCard
                      data={shipDetail}
                      themeKey={themeKey}
                      variant={variant}
                    />
                  </div>
                </div>
              )}
            </div>

            <p className="mt-3 text-[10px] text-zinc-600 font-mono tracking-wider text-center">
              Vista previa escalada. PNG exportado a resolución real
              {variant === "horizontal" ? " 3200 × 960" : " 1440 × 2560"} (2×).
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
