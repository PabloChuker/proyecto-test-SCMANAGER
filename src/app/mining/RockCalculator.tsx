"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import minerals from "@/data/mining/minerals.json";

interface Rock {
  id: string;
  mass: number;
  slots: { mineralId: string; percentage: number }[];
}

interface Mineral {
  id: string;
  name: string;
  basePrice: number;
}

const SLOTS_PER_ROCK = 4;

function emptySlots() {
  return Array.from({ length: SLOTS_PER_ROCK }, () => ({ mineralId: "", percentage: 0 }));
}

export default function RockCalculator() {
  const t = useTranslations("Mining.rock");
  const typedMinerals = minerals as Mineral[];

  const [rocks, setRocks] = useState<Rock[]>([
    { id: "rock1", mass: 0, slots: emptySlots() },
  ]);

  // ── Rock CRUD ──
  const addRock = () =>
    setRocks([...rocks, { id: `rock${Date.now()}`, mass: 0, slots: emptySlots() }]);

  const removeRock = (id: string) => {
    if (rocks.length > 1) setRocks(rocks.filter((r) => r.id !== id));
  };

  const updateMass = (id: string, mass: number) =>
    setRocks(rocks.map((r) => (r.id === id ? { ...r, mass } : r)));

  const updateSlot = (rockId: string, slotIdx: number, field: "mineralId" | "percentage", value: any) =>
    setRocks(
      rocks.map((r) => {
        if (r.id !== rockId) return r;
        const slots = r.slots.map((s, i) =>
          i === slotIdx ? { ...s, [field]: value } : s
        );
        return { ...r, slots };
      })
    );

  // ── Calculations ──
  const calculateCluster = () => {
    let totalValue = 0;
    const mineralBreakdown: Record<string, { mass: number; value: number }> = {};

    rocks.forEach((rock) => {
      rock.slots.forEach((slot) => {
        if (!slot.mineralId || slot.percentage <= 0) return;
        const mineral = typedMinerals.find((m) => m.id === slot.mineralId);
        if (!mineral) return;

        const mineralMass = (rock.mass * slot.percentage) / 100;
        const mineralValue = mineralMass * mineral.basePrice;
        totalValue += mineralValue;

        if (!mineralBreakdown[slot.mineralId]) {
          mineralBreakdown[slot.mineralId] = { mass: 0, value: 0 };
        }
        mineralBreakdown[slot.mineralId].mass += mineralMass;
        mineralBreakdown[slot.mineralId].value += mineralValue;
      });
    });

    return {
      totalMass: rocks.reduce((sum, r) => sum + r.mass, 0),
      totalValue: Math.round(totalValue * 100) / 100,
      mineralBreakdown,
    };
  };

  const cluster = calculateCluster();

  // ── Mineral options (sorted alphabetically) ──
  const mineralOptions = [...typedMinerals].sort((a, b) => a.name.localeCompare(b.name));

  // ── Get used mineral IDs for a rock (to grey out already-selected) ──
  const usedInRock = (rock: Rock, currentIdx: number) =>
    new Set(rock.slots.filter((_, i) => i !== currentIdx && _.mineralId).map((s) => s.mineralId));

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* ── Rock Cards ── */}
      <div className="space-y-3">
        {rocks.map((rock, idx) => {
          const total = rock.slots.reduce((s, sl) => s + sl.percentage, 0);
          const used = usedInRock(rock, -1);

          return (
            <div
              key={rock.id}
              className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-4"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-mono text-amber-400 flex items-center gap-3">
                  {t("rockN", { n: idx + 1 })}
                  <span className={`text-[10px] font-mono ${total > 100 ? "text-red-400" : total === 100 ? "text-emerald-400" : "text-zinc-500"}`}>
                    {total.toFixed(1)}%
                  </span>
                </div>
                {rocks.length > 1 && (
                  <button
                    onClick={() => removeRock(rock.id)}
                    className="text-red-400/60 hover:text-red-300 text-[10px] uppercase tracking-wider"
                  >
                    {t("remove")}
                  </button>
                )}
              </div>

              {/* Mass input */}
              <div className="mb-3">
                <input
                  type="number"
                  min="0"
                  value={rock.mass || ""}
                  onChange={(e) => updateMass(rock.id, parseFloat(e.target.value) || 0)}
                  className="w-full bg-zinc-800/50 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500/50"
                  placeholder={t("massPlaceholder")}
                />
              </div>

              {/* 4 Mineral Slots — compact row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                {rock.slots.map((slot, si) => (
                  <div key={si} className="flex gap-1.5">
                    <select
                      value={slot.mineralId}
                      onChange={(e) => updateSlot(rock.id, si, "mineralId", e.target.value)}
                      className="flex-1 min-w-0 bg-zinc-800/50 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-amber-500/50 appearance-none truncate"
                    >
                      <option value="">{t("mineralPlaceholder")}</option>
                      {mineralOptions.map((m) => (
                        <option key={m.id} value={m.id} disabled={usedInRock(rock, si).has(m.id)}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                    <div className="relative w-16 flex-shrink-0">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={slot.percentage || ""}
                        onChange={(e) => updateSlot(rock.id, si, "percentage", parseFloat(e.target.value) || 0)}
                        className="w-full bg-zinc-800/50 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-100 text-right pr-5 focus:outline-none focus:border-amber-500/50"
                        placeholder="0"
                        disabled={!slot.mineralId}
                      />
                      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-zinc-600 pointer-events-none">%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Add Rock Button ── */}
      <button
        onClick={addRock}
        className="text-sm tracking-[0.1em] uppercase px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 rounded transition-colors text-amber-400"
      >
        + {t("addRock")}
      </button>

      {/* ── Totals (kept as-is) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-4">
          <div className="text-[10px] tracking-[0.1em] uppercase text-zinc-500 mb-1">
            {t("totalClusterMass")}
          </div>
          <div className="text-2xl font-mono font-bold text-amber-400">
            {cluster.totalMass.toFixed(2)} SCU
          </div>
        </div>

        <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-4">
          <div className="text-[10px] tracking-[0.1em] uppercase text-zinc-500 mb-1">
            {t("totalClusterValue")}
          </div>
          <div className="text-2xl font-mono font-bold text-emerald-400">
            {cluster.totalValue.toFixed(0)} aUEC
          </div>
        </div>
      </div>

      {/* ── Mineral Breakdown (kept as-is) ── */}
      {Object.keys(cluster.mineralBreakdown).length > 0 && (
        <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-4">
          <div className="text-xs tracking-[0.1em] uppercase text-zinc-400 mb-3">
            {t("mineralBreakdown")}
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
