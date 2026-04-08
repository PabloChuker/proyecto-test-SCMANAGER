"use client";

import { useState, useMemo } from "react";
import { useCraftingData } from "./useCraftingData";

const formatModKey = (key: string) =>
  key.replace(/^(weapon_|armor_)/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default function QualitySimulator() {
  const { blueprints, loading, error } = useCraftingData();

  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string>("");
  const [qualityLevel, setQualityLevel] = useState(500);

  // Auto-select first blueprint with quality effects
  useMemo(() => {
    if (blueprints.length > 0 && !selectedBlueprintId) {
      const withEffects = blueprints.find((b) => Object.keys(b.qualityEffects).length > 0);
      if (withEffects) setSelectedBlueprintId(withEffects.uuid);
      else setSelectedBlueprintId(blueprints[0].uuid);
    }
  }, [blueprints]);

  const selectedBlueprint = useMemo(
    () => blueprints.find((b) => b.uuid === selectedBlueprintId) || null,
    [blueprints, selectedBlueprintId]
  );

  const qualityPercentage = useMemo(() => (qualityLevel / 1000) * 100, [qualityLevel]);

  const modifiedStats = useMemo(() => {
    if (!selectedBlueprint) return {};
    const stats: Record<string, { base: number; modified: number; bonus: number }> = {};
    Object.entries(selectedBlueprint.qualityEffects).forEach(([stat, effect]) => {
      const range = effect.atMaxQuality - effect.atMinQuality;
      const bonusAmount = (range * qualityPercentage) / 100;
      stats[stat] = {
        base: effect.atMinQuality,
        modified: effect.atMinQuality + bonusAmount,
        bonus: bonusAmount,
      };
    });
    return stats;
  }, [selectedBlueprint, qualityPercentage]);

  const getQualityColor = (q: number) =>
    q < 250 ? "text-red-400" : q < 500 ? "text-orange-400" : q < 750 ? "text-yellow-400" : "text-emerald-400";

  const getQualityLabel = (q: number) =>
    q < 250 ? "Poor" : q < 500 ? "Substandard" : q < 750 ? "Standard" : q < 900 ? "High" : "Excellent";

  const getGradientColor = (q: number) => {
    if (q < 250) return "linear-gradient(to right, rgb(239, 68, 68), rgb(239, 68, 68))";
    if (q < 500) return "linear-gradient(to right, rgb(239, 68, 68), rgb(234, 179, 8))";
    if (q < 750) return "linear-gradient(to right, rgb(234, 179, 8), rgb(34, 197, 94))";
    return "linear-gradient(to right, rgb(34, 197, 94), rgb(34, 197, 94))";
  };

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

  // Filter to only blueprints that have quality effects for the selector
  const bpWithEffects = blueprints.filter((b) => Object.keys(b.qualityEffects).length > 0);

  return (
    <div className="max-w-5xl space-y-4">
      {/* Blueprint Selection */}
      <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-6">
        <label className="text-xs text-zinc-400 uppercase block mb-3">
          Select Blueprint ({bpWithEffects.length} with quality effects)
        </label>
        <select
          value={selectedBlueprintId}
          onChange={(e) => setSelectedBlueprintId(e.target.value)}
          className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded text-zinc-100 text-sm focus:outline-none focus:border-amber-500"
        >
          {bpWithEffects
            .sort((a, b) => a.outputName.localeCompare(b.outputName))
            .map((bp) => (
              <option key={bp.uuid} value={bp.uuid}>{bp.outputName}</option>
            ))}
        </select>
      </div>

      {selectedBlueprint && (
        <>
          {/* Quality Slider */}
          <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-6">
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-baseline mb-3">
                  <span className="text-sm text-zinc-300 font-medium">Quality Level</span>
                  <div className="text-right">
                    <span className={`text-3xl font-mono font-bold ${getQualityColor(qualityLevel)}`}>{qualityLevel}</span>
                    <span className={`ml-2 text-sm font-semibold ${getQualityColor(qualityLevel)}`}>{getQualityLabel(qualityLevel)}</span>
                  </div>
                </div>
                <input
                  type="range" min="0" max="1000" value={qualityLevel}
                  onChange={(e) => setQualityLevel(Number(e.target.value))}
                  className="w-full h-3 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                  style={{ background: getGradientColor(qualityLevel) }}
                />
                <div className="flex justify-between text-xs text-zinc-500 mt-3">
                  <span>Poor</span><span>Substandard</span><span>Standard</span><span>High</span><span>Excellent</span>
                </div>
              </div>
            </div>
          </div>

          {/* Blueprint Info */}
          <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-6">
            <h2 className="text-xl font-bold text-amber-400 mb-2">{selectedBlueprint.outputName}</h2>
            <div className="flex gap-6 text-sm">
              <div>
                <span className="text-zinc-500">Type</span>
                <div className="font-mono text-zinc-200">{selectedBlueprint.outputType.replace(/Char_Armor_/, "Armor/")}</div>
              </div>
              <div>
                <span className="text-zinc-500">Subtype</span>
                <div className="font-mono text-zinc-200">{selectedBlueprint.outputSubtype}</div>
              </div>
              <div>
                <span className="text-zinc-500">Craft Time</span>
                <div className="font-mono text-cyan-400">{selectedBlueprint.craftTimeSeconds}s</div>
              </div>
            </div>
          </div>

          {/* Stats Comparison */}
          {Object.keys(modifiedStats).length > 0 && (
            <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-6">
              <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider mb-6">
                Quality Impact on Stats
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {Object.entries(modifiedStats).map(([stat, values]) => {
                  const percentChange = values.base !== 0 ? ((values.bonus / Math.abs(values.base)) * 100).toFixed(1) : "0";
                  const isPositive = values.bonus >= 0;
                  return (
                    <div key={stat} className="border border-zinc-800/40 rounded-lg p-4 space-y-3">
                      <div className="flex justify-between items-baseline">
                        <h4 className="text-sm font-semibold text-zinc-300">{formatModKey(stat)}</h4>
                        <span className={`text-xs font-mono ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
                          {isPositive ? "+" : ""}{percentChange}%
                        </span>
                      </div>
                      <div>
                        <div className="flex justify-between items-baseline text-xs text-zinc-500 mb-1">
                          <span>Base (Quality 0)</span>
                          <span className="font-mono text-zinc-400">{values.base.toFixed(1)}</span>
                        </div>
                        <div className="h-2 bg-zinc-800/50 rounded">
                          <div className="h-full bg-zinc-600 rounded" style={{ width: `${Math.min(100, (Math.abs(values.base) / Math.max(Math.abs(values.base), Math.abs(values.modified))) * 100)}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between items-baseline text-xs text-zinc-500 mb-1">
                          <span>Modified (Quality {qualityLevel})</span>
                          <span className={`font-mono ${isPositive ? "text-emerald-400" : "text-red-400"}`}>{values.modified.toFixed(1)}</span>
                        </div>
                        <div className="h-2 bg-zinc-800/50 rounded">
                          <div className={`h-full rounded ${isPositive ? "bg-gradient-to-r from-cyan-500 to-emerald-500" : "bg-red-500"}`} style={{ width: `${Math.min(100, (Math.abs(values.modified) / Math.max(Math.abs(values.base), Math.abs(values.modified))) * 100)}%` }} />
                        </div>
                      </div>
                      {values.bonus !== 0 && (
                        <div className="pt-2 border-t border-zinc-700/50">
                          <div className="flex justify-between items-baseline text-xs">
                            <span className="text-zinc-600">Bonus</span>
                            <span className={`font-mono ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
                              {isPositive ? "+" : ""}{values.bonus.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recommendations */}
          <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-6">
            <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider mb-4">Recommendations</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border border-red-800/40 bg-red-900/10 rounded p-4">
                <div className="text-sm font-semibold text-red-400 mb-2">Poor Quality (0-250)</div>
                <p className="text-xs text-red-300">Not recommended for critical applications. Stats will be significantly reduced.</p>
              </div>
              <div className="border border-amber-800/40 bg-amber-900/10 rounded p-4">
                <div className="text-sm font-semibold text-amber-400 mb-2">Standard Quality (500-750)</div>
                <p className="text-xs text-amber-300">Acceptable for most uses. Provides reliable performance with moderate bonuses.</p>
              </div>
              <div className="border border-emerald-800/40 bg-emerald-900/10 rounded p-4">
                <div className="text-sm font-semibold text-emerald-400 mb-2">Excellent Quality (900+)</div>
                <p className="text-xs text-emerald-300">Maximum performance. Stats reach peak values, ideal for specialized roles.</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
