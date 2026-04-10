"use client";
// =============================================================================
// SC LABS — CargoGrid3D v2
//
// Ejes: X e Y son el plano del suelo, Z es vertical (como en Star Citizen).
// Mapeo a Three.js: DB.x → THREE.x  |  DB.y → THREE.z  |  DB.z → THREE.y
//
// Múltiples grids: se disponen en fila a lo largo del eje X con separación.
// Cada celda = 1 SCU = 1.25 × 1.25 × 1.25 m.
// =============================================================================

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import type { CargoGridData } from "./CargoPage";

// ─── Constantes ──────────────────────────────────────────────────────────────

const SCU        = 1.25;
const CELL_SCALE = 0.84;
const GRID_GAP   = SCU * 2; // separación entre módulos

// ─── Tipos de cargo ───────────────────────────────────────────────────────────

type CargoType = "empty" | "medical" | "minerals" | "weapons" | "food" | "electronics" | "fuel";
type Tool      = "place" | "erase";

const CARGO: Record<CargoType, { label: string; hex: number; css: string }> = {
  empty:       { label: "Empty",       hex: 0x18181b, css: "#18181b" },
  medical:     { label: "Medical",     hex: 0x00cc77, css: "#00cc77" },
  minerals:    { label: "Minerals",    hex: 0xf97316, css: "#f97316" },
  weapons:     { label: "Weapons",     hex: 0xef4444, css: "#ef4444" },
  food:        { label: "Food",        hex: 0xeab308, css: "#eab308" },
  electronics: { label: "Electronics", hex: 0x3b82f6, css: "#3b82f6" },
  fuel:        { label: "Fuel",        hex: 0xa855f7, css: "#a855f7" },
};

const FILLED = (Object.keys(CARGO) as CargoType[]).filter((t) => t !== "empty");

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Clave única de celda incluyendo índice de grid */
const cellKey = (gi: number, x: number, y: number, z: number) => `${gi}:${x},${y},${z}`;

/** Instance ID dentro del InstancedMesh global */
function globalIID(
  gi: number,
  x: number,
  y: number,
  z: number,
  offsets: number[],
  dims: { gx: number; gy: number; gz: number }[],
) {
  const { gx, gy } = dims[gi];
  // En la BD: x=ancho, y=fondo, z=alto
  // Iteramos: z (alto) → y (fondo) → x (ancho)
  const localId = z * gx * gy + y * gx + x;
  return offsets[gi] + localId;
}

/** Mapea coordenadas de BD a posición Three.js */
function toThree(bx: number, by: number, bz: number): THREE.Vector3 {
  // DB.x → THREE.x  (ancho, eje derecha)
  // DB.y → THREE.z  (fondo, eje profundidad)
  // DB.z → THREE.y  (alto, eje vertical)
  return new THREE.Vector3(bx * SCU + SCU / 2, bz * SCU + SCU / 2, by * SCU + SCU / 2);
}

// ─── Component ───────────────────────────────────────────────────────────────

interface CellInfo { gi: number; x: number; y: number; z: number; type: CargoType }

interface GridMeta {
  gx: number; gy: number; gz: number;
  offsetX: number; // desplazamiento X Three.js para este módulo
}

export function CargoGrid3D({ grids }: { grids: CargoGridData[] }) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const meshRef      = useRef<THREE.InstancedMesh | null>(null);
  const cameraRef    = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef  = useRef<{ update(): void; dispose(): void } | null>(null);
  const animRef      = useRef(0);

  // Mapas de instancias
  const idToCellRef  = useRef<Map<number, { gi: number; x: number; y: number; z: number }>>(new Map());
  const gridMetaRef  = useRef<GridMeta[]>([]);
  const offsetsRef   = useRef<number[]>([]);
  const dimsRef      = useRef<{ gx: number; gy: number; gz: number }[]>([]);

  // Refs de interacción
  const activeTypeRef = useRef<CargoType>("medical");
  const toolRef       = useRef<Tool>("place");
  const cargoMapRef   = useRef<Map<string, CargoType>>(new Map());
  const mouseRef      = useRef({ downX: 0, downY: 0, isDown: false, moved: false });

  // React state (solo UI)
  const [activeType, setActiveType] = useState<CargoType>("medical");
  const [tool, setTool]             = useState<Tool>("place");
  const [hovered, setHovered]       = useState<CellInfo | null>(null);
  const [stats, setStats]           = useState<Record<CargoType, number>>(
    () => Object.fromEntries(FILLED.map((t) => [t, 0])) as Record<CargoType, number>,
  );

  useEffect(() => { activeTypeRef.current = activeType; }, [activeType]);
  useEffect(() => { toolRef.current = tool; }, [tool]);

  // SCU totales y usados
  const totalSCU = grids.reduce((s, g) => s + g.scuCapacity, 0);
  const usedSCU  = Object.values(stats).reduce((a, b) => a + b, 0);

  // ── Pintar celda en GPU ───────────────────────────────────────────────────
  const paintCell = useCallback((gi: number, x: number, y: number, z: number, type: CargoType) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const id = globalIID(gi, x, y, z, offsetsRef.current, dimsRef.current);
    mesh.setColorAt(id, new THREE.Color(CARGO[type].hex));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, []);

  // ── Sincronizar stats ─────────────────────────────────────────────────────
  const syncStats = useCallback(() => {
    const s = Object.fromEntries(FILLED.map((t) => [t, 0])) as Record<CargoType, number>;
    for (const t of cargoMapRef.current.values()) if (t !== "empty") s[t]++;
    setStats({ ...s });
  }, []);

  // ── Aplicar herramienta ───────────────────────────────────────────────────
  const applyTool = useCallback((gi: number, x: number, y: number, z: number) => {
    const type: CargoType = toolRef.current === "erase" ? "empty" : activeTypeRef.current;
    const k = cellKey(gi, x, y, z);
    if (type === "empty") cargoMapRef.current.delete(k);
    else                  cargoMapRef.current.set(k, type);
    paintCell(gi, x, y, z, type);
    syncStats();
  }, [paintCell, syncStats]);

  // ── Fill capa Z (vertical) ────────────────────────────────────────────────
  const fillLayer = useCallback((gi: number, z: number) => {
    const dims = dimsRef.current[gi];
    if (!dims) return;
    const type: CargoType = toolRef.current === "erase" ? "empty" : activeTypeRef.current;
    for (let y2 = 0; y2 < dims.gy; y2++)
      for (let x2 = 0; x2 < dims.gx; x2++) {
        const k = cellKey(gi, x2, y2, z);
        if (type === "empty") cargoMapRef.current.delete(k);
        else                  cargoMapRef.current.set(k, type);
        paintCell(gi, x2, y2, z, type);
      }
    syncStats();
  }, [paintCell, syncStats]);

  // ── Clear all ─────────────────────────────────────────────────────────────
  const clearAll = useCallback(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    cargoMapRef.current.clear();
    const empty = new THREE.Color(CARGO.empty.hex);
    for (let i = 0; i < mesh.count; i++) mesh.setColorAt(i, empty);
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    syncStats();
  }, [syncStats]);

  // ── Setup Three.js ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !grids.length) return;
    const container = canvas.parentElement!;

    cancelAnimationFrame(animRef.current);
    meshRef.current = null;
    cargoMapRef.current.clear();
    idToCellRef.current.clear();
    setHovered(null);
    setStats(Object.fromEntries(FILLED.map((t) => [t, 0])) as Record<CargoType, number>);

    // Calcular dimensiones de cada grid
    const dims = grids.map((g) => ({
      gx: Math.max(1, Math.round(g.dimensions.x / SCU)),
      gy: Math.max(1, Math.round(g.dimensions.y / SCU)),
      gz: Math.max(1, Math.round(g.dimensions.z / SCU)),
    }));
    dimsRef.current = dims;

    // Calcular offsets X para disponer grids en fila
    const offsets: number[] = [0];
    const meta: GridMeta[]  = [];
    let cursorX = 0;

    for (let gi = 0; gi < grids.length; gi++) {
      const { gx, gy, gz } = dims[gi];
      meta.push({ gx, gy, gz, offsetX: cursorX });
      if (gi < grids.length - 1) {
        offsets.push(offsets[gi] + gx * gy * gz);
        cursorX += gx * SCU + GRID_GAP;
      }
    }
    offsetsRef.current = offsets;
    gridMetaRef.current = meta;

    const totalInstances = dims.reduce((s, d) => s + d.gx * d.gy * d.gz, 0);

    // Bounds de la escena completa
    const lastGrid   = meta[meta.length - 1];
    const totalWorldX = lastGrid.offsetX + lastGrid.gx * SCU;
    const maxWorldZ   = Math.max(...dims.map((d) => d.gz * SCU)); // alto (Z en SC = Y en Three)
    const maxWorldY   = Math.max(...dims.map((d) => d.gy * SCU)); // fondo (Y en SC = Z en Three)
    const center      = new THREE.Vector3(totalWorldX / 2, maxWorldZ / 2, maxWorldY / 2);
    const sceneSpan   = Math.max(totalWorldX, maxWorldZ, maxWorldY);

    // Escena
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x09090b); // zinc-950

    // Cámara — mirando el plano XY desde arriba y delante
    const W = container.clientWidth || 800;
    const H = container.clientHeight || 600;
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 2000);
    camera.position.set(center.x, center.y + sceneSpan * 1.0, center.z + sceneSpan * 1.5);
    camera.lookAt(center);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Luces
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(1, 2, 1).normalize();
    scene.add(dir);
    const fill = new THREE.DirectionalLight(0x88aaff, 0.3);
    fill.position.set(-1, 0.5, -1).normalize();
    scene.add(fill);

    // Grid helper (suelo en Y=0 Three.js = suelo del cargo hold)
    const gh = new THREE.GridHelper(
      Math.max(totalWorldX, maxWorldY) * 2.5,
      Math.max(20, Math.ceil(Math.max(totalWorldX, maxWorldY) / SCU) * 2),
      0x3f3f46,
      0x27272a,
    );
    gh.position.set(center.x, 0, center.z);
    scene.add(gh);

    // Wireframes de límite por cada módulo
    for (let gi = 0; gi < grids.length; gi++) {
      const { gx, gy, gz, offsetX } = meta[gi];
      // DB: x=ancho, y=fondo, z=alto → Three: w=gx*SCU, h=gz*SCU, d=gy*SCU
      const edgeGeo = new THREE.EdgesGeometry(
        new THREE.BoxGeometry(gx * SCU, gz * SCU, gy * SCU),
      );
      const edgeMat = new THREE.LineBasicMaterial({
        color: 0xf59e0b, // amber-500
        transparent: true,
        opacity: 0.25,
      });
      const edge = new THREE.LineSegments(edgeGeo, edgeMat);
      edge.position.set(
        offsetX + (gx * SCU) / 2,
        (gz * SCU) / 2,
        (gy * SCU) / 2,
      );
      scene.add(edge);

      // Label del módulo (línea separadora entre módulos)
      if (gi > 0) {
        const sepGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(offsetX - GRID_GAP / 2, 0, 0),
          new THREE.Vector3(offsetX - GRID_GAP / 2, maxWorldZ + SCU, 0),
        ]);
        scene.add(new THREE.Line(sepGeo, new THREE.LineBasicMaterial({ color: 0x3f3f46 })));
      }
    }

    // Ejes de referencia
    const mkAxis = (dir2: THREE.Vector3, color: number) =>
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0, 0),
          dir2.clone().multiplyScalar(SCU * 2),
        ]),
        new THREE.LineBasicMaterial({ color }),
      );
    scene.add(mkAxis(new THREE.Vector3(1, 0, 0), 0xef4444)); // X rojo
    scene.add(mkAxis(new THREE.Vector3(0, 0, 1), 0x22c55e)); // Y (Three Z) verde
    scene.add(mkAxis(new THREE.Vector3(0, 1, 0), 0x3b82f6)); // Z (Three Y) azul

    // InstancedMesh
    const cellGeo  = new THREE.BoxGeometry(SCU * CELL_SCALE, SCU * CELL_SCALE, SCU * CELL_SCALE);
    const cellMat  = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.4 });
    const instMesh = new THREE.InstancedMesh(cellGeo, cellMat, totalInstances);
    instMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    meshRef.current = instMesh;

    const mtx      = new THREE.Matrix4();
    const emptyCol = new THREE.Color(CARGO.empty.hex);
    const idToCell = new Map<number, { gi: number; x: number; y: number; z: number }>();

    for (let gi = 0; gi < grids.length; gi++) {
      const { gx, gy, gz, offsetX } = meta[gi];
      // Iteramos igual que globalIID: z → y → x
      for (let z = 0; z < gz; z++)
        for (let y = 0; y < gy; y++)
          for (let x = 0; x < gx; x++) {
            const iid = offsets[gi] + z * gx * gy + y * gx + x;
            const pos = toThree(x, y, z);
            pos.x += offsetX;
            mtx.setPosition(pos);
            instMesh.setMatrixAt(iid, mtx);
            instMesh.setColorAt(iid, emptyCol);
            idToCell.set(iid, { gi, x, y, z });
          }
    }
    instMesh.instanceMatrix.needsUpdate = true;
    if (instMesh.instanceColor) instMesh.instanceColor.needsUpdate = true;
    idToCellRef.current = idToCell;
    scene.add(instMesh);

    // OrbitControls
    let ctrlReady = false;
    import("three/examples/jsm/controls/OrbitControls.js").then(({ OrbitControls }) => {
      const ctrl = new OrbitControls(camera, renderer.domElement);
      ctrl.target.copy(center);
      ctrl.enableDamping = true;
      ctrl.dampingFactor = 0.06;
      ctrl.minDistance   = SCU * 2;
      ctrl.maxDistance   = sceneSpan * 12;
      ctrl.mouseButtons  = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
      controlsRef.current = ctrl;
      ctrlReady = true;
    });

    // Loop
    let rafId = 0;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      if (ctrlReady) controlsRef.current?.update();
      renderer.render(scene, camera);
    };
    animate();
    animRef.current = rafId;

    // Raycaster
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    const hitCell = (cx: number, cy: number) => {
      const rect = canvas.getBoundingClientRect();
      ndc.x = ((cx - rect.left) / rect.width)  * 2 - 1;
      ndc.y = -((cy - rect.top)  / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObject(instMesh);
      if (!hits.length || hits[0].instanceId == null) return null;
      return idToCell.get(hits[0].instanceId) ?? null;
    };

    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      mouseRef.current = { downX: e.clientX, downY: e.clientY, isDown: true, moved: false };
    };
    const onMove = (e: MouseEvent) => {
      if (mouseRef.current.isDown) {
        const dx = e.clientX - mouseRef.current.downX;
        const dy = e.clientY - mouseRef.current.downY;
        if (dx * dx + dy * dy > 25) mouseRef.current.moved = true;
      }
      const cell = hitCell(e.clientX, e.clientY);
      if (cell) {
        const type = cargoMapRef.current.get(cellKey(cell.gi, cell.x, cell.y, cell.z)) ?? "empty";
        setHovered({ ...cell, type });
      } else {
        setHovered(null);
      }
    };
    const onUp = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (mouseRef.current.isDown && !mouseRef.current.moved) {
        const cell = hitCell(e.clientX, e.clientY);
        if (cell) applyTool(cell.gi, cell.x, cell.y, cell.z);
      }
      mouseRef.current.isDown = false;
    };

    canvas.addEventListener("mousedown", onDown);
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseup",   onUp);

    const ro = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(container);

    return () => {
      cancelAnimationFrame(rafId);
      canvas.removeEventListener("mousedown", onDown);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseup",   onUp);
      ro.disconnect();
      controlsRef.current?.dispose();
      controlsRef.current = null;
      renderer.dispose();
      cellGeo.dispose();
      cellMat.dispose();
    };
  }, [grids, applyTool]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!grids.length) return null;

  // Dimensiones del grid seleccionado (para fill layer)
  const firstDims = dimsRef.current;

  // Barra de progreso stacked
  const segments = FILLED
    .map((t) => ({ t, count: stats[t] ?? 0, pct: totalSCU > 0 ? ((stats[t] ?? 0) / totalSCU) * 100 : 0 }))
    .filter((s) => s.count > 0);

  return (
    <div className="relative w-full h-full">
      <canvas ref={canvasRef} className="w-full h-full block" />

      {/* ── Panel de controles (izquierda) ── */}
      <div className="absolute top-0 left-0 bottom-12 w-44 flex flex-col overflow-y-auto border-r border-zinc-800/50 bg-zinc-950/80 backdrop-blur-sm">

        {/* Tool */}
        <div className="p-3 border-b border-zinc-800/40">
          <p className="text-[9px] text-zinc-500 uppercase tracking-widest mb-2">Herramienta</p>
          {(["place", "erase"] as Tool[]).map((t) => (
            <button
              key={t}
              onClick={() => setTool(t)}
              className="w-full text-left px-2.5 py-1.5 text-[11px] rounded mb-1 transition-colors"
              style={tool === t
                ? { background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.4)", color: "rgb(251,191,36)" }
                : { background: "transparent", border: "1px solid rgba(63,63,70,0.5)", color: "rgb(113,113,122)" }}
            >
              {t === "place" ? "＋ Colocar" : "× Borrar"}
            </button>
          ))}
        </div>

        {/* Tipo de cargo */}
        <div className="p-3 border-b border-zinc-800/40">
          <p className="text-[9px] text-zinc-500 uppercase tracking-widest mb-2">Cargo</p>
          {FILLED.map((t) => {
            const active = activeType === t && tool === "place";
            return (
              <button
                key={t}
                onClick={() => { setActiveType(t); setTool("place"); }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] rounded mb-1 transition-colors"
                style={active
                  ? { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", color: "rgb(244,244,245)" }
                  : { background: "transparent", border: "1px solid transparent", color: "rgb(113,113,122)" }}
              >
                <span
                  className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: CARGO[t].css, boxShadow: active ? `0 0 6px ${CARGO[t].css}66` : "none" }}
                />
                <span>{CARGO[t].label}</span>
                {(stats[t] ?? 0) > 0 && (
                  <span className="ml-auto text-[9px] font-mono" style={{ color: CARGO[t].css + "bb" }}>
                    {stats[t]}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Fill capa Z por módulo */}
        <div className="p-3 border-b border-zinc-800/40">
          <p className="text-[9px] text-zinc-500 uppercase tracking-widest mb-2">Fill Capa Z</p>
          {grids.map((g, gi) => {
            const { gz } = firstDims[gi] ?? { gz: 0 };
            if (!gz) return null;
            return (
              <div key={g.id} className="mb-3">
                {grids.length > 1 && (
                  <p className="text-[9px] text-zinc-600 mb-1 truncate">{g.name.split("_").pop()}</p>
                )}
                <div className="flex flex-wrap gap-1">
                  {Array.from({ length: gz }, (_, z) => (
                    <button
                      key={z}
                      onClick={() => fillLayer(gi, z)}
                      className="w-6 h-6 text-[9px] font-mono rounded transition-colors bg-zinc-900 border border-zinc-700/50 text-zinc-500 hover:bg-amber-500/15 hover:border-amber-500/40 hover:text-amber-400"
                    >
                      {z}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Clear */}
        <div className="p-3 mt-auto">
          <button
            onClick={clearAll}
            className="w-full py-1.5 text-[10px] tracking-widest uppercase rounded transition-colors bg-red-950/30 border border-red-900/40 text-red-500/70 hover:bg-red-900/30 hover:text-red-400"
          >
            Clear All
          </button>
        </div>
      </div>

      {/* ── HUD inferior ── */}
      <div className="absolute bottom-0 left-44 right-0 h-12 flex items-center gap-4 px-4 border-t border-zinc-800/50 bg-zinc-950/80 backdrop-blur-sm">

        {/* Info celda hovereada */}
        <div className="text-[10px] font-mono min-w-[260px] text-zinc-500">
          {hovered ? (
            <>
              {grids.length > 1 && (
                <span className="text-zinc-600 mr-1">
                  [{grids[hovered.gi]?.name?.split("_").pop()}]
                </span>
              )}
              <span className="text-amber-400/80">X:{hovered.x} Y:{hovered.y} Z:{hovered.z}</span>
              {" · "}
              <span style={{ color: CARGO[hovered.type].css }}>{CARGO[hovered.type].label}</span>
              {" · "}
              <span className="text-zinc-600">
                {(hovered.x * SCU).toFixed(2)}m, {(hovered.y * SCU).toFixed(2)}m, {(hovered.z * SCU).toFixed(2)}m
              </span>
            </>
          ) : (
            <span>Hover para inspeccionar · LMB click para pintar · Drag para orbitar · RMB para pan</span>
          )}
        </div>

        {/* Progress bar SCU */}
        <div className="flex-1 flex items-center gap-2">
          <span className="text-[10px] font-mono text-zinc-500 whitespace-nowrap">
            {usedSCU}/{totalSCU} SCU
          </span>
          <div className="flex-1 h-2 rounded-full overflow-hidden bg-zinc-800/60">
            {segments.length > 0 && (
              <div className="flex h-full">
                {segments.map((s) => (
                  <div
                    key={s.t}
                    className="h-full transition-all duration-300"
                    style={{ width: `${s.pct}%`, backgroundColor: CARGO[s.t].css }}
                    title={`${CARGO[s.t].label}: ${s.count} SCU`}
                  />
                ))}
              </div>
            )}
          </div>
          <span className="text-[10px] font-mono text-zinc-600 whitespace-nowrap">
            {totalSCU > 0 ? `${((usedSCU / totalSCU) * 100).toFixed(0)}%` : "—"}
          </span>
        </div>

        {/* Módulos activos */}
        <div className="text-[9px] font-mono text-zinc-600 whitespace-nowrap">
          {grids.length > 1 ? `${grids.length} módulos` : `${grids[0]?.name?.split("_CargoGrid")[1]?.replace(/_/g, " ").trim() || "Grid"}`}
        </div>
      </div>
    </div>
  );
}
