"use client";
// =============================================================================
// SC LABS — Ship Comparator v1
// Compare up to 3 ships side-by-side with radar and bar charts.
// Inspired by SPViewer.eu comparator.
// =============================================================================

import { useState, useEffect, useCallback } from "react";
import { ShipSearchDropdown } from "./ShipSearchDropdown";
import { RadarChart } from "./RadarChart";
import { CompareBarChart } from "./CompareBarChart";

const SHIP_COLORS = ["#E8890C", "#5DA007", "#B0B708"]; // SC LABS brand: orange, military green, dustcoat

interface ShipData {
  id: string;
  name: string;
  manufacturer: string | null;
  ship: {
    maxCrew: number | null;
    cargo: number | null;
    scmSpeed: number | null;
    afterburnerSpeed: number | null;
    pitchRate: number | null;
    yawRate: number | null;
    rollRate: number | null;
    maxAccelMain: number | null;
    maxAccelRetro: number | null;
    hydrogenFuelCap: number | null;
    quantumFuelCap: number | null;
    lengthMeters: number | null;
    beamMeters: number | null;
    heightMeters: number | null;
    role: string | null;
    focus: string | null;
    career: string | null;
    baseEmSignature: number | null;
    baseIrSignature: number | null;
    baseCsSignature: number | null;
  } | null;
  computed: {
    totalDps: number;
    totalAlpha: number;
    totalShieldHp: number;
    totalShieldRegen: number;
    totalPowerOutput: number;
    totalCooling: number;
    totalMissileDmg: number;
    weaponCount: number;
    missileCount: number;
    shieldCount: number;
    quantumSpeed: number | null;
    quantumRange: number | null;
    quantumSpool: number | null;
  };
}

type ViewMode = "overview" | "combat" | "performance" | "specs";

interface SelectedShip {
  id: string;
  name: string;
  manufacturer: string | null;
  ship: { role: string | null; cargo: number | null; scmSpeed: number | null } | null;
}

export function ShipComparator() {
  const [slots, setSlots] = useState<(SelectedShip | null)[]>([null, null, null]);
  const [shipData, setShipData] = useState<(ShipData | null)[]>([null, null, null]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("overview");

  const selectedIds = slots.filter(Boolean).map((s) => s!.id);

  // Fetch comparison data when selections change
  const fetchComparison = useCallback(async () => {
    const ids = slots.filter(Boolean).map((s) => s!.id);
    if (ids.length < 2) {
      setShipData([null, null, null]);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/ships/compare', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: ids }) });
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      const data = json.data || [];

      // Map back to slot positions
      const mapped = slots.map((slot) => {
        if (!slot) return null;
        return data.find((d: ShipData) => d.id === slot.id) || null;
      });
      setShipData(mapped);
    } catch (err) {
      console.error("Compare fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [slots]);

  useEffect(() => {
    fetchComparison();
  }, [fetchComparison]);

  // Update URL with selected IDs
  useEffect(() => {
    const ids = slots.filter(Boolean).map((s) => s!.id);
    const url = new URL(window.location.href);
    if (ids.length > 0) {
      url.searchParams.set("ids", ids.join(","));
    } else {
      url.searchParams.delete("ids");
    }
    window.history.replaceState({}, "", url.toString());
  }, [slots]);

  function setSlot(index: number, ship: SelectedShip | null) {
    setSlots((prev) => {
      const next = [...prev];
      next[index] = ship;
      return next;
    });
  }

  const activeShips = shipData.filter(Boolean) as ShipData[];
  const activeColors = slots.map((s, i) => (s ? SHIP_COLORS[i] : null)).filter(Boolean) as string[];

  return (
    <div className="space-y-6">
      {/* ── Selection Panel ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: SHIP_COLORS[i] }} />
              <span className="text-[10px] tracking-wider uppercase text-zinc-600">
                Ship {i + 1}
              </span>
            </div>
            <ShipSearchDropdown
              index={i}
              color={SHIP_COLORS[i]}
              selected={slots[i]}
              onSelect={(ship) => setSlot(i, ship)}
              onClear={() => setSlot(i, null)}
              excludeIds={selectedIds}
            />
          </div>
        ))}
      </div>

      {/* ── Status ── */}
      {selectedIds.length < 2 && (
        <div className="text-center py-12 text-sm text-zinc-600">
          Select at least 2 ships to compare
        </div>
      )}

      {loading && selectedIds.length >= 2 && (
        <div className="text-center py-12 text-sm text-zinc-500 animate-pulse">
          Loading comparison data...
        </div>
      )}

      {/* ── View Mode Tabs ── */}
      {activeShips.length >= 2 && !loading && (
        <>
          <div className="flex gap-1 border-b border-zinc-800/50 pb-px">
            {(["overview", "combat", "performance", "specs"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-4 py-2 text-xs tracking-wider uppercase transition-colors rounded-t ${
                  viewMode === mode
                    ? "text-amber-500 bg-zinc-900/50 border-b-2 border-amber-500"
                    : "text-zinc-600 hover:text-zinc-400"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          {/* ── OVERVIEW ── */}
          {viewMode === "overview" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Radar Chart */}
              <div className="bg-zinc-900/30 rounded border border-zinc-800/40 p-4">
                <h3 className="text-xs tracking-wider uppercase text-zinc-500 mb-4">Overview Radar</h3>
                <RadarChart
                  size={320}
                  axes={[
                    { key: "speed", label: "Speed", max: getMax(activeShips, (s) => s.ship?.scmSpeed || 0) },
                    { key: "dps", label: "DPS", max: getMax(activeShips, (s) => s.computed.totalDps) },
                    { key: "shield", label: "Shield", max: getMax(activeShips, (s) => s.computed.totalShieldHp) },
                    { key: "cargo", label: "Cargo", max: getMax(activeShips, (s) => s.ship?.cargo || 0) },
                    { key: "agility", label: "Agility", max: getMax(activeShips, (s) => (s.ship?.pitchRate || 0) + (s.ship?.yawRate || 0)) },
                    { key: "accel", label: "Accel", max: getMax(activeShips, (s) => s.ship?.maxAccelMain || 0) },
                  ]}
                  datasets={activeShips.map((ship, i) => ({
                    label: ship.name,
                    color: SHIP_COLORS[slots.findIndex((s) => s?.id === ship.id)],
                    values: {
                      speed: ship.ship?.scmSpeed || 0,
                      dps: ship.computed.totalDps,
                      shield: ship.computed.totalShieldHp,
                      cargo: ship.ship?.cargo || 0,
                      agility: (ship.ship?.pitchRate || 0) + (ship.ship?.yawRate || 0),
                      accel: ship.ship?.maxAccelMain || 0,
                    },
                  }))}
                />
              </div>

              {/* Quick Stats */}
              <div className="space-y-4">
                <CompareBarChart
                  title="SCM Speed"
                  unit="m/s"
                  entries={activeShips.map((s, i) => ({
                    label: s.name,
                    value: s.ship?.scmSpeed || 0,
                    color: SHIP_COLORS[slots.findIndex((sl) => sl?.id === s.id)],
                  }))}
                />
                <CompareBarChart
                  title="Total DPS"
                  entries={activeShips.map((s, i) => ({
                    label: s.name,
                    value: s.computed.totalDps,
                    color: SHIP_COLORS[slots.findIndex((sl) => sl?.id === s.id)],
                  }))}
                />
                <CompareBarChart
                  title="Shield HP"
                  entries={activeShips.map((s, i) => ({
                    label: s.name,
                    value: s.computed.totalShieldHp,
                    color: SHIP_COLORS[slots.findIndex((sl) => sl?.id === s.id)],
                  }))}
                />
                <CompareBarChart
                  title="Cargo"
                  unit="SCU"
                  entries={activeShips.map((s, i) => ({
                    label: s.name,
                    value: s.ship?.cargo || 0,
                    color: SHIP_COLORS[slots.findIndex((sl) => sl?.id === s.id)],
                  }))}
                />
              </div>
            </div>
          )}

          {/* ── COMBAT ── */}
          {viewMode === "combat" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <CompareBarChart
                title="Total DPS"
                entries={activeShips.map((s) => ({
                  label: s.name,
                  value: s.computed.totalDps,
                  color: SHIP_COLORS[slots.findIndex((sl) => sl?.id === s.id)],
                }))}
              />
              <CompareBarChart
                title="Alpha Damage"
                entries={activeShips.map((s) => ({
                  label: s.name,
                  value: s.computed.totalAlpha,
                  color: SHIP_COLORS[slots.findIndex((sl) => sl?.id === s.id)],
                }))}
              />
              <CompareBarChart
                title="Shield HP"
                entries={activeShips.map((s) => ({
                  label: s.name,
                  value: s.computed.totalShieldHp,
                  color: SHIP_COLORS[slots.findIndex((sl) => sl?.id === s.id)],
                }))}
              />
              <CompareBarChart
                title="Shield Regen"
                unit="/sec"
                entries={activeShips.map((s) => ({
                  label: s.name,
                  value: s.computed.totalShieldRegen,
                  color: SHIP_COLORS[slots.findIndex((sl) => sl?.id === s.id)],
                }))}
              />
              <CompareBarChart
                title="Missile Damage"
                entries={activeShips.map((s) => ({
                  label: s.name,
                  value: s.computed.totalMissileDmg,
                  color: SHIP_COLORS[slots.findIndex((sl) => sl?.id === s.id)],
                }))}
              />
              <CompareBarChart
                title="Weapon Hardpoints"
                entries={activeShips.map((s) => ({
                  label: s.name,
                  value: s.computed.weaponCount,
                  color: SHIP_COLORS[slots.findIndex((sl) => sl?.id === s.id)],
                }))}
              />
            </div>
          )}

          {/* ── PERFORMANCE ── */}
          {viewMode === "performance" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-zinc-900/30 rounded border border-zinc-800/40 p-4">
                <h3 className="text-xs tracking-wider uppercase text-zinc-500 mb-4">Performance Radar</h3>
                <RadarChart
                  size={320}
                  axes={[
                    { key: "scm", label: "SCM Speed", max: getMax(activeShips, (s) => s.ship?.scmSpeed || 0) },
                    { key: "ab", label: "Afterburner", max: getMax(activeShips, (s) => s.ship?.afterburnerSpeed || 0) },
                    { key: "pitch", label: "Pitch", max: getMax(activeShips, (s) => s.ship?.pitchRate || 0) },
                    { key: "yaw", label: "Yaw", max: getMax(activeShips, (s) => s.ship?.yawRate || 0) },
                    { key: "roll", label: "Roll", max: getMax(activeShips, (s) => s.ship?.rollRate || 0) },
                    { key: "accelMain", label: "Main Accel", max: getMax(activeShips, (s) => s.ship?.maxAccelMain || 0) },
                  ]}
                  datasets={activeShips.map((ship) => ({
                    label: ship.name,
                    color: SHIP_COLORS[slots.findIndex((s) => s?.id === ship.id)],
                    values: {
                      scm: ship.ship?.scmSpeed || 0,
                      ab: ship.ship?.afterburnerSpeed || 0,
                      pitch: ship.ship?.pitchRate || 0,
                      yaw: ship.ship?.yawRate || 0,
                      roll: ship.ship?.rollRate || 0,
                      accelMain: ship.ship?.maxAccelMain || 0,
                    },
                  }))}
                />
              </div>

              <div className="space-y-4">
                <CompareBarChart
                  title="SCM Speed"
                  unit="m/s"
                  entries={activeShips.map((s) => ({
                    label: s.name,
                    value: s.ship?.scmSpeed || 0,
                    color: SHIP_COLORS[slots.findIndex((sl) => sl?.id === s.id)],
                  }))}
                />
                <CompareBarChart
                  title="Afterburner Speed"
                  unit="m/s"
                  entries={activeShips.map((s) => ({
                    label: s.name,
                    value: s.ship?.afterburnerSpeed || 0,
                    color: SHIP_COLORS[slots.findIndex((sl) => sl?.id === s.id)],
                  }))}
                />
                <CompareBarChart
                  title="Main Acceleration"
                  unit="m/s²"
                  entries={activeShips.map((s) => ({
                    label: s.name,
                    value: s.ship?.maxAccelMain || 0,
                    color: SHIP_COLORS[slots.findIndex((sl) => sl?.id === s.id)],
                  }))}
                />
                <CompareBarChart
                  title="Retro Acceleration"
                  unit="m/s²"
                  entries={activeShips.map((s) => ({
                    label: s.name,
                    value: s.ship?.maxAccelRetro || 0,
                    color: SHIP_COLORS[slots.findIndex((sl) => sl?.id === s.id)],
                  }))}
                />
                <CompareBarChart
                  title="Hydrogen Fuel"
                  entries={activeShips.map((s) => ({
                    label: s.name,
                    value: s.ship?.hydrogenFuelCap || 0,
                    color: SHIP_COLORS[slots.findIndex((sl) => sl?.id === s.id)],
                  }))}
                />
              </div>
            </div>
          )}

          {/* ── SPECS TABLE ── */}
          {viewMode === "specs" && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left py-2 px-3 text-xs tracking-wider uppercase text-zinc-600 font-medium w-44">
                      Specification
                    </th>
                    {activeShips.map((s, i) => (
                      <th
                        key={s.id}
                        className="text-right py-2 px-3 text-xs tracking-wider uppercase font-medium"
                        style={{ color: SHIP_COLORS[slots.findIndex((sl) => sl?.id === s.id)] }}
                      >
                        {s.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900">
                  {specRows.map((row) => {
                    const values = activeShips.map((s) => row.getValue(s));
                    const bestIdx = row.higherIsBetter
                      ? values.indexOf(Math.max(...values))
                      : values.indexOf(Math.min(...values.filter((v) => v > 0)));

                    return (
                      <tr key={row.label} className="hover:bg-zinc-900/30 transition-colors">
                        <td className="py-1.5 px-3 text-xs text-zinc-500">{row.label}</td>
                        {values.map((val, i) => (
                          <td
                            key={i}
                            className={`py-1.5 px-3 text-right font-mono text-xs ${
                              i === bestIdx && values.filter((v) => v > 0).length > 1
                                ? "text-amber-500 font-medium"
                                : "text-zinc-300"
                            }`}
                          >
                            {val === 0 ? "—" : row.format(val)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Helpers ──

function getMax(ships: ShipData[], fn: (s: ShipData) => number): number {
  return Math.max(...ships.map(fn), 1);
}

const specRows: {
  label: string;
  getValue: (s: ShipData) => number;
  format: (v: number) => string;
  higherIsBetter: boolean;
}[] = [
  { label: "SCM Speed (m/s)", getValue: (s) => s.ship?.scmSpeed || 0, format: (v) => v.toLocaleString(), higherIsBetter: true },
  { label: "Afterburner (m/s)", getValue: (s) => s.ship?.afterburnerSpeed || 0, format: (v) => v.toLocaleString(), higherIsBetter: true },
  { label: "Pitch Rate (°/s)", getValue: (s) => s.ship?.pitchRate || 0, format: (v) => v.toFixed(1), higherIsBetter: true },
  { label: "Yaw Rate (°/s)", getValue: (s) => s.ship?.yawRate || 0, format: (v) => v.toFixed(1), higherIsBetter: true },
  { label: "Roll Rate (°/s)", getValue: (s) => s.ship?.rollRate || 0, format: (v) => v.toFixed(1), higherIsBetter: true },
  { label: "Main Accel (m/s²)", getValue: (s) => s.ship?.maxAccelMain || 0, format: (v) => v.toFixed(1), higherIsBetter: true },
  { label: "Retro Accel (m/s²)", getValue: (s) => s.ship?.maxAccelRetro || 0, format: (v) => v.toFixed(1), higherIsBetter: true },
  { label: "Cargo (SCU)", getValue: (s) => s.ship?.cargo || 0, format: (v) => v.toLocaleString(), higherIsBetter: true },
  { label: "Max Crew", getValue: (s) => s.ship?.maxCrew || 0, format: (v) => v.toString(), higherIsBetter: true },
  { label: "Total DPS", getValue: (s) => s.computed.totalDps, format: (v) => v.toFixed(1), higherIsBetter: true },
  { label: "Alpha Damage", getValue: (s) => s.computed.totalAlpha, format: (v) => v.toFixed(1), higherIsBetter: true },
  { label: "Shield HP", getValue: (s) => s.computed.totalShieldHp, format: (v) => v.toLocaleString(), higherIsBetter: true },
  { label: "Shield Regen/s", getValue: (s) => s.computed.totalShieldRegen, format: (v) => v.toFixed(1), higherIsBetter: true },
  { label: "Missile Damage", getValue: (s) => s.computed.totalMissileDmg, format: (v) => v.toLocaleString(), higherIsBetter: true },
  { label: "Power Output", getValue: (s) => s.computed.totalPowerOutput, format: (v) => v.toLocaleString(), higherIsBetter: true },
  { label: "Cooling Rate", getValue: (s) => s.computed.totalCooling, format: (v) => v.toLocaleString(), higherIsBetter: true },
  { label: "H2 Fuel Cap", getValue: (s) => s.ship?.hydrogenFuelCap || 0, format: (v) => v.toLocaleString(), higherIsBetter: true },
  { label: "QT Fuel Cap", getValue: (s) => s.ship?.quantumFuelCap || 0, format: (v) => v.toLocaleString(), higherIsBetter: true },
  { label: "QT Speed", getValue: (s) => s.computed.quantumSpeed || 0, format: (v) => (v / 1000).toFixed(0) + "k", higherIsBetter: true },
  { label: "Length (m)", getValue: (s) => s.ship?.lengthMeters || 0, format: (v) => v.toFixed(1), higherIsBetter: false },
  { label: "Beam (m)", getValue: (s) => s.ship?.beamMeters || 0, format: (v) => v.toFixed(1), higherIsBetter: false },
  { label: "Height (m)", getValue: (s) => s.ship?.heightMeters || 0, format: (v) => v.toFixed(1), higherIsBetter: false },
  { label: "EM Signature", getValue: (s) => s.ship?.baseEmSignature || 0, format: (v) => v.toFixed(0), higherIsBetter: false },
  { label: "IR Signature", getValue: (s) => s.ship?.baseIrSignature || 0, format: (v) => v.toFixed(0), higherIsBetter: false },
];
