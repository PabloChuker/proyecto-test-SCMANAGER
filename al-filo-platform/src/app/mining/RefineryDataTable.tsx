"use client";

import { useState, useMemo } from "react";
import minerals from "@/data/mining/minerals.json";
import refineries from "@/data/mining/refineries.json";

interface Mineral {
  id: string;
  name: string;
  type: string;
  tier: string;
}

interface Refinery {
  id: string;
  name: string;
  system: string;
  region: string;
  bonuses: Record<string, number>;
}

export default function RefineryDataTable() {
  const [systemFilter, setSystemFilter] = useState("all");
  const [sortBy, setSortBy] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const typedMinerals = minerals as Mineral[];
  const typedRefineries = refineries as Refinery[];

  const shipMinerals = useMemo(
    () => typedMinerals.filter((m) => m.type === "ship"),
    []
  );

  const filtered = useMemo(() => {
    let result = typedRefineries;

    if (systemFilter !== "all") {
      result = result.filter((r) => r.system === systemFilter);
    }

    if (sortBy) {
      result = [...result].sort((a, b) => {
        const aBonus = a.bonuses[sortBy] || 0;
        const bBonus = b.bonuses[sortBy] || 0;
        const cmp = aBonus - bBonus;
        return sortDir === "asc" ? cmp : -cmp;
      });
    }

    return result;
  }, [systemFilter, sortBy, sortDir]);

  const systems = Array.from(new Set(typedRefineries.map((r) => r.system)));

  const toggleSort = (mineralId: string) => {
    if (sortBy === mineralId) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortBy(mineralId);
      setSortDir("desc");
    }
  };

  const getBonusColor = (bonus: number): string => {
    if (bonus > 5) return "bg-emerald-950 text-emerald-300";
    if (bonus > 0) return "bg-emerald-900/40 text-emerald-400";
    if (bonus === 0) return "bg-zinc-800/40 text-zinc-400";
    if (bonus > -5) return "bg-red-900/40 text-red-400";
    return "bg-red-950 text-red-300";
  };

  return (
    <div className="space-y-6 max-w-full">
      <div className="flex items-center gap-4">
        <label className="text-xs tracking-[0.1em] uppercase text-zinc-400">
          Filter by System:
        </label>
        <select
          value={systemFilter}
          onChange={(e) => setSystemFilter(e.target.value)}
          className="bg-zinc-800/50 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500/50"
        >
          <option value="all">All Systems</option>
          {systems.map((system) => (
            <option key={system} value={system}>
              {system}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto border border-zinc-800/60 rounded-lg">
        <table className="w-full text-sm font-mono">
          <thead>
            <tr className="border-b border-zinc-800/60 bg-zinc-900/50">
              <th className="px-4 py-3 text-left text-xs tracking-[0.1em] uppercase text-zinc-400 sticky left-0 bg-zinc-900/50 z-10 min-w-[200px]">
                Refinery
              </th>
              {shipMinerals.map((mineral) => (
                <th
                  key={mineral.id}
                  className={`px-3 py-3 text-center text-xs tracking-[0.1em] uppercase whitespace-nowrap cursor-pointer transition-colors ${
                    sortBy === mineral.id ? "text-amber-400" : "text-zinc-500 hover:text-zinc-400"
                  }`}
                  onClick={() => toggleSort(mineral.id)}
                >
                  <div>{mineral.name}</div>
                  {sortBy === mineral.id && (
                    <div className="text-[10px]">{sortDir === "desc" ? "▼" : "▲"}</div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((refinery) => (
              <tr
                key={refinery.id}
                className="border-b border-zinc-800/40 hover:bg-zinc-800/20 transition-colors"
              >
                <td className="px-4 py-3 sticky left-0 bg-zinc-950/80 z-10 min-w-[200px]">
                  <div className="text-zinc-100 font-semibold">{refinery.name}</div>
                  <div className="text-[10px] text-zinc-600">
                    {refinery.system} • {refinery.region}
                  </div>
                </td>
                {shipMinerals.map((mineral) => {
                  const bonus = refinery.bonuses[mineral.id] ?? 0;
                  return (
                    <td
                      key={mineral.id}
                      className={`px-3 py-3 text-center ${getBonusColor(bonus)}`}
                    >
                      <div className="font-mono font-bold">
                        {bonus > 0 ? "+" : ""}
                        {bonus}%
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="bg-emerald-950 border border-emerald-900 rounded-lg p-3">
          <div className="text-emerald-400 font-semibold mb-1">High Bonus</div>
          <div className="text-emerald-300">{">"}5% improvement</div>
        </div>
        <div className="bg-zinc-800/40 border border-zinc-700 rounded-lg p-3">
          <div className="text-zinc-400 font-semibold mb-1">Neutral</div>
          <div className="text-zinc-400">0% change</div>
        </div>
        <div className="bg-red-950 border border-red-900 rounded-lg p-3">
          <div className="text-red-400 font-semibold mb-1">High Penalty</div>
          <div className="text-red-300">"{">"}5% reduction</div>
        </div>
      </div>
    </div>
  );
}
