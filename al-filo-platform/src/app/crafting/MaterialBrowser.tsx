"use client";

import { useState, useMemo } from "react";
import materials from "@/data/crafting/materials.json";
import blueprints from "@/data/crafting/blueprints.json";

export default function MaterialBrowser() {
  const [sortBy, setSortBy] = useState<"name" | "quality" | "usage">("name");
  const [filterType, setFilterType] = useState<"all" | "refined" | "salvage">(
    "all"
  );

  const materialsWithUsage = useMemo(() => {
    return materials.map((mat) => {
      const usageCount = blueprints.filter((bp) =>
        bp.parts.some((p) => p.materials.some((m) => m.id === mat.id))
      ).length;
      return { ...mat, usageCount };
    });
  }, []);

  const filtered = useMemo(() => {
    return materialsWithUsage.filter(
      (mat) => filterType === "all" || mat.type === filterType
    );
  }, [materialsWithUsage, filterType]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    switch (sortBy) {
      case "quality":
        copy.sort((a, b) => b.avgQuality - a.avgQuality);
        break;
      case "usage":
        copy.sort((a, b) => b.usageCount - a.usageCount);
        break;
      case "name":
      default:
        copy.sort((a, b) => a.name.localeCompare(b.name));
    }
    return copy;
  }, [filtered, sortBy]);

  return (
    <div className="max-w-7xl space-y-4">
      {/* Controls */}
      <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-zinc-400 uppercase block mb-2">
              Sort By
            </label>
            <select
              value={sortBy}
              onChange={(e) =>
                setSortBy(e.target.value as "name" | "quality" | "usage")
              }
              className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded text-zinc-100 text-sm focus:outline-none focus:border-amber-500"
            >
              <option value="name">Name (A-Z)</option>
              <option value="quality">Quality (High-Low)</option>
              <option value="usage">Usage Count</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-400 uppercase block mb-2">
              Type
            </label>
            <select
              value={filterType}
              onChange={(e) =>
                setFilterType(e.target.value as "all" | "refined" | "salvage")
              }
              className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded text-zinc-100 text-sm focus:outline-none focus:border-amber-500"
            >
              <option value="all">All Types</option>
              <option value="refined">Refined</option>
              <option value="salvage">Salvage</option>
            </select>
          </div>
        </div>
      </div>

      {/* Materials Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sorted.map((mat) => (
          <div
            key={mat.id}
            className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-6 hover:border-amber-500/40 transition-colors"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-amber-400 mb-1">
                  {mat.name}
                </h3>
                <div className="flex gap-2 flex-wrap">
                  <span className="px-2 py-0.5 bg-zinc-800/50 rounded text-xs text-zinc-400 capitalize">
                    {mat.type}
                  </span>
                  <span className="px-2 py-0.5 bg-zinc-800/50 rounded text-xs text-zinc-400 capitalize">
                    {mat.source}
                  </span>
                </div>
              </div>
            </div>

            <p className="text-sm text-zinc-400 mb-4 leading-relaxed">
              {mat.description}
            </p>

            <div className="space-y-3 border-t border-zinc-800 pt-4">
              <div>
                <span className="text-xs text-zinc-500 uppercase">
                  Avg Quality
                </span>
                <div className="flex items-end gap-2 mt-1">
                  <span className="font-mono text-lg text-cyan-400">
                    {mat.avgQuality}
                  </span>
                  <div className="flex-1 bg-zinc-800 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 h-full rounded-full"
                      style={{
                        width: `${(mat.avgQuality / 1000) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              <div>
                <span className="text-xs text-zinc-500 uppercase">
                  Used in Blueprints
                </span>
                <div className="text-lg font-mono text-emerald-400 mt-1">
                  {mat.usageCount} recipes
                </div>
              </div>
            </div>

            {/* Used in */}
            {mat.usageCount > 0 && (
              <div className="mt-4 pt-4 border-t border-zinc-800">
                <span className="text-xs text-zinc-500 uppercase block mb-2">
                  Used in:
                </span>
                <div className="flex flex-wrap gap-1">
                  {blueprints
                    .filter((bp) =>
                      bp.parts.some((p) =>
                        p.materials.some((m) => m.id === mat.id)
                      )
                    )
                    .slice(0, 3)
                    .map((bp) => (
                      <span
                        key={bp.id}
                        className="text-xs px-2 py-1 bg-amber-500/10 text-amber-400 rounded border border-amber-500/20"
                      >
                        {bp.name}
                      </span>
                    ))}
                  {mat.usageCount > 3 && (
                    <span className="text-xs px-2 py-1 bg-zinc-800/50 text-zinc-400 rounded">
                      +{mat.usageCount - 3} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
