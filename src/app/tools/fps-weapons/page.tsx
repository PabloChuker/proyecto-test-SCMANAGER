"use client";

// =============================================================================
// /tools/fps-weapons — FPS Weapons Data
//
// Tabla compacta con todas las armas FPS de Star Citizen. Datos en la tabla
// `fps_weapons` (migración 061), expuestos vía /api/fps-weapons. El dataset
// es chico (~300 rows) así que el filter/search/sort se hace client-side.
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import Header from "@/app/assets/header/Header";

interface Weapon {
  name: string;
  type: string;
  magazine: number | null;
  bulletSpeed: number | null;
  alphaDamage: number | null;
  maxFirerate: number | null;
  maxDps: number | null;
  singleFirerate: number | null;
  singleDps: number | null;
  burstFirerate: number | null;
  burstDps: number | null;
  rapidFirerate: number | null;
  rapidDps: number | null;
  volumeMicroScu: number | null;
}

// Color por tipo de arma para el badge.
const TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  "Ballistic":         { bg: "bg-amber-500/15",   text: "text-amber-300",   border: "border-amber-500/30" },
  "Energy (Laser)":    { bg: "bg-red-500/15",     text: "text-red-300",     border: "border-red-500/30" },
  "Energy (Electron)": { bg: "bg-cyan-500/15",    text: "text-cyan-300",    border: "border-cyan-500/30" },
  "Energy (Plasma)":   { bg: "bg-violet-500/15",  text: "text-violet-300",  border: "border-violet-500/30" },
  "Electron":          { bg: "bg-cyan-500/15",    text: "text-cyan-300",    border: "border-cyan-500/30" },
  "Laser":             { bg: "bg-red-500/15",     text: "text-red-300",     border: "border-red-500/30" },
  "Rocket":            { bg: "bg-orange-500/15",  text: "text-orange-300",  border: "border-orange-500/30" },
  "Foam Dart":         { bg: "bg-pink-500/15",    text: "text-pink-300",    border: "border-pink-500/30" },
};

type SortKey =
  | "name" | "type" | "magazine" | "bulletSpeed" | "alphaDamage"
  | "maxFirerate" | "maxDps" | "singleDps" | "burstDps" | "rapidDps" | "volumeMicroScu";
type SortDir = "asc" | "desc";

function fmtNum(n: number | null, digits = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (n === 0) return "—";
  return digits > 0 ? n.toFixed(digits) : Math.round(n).toLocaleString();
}

export default function FpsWeaponsPage() {
  const [weapons, setWeapons] = useState<Weapon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("maxDps");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/fps-weapons")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setWeapons((d.weapons ?? []) as Weapon[]);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message ?? String(e));
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Tipos disponibles (orden alfabético, derivados del dataset).
  const allTypes = useMemo(() => {
    const set = new Set<string>();
    for (const w of weapons) if (w.type) set.add(w.type);
    return [...set].sort();
  }, [weapons]);

  // Conteo por tipo para mostrar al lado del filtro.
  const typeCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const w of weapons) m[w.type] = (m[w.type] ?? 0) + 1;
    return m;
  }, [weapons]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let arr = weapons;
    if (typeFilter !== "all") arr = arr.filter((w) => w.type === typeFilter);
    if (q) arr = arr.filter((w) => w.name.toLowerCase().includes(q) || w.type.toLowerCase().includes(q));
    // Sort. null/0 al final.
    const dir = sortDir === "asc" ? 1 : -1;
    const out = [...arr];
    out.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") {
        return av.localeCompare(bv) * dir;
      }
      const an = typeof av === "number" ? av : Number.NaN;
      const bn = typeof bv === "number" ? bv : Number.NaN;
      // null/0/NaN siempre al final
      if (!Number.isFinite(an) && !Number.isFinite(bn)) return 0;
      if (!Number.isFinite(an)) return 1;
      if (!Number.isFinite(bn)) return -1;
      return (an - bn) * dir;
    });
    return out;
  }, [weapons, search, typeFilter, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Numéricas arrancan en desc (mayor primero — DPS, alpha, etc.).
      const numeric: SortKey[] = ["magazine", "bulletSpeed", "alphaDamage", "maxFirerate", "maxDps", "singleDps", "burstDps", "rapidDps", "volumeMicroScu"];
      setSortDir(numeric.includes(key) ? "desc" : "asc");
    }
  };

  return (
    <>
      <Header subtitle="FPS WEAPONS" />
      <main className="min-h-screen px-4 sm:px-6 py-6 max-w-[1700px] mx-auto">
        <div className="mb-5">
          <h1 className="text-xl tracking-[0.18em] uppercase text-amber-400 font-medium">FPS Weapons Data</h1>
          <p className="text-xs text-zinc-500 mt-1">
            {loading ? "Loading…" : `${weapons.length} weapons`} · alpha damage, fire modes (single / burst / rapid),
            magazine, bullet speed, volume per round.
          </p>
          {error && (
            <p className="text-xs text-rose-400 mt-2">Error loading weapons: {error}</p>
          )}
        </div>

        {/* Type filter chips */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          <FilterChip
            active={typeFilter === "all"}
            onClick={() => setTypeFilter("all")}
            label="All"
            count={weapons.length}
          />
          {allTypes.map((t) => (
            <FilterChip
              key={t}
              active={typeFilter === t}
              onClick={() => setTypeFilter(t)}
              label={t}
              count={typeCounts[t]}
              colors={TYPE_COLORS[t]}
            />
          ))}
        </div>

        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search by name or type…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-900/60 border border-zinc-800/50 rounded-sm text-zinc-100 text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 transition-colors"
          />
          <p className="text-[10px] font-mono text-zinc-600 mt-1.5">{filtered.length} matching</p>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-sm border border-zinc-800/60 bg-zinc-900/40">
          <table className="w-full text-[11px] tabular-nums">
            <thead>
              <tr className="border-b border-zinc-800/60 bg-zinc-900/60 text-[9px] tracking-[0.15em] uppercase text-zinc-500 font-mono">
                <ThSort label="Name" k="name" cur={sortKey} dir={sortDir} onClick={toggleSort} align="left" className="px-3 py-2 min-w-[220px]" />
                <ThSort label="Type" k="type" cur={sortKey} dir={sortDir} onClick={toggleSort} align="center" className="px-2 py-2 w-40" />
                <ThSort label="Mag" k="magazine" cur={sortKey} dir={sortDir} onClick={toggleSort} align="right" className="px-2 py-2 w-14" title="Magazine capacity" />
                <ThSort label="Speed" k="bulletSpeed" cur={sortKey} dir={sortDir} onClick={toggleSort} align="right" className="px-2 py-2 w-20" title="Bullet speed (m/s)" />
                <ThSort label="α" k="alphaDamage" cur={sortKey} dir={sortDir} onClick={toggleSort} align="right" className="px-2 py-2 w-14" title="Alpha damage (per shot)" />
                <ThSort label="RPM" k="maxFirerate" cur={sortKey} dir={sortDir} onClick={toggleSort} align="right" className="px-2 py-2 w-16" title="Max fire rate (rounds/min)" />
                <ThSort label="DPS Max" k="maxDps" cur={sortKey} dir={sortDir} onClick={toggleSort} align="right" className="px-2 py-2 w-20" title="Damage per second at max fire rate" />
                <ThSort label="DPS Single" k="singleDps" cur={sortKey} dir={sortDir} onClick={toggleSort} align="right" className="px-2 py-2 w-20" title="DPS in single-shot mode" />
                <ThSort label="DPS Burst" k="burstDps" cur={sortKey} dir={sortDir} onClick={toggleSort} align="right" className="px-2 py-2 w-20" title="DPS in burst-fire mode" />
                <ThSort label="DPS Rapid" k="rapidDps" cur={sortKey} dir={sortDir} onClick={toggleSort} align="right" className="px-2 py-2 w-20" title="DPS in rapid/full-auto mode" />
                <ThSort label="Vol (μSCU)" k="volumeMicroScu" cur={sortKey} dir={sortDir} onClick={toggleSort} align="right" className="px-2 py-2 w-20" title="Volume per round in micro-SCU" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40">
              {filtered.map((w, i) => {
                const tc = TYPE_COLORS[w.type] ?? { bg: "bg-zinc-700/15", text: "text-zinc-400", border: "border-zinc-600/30" };
                return (
                  <tr key={i} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="px-3 py-1.5 text-zinc-200">{w.name}</td>
                    <td className="px-2 py-1.5 text-center">
                      <span className={`text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-[2px] border ${tc.bg} ${tc.text} ${tc.border}`}>
                        {w.type}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right text-zinc-400">{fmtNum(w.magazine)}</td>
                    <td className="px-2 py-1.5 text-right text-zinc-400">{fmtNum(w.bulletSpeed)}</td>
                    <td className="px-2 py-1.5 text-right text-zinc-200">{fmtNum(w.alphaDamage)}</td>
                    <td className="px-2 py-1.5 text-right text-zinc-400">{fmtNum(w.maxFirerate)}</td>
                    <td className="px-2 py-1.5 text-right text-amber-300/90 font-medium">{fmtNum(w.maxDps, 1)}</td>
                    <td className="px-2 py-1.5 text-right text-zinc-400">{fmtNum(w.singleDps, 1)}</td>
                    <td className="px-2 py-1.5 text-right text-zinc-400">{fmtNum(w.burstDps, 1)}</td>
                    <td className="px-2 py-1.5 text-right text-zinc-400">{fmtNum(w.rapidDps, 1)}</td>
                    <td className="px-2 py-1.5 text-right text-zinc-500">{fmtNum(w.volumeMicroScu)}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-3 py-8 text-center text-zinc-500 text-sm">
                    No weapons match the filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-[10px] text-zinc-600 mt-3 italic">
          Source: in-game testing data. Last updated: 2026-04-25. Some weapons have only one fire mode active — empty cells (—) mean that mode is not available for that weapon.
        </p>
      </main>
    </>
  );
}

// ─── Filter chip ────────────────────────────────────────────────────────────
function FilterChip({
  active,
  onClick,
  label,
  count,
  colors,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  colors?: { bg: string; text: string; border: string };
}) {
  if (active) {
    const cls = colors
      ? `${colors.bg} ${colors.text} ${colors.border}`
      : "bg-amber-500/20 text-amber-300 border-amber-500/40";
    return (
      <button
        type="button"
        onClick={onClick}
        className={`px-2.5 py-1 text-[10px] font-mono tracking-wider uppercase rounded-[2px] border transition-colors ${cls}`}
      >
        {label} <span className="opacity-60 ml-1">{count}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-2.5 py-1 text-[10px] font-mono tracking-wider uppercase rounded-[2px] border bg-zinc-900/50 text-zinc-500 border-zinc-800/60 hover:text-zinc-300 hover:border-zinc-600 transition-colors"
    >
      {label} <span className="opacity-50 ml-1">{count}</span>
    </button>
  );
}

// ─── Sortable header ────────────────────────────────────────────────────────
function ThSort({
  label,
  k,
  cur,
  dir,
  onClick,
  align,
  className,
  title,
}: {
  label: string;
  k: SortKey;
  cur: SortKey;
  dir: SortDir;
  onClick: (k: SortKey) => void;
  align: "left" | "right" | "center";
  className?: string;
  title?: string;
}) {
  const active = cur === k;
  const justify = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
  return (
    <th className={(className ?? "") + " text-zinc-500"} title={title} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onClick(k)}
        className={`w-full inline-flex items-center gap-1 cursor-pointer select-none transition-colors ${justify} ${active ? "text-amber-400" : "hover:text-zinc-300"}`}
      >
        <span>{label}</span>
        {active ? (
          dir === "desc" ? (
            <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 4l4 4 4-4" /></svg>
          ) : (
            <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 8l4-4 4 4" /></svg>
          )
        ) : (
          <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-40">
            <path d="M3 5l3-3 3 3" />
            <path d="M3 7l3 3 3-3" />
          </svg>
        )}
      </button>
    </th>
  );
}
