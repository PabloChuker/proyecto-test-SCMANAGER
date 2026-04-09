"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { ShipDetailResponseV2, FlatHardpoint } from "@/types/ships";

// ── Helpers ──

function fmt(n: number | null | undefined, decimals = 0): string {
  if (n == null) return "—";
  return decimals > 0 ? n.toFixed(decimals) : Math.round(n).toLocaleString();
}

function fmtSpeed(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${Math.round(n)} m/s`;
}

function fmtDeg(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n.toFixed(1)}°/s`;
}

function fmtScu(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k SCU`;
  return `${Math.round(n)} SCU`;
}

const MFR_PREFIXES = [
  "Aegis", "RSI", "Drake", "MISC", "Anvil", "Origin", "Crusader", "Argo",
  "Aopoa", "Consolidated Outland", "Esperia", "Gatac", "Greycat", "Kruger",
  "Musashi Industrial", "Tumbril", "Banu", "Vanduul", "Roberts Space Industries",
  "Crusader Industries", "Musashi", "CO",
];

function getShipImageUrl(name: string, manufacturer?: string | null): string {
  let n = name || "";
  if (manufacturer) {
    const m = manufacturer.trim();
    if (n.startsWith(m + " ")) n = n.slice(m.length + 1);
  }
  for (const m of MFR_PREFIXES) {
    if (n.startsWith(m + " ")) { n = n.slice(m.length + 1); break; }
  }
  const slug = n.toLowerCase().replace(/[''()]/g, "").replace(/\s+/g, "-").replace(/[^a-z0-9._-]/g, "-").replace(/-+/g, "-").replace(/-$/, "");
  return `/ships/${slug}.webp`;
}

function getWeaponSummary(hardpoints: FlatHardpoint[]) {
  const weapons = hardpoints.filter(h =>
    ["WEAPON", "TURRET"].includes(h.category) && (h.equippedItem || (h.childWeapons?.length ?? 0) > 0)
  );
  let pilotDps = 0;
  let crewDps = 0;
  let missileCount = 0;

  for (const hp of hardpoints) {
    if (hp.category === "MISSILE_RACK") {
      missileCount += hp.childWeapons?.length || 1;
      continue;
    }
    if (!["WEAPON", "TURRET"].includes(hp.category)) continue;

    const isPilot = !hp.isManned || hp.hardpointName.toLowerCase().includes("pilot");
    let hpDps = 0;

    if ((hp.childWeapons?.length ?? 0) > 0) {
      for (const cw of hp.childWeapons!) {
        hpDps += cw.equippedItem?.componentStats?.dps ?? 0;
      }
    } else if (hp.equippedItem?.componentStats?.dps) {
      hpDps = hp.equippedItem.componentStats.dps;
    }

    if (isPilot) pilotDps += hpDps;
    else crewDps += hpDps;
  }

  return { weaponCount: weapons.length, pilotDps, crewDps, missileCount };
}

// ── Stat Row ──

function StatRow({ label, value, unit, color }: { label: string; value: string; unit?: string; color?: string }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-zinc-800/30 last:border-0">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className={`text-xs font-mono ${color ?? "text-zinc-200"}`}>
        {value}
        {unit && <span className="text-zinc-500 ml-0.5 text-[10px]">{unit}</span>}
      </span>
    </div>
  );
}

// ── Section Panel ──

function Section({ title, icon, children, color }: { title: string; icon: string; children: React.ReactNode; color?: string }) {
  return (
    <div className="rounded border border-zinc-800/60 bg-zinc-900/50 overflow-hidden">
      <div className={`px-3 py-1.5 border-b border-zinc-800/40 flex items-center gap-2 ${color ?? "bg-zinc-800/30"}`}>
        <span className="text-xs">{icon}</span>
        <span className="text-[11px] text-zinc-400 uppercase tracking-wider font-medium">{title}</span>
      </div>
      <div className="px-3 py-2">
        {children}
      </div>
    </div>
  );
}

// ── Main Component ──

interface ShipSpecSheetProps {
  shipId: string;
  onShipLoaded?: (shipName: string, reference: string, manufacturer: string | null) => void;
}

export default function ShipSpecSheet({ shipId, onShipLoaded }: ShipSpecSheetProps) {
  const [data, setData] = useState<ShipDetailResponseV2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setImgError(false);
    fetch(`/api/ships/${encodeURIComponent(shipId)}`)
      .then(r => r.json())
      .then((d: ShipDetailResponseV2) => {
        setData(d);
        if (d?.data) {
          onShipLoaded?.(d.data.name, d.data.reference, d.data.manufacturer);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [shipId, onShipLoaded]);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-[350px] bg-zinc-800/40 rounded-lg" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <div key={i} className="h-48 bg-zinc-800/30 rounded" />)}
        </div>
      </div>
    );
  }

  if (!data?.data) {
    return (
      <div className="text-center py-20">
        <p className="text-zinc-500">No se encontro la nave.</p>
        <Link href="/ships" className="text-cyan-400 hover:text-cyan-300 text-sm mt-2 inline-block">← Volver a naves</Link>
      </div>
    );
  }

  const { data: ship, flatHardpoints: rawHardpoints, computed: rawComputed } = data as any;
  const flatHardpoints: FlatHardpoint[] = (rawHardpoints ?? []).map((h: any) => ({
    ...h,
    childWeapons: h.childWeapons ?? h.children ?? [],
  }));
  const computed = rawComputed ?? {
    totalDps: 0, totalAlphaDamage: 0, totalShieldHp: 0, totalShieldRegen: 0,
    totalPowerDraw: 0, totalPowerOutput: 0, totalCooling: 0, totalThermalOutput: 0,
    powerBalance: 0, thermalBalance: 0, totalEmSignature: 0, totalIrSignature: 0,
    hardpointSummary: { weapons: 0, missiles: 0, shields: 0, coolers: 0, powerPlants: 0, quantumDrives: 0 },
  };
  const s = ship.ship;
  const imgUrl = getShipImageUrl(ship.name, ship.manufacturer);
  const weaponInfo = getWeaponSummary(flatHardpoints);

  // Group hardpoints for component list
  const equippedWeapons = flatHardpoints.filter(h => ["WEAPON", "TURRET"].includes(h.category));
  const equippedShields = flatHardpoints.filter(h => h.category === "SHIELD" && h.equippedItem);
  const equippedPower = flatHardpoints.filter(h => h.category === "POWER_PLANT" && h.equippedItem);
  const equippedCoolers = flatHardpoints.filter(h => h.category === "COOLER" && h.equippedItem);
  const equippedQD = flatHardpoints.filter(h => h.category === "QUANTUM_DRIVE" && h.equippedItem);
  const equippedMissiles = flatHardpoints.filter(h => h.category === "MISSILE_RACK");

  const sizeLabel = ship.type === "Vehicle" ? "Vehiculo" : `Tamaño ${s?.cargo != null && s.cargo > 500 ? "Grande" : s?.cargo != null && s.cargo > 50 ? "Mediano" : "Chico"}`;
  const roleLabel = s?.role ?? s?.focus ?? s?.career ?? "Multi-role";

  return (
    <div className="space-y-6">
      {/* ── Hero image ── */}
      <div className="relative h-[320px] md:h-[400px] rounded-lg overflow-hidden border border-zinc-800/50">
        {!imgError ? (
          <img
            src={imgUrl}
            alt={ship.name}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
            <span className="text-6xl opacity-20">🚀</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />

        {/* Ship info overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-6">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[11px] text-cyan-400/80 uppercase tracking-[0.2em] mb-1">
                {ship.manufacturer}
              </p>
              <h1 className="text-3xl md:text-4xl font-bold text-zinc-100 tracking-wide">
                {ship.localizedName || ship.name}
              </h1>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-xs text-zinc-400 bg-zinc-800/60 backdrop-blur-sm px-2.5 py-1 rounded">
                  {roleLabel}
                </span>
                <span className="text-xs text-zinc-500 bg-zinc-800/60 backdrop-blur-sm px-2.5 py-1 rounded">
                  {sizeLabel}
                </span>
                <span className="text-[10px] text-zinc-600 font-mono bg-zinc-800/60 backdrop-blur-sm px-2 py-1 rounded">
                  v{ship.gameVersion}
                </span>
              </div>
            </div>
            <Link
              href={`/dps?ship=${ship.reference}`}
              className="flex items-center gap-2 px-4 py-2 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs hover:bg-cyan-500/20 transition-colors backdrop-blur-sm"
            >
              ⚙ Abrir en DPS Calculator
            </Link>
          </div>
        </div>
      </div>

      {/* ── Quick stats bar ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        <QuickStat label="SCM" value={fmt(s?.maxSpeed)} unit="m/s" />
        <QuickStat label="Afterburner" value={fmt(s?.afterburnerSpeed)} unit="m/s" />
        <QuickStat label="Crew" value={fmt(s?.maxCrew)} />
        <QuickStat label="Cargo" value={fmtScu(s?.cargo)} />
        <QuickStat label="DPS Piloto" value={fmt(weaponInfo.pilotDps)} color="text-red-400" />
        <QuickStat label="Shield HP" value={fmt(computed.totalShieldHp)} color="text-blue-400" />
        <QuickStat label="Hull HP" value={fmt(null)} color="text-amber-400" />
        <QuickStat label="Masa" value={fmt(null)} unit="kg" />
      </div>

      {/* ── Stats grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

        {/* Hull */}
        <Section title="Hull" icon="🛸" color="bg-zinc-800/40">
          <StatRow label="Dimensiones (vuelo)" value={s?.lengthMeters != null ? `${fmt(s.lengthMeters, 1)}L x ${fmt(s?.beamMeters, 1)}W x ${fmt(s?.heightMeters, 1)}H` : "—"} unit="m" />
          <StatRow label="Tripulacion max." value={fmt(s?.maxCrew)} />
          <StatRow label="Rol" value={roleLabel} />
          <StatRow label="Foco" value={s?.focus ?? "—"} />
          <StatRow label="Version" value={ship.gameVersion} />
        </Section>

        {/* Weaponry */}
        <Section title="Armamento" icon="🔫" color="bg-red-900/20">
          <StatRow label="DPS Piloto" value={fmt(weaponInfo.pilotDps)} color="text-red-400" />
          {weaponInfo.crewDps > 0 && (
            <StatRow label="DPS Tripulacion" value={fmt(weaponInfo.crewDps)} color="text-orange-400" />
          )}
          <StatRow label="DPS Total" value={fmt(computed.totalDps)} color="text-red-300" />
          <StatRow label="Alpha Total" value={fmt(computed.totalAlphaDamage)} color="text-red-300" />
          <StatRow label="Misiles" value={weaponInfo.missileCount > 0 ? `${weaponInfo.missileCount}` : "—"} />
          <StatRow label="Hardpoints armas" value={`${computed.hardpointSummary.weapons}`} />
        </Section>

        {/* Defense */}
        <Section title="Defensa" icon="🛡" color="bg-blue-900/20">
          <StatRow label="Shield HP Total" value={fmt(computed.totalShieldHp)} color="text-blue-400" />
          <StatRow label="Shield Regen" value={fmt(computed.totalShieldRegen)} unit="hp/s" color="text-blue-300" />
          <StatRow label="Shields" value={`${computed.hardpointSummary.shields}`} />
          {equippedShields.length > 0 && equippedShields[0].equippedItem && (
            <StatRow label="Modelo" value={equippedShields[0].equippedItem.name} color="text-zinc-300" />
          )}
        </Section>

        {/* Flight Performance */}
        <Section title="Rendimiento de Vuelo" icon="✈" color="bg-cyan-900/20">
          <StatRow label="SCM" value={fmtSpeed(s?.maxSpeed)} color="text-cyan-400" />
          <StatRow label="Afterburner" value={fmtSpeed(s?.afterburnerSpeed)} color="text-cyan-300" />
          <StatRow label="Pitch" value={fmtDeg(s?.pitchRate)} />
          <StatRow label="Yaw" value={fmtDeg(s?.yawRate)} />
          <StatRow label="Roll" value={fmtDeg(s?.rollRate)} />
        </Section>

        {/* Cargo */}
        <Section title="Capacidad de Carga" icon="📦" color="bg-emerald-900/20">
          <StatRow label="Cargo Grid" value={fmtScu(s?.cargo)} color="text-emerald-400" />
        </Section>

        {/* Fuel */}
        <Section title="Combustible" icon="⛽" color="bg-amber-900/20">
          <StatRow label="Hidrogeno" value={s?.hydrogenFuelCap != null ? fmt(s.hydrogenFuelCap, 0) : "—"} unit="L" />
          <StatRow label="Quantum" value={s?.quantumFuelCap != null ? fmt(s.quantumFuelCap, 2) : "—"} unit="L" />
        </Section>

        {/* Power */}
        <Section title="Energia" icon="⚡" color="bg-green-900/20">
          <StatRow label="Generacion" value={fmt(computed.totalPowerOutput)} unit="pwr" color="text-green-400" />
          <StatRow label="Consumo" value={fmt(computed.totalPowerDraw)} unit="pwr" />
          <StatRow label="Balance" value={fmt(computed.powerBalance)} color={computed.powerBalance >= 0 ? "text-green-400" : "text-red-400"} />
          <StatRow label="Power Plants" value={`${computed.hardpointSummary.powerPlants}`} />
          {equippedPower.length > 0 && equippedPower[0].equippedItem && (
            <StatRow label="Modelo" value={equippedPower[0].equippedItem.name} color="text-zinc-300" />
          )}
        </Section>

        {/* Thermal */}
        <Section title="Refrigeracion" icon="❄" color="bg-sky-900/20">
          <StatRow label="Cooling" value={fmt(computed.totalCooling)} unit="rate" color="text-sky-400" />
          <StatRow label="Output Termico" value={fmt(computed.totalThermalOutput)} />
          <StatRow label="Balance" value={fmt(computed.thermalBalance)} color={computed.thermalBalance >= 0 ? "text-sky-400" : "text-red-400"} />
          <StatRow label="Coolers" value={`${computed.hardpointSummary.coolers}`} />
          {equippedCoolers.length > 0 && equippedCoolers[0].equippedItem && (
            <StatRow label="Modelo" value={equippedCoolers[0].equippedItem.name} color="text-zinc-300" />
          )}
        </Section>
      </div>

      {/* ── Equipment list ── */}
      <div className="space-y-4">
        <h2 className="text-xs text-zinc-500 uppercase tracking-wider">Equipamiento por defecto</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">

          {/* Weapons */}
          {equippedWeapons.length > 0 && (
            <EquipmentSection title="Armas" icon="🔫" items={equippedWeapons.map(hp => {
              if ((hp.childWeapons?.length ?? 0) > 0) {
                return hp.childWeapons!.map(cw => ({
                  name: cw.equippedItem?.name ?? "Vacio",
                  size: cw.equippedItem?.size ?? cw.maxSize,
                  detail: cw.equippedItem?.componentStats?.dps != null ? `${fmt(cw.equippedItem.componentStats.dps)} DPS` : null,
                }));
              }
              return [{
                name: hp.equippedItem?.name ?? "Vacio",
                size: hp.equippedItem?.size ?? hp.maxSize,
                detail: hp.equippedItem?.componentStats?.dps != null ? `${fmt(hp.equippedItem.componentStats.dps)} DPS` : null,
              }];
            }).flat()} />
          )}

          {/* Missiles */}
          {equippedMissiles.length > 0 && (
            <EquipmentSection title="Misiles" icon="🚀" items={equippedMissiles.map(hp => ({
              name: hp.equippedItem?.name ?? `Rack S${hp.maxSize}`,
              size: hp.maxSize,
              detail: (hp.childWeapons?.length ?? 0) > 0 ? `${hp.childWeapons!.length} misiles` : null,
            }))} />
          )}

          {/* Shields */}
          {equippedShields.length > 0 && (
            <EquipmentSection title="Escudos" icon="🛡" items={equippedShields.map(hp => ({
              name: hp.equippedItem?.name ?? "Vacio",
              size: hp.equippedItem?.size ?? hp.maxSize,
              detail: hp.equippedItem?.componentStats?.shieldHp != null ? `${fmt(hp.equippedItem.componentStats.shieldHp)} HP` : null,
            }))} />
          )}

          {/* Power Plants */}
          {equippedPower.length > 0 && (
            <EquipmentSection title="Power Plants" icon="⚡" items={equippedPower.map(hp => ({
              name: hp.equippedItem?.name ?? "Vacio",
              size: hp.equippedItem?.size ?? hp.maxSize,
              detail: hp.equippedItem?.componentStats?.powerOutput != null ? `${fmt(hp.equippedItem.componentStats.powerOutput)} pwr` : null,
            }))} />
          )}

          {/* Coolers */}
          {equippedCoolers.length > 0 && (
            <EquipmentSection title="Coolers" icon="❄" items={equippedCoolers.map(hp => ({
              name: hp.equippedItem?.name ?? "Vacio",
              size: hp.equippedItem?.size ?? hp.maxSize,
              detail: hp.equippedItem?.componentStats?.coolingRate != null ? `${fmt(hp.equippedItem.componentStats.coolingRate)} rate` : null,
            }))} />
          )}

          {/* Quantum Drive */}
          {equippedQD.length > 0 && (
            <EquipmentSection title="Quantum Drive" icon="🌀" items={equippedQD.map(hp => ({
              name: hp.equippedItem?.name ?? "Vacio",
              size: hp.equippedItem?.size ?? hp.maxSize,
              detail: hp.equippedItem?.componentStats?.quantumSpeed != null ? `${fmt(hp.equippedItem.componentStats.quantumSpeed)} m/s` : null,
            }))} />
          )}
        </div>
      </div>

    </div>
  );
}

// ── Sub-components ──

function QuickStat({ label, value, unit, color }: { label: string; value: string; unit?: string; color?: string }) {
  return (
    <div className="text-center py-2.5 px-2 rounded border border-zinc-800/50 bg-zinc-900/40">
      <div className="text-[10px] text-zinc-600 uppercase tracking-wider">{label}</div>
      <div className={`text-sm font-mono mt-0.5 ${color ?? "text-zinc-200"}`}>
        {value}
        {unit && <span className="text-[10px] text-zinc-500 ml-0.5">{unit}</span>}
      </div>
    </div>
  );
}

function EquipmentSection({ title, icon, items }: { title: string; icon: string; items: { name: string; size: number | null; detail: string | null }[] }) {
  return (
    <div className="rounded border border-zinc-800/50 bg-zinc-900/40 overflow-hidden">
      <div className="px-3 py-1.5 bg-zinc-800/30 border-b border-zinc-800/40 flex items-center gap-2">
        <span className="text-xs">{icon}</span>
        <span className="text-[11px] text-zinc-400 uppercase tracking-wider">{title}</span>
        <span className="text-[10px] text-zinc-600 ml-auto">{items.length}x</span>
      </div>
      <div className="px-3 py-2 space-y-1">
        {items.map((item, i) => (
          <div key={i} className="flex items-center justify-between py-0.5">
            <div className="flex items-center gap-2">
              {item.size != null && (
                <span className="text-[9px] font-mono text-zinc-600 bg-zinc-800/60 w-5 h-5 flex items-center justify-center rounded">
                  S{item.size}
                </span>
              )}
              <span className="text-xs text-zinc-300 truncate max-w-[160px]">{item.name}</span>
            </div>
            {item.detail && (
              <span className="text-[10px] font-mono text-zinc-500">{item.detail}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
