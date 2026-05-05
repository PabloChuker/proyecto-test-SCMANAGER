"use client";

// =============================================================================
// SC LABS — Canvas (Chain Board v2.1, 2026-05-05)
//
// Canvas free-form basado en @xyflow/react.
// Drops aceptados:
//   · application/x-sclabs-ship       → 1 ship
//   · application/x-sclabs-hangar-ccu → 2 ships + edge LOCKED entre ellas
// Edges:
//   · normal/warbond/hanger con badge colored (Normal/WB/Hanger +$X)
//   · si locked=true → candado, no cicla, kind/from/to inmutables
//   · si invalid=true → línea roja sólida sin badge
//   · click en badge (no-locked) cicla kind; doble click abre editor de precio
// =============================================================================

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type ReactFlowInstance,
  type NodeTypes,
  type EdgeTypes,
  type EdgeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  HANGAR_CCU_MIME,
  SHIP_MIME,
  type BoardEdge,
  type BoardNode,
  type CatalogShip,
  type HangarCcuPayload,
  type UpgradeKind,
} from "./types";
import { ShipNode, type ShipNodeData } from "./ShipNode";

// ── UpgradeEdge inline ───────────────────────────────────────────────────────

type UpgradeEdgeData = {
  kind: UpgradeKind;
  price: number;
  locked?: boolean;
  invalid?: boolean;
  priceManual?: boolean;
  onCycleKind?: (edgeId: string) => void;
  onEditPrice?: (edgeId: string) => void;
} & Record<string, unknown>;

const STYLE_BY_KIND: Record<UpgradeKind, { bg: string; text: string; label: string; stroke: string }> = {
  normal: { bg: "bg-blue-500", text: "text-white", label: "Normal", stroke: "#3b82f6" },
  warbond: { bg: "bg-rose-600", text: "text-white", label: "WB", stroke: "#e11d48" },
  hanger: { bg: "bg-cyan-500", text: "text-zinc-900", label: "Hanger", stroke: "#06b6d4" },
};

function UpgradeEdgeImpl({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected,
}: EdgeProps) {
  const d = (data ?? { kind: "normal" as UpgradeKind, price: 0 }) as unknown as UpgradeEdgeData;
  const style = STYLE_BY_KIND[d.kind] ?? STYLE_BY_KIND.normal;
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
  });

  // Si la edge es invalid, override: línea sólida roja, badge "?".
  const strokeColor = d.invalid ? "#ef4444" : style.stroke;
  const dash = d.invalid ? undefined : "4 4";
  const widthBase = d.invalid ? 2 : 1.75;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: strokeColor,
          strokeWidth: selected ? widthBase + 0.75 : widthBase,
          strokeDasharray: dash,
          opacity: selected ? 1 : 0.85,
        }}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan absolute pointer-events-auto"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          {d.invalid ? (
            <div
              className="bg-rose-600 text-white text-[10px] font-semibold px-2 py-0.5 rounded-sm shadow-md whitespace-nowrap"
              title="No hay CCU directo entre estas naves. Agregá una intermedia."
            >
              ⚠ Sin CCU
            </div>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (d.locked) return;
                d.onCycleKind?.(id);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (d.locked) return;
                d.onEditPrice?.(id);
              }}
              className={`${style.bg} ${style.text} text-[10px] font-semibold px-2 py-0.5 rounded-sm shadow-md whitespace-nowrap flex items-center gap-1 ${
                d.locked ? "cursor-default" : "hover:scale-105 transition-transform cursor-pointer"
              }`}
              title={
                d.locked
                  ? "CCU del hangar — bloque inmutable. No se puede cambiar el tipo ni el precio."
                  : `Click: cambiar tipo. Doble click: editar precio${d.priceManual ? " (manual)" : ""}.`
              }
            >
              {d.locked && <span>🔒</span>}
              <span>{style.label} +${d.price.toFixed(2)}</span>
              {d.priceManual && !d.locked && <span className="text-[8px] opacity-80">✎</span>}
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
const UpgradeEdge = memo(UpgradeEdgeImpl);

// ── Constantes xyflow ────────────────────────────────────────────────────────
const NODE_TYPES: NodeTypes = { ship: ShipNode };
const EDGE_TYPES: EdgeTypes = { upgrade: UpgradeEdge };

// ── Props ────────────────────────────────────────────────────────────────────

interface ChainBoardCanvasFlowProps {
  nodes: BoardNode[];
  edges: BoardEdge[];
  selectedNodeId: string | null;
  onMoveNode: (nodeId: string, position: { x: number; y: number }) => void;
  onSelectNode: (nodeId: string | null) => void;
  onDeleteNode: (nodeId: string) => void;
  onEditPath: (nodeId: string) => void;
  onConnect: (sourceId: string, targetId: string) => void;
  onCycleEdgeKind: (edgeId: string) => void;
  onEditEdgePrice: (edgeId: string) => void;
  onAddShipAt: (ship: CatalogShip, position: { x: number; y: number }) => void;
  onAddHangarCcuAt: (payload: HangarCcuPayload, position: { x: number; y: number }) => void;
}

function CanvasInner({
  nodes,
  edges,
  selectedNodeId,
  onMoveNode,
  onSelectNode,
  onDeleteNode,
  onEditPath,
  onConnect,
  onCycleEdgeKind,
  onEditEdgePrice,
  onAddShipAt,
  onAddHangarCcuAt,
}: ChainBoardCanvasFlowProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(null);

  const incomingByTarget = useMemo(() => {
    const set = new Set<string>();
    for (const e of edges) set.add(e.target);
    return set;
  }, [edges]);

  const rfNodes: Node[] = useMemo(() => {
    return nodes.map((n) => ({
      id: n.id,
      type: "ship",
      position: n.position,
      data: {
        ship: n.ship,
        selected: n.id === selectedNodeId,
        hasIncoming: incomingByTarget.has(n.id),
        onSelect: onSelectNode,
        onDelete: onDeleteNode,
        onEditPath,
      } satisfies ShipNodeData,
      draggable: true,
    }));
  }, [nodes, selectedNodeId, incomingByTarget, onSelectNode, onDeleteNode, onEditPath]);

  const rfEdges: Edge[] = useMemo(() => {
    return edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: "out",
      targetHandle: "in",
      type: "upgrade",
      data: {
        kind: e.kind,
        price: e.price,
        locked: e.locked,
        invalid: e.invalid,
        priceManual: e.priceManual,
        onCycleKind: onCycleEdgeKind,
        onEditPrice: onEditEdgePrice,
      } satisfies UpgradeEdgeData,
    }));
  }, [edges, onCycleEdgeKind, onEditEdgePrice]);

  const [localNodes, setLocalNodes] = useState(rfNodes);
  const [localEdges, setLocalEdges] = useState(rfEdges);
  useEffect(() => setLocalNodes(rfNodes), [rfNodes]);
  useEffect(() => setLocalEdges(rfEdges), [rfEdges]);

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setLocalNodes((nds) => applyNodeChanges(changes, nds));
      for (const ch of changes) {
        if (ch.type === "position" && ch.position && !ch.dragging) {
          onMoveNode(ch.id, ch.position);
        }
      }
    },
    [onMoveNode],
  );

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    setLocalEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  const handleConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target || params.source === params.target) return;
      onConnect(params.source, params.target);
    },
    [onConnect],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(SHIP_MIME) || e.dataTransfer.types.includes(HANGAR_CCU_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      const types = e.dataTransfer.types;
      const isShip = types.includes(SHIP_MIME);
      const isCcu = types.includes(HANGAR_CCU_MIME);
      if (!isShip && !isCcu) return;
      e.preventDefault();
      if (!flowInstance) return;
      const position = flowInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      try {
        if (isCcu) {
          const raw = e.dataTransfer.getData(HANGAR_CCU_MIME);
          if (!raw) return;
          const payload = JSON.parse(raw) as HangarCcuPayload;
          onAddHangarCcuAt(payload, position);
          return;
        }
        const raw = e.dataTransfer.getData(SHIP_MIME);
        if (!raw) return;
        const ship = JSON.parse(raw) as CatalogShip;
        onAddShipAt(ship, position);
      } catch {
        // payload corrupto
      }
    },
    [flowInstance, onAddShipAt, onAddHangarCcuAt],
  );

  const handlePaneClick = useCallback(() => {
    onSelectNode(null);
  }, [onSelectNode]);

  return (
    <div
      ref={wrapperRef}
      className="w-full h-full min-h-[600px] bg-zinc-950 rounded-md border border-zinc-800/60 overflow-hidden relative"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="text-center text-zinc-600 text-sm font-mono px-6">
            <p className="mb-1 text-zinc-500">Pizarra vacía</p>
            <p className="text-[11px] leading-relaxed">
              Arrastrá una nave desde <span className="text-amber-400">Available Ships</span> o un CCU desde{" "}
              <span className="text-cyan-400">My Hangar</span>.
              <br />
              Conectá naves arrastrando entre los puntos laterales.
            </p>
          </div>
        </div>
      )}
      <ReactFlow
        nodes={localNodes}
        edges={localEdges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onPaneClick={handlePaneClick}
        onInit={setFlowInstance}
        snapToGrid
        snapGrid={[8, 8]}
        fitView={false}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: "upgrade" }}
        className="!bg-transparent"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="#27272a" />
        <Controls
          className="!bg-zinc-900/90 !border-zinc-800/60 !rounded-sm [&_button]:!bg-zinc-800/60 [&_button]:!border-zinc-700/60 [&_button]:!text-zinc-300 [&_button:hover]:!bg-zinc-700/60"
          position="bottom-right"
          showInteractive={false}
        />
        <MiniMap
          className="!bg-zinc-900/90 !border !border-zinc-800/60"
          nodeColor={(n) => (n.id === selectedNodeId ? "#22d3ee" : "#3f3f46")}
          maskColor="rgba(9, 9, 11, 0.85)"
          position="bottom-left"
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  );
}

export function ChainBoardCanvasFlow(props: ChainBoardCanvasFlowProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
