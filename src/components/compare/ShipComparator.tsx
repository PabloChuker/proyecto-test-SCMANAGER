"use client";
// =============================================================================
// SC LABS — Ship Comparator v4 (compact, 2026-04-17)
//
// Reescrito por pedido de Pablo: antes eran 15 paneles draggable con 40+ bar
// charts y una tabla gigante. Ahora cada nave ocupa UNA columna con modelo 3D
// arriba y una única tarjeta densa con toda la data del DPS calculator
// organizada por secciones. Debajo, solo 2 gráficos comparativos: radar
// overview y flight-dynamics 3D. Sin drag, sin scroll infinito, sin ruido.
// =============================================================================

import { useState, useEffect, useCallback } from "react";
import { ShipSearchDropdown } from "./ShipSearchDropdown";
import { RadarChart } from "@/components/shared/charts/RadarChart";
import { ShipFlightDynamicsComparator } from "@/components/shared/flight-dynamics/ShipFlightDynamicsComparator";
import { ShipViewer3D } from "@/components/shared/flight-dynamics/ShipViewer3D";
import { shipGlbCandidates } from "@/lib/shipGlb";

const SHIP_COLORS = ["#CDEB63", "#EB7163", "#639CEA"];

interface ShipData {
  id: string;
  reference: string;
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

// ─── Stat definitions (el orden es el que se renderiza en cada tarjeta) ──────
// higherIsBetter=false → gana el valor más bajo distinto de 0 (signatures,
// spool time, dimensiones). El resto: gana el más alto.
type StatFn = (s: ShipData) => number;
interface StatDef {
  label: string;
  unit?: string;
  get: StatFn;
  higherIsBetter?: boolean;
  fmt?: (v: number) => string;
}

const fmtInt    = (v: number) => Math.round(v).toLocaleString();
const fmtDec1   = (v: number) => v.toFixed(1);
const fmtDec0   = (v: number) => Math.round(v).toLocaleString();
const fmtKilo   = (v: number) => v >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toFixed(0);
const fmtMega   = (v: number) => v >= 1_000_000 ? (v / 1_000_000).toFixed(1) + "M" : v >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toFixed(0);

interface Section {
  title: string;
  accent: string;
  rows: StatDef[];
}

const SECTIONS: Section[] = [
  {
    title: "Combat",
    accent: "#ef4444",
    rows: [
      { label: "Total DPS",      get: (s) => s.computed.totalDps,         fmt: fmtDec1 },
      { label: "Alpha Damage",   get: (s) => s.computed.totalAlpha,       fmt: fmtDec1 },
      { label: "Missile Damage", get: (s) => s.computed.totalMissileDmg,  fmt: fmtInt },
      { label: "Weapon HP",      get: (s) => s.computed.weaponCount,      fmt: (v) => v.toString() },
      { label: "Missile Racks",  get: (s) => s.computed.missileCount,     fmt: (v) => v.toString() },
    ],
  },
  {
    title: "Defense",
    accent: "#3b82f6",
    rows: [
      { label: "Shield HP",        get: (s) => s.computed.totalShieldHp,    fmt: fmtInt },
      { label: "Shield Regen/s",   get: (s) => s.computed.totalShieldRegen, fmt: fmtDec1 },
      { label: "Hull HP",          get: (s) => s.ship?.hullHp || 0,          fmt: fmtInt },
      { label: "Mass",  unit: "kg", get: (s) => s.ship?.mass || 0,           fmt: fmtMega, higherIsBetter: false },
    ],
  },
  {
    title: "Speed",
    accent: "#22c55e",
    rows: [
      { label: "SCM",         unit: "m/s", get: (s) => s.ship?.scmSpeed || 0,           fmt: fmtInt },
      { label: "Afterburner", unit: "m/s", get: (s) => s.ship?.afterburnerSpeed || 0,   fmt: fmtInt },
      { label: "Boost Fwd",   unit: "m/s", get: (s) => s.ship?.boostSpeedForward || 0,  fmt: fmtInt },
      { label: "Boost Bwd",   unit: "m/s", get: (s) => s.ship?.boostSpeedBackward || 0, fmt: fmtInt },
    ],
  },
  {
    title: "Agility",
    accent: "#f59e0b",
    rows: [
      { label: "Pitch",         unit: "°/s", get: (s) => s.ship?.pitchRate || 0,   fmt: fmtDec1 },
      { label: "Yaw",           unit: "°/s", get: (s) => s.ship?.yawRate || 0,     fmt: fmtDec1 },
      { label: "Roll",          unit: "°/s", get: (s) => s.ship?.rollRate || 0,    fmt: fmtDec1 },
      { label: "Boost Pitch",   unit: "°/s", get: (s) => s.ship?.boostedPitch || 0, fmt: fmtDec1 },
      { label: "Boost Yaw",     unit: "°/s", get: (s) => s.ship?.boostedYaw || 0,   fmt: fmtDec1 },
      { label: "Boost Roll",    unit: "°/s", get: (s) => s.ship?.boostedRoll || 0,  fmt: fmtDec1 },
    ],
  },
  {
    title: "Propulsion",
    accent: "#06b6d4",
    rows: [
      { label: "Accel Fwd",   unit: "m/s²", get: (s) => s.ship?.maxAccelMain || 0,   fmt: fmtDec1 },
      { label: "Accel Retro", unit: "m/s²", get: (s) => s.ship?.maxAccelRetro || 0,  fmt: fmtDec1 },
      { label: "Accel Up",    unit: "m/s²", get: (s) => s.ship?.accelUp || 0,        fmt: fmtDec1 },
      { label: "Accel Down",  unit: "m/s²", get: (s) => s.ship?.accelDown || 0,      fmt: fmtDec1 },
      { label: "Strafe",      unit: "m/s²", get: (s) => s.ship?.accelStrafe || 0,    fmt: fmtDec1 },
    ],
  },
  {
    title: "Power & Quantum",
    accent: "#a855f7",
    rows: [
      { label: "Power Output",  get: (s) => s.computed.totalPowerOutput,   fmt: fmtKilo },
      { label: "Cooling",       get: (s) => s.computed.totalCooling,       fmt: fmtKilo },
      { label: "QT Speed",     unit: "m/s", get: (s) => s.computed.quantumSpeed || 0, fmt: fmtMega },
      { label: "QT Range",     unit: "km",  get: (s) => s.ship?.quantumRange || 0,    fmt: fmtInt },
      { label: "QT Spool",     unit: "s",   get: (s) => s.computed.quantumSpool || 0, fmt: fmtDec1, higherIsBetter: false },
      { label: "H2 Fuel",       get: (s) => s.ship?.hydrogenFuelCap || 0,   fmt: fmtKilo },
      { label: "QT Fuel",       get: (s) => s.ship?.quantumFuelCap || 0,    fmt: fmtInt },
    ],
  },
  {
    title: "Crew & Cargo",
    accent: "#94a3b8",
    rows: [
      { label: "Max Crew",         get: (s) => s.ship?.maxCrew || 0,       fmt: (v) => v.toString() },
      { label: "Cargo", unit: "SCU", get: (s) => s.ship?.cargo || 0,        fmt: fmtInt },
      { label: "Length", unit: "m", get: (s) => s.ship?.lengthMeters || 0,  fmt: fmtDec1, higherIsBetter: false },
      { label: "Beam",   unit: "m", get: (s) => s.ship?.beamMeters || 0,    fmt: fmtDec1, higherIsBetter: false },
      { label: "Height", unit: "m", get: (s) => s.ship?.heightMeters || 0,  fmt: fmtDec1, higherIsBetter: false },
    ],
  },
  {
    title: "Signatures",
    accent: "#71717a",
    rows: [
      { label: "EM", get: (s) => s.ship?.baseEmSignature || 0, fmt: fmtDec0, higherIsBetter: false },
      { label: "IR", get: (s) => s.ship?.baseIrSignature || 0, fmt: fmtDec0, higherIsBetter: false },
      { label: "CS", get: (s) => s.ship?.baseCsSignature || 0, fmt: fmtDec0, higherIsBetter: false },
    ],
  },
];

// ─── Best-value detection across all active ships for one stat ───────────────
// Devuelve el id de la nave "ganadora" para ese stat (o null si hay empate /
// valores en cero). Se usa para resaltar la celda ganadora con el color de la
// nave.
function bestShipIdForStat(stat: StatDef, ships: ShipData[]): string | null {
  const vals = ships.map((s) => stat.get(s));
  const nonZero = vals.filter((v) => v > 0);
  if (nonZero.length < 2) return null;
  const higherBetter = stat.higherIsBetter !== false;
  const target = higherBetter ? Math.max(...vals) : Math.min(...nonZero);
  const winners = ships.filter((_, i) => vals[i] === target);
  if (winners.length !== 1) return null;   // empate → nadie gana
  return winners[0].id;
}

export function ShipComparator() {
  const [slots, setSlots] = useState<(SelectedShip | null)[]>([null, null, null]);
  const [shipData, setShipData] = useState<(ShipData | null)[]>([null, null, null]);
  const [loading, setLoading] = useState(false);
  // Sitio.12 (2026-06-12): el deep-link ?ids= era write-only (se escribía la URL
  // pero nunca se leía al montar) → los links compartidos abrían vacíos. Este
  // flag evita que el sync de URL pise ?ids= antes de terminar la hidratación.
  const [hydrated, setHydrated] = useState(false);

  // Sitio.12 (2026-06-12): hidratar slots desde ?ids= en el mount (máx. 3).
  useEffect(() => {
    const ids = (new URLSearchParams(window.location.search).get("ids") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3);
    if (ids.length === 0) {
      setHydrated(true);
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/ships/compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        });
        if (!res.ok) throw new Error("Failed to hydrate from URL");
        const json = await res.json();
        const data: ShipData[] = json.data || [];
        const next: (SelectedShip | null)[] = [null, null, null];
        ids.forEach((id, i) => {
          const d = data.find((x) => x.id === id);
          if (d) {
            next[i] = {
              id: d.id,
              name: d.name,
              manufacturer: d.manufacturer,
              ship: d.ship
                ? { role: d.ship.role, cargo: d.ship.cargo, scmSpeed: d.ship.scmSpeed }
                : null,
            };
          }
        });
        setSlots(next); // dispara fetchComparison vía el effect existente
      } catch (err) {
        console.error("Compare hydrate error:", err);
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  const selectedIds = slots.filter(Boolean).map((s) => s!.id);

  const fetchComparison = useCallback(async () => {
    const ids = slots.filter(Boolean).map((s) => s!.id);
    if (ids.length < 1) {
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

  // Sync URL with selected ids for sharing
  useEffect(() => {
    if (!hydrated) return; // Sitio.12 (2026-06-12): no borrar ?ids= antes de leerlo
    const ids = slots.filter(Boolean).map((s) => s!.id);
    const url = new URL(window.location.href);
    if (ids.length > 0) {
      url.searchParams.set("ids", ids.join(","));
    } else {
      url.searchParams.delete("ids");
    }
    window.history.replaceState({}, "", url.toString());
  }, [slots, hydrated]);

  function setSlot(index: number, ship: SelectedShip | null) {
    setSlots((prev) => {
      const next = [...prev];
      next[index] = ship;
      return next;
    });
  }

  const activeShips = shipData.filter(Boolean) as ShipData[];

  return (
    <div className="space-y-5">
      {/* ── Slot selectors ─────────────────────────────────────────────── */}
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

      {/* ── Empty / loading states ────────────────────────────────────── */}
      {selectedIds.length === 0 && (
        <div className="text-center py-16 text-sm text-zinc-600">
          Selecciona hasta 3 naves para comparar
        </div>
      )}

      {loading && selectedIds.length > 0 && (
        <div className="text-center py-16 text-sm text-zinc-500 animate-pulse">
          Cargando datos…
        </div>
      )}

      {/* ── Per-ship detail columns: 3D model + single dense stat card ─── */}
      {!loading && activeShips.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => {
            const ship = shipData[i];
            const slot = slots[i];
            if (!slot || !ship) {
              return <div key={i} className="hidden md:block" />;
            }
            const color = SHIP_COLORS[i];
            return (
              <ShipDetailColumn
                key={i}
                ship={ship}
                color={color}
                allShips={activeShips}
              />
            );
          })}
        </div>
      )}

      {/* ── Comparative charts: radar overview + flight dynamics 3D ──── */}
      {/* Móvil: 1 col (stack). Tablet (md+): 2 cols. Desktop (lg+) intacto.
          Antes saltaba `grid-cols-1 lg:grid-cols-2` → en md (768-1023px)
          quedaba 1 col gigante. Ahora md ya muestra los 2 charts lado a lado. */}
      {!loading && activeShips.length >= 2 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Radar overview */}
          <div className="bg-zinc-900/30 border border-zinc-800/40 rounded p-4">
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-[11px] tracking-[0.14em] uppercase text-zinc-500 font-medium">Overview</h3>
              <div className="flex-1 h-px bg-zinc-800/60" />
            </div>
            <div className="flex justify-center">
              <RadarChart
                size={320}
                axes={[
                  { key: "speed",   label: "Speed",   max: Math.max(1, ...activeShips.map((s) => s.ship?.scmSpeed || 0)) },
                  { key: "dps",     label: "DPS",     max: Math.max(1, ...activeShips.map((s) => s.computed.totalDps)) },
                  { key: "shield",  label: "Shields", max: Math.max(1, ...activeShips.map((s) => s.computed.totalShieldHp)) },
                  { key: "hull",    label: "Hull",    max: Math.max(1, ...activeShips.map((s) => s.ship?.hullHp || 0)) },
                  { key: "agility", label: "Agility", max: Math.max(1, ...activeShips.map((s) => (s.ship?.pitchRate || 0) + (s.ship?.yawRate || 0) + (s.ship?.rollRate || 0))) },
                  { key: "accel",   label: "Accel",   max: Math.max(1, ...activeShips.map((s) => s.ship?.maxAccelMain || 0)) },
                ]}
                datasets={activeShips.map((s) => {
                  const i = slots.findIndex((x) => x?.id === s.id);
                  return {
                    label: s.name,
                    color: SHIP_COLORS[i],
                    values: {
                      speed:   s.ship?.scmSpeed || 0,
                      dps:     s.computed.totalDps,
                      shield:  s.computed.totalShieldHp,
                      hull:    s.ship?.hullHp || 0,
                      agility: (s.ship?.pitchRate || 0) + (s.ship?.yawRate || 0) + (s.ship?.rollRate || 0),
                      accel:   s.ship?.maxAccelMain || 0,
                    },
                  };
                })}
              />
            </div>
          </div>

          {/* Flight dynamics 3D */}
          <div className="bg-zinc-900/30 border border-zinc-800/40 rounded p-4">
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-[11px] tracking-[0.14em] uppercase text-zinc-500 font-medium">Flight Dynamics 3D</h3>
              <div className="flex-1 h-px bg-zinc-800/60" />
            </div>
            <ShipFlightDynamicsComparator
              ships={activeShips.map((s) => {
                const i = slots.findIndex((x) => x?.id === s.id);
                return {
                  shipName:  s.name,
                  color:     SHIP_COLORS[i],
                  pitchRate: s.ship?.pitchRate,
                  yawRate:   s.ship?.yawRate,
                  rollRate:  s.ship?.rollRate,
                  glbUrl:    shipGlbCandidates(s.reference),
                };
              })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Per-ship column: 3D model + header + single dense stat card ─────────────
function ShipDetailColumn({ ship, color, allShips }: {
  ship: ShipData;
  color: string;
  allShips: ShipData[];
}) {
  return (
    <div className="flex flex-col gap-3">
      {/* 3D model */}
      <div
        className="relative rounded border overflow-hidden bg-zinc-950/80"
        style={{ borderColor: color + "40" }}
      >
        <div className="h-60">
          <ShipViewer3D
            glbUrl={shipGlbCandidates(ship.reference)}
            rotationAxis="free"
            animate
            shipColor={color}
            className="w-full h-full"
          />
        </div>
        {/* Accent line */}
        <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ backgroundColor: color }} />
      </div>

      {/* Header: name / manufacturer / role / price */}
      <div className="bg-zinc-900/50 border border-zinc-800/60 rounded px-3 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-medium text-zinc-100 truncate" style={{ color }}>
              {ship.name}
            </div>
            <div className="text-[10px] text-zinc-500 truncate">
              {ship.manufacturer}
              {ship.ship?.role ? ` · ${ship.ship.role}` : ""}
            </div>
          </div>
          {ship.msrpUsd != null && ship.msrpUsd > 0 && (
            <span className="text-[11px] font-mono shrink-0" style={{ color }}>
              ${ship.msrpUsd.toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {/* Single dense stat card (all DPS calculator data, sectioned) */}
      <div className="bg-zinc-900/30 border border-zinc-800/40 rounded overflow-hidden">
        {SECTIONS.map((section) => (
          <div key={section.title} className="border-b border-zinc-800/40 last:border-b-0">
            <div className="flex items-center gap-2 px-3 pt-2 pb-1">
              <div className="w-1 h-3 rounded-sm" style={{ backgroundColor: section.accent }} />
              <span className="text-[9px] font-mono tracking-[0.14em] uppercase text-zinc-500">
                {section.title}
              </span>
            </div>
            <div className="px-3 pb-2 space-y-[3px]">
              {section.rows.map((row) => {
                const val = row.get(ship);
                const winnerId = bestShipIdForStat(row, allShips);
                const isBest = winnerId === ship.id;
                const display = val === 0 ? "—" : (row.fmt ? row.fmt(val) : val.toString());
                return (
                  <div key={row.label} className="flex items-baseline justify-between gap-2 text-[10.5px] leading-tight">
                    <span className="text-zinc-500 truncate">
                      {row.label}
                      {row.unit && <span className="text-zinc-700 ml-1">({row.unit})</span>}
                    </span>
                    <span
                      className="font-mono tabular-nums shrink-0"
                      style={{ color: isBest ? color : val === 0 ? "#52525b" : "#d4d4d8", fontWeight: isBest ? 600 : 400 }}
                    >
                      {display}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
