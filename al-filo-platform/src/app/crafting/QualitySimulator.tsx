"use client";

import { useState, useMemo } from "react";
import blueprints from "@/data/crafting/blueprints.json";

type Blueprint = typeof blueprints[0];

export default function QualitySimulator() {
  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string>(
    blueprints[0]?.id || ""
  );
  const [qualityLevel, setQualityLevel] = useState(500);

  const selectedBlueprint = useMemo(
    () => blueprints.find((b) => b.id === selectedBlueprintId),
    [selectedBlueprintId]
  );

  const qualityPercentage = useMemo(() => {
    return (qualityLevel / 1000) * 100;
  }, [qualityLevel]);

  const modifiedStats = useMemo(() => {
    if (!selectedBlueprint) return {};

    const stats: Record<string, { base: number; modified: number; bonus: number }> = {};

    Object.entries(selectedBlueprint.qualityEffects).forEach(([stat, effect]) => {
      const bonusAmount = (effect.maxBonus * qualityPercentage) / 100;
      stats[stat] = {
        base: effect.base,
        modified: effect.base + bonusAmount,
        bonus: bonusAmount,
      };
    });

    return stats;
  }, [selectedBlueprint, qualityPercentage]);

  const getQualityColor = (quality: number) => {
    if (quality < 250) return "text-red-400";
    if (quality < 500) return "text-orange-400";
    if (quality < 750) return "text-yellow-400";
    return "text-emerald-400";
  };

  const getQualityLabel = (quality: number) => {
    if (quality < 250) return "Poor";
    if (quality < 500) return "Substandard";
    if (quality < 750) return "Standard";
    if (quality < 900) return "High";
    return "Excellent";
  };

  const getGradientColor = (quality: number) => {
    if (quality < 250)
      return "linear-gradient(to right, rgb(239, 68, 68), rgb(239, 68, 68))";
    if (quality < 500)
      return "linear-gradient(to right, rgb(239, 68, 68), rgb(234, 179, 8))";
    if (quality < 750)
      return "linear-gradient(to right, rgb(234, 179, 8), rgb(34, 197, 94))";
    if (quality < 900)
      return "linear-gradient(to right, rgb(34, 197, 94), rgb(34, 197, 94))";
    return "linear-gradient(to right, rgb(34, 197, 94), rgb(34, 197, 94))";
  };

  return (
    <div className="max-w-5xl space-y-4">
      {/* Blueprint Selection */}
      <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-6">
        <label className="text-xs text-zinc-400 uppercase block mb-3">
          Select Blueprint
        </label>
        <select
          value={selectedBlueprintId}
          onChange={(e) => setSelectedBlueprintId(e.target.value)}
          className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded text-zinc-100 text-sm focus:outline-none focus:border-amber-500"
        >
          {blueprints
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((bp) => (
              <option key={bp.id} value={bp.id}>
                {bp.name}
              </option>
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
                  <span className="text-sm text-zinc-300 font-medium">
                    Quality Level
                  </span>
                  <div className="text-right">
                    <span className={`text-3xl font-mono font-bold ${getQualityColor(qualityLevel)}`}>
                      {qualityLevel}
                    </span>
                    <span className={`ml-2 text-sm font-semibold ${getQualityColor(qualityLevel)}`}>
                      {getQualityLabel(qualityLevel)}
                    </span>
                  </div>
                </div>

                <input
                  type="range"
                  min="0"
                  max="1000"
                  value={qualityLevel}
                  onChange={(e) => setQualityLevel(Number(e.target.value))}
                  className="w-full h-3 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                  style={{
                    background: getGradientColor(qualityLevel),
                  }}
                />

                <div className="flex justify-between text-xs text-zinc-500 mt-3">
                  <span>Poor</span>
                  <span>Substandard</span>
                  <span>Standard</span>
                  <span>High</span>
                  <span>Excellent</span>
                </div>
              </div>

              {/* Quality Visual Bar */}
              <div className="mt-6">
                <div className="text-xs text-zinc-500 mb-2">Quality Distribution</div>
                <div className="flex h-6 rounded overflow-hidden border border-zinc-700">
                  <div
                    className="bg-red-500/60"
                    style={{ width: "25%" }}
                    title="Poor"
                  />
                  <div
                    className="bg-orange-500/60"
                    style={{ width: "25%" }}
                    title="Substandard"
                  />
                  <div
                    className="bg-yellow-500/60"
                    style={{ width: "25%" }}
                    title="Standard"
                  />
                  <div
                    className="bg-emerald-500/60"
                    style={{ width: "25%" }}
                    title="Excellent"
                  />
                  {/* Current quality indicator */}
                  <div
                    className="absolute h-6 w-1 bg-white/80 shadow-lg"
                    style={{
                      left: `calc(${qualityPercentage}% - 2px)`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Blueprint Info */}
          <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-6">
            <h2 className="text-xl font-bold text-amber-400 mb-2">
              {selectedBlueprint.name}
            </h2>
            <p className="text-zinc-400 text-sm mb-3">
              {selectedBlueprint.description}
            </p>
            <div className="flex gap-6 text-sm">
              <div>
                <span className="text-zinc-500">Category</span>
                <div className="font-mono text-zinc-200 capitalize">
                  {selectedBlueprint.category}
                </div>
              </div>
              <div>
                <span className="text-zinc-500">Craft Time</span>
                <div className="font-mono text-cyan-400">
                  {selectedBlueprint.craftTime}s
                </div>
              </div>
            </div>
          </div>

          {/* Stats Comparison */}
          <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-6">
            <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider mb-6">
              Quality Impact on Stats
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {Object.entries(modifiedStats).map(([stat, values]) => {
                const percentChange = ((values.bonus / values.base) * 100).toFixed(1);
                const isPositive = values.bonus >= 0;

                return (
                  <div
                    key={stat}
                    className="border border-zinc-800/40 rounded-lg p-4 space-y-3"
                  >
                    <div className="flex justify-between items-baseline">
                      <h4 className="text-sm font-semibold text-zinc-300 capitalize">
                        {stat}
                      </h4>
                      <span className={`text-xs font-mono ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
                        {isPositive ? "+" : ""}
                        {percentChange}%
                      </span>
                    </div>

                    {/* Base Value */}
                    <div>
                      <div className="flex justify-between items-baseline text-xs text-zinc-500 mb-1">
                        <span>Base (Quality 0)</span>
                        <span className="font-mono text-zinc-400">
                          {values.base.toFixed(1)}
                        </span>
                      </div>
                      <div className="h-2 bg-zinc-800/50 rounded">
                        <div
                          className="h-full bg-zinc-600 rounded"
                          style={{
                            width: `${Math.min(
                              100,
                              (values.base /
                                Math.max(values.base, values.modified)) *
                                100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Current Value */}
                    <div>
                      <div className="flex justify-between items-baseline text-xs text-zinc-500 mb-1">
                        <span>Modified (Quality {qualityLevel})</span>
                        <span className={`font-mono ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
                          {values.modified.toFixed(1)}
                        </span>
                      </div>
                      <div className="h-2 bg-zinc-800/50 rounded">
                        <div
                          className={`h-full rounded ${isPositive ? "bg-gradient-to-r from-cyan-500 to-emerald-500" : "bg-red-500"}`}
                          style={{
                            width: `${Math.min(
                              100,
                              (values.modified /
                                Math.max(values.base, values.modified)) *
                                100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Bonus */}
                    {values.bonus !== 0 && (
                      <div className="pt-2 border-t border-zinc-700/50">
                        <div className="flex justify-between items-baseline text-xs">
                          <span className="text-zinc-600">Bonus</span>
                          <span className={`font-mono ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
                            {isPositive ? "+" : ""}
                            {values.bonus.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quality Recommendations */}
          <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-6">
            <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider mb-4">
              Recommendations
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border border-red-800/40 bg-red-900/10 rounded p-4">
                <div className="text-sm font-semibold text-red-400 mb-2">
                  Poor Quality (0-250)
                </div>
                <p className="text-xs text-red-300">
                  Not recommended for critical applications. Stats will be significantly reduced.
                </p>
              </div>
              <div className="border border-amber-800/40 bg-amber-900/10 rounded p-4">
                <div className="text-sm font-semibold text-amber-400 mb-2">
                  Standard Quality (500-750)
                </div>
                <p className="text-xs text-amber-300">
                  Acceptable for most uses. Provides reliable performance with moderate bonuses.
                </p>
              </div>
              <div className="border border-emerald-800/40 bg-emerald-900/10 rounded p-4">
                <div className="text-sm font-semibold text-emerald-400 mb-2">
                  Excellent Quality (900+)
                </div>
                <p className="text-xs text-emerald-300">
                  Maximum performance. Stats reach peak values, ideal for specialized roles.
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
