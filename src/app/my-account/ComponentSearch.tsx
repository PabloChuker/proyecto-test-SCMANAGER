"use client";

import { useState, useCallback } from "react";

interface ComponentResult {
  reference: string;
  name: string;
  type: string;
  size: number | null;
  grade: string | null;
}

interface Props {
  onSelect: (component: ComponentResult) => void;
  disabled?: boolean;
  buttonLabel?: string;
  placeholder?: string;
}

const CATEGORIES = [
  { value: "", label: "Todas" },
  { value: "WEAPON", label: "🔫 Armas" },
  { value: "SHIELD", label: "🛡 Shields" },
  { value: "POWER_PLANT", label: "⚡ Power Plants" },
  { value: "COOLER", label: "❄ Coolers" },
  { value: "QUANTUM_DRIVE", label: "🌀 Quantum" },
  { value: "MISSILE", label: "🚀 Misiles" },
];

export default function ComponentSearch({ onSelect, disabled, buttonLabel = "+ Agregar", placeholder = "Buscar componente..." }: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [results, setResults] = useState<ComponentResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);

  const search = useCallback(async () => {
    if (!query.trim() && !category) return;
    setSearching(true);
    setOpen(true);
    try {
      const params = new URLSearchParams();
      if (category) params.set("category", category);
      if (query.trim()) params.set("search", query.trim());
      params.set("limit", "30");

      const res = await fetch(`/api/components?${params}`);
      const data = await res.json();

      if (Array.isArray(data)) {
        setResults(data.map((c: any) => ({
          reference: c.reference || c.className || c.id,
          name: c.name || c.localizedName || c.reference,
          type: c.type || category || "UNKNOWN",
          size: c.size ?? null,
          grade: c.grade ?? null,
        })));
      }
    } catch {
      setResults([]);
    }
    setSearching(false);
  }, [query, category]);

  return (
    <div className="p-3 rounded border border-zinc-800/50 bg-zinc-900/30 space-y-2">
      <div className="flex gap-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 focus:border-amber-500 focus:outline-none"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder={placeholder}
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-amber-500 focus:outline-none"
        />
        <button
          onClick={search}
          disabled={searching}
          className="px-3 py-1.5 bg-amber-600/80 hover:bg-amber-600 text-zinc-950 text-sm rounded transition-colors"
        >
          {searching ? "..." : "Buscar"}
        </button>
      </div>

      {open && results.length > 0 && (
        <div className="max-h-48 overflow-y-auto space-y-0.5">
          {results.map((c, i) => (
            <div key={`${c.reference}-${i}`} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-800/50 transition-colors">
              <div className="flex-1 min-w-0">
                <span className="text-sm text-zinc-200">{c.name}</span>
                {c.size && <span className="text-[10px] text-zinc-500 ml-1.5">S{c.size}</span>}
                {c.grade && <span className="text-[10px] text-amber-500/60 ml-1">G{c.grade}</span>}
                <span className="text-[10px] text-zinc-600 ml-1.5">{c.type}</span>
              </div>
              <button
                onClick={() => { onSelect(c); }}
                disabled={disabled}
                className="px-2 py-0.5 text-[10px] bg-emerald-600/80 hover:bg-emerald-600 active:scale-95 text-zinc-950 rounded transition-all disabled:bg-zinc-700 disabled:text-zinc-400"
              >
                {buttonLabel}
              </button>
            </div>
          ))}
        </div>
      )}

      {open && results.length === 0 && !searching && (
        <div className="text-xs text-zinc-600 text-center py-2">Sin resultados</div>
      )}
    </div>
  );
}
