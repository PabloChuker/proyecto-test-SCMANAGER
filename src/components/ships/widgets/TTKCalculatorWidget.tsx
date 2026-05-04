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

    // Empuja un weapon al resultado SI tiene alpha o sustainedDps. Filtra
    // ítems vacíos (slots sin equipar).
    const pushWeapon = (
      hpName: string,
      item: any,
      cs: any,
    ) => {
      if (!cs) return;
      const alphaP = Number(cs.alphaPhysical ?? 0);
      const alphaE = Number(cs.alphaEnergy ?? 0);
      const alphaD = Number(cs.alphaDistortion ?? 0);
      const alphaSum = alphaP + alphaE + alphaD;
      const alphaTotal = alphaSum > 0 ? alphaSum : Number(cs.alphaDamage ?? 0);
      const dps = Number(cs.sustainedDps ?? cs.dps ?? 0);
      if (alphaTotal <= 0 && dps <= 0) return; // gimbal vacío / item sin daño
      result.push({
        hardpointName: hpName,
        weaponName: item?.name ?? hpName,
        size:
          typeof cs.size === "number" ? cs.size : (item?.size ?? null),
        alphaPhysical: alphaP,
        alphaEnergy: alphaE,
        alphaDistortion: alphaD,
        alphaTotal,
        sustainedDps: dps,
      });
    };

    // Recorrer top-level + children. Las armas reales suelen ser children
    // de turrets / gimbals (ej: Revenant Gatling es child de VariPuck S4
    // Gimbal Mount en el Avenger Titan). El gimbal padre no tiene alpha,
    // entonces si solo iteramos top-level vemos 0 armas. Reproducimos la
    // misma lógica que computeStats: pop the children when present.
    for (const hp of hardpoints) {
      const cat = hp.resolvedCategory;
      if (cat !== "WEAPON" && cat !== "TURRET") continue;
      const parentItem = overrides.has(hp.id)
        ? overrides.get(hp.id)
        : hp.defaultItem;
      const parentCs: any = parentItem?.componentStats;

      // Caso 1: tiene children → sumar children con sus propios items.
      if (Array.isArray(hp.children) && hp.children.length > 0) {
        for (const child of hp.children) {
          const childItem = overrides.has(child.id)
            ? overrides.get(child.id)
            : child.equippedItem;
          const cs: any = (childItem as any)?.componentStats;
          pushWeapon(child.hardpointName, childItem, cs);
        }
        continue;
      }

      // Caso 2: weapon directo en el slot (sin gimbal/turret intermedio).
      pushWeapon(hp.hardpointName, parentItem, parentCs);
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
  // W.16e (2026-05-04): bump limit 300→500 (máximo del endpoint) — la BD
  // ya tiene 344 ships deduped después de los lotes Z y Garnok PTU shells.
  // Con 300 cortaba en RSI Constellation Taurus dejando afuera Polaris,
  // Scorpius, Galaxy, Mantis, Perseus, Zeus Mk II, Tumbril vehicles, Vanduul.
  useEffect(() => {
    fetch("/api/ships?limit=500")
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
      <div className="space-y-1.5">
        <div className="text-[11px] font-mono text-zinc-300 tracking-[0.05em]">
          <span className="text-zinc-500 tracking-[0.15em] uppercase mr-1.5">Atacante</span>
          {shipInfo?.name ?? "—"}
          <span
            className={
              "ml-2 font-bold " +
              (attackerWeapons.length === 0 ? "text-red-400" : "text-amber-400")
            }
          >
            · {attackerWeapons.length} arma{attackerWeapons.length === 1 ? "" : "s"}
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
            className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-2.5 py-2 text-[12px] font-mono text-zinc-100 outline-none focus:border-amber-500/60"
          />
          {targetSearch && !targetId && filteredShips.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-0.5 max-h-60 overflow-auto bg-zinc-950 border border-zinc-800 rounded-sm shadow-xl z-20">
              {filteredShips.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleSelect(s.id, s.name)}
                  className="w-full text-left px-2.5 py-1.5 text-[11px] font-mono text-zinc-300 hover:bg-zinc-800/60 hover:text-zinc-100 cursor-pointer"
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
          <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 px-1 pt-1">
            <span>
              Shield <span className="text-blue-400 font-bold">{fmtNum(targetDef.shieldHp)}</span> hp
              <span className="mx-1.5 text-zinc-700">·</span>
              Hull <span className="text-zinc-200 font-bold">{fmtNum(targetDef.hullHp)}</span> hp
            </span>
            <span className="text-zinc-500">
              Deflect P{Math.round(targetDef.deflectionPhysical ?? 0)} / E{Math.round(targetDef.deflectionEnergy ?? 0)}
            </span>
          </div>
        )}
      </div>

      {/* Slider del shield pip ratio del target */}
      {targetDef && (
        <div className="flex items-center gap-2 px-1">
          <span className="text-[10px] font-mono text-zinc-400 tracking-wider uppercase whitespace-nowrap">
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
          <span className="text-[11px] font-mono font-bold tabular-nums text-amber-400 w-10 text-right">
            {Math.round(shieldPipFraction * 100)}%
          </span>
        </div>
      )}

      {/* Resultado TTK */}
      {loading && !ttk && (
        <div className="text-[11px] font-mono text-zinc-400 italic px-1 py-2">cargando target…</div>
      )}
      {!loading && !targetId && (
        <div className="text-[11px] font-mono text-zinc-400 italic px-1 py-2">
          Seleccioná una nave objetivo para calcular el tiempo de matanza.
        </div>
      )}
      {ttk && (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-1">
            <TimeStat label="Shield" sec={ttk.ttkShieldSec} color="#3b82f6" />
            <TimeStat
              label="Hull"
              sec={ttk.ttkHullSec}
              color={ttk.hullDiesDuringShield ? "#ef4444" : "#a3a3a3"}
              note={ttk.hullDiesDuringShield ? "via bleed" : undefined}
            />
            <TimeStat label="Total" sec={ttk.ttkTotalSec} color="#f59e0b" highlight />
          </div>
          {ttk.hullDiesDuringShield && (
            <div className="text-[10px] font-mono text-red-400/90 px-1">
              ⚠ El casco muere por bleed-through ANTES de que caiga el escudo
              ({fmtNum(ttk.bleedDpsTotal)} DPS de bleed × {Math.round(ttk.ttkHullSec ?? 0)}s ≥ {fmtNum(ttk.hullHp)} hull HP).
            </div>
          )}
          <div className="grid grid-cols-3 gap-1 text-[10px] font-mono text-zinc-400 px-1">
            <span>Shield DPS: <span className="text-blue-400 font-bold">{fmtNum(ttk.shieldDpsTotal)}</span></span>
            <span>Bleed DPS: <span className="text-zinc-200 font-bold">{fmtNum(ttk.bleedDpsTotal)}</span></span>
            <span>Hull DPS: <span className="text-amber-400 font-bold">{fmtNum(ttk.directDpsTotal)}</span></span>
          </div>

          {/* Per-weapon breakdown */}
          {ttk.perWeapon.length > 0 && (
            <div className="border-t border-zinc-800/60 pt-2">
              <div className="text-[10px] font-mono text-zinc-400 tracking-wider uppercase mb-1.5">
                Contribución por arma
              </div>
              <div className="space-y-1">
                {ttk.perWeapon.map((w) => {
                  const total = w.shieldDps + w.directDps;
                  return (
                    <div
                      key={w.hardpointName}
                      className="flex items-center justify-between gap-2 text-[11px] font-mono py-1 px-2 bg-zinc-950/40 rounded-sm"
                      title={`Shield ${fmtNum(w.shieldDps)} · Bleed ${fmtNum(w.bleedDps)} · Hull ${fmtNum(w.directDps)}`}
                    >
                      <span className="text-zinc-200 truncate">
                        {w.size != null ? `S${w.size} · ` : ""}{w.weaponName}
                      </span>
                      <span className="tabular-nums text-amber-400 font-bold">
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

      <div className="text-[11px] font-mono text-zinc-500 italic pt-1">
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
  note,
}: {
  label: string;
  sec: number | null;
  color: string;
  highlight?: boolean;
  note?: string;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center py-2.5 rounded-sm"
      style={{
        backgroundColor: highlight ? `${color}1f` : "#0c0c0d",
        border: `1px solid ${highlight ? color + "80" : "#27272a"}`,
      }}
    >
      <span className="text-[10px] font-mono font-semibold tracking-[0.12em] uppercase text-zinc-400">
        {label}
      </span>
      <span className="text-xl font-mono font-bold tabular-nums leading-tight" style={{ color }}>
        {fmtSec(sec)}
      </span>
      {note && (
        <span className="text-[11px] font-mono italic mt-0.5" style={{ color }}>
          {note}
        </span>
      )}
    </div>
  );
}
