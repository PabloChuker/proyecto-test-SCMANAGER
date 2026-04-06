"use client";

import { useState, useEffect } from "react";
import miningModules from "@/data/mining/mining-modules.json";

interface Laser {
  id: string;
  name: string;
  class_name?: string;
  min_power?: number;
  max_power?: number;
  optimal_range?: number;
  max_range?: number;
  resistance?: number;
  instability?: number;
  optimal_charge_rate?: number;
  optimal_charge_window?: number;
  inert_material_filter?: number;
  shockwave?: number;
  power_ramp_rate?: number;
  heat_dissipation?: number;
}

interface ShipConfig {
  name: string;
  turrets: number;
  cargo: number;
  activeSlotsPerTurret: number;
  passiveSlotsPerTurret: number;
  gadgetSlotsPerTurret: number;
}

interface Module {
  id: string;
  name: string;
  category: "active" | "passive" | "gadget";
  effects: {
    laserPower: number;
    resistance: number;
    instability: number;
    optChargeRate: number;
    optChargeWindow: number;
    inertFilter: number;
    overchargeRate: number;
    extractPower: number;
  };
}

interface TurretLoadout {
  laserId: string | null;
  activeModules: (string | null)[];
  passiveModules: (string | null)[];
  gadget: string | null;
}

const SHIP_CONFIGS: Record<string, ShipConfig> = {
  prospector: {
    name: "Prospector",
    turrets: 1,
    cargo: 32,
    activeSlotsPerTurret: 2,
    passiveSlotsPerTurret: 2,
    gadgetSlotsPerTurret: 1,
  },
  mole: {
    name: "MOLE",
    turrets: 3,
    cargo: 96,
    activeSlotsPerTurret: 2,
    passiveSlotsPerTurret: 2,
    gadgetSlotsPerTurret: 1,
  },
  golem: {
    name: "Golem",
    turrets: 1,
    cargo: 240,
    activeSlotsPerTurret: 0,
    passiveSlotsPerTurret: 1,
    gadgetSlotsPerTurret: 1,
  },
};

export default function MiningLoadoutCalculator() {
  const [ship, setShip] = useState<string>("prospector");
  const [lasers, setLasers] = useState<Laser[]>([]);
  const [loading, setLoading] = useState(true);
  const [turrets, setTurrets] = useState<TurretLoadout[]>([]);

  const shipConfig = SHIP_CONFIGS[ship];
  const typedModules = miningModules as Module[];
  const activeModules = typedModules.filter(m => m.category === "active");
  const passiveModules = typedModules.filter(m => m.category === "passive");
  const gadgets = typedModules.filter(m => m.category === "gadget");

  useEffect(() => {
    const fetchLasers = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/mining/lasers");
        if (res.ok) {
          const data = await res.json();
          // Map API field names to component interface
          const mapped = (data.data || []).map((l: any) => ({
            id: l.id,
            name: l.name,
            class_name: l.class_name,
            min_power: (l.miningPower ?? 0) * 0.3,
            max_power: l.miningPower ?? 0,
            optimal_range: l.optimalRange ?? 0,
            max_range: l.maxRange ?? 0,
            resistance: l.resistance ?? 0,
            instability: l.instability ?? 0,
            optimal_charge_rate: l.throttleRate ?? 0,
            optimal_charge_window: 0,
            inert_material_filter: 0,
            shockwave: 0,
            power_ramp_rate: 0,
            heat_dissipation: l.thermalOutput ?? 0,
          }));
          setLasers(mapped);
        }
      } catch (error) {
        console.error("Error fetching lasers:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchLasers();
  }, []);

  useEffect(() => {
    const newTurrets: TurretLoadout[] = [];
    for (let i = 0; i < shipConfig.turrets; i++) {
      newTurrets.push({
        laserId: null,
        activeModules: Array(shipConfig.activeSlotsPerTurret).fill(null),
        passiveModules: Array(shipConfig.passiveSlotsPerTurret).fill(null),
        gadget: null,
      });
    }
    setTurrets(newTurrets);
  }, [ship, shipConfig.turrets, shipConfig.activeSlotsPerTurret, shipConfig.passiveSlotsPerTurret]);

  const updateTurret = (turretIdx: number, field: string, value: any) => {
    const updated = [...turrets];
    (updated[turretIdx] as any)[field] = value;
    setTurrets(updated);
  };

  const updateTurretModule = (
    turretIdx: number,
    moduleType: "activeModules" | "passiveModules",
    slotIdx: number,
    value: string | null
  ) => {
    const updated = [...turrets];
    const modules = updated[turretIdx][moduleType];
    modules[slotIdx] = value;
    setTurrets(updated);
  };

  const calculateStats = () => {
    let totalMinPower = 0;
    let totalMaxPower = 0;
    let optimalRange = 0;
    let maxRange = 0;
    let resistance = 0;
    let instability = 0;
    let optChargeRate = 0;
    let optChargeWindow = 0;
    let inertFilter = 0;
    let overchargeRate = 0;
    let extractPower = 0;

    turrets.forEach((turret) => {
      const laser = lasers.find(l => l.id === turret.laserId);
      if (laser) {
        totalMinPower += laser.min_power || 0;
        totalMaxPower += laser.max_power || 0;
        optimalRange = Math.max(optimalRange, laser.optimal_range || 0);
        maxRange = Math.max(maxRange, laser.max_range || 0);
        resistance += laser.resistance || 0;
        instability += laser.instability || 0;
        optChargeRate += laser.optimal_charge_rate || 0;
        optChargeWindow += laser.optimal_charge_window || 0;
        inertFilter += laser.inert_material_filter || 0;
        overchargeRate += laser.power_ramp_rate || 0;
      }

      [...turret.activeModules, ...turret.passiveModules, turret.gadget].forEach((moduleId) => {
        if (!moduleId) return;
        const mod = typedModules.find(m => m.id === moduleId);
        if (mod) {
          totalMinPower += mod.effects.laserPower * 0.5;
          totalMaxPower += mod.effects.laserPower;
          resistance += mod.effects.resistance;
          instability += mod.effects.instability;
          optChargeRate += mod.effects.optChargeRate;
          optChargeWindow += mod.effects.optChargeWindow;
          inertFilter += mod.effects.inertFilter;
          overchargeRate += mod.effects.overchargeRate;
          extractPower += mod.effects.extractPower;
        }
      });
    });

    return {
      minPower: Math.round(totalMinPower * 100) / 100,
      maxPower: Math.round(totalMaxPower * 100) / 100,
      optimalRange: Math.round(optimalRange * 100) / 100,
      maxRange: Math.round(maxRange * 100) / 100,
      resistance: Math.round(resistance * 100) / 100,
      instability: Math.round(instability * 100) / 100,
      optChargeRate: Math.round(optChargeRate * 100) / 100,
      optChargeWindow: Math.round(optChargeWindow * 100) / 100,
      inertFilter: Math.round(inertFilter * 100) / 100,
      overchargeRate: Math.round(overchargeRate * 100) / 100,
      extractPower: Math.round(extractPower * 100) / 100,
    };
  };

  const stats = calculateStats();

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-4">
          <label className="text-xs tracking-[0.1em] uppercase text-zinc-400 block mb-2">
            Select Ship
          </label>
          <select
            value={ship}
            onChange={(e) => setShip(e.target.value)}
            className="w-full bg-zinc-800/50 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500/50"
          >
            {Object.entries(SHIP_CONFIGS).map(([key, cfg]) => (
              <option key={key} value={key}>
                {cfg.name} ({cfg.cargo} SCU)
              </option>
            ))}
          </select>
        </div>

        <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-4">
          <div className="text-xs tracking-[0.1em] uppercase text-zinc-500">
            <div>Turrets: {shipConfig.turrets}</div>
            <div>Cargo: {shipConfig.cargo} SCU</div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-zinc-400">Loading lasers...</div>
      ) : (
        <div className="space-y-4">
          {turrets.map((turret, turretIdx) => (
            <div
              key={turretIdx}
              className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-4 space-y-3"
            >
              <div className="text-xs font-mono text-amber-400">Turret {turretIdx + 1}</div>

              <div>
                <label className="text-xs tracking-[0.1em] uppercase text-zinc-400 block mb-2">
                  Laser
                </label>
                <select
                  value={turret.laserId || ""}
                  onChange={(e) => updateTurret(turretIdx, "laserId", e.target.value || null)}
                  className="w-full bg-zinc-800/50 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500/50"
                >
                  <option value="">-- Select Laser --</option>
                  {lasers.map((laser) => (
                    <option key={laser.id} value={laser.id}>
                      {laser.name} ({laser.class_name})
                    </option>
                  ))}
                </select>
              </div>

              {shipConfig.activeSlotsPerTurret > 0 && (
                <div>
                  <label className="text-xs tracking-[0.1em] uppercase text-zinc-400 block mb-2">
                    Active Modules ({shipConfig.activeSlotsPerTurret})
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {turret.activeModules.map((moduleId, slotIdx) => (
                      <select
                        key={slotIdx}
                        value={moduleId || ""}
                        onChange={(e) =>
                          updateTurretModule(turretIdx, "activeModules", slotIdx, e.target.value || null)
                        }
                        className="bg-zinc-800/50 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-amber-500/50"
                      >
                        <option value="">-- Empty --</option>
                        {activeModules.map((mod) => (
                          <option key={mod.id} value={mod.id}>
                            {mod.name}
                          </option>
                        ))}
                      </select>
                    ))}
                  </div>
                </div>
              )}

              {shipConfig.passiveSlotsPerTurret > 0 && (
                <div>
                  <label className="text-xs tracking-[0.1em] uppercase text-zinc-400 block mb-2">
                    Passive Modules ({shipConfig.passiveSlotsPerTurret})
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {turret.passiveModules.map((moduleId, slotIdx) => (
                      <select
                        key={slotIdx}
                        value={moduleId || ""}
                        onChange={(e) =>
                          updateTurretModule(turretIdx, "passiveModules", slotIdx, e.target.value || null)
                        }
                        className="bg-zinc-800/50 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-amber-500/50"
                      >
                        <option value="">-- Empty --</option>
                        {passiveModules.map((mod) => (
                          <option key={mod.id} value={mod.id}>
                            {mod.name}
                          </option>
                        ))}
                      </select>
                    ))}
                  </div>
                </div>
              )}

              {shipConfig.gadgetSlotsPerTurret > 0 && (
                <div>
                  <label className="text-xs tracking-[0.1em] uppercase text-zinc-400 block mb-2">
                    Gadget
                  </label>
                  <select
                    value={turret.gadget || ""}
                    onChange={(e) => updateTurret(turretIdx, "gadget", e.target.value || null)}
                    className="w-full bg-zinc-800/50 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500/50"
                  >
                    <option value="">-- Empty --</option>
                    {gadgets.map((mod) => (
                      <option key={mod.id} value={mod.id}>
                        {mod.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <StatBox label="Min Power" value={stats.minPower} unit="%" />
        <StatBox label="Max Power" value={stats.maxPower} unit="%" />
        <StatBox label="Optimal Range" value={stats.optimalRange} unit="m" />
        <StatBox label="Max Range" value={stats.maxRange} unit="m" />
        <StatBox label="Resistance" value={stats.resistance} unit="%" color={stats.resistance >= 0 ? "emerald" : "red"} />
        <StatBox label="Instability" value={stats.instability} unit="%" color={stats.instability <= 0 ? "emerald" : "red"} />
        <StatBox label="Opt Charge Rate" value={stats.optChargeRate} unit="%" />
        <StatBox label="Opt Charge Window" value={stats.optChargeWindow} unit="%" />
        <StatBox label="Inert Filter" value={stats.inertFilter} unit="%" />
        <StatBox label="Overcharge Rate" value={stats.overchargeRate} unit="%" />
        <StatBox label="Extract Power" value={stats.extractPower} unit="%" />
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
  unit,
  color = "zinc",
}: {
  label: string;
  value: number;
  unit: string;
  color?: "zinc" | "emerald" | "red";
}) {
  const colorClass =
    color === "emerald"
      ? "text-emerald-400"
      : color === "red"
        ? "text-red-400"
        : "text-amber-400";

  return (
    <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-3 text-center">
      <div className="text-[10px] tracking-[0.1em] uppercase text-zinc-500 mb-1">
        {label}
      </div>
      <div className={`text-lg font-mono font-bold ${colorClass}`}>
        {value}
        <span className="text-xs text-zinc-600">{unit}</span>
      </div>
    </div>
  );
}
