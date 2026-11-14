// =============================================================================
// SC LABS — LoadoutBuilder v20 (formato denso en columnas fijas)
//
// Loadout.20 (2026-11-14, pedido de Pablo): se reemplaza el lienzo de widgets
// arrastrables (v19) por un tablero denso de columnas fijas, con toda la
// información a la vista y sin tarjetas que se pisen:
//
//   ┌─ PRINCIPAL (2 fr) ─────────────┬─ SISTEMAS (1 fr) ─┬─ CONTROL (1 fr) ─┐
//   │ buscador + naves fijadas       │ casco             │ acciones         │
//   │ nave con MODELO 3D             │ escudos           │ energía          │
//   │ daño          │ defensa        │ plantas           │ vuelo            │
//   │ armamento (montaje → armas)    │ enfriadores       │  (queda fijo al  │
//   │ misiles y bombas               │ radar             │   hacer scroll)  │
//   │ quantum       │ utilidad       │ TTK / blindaje    │                  │
//   │ dinámica de vuelo 3D + gráficos│                   │                  │
//   └────────────────────────────────┴───────────────────┴──────────────────┘
//
//   ≥1536px (2xl): 3 pistas · 1280–1535px: principal + una columna lateral ·
//   <1280px: todo apilado (móvil incluido). Es CSS puro: no hay cálculo de
//   posiciones ni drag & drop, así que nada depende del ancho medido en JS.
//
// Toda la lógica (store, picker, compartir, guardar, wishlist, racks de
// misiles) es la misma de v19. Las tarjetas viven en ./deck/*.
// =============================================================================

"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Heart, RotateCcw, Save, Share2 } from "lucide-react";
import { useLoadoutStore } from "@/store/useLoadoutStore";
import { useShallow } from "zustand/react/shallow";
import type { ResolvedHardpoint, EquippedItem } from "@/store/useLoadoutStore";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { isUsefulSlot } from "./HardpointSlot";
import { ComponentPicker } from "./ComponentPicker";
import { PowerManagementPanel } from "./PowerManagementPanel";
import { ShipSelector } from "./ShipSelector";
import { LoadoutQuickSlots } from "./LoadoutQuickSlots";
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
import { TTKCalculatorContent }   from "./widgets/TTKCalculatorWidget";
import { ArmorCheckContent }      from "./widgets/ArmorCheckWidget";
import { DeckCard, LazyMount } from "./deck/DeckCard";
import { DeckHpGroup, parseMissileRackSpec } from "./deck/DeckSlot";
import { ShipHeroCard } from "./deck/ShipHeroCard";
import {
  DamageContent,
  DefenseContent,
  FlightContent,
  HullContent,
  ThermalStrip,
} from "./deck/StatCards";

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

// ── Industrial ship detection (Pablo, 2026-04-17) ────────────────────────────
// Solo estas naves muestran las tarjetas MINING / SALVAGE para no sobrecargar
// la UI en naves puramente combate. Si a futuro CIG saca más naves industriales
// se amplían los regex acá.
const MINING_SHIP_RX  = /mole|moth|prospector|golem/i;
const SALVAGE_SHIP_RX = /reclaimer|fortune|salvation|vulture/i;
// Fase N (2026-04-24): naves con QIG/QED/QDMP fijo — Mantis (Reynie), Cutlass
// Blue (Burke), Guardian QI (Captor). Mostramos la tarjeta "qig" sólo en ellas.
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

// ── Tarjetas de dinámica de vuelo ───────────────────────────────────────────
// Componentes aparte porque el toggle del header y el cuerpo comparten estado
// (hooks): BOOST en la de 3D, 3D/Radar/Bars en la de gráficos.
function Flight3dDeckCard() {
  const { boost, setBoost, hasBoost } = useFlightDynamics3dBoost();
  return (
    <DeckCard
      id="flight-dynamics-3d"
      title="Flight dynamics 3D"
      bodyClassName="p-0"
      actions={<FlightDynamics3dHeaderActions boost={boost} setBoost={setBoost} hasBoost={hasBoost} />}
    >
      {/* Los tres visores se montan recién al acercarse con el scroll: al
          abrir la página solo trabaja el modelo 3D de la cabecera. */}
      <LazyMount minHeight={300}>
        <FlightDynamics3dContent boost={boost} />
      </LazyMount>
    </DeckCard>
  );
}

function FlightChartsDeckCard() {
  const [view, setView] = useFlightDynamicsView();
  return (
    <DeckCard
      id="flight-dynamics"
      title="Flight dynamics"
      bodyClassName="p-0"
      actions={<FlightDynamicsToolbar view={view} setView={setView} />}
    >
      <FlightDynamicsBody view={view} />
    </DeckCard>
  );
}

// ── Botón de la tarjeta de acciones ─────────────────────────────────────────
function ActionButton({
  onClick, icon, label, title, tone = "neutral", done = false,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  title: string;
  tone?: "primary" | "neutral" | "danger";
  done?: boolean;
}) {
  const toneClass = done
    ? "border-emerald-600/50 bg-emerald-500/10 text-emerald-300"
    : tone === "primary"
      ? "border-amber-500/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
      : tone === "danger"
        ? "border-zinc-800 text-zinc-400 hover:border-orange-600/50 hover:text-orange-300 hover:bg-orange-500/10"
        : "border-zinc-800 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800/50";
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex items-center justify-center gap-1.5 h-8 px-2 rounded-md border text-[11px] font-semibold transition-colors min-w-0 ${toneClass}`}
    >
      <span className="shrink-0" aria-hidden>{done ? <Check size={13} /> : icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

export default function LoadoutBuilder({ shipId = "titan" }: { shipId?: string }) {
  const searchParams = useSearchParams();

  // ── Zustand: granular selectors — each field triggers a re-render only when
  // it actually changes, instead of re-rendering on every store mutation.
  // instancePower + componentStates included so Zustand triggers a re-render
  // when the user adjusts power pips or toggles components on/off.
  const { shipInfo, isLoading, error, hardpoints, overrides, flightMode,
    instancePower: _ip, componentStates: _cs, previewItem: _pi, hardpointsFallbackFrom } = useLoadoutStore(
    useShallow(s => ({
      shipInfo: s.shipInfo,
      isLoading: s.isLoading,
      error: s.error,
      hardpoints: s.hardpoints,
      overrides: s.overrides,
      flightMode: s.flightMode,
      hardpointsFallbackFrom: s.hardpointsFallbackFrom,
      instancePower: s.instancePower,
      componentStates: s.componentStates,
      // Loadout.4c: previewItem incluido para que el LoadoutBuilder y todos
      // los widgets que reciben `stats={getStats()}` re-renderizen cuando el
      // user hovea por el ComponentPicker.
      previewItem: s.previewItem,
    }))
  );
  // Suppress unused-var lint — these exist solely to trigger re-renders
  void _ip; void _cs; void _pi;
  // Actions are stable references in Zustand — individual selectors never trigger re-renders.
  const loadShip      = useLoadoutStore(s => s.loadShip);
  const getStats      = useLoadoutStore(s => s.getStats);
  const getEffectiveItem = useLoadoutStore(s => s.getEffectiveItem);
  // Loadout.4i (2026-05-04): item REAL (sin preview) para currentItemId del
  // picker. Usando getEffectiveItem el hover-preview hacía que el row hovered
  // se marcara como "isCurrent" → button disabled → click bloqueado.
  const getRealItem   = useLoadoutStore(s => s.getRealItem);
  const equipItem     = useLoadoutStore(s => s.equipItem);
  const clearSlot     = useLoadoutStore(s => s.clearSlot);
  const resetAll      = useLoadoutStore(s => s.resetAll);
  const encodeBuild   = useLoadoutStore(s => s.encodeBuild);
  const setFlightMode = useLoadoutStore(s => s.setFlightMode);

  const [pickerHp, setPickerHp] = useState<ResolvedHardpoint | null>(null);
  // Loadout.4b (2026-05-04): rect del slot que disparó el picker. Lo
  // capturamos via mousedown global (capture phase) para no tener que
  // propagar event prop por toda la cadena HardpointGroup → HardpointSlot →
  // Row → button. El ComponentPicker lo usa para calcular su posición
  // (a la derecha si el slot está en la mitad izquierda, etc).
  const [pickerAnchorRect, setPickerAnchorRect] = useState<DOMRect | null>(null);
  const lastClickedRectRef = useRef<DOMRect | null>(null);
  useEffect(() => {
    const onCapturedDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // Buscamos el button MÁS CERCANO. Funciona para los Row del
      // HardpointSlot y para los slots vacíos de los HpGroup.
      const button = target.closest("button");
      if (button) {
        lastClickedRectRef.current = button.getBoundingClientRect();
      }
    };
    document.addEventListener("mousedown", onCapturedDown, true); // capture phase
    return () => document.removeEventListener("mousedown", onCapturedDown, true);
  }, []);
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
    // Loadout.4b: snapshot del rect capturado en el último mousedown — viene
    // del botón clickeado en el HardpointSlot. Si por algún motivo no hay
    // ref (programmatic open?), pasamos null y el picker cae al fallback.
    setPickerAnchorRect(lastClickedRectRef.current);
  }, []);
  // Share
  const [copied, setCopied] = useState(false);
  // Save Loadout modal
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveModal, setSaveModal] = useState(false);
  const [saveName, setSaveName] = useState("");
  // Send to Wishlist modal
  const [wishlistModal, setWishlistModal] = useState(false);
  const [wishlistItems, setWishlistItems] = useState<WishlistEntry[]>([]);
  const [wishlistSending, setWishlistSending] = useState(false);
  const [wishlistSent, setWishlistSent] = useState(false);
  const lastLoadKey = useRef<string | null>(null);
  const overrideCountRef = useRef(0);
  // 2026-05-12 (Loadout.12): ref para distinguir "deep link externo cambió el
  // build" vs "nosotros mismos actualizamos la URL post-equip". Cuando el user
  // equipa un arma, el segundo useEffect hace `replaceState` para persistir el
  // build en la URL. Next 16 considera ese cambio una nueva `searchParams`
  // reference → el primer useEffect re-evalúa, ve el `build` nuevo (que no
  // matchea `lastLoadKey`) y dispara `loadShip()` completo → fetch a la API,
  // reset de hardpoints, percepción de "se recargó toda la página".
  // Solución: marcar el build que NOSOTROS escribimos en la URL en esta ref,
  // y el primer efecto lo ignora cuando matchea.
  const ownedBuildRef = useRef<string | null>(null);


  // Reactivo a cambios de searchParams para soportar quick-slots tipo "tabs":
  // cuando el usuario clickea otro slot, la URL cambia y este efecto recarga
  // el ship+build correspondiente. Guardamos un key para evitar reload de la
  // MISMA combinación (que dispararía un fetch redundante).
  useEffect(() => {
    const urlShip = searchParams.get("ship") || shipId || "titan";
    const urlBuild = searchParams.get("build");
    // 2026-05-12 (Loadout.12): si el build en la URL es el que NOSOTROS
    // escribimos via replaceState (post-equip), ignorar — no es un deep link
    // externo. Sin este guard, cada cambio de arma disparaba loadShip()
    // completo y recargaba todo el loadout.
    if (urlBuild && urlBuild === ownedBuildRef.current) return;
    const key = urlShip + "::" + (urlBuild ?? "");
    if (lastLoadKey.current === key) return;
    lastLoadKey.current = key;
    loadShip(urlShip, urlBuild);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, shipId]);

  // Loadout.4d (2026-05-04): prefetch del catálogo apenas cargan los
  // hardpoints. Por cada combo (categoría, size) único del ship dispara un
  // fetch fire-and-forget al endpoint /api/catalog. Cuando el user clickea
  // cualquier slot el resultado ya está en caché → apertura instantánea.
  useEffect(() => {
    if (hardpoints.length === 0) return;
    // Defer al próximo tick para no bloquear el primer paint.
    const t = setTimeout(() => {
      // Lazy import — solo se carga si el LoadoutBuilder se monta.
      import("@/lib/loadout/catalog-cache").then(mod =>
        mod.prefetchForHardpoints(hardpoints),
      );
    }, 100);
    return () => clearTimeout(t);
  }, [hardpoints]);
  useEffect(() => {
    const c = overrides.size;
    // Antes de la primera carga del ship no actualizamos la URL — sino
    // borraríamos el ?build= que el user puede haber traído en el link.
    if (lastLoadKey.current === null) return;
    if (c === overrideCountRef.current && c === 0) return;
    overrideCountRef.current = c;
    const encoded = encodeBuild();
    const url = new URL(window.location.href);
    // Always stamp the ship reference so the URL is self-contained
    if (shipInfo?.reference) url.searchParams.set("ship", shipInfo.reference);
    if (encoded) url.searchParams.set("build", encoded);
    else url.searchParams.delete("build");
    // 2026-05-12 (Loadout.12): marcar el build como "nuestro" ANTES del
    // replaceState. Así si Next 16 dispara el efecto de searchParams,
    // ownedBuildRef.current === urlBuild → ignorar, sin re-loadear el ship.
    ownedBuildRef.current = encoded || null;
    window.history.replaceState({}, "", url.toString());
  }, [overrides, encodeBuild, shipInfo]);

  const stats = getStats();
  const useful = hardpoints.filter(hp => isUsefulSlot(hp, getEffectiveItem(hp.id)));
  const weaponHps = useful.filter(hp => WEAPON_GROUPS.has(hp.resolvedCategory));
  const missileHps = useful.filter(hp => MISSILE_GROUPS.has(hp.resolvedCategory));


  // ─── Slots por categoría ──────────────────────────────────────────────────
  // (No son hooks: se recalculan en cada render, igual que `useful`.)
  const byCat = (...cats: string[]) => useful.filter((hp) => cats.includes(hp.resolvedCategory));
  const shieldHps     = byCat("SHIELD");
  const powerPlantHps = byCat("POWER_PLANT");
  const coolerHps     = byCat("COOLER");
  // QT DRIVES agrupa QUANTUM_DRIVE (motor local) + JUMP_DRIVE (módulo
  // inter-sistema, mig 058): el JD viene como slot sintético del API.
  const quantumHps    = byCat("QUANTUM_DRIVE", "JUMP_DRIVE");
  const radarHps      = byCat("RADAR");
  // UTILITY puro (tractor beam, EMP, etc) — MINING y SALVAGE tienen tarjeta propia.
  const utilityHps    = byCat("UTILITY");
  // Mining / Salvage / QIG: solo en naves del rol (ver regex arriba).
  const miningHps  = isMiningShip(shipInfo?.name)  ? byCat("MINING")  : [];
  const salvageHps = isSalvageShip(shipInfo?.name) ? byCat("SALVAGE") : [];
  const qigHps     = isQigShip(shipInfo?.name)     ? byCat("QIG")     : [];

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
    // 2026-05-12 BUGFIX: el else original solo setea pickerHp.id, pero si
    // pickerHp.id es un slot sintético `${rackHpId}:missile:N` (caso single-
    // shot rack como MSD-313 con portCount=1), los `rack.children` del API
    // NO se sincronizan y computeStats sigue leyendo el misil viejo
    // (los stats no se actualizan al cambiar misil). Ahora siempre que
    // pickerHp.id sea un slot sintético de misil, actualizamos TANTO el
    // sintético como los real children del rack — sin importar portCount.
    if (idMatch) {
      const rackHpId = idMatch[1];
      // Loadout.16: los racks custom por nave pueden tener más ports reales
      // que lo que dice el name-parse (MRCK_S04_AEGS_Redeemer = 8, no 4).
      // Cubrimos el máximo entre ambos para no dejar slots sin sincronizar.
      const rack = hardpoints.find((h) => h.id === rackHpId);
      const ports = Math.max(1, portCount, rack?.children?.length ?? 0);
      // 1) Slots sintéticos (lo que el LoadoutBuilder renderiza visualmente)
      for (let i = 1; i <= ports; i++) {
        equipItem(`${rackHpId}:missile:${i}`, item);
      }
      // 2) Children del API del rack (lo que computeStats agrega para
      //    sumar damage de misiles al panel LOADOUT DETAIL). Sin esto, el
      //    daño de misiles quedaba en 0 después de cambiar de misil.
      if (rack) {
        for (const ch of rack.children) equipItem(ch.id, item);
      }
    } else {
      // Slot normal (no es un missile child sintético).
      equipItem(pickerHp.id, item);
    }
    setPickerHp(null);
  }, [pickerHp, pickerParentItem, equipItem, hardpoints]);

  const handleClear = useCallback(() => {
    if (!pickerHp) return;
    const idMatch = pickerHp.id.match(/^(.+):missile:(\d+)$/);
    // Mismo helper que handleSelect — single source of truth para el slot count.
    const portCount = parseMissileRackSpec(pickerParentItem).slots;
    // 2026-05-12: idem handleSelect — siempre que sea un slot sintético de
    // misil, limpiamos también los real children del API para que
    // computeStats no quede leyendo el misil viejo.
    if (idMatch) {
      const rackHpId = idMatch[1];
      // Loadout.16: idem handleSelect — cubrir también los ports reales.
      const rack = hardpoints.find((h) => h.id === rackHpId);
      const ports = Math.max(1, portCount, rack?.children?.length ?? 0);
      for (let i = 1; i <= ports; i++) {
        clearSlot(`${rackHpId}:missile:${i}`);
      }
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

  // Pips asignados a armas: los usa cada tarjeta de arma para calcular la
  // munición sostenible del capacitor.
  const weaponInstance = stats.powerNetwork.instances.find(
    (inst) => inst.hardpointName === "__weapons_combined__"
  );
  const weaponAllocatedPips = weaponInstance?.allocatedPips ?? 0;
  const weaponMaxPips = stats.weaponMaxPips ?? 0;

  const group = (hps: ResolvedHardpoint[], wide = false) => (
    <DeckHpGroup
      hps={hps}
      onClickHp={handleClickHp}
      weaponAllocatedPips={weaponAllocatedPips}
      weaponMaxPips={weaponMaxPips}
      wide={wide}
    />
  );

  return (
    <div className="mx-auto w-full max-w-[2100px] space-y-3">
      {/* Banner cuando los hardpoints vienen de otra game_version porque la
          actual no tiene data importada todavía. Caso típico: PTU recién
          importado con sólo algunas naves con hardpoints. Así se ve que las
          stats que aparecen son de la versión previa, no del PTU. */}
      {hardpointsFallbackFrom && (
        <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 px-3 py-1.5 text-[11px] text-amber-300 flex items-center gap-2 flex-wrap">
          <span className="text-base leading-none">⚠</span>
          <span className="font-mono">
            Mostrando hardpoints de <strong className="text-amber-200">{hardpointsFallbackFrom}</strong>
            {" "}— la versión actual del juego aún no tiene esta nave en el catálogo. Cambia o sortea hasta que se complete la ingesta.
          </span>
        </div>
      )}

      <div className="grid gap-3 items-start grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        {/* ══════════════ PRINCIPAL ══════════════ */}
        <div className="flex flex-col gap-3 min-w-0">
          {/* Buscador de nave + naves fijadas (hasta 6 configs para alternar
              rápido manteniendo cada build). z-30: el desplegable del
              buscador tiene que quedar por encima de las tarjetas de abajo. */}
          <div className="relative z-30 rounded-lg border border-zinc-800/80 bg-zinc-950/75 backdrop-blur-sm p-2 flex flex-col gap-2">
            <ShipSelector />
            <LoadoutQuickSlots
              currentShipReference={shipInfo?.reference ?? null}
              currentShipName={shipInfo?.name ?? null}
            />
          </div>

          <ShipHeroCard />

          <div className="grid gap-3 items-start grid-cols-1 md:grid-cols-2">
            <DeckCard id="damage" title="Damage" icon="/icons/weapons.png">
              <DamageContent />
            </DeckCard>
            <DeckCard id="defense" title="Defense" icon="/icons/shilds.png">
              <DefenseContent />
            </DeckCard>
          </div>

          {weaponHps.length > 0 && (
            <DeckCard id="weapons" title="Armament" icon="/icons/weapons.png" count={weaponHps.length}>
              {group(weaponHps, true)}
            </DeckCard>
          )}
          {miningHps.length > 0 && (
            <DeckCard id="mining" title="Mining lasers" icon="/icons/mining_lasers.png" count={miningHps.length}>
              {group(miningHps, true)}
            </DeckCard>
          )}
          {salvageHps.length > 0 && (
            <DeckCard id="salvage" title="Salvage & tractor" icon="/icons/tractor_beam.png" count={salvageHps.length}>
              {group(salvageHps, true)}
            </DeckCard>
          )}
          {missileHps.length > 0 && (
            <DeckCard id="missiles" title="Ordnance" icon="/icons/missile.png" count={missileHps.length}>
              {group(missileHps, true)}
            </DeckCard>
          )}

          {(quantumHps.length > 0 || utilityHps.length > 0 || qigHps.length > 0) && (
            <div className="grid gap-3 items-start grid-cols-1 md:grid-cols-2">
              {quantumHps.length > 0 && (
                <DeckCard id="quantum" title="Quantum drive" icon="/icons/Quantum_drives.png" count={quantumHps.length}>
                  {group(quantumHps)}
                </DeckCard>
              )}
              {qigHps.length > 0 && (
                <DeckCard id="qig" title="Quantum interdiction" icon="/icons/interdict.png" count={qigHps.length}>
                  {group(qigHps)}
                </DeckCard>
              )}
              {utilityHps.length > 0 && (
                <DeckCard id="utility" title="Utility" icon="/icons/tractor_beam.png" count={utilityHps.length}>
                  {group(utilityHps)}
                </DeckCard>
              )}
            </div>
          )}

          <Flight3dDeckCard />
          <FlightChartsDeckCard />
        </div>

        {/* ══════════════ LATERAL ══════════════
            1280–1535px: una sola columna (control arriba, sistemas abajo).
            ≥1536px: `contents` la desarma y cada mitad ocupa su propia pista. */}
        <div className="flex flex-col gap-3 min-w-0 2xl:contents">
          {/* ── SISTEMAS ── */}
          <div className="flex flex-col gap-3 min-w-0 order-2 2xl:order-none">
            <DeckCard id="hull" title="Hull" icon="/icons/Ships.png">
              <HullContent />
            </DeckCard>
            {shieldHps.length > 0 && (
              <DeckCard id="shields" title="Shields" icon="/icons/shilds.png" count={shieldHps.length}>
                {group(shieldHps)}
              </DeckCard>
            )}
            {powerPlantHps.length > 0 && (
              <DeckCard id="powerplants" title="Power plants" icon="/icons/power_plants.png" count={powerPlantHps.length}>
                {group(powerPlantHps)}
              </DeckCard>
            )}
            {coolerHps.length > 0 && (
              <DeckCard id="coolers" title="Coolers" icon="/icons/coolers.png" count={coolerHps.length}>
                {group(coolerHps)}
              </DeckCard>
            )}
            {radarHps.length > 0 && (
              <DeckCard id="radar" title="Radar" icon="/icons/DPS_calculator.png" count={radarHps.length}>
                {group(radarHps)}
              </DeckCard>
            )}
            <DeckCard id="ttk-calculator" title="Time to kill" bodyClassName="p-0">
              <TTKCalculatorContent />
            </DeckCard>
            <DeckCard id="armor-check" title="Armor deflection check" bodyClassName="p-0">
              <ArmorCheckContent />
            </DeckCard>
          </div>

          {/* ── CONTROL (queda fijo al hacer scroll en pantallas anchas) ── */}
          <div className="flex flex-col gap-3 min-w-0 order-1 2xl:order-none 2xl:sticky 2xl:top-14 2xl:max-h-[calc(100vh-4rem)] 2xl:overflow-y-auto 2xl:[scrollbar-width:thin]">
            <DeckCard id="actions" title="Actions" collapsible={false}>
              <div className="grid grid-cols-2 gap-1.5">
                <ActionButton
                  onClick={handleShare}
                  icon={<Share2 size={13} />}
                  label={copied ? "Link copied" : "Share"}
                  title="Copy shareable link with this loadout"
                  tone="primary"
                  done={copied}
                />
                <ActionButton
                  onClick={() => { setSaveName(shipInfo?.name ? `${shipInfo.name} Build` : "My Build"); setSaveModal(true); }}
                  icon={<Save size={13} />}
                  label={saved ? "Saved" : "Save loadout"}
                  title="Save this loadout to your account"
                  done={saved}
                />
                <ActionButton
                  onClick={handleWishlistOpen}
                  icon={<Heart size={13} />}
                  label="To wishlist"
                  title="Add loadout items to your wishlist"
                />
                <ActionButton
                  onClick={resetAll}
                  icon={<RotateCcw size={13} />}
                  label="Reset loadout"
                  title="Revert all component changes to ship defaults"
                  tone="danger"
                />
              </div>
            </DeckCard>
            <DeckCard id="power-grid" title="Power management" icon="/icons/power_plants.png">
              <PowerManagementPanel stats={stats} flightMode={flightMode} onModeChange={setFlightMode} />
              <ThermalStrip />
            </DeckCard>
            <DeckCard id="flight" title="Flight">
              <FlightContent />
            </DeckCard>
          </div>
        </div>
      </div>

      {pickerHp && <ComponentPicker hardpoint={pickerHp} parentItem={pickerParentItem} currentItemId={getRealItem(pickerHp.id)?.id ?? null} onSelect={handleSelect} onClear={handleClear} onClose={() => { setPickerHp(null); setPickerAnchorRect(null); }} anchorRect={pickerAnchorRect} />}

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
