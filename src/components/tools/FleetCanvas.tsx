"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  X, Plus, ZoomIn, ZoomOut, Search,
  ChevronLeft, ChevronRight, Crosshair, Box,
} from "lucide-react";
import { useHangarStore } from "@/store/useHangarStore";
import { shipGlbCandidates } from "@/lib/shipGlb";

// Single shared 3D viewer — only one WebGL context alive at a time
const ShipViewer3D = dynamic(
  () => import("@/components/shared/flight-dynamics/ShipViewer3D"),
  { ssr: false },
);

// ─── Constants ─────────────────────────────────────────────────────────────────

const NODE_W = 180;
const NODE_H = 90;
const ZOOM_MIN = 0.06;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.12;
const STORAGE_KEY = "sc-labs-fleet-canvas-v1";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface CanvasNode {
  id: string;
  reference: string;
  name: string;
  manufacturer: string;
  imageUrl?: string;
  x: number;
  y: number;
}

interface ApiShip {
  id: number;
  reference: string;
  name: string;
  manufacturer: string;
}

interface ViewState {
  panX: number;
  panY: number;
  zoom: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 11); }
function clampZoom(z: number) { return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z)); }

// ─── Component ─────────────────────────────────────────────────────────────────

export default function FleetCanvas() {
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [view, setView] = useState<ViewState>({ panX: 0, panY: 0, zoom: 1 });
  const viewRef = useRef<ViewState>(view);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<"hangar" | "catalog">("hangar");
  const [searchQuery, setSearchQuery] = useState("");
  const [catalogShips, setCatalogShips] = useState<ApiShip[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  // Hover → floating 3D preview (single WebGL context)
  const [hoveredNode, setHoveredNode] = useState<CanvasNode | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({
    active: false,
    type: "pan" as "pan" | "ship",
    shipId: null as string | null,
    startClientX: 0,
    startClientY: 0,
    startPanX: 0,
    startPanY: 0,
    startNodeX: 0,
    startNodeY: 0,
  });

  const applyView = useCallback((updates: Partial<ViewState>) => {
    const next = { ...viewRef.current, ...updates };
    viewRef.current = next;
    setView(next);
  }, []);

  // ─── Persistence ───────────────────────────────────────────────────────────

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (Array.isArray(saved.nodes)) setNodes(saved.nodes);
      if (saved.view && typeof saved.view.panX === "number") {
        viewRef.current = saved.view;
        setView(saved.view);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes, view })); }
    catch { /* ignore */ }
  }, [nodes, view]);

  // ─── Catalog search ────────────────────────────────────────────────────────

  useEffect(() => {
    if (activeTab !== "catalog") return;
    const q = searchQuery.trim();
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setLoadingCatalog(true);
      try {
        const url = `/api/ships?limit=40${q ? `&search=${encodeURIComponent(q)}` : ""}`;
        const res = await fetch(url, { signal: ctrl.signal });
        const json = await res.json();
        setCatalogShips(json.data ?? []);
      } catch { /* aborted */ }
      finally { setLoadingCatalog(false); }
    }, 300);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [searchQuery, activeTab]);

  // ─── Wheel zoom ────────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const { panX, panY, zoom } = viewRef.current;
      const newZoom = clampZoom(zoom + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
      const ratio = newZoom / zoom;
      applyView({ zoom: newZoom, panX: mx - (mx - panX) * ratio, panY: my - (my - panY) * ratio });
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [applyView]);

  // ─── Add ship ──────────────────────────────────────────────────────────────

  const addShip = useCallback((
    reference: string,
    name: string,
    manufacturer: string,
    imageUrl?: string,
  ) => {
    const canvas = canvasRef.current;
    const { panX, panY, zoom } = viewRef.current;
    const cx = canvas ? (canvas.clientWidth / 2 - panX) / zoom : 400;
    const cy = canvas ? (canvas.clientHeight / 2 - panY) / zoom : 300;
    const jitter = () => (Math.random() - 0.5) * 200;
    setNodes((prev) => [
      ...prev,
      { id: uid(), reference, name, manufacturer, imageUrl, x: cx - NODE_W / 2 + jitter(), y: cy - NODE_H / 2 + jitter() },
    ]);
  }, []);

  // ─── Pointer handlers ──────────────────────────────────────────────────────

  const onCanvasPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const { panX, panY } = viewRef.current;
    dragRef.current = { active: true, type: "pan", shipId: null, startClientX: e.clientX, startClientY: e.clientY, startPanX: panX, startPanY: panY, startNodeX: 0, startNodeY: 0 };
  }, []);

  const onShipPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>, node: CanvasNode) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { active: true, type: "ship", shipId: node.id, startClientX: e.clientX, startClientY: e.clientY, startPanX: 0, startPanY: 0, startNodeX: node.x, startNodeY: node.y };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d.active) return;
    const dx = e.clientX - d.startClientX;
    const dy = e.clientY - d.startClientY;
    if (d.type === "pan") {
      applyView({ panX: d.startPanX + dx, panY: d.startPanY + dy });
    } else if (d.type === "ship" && d.shipId) {
      const z = viewRef.current.zoom;
      setNodes((prev) => prev.map((n) => n.id === d.shipId ? { ...n, x: d.startNodeX + dx / z, y: d.startNodeY + dy / z } : n));
    }
  }, [applyView]);

  const onPointerUp = useCallback(() => { dragRef.current.active = false; }, []);

  // ─── Zoom buttons ──────────────────────────────────────────────────────────

  const doZoom = useCallback((direction: 1 | -1) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = canvas.clientWidth / 2;
    const cy = canvas.clientHeight / 2;
    const { panX, panY, zoom } = viewRef.current;
    const newZoom = clampZoom(zoom + direction * ZOOM_STEP);
    const ratio = newZoom / zoom;
    applyView({ zoom: newZoom, panX: cx - (cx - panX) * ratio, panY: cy - (cy - panY) * ratio });
  }, [applyView]);

  // ─── Hangar ships ──────────────────────────────────────────────────────────

  const allHangarShips = useHangarStore((s) => s.ships);
  const hangarShipList = allHangarShips.filter(
    (s) => (s.itemCategory === "standalone_ship" || s.itemCategory === "game_package") && s.shipReference,
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  const { panX, panY, zoom } = view;
  const gridSize = Math.max(8, 40 * zoom);

  return (
    <div className="flex h-full overflow-hidden bg-zinc-950">

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className={`relative z-20 flex-col bg-zinc-900/95 backdrop-blur border-r border-zinc-800 transition-all duration-200 ${sidebarOpen ? "flex w-64" : "hidden"}`}>

        <div className="flex border-b border-zinc-800 shrink-0">
          {(["hangar", "catalog"] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 text-[11px] uppercase tracking-[0.12em] transition-colors ${activeTab === tab ? "text-amber-400 border-b-2 border-amber-500" : "text-zinc-500 hover:text-zinc-300"}`}>
              {tab === "hangar" ? "My Hangar" : "All Ships"}
            </button>
          ))}
        </div>

        {activeTab === "catalog" && (
          <div className="p-2 border-b border-zinc-800 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
              <input type="text" placeholder="Search ships…" value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-2 py-1.5 bg-zinc-800 text-zinc-200 text-xs rounded border border-zinc-700 focus:border-amber-500 focus:outline-none placeholder-zinc-600" />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto min-h-0">
          {activeTab === "hangar" && (
            hangarShipList.length === 0
              ? <EmptyHint text={"No ships in hangar.\nImport your hangar first."} />
              : <div className="divide-y divide-zinc-800/40">
                  {hangarShipList.map((s) => (
                    <SidebarRow key={s.id} name={s.shipName} sub={s.insuranceType.replace(/_/g, " ")}
                      onAdd={() => addShip(s.shipReference, s.shipName, "", s.imageUrl)} />
                  ))}
                </div>
          )}
          {activeTab === "catalog" && (
            loadingCatalog
              ? <EmptyHint text="Loading…" />
              : catalogShips.length === 0
                ? <EmptyHint text="No ships found." />
                : <div className="divide-y divide-zinc-800/40">
                    {catalogShips.map((s) => (
                      <SidebarRow key={s.id} name={s.name} sub={s.manufacturer}
                        onAdd={() => addShip(s.reference, s.name, s.manufacturer)} />
                    ))}
                  </div>
          )}
        </div>

        <div className="p-2 border-t border-zinc-800 shrink-0">
          <button onClick={() => setNodes([])}
            className="w-full text-xs text-zinc-600 hover:text-red-400 transition-colors py-1">
            Clear canvas
          </button>
        </div>
      </aside>

      {/* Sidebar toggle */}
      <button onClick={() => setSidebarOpen((v) => !v)}
        className="absolute z-30 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 p-1.5 rounded-r border border-l-0 border-zinc-700 transition-colors"
        style={{ top: "50%", transform: "translateY(-50%)", left: sidebarOpen ? 256 : 0 }}>
        {sidebarOpen ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>

      {/* ── Canvas ───────────────────────────────────────────────────────── */}
      <div ref={canvasRef}
        className="flex-1 relative overflow-hidden select-none cursor-grab active:cursor-grabbing"
        style={{
          backgroundImage: `radial-gradient(circle, rgba(113,113,122,0.18) 1px, transparent 1px)`,
          backgroundSize: `${gridSize}px ${gridSize}px`,
          backgroundPosition: `${panX % gridSize}px ${panY % gridSize}px`,
        }}
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {/* Transform layer */}
        <div className="absolute top-0 left-0 origin-top-left will-change-transform"
          style={{ transform: `translate(${panX}px,${panY}px) scale(${zoom})` }}>
          {nodes.map((node) => (
            <ShipNode
              key={node.id}
              node={node}
              onPointerDown={(e) => onShipPointerDown(e, node)}
              onRemove={() => setNodes((prev) => prev.filter((n) => n.id !== node.id))}
              onHoverEnter={() => setHoveredNode(node)}
              onHoverLeave={() => setHoveredNode((h) => h?.id === node.id ? null : h)}
            />
          ))}
        </div>

        {/* Empty state */}
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center space-y-3">
              <div className="text-zinc-800 text-5xl font-thin">◇</div>
              <p className="text-zinc-600 text-sm">Add ships from the sidebar to begin</p>
              <p className="text-zinc-700 text-xs">Drag to pan · Scroll to zoom · Hover for 3D</p>
            </div>
          </div>
        )}

        {/* ── Floating 3D preview (single WebGL context) ─────────────────── */}
        {hoveredNode && (
          <div className="absolute bottom-16 right-4 z-20 pointer-events-none"
            style={{ width: 220, height: 200 }}>
            <div className="w-full h-full bg-zinc-900 border border-zinc-700/80 rounded-xl overflow-hidden shadow-2xl">
              <div className="w-full h-40">
                <ShipViewer3D
                  key={hoveredNode.reference}
                  glbUrl={shipGlbCandidates(hoveredNode.reference)}
                  rotationAxis="yaw"
                  animate
                  animationSpeed={0.5}
                  className="w-full h-full"
                />
              </div>
              <div className="px-3 py-2 border-t border-zinc-800">
                <p className="text-xs text-zinc-100 font-medium truncate">{hoveredNode.name}</p>
                {hoveredNode.manufacturer && (
                  <p className="text-[10px] text-zinc-500 truncate uppercase tracking-wider mt-0.5">
                    {hoveredNode.manufacturer}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Zoom controls */}
        <div className="absolute bottom-4 right-4 flex flex-col gap-1.5 z-10">
          <CanvasBtn title="Zoom in" onClick={() => doZoom(1)}><ZoomIn className="w-4 h-4" /></CanvasBtn>
          <CanvasBtn title="Zoom out" onClick={() => doZoom(-1)}><ZoomOut className="w-4 h-4" /></CanvasBtn>
          <CanvasBtn title="Reset view" onClick={() => applyView({ panX: 0, panY: 0, zoom: 1 })}><Crosshair className="w-4 h-4" /></CanvasBtn>
        </div>

        <div className="absolute bottom-5 right-16 text-zinc-600 text-[11px] z-10 pointer-events-none tabular-nums">
          {Math.round(zoom * 100)}%
        </div>

        {nodes.length > 0 && (
          <div className="absolute top-3 right-4 text-zinc-600 text-xs z-10 pointer-events-none">
            {nodes.length} ship{nodes.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function EmptyHint({ text }: { text: string }) {
  return <div className="p-6 text-center text-zinc-600 text-xs whitespace-pre-line leading-relaxed">{text}</div>;
}

function SidebarRow({ name, sub, onAdd }: { name: string; sub: string; onAdd: () => void }) {
  return (
    <button onClick={onAdd}
      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-800/60 transition-colors group">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-zinc-200 truncate leading-tight">{name}</p>
        <p className="text-[10px] text-zinc-500 truncate leading-tight mt-0.5">{sub}</p>
      </div>
      <Plus className="w-3.5 h-3.5 text-zinc-600 group-hover:text-amber-400 shrink-0 transition-colors" />
    </button>
  );
}

function ShipNode({
  node, onPointerDown, onRemove, onHoverEnter, onHoverLeave,
}: {
  node: CanvasNode;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onRemove: () => void;
  onHoverEnter: () => void;
  onHoverLeave: () => void;
}) {
  return (
    <div
      className="absolute group"
      style={{ left: node.x, top: node.y, width: NODE_W, height: NODE_H, cursor: "grab" }}
      onPointerDown={onPointerDown}
      onPointerEnter={onHoverEnter}
      onPointerLeave={onHoverLeave}
    >
      <div className="w-full h-full rounded-xl overflow-hidden border border-zinc-700/60 hover:border-amber-500/50 transition-colors shadow-xl bg-zinc-900">
        {node.imageUrl ? (
          /* RSI thumbnail if available (from hangar import) */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={node.imageUrl}
            alt={node.name}
            draggable={false}
            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
          />
        ) : (
          /* Gradient placeholder for catalog ships */
          <div className="w-full h-full flex flex-col items-center justify-center gap-1.5
            bg-gradient-to-br from-zinc-800 to-zinc-900">
            <Box className="w-6 h-6 text-zinc-600" />
            <span className="text-[10px] text-zinc-600 uppercase tracking-widest">3D on hover</span>
          </div>
        )}

        {/* Name overlay */}
        <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5
          bg-gradient-to-t from-zinc-950/90 to-transparent">
          <p className="text-[11px] text-zinc-100 truncate font-medium leading-tight">{node.name}</p>
          {node.manufacturer && (
            <p className="text-[9px] text-zinc-500 truncate uppercase tracking-wider leading-tight">
              {node.manufacturer}
            </p>
          )}
        </div>
      </div>

      {/* Remove button */}
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-500 hover:text-red-400 hover:border-red-500/60 opacity-0 group-hover:opacity-100 transition-all z-10"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

function CanvasBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button onClick={onClick} title={title}
      className="w-8 h-8 flex items-center justify-center bg-zinc-900/90 backdrop-blur border border-zinc-700 rounded text-zinc-400 hover:text-amber-400 hover:border-amber-500/40 transition-colors shadow-lg">
      {children}
    </button>
  );
}
