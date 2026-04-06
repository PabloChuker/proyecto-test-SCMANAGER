"use client";

import { useState, useMemo, useCallback } from "react";
import blueprints from "@/data/crafting/blueprints.json";
import materials from "@/data/crafting/materials.json";

/* ═══════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════ */
type WidgetId =
  | "queue"
  | "quality-slider"
  | "summary"
  | "shopping-list"
  | "quality-stats"
  | "recommendations";

interface CraftQueueItem {
  blueprintId: string;
  quantity: number;
}

interface DragState {
  dragging: WidgetId | null;
  over: WidgetId | null;
}

/* ═══════════════════════════════════════════════════════
   Drag Widget wrapper (same pattern as DPS calculator)
   ═══════════════════════════════════════════════════════ */
const ALL_WIDGETS: WidgetId[] = [
  "queue",
  "quality-slider",
  "summary",
  "shopping-list",
  "quality-stats",
  "recommendations",
];

const DEFAULT_COLUMNS: WidgetId[][] = [
  ["queue", "shopping-list"],
  ["quality-slider", "quality-stats"],
  ["summary", "recommendations"],
];

const STORAGE_KEY = "al-filo-crafting-cols";

function loadColumns(): WidgetId[][] {
  try {
    if (typeof window === "undefined") return DEFAULT_COLUMNS.map((c) => [...c]);
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as WidgetId[][];
      if (
        ALL_WIDGETS.every((w) => parsed.flat().includes(w)) &&
        parsed.length === DEFAULT_COLUMNS.length
      ) {
        return parsed;
      }
    }
  } catch {}
  return DEFAULT_COLUMNS.map((c) => [...c]);
}

function saveColumns(cols: WidgetId[][]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cols));
  } catch {}
}

function DragWidget({
  id,
  label,
  children,
  dragState,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  id: WidgetId;
  label: string;
  children: React.ReactNode;
  dragState: DragState;
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
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDragOver(e, id);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(e, id);
      }}
      onDragEnd={onDragEnd}
      className="relative transition-all duration-150"
      style={{
        ...(isDragging ? { opacity: 0.35 } : {}),
        ...(isOver ? { transform: "scale(0.97)" } : {}),
      }}
    >
      {isOver && (
        <div className="absolute inset-0 border-2 border-amber-500/60 rounded z-20 pointer-events-none animate-pulse" />
      )}

      {/* Drag handle header */}
      <div className="flex items-center gap-1 px-1.5 py-[2px] bg-zinc-950/60 border border-zinc-800/30 border-b-0 cursor-grab active:cursor-grabbing select-none group rounded-t-sm">
        <span className="text-[7px] text-zinc-700 group-hover:text-amber-600 transition-colors">
          ⠿
        </span>
        <span className="text-[6px] font-mono text-zinc-700 tracking-[0.15em] group-hover:text-zinc-500 transition-colors uppercase">
          {label}
        </span>
        <span className="flex-1" />
        <span className="text-[7px] text-zinc-800 group-hover:text-zinc-600 transition-colors">
          ⋮⋮
        </span>
      </div>

      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════ */
export default function CraftingCalculator() {
  const [queue, setQueue] = useState<CraftQueueItem[]>([]);
  const [qualityLevel, setQualityLevel] = useState(500);
  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string>(
    blueprints[0]?.id || ""
  );

  /* ── Drag state ── */
  const [columns, setColumns] = useState<WidgetId[][]>(loadColumns);
  const [dragState, setDragState] = useState<DragState>({
    dragging: null,
    over: null,
  });

  const handleDragStart = useCallback((id: WidgetId) => {
    setDragState({ dragging: id, over: null });
  }, []);

  const handleDragOver = useCallback(
    (_e: React.DragEvent, id: WidgetId) => {
      setDragState((prev) =>
        prev.over === id ? prev : { ...prev, over: id }
      );
    },
    []
  );

  const handleDrop = useCallback((_e: React.DragEvent, targetId: WidgetId) => {
    setDragState((prev) => {
      const sourceId = prev.dragging;
      if (sourceId && sourceId !== targetId) {
        setColumns((prevCols) => {
          const next = prevCols.map((col) => [...col]);
          let srcCol = -1,
            srcIdx = -1,
            tgtCol = -1,
            tgtIdx = -1;
          for (let c = 0; c < next.length; c++) {
            const si = next[c].indexOf(sourceId);
            if (si !== -1) {
              srcCol = c;
              srcIdx = si;
            }
            const ti = next[c].indexOf(targetId);
            if (ti !== -1) {
              tgtCol = c;
              tgtIdx = ti;
            }
          }
          if (srcCol === -1 || tgtCol === -1) return prevCols;
          next[srcCol].splice(srcIdx, 1);
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

  const resetLayout = () => {
    const def = DEFAULT_COLUMNS.map((c) => [...c]);
    setColumns(def);
    saveColumns(def);
  };

  /* ── Shared drag props ── */
  const dragProps = {
    dragState,
    onDragStart: handleDragStart,
    onDragOver: handleDragOver,
    onDrop: handleDrop,
    onDragEnd: handleDragEnd,
  };

  /* ── Data helpers ── */
  const getMaterialName = (id: string) =>
    materials.find((m) => m.id === id)?.name || id;

  const addToQueue = () => {
    if (!selectedBlueprintId) return;
    const existing = queue.find((q) => q.blueprintId === selectedBlueprintId);
    if (existing) {
      setQueue(
        queue.map((q) =>
          q.blueprintId === selectedBlueprintId
            ? { ...q, quantity: q.quantity + 1 }
            : q
        )
      );
    } else {
      setQueue([...queue, { blueprintId: selectedBlueprintId, quantity: 1 }]);
    }
  };

  const removeFromQueue = (blueprintId: string) => {
    setQueue(queue.filter((q) => q.blueprintId !== blueprintId));
  };

  const updateQuantity = (blueprintId: string, qty: number) => {
    if (qty <= 0) {
      removeFromQueue(blueprintId);
    } else {
      setQueue(
        queue.map((q) =>
          q.blueprintId === blueprintId ? { ...q, quantity: qty } : q
        )
      );
    }
  };

  const aggregatedMaterials = useMemo(() => {
    const costs: Record<string, number> = {};
    queue.forEach(({ blueprintId, quantity }) => {
      const bp = blueprints.find((b) => b.id === blueprintId);
      if (!bp) return;
      bp.parts.forEach((part) => {
        part.materials.forEach((mat) => {
          costs[mat.id] = (costs[mat.id] || 0) + mat.qty * quantity;
        });
      });
    });
    return costs;
  }, [queue]);

  const totalCraftTime = useMemo(() => {
    return queue.reduce((sum, { blueprintId, quantity }) => {
      const bp = blueprints.find((b) => b.id === blueprintId);
      return sum + (bp?.craftTime || 0) * quantity;
    }, 0);
  }, [queue]);

  const estimatedCost = useMemo(() => {
    return Object.entries(aggregatedMaterials).reduce((sum, [matId, qty]) => {
      const mat = materials.find((m) => m.id === matId);
      const baseCost = mat?.type === "refined" ? 500 : 200;
      const qualityMultiplier = (qualityLevel / 500) * 0.8 + 0.2;
      return sum + baseCost * qty * qualityMultiplier;
    }, 0);
  }, [aggregatedMaterials, qualityLevel]);

  /* ── Quality helpers ── */
  const qualityPercentage = useMemo(
    () => (qualityLevel / 1000) * 100,
    [qualityLevel]
  );

  const selectedBlueprint = useMemo(
    () => blueprints.find((b) => b.id === selectedBlueprintId),
    [selectedBlueprintId]
  );

  const modifiedStats = useMemo(() => {
    if (!selectedBlueprint) return {};
    const stats: Record<
      string,
      { base: number; modified: number; bonus: number }
    > = {};
    Object.entries(selectedBlueprint.qualityEffects).forEach(
      ([stat, effect]) => {
        const bonusAmount = (effect.maxBonus * qualityPercentage) / 100;
        stats[stat] = {
          base: effect.base,
          modified: effect.base + bonusAmount,
          bonus: bonusAmount,
        };
      }
    );
    return stats;
  }, [selectedBlueprint, qualityPercentage]);

  const getQualityColor = (quality: number) => {
    if (quality < 250) return "text-red-400";
    if (quality < 500) return "text-orange-400";
    if (quality < 750) return "text-yellow-400";
    return "text-emerald-400";
  };

  const getQualityLabel = (quality: number) => {
    if (quality < 250) return "Poor";
    if (quality < 500) return "Substandard";
    if (quality < 750) return "Standard";
    if (quality < 900) return "High";
    return "Excellent";
  };

  /* ═══════════════════════════════════════════════════════
     Widget renderers
     ═══════════════════════════════════════════════════════ */
  const renderWidget = (wId: WidgetId) => {
    switch (wId) {
      /* ── QUEUE ── */
      case "queue":
        return (
          <DragWidget key={wId} id={wId} label="Craft Queue" {...dragProps}>
            <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-b-lg p-4 space-y-4">
              {/* Blueprint selector + add */}
              <div className="flex gap-2">
                <select
                  value={selectedBlueprintId}
                  onChange={(e) => setSelectedBlueprintId(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-100 text-xs focus:outline-none focus:border-amber-500"
                >
                  <option value="">Select blueprint...</option>
                  {blueprints
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((bp) => (
                      <option key={bp.id} value={bp.id}>
                        {bp.name}
                      </option>
                    ))}
                </select>
                <button
                  onClick={addToQueue}
                  disabled={!selectedBlueprintId}
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white text-xs font-medium rounded transition-colors"
                >
                  Add
                </button>
              </div>

              {/* Queue items */}
              {queue.length === 0 ? (
                <p className="text-zinc-600 text-xs text-center py-4">
                  No items in queue — select a blueprint above
                </p>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {queue.map(({ blueprintId, quantity }) => {
                    const bp = blueprints.find((b) => b.id === blueprintId);
                    if (!bp) return null;
                    return (
                      <div
                        key={blueprintId}
                        className="flex items-center justify-between gap-2 bg-zinc-800/40 border border-zinc-700/40 rounded px-3 py-2"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-xs text-amber-400 truncate">
                            {bp.name}
                          </div>
                          <div className="text-[10px] text-zinc-500">
                            {bp.craftTime}s / unit
                          </div>
                        </div>
                        <input
                          type="number"
                          min="1"
                          value={quantity}
                          onChange={(e) =>
                            updateQuantity(blueprintId, Number(e.target.value))
                          }
                          className="w-14 px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-zinc-100 text-xs text-center focus:outline-none focus:border-amber-500"
                        />
                        <button
                          onClick={() => removeFromQueue(blueprintId)}
                          className="px-2 py-1 text-[10px] bg-red-900/30 hover:bg-red-900/60 border border-red-800/40 text-red-400 rounded transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </DragWidget>
        );

      /* ── QUALITY SLIDER ── */
      case "quality-slider":
        return (
          <DragWidget
            key={wId}
            id={wId}
            label="Material Quality"
            {...dragProps}
          >
            <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-b-lg p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-zinc-400">Quality Level</span>
                <div className="text-right">
                  <span
                    className={`font-mono text-lg ${getQualityColor(qualityLevel)}`}
                  >
                    {qualityLevel}
                  </span>
                  <span
                    className={`ml-2 text-xs font-semibold ${getQualityColor(qualityLevel)}`}
                  >
                    {getQualityLabel(qualityLevel)}
                  </span>
                </div>
              </div>
              <input
                type="range"
                min="0"
                max="1000"
                value={qualityLevel}
                onChange={(e) => setQualityLevel(Number(e.target.value))}
                className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                style={{
                  background:
                    "linear-gradient(to right, rgb(239,68,68) 0%, rgb(234,179,8) 50%, rgb(34,197,94) 100%)",
                }}
              />
              <div className="flex justify-between text-[10px] text-zinc-500">
                <span>Poor (0)</span>
                <span>Standard (500)</span>
                <span>Excellent (1000)</span>
              </div>
            </div>
          </DragWidget>
        );

      /* ── SUMMARY ── */
      case "summary":
        return (
          <DragWidget key={wId} id={wId} label="Summary" {...dragProps}>
            <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-b-lg p-4 space-y-3 text-sm">
              <div>
                <span className="text-zinc-500 text-xs">Total Items</span>
                <div className="font-mono text-lg text-amber-400">
                  {queue.reduce((sum, q) => sum + q.quantity, 0)}
                </div>
              </div>
              <div className="border-t border-zinc-700 pt-3">
                <span className="text-zinc-500 text-xs">Total Craft Time</span>
                <div className="font-mono text-lg text-cyan-400">
                  {Math.floor(totalCraftTime / 60)}m {totalCraftTime % 60}s
                </div>
              </div>
              <div className="border-t border-zinc-700 pt-3">
                <span className="text-zinc-500 text-xs">Est. Total Cost</span>
                <div className="font-mono text-lg text-emerald-400">
                  {Math.floor(estimatedCost).toLocaleString()} aUEC
                </div>
              </div>
            </div>
          </DragWidget>
        );

      /* ── SHOPPING LIST ── */
      case "shopping-list":
        return (
          <DragWidget
            key={wId}
            id={wId}
            label="Shopping List"
            {...dragProps}
          >
            <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-b-lg p-4">
              {queue.length === 0 ? (
                <p className="text-zinc-600 text-xs text-center py-4">
                  Add items to queue to see materials
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(aggregatedMaterials)
                    .sort(([, a], [, b]) => b - a)
                    .map(([matId, qty]) => {
                      const mat = materials.find((m) => m.id === matId);
                      const avgQuality = mat?.avgQuality || 400;
                      const qualityDiff = qualityLevel - avgQuality;
                      const qualityColor =
                        qualityDiff > 0
                          ? "text-emerald-400"
                          : qualityDiff < 0
                            ? "text-red-400"
                            : "text-zinc-400";

                      return (
                        <div
                          key={matId}
                          className="bg-zinc-800/30 rounded p-3 border border-zinc-700/40"
                        >
                          <div className="text-xs font-medium text-zinc-200 mb-1">
                            {getMaterialName(matId)}
                          </div>
                          <div className="font-mono text-xs text-amber-400">
                            {qty.toFixed(2)} SCU
                          </div>
                          <div className="text-[10px] mt-1">
                            <span className="text-zinc-500">Avg Q: </span>
                            <span className={qualityColor}>
                              {avgQuality}
                              {qualityDiff !== 0 && (
                                <span className="ml-1">
                                  ({qualityDiff > 0 ? "+" : ""}
                                  {qualityDiff})
                                </span>
                              )}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </DragWidget>
        );

      /* ── QUALITY STATS ── */
      case "quality-stats":
        return (
          <DragWidget
            key={wId}
            id={wId}
            label="Quality Impact on Stats"
            {...dragProps}
          >
            <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-b-lg p-4">
              {selectedBlueprint && Object.keys(modifiedStats).length > 0 ? (
                <>
                  <p className="text-[10px] text-zinc-500 mb-4">
                    Effects for{" "}
                    <span className="text-amber-400 font-mono">
                      {selectedBlueprint.name}
                    </span>{" "}
                    at quality {qualityLevel}
                  </p>
                  <div className="space-y-4">
                    {Object.entries(modifiedStats).map(([stat, values]) => {
                      const percentChange = (
                        (values.bonus / values.base) *
                        100
                      ).toFixed(1);
                      const isPositive = values.bonus >= 0;

                      return (
                        <div
                          key={stat}
                          className="border border-zinc-800/40 rounded-lg p-3 space-y-2"
                        >
                          <div className="flex justify-between items-baseline">
                            <h4 className="text-xs font-semibold text-zinc-300 capitalize">
                              {stat}
                            </h4>
                            <span
                              className={`text-[10px] font-mono ${isPositive ? "text-emerald-400" : "text-red-400"}`}
                            >
                              {isPositive ? "+" : ""}
                              {percentChange}%
                            </span>
                          </div>

                          {/* Base */}
                          <div>
                            <div className="flex justify-between text-[10px] text-zinc-500 mb-0.5">
                              <span>Base (Q 0)</span>
                              <span className="font-mono text-zinc-400">
                                {values.base.toFixed(1)}
                              </span>
                            </div>
                            <div className="h-1.5 bg-zinc-800/50 rounded">
                              <div
                                className="h-full bg-zinc-600 rounded"
                                style={{
                                  width: `${Math.min(
                                    100,
                                    (values.base /
                                      Math.max(
                                        values.base,
                                        values.modified
                                      )) *
                                      100
                                  )}%`,
                                }}
                              />
                            </div>
                          </div>

                          {/* Modified */}
                          <div>
                            <div className="flex justify-between text-[10px] text-zinc-500 mb-0.5">
                              <span>Modified (Q {qualityLevel})</span>
                              <span
                                className={`font-mono ${isPositive ? "text-emerald-400" : "text-red-400"}`}
                              >
                                {values.modified.toFixed(1)}
                              </span>
                            </div>
                            <div className="h-1.5 bg-zinc-800/50 rounded">
                              <div
                                className={`h-full rounded ${isPositive ? "bg-gradient-to-r from-cyan-500 to-emerald-500" : "bg-red-500"}`}
                                style={{
                                  width: `${Math.min(
                                    100,
                                    (values.modified /
                                      Math.max(
                                        values.base,
                                        values.modified
                                      )) *
                                      100
                                  )}%`,
                                }}
                              />
                            </div>
                          </div>

                          {/* Bonus */}
                          {values.bonus !== 0 && (
                            <div className="pt-1.5 border-t border-zinc-700/50">
                              <div className="flex justify-between text-[10px]">
                                <span className="text-zinc-600">Bonus</span>
                                <span
                                  className={`font-mono ${isPositive ? "text-emerald-400" : "text-red-400"}`}
                                >
                                  {isPositive ? "+" : ""}
                                  {values.bonus.toFixed(2)}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className="text-zinc-600 text-xs text-center py-6">
                  Select a blueprint to see quality impact on stats
                </p>
              )}
            </div>
          </DragWidget>
        );

      /* ── RECOMMENDATIONS ── */
      case "recommendations":
        return (
          <DragWidget
            key={wId}
            id={wId}
            label="Recommendations"
            {...dragProps}
          >
            <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-b-lg p-4 space-y-3">
              <div className="border border-red-800/40 bg-red-900/10 rounded p-3">
                <div className="text-xs font-semibold text-red-400 mb-1">
                  Poor Quality (0-250)
                </div>
                <p className="text-[10px] text-red-300">
                  Not recommended for critical applications. Stats will be
                  significantly reduced.
                </p>
              </div>
              <div className="border border-amber-800/40 bg-amber-900/10 rounded p-3">
                <div className="text-xs font-semibold text-amber-400 mb-1">
                  Standard Quality (500-750)
                </div>
                <p className="text-[10px] text-amber-300">
                  Acceptable for most uses. Provides reliable performance with
                  moderate bonuses.
                </p>
              </div>
              <div className="border border-emerald-800/40 bg-emerald-900/10 rounded p-3">
                <div className="text-xs font-semibold text-emerald-400 mb-1">
                  Excellent Quality (900+)
                </div>
                <p className="text-[10px] text-emerald-300">
                  Maximum performance. Stats reach peak values, ideal for
                  specialized roles.
                </p>
              </div>
            </div>
          </DragWidget>
        );

      default:
        return null;
    }
  };

  /* ═══════════════════════════════════════════════════════
     Render
     ═══════════════════════════════════════════════════════ */
  return (
    <div className="space-y-3">
      {/* Layout reset */}
      <div className="flex justify-end">
        <button
          onClick={resetLayout}
          className="px-3 py-1 text-[10px] font-mono uppercase tracking-widest text-zinc-600 hover:text-amber-400 border border-zinc-800/40 hover:border-amber-500/30 rounded transition-colors"
        >
          ⠿ Reset Layout
        </button>
      </div>

      {/* Draggable grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {columns.map((colWidgets, colIdx) => (
          <div key={colIdx} className="space-y-3">
            {colWidgets.map((wId) => renderWidget(wId))}
          </div>
        ))}
      </div>
    </div>
  );
}
