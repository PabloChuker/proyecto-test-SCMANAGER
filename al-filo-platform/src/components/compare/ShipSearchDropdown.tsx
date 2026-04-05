"use client";
// =============================================================================
// SC LABS — Ship Search Dropdown for comparator v2
// Autocomplete + browse-all dropdown. Shows all ships on focus (click to browse),
// filters as you type. Dropdown arrow indicator.
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
  const [allShips, setAllShips] = useState<ShipOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [allLoaded, setAllLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Fetch all ships once (for browse-all dropdown)
  const fetchAll = useCallback(async () => {
    if (allLoaded) return;
    setLoading(true);
    try {
      const res = await fetch("/api/ships?limit=500&sort=name&order=asc");
      if (!res.ok) return;
      const json = await res.json();
      setAllShips(json.data || []);
      setAllLoaded(true);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [allLoaded]);

  // Search with query (debounced)
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
        const res = await fetch(`/api/ships?search=${encodeURIComponent(q)}&limit=30`, {
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
    if (query.length > 0) {
      const timer = setTimeout(() => search(query), 200);
      return () => clearTimeout(timer);
    } else {
      setResults([]);
    }
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

  // Determine which list to show
  const displayList = query.length > 0
    ? results
    : allShips.filter((s) => !excludeIds.includes(s.id));

  // Group ships by manufacturer for browse mode
  const grouped = query.length === 0
    ? groupByManufacturer(displayList)
    : null;

  function handleOpen() {
    setOpen(true);
    if (!allLoaded) fetchAll();
  }

  if (selected) {
    return (
      <div
        className="relative rounded border px-3 py-2.5 flex items-center justify-between gap-2"
        style={{ borderColor: color, backgroundColor: `${color}10` }}
      >
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-zinc-100 truncate">{selected.name}</div>
          <div className="text-[11px] text-zinc-500 truncate">
            {selected.manufacturer} · {selected.ship?.role || "\u2014"}
          </div>
        </div>
        <button
          onClick={onClear}
          className="shrink-0 w-6 h-6 rounded flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
        >
          \u2715
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <div
        className="rounded border border-zinc-800 focus-within:border-zinc-600 transition-colors flex items-center"
        style={open ? { borderColor: color } : {}}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            handleOpen();
          }}
          onFocus={handleOpen}
          placeholder={`Ship ${index + 1} \u2014 Search or browse...`}
          className="w-full bg-transparent px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none"
        />
        <button
          onClick={() => {
            if (open) {
              setOpen(false);
            } else {
              handleOpen();
              inputRef.current?.focus();
            }
          }}
          className="shrink-0 px-2 py-2.5 text-zinc-600 hover:text-zinc-400 transition-colors"
          tabIndex={-1}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d={open ? "M2 8L6 4L10 8" : "M2 4L6 8L10 4"}
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-72 overflow-y-auto rounded border border-zinc-800 bg-zinc-950 shadow-xl">
          {loading && displayList.length === 0 && (
            <div className="px-3 py-4 text-xs text-zinc-600 text-center">Loading ships...</div>
          )}

          {/* Search mode: flat list */}
          {query.length > 0 && (
            <>
              {!loading && results.length === 0 && (
                <div className="px-3 py-4 text-xs text-zinc-600 text-center">No ships found</div>
              )}
              {results.map((ship) => (
                <ShipItem
                  key={ship.id}
                  ship={ship}
                  color={color}
                  onSelect={() => {
                    onSelect(ship);
                    setQuery("");
                    setOpen(false);
                  }}
                />
              ))}
            </>
          )}

          {/* Browse mode: grouped by manufacturer */}
          {query.length === 0 && grouped && !loading && (
            <>
              {grouped.map(([mfr, ships]) => (
                <div key={mfr}>
                  <div className="sticky top-0 px-3 py-1.5 text-[10px] tracking-wider uppercase font-medium bg-zinc-900/90 backdrop-blur-sm border-b border-zinc-800/50" style={{ color }}>
                    {mfr}
                    <span className="text-zinc-600 ml-1.5">({ships.length})</span>
                  </div>
                  {ships.map((ship) => (
                    <ShipItem
                      key={ship.id}
                      ship={ship}
                      color={color}
                      onSelect={() => {
                        onSelect(ship);
                        setQuery("");
                        setOpen(false);
                      }}
                    />
                  ))}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Ship list item ──
function ShipItem({
  ship,
  color,
  onSelect,
}: {
  ship: ShipOption;
  color: string;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className="w-full text-left px-3 py-2 hover:bg-zinc-900 transition-colors border-b border-zinc-900/50 last:border-0 group"
    >
      <div className="text-sm text-zinc-200 group-hover:text-zinc-50">{ship.name}</div>
      <div className="text-[10px] text-zinc-500">
        {ship.manufacturer || "Unknown"}
        {ship.ship?.role ? ` \u00b7 ${ship.ship.role}` : ""}
        {ship.ship?.scmSpeed ? ` \u00b7 ${ship.ship.scmSpeed} m/s` : ""}
      </div>
    </button>
  );
}

// ── Group by manufacturer ──
function groupByManufacturer(ships: ShipOption[]): [string, ShipOption[]][] {
  const map = new Map<string, ShipOption[]>();
  for (const ship of ships) {
    const mfr = ship.manufacturer || "Unknown";
    if (!map.has(mfr)) map.set(mfr, []);
    map.get(mfr)!.push(ship);
  }
  // Sort manufacturers alphabetically
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}
