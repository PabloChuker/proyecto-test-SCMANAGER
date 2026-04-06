// =============================================================================
// AL FILO — LoadoutBuilder v17 (Drag & Drop Desktop Layout)
//
// Layout panels are draggable — click and hold to rearrange columns.
// Order persists in localStorage per ship.
//
// Panels:
//   weapons    — Weapons + Missiles + Acceleration Radar
//   systems    — Shields, Power Plants, Coolers + Maneuverability Radar
//   modules    — QT Drives, Radar, Tractor/PDC/Utility + Combat Summary
//   power      — Power Management (Erkul grid) + Signatures + Balance
//   shipcard   — Ship Card (full Erkul stats) + DPS Panel
// =============================================================================

"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useLoadoutStore } from "@/store/useLoadoutStore";
import type { ResolvedHardpoint, EquippedItem } from "@/store/useLoadoutStore";
import { HardpointSlot, isUsefulSlot } from "./HardpointSlot";
import { ComponentPicker } from "./ComponentPicker";
import { PowerManagementPanel } from "./PowerManagementPanel";
import { ShipSelector } from "./ShipSelector";
import { fmtStat, fmtDps } from "./loadout-utils";

const WEAPON_GROUPS = new Set(["WEAPON", "TURRET"]);
const MISSILE_GROUPS = new Set(["MISSILE_RACK"]);

// ── Ship thumbnail URL helper ──
// Strips manufacturer prefix from ship name, converts to URL-safe slug
const MANUFACTURERS = [
  "Aegis", "RSI", "Drake", "MISC", "Anvil", "Origin", "Crusader", "Argo",
  "Aopoa", "Consolidated Outland", "Esperia", "Gatac", "Greycat", "Kruger",
  "Musashi Industrial", "Tumbril", "Banu", "Vanduul", "Roberts Space Industries",
  "Crusader Industries", "Musashi", "CO",
];
function getShipImageUrl(name: string, manufacturer?: string | null): string {
  let shipName = name || "";
  // Strip manufacturer prefix if present
  if (manufacturer) {
    const mfr = manufacturer.trim();
    if (shipName.startsWith(mfr + " ")) {
      shipName = shipName.slice(mfr.length + 1);
    }
  }
  // Also try known manufacturer prefixes
  for (const mfr of MANUFACTURERS) {
    if (shipName.startsWith(mfr + " ")) {
      shipName = shipName.slice(mfr.length + 1);
      break;
    }
  }
  // Slugify: lowercase, replace spaces/special chars with hyphens
  const slug = shipName
    .toLowerCase()
    .replace(/[''()]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/-$/, "");
  return `/ships/${slug}.jpg`;
}

const CAT_CONFIG: Record<string, { label: string; icon: string; accent: string }> = {
  SHIELD: { label: "SHIELDS", icon: "◇", accent: "#3b82f6" },
  POWER_PLANT: { label: "POWER PLANTS", icon: "⚡", accent: "#22c55e" },
  COOLER: { label: "COOLERS", icon: "❄", accent: "#06b6d4" },
  QUANTUM_DRIVE: { label: "QUANTUM DRIVES", icon: "◈", accent: "#a855f7" },
  RADAR: { label: "RADAR", icon: "◎", accent: "#22c55e" },
  MINING: { label: "MINING", icon: "⛏", accent: "#f472b6" },
  UTILITY: { label: "UTILITY", icon: "◎", accent: "#94a3b8" },
};

// ── Drag & Drop Widget System (individual blocks) ────────────────────────────
type WidgetId =
  | "weapons" | "missiles" | "accel-radar"
  | "shields" | "powerplants" | "coolers" | "maneuver-radar"
  | "quantum" | "radar" | "utility" | "combat-summary"
  | "power-grid" | "signatures" | "balance"
  | "ship-selector" | "ship-card" | "dps-detail";

// Default column assignments — 5 columns, exactly like the original layout
const DEFAULT_COLUMNS: WidgetId[][] = [
  ["weapons", "missiles", "accel-radar"],                          // Col 1
  ["shields", "powerplants", "coolers", "maneuver-radar"],         // Col 2
  ["quantum", "radar", "utility", "combat-summary"],               // Col 3
  ["power-grid", "signatures", "balance"],                         // Col 4
  ["ship-selector", "ship-card", "dps-detail"],                    // Col 5
];

const WIDGET_LABELS: Record<WidgetId, string> = {
  weapons: "WEAPONS", missiles: "MISSILES", "accel-radar": "ACCELERATION",
  shields: "SHIELDS", powerplants: "POWER PLANTS", coolers: "COOLERS", "maneuver-radar": "MANEUVERABILITY",
  quantum: "QT DRIVES", radar: "RADAR", utility: "UTILITY", "combat-summary": "COMBAT",
  "power-grid": "POWER GRID", signatures: "SIGNATURES", balance: "BALANCE",
  "ship-selector": "SEARCH", "ship-card": "SHIP CARD", "dps-detail": "DPS DETAIL",
};

const ALL_WIDGET_IDS = DEFAULT_COLUMNS.flat();

function loadColumns(): WidgetId[][] {
  try {
    const raw = localStorage.getItem("al-filo-widget-cols");
    if (raw) {
      const parsed = JSON.parse(raw) as WidgetId[][];
      const flat = parsed.flat();
      // Validate all widgets present
      if (ALL_WIDGET_IDS.every(w => flat.includes(w)) && parsed.length === 5) {
        return parsed;
      }
    }
  } catch {}
  return DEFAULT_COLUMNS.map(c => [...c]);
}

function saveColumns(cols: WidgetId[][]) {
  try { localStorage.setItem("al-filo-widget-cols", JSON.stringify(cols)); } catch {}
}

function DragWidget({ id, label, children, dragState, onDragStart, onDragOver, onDrop, onDragEnd }: {
  id: WidgetId;
  label: string;
  children: React.ReactNode;
  dragState: { dragging: WidgetId | null; over: WidgetId | null };
  onDragStart: (id: WidgetId) => void;
  onDragOver: (e: React.DragEvent, id: WidgetId) => void;
  onDrop: (e: React.DragEvent, id: WidgetId) => void;
  onDragEnd: () => void;
}) {
  const isDragging = dragState.dragging === id;
  const isOver = dragState.over === id && dragState.dragging !== id;

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", id);
        onDragStart(id);
      }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; onDragOver(e, id); }}
      onDrop={(e) => { e.preventDefault(); onDrop(e, id); }}
      onDragEnd={onDragEnd}
      className="relative transition-all duration-150"
      style={{
        ...(isDragging ? { opacity: 0.35 } : {}),
        ...(isOver ? { transform: "scale(0.97)" } : {}),
      }}
    >
      {/* Drop indicator glow */}
      {isOver && (
        <div className="absolute inset-0 border-2 border-yellow-500/60 rounded z-20 pointer-events-none animate-pulse" />
      )}
      {/* Drag handle */}
      <div className="flex items-center gap-1 px-1.5 py-[2px] bg-zinc-950/60 border border-zinc-800/30 border-b-0 cursor-grab active:cursor-grabbing select-none group rounded-t-sm">
        <span className="text-[7px] text-zinc-700 group-hover:text-yellow-600 transition-colors">⠿</span>
        <span className="text-[6px] font-mono text-zinc-700 tracking-[0.15em] group-hover:text-zinc-500 transition-colors uppercase">{label}</span>
        <span className="flex-1" />
        <span className="text-[7px] text-zinc-800 group-hover:text-zinc-600 transition-colors">⋮⋮</span>
      </div>
      {children}
    </div>
  );
}

// ── Widget renderer — maps a WidgetId to its JSX content ────────────────────
function renderWidget(
  wId: WidgetId,
  dp: { dragState: { dragging: WidgetId | null; over: WidgetId | null }; onDragStart: (id: WidgetId) => void; onDragOver: (e: React.DragEvent, id: WidgetId) => void; onDrop: (e: React.DragEvent, id: WidgetId) => void; onDragEnd: () => void },
  ctx: any,
): React.ReactNode {
  const { weaponHps, missileHps, useful, store, setPickerHp, si, shipInfo, stats, flightMode, setFlightMode, fmtNum, fmtDec, fmtMass, cmDecoyCount, cmNoiseCount } = ctx;
  const W = (children: React.ReactNode) => <DragWidget key={wId} id={wId} label={WIDGET_LABELS[wId]} {...dp}>{children}</DragWidget>;

  switch (wId) {
    case "weapons":
      return weaponHps.length > 0 ? W(<HpGroup title="WEAPONS" icon="▪" hps={weaponHps} store={store} onClickHp={setPickerHp} accent="#eab308" />) : null;
    case "missiles":
      return missileHps.length > 0 ? W(<HpGroup title="MISSILES & BOMBS" icon="◆" hps={missileHps} store={store} onClickHp={setPickerHp} accent="#f97316" />) : null;
    case "accel-radar":
      return W(<div className="bg-zinc-900/80 border border-zinc-800/60 p-3"><div className="text-[9px] font-mono text-zinc-500 tracking-[0.2em] uppercase mb-1 text-center">Acceleration Profile</div><div className="flex justify-center"><AccelerationRadar shipData={si} /></div></div>);
    case "shields": {
      const hps = useful.filter((hp: any) => hp.resolvedCategory === "SHIELD");
      return hps.length > 0 ? W(<HpGroup title={CAT_CONFIG.SHIELD.label} icon={CAT_CONFIG.SHIELD.icon} hps={hps} store={store} onClickHp={setPickerHp} accent={CAT_CONFIG.SHIELD.accent} />) : null;
    }
    case "powerplants": {
      const hps = useful.filter((hp: any) => hp.resolvedCategory === "POWER_PLANT");
      return hps.length > 0 ? W(<HpGroup title={CAT_CONFIG.POWER_PLANT.label} icon={CAT_CONFIG.POWER_PLANT.icon} hps={hps} store={store} onClickHp={setPickerHp} accent={CAT_CONFIG.POWER_PLANT.accent} />) : null;
    }
    case "coolers": {
      const hps = useful.filter((hp: any) => hp.resolvedCategory === "COOLER");
      return hps.length > 0 ? W(<HpGroup title={CAT_CONFIG.COOLER.label} icon={CAT_CONFIG.COOLER.icon} hps={hps} store={store} onClickHp={setPickerHp} accent={CAT_CONFIG.COOLER.accent} />) : null;
    }
    case "maneuver-radar":
      return W(<div className="bg-zinc-900/80 border border-zinc-800/60 p-3"><div className="text-[9px] font-mono text-zinc-500 tracking-[0.2em] uppercase mb-1 text-center">Maneuverability</div><div className="flex justify-center"><ManeuverabilityRadar shipInfo={shipInfo} /></div></div>);
    case "quantum": {
      const hps = useful.filter((hp: any) => hp.resolvedCategory === "QUANTUM_DRIVE");
      return hps.length > 0 ? W(<HpGroup title={CAT_CONFIG.QUANTUM_DRIVE.label} icon={CAT_CONFIG.QUANTUM_DRIVE.icon} hps={hps} store={store} onClickHp={setPickerHp} accent={CAT_CONFIG.QUANTUM_DRIVE.accent} />) : null;
    }
    case "radar": {
      const hps = useful.filter((hp: any) => hp.resolvedCategory === "RADAR");
      return hps.length > 0 ? W(<HpGroup title={CAT_CONFIG.RADAR.label} icon={CAT_CONFIG.RADAR.icon} hps={hps} store={store} onClickHp={setPickerHp} accent={CAT_CONFIG.RADAR.accent} />) : null;
    }
    case "utility": {
      const hps = useful.filter((hp: any) => hp.resolvedCategory === "UTILITY" || hp.resolvedCategory === "MINING");
      return hps.length > 0 ? W(<HpGroup title="UTILITY" icon="◎" hps={hps} store={store} onClickHp={setPickerHp} accent="#94a3b8" />) : null;
    }
    case "combat-summary":
      return W(
        <div className="bg-zinc-900/80 border border-zinc-800/60 p-2.5 space-y-1.5">
          <div className="text-[9px] font-mono text-zinc-500 tracking-[0.2em] uppercase border-b border-zinc-800/40 pb-1">Combat Summary</div>
          <div className="grid grid-cols-2 gap-2">
            <CompactStat label="DPS" value={fmtDps(stats.totalDps)} color={flightMode === "NAV" ? "#52525b" : "#ef4444"} locked={flightMode === "NAV"} />
            <CompactStat label="ALPHA" value={fmtStat(stats.totalAlpha)} color={flightMode === "NAV" ? "#52525b" : "#f97316"} locked={flightMode === "NAV"} />
            <CompactStat label="SHIELD HP" value={fmtStat(stats.shieldHp)} color="#3b82f6" />
            <CompactStat label="SH REGEN" value={fmtStat(stats.shieldRegen)} color={flightMode === "NAV" ? "#52525b" : "#60a5fa"} />
          </div>
        </div>
      );
    case "power-grid":
      return W(<PowerManagementPanel stats={stats} flightMode={flightMode} onModeChange={setFlightMode} />);
    case "signatures":
      return W(
        <div className="bg-zinc-900/80 border border-zinc-800/60 p-2.5 space-y-2">
          <div className="text-[9px] font-mono text-zinc-500 tracking-[0.2em] uppercase border-b border-zinc-800/40 pb-1">Signatures</div>
          <SignatureBar label="EM" value={stats.emSignature} max={20000} color="#a855f7" />
          <SignatureBar label="IR" value={stats.irSignature} max={20000} color="#f97316" />
        </div>
      );
    case "balance":
      return W(
        <div className="bg-zinc-900/80 border border-zinc-800/60 p-2.5 space-y-2">
          <BalanceRow label="POWER" value={stats.powerBalance} output={stats.powerOutput} draw={stats.powerDraw} posColor="#22c55e" negColor="#ef4444" />
          <BalanceRow label="THERMAL" value={stats.thermalBalance} output={stats.coolingRate} draw={stats.thermalOutput} posColor="#06b6d4" negColor="#ef4444" />
        </div>
      );
    case "ship-selector":
      return W(<ShipSelector currentRef={shipInfo.reference} />);
    case "ship-card":
      return W(
        <div className="bg-zinc-900/80 border border-zinc-800/60">
          <div className="relative bg-zinc-800/20 border-b border-zinc-800/50 overflow-hidden" style={{ height: 120 }}>
            <img src={getShipImageUrl(shipInfo.name, shipInfo.manufacturer)} alt={shipInfo.name} className="w-full h-full object-cover" onError={(e) => { const img = e.currentTarget; img.style.display = "none"; const fb = img.nextElementSibling as HTMLElement; if (fb) fb.style.display = "flex"; }} />
            <div className="absolute inset-0 items-center justify-center" style={{ display: "none" }}><span className="text-[10px] font-mono text-zinc-700 uppercase tracking-widest">Ship Preview</span></div>
          </div>
          <div className="p-2.5 space-y-2">
            <div>
              <div className="text-sm font-medium text-zinc-200 tracking-wide">{shipInfo.localizedName || shipInfo.name}</div>
              <div className="text-[9px] font-mono text-zinc-600 tracking-[0.12em]">{shipInfo.manufacturer || "Unknown"}</div>
            </div>
            <div className="space-y-0 text-[9px]">
              {si.role && <StatRow label="ROLE" value={si.role} />}
              {si.size && <StatRow label="SIZE" value={"S" + si.size} />}
              <StatRow label="CREW SIZE" value={fmtNum(si.crew)} />
              <StatRow label="SCM SPEED" value={fmtNum(si.scmSpeed)} unit="m/s" />
              <StatRow label="SCM BOOST FWD" value={fmtNum(si.boostSpeedForward)} unit="m/s" />
              <StatRow label="SCM BOOST BWD" value={fmtNum(si.boostSpeedBackward)} unit="m/s" />
              <StatRow label="NAV MAX SPEED" value={fmtNum(si.afterburnerSpeed)} unit="m/s" />
              <StatRow label="PITCH/YAW/ROLL" value={`${fmtNum(si.pitchRate)} / ${fmtNum(si.yawRate)} / ${fmtNum(si.rollRate)}`} unit="°/s" />
              {(si.boostedPitch || si.boostedYaw || si.boostedRoll) && <StatRow label="BOOSTED MAX" value={`${fmtNum(si.boostedPitch)} / ${fmtNum(si.boostedYaw)} / ${fmtNum(si.boostedRoll)}`} unit="°/s" />}
              <StatRow label="POWER CONSUMPTION" value={String(Math.round(stats.powerDraw))} />
              <StatRow label="CM DECOY/NOISE" value={`${cmDecoyCount} / ${cmNoiseCount}`} />
              <StatRow label="HP" value={si.hullHp ? fmtMass(si.hullHp) : (si.shieldHpTotal ? fmtStat(si.shieldHpTotal) : "—")} />
              <StatRow label="CARGO" value={si.cargo > 0 ? Math.round(si.cargo).toString() : "—"} unit="SCU" />
              {si.mass && si.mass > 0 && <StatRow label="MASS" value={fmtMass(si.mass)} unit="kg" />}
              <StatRow label="HYDROGEN CAPACITY" value={si.hydrogenCapacity ? fmtStat(si.hydrogenCapacity) : "—"} unit="SCU" />
              {si.quantumFuelCapacity && <StatRow label="QT FUEL CAPACITY" value={fmtDec(si.quantumFuelCapacity)} unit="SCU" />}
            </div>
          </div>
        </div>
      );
    case "dps-detail":
      return W(
        <div className="bg-zinc-900/80 border border-zinc-800/60 p-2.5 space-y-2.5">
          <div className="flex gap-1.5">
            <ModeBtn label="SCM" active={flightMode === "SCM"} c="#eab308" onClick={() => setFlightMode("SCM")} />
            <ModeBtn label="NAV" active={flightMode === "NAV"} c="#8b5cf6" onClick={() => setFlightMode("NAV")} />
          </div>
          <div className={flightMode === "NAV" ? "opacity-30" : ""}>
            <div className="text-[7px] font-mono text-zinc-600 tracking-wider uppercase mb-0.5">Sustained</div>
            <div className="flex items-baseline gap-3">
              <span className="text-[11px]" style={{ color: "#ef4444", opacity: 0.5 }}>⬡</span>
              <span className="text-2xl font-mono font-bold tabular-nums text-red-500">{fmtDps(stats.totalDps)}</span>
              <span className="text-[10px] font-mono text-zinc-500">dps</span>
              <span className="text-lg font-mono font-bold tabular-nums text-red-400/70">{fmtStat(stats.totalAlpha)}</span>
              <span className="text-[10px] font-mono text-zinc-500">alpha</span>
            </div>
          </div>
          <div className={flightMode === "NAV" ? "opacity-30" : ""}>
            <div className="flex items-baseline gap-3">
              <span className="text-[11px]" style={{ color: "#f97316", opacity: 0.5 }}>◆</span>
              <span className="text-lg font-mono font-bold tabular-nums text-orange-500">{stats.summary.missiles > 0 ? fmtStat(stats.totalAlpha) : "0"}</span>
              <span className="text-[10px] font-mono text-zinc-500">dmg</span>
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-3">
              <span className="text-[11px]" style={{ color: "#eab308", opacity: 0.5 }}>»</span>
              <span className="text-lg font-mono font-bold tabular-nums text-amber-500">{stats.shieldRegen > 0 ? (stats.shieldHp / Math.max(stats.shieldRegen, 0.01)).toFixed(1) : "—"}</span>
              <span className="text-[10px] font-mono text-zinc-500">s full regen time</span>
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-3">
              <span className="text-[11px]" style={{ color: "#3b82f6", opacity: 0.5 }}>◉</span>
              <span className="text-xl font-mono font-bold tabular-nums text-blue-500">{stats.shieldHp > 0 ? fmtStat(stats.shieldHp) : (si.shieldHpTotal ? fmtStat(si.shieldHpTotal) : "0")}</span>
              <span className="text-[10px] font-mono text-zinc-500">hp</span>
              {stats.shieldRegen > 0 && (<><span className="text-sm font-mono tabular-nums text-blue-400/70">{fmtStat(stats.shieldRegen)}</span><span className="text-[10px] font-mono text-zinc-500">hp/s</span></>)}
            </div>
          </div>
          {si.hullHp && si.hullHp > 0 && (
            <div><div className="flex items-baseline gap-3">
              <span className="text-[11px]" style={{ color: "#94a3b8", opacity: 0.5 }}>◑</span>
              <span className="text-lg font-mono font-bold tabular-nums text-zinc-400">{fmtStat(si.hullHp)}</span>
              <span className="text-[10px] font-mono text-zinc-500">hp</span>
            </div></div>
          )}
        </div>
      );
    default: return null;
  }
}

export default function LoadoutBuilder({ shipId = "titan" }: { shipId?: string }) {
  const searchParams = useSearchParams();
  const store = useLoadoutStore();
  const { shipInfo, isLoading, error, loadShip, getStats, getEffectiveItem, hasChanges, hardpoints, equipItem, clearSlot, resetAll, overrides, encodeBuild, toggleComponent, isComponentOn, flightMode, setFlightMode } = store;

  const [pickerHp, setPickerHp] = useState<ResolvedHardpoint | null>(null);
  const [copied, setCopied] = useState(false);
  const mountedRef = useRef(false);
  const overrideCountRef = useRef(0);

  // ── Drag & Drop state (widget-level, column-aware) ──
  const [columns, setColumns] = useState<WidgetId[][]>(DEFAULT_COLUMNS.map(c => [...c]));
  const [dragState, setDragState] = useState<{ dragging: WidgetId | null; over: WidgetId | null }>({ dragging: null, over: null });

  useEffect(() => { setColumns(loadColumns()); }, []);

  const handleDragStart = useCallback((id: WidgetId) => {
    setDragState({ dragging: id, over: null });
  }, []);

  const handleDragOver = useCallback((_e: React.DragEvent, id: WidgetId) => {
    setDragState(prev => prev.over === id ? prev : { ...prev, over: id });
  }, []);

  const handleDrop = useCallback((_e: React.DragEvent, targetId: WidgetId) => {
    setDragState(prev => {
      const sourceId = prev.dragging;
      if (sourceId && sourceId !== targetId) {
        setColumns(prevCols => {
          const next = prevCols.map(col => [...col]);
          // Find source and target positions
          let srcCol = -1, srcIdx = -1, tgtCol = -1, tgtIdx = -1;
          for (let c = 0; c < next.length; c++) {
            const si = next[c].indexOf(sourceId);
            if (si !== -1) { srcCol = c; srcIdx = si; }
            const ti = next[c].indexOf(targetId);
            if (ti !== -1) { tgtCol = c; tgtIdx = ti; }
          }
          if (srcCol === -1 || tgtCol === -1) return prevCols;
          // Remove from source
          next[srcCol].splice(srcIdx, 1);
          // Insert at target position
          const newTgtIdx = next[tgtCol].indexOf(targetId);
          if (newTgtIdx !== -1) {
            next[tgtCol].splice(newTgtIdx, 0, sourceId);
          } else {
            next[tgtCol].push(sourceId);
          }
          saveColumns(next);
          return next;
        });
      }
      return { dragging: null, over: null };
    });
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragState({ dragging: null, over: null });
  }, []);

  const handleResetLayout = useCallback(() => {
    const reset = DEFAULT_COLUMNS.map(c => [...c]);
    setColumns(reset);
    saveColumns(reset);
  }, []);

  useEffect(() => { if (mountedRef.current) return; mountedRef.current = true; const urlShip = searchParams.get("ship"); loadShip(urlShip || shipId, searchParams.get("build") || null); }, [shipId]);
  useEffect(() => { const c = overrides.size; if (!mountedRef.current) return; if (c === overrideCountRef.current && c === 0) return; overrideCountRef.current = c; const encoded = encodeBuild(); const url = new URL(window.location.href); if (encoded) url.searchParams.set("build", encoded); else url.searchParams.delete("build"); window.history.replaceState({}, "", url.toString()); }, [overrides, encodeBuild]);

  const stats = getStats();
  const useful = hardpoints.filter(hp => isUsefulSlot(hp, getEffectiveItem(hp.id)));
  const weaponHps = useful.filter(hp => WEAPON_GROUPS.has(hp.resolvedCategory));
  const missileHps = useful.filter(hp => MISSILE_GROUPS.has(hp.resolvedCategory));

  // Count countermeasures (info-only, not editable)
  const cmHps = hardpoints.filter(hp => hp.resolvedCategory === "COUNTERMEASURE");
  const cmDecoyCount = cmHps.filter(hp => hp.hardpointName.toLowerCase().includes("decoy")).length;
  const cmNoiseCount = cmHps.filter(hp => hp.hardpointName.toLowerCase().includes("noise")).length;

  const handleSelect = useCallback((item: EquippedItem) => { if (!pickerHp) return; equipItem(pickerHp.id, item); setPickerHp(null); }, [pickerHp, equipItem]);
  const handleClear = useCallback(() => { if (!pickerHp) return; clearSlot(pickerHp.id); setPickerHp(null); }, [pickerHp, clearSlot]);
  const handleCopyLink = useCallback(() => { navigator.clipboard.writeText(window.location.href).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }, []);

  if (isLoading) return (<div className="flex items-center justify-center py-20"><div className="w-4 h-4 border-2 border-zinc-800 border-t-yellow-500 rounded-full animate-spin mr-3" /><span className="text-xs text-zinc-600 font-mono uppercase tracking-widest">Loading...</span></div>);
  if (error) return <div className="border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-400 font-mono">{error}</div>;
  if (!shipInfo) return null;

  const si = shipInfo as any;
  const fmtNum = (v: number | null) => v != null && v > 0 ? Math.round(v).toString() : "—";
  const fmtDec = (v: number | null) => v != null && v > 0 ? v.toFixed(1) : "—";
  const fmtMass = (v: number | null) => { if (!v || v <= 0) return "—"; if (v >= 1000000) return (v / 1000000).toFixed(1) + "M"; if (v >= 1000) return Math.round(v / 1000).toLocaleString() + "k"; return Math.round(v).toLocaleString(); };

  return (
    <div className="space-y-2">
      {/* ── Top Bar ── */}
      <div className="flex items-center justify-between px-2.5 py-1.5 bg-zinc-900/80 border border-zinc-800/60">
        <div className="flex items-center gap-4">
          <SigBadge icon="⦿" label="EM" value={stats.emSignature} color="#a855f7" />
          <SigBadge icon="⚡" label="IR" value={stats.irSignature} color="#f97316" />
          <div className="h-3 w-px bg-zinc-800/60" />
          <span className="text-[9px] font-mono text-zinc-600 tracking-wider">{stats.summary.activeComponents}/{stats.summary.totalComponents} ACTIVE</span>
          {hasChanges() && <span className="text-[9px] font-mono text-yellow-500/80 tracking-wider">{overrides.size} MOD</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={handleCopyLink} className={copied ? "text-[9px] font-mono uppercase tracking-wider px-2 py-1 border bg-green-950/30 text-green-500 border-green-800/50" : "text-[9px] font-mono uppercase tracking-wider px-2 py-1 border text-zinc-500 border-zinc-800 hover:text-yellow-500 hover:border-yellow-800/50 transition-colors"}>{copied ? "COPIED" : "SHARE"}</button>
          {hasChanges() && <button onClick={resetAll} className="text-[9px] font-mono uppercase tracking-wider px-2 py-1 border text-orange-500/80 border-zinc-800 hover:border-orange-800/50 transition-colors">RESET</button>}
          <button onClick={handleResetLayout} className="text-[9px] font-mono uppercase tracking-wider px-2 py-1 border text-zinc-600 border-zinc-800 hover:text-cyan-500 hover:border-cyan-800/50 transition-colors" title="Reset panel layout to default">⠿ LAYOUT</button>
        </div>
      </div>

      {/* ── Main Grid — original 5-column layout, each block draggable ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_1fr_1fr_340px] gap-2">
        {columns.map((colWidgets, colIdx) => (
          <div key={colIdx} className="space-y-2">
            {colWidgets.map((wId) => renderWidget(wId, { dragState, onDragStart: handleDragStart, onDragOver: handleDragOver, onDrop: handleDrop, onDragEnd: handleDragEnd }, { weaponHps, missileHps, useful, store, setPickerHp, si, shipInfo, stats, flightMode, setFlightMode, fmtNum, fmtDec, fmtMass, cmDecoyCount, cmNoiseCount }))}
          </div>
        ))}
      </div>

      {pickerHp && <ComponentPicker hardpoint={pickerHp} currentItemId={getEffectiveItem(pickerHp.id)?.id ?? null} onSelect={handleSelect} onClear={handleClear} onClose={() => setPickerHp(null)} />}
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function HpGroup({ title, icon, hps, store, onClickHp, accent }: { title: string; icon: string; hps: ResolvedHardpoint[]; store: ReturnType<typeof useLoadoutStore>; onClickHp: (hp: ResolvedHardpoint) => void; accent: string }) {
  if (hps.length === 0) return null;
  const { getEffectiveItem, overrides, isComponentOn, toggleComponent } = store;
  return (
    <div className="bg-zinc-900/80 border border-zinc-800/60">
      <div className="flex items-center gap-2 px-2 py-1 border-b border-zinc-800/50 bg-zinc-900/50">
        <span className="text-[10px]" style={{ color: accent, opacity: 0.6 }}>{icon}</span>
        <span className="text-[9px] font-mono font-medium tracking-[0.15em] uppercase text-zinc-400">{title}</span>
        <span className="text-[9px] font-mono text-zinc-700 ml-auto">{hps.length}</span>
      </div>
      <div>
        {hps.map(hp => (
          <HardpointSlot key={hp.id} hp={hp} item={getEffectiveItem(hp.id)} isOverridden={overrides.has(hp.id)} isOn={isComponentOn(hp.hardpointName)} onClick={() => onClickHp(hp)} onTogglePower={() => toggleComponent(hp.hardpointName)} childSlots={hp.children} isComponentOn={isComponentOn} toggleComponent={toggleComponent} />
        ))}
      </div>
    </div>
  );
}

function SigBadge({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) {
  const fmt = (v: number) => v >= 1000 ? (v / 1000).toFixed(1) + "K" : Math.round(v).toString();
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px]" style={{ color, opacity: 0.7 }}>{icon}</span>
      <span className="text-[10px] font-mono font-bold tabular-nums" style={{ color }}>{fmt(value)}</span>
      <span className="text-[7px] font-mono text-zinc-600 tracking-wider">{label}</span>
    </div>
  );
}

function CompactStat({ label, value, color, locked }: { label: string; value: string; color: string; locked?: boolean }) {
  return (
    <div className="bg-zinc-950/40 border border-zinc-800/40 p-1.5 relative overflow-hidden">
      {locked && <div className="absolute inset-0 bg-zinc-950/50 z-10 flex items-center justify-center"><span className="text-[7px] font-mono text-zinc-600 tracking-wider uppercase">NAV</span></div>}
      <div className="text-[7px] font-mono text-zinc-600 tracking-[0.15em] uppercase">{label}</div>
      <div className="text-sm font-mono font-bold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

function SignatureBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const segments = 12;
  const filled = Math.round((Math.min(100, (value / max) * 100) / 100) * segments);
  const fmt = (v: number) => v >= 1000 ? (v / 1000).toFixed(1) + "K" : Math.round(v).toString();
  return (
    <div>
      <div className="flex items-baseline justify-between mb-0.5">
        <span className="text-[7px] font-mono text-zinc-600 tracking-[0.15em] uppercase">{label} SIG</span>
        <span className="text-[11px] font-mono font-bold tabular-nums" style={{ color }}>{fmt(value)}</span>
      </div>
      <div className="flex gap-px">
        {Array.from({ length: segments }, (_, i) => (
          <div key={i} className="flex-1 h-1 rounded-[1px] transition-all duration-300" style={{ backgroundColor: i < filled ? color : "#27272a", opacity: i < filled ? 0.6 : 0.3 }} />
        ))}
      </div>
    </div>
  );
}

function BalanceRow({ label, value, output, draw, posColor, negColor }: { label: string; value: number; output: number; draw: number; posColor: string; negColor: string }) {
  const pos = value >= 0;
  const color = pos ? posColor : negColor;
  const mx = Math.max(output, draw, 1);
  const pct = Math.min(50, (Math.abs(value) / mx) * 50);
  const bs = pos ? { left: "50%", width: pct + "%", backgroundColor: color } : { left: (50 - pct) + "%", width: pct + "%", backgroundColor: color };
  return (
    <div className="space-y-0.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[8px] font-mono text-zinc-600 tracking-wider uppercase">{label}</span>
        <span className="text-[10px] font-mono" style={{ color }}>{pos ? "+" : ""}{fmtStat(value)}</span>
      </div>
      <div className="relative h-1 w-full bg-zinc-800/60 rounded-full overflow-hidden">
        <div className="absolute left-1/2 top-0 w-px h-full bg-zinc-600/30 z-10" />
        <div className="absolute top-0 h-full rounded-full transition-all duration-500" style={bs} />
      </div>
      <div className="flex justify-between text-[7px] font-mono text-zinc-700">
        <span>{fmtStat(output)} out</span>
        <span>{fmtStat(draw)} draw</span>
      </div>
    </div>
  );
}

function StatRow({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="flex items-baseline justify-between py-[2px] border-b border-zinc-800/20 last:border-b-0">
      <span className="text-[8px] font-mono text-amber-600/80 tracking-wider uppercase">{label}</span>
      <span className="text-[10px] font-mono text-zinc-300 tabular-nums">
        {value}
        {unit && <span className="text-[8px] text-zinc-600 ml-0.5">{unit}</span>}
      </span>
    </div>
  );
}

function ModeBtn({ label, active, c, onClick }: { label: string; active: boolean; c: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={active ? "px-3 py-1 text-[9px] font-mono font-bold tracking-[0.12em] uppercase text-center border" : "px-3 py-1 text-[9px] font-mono tracking-[0.12em] uppercase text-center text-zinc-600 border border-zinc-800/50 hover:text-zinc-400 transition-colors"} style={active ? { backgroundColor: c + "20", color: c, borderColor: c + "60" } : undefined}>
      {label}
    </button>
  );
}

// =============================================================================
// Inline SVG Radar Charts
// =============================================================================

function RadarChartInline({ axes, size = 180, color = "#f59e0b", fillOpacity = 0.12, gridLevels = 4 }: {
  axes: { label: string; value: number; max: number }[];
  size?: number; color?: string; fillOpacity?: number; gridLevels?: number;
}) {
  if (axes.length < 3) return null;
  const cx = size / 2, cy = size / 2, radius = size * 0.34, labelR = size * 0.46;
  const n = axes.length, step = (2 * Math.PI) / n, start = -Math.PI / 2;
  const norm = axes.map(a => a.max > 0 ? Math.min(1, a.value / a.max) : 0);
  const pts = (vals: number[]) => vals.map((v, i) => { const a = start + i * step; const r = v * radius; return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`; }).join(" ");
  const grids = Array.from({ length: gridLevels }, (_, i) => { const lv = (i + 1) / gridLevels; return axes.map((_, j) => { const a = start + j * step; const r = lv * radius; return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`; }).join(" "); });

  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size }}>
      {grids.map((p, i) => <polygon key={i} points={p} fill="none" stroke="#3f3f46" strokeWidth={0.5} opacity={0.4} />)}
      {axes.map((_, i) => { const a = start + i * step; return <line key={i} x1={cx} y1={cy} x2={cx + radius * Math.cos(a)} y2={cy + radius * Math.sin(a)} stroke="#3f3f46" strokeWidth={0.5} opacity={0.3} />; })}
      <polygon points={pts(norm)} fill={color} fillOpacity={fillOpacity} stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      {norm.map((v, i) => { const a = start + i * step; const r = v * radius; return <circle key={i} cx={cx + r * Math.cos(a)} cy={cy + r * Math.sin(a)} r={2} fill={color} stroke="#18181b" strokeWidth={0.8} />; })}
      {axes.map((ax, i) => {
        const a = start + i * step;
        const lx = cx + labelR * Math.cos(a), ly = cy + labelR * Math.sin(a);
        let anchor = "middle"; if (Math.cos(a) > 0.3) anchor = "start"; else if (Math.cos(a) < -0.3) anchor = "end";
        return (
          <g key={`l-${i}`}>
            <text x={lx} y={ly - 3} textAnchor={anchor} dominantBaseline="middle" className="fill-zinc-500" style={{ fontSize: "7px", fontFamily: "monospace" }}>{ax.label}</text>
            <text x={lx} y={ly + 7} textAnchor={anchor} dominantBaseline="middle" style={{ fontSize: "8px", fontFamily: "monospace", fill: color, fontWeight: 600 }}>{ax.value > 0 ? Math.round(ax.value).toString() : "—"}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Dual-layer radar: SCM (base) + Afterburner overlay */
function DualRadarChart({ axes, size = 220, gridLevels = 5 }: {
  axes: { label: string; scm: number; boost: number; max: number }[];
  size?: number; gridLevels?: number;
}) {
  if (axes.length < 3) return null;
  const cx = size / 2, cy = size / 2, radius = size * 0.32, labelR = size * 0.45;
  const n = axes.length, step = (2 * Math.PI) / n, start = -Math.PI / 2;
  const normScm = axes.map(a => a.max > 0 ? Math.min(1, a.scm / a.max) : 0);
  const normBoost = axes.map(a => a.max > 0 ? Math.min(1, a.boost / a.max) : 0);
  const pts = (vals: number[]) => vals.map((v, i) => { const a = start + i * step; const r = v * radius; return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`; }).join(" ");
  const grids = Array.from({ length: gridLevels }, (_, i) => { const lv = (i + 1) / gridLevels; return axes.map((_, j) => { const a = start + j * step; const r = lv * radius; return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`; }).join(" "); });

  const scmColor = "#f59e0b";
  const boostColor = "#ef4444";

  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size }}>
      {/* Grid */}
      {grids.map((p, i) => <polygon key={i} points={p} fill="none" stroke="#3f3f46" strokeWidth={0.5} opacity={0.4} />)}
      {axes.map((_, i) => { const a = start + i * step; return <line key={i} x1={cx} y1={cy} x2={cx + radius * Math.cos(a)} y2={cy + radius * Math.sin(a)} stroke="#3f3f46" strokeWidth={0.5} opacity={0.3} />; })}

      {/* Afterburner layer (behind, wider) */}
      <polygon points={pts(normBoost)} fill={boostColor} fillOpacity={0.08} stroke={boostColor} strokeWidth={1} strokeLinejoin="round" strokeDasharray="3,2" opacity={0.7} />
      {normBoost.map((v, i) => { const a = start + i * step; const r = v * radius; return v > 0 ? <circle key={`b${i}`} cx={cx + r * Math.cos(a)} cy={cy + r * Math.sin(a)} r={1.5} fill={boostColor} stroke="#18181b" strokeWidth={0.5} opacity={0.6} /> : null; })}

      {/* SCM layer (front, solid) */}
      <polygon points={pts(normScm)} fill={scmColor} fillOpacity={0.15} stroke={scmColor} strokeWidth={1.5} strokeLinejoin="round" />
      {normScm.map((v, i) => { const a = start + i * step; const r = v * radius; return <circle key={`s${i}`} cx={cx + r * Math.cos(a)} cy={cy + r * Math.sin(a)} r={2} fill={scmColor} stroke="#18181b" strokeWidth={0.8} />; })}

      {/* Labels with dual values */}
      {axes.map((ax, i) => {
        const a = start + i * step;
        const lx = cx + labelR * Math.cos(a), ly = cy + labelR * Math.sin(a);
        let anchor = "middle"; if (Math.cos(a) > 0.3) anchor = "start"; else if (Math.cos(a) < -0.3) anchor = "end";
        const hasBoost = ax.boost > ax.scm;
        return (
          <g key={`l-${i}`}>
            <text x={lx} y={ly - (hasBoost ? 5 : 3)} textAnchor={anchor} dominantBaseline="middle" className="fill-zinc-500" style={{ fontSize: "6.5px", fontFamily: "monospace" }}>{ax.label}</text>
            <text x={lx} y={ly + 5} textAnchor={anchor} dominantBaseline="middle" style={{ fontSize: "7.5px", fontFamily: "monospace", fill: scmColor, fontWeight: 600 }}>{ax.scm > 0 ? Math.round(ax.scm).toString() : "—"}</text>
            {hasBoost && (
              <text x={lx} y={ly + 14} textAnchor={anchor} dominantBaseline="middle" style={{ fontSize: "6.5px", fontFamily: "monospace", fill: boostColor, fontWeight: 500, opacity: 0.8 }}>{Math.round(ax.boost)}</text>
            )}
          </g>
        );
      })}

      {/* Legend */}
      <rect x={4} y={size - 16} width={6} height={6} rx={1} fill={scmColor} opacity={0.8} />
      <text x={13} y={size - 10} className="fill-zinc-500" style={{ fontSize: "6px", fontFamily: "monospace" }}>SCM</text>
      <rect x={36} y={size - 16} width={6} height={6} rx={1} fill={boostColor} opacity={0.6} />
      <text x={45} y={size - 10} className="fill-zinc-500" style={{ fontSize: "6px", fontFamily: "monospace" }}>AFB</text>
    </svg>
  );
}

function AccelerationRadar({ shipData }: { shipData: any }) {
  // SCM values
  const fwd = shipData.accelForward ?? 0;
  const bwd = shipData.accelBackward ?? 0;
  const up = shipData.accelUp ?? 0;
  const down = shipData.accelDown ?? 0;
  const strafe = shipData.accelStrafe ?? 0;
  const pitch = shipData.pitchRate ?? 0;
  const yaw = shipData.yawRate ?? 0;
  const roll = shipData.rollRate ?? 0;

  // Boost values (use boosted rates for pitch/yaw/roll, boost speeds for movement)
  const boostFwd = shipData.boostSpeedForward ?? fwd;
  const boostBwd = shipData.boostSpeedBackward ?? bwd;
  const boostPitch = shipData.boostedPitch ?? pitch;
  const boostYaw = shipData.boostedYaw ?? yaw;
  const boostRoll = shipData.boostedRoll ?? roll;
  // No boosted strafe/up/down data — use SCM as fallback
  const boostUp = up;
  const boostDown = down;
  const boostStrafe = strafe;

  // Max values for normalization (use boost values as ceiling when available)
  const maxFwd = Math.max(fwd, boostFwd, 30);
  const maxBwd = Math.max(bwd, boostBwd, 30);
  const maxUp = Math.max(up, boostUp, 25);
  const maxDown = Math.max(down, boostDown, 25);
  const maxStrafe = Math.max(strafe, boostStrafe, 25);
  const maxPitch = Math.max(pitch, boostPitch, 100);
  const maxYaw = Math.max(yaw, boostYaw, 100);
  const maxRoll = Math.max(roll, boostRoll, 200);

  const axes = [
    { label: "Forward",  scm: fwd,    boost: boostFwd,    max: maxFwd },
    { label: "Up",       scm: up,     boost: boostUp,     max: maxUp },
    { label: "Strafe",   scm: strafe, boost: boostStrafe,  max: maxStrafe },
    { label: "Pitch",    scm: pitch,  boost: boostPitch,  max: maxPitch },
    { label: "Backward", scm: bwd,    boost: boostBwd,    max: maxBwd },
    { label: "Down",     scm: down,   boost: boostDown,   max: maxDown },
    { label: "Roll",     scm: roll,   boost: boostRoll,   max: maxRoll },
    { label: "Yaw",      scm: yaw,    boost: boostYaw,    max: maxYaw },
  ];

  return <DualRadarChart axes={axes} size={220} gridLevels={5} />;
}

function ManeuverabilityRadar({ shipInfo }: { shipInfo: any }) {
  const axes = [
    { label: "Pitch", value: shipInfo.pitchRate ?? 0, max: 120 },
    { label: "Yaw", value: shipInfo.yawRate ?? 0, max: 120 },
    { label: "Roll", value: shipInfo.rollRate ?? 0, max: 250 },
  ];
  return <RadarChartInline axes={axes} size={200} color="#3b82f6" fillOpacity={0.15} gridLevels={4} />;
}
