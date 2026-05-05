"use client";

// =============================================================================
// SC LABS — ChainBoardWorkspace v2 (rewrite 2026-05-05)
//
// Orquestador del Chain Board, layout 4-columnas + bottom toolbar al estilo
// del mockup "Ship Upgrade Planner":
//
//   ┌─────────┬─────────┬───────────────────────────┬─────────┐
//   │Available│My Hangar│       Canvas (xyflow)     │Right    │
//   │ Ships   │  CCUs   │  (drag/drop, free-form)   │Panel    │
//   └─────────┴─────────┴───────────────────────────┴─────────┘
//                  [CLEAR] [SAVE] [EXPORT] [IMPORT]
//
// Estado: { nodes: BoardNode[], edges: BoardEdge[], selectedNodeId }
// Persistencia: localStorage key 'sclabs-chain-board-v2'
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChainBoardCanvasFlow } from "./ChainBoardCanvasFlow";
import { ChainBoardInventoryColumn } from "./ChainBoardInventoryColumn";
import { ChainBoardStoreColumn } from "./ChainBoardStoreColumn";
import {
  type BoardEdge,
  type BoardNode,
  type BoardSnapshot,
  type CatalogShip,
  type HangarCcuPayload,
  type UpgradeKind,
} from "./types";

const LS_KEY = "sclabs-chain-board-v2";
const KIND_CYCLE: UpgradeKind[] = ["normal", "warbond", "hanger"];

const newId = (prefix: string) =>
  `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

function defaultPriceFor(kind: UpgradeKind, fromMsrp: number, toMsrp: number): number {
  const diff = Math.max(0, toMsrp - fromMsrp);
  if (kind === "warbond") return Math.round(diff * 0.92 * 100) / 100;
  if (kind === "hanger") return 0; // Hanger = ya pagado
  return Math.round(diff * 100) / 100; // standard ≈ msrpDiff
}

// ─────────────────────────────────────────────────────────────────────────────

export function ChainBoardWorkspace() {
  const [nodes, setNodes] = useState<BoardNode[]>([]);
  const [edges, setEdges] = useState<BoardEdge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // ── Hidratar desde localStorage ──────────────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const snap = JSON.parse(raw) as BoardSnapshot;
        if (snap?.version === 2 && Array.isArray(snap.nodes) && Array.isArray(snap.edges)) {
          setNodes(snap.nodes);
          setEdges(snap.edges);
        }
      }
    } catch {
      // Ignorar payload corrupto.
    }
    setHydrated(true);
  }, []);

  // ── Persistir a localStorage (debounced 400ms) ───────────────────────────
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const snap: BoardSnapshot = {
        version: 2,
        nodes,
        edges,
        savedAt: new Date().toISOString(),
      };
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(snap));
      } catch {
        // Storage lleno o privado — silencio.
      }
    }, 400);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [nodes, edges, hydrated]);

  // ── Mutadores ────────────────────────────────────────────────────────────

  const addShipAt = useCallback((ship: CatalogShip, position: { x: number; y: number }) => {
    setNodes((prev) => {
      // Si ya está en el canvas, solo movemos su posición (no duplicamos).
      const existing = prev.findIndex((n) => n.ship.id === ship.id);
      if (existing !== -1) {
        const next = prev.slice();
        next[existing] = { ...next[existing], position };
        return next;
      }
      const node: BoardNode = { id: newId("n"), ship, position };
      return [...prev, node];
    });
  }, []);

  const addHangarCcuAt = useCallback(
    (payload: HangarCcuPayload, position: { x: number; y: number }) => {
      setNodes((prev) => {
        const next = prev.slice();
        const fromIdx = next.findIndex((n) => n.ship.id === payload.from.id);
        const toIdx = next.findIndex((n) => n.ship.id === payload.to.id);
        let fromNode: BoardNode;
        let toNode: BoardNode;
        const fromPos = position;
        const toPos = { x: position.x + 220, y: position.y };
        if (fromIdx !== -1) {
          next[fromIdx] = { ...next[fromIdx], position: fromPos };
          fromNode = next[fromIdx];
        } else {
          fromNode = { id: newId("n"), ship: payload.from, position: fromPos };
          next.push(fromNode);
        }
        if (toIdx !== -1) {
          next[toIdx] = { ...next[toIdx], position: toPos };
          toNode = next[toIdx];
        } else {
          toNode = { id: newId("n"), ship: payload.to, position: toPos };
          next.push(toNode);
        }
        // Crear edge si todavía no existe.
        setEdges((prevEdges) => {
          const exists = prevEdges.some(
            (e) => e.source === fromNode.id && e.target === toNode.id,
          );
          if (exists) return prevEdges;
          const edge: BoardEdge = {
            id: newId("e"),
            source: fromNode.id,
            target: toNode.id,
            kind: payload.kind,
            price: payload.price,
          };
          return [...prevEdges, edge];
        });
        return next;
      });
    },
    [],
  );

  const moveNode = useCallback((nodeId: string, position: { x: number; y: number }) => {
    setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, position } : n)));
  }, []);

  const deleteNode = useCallback((nodeId: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) => prev.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedNodeId((prev) => (prev === nodeId ? null : prev));
  }, []);

  const connectNodes = useCallback((sourceId: string, targetId: string) => {
    setNodes((prevNodes) => {
      const source = prevNodes.find((n) => n.id === sourceId);
      const target = prevNodes.find((n) => n.id === targetId);
      if (!source || !target) return prevNodes;
      setEdges((prevEdges) => {
        const exists = prevEdges.some((e) => e.source === sourceId && e.target === targetId);
        if (exists) return prevEdges;
        const kind: UpgradeKind = "normal";
        const price = defaultPriceFor(kind, source.ship.msrpUsd, target.ship.msrpUsd);
        return [...prevEdges, { id: newId("e"), source: sourceId, target: targetId, kind, price }];
      });
      return prevNodes;
    });
  }, []);

  const cycleEdgeKind = useCallback((edgeId: string) => {
    setEdges((prev) =>
      prev.map((e) => {
        if (e.id !== edgeId) return e;
        const idx = KIND_CYCLE.indexOf(e.kind);
        const nextKind = KIND_CYCLE[(idx + 1) % KIND_CYCLE.length];
        const fromNode = nodes.find((n) => n.id === e.source);
        const toNode = nodes.find((n) => n.id === e.target);
        const nextPrice =
          fromNode && toNode
            ? defaultPriceFor(nextKind, fromNode.ship.msrpUsd, toNode.ship.msrpUsd)
            : e.price;
        return { ...e, kind: nextKind, price: nextPrice };
      }),
    );
  }, [nodes]);

  const editPathOnNode = useCallback(
    (nodeId: string) => {
      // EDIT PATH = ciclar el kind del edge entrante a este nodo.
      const incoming = edges.find((e) => e.target === nodeId);
      if (incoming) cycleEdgeKind(incoming.id);
    },
    [edges, cycleEdgeKind],
  );

  // ── Toolbar actions ──────────────────────────────────────────────────────

  const clearBoard = useCallback(() => {
    if (nodes.length === 0 && edges.length === 0) return;
    if (!confirm("¿Vaciar la pizarra? Se perderán los nodos y conexiones actuales.")) return;
    setNodes([]);
    setEdges([]);
    setSelectedNodeId(null);
    try {
      localStorage.removeItem(LS_KEY);
    } catch {}
    setStatusMsg({ kind: "ok", text: "Pizarra vacía." });
  }, [nodes.length, edges.length]);

  const saveBoard = useCallback(() => {
    const snap: BoardSnapshot = {
      version: 2,
      nodes,
      edges,
      savedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(snap));
      setStatusMsg({ kind: "ok", text: "Pizarra guardada en este navegador." });
    } catch (e: any) {
      setStatusMsg({ kind: "err", text: e?.message ?? "No se pudo guardar." });
    }
  }, [nodes, edges]);

  const exportBoard = useCallback(() => {
    const snap: BoardSnapshot = {
      version: 2,
      nodes,
      edges,
      savedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sclabs-chain-board-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [nodes, edges]);

  const importBoard = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const snap = JSON.parse(text) as BoardSnapshot;
        if (snap?.version !== 2 || !Array.isArray(snap.nodes) || !Array.isArray(snap.edges)) {
          throw new Error("JSON inválido o de versión incompatible.");
        }
        setNodes(snap.nodes);
        setEdges(snap.edges);
        setSelectedNodeId(null);
        setStatusMsg({ kind: "ok", text: `Pizarra importada (${snap.nodes.length} naves).` });
      } catch (e: any) {
        setStatusMsg({ kind: "err", text: e?.message ?? "No se pudo importar." });
      }
    };
    input.click();
  }, []);

  // ── Derivados ────────────────────────────────────────────────────────────

  const usedShipIds = useMemo(() => new Set(nodes.map((n) => n.ship.id)), [nodes]);
  const selectedNode = useMemo(
    () => (selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) ?? null : null),
    [nodes, selectedNodeId],
  );

  // Cadena de pasos hacia atrás desde el nodo seleccionado (alternative routes).
  const upstreamChain = useMemo<{ from: BoardNode; edge: BoardEdge; to: BoardNode }[]>(() => {
    if (!selectedNode) return [];
    const incomingByTarget = new Map<string, BoardEdge>();
    for (const e of edges) incomingByTarget.set(e.target, e);
    const steps: { from: BoardNode; edge: BoardEdge; to: BoardNode }[] = [];
    const visited = new Set<string>();
    let current: BoardNode | null = selectedNode;
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      const inE = incomingByTarget.get(current.id);
      if (!inE) break;
      const fromNode = nodes.find((n) => n.id === inE.source);
      if (!fromNode) break;
      steps.unshift({ from: fromNode, edge: inE, to: current });
      current = fromNode;
    }
    return steps;
  }, [selectedNode, edges, nodes]);

  const totalCost = useMemo(
    () => upstreamChain.reduce((acc, s) => acc + s.edge.price, 0),
    [upstreamChain],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold text-zinc-100 tracking-wide flex items-center gap-2">
            <span className="text-2xl">🛠️</span>
            Ship Upgrade Planner
            <span className="text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-sm bg-amber-500/15 text-amber-300 border border-amber-500/30">
              v2
            </span>
          </h1>
          <p className="text-[11px] text-zinc-500">
            Create your CCU path — drag ships to the canvas and connect them.
          </p>
        </div>
        <Link
          href="/hangar?tab=ccu-chains"
          className="text-[10px] px-2.5 py-1.5 bg-zinc-900/60 border border-zinc-700/60 rounded-sm text-zinc-400 hover:text-cyan-300 hover:border-cyan-500/40 transition-colors"
        >
          ← Calculator clásico
        </Link>
      </div>

      {/* Status message */}
      {statusMsg && (
        <div
          className={`px-3 py-2 rounded-sm border text-[11px] ${
            statusMsg.kind === "ok"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : "bg-rose-500/10 border-rose-500/30 text-rose-300"
          }`}
        >
          {statusMsg.text}
          <button
            onClick={() => setStatusMsg(null)}
            className="float-right text-zinc-500 hover:text-zinc-300"
          >
            ✕
          </button>
        </div>
      )}

      {/* 4-col grid */}
      <div className="flex-1 min-h-[600px] grid grid-cols-1 md:grid-cols-[200px_220px_1fr_280px] gap-3">
        <section className="min-h-[400px] hidden md:block">
          <ChainBoardInventoryColumn usedShipIds={usedShipIds} />
        </section>

        <section className="min-h-[400px] hidden md:block">
          <ChainBoardStoreColumn />
        </section>

        <section className="min-h-[600px]">
          <ChainBoardCanvasFlow
            nodes={nodes}
            edges={edges}
            selectedNodeId={selectedNodeId}
            onMoveNode={moveNode}
            onSelectNode={setSelectedNodeId}
            onDeleteNode={deleteNode}
            onEditPath={editPathOnNode}
            onConnect={connectNodes}
            onCycleEdgeKind={cycleEdgeKind}
            onAddShipAt={addShipAt}
            onAddHangarCcuAt={addHangarCcuAt}
          />
        </section>

        <section className="min-h-[400px] hidden md:block">
          <RightPanel
            selectedNode={selectedNode}
            upstreamChain={upstreamChain}
            totalCost={totalCost}
            onSelectNode={setSelectedNodeId}
            onClose={() => setSelectedNodeId(null)}
          />
        </section>
      </div>

      {/* Bottom toolbar */}
      <div className="flex items-center justify-center gap-2 py-2 border-t border-zinc-800/40">
        <ToolbarButton onClick={clearBoard} icon="🗑" label="Clear" tone="rose" />
        <ToolbarButton onClick={saveBoard} icon="💾" label="Save" tone="emerald" />
        <ToolbarButton onClick={exportBoard} icon="↓" label="Export" tone="cyan" />
        <ToolbarButton onClick={importBoard} icon="↑" label="Import" tone="amber" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RightPanel (inline)
// ─────────────────────────────────────────────────────────────────────────────

interface RightPanelProps {
  selectedNode: BoardNode | null;
  upstreamChain: { from: BoardNode; edge: BoardEdge; to: BoardNode }[];
  totalCost: number;
  onSelectNode: (id: string) => void;
  onClose: () => void;
}

const KIND_LABEL: Record<UpgradeKind, { label: string; cls: string }> = {
  normal: { label: "Normal", cls: "bg-blue-500/15 text-blue-300 border-blue-500/40" },
  warbond: { label: "WB", cls: "bg-rose-500/15 text-rose-300 border-rose-500/40" },
  hanger: { label: "Hanger", cls: "bg-cyan-500/15 text-cyan-300 border-cyan-500/40" },
};

function RightPanel({ selectedNode, upstreamChain, totalCost, onSelectNode, onClose }: RightPanelProps) {
  if (!selectedNode) {
    return (
      <div className="h-full flex flex-col bg-zinc-900/40 border border-zinc-800/60 rounded-md p-4 items-center justify-center text-center">
        <p className="text-[12px] text-zinc-500 mb-1">Sin nave seleccionada</p>
        <p className="text-[10px] text-zinc-600 leading-relaxed">
          Click en una nave del canvas
          <br />
          para ver detalles y rutas.
        </p>
      </div>
    );
  }

  const { ship } = selectedNode;
  const hasWarbond =
    ship.warbondUsd != null && ship.warbondUsd > 0 && ship.warbondUsd !== ship.msrpUsd;

  return (
    <div className="h-full flex flex-col bg-zinc-900/40 border border-zinc-800/60 rounded-md overflow-hidden">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 border-b border-zinc-800/50 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-zinc-100 truncate">{ship.name}</h3>
          <p className="text-[10px] text-zinc-500 italic truncate">
            {ship.manufacturer ?? "—"}
            {ship.role ? ` · ${ship.role}` : ""}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-rose-300 text-[14px] px-1 shrink-0"
          title="Cerrar panel"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Foto */}
        {ship.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ship.imageUrl}
            alt={ship.name}
            className="w-full aspect-video object-cover border-b border-zinc-800/60"
            draggable={false}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.opacity = "0.2";
            }}
          />
        ) : (
          <div className="w-full aspect-video bg-zinc-800/40 border-b border-zinc-800/60 flex items-center justify-center text-zinc-700 text-3xl">
            🚀
          </div>
        )}

        {/* Ship Value */}
        <div className="px-3 py-3 border-b border-zinc-800/40">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
              Ship Value
            </span>
            <span className="text-[18px] font-mono font-bold text-cyan-300">
              ${ship.msrpUsd.toFixed(2)}
            </span>
          </div>
          {hasWarbond && (
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-600">
                Warbond
              </span>
              <span className="text-[12px] font-mono text-cyan-400">
                ${ship.warbondUsd!.toFixed(2)}
              </span>
            </div>
          )}
        </div>

        {/* Alternative Upgrade Routes */}
        <div className="px-3 py-3">
          <h4 className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 mb-2">
            Upgrade Path ({upstreamChain.length} {upstreamChain.length === 1 ? "step" : "steps"})
          </h4>
          {upstreamChain.length === 0 && (
            <p className="text-[10px] text-zinc-600 italic">
              Esta nave no tiene un upgrade entrante en el canvas.
            </p>
          )}
          <div className="space-y-2">
            {upstreamChain.map((s) => {
              const kindStyle = KIND_LABEL[s.edge.kind];
              return (
                <div
                  key={s.edge.id}
                  className="bg-zinc-950/60 border border-zinc-800/60 rounded-sm overflow-hidden"
                >
                  <button
                    onClick={() => onSelectNode(s.from.id)}
                    className="w-full flex items-center gap-1.5 p-1.5 hover:bg-zinc-800/40 transition-colors"
                  >
                    {s.from.ship.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={s.from.ship.imageUrl}
                        alt=""
                        className="w-10 h-7 object-cover rounded-sm shrink-0"
                        draggable={false}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.opacity = "0.2";
                        }}
                      />
                    ) : (
                      <div className="w-10 h-7 rounded-sm bg-zinc-800/60 shrink-0" />
                    )}
                    <span className="text-[10px] text-zinc-300 truncate flex-1 text-left">
                      From {s.from.ship.name}
                    </span>
                  </button>
                  <div className="flex items-center justify-between px-2 py-1 border-t border-zinc-800/40 bg-zinc-900/40">
                    <span
                      className={`text-[9px] font-mono uppercase tracking-wider px-1 rounded-[2px] border ${kindStyle.cls}`}
                    >
                      {kindStyle.label}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-300">
                      ${s.edge.price.toFixed(2)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {upstreamChain.length > 0 && (
            <div className="mt-3 pt-2 border-t border-zinc-800/40 flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">
                Total Path Cost
              </span>
              <span className="text-[14px] font-mono font-bold text-amber-300">
                ${totalCost.toFixed(2)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ToolbarButton (inline)
// ─────────────────────────────────────────────────────────────────────────────

const TONE: Record<string, string> = {
  rose: "border-rose-500/40 text-rose-300 hover:bg-rose-500/15",
  emerald: "border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/15",
  cyan: "border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/15",
  amber: "border-amber-500/40 text-amber-300 hover:bg-amber-500/15",
};

function ToolbarButton({
  onClick,
  icon,
  label,
  tone,
}: {
  onClick: () => void;
  icon: string;
  label: string;
  tone: keyof typeof TONE;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-[11px] font-mono uppercase tracking-wider px-3 py-1.5 rounded-sm border bg-zinc-950/40 transition-colors flex items-center gap-1.5 ${TONE[tone]}`}
    >
      <span>{icon}</span>
      {label}
    </button>
  );
}
