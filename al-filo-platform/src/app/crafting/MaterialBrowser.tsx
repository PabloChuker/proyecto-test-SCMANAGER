"use client";

import { useState, useMemo } from "react";
import { useCraftingData } from "./useCraftingData";

export default function MaterialBrowser() {
  const { blueprints, materials, loading, error } = useCraftingData();

  const [sortBy, setSortBy] = useState<"name" | "usage">("name");
  const [search, setSearch] = useState("");

  const sorted = useMemo(() => {
    let list = [...materials];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((m) => m.resourceName.toLowerCase().includes(q));
    }
    switch (sortBy) {
      case "usage":
        list.sort((a, b) => b.blueprintCount - a.blueprintCount);
        break;
      case "name":
      default:
        list.sort((a, b) => a.resourceName.localeCompare(b.resourceName));
    }
    return list;
  }, [materials, sortBy, search]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-4 h-4 border-2 border-zinc-800 border-t-amber-500 rounded-full animate-spin mr-3" />
        <span className="text-xs text-zinc-500 font-mono uppercase tracking-widest">Loading...</span>
      </div>
    );
  }

  if (error) {
    return <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-sm px-3 py-2">{error}</div>;
  }

  return (
    <div className="max-w-7xl space-y-4">
      {/* Controls */}
      <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-zinc-400 uppercase block mb-2">Search</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search materials..."
              className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded text-zinc-100 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-400 uppercase block mb-2">Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "name" | "usage")}
              className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded text-zinc-100 text-sm focus:outline-none focus:border-amber-500"
            >
              <option value="name">Name (A-Z)</option>
              <option value="usage">Usage Count</option>
            </select>
          </div>
        </div>
      </div>

      {/* Materials Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sorted.map((mat) => {
          // Find blueprints that use this material
          const usedInBlueprints = blueprints.filter((bp) =>
            bp.parts.some((p) =>
              p.materials.some((m) => m.resourceUuid === mat.resourceUuid)
            )
          );

          const formatBox = (n: number) =>
            Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, "");

          return (
            <div
              key={mat.resourceUuid}
              className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-6 hover:border-amber-500/40 transition-colors"
            >
              <div className="flex items-start justify-between mb-1">
                <h3 className="text-lg font-semibold text-amber-400">
                  {mat.resourceName}
                </h3>
                {mat.refinedName && (
                  <span className="text-[10px] px-2 py-0.5 bg-cyan-500/10 text-cyan-400 rounded border border-cyan-500/20 whitespace-nowrap">
                    Refines → {mat.refinedName}
                  </span>
                )}
              </div>
              {mat.resourceKey && (
                <p className="text-[10px] text-zinc-600 font-mono mb-2">
                  {mat.resourceKey}
                </p>
              )}

              {/* Description from resources table */}
              {mat.description && (
                <p className="text-xs text-zinc-400 leading-relaxed mb-3 line-clamp-3">
                  {mat.description}
                </p>
              )}

              <div className="space-y-3 border-t border-zinc-800 pt-4">
                <div>
                  <span className="text-xs text-zinc-500 uppercase">Used in Blueprints</span>
                  <div className="text-lg font-mono text-emerald-400 mt-1">
                    {mat.blueprintCount} recipes
                  </div>
                </div>
                <div>
                  <span className="text-xs text-zinc-500 uppercase">Total SCU Across All Recipes</span>
                  <div className="text-lg font-mono text-cyan-400 mt-1">
                    {mat.totalScuUsed.toFixed(1)} SCU
                  </div>
                </div>
                {mat.boxSizes.length > 0 && (
                  <div>
                    <span className="text-xs text-zinc-500 uppercase block mb-1">
                      Container Sizes (SCU)
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {mat.boxSizes.map((size) => (
                        <span
                          key={size}
                          className="text-[10px] px-2 py-0.5 bg-zinc-800/60 text-zinc-300 rounded border border-zinc-700/40 font-mono"
                        >
                          {formatBox(size)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Used in */}
              {usedInBlueprints.length > 0 && (
                <div className="mt-4 pt-4 border-t border-zinc-800">
                  <span className="text-xs text-zinc-500 uppercase block mb-2">Used in:</span>
                  <div className="flex flex-wrap gap-1">
                    {usedInBlueprints.slice(0, 3).map((bp) => (
                      <span
                        key={bp.uuid}
                        className="text-xs px-2 py-1 bg-amber-500/10 text-amber-400 rounded border border-amber-500/20"
                      >
                        {bp.outputName}
                      </span>
                    ))}
                    {usedInBlueprints.length > 3 && (
                      <span className="text-xs px-2 py-1 bg-zinc-800/50 text-zinc-400 rounded">
                        +{usedInBlueprints.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
