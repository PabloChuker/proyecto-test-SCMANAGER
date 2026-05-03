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
//   ship-card, loadout-detail, flight-dynamics (unified 3D/Radar/Bars),
//   flight-dynamics-3d.
// =============================================================================

"use client";

import { useEffect, useState, useCallback, useRef, useMemo, memo } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useLoadoutStore } from "@/store/useLoadoutStore";
import { useShallow } from "zustand/react/shallow";
import type { ResolvedHardpoint, ResolvedChild, EquippedItem } from "@/store/useLoadoutStore";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { HardpointSlot, isUsefulSlot } from "./HardpointSlot";
import { ComponentPicker } from "./ComponentPicker";
import { PowerManagementPanel } from "./PowerManagementPanel";
import { ShipSelector } from "./ShipSelector";
import { fmtStat, fmtDps } from "./loadout-utils";
// ── Widget modules (each subscribes directly to the store) ───────────────────
// Strafe / Turning / G-Forces se unificaron en `FlightDynamicsWidget` (Fase G.1):
// una sola tarjeta 2-col con toggle 3D/Radar/Bars. Las importaciones viejas
// quedan como refs muertas — los archivos se conservan por si alguien quiere
// revivir el widget individual.
// FlightDynamicsWidget: Fase G.2 separó toolbar (va en el header del shell) de
// body (los 3 sub-paneles). El componente `FlightDynamicsCard` (abajo) compone
// ambos. `FlightDynamicsContent` sigue exportado en el widget para contextos
// legacy pero ya no se consume acá.
import {
  FlightDynamicsBody,
  FlightDynamicsToolbar,
  useFlightDynamicsView,
} from "./widgets/FlightDynamicsWidget";
import {
  FlightDynamics3dContent,
  FlightDynamics3dHeaderActions,
  useFlightDynamics3dBoost,
} from "./widgets/FlightDynamics3dWidget";
import { ShipCardContent }        from "./widgets/ShipCardWidget";
import { LoadoutDetailContent }   from "./widgets/LoadoutDetailWidget";
import { TTKCalculatorContent }   from "./widgets/TTKCalculatorWidget";
// Three.js (ShipFlightDynamicsSingle + shipGlbCandidates) moved to FlightDynamics3dWidget.tsx
import { useDpsGridLayout } from "@/lib/loadout-grid/useLoadoutGridLayout";
import { DpsGridCanvas } from "@/components/domain/loadout/LoadoutGridCanvas";

const WEAPON_GROUPS = new Set(["WEAPON", "TURRET"]);
const MISSILE_GROUPS = new Set(["MISSILE_RACK"]);

// ── Wishlist entry type (used by Send to Wishlist modal) ──────────────────
interface WishlistEntry {
  reference: string;
  name: string;
  localizedName?: string;
  type: string;
  size: number | null;
  selected: boolean;
  forShip: boolean;
}
const WISH_TYPE_ICONS: Record<string, string> = {
  WEAPON: "🔫", TURRET: "🔫", MISSILE: "🚀", MISSILE_RACK: "🚀",
  SHIELD: "🛡", POWER_PLANT: "⚡", COOLER: "❄",
  QUANTUM_DRIVE: "🌀", RADAR: "📡", UTILITY: "🔧", MINING: "⛏",
};


const CAT_CONFIG: Record<string, { label: string; icon: string; accent: string }> = {
  SHIELD: { label: "SHIELDS", icon: "/icons/shilds.png", accent: "#3b82f6" },
  POWER_PLANT: { label: "POWER PLANTS", icon: "/icons/power_plants.png", accent: "#22c55e" },
  COOLER: { label: "COOLERS", icon: "/icons/coolers.png", accent: "#06b6d4" },
  QUANTUM_DRIVE: { label: "QUANTUM DRIVES", icon: "/icons/Quantum_drives.png", accent: "#a855f7" },
  RADAR: { label: "RADAR", icon: "/icons/DPS_calculator.png", accent: "#22c55e" },
  MINING: { label: "MINING", icon: "/icons/mining_lasers.png", accent: "#f472b6" },
  UTILITY: { label: "UTILITY", icon: "/icons/tractor_beam.png", accent: "#94a3b8" },
  QIG: { label: "QUANTUM INTERDICTION", icon: "/icons/interdict.png", accent: "#7c3aed" },
};

// ── Widget System (free absolute positioning) ──────────────────────────────
// "flight-dynamics" (2-col, Fase G.1) reemplaza a strafe-profile / turning-profile
// / maneuver-radar — las 3 visualizaciones viven dentro con un toggle compartido.
type WidgetId =
  | "weapons" | "missiles"
  | "shields" | "powerplants" | "coolers"
  | "quantum" | "radar" | "utility"
  | "mining" | "salvage" | "qig"
  | "power-grid"
  | "ship-selector" | "ship-card" | "loadout-detail"
  | "flight-dynamics" | "flight-dynamics-3d"
  | "ttk-calculator";

// ── Industrial ship detection (Pablo, 2026-04-17) ────────────────────────────
// Solo estas naves muestran los widgets MINING / SALVAGE para no sobrecargar
// la UI en naves puramente combate. Si a futuro CIG saca más naves industriales
// se amplían los regex acá.
const MINING_SHIP_RX  = /mole|moth|prospector|golem/i;
const SALVAGE_SHIP_RX = /reclaimer|fortune|salvation|vulture/i;
// Fase N (2026-04-24): naves con QIG/QED/QDMP fijo — Mantis (Reynie), Cutlass
// Blue (Burke), Guardian QI (Captor). Mostramos el widget "qig" sólo en ellas.
const QIG_SHIP_RX = /mantis|cutlass[_\s-]*blue|guardian[_\s-]*qi/i;
function isMiningShip(name: string | null | undefined): boolean {
  return !!name && MINING_SHIP_RX.test(name);
}
function isSalvageShip(name: string | null | undefined): boolean {
  return !!name && SALVAGE_SHIP_RX.test(name);
}
function isQigShip(name: string | null | undefined): boolean {
  return !!name && QIG_SHIP_RX.test(name);
}

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
// v9: search (ship-selector), ship-card y flight-dynamics-3d vuelven a 2-col
// porque son widgets "hero" que necesitan ancho para respirar. El resto se
// queda en 1-col. loadout-detail sigue 1-col para dejarlo compacto junto a las
// stats derivadas.
type CardWidth = 1 | 2;
const WIDGET_WIDTH: Record<WidgetId, CardWidth> = {
  weapons: 1, missiles: 1,
  shields: 1, powerplants: 1, coolers: 1,
  quantum: 1, radar: 1, utility: 1,
  mining: 1, salvage: 1, qig: 1,
  "power-grid": 1,
  "ship-selector": 2,           // search → 2-col
  "ship-card": 2,               // ship card → 2-col
  "loadout-detail": 1,          // stays 1-col
  "flight-dynamics": 2,         // unified 3-en-1 card (Fase G.1) → 2-col
  "flight-dynamics-3d": 2,      // 3D viewer → 2-col
  "ttk-calculator": 1,          // W.16 — Time To Kill calc compacto (1 col)
};

const WIDGET_LABELS: Record<WidgetId, string> = {
  weapons: "WEAPONS", missiles: "MISSILES & BOMBS",
  shields: "SHIELDS", powerplants: "POWER PLANTS", coolers: "COOLERS",
  quantum: "QT DRIVES", radar: "RADAR", utility: "UTILITY",
  mining: "MINING LASERS", salvage: "SALVAGE & TRACTOR",
  qig: "QUANTUM INTERDICTION",
  "power-grid": "POWER GRID",
  "ship-selector": "SEARCH", "ship-card": "SHIP CARD", "loadout-detail": "LOADOUT DETAIL",
  "flight-dynamics": "FLIGHT DYNAMICS",
  "flight-dynamics-3d": "FLIGHT DYNAMICS 3D",
  "ttk-calculator": "TTK CALCULATOR",
};

const ALL_WIDGET_IDS: WidgetId[] = [
  "weapons", "missiles",
  "shields", "powerplants", "coolers",
  "quantum", "radar", "utility",
  "mining", "salvage", "qig",
  "power-grid",
  "ship-selector", "ship-card", "loadout-detail",
  "flight-dynamics", "flight-dynamics-3d",
  "ttk-calculator",
];

// ── Mobile fallback (Fase R.4, 2026-05-02) ───────────────────────────────────
// En `< md` (window < 768px) NO se monta react-grid-layout/dnd-kit: los widgets
// se apilan verticalmente en este orden (los más útiles primero). El layout
// desktop sigue idéntico — este array sólo se consume en móvil.
const MOBILE_WIDGET_ORDER: WidgetId[] = [
  "ship-card",
  "loadout-detail",
  "ttk-calculator",
  "weapons",
  "missiles",
  "shields",
  "powerplants",
  "coolers",
  "power-grid",
  "quantum",
  "flight-dynamics",
  "flight-dynamics-3d",
  "radar",
  "utility",
  "mining",
  "salvage",
  "qig",
  "ship-selector",
];

// ─── Missile rack helpers (Loadout.2, 2026-05-03) ──────────────────────────
// Parser canónico del nombre del rack: MSD-XYZ / CST-XYZ / similar.
//   X = tamaño del rack (anclaje)
//   Y = cantidad de misiles/bombas (# slots)
//   Z = tamaño de cada misil/bomba
// Ej: MSD-322 → S3, 2 misiles S2. CST-313 → S3, 1 bomba S3. MSD-441 → 4 misiles S1.
//
// PRIORIDAD: name-parse PRIMERO, componentStats fallback.
// Motivo: la BD (missile_launchers.missile_count + ports.length) viene del
// extractor scunpacked y para algunos racks chicos cuenta puertos físicos del
// modelo 3D en lugar de slots lógicos del juego — ej. MSD-212 / MSD-313
// salen como `missilePorts=2` cuando deberían ser 1. El nombre del rack es
// la fuente más confiable porque CIG lo define con la convención XYZ.
function parseMissileRackSpec(rack: any | null | undefined): { slots: number; portSize: number } {
  if (!rack) return { slots: 0, portSize: 0 };
  const nameForParse = rack.localizedName || rack.name || "";
  const match = String(nameForParse).match(/-(\d)(\d)(\d)(?:\b|[^0-9])/);
  if (match) {
    return {
      slots: Number(match[2]),
      portSize: Number(match[3]),
    };
  }
  // Fallback: para racks con naming no-estándar (raros).
  return {
    slots: Number(rack.componentStats?.missilePorts ?? 0),
    portSize: Number(
      rack.componentStats?.maxMissileSize
        ?? rack.componentStats?.minMissileSize
        ?? 0
    ),
  };
}

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
    mining: number; salvage: number; qig: number;
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
    case "mining":             return hpBlocks(counts.mining);
    case "salvage":            return hpBlocks(counts.salvage);
    case "qig":                return hpBlocks(counts.qig);
    case "power-grid":         return 4;
    case "ship-selector":      return 2;
    case "ship-card":          return 3;
    case "loadout-detail":         return 7;
    // flight-dynamics (Fase G.1): 3 sub-paneles lado a lado + header/toggle.
    // Necesita alto suficiente para el radar 6-ejes y los labels perimetrales.
    case "flight-dynamics":    return 6;
    case "flight-dynamics-3d": return 5;
    // ttk-calculator (W.16): dropdown + 3 stat cards + lista weapons.
    // Altura razonable para fighters con ~6 weapons; en capitales puede
    // necesitar scroll, pero el bloque de 6 cubre el caso default.
    case "ttk-calculator":     return 6;
  }
}

// ─── Category-based layout (v9) ─────────────────────────────────────────────
// Zone A — 1-col widgets apilados en cols 0..2 (3 columnas, categorizado).
// Zone B — 2-col widgets "hero" apilados en cols 3..4 (sidebar de ship info).
// Cada zona ordena sus widgets en la lista del plan; widgets ocultos se
// saltan sin rebalanceo para conservar la identidad visual de cada columna.
// v14 (Fase G.3 — layout validado por Pablo en captura 2026-04-21):
// ship-card se mueve al TOPE de col0 (w=2 → hace hero arriba-izquierda cubriendo
// cols 0-1). quantum + radar bajan de col2 → col1 (nav+sensors al lado de
// defense/power). col2 queda liviana: power-grid arriba, loadout-detail debajo.
// Resultado: sidebar = solo search + flight-dynamics (3D + unified), todo el
// ship info vive arriba-izquierda, analíticas del lado derecho.
const COLUMN_PLAN_1COL: WidgetId[][] = [
  // Col 0 — SHIP HERO + OFFENSE + INDUSTRY. ship-card (w=2) ocupa cols 0-1 en
  // la primera fila; las siguientes tarjetas (weapons, mining, salvage, missiles)
  // caen abajo en col 0 (w=1). mining/salvage reemplazan visualmente a weapons
  // cuando la nave es industrial.
  ["ship-card", "weapons", "mining", "salvage", "qig", "missiles"],
  // Col 1 — DEFENSE + POWER + NAV/SENSORS
  ["shields", "powerplants", "coolers", "quantum", "radar"],
  // Col 2 — ANALYTICS: power grid + combat summary + ttk + utility hardpoints
  ["power-grid", "loadout-detail", "ttk-calculator", "utility"],
];

// Sidebar 2-col (cols 3-4). Widgets hero apilados vertical.
// ship-card ya NO vive acá (se mudó a col0 en v14).
const COLUMN_PLAN_2COL_START = 3;
const COLUMN_PLAN_2COL: WidgetId[] = [
  "ship-selector",     // search
  "flight-dynamics-3d",
  "flight-dynamics",
];

// Posiciones default en coordenadas (col, row). Pass 1: Zone A (1-col, cols
// 0-2). Pass 2: Zone B (2-col, cols 3-4). Los widgets ocultos NO ocupan
// espacio. Determinístico — sin bin-packing.
function buildDefaultPositions(
  visible: Set<WidgetId>,
  blocks: Record<WidgetId, number>,
): Map<WidgetId, { col: number; row: number }> {
  const result = new Map<WidgetId, { col: number; row: number }>();

  // Zone A — 1-col en cols 0..2
  for (let col = 0; col < COLUMN_PLAN_1COL.length; col++) {
    let row = 0;
    for (const wId of COLUMN_PLAN_1COL[col]) {
      if (!visible.has(wId)) continue;
      result.set(wId, { col, row });
      row += blocks[wId];
    }
  }

  // Zone B — 2-col en cols 3-4 (siempre arrancan en col=3)
  {
    let row = 0;
    for (const wId of COLUMN_PLAN_2COL) {
      if (!visible.has(wId)) continue;
      result.set(wId, { col: COLUMN_PLAN_2COL_START, row });
      row += blocks[wId];
    }
  }

  return result;
}

// ─── localStorage (v13: unify Strafe/Turning/G-Forces en flight-dynamics) ──
// Fase G.1 — pedido de Pablo (profesional 20k+ horas): las 3 tarjetas pequeñas
// de flight dynamics se fusionaron en una 2-col con toggle 3D/Radar/Bars. Los
// IDs `strafe-profile` / `turning-profile` / `maneuver-radar` desaparecieron
// del plan por defecto y posiciones guardadas en v12 que los referenciaban
// dejarían huecos en el layout → bump a v13 para forzar reset del default.
const LAYOUT_STORAGE_KEY = "al-filo-layout-v13";

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
// WidgetShell — content-sized card (v10). La card crece con su contenido: el
// outer contenedor NO tiene altura fija. El header se mantiene compacto y el
// children renderiza en su tamaño natural. `overflow="visible"` sólo aplica a
// widgets que abren popups (ship-selector) para que los dropdowns invadan
// vecinos sin clip.
const collapsedSet = new Set<WidgetId>();

function WidgetShell({ id, label, icon, badge, headerActions, children, overflow = "hidden" }: {
  id: WidgetId;
  label: string;
  icon?: string;
  badge?: string | number;
  /** Fase G.2: slot para controles custom en el header (ej. toggle 3D/Radar/Bars). */
  headerActions?: React.ReactNode;
  children: React.ReactNode;
  overflow?: "hidden" | "visible";
}) {
  const [collapsed, setCollapsed] = useState(() => collapsedSet.has(id));
  const toggle = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      if (next) collapsedSet.add(id); else collapsedSet.delete(id);
      return next;
    });
  }, [id]);
  const outerOverflow = overflow === "visible" ? "overflow-visible" : "overflow-hidden";
  return (
    <div className={`flex flex-col ${outerOverflow} rounded-sm`} data-widget-id={id}>
      <div className="rgl-drag-handle flex items-center gap-2 px-2.5 py-2 bg-zinc-950/60 border border-zinc-800/30 border-b-0 select-none group rounded-t-sm shrink-0 cursor-grab active:cursor-grabbing">
        {icon && <Image src={icon} alt="" width={16} height={16} className="brightness-125" />}
        <span className="text-[11px] font-mono font-bold text-zinc-300 tracking-[0.12em] group-hover:text-zinc-100 transition-colors uppercase">{label}</span>
        <span className="flex-1" />
        {headerActions && (
          <div
            className="rgl-no-drag flex items-center"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {headerActions}
          </div>
        )}
        {badge != null && <span className="text-[10px] font-mono font-semibold text-zinc-500">{badge}</span>}
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); toggle(); }}
          className="rgl-no-drag ml-1 w-5 h-5 flex items-center justify-center rounded hover:bg-zinc-700/40 transition-colors cursor-pointer"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" className={"text-zinc-400 transition-transform duration-200 " + (collapsed ? "-rotate-90" : "")}>
            <path d="M2 3.5 L5 6.5 L8 3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {!collapsed && (
        <div className="min-h-0">
          {children}
        </div>
      )}
    </div>
  );
}

// ── FlightDynamicsCard (Fase G.2) ───────────────────────────────────────────
// Component dedicado: maneja el estado `view` compartido entre el toolbar
// (en el header del shell) y el body (los 3 sub-paneles). Viene acá (fuera
// de renderWidget) porque necesita usar hooks.
function FlightDynamicsCard() {
  const [view, setView] = useFlightDynamicsView();
  return (
    <WidgetShell
      id="flight-dynamics"
      label={WIDGET_LABELS["flight-dynamics"]}
      headerActions={<FlightDynamicsToolbar view={view} setView={setView} />}
    >
      <FlightDynamicsBody view={view} />
    </WidgetShell>
  );
}

// ── FlightDynamics3dCard (Fase U.6b) ────────────────────────────────────────
// Misma idea que FlightDynamicsCard: el card maneja el estado boost para
// poder inyectar el toggle "Boost" en el header del shell sin sacrificar
// espacio del contenido. El body recibe el `boost` y elige qué rates pasar.
function FlightDynamics3dCard({ wId }: { wId: WidgetId }) {
  const { boost, setBoost, hasBoost } = useFlightDynamics3dBoost();
  return (
    <WidgetShell
      id={wId}
      label={WIDGET_LABELS[wId]}
      headerActions={
        <FlightDynamics3dHeaderActions boost={boost} setBoost={setBoost} hasBoost={hasBoost} />
      }
    >
      <FlightDynamics3dContent boost={boost} />
    </WidgetShell>
  );
}

// ── Widget renderer — maps a WidgetId to its JSX content ──────────────────
// Stateful widgets (charts, ship-card, stats panels) are now imported from
// ./widgets/* and read the store themselves — they receive NO props from ctx,
// so React.memo() prevents their re-render when unrelated store state changes.
function renderWidget(
  wId: WidgetId,
  ctx: any,
): React.ReactNode {
  const { weaponHps, missileHps, useful, setPickerHp, handleClickHp, stats, flightMode, setFlightMode, weaponAllocatedPips, weaponMaxPips } = ctx;
  const W = (children: React.ReactNode, opts?: { icon?: string; badge?: string | number }) => (
    <WidgetShell id={wId} label={WIDGET_LABELS[wId]} icon={opts?.icon} badge={opts?.badge}>{children}</WidgetShell>
  );

  switch (wId) {
    case "weapons":
      return weaponHps.length > 0 ? W(<HpGroup hps={weaponHps} onClickHp={handleClickHp} weaponAllocatedPips={weaponAllocatedPips} weaponMaxPips={weaponMaxPips} />, { icon: "/icons/weapons.png", badge: weaponHps.length }) : null;
    case "missiles":
      return missileHps.length > 0 ? W(<HpGroup hps={missileHps} onClickHp={handleClickHp} />, { icon: "/icons/missile.png", badge: missileHps.length }) : null;
    case "shields": {
      const hps = useful.filter((hp: any) => hp.resolvedCategory === "SHIELD");
      return hps.length > 0 ? W(<HpGroup hps={hps} onClickHp={handleClickHp} />, { icon: CAT_CONFIG.SHIELD.icon, badge: hps.length }) : null;
    }
    case "powerplants": {
      const hps = useful.filter((hp: any) => hp.resolvedCategory === "POWER_PLANT");
      return hps.length > 0 ? W(<HpGroup hps={hps} onClickHp={handleClickHp} />, { icon: CAT_CONFIG.POWER_PLANT.icon, badge: hps.length }) : null;
    }
    case "coolers": {
      const hps = useful.filter((hp: any) => hp.resolvedCategory === "COOLER");
      return hps.length > 0 ? W(<HpGroup hps={hps} onClickHp={handleClickHp} />, { icon: CAT_CONFIG.COOLER.icon, badge: hps.length }) : null;
    }
    case "flight-dynamics":
      // Fase G.2: FlightDynamicsCard maneja su propio WidgetShell con el
      // toggle (3D/Radar/Bars) inyectado en el header. No pasamos por W()
      // porque necesitamos `headerActions` + estado compartido.
      return <FlightDynamicsCard />;
    case "flight-dynamics-3d":
      // Fase U.6b: Card dedicada (igual patrón que FlightDynamicsCard) para
      // poder inyectar el toggle BOOST en el header del shell. El estado se
      // comparte vía useFlightDynamics3dBoost.
      return <FlightDynamics3dCard wId={wId} />;
    case "quantum": {
      // Fase P.1 (2026-04-25): el widget QT DRIVES ahora muestra TANTO
      // QUANTUM_DRIVE (motor de salto local) COMO JUMP_DRIVE (módulo
      // inter-sistema). El JD viene como slot sintético inyectado en
      // ships/[id] cuando la nave tiene QT drive.
      const hps = useful.filter((hp: any) =>
        hp.resolvedCategory === "QUANTUM_DRIVE" || hp.resolvedCategory === "JUMP_DRIVE"
      );
      return hps.length > 0 ? W(<HpGroup hps={hps} onClickHp={handleClickHp} />, { icon: CAT_CONFIG.QUANTUM_DRIVE.icon, badge: hps.length }) : null;
    }
    case "radar": {
      const hps = useful.filter((hp: any) => hp.resolvedCategory === "RADAR");
      return hps.length > 0 ? W(<HpGroup hps={hps} onClickHp={handleClickHp} />, { icon: CAT_CONFIG.RADAR.icon, badge: hps.length }) : null;
    }
    case "utility": {
      // Puramente UTILITY (tractor beam, EMP, etc). MINING y SALVAGE tienen
      // widgets propios que aparecen solo en naves industriales.
      const hps = useful.filter((hp: any) => hp.resolvedCategory === "UTILITY");
      return hps.length > 0 ? W(<HpGroup hps={hps} onClickHp={handleClickHp} />, { icon: "/icons/tractor_beam.png", badge: hps.length }) : null;
    }
    case "mining": {
      // Solo naves mineras: ARGO Mole/Moth, MISC Prospector, Drake Golem.
      // Muestra láser minero + accesorios (módulos minería).
      const hps = useful.filter((hp: any) => hp.resolvedCategory === "MINING");
      return hps.length > 0 ? W(<HpGroup hps={hps} onClickHp={handleClickHp} />, { icon: "/icons/mining_lasers.png", badge: hps.length }) : null;
    }
    case "salvage": {
      // Solo naves salvage: Aegis Reclaimer, MISC Fortune, RSI Salvation.
      // Incluye láser de salvage + tractor beam + cargo accessories asociados.
      const hps = useful.filter((hp: any) => hp.resolvedCategory === "SALVAGE");
      return hps.length > 0 ? W(<HpGroup hps={hps} onClickHp={handleClickHp} />, { icon: "/icons/tractor_beam.png", badge: hps.length }) : null;
    }
    case "qig": {
      // Fase N: solo naves con QIG fijo — Mantis (Reynie QED, corta saltos),
      // Cutlass Blue (Burke QD) y Guardian QI (Captor QD). Los dos QDMP solo
      // jammean spooling (interdict ~1m). El slot es fixed=true, así que el
      // picker queda bloqueado.
      const hps = useful.filter((hp: any) => hp.resolvedCategory === "QIG");
      return hps.length > 0 ? W(<HpGroup hps={hps} onClickHp={handleClickHp} />, { icon: CAT_CONFIG.QIG.icon, badge: hps.length }) : null;
    }
    case "power-grid":
      return W(<PowerManagementPanel stats={stats} flightMode={flightMode} onModeChange={setFlightMode} />);
    case "ship-selector":
      return (
        <WidgetShell id={wId} label={WIDGET_LABELS[wId]} overflow="visible">
          <ShipSelector />
        </WidgetShell>
      );
    case "ship-card":
      return W(<ShipCardContent />);
    case "loadout-detail":
      return W(<LoadoutDetailContent />);
    case "ttk-calculator":
      return W(<TTKCalculatorContent />);
    default: return null;
  }
}

export default function LoadoutBuilder({ shipId = "titan" }: { shipId?: string }) {
  const searchParams = useSearchParams();

  // ── Zustand: granular selectors — each field triggers a re-render only when
  // it actually changes, instead of re-rendering on every store mutation.
  // instancePower + componentStates included so Zustand triggers a re-render
  // when the user adjusts power pips or toggles components on/off.
  const { shipInfo, isLoading, error, hardpoints, overrides, flightMode,
    instancePower: _ip, componentStates: _cs } = useLoadoutStore(
    useShallow(s => ({
      shipInfo: s.shipInfo,
      isLoading: s.isLoading,
      error: s.error,
      hardpoints: s.hardpoints,
      overrides: s.overrides,
      flightMode: s.flightMode,
      instancePower: s.instancePower,
      componentStates: s.componentStates,
    }))
  );
  // Suppress unused-var lint — these exist solely to trigger re-renders
  void _ip; void _cs;
  // Actions are stable references in Zustand — individual selectors never trigger re-renders.
  const loadShip      = useLoadoutStore(s => s.loadShip);
  const getStats      = useLoadoutStore(s => s.getStats);
  const getEffectiveItem = useLoadoutStore(s => s.getEffectiveItem);
  const equipItem     = useLoadoutStore(s => s.equipItem);
  const clearSlot     = useLoadoutStore(s => s.clearSlot);
  const resetAll      = useLoadoutStore(s => s.resetAll);
  const encodeBuild   = useLoadoutStore(s => s.encodeBuild);
  const toggleComponent = useLoadoutStore(s => s.toggleComponent);
  const isComponentOn = useLoadoutStore(s => s.isComponentOn);
  const setFlightMode = useLoadoutStore(s => s.setFlightMode);

  const [pickerHp, setPickerHp] = useState<ResolvedHardpoint | null>(null);
  // Cuando el picker abre para un slot hijo (ej. misil/bomba dentro de un
  // rack), guardamos el item padre completo. El picker lo usa para:
  // - className → decidir bomb vs missile rack
  // - componentStats.{min,max}MissileSize → heredar el size de los ports
  //   del rack equipado (no el ship loadout desfasado)
  // null cuando no hay contexto de padre (slot independiente).
  const [pickerParentItem, setPickerParentItem] = useState<EquippedItem | null>(null);
  // Algunos ships (Sabre Firebird, Perseus, Polaris, F8, etc.) tienen racks
  // de misiles integrados al fuselaje que NO son intercambiables — solo se
  // pueden cambiar los misiles que van adentro. La data los marca con
  // `isFixed=true` en el hardpoint MISSILE_RACK. Interceptamos el click para
  // no abrir el picker del padre; los slots hijos (MISSILE) siguen clickables
  // porque pasan por otro handler (onClickChild).
  // handleClickHp abre el picker. Recibe un segundo param opcional `parent`
  // (EquippedItem completo) que viene de los slots hijos (ej. misil dentro
  // de CST-313): el picker usa parent.className + parent.componentStats para
  // decidir qué tipo y qué size de ordenanza aceptar. Null para slots padres.
  const handleClickHp = useCallback((hp: ResolvedHardpoint, parent: EquippedItem | null = null) => {
    if (hp.resolvedCategory === "MISSILE_RACK" && hp.isFixed) return;
    setPickerParentItem(parent);
    setPickerHp(hp);
  }, []);
  // Share
  const [copied, setCopied] = useState(false);
  // Save Loadout modal
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveModal, setSaveModal] = useState(false);
  const [saveName, setSaveName] = useState("");
  // Save Layout flash feedback
  const [layoutSaved, setLayoutSaved] = useState(false);
  // Send to Wishlist modal
  const [wishlistModal, setWishlistModal] = useState(false);
  const [wishlistItems, setWishlistItems] = useState<WishlistEntry[]>([]);
  const [wishlistSending, setWishlistSending] = useState(false);
  const [wishlistSent, setWishlistSent] = useState(false);
  const mountedRef = useRef(false);
  const overrideCountRef = useRef(0);

  // ─── Geometric grid layout (v11 — useDpsGridLayout + DpsGridCanvas) ────────
  // El estado de posiciones, drag y persistencia vive en useDpsGridLayout.
  // DpsGridCanvas renderiza el canvas con posicionamiento absoluto y dnd-kit.
  // Este componente sólo necesita exponer: visibleIds, widgetBlocks, widgetWidth.

  useEffect(() => { if (mountedRef.current) return; mountedRef.current = true; const urlShip = searchParams.get("ship"); loadShip(urlShip || shipId, searchParams.get("build") || null); }, [shipId]);
  useEffect(() => {
    const c = overrides.size;
    if (!mountedRef.current) return;
    if (c === overrideCountRef.current && c === 0) return;
    overrideCountRef.current = c;
    const encoded = encodeBuild();
    const url = new URL(window.location.href);
    // Always stamp the ship reference so the URL is self-contained
    if (shipInfo?.reference) url.searchParams.set("ship", shipInfo.reference);
    if (encoded) url.searchParams.set("build", encoded);
    else url.searchParams.delete("build");
    window.history.replaceState({}, "", url.toString());
  }, [overrides, encodeBuild, shipInfo]);

  const stats = getStats();
  const useful = hardpoints.filter(hp => isUsefulSlot(hp, getEffectiveItem(hp.id)));
  const weaponHps = useful.filter(hp => WEAPON_GROUPS.has(hp.resolvedCategory));
  const missileHps = useful.filter(hp => MISSILE_GROUPS.has(hp.resolvedCategory));


  // ─── Visibilidad por widget (ocultamos los que no tienen contenido) ──────
  // IMPORTANTE: estos hooks deben ir ANTES de los early returns para no
  // violar las Rules of Hooks de React (si no, cuando `isLoading`/`!shipInfo`
  // pasa de true→false el número de hooks cambia y React crashea).
  const shieldCount = useful.filter((hp) => hp.resolvedCategory === "SHIELD").length;
  const powerPlantCount = useful.filter((hp) => hp.resolvedCategory === "POWER_PLANT").length;
  const coolerCount = useful.filter((hp) => hp.resolvedCategory === "COOLER").length;
  // QT DRIVES widget agrupa QUANTUM_DRIVE (motor local) + JUMP_DRIVE (módulo
  // inter-sistema, mig 058). Ambos se contabilizan en el mismo bucket para
  // que el alto del widget escale con el total de slots.
  const quantumCount = useful.filter((hp) =>
    hp.resolvedCategory === "QUANTUM_DRIVE" || hp.resolvedCategory === "JUMP_DRIVE"
  ).length;
  const radarCount = useful.filter((hp) => hp.resolvedCategory === "RADAR").length;
  // UTILITY puro (tractor beam, EMP, etc) — MINING y SALVAGE tienen widgets propios.
  const utilityCount = useful.filter((hp) => hp.resolvedCategory === "UTILITY").length;
  const miningCount  = useful.filter((hp) => hp.resolvedCategory === "MINING").length;
  const salvageCount = useful.filter((hp) => hp.resolvedCategory === "SALVAGE").length;
  const qigCount     = useful.filter((hp) => hp.resolvedCategory === "QIG").length;

  // Detección de rol industrial (gate para mostrar los widgets mining/salvage).
  const miningShip  = isMiningShip(shipInfo?.name);
  const salvageShip = isSalvageShip(shipInfo?.name);
  const qigShip     = isQigShip(shipInfo?.name);

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
      // Mining/Salvage/QIG: solo en naves del rol Y solo si hay hardpoints.
      if (id === "mining"       && (!miningShip  || miningCount === 0)) continue;
      if (id === "salvage"      && (!salvageShip || salvageCount === 0)) continue;
      if (id === "qig"          && (!qigShip     || qigCount === 0)) continue;
      s.add(id);
    }
    return s;
  }, [weaponHps.length, missileHps.length, shieldCount, powerPlantCount, coolerCount, quantumCount, radarCount, utilityCount, miningCount, salvageCount, qigCount, miningShip, salvageShip, qigShip]);

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
      mining: miningCount,
      salvage: salvageCount,
      qig: qigCount,
    };
    const out = {} as Record<WidgetId, number>;
    for (const id of ALL_WIDGET_IDS) {
      out[id] = getWidgetBlocks(id, counts);
    }
    return out;
  }, [weaponHps.length, missileHps.length, shieldCount, powerPlantCount, coolerCount, quantumCount, radarCount, utilityCount, miningCount, salvageCount, qigCount]);

  // ─── Mobile detection (Fase R.4) ──────────────────────────────────────────
  // Arranca en `false` (desktop) para evitar SSR mismatch — al hidratar en
  // cliente se actualiza al estado real del viewport. En móvil saltamos el
  // grid absolute-positioned y renderizamos un stack vertical más abajo.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // ─── Layout v12 — useDpsGridLayout + DpsGridCanvas ──────────────────────
  const gridLayout = useDpsGridLayout({
    visibleIds,
    widgetWidth: WIDGET_WIDTH,
    columnPlan1Col: COLUMN_PLAN_1COL,
    columnPlan2Col: COLUMN_PLAN_2COL,
  });

  const { user } = useAuth();
  const supabaseClient = createClient();

  // Fase O.2: en el juego de Star Citizen un missile/bomb rack solo acepta
  // UN tipo de ordenanza — todos los slots del rack llevan el mismo misil
  // o la misma bomba. El picker abre por slot individual, pero al confirmar
  // replicamos la selección a todos los slots hermanos del mismo rack para
  // reflejar la restricción real. Idem el "Clear slot": vacía todo el rack.
  //
  // Identificación: los slots child sintéticos llevan id con patrón
  // `${rackHpId}:missile:${i}` (ver resolveChildSlots). El picker recibe
  // pickerParentItem = rack equipado; usamos parseMissileRackSpec (Loadout.2)
  // para que el portCount coincida con la cantidad real de slots renderizados.
  const handleSelect = useCallback((item: EquippedItem) => {
    if (!pickerHp) return;
    const idMatch = pickerHp.id.match(/^(.+):missile:(\d+)$/);
    const portCount = parseMissileRackSpec(pickerParentItem).slots;
    if (idMatch && portCount > 1) {
      const rackHpId = idMatch[1];
      // 1) Slots sintéticos (lo que el LoadoutBuilder renderiza visualmente)
      for (let i = 1; i <= portCount; i++) {
        equipItem(`${rackHpId}:missile:${i}`, item);
      }
      // 2) Children del API del rack (lo que computeStats agrega para
      //    sumar damage de misiles al panel LOADOUT DETAIL). Sin esto, el
      //    daño de misiles quedaba en 0 después de cambiar de misil.
      const rack = hardpoints.find((h) => h.id === rackHpId);
      if (rack) {
        for (const ch of rack.children) equipItem(ch.id, item);
      }
    } else {
      equipItem(pickerHp.id, item);
    }
    setPickerHp(null);
  }, [pickerHp, pickerParentItem, equipItem, hardpoints]);

  const handleClear = useCallback(() => {
    if (!pickerHp) return;
    const idMatch = pickerHp.id.match(/^(.+):missile:(\d+)$/);
    // Mismo helper que handleSelect — single source of truth para el slot count.
    const portCount = parseMissileRackSpec(pickerParentItem).slots;
    if (idMatch && portCount > 1) {
      const rackHpId = idMatch[1];
      for (let i = 1; i <= portCount; i++) {
        clearSlot(`${rackHpId}:missile:${i}`);
      }
      const rack = hardpoints.find((h) => h.id === rackHpId);
      if (rack) {
        for (const ch of rack.children) clearSlot(ch.id);
      }
    } else {
      clearSlot(pickerHp.id);
    }
    setPickerHp(null);
  }, [pickerHp, pickerParentItem, clearSlot, hardpoints]);

  // ── SHARE: build URL with ship reference + current build code ──────────────
  const handleShare = useCallback(() => {
    const url = new URL(window.location.href);
    if (shipInfo?.reference) url.searchParams.set("ship", shipInfo.reference);
    const buildCode = encodeBuild();
    if (buildCode) url.searchParams.set("build", buildCode);
    else url.searchParams.delete("build");
    navigator.clipboard.writeText(url.toString()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [shipInfo, encodeBuild]);

  // ── SAVE LAYOUT: snapshot the current card positions ──────────────────────
  const handleSaveLayout = useCallback(() => {
    gridLayout.saveLayout();
    setLayoutSaved(true);
    setTimeout(() => setLayoutSaved(false), 2000);
  }, [gridLayout]);

  // ── SEND TO WISHLIST: open modal with all equipped items ──────────────────
  const SKIP_WISH_TYPES = new Set(["FLIGHT_CONTROLLER", "SELF_DESTRUCT", "AVIONICS_MANAGER"]);
  const handleWishlistOpen = useCallback(() => {
    const seen = new Set<string>();
    const items: WishlistEntry[] = [];
    for (const hp of hardpoints) {
      const item = getEffectiveItem(hp.id);
      if (item && !SKIP_WISH_TYPES.has(item.type) && !seen.has(item.reference)) {
        seen.add(item.reference);
        items.push({ reference: item.reference, name: item.localizedName || item.name, type: item.type, size: item.size, selected: true, forShip: true });
      }
      for (const child of hp.children) {
        const chItem = getEffectiveItem(child.id);
        if (chItem && !SKIP_WISH_TYPES.has(chItem.type) && !seen.has(chItem.reference)) {
          seen.add(chItem.reference);
          items.push({ reference: chItem.reference, name: chItem.localizedName || chItem.name, type: chItem.type, size: chItem.size, selected: true, forShip: true });
        }
      }
    }
    setWishlistItems(items);
    setWishlistSent(false);
    setWishlistModal(true);
  }, [hardpoints, getEffectiveItem]);

  const handleWishlistSubmit = useCallback(async () => {
    if (!user) return;
    const toAdd = wishlistItems.filter(i => i.selected);
    if (!toAdd.length) return;
    setWishlistSending(true);
    await supabaseClient.from("user_wishlist").upsert(
      toAdd.map(i => ({ user_id: user.id, item_reference: i.reference, item_name: i.name, item_type: i.type, item_size: i.size, priority: 2 })),
      { onConflict: "user_id,item_reference" }
    );
    setWishlistSending(false);
    setWishlistSent(true);
    setTimeout(() => { setWishlistModal(false); setWishlistSent(false); }, 1500);
  }, [user, wishlistItems, supabaseClient]);

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

  // Contexto compartido para renderWidget.
  // Los widgets de charts/stats/ship-card leen del store directamente
  // (ver widgets/*) — ctx sólo se usa para los HP-groups y power-grid.
  // Extract weapon allocated pips from the power network instances
  const weaponInstance = stats.powerNetwork.instances.find(
    (inst: any) => inst.hardpointName === "__weapons_combined__"
  );
  const weaponAllocatedPips = weaponInstance?.allocatedPips ?? 0;
  const weaponMaxPips = stats.weaponMaxPips ?? 0;

  const ctx = {
    weaponHps, missileHps, useful, setPickerHp, handleClickHp,
    stats, flightMode, setFlightMode,
    weaponAllocatedPips, weaponMaxPips,
  };

  return (
    <div className="space-y-2">
      {/* ── Top Bar ── */}
      <div className="flex items-center justify-end px-2.5 py-1.5 bg-zinc-900/80 border border-zinc-800/60">
        {/* Móvil: los 5 botones se envuelven a 2 filas si no caben.
            Desktop (md+): se mantienen en una sola fila como siempre. */}
        <div className="flex flex-wrap md:flex-nowrap items-center gap-1.5">
          {/* SHARE — copies a URL with ship + build code */}
          <button onClick={handleShare} className={copied ? "text-[9px] font-mono uppercase tracking-wider px-2 py-1 border bg-green-950/30 text-green-500 border-green-800/50" : "text-[9px] font-mono uppercase tracking-wider px-2 py-1 border text-zinc-500 border-zinc-800 hover:text-yellow-500 hover:border-yellow-800/50 transition-colors"} title="Copy shareable link with this loadout">
            {copied ? "✓ COPIED" : "SHARE"}
          </button>
          {/* SEND TO WISHLIST — opens item-selection modal */}
          <button onClick={handleWishlistOpen} className="text-[9px] font-mono uppercase tracking-wider px-2 py-1 border text-zinc-500 border-zinc-800 hover:text-purple-400 hover:border-purple-800/50 transition-colors" title="Add loadout items to your wishlist">
            SEND TO WISHLIST
          </button>
          {/* SAVE LAYOUT — snapshots current panel positions */}
          <button onClick={handleSaveLayout} className={layoutSaved ? "text-[9px] font-mono uppercase tracking-wider px-2 py-1 border bg-cyan-950/30 text-cyan-400 border-cyan-800/50" : "text-[9px] font-mono uppercase tracking-wider px-2 py-1 border text-zinc-500 border-zinc-800 hover:text-cyan-400 hover:border-cyan-800/50 transition-colors"} title="Save current panel arrangement as default">
            {layoutSaved ? "✓ SAVED" : "SAVE LAYOUT"}
          </button>
          {/* SAVE LOADOUT — saves build to my-account loadouts */}
          <button onClick={() => { setSaveName(shipInfo?.name ? `${shipInfo.name} Build` : "My Build"); setSaveModal(true); }} className={saved ? "text-[9px] font-mono uppercase tracking-wider px-2 py-1 border bg-emerald-950/30 text-emerald-400 border-emerald-800/50" : "text-[9px] font-mono uppercase tracking-wider px-2 py-1 border text-zinc-500 border-zinc-800 hover:text-emerald-500 hover:border-emerald-800/50 transition-colors"} title="Save this loadout to your account">
            {saved ? "✓ SAVED" : "SAVE LOADOUT"}
          </button>
          {/* RESET LOADOUT — reverts all component changes to ship defaults */}
          <button onClick={resetAll} className="text-[9px] font-mono uppercase tracking-wider px-2 py-1 border text-zinc-500 border-zinc-800 hover:text-orange-500 hover:border-orange-800/50 transition-colors" title="Revert all component changes to ship defaults">
            RESET LOADOUT
          </button>
          {/* RESET LAYOUT — restores saved panel layout (or default if none saved) */}
          <button onClick={gridLayout.resetLayout} className="text-[9px] font-mono uppercase tracking-wider px-2 py-1 border text-zinc-600 border-zinc-800 hover:text-zinc-400 hover:border-zinc-600/50 transition-colors" title="Restore to saved layout (or default)">
            RESET LAYOUT
          </button>
        </div>
      </div>

      {/* ── Main Grid ── */}
      {/* En móvil (<md): stack vertical con WidgetShells full-width, sin
          react-grid-layout/dnd-kit. El orden viene de MOBILE_WIDGET_ORDER y
          se filtra contra `visibleIds` para respetar la lógica condicional
          de combat/industrial.
          En desktop (>=md): DpsGridCanvas v11 — absolute positioning + dnd-kit
          + localStorage al-filo-layout-v3. Idéntico al render anterior. */}
      {isMobile ? (
        <div className="space-y-3 px-1">
          {MOBILE_WIDGET_ORDER.filter((id) => visibleIds.has(id)).map((id) => (
            <div key={id} className="w-full">
              {renderWidget(id, ctx)}
            </div>
          ))}
        </div>
      ) : (
        <div className="w-full mx-auto" style={{ maxWidth: 1900 }}>
          <DpsGridCanvas
            layout={gridLayout}
            renderWidget={(id) => renderWidget(id, ctx)}
          />
        </div>
      )}

      {pickerHp && <ComponentPicker hardpoint={pickerHp} parentItem={pickerParentItem} currentItemId={getEffectiveItem(pickerHp.id)?.id ?? null} onSelect={handleSelect} onClear={handleClear} onClose={() => setPickerHp(null)} />}

      {/* ── Save Loadout Modal ── */}
      {saveModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setSaveModal(false)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 w-80 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xs font-mono font-bold tracking-widest uppercase text-zinc-300">Save Loadout</h3>
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSaveLoadout()}
              placeholder="Loadout name..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-amber-500 focus:outline-none"
              autoFocus
            />
            <div className="text-xs text-zinc-500">
              {shipInfo?.name} • {overrides.size} component{overrides.size !== 1 ? "s" : ""} modified
            </div>
            <div className="flex gap-2">
              <button onClick={handleSaveLoadout} disabled={saving || !saveName.trim()} className="flex-1 py-1.5 bg-emerald-600/80 hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 text-sm font-medium rounded transition-colors">
                {saving ? "Saving..." : "Save"}
              </button>
              <button onClick={() => setSaveModal(false)} className="px-4 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-sm rounded transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Send to Wishlist Modal ── */}
      {wishlistModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setWishlistModal(false)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 w-[420px] max-h-[80vh] flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold tracking-widest uppercase text-zinc-300">Send to Wishlist</span>
              <span className="text-[10px] text-zinc-500 font-mono">{shipInfo?.name}</span>
            </div>

            {/* Select all + for-ship toggles header */}
            <div className="flex items-center justify-between text-[9px] font-mono uppercase tracking-wider text-zinc-500 border-b border-zinc-800 pb-1.5">
              <button onClick={() => setWishlistItems(p => p.map(i => ({ ...i, selected: !p.every(x => x.selected) })))} className="hover:text-zinc-300 transition-colors">
                {wishlistItems.every(i => i.selected) ? "Deselect all" : "Select all"}
              </button>
              <span className="text-zinc-600">For this ship</span>
            </div>

            {/* Items list */}
            <div className="flex-1 overflow-y-auto space-y-1 min-h-0 pr-1">
              {wishlistItems.length === 0 ? (
                <p className="text-xs text-zinc-500 text-center py-4">No equipped items found</p>
              ) : wishlistItems.map((item, idx) => (
                <div key={item.reference} className="flex items-center gap-2 h-7 px-1 rounded hover:bg-zinc-800/40 transition-colors">
                  {/* Select checkbox */}
                  <button onClick={() => setWishlistItems(p => p.map((x, i) => i === idx ? { ...x, selected: !x.selected } : x))} className={"w-4 h-4 flex-shrink-0 border rounded-[3px] flex items-center justify-center transition-colors " + (item.selected ? "bg-purple-600/80 border-purple-500" : "bg-zinc-800 border-zinc-600")}>
                    {item.selected && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                  </button>
                  {/* Type icon */}
                  <span className="text-[10px] flex-shrink-0">{WISH_TYPE_ICONS[item.type] ?? "📦"}</span>
                  {/* Name + size */}
                  <span className={"text-[11px] flex-1 truncate " + (item.selected ? "text-zinc-200" : "text-zinc-600")}>{item.name}</span>
                  {item.size != null && item.size > 0 && <span className="text-[9px] font-mono text-zinc-600 flex-shrink-0">S{item.size}</span>}
                  {/* For-ship toggle */}
                  <button onClick={() => setWishlistItems(p => p.map((x, i) => i === idx ? { ...x, forShip: !x.forShip } : x))} className={"text-[8px] font-mono uppercase px-1.5 py-0.5 rounded border transition-colors flex-shrink-0 " + (item.forShip ? "text-amber-400 border-amber-800/60 bg-amber-950/30" : "text-zinc-600 border-zinc-700 hover:text-zinc-400")} title={item.forShip ? "For this ship" : "General"}>
                    {item.forShip ? shipInfo?.name?.split(" ").slice(-1)[0] ?? "SHIP" : "GENERAL"}
                  </button>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-2 pt-1 border-t border-zinc-800">
              <span className="text-[10px] text-zinc-500 flex-1 font-mono">{wishlistItems.filter(i => i.selected).length} item{wishlistItems.filter(i => i.selected).length !== 1 ? "s" : ""} selected</span>
              {wishlistSent ? (
                <span className="text-[10px] font-mono text-emerald-400">✓ Added to wishlist</span>
              ) : (
                <>
                  <button onClick={() => setWishlistModal(false)} className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs rounded transition-colors">Cancel</button>
                  <button onClick={handleWishlistSubmit} disabled={wishlistSending || !wishlistItems.some(i => i.selected) || !user} className="px-3 py-1.5 bg-purple-600/80 hover:bg-purple-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-xs font-medium rounded transition-colors" title={!user ? "Sign in to use wishlist" : ""}>
                    {wishlistSending ? "Sending..." : !user ? "Sign in required" : "Add to Wishlist"}
                  </button>
                </>
              )}
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

function HpGroup({ hps, onClickHp, weaponAllocatedPips, weaponMaxPips }: { hps: ResolvedHardpoint[]; onClickHp: (hp: ResolvedHardpoint, parentItem?: EquippedItem | null) => void; weaponAllocatedPips?: number; weaponMaxPips?: number }) {
  if (hps.length === 0) return null;
  const { getEffectiveItem, hasOverride, overrides, isComponentOn, toggleComponent } = useLoadoutStore(
    useShallow(s => ({
      getEffectiveItem: s.getEffectiveItem,
      hasOverride: s.hasOverride,
      overrides: s.overrides,
      isComponentOn: s.isComponentOn,
      toggleComponent: s.toggleComponent,
    }))
  );
  // Convert a ResolvedChild into a synthetic ResolvedHardpoint so the picker can open for it.
  // parentItem se usa para que el picker sepa qué tipo de ordenanza acepta el
  // rack contenedor (ej: CST-313 Castillo → solo bombas, no misiles).
  const handleClickChild = useCallback((child: ResolvedChild, parentItem: EquippedItem | null) => {
    const synthetic: ResolvedHardpoint = {
      id: child.id,
      hardpointName: child.hardpointName,
      originalCategory: child.category,
      resolvedCategory: child.category || "WEAPON",
      minSize: child.minSize,
      maxSize: child.maxSize,
      isFixed: child.isFixed,
      defaultItem: child.equippedItem,
      children: [],
    };
    onClickHp(synthetic, parentItem);
  }, [onClickHp]);
  // Resuelve los slots hijos de un hardpoint padre según el ITEM EQUIPADO,
  // no según la data del ship loadout original. Esto es clave para dos casos:
  //
  //   a) MINING: los brazos mineros aceptan N módulos según el `moduleSlots`
  //      del láser equipado (Helix I=2, Arbor MH1=1, Klein-S1=0, Impact II=3).
  //
  //   b) MISSILE_RACK: los racks tienen N ports de tamaño fijo según el
  //      nombre. Ej:
  //        MSD-313 = rack S3, 1 misil S3  → 1 slot
  //        MSD-322 = rack S3, 2 misiles S2 → 2 slots
  //        MSD-441 = rack S4, 4 misiles S1 → 4 slots
  //        MSD-414 = rack S4, 1 misil S4  → 1 slot
  //        MSD-423 = rack S4, 2 misiles S3 → 2 slots
  //      Si cambiás el rack (ej. 322 → 441), el N y el tamaño de cada slot
  //      se actualizan automáticamente. `missilePorts` + `maxMissileSize` del
  //      componentStats del rack equipado dan la info (ya calculados en
  //      /api/catalog buildStats MISSILE_RACK).
  //
  // IDs estables (parentId:missile:i) → preserva el ítem equipado cuando el
  // nuevo rack tiene el mismo nº de slots. Si baja el count, los overrides
  // sobrantes quedan huérfanos en el store (no molestan, no se renderizan).
  const resolveChildSlots = useCallback(
    (hp: ResolvedHardpoint): ResolvedChild[] => {
      if (hp.resolvedCategory === "MINING") {
        const laser = getEffectiveItem(hp.id);
        const n = Number(laser?.componentStats?.moduleSlots ?? 0);
        if (!n || n <= 0) return [];
        const slots: ResolvedChild[] = [];
        for (let i = 1; i <= n; i++) {
          slots.push({
            id: `${hp.id}:module:${i}`,
            hardpointName: `${hp.hardpointName}_module_${i}`,
            category: "MINING_MODULE",
            minSize: 0,
            maxSize: 0,
            isFixed: false,
            equippedItem: null,
          });
        }
        return slots;
      }
      if (hp.resolvedCategory === "MISSILE_RACK") {
        const rack = getEffectiveItem(hp.id);
        if (!rack) return hp.children;

        // parseMissileRackSpec usa name-parse de la convención MSD-XYZ del juego
        // como fuente canónica (ver definición arriba). Para los racks chicos
        // (MSD-212, MSD-313) la BD reporta missilePorts=2 incorrectamente —
        // confiar en el nombre evita el bug de los slots fantasmas.
        let { slots: n, portSize } = parseMissileRackSpec(rack);

        // Fallback final: si ni el nombre ni componentStats dieron datos,
        // caer al ship loadout original (no romper la UI).
        if (!n || n <= 0) return hp.children;
        if (!portSize) portSize = hp.maxSize || 1;

        const slots: ResolvedChild[] = [];
        for (let i = 1; i <= n; i++) {
          slots.push({
            id: `${hp.id}:missile:${i}`,
            hardpointName: `${hp.hardpointName}_missile_${i}`,
            category: "MISSILE",
            minSize: portSize,
            maxSize: portSize,
            isFixed: false,
            // Heredar el default del ship loadout solo si el nº de slots
            // coincide (mismo rack equipado = preservar orden). Si cambió,
            // slots arrancan vacíos.
            equippedItem: hp.children.length === n ? hp.children[i - 1]?.equippedItem ?? null : null,
          });
        }
        return slots;
      }
      return hp.children;
    },
    [getEffectiveItem],
  );

  return (
    <div className="bg-zinc-900/80 border border-zinc-800/60">
      {hps.map(hp => (
        <HardpointSlot key={hp.id} hp={hp} item={getEffectiveItem(hp.id)} isOverridden={overrides.has(hp.id)} isOn={isComponentOn(hp.hardpointName)} onClick={() => onClickHp(hp)} onTogglePower={() => toggleComponent(hp.hardpointName)} childSlots={resolveChildSlots(hp)} isComponentOn={isComponentOn} toggleComponent={toggleComponent} onClickChild={handleClickChild} getEffectiveItem={getEffectiveItem} hasOverride={hasOverride} weaponAllocatedPips={weaponAllocatedPips} weaponMaxPips={weaponMaxPips} />
      ))}
    </div>
  );
}
