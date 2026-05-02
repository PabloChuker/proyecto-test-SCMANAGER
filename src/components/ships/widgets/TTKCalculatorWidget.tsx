"use client";

// =============================================================================
// SC LABS — TTK Calculator Widget (Fase W.16, 2026-05-02)
//
// Widget que cruza el loadout actual (attacker) con un ship objetivo (target)
// y devuelve cuánto tarda el atacante en bajar shield + casco. Usa
// src/lib/ttkCompute.ts que aplica VerseTools §4 (resistances/absorptions
// con interpolación por pips) + §6 (armor deflection + damage modifier).
//
// Flujo:
//   1. User selecciona target del dropdown (autocomplete con /api/ships?search).
//   2. Fetch a /api/ttk-target?id=... → trae shield resists, hull HP, deflect.
//   3. Recopila weapons del attacker (loadout actual) con sus alpha breakdown
//      + sustainedDps por arma.
//   4. computeTtk → ttkShieldSec, ttkHullSec, ttkTotalSec, perWeapon.
//   5. Render: tiempos + breakdown por arma (tabla compacta).
// =============================================================================

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useLoadoutStore } from "@/store/useLoadoutStore";
import { computeTtk, type AttackerWeapon, type TargetShipDef } from "@/lib/ttkCompute";

interface ShipListItem {
  id: string;
  name: string;
  className?: string;
}

const fmtSec = (s: number | null): string => {
  if (s == null || !Number.isFinite(s)) return "—";
  if (s < 1) return s.toFixed(2) + "s";
  if (s < 10) return s.toFixed(1) + "s";
  if (s < 60) return Math.round(s) + "s";
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}m ${sec}s`;
};

const fmtNum = (n: number): string => {
  if (n >= 10000) return (n / 1000).toFixed(1) + "k";
  if (n >= 1000) return (n / 1000).toFixed(2) + "k";
  return Math.round(n).toString();
};

export const TTKCalculatorContent = memo(function TTKCalculatorContent() {
  const shipInfo = useLoadoutStore(s => s.shipInfo);

  // Fase W.16b (2026-05-02): suscribir a `hardpoints` y `overrides` por
  // referencia ESTABLE (no recomputar arrays nuevos dentro del selector).
  // El bug de W.11 (selector que crea un objeto nuevo cada llamada) volvió
  // a romper /loadout — Chrome mata el tab por el infinite re-render.
  // Solución: leer las refs estables, computar `attackerWeapons` con useMemo
  // con esas refs como deps. Zustand compara por === los selectors → solo
  // retriggea cuando hardpoints/overrides cambian de identidad real.
  const hardpoints = useLoadoutStore(s => s.hardpoints);
  const overrides = useLoadoutStore(s => s.overrides);

  const attackerWeapons = useMemo<AttackerWeapon[]>(() => {
    const result: AttackerWeapon[] = [];
    for (const hp of hardpoints) {
      const cat = hp.resolvedCategory;
      if (cat !== "WEAPON" && cat !== "TURRET") continue;
      const item = overrides.has(hp.id) ? overrides.get(hp.id) : hp.defaultItem;
      const cs: any = item?.componentStats;
      if (!cs) continue;
      const alphaP = Number(cs.alphaPhysical ?? 0);
      const alphaE = Number(cs.alphaEnergy ?? 0);
      const alphaD = Number(cs.alphaDistortion ?? 0);
      const alphaSum = alphaP + alphaE + alphaD;
      const alphaTotal = alphaSum > 0 ? alphaSum : Number(cs.alphaDamage ?? 0);
      result.push({
        hardpointName: hp.hardpointName,
        weaponName: item?.name ?? hp.hardpointName,
        size: typeof cs.size === "number" ? cs.size : (item as any)?.size ?? null,
        alphaPhysical: alphaP,
        alphaEnergy: alphaE,
        alphaDistortion: alphaD,
        alphaTotal,
        sustainedDps: Number(cs.sustainedDps ?? cs.dps ?? 0),
      });
    }
    return result;
  }, [hardpoints, overrides]);
  // useShallow no se necesita porque hardpoints es una array que solo cambia
  // de identidad cuando loadShip rebuild. overrides es un Map que cambia con
  // cada toggle. Ambos triggers son los correctos.
  void useShallow;

  const [targetId, setTargetId] = useState<string>("");
  const [targetSearch, setTargetSearch] = useState<string>("");
  const [targetDef, setTargetDef] = useState<TargetShipDef | null>(null);
  const [shipList, setShipList] = useState<ShipListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [shieldPipFraction, setShieldPipFraction] = useState(1);

  // Cargar lista de ships (una vez). El endpoint /api/ships acepta search.
  useEffect(() => {
    fetch("/api/ships?limit=300")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j) return;
        const arr = Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : [];
        setShipList(
          arr.map((x: any) => ({
            id: String(x.class_name ?? x.id ?? ""),
            name: String(x.name ?? x.class_name ?? ""),
            className: x.class_name,
          })),
        );
      })
      .catch(() => {});
  }, []);

  // Fetch target def cuando cambia targetId.
  useEffect(() => {
    if (!targetId) {
      setTargetDef(null);
      return;
    }
    setLoading(true);
    fetch("/api/ttk-target?id=" + encodeURIComponent(targetId))
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && !j.error) setTargetDef(j as TargetShipDef);
        else setTargetDef(null);
      })
      .catch(() => setTargetDef(null))
      .finally(() => setLoading(false));
  }, [targetId]);

  const ttk = useMemo(() => {
    if (!targetDef || attackerWeapons.length === 0) return null;
    return computeTtk(attackerWeapons, targetDef, shieldPipFraction);
  }, [attackerWeapons, targetDef, shieldPipFraction]);

  const filteredShips = useMemo(() => {
    if (!targetSearch.trim()) return shipList.slice(0, 50);
    const q = targetSearch.toLowerCase();
    return shipList
      .filter((s) => s.name.toLowerCase().includes(q) || (s.className ?? "").toLowerCase().includes(q))
      .slice(0, 50);
  }, [shipList, targetSearch]);

  const handleSelect = useCallback((id: string, name: string) => {
    setTargetId(id);
    setTargetSearch(name);
  }, []);

  return (
    <div className="bg-zinc-900/80 border border-zinc-800/60 p-3 space-y-2">
      {/* Header con dropdown de target */}
      <div className="space-y-1">
        <div className="text-[9px] font-mono text-zinc-500 tracking-[0.2em] uppercase">
          Atacante: {shipInfo?.name ?? "—"}
          <span className="text-zinc-600 ml-2">
            · {attackerWeapons.length} armas
          </span>
        </div>
        <div className="relative">
          <input
            type="text"
            placeholder="Buscar nave objetivo…"
            value={targetSearch}
            onChange={(e) => {
              setTargetSearch(e.target.value);
              setTargetId(""); // limpiar selección al editar
            }}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-[11px] font-mono text-zinc-100 outline-none focus:border-amber-500/60"
          />
          {targetSearch && !targetId && filteredShips.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-0.5 max-h-60 overflow-auto bg-zinc-950 border border-zinc-800 rounded-sm shadow-xl z-20">
              {filteredShips.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleSelect(s.id, s.name)}
                  className="w-full text-left px-2 py-1 text-[10px] font-mono text-zinc-300 hover:bg-zinc-800/60 hover:text-zinc-100 cursor-pointer"
                >
                  {s.name}
                  {s.className && s.className !== s.name && (
                    <span className="text-zinc-600 ml-2">{s.className}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        {targetDef && (
          <div className="flex items-center justify-between text-[8px] font-mono text-zinc-600 px-1">
            <span>
              Shield {fmtNum(targetDef.shieldHp)} hp · Hull {fmtNum(targetDef.hullHp)} hp
            </span>
            <span>
              Deflect P{Math.round(targetDef.deflectionPhysical ?? 0)} / E{Math.round(targetDef.deflectionEnergy ?? 0)}
            </span>
          </div>
        )}
      </div>

      {/* Slider del shield pip ratio del target */}
      {targetDef && (
        <div className="flex items-center gap-2 px-1">
          <span className="text-[8px] font-mono text-zinc-600 tracking-wider uppercase whitespace-nowrap">
            Target shield pips
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(shieldPipFraction * 100)}
            onChange={(e) => setShieldPipFraction(Number(e.target.value) / 100)}
            className="flex-1"
          />
          <span className="text-[9px] font-mono tabular-nums text-zinc-400 w-8 text-right">
            {Math.round(shieldPipFraction * 100)}%
          </span>
        </div>
      )}

      {/* Resultado TTK */}
      {loading && !ttk && (
        <div className="text-[10px] font-mono text-zinc-600 italic px-1">cargando target…</div>
      )}
      {!loading && !targetId && (
        <div className="text-[10px] font-mono text-zinc-600 italic px-1">
          Seleccioná una nave objetivo para calcular el tiempo de matanza.
        </div>
      )}
      {ttk && (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-1">
            <TimeStat label="Shield" sec={ttk.ttkShieldSec} color="#3b82f6" />
            <TimeStat label="Hull" sec={ttk.ttkHullSec} color="#a3a3a3" />
            <TimeStat label="Total" sec={ttk.ttkTotalSec} color="#f59e0b" highlight />
          </div>
          <div className="grid grid-cols-3 gap-1 text-[8px] font-mono text-zinc-600 px-1">
            <span>Shield DPS efectivo: {fmtNum(ttk.shieldDpsTotal)}</span>
            <span>Bleed DPS al hull: {fmtNum(ttk.bleedDpsTotal)}</span>
            <span>Hull DPS (post-shield): {fmtNum(ttk.directDpsTotal)}</span>
          </div>

          {/* Per-weapon breakdown */}
          {ttk.perWeapon.length > 0 && (
            <div className="border-t border-zinc-800/60 pt-2">
              <div className="text-[8px] font-mono text-zinc-600 tracking-wider uppercase mb-1">
                Contribución por arma
              </div>
              <div className="space-y-0.5">
                {ttk.perWeapon.map((w) => {
                  const total = w.shieldDps + w.directDps;
                  return (
                    <div
                      key={w.hardpointName}
                      className="flex items-center justify-between gap-2 text-[10px] font-mono py-0.5 px-1 bg-zinc-950/40 rounded-sm"
                      title={`Shield ${fmtNum(w.shieldDps)} · Bleed ${fmtNum(w.bleedDps)} · Hull ${fmtNum(w.directDps)}`}
                    >
                      <span className="text-zinc-300 truncate">
                        {w.size != null ? `S${w.size} · ` : ""}{w.weaponName}
                      </span>
                      <span className="tabular-nums text-zinc-400">
                        {fmtNum(total)} dps
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="text-[7px] font-mono text-zinc-700 italic">
        Modelo VerseTools §4 + §6 (resists, absorptions, deflect, dmgMult).
        Ignora regen del shield mientras el atacante dispara.
      </div>
    </div>
  );
});

function TimeStat({
  label,
  sec,
  color,
  highlight,
}: {
  label: string;
  sec: number | null;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center py-2 rounded-sm"
      style={{
        backgroundColor: highlight ? `${color}14` : "#0c0c0d",
        border: `1px solid ${highlight ? color + "60" : "#27272a"}`,
      }}
    >
      <span className="text-[7px] font-mono tracking-wider uppercase text-zinc-500">{label}</span>
      <span className="text-base font-mono font-bold tabular-nums" style={{ color }}>
        {fmtSec(sec)}
      </span>
    </div>
  );
}
