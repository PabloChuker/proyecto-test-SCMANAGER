"use client";

import { useState } from "react";
import minerals from "@/data/mining/minerals.json";
import refineries from "@/data/mining/refineries.json";
import refiningMethods from "@/data/mining/refining-methods.json";

interface CrewMember {
  id: string;
  name: string;
  share: number;
}

interface Mineral {
  id: string;
  name: string;
  basePrice: number;
}

interface Refinery {
  id: string;
  name: string;
  bonuses: Record<string, number>;
}

interface RefiningMethod {
  id: string;
  name: string;
  yieldMultiplier: number;
  timeMultiplier: number;
  costMultiplier: number;
}

export default function WorkOrderCalculator() {
  const [mode] = useState("ship");
  const [selectedRefinery, setSelectedRefinery] = useState(refineries[0]?.id || "");
  const [selectedMethod, setSelectedMethod] = useState(refiningMethods[0]?.id || "");
  const [oreQuantities, setOreQuantities] = useState<Record<string, number>>({});
  const [crew, setCrew] = useState<CrewMember[]>([
    { id: "crew1", name: "You", share: 100 },
  ]);

  const typedMinerals = minerals as Mineral[];
  const typedRefinery = refineries.find((r) => r.id === selectedRefinery) as Refinery | undefined;
  const typedMethod = refiningMethods.find((m) => m.id === selectedMethod) as RefiningMethod | undefined;

  const updateOreQuantity = (mineralId: string, value: number) => {
    setOreQuantities((prev) => ({
      ...prev,
      [mineralId]: value,
    }));
  };

  const addCrewMember = () => {
    const newMember: CrewMember = {
      id: `crew${Date.now()}`,
      name: "New Crew",
      share: 0,
    };
    setCrew([...crew, newMember]);
  };

  const updateCrewMember = (id: string, field: string, value: any) => {
    setCrew(crew.map((m) => (m.id === id ? { ...m, [field]: value } : m)));
  };

  const removeCrewMember = (id: string) => {
    if (crew.length > 1) {
      setCrew(crew.filter((m) => m.id !== id));
    }
  };

  const calculateResults = () => {
    if (!typedRefinery || !typedMethod) return null;

    let totalRefinedValue = 0;
    const refinedBreakdown: Record<string, { quantity: number; value: number }> = {};

    typedMinerals.forEach((mineral) => {
      const quantity = oreQuantities[mineral.id] || 0;
      if (quantity <= 0) return;

      const bonus = typedRefinery.bonuses[mineral.id] || 0;
      const yieldMultiplier = typedMethod.yieldMultiplier;
      const refinedQuantity = quantity * (yieldMultiplier + bonus / 100);

      const mineralValue = refinedQuantity * mineral.basePrice;
      totalRefinedValue += mineralValue;

      refinedBreakdown[mineral.id] = {
        quantity: Math.round(refinedQuantity * 100) / 100,
        value: Math.round(mineralValue * 100) / 100,
      };
    });

    const refineryFeePercent = 5;
    const refineryFee = totalRefinedValue * (refineryFeePercent / 100);
    const totalPayout = totalRefinedValue - refineryFee;

    const crewShares = crew.map((member) => ({
      ...member,
      payout: (totalPayout * member.share) / 100,
    }));

    return {
      refinedBreakdown,
      totalRefinedValue: Math.round(totalRefinedValue * 100) / 100,
      refineryFee: Math.round(refineryFee * 100) / 100,
      totalPayout: Math.round(totalPayout * 100) / 100,
      crewShares,
    };
  };

  const results = calculateResults();

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-4">
          <label className="text-xs tracking-[0.1em] uppercase text-zinc-400 block mb-2">
            Refinery
          </label>
          <select
            value={selectedRefinery}
            onChange={(e) => setSelectedRefinery(e.target.value)}
            className="w-full bg-zinc-800/50 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500/50"
          >
            {refineries.map((ref) => (
              <option key={ref.id} value={ref.id}>
                {ref.name} ({ref.system})
              </option>
            ))}
          </select>
        </div>

        <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-4">
          <label className="text-xs tracking-[0.1em] uppercase text-zinc-400 block mb-2">
            Refining Method
          </label>
          <select
            value={selectedMethod}
            onChange={(e) => setSelectedMethod(e.target.value)}
            className="w-full bg-zinc-800/50 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500/50"
          >
            {refiningMethods.map((method) => (
              <option key={method.id} value={method.id}>
                {method.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-4">
        <div className="text-xs tracking-[0.1em] uppercase text-zinc-400 mb-3">
          Ore Quantities (cSCU)
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {typedMinerals.map((mineral) => (
            <div key={mineral.id}>
              <label className="text-[10px] text-zinc-500 block mb-1">{mineral.name}</label>
              <input
                type="number"
                min="0"
                value={oreQuantities[mineral.id] || ""}
                onChange={(e) => updateOreQuantity(mineral.id, parseFloat(e.target.value) || 0)}
                className="w-full bg-zinc-800/50 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100 focus:outline-none focus:border-amber-500/50"
                placeholder="0"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs tracking-[0.1em] uppercase text-zinc-400">Crew Members</div>
          <button
            onClick={addCrewMember}
            className="text-[10px] tracking-[0.1em] uppercase px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 rounded transition-colors text-amber-400"
          >
            + Add Member
          </button>
        </div>

        <div className="space-y-2">
          {crew.map((member) => (
            <div key={member.id} className="flex gap-2 items-center">
              <input
                type="text"
                value={member.name}
                onChange={(e) => updateCrewMember(member.id, "name", e.target.value)}
                placeholder="Name"
                className="flex-1 bg-zinc-800/50 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100 focus:outline-none focus:border-amber-500/50"
              />
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={member.share}
                  onChange={(e) => updateCrewMember(member.id, "share", parseFloat(e.target.value) || 0)}
                  className="w-16 bg-zinc-800/50 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100 focus:outline-none focus:border-amber-500/50"
                />
                <span className="text-[10px] text-zinc-600">%</span>
              </div>
              {crew.length > 1 && (
                <button
                  onClick={() => removeCrewMember(member.id)}
                  className="text-red-400 hover:text-red-300 text-sm font-mono"
                >
                  Ô£ò
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {results && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-4">
              <div className="text-[10px] tracking-[0.1em] uppercase text-zinc-500 mb-1">
                Total Refined Value
              </div>
              <div className="text-2xl font-mono font-bold text-emerald-400">
                {results.totalRefinedValue.toFixed(2)} aUEC
              </div>
            </div>

            <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-4">
              <div className="text-[10px] tracking-[0.1em] uppercase text-zinc-500 mb-1">
                Refinery Fee (5%)
              </div>
              <div className="text-2xl font-mono font-bold text-red-400">
                -{results.refineryFee.toFixed(2)} aUEC
              </div>
            </div>

            <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-4">
              <div className="text-[10px] tracking-[0.1em] uppercase text-zinc-500 mb-1">
                Total Crew Payout
              </div>
              <div className="text-2xl font-mono font-bold text-amber-400">
                {results.totalPayout.toFixed(2)} aUEC
              </div>
            </div>
          </div>

          <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-4">
            <div className="text-xs tracking-[0.1em] uppercase text-zinc-400 mb-3">
              Individual Payouts
            </div>
            <div className="space-y-2">
              {results.crewShares.map((member) => (
                <div
                  key={member.id}
                  className="flex justify-between items-center py-2 border-b border-zinc-800/40 last:border-0"
                >
                  <div>
                    <div className="text-sm text-zinc-100">{member.name}</div>
                    <div className="text-[10px] text-zinc-600">{member.share}%</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-amber-400">
                      {member.payout.toFixed(2)} aUEC
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {Object.keys(results.refinedBreakdown).length > 0 && (
            <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-4">
              <div className="text-xs tracking-[0.1em] uppercase text-zinc-400 mb-3">
                Refined Minerals
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {Object.entries(results.refinedBreakdown).map(([mineralId, breakdown]) => {
                  const mineral = typedMinerals.find((m) => m.id === mineralId);
                  if (!breakdown.quantity || !mineral) return null;

                  return (
                    <div key={mineralId} className="bg-zinc-800/40 rounded p-2">
                      <div className="text-[10px] text-zinc-500 mb-1">{mineral.name}</div>
                      <div className="text-sm font-mono text-emerald-400">
                        {breakdown.quantity.toFixed(0)} cSCU
                      </div>
                      <div className="text-[10px] text-zinc-600">
                        {breakdown.value.toFixed(0)} aUEC
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
