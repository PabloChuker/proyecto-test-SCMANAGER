"use client";

import { useState, useEffect, useMemo } from "react";
import miningModules from "@/data/mining/mining-modules.json";

interface Laser {
  id: string;
  name: string;
  manufacturer?: string;
  size?: number;
  miningPower?: number;
  resistance?: number;
  instability?: number;
  optimalRange?: number;
  maxRange?: number;
  throttleRate?: number;
  throttleMin?: number;
  heatOutput?: number;
  shatterDamage?: number;
  moduleSlots?: number;
}

interface ShipConfig {
  name: string;
  turrets: number;
  cargo: number;
  laserSize: number;
  supportsBagSwap?: boolean;
  cargoWithSwap?: number;
  fixedLaser?: boolean;
  fixedLaserName?: string;
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
  modules: (string | null)[];
}

const SHIP_CONFIGS: Record<string, ShipConfig> = {
  golem: {
    name: "Golem",
    turrets: 1,
    cargo: 16,
    laserSize: 1,
    fixedLaser: true,
    fixedLaserName: "Pitman",
  },
  prospector: {
    name: "Prospector",
    turrets: 1,
    cargo: 32,
    laserSize: 1,
    supportsBagSwap: true,
    cargoWithSwap: 48,
  },
  mole: {
    name: "MOLE",
    turrets: 3,
    cargo: 96,
    laserSize: 2,
  },
};

const CATEGORY_LABELS: Record<string, string> = {
  active: "Activo",
  passive: "Pasivo",
  gadget: "Gadget",
};

const CATEGORY_COLORS: Record<string, string> = {
  active: "text-amber-400",
  passive: "text-cyan-400",
  gadget: "text-fuchsia-400",
};

export default function MiningLoadoutCalculator() {
  const [ship, setShip] = useState<string>("prospector");
  const [lasers, setLasers] = useState<Laser[]>([]);
  const [loading, setLoading] = useState(true);
  const [turrets, setTurrets] = useState<TurretLoadout[]>([]);
  const [useMoleBags, setUseMoleBags] = useState(false);

  const shipConfig = SHIP_CONFIGS[ship];
  const typedModules = miningModules as Module[];
  const allModules = typedModules; // All modules available for universal slots

  // Effective cargo considering bag swap
  const effectiveCargo = useMemo(() => {
    if (ship === "prospector" && useMoleBags && shipConfig.cargoWithSwap) {
      return shipConfig.cargoWithSwap;
    }
    return shipConfig.cargo;
  }, [ship, useMoleBags, shipConfig]);

  // Filter lasers by ship's laser size
  const availableLasers = useMemo(() => {
    return lasers.filter((l) => !l.size || l.size <= shipConfig.laserSize);
  }, [lasers, shipConfig.laserSize]);

  // Get the number of module slots for a given turret's laser
  const getModuleSlots = (turret: TurretLoadout): number => {
    if (!turret.laserId) return 0;
    const laser = lasers.find((l) => l.id === turret.laserId);
    return laser?.moduleSlots ?? 0;
  };

  useEffect(() => {
    const fetchLasers = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/mining/lasers");
        if (res.ok) {
          const data = await res.json();
          setLasers(data.data || []);
        }
      } catch (error) {
        console.error("Error fetching lasers:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchLasers();
  }, []);

  // Initialize turrets when ship changes
  useEffect(() => {
    const fixedLaser =
      shipConfig.fixedLaser && lasers.length > 0
        ? lasers.find((l) => l.name === shipConfig.fixedLaserName)
        : null;

    const newTurrets: TurretLoadout[] = [];
    for (let i = 0; i < shipConfig.turrets; i++) {
      const laserSlots = fixedLaser?.moduleSlots ?? 0;
      newTurrets.push({
        laserId: fixedLaser ? fixedLaser.id : null,
        modules: Array(laserSlots).fill(null),
      });
    }
    setTurrets(newTurrets);
    setUseMoleBags(false);
  }, [ship, lasers, shipConfig.turrets, shipConfig.fixedLaser, shipConfig.fixedLaserName]);

  // When laser changes on a turret, resize modules array
  const updateLaser = (turretIdx: number, laserId: string | null) => {
    const updated = [...turrets];
    const laser = laserId ? lasers.find((l) => l.id === laserId) : null;
    const newSlotCount = laser?.moduleSlots ?? 0;
    const currentModules = updated[turretIdx].modules;

    // Preserve existing modules up to new count, fill rest with null
    const newModules: (string | null)[] = [];
    for (let i = 0; i < newSlotCount; i++) {
      newModules.push(i < currentModules.length ? currentModules[i] : null);
    }

    updated[turretIdx] = { laserId, modules: newModules };
    setTurrets(updated);
  };

  const updateModule = (
    turretIdx: number,
    slotIdx: number,
    value: string | null
  ) => {
    const updated = [...turrets];
    updated[turretIdx].modules[slotIdx] = value;
    setTurrets(updated);
  };

  const calculateStats = () => {
    let totalMiningPower = 0;
    let totalResistance = 0;
    let totalInstability = 0;
    let optimalRange = 0;
    let maxRange = 0;
    let optChargeRate = 0;
    let optChargeWindow = 0;
    let inertFilter = 0;
    let overchargeRate = 0;
    let extractPower = 0;
    let heatOutput = 0;
    let shatterDamage = 0;

    turrets.forEach((turret) => {
      const laser = lasers.find((l) => l.id === turret.laserId);
      if (laser) {
        totalMiningPower += laser.miningPower || 0;
        totalResistance += laser.resistance || 0;
        totalInstability += laser.instability || 0;
        optimalRange = Math.max(optimalRange, laser.optimalRange || 0);
        maxRange = Math.max(maxRange, laser.maxRange || 0);
        heatOutput += laser.heatOutput || 0;
        shatterDamage += laser.shatterDamage || 0;
      }

      turret.modules.forEach((moduleId) => {
        if (!moduleId) return;
        const mod = typedModules.find((m) => m.id === moduleId);
        if (mod) {
          totalMiningPower += mod.effects.laserPower;
          totalResistance += mod.effects.resistance;
          totalInstability += mod.effects.instability;
          optChargeRate += mod.effects.optChargeRate;
          optChargeWindow += mod.effects.optChargeWindow;
          inertFilter += mod.effects.inertFilter;
          overchargeRate += mod.effects.overchargeRate;
          extractPower += mod.effects.extractPower;
        }
      });
    });

    return {
      miningPower: Math.round(totalMiningPower * 100) / 100,
      resistance: Math.round(totalResistance * 100) / 100,
      instability: Math.round(totalInstability * 100) / 100,
      optimalRange: Math.round(optimalRange * 100) / 100,
      maxRange: Math.round(maxRange * 100) / 100,
      optChargeRate: Math.round(optChargeRate * 100) / 100,
      optChargeWindow: Math.round(optChargeWindow * 100) / 100,
      inertFilter: Math.round(inertFilter * 100) / 100,
      overchargeRate: Math.round(overchargeRate * 100) / 100,
      extractPower: Math.round(extractPower * 100) / 100,
      heatOutput: Math.round(heatOutput * 100) / 100,
      shatterDamage: Math.round(shatterDamage * 100) / 100,
    };
  };

  const stats = calculateStats();

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Ship Selection + Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-4">
          <label className="text-xs tracking-[0.1em] uppercase text-zinc-400 block mb-2">
            Nave Minera
          </label>
          <select
            value={ship}
            onChange={(e) => setShip(e.target.value)}
            className="w-full bg-zinc-800/50 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500/50"
          >
            {Object.entries(SHIP_CONFIGS).map(([key, cfg]) => (
              <option key={key} value={key}>
                {cfg.name} — {cfg.cargo} SCU · {cfg.turrets} torreta
                {cfg.turrets > 1 ? "s" : ""} · Láser S{cfg.laserSize}
              </option>
            ))}
          </select>
        </div>

        <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-4 space-y-2">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-[10px] tracking-[0.1em] uppercase text-zinc-500">
                Torretas
              </div>
              <div className="text-lg font-mono font-bold text-amber-400">
                {shipConfig.turrets}
              </div>
            </div>
            <div>
              <div className="text-[10px] tracking-[0.1em] uppercase text-zinc-500">
                Cargo
              </div>
              <div className="text-lg font-mono font-bold text-cyan-400">
                {effectiveCargo}{" "}
                <span className="text-xs text-zinc-600">SCU</span>
              </div>
            </div>
            <div>
              <div className="text-[10px] tracking-[0.1em] uppercase text-zinc-500">
                Láser
              </div>
              <div className="text-lg font-mono font-bold text-emerald-400">
                S{shipConfig.laserSize}
              </div>
            </div>
          </div>

          {/* Prospector Bag Swap Toggle */}
          {shipConfig.supportsBagSwap && (
            <div className="pt-2 border-t border-zinc-800/40">
              <label className="flex items-center gap-3 cursor-pointer group">
                <div
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    useMoleBags ? "bg-amber-500/60" : "bg-zinc-700"
                  }`}
                  onClick={() => setUseMoleBags(!useMoleBags)}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      useMoleBags ? "translate-x-5" : "translate-x-0.5"
                    }`}
                  />
                </div>
                <div onClick={() => setUseMoleBags(!useMoleBags)}>
                  <span className="text-xs text-zinc-300 group-hover:text-zinc-100 transition-colors">
                    Sacos MOLE en Prospector
                  </span>
                  <span className="text-[10px] text-zinc-600 block">
                    Reemplaza 4 sacos de 8 SCU por 4 de 12 SCU → 48 SCU total
                  </span>
                </div>
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Turret Loadouts */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-4 h-4 border-2 border-zinc-800 border-t-amber-500 rounded-full animate-spin mr-3" />
          <span className="text-xs text-zinc-500 font-mono uppercase tracking-widest">
            Cargando lásers...
          </span>
        </div>
      ) : (
        <div className="space-y-4">
          {turrets.map((turret, turretIdx) => {
            const selectedLaser = lasers.find(
              (l) => l.id === turret.laserId
            );
            const slotCount = selectedLaser?.moduleSlots ?? 0;
            return (
              <div
                key={turretIdx}
                className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-4 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div className="text-xs font-mono text-amber-400 uppercase tracking-wider">
                    Torreta {turretIdx + 1}
                  </div>
                  {selectedLaser && (
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-zinc-600">
                        {selectedLaser.manufacturer}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
                        {slotCount} slot{slotCount !== 1 ? "s" : ""}
                      </span>
                    </div>
                  )}
                </div>

                {/* Laser selector */}
                <div>
                  <label className="text-xs tracking-[0.1em] uppercase text-zinc-400 block mb-2">
                    Láser
                    {shipConfig.fixedLaser && (
                      <span className="ml-2 text-[10px] text-zinc-600 normal-case tracking-normal">
                        (fijo — no intercambiable en esta nave)
                      </span>
                    )}
                  </label>
                  {shipConfig.fixedLaser ? (
                    <div className="w-full bg-zinc-800/30 border border-zinc-700/50 rounded px-3 py-2 text-sm text-zinc-400 cursor-not-allowed">
                      {selectedLaser
                        ? `${selectedLaser.name} (S${selectedLaser.size}) — Power: ${selectedLaser.miningPower}`
                        : shipConfig.fixedLaserName || "Láser fijo"}
                    </div>
                  ) : (
                    <select
                      value={turret.laserId || ""}
                      onChange={(e) =>
                        updateLaser(
                          turretIdx,
                          e.target.value || null
                        )
                      }
                      className="w-full bg-zinc-800/50 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500/50"
                    >
                      <option value="">-- Seleccionar Láser --</option>
                      {availableLasers.map((laser) => (
                        <option key={laser.id} value={laser.id}>
                          {laser.name} (S{laser.size}) — Power:{" "}
                          {laser.miningPower} · {laser.moduleSlots ?? 0} slot
                          {(laser.moduleSlots ?? 0) !== 1 ? "s" : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Laser quick stats */}
                {selectedLaser && (
                  <div className="grid grid-cols-4 gap-2 bg-zinc-950/40 rounded p-2">
                    <MiniStat
                      label="Power"
                      value={selectedLaser.miningPower || 0}
                    />
                    <MiniStat
                      label="Resist."
                      value={selectedLaser.resistance || 0}
                    />
                    <MiniStat
                      label="Instab."
                      value={selectedLaser.instability || 0}
                      negative
                    />
                    <MiniStat
                      label="Calor"
                      value={selectedLaser.heatOutput || 0}
                      negative
                    />
                  </div>
                )}

                {/* Universal Module Slots (count depends on selected laser) */}
                {slotCount > 0 && (
                  <div>
                    <label className="text-xs tracking-[0.1em] uppercase text-zinc-400 block mb-2">
                      Módulos ({slotCount} disponible
                      {slotCount > 1 ? "s" : ""})
                    </label>
                    <div
                      className={`grid gap-2 ${
                        slotCount === 1
                          ? "grid-cols-1"
                          : slotCount === 2
                            ? "grid-cols-2"
                            : "grid-cols-3"
                      }`}
                    >
                      {turret.modules.map((moduleId, slotIdx) => {
                        const selectedMod = moduleId
                          ? typedModules.find((m) => m.id === moduleId)
                          : null;
                        return (
                          <div key={slotIdx} className="space-y-1">
                            <div className="text-[10px] text-zinc-600 font-mono">
                              Slot {slotIdx + 1}
                              {selectedMod && (
                                <span
                                  className={`ml-1 ${CATEGORY_COLORS[selectedMod.category]}`}
                                >
                                  [{CATEGORY_LABELS[selectedMod.category]}]
                                </span>
                              )}
                            </div>
                            <select
                              value={moduleId || ""}
                              onChange={(e) =>
                                updateModule(
                                  turretIdx,
                                  slotIdx,
                                  e.target.value || null
                                )
                              }
                              className="w-full bg-zinc-800/50 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-amber-500/50"
                            >
                              <option value="">-- Vacío --</option>
                              <optgroup label="Activos">
                                {allModules
                                  .filter((m) => m.category === "active")
                                  .map((mod) => (
                                    <option key={mod.id} value={mod.id}>
                                      {mod.name}
                                    </option>
                                  ))}
                              </optgroup>
                              <optgroup label="Pasivos">
                                {allModules
                                  .filter((m) => m.category === "passive")
                                  .map((mod) => (
                                    <option key={mod.id} value={mod.id}>
                                      {mod.name}
                                    </option>
                                  ))}
                              </optgroup>
                              <optgroup label="Gadgets">
                                {allModules
                                  .filter((m) => m.category === "gadget")
                                  .map((mod) => (
                                    <option key={mod.id} value={mod.id}>
                                      {mod.name}
                                    </option>
                                  ))}
                              </optgroup>
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {slotCount === 0 && turret.laserId && (
                  <div className="text-xs text-zinc-600 italic py-1">
                    Este láser no tiene slots para módulos
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Stats Summary */}
      <div>
        <h3 className="text-xs tracking-[0.1em] uppercase text-zinc-500 mb-3 font-mono">
          Estadísticas Combinadas
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <StatBox label="Mining Power" value={stats.miningPower} unit="" />
          <StatBox
            label="Resistencia"
            value={stats.resistance}
            unit=""
            color={stats.resistance > 0 ? "emerald" : "zinc"}
          />
          <StatBox
            label="Inestabilidad"
            value={stats.instability}
            unit=""
            color={stats.instability <= 0 ? "emerald" : "red"}
          />
          <StatBox label="Rango Óptimo" value={stats.optimalRange} unit="m" />
          <StatBox label="Rango Máximo" value={stats.maxRange} unit="m" />
          <StatBox
            label="Opt Charge Rate"
            value={stats.optChargeRate}
            unit="%"
            color={stats.optChargeRate > 0 ? "emerald" : "zinc"}
          />
          <StatBox
            label="Opt Charge Window"
            value={stats.optChargeWindow}
            unit="%"
          />
          <StatBox
            label="Inert Filter"
            value={stats.inertFilter}
            unit="%"
            color={stats.inertFilter < 0 ? "emerald" : "zinc"}
          />
          <StatBox
            label="Overcharge Rate"
            value={stats.overchargeRate}
            unit="%"
          />
          <StatBox
            label="Extract Power"
            value={stats.extractPower}
            unit="%"
            color={stats.extractPower > 0 ? "emerald" : "zinc"}
          />
          <StatBox
            label="Calor Generado"
            value={stats.heatOutput}
            unit=""
            color={stats.heatOutput > 0 ? "red" : "zinc"}
          />
          <StatBox
            label="Shatter Damage"
            value={stats.shatterDamage}
            unit=""
          />
        </div>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  negative = false,
}: {
  label: string;
  value: number;
  negative?: boolean;
}) {
  return (
    <div className="text-center">
      <div className="text-[9px] tracking-wider uppercase text-zinc-600">
        {label}
      </div>
      <div
        className={`text-sm font-mono font-semibold ${
          negative ? "text-red-400/80" : "text-emerald-400/80"
        }`}
      >
        {value}
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
        {unit && <span className="text-xs text-zinc-600">{unit}</span>}
      </div>
    </div>
  );
}
