"use client";

import { useState, useMemo } from "react";
import blueprints from "@/data/crafting/blueprints.json";
import materials from "@/data/crafting/materials.json";

type Blueprint = typeof blueprints[0];

interface CraftQueueItem {
  blueprintId: string;
  quantity: number;
}

export default function CraftingCalculator() {
  const [queue, setQueue] = useState<CraftQueueItem[]>([]);
  const [qualityLevel, setQualityLevel] = useState(500);
  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string>("");

  const getMaterialName = (id: string) => {
    return materials.find((m) => m.id === id)?.name || id;
  };

  const getMaterialQuality = (id: string) => {
    return materials.find((m) => m.id === id)?.avgQuality || 400;
  };

  const addToQueue = () => {
    if (!selectedBlueprintId) return;
    const existing = queue.find((q) => q.blueprintId === selectedBlueprintId);
    if (existing) {
      setQueue(
        queue.map((q) =>
          q.blueprintId === selectedBlueprintId
            ? { ...q, quantity: q.quantity + 1 }
            : q
        )
      );
    } else {
      setQueue([...queue, { blueprintId: selectedBlueprintId, quantity: 1 }]);
    }
  };

  const removeFromQueue = (blueprintId: string) => {
    setQueue(queue.filter((q) => q.blueprintId !== blueprintId));
  };

  const updateQuantity = (blueprintId: string, qty: number) => {
    if (qty <= 0) {
      removeFromQueue(blueprintId);
    } else {
      setQueue(
        queue.map((q) =>
          q.blueprintId === blueprintId ? { ...q, quantity: qty } : q
        )
      );
    }
  };

  const aggregatedMaterials = useMemo(() => {
    const costs: Record<string, number> = {};
    queue.forEach(({ blueprintId, quantity }) => {
      const bp = blueprints.find((b) => b.id === blueprintId);
      if (!bp) return;
      bp.parts.forEach((part) => {
        part.materials.forEach((mat) => {
          costs[mat.id] = (costs[mat.id] || 0) + mat.qty * quantity;
        });
      });
    });
    return costs;
  }, [queue]);

  const totalCraftTime = useMemo(() => {
    return queue.reduce((sum, { blueprintId, quantity }) => {
      const bp = blueprints.find((b) => b.id === blueprintId);
      return sum + (bp?.craftTime || 0) * quantity;
    }, 0);
  }, [queue]);

  const estimatedCost = useMemo(() => {
    return Object.entries(aggregatedMaterials).reduce((sum, [matId, qty]) => {
      const mat = materials.find((m) => m.id === matId);
      // Rough cost calculation based on material type and quality
      const baseCost = mat?.type === "refined" ? 500 : 200;
      const qualityMultiplier = (qualityLevel / 500) * 0.8 + 0.2;
      return sum + baseCost * qty * qualityMultiplier;
    }, 0);
  }, [aggregatedMaterials, qualityLevel]);

  return (
    <div className="max-w-6xl space-y-4">
      {/* Input Section */}
      <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-6">
        <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider mb-4">
          Add to Craft Queue
        </h3>
        <div className="flex gap-3">
          <select
            value={selectedBlueprintId}
            onChange={(e) => setSelectedBlueprintId(e.target.value)}
            className="flex-1 px-4 py-2 bg-zinc-800 border border-zinc-700 rounded text-zinc-100 text-sm focus:outline-none focus:border-amber-500"
          >
            <option value="">Select a blueprint...</option>
            {blueprints
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((bp) => (
                <option key={bp.id} value={bp.id}>
                  {bp.name}
                </option>
              ))}
          </select>
          <button
            onClick={addToQueue}
            disabled={!selectedBlueprintId}
            className="px-6 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded transition-colors"
          >
            Add
          </button>
        </div>
      </div>

      {/* Quality Slider */}
      <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-6">
        <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider mb-4">
          Material Quality
        </h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-zinc-400">Quality Level</span>
            <span className="font-mono text-lg text-cyan-400">{qualityLevel}</span>
          </div>
          <input
            type="range"
            min="0"
            max="1000"
            value={qualityLevel}
            onChange={(e) => setQualityLevel(Number(e.target.value))}
            className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right,
                rgb(239, 68, 68) 0%,
                rgb(234, 179, 8) 50%,
                rgb(34, 197, 94) 100%)`,
            }}
          />
          <div className="flex justify-between text-xs text-zinc-500">
            <span>Poor (0)</span>
            <span>Standard (500)</span>
            <span>Excellent (1000)</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Craft Queue */}
        <div className="lg:col-span-2 bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-6">
          <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider mb-4">
            Craft Queue ({queue.length} items)
          </h3>
          {queue.length === 0 ? (
            <p className="text-zinc-500 text-sm">No items in queue</p>
          ) : (
            <div className="space-y-2">
              {queue.map(({ blueprintId, quantity }) => {
                const bp = blueprints.find((b) => b.id === blueprintId);
                if (!bp) return null;
                return (
                  <div
                    key={blueprintId}
                    className="flex items-center justify-between gap-3 bg-zinc-800/40 border border-zinc-700/40 rounded p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-sm text-amber-400">
                        {bp.name}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {bp.craftTime}s per unit
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        value={quantity}
                        onChange={(e) =>
                          updateQuantity(blueprintId, Number(e.target.value))
                        }
                        className="w-16 px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-zinc-100 text-sm text-center focus:outline-none focus:border-amber-500"
                      />
                      <span className="text-xs text-zinc-500">×</span>
                      <button
                        onClick={() => removeFromQueue(blueprintId)}
                        className="px-3 py-1 text-xs bg-red-900/30 hover:bg-red-900/60 border border-red-800/40 text-red-400 rounded transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-6">
          <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider mb-4">
            Summary
          </h3>
          <div className="space-y-3 text-sm">
            <div>
              <span className="text-zinc-500">Total Items</span>
              <div className="font-mono text-lg text-amber-400">
                {queue.reduce((sum, q) => sum + q.quantity, 0)}
              </div>
            </div>
            <div className="border-t border-zinc-700 pt-3">
              <span className="text-zinc-500">Total Craft Time</span>
              <div className="font-mono text-lg text-cyan-400">
                {Math.floor(totalCraftTime / 60)}m {totalCraftTime % 60}s
              </div>
            </div>
            <div className="border-t border-zinc-700 pt-3">
              <span className="text-zinc-500">Est. Total Cost</span>
              <div className="font-mono text-lg text-emerald-400">
                {Math.floor(estimatedCost).toLocaleString()} aUEC
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Materials Shopping List */}
      {queue.length > 0 && (
        <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-6">
          <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider mb-4">
            Materials Shopping List
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {Object.entries(aggregatedMaterials)
              .sort(([, a], [, b]) => b - a)
              .map(([matId, qty]) => {
                const mat = materials.find((m) => m.id === matId);
                const avgQuality = mat?.avgQuality || 400;
                const qualityDiff = qualityLevel - avgQuality;
                const qualityColor =
                  qualityDiff > 0
                    ? "text-emerald-400"
                    : qualityDiff < 0
                      ? "text-red-400"
                      : "text-zinc-400";

                return (
                  <div
                    key={matId}
                    className="bg-zinc-800/30 rounded p-4 border border-zinc-700/40"
                  >
                    <div className="text-sm font-medium text-zinc-200 mb-2">
                      {getMaterialName(matId)}
                    </div>
                    <div className="font-mono text-sm text-amber-400 mb-1">
                      {qty.toFixed(2)} SCU
                    </div>
                    <div className="text-xs">
                      <span className="text-zinc-500">Avg Quality: </span>
                      <span className={qualityColor}>
                        {avgQuality}
                        {qualityDiff !== 0 && (
                          <span className="ml-1">
                            ({qualityDiff > 0 ? "+" : ""}
                            {qualityDiff})
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
