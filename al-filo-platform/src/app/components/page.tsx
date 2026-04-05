"use client";
// =============================================================================
// SC LABS — /components — Component Database Browser (Erkul-style)
//
// Sidebar with component category icons + sortable/filterable data table.
// =============================================================================

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";

// ─── Category Definitions ────────────────────────────────────────────────────

interface CategoryDef {
  key: string;
  table: string;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
}

function SvgIcon({ children, vb = "0 0 24 24" }: { children: React.ReactNode; vb?: string }) {
  return (
    <svg viewBox={vb} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      {children}
    </svg>
  );
}

const CATEGORIES: CategoryDef[] = [
  {
    key: "ships", table: "ships", label: "Ships", shortLabel: "Ships",
    icon: <SvgIcon><path d="M12 2L4 9l1 11h14l1-11L12 2z" /><path d="M8 20v-4h8v4" /></SvgIcon>,
  },
  {
    key: "weapons", table: "weapon_guns", label: "Weapons", shortLabel: "Weapons",
    icon: <SvgIcon><circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /><path d="M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></SvgIcon>,
  },
  {
    key: "missiles", table: "missiles", label: "Missiles", shortLabel: "Missiles",
    icon: <SvgIcon><path d="M4 20L20 4" /><path d="M15 4h5v5" /><path d="M4 15l3 3" /><path d="M7 12l3 3" /></SvgIcon>,
  },
  {
    key: "emps", table: "emps", label: "EMP Generators", shortLabel: "EMP",
    icon: <SvgIcon><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /><path d="M8 2h8" /></SvgIcon>,
  },
  {
    key: "shields", table: "shields", label: "Shields", shortLabel: "Shields",
    icon: <SvgIcon><path d="M12 3L4 7v6c0 5.25 3.38 9.76 8 11 4.62-1.24 8-5.75 8-11V7l-8-4z" /></SvgIcon>,
  },
  {
    key: "power_plants", table: "power_plants", label: "Power Plants", shortLabel: "Power",
    icon: <SvgIcon><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></SvgIcon>,
  },
  {
    key: "coolers", table: "coolers", label: "Coolers", shortLabel: "Coolers",
    icon: <SvgIcon><path d="M12 2v20M17 7l-10 10M22 12H2M17 17L7 7" /><circle cx="12" cy="12" r="3" /></SvgIcon>,
  },
  {
    key: "quantum_drives", table: "quantum_drives", label: "Quantum Drives", shortLabel: "QD",
    icon: <SvgIcon><circle cx="12" cy="12" r="4" /><ellipse cx="12" cy="12" rx="10" ry="4" /><ellipse cx="12" cy="12" rx="4" ry="10" /></SvgIcon>,
  },
  {
    key: "qed", table: "quantum_interdiction_generators", label: "QED Generators", shortLabel: "QED",
    icon: <SvgIcon><circle cx="12" cy="12" r="8" strokeDasharray="4 2" /><circle cx="12" cy="12" r="3" /><path d="M12 4v3M12 17v3M4 12h3M17 12h3" /></SvgIcon>,
  },
  {
    key: "mining", table: "mining_lasers", label: "Mining Lasers", shortLabel: "Mining",
    icon: <SvgIcon><path d="M14 4l-4 16" /><path d="M8 8l-4 4 4 4" /><path d="M16 8l4 4-4 4" /></SvgIcon>,
  },
  {
    key: "turrets", table: "turrets", label: "Turrets", shortLabel: "Turrets",
    icon: <SvgIcon><rect x="6" y="14" width="12" height="6" rx="1" /><path d="M12 14V8" /><circle cx="12" cy="6" r="2" /><path d="M8 8l-2-2M16 8l2-2" /></SvgIcon>,
  },
];

// ─── Column type ────────────────────────────────────────────────────────────

interface ColumnDef {
  key: string;
  label: string;
  type: "text" | "number" | "grade";
  width?: number;
}

// ─── Format helpers ──────────────────────────────────────────────────────────

function formatCell(value: any, type: string): string {
  if (value === null || value === undefined) return "—";
  if (type === "number") {
    const n = Number(value);
    if (isNaN(n)) return String(value);
    if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (Math.abs(n) >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
    if (Number.isInteger(n)) return n.toLocaleString();
    return n.toFixed(2);
  }
  if (type === "grade") {
    const GRADE_MAP: Record<number, string> = { 1: "A", 2: "B", 3: "C", 4: "D" };
    const n = Number(value);
    if (!isNaN(n) && GRADE_MAP[n]) return GRADE_MAP[n];
    return String(value);
  }
  return String(value);
}

function gradeColor(value: any): string {
  const GRADE_MAP: Record<number, string> = { 1: "A", 2: "B", 3: "C", 4: "D" };
  const n = Number(value);
  const letter = !isNaN(n) && GRADE_MAP[n] ? GRADE_MAP[n] : String(value);
  switch (letter) {
    case "A": return "#22c55e";
    case "B": return "#3b82f6";
    case "C": return "#eab308";
    case "D": return "#ef4444";
    default: return "#71717a";
  }
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ComponentsPage() {
  const [activeCategory, setActiveCategory] = useState<CategoryDef>(CATEGORIES[0]);
  const [rows, setRows] = useState<any[]>([]);
  const [columns, setColumns] = useState<ColumnDef[]>([]);
  const [meta, setMeta] = useState({ total: 0, limit: 200, offset: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sizeFilter, setSizeFilter] = useState("");
  const [sortCol, setSortCol] = useState("name");
  const [sortDir, setSortDir] = useState<"ASC" | "DESC">("ASC");
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async (cat: CategoryDef, s: string, size: string, sort: string, dir: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ table: cat.table, sort, dir, limit: "200" });
      if (s) params.set("search", s);
      if (size) params.set("size", size);
      const res = await fetch(`/api/components/browse?${params}`);
      const json = await res.json();
      if (json.rows) {
        setRows(json.rows);
        setColumns(json.columns || []);
        setMeta(json.meta || { total: 0, limit: 200, offset: 0 });
      }
    } catch (e) {
      console.error("Failed to fetch components:", e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on category/sort change
  useEffect(() => {
    fetchData(activeCategory, search, sizeFilter, sortCol, sortDir);
  }, [activeCategory, sortCol, sortDir, fetchData]); // eslint-disable-line

  // Debounced search
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      fetchData(activeCategory, search, sizeFilter, sortCol, sortDir);
    }, 300);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [search, sizeFilter]); // eslint-disable-line

  const handleCategoryClick = (cat: CategoryDef) => {
    setActiveCategory(cat);
    setSearch("");
    setSizeFilter("");
    setSortCol("name");
    setSortDir("ASC");
  };

  const handleSort = (colKey: string) => {
    if (sortCol === colKey) {
      setSortDir(d => d === "ASC" ? "DESC" : "ASC");
    } else {
      setSortCol(colKey);
      setSortDir("ASC");
    }
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex">
      {/* ── Background video ── */}
      <video
        autoPlay loop muted playsInline
        className="fixed inset-0 w-full h-full object-cover opacity-10 pointer-events-none z-0"
      >
        <source src="/videos/bg.mp4" type="video/mp4" />
      </video>
      <div className="fixed inset-0 bg-gradient-to-b from-zinc-950/70 via-zinc-950/85 to-zinc-950/95 pointer-events-none z-0" />

      {/* ═══ Sidebar ═══ */}
      <aside className="w-12 sm:w-14 flex-shrink-0 bg-zinc-950/90 border-r border-zinc-800/50 flex flex-col items-center py-3 gap-1 z-20 sticky top-0 h-screen overflow-y-auto">
        {/* Logo */}
        <Link href="/" className="mb-3 opacity-60 hover:opacity-100 transition-opacity">
          <Image src="/sclabs-logo.png" alt="SC LABS" width={24} height={24} className="rounded-sm" />
        </Link>
        <div className="w-6 h-px bg-zinc-800 mb-2" />

        {CATEGORIES.map((cat) => {
          const isActive = activeCategory.key === cat.key;
          return (
            <button
              key={cat.key}
              onClick={() => handleCategoryClick(cat)}
              title={cat.label}
              className={`
                w-9 h-9 sm:w-10 sm:h-10 rounded flex items-center justify-center transition-all duration-150
                ${isActive
                  ? "bg-amber-500/15 text-amber-400 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.3)]"
                  : "text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/40"
                }
              `}
            >
              {cat.icon}
            </button>
          );
        })}
      </aside>

      {/* ═══ Main Content ═══ */}
      <div className="flex-1 z-10 relative flex flex-col min-w-0">
        {/* ── Top Header ── */}
        <header className="border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-xl sticky top-0 z-30">
          <div className="px-4 sm:px-6 flex items-center justify-between h-12">
            <div className="flex items-center gap-3">
              <Link href="/" className="text-xs tracking-[0.15em] uppercase text-zinc-600 hover:text-zinc-400 transition-colors">
                SC Labs
              </Link>
              <div className="h-4 w-px bg-zinc-800" />
              <span className="text-xs tracking-[0.12em] uppercase text-amber-500 font-medium">
                {activeCategory.label}
              </span>
              {meta.total > 0 && (
                <span className="text-[10px] font-mono text-zinc-600 bg-zinc-800/50 px-1.5 py-0.5 rounded">
                  {meta.total}
                </span>
              )}
            </div>

            {/* Nav links */}
            <nav className="hidden sm:flex items-center gap-5 text-xs tracking-[0.1em] uppercase text-zinc-600">
              <Link href="/ships" className="hover:text-zinc-400 transition-colors">Naves</Link>
              <Link href="/compare" className="hover:text-zinc-400 transition-colors">Comparar</Link>
              <span className="text-amber-500 border-b border-amber-500/30 pb-0.5">Componentes</span>
            </nav>
          </div>
        </header>

        {/* ── Filters Bar ── */}
        <div className="border-b border-zinc-800/30 bg-zinc-950/60 px-4 sm:px-6 py-2 flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${activeCategory.label.toLowerCase()}...`}
              className="w-full pl-8 pr-3 py-1.5 bg-zinc-900/60 border border-zinc-800/50 rounded text-xs text-zinc-300 placeholder-zinc-700 focus:outline-none focus:border-amber-500/40 transition-colors"
            />
          </div>

          {/* Size filter */}
          {activeCategory.table !== "ships" && (
            <select
              value={sizeFilter}
              onChange={(e) => setSizeFilter(e.target.value)}
              className="bg-zinc-900/60 border border-zinc-800/50 rounded text-xs text-zinc-400 px-2 py-1.5 focus:outline-none focus:border-amber-500/40"
            >
              <option value="">All Sizes</option>
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12].map((s) => (
                <option key={s} value={s}>Size {s}</option>
              ))}
            </select>
          )}

          {/* Count badge */}
          <span className="text-[10px] font-mono text-zinc-600">
            {rows.length} / {meta.total} rows
          </span>
        </div>

        {/* ── Data Table ── */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="flex items-center gap-2 text-zinc-600 text-sm">
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M12 2a10 10 0 0 1 10 10" />
                </svg>
                Loading...
              </div>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-zinc-700 text-sm">
              No results found
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="bg-zinc-900/95 border-b border-zinc-800/60">
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className={`
                        px-3 py-2 text-left font-mono tracking-[0.1em] uppercase cursor-pointer select-none
                        transition-colors hover:text-zinc-300
                        ${sortCol === col.key ? "text-amber-400" : "text-zinc-600"}
                        ${col.type === "number" || col.type === "grade" ? "text-right" : ""}
                      `}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {sortCol === col.key && (
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                            {sortDir === "ASC"
                              ? <path d="M12 4l-6 8h12z" />
                              : <path d="M12 20l-6-8h12z" />
                            }
                          </svg>
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={row.id || row.uuid || i}
                    className="border-b border-zinc-800/20 hover:bg-zinc-800/20 transition-colors"
                  >
                    {columns.map((col) => {
                      const val = row[col.key];
                      const isName = col.key === "name";
                      const isGrade = col.type === "grade";
                      const isNum = col.type === "number";

                      // Special: link ship names to ship detail page
                      const linkTarget = activeCategory.table === "ships" && isName && row.reference
                        ? `/ships/${encodeURIComponent(row.reference)}`
                        : null;

                      return (
                        <td
                          key={col.key}
                          className={`
                            px-3 py-2 font-mono tabular-nums whitespace-nowrap
                            ${isNum || isGrade ? "text-right" : ""}
                            ${isName ? "text-amber-400/90 font-medium" : "text-zinc-400"}
                          `}
                        >
                          {linkTarget ? (
                            <Link href={linkTarget} className="hover:text-amber-300 hover:underline transition-colors">
                              {formatCell(val, col.type)}
                            </Link>
                          ) : isGrade ? (
                            <span style={{ color: gradeColor(val) }}>{formatCell(val, col.type)}</span>
                          ) : isNum && val !== null && val !== undefined ? (
                            <span className={Number(val) > 0 ? "text-emerald-400/80" : "text-zinc-600"}>
                              {formatCell(val, col.type)}
                            </span>
                          ) : (
                            formatCell(val, col.type)
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>
  );
}
