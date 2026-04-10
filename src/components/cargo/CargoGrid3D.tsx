"use client";
// =============================================================================
// SC LABS — CargoGrid3D
// Three.js 3D cargo grid visualizer.
//
// Features:
//   • InstancedMesh — one draw call for all SCU cells
//   • OrbitControls — rotate (LMB), zoom (scroll), pan (RMB/MMB)
//   • Click cells to paint cargo type (place / erase tool)
//   • Quick-fill by Y layer, clear all
//   • HUD: hovered cell info + stacked SCU progress bar
//   • Sci-fi dark aesthetic (#0a0e17 bg, cyan #00e5ff accents)
//
// 1 SCU = 1.25 × 1.25 × 1.25 m. All grid dimensions are multiples of 1.25.
// =============================================================================

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import type { CargoGridData } from "./CargoPage";

// ─── Constants ───────────────────────────────────────────────────────────────

const SCU = 1.25; // metres per SCU cell edge
const CELL_SCALE = 0.84; // slight gap between cells (renders at 84% of SCU)

// ─── Cargo Types ─────────────────────────────────────────────────────────────

type CargoType =
  | "empty"
  | "medical"
  | "minerals"
  | "weapons"
  | "food"
  | "electronics"
  | "fuel";

const CARGO: Record<
  CargoType,
  { label: string; hex: number; css: string; emissive: number }
> = {
  empty:       { label: "Empty",       hex: 0x0c1825, css: "#0c1825",  emissive: 0x000000 },
  medical:     { label: "Medical",     hex: 0x00cc77, css: "#00cc77",  emissive: 0x004422 },
  minerals:    { label: "Minerals",    hex: 0xee7700, css: "#ee7700",  emissive: 0x331a00 },
  weapons:     { label: "Weapons",     hex: 0xff2222, css: "#ff2222",  emissive: 0x330000 },
  food:        { label: "Food",        hex: 0xddcc00, css: "#ddcc00",  emissive: 0x2a2600 },
  electronics: { label: "Electronics", hex: 0x0099ff, css: "#0099ff",  emissive: 0x001a33 },
  fuel:        { label: "Fuel",        hex: 0xbb33ff, css: "#bb33ff",  emissive: 0x22004d },
};

const FILLED_TYPES = (Object.keys(CARGO) as CargoType[]).filter(
  (t) => t !== "empty",
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cellKey(x: number, y: number, z: number) {
  return `${x},${y},${z}`;
}

function cellId(x: number, y: number, z: number, gridX: number, gridY: number) {
  return z * gridX * gridY + y * gridX + x;
}

function computeGridDims(dimensions: { x: number; y: number; z: number }) {
  return {
    gridX: Math.max(1, Math.round(dimensions.x / SCU)),
    gridY: Math.max(1, Math.round(dimensions.y / SCU)),
    gridZ: Math.max(1, Math.round(dimensions.z / SCU)),
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

interface HoveredCell {
  x: number;
  y: number;
  z: number;
  type: CargoType;
}

type Tool = "place" | "erase";

export function CargoGrid3D({ grid }: { grid: CargoGridData | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Three.js object refs (stable across renders)
  const rendererRef   = useRef<THREE.WebGLRenderer | null>(null);
  const meshRef       = useRef<THREE.InstancedMesh | null>(null);
  const cameraRef     = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef   = useRef<{ update(): void; dispose(): void; target: THREE.Vector3 } | null>(null);
  const animFrameRef  = useRef<number>(0);
  const idToXYZRef    = useRef<Map<number, [number, number, number]>>(new Map());
  const gridDimsRef   = useRef({ gridX: 0, gridY: 0, gridZ: 0 });

  // Interaction refs (avoid stale closures in event handlers)
  const activeTypeRef = useRef<CargoType>("medical");
  const toolRef       = useRef<Tool>("place");
  const cargoMapRef   = useRef<Map<string, CargoType>>(new Map());
  const mouseRef      = useRef({ downX: 0, downY: 0, isDown: false, moved: false });

  // React state (UI redraws only)
  const [activeType, setActiveType] = useState<CargoType>("medical");
  const [tool, setTool]             = useState<Tool>("place");
  const [hoveredCell, setHoveredCell] = useState<HoveredCell | null>(null);
  const [stats, setStats]           = useState<Record<CargoType, number>>(
    () => Object.fromEntries(FILLED_TYPES.map((t) => [t, 0])) as Record<CargoType, number>,
  );

  // Keep refs in sync with React state
  useEffect(() => { activeTypeRef.current = activeType; }, [activeType]);
  useEffect(() => { toolRef.current = tool; }, [tool]);

  // Derive grid dims from prop (pure, no state needed)
  const gridX = grid ? Math.max(1, Math.round(grid.dimensions.x / SCU)) : 0;
  const gridY = grid ? Math.max(1, Math.round(grid.dimensions.y / SCU)) : 0;
  const gridZ = grid ? Math.max(1, Math.round(grid.dimensions.z / SCU)) : 0;
  const totalCells  = gridX * gridY * gridZ;
  const totalSCU    = grid?.scuCapacity ?? 0;
  const usedSCU     = Object.values(stats).reduce((a, b) => a + b, 0);

  // ── Update one cell color on the GPU ──────────────────────────────────────
  const paintCell = useCallback(
    (x: number, y: number, z: number, type: CargoType) => {
      const mesh = meshRef.current;
      if (!mesh) return;
      const { gridX: gx, gridY: gy } = gridDimsRef.current;
      const id = cellId(x, y, z, gx, gy);
      mesh.setColorAt(id, new THREE.Color(CARGO[type].hex));
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    [],
  );

  // ── Sync React stats from cargoMap ────────────────────────────────────────
  const syncStats = useCallback(() => {
    const s = Object.fromEntries(FILLED_TYPES.map((t) => [t, 0])) as Record<CargoType, number>;
    for (const type of cargoMapRef.current.values()) {
      if (type !== "empty") s[type]++;
    }
    setStats({ ...s });
  }, []);

  // ── Apply current tool to a cell ──────────────────────────────────────────
  const applyTool = useCallback(
    (x: number, y: number, z: number) => {
      const key = cellKey(x, y, z);
      const type: CargoType = toolRef.current === "erase" ? "empty" : activeTypeRef.current;
      if (type === "empty") {
        cargoMapRef.current.delete(key);
      } else {
        cargoMapRef.current.set(key, type);
      }
      paintCell(x, y, z, type);
      syncStats();
    },
    [paintCell, syncStats],
  );

  // ── Fill entire Y layer ───────────────────────────────────────────────────
  const fillLayer = useCallback(
    (y: number) => {
      const { gridX: gx, gridY: gy, gridZ: gz } = gridDimsRef.current;
      if (y < 0 || y >= gy) return;
      const type: CargoType = toolRef.current === "erase" ? "empty" : activeTypeRef.current;
      for (let z = 0; z < gz; z++) {
        for (let x = 0; x < gx; x++) {
          const key = cellKey(x, y, z);
          if (type === "empty") cargoMapRef.current.delete(key);
          else cargoMapRef.current.set(key, type);
          paintCell(x, y, z, type);
        }
      }
      syncStats();
    },
    [paintCell, syncStats],
  );

  // ── Clear all cells ───────────────────────────────────────────────────────
  const clearAll = useCallback(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const { gridX: gx, gridY: gy, gridZ: gz } = gridDimsRef.current;
    cargoMapRef.current.clear();
    const emptyColor = new THREE.Color(CARGO.empty.hex);
    for (let i = 0; i < gx * gy * gz; i++) {
      mesh.setColorAt(i, emptyColor);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    syncStats();
  }, [syncStats]);

  // ── Main Three.js scene setup (runs when grid changes) ────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !grid) return;

    const container = canvas.parentElement!;

    // Cleanup previous scene
    cancelAnimationFrame(animFrameRef.current);
    rendererRef.current?.dispose();
    cargoMapRef.current.clear();
    idToXYZRef.current.clear();
    setHoveredCell(null);
    setStats(Object.fromEntries(FILLED_TYPES.map((t) => [t, 0])) as Record<CargoType, number>);

    // Grid dimensions
    const { gridX: gx, gridY: gy, gridZ: gz } = computeGridDims(grid.dimensions);
    gridDimsRef.current = { gridX: gx, gridY: gy, gridZ: gz };
    const totalInstances = gx * gy * gz;

    // World size of the whole grid in metres
    const worldW = gx * SCU;
    const worldH = gy * SCU;
    const worldD = gz * SCU;
    const center = new THREE.Vector3(worldW / 2, worldH / 2, worldD / 2);
    const maxDim = Math.max(worldW, worldH, worldD);

    // ── Scene ──────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0e17);
    scene.fog = new THREE.FogExp2(0x0a0e17, 0.018);

    // ── Camera ─────────────────────────────────────────────────────────────
    const W = container.clientWidth || 800;
    const H = container.clientHeight || 600;
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 2000);
    camera.position.set(
      center.x + maxDim * 1.3,
      center.y + maxDim * 0.9,
      center.z + maxDim * 1.8,
    );
    camera.lookAt(center);
    cameraRef.current = camera;

    // ── Renderer ───────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = false;
    rendererRef.current = renderer;

    // ── Lighting ───────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0x1a2e44, 4.0));

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(center.x + maxDim, center.y + maxDim * 2, center.z + maxDim);
    scene.add(dirLight);

    // Cyan fill light (sci-fi accent)
    const accentLight = new THREE.PointLight(0x00e5ff, 2.0, maxDim * 5);
    accentLight.position.set(center.x, center.y + worldH + maxDim * 0.5, center.z);
    scene.add(accentLight);

    // ── Grid boundary wireframe ────────────────────────────────────────────
    const edgeGeo = new THREE.EdgesGeometry(
      new THREE.BoxGeometry(worldW, worldH, worldD),
    );
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.35,
    });
    const edgeMesh = new THREE.LineSegments(edgeGeo, edgeMat);
    edgeMesh.position.copy(center);
    scene.add(edgeMesh);

    // Inner subdivision lines every SCU on X/Z axes (floor grid)
    const gridHelper = new THREE.GridHelper(
      Math.max(worldW, worldD) * 2,
      Math.max(gx, gz) * 2,
      0x00e5ff,
      0x0d1929,
    );
    gridHelper.position.set(center.x, -SCU * 0.05, center.z);
    (gridHelper.material as THREE.Material).transparent = true;
    (gridHelper.material as THREE.Material).opacity = 0.15;
    scene.add(gridHelper);

    // ── Axis indicators (tiny colored lines at origin corner) ──────────────
    const axisLen = SCU * 1.5;
    const axisOrigin = new THREE.Vector3(0, 0, 0);
    const makeAxis = (dir: THREE.Vector3, color: number) => {
      const geo = new THREE.BufferGeometry().setFromPoints([
        axisOrigin,
        axisOrigin.clone().add(dir.multiplyScalar(axisLen)),
      ]);
      return new THREE.Line(geo, new THREE.LineBasicMaterial({ color }));
    };
    scene.add(makeAxis(new THREE.Vector3(1, 0, 0), 0xff4444)); // X red
    scene.add(makeAxis(new THREE.Vector3(0, 1, 0), 0x44ff44)); // Y green
    scene.add(makeAxis(new THREE.Vector3(0, 0, 1), 0x4488ff)); // Z blue

    // ── InstancedMesh (one per grid cell) ─────────────────────────────────
    const cellSize = SCU * CELL_SCALE;
    const cellGeo = new THREE.BoxGeometry(cellSize, cellSize, cellSize);
    const cellMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.4,
      metalness: 0.7,
    });

    const instancedMesh = new THREE.InstancedMesh(cellGeo, cellMat, totalInstances);
    instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    meshRef.current = instancedMesh;

    const matrix = new THREE.Matrix4();
    const emptyColor = new THREE.Color(CARGO.empty.hex);
    const idToXYZ = new Map<number, [number, number, number]>();
    let iid = 0;

    for (let z = 0; z < gz; z++) {
      for (let y = 0; y < gy; y++) {
        for (let x = 0; x < gx; x++) {
          matrix.setPosition(
            x * SCU + SCU / 2,
            y * SCU + SCU / 2,
            z * SCU + SCU / 2,
          );
          instancedMesh.setMatrixAt(iid, matrix);
          instancedMesh.setColorAt(iid, emptyColor);
          idToXYZ.set(iid, [x, y, z]);
          iid++;
        }
      }
    }
    instancedMesh.instanceMatrix.needsUpdate = true;
    if (instancedMesh.instanceColor) instancedMesh.instanceColor.needsUpdate = true;

    idToXYZRef.current = idToXYZ;
    scene.add(instancedMesh);

    // ── OrbitControls (lazy import — client only) ──────────────────────────
    let controlsLoaded = false;
    import("three/examples/jsm/controls/OrbitControls.js").then(({ OrbitControls }) => {
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.copy(center);
      controls.enableDamping = true;
      controls.dampingFactor = 0.06;
      controls.minDistance = SCU * 2;
      controls.maxDistance = maxDim * 12;
      controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      };
      controlsRef.current = controls;
      controlsLoaded = true;
    });

    // ── Animation loop ─────────────────────────────────────────────────────
    let rafId = 0;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      if (controlsLoaded) controlsRef.current?.update();
      renderer.render(scene, camera);
    };
    animate();
    animFrameRef.current = rafId;

    // ── Mouse interaction ──────────────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const mouseNDC = new THREE.Vector2();

    function intersectCell(clientX: number, clientY: number): [number, number, number] | null {
      const rect = canvas.getBoundingClientRect();
      mouseNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouseNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouseNDC, camera);
      const hits = raycaster.intersectObject(instancedMesh);
      if (!hits.length || hits[0].instanceId == null) return null;
      return idToXYZ.get(hits[0].instanceId) ?? null;
    }

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      mouseRef.current = { downX: e.clientX, downY: e.clientY, isDown: true, moved: false };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (mouseRef.current.isDown) {
        const dx = e.clientX - mouseRef.current.downX;
        const dy = e.clientY - mouseRef.current.downY;
        if (dx * dx + dy * dy > 25) mouseRef.current.moved = true;
      }

      const cell = intersectCell(e.clientX, e.clientY);
      if (cell) {
        const [cx, cy, cz] = cell;
        const type = cargoMapRef.current.get(cellKey(cx, cy, cz)) ?? "empty";
        setHoveredCell({ x: cx, y: cy, z: cz, type });
      } else {
        setHoveredCell(null);
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (mouseRef.current.isDown && !mouseRef.current.moved) {
        const cell = intersectCell(e.clientX, e.clientY);
        if (cell) applyTool(cell[0], cell[1], cell[2]);
      }
      mouseRef.current.isDown = false;
    };

    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseup", onMouseUp);

    // ── Resize handler ─────────────────────────────────────────────────────
    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    // ── Cleanup ────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(rafId);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseup", onMouseUp);
      ro.disconnect();
      controlsRef.current?.dispose();
      controlsRef.current = null;
      renderer.dispose();
      cellGeo.dispose();
      cellMat.dispose();
      edgeGeo.dispose();
      edgeMat.dispose();
    };
  }, [grid, applyTool]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Empty state ───────────────────────────────────────────────────────────
  if (!grid) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full gap-3"
        style={{ color: "rgba(255,255,255,0.15)" }}
      >
        <div
          className="text-4xl mb-2"
          style={{ filter: "grayscale(1) opacity(0.3)" }}
        >
          ▣
        </div>
        <p className="text-xs tracking-[0.3em] uppercase">
          Select a ship to visualize its cargo grid
        </p>
      </div>
    );
  }

  // ── Progress bar segments ─────────────────────────────────────────────────
  const progressSegments = FILLED_TYPES.map((t) => ({
    type: t,
    count: stats[t] ?? 0,
    pct: totalSCU > 0 ? ((stats[t] ?? 0) / totalSCU) * 100 : 0,
  })).filter((s) => s.count > 0);

  return (
    <div className="relative w-full h-full">
      {/* ── Three.js canvas ── */}
      <canvas ref={canvasRef} className="w-full h-full block" />

      {/* ── Left controls panel ── */}
      <div
        className="absolute top-0 left-0 bottom-0 w-44 flex flex-col py-4 px-3 gap-5 overflow-y-auto"
        style={{
          background: "rgba(5,9,18,0.85)",
          backdropFilter: "blur(8px)",
          borderRight: "1px solid rgba(0,229,255,0.12)",
        }}
      >
        {/* Grid info */}
        <div>
          <p
            className="text-[9px] tracking-[0.2em] uppercase mb-1"
            style={{ color: "rgba(0,229,255,0.5)" }}
          >
            Grid
          </p>
          <p className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.5)" }}>
            {gridX} × {gridY} × {gridZ} cells
          </p>
          <p className="text-[10px] font-mono mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>
            {(gridX * SCU).toFixed(2)}m × {(gridY * SCU).toFixed(2)}m × {(gridZ * SCU).toFixed(2)}m
          </p>
        </div>

        {/* Tool selector */}
        <div>
          <p
            className="text-[9px] tracking-[0.2em] uppercase mb-2"
            style={{ color: "rgba(0,229,255,0.5)" }}
          >
            Tool
          </p>
          <div className="flex flex-col gap-1">
            {(["place", "erase"] as Tool[]).map((t) => (
              <button
                key={t}
                onClick={() => setTool(t)}
                className="text-left px-2.5 py-1.5 text-[11px] rounded-sm transition-all"
                style={
                  tool === t
                    ? {
                        background: "rgba(0,229,255,0.12)",
                        border: "1px solid rgba(0,229,255,0.35)",
                        color: "#00e5ff",
                      }
                    : {
                        background: "transparent",
                        border: "1px solid rgba(255,255,255,0.07)",
                        color: "rgba(255,255,255,0.35)",
                      }
                }
              >
                {t === "place" ? "＋ Place" : "× Erase"}
              </button>
            ))}
          </div>
        </div>

        {/* Cargo type selector */}
        <div>
          <p
            className="text-[9px] tracking-[0.2em] uppercase mb-2"
            style={{ color: "rgba(0,229,255,0.5)" }}
          >
            Cargo Type
          </p>
          <div className="flex flex-col gap-1">
            {FILLED_TYPES.map((t) => {
              const active = activeType === t && tool === "place";
              return (
                <button
                  key={t}
                  onClick={() => {
                    setActiveType(t);
                    setTool("place");
                  }}
                  className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] rounded-sm transition-all"
                  style={
                    active
                      ? {
                          background: "rgba(255,255,255,0.08)",
                          border: "1px solid rgba(255,255,255,0.18)",
                          color: "#e8f4ff",
                        }
                      : {
                          background: "transparent",
                          border: "1px solid transparent",
                          color: "rgba(255,255,255,0.4)",
                        }
                  }
                >
                  <span
                    className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                    style={{
                      backgroundColor: CARGO[t].css,
                      boxShadow: active ? `0 0 6px ${CARGO[t].css}88` : "none",
                    }}
                  />
                  <span>{CARGO[t].label}</span>
                  {stats[t] > 0 && (
                    <span
                      className="ml-auto text-[9px] font-mono"
                      style={{ color: CARGO[t].css + "99" }}
                    >
                      {stats[t]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Fill Y layer */}
        <div>
          <p
            className="text-[9px] tracking-[0.2em] uppercase mb-2"
            style={{ color: "rgba(0,229,255,0.5)" }}
          >
            Fill Layer Y
          </p>
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: gridY }, (_, y) => (
              <button
                key={y}
                onClick={() => fillLayer(y)}
                className="w-7 h-7 text-[10px] font-mono rounded-sm transition-all"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "rgba(255,255,255,0.45)",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "rgba(0,229,255,0.12)";
                  (e.currentTarget as HTMLButtonElement).style.color = "#00e5ff";
                  (e.currentTarget as HTMLButtonElement).style.borderColor =
                    "rgba(0,229,255,0.3)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "rgba(255,255,255,0.04)";
                  (e.currentTarget as HTMLButtonElement).style.color =
                    "rgba(255,255,255,0.45)";
                  (e.currentTarget as HTMLButtonElement).style.borderColor =
                    "rgba(255,255,255,0.1)";
                }}
              >
                {y}
              </button>
            ))}
          </div>
        </div>

        {/* Clear all */}
        <div className="mt-auto">
          <button
            onClick={clearAll}
            className="w-full py-2 text-[10px] tracking-widest uppercase rounded-sm transition-all"
            style={{
              background: "rgba(255,40,40,0.06)",
              border: "1px solid rgba(255,40,40,0.25)",
              color: "rgba(255,100,100,0.7)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,40,40,0.12)";
              (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,120,120,0.9)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,40,40,0.06)";
              (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,100,100,0.7)";
            }}
          >
            Clear All
          </button>
        </div>
      </div>

      {/* ── Bottom HUD ── */}
      <div
        className="absolute bottom-0 left-44 right-0 flex items-center gap-5 px-5 h-12"
        style={{
          background: "rgba(5,9,18,0.85)",
          backdropFilter: "blur(8px)",
          borderTop: "1px solid rgba(0,229,255,0.1)",
        }}
      >
        {/* Hovered cell info */}
        <div
          className="text-[10px] font-mono min-w-[220px]"
          style={{ color: "rgba(255,255,255,0.35)" }}
        >
          {hoveredCell ? (
            <>
              <span style={{ color: "rgba(0,229,255,0.7)" }}>
                X:{hoveredCell.x} Y:{hoveredCell.y} Z:{hoveredCell.z}
              </span>
              {" · "}
              <span style={{ color: CARGO[hoveredCell.type].css }}>
                {CARGO[hoveredCell.type].label}
              </span>
              {" · "}
              <span style={{ color: "rgba(255,255,255,0.25)" }}>
                {(hoveredCell.x * SCU).toFixed(2)}m, {(hoveredCell.y * SCU).toFixed(2)}m, {(hoveredCell.z * SCU).toFixed(2)}m
              </span>
            </>
          ) : (
            <span>HOVER A CELL TO INSPECT · LMB click to paint · Drag to orbit</span>
          )}
        </div>

        {/* SCU progress bar */}
        <div className="flex-1 flex items-center gap-3">
          <span
            className="text-[10px] font-mono whitespace-nowrap"
            style={{ color: "rgba(255,255,255,0.3)" }}
          >
            SCU {usedSCU}/{totalSCU}
          </span>

          {/* Stacked bar by cargo type */}
          <div
            className="flex-1 h-2.5 rounded-full overflow-hidden"
            style={{ background: "rgba(255,255,255,0.05)" }}
          >
            {progressSegments.length === 0 ? null : (
              <div className="flex h-full">
                {progressSegments.map((seg) => (
                  <div
                    key={seg.type}
                    className="h-full transition-all duration-300"
                    style={{
                      width: `${seg.pct}%`,
                      backgroundColor: CARGO[seg.type].css,
                    }}
                    title={`${CARGO[seg.type].label}: ${seg.count} SCU`}
                  />
                ))}
              </div>
            )}
          </div>

          <span
            className="text-[10px] font-mono whitespace-nowrap"
            style={{ color: "rgba(255,255,255,0.25)" }}
          >
            {totalSCU > 0
              ? ((usedSCU / totalSCU) * 100).toFixed(0) + "%"
              : "—"}
          </span>
        </div>

        {/* Grid size reminder */}
        <span
          className="text-[9px] font-mono whitespace-nowrap"
          style={{ color: "rgba(255,255,255,0.15)" }}
        >
          {gridX}×{gridY}×{gridZ} · {totalCells} cells
        </span>
      </div>
    </div>
  );
}
