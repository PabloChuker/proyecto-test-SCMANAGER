"use client";

import { useState } from "react";
import minerals from "@/data/mining/minerals.json";

interface Rock {
  id: string;
  mass: number;
  composition: Record<string, number>;
}

interface Mineral {
  id: string;
  name: string;
  basePrice: number;
}

export default function RockCalculator() {
  const [rocks, setRocks] = useState<Rock[]>([
    {
      id: "rock1",
      mass: 0,
      composition: {},
    },
  ]);

  const typedMinerals = minerals as Mineral[];

  const addRock = () => {
    setRocks([
      ...rocks,
      {
        id: `rock${Date.now()}`,
        mass: 0,
        composition: {},
      },
    ]);
  };

  const removeRock = (id: string) => {
    if (rocks.length > 1) {
      setRocks(rocks.filter((r) => r.id !== id));
    }
  };

  const updateRock = (id: string, field: string, value: any) => {
    setRocks(
      rocks.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  const updateComposition = (rockId: string, mineralId: string, percentage: number) => {
    setRocks(
      rocks.map((r) => {
        if (r.id !== rockId) return r;
        return {
          ...r,
          composition: {
            ...r.composition,
            [mineralId]: percentage,
          },
        };
      })
    );
  };

  const calculateCluster = () => {
    let totalValue = 0;
    const mineralBreakdown: Record<string, { mass: number; value: number }> = {};

    rocks.forEach((rock) => {
      Object.entries(rock.composition).forEach(([mineralId, percentage]) => {
        if (percentage <= 0) return;

        const mineral = typedMinerals.find((m) => m.id === mineralId);
        if (!mineral) return;

        const mineralMass = (rock.mass * percentage) / 100;
        const mineralValue = mineralMass * mineral.basePrice;
        totalValue += mineralValue;

        if (!mineralBreakdown[mineralId]) {
          mineralBreakdown[mineralId] = { mass: 0, value: 0 };
        }

        mineralBreakdown[mineralId].mass += mineralMass;
        mineralBreakdown[mineralId].value += mineralValue;
      });
    });

    return {
      totalMass: rocks.reduce((sum, r) => sum + r.mass, 0),
      totalValue: Math.round(totalValue * 100) / 100,
      mineralBreakdown,
    };
  };

  const cluster = calculateCluster();

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="space-y-4">
        {rocks.map((rock, idx) => {
          const rockCompositionTotal = Object.values(rock.composition).reduce(
            (sum, pct) => sum + pct,
            0
          );

          return (
            <div
              key={rock.id}
              className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-mono text-amber-400">Rock {idx + 1}</div>
                {rocks.length > 1 && (
                  <button
                    onClick={() => removeRock(rock.id)}
                    className="text-red-400 hover:text-red-300 text-sm"
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="mb-3">
                <label className="text-xs tracking-[0.1em] uppercase text-zinc-400 block mb-2">
                  Mass (SCU)
                </label>
                <input
                  type="number"
                  min="0"
                  value={rock.mass || ""}
                  onChange={(e) =>
                    updateRock(rock.id, "mass", parseFloat(e.target.value) || 0)
                  }
                  className="w-full bg-zinc-800/50 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500/50"
                  placeholder="Total mass in SCU"
                />
              </div>

              <div>
                <label className="text-xs tracking-[0.1em] uppercase text-zinc-400 block mb-2">
                  Mineral Composition ({rockCompositionTotal.toFixed(1)}%)
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {typedMinerals.map((mineral) => (
                    <div key={mineral.id}>
                      <label className="text-[10px] text-zinc-600 block mb-1">
                        {mineral.name}
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={rock.composition[mineral.id] || ""}
                        onChange={(e) =>
                          updateComposition(
                            rock.id,
                            mineral.id,
                            parseFloat(e.target.value) || 0
                          )
                        }
                        className="w-full bg-zinc-800/50 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-amber-500/50"
                        placeholder="0"
                      />
                      <span className="text-[8px] text-zinc-700">%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={addRock}
        className="text-sm tracking-[0.1em] uppercase px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 rounded transition-colors text-amber-400"
      >
        + Add Rock
      </button>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-4">
          <div className="text-[10px] tracking-[0.1em] uppercase text-zinc-500 mb-1">
            Total Cluster Mass
          </div>
          <div className="text-2xl font-mono font-bold text-amber-400">
            {cluster.totalMass.toFixed(2)} SCU
          </div>
        </div>

        <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-4">
          <div className="text-[10px] tracking-[0.1em] uppercase text-zinc-500 mb-1">
            Total Cluster Value
          </div>
          <div className="text-2xl font-mono font-bold text-emerald-400">
            {cluster.totalValue.toFixed(0)} aUEC
          </div>
        </div>
      </div>

      {Object.keys(cluster.mineralBreakdown).length > 0 && (
        <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-4">
          <div className="text-xs tracking-[0.1em] uppercase text-zinc-400 mb-3">
            Mineral Breakdown
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {Object.entries(cluster.mineralBreakdown)
              .sort((a, b) => b[1].value - a[1].value)
              .map(([mineralId, data]) => {
                const mineral = typedMinerals.find((m) => m.id === mineralId);
                const percentage = cluster.totalMass > 0
                  ? ((data.mass / cluster.totalMass) * 100).toFixed(1)
                  : "0";

                return (
                  <div
                    key={mineralId}
                    className="flex justify-between items-center py-2 border-b border-zinc-800/40 last:border-0"
                  >
                    <div>
                      <div className="text-sm text-zinc-100">{mineral?.name}</div>
                      <div className="text-[10px] text-zinc-600">
                        {data.mass.toFixed(2)} SCU ({percentage}%)
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-emerald-400">
                        {data.value.toFixed(0)} aUEC
                      </div>
                      <div className="text-[10px] text-zinc-600">
                        @{mineral?.basePrice}/u
                      </div>
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
