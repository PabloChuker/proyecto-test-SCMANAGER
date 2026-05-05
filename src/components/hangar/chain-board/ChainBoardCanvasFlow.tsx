"use client";

// =============================================================================
// SC LABS — Canvas (Chain Board v2, 2026-05-05)
//
// Canvas free-form basado en @xyflow/react. Replica el "Ship Upgrade Planner"
// del mockup: naves arrastradas desde columnas → drop en posición libre →
// conectar con drag de handle a handle. Edges con badge colored (Normal /
// WB / Hanger).
//
// Drops aceptados:
//   · application/x-sclabs-ship       → 1 ship en la posición del cursor
//   · application/x-sclabs-hangar-ccu → 2 ships contiguas + edge entre ellas
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

// ── UpgradeEdge (inline) ─────────────────────────────────────────────────────
// Custom edge con badge colored al estilo del mockup.

type UpgradeEdgeData = {
  kind: UpgradeKind;
  price: number;
  onCycleKind?: (edgeId: string) => void;
} & Record<string, unknown>;

const STYLE_BY_KIND: Record<UpgradeKind, { bg: string; text: string; label: string; stroke: string }> = {
  normal: { bg: "bg-blue-500", text: "text-white", label: "Normal", stroke: "#3b82f6" },
  warbond: { bg: "bg-rose-600", text: "text-white", label: "WB", stroke: "#e11d48" },
  hanger: { bg: "bg-cyan-500", text: "text-zinc-900", label: "Hanger", stroke: "#06b6d4" },
};

function UpgradeEdgeImpl({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps) {
  const d = (data ?? { kind: "normal" as UpgradeKind, price: 0 }) as unknown as UpgradeEdgeData;
  const style = STYLE_BY_KIND[d.kind] ?? STYLE_BY_KIND.normal;
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
  });
  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: style.stroke,
          strokeWidth: selected ? 2.5 : 1.75,
          strokeDasharray: "4 4",
          opacity: selected ? 1 : 0.85,
        }}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan absolute pointer-events-auto"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              d.onCycleKind?.(id);
            }}
            className={`${style.bg} ${style.text} text-[10px] font-semibold px-2 py-0.5 rounded-sm shadow-md hover:scale-105 transition-transform whitespace-nowrap`}
            title="Click para cambiar tipo de upgrade (Normal → WB → Hanger)"
          >
            {style.label} +${d.price.toFixed(2)}
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
const UpgradeEdge = memo(UpgradeEdgeImpl);

// ── Constantes para xyflow (declaradas fuera del componente) ────────────────
const NODE_TYPES: NodeTypes = { ship: ShipNode };
const EDGE_TYPES: EdgeTypes = { upgrade: UpgradeEdge };

// ── Props del Canvas ─────────────────────────────────────────────────────────

interface ChainBoardCanvasFlowProps {
  nodes: BoardNode[];
  edges: BoardEdge[];
  selectedNodeId: string | null;
  /** Callbacks que el workspace inyecta para mutar el estado. */
  onMoveNode: (nodeId: string, position: { x: number; y: number }) => void;
  onSelectNode: (nodeId: string | null) => void;
  onDeleteNode: (nodeId: string) => void;
  onEditPath: (nodeId: string) => void;
  onConnect: (sourceId: string, targetId: string) => void;
  onCycleEdgeKind: (edgeId: string) => void;
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
  onAddShipAt,
  onAddHangarCcuAt,
}: ChainBoardCanvasFlowProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(null);

  // ── Mapear BoardNode[] → Node<ShipNodeData>[] ─────────────────────────────
  // Inyectamos los callbacks al data del nodo para que ShipNode los pueda
  // llamar (ya que xyflow no expone un mecanismo de contexto directo).
  const incomingByTarget = useMemo(() => {
    const set = new Set<string>();
    for (const e of edges) set.add(e.target);
    return set;
  }, [edges]);

  const rfNodes: Node<ShipNodeData>[] = useMemo(() => {
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
      },
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
      data: { kind: e.kind, price: e.price, onCycleKind: onCycleEdgeKind } satisfies UpgradeEdgeData,
    }));
  }, [edges, onCycleEdgeKind]);

  // ── Estado interno para drags fluidos ─────────────────────────────────────
  // ReactFlow necesita estado local que se reseta cuando vienen props nuevas.
  const [localNodes, setLocalNodes] = useState(rfNodes);
  const [localEdges, setLocalEdges] = useState(rfEdges);
  useEffect(() => setLocalNodes(rfNodes), [rfNodes]);
  useEffect(() => setLocalEdges(rfEdges), [rfEdges]);

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setLocalNodes((nds) => applyNodeChanges(changes, nds) as Node<ShipNodeData>[]);
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

  // ── Drop handlers ─────────────────────────────────────────────────────────

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
        // payload corrupto — silencio
      }
    },
    [flowInstance, onAddShipAt, onAddHangarCcuAt],
  );

  // Click en el fondo del canvas → deseleccionar.
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
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1.2}
          color="#27272a"
        />
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
