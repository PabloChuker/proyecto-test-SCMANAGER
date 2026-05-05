"use client";

// =============================================================================
// SC LABS — ChainBoardWorkspace v2.2 (rewrite 2026-05-05)
//
// Cambios v2.2:
//   · Fix bug: CCU Creator ahora SÍ agrega al canvas (closure issue)
//   · Borrar flecha del canvas (botón ✕ en badge)
//   · Cada nodo muestra MSRP + costo acumulado por la cadena + ahorro
//   · Info bar global: total naves · total CCUs · costo total · ahorro vs MSRP
//   · CCU del hangar: edge LOCKED muestra el precio real pagado (no calculado)
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
const LS_SAVES_KEY = "sclabs-chain-board-saves-v1";
const KIND_CYCLE: UpgradeKind[] = ["normal", "warbond", "hanger"];

interface NamedSave {
  id: string;
  name: string;
  savedAt: string;
  snapshot: BoardSnapshot;
}

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

  const [savedChains, setSavedChains] = useState<NamedSave[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_SAVES_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) setSavedChains(arr as NamedSave[]);
      }
    } catch {}
  }, []);
  const persistSaves = useCallback((next: NamedSave[]) => {
    setSavedChains(next);
    try {
      localStorage.setItem(LS_SAVES_KEY, JSON.stringify(next));
    } catch {}
  }, []);

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
      // IDs preallocados para evitar problemas con setState anidado.
      const newFromId = newId("n");
      const newToId = newId("n");
      const edgeId = newId("e");
      const fromPos = position;
      const toPos = { x: position.x + 220, y: position.y };

      let realFromId = newFromId;
      let realToId = newToId;

      setNodes((prev) => {
        const next = prev.slice();
        const existingFromIdx = next.findIndex((n) => n.ship.id === payload.from.id);
        const existingToIdx = next.findIndex((n) => n.ship.id === payload.to.id);
        if (existingFromIdx !== -1) {
          realFromId = next[existingFromIdx].id;
          next[existingFromIdx] = { ...next[existingFromIdx], position: fromPos };
        } else {
          next.push({ id: newFromId, ship: payload.from, position: fromPos });
        }
        if (existingToIdx !== -1) {
          realToId = next[existingToIdx].id;
          next[existingToIdx] = { ...next[existingToIdx], position: toPos };
        } else {
          next.push({ id: newToId, ship: payload.to, position: toPos });
        }
        return next;
      });

      setEdges((prevEdges) => {
        const exists = prevEdges.some(
          (e) => e.source === realFromId && e.target === realToId,
        );
        if (exists) return prevEdges;
        return [
          ...prevEdges,
          {
            id: edgeId,
            source: realFromId,
            target: realToId,
            kind: payload.kind,
            price: payload.price,
            locked: payload.owned,
          },
        ];
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

  const deleteEdge = useCallback((edgeId: string) => {
    setEdges((prev) => prev.filter((e) => e.id !== edgeId));
  }, []);

  // Conectar manual: validamos contra ccu_prices async; si invalid, marcamos.
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
  }, []);

  const cycleEdgeKind = useCallback(
    (edgeId: string) => {
      setEdges((prev) =>
        prev.map((e) => {
          if (e.id !== edgeId) return e;
          if (e.locked) return e;
          const idx = KIND_CYCLE.indexOf(e.kind);
          const nextKind = KIND_CYCLE[(idx + 1) % KIND_CYCLE.length];
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
    const input = prompt("Editar precio del CCU (USD):", target.price.toFixed(2));
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

  // ── CCU Creator (Right Panel) — FIXED ─────────────────────────────────────

  const createCcu = useCallback(
    (from: CatalogShip, to: CatalogShip, isWarbond: boolean, manualPrice: number | null) => {
      const kind: UpgradeKind = isWarbond ? "warbond" : "normal";
      const price = manualPrice ?? defaultPriceFor(kind, from.msrpUsd, to.msrpUsd);
      // Buscar nodos existentes en estado actual
      const existingFromIdx = nodes.findIndex((n) => n.ship.id === from.id);
      const existingToIdx = nodes.findIndex((n) => n.ship.id === to.id);
      const fromId = existingFromIdx !== -1 ? nodes[existingFromIdx].id : newId("n");
      const toId = existingToIdx !== -1 ? nodes[existingToIdx].id : newId("n");

      // Posiciones: si la nave ya existe, mantener; sino colocar en grid libre
      const baseY = 100 + (nodes.length * 30) % 400;
      const fromPos = existingFromIdx !== -1 ? nodes[existingFromIdx].position : { x: 100, y: baseY };
      const toPos = existingToIdx !== -1 ? nodes[existingToIdx].position : { x: fromPos.x + 240, y: baseY };

      setNodes((prev) => {
        const next = prev.slice();
        if (!next.find((n) => n.id === fromId)) {
          next.push({ id: fromId, ship: from, position: fromPos });
        }
        if (!next.find((n) => n.id === toId)) {
          next.push({ id: toId, ship: to, position: toPos });
        }
        return next;
      });
      setEdges((prev) => {
        const exists = prev.some((e) => e.source === fromId && e.target === toId);
        if (exists) return prev;
        return [
          ...prev,
          {
            id: newId("e"),
            source: fromId,
            target: toId,
            kind,
            price,
            priceManual: manualPrice !== null,
          },
        ];
      });
      setStatusMsg({ kind: "ok", text: `CCU agregado: ${from.name} → ${to.name} ($${price.toFixed(2)})` });
    },
    [nodes],
  );

  // ── Auto-build (solver) ──────────────────────────────────────────────────

  type AutoMode = "now" | "save" | "credits";
  const [autoBusy, setAutoBusy] = useState(false);

  const autoBuild = useCallback(
    async (fromShip: CatalogShip, toShip: CatalogShip, mode: AutoMode) => {
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

        type Step = {
          fromShip: { id: string; name: string; manufacturer: string | null; msrpUsd: number; warbondUsd: number | null; reference: string };
          toShip: { id: string; name: string; manufacturer: string | null; msrpUsd: number; warbondUsd: number | null; reference: string };
          isWarbond?: boolean;
          isOwned?: boolean;
          ccuPrice?: number;
        };
        const steps = data.chain.steps as Step[];
        const newNodes: BoardNode[] = [];
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
            position: { x: 80 + idx * 240, y: 100 },
          };
          newNodes.push(node);
          return node;
        };
        const newEdges: BoardEdge[] = [];
        for (let i = 0; i < steps.length; i++) {
          const s = steps[i];
          const fromN = ensureNode(s.fromShip, i);
          const toN = ensureNode(s.toShip, i + 1);
          const kind: UpgradeKind = s.isOwned ? "hanger" : s.isWarbond ? "warbond" : "normal";
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

  const saveAsNamed = useCallback(() => {
    if (nodes.length === 0) {
      setStatusMsg({ kind: "err", text: "Pizarra vacía — no hay nada para guardar." });
      return;
    }
    const name = prompt("Nombre de la cadena:", `Cadena ${new Date().toLocaleDateString()}`);
    if (!name || !name.trim()) return;
    const snap: BoardSnapshot = { version: 2, nodes, edges, savedAt: new Date().toISOString() };
    const entry: NamedSave = {
      id: newId("save"),
      name: name.trim(),
      savedAt: snap.savedAt,
      snapshot: snap,
    };
    persistSaves([entry, ...savedChains]);
    setStatusMsg({ kind: "ok", text: `Cadena "${entry.name}" guardada.` });
  }, [nodes, edges, savedChains, persistSaves]);

  const loadNamed = useCallback(
    (id: string) => {
      const entry = savedChains.find((s) => s.id === id);
      if (!entry) return;
      if (nodes.length > 0 && !confirm(`¿Cargar "${entry.name}"? Se reemplaza la pizarra actual.`)) return;
      setNodes(entry.snapshot.nodes);
      setEdges(entry.snapshot.edges);
      setSelectedNodeId(null);
      setStatusMsg({ kind: "ok", text: `Cadena "${entry.name}" cargada.` });
    },
    [savedChains, nodes.length],
  );

  const deleteNamed = useCallback(
    (id: string) => {
      const entry = savedChains.find((s) => s.id === id);
      if (!entry) return;
      if (!confirm(`¿Borrar la cadena "${entry.name}" guardada? No se puede deshacer.`)) return;
      persistSaves(savedChains.filter((s) => s.id !== id));
      setStatusMsg({ kind: "ok", text: `Cadena "${entry.name}" borrada.` });
    },
    [savedChains, persistSaves],
  );

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

  // Costo acumulado por nodo: walk back de edges hasta la base
  const accumulatedCostByNodeId = useMemo<Map<string, number>>(() => {
    const map = new Map<string, number>();
    const incomingByTarget = new Map<string, BoardEdge>();
    for (const e of edges) incomingByTarget.set(e.target, e);
    const compute = (nodeId: string, visiting: Set<string>): number => {
      if (map.has(nodeId)) return map.get(nodeId)!;
      if (visiting.has(nodeId)) return 0;
      visiting.add(nodeId);
      const incoming = incomingByTarget.get(nodeId);
      if (!incoming) {
        map.set(nodeId, 0);
        return 0;
      }
      const upstream = compute(incoming.source, visiting);
      const total = upstream + (incoming.price ?? 0);
      map.set(nodeId, total);
      return total;
    };
    for (const n of nodes) compute(n.id, new Set());
    return map;
  }, [nodes, edges]);

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

  // Para la info bar global: el "leaf" node (mayor MSRP, sin outgoing edge) y su costo total
  const globalChainStats = useMemo(() => {
    if (nodes.length === 0) return null;
    // Encontrar nodos que NO son source de ninguna edge (= leafs / targets finales)
    const sourceIds = new Set(edges.map((e) => e.source));
    const leafs = nodes.filter((n) => !sourceIds.has(n.id));
    if (leafs.length === 0) return null;
    // Tomar el leaf con mayor accumulatedCost
    let bestLeaf: BoardNode | null = null;
    let bestCost = 0;
    for (const leaf of leafs) {
      const cost = accumulatedCostByNodeId.get(leaf.id) ?? 0;
      if (cost > bestCost || bestLeaf === null) {
        bestCost = cost;
        bestLeaf = leaf;
      }
    }
    if (!bestLeaf) return null;
    return {
      finalShip: bestLeaf.ship,
      totalCost: bestCost,
      msrp: bestLeaf.ship.msrpUsd,
      savings: bestLeaf.ship.msrpUsd - bestCost,
    };
  }, [nodes, edges, accumulatedCostByNodeId]);

  const totalCostSelected = useMemo(
    () => upstreamChain.reduce((acc, s) => acc + s.edge.price, 0),
    [upstreamChain],
  );

  // ─────────────────────────────────────────────────────────────────────────
  return (
    // Bounded a la altura del viewport (menos header + paddings de la page)
    // para que NO empuje la página entera hacia abajo. El usuario ve todo
    // en una sola pantalla, sin scroll vertical infinito.
    <div className="space-y-3 flex flex-col h-[calc(100vh-7rem)] min-h-[600px] max-h-[1100px]">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold text-zinc-100 tracking-wide flex items-center gap-2">
            <span className="text-2xl">🛠️</span>
            Ship Upgrade Planner
            <span className="text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-sm bg-amber-500/15 text-amber-300 border border-amber-500/30">
              v2.2
            </span>
          </h1>
          <p className="text-[11px] text-zinc-500">
            La <span className="text-cyan-400">flecha</span> entre dos naves <span className="text-cyan-400">es</span> el CCU.
          </p>
        </div>
        <Link
          href="/hangar?tab=ccu-chains"
          className="text-[10px] px-2.5 py-1.5 bg-zinc-900/60 border border-zinc-700/60 rounded-sm text-zinc-400 hover:text-cyan-300 hover:border-cyan-500/40 transition-colors"
        >
          ← Calculator clásico
        </Link>
      </div>

      {/* Info bar global (cadena entera) */}
      {globalChainStats && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 bg-zinc-950/60 border border-zinc-800/60 rounded-sm">
          <div className="flex items-center gap-3 flex-wrap text-[11px]">
            <span className="text-zinc-500 font-mono uppercase tracking-widest text-[9px]">
              Cadena al destino:
            </span>
            <span className="text-zinc-200 font-medium">{globalChainStats.finalShip.name}</span>
            <span className="text-zinc-700">·</span>
            <span className="text-zinc-500">
              {nodes.length} naves · {edges.length} CCUs
            </span>
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <div>
              <span className="text-zinc-500 font-mono uppercase tracking-widest text-[9px] mr-1">
                Tienda
              </span>
              <span className="text-zinc-300 font-mono font-bold">${globalChainStats.msrp.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-cyan-500 font-mono uppercase tracking-widest text-[9px] mr-1">
                Tu costo
              </span>
              <span className="text-cyan-300 font-mono font-bold">${globalChainStats.totalCost.toFixed(2)}</span>
            </div>
            <div>
              <span
                className={`font-mono uppercase tracking-widest text-[9px] mr-1 ${
                  globalChainStats.savings > 0 ? "text-emerald-500" : globalChainStats.savings < 0 ? "text-rose-500" : "text-zinc-500"
                }`}
              >
                {globalChainStats.savings > 0 ? "Ahorrás" : globalChainStats.savings < 0 ? "De más" : "Igual"}
              </span>
              <span
                className={`font-mono font-bold ${
                  globalChainStats.savings > 0 ? "text-emerald-300" : globalChainStats.savings < 0 ? "text-rose-300" : "text-zinc-400"
                }`}
              >
                {globalChainStats.savings > 0 ? "−" : globalChainStats.savings < 0 ? "+" : ""}$
                {Math.abs(globalChainStats.savings).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}

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

      {/* Grid 4-col — flex-1 + min-h-0 + overflow-hidden permiten que las
          columnas se ajusten a la altura disponible sin desbordar la página. */}
      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[210px_220px_1fr_300px] gap-3 overflow-hidden">
        <section className="min-h-0 hidden md:block overflow-hidden">
          <ChainBoardInventoryColumn usedShipIds={usedShipIds} />
        </section>

        <section className="min-h-0 hidden md:block overflow-hidden">
          <ChainBoardStoreColumn usedShipIds={usedShipIds} />
        </section>

        <section className="min-h-[400px] overflow-hidden">
          <ChainBoardCanvasFlow
            nodes={nodes}
            edges={edges}
            selectedNodeId={selectedNodeId}
            accumulatedCostByNodeId={accumulatedCostByNodeId}
            onMoveNode={moveNode}
            onSelectNode={setSelectedNodeId}
            onDeleteNode={deleteNode}
            onEditPath={editPathOnNode}
            onConnect={connectNodes}
            onCycleEdgeKind={cycleEdgeKind}
            onEditEdgePrice={editEdgePrice}
            onDeleteEdge={deleteEdge}
            onAddShipAt={addShipAt}
            onAddHangarCcuAt={addHangarCcuAt}
          />
        </section>

        <section className="min-h-0 hidden md:block overflow-hidden">
          <RightPanel
            mode={rightPanelMode}
            setMode={setRightPanelMode}
            selectedNode={selectedNode}
            upstreamChain={upstreamChain}
            totalCost={totalCostSelected}
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
      <div className="flex items-center justify-center gap-2 py-2 border-t border-zinc-800/40 flex-wrap">
        <ToolbarButton onClick={clearBoard} icon="🗑" label="Nueva" tone="rose" />
        <ToolbarButton onClick={saveAsNamed} icon="💾" label="Guardar cadena" tone="emerald" />
        <LoadChainDropdown
          saves={savedChains}
          onLoad={loadNamed}
          onDelete={deleteNamed}
        />
        <ToolbarButton onClick={exportBoard} icon="↓" label="Export JSON" tone="cyan" />
        <ToolbarButton onClick={importBoard} icon="↑" label="Import JSON" tone="amber" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RightPanel
// ─────────────────────────────────────────────────────────────────────────────

const KIND_LABEL: Record<UpgradeKind, { label: string; cls: string }> = {
  normal: { label: "Normal", cls: "bg-blue-500/15 text-blue-300 border-blue-500/40" },
  warbond: { label: "Warbond", cls: "bg-rose-500/15 text-rose-300 border-rose-500/40" },
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
  mode, setMode, selectedNode, upstreamChain, totalCost, onSelectNode, onClose,
  catalog, onCreateCcu, autoBusy, onAutoBuild,
}: RightPanelProps) {
  return (
    <div className="h-full flex flex-col bg-zinc-900/40 border border-zinc-800/60 rounded-md overflow-hidden">
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
        {mode === "auto" && <AutoModeUI catalog={catalog} busy={autoBusy} onAutoBuild={onAutoBuild} />}
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

function DetailMode({
  selectedNode, upstreamChain, totalCost, onSelectNode, onClose,
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
          Click en una nave del canvas para ver su detalle.
        </p>
      </div>
    );
  }
  const { ship } = selectedNode;
  const savings = ship.msrpUsd - totalCost;
  const hasChain = upstreamChain.length > 0;

  return (
    <div>
      <div className="px-3 pt-3 pb-2 flex items-start justify-between gap-2 border-b border-zinc-800/50">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-zinc-100 truncate">{ship.name}</h3>
          <p className="text-[10px] text-zinc-500 italic truncate">
            {ship.manufacturer ?? "—"}{ship.role ? ` · ${ship.role}` : ""}
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
      <div className="px-3 py-3 border-b border-zinc-800/40 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Tienda (MSRP)</span>
          <span className="text-[14px] font-mono font-bold text-zinc-200">${ship.msrpUsd.toFixed(2)}</span>
        </div>
        {hasChain && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-500">Tu costo (cadena)</span>
              <span className="text-[14px] font-mono font-bold text-cyan-300">${totalCost.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-zinc-800/40">
              <span
                className={`text-[10px] font-mono uppercase tracking-widest ${
                  savings > 0 ? "text-emerald-500" : savings < 0 ? "text-rose-500" : "text-zinc-500"
                }`}
              >
                {savings > 0 ? "Ahorro" : savings < 0 ? "Sobreprecio" : "Igual"}
              </span>
              <span
                className={`text-[14px] font-mono font-bold ${
                  savings > 0 ? "text-emerald-300" : savings < 0 ? "text-rose-300" : "text-zinc-400"
                }`}
              >
                {savings > 0 ? "−" : savings < 0 ? "+" : ""}${Math.abs(savings).toFixed(2)}
              </span>
            </div>
          </>
        )}
      </div>

      <div className="px-3 py-3">
        <h4 className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 mb-2">
          Pasos hacia esta nave ({upstreamChain.length})
        </h4>
        {!hasChain && (
          <p className="text-[10px] text-zinc-600 italic">Sin upgrade entrante en el canvas.</p>
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
                    {s.edge.locked ? "🔒 " : ""}{ks.label}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-300">${s.edge.price.toFixed(2)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CreatorMode({
  catalog, onCreateCcu,
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
          Elegí FROM y TO. El precio se calcula auto, o ponelo manual si tenés un precio diferente.
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

function AutoModeUI({
  catalog, busy, onAutoBuild,
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
          <br />
          <span className="text-amber-400/80">Reemplaza el contenido actual del canvas.</span>
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
  mode, value, onClick, title, desc,
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
        active ? "bg-emerald-500/15 border-emerald-500/40" : "bg-zinc-950/40 border-zinc-800/40 hover:border-zinc-700"
      }`}
    >
      <p className={`text-[11px] font-semibold ${active ? "text-emerald-300" : "text-zinc-300"}`}>{title}</p>
      <p className="text-[9px] text-zinc-500 leading-snug mt-0.5">{desc}</p>
    </button>
  );
}

function ShipPicker({
  label, value, onChange, catalog, filterFn,
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
    // Sort por precio asc para que sea más fácil escanear visualmente.
    arr = arr.slice().sort((a, b) => a.msrpUsd - b.msrpUsd);
    return arr;
  }, [catalog, search, filterFn]);

  return (
    <div>
      <p className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 mb-1">{label}</p>
      {value ? (
        <div className="bg-zinc-950/60 border border-zinc-800/60 rounded-sm p-1.5 flex items-center gap-2">
          {value.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value.imageUrl} alt="" className="w-10 h-7 object-cover rounded-sm shrink-0" draggable={false}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.2"; }} />
          ) : (
            <div className="w-10 h-7 rounded-sm bg-zinc-800/60 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-zinc-100 truncate">{value.name}</p>
            <p className="text-[9px] text-zinc-500 font-mono">${value.msrpUsd.toFixed(2)}</p>
          </div>
          <button onClick={() => onChange(null)} className="text-zinc-500 hover:text-rose-300 text-[12px] px-1 shrink-0" title="Cambiar">✕</button>
        </div>
      ) : (
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="Buscar nave..."
            className="w-full px-2 py-1.5 bg-zinc-950 border border-zinc-800/60 rounded-sm text-[11px] text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
          />
          {open && filtered.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 max-h-[420px] overflow-y-auto bg-zinc-950 border border-zinc-800 rounded-sm shadow-xl z-30 p-0.5 space-y-0.5">
              {filtered.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { onChange(s); setOpen(false); setSearch(""); }}
                  className="w-full flex items-center gap-2 px-1.5 py-1 rounded-sm text-[11px] hover:bg-zinc-800/60"
                >
                  {s.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.imageUrl} alt="" className="w-7 h-5 object-cover rounded-sm shrink-0" draggable={false}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.2"; }} />
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

const TONE: Record<string, string> = {
  rose: "border-rose-500/40 text-rose-300 hover:bg-rose-500/15",
  emerald: "border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/15",
  cyan: "border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/15",
  amber: "border-amber-500/40 text-amber-300 hover:bg-amber-500/15",
};

function ToolbarButton({
  onClick, icon, label, tone,
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

// ─── LoadChainDropdown ──────────────────────────────────────────────────────
// Dropdown para cargar/borrar cadenas guardadas con nombre.

function LoadChainDropdown({
  saves, onLoad, onDelete,
}: {
  saves: NamedSave[];
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Cerrar al click fuera
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const disabled = saves.length === 0;
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => !disabled && setOpen((p) => !p)}
        disabled={disabled}
        className={`text-[11px] font-mono uppercase tracking-wider px-3 py-1.5 rounded-sm border bg-zinc-950/40 transition-colors flex items-center gap-1.5 ${
          disabled
            ? "border-zinc-800/40 text-zinc-700 cursor-not-allowed"
            : "border-violet-500/40 text-violet-300 hover:bg-violet-500/15"
        }`}
        title={disabled ? "No hay cadenas guardadas" : `${saves.length} cadenas guardadas`}
      >
        <span>📂</span>
        Cargar cadena
        {saves.length > 0 && <span className="text-[9px] opacity-70">({saves.length})</span>}
      </button>
      {open && saves.length > 0 && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-[320px] max-h-[360px] overflow-y-auto bg-zinc-950 border border-zinc-800 rounded-sm shadow-xl z-30 p-1">
          {saves.map((s) => {
            const stats = `${s.snapshot.nodes.length} naves · ${s.snapshot.edges.length} CCUs`;
            const date = new Date(s.savedAt).toLocaleString();
            return (
              <div
                key={s.id}
                className="flex items-center gap-1 px-1.5 py-1 rounded-sm hover:bg-zinc-800/60 group"
              >
                <button
                  onClick={() => {
                    onLoad(s.id);
                    setOpen(false);
                  }}
                  className="flex-1 min-w-0 text-left"
                  title={`Cargar "${s.name}"`}
                >
                  <p className="text-[11px] text-zinc-200 truncate font-medium">{s.name}</p>
                  <p className="text-[9px] text-zinc-500 font-mono">
                    {stats} · {date}
                  </p>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(s.id);
                  }}
                  className="opacity-50 hover:opacity-100 text-zinc-500 hover:text-rose-300 text-[12px] px-1.5 transition-opacity shrink-0"
                  title="Borrar esta cadena guardada"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
