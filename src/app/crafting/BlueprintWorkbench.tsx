"use client";

import { useState, useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCraftingData } from "./useCraftingData";
import type { Blueprint } from "./types";

/* ═══════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════ */
interface CraftQueueItem {
  blueprintId: string;
  quantity: number;
}

type WidgetId =
  | "categories"
  | "blueprint-header"
  | "parts"
  | "quality-effects"
  | "total-materials"
  | "how-to-obtain"
  | "queue"
  | "quality-slider"
  | "quality-stats"
  | "summary"
  | "shopping-list"
  | "recommendations";

const ALL_WIDGETS: WidgetId[] = [
  "categories",
  "blueprint-header",
  "parts",
  "quality-effects",
  "total-materials",
  "how-to-obtain",
  "queue",
  "quality-slider",
  "quality-stats",
  "summary",
  "shopping-list",
  "recommendations",
];

const DEFAULT_COLUMNS: WidgetId[][] = [
  ["categories"],
  ["blueprint-header", "parts", "quality-effects", "total-materials", "how-to-obtain"],
  ["queue", "quality-slider", "quality-stats", "summary", "shopping-list", "recommendations"],
];

const STORAGE_KEY = "al-filo-workbench-cols";

function loadColumns(): WidgetId[][] {
  try {
    if (typeof window === "undefined") return DEFAULT_COLUMNS.map((c) => [...c]);
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as WidgetId[][];
      const flat = parsed.flat();
      if (
        parsed.length === 3 &&
        ALL_WIDGETS.every((w) => flat.includes(w)) &&
        flat.length === ALL_WIDGETS.length
      ) return parsed;
    }
  } catch {}
  return DEFAULT_COLUMNS.map((c) => [...c]);
}

function saveColumns(cols: WidgetId[][]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cols)); } catch {}
}

/* ═══════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════ */
const formatModKey = (key: string) =>
  key.replace(/^(weapon_|armor_)/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function formatPoolKey(key: string) {
  return key.replace(/^BP_MISSIONREWARD_/, "").replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
}

const GRAD = "bg-gradient-to-r from-[#4a6741] to-[#f97316]";

function getTotalMaterials(bp: Blueprint) {
  const costs: Record<string, { name: string; scu: number }> = {};
  for (const part of bp.parts)
    for (const mat of part.materials) {
      if (!costs[mat.resourceUuid]) costs[mat.resourceUuid] = { name: mat.resourceName, scu: 0 };
      costs[mat.resourceUuid].scu += mat.quantityScu;
    }
  return costs;
}

/* ═══════════════════════════════════════════════════════
   SortableWidget — header IS the drag handle
   ═══════════════════════════════════════════════════════ */
function SortableWidget({
  id,
  header,
  children,
}: {
  id: WidgetId;
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    /* Gradient border via CSS mask — only the 1px ring is colored, interior stays transparent */
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1, position: "relative", borderRadius: "12px" }}
    >
      {/* This div renders the gradient ONLY at the 1px border using mask-composite */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "12px",
          padding: "1px",
          background: "linear-gradient(to right, #4a6741, #f97316)",
          WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
          pointerEvents: "none",
        }}
      />
      {/* Content — transparent background lets video show through cleanly */}
      <div className="bg-zinc-900/40 rounded-[11px] overflow-hidden">
        {/* The card header doubles as drag handle */}
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing select-none"
        >
          {header}
        </div>
        {children}
      </div>
    </div>
  );
}

/* Label map for the drag overlay ghost */
const WIDGET_LABELS: Record<WidgetId, string> = {
  "categories": "Categorías",
  "blueprint-header": "Plano",
  "parts": "Desglose de partes",
  "quality-effects": "Efectos de calidad",
  "total-materials": "Coste total de materiales",
  "how-to-obtain": "Cómo obtener",
  "queue": "Cola de fabricación",
  "quality-slider": "Calidad del material",
  "quality-stats": "Impacto de calidad",
  "summary": "Resumen",
  "shopping-list": "Lista de compras",
  "recommendations": "Recomendaciones",
};

/* ═══════════════════════════════════════════════════════
   Mock data (fallback when Supabase is unavailable)
   ═══════════════════════════════════════════════════════ */
const MOCK_BLUEPRINTS: Blueprint[] = [
  {
    uuid: "mock-1", key: "BP_Armor_Helmet_Light_S01", kind: "armor",
    outputName: "Novikov Helmet Mk I", outputClass: "armor",
    outputType: "Char_Armor_Head", outputSubtype: "helmets", outputGrade: "A",
    tierIndex: 1, craftTimeSeconds: 135, isDefault: true,
    parts: [
      {
        groupKey: "shell", groupName: "Outer Shell", requiredCount: 1,
        materials: [
          { resourceUuid: "m1", resourceName: "Titanium", resourceKey: "Ore_Titanium", description: "", refinedName: null, boxSizes: [1, 2], quantityScu: 0.048, minQuality: 0 },
          { resourceUuid: "m2", resourceName: "Copper", resourceKey: "Ore_Copper", description: "", refinedName: null, boxSizes: [1], quantityScu: 0.012, minQuality: 0 },
        ],
        modifiers: [],
      },
      {
        groupKey: "visor", groupName: "Visor Assembly", requiredCount: 1,
        materials: [
          { resourceUuid: "m3", resourceName: "Silicon", resourceKey: "Ore_Silicon", description: "", refinedName: null, boxSizes: [1], quantityScu: 0.008, minQuality: 250 },
          { resourceUuid: "m4", resourceName: "Gold", resourceKey: "Ore_Gold", description: "", refinedName: null, boxSizes: [1], quantityScu: 0.003, minQuality: 0 },
        ],
        modifiers: [{ propertyKey: "armor_visibility_range", qualityMin: 0, qualityMax: 1000, atMinQuality: 80, atMaxQuality: 120 }],
      },
    ],
    qualityEffects: {
      armor_damage_reduction: { atMinQuality: 12, atMaxQuality: 22 },
      armor_temperature_resistance: { atMinQuality: 40, atMaxQuality: 85 },
    },
    rewardPools: [],
  },
  {
    uuid: "mock-2", key: "BP_Armor_Torso_Medium_S01", kind: "armor",
    outputName: "Ravager Chestplate", outputClass: "armor",
    outputType: "Char_Armor_Torso", outputSubtype: "chest", outputGrade: "B",
    tierIndex: 2, craftTimeSeconds: 300, isDefault: false,
    parts: [
      {
        groupKey: "plate", groupName: "Chest Plate", requiredCount: 1,
        materials: [
          { resourceUuid: "m1", resourceName: "Titanium", resourceKey: "Ore_Titanium", description: "", refinedName: null, boxSizes: [1, 2], quantityScu: 0.120, minQuality: 0 },
          { resourceUuid: "m5", resourceName: "Laranite", resourceKey: "Ore_Laranite", description: "", refinedName: null, boxSizes: [1], quantityScu: 0.035, minQuality: 500 },
        ],
        modifiers: [],
      },
    ],
    qualityEffects: {
      armor_damage_reduction: { atMinQuality: 28, atMaxQuality: 52 },
      armor_movement_penalty: { atMinQuality: -15, atMaxQuality: -5 },
    },
    rewardPools: [{ poolUuid: "rp-1", poolKey: "BP_MISSIONREWARD_CrimeStatClear_Tier3" }],
  },
  {
    uuid: "mock-3", key: "BP_Weapon_SMG_S01", kind: "weapon",
    outputName: "P8-SC SMG Custom", outputClass: "weapon",
    outputType: "Weapon_Personal", outputSubtype: "smg", outputGrade: "A",
    tierIndex: 1, craftTimeSeconds: 480, isDefault: false,
    parts: [
      {
        groupKey: "receiver", groupName: "Receiver", requiredCount: 1,
        materials: [
          { resourceUuid: "m1", resourceName: "Titanium", resourceKey: "Ore_Titanium", description: "", refinedName: null, boxSizes: [1, 2], quantityScu: 0.090, minQuality: 0 },
          { resourceUuid: "m7", resourceName: "Steel", resourceKey: "Steel", description: "", refinedName: null, boxSizes: [1], quantityScu: 0.045, minQuality: 0 },
        ],
        modifiers: [],
      },
      {
        groupKey: "barrel", groupName: "Barrel Assembly", requiredCount: 1,
        materials: [
          { resourceUuid: "m1", resourceName: "Titanium", resourceKey: "Ore_Titanium", description: "", refinedName: null, boxSizes: [1, 2], quantityScu: 0.030, minQuality: 200 },
          { resourceUuid: "m2", resourceName: "Copper", resourceKey: "Ore_Copper", description: "", refinedName: null, boxSizes: [1], quantityScu: 0.015, minQuality: 0 },
        ],
        modifiers: [{ propertyKey: "weapon_bullet_speed", qualityMin: 0, qualityMax: 1000, atMinQuality: 720, atMaxQuality: 900 }],
      },
    ],
    qualityEffects: {
      weapon_damage: { atMinQuality: 18, atMaxQuality: 32 },
      weapon_range: { atMinQuality: 55, atMaxQuality: 90 },
      weapon_spread: { atMinQuality: 3.2, atMaxQuality: 1.1 },
    },
    rewardPools: [],
  },
  {
    uuid: "mock-4", key: "BP_Armor_Legs_Light_S01", kind: "armor",
    outputName: "Novikov Greaves Mk I", outputClass: "armor",
    outputType: "Char_Armor_Legs", outputSubtype: "legs", outputGrade: "A",
    tierIndex: 1, craftTimeSeconds: 110, isDefault: true,
    parts: [
      {
        groupKey: "plates", groupName: "Leg Plates", requiredCount: 2,
        materials: [
          { resourceUuid: "m1", resourceName: "Titanium", resourceKey: "Ore_Titanium", description: "", refinedName: null, boxSizes: [1, 2], quantityScu: 0.036, minQuality: 0 },
          { resourceUuid: "m6", resourceName: "Polymer", resourceKey: "Polymer", description: "", refinedName: null, boxSizes: [1], quantityScu: 0.024, minQuality: 0 },
        ],
        modifiers: [],
      },
    ],
    qualityEffects: { armor_damage_reduction: { atMinQuality: 8, atMaxQuality: 16 } },
    rewardPools: [],
  },
];

const MOCK_CATEGORIES: import("./types").Category[] = [
  { id: "Char_Armor_Head", name: "Head Armor", count: 1, subCategories: [{ id: "helmets", name: "Helmets", count: 1 }] },
  { id: "Char_Armor_Torso", name: "Torso Armor", count: 1, subCategories: [{ id: "chest", name: "Chest Plates", count: 1 }] },
  { id: "Char_Armor_Legs", name: "Leg Armor", count: 1, subCategories: [{ id: "legs", name: "Greaves & Pants", count: 1 }] },
  { id: "Weapon_Personal", name: "Personal Weapons", count: 1, subCategories: [{ id: "smg", name: "SMGs", count: 1 }] },
];

/* ═══════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════ */
export default function BlueprintWorkbench() {
  const tb = useTranslations("Crafting.blueprints");
  const tc = useTranslations("Crafting.calculator");
  const { blueprints: apiBps, categories: apiCats, loading, error } = useCraftingData();

  const blueprints = apiBps.length > 0 ? apiBps : (error ? MOCK_BLUEPRINTS : apiBps);
  const categories = apiCats.length > 0 ? apiCats : (error ? MOCK_CATEGORIES : apiCats);

  // ── Shared state ──────────────────────────────────────
  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [qualityLevel, setQualityLevel] = useState(500);
  const [queue, setQueue] = useState<CraftQueueItem[]>([]);
  const [addQty, setAddQty] = useState(1);

  // ── Layout state ──────────────────────────────────────
  const [columns, setColumns] = useState<WidgetId[][]>(loadColumns);
  const [activeId, setActiveId] = useState<WidgetId | null>(null);

  useMemo(() => {
    if (blueprints.length > 0 && !selectedBlueprintId) setSelectedBlueprintId(blueprints[0].uuid);
    if (categories.length > 0 && expandedCategories.size === 0)
      setExpandedCategories(new Set(categories.map((c) => c.id)));
  }, [blueprints, categories]);

  const selectedBlueprint = useMemo(
    () => blueprints.find((b) => b.uuid === selectedBlueprintId) || null,
    [blueprints, selectedBlueprintId]
  );

  // ── DnD sensors ───────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  const findColumn = useCallback((id: WidgetId) => {
    return columns.findIndex((col) => col.includes(id));
  }, [columns]);

  const handleDragStart = useCallback(({ active }: DragStartEvent) => {
    setActiveId(active.id as WidgetId);
  }, []);

  const handleDragOver = useCallback(({ active, over }: DragOverEvent) => {
    if (!over || active.id === over.id) return;
    const srcCol = columns.findIndex((c) => c.includes(active.id as WidgetId));
    const dstCol = columns.findIndex((c) => c.includes(over.id as WidgetId));
    if (srcCol === -1 || dstCol === -1 || srcCol === dstCol) return;

    setColumns((prev) => {
      const next = prev.map((c) => [...c]);
      const item = active.id as WidgetId;
      next[srcCol] = next[srcCol].filter((w) => w !== item);
      const overIdx = next[dstCol].indexOf(over.id as WidgetId);
      next[dstCol].splice(overIdx >= 0 ? overIdx : next[dstCol].length, 0, item);
      return next;
    });
  }, [columns]);

  const handleDragEnd = useCallback(({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const colIdx = columns.findIndex((c) => c.includes(active.id as WidgetId));
    if (colIdx === -1) return;

    setColumns((prev) => {
      const next = prev.map((c) => [...c]);
      const col = next[colIdx];
      const oldIdx = col.indexOf(active.id as WidgetId);
      const newIdx = col.indexOf(over.id as WidgetId);
      if (oldIdx !== -1 && newIdx !== -1) next[colIdx] = arrayMove(col, oldIdx, newIdx);
      saveColumns(next);
      return next;
    });
  }, [columns]);

  const handleDragCancel = useCallback(() => setActiveId(null), []);

  const resetLayout = () => {
    const def = DEFAULT_COLUMNS.map((c) => [...c]);
    setColumns(def);
    saveColumns(def);
  };

  // ── Category tree ─────────────────────────────────────
  const toggleCategory = (catId: string) => {
    const next = new Set(expandedCategories);
    if (next.has(catId)) next.delete(catId); else next.add(catId);
    setExpandedCategories(next);
  };

  // ── Queue helpers ─────────────────────────────────────
  const addToQueue = () => {
    if (!selectedBlueprintId) return;
    const qty = Math.max(1, addQty);
    setQueue((prev) => {
      const existing = prev.find((q) => q.blueprintId === selectedBlueprintId);
      if (existing) return prev.map((q) => q.blueprintId === selectedBlueprintId ? { ...q, quantity: q.quantity + qty } : q);
      return [...prev, { blueprintId: selectedBlueprintId, quantity: qty }];
    });
  };
  const removeFromQueue = (id: string) => setQueue((p) => p.filter((q) => q.blueprintId !== id));
  const updateQuantity = (id: string, qty: number) => {
    if (qty <= 0) removeFromQueue(id);
    else setQueue((p) => p.map((q) => q.blueprintId === id ? { ...q, quantity: qty } : q));
  };

  // ── Aggregations ──────────────────────────────────────
  const aggregatedMaterials = useMemo(() => {
    const costs: Record<string, { name: string; scu: number }> = {};
    queue.forEach(({ blueprintId, quantity }) => {
      const bp = blueprints.find((b) => b.uuid === blueprintId);
      if (!bp) return;
      bp.parts.forEach((p) => p.materials.forEach((mat) => {
        if (!costs[mat.resourceUuid]) costs[mat.resourceUuid] = { name: mat.resourceName, scu: 0 };
        costs[mat.resourceUuid].scu += mat.quantityScu * quantity;
      }));
    });
    return costs;
  }, [queue, blueprints]);

  const totalCraftTime = useMemo(
    () => queue.reduce((s, { blueprintId, quantity }) => s + (blueprints.find((b) => b.uuid === blueprintId)?.craftTimeSeconds ?? 0) * quantity, 0),
    [queue, blueprints]
  );
  const totalItems = queue.reduce((s, q) => s + q.quantity, 0);

  // ── Quality ───────────────────────────────────────────
  const qualityPct = (qualityLevel / 1000) * 100;
  const modifiedStats = useMemo(() => {
    if (!selectedBlueprint) return {};
    const out: Record<string, { base: number; modified: number; bonus: number }> = {};
    Object.entries(selectedBlueprint.qualityEffects).forEach(([stat, effect]) => {
      const bonus = ((effect.atMaxQuality - effect.atMinQuality) * qualityPct) / 100;
      out[stat] = { base: effect.atMinQuality, modified: effect.atMinQuality + bonus, bonus };
    });
    return out;
  }, [selectedBlueprint, qualityPct]);

  const getQC = (q: number) => q < 250 ? "text-red-400" : q < 500 ? "text-orange-400" : q < 750 ? "text-yellow-400" : "text-emerald-400";
  const getQL = (q: number) => q < 250 ? tc("poor") : q < 500 ? tc("substandard") : q < 750 ? tc("standard") : q < 900 ? tc("high") : tc("excellent");

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-5 h-5 border-2 border-zinc-800 border-t-amber-500 rounded-full animate-spin mr-3" />
      <span className="text-xs text-zinc-500 font-mono uppercase tracking-widest">{tb("loadingBlueprints")}</span>
    </div>
  );

  /* ═══════════════════════════════════════════════════════
     Widget renderers
     ═══════════════════════════════════════════════════════ */
  const renderWidgetContent = (wId: WidgetId) => {
    switch (wId) {

      /* ── Categories ── */
      case "categories":
        return (
          <SortableWidget key={wId} id={wId}
            header={
              <div className="px-4 py-3 border-b border-zinc-800/60 bg-zinc-950/30 flex items-center">
                <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-widest flex-1">{tb("categories")}</h3>
                <span className="text-[9px] text-zinc-700">⠿⠿</span>
              </div>
            }
          >
            <div className="p-3 space-y-1 max-h-[60vh] overflow-y-auto">
              {categories.map((category) => (
                <div key={category.id}>
                  <button
                    onClick={() => toggleCategory(category.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-zinc-200 hover:bg-zinc-800/60 transition-colors group"
                  >
                    <span className="text-amber-500/70 group-hover:text-amber-400 text-[10px]">
                      {expandedCategories.has(category.id) ? "▼" : "▶"}
                    </span>
                    <span className="flex-1 text-left text-xs">{category.name}</span>
                    <span className="text-[9px] text-amber-400/70 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full font-mono">
                      {category.count}
                    </span>
                  </button>
                  {expandedCategories.has(category.id) && (
                    <div className="ml-3 mt-0.5 border-l border-zinc-800/60 pl-3 space-y-1.5">
                      {category.subCategories.map((subCat) => {
                        const subBps = blueprints.filter((b) => b.outputType === category.id && b.outputSubtype === subCat.id);
                        return (
                          <div key={subCat.id}>
                            <div className="text-[9px] text-cyan-500/60 px-2 py-0.5 font-bold uppercase tracking-widest">
                              {subCat.name}<span className="ml-1 text-zinc-700 font-normal">({subCat.count})</span>
                            </div>
                            <div className="space-y-0.5 max-h-36 overflow-y-auto">
                              {subBps.map((bp) => (
                                <button
                                  key={bp.uuid}
                                  onClick={() => setSelectedBlueprintId(bp.uuid)}
                                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-all duration-150 ${
                                    selectedBlueprintId === bp.uuid
                                      ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 border border-transparent"
                                  }`}
                                >
                                  <span className="truncate block leading-snug">{bp.outputName}</span>
                                  {bp.isDefault && <span className="text-[8px] text-emerald-400 font-bold">{tb("default")}</span>}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </SortableWidget>
        );

      /* ── Blueprint Header ── */
      case "blueprint-header":
        if (!selectedBlueprint) return (
          <SortableWidget key={wId} id={wId}
            header={
              <div className="px-5 py-3 border-b border-zinc-800/60 bg-zinc-950/30 flex items-center">
                <span className="text-xs text-zinc-500 flex-1">{tb("selectPrompt")}</span>
                <span className="text-[9px] text-zinc-700">⠿⠿</span>
              </div>
            }
          >
            <div className="p-10 text-center">
              <p className="text-zinc-500 text-sm">{tb("selectPrompt")}</p>
            </div>
          </SortableWidget>
        );
        return (
          <SortableWidget key={wId} id={wId}
            header={
              <div className="px-5 pt-5 pb-4 flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight mb-0.5">{selectedBlueprint.outputName}</h2>
                  <p className="text-zinc-500 text-xs font-mono">{selectedBlueprint.key}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                  {selectedBlueprint.isDefault && (
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1 rounded-full uppercase tracking-wider">{tb("defaultPill")}</span>
                  )}
                  {selectedBlueprint.rewardPools.length > 0 && (
                    <span className="text-[10px] font-bold text-violet-400 bg-violet-500/10 border border-violet-500/25 px-2.5 py-1 rounded-full uppercase tracking-wider">{tb("missionReward")}</span>
                  )}
                  <span className="text-[9px] text-zinc-700 ml-1">⠿⠿</span>
                </div>
              </div>
            }
          >
            <div className="px-5 pb-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="bg-zinc-950/50 border border-cyan-500/15 rounded-lg px-3 py-2.5">
                  <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1">{tb("craftTime")}</div>
                  <div className="text-base font-mono font-bold text-cyan-400">
                    {selectedBlueprint.craftTimeSeconds >= 60
                      ? `${Math.floor(selectedBlueprint.craftTimeSeconds / 60)}m ${selectedBlueprint.craftTimeSeconds % 60}s`
                      : `${selectedBlueprint.craftTimeSeconds}s`}
                  </div>
                </div>
                <div className="bg-zinc-950/50 border border-amber-500/15 rounded-lg px-3 py-2.5">
                  <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1">{tb("type")}</div>
                  <div className="text-xs font-mono font-semibold text-amber-300 truncate">{selectedBlueprint.outputType.replace(/Char_Armor_/, "Armor/")}</div>
                </div>
                <div className="bg-zinc-950/50 border border-zinc-700/40 rounded-lg px-3 py-2.5">
                  <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1">{tb("subtype")}</div>
                  <div className="text-xs font-mono font-semibold text-zinc-200 truncate">{selectedBlueprint.outputSubtype}</div>
                </div>
                {selectedBlueprint.outputGrade && (
                  <div className="bg-zinc-950/50 border border-zinc-700/40 rounded-lg px-3 py-2.5">
                    <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1">{tb("grade")}</div>
                    <div className="text-xs font-mono font-semibold text-zinc-200">{selectedBlueprint.outputGrade}</div>
                  </div>
                )}
              </div>
            </div>
          </SortableWidget>
        );

      /* ── Parts Breakdown ── */
      case "parts":
        if (!selectedBlueprint) return null;
        return (
          <SortableWidget key={wId} id={wId}
            header={
              <div className="px-5 py-3.5 border-b border-zinc-800/60 bg-zinc-950/30 flex items-center">
                <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-widest flex-1">{tb("partsBreakdown")}</h3>
                <span className="text-[9px] text-zinc-700">⠿⠿</span>
              </div>
            }
          >
            <div className="p-5 space-y-3">
              {selectedBlueprint.parts.map((part) => (
                <div key={part.groupKey} className="border border-zinc-800/50 rounded-xl p-4 bg-zinc-950/30 border-l-2 border-l-cyan-500/40">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-mono text-xs font-bold text-cyan-400 tracking-wide">{part.groupName}</h4>
                    {part.requiredCount > 1 && (
                      <span className="text-[9px] font-bold text-amber-400/70 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                        {tb("requiredCount", { count: part.requiredCount })}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-2">
                    {part.materials.map((mat) => (
                      <div key={mat.resourceUuid} className="bg-zinc-900/60 rounded-lg p-2.5 border border-zinc-700/30 hover:border-amber-500/20 transition-colors">
                        <div className="text-xs text-zinc-400 mb-1 leading-snug">{mat.resourceName}</div>
                        <div className="font-mono text-sm font-bold text-amber-400">
                          {mat.quantityScu.toFixed(3)}<span className="text-amber-500/50 font-normal text-xs ml-1">SCU</span>
                        </div>
                        {mat.minQuality > 0 && <div className="text-[9px] text-zinc-600 mt-0.5">{tb("minQ", { value: mat.minQuality })}</div>}
                      </div>
                    ))}
                  </div>
                  {part.modifiers.length > 0 && (
                    <div className="pt-2.5 border-t border-zinc-800/40">
                      <div className="text-[9px] text-zinc-600 uppercase tracking-wider mb-1.5">{tb("modifiers")}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {part.modifiers.map((mod) => (
                          <span key={mod.propertyKey} className="text-[9px] px-2 py-0.5 bg-cyan-500/8 text-cyan-400 rounded-full border border-cyan-500/20">
                            {formatModKey(mod.propertyKey)}: {mod.atMinQuality} → {mod.atMaxQuality}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </SortableWidget>
        );

      /* ── Quality Effects (range) ── */
      case "quality-effects":
        if (!selectedBlueprint || Object.keys(selectedBlueprint.qualityEffects).length === 0) return null;
        return (
          <SortableWidget key={wId} id={wId}
            header={
              <div className="px-5 py-3.5 border-b border-zinc-800/60 bg-zinc-950/30 flex items-center">
                <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-widest flex-1">{tb("qualityEffects")}</h3>
                <span className="text-[9px] text-zinc-700">⠿⠿</span>
              </div>
            }
          >
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(selectedBlueprint.qualityEffects).map(([stat, effect]) => {
                const isIncrease = effect.atMaxQuality >= effect.atMinQuality;
                return (
                  <div key={stat} className="border border-zinc-800/40 rounded-xl p-4 bg-zinc-950/20">
                    <div className="text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-3">{formatModKey(stat)}</div>
                    <div className="flex justify-between items-baseline mb-2">
                      <div><span className="text-[9px] text-zinc-600 uppercase">Q0 </span><span className="font-mono text-sm text-zinc-300">{effect.atMinQuality}</span></div>
                      <span className="text-zinc-700 text-xs">→</span>
                      <div><span className="text-[9px] text-zinc-600 uppercase">Q1000 </span><span className={`font-mono text-sm font-bold ${isIncrease ? "text-emerald-400" : "text-red-400"}`}>{effect.atMaxQuality}</span></div>
                    </div>
                    <div className="w-full bg-zinc-800/60 rounded-full h-1.5">
                      <div
                        className={`h-full rounded-full ${isIncrease ? "bg-gradient-to-r from-[#4a6741] to-orange-500" : "bg-gradient-to-r from-red-700 to-orange-600"}`}
                        style={{ width: `${Math.min(100, Math.abs(effect.atMaxQuality - effect.atMinQuality) / Math.max(Math.abs(effect.atMinQuality), 1) * 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </SortableWidget>
        );

      /* ── Total Materials ── */
      case "total-materials":
        if (!selectedBlueprint) return null;
        return (
          <SortableWidget key={wId} id={wId}
            header={
              <div className="px-5 py-3.5 border-b border-zinc-800/60 bg-zinc-950/30 flex items-center">
                <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-widest flex-1">{tb("totalMaterialCost")}</h3>
                <span className="text-[9px] text-zinc-700">⠿⠿</span>
              </div>
            }
          >
            <div className="p-5 grid grid-cols-2 md:grid-cols-3 gap-2">
              {Object.entries(getTotalMaterials(selectedBlueprint))
                .sort(([, a], [, b]) => b.scu - a.scu)
                .map(([resId, { name, scu }]) => (
                  <div key={resId} className="bg-zinc-950/50 rounded-xl p-3 border border-amber-500/15 hover:border-amber-500/30 transition-colors">
                    <div className="text-xs text-zinc-400 mb-1.5 leading-snug">{name}</div>
                    <div className="font-mono text-sm font-bold text-amber-400">{scu.toFixed(3)}<span className="text-amber-500/50 font-normal text-xs ml-1">SCU</span></div>
                  </div>
                ))}
            </div>
          </SortableWidget>
        );

      /* ── How to Obtain ── */
      case "how-to-obtain":
        if (!selectedBlueprint || (selectedBlueprint.rewardPools.length === 0 && !selectedBlueprint.isDefault)) return null;
        return (
          <SortableWidget key={wId} id={wId}
            header={
              <div className="px-5 py-3.5 border-b border-zinc-800/60 bg-zinc-950/30 flex items-center">
                <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-widest flex-1">{tb("howToObtain")}</h3>
                <span className="text-[9px] text-zinc-700">⠿⠿</span>
              </div>
            }
          >
            <div className="p-5">
              {selectedBlueprint.rewardPools.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {selectedBlueprint.rewardPools.map((pool) => (
                    <span key={pool.poolUuid} className="text-xs px-3 py-1.5 bg-violet-500/10 text-violet-300 rounded-full border border-violet-500/25 font-medium">
                      {formatPoolKey(pool.poolKey)}
                    </span>
                  ))}
                </div>
              )}
              {selectedBlueprint.isDefault && <p className="text-xs text-emerald-400 font-medium">{tb("defaultInfo")}</p>}
            </div>
          </SortableWidget>
        );

      /* ── Queue ── */
      case "queue":
        return (
          <SortableWidget key={wId} id={wId}
            header={
              <div className="px-4 py-3 border-b border-zinc-800/60 bg-zinc-950/30 flex items-center">
                <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-widest flex-1">{tc("widgetQueue")}</h3>
                <span className="text-[9px] text-zinc-700">⠿⠿</span>
              </div>
            }
          >
            <div className="p-3 space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  {selectedBlueprint ? (
                    <>
                      <div className="text-xs font-mono text-amber-300 truncate">{selectedBlueprint.outputName}</div>
                      <div className="text-[9px] text-zinc-500 mt-0.5">{tc("secondsPerUnit", { seconds: selectedBlueprint.craftTimeSeconds })}</div>
                    </>
                  ) : <div className="text-xs text-zinc-600">{tc("selectBlueprintPlaceholder")}</div>}
                </div>
                <input type="number" min="1" value={addQty} onChange={(e) => setAddQty(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-12 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-100 text-xs text-center focus:outline-none focus:border-amber-500" />
                <button onClick={addToQueue} disabled={!selectedBlueprintId}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white text-xs font-semibold rounded transition-colors whitespace-nowrap">
                  + {tc("add")}
                </button>
              </div>
              {queue.length === 0 ? (
                <p className="text-zinc-600 text-[11px] text-center py-2">{tc("noItemsInQueue")}</p>
              ) : (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {queue.map(({ blueprintId, quantity }) => {
                    const bp = blueprints.find((b) => b.uuid === blueprintId);
                    if (!bp) return null;
                    return (
                      <div key={blueprintId} className="flex items-center gap-1.5 bg-zinc-800/40 border border-zinc-700/40 rounded px-2.5 py-1.5">
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-[11px] text-amber-400 truncate">{bp.outputName}</div>
                          <div className="text-[9px] text-zinc-600">{Math.floor(bp.craftTimeSeconds * quantity / 60)}m {(bp.craftTimeSeconds * quantity) % 60}s</div>
                        </div>
                        <input type="number" min="1" value={quantity} onChange={(e) => updateQuantity(blueprintId, Number(e.target.value))}
                          className="w-11 px-1.5 py-0.5 bg-zinc-700 border border-zinc-600 rounded text-zinc-100 text-xs text-center focus:outline-none focus:border-amber-500" />
                        <button onClick={() => removeFromQueue(blueprintId)}
                          className="px-1.5 py-0.5 text-[10px] bg-red-900/30 hover:bg-red-900/60 border border-red-800/40 text-red-400 rounded transition-colors">✕</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </SortableWidget>
        );

      /* ── Quality Slider ── */
      case "quality-slider":
        return (
          <SortableWidget key={wId} id={wId}
            header={
              <div className="px-4 py-3 border-b border-zinc-800/60 bg-zinc-950/30 flex items-center">
                <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-widest flex-1">{tc("widgetQuality")}</h3>
                <span className="text-[9px] text-zinc-700">⠿⠿</span>
              </div>
            }
          >
            <div className="p-3 space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-xs text-zinc-500">{tc("qualityLevel")}</span>
                <div>
                  <span className={`font-mono text-base ${getQC(qualityLevel)}`}>{qualityLevel}</span>
                  <span className={`ml-2 text-xs font-semibold ${getQC(qualityLevel)}`}>{getQL(qualityLevel)}</span>
                </div>
              </div>
              <input type="range" min="0" max="1000" value={qualityLevel} onChange={(e) => setQualityLevel(Number(e.target.value))}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                style={{ background: "linear-gradient(to right, rgb(239,68,68) 0%, rgb(234,179,8) 50%, rgb(34,197,94) 100%)" }} />
              <div className="flex justify-between text-[9px] text-zinc-600">
                <span>{tc("poorZero")}</span><span>{tc("standardFiveHundred")}</span><span>{tc("excellentThousand")}</span>
              </div>
            </div>
          </SortableWidget>
        );

      /* ── Quality Stats ── */
      case "quality-stats":
        if (!selectedBlueprint || Object.keys(modifiedStats).length === 0) return null;
        return (
          <SortableWidget key={wId} id={wId}
            header={
              <div className="px-4 py-3 border-b border-zinc-800/60 bg-zinc-950/30 flex items-center">
                <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-widest flex-1">{tc("widgetQualityStats")}</h3>
                <span className="text-[9px] text-zinc-700">⠿⠿</span>
              </div>
            }
          >
            <div className="p-3 space-y-2">
              <p className="text-[9px] text-zinc-500">
                {tc("effectsForPrefix")} <span className={`font-mono font-semibold ${getQC(qualityLevel)}`}>Q{qualityLevel}</span>
              </p>
              {Object.entries(modifiedStats).map(([stat, values]) => {
                const pct = values.base !== 0 ? ((values.bonus / Math.abs(values.base)) * 100).toFixed(1) : "0";
                const isPos = values.bonus >= 0;
                return (
                  <div key={stat} className="border border-zinc-800/40 rounded-lg p-2.5 space-y-1.5">
                    <div className="flex justify-between items-baseline">
                      <span className="text-[10px] font-semibold text-zinc-300">{formatModKey(stat)}</span>
                      <span className={`text-[9px] font-mono ${isPos ? "text-emerald-400" : "text-red-400"}`}>{isPos ? "+" : ""}{pct}%</span>
                    </div>
                    <div className="flex justify-between text-[9px]">
                      <span className="text-zinc-600 font-mono">{values.base.toFixed(1)}</span>
                      <span className="text-zinc-700">→</span>
                      <span className={`font-mono font-semibold ${isPos ? "text-emerald-400" : "text-red-400"}`}>{values.modified.toFixed(1)}</span>
                    </div>
                    <div className="h-1 bg-zinc-800/60 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-200 ${isPos ? "bg-gradient-to-r from-cyan-600 to-emerald-500" : "bg-red-500"}`}
                        style={{ width: `${Math.min(100, (qualityLevel / 1000) * 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </SortableWidget>
        );

      /* ── Summary ── */
      case "summary":
        return (
          <SortableWidget key={wId} id={wId}
            header={
              <div className="px-4 py-3 border-b border-zinc-800/60 bg-zinc-950/30 flex items-center">
                <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-widest flex-1">{tc("widgetSummary")}</h3>
                <span className="text-[9px] text-zinc-700">⠿⠿</span>
              </div>
            }
          >
            <div className="p-3 grid grid-cols-2 gap-2">
              <div className="bg-zinc-950/50 rounded-lg p-2.5 border border-amber-500/15">
                <div className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">{tc("totalItems")}</div>
                <div className="font-mono text-lg font-bold text-amber-400">{totalItems}</div>
              </div>
              <div className="bg-zinc-950/50 rounded-lg p-2.5 border border-cyan-500/15">
                <div className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">{tc("totalCraftTime")}</div>
                <div className="font-mono text-lg font-bold text-cyan-400">{Math.floor(totalCraftTime / 60)}m {totalCraftTime % 60}s</div>
              </div>
            </div>
          </SortableWidget>
        );

      /* ── Shopping List ── */
      case "shopping-list":
        return (
          <SortableWidget key={wId} id={wId}
            header={
              <div className="px-4 py-3 border-b border-zinc-800/60 bg-zinc-950/30 flex items-center">
                <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-widest flex-1">{tc("widgetShopping")}</h3>
                <span className="text-[9px] text-zinc-700">⠿⠿</span>
              </div>
            }
          >
            <div className="p-3">
              {queue.length === 0 ? (
                <p className="text-zinc-600 text-[11px] text-center py-3">{tc("addItemsHint")}</p>
              ) : (
                <div className="space-y-1">
                  {Object.entries(aggregatedMaterials).sort(([, a], [, b]) => b.scu - a.scu).map(([resId, { name, scu }]) => (
                    <div key={resId} className="flex items-center justify-between gap-2 bg-zinc-800/30 rounded-lg px-3 py-2 border border-zinc-700/30 hover:border-amber-500/20 transition-colors">
                      <span className="text-xs text-zinc-300">{name}</span>
                      <span className="font-mono text-xs text-amber-400 whitespace-nowrap font-semibold">{scu.toFixed(2)} SCU</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </SortableWidget>
        );

      /* ── Recommendations ── */
      case "recommendations":
        return (
          <SortableWidget key={wId} id={wId}
            header={
              <div className="px-4 py-3 border-b border-zinc-800/60 bg-zinc-950/30 flex items-center">
                <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-widest flex-1">{tc("widgetRecommendations")}</h3>
                <span className="text-[9px] text-zinc-700">⠿⠿</span>
              </div>
            }
          >
            <div className="p-3 space-y-2">
              <div className="border border-red-800/40 bg-red-900/10 rounded-lg p-2.5">
                <div className="text-[10px] font-semibold text-red-400 mb-0.5">{tc("recPoorTitle")}</div>
                <p className="text-[9px] text-red-300/80 leading-relaxed">{tc("recPoorDesc")}</p>
              </div>
              <div className="border border-amber-800/40 bg-amber-900/10 rounded-lg p-2.5">
                <div className="text-[10px] font-semibold text-amber-400 mb-0.5">{tc("recStandardTitle")}</div>
                <p className="text-[9px] text-amber-300/80 leading-relaxed">{tc("recStandardDesc")}</p>
              </div>
              <div className="border border-emerald-800/40 bg-emerald-900/10 rounded-lg p-2.5">
                <div className="text-[10px] font-semibold text-emerald-400 mb-0.5">{tc("recExcellentTitle")}</div>
                <p className="text-[9px] text-emerald-300/80 leading-relaxed">{tc("recExcellentDesc")}</p>
              </div>
            </div>
          </SortableWidget>
        );

      default:
        return null;
    }
  };

  /* ═══════════════════════════════════════════════════════
     Layout
     ═══════════════════════════════════════════════════════ */
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {/* Reset button */}
      <div className="flex justify-end mb-2">
        <button
          onClick={resetLayout}
          className="px-3 py-1 text-[10px] font-mono uppercase tracking-widest text-zinc-600 hover:text-amber-400 border border-zinc-800/40 hover:border-amber-500/30 rounded transition-colors"
        >
          ⠿ {tc("resetLayout")}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {columns.map((colWidgets, colIdx) => (
          <SortableContext key={colIdx} items={colWidgets} strategy={verticalListSortingStrategy}>
            <div className="space-y-3 min-h-20">
              {colWidgets.map((wId) => renderWidgetContent(wId))}
            </div>
          </SortableContext>
        ))}
      </div>

      {/* Ghost card that follows the cursor while dragging */}
      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)" }}>
        {activeId ? (
          <div className="rotate-[0.8deg] scale-[1.02] shadow-2xl shadow-black/60 rounded-xl overflow-hidden bg-zinc-900/95 border border-amber-500/20 pointer-events-none">
            <div className="px-4 py-3 bg-zinc-950/60 flex items-center gap-2">
              <span className="text-[9px] text-amber-500/40">⠿⠿</span>
              <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest">{WIDGET_LABELS[activeId]}</span>
            </div>
            <div className="h-0.5 bg-gradient-to-r from-[#4a6741] to-[#f97316] opacity-60" />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
