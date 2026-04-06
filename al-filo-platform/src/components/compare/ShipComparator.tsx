"use client";
// =============================================================================
// SC LABS — Ship Comparator v2
// Compare up to 3 ships side-by-side with spviewer-style chart grid.
// 16+ chart sections covering speed, propulsion, shields, hull, dimensions,
// radar emissions, fuel, weapons, and more.
// =============================================================================

import { useState, useEffect, useCallback } from "react";
import { ShipSearchDropdown } from "./ShipSearchDropdown";
import { RadarChart } from "./RadarChart";
import { CompareBarChart } from "./CompareBarChart";

const SHIP_COLORS = ["#455ba3", "#df8f6c", "#8fc586"];

interface ShipData {
  id: string;
  name: string;
  manufacturer: string | null;
  size: number | null;
  msrpUsd: number | null;
  warbondUsd: number | null;
  ship: {
    maxCrew: number | null;
    cargo: number | null;
    mass: number | null;
    scmSpeed: number | null;
    afterburnerSpeed: number | null;
    pitchRate: number | null;
    yawRate: number | null;
    rollRate: number | null;
    maxAccelMain: number | null;
    maxAccelRetro: number | null;
    accelUp: number | null;
    accelDown: number | null;
    accelStrafe: number | null;
    boostSpeedForward: number | null;
    boostSpeedBackward: number | null;
    boostedPitch: number | null;
    boostedYaw: number | null;
    boostedRoll: number | null;
    hydrogenFuelCap: number | null;
    quantumFuelCap: number | null;
    quantumRange: number | null;
    shieldHpTotal: number | null;
    hullHp: number | null;
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

interface SelectedShip {
  id: string;
  name: string;
  manufacturer: string | null;
  ship: { role: string | null; cargo: number | null; scmSpeed: number | null } | null;
}

// ── Section header component ──
function SectionTitle({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <h3 className="text-[11px] tracking-[0.14em] uppercase text-zinc-500 font-medium whitespace-nowrap">
        {title}
      </h3>
      <div className="flex-1 h-px bg-zinc-800/60" />
    </div>
  );
}

// ── Chart panel wrapper ──
function ChartPanel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-zinc-900/30 rounded border border-zinc-800/40 p-4 ${className}`}>
      <SectionTitle title={title} />
      <div className="space-y-3">
        {children}
      </div>
    </div>
  );
}

export function ShipComparator() {
  const [slots, setSlots] = useState<(SelectedShip | null)[]>([null, null, null]);
  const [shipData, setShipData] = useState<(ShipData | null)[]>([null, null, null]);
  const [loading, setLoading] = useState(false);

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
      const res = await fetch('/api/ships/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      const data = json.data || [];
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

  useEffect(() => { fetchComparison(); }, [fetchComparison]);

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
  const getColor = (ship: ShipData) => SHIP_COLORS[slots.findIndex((s) => s?.id === ship.id)];
  const makeEntries = (fn: (s: ShipData) => number) =>
    activeShips.map((s) => ({ label: s.name, value: fn(s), color: getColor(s) }));

  return (
    <div className="space-y-6">
      {/* ── Selection Panel ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: SHIP_COLORS[i] }} />
              <span className="text-[10px] tracking-wider uppercase text-zinc-600">Ship {i + 1}</span>
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

      {/* ── CHART GRID ── */}
      {activeShips.length >= 2 && !loading && (
        <>
          {/* ── Legend ── */}
          <div className="flex items-center gap-5 px-1">
            {activeShips.map((s) => (
              <div key={s.id} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: getColor(s) }} />
                <span className="text-xs text-zinc-300 font-medium">{s.name}</span>
                {s.ship?.role && (
                  <span className="text-[10px] text-zinc-600 ml-1">{s.ship.role}</span>
                )}
              </div>
            ))}
          </div>

          {/* ── ROW 1: Overview Radar + Speed ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartPanel title="Overview">
              <RadarChart
                size={340}
                axes={[
                  { key: "speed", label: "Speed", max: getMax(activeShips, (s) => s.ship?.scmSpeed || 0) },
                  { key: "dps", label: "DPS", max: getMax(activeShips, (s) => s.computed.totalDps) },
                  { key: "shield", label: "Shields", max: getMax(activeShips, (s) => s.computed.totalShieldHp) },
                  { key: "hull", label: "Hull", max: getMax(activeShips, (s) => s.ship?.hullHp || 0) },
                  { key: "agility", label: "Agility", max: getMax(activeShips, (s) => (s.ship?.pitchRate || 0) + (s.ship?.yawRate || 0) + (s.ship?.rollRate || 0)) },
                  { key: "accel", label: "Accel", max: getMax(activeShips, (s) => s.ship?.maxAccelMain || 0) },
                ]}
                datasets={activeShips.map((ship) => ({
                  label: ship.name,
                  color: getColor(ship),
                  values: {
                    speed: ship.ship?.scmSpeed || 0,
                    dps: ship.computed.totalDps,
                    shield: ship.computed.totalShieldHp,
                    hull: ship.ship?.hullHp || 0,
                    agility: (ship.ship?.pitchRate || 0) + (ship.ship?.yawRate || 0) + (ship.ship?.rollRate || 0),
                    accel: ship.ship?.maxAccelMain || 0,
                  },
                }))}
              />
            </ChartPanel>

            <ChartPanel title="Speed">
              <CompareBarChart title="SCM Speed" unit="m/s" entries={makeEntries((s) => s.ship?.scmSpeed || 0)} />
              <CompareBarChart title="Afterburner" unit="m/s" entries={makeEntries((s) => s.ship?.afterburnerSpeed || 0)} />
              <CompareBarChart title="Boost Forward" unit="m/s" entries={makeEntries((s) => s.ship?.boostSpeedForward || 0)} />
              <CompareBarChart title="Boost Backward" unit="m/s" entries={makeEntries((s) => s.ship?.boostSpeedBackward || 0)} />
            </ChartPanel>
          </div>

          {/* ── ROW 2: Propulsion (Acceleration) + Axis Rotation ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartPanel title="Propulsion (G-Force)">
              <CompareBarChart title="Forward" unit="m/s²" entries={makeEntries((s) => s.ship?.maxAccelMain || 0)} />
              <CompareBarChart title="Retro" unit="m/s²" entries={makeEntries((s) => s.ship?.maxAccelRetro || 0)} />
              <CompareBarChart title="Up" unit="m/s²" entries={makeEntries((s) => s.ship?.accelUp || 0)} />
              <CompareBarChart title="Down" unit="m/s²" entries={makeEntries((s) => s.ship?.accelDown || 0)} />
              <CompareBarChart title="Strafe" unit="m/s²" entries={makeEntries((s) => s.ship?.accelStrafe || 0)} />
            </ChartPanel>

            <ChartPanel title="Axis Rotation">
              <CompareBarChart title="Pitch" unit="°/s" entries={makeEntries((s) => s.ship?.pitchRate || 0)} />
              <CompareBarChart title="Yaw" unit="°/s" entries={makeEntries((s) => s.ship?.yawRate || 0)} />
              <CompareBarChart title="Roll" unit="°/s" entries={makeEntries((s) => s.ship?.rollRate || 0)} />
              <CompareBarChart title="Boosted Pitch" unit="°/s" entries={makeEntries((s) => s.ship?.boostedPitch || 0)} />
              <CompareBarChart title="Boosted Yaw" unit="°/s" entries={makeEntries((s) => s.ship?.boostedYaw || 0)} />
              <CompareBarChart title="Boosted Roll" unit="°/s" entries={makeEntries((s) => s.ship?.boostedRoll || 0)} />
            </ChartPanel>
          </div>

          {/* ── ROW 3: Maneuverability Radar + Shield ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartPanel title="Maneuverability Radar">
              <RadarChart
                size={320}
                axes={[
                  { key: "pitch", label: "Pitch", max: getMax(activeShips, (s) => s.ship?.pitchRate || 0) },
                  { key: "yaw", label: "Yaw", max: getMax(activeShips, (s) => s.ship?.yawRate || 0) },
                  { key: "roll", label: "Roll", max: getMax(activeShips, (s) => s.ship?.rollRate || 0) },
                  { key: "accelFwd", label: "Accel Fwd", max: getMax(activeShips, (s) => s.ship?.maxAccelMain || 0) },
                  { key: "accelRetro", label: "Retro", max: getMax(activeShips, (s) => s.ship?.maxAccelRetro || 0) },
                  { key: "strafe", label: "Strafe", max: getMax(activeShips, (s) => s.ship?.accelStrafe || 0) },
                ]}
                datasets={activeShips.map((ship) => ({
                  label: ship.name,
                  color: getColor(ship),
                  values: {
                    pitch: ship.ship?.pitchRate || 0,
                    yaw: ship.ship?.yawRate || 0,
                    roll: ship.ship?.rollRate || 0,
                    accelFwd: ship.ship?.maxAccelMain || 0,
                    accelRetro: ship.ship?.maxAccelRetro || 0,
                    strafe: ship.ship?.accelStrafe || 0,
                  },
                }))}
              />
            </ChartPanel>

            <ChartPanel title="Shield">
              <CompareBarChart title="Total Shield HP" entries={makeEntries((s) => s.computed.totalShieldHp)} />
              <CompareBarChart title="Shield Regen" unit="/s" entries={makeEntries((s) => s.computed.totalShieldRegen)} />
              <CompareBarChart title="Shield Count" entries={makeEntries((s) => s.computed.shieldCount)} />
              <CompareBarChart title="Ship Shield HP (DB)" entries={makeEntries((s) => s.ship?.shieldHpTotal || 0)} />
            </ChartPanel>
          </div>

          {/* ── ROW 4: Hull & Durability + Combat ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartPanel title="Hull & Durability">
              <CompareBarChart title="Hull HP" entries={makeEntries((s) => s.ship?.hullHp || 0)} />
              <CompareBarChart title="Mass" unit="kg" entries={makeEntries((s) => s.ship?.mass || 0)} />
            </ChartPanel>

            <ChartPanel title="Combat">
              <CompareBarChart title="Total DPS" entries={makeEntries((s) => s.computed.totalDps)} />
              <CompareBarChart title="Alpha Damage" entries={makeEntries((s) => s.computed.totalAlpha)} />
              <CompareBarChart title="Missile Damage" entries={makeEntries((s) => s.computed.totalMissileDmg)} />
              <CompareBarChart title="Weapon Hardpoints" entries={makeEntries((s) => s.computed.weaponCount)} />
              <CompareBarChart title="Missile Racks" entries={makeEntries((s) => s.computed.missileCount)} />
            </ChartPanel>
          </div>

          {/* ── ROW 5: Dimensions & Mass + Radar Emissions ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartPanel title="Dimensions & Mass">
              <CompareBarChart title="Length" unit="m" entries={makeEntries((s) => s.ship?.lengthMeters || 0)} />
              <CompareBarChart title="Beam (Width)" unit="m" entries={makeEntries((s) => s.ship?.beamMeters || 0)} />
              <CompareBarChart title="Height" unit="m" entries={makeEntries((s) => s.ship?.heightMeters || 0)} />
              <CompareBarChart title="Mass" unit="kg" entries={makeEntries((s) => s.ship?.mass || 0)} />
            </ChartPanel>

            <ChartPanel title="Radar Emissions">
              <CompareBarChart title="EM Signature" entries={makeEntries((s) => s.ship?.baseEmSignature || 0)} />
              <CompareBarChart title="IR Signature" entries={makeEntries((s) => s.ship?.baseIrSignature || 0)} />
              <CompareBarChart title="CS Signature" entries={makeEntries((s) => s.ship?.baseCsSignature || 0)} />
            </ChartPanel>
          </div>

          {/* ── ROW 6: Fuel & Quantum + Power & Systems ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartPanel title="Fuel & Quantum">
              <CompareBarChart title="Hydrogen Fuel" entries={makeEntries((s) => s.ship?.hydrogenFuelCap || 0)} />
              <CompareBarChart title="Quantum Fuel" entries={makeEntries((s) => s.ship?.quantumFuelCap || 0)} />
              <CompareBarChart title="Quantum Range" unit="km" entries={makeEntries((s) => s.ship?.quantumRange || 0)} />
              <CompareBarChart title="QT Drive Speed" unit="m/s" entries={makeEntries((s) => s.computed.quantumSpeed || 0)} />
              <CompareBarChart title="QT Spool Time" unit="s" entries={makeEntries((s) => s.computed.quantumSpool || 0)} />
            </ChartPanel>

            <ChartPanel title="Power & Systems">
              <CompareBarChart title="Power Output" entries={makeEntries((s) => s.computed.totalPowerOutput)} />
              <CompareBarChart title="Cooling Rate" entries={makeEntries((s) => s.computed.totalCooling)} />
              <CompareBarChart title="Cargo" unit="SCU" entries={makeEntries((s) => s.ship?.cargo || 0)} />
              <CompareBarChart title="Max Crew" entries={makeEntries((s) => s.ship?.maxCrew || 0)} />
            </ChartPanel>
          </div>

          {/* ── ROW 7: Price & Info ── */}
          <ChartPanel title="Price & Info">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <CompareBarChart title="MSRP" unit="USD" entries={makeEntries((s) => s.msrpUsd || 0)} />
              <CompareBarChart title="Warbond" unit="USD" entries={makeEntries((s) => s.warbondUsd || 0)} />
            </div>
          </ChartPanel>

          {/* ── FULL SPECS TABLE ── */}
          <div className="bg-zinc-900/30 rounded border border-zinc-800/40 p-4">
            <SectionTitle title="Full Specifications" />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left py-2 px-3 text-xs tracking-wider uppercase text-zinc-600 font-medium w-44">
                      Specification
                    </th>
                    {activeShips.map((s) => (
                      <th
                        key={s.id}
                        className="text-right py-2 px-3 text-xs tracking-wider uppercase font-medium"
                        style={{ color: getColor(s) }}
                      >
                        {s.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900">
                  {specRows.map((row) => {
                    const values = activeShips.map((s) => row.getValue(s));
                    const nonZero = values.filter((v) => v > 0);
                    const bestIdx = nonZero.length > 1
                      ? row.higherIsBetter
                        ? values.indexOf(Math.max(...values))
                        : values.indexOf(Math.min(...nonZero))
                      : -1;

                    return (
                      <tr key={row.label} className="hover:bg-zinc-900/30 transition-colors">
                        <td className="py-1.5 px-3 text-xs text-zinc-500">{row.label}</td>
                        {values.map((val, i) => (
                          <td
                            key={i}
                            className={`py-1.5 px-3 text-right font-mono text-xs ${
                              i === bestIdx ? "text-amber-500 font-medium" : "text-zinc-300"
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
          </div>
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
  // Speed
  { label: "SCM Speed (m/s)", getValue: (s) => s.ship?.scmSpeed || 0, format: (v) => v.toLocaleString(), higherIsBetter: true },
  { label: "Afterburner (m/s)", getValue: (s) => s.ship?.afterburnerSpeed || 0, format: (v) => v.toLocaleString(), higherIsBetter: true },
  { label: "Boost Fwd (m/s)", getValue: (s) => s.ship?.boostSpeedForward || 0, format: (v) => v.toLocaleString(), higherIsBetter: true },
  { label: "Boost Bwd (m/s)", getValue: (s) => s.ship?.boostSpeedBackward || 0, format: (v) => v.toLocaleString(), higherIsBetter: true },
  // Acceleration
  { label: "Accel Forward (m/s\u00B2)", getValue: (s) => s.ship?.maxAccelMain || 0, format: (v) => v.toFixed(1), higherIsBetter: true },
  { label: "Accel Retro (m/s\u00B2)", getValue: (s) => s.ship?.maxAccelRetro || 0, format: (v) => v.toFixed(1), higherIsBetter: true },
  { label: "Accel Up (m/s\u00B2)", getValue: (s) => s.ship?.accelUp || 0, format: (v) => v.toFixed(1), higherIsBetter: true },
  { label: "Accel Down (m/s\u00B2)", getValue: (s) => s.ship?.accelDown || 0, format: (v) => v.toFixed(1), higherIsBetter: true },
  { label: "Accel Strafe (m/s\u00B2)", getValue: (s) => s.ship?.accelStrafe || 0, format: (v) => v.toFixed(1), higherIsBetter: true },
  // Rotation
  { label: "Pitch (\u00B0/s)", getValue: (s) => s.ship?.pitchRate || 0, format: (v) => v.toFixed(1), higherIsBetter: true },
  { label: "Yaw (\u00B0/s)", getValue: (s) => s.ship?.yawRate || 0, format: (v) => v.toFixed(1), higherIsBetter: true },
  { label: "Roll (\u00B0/s)", getValue: (s) => s.ship?.rollRate || 0, format: (v) => v.toFixed(1), higherIsBetter: true },
  { label: "Boosted Pitch (\u00B0/s)", getValue: (s) => s.ship?.boostedPitch || 0, format: (v) => v.toFixed(1), higherIsBetter: true },
  { label: "Boosted Yaw (\u00B0/s)", getValue: (s) => s.ship?.boostedYaw || 0, format: (v) => v.toFixed(1), higherIsBetter: true },
  { label: "Boosted Roll (\u00B0/s)", getValue: (s) => s.ship?.boostedRoll || 0, format: (v) => v.toFixed(1), higherIsBetter: true },
  // Combat
  { label: "Total DPS", getValue: (s) => s.computed.totalDps, format: (v) => v.toFixed(1), higherIsBetter: true },
  { label: "Alpha Damage", getValue: (s) => s.computed.totalAlpha, format: (v) => v.toFixed(1), higherIsBetter: true },
  { label: "Missile Damage", getValue: (s) => s.computed.totalMissileDmg, format: (v) => v.toLocaleString(), higherIsBetter: true },
  { label: "Weapon Count", getValue: (s) => s.computed.weaponCount, format: (v) => v.toString(), higherIsBetter: true },
  { label: "Missile Racks", getValue: (s) => s.computed.missileCount, format: (v) => v.toString(), higherIsBetter: true },
  // Shields
  { label: "Shield HP", getValue: (s) => s.computed.totalShieldHp, format: (v) => v.toLocaleString(), higherIsBetter: true },
  { label: "Shield Regen/s", getValue: (s) => s.computed.totalShieldRegen, format: (v) => v.toFixed(1), higherIsBetter: true },
  { label: "Shield Count", getValue: (s) => s.computed.shieldCount, format: (v) => v.toString(), higherIsBetter: true },
  // Hull
  { label: "Hull HP", getValue: (s) => s.ship?.hullHp || 0, format: (v) => v.toLocaleString(), higherIsBetter: true },
  // Dimensions
  { label: "Length (m)", getValue: (s) => s.ship?.lengthMeters || 0, format: (v) => v.toFixed(1), higherIsBetter: false },
  { label: "Beam (m)", getValue: (s) => s.ship?.beamMeters || 0, format: (v) => v.toFixed(1), higherIsBetter: false },
  { label: "Height (m)", getValue: (s) => s.ship?.heightMeters || 0, format: (v) => v.toFixed(1), higherIsBetter: false },
  { label: "Mass (kg)", getValue: (s) => s.ship?.mass || 0, format: (v) => v.toLocaleString(), higherIsBetter: false },
  // Signatures
  { label: "EM Signature", getValue: (s) => s.ship?.baseEmSignature || 0, format: (v) => v.toFixed(0), higherIsBetter: false },
  { label: "IR Signature", getValue: (s) => s.ship?.baseIrSignature || 0, format: (v) => v.toFixed(0), higherIsBetter: false },
  { label: "CS Signature", getValue: (s) => s.ship?.baseCsSignature || 0, format: (v) => v.toFixed(0), higherIsBetter: false },
  // Fuel
  { label: "H2 Fuel Cap", getValue: (s) => s.ship?.hydrogenFuelCap || 0, format: (v) => v.toLocaleString(), higherIsBetter: true },
  { label: "QT Fuel Cap", getValue: (s) => s.ship?.quantumFuelCap || 0, format: (v) => v.toLocaleString(), higherIsBetter: true },
  { label: "QT Range (km)", getValue: (s) => s.ship?.quantumRange || 0, format: (v) => v.toLocaleString(), higherIsBetter: true },
  { label: "QT Speed", getValue: (s) => s.computed.quantumSpeed || 0, format: (v) => (v / 1000).toFixed(0) + "k", higherIsBetter: true },
  { label: "QT Spool (s)", getValue: (s) => s.computed.quantumSpool || 0, format: (v) => v.toFixed(1), higherIsBetter: false },
  // Systems
  { label: "Power Output", getValue: (s) => s.computed.totalPowerOutput, format: (v) => v.toLocaleString(), higherIsBetter: true },
  { label: "Cooling Rate", getValue: (s) => s.computed.totalCooling, format: (v) => v.toLocaleString(), higherIsBetter: true },
  { label: "Cargo (SCU)", getValue: (s) => s.ship?.cargo || 0, format: (v) => v.toLocaleString(), higherIsBetter: true },
  { label: "Max Crew", getValue: (s) => s.ship?.maxCrew || 0, format: (v) => v.toString(), higherIsBetter: true },
  // Price
  { label: "MSRP (USD)", getValue: (s) => s.msrpUsd || 0, format: (v) => "$" + v.toLocaleString(), higherIsBetter: false },
];
