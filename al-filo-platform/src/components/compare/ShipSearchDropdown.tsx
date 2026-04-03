"use client";
// =============================================================================
// SC LABS — Ship Search Dropdown for comparator
// Autocomplete search that fetches from /api/ships
// =============================================================================

import { useState, useRef, useEffect, useCallback } from "react";

interface ShipOption {
  id: string;
  name: string;
  manufacturer: string | null;
  ship: {
    role: string | null;
    cargo: number | null;
    scmSpeed: number | null;
  } | null;
}

interface ShipSearchDropdownProps {
  index: number;
  color: string;
  selected: ShipOption | null;
  onSelect: (ship: ShipOption) => void;
  onClear: () => void;
  excludeIds: string[];
}

export function ShipSearchDropdown({
  index,
  color,
  selected,
  onSelect,
  onClear,
  excludeIds,
}: ShipSearchDropdownProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ShipOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const search = useCallback(
    async (q: string) => {
      abortRef.current?.abort();
      if (q.length < 1) {
        setResults([]);
        return;
      }
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);

      try {
        const res = await fetch(`/api/ships?search=${encodeURIComponent(q)}&limit=20`, {
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        const json = await res.json();
        const filtered = (json.data || []).filter(
          (s: ShipOption) => !excludeIds.includes(s.id)
        );
        setResults(filtered);
      } catch {
        // Aborted or network error
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    },
    [excludeIds]
  );

  useEffect(() => {
    const timer = setTimeout(() => search(query), 200);
    return () => clearTimeout(timer);
  }, [query, search]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (selected) {
    return (
      <div
        className="relative rounded border px-3 py-2.5 flex items-center justify-between gap-2"
        style={{ borderColor: color, backgroundColor: `${color}10` }}
      >
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-zinc-100 truncate">{selected.name}</div>
          <div className="text-[11px] text-zinc-500 truncate">
            {selected.manufacturer} · {selected.ship?.role || "—"}
          </div>
        </div>
        <button
          onClick={onClear}
          className="shrink-0 w-6 h-6 rounded flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <div
        className="rounded border border-zinc-800 focus-within:border-zinc-600 transition-colors"
        style={open ? { borderColor: color } : {}}
      >
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={`Ship ${index + 1} — Type to search...`}
          className="w-full bg-transparent px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none"
        />
      </div>

      {open && (query.length > 0) && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded border border-zinc-800 bg-zinc-950 shadow-xl">
          {loading && results.length === 0 && (
            <div className="px-3 py-4 text-xs text-zinc-600 text-center">Searching...</div>
          )}
          {!loading && results.length === 0 && query.length > 0 && (
            <div className="px-3 py-4 text-xs text-zinc-600 text-center">No ships found</div>
          )}
          {results.map((ship) => (
            <button
              key={ship.id}
              onClick={() => {
                onSelect(ship);
                setQuery("");
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 hover:bg-zinc-900 transition-colors border-b border-zinc-900 last:border-0"
            >
              <div className="text-sm text-zinc-200">{ship.name}</div>
              <div className="text-[10px] text-zinc-500">
                {ship.manufacturer} · {ship.ship?.role || "—"}
                {ship.ship?.scmSpeed ? ` · ${ship.ship.scmSpeed} m/s` : ""}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
