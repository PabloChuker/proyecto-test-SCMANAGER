"use client";

// =============================================================================
// SC LABS — ChainBoardCanvasFlow (CB.10, Fase 1)
//
// REEMPLAZO del ChainBoardCanvas.tsx anterior. Canvas free-form basado en
// @xyflow/react donde el user arma cadenas CCU como un grafo visual:
//   · Cada nave = nodo (ShipNode con foto/precio/role)
//   · Cada CCU upgrade = edge entre dos nodos
//   · Posiciones libres (drag), se persisten
//   · Multi-cadena en el mismo canvas
//   · Drop desde InventoryColumn / StoreColumn agrega un nodo nuevo
//
// Esta es Fase 1 (CB.10): canvas + drop + drag. Las edges con metadata
// (Normal/WB/Hanger + price) llegan en Fase 2. Right panel en Fase 3.
// Persistencia en Fase 4. Auto-suggest del solver en Fase 5.
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type ReactFlowInstance,
  type NodeTypes,
} from "@xyflow/react";
// Importar los estilos base — sin esto, los handles/edges no se ven.
// Los CSS de xyflow se sobreescriben con Tailwind donde haga falta.
import "@xyflow/react/dist/style.css";
import type { BoardCard } from "./types";
import { ShipNode, type ShipNodeData } from "./ShipNode";

// ── Tipos de node types — declarado fuera del componente para que ReactFlow
// no recree el objeto en cada render (warning recurrente del lib).
const NODE_TYPES: NodeTypes = {
  ship: ShipNode,
};

// CB.10 Fase 2 (placeholder): el MIME del drop desde InventoryColumn /
// StoreColumn. La columna setea `application/x-sc-ship-card` con el
// JSON del ship; el canvas lo recibe en onDrop y crea un node nuevo.
const SHIP_CARD_MIME = "application/x-sc-ship-card";

interface ChainBoardCanvasFlowProps {
  cards: BoardCard[];
  /** Llamado cuando una card cambia de posición (drag). Permite persistir. */
  onMove?: (cardId: string, position: { x: number; y: number }) => void;
  /** Borrar una card del canvas. */
  onRemove: (cardId: string) => void;
  /** Crear edge entre dos cards (drag de handle a handle). Fase 2 lo usará
   *  para validar contra ccu_prices y colorear. */
  onConnect?: (sourceCardId: string, targetCardId: string) => void;
  /** Drop de una nave desde el inventory/store. Recibe la posición en el
   *  viewport (ya convertida con flowInstance.screenToFlowPosition). */
  onAddCardAt?: (
    ship: Omit<BoardCard, "cardId" | "position">,
    position: { x: number; y: number },
  ) => void;
  /** Roles calculados por el board (base/intermediate/target) — opcional.
   *  Si no se pasa, todos quedan como "intermediate". */
  roleByCardId?: Map<string, "base" | "intermediate" | "target">;
}

function ChainBoardCanvasFlowInner({
  cards,
  onMove,
  onRemove,
  onConnect,
  onAddCardAt,
  roleByCardId,
}: ChainBoardCanvasFlowProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(null);

  // ── Convertir cards[] → Node[] para ReactFlow ─────────────────────────────
  //
  // Si la card tiene `position` la usamos. Sino la auto-layouteamos en una
  // grilla simple (col=cardIdx*240, row=0). Fase 5 mejora esto con dagre.
  const nodes: Node<ShipNodeData>[] = useMemo(() => {
    return cards.map((card, i) => {
      const role = roleByCardId?.get(card.cardId) ?? "intermediate";
      const data: ShipNodeData = { ...card, role, onRemove };
      const position = card.position ?? { x: 100 + i * 240, y: 100 };
      return {
        id: card.cardId,
        type: "ship",
        position,
        data,
        // Permitimos drag libre (default).
        draggable: true,
      };
    });
  }, [cards, roleByCardId, onRemove]);

  // ── Edges — Fase 1 las hace lineales por orden ────────────────────────────
  // Conectamos cards[i] → cards[i+1] como una cadena simple. Fase 2 hace
  // edges custom con metadata Normal/WB/Hanger + validation.
  const initialEdges: Edge[] = useMemo(() => {
    const out: Edge[] = [];
    for (let i = 0; i < cards.length - 1; i++) {
      out.push({
        id: `e-${cards[i].cardId}-${cards[i + 1].cardId}`,
        source: cards[i].cardId,
        target: cards[i + 1].cardId,
        sourceHandle: "out",
        targetHandle: "in",
        animated: false,
        style: { stroke: "#52525b", strokeWidth: 2 },
      });
    }
    return out;
  }, [cards]);

  // Estado interno de ReactFlow: copia de nodes/edges editable mientras el
  // user dragea. Sincroniza con cards[] en `onNodesChange`.
  const [rfNodes, setRfNodes] = useState<Node<ShipNodeData>[]>(nodes);
  const [rfEdges, setRfEdges] = useState<Edge[]>(initialEdges);

  // Re-sincronizar cuando el board externo cambia (cards agregadas/borradas).
  useEffect(() => {
    setRfNodes(nodes);
  }, [nodes]);
  useEffect(() => {
    setRfEdges(initialEdges);
  }, [initialEdges]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setRfNodes((nds) => {
        const next = applyNodeChanges(changes, nds) as Node<ShipNodeData>[];
        // Si hay cambios de posición, propagar al board externo (persistir).
        for (const ch of changes) {
          if (ch.type === "position" && ch.position && !ch.dragging) {
            onMove?.(ch.id, ch.position);
          }
        }
        return next;
      });
    },
    [onMove],
  );

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    setRfEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  const handleConnect = useCallback(
    (params: Connection) => {
      // Drag de handle a handle: crea una edge nueva. Validamos en Fase 2.
      if (!params.source || !params.target) return;
      setRfEdges((eds) => addEdge({ ...params, style: { stroke: "#52525b", strokeWidth: 2 } }, eds));
      onConnect?.(params.source, params.target);
    },
    [onConnect],
  );

  // ── Drop handlers ─────────────────────────────────────────────────────────
  //
  // Cuando InventoryColumn / StoreColumn hacen drag de una ship card, setea
  // dataTransfer con MIME `application/x-sc-ship-card` y body JSON. Acá lo
  // capturamos y agregamos un nodo en la posición del cursor.

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(SHIP_CARD_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(SHIP_CARD_MIME)) return;
      e.preventDefault();
      const raw = e.dataTransfer.getData(SHIP_CARD_MIME);
      if (!raw || !flowInstance || !wrapperRef.current) return;
      try {
        const ship = JSON.parse(raw) as Omit<BoardCard, "cardId" | "position">;
        // Convertir las coordenadas del cursor al sistema de coordenadas del
        // canvas (toma en cuenta zoom/pan).
        const position = flowInstance.screenToFlowPosition({
          x: e.clientX,
          y: e.clientY,
        });
        onAddCardAt?.(ship, position);
      } catch {
        // Silenciar payload corrupto — no rompemos la UI.
      }
    },
    [flowInstance, onAddCardAt],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      ref={wrapperRef}
      className="w-full h-full min-h-[500px] bg-zinc-950/40 rounded-sm border border-zinc-800/60 overflow-hidden"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onInit={setFlowInstance}
        nodeTypes={NODE_TYPES}
        // Snap a grilla de 8px para alineación visual.
        snapToGrid
        snapGrid={[8, 8]}
        // Padding del fit-view inicial para que las cards no queden pegadas
        // al borde.
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
        // Estilo: fondo muy oscuro con grid sutil.
        proOptions={{ hideAttribution: true }}
        // Default values para edges nuevas (drag de handle a handle).
        defaultEdgeOptions={{ animated: false, style: { stroke: "#52525b", strokeWidth: 2 } }}
        className="!bg-transparent"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={16}
          size={1}
          color="#3f3f46"
        />
        <Controls
          className="!bg-zinc-900/80 !border-zinc-800/60 !rounded-sm [&_button]:!bg-zinc-800/60 [&_button]:!border-zinc-700/60 [&_button]:!text-zinc-300 [&_button:hover]:!bg-zinc-700/60"
          position="bottom-right"
          showInteractive={false}
        />
        <MiniMap
          className="!bg-zinc-900/80 !border !border-zinc-800/60"
          nodeColor={(n) => {
            const role = (n.data as ShipNodeData).role;
            if (role === "base") return "#f59e0b";
            if (role === "target") return "#10b981";
            return "#52525b";
          }}
          maskColor="rgba(9, 9, 11, 0.85)"
          position="bottom-left"
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  );
}

/** Wrapper público — wrappea con `ReactFlowProvider` para que múltiples
 *  componentes (ej. botones externos que llaman a flowInstance) puedan
 *  acceder al contexto. */
export function ChainBoardCanvasFlow(props: ChainBoardCanvasFlowProps) {
  return (
    <ReactFlowProvider>
      <ChainBoardCanvasFlowInner {...props} />
    </ReactFlowProvider>
  );
}

export { SHIP_CARD_MIME };
