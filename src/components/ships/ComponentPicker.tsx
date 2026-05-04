// =============================================================================
// AL FILO — ComponentPicker v8 (Final Polish)
// Fix: when hardpoint.maxSize is 0, don't send size filter to API
// =============================================================================

"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLoadoutStore, type EquippedItem, type ResolvedHardpoint } from "@/store/useLoadoutStore";
import { fetchCatalog } from "@/lib/loadout/catalog-cache";
import { CAT_COLORS, fmtPrice, getKeyStat } from "./loadout-utils";
import powerNetworkLookup from "@/data/power-network-lookup.json";
import miningModulesJson from "@/data/mining/mining-modules.json";
import {
  ComponentContextMenu,
  type ComponentContextMenuTarget,
} from "@/components/components/ComponentContextMenu";

const pnLookup = powerNetworkLookup as Record<string, any>;

const CAT_TO_API_TYPE: Record<string, string> = {
  WEAPON: "WEAPON", TURRET: "WEAPON,TURRET",
  // Slot padre MISSILE_RACK → racks/lanzadores (tabla missile_launchers).
  // Slot hijo MISSILE → misiles (tabla missiles) + bombas (tabla bombs, mig 053).
  // Los racks de bombers (Retaliator, Eclipse, Firebird) aceptan ambos segun
  // el size, asi que el picker muestra los dos mezclados por size.
  MISSILE_RACK: "MISSILE_RACK", MISSILE: "MISSILE,BOMB",
  SHIELD: "SHIELD", POWER_PLANT: "POWER_PLANT", COOLER: "COOLER",
  // QT drive y Jump Drive son slots separados pero conviven en el mismo
  // widget visual (QT DRIVES). El picker abre el catálogo correcto según
  // qué slot estés mirando.
  QUANTUM_DRIVE: "QUANTUM_DRIVE", JUMP_DRIVE: "JUMP_DRIVE",
  MINING: "MINING_LASER", UTILITY: "TRACTOR_BEAM,EMP,QED",
  // SALVAGE: default para slot sin parent es pedir heads (slot del brazo de
  // Vulture/Fortune/Salvation/Reclaimer). Si hay parentClassName y ese parent
  // es un salvage head (detectado abajo con isSalvageHeadClass), el picker
  // flipea a SALVAGE_MODIFIER. Ver bloque de parentClassName más abajo.
  SALVAGE: "SALVAGE_HEAD",
  // QIG — slot de interdictor cuántico. En Mantis/Cutlass Blue/Guardian QI
  // el slot viene fixed=true (no se abre el picker), pero si en el futuro
  // otras naves lo traen editable, el mapping ya está.
  QIG: "QIG",
};

// Mining modules no viven en la BD: vienen del JSON curado en
// src/data/mining/mining-modules.json. Cuando el hardpoint es MINING_MODULE
// (sub-slot dentro del laser minero) bypass-eamos /api/catalog y mapeamos
// las entries del JSON al shape CatalogItem.
type MiningModuleJson = {
  id: string;
  name: string;
  category: "active" | "passive" | "gadget";
  effects: Record<string, number>;
};
const MINING_MODULES = miningModulesJson as MiningModuleJson[];

function miningModuleToCatalogItem(m: MiningModuleJson): CatalogItem {
  // Usamos la 1ra stat no-cero como preview para el stat column.
  const previewEntry =
    Object.entries(m.effects).find(([, v]) => v !== 0) ?? ["laserPower", 0];
  return {
    id: `mining_module:${m.id}`,
    reference: m.id,
    name: m.name,
    localizedName: m.name,
    className: m.id,
    type: "MINING_MODULE",
    size: null,
    grade: m.category.charAt(0).toUpperCase(), // A/P/G
    manufacturer: null,
    miningStats: { miningPower: previewEntry[1], ...m.effects },
  };
}

// Mapeo categoría del hardpoint → item_type usado en user_inventory / user_wishlist.
// Debe coincidir con TABLE_TO_ITEM_TYPE en src/app/components/page.tsx.
const CAT_TO_ITEM_TYPE: Record<string, string> = {
  WEAPON: "WEAPON",
  TURRET: "TURRET",
  MISSILE_RACK: "MISSILE",
  SHIELD: "SHIELD",
  POWER_PLANT: "POWER_PLANT",
  COOLER: "COOLER",
  QUANTUM_DRIVE: "QUANTUM_DRIVE",
  JUMP_DRIVE: "QUANTUM_DRIVE",
  MINING: "MINING",
  UTILITY: "UTILITY",
  SALVAGE: "SALVAGE",
  QIG: "QIG",
};

interface CatalogItem {
  id: string; reference: string; name: string; localizedName: string | null;
  className: string | null; type: string; size: number | null;
  grade: string | null; manufacturer: string | null;
  weaponStats?: any; shieldStats?: any; powerStats?: any; coolingStats?: any;
  quantumStats?: any; miningStats?: any; missileStats?: any;
  turretStats?: any; missileRackStats?: any; bombStats?: any;
  salvageStats?: any; qigStats?: any; thrusterStats?: any;
  shopInventory?: Array<{ priceBuy: number | null; priceSell: number | null; shop: { name: string; location: { name: string; parentName: string | null } } }>;
}

interface ComponentPickerProps {
  hardpoint: ResolvedHardpoint;
  /**
   * Item equipado en el rack/mount padre cuando el slot abierto es un hijo
   * (ej. misil dentro de un MISSILE_RACK). El picker lo usa para filtrar:
   * - className: detectar bomb rack → solo bombas
   * - componentStats.{min,max}MissileSize: heredar el size de los ports del
   *   rack equipado. Ej: MSD-322 = 2 ports S2 → picker pide misiles S2-S2,
   *   no S1-S3. Evita que se pueda equipar el misil equivocado cuando
   *   cambiaste el rack (el ship loadout trae el size del rack original,
   *   que puede no coincidir con el rack nuevo).
   */
  parentItem?: EquippedItem | null;
  currentItemId: string | null;
  onSelect: (item: EquippedItem) => void;
  onClear: () => void;
  onClose: () => void;
  /**
   * Loadout.4b (2026-05-04): rect del slot que disparó el picker. Si está
   * presente, el panel se posiciona inteligentemente al lado opuesto del
   * slot (slot izquierda → panel derecha, slot derecha → panel izquierda)
   * y verticalmente alineado al top del slot. Si no está, fallback a
   * bottom-right como antes.
   */
  anchorRect?: DOMRect | null;
}

/** ¿Este className corresponde a un rack de bombas? (vs rack de misiles) */
function isBombRackClass(className: string | null | undefined): boolean {
  if (!className) return false;
  // Convención de scunpacked: bomb racks arrancan con BMBRCK_ o son casos
  // especiales como MRCK_S03_TEMP_BOMB (misma tabla missile_launchers pero
  // type=BombLauncher en la data fuente).
  return /^BMBRCK_/i.test(className) || /TEMP_BOMB$/i.test(className);
}

/** ¿Este className corresponde a un salvage head? (vs missile/bomb rack) */
function isSalvageHeadClass(className: string | null | undefined): boolean {
  if (!className) return false;
  // Convención de scunpacked weapon_salvage sub_type='Head':
  //   Salvage_Head_standard  → Baler
  //   Salvage_Head_Salvation → Salvation
  //   WEP_TractorBeam_S3_*, GRIN_TractorBeam_S3, WEP_TowingBeam_S3_template
  //     → tractor beams que el juego tipifica como SalvageHead (por eso viven
  //     en la misma tabla).
  return (
    /^Salvage_Head_/i.test(className) ||
    /_TractorBeam_/i.test(className) ||
    /_TowingBeam_/i.test(className)
  );
}

type SortKey = "name" | "size" | "grade" | "stat" | "price" | "manufacturer";
type SortDir = "asc" | "desc";

type SubFilter = "all" | "weapons" | "gimbals";

export function ComponentPicker({ hardpoint, parentItem, currentItemId, onSelect, onClear, onClose, anchorRect }: ComponentPickerProps) {
  // Sizes y className derivados del rack padre equipado. Si parentItem ausente,
  // usamos los sizes del hardpoint mismo (que viene del ship loadout original,
  // puede estar desfasado del rack actual — de ahí el fix).
  const parentClassName = parentItem?.className ?? null;
  const parentMaxMissileSize = Number(parentItem?.componentStats?.maxMissileSize ?? 0) || null;
  const parentMinMissileSize = Number(parentItem?.componentStats?.minMissileSize ?? 0) || null;
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("stat");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [contextMenu, setContextMenu] = useState<ComponentContextMenuTarget | null>(null);
  const [subFilter, setSubFilter] = useState<SubFilter>("all");
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const panelRef = useRef<HTMLDivElement>(null); // Loadout.4 — click-outside
  const catColor = CAT_COLORS[hardpoint.resolvedCategory] || "#71717a";
  const isTurretSlot = hardpoint.resolvedCategory === "TURRET";

  // Auto-filtro de marca para slots TURRET — silencioso, sin UI.
  //
  // Regla: si el slot es TURRET (gimbal mount) y la nave trae un default con
  // marca legible (ej Avenger Titan → VariPuck/Flashfire Systems), el picker
  // muestra solo esa marca de mount. No hay chip ni toggle — Pablo decidio
  // que ensuciar la UI con un filtro que el usuario rara vez necesita
  // cambiar era peor que no mostrar todas las marcas.
  //
  // Guards:
  //   1. Solo TURRET: slots WEAPON (armas dentro del gimbal) y otros NO
  //      filtran por marca, porque el usuario quiere explorar todas las armas
  //      compatibles con el tamanio, no solo las de la marca del default.
  //   2. Anti-UUID: si el brand del default viene como UUID (data legacy
  //      del endpoint ships/[id] que aun no joinea manufacturers), no
  //      filtramos — sino nadie matchearia y la lista saldria vacia.
  //
  // Fallback sano: si la nave no tiene default valido, muestra todos los
  // gimbals del tamanio correcto (mejor que mostrar nada).
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const rawBrand = hardpoint.defaultItem?.manufacturer ?? null;
  const brandFilter =
    isTurretSlot && rawBrand !== null && !UUID_RE.test(rawBrand)
      ? rawBrand
      : null;

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);

  // Loadout.4: click-outside cierra el panel (no usamos backdrop velo, así
  // que necesitamos detectar manualmente clicks fuera). Solo aplica en
  // desktop — mobile sigue con el backdrop click handler. Pointerdown evita
  // disparar antes de que un click dentro del panel registre.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (window.innerWidth < 640) return; // mobile: backdrop maneja el cierre
      if (!panelRef.current) return;
      if (panelRef.current.contains(e.target as Node)) return;
      // Si el click es sobre un context menu (right-click popup), ignorar.
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("[data-context-menu]")) return;
      onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [onClose]);

  // Loadout.4 (2026-05-04): hover preview live. Cuando el user pasa el mouse
  // por un row, seteamos el item en el store como preview → computeStats lo
  // toma en cuenta y todas las stats se recalculan en vivo (DPS, escudo HP,
  // power balance, thermal, etc). Cuando sale del row o cierra el picker,
  // limpiamos. La selección final (click) también limpia + aplica el override.
  const setPreviewItem = useLoadoutStore(s => s.setPreviewItem);
  const clearPreviewItem = useLoadoutStore(s => s.clearPreviewItem);
  // Cleanup al desmontar — fundamental para que el preview no quede pegado
  // si el user cierra con Escape o click afuera.
  useEffect(() => {
    return () => clearPreviewItem();
  }, [clearPreviewItem]);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // MINING_MODULE: fuente local (mining-modules.json), sin API call.
    if (hardpoint.resolvedCategory === "MINING_MODULE") {
      const q = search.trim().toLowerCase();
      const items = MINING_MODULES.filter(
        (m) => !q || m.name.toLowerCase().includes(q) || m.category.includes(q),
      ).map(miningModuleToCatalogItem);
      setResults(items);
      setTotal(items.length);
      setLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        let apiTypes = CAT_TO_API_TYPE[hardpoint.resolvedCategory] || "OTHER";
        // Cuando hay parentClassName, estamos abriendo un slot hijo de algún
        // brazo/rack. La categoría del child puede haberse resuelto distinto
        // en la API (MISSILE_RACK, MISSILE o SALVAGE según nave), así que la
        // decisión la tomamos mirando el className del padre:
        //   - Salvage head padre → SALVAGE_MODIFIER (Tractor/Scraper)
        //   - Bomb rack padre    → BOMB
        //   - Missile rack padre → MISSILE
        // Nunca pedir racks/heads cuando estamos dentro de uno.
        if (parentClassName) {
          if (isSalvageHeadClass(parentClassName)) apiTypes = "SALVAGE_MODIFIER";
          else if (isBombRackClass(parentClassName)) apiTypes = "BOMB";
          else apiTypes = "MISSILE";
        }
        const body: Record<string, any> = { types: apiTypes, limit: 80, include: "stats,shops" };
        // Size del filtro:
        //   - Default: minSize/maxSize del hardpoint (vienen del ship loadout).
        //   - Override: si hay parentItem con maxMissileSize/minMissileSize
        //     (viene del rack equipado), los usamos. Esto cubre el caso de
        //     cambiar de rack — el ship loadout original puede traer el size
        //     del rack viejo, pero lo importante es el rack actual.
        //   - Ej: MSD-322 = 2 ports S2 → min=max=2. Solo misiles S2.
        //     MSD-441 = 4 ports S1 → min=max=1. Solo misiles S1.
        //     MSD-414 = 1 port S4 → min=max=4. Solo misiles S4.
        const effMaxSize = parentMaxMissileSize ?? hardpoint.maxSize;
        const effMinSize = parentMinMissileSize ?? hardpoint.minSize;
        if (effMaxSize > 0) body.maxSize = effMaxSize;
        if (effMinSize > 0) body.minSize = effMinSize;
        if (search.trim()) body.search = search.trim();
        // Loadout.4d (2026-05-04): cache module-level. Si el LoadoutBuilder
        // ya pre-fetcheó esta combo, retorna instantáneo. Si no, hace fetch
        // y popula caché para la siguiente apertura.
        const json = await fetchCatalog(body, controller.signal);
        setResults(json.data || []);
        setTotal(json.meta?.total || 0);
      } catch (err) { if (err instanceof DOMException && err.name === "AbortError") return; } finally { setLoading(false); }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [search, hardpoint.resolvedCategory, hardpoint.maxSize, hardpoint.minSize, parentClassName, parentMaxMissileSize, parentMinMissileSize]);

  const getItemStats = useCallback((item: CatalogItem): Record<string, any> | null => {
    return item.weaponStats || item.shieldStats || item.powerStats || item.coolingStats || item.quantumStats || item.miningStats || item.missileStats || item.turretStats || item.missileRackStats || item.bombStats || item.salvageStats || item.qigStats || item.thrusterStats || null;
  }, []);

  const getBestPrice = useCallback((item: CatalogItem): number | null => {
    if (!item.shopInventory || item.shopInventory.length === 0) return null;
    const prices = item.shopInventory.map(si => si.priceBuy).filter((p): p is number => p !== null && p > 0);
    return prices.length > 0 ? Math.min(...prices) : null;
  }, []);

  const getBestShop = useCallback((item: CatalogItem): string | null => {
    if (!item.shopInventory || item.shopInventory.length === 0) return null;
    const sorted = item.shopInventory.filter(si => si.priceBuy !== null && si.priceBuy > 0).sort((a, b) => (a.priceBuy ?? 0) - (b.priceBuy ?? 0));
    if (sorted.length === 0) return null;
    return sorted[0].shop.name + " · " + sorted[0].shop.location.name;
  }, []);

  const sorted = useMemo(() => {
    const copy = [...results];
    copy.sort((a, b) => {
      let av: number | string = 0, bv: number | string = 0;
      switch (sortKey) {
        case "name": av = (a.localizedName || a.name).toLowerCase(); bv = (b.localizedName || b.name).toLowerCase(); break;
        case "size": av = a.size ?? 0; bv = b.size ?? 0; break;
        case "grade": av = a.grade || "Z"; bv = b.grade || "Z"; break;
        case "stat": av = getSortStatVal(getItemStats(a), hardpoint.resolvedCategory); bv = getSortStatVal(getItemStats(b), hardpoint.resolvedCategory); break;
        case "price": av = getBestPrice(a) ?? 999999; bv = getBestPrice(b) ?? 999999; break;
        case "manufacturer": av = (a.manufacturer || "zzz").toLowerCase(); bv = (b.manufacturer || "zzz").toLowerCase(); break;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return copy;
  }, [results, sortKey, sortDir, hardpoint.resolvedCategory, getItemStats, getBestPrice]);

  const toggleSort = useCallback((key: SortKey) => { if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortKey(key); setSortDir(key === "price" ? "asc" : "desc"); } }, [sortKey]);

  // Filter for turret slots: separate weapons from gimbal mounts.
  //
  // Fase J: el endpoint /api/catalog ahora consulta la tabla `turrets` real
  // (gimbal mounts con sub_type GunTurret/MannedTurret/etc) y devuelve
  // type="TURRET", separado de type="WEAPON" (armas de weapon_guns).
  //
  // Comportamiento esperado para slot TURRET con default VariPuck:
  //   - ALL: todas las armas S4 (cualquier marca) + SOLO mounts VariPuck
  //   - WEAPONS: todas las armas S4 (cualquier marca)
  //   - GIMBALS: solo mounts VariPuck
  //
  // El brandFilter SOLO se aplica a items tipo TURRET (mounts), no a
  // armas — porque las naves estan "bianeadas" a ciertos mounts (Avenger
  // trae VariPuck de fabrica), pero las armas que van dentro son libres.
  const filtered = useMemo(() => {
    let out = sorted;
    if (isTurretSlot && subFilter === "gimbals") out = out.filter(i => i.type === "TURRET");
    else if (isTurretSlot && subFilter === "weapons") out = out.filter(i => i.type === "WEAPON");
    if (brandFilter) {
      // Nota: `i.type !== "TURRET"` deja pasar armas sin importar su marca;
      // solo los mounts (type=TURRET) se filtran por brand del default.
      out = out.filter(i => i.type !== "TURRET" || i.manufacturer === brandFilter);
    }
    // Guard defensivo: un slot hijo (parentClassName presente) NUNCA acepta
    // otro rack/gimbal/head como equipado — solo ordenanza/armas/modifiers.
    // Previene el caso "Castillo dentro de Castillo" (misiles) o "Head dentro
    // de Head" (salvage) aunque la query del API se desvíe por algún motivo.
    if (parentClassName) {
      out = out.filter(
        (i) =>
          i.type !== "MISSILE_RACK" &&
          i.type !== "TURRET" &&
          i.type !== "SALVAGE_HEAD",
      );
    }
    // Además, si el padre es un bomb rack explícitamente, sacamos misiles
    // del listado (defensa si la query trajera ambos por cualquier razón).
    if (isBombRackClass(parentClassName)) {
      out = out.filter((i) => i.type === "BOMB");
    }
    // Si el padre es un salvage head, solo modifiers.
    if (isSalvageHeadClass(parentClassName)) {
      out = out.filter((i) => i.type === "SALVAGE_MODIFIER");
    }
    return out;
  }, [sorted, subFilter, isTurretSlot, brandFilter, parentClassName]);

  // Loadout.4: builder compartido entre click (select) y hover (preview).
  // Devuelve un `EquippedItem` listo para meter en overrides o previewItem.
  const buildEquipped = useCallback((item: CatalogItem): EquippedItem => {
    const stats = getItemStats(item);
    const pn = item.className ? pnLookup[item.className] ?? null : null;
    return {
      id: item.id,
      reference: item.reference,
      name: item.name,
      localizedName: item.localizedName,
      className: item.className,
      type: item.type,
      size: item.size,
      grade: item.grade,
      manufacturer: item.manufacturer,
      componentStats: stats,
      powerNetwork: pn,
    };
  }, [getItemStats]);

  const handleItemSelect = useCallback((item: CatalogItem) => {
    onSelect(buildEquipped(item));
  }, [buildEquipped, onSelect]);

  // Loadout.4: hover handlers — preview live de stats sin compromiso.
  const handleItemHover = useCallback((item: CatalogItem) => {
    setPreviewItem(hardpoint.id, buildEquipped(item));
  }, [setPreviewItem, hardpoint.id, buildEquipped]);
  const handleListLeave = useCallback(() => {
    clearPreviewItem();
  }, [clearPreviewItem]);

  const statLabel = getStatColumnLabel(hardpoint.resolvedCategory);
  const displaySize = hardpoint.maxSize > 0 ? "S" + hardpoint.maxSize : "Any";

  // Loadout.4d (2026-05-04): posición "natural" estilo dropdown.
  // Regla actualizada (Pablo: "que se despliegue desde donde toco"):
  //   1. Intentar a la DERECHA del slot (default — estilo dropdown nativo)
  //   2. Si no entra, intentar a la IZQUIERDA del slot
  //   3. Si tampoco entra, clamp al viewport del lado más cercano
  //   4. Vertical: alineado al TOP del slot. Si se sale por abajo, subir lo
  //      suficiente para que entre.
  // Esto sigue el comportamiento que el user espera de un dropdown clásico:
  // se "abre" pegado al elemento que clickeó, en la dirección natural de
  // lectura (LTR → derecha-abajo).
  // Loadout.4e (2026-05-04): panel más compacto y pegado al slot.
  // Cambios vs versión anterior:
  //   - Ancho: 480 → 360 px (más minimalista)
  //   - Margen al slot: 12 → 4 px (pegado, estilo dropdown nativo)
  //   - Max altura: 70vh → 60vh
  const panelStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (!anchorRect) return undefined;
    if (typeof window === "undefined") return undefined;
    const PANEL_W = 360;
    const PANEL_MAX_H_RATIO = 0.6;
    const MARGIN = 4;        // gap al slot (pegado)
    const VIEWPORT_PAD = 8;  // padding mínimo al viewport
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (vw < 640) return undefined; // mobile: que use el inset-4 default

    // Intentar derecha primero (estilo dropdown nativo)
    const tryRight = anchorRect.right + MARGIN;
    const tryLeft = anchorRect.left - PANEL_W - MARGIN;
    let left: number;
    if (tryRight + PANEL_W <= vw - VIEWPORT_PAD) {
      left = tryRight;
    } else if (tryLeft >= VIEWPORT_PAD) {
      left = tryLeft;
    } else {
      left = Math.max(VIEWPORT_PAD, vw - PANEL_W - VIEWPORT_PAD);
    }

    // Vertical: alinear con el top del slot, clampeado al viewport
    const maxH = vh * PANEL_MAX_H_RATIO;
    let top = anchorRect.top;
    if (top + maxH > vh - VIEWPORT_PAD) {
      top = Math.max(VIEWPORT_PAD, vh - VIEWPORT_PAD - maxH);
    }
    return {
      left: `${Math.round(left)}px`,
      top: `${Math.round(top)}px`,
      right: "auto",
      bottom: "auto",
      width: `${PANEL_W}px`,
      maxHeight: `${maxH}px`,
    };
  }, [anchorRect]);

  return (
    <>
      {/* Loadout.4 (2026-05-04): el modal con backdrop velo se reemplazó por
          un panel flotante anclado bottom-right. Esto:
          - NO tapa las stats arriba/izquierda (loadout-detail, ship-card,
            armor-check) — el user ve los cambios live mientras hovea.
          - NO usa overlay oscuro — solo un drop shadow para diferenciarlo.
          - Click afuera del panel cierra (handler abajo); ESC también.
          En mobile (< sm) volvemos al inset-4 full-screen porque el espacio
          es chico y un panel chiquito sería peor. */}
      <div
        className="fixed inset-0 z-40 sm:hidden bg-black/40 pointer-events-auto"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        // Loadout.4e: panel compacto. En desktop (sm+) el style inline maneja
        // left/top/width via `panelStyle`. Mobile usa inset-4 full-screen.
        className="fixed inset-4 z-50 bg-zinc-950 border border-zinc-800/70 rounded-sm flex flex-col shadow-2xl shadow-black/60 sm:inset-auto sm:bottom-4 sm:right-4 sm:left-auto sm:top-auto sm:w-[360px] sm:max-h-[60vh]"
        style={panelStyle}
      >
        {/* Header compacto — categoría + size + close en 1 línea */}
        <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-zinc-800/50 flex-shrink-0">
          <div className="w-0.5 h-4 rounded-full opacity-60" style={{ backgroundColor: catColor }} />
          <div className="flex-1 min-w-0 flex items-center gap-1.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-300 truncate">
              {hardpoint.resolvedCategory}
            </span>
            <span className="text-[9px] font-mono text-zinc-600">
              {displaySize}{hardpoint.isFixed ? " · Fix" : ""}
            </span>
            <span className="text-[9px] font-mono text-zinc-700 ml-auto">{filtered.length}</span>
          </div>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400 transition-colors text-[11px] leading-none px-1" title="Cerrar">
            ✕
          </button>
        </div>

        {/* Search compacto + clear */}
        <div className="px-2 py-1.5 border-b border-zinc-800/30 flex-shrink-0 flex items-center gap-1.5">
          <input ref={inputRef} type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar…" className="flex-1 px-2 py-1 bg-zinc-900/60 border border-zinc-800/50 rounded-sm text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-cyan-500/30 transition-colors" />
          <button onClick={onClear} className="text-[9px] text-zinc-600 hover:text-red-400 transition-colors tracking-wide uppercase px-1.5 py-1 border border-zinc-800/40 rounded-sm hover:border-red-400/30 shrink-0" title="Limpiar slot">
            Clear
          </button>
        </div>

        {/* Sub-filter para turrets — solo aparece si aplica */}
        {isTurretSlot && (
          <div className="flex items-center justify-end px-2 py-1 border-b border-zinc-800/30 flex-shrink-0">
            <div className="flex gap-0.5 bg-zinc-800/60 rounded p-0.5">
              {(["all", "weapons", "gimbals"] as SubFilter[]).map(f => (
                <button key={f} onClick={() => setSubFilter(f)}
                  className={`px-1.5 py-0.5 text-[8px] font-mono rounded transition-colors uppercase ${subFilter === f ? "bg-zinc-700 text-zinc-200" : "text-zinc-500 hover:text-zinc-400"}`}>
                  {f}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-1 px-2 py-1 border-b border-zinc-800/40 bg-zinc-900/30 text-[8px] tracking-wider uppercase text-zinc-600 flex-shrink-0">
          <ColHead label="Name" k="name" cur={sortKey} dir={sortDir} toggle={toggleSort} cls="flex-1" />
          <ColHead label="S" k="size" cur={sortKey} dir={sortDir} toggle={toggleSort} cls="w-5 text-center" />
          <ColHead label="Gr" k="grade" cur={sortKey} dir={sortDir} toggle={toggleSort} cls="w-5 text-center" />
          <ColHead label={statLabel} k="stat" cur={sortKey} dir={sortDir} toggle={toggleSort} cls="w-12 text-right" />
          <ColHead label="$" k="price" cur={sortKey} dir={sortDir} toggle={toggleSort} cls="w-12 text-right" />
        </div>

        <div
          className="flex-1 overflow-y-auto min-h-0"
          onMouseLeave={handleListLeave}
        >
          {loading && results.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-zinc-600 text-sm"><div className="w-4 h-4 border-2 border-zinc-700 border-t-cyan-500 rounded-full animate-spin mr-2" />Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-zinc-600 text-sm">No compatible components found.</div>
          ) : filtered.map(item => {
            const isCurrent = item.id === currentItemId;
            const sv = getKeyStat(hardpoint.resolvedCategory, getItemStats(item));
            const price = getBestPrice(item);
            const shop = getBestShop(item);
            // Loadout.4e: rows más densas (px-2 py-1.5 en vez de px-4 py-2)
            const rowCls = isCurrent ? "w-full flex items-center gap-1 px-2 py-1.5 text-left bg-cyan-500/5 cursor-default border-b border-zinc-800/20" : "w-full flex items-center gap-1 px-2 py-1.5 text-left hover:bg-zinc-800/30 cursor-pointer border-b border-zinc-800/20 transition-colors";
            return (
              <button
                key={item.id}
                onClick={() => handleItemSelect(item)}
                onMouseEnter={() => !isCurrent && handleItemHover(item)}
                onFocus={() => !isCurrent && handleItemHover(item)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  const itemType = CAT_TO_ITEM_TYPE[hardpoint.resolvedCategory] || hardpoint.resolvedCategory;
                  const ref = item.reference || item.className || item.id;
                  if (!ref || !item.name) return;
                  setContextMenu({
                    reference: String(ref),
                    name: String(item.localizedName || item.name),
                    itemType,
                    size: item.size ?? null,
                    grade: item.grade ?? null,
                    x: e.clientX,
                    y: e.clientY,
                  });
                }}
                disabled={isCurrent}
                className={rowCls}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1"><span className="text-[11px] text-zinc-200 truncate">{item.localizedName || item.name}</span>{isCurrent && <span className="text-[7px] text-cyan-500 tracking-wider shrink-0">●</span>}</div>
                  {/* Loadout.4e: tooltip con manufacturer + shop en lugar de filas extra para
                      mantener la card compacta. El shop se ve solo en hover via title. */}
                  {item.manufacturer && (
                    <div className="text-[8px] text-zinc-600 truncate">{item.manufacturer}{shop ? ` · ${shop}` : ""}</div>
                  )}
                </div>
                <div className="w-5 text-center text-[10px] font-mono text-zinc-500">{item.size != null ? `S${item.size}` : "?"}</div>
                <div className="w-5 text-center text-[10px]">{item.grade ? <span className={gradeClass(item.grade)}>{item.grade}</span> : <span className="text-zinc-800">-</span>}</div>
                <div className="w-12 text-right font-mono text-[10px]" style={{ color: catColor }}>{sv ? sv.v : <span className="text-zinc-800">-</span>}</div>
                <div className="w-12 text-right">{price !== null ? <span className="text-[9px] font-mono text-amber-400/80">{fmtPrice(price)}</span> : <span className="text-[9px] text-zinc-800">-</span>}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Context menu para agregar a inventario / wishlist con click derecho */}
      <ComponentContextMenu target={contextMenu} onClose={() => setContextMenu(null)} />
    </>
  );
}

function ColHead({ label, k, cur, dir, toggle, cls }: { label: string; k: SortKey; cur: SortKey; dir: SortDir; toggle: (k: SortKey) => void; cls: string }) {
  const active = cur === k;
  return <button onClick={() => toggle(k)} className={cls + " cursor-pointer hover:text-zinc-400 transition-colors select-none " + (active ? "text-zinc-400" : "")}>{label}{active ? (dir === "asc" ? " ↑" : " ↓") : ""}</button>;
}

function getStatColumnLabel(cat: string): string {
  switch (cat) {
    case "WEAPON": case "TURRET": return "DPS";
    case "SHIELD": return "HP";
    case "POWER_PLANT": return "Output";
    case "COOLER": return "Rate";
    case "QUANTUM_DRIVE": return "Spool";
    // MISSILE_RACK slot: ahora muestra racks (tabla missile_launchers) con
    // label de capacidad tipo "4xS3". El slot hijo MISSILE sigue siendo DMG.
    case "MISSILE_RACK": return "CAP";
    // SALVAGE: las heads no tienen stat propia (el stat column queda "-");
    // los modifiers muestran Speed multiplier como métrica principal.
    case "SALVAGE": return "Spd";
    // QIG: métrica principal es el alcance de jamming (los 3 QIGs siempre
    // tienen jamming_range; sólo el Reynie corta saltos con interdict_range).
    case "QIG": return "Jam";
    default: return "Pwr";
  }
}

function getSortStatVal(stats: Record<string, any> | null, cat: string): number {
  if (!stats) return 0;
  switch (cat) {
    case "WEAPON": case "TURRET":
      // Armas (type=WEAPON) ordenan por DPS. Gimbal mounts (type=TURRET) no
      // tienen DPS — ordenamos por cantidad de puertos de arma (mas puertos
      // = mount mas "grande"/capable). Si no hay nada, 0 queda al final.
      return stats.dps ?? stats.weaponPorts ?? 0;
    case "SHIELD": return stats.maxHp ?? stats.shieldHp ?? 0;
    case "POWER_PLANT": return stats.powerOutput ?? 0;
    case "COOLER": return stats.coolingRate ?? 0;
    case "QUANTUM_DRIVE": return stats.spoolUpTime ?? stats.quantumSpoolUp ?? 999;
    case "MISSILE_RACK":
      // Racks (type=MISSILE_RACK) ordenan por cantidad de puertos de misil
      // (mas puertos = mas capacidad). Si stats es de un misil suelto
      // (type=MISSILE) caemos a damage como antes.
      return stats.missilePorts ?? stats.damage ?? stats.alphaDamage ?? 0;
    case "SALVAGE":
      // Modifiers: orden por speed multiplier (más rápido primero). Heads
      // no tienen speed — quedan al final con 0.
      return stats.salvageSpeedMultiplier ?? 0;
    case "QIG":
      // Orden por jamming range descendente (más alcance primero).
      return stats.jammingRange ?? 0;
    default: return stats.powerDraw ?? 0;
  }
}

function gradeClass(g: string | number): string {
  const s = String(g).toUpperCase();
  switch (s) { case "A": case "1": return "text-[10px] font-mono font-bold text-amber-400"; case "B": case "2": return "text-[10px] font-mono font-bold text-cyan-400"; case "C": case "3": return "text-[10px] font-mono font-bold text-zinc-400"; default: return "text-[10px] font-mono font-bold text-zinc-600"; }
}
