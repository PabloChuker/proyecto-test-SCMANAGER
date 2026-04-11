// =============================================================================
// AL FILO — LoadoutBuilder v19 (Free-form Absolute Layout)
//
// Widgets se renderizan como divs absolutos con posición en píxeles. El
// usuario puede arrastrarlos libremente desde el header (drag custom,
// sin snap a celdas): el widget sigue al mouse y se queda donde se suelta.
// Default: 5 columnas que cubren el ancho completo del contenedor.
// Persistido en localStorage `al-filo-layout-v4` (coordenadas en px).
//
// Panels: weapons, missiles, shields, power-plants, coolers, quantum, radar,
//   utility, combat-summary, power-grid, signatures, balance, ship-selector,
//   ship-card, dps-detail, strafe-profile, turning-profile, maneuver-radar,
//   flight-dynamics-3d.
// =============================================================================

"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useLoadoutStore } from "@/store/useLoadoutStore";
import type { ResolvedHardpoint, EquippedItem } from "@/store/useLoadoutStore";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { HardpointSlot, isUsefulSlot } from "./HardpointSlot";
import { ComponentPicker } from "./ComponentPicker";
import { PowerManagementPanel } from "./PowerManagementPanel";
import { ShipSelector } from "./ShipSelector";
import { fmtStat, fmtDps } from "./loadout-utils";
import { ShipFlightDynamicsSingle } from "@/components/shared/flight-dynamics";
import { shipGlbUrl } from "@/lib/shipGlb";

const WEAPON_GROUPS = new Set(["WEAPON", "TURRET"]);
const MISSILE_GROUPS = new Set(["MISSILE_RACK"]);

// ÔöÇÔöÇ Ship thumbnail URL helper ÔöÇÔöÇ
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
  return `/ships/${slug}.webp`;
}

const CAT_CONFIG: Record<string, { label: string; icon: string; accent: string }> = {
  SHIELD: { label: "SHIELDS", icon: "/icons/shilds.png", accent: "#3b82f6" },
  POWER_PLANT: { label: "POWER PLANTS", icon: "/icons/power_plants.png", accent: "#22c55e" },
  COOLER: { label: "COOLERS", icon: "/icons/coolers.png", accent: "#06b6d4" },
  QUANTUM_DRIVE: { label: "QUANTUM DRIVES", icon: "/icons/Quantum_drives.png", accent: "#a855f7" },
  RADAR: { label: "RADAR", icon: "/icons/DPS_calculator.png", accent: "#22c55e" },
  MINING: { label: "MINING", icon: "/icons/mining_lasers.png", accent: "#f472b6" },
  UTILITY: { label: "UTILITY", icon: "/icons/tractor_beam.png", accent: "#94a3b8" },
};

// ── Widget System (free absolute positioning) ──────────────────────────────
type WidgetId =
  | "weapons" | "missiles" | "strafe-profile" | "turning-profile"
  | "shields" | "powerplants" | "coolers" | "maneuver-radar"
  | "quantum" | "radar" | "utility" | "combat-summary"
  | "power-grid" | "signatures" | "balance"
  | "ship-selector" | "ship-card" | "dps-detail"
  | "flight-dynamics-3d";

// ─── Geometric grid: UNIT-based positioning (v7) ────────────────────────────
// Spec (Pablo, 2026-04-11):
//   Todas las dimensiones derivan de `UNIT` — el ancho de 1 columna en px.
//
//   Grid:  GRID_COLUMNS × GRID_ROWS  (5 × ~100)
//     col width   = 1                    * UNIT
//     row height  = ROW_HEIGHT_RATIO     * UNIT  (0.25)
//     anchor      = ANCHOR_OFFSET_RATIO  * UNIT  (0.05) desde top-left de cada celda
//
//   Margen implícito por tarjeta = MARGIN_RATIO/2 * UNIT  en cada lado.
//   → Spacing TOTAL entre dos tarjetas adyacentes = MARGIN_RATIO * UNIT  (0.1).
//   → NO se usa flex/grid `gap` — el espacio es consecuencia de la geometría.
//
//   Cards:
//     CARD_WIDTH(n)  = (n - MARGIN_RATIO) * UNIT            (n = 1 o 2)
//     cardHeight(X)  = (ROW_HEIGHT_RATIO * X - MARGIN_RATIO) * UNIT
//
//   La altura de una card es FIJA por la cantidad de bloques que ocupa:
//   nunca se ajusta al contenido. Puede quedar espacio vacío dentro; OK.
const GRID_COLUMNS        = 5;
const GRID_ROWS           = 100;
const ROW_HEIGHT_RATIO    = 0.25;
const ANCHOR_OFFSET_RATIO = 0.05;
const MARGIN_RATIO        = 0.1;        // gap total entre cards = 0.1 * UNIT
const MIN_UNIT_PX         = 240;        // clamp inferior del UNIT (+50% desde 160)
const MAX_UNIT_PX         = 390;        // clamp superior del UNIT (+50% desde 260)

// Ancho de card en columnas: 1 o 2. (Max permitido por la spec = 2.)
// v8: TODAS las cards son 1-col para que el layout categorizado 5-col quede
// uniforme y no se pierda espacio. flight-dynamics-3d, ship-card, dps-detail
// y ship-selector bajan a 1-col (se re-dimensionan internamente).
type CardWidth = 1 | 2;
const WIDGET_WIDTH: Record<WidgetId, CardWidth> = {
  weapons: 1, missiles: 1, "strafe-profile": 1, "turning-profile": 1,
  shields: 1, powerplants: 1, coolers: 1, "maneuver-radar": 1,
  quantum: 1, radar: 1, utility: 1, "combat-summary": 1,
  "power-grid": 1, signatures: 1, balance: 1,
  "ship-selector": 1, "ship-card": 1, "dps-detail": 1,
  "flight-dynamics-3d": 1,
};

const WIDGET_LABELS: Record<WidgetId, string> = {
  weapons: "WEAPONS", missiles: "MISSILES", "strafe-profile": "STRAFE PROFILE", "turning-profile": "TURNING PROFILES",
  shields: "SHIELDS", powerplants: "POWER PLANTS", coolers: "COOLERS", "maneuver-radar": "G-FORCES",
  quantum: "QT DRIVES", radar: "RADAR", utility: "UTILITY", "combat-summary": "COMBAT",
  "power-grid": "POWER GRID", signatures: "SIGNATURES", balance: "BALANCE",
  "ship-selector": "SEARCH", "ship-card": "SHIP CARD", "dps-detail": "DPS DETAIL",
  "flight-dynamics-3d": "FLIGHT DYNAMICS 3D",
};

const ALL_WIDGET_IDS: WidgetId[] = [
  "weapons", "missiles", "strafe-profile", "turning-profile",
  "shields", "powerplants", "coolers", "maneuver-radar",
  "quantum", "radar", "utility", "combat-summary",
  "power-grid", "signatures", "balance",
  "ship-selector", "ship-card", "dps-detail",
  "flight-dynamics-3d",
];

// ─── Geometric helpers ──────────────────────────────────────────────────────
// getUnit: calcula el ancho de 1 columna en px a partir del contenedor.
function getUnit(containerWidth: number): number {
  const raw = containerWidth / GRID_COLUMNS;
  return Math.max(MIN_UNIT_PX, Math.min(MAX_UNIT_PX, raw));
}

// Anchor X de la celda (col, row) en px. col ∈ [0, GRID_COLUMNS)
function getAnchorX(col: number, unit: number): number {
  return col * unit + ANCHOR_OFFSET_RATIO * unit;
}

// Anchor Y de la celda (col, row) en px. row ∈ [0, GRID_ROWS)
function getAnchorY(row: number, unit: number): number {
  return row * ROW_HEIGHT_RATIO * unit + ANCHOR_OFFSET_RATIO * unit;
}

// Ancho de card según tipo (1 o 2 cols) — en px.
// CARD_WIDTH_n = (n - MARGIN_RATIO) * UNIT  →  deja MARGIN_RATIO*UNIT de gap
// con la próxima celda; respetando el margen 0.05*UNIT de cada lado.
function getCardWidth(widthType: CardWidth, unit: number): number {
  return (widthType - MARGIN_RATIO) * unit;
}

// Alto de card en px dado un número de bloques verticales (X ∈ ℤ+).
// cardHeight(X) = (0.25 * X - MARGIN_RATIO) * UNIT  →  deja MARGIN_RATIO*UNIT
// de gap con la card de abajo. El mínimo útil es X=1 (0.15*UNIT ≈ pocos px).
function getCardHeight(blocks: number, unit: number): number {
  return (ROW_HEIGHT_RATIO * blocks - MARGIN_RATIO) * unit;
}

// Valida y clamp de (col, row) para que la card quepa en la grilla.
function clampGridPos(col: number, row: number, widthType: CardWidth): { col: number; row: number } {
  const maxCol = GRID_COLUMNS - widthType;
  return {
    col: Math.max(0, Math.min(maxCol, Math.round(col))),
    row: Math.max(0, Math.min(GRID_ROWS - 1, Math.round(row))),
  };
}

// ─── Widget block heights ───────────────────────────────────────────────────
// Cada widget declara cuántos bloques verticales (filas de 0.25 * UNIT) ocupa.
// La altura resultante es FIJA: la card nunca se ajusta al contenido. Si sobra
// espacio, queda vacío; si falta, el contenido interno hace scroll o clip.
// Widgets con listas variables (weapons, shields, etc.) derivan el número de
// bloques del número de slots de la nave.
function getWidgetBlocks(
  wId: WidgetId,
  counts: {
    weapons: number; missiles: number;
    shields: number; powerplants: number; coolers: number;
    quantum: number; radar: number; utility: number;
  },
): number {
  // Grupo HP: 1 bloque base (header compacto) + 1 bloque por slot.
  // Mínimo 2 bloques para legibilidad. Compacto — v8.
  const hpBlocks = (n: number) => Math.max(2, 1 + Math.max(1, n));

  switch (wId) {
    case "weapons":            return hpBlocks(counts.weapons);
    case "missiles":           return hpBlocks(counts.missiles);
    case "shields":            return hpBlocks(counts.shields);
    case "powerplants":        return hpBlocks(counts.powerplants);
    case "coolers":            return hpBlocks(counts.coolers);
    case "quantum":            return hpBlocks(counts.quantum);
    case "radar":              return hpBlocks(counts.radar);
    case "utility":            return hpBlocks(counts.utility);
    case "combat-summary":     return 3;
    case "power-grid":         return 4;
    case "signatures":         return 2;
    case "balance":            return 2;
    case "strafe-profile":     return 4;
    case "turning-profile":    return 4;
    case "maneuver-radar":     return 4;
    case "ship-selector":      return 2;
    case "ship-card":          return 5;
    case "dps-detail":         return 4;
    case "flight-dynamics-3d": return 5;
  }
}

// ─── Category-based 5-column layout (v8) ────────────────────────────────────
// Distribución determinística por categoría — armas con armas, componentes con
// componentes, charts con charts, ship-info con ship-info. Cada columna apila
// sus widgets en orden, sin bin-packing. La idea: mirar una columna = ver una
// familia de info. Los widgets ocultos (sin hardpoints del tipo) se saltan,
// pero NO se re-balancea entre columnas para conservar la identidad visual.
const COLUMN_PLAN: WidgetId[][] = [
  // Col 0 — OFFENSE: armas + missiles + resumen de combate
  ["weapons", "missiles", "combat-summary"],
  // Col 1 — DEFENSE & POWER: shields + plantas + coolers + signatures
  ["shields", "powerplants", "coolers", "signatures"],
  // Col 2 — NAV & SENSORS: QT, radar, utility, power grid
  ["quantum", "radar", "utility", "power-grid"],
  // Col 3 — FLIGHT CHARTS: strafe, turning, g-forces, balance
  ["strafe-profile", "turning-profile", "maneuver-radar", "balance"],
  // Col 4 — SHIP INFO: selector, card, dps detail, 3D viewer (vertical)
  ["ship-selector", "ship-card", "dps-detail", "flight-dynamics-3d"],
];

// Posiciones default en coordenadas (col, row). Cada widget va a su columna
// fija según COLUMN_PLAN, apilado verticalmente en el orden del plan. Los
// widgets ocultos NO ocupan espacio. Sin bin-packing, sin optimización: el
// layout es determinístico y categorizado.
function buildDefaultPositions(
  visible: Set<WidgetId>,
  blocks: Record<WidgetId, number>,
): Map<WidgetId, { col: number; row: number }> {
  const result = new Map<WidgetId, { col: number; row: number }>();
  for (let col = 0; col < COLUMN_PLAN.length; col++) {
    let row = 0;
    for (const wId of COLUMN_PLAN[col]) {
      if (!visible.has(wId)) continue;
      result.set(wId, { col, row });
      row += blocks[wId];
    }
  }
  return result;
}

// ─── localStorage (v8: i/col/row con layout 5-col categorizado) ─────────────
// Bump de versión porque los widgets 2-col bajaron a 1-col → las posiciones
// persistidas de v6/v7 ya no tienen sentido (apuntarían a cols/rows que no
// corresponden al nuevo esquema categorizado).
const LAYOUT_STORAGE_KEY = "al-filo-layout-v8";

type SavedPos = { i: string; col: number; row: number };

function loadSavedPositions(): SavedPos[] | null {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter((p) => p && typeof p.i === "string" && typeof p.col === "number" && typeof p.row === "number")
      .map((p) => ({ i: p.i, col: p.col, row: p.row }));
  } catch {
    return null;
  }
}

function savePositions(positions: SavedPos[]) {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(positions));
  } catch {}
}

// ─── Widget visual wrapper (header + content) ────────────────────────────────
// El header tiene la clase ".rgl-drag-handle" para que el drag custom lo
// detecte. `overflow="visible"` se usa en widgets que abren popups (ship-
// selector) para que el dropdown pueda invadir los vecinos sin clippear.
// Las alturas son 100% estáticas (derivadas de getWidgetBlocks × UNIT) — no
// medimos el contenido en runtime porque eso crea loops con ResizeObserver.
function WidgetShell({ id, label, children, overflow = "hidden" }: {
  id: WidgetId;
  label: string;
  children: React.ReactNode;
  overflow?: "hidden" | "visible";
}) {
  const outerOverflow = overflow === "visible" ? "overflow-visible" : "overflow-hidden";
  const innerOverflow = overflow === "visible" ? "overflow-visible" : "overflow-hidden";
  return (
    <div className={`h-full flex flex-col ${outerOverflow}`} data-widget-id={id}>
      <div className="rgl-drag-handle flex items-center gap-1 px-1.5 py-[2px] bg-zinc-950/60 border border-zinc-800/30 border-b-0 cursor-grab active:cursor-grabbing select-none group rounded-t-sm shrink-0">
        <span className="text-[7px] text-zinc-700 group-hover:text-yellow-600 transition-colors">⟲</span>
        <span className="text-[6px] font-mono text-zinc-700 tracking-[0.15em] group-hover:text-zinc-500 transition-colors uppercase">{label}</span>
        <span className="flex-1" />
        <span className="text-[7px] text-zinc-800 group-hover:text-zinc-600 transition-colors">⋮⋮</span>
      </div>
      <div className={`flex-1 min-h-0 ${innerOverflow}`}>
        {children}
      </div>
    </div>
  );
}

// ── Widget renderer — maps a WidgetId to its JSX content ──────────────────
function renderWidget(
  wId: WidgetId,
  ctx: any,
): React.ReactNode {
  const { weaponHps, missileHps, useful, store, setPickerHp, si, shipInfo, stats, flightMode, setFlightMode, fmtNum, fmtDec, fmtMass, cmDecoyCount, cmNoiseCount } = ctx;
  const W = (children: React.ReactNode) => (
    <WidgetShell id={wId} label={WIDGET_LABELS[wId]}>{children}</WidgetShell>
  );

  switch (wId) {
    case "weapons":
      return weaponHps.length > 0 ? W(<HpGroup title="WEAPONS" icon="/icons/weapons.png" hps={weaponHps} store={store} onClickHp={setPickerHp} accent="#eab308" />) : null;
    case "missiles":
      return missileHps.length > 0 ? W(<HpGroup title="MISSILES & BOMBS" icon="/icons/missile.png" hps={missileHps} store={store} onClickHp={setPickerHp} accent="#f97316" />) : null;
    case "strafe-profile":
      return W(<StrafeProfileTabs shipData={si} />);
    case "turning-profile":
      return W(<div className="bg-zinc-900/80 border border-zinc-800/60 p-3"><div className="text-[9px] font-mono text-zinc-500 tracking-[0.2em] uppercase mb-1 text-center">Turning Profiles</div><div className="flex justify-center"><TurningProfileRadar shipData={si} /></div></div>);
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
      return W(<GForceProfileTabs shipData={shipInfo} />);
    case "flight-dynamics-3d":
      return W(
        <div className="bg-zinc-900/80 border border-zinc-800/60 p-3">
          <ShipFlightDynamicsSingle
            shipName={shipInfo.localizedName || shipInfo.name}
            pitchRate={si.pitchRate}
            yawRate={si.yawRate}
            rollRate={si.rollRate}
            glbUrl={shipGlbUrl(shipInfo.reference)}
          />
        </div>
      );
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
      return hps.length > 0 ? W(<HpGroup title="UTILITY" icon="/icons/tractor_beam.png" hps={hps} store={store} onClickHp={setPickerHp} accent="#94a3b8" />) : null;
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
          {(si.deflectionPhysical || si.deflectionEnergy || si.deflectionDistortion) ? (
            <div className="border-t border-zinc-800/40 pt-1.5">
              <div className="text-[8px] font-mono text-zinc-600 tracking-wider uppercase mb-1">Armor Deflection</div>
              <div className="flex gap-3">
                {si.deflectionPhysical ? <div className="flex items-center gap-1"><span className="text-[8px] font-mono text-zinc-500">PHY</span><span className="text-[11px] font-mono font-bold text-amber-400">{si.deflectionPhysical}</span></div> : null}
                {si.deflectionEnergy ? <div className="flex items-center gap-1"><span className="text-[8px] font-mono text-zinc-500">ENG</span><span className="text-[11px] font-mono font-bold text-cyan-400">{si.deflectionEnergy}</span></div> : null}
                {si.deflectionDistortion ? <div className="flex items-center gap-1"><span className="text-[8px] font-mono text-zinc-500">DST</span><span className="text-[11px] font-mono font-bold text-purple-400">{si.deflectionDistortion}</span></div> : null}
              </div>
            </div>
          ) : null}
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
      return (
        <WidgetShell id={wId} label={WIDGET_LABELS[wId]} overflow="visible">
          <ShipSelector />
        </WidgetShell>
      );
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
              <img src="/icons/weapons.png" alt="" className="w-4 h-4" style={{ opacity: 0.5 }} />
              <span className="text-2xl font-mono font-bold tabular-nums text-red-500">{fmtDps(stats.totalDps)}</span>
              <span className="text-[10px] font-mono text-zinc-500">dps</span>
              <span className="text-lg font-mono font-bold tabular-nums text-red-400/70">{fmtStat(stats.totalAlpha)}</span>
              <span className="text-[10px] font-mono text-zinc-500">alpha</span>
            </div>
          </div>
          <div className={flightMode === "NAV" ? "opacity-30" : ""}>
            <div className="flex items-baseline gap-3">
              <img src="/icons/missile.png" alt="" className="w-4 h-4" style={{ opacity: 0.5 }} />
              <span className="text-lg font-mono font-bold tabular-nums text-orange-500">{stats.summary.missiles > 0 ? fmtStat(stats.totalAlpha) : "0"}</span>
              <span className="text-[10px] font-mono text-zinc-500">dmg</span>
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-3">
              <span className="text-[11px]" style={{ color: "#eab308", opacity: 0.5 }}>⏱</span>
              <span className="text-lg font-mono font-bold tabular-nums text-amber-500">{stats.shieldRegen > 0 ? (stats.shieldHp / Math.max(stats.shieldRegen, 0.01)).toFixed(1) : "—"}</span>
              <span className="text-[10px] font-mono text-zinc-500">s full regen time</span>
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-3">
              <img src="/icons/shilds.png" alt="" className="w-4 h-4" style={{ opacity: 0.5 }} />
              <span className="text-xl font-mono font-bold tabular-nums text-blue-500">{stats.shieldHp > 0 ? fmtStat(stats.shieldHp) : (si.shieldHpTotal ? fmtStat(si.shieldHpTotal) : "0")}</span>
              <span className="text-[10px] font-mono text-zinc-500">hp</span>
              {stats.shieldRegen > 0 && (<><span className="text-sm font-mono tabular-nums text-blue-400/70">{fmtStat(stats.shieldRegen)}</span><span className="text-[10px] font-mono text-zinc-500">hp/s</span></>)}
            </div>
          </div>
          {si.hullHp && si.hullHp > 0 && (
            <div><div className="flex items-baseline gap-3">
              <img src="/icons/Ships.png" alt="" className="w-4 h-4" style={{ opacity: 0.5 }} />
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
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveModal, setSaveModal] = useState(false);
  const [saveName, setSaveName] = useState("");
  const mountedRef = useRef(false);
  const overrideCountRef = useRef(0);

  // ─── Geometric grid layout (v8 — UNIT-based + categorizado 5-col) ─────────
  // Estrategia:
  //  1. Medimos el ancho del contenedor con ResizeObserver → getUnit().
  //  2. Cada widget tiene una cantidad fija de bloques verticales y TODOS son
  //     1-col (v8). Las dimensiones se derivan todas de UNIT.
  //  3. Las posiciones default se computan por COLUMN_PLAN categorizado:
  //     offense | defense+power | nav+sensors | flight charts | ship info.
  //  4. Las posiciones son discretas (col, row) — el drag permite reubicar.
  //  5. Persistimos en localStorage `al-filo-layout-v8` como {i, col, row}.
  const [savedPositions, setSavedPositions] = useState<SavedPos[] | null>(null);
  const [userPositions, setUserPositions] = useState<Map<WidgetId, { col: number; row: number }>>(
    () => new Map(),
  );
  const [layoutMounted, setLayoutMounted] = useState(false);
  // Z-order dinámico: el último widget tocado va al frente (z-index más alto).
  // Esto arregla el bug donde, tras arrastrar un widget encima de otro, los
  // clicks sobre el header del widget "tapado" los comía el que quedó encima.
  const [zOrder, setZOrder] = useState<WidgetId[]>([]);

  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [gridWidth, setGridWidth] = useState<number>(1400);

  // Drag state: widget being dragged + offset pointer-from-widget-origin (px)
  const [dragWidget, setDragWidget] = useState<WidgetId | null>(null);
  const dragOffsetRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  // Ref al layout actual con render-time pixels, para que el mousedown handler
  // (declarado antes del memo) pueda leer la última posición sin ciclo de deps.
  const layoutRef = useRef<
    { id: WidgetId; col: number; row: number; widthType: CardWidth; blocks: number }[]
  >([]);

  useEffect(() => {
    const saved = loadSavedPositions();
    setSavedPositions(saved);
    if (saved) {
      const m = new Map<WidgetId, { col: number; row: number }>();
      for (const p of saved) m.set(p.i as WidgetId, { col: p.col, row: p.row });
      setUserPositions(m);
    }
    setLayoutMounted(true);
  }, []);

  useEffect(() => {
    const el = gridContainerRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setGridWidth(w);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [layoutMounted]);

  // Drag handlers (window listeners, se activan mientras haya dragWidget).
  // Snap continuo a (col, row): mientras el mouse se mueve, calculamos qué
  // celda de la grilla contiene el puntero (restando el anchor offset), y
  // clampeamos para que la card quepa en [0, GRID_COLUMNS-widthType].
  useEffect(() => {
    if (!dragWidget) return;
    const el = gridContainerRef.current;
    if (!el) return;
    const widthType = WIDGET_WIDTH[dragWidget];

    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const unit = getUnit(rect.width);
      const rawX = e.clientX - rect.left - dragOffsetRef.current.dx;
      const rawY = e.clientY - rect.top - dragOffsetRef.current.dy;

      // rawX/Y son el top-left deseado (anchor) de la card.
      // Invertimos getAnchorX/Y: col = (rawX - 0.05*unit) / unit
      const colF = (rawX - ANCHOR_OFFSET_RATIO * unit) / unit;
      const rowF = (rawY - ANCHOR_OFFSET_RATIO * unit) / (ROW_HEIGHT_RATIO * unit);
      const snapped = clampGridPos(colF, rowF, widthType);

      setUserPositions((prev) => {
        const cur = prev.get(dragWidget);
        if (cur && cur.col === snapped.col && cur.row === snapped.row) return prev;
        const next = new Map(prev);
        next.set(dragWidget, snapped);
        return next;
      });
    };
    const onUp = () => {
      setDragWidget(null);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [dragWidget]);

  // Persistir cuando el drag termina
  useEffect(() => {
    if (dragWidget || !layoutMounted) return;
    if (userPositions.size === 0) return;
    const slim: SavedPos[] = Array.from(userPositions.entries()).map(([i, p]) => ({
      i,
      col: p.col,
      row: p.row,
    }));
    savePositions(slim);
    setSavedPositions(slim);
  }, [dragWidget, userPositions, layoutMounted]);

  // mousedown en container → si el target está dentro de un .rgl-drag-handle,
  // identificar el widget por data-widget-id y empezar drag.
  const handleContainerMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    const handle = target.closest(".rgl-drag-handle");
    if (!handle) return;
    const widgetEl = handle.closest("[data-widget-id]") as HTMLElement | null;
    if (!widgetEl) return;
    const id = widgetEl.getAttribute("data-widget-id") as WidgetId | null;
    if (!id) return;
    const wrapper = widgetEl.parentElement;
    if (!wrapper) return;
    const widgetRect = wrapper.getBoundingClientRect(); // parent = positioned wrapper
    dragOffsetRef.current = {
      dx: e.clientX - widgetRect.left,
      dy: e.clientY - widgetRect.top,
    };
    // Subir este widget al tope del z-order (último tocado = más adelante).
    setZOrder((prev) => {
      const filtered = prev.filter((x) => x !== id);
      filtered.push(id);
      return filtered;
    });
    setDragWidget(id);
    e.preventDefault();
  }, []);

  const handleResetLayout = useCallback(() => {
    setSavedPositions(null);
    setUserPositions(new Map());
    try { localStorage.removeItem(LAYOUT_STORAGE_KEY); } catch {}
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

  // ─── Visibilidad por widget (ocultamos los que no tienen contenido) ──────
  // IMPORTANTE: estos hooks deben ir ANTES de los early returns para no
  // violar las Rules of Hooks de React (si no, cuando `isLoading`/`!shipInfo`
  // pasa de true→false el número de hooks cambia y React crashea).
  const shieldCount = useful.filter((hp) => hp.resolvedCategory === "SHIELD").length;
  const powerPlantCount = useful.filter((hp) => hp.resolvedCategory === "POWER_PLANT").length;
  const coolerCount = useful.filter((hp) => hp.resolvedCategory === "COOLER").length;
  const quantumCount = useful.filter((hp) => hp.resolvedCategory === "QUANTUM_DRIVE").length;
  const radarCount = useful.filter((hp) => hp.resolvedCategory === "RADAR").length;
  const utilityCount = useful.filter((hp) => hp.resolvedCategory === "UTILITY" || hp.resolvedCategory === "MINING").length;

  const visibleIds = useMemo<Set<WidgetId>>(() => {
    const s = new Set<WidgetId>();
    for (const id of ALL_WIDGET_IDS) {
      if (id === "weapons"      && weaponHps.length === 0) continue;
      if (id === "missiles"     && missileHps.length === 0) continue;
      if (id === "shields"      && shieldCount === 0) continue;
      if (id === "powerplants"  && powerPlantCount === 0) continue;
      if (id === "coolers"      && coolerCount === 0) continue;
      if (id === "quantum"      && quantumCount === 0) continue;
      if (id === "radar"        && radarCount === 0) continue;
      if (id === "utility"      && utilityCount === 0) continue;
      s.add(id);
    }
    return s;
  }, [weaponHps.length, missileHps.length, shieldCount, powerPlantCount, coolerCount, quantumCount, radarCount, utilityCount]);

  // ─── Bloques verticales por widget (altura fija, deriva de UNIT) ─────────
  const widgetBlocks = useMemo<Record<WidgetId, number>>(() => {
    const counts = {
      weapons: weaponHps.length,
      missiles: missileHps.length,
      shields: shieldCount,
      powerplants: powerPlantCount,
      coolers: coolerCount,
      quantum: quantumCount,
      radar: radarCount,
      utility: utilityCount,
    };
    const out = {} as Record<WidgetId, number>;
    for (const id of ALL_WIDGET_IDS) {
      out[id] = getWidgetBlocks(id, counts);
    }
    return out;
  }, [weaponHps.length, missileHps.length, shieldCount, powerPlantCount, coolerCount, quantumCount, radarCount, utilityCount]);

  // ─── Layout final: posiciones (col, row) + render-time pixels ───────────
  // Cada item del layout lleva tanto las coordenadas de grilla (persistidas
  // y usadas por el drag) como su proyección a px (usada por el render).
  type GridItem = {
    id: WidgetId;
    col: number;
    row: number;
    widthType: CardWidth;
    blocks: number;
    // render-time pixels (derivados de (col, row, widthType, blocks) + UNIT)
    x: number;
    y: number;
    w: number;
    h: number;
  };
  const layout = useMemo<GridItem[]>(() => {
    if (!layoutMounted || gridWidth <= 0) return [];

    const unit = getUnit(gridWidth);

    // Defaults alineados a la grilla (cambian si cambian blocks/visibleIds)
    const defaults = buildDefaultPositions(visibleIds, widgetBlocks);

    // Posiciones finales: default + override del usuario (clampeado)
    const positions = new Map<WidgetId, { col: number; row: number }>();
    for (const [id, p] of defaults) positions.set(id, p);
    for (const [id, p] of userPositions) {
      if (!visibleIds.has(id)) continue;
      const clamped = clampGridPos(p.col, p.row, WIDGET_WIDTH[id]);
      positions.set(id, clamped);
    }

    const result: GridItem[] = [];
    for (const id of Array.from(visibleIds)) {
      const pos = positions.get(id) ?? { col: 0, row: 0 };
      const widthType = WIDGET_WIDTH[id];
      const blocks = widgetBlocks[id];
      result.push({
        id,
        col: pos.col,
        row: pos.row,
        widthType,
        blocks,
        x: getAnchorX(pos.col, unit),
        y: getAnchorY(pos.row, unit),
        w: getCardWidth(widthType, unit),
        h: getCardHeight(blocks, unit),
      });
    }
    // ship-selector al final para que su dropdown (z-index) se pinte por
    // encima de los widgets vecinos sin trucos extra de stacking.
    result.sort((a, b) => {
      if (a.id === "ship-selector") return 1;
      if (b.id === "ship-selector") return -1;
      return 0;
    });
    return result;
  }, [layoutMounted, gridWidth, visibleIds, widgetBlocks, userPositions]);

  // Mantener el ref sincronizado con el layout actual (lo usa el mousedown
  // handler que está declarado antes del memo).
  useEffect(() => {
    layoutRef.current = layout.map((it) => ({
      id: it.id, col: it.col, row: it.row, widthType: it.widthType, blocks: it.blocks,
    }));
  }, [layout]);

  // Alto total del container = máximo (row + blocks) proyectado a px.
  const totalHeight = useMemo(() => {
    if (layout.length === 0) return 0;
    const unit = getUnit(gridWidth);
    let maxBottomRow = 0;
    for (const it of layout) {
      const bottomRow = it.row + it.blocks;
      if (bottomRow > maxBottomRow) maxBottomRow = bottomRow;
    }
    // bottom px = (maxBottomRow * 0.25 + 0.05) * UNIT + pequeño pad
    return (maxBottomRow * ROW_HEIGHT_RATIO + ANCHOR_OFFSET_RATIO) * unit + 16;
  }, [layout, gridWidth]);

  const { user } = useAuth();
  const supabaseClient = createClient();

  const handleSelect = useCallback((item: EquippedItem) => { if (!pickerHp) return; equipItem(pickerHp.id, item); setPickerHp(null); }, [pickerHp, equipItem]);
  const handleClear = useCallback(() => { if (!pickerHp) return; clearSlot(pickerHp.id); setPickerHp(null); }, [pickerHp, clearSlot]);
  const handleCopyLink = useCallback(() => { navigator.clipboard.writeText(window.location.href).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }, []);

  const handleSaveLoadout = useCallback(async () => {
    if (!user || !shipInfo || !saveName.trim()) return;
    setSaving(true);
    const buildCode = encodeBuild();

    // Save loadout
    const { data: loadout } = await supabaseClient.from("user_loadouts").insert({
      user_id: user.id,
      ship_id: shipInfo.reference,
      ship_name: shipInfo.name,
      name: saveName.trim(),
      build_code: buildCode,
    }).select().single();

    if (loadout) {
      // Save individual components
      const items: { loadout_id: string; hardpoint_name: string; item_reference: string; item_name: string; item_type: string; item_size: number | null }[] = [];
      for (const hp of hardpoints) {
        const item = getEffectiveItem(hp.id);
        if (item && item.type !== "FLIGHT_CONTROLLER" && item.type !== "SELF_DESTRUCT") {
          items.push({
            loadout_id: loadout.id,
            hardpoint_name: hp.hardpointName,
            item_reference: item.reference,
            item_name: item.name,
            item_type: item.type,
            item_size: item.size,
          });
        }
        // Also children (turret sub-weapons)
        for (const child of hp.children) {
          if (child.equippedItem) {
            items.push({
              loadout_id: loadout.id,
              hardpoint_name: child.hardpointName,
              item_reference: child.equippedItem.reference,
              item_name: child.equippedItem.name,
              item_type: child.equippedItem.type,
              item_size: child.equippedItem.size,
            });
          }
        }
      }
      if (items.length > 0) {
        await supabaseClient.from("loadout_items").insert(items);
      }
    }

    setSaving(false);
    setSaved(true);
    setSaveModal(false);
    setSaveName("");
    setTimeout(() => setSaved(false), 3000);
  }, [user, shipInfo, saveName, encodeBuild, hardpoints, getEffectiveItem, supabaseClient]);

  if (isLoading) return (<div className="flex items-center justify-center py-20"><div className="w-4 h-4 border-2 border-zinc-800 border-t-yellow-500 rounded-full animate-spin mr-3" /><span className="text-xs text-zinc-600 font-mono uppercase tracking-widest">Loading...</span></div>);
  if (error) return <div className="border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-400 font-mono">{error}</div>;
  if (!shipInfo) return null;

  const si = shipInfo as any;
  const fmtNum = (v: number | null) => v != null && v > 0 ? Math.round(v).toString() : "—";
  const fmtDec = (v: number | null) => v != null && v > 0 ? v.toFixed(1) : "—";
  const fmtMass = (v: number | null) => { if (!v || v <= 0) return "—"; if (v >= 1000000) return (v / 1000000).toFixed(1) + "M"; if (v >= 1000) return Math.round(v / 1000).toLocaleString() + "k"; return Math.round(v).toLocaleString(); };

  // Contexto compartido para renderWidget (evita pasar 15 props por llamada).
  const ctx = {
    weaponHps, missileHps, useful, store, setPickerHp,
    si, shipInfo, stats, flightMode, setFlightMode,
    fmtNum, fmtDec, fmtMass, cmDecoyCount, cmNoiseCount,
  };

  return (
    <div className="space-y-2">
      {/* ÔöÇÔöÇ Top Bar ÔöÇÔöÇ */}
      <div className="flex items-center justify-between px-2.5 py-1.5 bg-zinc-900/80 border border-zinc-800/60">
        <div className="flex items-center gap-4">
          <SigBadge icon="/icons/emp.png" label="EM" value={stats.emSignature} color="#a855f7" />
          <SigBadge icon="/icons/power_plants.png" label="IR" value={stats.irSignature} color="#f97316" />
          <div className="h-3 w-px bg-zinc-800/60" />
          <span className="text-[9px] font-mono text-zinc-600 tracking-wider">{stats.summary.activeComponents}/{stats.summary.totalComponents} ACTIVE</span>
          {hasChanges() && <span className="text-[9px] font-mono text-yellow-500/80 tracking-wider">{overrides.size} MOD</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={handleCopyLink} className={copied ? "text-[9px] font-mono uppercase tracking-wider px-2 py-1 border bg-green-950/30 text-green-500 border-green-800/50" : "text-[9px] font-mono uppercase tracking-wider px-2 py-1 border text-zinc-500 border-zinc-800 hover:text-yellow-500 hover:border-yellow-800/50 transition-colors"}>{copied ? "COPIED" : "SHARE"}</button>
          {user && (saved ? <span className="text-[9px] font-mono uppercase tracking-wider px-2 py-1 border bg-green-950/30 text-green-500 border-green-800/50">SAVED ✓</span> : <button onClick={() => { setSaveName(shipInfo?.name ? `${shipInfo.name} Build` : "Mi Build"); setSaveModal(true); }} className="text-[9px] font-mono uppercase tracking-wider px-2 py-1 border text-zinc-500 border-zinc-800 hover:text-emerald-500 hover:border-emerald-800/50 transition-colors">SAVE</button>)}
          {hasChanges() && <button onClick={resetAll} className="text-[9px] font-mono uppercase tracking-wider px-2 py-1 border text-orange-500/80 border-zinc-800 hover:border-orange-800/50 transition-colors">RESET</button>}
          <button onClick={handleResetLayout} className="text-[9px] font-mono uppercase tracking-wider px-2 py-1 border text-zinc-600 border-zinc-800 hover:text-cyan-500 hover:border-cyan-800/50 transition-colors" title="Reset panel layout to default">⟲ LAYOUT</button>
        </div>
      </div>

      {/* ── Main Grid — UNIT-based geometric layout + snap drag ── */}
      {/* gridContainerRef mide el ancho real del contenedor (vía ResizeObserver).
          Cada widget se renderiza como un <div absolute> con sus px derivados
          de (col, row, widthType, blocks) y UNIT. El handler onMouseDown
          detecta clicks sobre .rgl-drag-handle y arranca un drag que snapea
          continuamente a la celda más cercana de la grilla 5×N. */}
      <div
        ref={gridContainerRef}
        className="w-full relative mx-auto"
        style={{
          minHeight: totalHeight > 0 ? totalHeight : undefined,
          maxWidth: GRID_COLUMNS * MAX_UNIT_PX,
        }}
        onMouseDown={handleContainerMouseDown}
      >
        {layoutMounted && gridWidth > 0 && layout.map((item) => {
          const isDragging = dragWidget === item.id;
          // z-index dinámico: último tocado > previos tocados > default.
          // ship-selector se queda arriba siempre (dropdown), dragging por encima de todo.
          const touchedIdx = zOrder.indexOf(item.id);
          const dynZ = touchedIdx >= 0 ? 30 + touchedIdx : 10;
          const zIndex = isDragging
            ? 1000
            : item.id === "ship-selector"
              ? 500
              : dynZ;
          return (
            <div
              key={item.id}
              style={{
                position: "absolute",
                left: item.x,
                top: item.y,
                width: item.w,
                height: item.h,
                zIndex,
                transition: isDragging ? "none" : "left 120ms ease, top 120ms ease",
                willChange: isDragging ? "left, top" : undefined,
              }}
            >
              {renderWidget(item.id, ctx)}
            </div>
          );
        })}
      </div>

      {pickerHp && <ComponentPicker hardpoint={pickerHp} currentItemId={getEffectiveItem(pickerHp.id)?.id ?? null} onSelect={handleSelect} onClear={handleClear} onClose={() => setPickerHp(null)} />}

      {/* Save Loadout Modal */}
      {saveModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setSaveModal(false)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 w-80 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm text-zinc-200 font-medium">Guardar Loadout</h3>
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSaveLoadout()}
              placeholder="Nombre del loadout..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-amber-500 focus:outline-none"
              autoFocus
            />
            <div className="text-xs text-zinc-500">
              {shipInfo?.name} • {overrides.size} componentes modificados
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSaveLoadout}
                disabled={saving || !saveName.trim()}
                className="flex-1 py-1.5 bg-emerald-600/80 hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 text-sm font-medium rounded transition-colors"
              >
                {saving ? "Guardando..." : "Guardar"}
              </button>
              <button onClick={() => setSaveModal(false)} className="px-4 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-sm rounded transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
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
        <img src={icon} alt="" className="w-4 h-4" style={{ opacity: 0.7 }} />
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
      <img src={icon} alt="" className="w-3.5 h-3.5" style={{ opacity: 0.7 }} />
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
  const cx = size / 2, cy = size / 2, radius = size * 0.28, labelR = size * 0.42;
  const n = axes.length, step = (2 * Math.PI) / n, start = -Math.PI / 2;
  const normScm = axes.map(a => a.max > 0 ? Math.min(1, a.scm / a.max) : 0);
  const normBoost = axes.map(a => a.max > 0 ? Math.min(1, a.boost / a.max) : 0);
  const pts = (vals: number[]) => vals.map((v, i) => { const a = start + i * step; const r = v * radius; return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`; }).join(" ");
  const grids = Array.from({ length: gridLevels }, (_, i) => { const lv = (i + 1) / gridLevels; return axes.map((_, j) => { const a = start + j * step; const r = lv * radius; return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`; }).join(" "); });

  const scmColor = "#f59e0b";
  const boostColor = "#ef4444";

  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size, overflow: "hidden" }}>
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
            <text x={lx} y={ly - (hasBoost ? 6 : 3)} textAnchor={anchor} dominantBaseline="middle" className="fill-zinc-500" style={{ fontSize: "7.5px", fontFamily: "monospace" }}>{ax.label}</text>
            <text x={lx} y={ly + 5} textAnchor={anchor} dominantBaseline="middle" style={{ fontSize: "8.5px", fontFamily: "monospace", fill: scmColor, fontWeight: 600 }}>{ax.scm > 0 ? Math.round(ax.scm).toString() : "—"}</text>
            {hasBoost && (
              <text x={lx} y={ly + 15} textAnchor={anchor} dominantBaseline="middle" style={{ fontSize: "7.5px", fontFamily: "monospace", fill: boostColor, fontWeight: 500, opacity: 0.8 }}>{Math.round(ax.boost)}</text>
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

/** 3D Strafe Profile — isometric octahedron showing movement accelerations (m/s²) with SCM + AFB */
function StrafeProfile3D({ shipData }: { shipData: any }) {
  const fwd = shipData.accelForward ?? 0;
  const bwd = shipData.accelBackward ?? 0;
  const up = shipData.accelUp ?? 0;
  const down = shipData.accelDown ?? 0;
  const strafe = shipData.accelStrafe ?? 0;

  const scmSpd = shipData.scmSpeed ?? 1;
  const boostFwdSpd = shipData.boostSpeedForward ?? scmSpd;
  const boostBwdSpd = shipData.boostSpeedBackward ?? scmSpd;
  const ratioF = scmSpd > 0 ? Math.min(boostFwdSpd / scmSpd, 3) : 1.5;
  const ratioB = scmSpd > 0 ? Math.min(boostBwdSpd / scmSpd, 3) : 1.3;
  const boostMultUp = shipData.boostMultUp ?? 1.3;
  const boostMultStrafe = shipData.boostMultStrafe ?? 1.3;

  const afbFwd = fwd * ratioF;
  const afbBwd = bwd * ratioB;
  const afbUp = up * boostMultUp;
  const afbDown = down * boostMultUp;
  const afbStrafe = strafe * boostMultStrafe;

  const W = 280, H = 280;
  const cx = W / 2, cy = H / 2 + 5;

  const allVals = [fwd, bwd, up, down, strafe, afbFwd, afbBwd, afbUp, afbDown, afbStrafe].filter(v => v > 0);
  const maxVal = Math.max(...allVals, 30);
  const pixScale = 90 / maxVal;

  const ix = { x: Math.cos(Math.PI / 6), y: Math.sin(Math.PI / 6) };
  const iz = { x: -Math.cos(Math.PI / 6), y: Math.sin(Math.PI / 6) };
  const iy = { x: 0, y: -1 };

  const project = (x: number, y: number, z: number) => ({
    px: cx + (x * ix.x + z * iz.x + y * iy.x) * pixScale,
    py: cy + (x * ix.y + z * iz.y + y * iy.y) * pixScale,
  });

  const axLen = maxVal * 1.05;
  const xPos = project(axLen, 0, 0);
  const xNeg = project(-axLen, 0, 0);
  const yPos = project(0, axLen, 0);
  const zPos = project(0, 0, axLen);
  const zNeg = project(0, 0, -axLen);

  const scmPts = [
    project(strafe, 0, 0), project(0, up, 0), project(0, 0, fwd),
    project(-strafe, 0, 0), project(0, -down, 0), project(0, 0, -bwd),
  ];
  const afbPts = [
    project(afbStrafe, 0, 0), project(0, afbUp, 0), project(0, 0, afbFwd),
    project(-afbStrafe, 0, 0), project(0, -afbDown, 0), project(0, 0, -afbBwd),
  ];

  const edges = (pts: { px: number; py: number }[]) => {
    const pairs: [number, number][] = [
      [0,1],[0,2],[0,4],[0,5],[1,2],[1,3],[1,5],[2,4],[3,4],[3,5],[2,3],[4,5],
    ];
    return pairs;
  };

  const scmColor = "#f59e0b";
  const afbColor = "#ef4444";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: W, height: H, overflow: "hidden" }}>
      {/* XYZ axes */}
      <line x1={xNeg.px} y1={xNeg.py} x2={xPos.px} y2={xPos.py} stroke="#3f3f46" strokeWidth={0.5} />
      <line x1={cy} y1={project(0, axLen, 0).py} x2={cy} y2={project(0, -axLen * 0.6, 0).py} stroke="#3f3f46" strokeWidth={0.5} />
      <line x1={zNeg.px} y1={zNeg.py} x2={zPos.px} y2={zPos.py} stroke="#3f3f46" strokeWidth={0.5} />

      {/* Axis labels */}
      {[
        { p: xPos, text: "Strafe", dx: 4, dy: 3 },
        { p: zPos, text: "Fwd", dx: -8, dy: 12 },
        { p: zNeg, text: "Bwd", dx: 2, dy: -4 },
        { p: yPos, text: "Up", dx: 4, dy: 2 },
      ].map((item, i) => (
        <text key={`al-${i}`} x={item.p.px + item.dx} y={item.p.py + item.dy}
          style={{ fontSize: "7px", fontFamily: "monospace", fill: "#52525b" }}>{item.text}</text>
      ))}

      {/* AFB wireframe (red) */}
      {edges(afbPts).map(([a, b], i) => (
        <line key={`ae-${i}`} x1={afbPts[a].px} y1={afbPts[a].py} x2={afbPts[b].px} y2={afbPts[b].py}
          stroke={afbColor} strokeWidth={0.8} opacity={0.5} />
      ))}

      {/* SCM wireframe (orange) */}
      {edges(scmPts).map(([a, b], i) => (
        <line key={`se-${i}`} x1={scmPts[a].px} y1={scmPts[a].py} x2={scmPts[b].px} y2={scmPts[b].py}
          stroke={scmColor} strokeWidth={1.2} opacity={0.85} />
      ))}

      {/* SCM vertices */}
      {scmPts.map((p, i) => <circle key={`sv-${i}`} cx={p.px} cy={p.py} r={2} fill={scmColor} />)}
      {/* AFB vertices */}
      {afbPts.map((p, i) => <circle key={`av-${i}`} cx={p.px} cy={p.py} r={1.5} fill={afbColor} opacity={0.5} />)}
    </svg>
  );
}

/** Strafe Profile — Hex radar (6-axis) for acceleration */
function StrafeProfileRadar({ shipData }: { shipData: any }) {
  const fwd = shipData.accelForward ?? 0;
  const bwd = shipData.accelBackward ?? 0;
  const up = shipData.accelUp ?? 0;
  const down = shipData.accelDown ?? 0;
  const strafe = shipData.accelStrafe ?? 0;

  const scmSpd = shipData.scmSpeed ?? 1;
  const boostFwdSpd = shipData.boostSpeedForward ?? scmSpd;
  const boostBwdSpd = shipData.boostSpeedBackward ?? scmSpd;
  const ratioF = scmSpd > 0 ? Math.min(boostFwdSpd / scmSpd, 3) : 1.5;
  const ratioB = scmSpd > 0 ? Math.min(boostBwdSpd / scmSpd, 3) : 1.3;
  const boostMultUp = shipData.boostMultUp ?? 1.3;
  const boostMultStrafe = shipData.boostMultStrafe ?? 1.3;

  const afbFwd = fwd * ratioF;
  const afbBwd = bwd * ratioB;
  const afbUp = up * boostMultUp;
  const afbDown = down * boostMultUp;
  const afbStrafe = strafe * boostMultStrafe;

  const axes = [
    { label: "Fwd", scm: fwd, afb: afbFwd },
    { label: "Strafe R", scm: strafe, afb: afbStrafe },
    { label: "Down", scm: down, afb: afbDown },
    { label: "Bwd", scm: bwd, afb: afbBwd },
    { label: "Strafe L", scm: strafe, afb: afbStrafe },
    { label: "Up", scm: up, afb: afbUp },
  ];

  const globalMax = Math.max(...axes.map(a => Math.max(a.scm, a.afb)), 30);
  const size = 300;
  const cx = size / 2, cy = size / 2;
  const radius = size * 0.32;
  const n = 6;
  const step = (2 * Math.PI) / n;
  const startAngle = -Math.PI / 2;
  const gridLevels = 5;

  const gridStep = globalMax <= 50 ? 10 : globalMax <= 150 ? 25 : globalMax <= 500 ? 50 : 100;
  const gridValues = Array.from({ length: gridLevels }, (_, i) => Math.round(((i + 1) / gridLevels) * globalMax / gridStep) * gridStep).filter(v => v > 0 && v <= globalMax);

  const ptAt = (i: number, r: number) => {
    const a = startAngle + i * step;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };

  const polyPts = (vals: number[]) => vals.map((v, i) => {
    const norm = globalMax > 0 ? Math.min(1, v / globalMax) : 0;
    const p = ptAt(i, norm * radius);
    return `${p.x},${p.y}`;
  }).join(" ");

  const scmVals = axes.map(a => a.scm);
  const afbVals = axes.map(a => a.afb);
  const scmColor = "#f59e0b";
  const afbColor = "#ef4444";

  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size, overflow: "hidden" }}>
      {/* Grid rings */}
      {gridValues.map((v, gi) => {
        const r = (v / globalMax) * radius;
        const pts = Array.from({ length: n }, (_, i) => ptAt(i, r));
        return <polygon key={`g-${gi}`} points={pts.map(p => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#3f3f46" strokeWidth={0.5} opacity={0.4} />;
      })}
      {/* Axis lines */}
      {axes.map((_, i) => {
        const p = ptAt(i, radius);
        return <line key={`ax-${i}`} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#3f3f46" strokeWidth={0.5} opacity={0.3} />;
      })}
      {/* Grid value labels on first axis */}
      {gridValues.map((v, gi) => {
        const r = (v / globalMax) * radius;
        const p = ptAt(0, r);
        return <text key={`gv-${gi}`} x={p.x + 4} y={p.y - 3} style={{ fontSize: "6px", fontFamily: "monospace", fill: "#52525b" }}>{v}</text>;
      })}

      {/* AFB shape (behind) */}
      <polygon points={polyPts(afbVals)} fill={afbColor} fillOpacity={0.06} stroke={afbColor} strokeWidth={1} strokeLinejoin="round" strokeDasharray="3,2" opacity={0.6} />
      {afbVals.map((v, i) => {
        const norm = globalMax > 0 ? Math.min(1, v / globalMax) : 0;
        const p = ptAt(i, norm * radius);
        return v > 0 ? <circle key={`ab-${i}`} cx={p.x} cy={p.y} r={1.5} fill={afbColor} opacity={0.5} /> : null;
      })}

      {/* SCM shape (front) */}
      <polygon points={polyPts(scmVals)} fill={scmColor} fillOpacity={0.15} stroke={scmColor} strokeWidth={1.5} strokeLinejoin="round" />
      {scmVals.map((v, i) => {
        const norm = globalMax > 0 ? Math.min(1, v / globalMax) : 0;
        const p = ptAt(i, norm * radius);
        return v > 0 ? <circle key={`sv-${i}`} cx={p.x} cy={p.y} r={2.5} fill={scmColor} stroke="#18181b" strokeWidth={0.6} /> : null;
      })}

      {/* SCM value labels */}
      {axes.map((a, i) => {
        if (a.scm <= 0) return null;
        const norm = Math.min(1, a.scm / globalMax);
        const p = ptAt(i, norm * radius);
        const labelX = p.x + (p.x > cx ? 6 : p.x < cx ? -44 : -18);
        const labelY = p.y + (p.y > cy ? 12 : p.y < cy ? -5 : 3);
        return (
          <g key={`sl-${i}`}>
            <rect x={labelX - 2} y={labelY - 8} width={42} height={11} rx={2} fill="#18181b" fillOpacity={0.85} />
            <text x={labelX} y={labelY} style={{ fontSize: "7.5px", fontFamily: "monospace", fill: scmColor, fontWeight: 700 }}>{Math.round(a.scm)} m/s²</text>
          </g>
        );
      })}

      {/* Axis labels */}
      {axes.map((a, i) => {
        const labelR = radius + 14;
        const p = ptAt(i, labelR);
        const anchor = p.x > cx + 5 ? "start" : p.x < cx - 5 ? "end" : "middle";
        return <text key={`al-${i}`} x={p.x} y={p.y + 3} textAnchor={anchor}
          style={{ fontSize: "8px", fontFamily: "monospace", fill: "#a1a1aa", fontWeight: 600 }}>{a.label}</text>;
      })}

      {/* Legend */}
      <rect x={6} y={size - 18} width={7} height={7} rx={1.5} fill={scmColor} opacity={0.85} />
      <text x={16} y={size - 11} style={{ fontSize: "7px", fontFamily: "monospace", fill: "#71717a" }}>SCM</text>
      <rect x={46} y={size - 18} width={7} height={7} rx={1.5} fill={afbColor} opacity={0.65} />
      <text x={56} y={size - 11} style={{ fontSize: "7px", fontFamily: "monospace", fill: "#71717a" }}>AFB</text>
    </svg>
  );
}

/** Strafe Profile — Tab wrapper for 3D/Radar toggle */
function StrafeProfileTabs({ shipData }: { shipData: any }) {
  const [view, setView] = useState<"3d" | "radar">("3d");
  return (
    <div className="bg-zinc-900/80 border border-zinc-800/60 p-3">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[9px] font-mono text-zinc-500 tracking-[0.2em] uppercase">Strafe Profile</div>
        <div className="flex gap-0.5 bg-zinc-800/60 rounded p-0.5">
          <button onClick={() => setView("3d")}
            className={`px-2 py-0.5 text-[8px] font-mono rounded transition-colors ${view === "3d" ? "bg-zinc-700 text-zinc-200" : "text-zinc-500 hover:text-zinc-400"}`}>3D</button>
          <button onClick={() => setView("radar")}
            className={`px-2 py-0.5 text-[8px] font-mono rounded transition-colors ${view === "radar" ? "bg-zinc-700 text-zinc-200" : "text-zinc-500 hover:text-zinc-400"}`}>Radar</button>
        </div>
      </div>
      <div className="flex justify-center">
        {view === "3d" ? <StrafeProfile3D shipData={shipData} /> : <StrafeProfileRadar shipData={shipData} />}
      </div>
    </div>
  );
}

/** Turning Profiles — 3-axis radar chart for Pitch / Yaw / Roll with SCM + AFB */
function TurningProfileRadar({ shipData }: { shipData: any }) {
  const pitch = shipData.pitchRate ?? 0;
  const yaw = shipData.yawRate ?? 0;
  const roll = shipData.rollRate ?? 0;
  const boostPitch = shipData.boostedPitch ?? pitch;
  const boostYaw = shipData.boostedYaw ?? yaw;
  const boostRoll = shipData.boostedRoll ?? roll;

  // Use a single global max so the triangle shape reflects real proportions
  const globalMax = Math.max(pitch, yaw, roll, boostPitch, boostYaw, boostRoll, 50);

  const axes = [
    { label: "Pitch",  scm: pitch, boost: boostPitch, max: globalMax },
    { label: "Yaw",    scm: yaw,   boost: boostYaw,   max: globalMax },
    { label: "Roll",   scm: roll,  boost: boostRoll,  max: globalMax },
  ];

  // Custom 3-axis radar with dual layers (SCM + AFB)
  const size = 260;
  const cx = size / 2, cy = size / 2;
  const radius = size * 0.30;
  const labelR = size * 0.44;
  const n = 3;
  const step = (2 * Math.PI) / n;
  const start = -Math.PI / 2;
  const gridLevels = 5;

  const normScm = axes.map(a => a.max > 0 ? Math.min(1, a.scm / a.max) : 0);
  const normBoost = axes.map(a => a.max > 0 ? Math.min(1, a.boost / a.max) : 0);

  const pts = (vals: number[]) => vals.map((v, i) => {
    const a = start + i * step;
    const r = v * radius;
    return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
  }).join(" ");

  const grids = Array.from({ length: gridLevels }, (_, i) => {
    const lv = (i + 1) / gridLevels;
    return axes.map((_, j) => {
      const a = start + j * step;
      const r = lv * radius;
      return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
    }).join(" ");
  });

  const scmColor = "#f59e0b";
  const boostColor = "#ef4444";

  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size, overflow: "hidden" }}>
      {/* Grid polygons */}
      {grids.map((p, i) => <polygon key={i} points={p} fill="none" stroke="#3f3f46" strokeWidth={0.5} opacity={0.4} />)}
      {/* Axis lines */}
      {axes.map((_, i) => {
        const a = start + i * step;
        return <line key={i} x1={cx} y1={cy} x2={cx + radius * Math.cos(a)} y2={cy + radius * Math.sin(a)} stroke="#3f3f46" strokeWidth={0.5} opacity={0.3} />;
      })}

      {/* AFB layer (behind, dashed) */}
      <polygon points={pts(normBoost)} fill={boostColor} fillOpacity={0.08} stroke={boostColor} strokeWidth={1} strokeLinejoin="round" strokeDasharray="3,2" opacity={0.7} />
      {normBoost.map((v, i) => {
        const a = start + i * step;
        const r = v * radius;
        return v > 0 ? <circle key={`b${i}`} cx={cx + r * Math.cos(a)} cy={cy + r * Math.sin(a)} r={1.5} fill={boostColor} stroke="#18181b" strokeWidth={0.5} opacity={0.6} /> : null;
      })}

      {/* SCM layer (front, solid) */}
      <polygon points={pts(normScm)} fill={scmColor} fillOpacity={0.15} stroke={scmColor} strokeWidth={1.5} strokeLinejoin="round" />
      {normScm.map((v, i) => {
        const a = start + i * step;
        const r = v * radius;
        return <circle key={`s${i}`} cx={cx + r * Math.cos(a)} cy={cy + r * Math.sin(a)} r={2.5} fill={scmColor} stroke="#18181b" strokeWidth={0.8} />;
      })}

      {/* Labels with dual values */}
      {axes.map((ax, i) => {
        const a = start + i * step;
        const lx = cx + labelR * Math.cos(a);
        const ly = cy + labelR * Math.sin(a);
        let anchor = "middle";
        if (Math.cos(a) > 0.3) anchor = "start";
        else if (Math.cos(a) < -0.3) anchor = "end";
        const hasBoost = ax.boost > ax.scm;
        return (
          <g key={`l-${i}`}>
            <text x={lx} y={ly - (hasBoost ? 8 : 4)} textAnchor={anchor} dominantBaseline="middle" className="fill-zinc-400" style={{ fontSize: "9px", fontFamily: "monospace", fontWeight: 600 }}>{ax.label}</text>
            <text x={lx} y={ly + 5} textAnchor={anchor} dominantBaseline="middle" style={{ fontSize: "10px", fontFamily: "monospace", fill: scmColor, fontWeight: 600 }}>{ax.scm > 0 ? `${Math.round(ax.scm)}°/s` : "—"}</text>
            {hasBoost && (
              <text x={lx} y={ly + 17} textAnchor={anchor} dominantBaseline="middle" style={{ fontSize: "8.5px", fontFamily: "monospace", fill: boostColor, fontWeight: 500, opacity: 0.8 }}>{Math.round(ax.boost)}°/s</text>
            )}
          </g>
        );
      })}

      {/* Legend */}
      <rect x={4} y={size - 16} width={6} height={6} rx={1} fill={scmColor} opacity={0.8} />
      <text x={13} y={size - 10} className="fill-zinc-500" style={{ fontSize: "6px", fontFamily: "monospace" }}>SCM</text>
      <rect x={40} y={size - 16} width={6} height={6} rx={1} fill={boostColor} opacity={0.6} />
      <text x={49} y={size - 10} className="fill-zinc-500" style={{ fontSize: "6px", fontFamily: "monospace" }}>AFB</text>
    </svg>
  );
}

function GForce3DChart({ shipData }: { shipData: any }) {
  const G = 9.81;
  const fwdG = shipData.accelForwardG ?? (shipData.accelForward ?? 0) / G;
  const bwdG = shipData.accelBackwardG ?? (shipData.accelBackward ?? 0) / G;
  const upG = shipData.accelUpG ?? (shipData.accelUp ?? 0) / G;
  const downG = shipData.accelDownG ?? (shipData.accelDown ?? 0) / G;
  const strafeG = shipData.accelStrafeG ?? (shipData.accelStrafe ?? 0) / G;

  const scmFwd = shipData.scmSpeed ?? 1;
  const boostFwd = shipData.boostSpeedForward ?? scmFwd;
  const boostBwd = shipData.boostSpeedBackward ?? scmFwd;
  const boostRatio = scmFwd > 0 ? Math.min(boostFwd / scmFwd, 3) : 1.5;
  const boostRatioB = scmFwd > 0 ? Math.min(boostBwd / scmFwd, 3) : 1.3;
  const boostMultUp = shipData.boostMultUp ?? 1.3;
  const boostMultStrafe = shipData.boostMultStrafe ?? 1.3;

  const afbFwdG = fwdG * boostRatio;
  const afbBwdG = bwdG * boostRatioB;
  const afbUpG = upG * boostMultUp;
  const afbDownG = downG * boostMultUp;
  const afbStrafeG = strafeG * boostMultStrafe;

  const W = 280, H = 280;
  const cx = W / 2, cy = H / 2 + 5;

  const allG = [fwdG, bwdG, upG, downG, strafeG, afbFwdG, afbBwdG, afbUpG, afbDownG, afbStrafeG].filter(v => v > 0);
  const maxG = Math.max(...allG, 3);
  const pixScale = 90 / maxG;

  const ix = { x: Math.cos(Math.PI / 6), y: Math.sin(Math.PI / 6) };
  const iz = { x: -Math.cos(Math.PI / 6), y: Math.sin(Math.PI / 6) };
  const iy = { x: 0, y: -1 };

  const project = (x: number, y: number, z: number) => ({
    px: cx + (x * ix.x + z * iz.x + y * iy.x) * pixScale,
    py: cy + (x * ix.y + z * iz.y + y * iy.y) * pixScale,
  });

  const axLen = maxG * 1.05;
  const xPos = project(axLen, 0, 0);
  const xNeg = project(-axLen, 0, 0);
  const yPos = project(0, axLen, 0);
  const zPos = project(0, 0, axLen);
  const zNeg = project(0, 0, -axLen);

  const scmPts = [
    project(strafeG, 0, 0), project(0, upG, 0), project(0, 0, fwdG),
    project(-strafeG, 0, 0), project(0, -downG, 0), project(0, 0, -bwdG),
  ];
  const afbPts = [
    project(afbStrafeG, 0, 0), project(0, afbUpG, 0), project(0, 0, afbFwdG),
    project(-afbStrafeG, 0, 0), project(0, -afbDownG, 0), project(0, 0, -afbBwdG),
  ];

  const edgePairs: [number, number][] = [
    [0,1],[0,2],[0,4],[0,5],[1,2],[1,3],[1,5],[2,4],[3,4],[3,5],[2,3],[4,5],
  ];

  const scmColor = "#f59e0b";
  const afbColor = "#ef4444";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: W, height: H, overflow: "hidden" }}>
      {/* XYZ axes */}
      <line x1={xNeg.px} y1={xNeg.py} x2={xPos.px} y2={xPos.py} stroke="#3f3f46" strokeWidth={0.5} />
      <line x1={cx} y1={project(0, axLen, 0).py} x2={cx} y2={project(0, -axLen * 0.6, 0).py} stroke="#3f3f46" strokeWidth={0.5} />
      <line x1={zNeg.px} y1={zNeg.py} x2={zPos.px} y2={zPos.py} stroke="#3f3f46" strokeWidth={0.5} />

      {/* Axis labels */}
      {[
        { p: xPos, text: "Strafe", dx: 4, dy: 3 },
        { p: zPos, text: "Fwd", dx: -8, dy: 12 },
        { p: zNeg, text: "Bwd", dx: 2, dy: -4 },
        { p: yPos, text: "Up", dx: 4, dy: 2 },
      ].map((item, i) => (
        <text key={`al-${i}`} x={item.p.px + item.dx} y={item.p.py + item.dy}
          style={{ fontSize: "7px", fontFamily: "monospace", fill: "#52525b" }}>{item.text}</text>
      ))}

      {/* AFB wireframe (red) */}
      {edgePairs.map(([a, b], i) => (
        <line key={`ae-${i}`} x1={afbPts[a].px} y1={afbPts[a].py} x2={afbPts[b].px} y2={afbPts[b].py}
          stroke={afbColor} strokeWidth={0.8} opacity={0.5} />
      ))}

      {/* SCM wireframe (orange) */}
      {edgePairs.map(([a, b], i) => (
        <line key={`se-${i}`} x1={scmPts[a].px} y1={scmPts[a].py} x2={scmPts[b].px} y2={scmPts[b].py}
          stroke={scmColor} strokeWidth={1.2} opacity={0.85} />
      ))}

      {/* SCM vertices */}
      {scmPts.map((p, i) => <circle key={`sv-${i}`} cx={p.px} cy={p.py} r={2} fill={scmColor} />)}
      {/* AFB vertices */}
      {afbPts.map((p, i) => <circle key={`av-${i}`} cx={p.px} cy={p.py} r={1.5} fill={afbColor} opacity={0.5} />)}
    </svg>
  );
}

/** G-Force Profile — Hex radar (6-axis) for G-forces */
function GForceRadar({ shipData }: { shipData: any }) {
  const fwdG = shipData.accelForwardG ?? 0;
  const bwdG = shipData.accelBackwardG ?? 0;
  const upG = shipData.accelUpG ?? 0;
  const downG = shipData.accelDownG ?? 0;
  const strafeG = shipData.accelStrafeG ?? 0;

  const scmSpd = shipData.scmSpeed ?? 1;
  const boostFwdSpd = shipData.boostSpeedForward ?? scmSpd;
  const boostBwdSpd = shipData.boostSpeedBackward ?? scmSpd;
  const ratioF = scmSpd > 0 ? Math.min(boostFwdSpd / scmSpd, 3) : 1.5;
  const ratioB = scmSpd > 0 ? Math.min(boostBwdSpd / scmSpd, 3) : 1.3;
  const boostMultUp = shipData.boostMultUp ?? 1.3;
  const boostMultStrafe = shipData.boostMultStrafe ?? 1.3;

  const afbFwdG = fwdG * ratioF;
  const afbBwdG = bwdG * ratioB;
  const afbUpG = upG * boostMultUp;
  const afbDownG = downG * boostMultUp;
  const afbStrafeG = strafeG * boostMultStrafe;

  const axes = [
    { label: "Fwd", scm: fwdG, afb: afbFwdG },
    { label: "Strafe R", scm: strafeG, afb: afbStrafeG },
    { label: "Down", scm: downG, afb: afbDownG },
    { label: "Bwd", scm: bwdG, afb: afbBwdG },
    { label: "Strafe L", scm: strafeG, afb: afbStrafeG },
    { label: "Up", scm: upG, afb: afbUpG },
  ];

  const globalMax = Math.max(...axes.map(a => Math.max(a.scm, a.afb)), 3);
  const size = 280;
  const cx = size / 2, cy = size / 2;
  const radius = size * 0.32;
  const n = 6;
  const step = (2 * Math.PI) / n;
  const startAngle = -Math.PI / 2;

  const gridMarks = Array.from({ length: Math.ceil(globalMax) }, (_, i) => i + 1).filter(g => g <= globalMax);

  const ptAt = (i: number, r: number) => {
    const a = startAngle + i * step;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };

  const polyPts = (vals: number[]) => vals.map((v, i) => {
    const norm = globalMax > 0 ? Math.min(1, v / globalMax) : 0;
    const p = ptAt(i, norm * radius);
    return `${p.x},${p.y}`;
  }).join(" ");

  const scmVals = axes.map(a => a.scm);
  const afbVals = axes.map(a => a.afb);
  const scmColor = "#f59e0b";
  const afbColor = "#ef4444";

  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size, overflow: "hidden" }}>
      {/* Grid rings at each G */}
      {gridMarks.filter(g => g % (globalMax > 6 ? 2 : 1) === 0).map(g => {
        const r = (g / globalMax) * radius;
        const pts = Array.from({ length: n }, (_, i) => ptAt(i, r));
        return <polygon key={`g-${g}`} points={pts.map(p => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#3f3f46" strokeWidth={0.5} opacity={g % 2 === 0 ? 0.5 : 0.3} />;
      })}
      {/* Axis lines */}
      {axes.map((_, i) => {
        const p = ptAt(i, radius);
        return <line key={`ax-${i}`} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#3f3f46" strokeWidth={0.5} opacity={0.3} />;
      })}
      {/* G labels on first axis */}
      {gridMarks.filter(g => g % (globalMax > 6 ? 2 : 1) === 0).map(g => {
        const r = (g / globalMax) * radius;
        const p = ptAt(0, r);
        return <text key={`gv-${g}`} x={p.x + 4} y={p.y - 3} style={{ fontSize: "6.5px", fontFamily: "monospace", fill: "#52525b", fontWeight: 600 }}>{g}G</text>;
      })}

      {/* Human tolerance reference at 9G */}
      {globalMax > 7 && (() => {
        const r9 = (9 / globalMax) * radius;
        const pts9 = Array.from({ length: n }, (_, i) => ptAt(i, r9));
        return <polygon points={pts9.map(p => `${p.x},${p.y}`).join(" ")}
          fill="none" stroke="#dc2626" strokeWidth={0.5} strokeDasharray="2,3" opacity={0.4} />;
      })()}

      {/* AFB shape (behind) */}
      <polygon points={polyPts(afbVals)} fill={afbColor} fillOpacity={0.06} stroke={afbColor} strokeWidth={1} strokeLinejoin="round" strokeDasharray="3,2" opacity={0.6} />
      {afbVals.map((v, i) => {
        const norm = globalMax > 0 ? Math.min(1, v / globalMax) : 0;
        const p = ptAt(i, norm * radius);
        return v > 0 ? <circle key={`ab-${i}`} cx={p.x} cy={p.y} r={1.5} fill={afbColor} opacity={0.5} /> : null;
      })}

      {/* SCM shape (front) */}
      <polygon points={polyPts(scmVals)} fill={scmColor} fillOpacity={0.15} stroke={scmColor} strokeWidth={1.5} strokeLinejoin="round" />
      {scmVals.map((v, i) => {
        const norm = globalMax > 0 ? Math.min(1, v / globalMax) : 0;
        const p = ptAt(i, norm * radius);
        return v > 0 ? <circle key={`sv-${i}`} cx={p.x} cy={p.y} r={2.5} fill={scmColor} stroke="#18181b" strokeWidth={0.6} /> : null;
      })}

      {/* SCM value labels */}
      {axes.map((a, i) => {
        if (a.scm <= 0 || (i === 4 && axes[1].scm === a.scm)) return null;
        const norm = Math.min(1, a.scm / globalMax);
        const p = ptAt(i, norm * radius);
        const labelX = p.x + (p.x > cx ? 6 : p.x < cx ? -32 : -14);
        const labelY = p.y + (p.y > cy ? 12 : p.y < cy ? -5 : 3);
        return (
          <g key={`sl-${i}`}>
            <rect x={labelX - 2} y={labelY - 8} width={32} height={11} rx={2} fill="#18181b" fillOpacity={0.85} />
            <text x={labelX} y={labelY} style={{ fontSize: "7.5px", fontFamily: "monospace", fill: scmColor, fontWeight: 700 }}>{a.scm.toFixed(1)}G</text>
          </g>
        );
      })}

      {/* Axis labels */}
      {axes.map((a, i) => {
        const labelR = radius + 14;
        const p = ptAt(i, labelR);
        const anchor = p.x > cx + 5 ? "start" : p.x < cx - 5 ? "end" : "middle";
        return <text key={`al-${i}`} x={p.x} y={p.y + 3} textAnchor={anchor}
          style={{ fontSize: "8px", fontFamily: "monospace", fill: "#a1a1aa", fontWeight: 600 }}>{a.label}</text>;
      })}

      {/* Legend */}
      <rect x={6} y={size - 18} width={7} height={7} rx={1.5} fill={scmColor} opacity={0.85} />
      <text x={16} y={size - 11} style={{ fontSize: "7px", fontFamily: "monospace", fill: "#71717a" }}>SCM</text>
      <rect x={46} y={size - 18} width={7} height={7} rx={1.5} fill={afbColor} opacity={0.65} />
      <text x={56} y={size - 11} style={{ fontSize: "7px", fontFamily: "monospace", fill: "#71717a" }}>AFB</text>
    </svg>
  );
}

/** G-Force Profile — Tab wrapper for 3D/Radar toggle */
function GForceProfileTabs({ shipData }: { shipData: any }) {
  const [view, setView] = useState<"3d" | "radar">("3d");
  return (
    <div className="bg-zinc-900/80 border border-zinc-800/60 p-3">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[9px] font-mono text-zinc-500 tracking-[0.2em] uppercase">G-Force Profile</div>
        <div className="flex gap-0.5 bg-zinc-800/60 rounded p-0.5">
          <button onClick={() => setView("3d")}
            className={`px-2 py-0.5 text-[8px] font-mono rounded transition-colors ${view === "3d" ? "bg-zinc-700 text-zinc-200" : "text-zinc-500 hover:text-zinc-400"}`}>3D</button>
          <button onClick={() => setView("radar")}
            className={`px-2 py-0.5 text-[8px] font-mono rounded transition-colors ${view === "radar" ? "bg-zinc-700 text-zinc-200" : "text-zinc-500 hover:text-zinc-400"}`}>Radar</button>
        </div>
      </div>
      <div className="flex justify-center">
        {view === "3d" ? <GForce3DChart shipData={shipData} /> : <GForceRadar shipData={shipData} />}
      </div>
    </div>
  );
}
