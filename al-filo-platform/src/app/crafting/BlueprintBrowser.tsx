"use client";

import { useState, useMemo } from "react";
import { useCraftingData } from "./useCraftingData";
import type { Blueprint } from "./types";

export default function BlueprintBrowser() {
  const { blueprints, categories, loading, error } = useCraftingData();

  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Auto-select first blueprint & expand all categories on load
  useMemo(() => {
    if (blueprints.length > 0 && !selectedBlueprintId) {
      setSelectedBlueprintId(blueprints[0].uuid);
    }
    if (categories.length > 0 && expandedCategories.size === 0) {
      setExpandedCategories(new Set(categories.map((c) => c.id)));
    }
  }, [blueprints, categories]);

  const selectedBlueprint = useMemo(
    () => blueprints.find((b) => b.uuid === selectedBlueprintId) || null,
    [blueprints, selectedBlueprintId]
  );

  const toggleCategory = (catId: string) => {
    const newSet = new Set(expandedCategories);
    if (newSet.has(catId)) newSet.delete(catId);
    else newSet.add(catId);
    setExpandedCategories(newSet);
  };

  const getTotalMaterials = (bp: Blueprint) => {
    const costs: Record<string, { name: string; scu: number }> = {};
    for (const part of bp.parts) {
      for (const mat of part.materials) {
        if (!costs[mat.resourceUuid]) {
          costs[mat.resourceUuid] = { name: mat.resourceName, scu: 0 };
        }
        costs[mat.resourceUuid].scu += mat.quantityScu;
      }
    }
    return costs;
  };

  /** Pretty-print a modifier key: "weapon_recoil_smoothness" → "Recoil Smoothness" */
  const formatModKey = (key: string) => {
    return key
      .replace(/^(weapon_|armor_)/, "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-4 h-4 border-2 border-zinc-800 border-t-amber-500 rounded-full animate-spin mr-3" />
        <span className="text-xs text-zinc-500 font-mono uppercase tracking-widest">Loading blueprints...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-sm px-3 py-2">
        {error}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 max-w-7xl">
      {/* Category Tree */}
      <div className="lg:col-span-1">
        <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-4">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">
            Categories
          </h3>
          <div className="space-y-1">
            {categories.map((category) => (
              <div key={category.id}>
                <button
                  onClick={() => toggleCategory(category.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded text-sm text-zinc-300 hover:bg-zinc-800/40 transition-colors"
                >
                  <span className="text-lg">{expandedCategories.has(category.id) ? "▼" : "▶"}</span>
                  <span className="flex-1 text-left">{category.name}</span>
                  <span className="text-xs text-zinc-500 bg-zinc-800/50 px-2 py-0.5 rounded">
                    {category.count}
                  </span>
                </button>

                {expandedCategories.has(category.id) && (
                  <div className="ml-4 space-y-0.5">
                    {category.subCategories.map((subCat) => {
                      const subBlueprints = blueprints.filter(
                        (b) => b.outputType === category.id && b.outputSubtype === subCat.id
                      );
                      return (
                        <div key={subCat.id}>
                          <div className="text-xs text-zinc-500 px-3 py-1.5 font-medium uppercase tracking-wider">
                            {subCat.name}
                            <span className="ml-1 text-zinc-600">({subCat.count})</span>
                          </div>
                          <div className="space-y-0.5 ml-2 max-h-48 overflow-y-auto">
                            {subBlueprints.map((blueprint) => (
                              <button
                                key={blueprint.uuid}
                                onClick={() => setSelectedBlueprintId(blueprint.uuid)}
                                className={`
                                  w-full text-left px-3 py-1.5 rounded text-xs transition-colors
                                  ${selectedBlueprintId === blueprint.uuid
                                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30"
                                  }
                                `}
                              >
                                <span className="truncate block">{blueprint.outputName}</span>
                                {blueprint.isDefault && (
                                  <span className="text-[9px] text-emerald-400 ml-1">DEFAULT</span>
                                )}
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
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-amber-400 mb-1">
                    {selectedBlueprint.outputName}
                  </h2>
                  <p className="text-zinc-500 text-xs font-mono mb-3">
                    {selectedBlueprint.key}
                  </p>
                </div>
                <div className="flex gap-2">
                  {selectedBlueprint.isDefault && (
                    <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded">
                      DEFAULT
                    </span>
                  )}
                  {selectedBlueprint.rewardPools.length > 0 && (
                    <span className="text-[10px] text-violet-400 bg-violet-500/10 border border-violet-500/20 px-2 py-1 rounded">
                      MISSION REWARD
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-6">
                <div>
                  <span className="text-xs text-zinc-500 uppercase">Craft Time</span>
                  <div className="text-lg font-mono text-cyan-400">
                    {selectedBlueprint.craftTimeSeconds >= 60
                      ? `${Math.floor(selectedBlueprint.craftTimeSeconds / 60)}m ${selectedBlueprint.craftTimeSeconds % 60}s`
                      : `${selectedBlueprint.craftTimeSeconds}s`}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-zinc-500 uppercase">Type</span>
                  <div className="text-lg font-mono text-zinc-300">
                    {selectedBlueprint.outputType.replace(/Char_Armor_/, "Armor/")}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-zinc-500 uppercase">Subtype</span>
                  <div className="text-lg font-mono text-zinc-300">
                    {selectedBlueprint.outputSubtype}
                  </div>
                </div>
                {selectedBlueprint.outputGrade && (
                  <div>
                    <span className="text-xs text-zinc-500 uppercase">Grade</span>
                    <div className="text-lg font-mono text-zinc-300">
                      {selectedBlueprint.outputGrade}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Parts Breakdown */}
            <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-6">
              <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider mb-4">
                Parts Breakdown
              </h3>
              <div className="space-y-4">
                {selectedBlueprint.parts.map((part) => (
                  <div key={part.groupKey} className="border border-zinc-800/40 rounded p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-mono text-sm text-cyan-400">
                        {part.groupName}
                      </h4>
                      {part.requiredCount > 1 && (
                        <span className="text-[10px] text-zinc-500">
                          x{part.requiredCount} required
                        </span>
                      )}
                    </div>
                    {/* Materials */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-2">
                      {part.materials.map((mat) => (
                        <div
                          key={mat.resourceUuid}
                          className="bg-zinc-800/30 rounded p-2 border border-zinc-700/40"
                        >
                          <div className="text-xs text-zinc-400">{mat.resourceName}</div>
                          <div className="font-mono text-sm text-amber-400">
                            {mat.quantityScu.toFixed(3)} SCU
                          </div>
                          {mat.minQuality > 0 && (
                            <div className="text-[10px] text-zinc-600">
                              Min Q: {mat.minQuality}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    {/* Modifiers for this part */}
                    {part.modifiers.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-zinc-800/30">
                        <div className="text-[10px] text-zinc-600 uppercase mb-1">Modifiers</div>
                        <div className="flex flex-wrap gap-2">
                          {part.modifiers.map((mod) => (
                            <span
                              key={mod.propertyKey}
                              className="text-[10px] px-2 py-0.5 bg-cyan-500/10 text-cyan-400 rounded border border-cyan-500/20"
                            >
                              {formatModKey(mod.propertyKey)}: {mod.atMinQuality} → {mod.atMaxQuality}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Quality Effects */}
            {Object.keys(selectedBlueprint.qualityEffects).length > 0 && (
              <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-6">
                <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider mb-4">
                  Quality Effects
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(selectedBlueprint.qualityEffects).map(([stat, effect]) => {
                    const isIncrease = effect.atMaxQuality >= effect.atMinQuality;
                    return (
                      <div key={stat} className="border border-zinc-800/40 rounded p-4">
                        <div className="text-xs text-zinc-400 uppercase mb-2">
                          {formatModKey(stat)}
                        </div>
                        <div className="flex justify-between items-baseline">
                          <div>
                            <span className="text-xs text-zinc-500">Q0: </span>
                            <span className="font-mono text-sm text-zinc-300">
                              {effect.atMinQuality}
                            </span>
                          </div>
                          <div>
                            <span className="text-xs text-zinc-500">Q1000: </span>
                            <span className={`font-mono text-sm ${isIncrease ? "text-emerald-400" : "text-red-400"}`}>
                              {effect.atMaxQuality}
                            </span>
                          </div>
                        </div>
                        <div className="mt-2 w-full bg-zinc-800/50 rounded h-2">
                          <div
                            className={`h-full rounded ${isIncrease ? "bg-gradient-to-r from-cyan-500 to-emerald-500" : "bg-gradient-to-r from-red-500 to-orange-500"}`}
                            style={{
                              width: `${Math.min(100, Math.abs(effect.atMaxQuality - effect.atMinQuality) / Math.max(Math.abs(effect.atMinQuality), 1) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Total Materials Cost */}
            <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-6">
              <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider mb-4">
                Total Material Cost
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {Object.entries(getTotalMaterials(selectedBlueprint))
                  .sort(([, a], [, b]) => b.scu - a.scu)
                  .map(([resId, { name, scu }]) => (
                    <div
                      key={resId}
                      className="bg-zinc-800/30 rounded p-3 border border-zinc-700/40"
                    >
                      <div className="text-xs text-zinc-400 mb-1">{name}</div>
                      <div className="font-mono text-sm text-amber-400">
                        {scu.toFixed(3)} SCU
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Reward Pools (Mission Sources) */}
            {selectedBlueprint.rewardPools.length > 0 && (
              <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-6">
                <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider mb-4">
                  How to Obtain
                </h3>
                <div className="flex flex-wrap gap-2">
                  {selectedBlueprint.rewardPools.map((pool) => (
                    <span
                      key={pool.poolUuid}
                      className="text-xs px-3 py-1.5 bg-violet-500/10 text-violet-400 rounded border border-violet-500/20"
                    >
                      {formatPoolKey(pool.poolKey)}
                    </span>
                  ))}
                </div>
                {selectedBlueprint.isDefault && (
                  <p className="text-xs text-emerald-400 mt-3">
                    This blueprint is available by default — no missions required.
                  </p>
                )}
              </div>
            )}

            {!selectedBlueprint.rewardPools.length && selectedBlueprint.isDefault && (
              <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-6">
                <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider mb-4">
                  How to Obtain
                </h3>
                <p className="text-xs text-emerald-400">
                  This blueprint is available by default — no missions required.
                </p>
              </div>
            )}
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

/** Convert pool_key like "BP_MISSIONREWARD_CitizensForProsperityDestroyItems_AB" → "Citizens For Prosperity - Destroy Items (AB)" */
function formatPoolKey(key: string): string {
  let cleaned = key.replace(/^BP_MISSIONREWARD_/, "");
  // Split by underscore, rejoin with spaces
  cleaned = cleaned.replace(/_/g, " ");
  // Try to add spaces before capital letters (camelCase segments)
  cleaned = cleaned.replace(/([a-z])([A-Z])/g, "$1 $2");
  return cleaned;
}
