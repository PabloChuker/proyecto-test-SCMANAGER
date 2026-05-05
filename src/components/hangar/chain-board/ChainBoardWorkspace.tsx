"use client";

// =============================================================================
// SC LABS — ChainBoardWorkspace v2.1 (rewrite 2026-05-05)
//
// Layout 4-columnas + bottom toolbar al estilo "Ship Upgrade Planner":
//   ┌────────┬────────┬─────────────────────┬──────────────┐
//   │Available│My      │  Canvas (xyflow)    │ Right Panel  │
//   │Ships    │Hangar  │ (drag/drop, conec.) │ Detail/Creator│
//   └────────┴────────┴─────────────────────┴──────────────┘
//
// Funcionalidades v2.1:
//   · Edges del hangar = locked (inmutables, candado)
//   · Conexión inválida (no hay CCU directo) = roja con badge "Sin CCU"
//   · Click badge edge = cicla kind, doble-click = edita precio
//   · Right Panel = Detail | CCU Creator | Auto-Build (3 modos)
//   · Auto-Build: solver clásico /api/ccu/calculate con base/target/modo
//   · Persistencia localStorage
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useHangarStore, type HangarCCU } from "@/store/useHangarStore";
import { getShipThumbUrl } from "../HangarShipCard";
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
  if (kind === "hanger") return 0;
  return Math.round(diff * 100) / 100;
}

interface RawCatalogRow {
  id: string;
  reference?: string;
  name: string;
  manufacturer: string | null;
  msrpUsd: number;
  warbondUsd: number | null;
  flightStatus?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────

export function ChainBoardWorkspace() {
  const [nodes, setNodes] = useState<BoardNode[]>([]);
  const [edges, setEdges] = useState<BoardEdge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [rightPanelMode, setRightPanelMode] = useState<"detail" | "creator" | "auto">("detail");

  // Catálogo compartido (para Right Panel + auto-build)
  const [catalog, setCatalog] = useState<CatalogShip[]>([]);
  useEffect(() => {
    fetch("/api/ccu/ships")
      .then((r) => r.json())
      .then((d) => {
        const arr = Array.isArray(d?.ships) ? (d.ships as RawCatalogRow[]) : [];
        setCatalog(
          arr.map((x) => ({
            id: String(x.id ?? ""),
            reference: String(x.reference ?? ""),
            name: String(x.name ?? ""),
            manufacturer: x.manufacturer ?? null,
            role: x.flightStatus ?? null,
            msrpUsd: Number(x.msrpUsd) || 0,
            warbondUsd: x.warbondUsd != null ? Number(x.warbondUsd) : null,
            imageUrl: getShipThumbUrl(String(x.name ?? "")),
          })),
        );
      })
      .catch(() => {});
  }, []);

  const ccusInHangar = useHangarStore((s) => s.ccus);

  // ── Hidratar localStorage ─────────────────────────────────────────────────
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
    } catch {}
    setHydrated(true);
  }, []);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        const snap: BoardSnapshot = { version: 2, nodes, edges, savedAt: new Date().toISOString() };
        localStorage.setItem(LS_KEY, JSON.stringify(snap));
      } catch {}
    }, 400);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [nodes, edges, hydrated]);

  // ── Mutadores ────────────────────────────────────────────────────────────

  const addShipAt = useCallback((ship: CatalogShip, position: { x: number; y: number }) => {
    setNodes((prev) => {
      const existing = prev.findIndex((n) => n.ship.id === ship.id);
      if (existing !== -1) {
        const next = prev.slice();
        next[existing] = { ...next[existing], position };
        return next;
      }
      return [...prev, { id: newId("n"), ship, position }];
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
            locked: payload.owned, // CCU del hangar = bloque inmutable
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

  // Conectar manual: arrastrar handle → handle. Validamos contra ccu_prices
  // de fondo; si no hay ruta directa, marcamos invalid (rojo).
  const connectNodes = useCallback(
    (sourceId: string, targetId: string) => {
      setNodes((prevNodes) => {
        const source = prevNodes.find((n) => n.id === sourceId);
        const target = prevNodes.find((n) => n.id === targetId);
        if (!source || !target) return prevNodes;
        setEdges((prevEdges) => {
          const exists = prevEdges.some((e) => e.source === sourceId && e.target === targetId);
          if (exists) return prevEdges;
          const kind: UpgradeKind = "normal";
          const price = defaultPriceFor(kind, source.ship.msrpUsd, target.ship.msrpUsd);
          const edgeId = newId("e");
          // Validar async
          fetch("/api/ccu/validate-edges", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pairs: [{ fromShipId: source.ship.id, toShipId: target.ship.id }],
              ownedCCUs: [],
            }),
          })
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => {
              const result = j?.results?.[0];
              if (!result) return;
              if (result.status === "invalid") {
                setEdges((eds) => eds.map((e) => (e.id === edgeId ? { ...e, invalid: true } : e)));
              } else if (result.standardPrice && result.standardPrice > 0) {
                setEdges((eds) =>
                  eds.map((e) =>
                    e.id === edgeId && !e.priceManual
                      ? { ...e, price: Number(result.standardPrice), invalid: false }
                      : e,
                  ),
                );
              }
            })
            .catch(() => {});
          return [...prevEdges, { id: edgeId, source: sourceId, target: targetId, kind, price }];
        });
        return prevNodes;
      });
    },
    [],
  );

  const cycleEdgeKind = useCallback(
    (edgeId: string) => {
      setEdges((prev) =>
        prev.map((e) => {
          if (e.id !== edgeId) return e;
          if (e.locked) return e; // CCU del hangar inmutable
          const idx = KIND_CYCLE.indexOf(e.kind);
          const nextKind = KIND_CYCLE[(idx + 1) % KIND_CYCLE.length];
          // Si el precio era manual, no lo recalculamos.
          if (e.priceManual) return { ...e, kind: nextKind };
          const fromNode = nodes.find((n) => n.id === e.source);
          const toNode = nodes.find((n) => n.id === e.target);
          const nextPrice = fromNode && toNode
            ? defaultPriceFor(nextKind, fromNode.ship.msrpUsd, toNode.ship.msrpUsd)
            : e.price;
          return { ...e, kind: nextKind, price: nextPrice };
        }),
      );
    },
    [nodes],
  );

  const editEdgePrice = useCallback((edgeId: string) => {
    const target = edges.find((e) => e.id === edgeId);
    if (!target || target.locked) return;
    const input = prompt(`Editar precio del CCU (USD):`, target.price.toFixed(2));
    if (input === null) return;
    const parsed = parseFloat(input);
    if (isNaN(parsed) || parsed < 0) {
      setStatusMsg({ kind: "err", text: "Precio inválido." });
      return;
    }
    setEdges((prev) =>
      prev.map((e) => (e.id === edgeId ? { ...e, price: parsed, priceManual: true } : e)),
    );
  }, [edges]);

  const editPathOnNode = useCallback(
    (nodeId: string) => {
      const incoming = edges.find((e) => e.target === nodeId);
      if (incoming) cycleEdgeKind(incoming.id);
    },
    [edges, cycleEdgeKind],
  );

  // ── CCU Creator (Right Panel) ────────────────────────────────────────────

  const createCcu = useCallback(
    (from: CatalogShip, to: CatalogShip, isWarbond: boolean, manualPrice: number | null) => {
      const kind: UpgradeKind = isWarbond ? "warbond" : "normal";
      const price = manualPrice ?? defaultPriceFor(kind, from.msrpUsd, to.msrpUsd);
      const fromPos = { x: 100, y: 100 };
      const toPos = { x: 100 + 220, y: 100 };
      setNodes((prev) => {
        const next = prev.slice();
        let fromNode = next.find((n) => n.ship.id === from.id);
        let toNode = next.find((n) => n.ship.id === to.id);
        if (!fromNode) {
          fromNode = { id: newId("n"), ship: from, position: fromPos };
          next.push(fromNode);
        }
        if (!toNode) {
          toNode = { id: newId("n"), ship: to, position: toPos };
          next.push(toNode);
        }
        setEdges((prevEdges) => {
          const exists = prevEdges.some(
            (e) => e.source === fromNode!.id && e.target === toNode!.id,
          );
          if (exists) return prevEdges;
          return [
            ...prevEdges,
            {
              id: newId("e"),
              source: fromNode!.id,
              target: toNode!.id,
              kind,
              price,
              priceManual: manualPrice !== null,
            },
          ];
        });
        return next;
      });
      setStatusMsg({ kind: "ok", text: `CCU agregado: ${from.name} → ${to.name}` });
    },
    [],
  );

  // ── Auto-build (solver) ──────────────────────────────────────────────────

  type AutoMode = "now" | "save" | "credits";
  const [autoBusy, setAutoBusy] = useState(false);

  const autoBuild = useCallback(
    async (
      fromShip: CatalogShip,
      toShip: CatalogShip,
      mode: AutoMode,
    ) => {
      setAutoBusy(true);
      setStatusMsg(null);
      try {
        const ownedCCUs = ccusInHangar.map((c: HangarCCU) => ({
          fromShip: c.fromShip,
          toShip: c.toShip,
          pricePaid: c.pricePaid,
          location: c.location,
        }));
        const body = {
          fromShipId: fromShip.id,
          toShipId: toShip.id,
          ownedCCUs,
          preferWarbond: mode !== "now",
          hasBuybackToken: false,
          paymentPriority: mode === "credits" ? "credits" : "balanced",
          onlyAvailable: mode === "now",
          maxSteps: 15,
        };
        const r = await fetch("/api/ccu/calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await r.json();
        if (!r.ok || !data.chain) throw new Error(data.error || "Sin cadena válida.");

        // Materializar en canvas: agregar nodos para cada step + edges
        type Step = {
          fromShip: { id: string; name: string; manufacturer: string | null; msrpUsd: number; warbondUsd: number | null; reference: string };
          toShip: { id: string; name: string; manufacturer: string | null; msrpUsd: number; warbondUsd: number | null; reference: string };
          isWarbond?: boolean;
          isOwned?: boolean;
          ccuPrice?: number;
        };
        const steps = data.chain.steps as Step[];
        const newNodes: BoardNode[] = [];
        const seenShipIds = new Set<string>();
        const ensureNode = (s: Step["fromShip"], idx: number): BoardNode => {
          const existing = newNodes.find((n) => n.ship.id === s.id);
          if (existing) return existing;
          const ship: CatalogShip = {
            id: String(s.id),
            reference: String(s.reference ?? ""),
            name: s.name,
            manufacturer: s.manufacturer,
            role: null,
            msrpUsd: s.msrpUsd,
            warbondUsd: s.warbondUsd,
            imageUrl: getShipThumbUrl(s.name),
          };
          const node: BoardNode = {
            id: newId("n"),
            ship,
            position: { x: 80 + idx * 220, y: 80 },
          };
          newNodes.push(node);
          seenShipIds.add(s.id);
          return node;
        };
        const newEdges: BoardEdge[] = [];
        for (let i = 0; i < steps.length; i++) {
          const s = steps[i];
          const fromN = ensureNode(s.fromShip, i);
          const toN = ensureNode(s.toShip, i + 1);
          const kind: UpgradeKind = s.isOwned
            ? "hanger"
            : s.isWarbond
            ? "warbond"
            : "normal";
          newEdges.push({
            id: newId("e"),
            source: fromN.id,
            target: toN.id,
            kind,
            price: s.ccuPrice ?? defaultPriceFor(kind, s.fromShip.msrpUsd, s.toShip.msrpUsd),
            locked: !!s.isOwned,
          });
        }
        setNodes(newNodes);
        setEdges(newEdges);
        setSelectedNodeId(null);
        setRightPanelMode("detail");
        setStatusMsg({
          kind: "ok",
          text: `Cadena armada: ${steps.length} pasos · costo $${data.chain.totalCost.toFixed(0)}`,
        });
      } catch (e: any) {
        setStatusMsg({ kind: "err", text: e?.message ?? "No se pudo armar la cadena." });
      } finally {
        setAutoBusy(false);
      }
    },
    [ccusInHangar],
  );

  // ── Toolbar ──────────────────────────────────────────────────────────────

  const clearBoard = useCallback(() => {
    if (nodes.length === 0 && edges.length === 0) return;
    if (!confirm("¿Vaciar la pizarra? Se perderán los nodos y conexiones actuales.")) return;
    setNodes([]);
    setEdges([]);
    setSelectedNodeId(null);
    try {
      localStorage.removeItem(LS_KEY);
    } catch {}
  }, [nodes.length, edges.length]);

  const saveBoard = useCallback(() => {
    try {
      const snap: BoardSnapshot = { version: 2, nodes, edges, savedAt: new Date().toISOString() };
      localStorage.setItem(LS_KEY, JSON.stringify(snap));
      setStatusMsg({ kind: "ok", text: "Pizarra guardada en este navegador." });
    } catch (e: any) {
      setStatusMsg({ kind: "err", text: e?.message ?? "No se pudo guardar." });
    }
  }, [nodes, edges]);

  const exportBoard = useCallback(() => {
    const snap: BoardSnapshot = { version: 2, nodes, edges, savedAt: new Date().toISOString() };
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
  return (
    <div className="space-y-3 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold text-zinc-100 tracking-wide flex items-center gap-2">
            <span className="text-2xl">🛠️</span>
            Ship Upgrade Planner
            <span className="text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-sm bg-amber-500/15 text-amber-300 border border-amber-500/30">
              v2.1
            </span>
          </h1>
          <p className="text-[11px] text-zinc-500">
            Arrastrá naves y CCUs · conectá libremente · bloque hangar inmutable.
          </p>
        </div>
        <Link
          href="/hangar?tab=ccu-chains"
          className="text-[10px] px-2.5 py-1.5 bg-zinc-900/60 border border-zinc-700/60 rounded-sm text-zinc-400 hover:text-cyan-300 hover:border-cyan-500/40 transition-colors"
        >
          ← Calculator clásico
        </Link>
      </div>

      {statusMsg && (
        <div
          className={`px-3 py-2 rounded-sm border text-[11px] ${
            statusMsg.kind === "ok"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : "bg-rose-500/10 border-rose-500/30 text-rose-300"
          }`}
        >
          {statusMsg.text}
          <button onClick={() => setStatusMsg(null)} className="float-right text-zinc-500 hover:text-zinc-300">
            ✕
          </button>
        </div>
      )}

      {/* Grid 4-col */}
      <div className="flex-1 min-h-[600px] grid grid-cols-1 md:grid-cols-[210px_220px_1fr_300px] gap-3">
        <section className="min-h-[400px] hidden md:block">
          <ChainBoardInventoryColumn usedShipIds={usedShipIds} />
        </section>

        <section className="min-h-[400px] hidden md:block">
          <ChainBoardStoreColumn usedShipIds={usedShipIds} />
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
            onEditEdgePrice={editEdgePrice}
            onAddShipAt={addShipAt}
            onAddHangarCcuAt={addHangarCcuAt}
          />
        </section>

        <section className="min-h-[400px] hidden md:block">
          <RightPanel
            mode={rightPanelMode}
            setMode={setRightPanelMode}
            selectedNode={selectedNode}
            upstreamChain={upstreamChain}
            totalCost={totalCost}
            onSelectNode={setSelectedNodeId}
            onClose={() => setSelectedNodeId(null)}
            catalog={catalog}
            onCreateCcu={createCcu}
            autoBusy={autoBusy}
            onAutoBuild={autoBuild}
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
// RightPanel
// ─────────────────────────────────────────────────────────────────────────────

const KIND_LABEL: Record<UpgradeKind, { label: string; cls: string }> = {
  normal: { label: "Normal", cls: "bg-blue-500/15 text-blue-300 border-blue-500/40" },
  warbond: { label: "WB", cls: "bg-rose-500/15 text-rose-300 border-rose-500/40" },
  hanger: { label: "Hanger", cls: "bg-cyan-500/15 text-cyan-300 border-cyan-500/40" },
};

interface RightPanelProps {
  mode: "detail" | "creator" | "auto";
  setMode: (m: "detail" | "creator" | "auto") => void;
  selectedNode: BoardNode | null;
  upstreamChain: { from: BoardNode; edge: BoardEdge; to: BoardNode }[];
  totalCost: number;
  onSelectNode: (id: string) => void;
  onClose: () => void;
  catalog: CatalogShip[];
  onCreateCcu: (from: CatalogShip, to: CatalogShip, isWarbond: boolean, manualPrice: number | null) => void;
  autoBusy: boolean;
  onAutoBuild: (from: CatalogShip, to: CatalogShip, mode: "now" | "save" | "credits") => void;
}

function RightPanel({
  mode,
  setMode,
  selectedNode,
  upstreamChain,
  totalCost,
  onSelectNode,
  onClose,
  catalog,
  onCreateCcu,
  autoBusy,
  onAutoBuild,
}: RightPanelProps) {
  return (
    <div className="h-full flex flex-col bg-zinc-900/40 border border-zinc-800/60 rounded-md overflow-hidden">
      {/* Tabs del panel */}
      <div className="flex p-0.5 m-2 bg-zinc-950/60 rounded-sm gap-0.5 shrink-0">
        <PanelTab active={mode === "detail"} onClick={() => setMode("detail")} label="Detalle" />
        <PanelTab active={mode === "creator"} onClick={() => setMode("creator")} label="+ CCU" />
        <PanelTab active={mode === "auto"} onClick={() => setMode("auto")} label="Auto" />
      </div>

      <div className="flex-1 overflow-y-auto">
        {mode === "detail" && (
          <DetailMode
            selectedNode={selectedNode}
            upstreamChain={upstreamChain}
            totalCost={totalCost}
            onSelectNode={onSelectNode}
            onClose={onClose}
          />
        )}
        {mode === "creator" && <CreatorMode catalog={catalog} onCreateCcu={onCreateCcu} />}
        {mode === "auto" && <AutoMode catalog={catalog} busy={autoBusy} onAutoBuild={onAutoBuild} />}
      </div>
    </div>
  );
}

function PanelTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 text-[10px] py-1 rounded-sm transition-colors font-medium ${
        active ? "bg-amber-500/20 text-amber-300" : "text-zinc-500 hover:text-zinc-300"
      }`}
    >
      {label}
    </button>
  );
}

// ── DetailMode ───────────────────────────────────────────────────────────────

function DetailMode({
  selectedNode,
  upstreamChain,
  totalCost,
  onSelectNode,
  onClose,
}: {
  selectedNode: BoardNode | null;
  upstreamChain: { from: BoardNode; edge: BoardEdge; to: BoardNode }[];
  totalCost: number;
  onSelectNode: (id: string) => void;
  onClose: () => void;
}) {
  if (!selectedNode) {
    return (
      <div className="h-full p-4 flex flex-col items-center justify-center text-center">
        <p className="text-[12px] text-zinc-500 mb-1">Sin nave seleccionada</p>
        <p className="text-[10px] text-zinc-600 leading-relaxed">
          Click en una nave del canvas
          <br />
          para ver su detalle.
        </p>
      </div>
    );
  }
  const { ship } = selectedNode;
  const hasWarbond = ship.warbondUsd != null && ship.warbondUsd > 0 && ship.warbondUsd !== ship.msrpUsd;

  return (
    <div>
      <div className="px-3 pt-3 pb-2 flex items-start justify-between gap-2 border-b border-zinc-800/50">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-zinc-100 truncate">{ship.name}</h3>
          <p className="text-[10px] text-zinc-500 italic truncate">
            {ship.manufacturer ?? "—"}
            {ship.role ? ` · ${ship.role}` : ""}
          </p>
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-rose-300 text-[14px] px-1 shrink-0">
          ✕
        </button>
      </div>
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
      <div className="px-3 py-3 border-b border-zinc-800/40">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Ship Value</span>
          <span className="text-[18px] font-mono font-bold text-cyan-300">${ship.msrpUsd.toFixed(2)}</span>
        </div>
        {hasWarbond && (
          <div className="flex items-center justify-between mt-0.5">
            <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-600">Warbond</span>
            <span className="text-[12px] font-mono text-cyan-400">${ship.warbondUsd!.toFixed(2)}</span>
          </div>
        )}
      </div>

      <div className="px-3 py-3">
        <h4 className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 mb-2">
          Upgrade Path ({upstreamChain.length} {upstreamChain.length === 1 ? "step" : "steps"})
        </h4>
        {upstreamChain.length === 0 && (
          <p className="text-[10px] text-zinc-600 italic">Esta nave no tiene un upgrade entrante en el canvas.</p>
        )}
        <div className="space-y-2">
          {upstreamChain.map((s) => {
            const ks = KIND_LABEL[s.edge.kind];
            return (
              <div key={s.edge.id} className="bg-zinc-950/60 border border-zinc-800/60 rounded-sm overflow-hidden">
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
                  <span className="text-[10px] text-zinc-300 truncate flex-1 text-left">From {s.from.ship.name}</span>
                </button>
                <div className="flex items-center justify-between px-2 py-1 border-t border-zinc-800/40 bg-zinc-900/40">
                  <span className={`text-[9px] font-mono uppercase tracking-wider px-1 rounded-[2px] border ${ks.cls}`}>
                    {s.edge.locked ? "🔒 " : ""}
                    {ks.label}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-300">${s.edge.price.toFixed(2)}</span>
                </div>
              </div>
            );
          })}
        </div>
        {upstreamChain.length > 0 && (
          <div className="mt-3 pt-2 border-t border-zinc-800/40 flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">Total Path Cost</span>
            <span className="text-[14px] font-mono font-bold text-amber-300">${totalCost.toFixed(2)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── CreatorMode ──────────────────────────────────────────────────────────────

function CreatorMode({
  catalog,
  onCreateCcu,
}: {
  catalog: CatalogShip[];
  onCreateCcu: (from: CatalogShip, to: CatalogShip, isWarbond: boolean, manualPrice: number | null) => void;
}) {
  const [from, setFrom] = useState<CatalogShip | null>(null);
  const [to, setTo] = useState<CatalogShip | null>(null);
  const [isWarbond, setIsWarbond] = useState(false);
  const [manualPrice, setManualPrice] = useState("");
  const autoPrice = from && to ? defaultPriceFor(isWarbond ? "warbond" : "normal", from.msrpUsd, to.msrpUsd) : 0;
  const finalPrice = manualPrice ? parseFloat(manualPrice) : autoPrice;
  const valid = !!from && !!to && from.id !== to.id && to.msrpUsd > from.msrpUsd && finalPrice >= 0;

  return (
    <div className="p-3 space-y-3">
      <div>
        <h3 className="text-[12px] font-semibold text-zinc-200 mb-1">Crear CCU</h3>
        <p className="text-[10px] text-zinc-500 leading-snug">
          Elegí FROM y TO. El precio se calcula auto, o ponelo manual si tenés un precio diferente
          (concept ship que cambió, etc).
        </p>
      </div>

      <ShipPicker label="FROM" value={from} onChange={setFrom} catalog={catalog} />
      <div className="text-center text-zinc-700 text-sm">↓</div>
      <ShipPicker
        label="TO"
        value={to}
        onChange={setTo}
        catalog={catalog}
        filterFn={(s) => (from ? s.id !== from.id && s.msrpUsd > from.msrpUsd : true)}
      />

      <label className="flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer">
        <input
          type="checkbox"
          checked={isWarbond}
          onChange={(e) => setIsWarbond(e.target.checked)}
          className="accent-cyan-500"
        />
        Warbond (~8% descuento estimado)
      </label>

      {from && to && (
        <div className="bg-zinc-950/60 border border-zinc-800/60 rounded-sm p-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Precio auto</span>
            <span className="text-[12px] font-mono text-zinc-300">${autoPrice.toFixed(2)}</span>
          </div>
          <input
            type="number"
            step="0.01"
            value={manualPrice}
            onChange={(e) => setManualPrice(e.target.value)}
            placeholder="Manual override (opcional)"
            className="w-full px-2 py-1 bg-zinc-950 border border-zinc-800/60 rounded-sm text-[11px] text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50"
          />
          {manualPrice && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-amber-300">Precio final</span>
              <span className="text-[12px] font-mono font-bold text-amber-300">${finalPrice.toFixed(2)}</span>
            </div>
          )}
        </div>
      )}

      <button
        disabled={!valid}
        onClick={() => {
          if (!valid || !from || !to) return;
          onCreateCcu(from, to, isWarbond, manualPrice ? parseFloat(manualPrice) : null);
          setFrom(null);
          setTo(null);
          setManualPrice("");
          setIsWarbond(false);
        }}
        className={`w-full py-2 rounded-sm text-[11px] font-semibold transition-colors ${
          valid
            ? "bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30"
            : "bg-zinc-900/40 border border-zinc-800/40 text-zinc-600 cursor-not-allowed"
        }`}
      >
        ＋ Agregar al canvas
      </button>
    </div>
  );
}

// ── AutoMode ─────────────────────────────────────────────────────────────────

function AutoMode({
  catalog,
  busy,
  onAutoBuild,
}: {
  catalog: CatalogShip[];
  busy: boolean;
  onAutoBuild: (from: CatalogShip, to: CatalogShip, mode: "now" | "save" | "credits") => void;
}) {
  const [from, setFrom] = useState<CatalogShip | null>(null);
  const [to, setTo] = useState<CatalogShip | null>(null);
  const [mode, setMode] = useState<"now" | "save" | "credits">("save");
  const valid = !!from && !!to && from.id !== to.id && to.msrpUsd > from.msrpUsd;

  return (
    <div className="p-3 space-y-3">
      <div>
        <h3 className="text-[12px] font-semibold text-zinc-200 mb-1">Auto-armar cadena</h3>
        <p className="text-[10px] text-zinc-500 leading-snug">
          El solver arma la cadena óptima usando lo que tenés en hangar + lo disponible en tienda.
          Reemplaza el contenido actual del canvas.
        </p>
      </div>

      <ShipPicker label="DESDE" value={from} onChange={setFrom} catalog={catalog} />
      <div className="text-center text-zinc-700 text-sm">↓</div>
      <ShipPicker
        label="HASTA"
        value={to}
        onChange={setTo}
        catalog={catalog}
        filterFn={(s) => (from ? s.id !== from.id && s.msrpUsd > from.msrpUsd : true)}
      />

      <div className="space-y-1.5">
        <ModeOption mode={mode} value="now" onClick={() => setMode("now")} title="Armarla ya"
          desc="Solo CCUs disponibles hoy en RSI." />
        <ModeOption mode={mode} value="save" onClick={() => setMode("save")} title="Esperar y ahorrar"
          desc="Prioriza warbond. Permite Time-limited." />
        <ModeOption mode={mode} value="credits" onClick={() => setMode("credits")} title="Priorizar créditos"
          desc="Usa los CCUs que ya tenés en hangar." />
      </div>

      <button
        disabled={!valid || busy}
        onClick={() => {
          if (!valid || !from || !to) return;
          onAutoBuild(from, to, mode);
        }}
        className={`w-full py-2 rounded-sm text-[11px] font-semibold transition-colors flex items-center justify-center gap-1.5 ${
          valid && !busy
            ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30"
            : "bg-zinc-900/40 border border-zinc-800/40 text-zinc-600 cursor-not-allowed"
        }`}
      >
        {busy ? (
          <>
            <span className="w-3 h-3 border-2 border-zinc-700 border-t-emerald-400 rounded-full animate-spin" />
            Armando...
          </>
        ) : (
          <>⚡ Auto-armar</>
        )}
      </button>
    </div>
  );
}

function ModeOption({
  mode,
  value,
  onClick,
  title,
  desc,
}: {
  mode: string;
  value: string;
  onClick: () => void;
  title: string;
  desc: string;
}) {
  const active = mode === value;
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-2 rounded-sm border transition-colors ${
        active
          ? "bg-emerald-500/15 border-emerald-500/40"
          : "bg-zinc-950/40 border-zinc-800/40 hover:border-zinc-700"
      }`}
    >
      <p className={`text-[11px] font-semibold ${active ? "text-emerald-300" : "text-zinc-300"}`}>
        {title}
      </p>
      <p className="text-[9px] text-zinc-500 leading-snug mt-0.5">{desc}</p>
    </button>
  );
}

// ── ShipPicker (autocomplete) ────────────────────────────────────────────────

function ShipPicker({
  label,
  value,
  onChange,
  catalog,
  filterFn,
}: {
  label: string;
  value: CatalogShip | null;
  onChange: (s: CatalogShip | null) => void;
  catalog: CatalogShip[];
  filterFn?: (s: CatalogShip) => boolean;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    let arr = filterFn ? catalog.filter(filterFn) : catalog;
    const q = search.trim().toLowerCase();
    if (q) {
      arr = arr.filter(
        (s) => s.name.toLowerCase().includes(q) || (s.manufacturer ?? "").toLowerCase().includes(q),
      );
    }
    return arr.slice(0, 30);
  }, [catalog, search, filterFn]);

  return (
    <div>
      <p className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 mb-1">{label}</p>
      {value ? (
        <div className="bg-zinc-950/60 border border-zinc-800/60 rounded-sm p-1.5 flex items-center gap-2">
          {value.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value.imageUrl}
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
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-zinc-100 truncate">{value.name}</p>
            <p className="text-[9px] text-zinc-500 font-mono">${value.msrpUsd.toFixed(2)}</p>
          </div>
          <button
            onClick={() => onChange(null)}
            className="text-zinc-500 hover:text-rose-300 text-[12px] px-1 shrink-0"
            title="Cambiar"
          >
            ✕
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Buscar nave..."
            className="w-full px-2 py-1.5 bg-zinc-950 border border-zinc-800/60 rounded-sm text-[11px] text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
          />
          {open && filtered.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-zinc-950 border border-zinc-800 rounded-sm shadow-xl z-30 p-0.5 space-y-0.5">
              {filtered.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    onChange(s);
                    setOpen(false);
                    setSearch("");
                  }}
                  className="w-full flex items-center gap-2 px-1.5 py-1 rounded-sm text-[11px] hover:bg-zinc-800/60"
                >
                  {s.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.imageUrl}
                      alt=""
                      className="w-7 h-5 object-cover rounded-sm shrink-0"
                      draggable={false}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.opacity = "0.2";
                      }}
                    />
                  ) : (
                    <div className="w-7 h-5 rounded-sm bg-zinc-800/60 shrink-0" />
                  )}
                  <span className="flex-1 truncate text-left text-zinc-200">{s.name}</span>
                  <span className="text-amber-400/80 font-mono shrink-0">${s.msrpUsd}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── ToolbarButton ────────────────────────────────────────────────────────────

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
