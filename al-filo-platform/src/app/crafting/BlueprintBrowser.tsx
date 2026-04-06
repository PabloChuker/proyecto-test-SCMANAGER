"use client";

import { useState, useMemo } from "react";
import blueprints from "@/data/crafting/blueprints.json";
import categories from "@/data/crafting/categories.json";
import materials from "@/data/crafting/materials.json";

type Blueprint = typeof blueprints[0];
type Category = typeof categories[0];

export default function BlueprintBrowser() {
  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string | null>(
    blueprints[0]?.id || null
  );
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(["ammo", "fps_weapons", "fps_armor"])
  );

  const selectedBlueprint = useMemo(
    () => blueprints.find((b) => b.id === selectedBlueprintId),
    [selectedBlueprintId]
  );

  const toggleCategory = (catId: string) => {
    const newSet = new Set(expandedCategories);
    if (newSet.has(catId)) {
      newSet.delete(catId);
    } else {
      newSet.add(catId);
    }
    setExpandedCategories(newSet);
  };

  const getMaterialName = (id: string) => {
    return materials.find((m) => m.id === id)?.name || id;
  };

  const getTotalCost = (blueprint: Blueprint) => {
    const costs: Record<string, number> = {};
    blueprint.parts.forEach((part) => {
      part.materials.forEach((mat) => {
        costs[mat.id] = (costs[mat.id] || 0) + mat.qty;
      });
    });
    return costs;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 max-w-7xl">
      {/* Category Tree */}
      <div className="lg:col-span-1">
        <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-4">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">
            Categories
          </h3>
          <div className="space-y-1">
            {categories.map((category: Category) => (
              <div key={category.id}>
                <button
                  onClick={() => toggleCategory(category.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded text-sm text-zinc-300 hover:bg-zinc-800/40 transition-colors"
                >
                  <span className="text-lg">{expandedCategories.has(category.id) ? "▼" : "▶"}</span>
                  <span>{category.icon}</span>
                  <span className="flex-1 text-left">{category.name}</span>
                  <span className="text-xs text-zinc-500 bg-zinc-800/50 px-2 py-0.5 rounded">
                    {blueprints.filter((b) => b.category === category.id).length}
                  </span>
                </button>

                {expandedCategories.has(category.id) && (
                  <div className="ml-4 space-y-0.5">
                    {category.subCategories.map((subCat) => {
                      const itemCount = blueprints.filter(
                        (b) => b.category === category.id && b.subCategory === subCat.id
                      ).length;
                      return (
                        <div key={subCat.id}>
                          <div className="text-xs text-zinc-500 px-3 py-1.5 font-medium uppercase tracking-wider">
                            {subCat.name}
                            <span className="ml-1 text-zinc-600">({itemCount})</span>
                          </div>
                          <div className="space-y-0.5 ml-2">
                            {blueprints
                              .filter(
                                (b) =>
                                  b.category === category.id &&
                                  b.subCategory === subCat.id
                              )
                              .map((blueprint) => (
                                <button
                                  key={blueprint.id}
                                  onClick={() => setSelectedBlueprintId(blueprint.id)}
                                  className={`
                                    w-full text-left px-3 py-1.5 rounded text-xs transition-colors
                                    ${
                                      selectedBlueprintId === blueprint.id
                                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30"
                                    }
                                  `}
                                >
                                  {blueprint.name}
                                </button>
                              ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Blueprint Details */}
      <div className="lg:col-span-3">
        {selectedBlueprint ? (
          <div className="space-y-4">
            {/* Header */}
            <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-6">
              <h2 className="text-2xl font-bold text-amber-400 mb-2">
                {selectedBlueprint.name}
              </h2>
              <p className="text-zinc-400 text-sm mb-4">
                {selectedBlueprint.description}
              </p>
              <div className="flex gap-6">
                <div>
                  <span className="text-xs text-zinc-500 uppercase">Craft Time</span>
                  <div className="text-lg font-mono text-cyan-400">
                    {selectedBlueprint.craftTime}s
                  </div>
                </div>
                <div>
                  <span className="text-xs text-zinc-500 uppercase">Category</span>
                  <div className="text-lg font-mono text-zinc-300 capitalize">
                    {selectedBlueprint.category}
                  </div>
                </div>
              </div>
            </div>

            {/* Parts Breakdown */}
            <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-6">
              <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider mb-4">
                Parts Breakdown
              </h3>
              <div className="space-y-4">
                {selectedBlueprint.parts.map((part, idx) => (
                  <div key={idx} className="border border-zinc-800/40 rounded p-4">
                    <h4 className="font-mono text-sm text-cyan-400 mb-3">
                      {part.component}
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {part.materials.map((mat) => (
                        <div
                          key={mat.id}
                          className="bg-zinc-800/30 rounded p-2 border border-zinc-700/40"
                        >
                          <div className="text-xs text-zinc-400">
                            {getMaterialName(mat.id)}
                          </div>
                          <div className="font-mono text-sm text-amber-400">
                            {mat.qty.toFixed(3)} SCU
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quality Effects */}
            <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-6">
              <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider mb-4">
                Quality Effects
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(selectedBlueprint.qualityEffects).map(
                  ([stat, effect]) => (
                    <div
                      key={stat}
                      className="border border-zinc-800/40 rounded p-4"
                    >
                      <div className="text-xs text-zinc-400 uppercase mb-2">
                        {stat}
                      </div>
                      <div className="flex justify-between items-baseline">
                        <div>
                          <span className="text-xs text-zinc-500">Base: </span>
                          <span className="font-mono text-sm text-zinc-300">
                            {effect.base}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs text-zinc-500">Max Bonus: </span>
                          <span className="font-mono text-sm text-emerald-400">
                            +{effect.maxBonus}
                          </span>
                        </div>
                      </div>
                      <div className="mt-2 w-full bg-zinc-800/50 rounded h-2">
                        <div
                          className="bg-gradient-to-r from-cyan-500 to-emerald-500 h-full rounded"
                          style={{
                            width: `${Math.min(
                              100,
                              (effect.maxBonus / Math.max(effect.base, 100)) * 100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>

            {/* Total Materials Cost */}
            <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-6">
              <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider mb-4">
                Total Material Cost
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {Object.entries(getTotalCost(selectedBlueprint))
                  .sort(([, a], [, b]) => b - a)
                  .map(([matId, qty]) => (
                    <div
                      key={matId}
                      className="bg-zinc-800/30 rounded p-3 border border-zinc-700/40"
                    >
                      <div className="text-xs text-zinc-400 mb-1">
                        {getMaterialName(matId)}
                      </div>
                      <div className="font-mono text-sm text-amber-400">
                        {qty.toFixed(3)} SCU
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-12 text-center">
            <p className="text-zinc-400">Select a blueprint to view details</p>
          </div>
        )}
      </div>
    </div>
  );
}
