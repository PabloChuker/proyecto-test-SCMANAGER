"use client";

import { useState, useMemo } from "react";
import { useCraftingData } from "./useCraftingData";
import type { Blueprint } from "./types";

export default function BlueprintBrowser() {
  const { blueprints, categories, loading, error } = useCraftingData();

  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

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

  const formatModKey = (key: string) =>
    key
      .replace(/^(weapon_|armor_)/, "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-5 h-5 border-2 border-zinc-800 border-t-amber-500 rounded-full animate-spin mr-3" />
        <span className="text-xs text-zinc-500 font-mono uppercase tracking-widest">Loading blueprints...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
        {error}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 max-w-7xl">

      {/* ── Sidebar: Category Tree ── */}
      <div className="lg:col-span-1">
        <div className="bg-zinc-900/70 border border-zinc-800/60 rounded-xl overflow-hidden">
          {/* Sidebar header */}
          <div className="px-4 py-3 border-b border-amber-500/20 bg-amber-500/5">
            <h3 className="text-xs font-bold text-amber-400 uppercase tracking-widest">
              Categories
            </h3>
          </div>

          <div className="p-3 space-y-1">
            {categories.map((category) => (
              <div key={category.id}>
                <button
                  onClick={() => toggleCategory(category.id)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-200 hover:bg-zinc-800/60 transition-colors group"
                >
                  <span className="text-amber-500/70 group-hover:text-amber-400 transition-colors text-xs">
                    {expandedCategories.has(category.id) ? "▼" : "▶"}
                  </span>
                  <span className="flex-1 text-left">{category.name}</span>
                  <span className="text-[10px] text-amber-400/70 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full font-mono">
                    {category.count}
                  </span>
                </button>

                {expandedCategories.has(category.id) && (
                  <div className="ml-3 mt-1 space-y-1 border-l border-zinc-800/60 pl-3">
                    {category.subCategories.map((subCat) => {
                      const subBlueprints = blueprints.filter(
                        (b) => b.outputType === category.id && b.outputSubtype === subCat.id
                      );
                      return (
                        <div key={subCat.id} className="mb-2">
                          <div className="text-[10px] text-cyan-500/70 px-2 py-1 font-bold uppercase tracking-widest">
                            {subCat.name}
                            <span className="ml-1.5 text-zinc-600 font-normal">({subCat.count})</span>
                          </div>
                          <div className="space-y-0.5 max-h-48 overflow-y-auto pr-1">
                            {subBlueprints.map((blueprint) => (
                              <button
                                key={blueprint.uuid}
                                onClick={() => setSelectedBlueprintId(blueprint.uuid)}
                                className={`
                                  w-full text-left px-3 py-2 rounded-lg text-xs transition-all duration-150
                                  ${selectedBlueprintId === blueprint.uuid
                                    ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 border border-transparent"
                                  }
                                `}
                              >
                                <span className="truncate block leading-snug">{blueprint.outputName}</span>
                                {blueprint.isDefault && (
                                  <span className="text-[9px] text-emerald-400 font-bold tracking-wide">DEFAULT</span>
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

      {/* ── Main Panel: Blueprint Details ── */}
      <div className="lg:col-span-3 space-y-5">
        {selectedBlueprint ? (
          <>
            {/* Header card */}
            <div className="bg-zinc-900/70 border border-zinc-800/60 rounded-xl overflow-hidden">
              {/* Amber accent top bar */}
              <div className="h-1 bg-gradient-to-r from-amber-500 via-amber-400 to-cyan-500" />
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight mb-1">
                      {selectedBlueprint.outputName}
                    </h2>
                    <p className="text-zinc-500 text-xs font-mono">
                      {selectedBlueprint.key}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0 ml-4">
                    {selectedBlueprint.isDefault && (
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1 rounded-full uppercase tracking-wider">
                        Default
                      </span>
                    )}
                    {selectedBlueprint.rewardPools.length > 0 && (
                      <span className="text-[10px] font-bold text-violet-400 bg-violet-500/10 border border-violet-500/25 px-2.5 py-1 rounded-full uppercase tracking-wider">
                        Mission Reward
                      </span>
                    )}
                  </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-zinc-950/50 border border-cyan-500/15 rounded-lg px-4 py-3">
                    <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Craft Time</div>
                    <div className="text-lg font-mono font-bold text-cyan-400">
                      {selectedBlueprint.craftTimeSeconds >= 60
                        ? `${Math.floor(selectedBlueprint.craftTimeSeconds / 60)}m ${selectedBlueprint.craftTimeSeconds % 60}s`
                        : `${selectedBlueprint.craftTimeSeconds}s`}
                    </div>
                  </div>
                  <div className="bg-zinc-950/50 border border-amber-500/15 rounded-lg px-4 py-3">
                    <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Type</div>
                    <div className="text-sm font-mono font-semibold text-amber-300 truncate">
                      {selectedBlueprint.outputType.replace(/Char_Armor_/, "Armor/")}
                    </div>
                  </div>
                  <div className="bg-zinc-950/50 border border-zinc-700/40 rounded-lg px-4 py-3">
                    <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Subtype</div>
                    <div className="text-sm font-mono font-semibold text-zinc-200 truncate">
                      {selectedBlueprint.outputSubtype}
                    </div>
                  </div>
                  {selectedBlueprint.outputGrade && (
                    <div className="bg-zinc-950/50 border border-zinc-700/40 rounded-lg px-4 py-3">
                      <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Grade</div>
                      <div className="text-sm font-mono font-semibold text-zinc-200">
                        {selectedBlueprint.outputGrade}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Parts Breakdown */}
            <div className="bg-zinc-900/70 border border-zinc-800/60 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-zinc-800/60 bg-zinc-950/30">
                <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-widest">
                  Parts Breakdown
                </h3>
              </div>
              <div className="p-6 space-y-4">
                {selectedBlueprint.parts.map((part) => (
                  <div
                    key={part.groupKey}
                    className="border border-zinc-800/50 rounded-xl p-5 bg-zinc-950/30 border-l-2 border-l-cyan-500/40"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-mono text-sm font-bold text-cyan-400 tracking-wide">
                        {part.groupName}
                      </h4>
                      {part.requiredCount > 1 && (
                        <span className="text-[10px] font-bold text-amber-400/70 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                          ×{part.requiredCount} required
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                      {part.materials.map((mat) => (
                        <div
                          key={mat.resourceUuid}
                          className="bg-zinc-900/60 rounded-lg p-3 border border-zinc-700/30 hover:border-amber-500/20 transition-colors"
                        >
                          <div className="text-xs text-zinc-400 mb-1 leading-snug">{mat.resourceName}</div>
                          <div className="font-mono text-sm font-bold text-amber-400">
                            {mat.quantityScu.toFixed(3)}
                            <span className="text-amber-500/50 font-normal text-xs ml-1">SCU</span>
                          </div>
                          {mat.minQuality > 0 && (
                            <div className="text-[10px] text-zinc-600 mt-1">
                              Min Q: {mat.minQuality}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    {part.modifiers.length > 0 && (
                      <div className="pt-3 border-t border-zinc-800/40">
                        <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2">Modifiers</div>
                        <div className="flex flex-wrap gap-2">
                          {part.modifiers.map((mod) => (
                            <span
                              key={mod.propertyKey}
                              className="text-[10px] px-2.5 py-1 bg-cyan-500/8 text-cyan-400 rounded-full border border-cyan-500/20"
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
              <div className="bg-zinc-900/70 border border-zinc-800/60 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-zinc-800/60 bg-zinc-950/30">
                  <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-widest">
                    Quality Effects
                  </h3>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(selectedBlueprint.qualityEffects).map(([stat, effect]) => {
                    const isIncrease = effect.atMaxQuality >= effect.atMinQuality;
                    return (
                      <div
                        key={stat}
                        className="border border-zinc-800/40 rounded-xl p-4 bg-zinc-950/20"
                      >
                        <div className="text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-3">
                          {formatModKey(stat)}
                        </div>
                        <div className="flex justify-between items-baseline mb-3">
                          <div>
                            <span className="text-[10px] text-zinc-600 uppercase">Q0 </span>
                            <span className="font-mono text-sm text-zinc-300">{effect.atMinQuality}</span>
                          </div>
                          <span className="text-zinc-700 text-xs">→</span>
                          <div>
                            <span className="text-[10px] text-zinc-600 uppercase">Q1000 </span>
                            <span className={`font-mono text-sm font-bold ${isIncrease ? "text-emerald-400" : "text-red-400"}`}>
                              {effect.atMaxQuality}
                            </span>
                          </div>
                        </div>
                        <div className="w-full bg-zinc-800/60 rounded-full h-1.5">
                          <div
                            className={`h-full rounded-full ${isIncrease
                              ? "bg-gradient-to-r from-[#4a6741] to-orange-500"
                              : "bg-gradient-to-r from-red-700 to-orange-600"
                            }`}
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
            <div className="bg-zinc-900/70 border border-zinc-800/60 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-amber-500/20 bg-amber-500/5">
                <h3 className="text-xs font-bold text-amber-400 uppercase tracking-widest">
                  Total Material Cost
                </h3>
              </div>
              <div className="p-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {Object.entries(getTotalMaterials(selectedBlueprint))
                  .sort(([, a], [, b]) => b.scu - a.scu)
                  .map(([resId, { name, scu }]) => (
                    <div
                      key={resId}
                      className="bg-zinc-950/50 rounded-xl p-4 border border-amber-500/15 hover:border-amber-500/30 transition-colors"
                    >
                      <div className="text-xs text-zinc-400 mb-2 leading-snug">{name}</div>
                      <div className="font-mono text-base font-bold text-amber-400">
                        {scu.toFixed(3)}
                        <span className="text-amber-500/50 font-normal text-xs ml-1">SCU</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* How to Obtain */}
            {(selectedBlueprint.rewardPools.length > 0 || selectedBlueprint.isDefault) && (
              <div className="bg-zinc-900/70 border border-zinc-800/60 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-zinc-800/60 bg-zinc-950/30">
                  <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-widest">
                    How to Obtain
                  </h3>
                </div>
                <div className="p-6">
                  {selectedBlueprint.rewardPools.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {selectedBlueprint.rewardPools.map((pool) => (
                        <span
                          key={pool.poolUuid}
                          className="text-xs px-3 py-1.5 bg-violet-500/10 text-violet-300 rounded-full border border-violet-500/25 font-medium"
                        >
                          {formatPoolKey(pool.poolKey)}
                        </span>
                      ))}
                    </div>
                  )}
                  {selectedBlueprint.isDefault && (
                    <p className="text-xs text-emerald-400 font-medium">
                      This blueprint is available by default — no missions required.
                    </p>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="bg-zinc-900/70 border border-zinc-800/60 rounded-xl p-16 text-center">
            <p className="text-zinc-500 text-sm">Select a blueprint to view details</p>
          </div>
        )}
      </div>
    </div>
  );
}

function formatPoolKey(key: string): string {
  let cleaned = key.replace(/^BP_MISSIONREWARD_/, "");
  cleaned = cleaned.replace(/_/g, " ");
  cleaned = cleaned.replace(/([a-z])([A-Z])/g, "$1 $2");
  return cleaned;
}
