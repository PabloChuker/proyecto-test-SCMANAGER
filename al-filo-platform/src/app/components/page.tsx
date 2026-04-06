"use client";
// =============================================================================
// SC LABS — /components — Component Database Browser (Erkul-style)
//
// Sidebar with component category icons + sortable/filterable data table.
// =============================================================================

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import Header from "@/app/assets/header/Header";

// ─── Category Definitions ────────────────────────────────────────────────────

interface CategoryDef {
  key: string;
  table: string;
  label: string;
  shortLabel: string;
  icon: string; // path to PNG in /public/media/icons/
}

const CATEGORIES: CategoryDef[] = [
  { key: "ships", table: "ships", label: "Ships", shortLabel: "Ships", icon: "/media/icons/Ships.png" },
  { key: "weapons", table: "weapon_guns", label: "Weapons", shortLabel: "Weapons", icon: "/media/icons/weapons.png" },
  { key: "missiles", table: "missiles", label: "Missiles", shortLabel: "Missiles", icon: "/media/icons/missile.png" },
  { key: "emps", table: "emps", label: "EMP Generators", shortLabel: "EMP", icon: "/media/icons/emp.png" },
  { key: "shields", table: "shields", label: "Shields", shortLabel: "Shields", icon: "/media/icons/shilds.png" },
  { key: "power_plants", table: "power_plants", label: "Power Plants", shortLabel: "Power", icon: "/media/icons/power_plants.png" },
  { key: "coolers", table: "coolers", label: "Coolers", shortLabel: "Coolers", icon: "/media/icons/coolers.png" },
  { key: "quantum_drives", table: "quantum_drives", label: "Quantum Drives", shortLabel: "QD", icon: "/media/icons/Quantum_drives.png" },
  { key: "qed", table: "quantum_interdiction_generators", label: "QED Generators", shortLabel: "QED", icon: "/media/icons/interdict_pulse.png" },
  { key: "mining", table: "mining_lasers", label: "Mining Lasers", shortLabel: "Mining", icon: "/media/icons/mining_lasers.png" },
  { key: "turrets", table: "turrets", label: "Turrets", shortLabel: "Turrets", icon: "/media/icons/weapons.png" },
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
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-4 h-4 border-2 border-zinc-800 border-t-amber-500 rounded-full animate-spin mr-3" />
        <span className="text-xs text-zinc-600 font-mono uppercase tracking-widest">Loading...</span>
      </div>
    }>
      <ComponentsPageInner />
    </Suspense>
  );
}

function ComponentsPageInner() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialCat = (tabParam && CATEGORIES.find(c => c.key === tabParam)) || CATEGORIES[0];

  const [activeCategory, setActiveCategory] = useState<CategoryDef>(initialCat);
  const [rows, setRows] = useState<any[]>([]);
  const [columns, setColumns] = useState<ColumnDef[]>([]);
  const [meta, setMeta] = useState({ total: 0, limit: 200, offset: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sizeFilter, setSizeFilter] = useState("");
  const [sortCol, setSortCol] = useState("name");
  const [sortDir, setSortDir] = useState<"ASC" | "DESC">("ASC");
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync with ?tab= param changes
  useEffect(() => {
    if (tabParam) {
      const cat = CATEGORIES.find(c => c.key === tabParam);
      if (cat && cat.key !== activeCategory.key) {
        setActiveCategory(cat);
        setSearch("");
        setSizeFilter("");
        setSortCol("name");
        setSortDir("ASC");
      }
    }
  }, [tabParam]);

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
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* ── Background video ── */}
      <video
        autoPlay loop muted playsInline
        className="fixed inset-0 w-full h-full object-cover opacity-10 pointer-events-none z-0"
      >
        <source src="/media/videos/bg.mp4" type="video/mp4" />
      </video>
      <div className="fixed inset-0 bg-gradient-to-b from-zinc-950/70 via-zinc-950/85 to-zinc-950/95 pointer-events-none z-0" />

      {/* ═══ Header (full width) ═══ */}
      <Header subtitle={activeCategory.label} />

      {/* ═══ Body: Sidebar + Content ═══ */}
      <div className="flex flex-1 min-h-0">
        {/* ═══ Sidebar ═══ */}
        <aside className="w-12 sm:w-14 flex-shrink-0 bg-zinc-950/90 border-r border-zinc-800/50 flex flex-col items-center py-3 gap-1 z-20 sticky top-12 h-[calc(100vh-3rem)] overflow-y-auto">
          {/* DPS Calculator link */}
          <Link
            href="/dps"
            title="DPS Calculator"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded flex items-center justify-center transition-all duration-150 hover:bg-zinc-800/40 mb-1"
          >
            <Image src="/icons/DPS_calculator.png" alt="DPS Calculator" width={22} height={22} className="opacity-50 hover:opacity-80 transition-opacity" />
          </Link>
          <div className="w-6 h-px bg-zinc-800 mb-1" />

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
                    ? "bg-amber-500/15 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.3)]"
                    : "hover:bg-zinc-800/40"
                  }
                `}
              >
                <Image
                  src={cat.icon}
                  alt={cat.label}
                  width={22}
                  height={22}
                  className={`transition-opacity ${isActive ? "opacity-100" : "opacity-40 hover:opacity-70"}`}
                />
              </button>
            );
          })}
        </aside>

        {/* ═══ Main Content ═══ */}
        <div className="flex-1 z-10 relative flex flex-col overflow-hidden">

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
        <div className="flex-1 overflow-x-auto overflow-y-auto">
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
            <table className="min-w-full w-max text-xs border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-zinc-900/95 border-b border-zinc-800/60">
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className={`
                        px-4 py-2.5 text-left font-mono tracking-[0.1em] uppercase cursor-pointer select-none
                        transition-colors hover:text-zinc-300 whitespace-nowrap
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
                            px-4 py-2 font-mono tabular-nums whitespace-nowrap
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
      </div>
    </main>
  );
}
