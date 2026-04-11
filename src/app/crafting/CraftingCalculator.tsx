"use client";

import { useState, useMemo, useCallback } from "react";
import { useCraftingData } from "./useCraftingData";
import type { Blueprint } from "./types";

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
   Drag Widget wrapper
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
      <div className="flex items-center gap-1 px-1.5 py-[2px] bg-zinc-950/60 border border-zinc-800/30 border-b-0 cursor-grab active:cursor-grabbing select-none group rounded-t-sm">
        <span className="text-[7px] text-zinc-700 group-hover:text-amber-600 transition-colors">⠿</span>
        <span className="text-[6px] font-mono text-zinc-700 tracking-[0.15em] group-hover:text-zinc-500 transition-colors uppercase">
          {label}
        </span>
        <span className="flex-1" />
        <span className="text-[7px] text-zinc-800 group-hover:text-zinc-600 transition-colors">⋮⋮</span>
      </div>
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════ */
const formatModKey = (key: string) =>
  key
    .replace(/^(weapon_|armor_)/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

/* ═══════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════ */
export default function CraftingCalculator() {
  const { blueprints, loading, error } = useCraftingData();

  const [queue, setQueue] = useState<CraftQueueItem[]>([]);
  const [qualityLevel, setQualityLevel] = useState(500);
  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string>("");

  // Set default selected when data loads
  useMemo(() => {
    if (blueprints.length > 0 && !selectedBlueprintId) {
      setSelectedBlueprintId(blueprints[0].uuid);
    }
  }, [blueprints]);

  /* ── Drag state ── */
  const [columns, setColumns] = useState<WidgetId[][]>(loadColumns);
  const [dragState, setDragState] = useState<DragState>({ dragging: null, over: null });

  const handleDragStart = useCallback((id: WidgetId) => {
    setDragState({ dragging: id, over: null });
  }, []);

  const handleDragOver = useCallback((_e: React.DragEvent, id: WidgetId) => {
    setDragState((prev) => (prev.over === id ? prev : { ...prev, over: id }));
  }, []);

  const handleDrop = useCallback((_e: React.DragEvent, targetId: WidgetId) => {
    setDragState((prev) => {
      const sourceId = prev.dragging;
      if (sourceId && sourceId !== targetId) {
        setColumns((prevCols) => {
          const next = prevCols.map((col) => [...col]);
          let srcCol = -1, srcIdx = -1, tgtCol = -1, tgtIdx = -1;
          for (let c = 0; c < next.length; c++) {
            const si = next[c].indexOf(sourceId);
            if (si !== -1) { srcCol = c; srcIdx = si; }
            const ti = next[c].indexOf(targetId);
            if (ti !== -1) { tgtCol = c; tgtIdx = ti; }
          }
          if (srcCol === -1 || tgtCol === -1) return prevCols;
          next[srcCol].splice(srcIdx, 1);
          const newTgtIdx = next[tgtCol].indexOf(targetId);
          if (newTgtIdx !== -1) next[tgtCol].splice(newTgtIdx, 0, sourceId);
          else next[tgtCol].push(sourceId);
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

  const dragProps = { dragState, onDragStart: handleDragStart, onDragOver: handleDragOver, onDrop: handleDrop, onDragEnd: handleDragEnd };

  /* ── Queue helpers ── */
  const addToQueue = () => {
    if (!selectedBlueprintId) return;
    const existing = queue.find((q) => q.blueprintId === selectedBlueprintId);
    if (existing) {
      setQueue(queue.map((q) => q.blueprintId === selectedBlueprintId ? { ...q, quantity: q.quantity + 1 } : q));
    } else {
      setQueue([...queue, { blueprintId: selectedBlueprintId, quantity: 1 }]);
    }
  };

  const removeFromQueue = (blueprintId: string) => setQueue(queue.filter((q) => q.blueprintId !== blueprintId));

  const updateQuantity = (blueprintId: string, qty: number) => {
    if (qty <= 0) removeFromQueue(blueprintId);
    else setQueue(queue.map((q) => q.blueprintId === blueprintId ? { ...q, quantity: qty } : q));
  };

  /* ── Aggregation ── */
  const aggregatedMaterials = useMemo(() => {
    const costs: Record<string, { name: string; scu: number }> = {};
    queue.forEach(({ blueprintId, quantity }) => {
      const bp = blueprints.find((b) => b.uuid === blueprintId);
      if (!bp) return;
      bp.parts.forEach((part) => {
        part.materials.forEach((mat) => {
          if (!costs[mat.resourceUuid]) costs[mat.resourceUuid] = { name: mat.resourceName, scu: 0 };
          costs[mat.resourceUuid].scu += mat.quantityScu * quantity;
        });
      });
    });
    return costs;
  }, [queue, blueprints]);

  const totalCraftTime = useMemo(() => {
    return queue.reduce((sum, { blueprintId, quantity }) => {
      const bp = blueprints.find((b) => b.uuid === blueprintId);
      return sum + (bp?.craftTimeSeconds || 0) * quantity;
    }, 0);
  }, [queue, blueprints]);

  /* ── Quality helpers ── */
  const qualityPercentage = useMemo(() => (qualityLevel / 1000) * 100, [qualityLevel]);

  const selectedBlueprint = useMemo(
    () => blueprints.find((b) => b.uuid === selectedBlueprintId) || null,
    [blueprints, selectedBlueprintId]
  );

  const modifiedStats = useMemo(() => {
    if (!selectedBlueprint) return {};
    const stats: Record<string, { base: number; modified: number; bonus: number }> = {};
    Object.entries(selectedBlueprint.qualityEffects).forEach(([stat, effect]) => {
      const range = effect.atMaxQuality - effect.atMinQuality;
      const bonusAmount = (range * qualityPercentage) / 100;
      stats[stat] = {
        base: effect.atMinQuality,
        modified: effect.atMinQuality + bonusAmount,
        bonus: bonusAmount,
      };
    });
    return stats;
  }, [selectedBlueprint, qualityPercentage]);

  const getQualityColor = (q: number) => q < 250 ? "text-red-400" : q < 500 ? "text-orange-400" : q < 750 ? "text-yellow-400" : "text-emerald-400";
  const getQualityLabel = (q: number) => q < 250 ? "Poor" : q < 500 ? "Substandard" : q < 750 ? "Standard" : q < 900 ? "High" : "Excellent";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-4 h-4 border-2 border-zinc-800 border-t-amber-500 rounded-full animate-spin mr-3" />
        <span className="text-xs text-zinc-500 font-mono uppercase tracking-widest">Loading...</span>
      </div>
    );
  }

  if (error) {
    return <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-sm px-3 py-2">{error}</div>;
  }

  /* ═══════════════════════════════════════════════════════
     Widget renderers
     ═══════════════════════════════════════════════════════ */
  const renderWidget = (wId: WidgetId) => {
    switch (wId) {
      case "queue":
        return (
          <DragWidget key={wId} id={wId} label="Craft Queue" {...dragProps}>
            <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-b-lg p-4 space-y-4">
              <div className="flex gap-2">
                <select
                  value={selectedBlueprintId}
                  onChange={(e) => setSelectedBlueprintId(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-100 text-xs focus:outline-none focus:border-amber-500"
                >
                  <option value="">Select blueprint...</option>
                  {blueprints
                    .sort((a, b) => a.outputName.localeCompare(b.outputName))
                    .map((bp) => (
                      <option key={bp.uuid} value={bp.uuid}>{bp.outputName}</option>
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
              {queue.length === 0 ? (
                <p className="text-zinc-600 text-xs text-center py-4">No items in queue</p>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {queue.map(({ blueprintId, quantity }) => {
                    const bp = blueprints.find((b) => b.uuid === blueprintId);
                    if (!bp) return null;
                    return (
                      <div key={blueprintId} className="flex items-center justify-between gap-2 bg-zinc-800/40 border border-zinc-700/40 rounded px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-xs text-amber-400 truncate">{bp.outputName}</div>
                          <div className="text-[10px] text-zinc-500">{bp.craftTimeSeconds}s / unit</div>
                        </div>
                        <input
                          type="number"
                          min="1"
                          value={quantity}
                          onChange={(e) => updateQuantity(blueprintId, Number(e.target.value))}
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

      case "quality-slider":
        return (
          <DragWidget key={wId} id={wId} label="Material Quality" {...dragProps}>
            <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-b-lg p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-zinc-400">Quality Level</span>
                <div className="text-right">
                  <span className={`font-mono text-lg ${getQualityColor(qualityLevel)}`}>{qualityLevel}</span>
                  <span className={`ml-2 text-xs font-semibold ${getQualityColor(qualityLevel)}`}>{getQualityLabel(qualityLevel)}</span>
                </div>
              </div>
              <input
                type="range" min="0" max="1000" value={qualityLevel}
                onChange={(e) => setQualityLevel(Number(e.target.value))}
                className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                style={{ background: "linear-gradient(to right, rgb(239,68,68) 0%, rgb(234,179,8) 50%, rgb(34,197,94) 100%)" }}
              />
              <div className="flex justify-between text-[10px] text-zinc-500">
                <span>Poor (0)</span><span>Standard (500)</span><span>Excellent (1000)</span>
              </div>
            </div>
          </DragWidget>
        );

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
            </div>
          </DragWidget>
        );

      case "shopping-list":
        return (
          <DragWidget key={wId} id={wId} label="Shopping List" {...dragProps}>
            <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-b-lg p-4">
              {queue.length === 0 ? (
                <p className="text-zinc-600 text-xs text-center py-4">Add items to queue to see materials</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(aggregatedMaterials)
                    .sort(([, a], [, b]) => b.scu - a.scu)
                    .map(([resId, { name, scu }]) => (
                      <div key={resId} className="bg-zinc-800/30 rounded p-3 border border-zinc-700/40">
                        <div className="text-xs font-medium text-zinc-200 mb-1">{name}</div>
                        <div className="font-mono text-xs text-amber-400">{scu.toFixed(2)} SCU</div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </DragWidget>
        );

      case "quality-stats":
        return (
          <DragWidget key={wId} id={wId} label="Quality Impact on Stats" {...dragProps}>
            <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-b-lg p-4">
              {selectedBlueprint && Object.keys(modifiedStats).length > 0 ? (
                <>
                  <p className="text-[10px] text-zinc-500 mb-4">
                    Effects for <span className="text-amber-400 font-mono">{selectedBlueprint.outputName}</span> at quality {qualityLevel}
                  </p>
                  <div className="space-y-4">
                    {Object.entries(modifiedStats).map(([stat, values]) => {
                      const percentChange = values.base !== 0 ? ((values.bonus / Math.abs(values.base)) * 100).toFixed(1) : "0";
                      const isPositive = values.bonus >= 0;
                      return (
                        <div key={stat} className="border border-zinc-800/40 rounded-lg p-3 space-y-2">
                          <div className="flex justify-between items-baseline">
                            <h4 className="text-xs font-semibold text-zinc-300">{formatModKey(stat)}</h4>
                            <span className={`text-[10px] font-mono ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
                              {isPositive ? "+" : ""}{percentChange}%
                            </span>
                          </div>
                          <div>
                            <div className="flex justify-between text-[10px] text-zinc-500 mb-0.5">
                              <span>Base (Q 0)</span>
                              <span className="font-mono text-zinc-400">{values.base.toFixed(1)}</span>
                            </div>
                            <div className="h-1.5 bg-zinc-800/50 rounded">
                              <div className="h-full bg-zinc-600 rounded" style={{ width: `${Math.min(100, (Math.abs(values.base) / Math.max(Math.abs(values.base), Math.abs(values.modified))) * 100)}%` }} />
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between text-[10px] text-zinc-500 mb-0.5">
                              <span>Modified (Q {qualityLevel})</span>
                              <span className={`font-mono ${isPositive ? "text-emerald-400" : "text-red-400"}`}>{values.modified.toFixed(1)}</span>
                            </div>
                            <div className="h-1.5 bg-zinc-800/50 rounded">
                              <div className={`h-full rounded ${isPositive ? "bg-gradient-to-r from-cyan-500 to-emerald-500" : "bg-red-500"}`} style={{ width: `${Math.min(100, (Math.abs(values.modified) / Math.max(Math.abs(values.base), Math.abs(values.modified))) * 100)}%` }} />
                            </div>
                          </div>
                          {values.bonus !== 0 && (
                            <div className="pt-1.5 border-t border-zinc-700/50">
                              <div className="flex justify-between text-[10px]">
                                <span className="text-zinc-600">Bonus</span>
                                <span className={`font-mono ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
                                  {isPositive ? "+" : ""}{values.bonus.toFixed(2)}
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
                <p className="text-zinc-600 text-xs text-center py-6">Select a blueprint to see quality impact</p>
              )}
            </div>
          </DragWidget>
        );

      case "recommendations":
        return (
          <DragWidget key={wId} id={wId} label="Recommendations" {...dragProps}>
            <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-b-lg p-4 space-y-3">
              <div className="border border-red-800/40 bg-red-900/10 rounded p-3">
                <div className="text-xs font-semibold text-red-400 mb-1">Poor Quality (0-250)</div>
                <p className="text-[10px] text-red-300">Not recommended for critical applications. Stats will be significantly reduced.</p>
              </div>
              <div className="border border-amber-800/40 bg-amber-900/10 rounded p-3">
                <div className="text-xs font-semibold text-amber-400 mb-1">Standard Quality (500-750)</div>
                <p className="text-[10px] text-amber-300">Acceptable for most uses. Provides reliable performance with moderate bonuses.</p>
              </div>
              <div className="border border-emerald-800/40 bg-emerald-900/10 rounded p-3">
                <div className="text-xs font-semibold text-emerald-400 mb-1">Excellent Quality (900+)</div>
                <p className="text-[10px] text-emerald-300">Maximum performance. Stats reach peak values, ideal for specialized roles.</p>
              </div>
            </div>
          </DragWidget>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={resetLayout}
          className="px-3 py-1 text-[10px] font-mono uppercase tracking-widest text-zinc-600 hover:text-amber-400 border border-zinc-800/40 hover:border-amber-500/30 rounded transition-colors"
        >
          ⠿ Reset Layout
        </button>
      </div>
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
