"use client";
// =============================================================================
// SC LABS — CargoGrid3D
// Visualizador 3D de cargo grids con Three.js.
//
// Features:
//   · InstancedMesh — un draw call para todas las celdas SCU
//   · OrbitControls — rotar (LMB), zoom (scroll), pan (RMB)
//   · Click en celdas para pintar tipo de cargo (place / erase)
//   · Quick-fill por capa Y, clear all
//   · HUD: info de celda hovereada + barra SCU stacked por tipo
//   · Estética sci-fi: #0a0e17 fondo, #00e5ff cyan
//
// 1 SCU = 1.25 × 1.25 × 1.25 m. Dimensiones en BD son múltiplos de 1.25.
// =============================================================================

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import type { CargoGridData } from "./CargoPage";

// ─── Constantes ──────────────────────────────────────────────────────────────

const SCU         = 1.25;   // metros por arista de celda
const CELL_SCALE  = 0.84;   // escala visual (gap entre celdas)

// ─── Tipos de cargo ───────────────────────────────────────────────────────────

type CargoType = "empty" | "medical" | "minerals" | "weapons" | "food" | "electronics" | "fuel";
type Tool      = "place" | "erase";

const CARGO: Record<CargoType, { label: string; hex: number; css: string }> = {
  empty:       { label: "Empty",       hex: 0x0c1825, css: "#0c1825" },
  medical:     { label: "Medical",     hex: 0x00cc77, css: "#00cc77" },
  minerals:    { label: "Minerals",    hex: 0xee7700, css: "#ee7700" },
  weapons:     { label: "Weapons",     hex: 0xff2222, css: "#ff2222" },
  food:        { label: "Food",        hex: 0xddcc00, css: "#ddcc00" },
  electronics: { label: "Electronics", hex: 0x0099ff, css: "#0099ff" },
  fuel:        { label: "Fuel",        hex: 0xbb33ff, css: "#bb33ff" },
};

const FILLED = (Object.keys(CARGO) as CargoType[]).filter((t) => t !== "empty");

// ─── Helpers ─────────────────────────────────────────────────────────────────

const key  = (x: number, y: number, z: number) => `${x},${y},${z}`;
const iid  = (x: number, y: number, z: number, gx: number, gy: number) =>
  z * gx * gy + y * gx + x;

// ─── Component ───────────────────────────────────────────────────────────────

interface HoveredCell { x: number; y: number; z: number; type: CargoType }

export function CargoGrid3D({ grid }: { grid: CargoGridData | null }) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const meshRef      = useRef<THREE.InstancedMesh | null>(null);
  const cameraRef    = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef  = useRef<{ update(): void; dispose(): void } | null>(null);
  const animRef      = useRef(0);
  const idToXYZRef   = useRef<Map<number, [number, number, number]>>(new Map());
  const dimsRef      = useRef({ gx: 0, gy: 0, gz: 0 });

  // Refs para event handlers (evitan closures rancios)
  const activeTypeRef = useRef<CargoType>("medical");
  const toolRef       = useRef<Tool>("place");
  const cargoMapRef   = useRef<Map<string, CargoType>>(new Map());
  const mouseRef      = useRef({ downX: 0, downY: 0, isDown: false, moved: false });

  // React state — solo para UI
  const [activeType, setActiveType] = useState<CargoType>("medical");
  const [tool, setTool]             = useState<Tool>("place");
  const [hovered, setHovered]       = useState<HoveredCell | null>(null);
  const [stats, setStats]           = useState<Record<CargoType, number>>(
    () => Object.fromEntries(FILLED.map((t) => [t, 0])) as Record<CargoType, number>,
  );

  useEffect(() => { activeTypeRef.current = activeType; }, [activeType]);
  useEffect(() => { toolRef.current = tool; }, [tool]);

  // Dimensiones derivadas del prop (sin state)
  const gx = grid ? Math.max(1, Math.round(grid.dimensions.x / SCU)) : 0;
  const gy = grid ? Math.max(1, Math.round(grid.dimensions.y / SCU)) : 0;
  const gz = grid ? Math.max(1, Math.round(grid.dimensions.z / SCU)) : 0;
  const totalSCU  = grid?.scuCapacity ?? 0;
  const usedSCU   = Object.values(stats).reduce((a, b) => a + b, 0);

  // ── Actualizar color de una celda en GPU ──────────────────────────────────
  const paintCell = useCallback((x: number, y: number, z: number, type: CargoType) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const { gx: dgx, gy: dgy } = dimsRef.current;
    mesh.setColorAt(iid(x, y, z, dgx, dgy), new THREE.Color(CARGO[type].hex));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, []);

  // ── Sincronizar stats de React ────────────────────────────────────────────
  const syncStats = useCallback(() => {
    const s = Object.fromEntries(FILLED.map((t) => [t, 0])) as Record<CargoType, number>;
    for (const t of cargoMapRef.current.values()) if (t !== "empty") s[t]++;
    setStats({ ...s });
  }, []);

  // ── Aplicar herramienta a celda ───────────────────────────────────────────
  const applyTool = useCallback((x: number, y: number, z: number) => {
    const type: CargoType = toolRef.current === "erase" ? "empty" : activeTypeRef.current;
    if (type === "empty") cargoMapRef.current.delete(key(x, y, z));
    else                  cargoMapRef.current.set(key(x, y, z), type);
    paintCell(x, y, z, type);
    syncStats();
  }, [paintCell, syncStats]);

  // ── Rellenar capa Y ───────────────────────────────────────────────────────
  const fillLayer = useCallback((y: number) => {
    const { gx: dgx, gy: dgy, gz: dgz } = dimsRef.current;
    if (y < 0 || y >= dgy) return;
    const type: CargoType = toolRef.current === "erase" ? "empty" : activeTypeRef.current;
    for (let z = 0; z < dgz; z++)
      for (let x = 0; x < dgx; x++) {
        if (type === "empty") cargoMapRef.current.delete(key(x, y, z));
        else                  cargoMapRef.current.set(key(x, y, z), type);
        paintCell(x, y, z, type);
      }
    syncStats();
  }, [paintCell, syncStats]);

  // ── Limpiar todo ──────────────────────────────────────────────────────────
  const clearAll = useCallback(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const { gx: dgx, gy: dgy, gz: dgz } = dimsRef.current;
    cargoMapRef.current.clear();
    const empty = new THREE.Color(CARGO.empty.hex);
    for (let i = 0; i < dgx * dgy * dgz; i++) mesh.setColorAt(i, empty);
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    syncStats();
  }, [syncStats]);

  // ── Setup Three.js (se ejecuta cuando cambia el grid) ────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !grid) return;
    const container = canvas.parentElement!;

    // Limpiar escena anterior
    cancelAnimationFrame(animRef.current);
    meshRef.current = null;
    cargoMapRef.current.clear();
    idToXYZRef.current.clear();
    setHovered(null);
    setStats(Object.fromEntries(FILLED.map((t) => [t, 0])) as Record<CargoType, number>);

    const dgx = Math.max(1, Math.round(grid.dimensions.x / SCU));
    const dgy = Math.max(1, Math.round(grid.dimensions.y / SCU));
    const dgz = Math.max(1, Math.round(grid.dimensions.z / SCU));
    dimsRef.current = { gx: dgx, gy: dgy, gz: dgz };

    const worldW  = dgx * SCU;
    const worldH  = dgy * SCU;
    const worldD  = dgz * SCU;
    const center  = new THREE.Vector3(worldW / 2, worldH / 2, worldD / 2);
    const maxDim  = Math.max(worldW, worldH, worldD);

    // Escena
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0e17);
    scene.fog = new THREE.FogExp2(0x0a0e17, 0.015);

    // Cámara
    const W = container.clientWidth || 800;
    const H = container.clientHeight || 600;
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 2000);
    camera.position.set(center.x + maxDim * 1.3, center.y + maxDim * 0.9, center.z + maxDim * 1.8);
    camera.lookAt(center);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Luces
    scene.add(new THREE.AmbientLight(0x1a2e44, 4.0));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(center.x + maxDim, center.y + maxDim * 2, center.z + maxDim);
    scene.add(dir);
    const accent = new THREE.PointLight(0x00e5ff, 2.0, maxDim * 5);
    accent.position.set(center.x, center.y + worldH + maxDim * 0.5, center.z);
    scene.add(accent);

    // Wireframe del límite del grid
    const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(worldW, worldH, worldD));
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.35 });
    const edge = new THREE.LineSegments(edgeGeo, edgeMat);
    edge.position.copy(center);
    scene.add(edge);

    // Grid helper (suelo)
    const gh = new THREE.GridHelper(Math.max(worldW, worldD) * 2, Math.max(dgx, dgz) * 2, 0x00e5ff, 0x0d1929);
    gh.position.set(center.x, -0.01, center.z);
    (gh.material as THREE.Material).transparent = true;
    (gh.material as THREE.Material).opacity = 0.15;
    scene.add(gh);

    // Ejes XYZ (referencia de orientación)
    const axisLen = SCU * 1.5;
    const O = new THREE.Vector3(0, 0, 0);
    const mkAxis = (dir: THREE.Vector3, color: number) =>
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([O, O.clone().add(dir.clone().multiplyScalar(axisLen))]),
        new THREE.LineBasicMaterial({ color }),
      );
    scene.add(mkAxis(new THREE.Vector3(1, 0, 0), 0xff4444));
    scene.add(mkAxis(new THREE.Vector3(0, 1, 0), 0x44ff44));
    scene.add(mkAxis(new THREE.Vector3(0, 0, 1), 0x4488ff));

    // InstancedMesh — una celda por SCU
    const cellGeo = new THREE.BoxGeometry(SCU * CELL_SCALE, SCU * CELL_SCALE, SCU * CELL_SCALE);
    const cellMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.7 });
    const total   = dgx * dgy * dgz;
    const instMesh = new THREE.InstancedMesh(cellGeo, cellMat, total);
    instMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    meshRef.current = instMesh;

    const mtx      = new THREE.Matrix4();
    const empty    = new THREE.Color(CARGO.empty.hex);
    const idToXYZ  = new Map<number, [number, number, number]>();
    let idx = 0;

    for (let z = 0; z < dgz; z++)
      for (let y = 0; y < dgy; y++)
        for (let x = 0; x < dgx; x++) {
          mtx.setPosition(x * SCU + SCU / 2, y * SCU + SCU / 2, z * SCU + SCU / 2);
          instMesh.setMatrixAt(idx, mtx);
          instMesh.setColorAt(idx, empty);
          idToXYZ.set(idx, [x, y, z]);
          idx++;
        }

    instMesh.instanceMatrix.needsUpdate = true;
    if (instMesh.instanceColor) instMesh.instanceColor.needsUpdate = true;
    idToXYZRef.current = idToXYZ;
    scene.add(instMesh);

    // OrbitControls (import dinámico — solo client)
    let ctrlLoaded = false;
    import("three/examples/jsm/controls/OrbitControls.js").then(({ OrbitControls }) => {
      const ctrl = new OrbitControls(camera, renderer.domElement);
      ctrl.target.copy(center);
      ctrl.enableDamping   = true;
      ctrl.dampingFactor   = 0.06;
      ctrl.minDistance     = SCU * 2;
      ctrl.maxDistance     = maxDim * 12;
      ctrl.mouseButtons    = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
      controlsRef.current  = ctrl;
      ctrlLoaded = true;
    });

    // Loop de animación
    let rafId = 0;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      if (ctrlLoaded) controlsRef.current?.update();
      renderer.render(scene, camera);
    };
    animate();
    animRef.current = rafId;

    // Raycaster e interacción con celdas
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    const hitCell = (cx: number, cy: number): [number, number, number] | null => {
      const rect = canvas.getBoundingClientRect();
      ndc.x = ((cx - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((cy - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObject(instMesh);
      if (!hits.length || hits[0].instanceId == null) return null;
      return idToXYZ.get(hits[0].instanceId) ?? null;
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
        const [cx2, cy2, cz2] = cell;
        setHovered({ x: cx2, y: cy2, z: cz2, type: cargoMapRef.current.get(key(cx2, cy2, cz2)) ?? "empty" });
      } else {
        setHovered(null);
      }
    };
    const onUp = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (mouseRef.current.isDown && !mouseRef.current.moved) {
        const cell = hitCell(e.clientX, e.clientY);
        if (cell) applyTool(cell[0], cell[1], cell[2]);
      }
      mouseRef.current.isDown = false;
    };

    canvas.addEventListener("mousedown", onDown);
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseup",   onUp);

    // ResizeObserver
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
      edgeGeo.dispose();
      edgeMat.dispose();
    };
  }, [grid, applyTool]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Empty state ───────────────────────────────────────────────────────────
  if (!grid) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3" style={{ color: "rgba(255,255,255,0.15)" }}>
        <div className="text-4xl" style={{ filter: "grayscale(1) opacity(0.3)" }}>▣</div>
        <p className="text-xs tracking-[0.3em] uppercase">Selecciona una nave para visualizar su cargo grid</p>
      </div>
    );
  }

  // Segmentos de la barra de progreso
  const segments = FILLED
    .map((t) => ({ type: t, count: stats[t] ?? 0, pct: totalSCU > 0 ? ((stats[t] ?? 0) / totalSCU) * 100 : 0 }))
    .filter((s) => s.count > 0);

  return (
    <div className="relative w-full h-full">
      {/* Canvas Three.js */}
      <canvas ref={canvasRef} className="w-full h-full block" />

      {/* ── Panel de controles (izquierda) ── */}
      <div
        className="absolute top-0 left-0 bottom-0 w-44 flex flex-col py-4 px-3 gap-5 overflow-y-auto"
        style={{ background: "rgba(5,9,18,0.88)", backdropFilter: "blur(8px)", borderRight: "1px solid rgba(0,229,255,0.12)" }}
      >
        {/* Info del grid */}
        <div>
          <p className="text-[9px] tracking-[0.2em] uppercase mb-1" style={{ color: "rgba(0,229,255,0.5)" }}>Grid</p>
          <p className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.5)" }}>{gx} × {gy} × {gz} celdas</p>
          <p className="text-[10px] font-mono mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>
            {(gx * SCU).toFixed(2)}m × {(gy * SCU).toFixed(2)}m × {(gz * SCU).toFixed(2)}m
          </p>
        </div>

        {/* Herramienta */}
        <div>
          <p className="text-[9px] tracking-[0.2em] uppercase mb-2" style={{ color: "rgba(0,229,255,0.5)" }}>Herramienta</p>
          {(["place", "erase"] as Tool[]).map((t) => (
            <button
              key={t}
              onClick={() => setTool(t)}
              className="w-full text-left px-2.5 py-1.5 text-[11px] rounded-sm mb-1 transition-all"
              style={tool === t
                ? { background: "rgba(0,229,255,0.12)", border: "1px solid rgba(0,229,255,0.35)", color: "#00e5ff" }
                : { background: "transparent", border: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.35)" }}
            >
              {t === "place" ? "＋ Colocar" : "× Borrar"}
            </button>
          ))}
        </div>

        {/* Tipo de cargo */}
        <div>
          <p className="text-[9px] tracking-[0.2em] uppercase mb-2" style={{ color: "rgba(0,229,255,0.5)" }}>Tipo de Cargo</p>
          {FILLED.map((t) => {
            const active = activeType === t && tool === "place";
            return (
              <button
                key={t}
                onClick={() => { setActiveType(t); setTool("place"); }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] rounded-sm mb-1 transition-all"
                style={active
                  ? { background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)", color: "#e8f4ff" }
                  : { background: "transparent", border: "1px solid transparent", color: "rgba(255,255,255,0.4)" }}
              >
                <span
                  className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: CARGO[t].css, boxShadow: active ? `0 0 6px ${CARGO[t].css}88` : "none" }}
                />
                <span>{CARGO[t].label}</span>
                {(stats[t] ?? 0) > 0 && (
                  <span className="ml-auto text-[9px] font-mono" style={{ color: CARGO[t].css + "99" }}>
                    {stats[t]}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Rellenar capa Y */}
        <div>
          <p className="text-[9px] tracking-[0.2em] uppercase mb-2" style={{ color: "rgba(0,229,255,0.5)" }}>Fill Layer Y</p>
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: gy }, (_, y) => (
              <button
                key={y}
                onClick={() => fillLayer(y)}
                className="w-7 h-7 text-[10px] font-mono rounded-sm transition-all"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.45)" }}
                onMouseEnter={(e) => {
                  const b = e.currentTarget as HTMLButtonElement;
                  b.style.background = "rgba(0,229,255,0.12)";
                  b.style.color = "#00e5ff";
                  b.style.borderColor = "rgba(0,229,255,0.3)";
                }}
                onMouseLeave={(e) => {
                  const b = e.currentTarget as HTMLButtonElement;
                  b.style.background = "rgba(255,255,255,0.04)";
                  b.style.color = "rgba(255,255,255,0.45)";
                  b.style.borderColor = "rgba(255,255,255,0.1)";
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
            style={{ background: "rgba(255,40,40,0.06)", border: "1px solid rgba(255,40,40,0.25)", color: "rgba(255,100,100,0.7)" }}
            onMouseEnter={(e) => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.background = "rgba(255,40,40,0.12)";
              b.style.color = "rgba(255,120,120,0.9)";
            }}
            onMouseLeave={(e) => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.background = "rgba(255,40,40,0.06)";
              b.style.color = "rgba(255,100,100,0.7)";
            }}
          >
            Clear All
          </button>
        </div>
      </div>

      {/* ── HUD inferior ── */}
      <div
        className="absolute bottom-0 left-44 right-0 flex items-center gap-5 px-5 h-12"
        style={{ background: "rgba(5,9,18,0.88)", backdropFilter: "blur(8px)", borderTop: "1px solid rgba(0,229,255,0.1)" }}
      >
        {/* Info celda hovereada */}
        <div className="text-[10px] font-mono min-w-[240px]" style={{ color: "rgba(255,255,255,0.35)" }}>
          {hovered ? (
            <>
              <span style={{ color: "rgba(0,229,255,0.7)" }}>X:{hovered.x} Y:{hovered.y} Z:{hovered.z}</span>
              {" · "}
              <span style={{ color: CARGO[hovered.type].css }}>{CARGO[hovered.type].label}</span>
              {" · "}
              <span style={{ color: "rgba(255,255,255,0.25)" }}>
                {(hovered.x * SCU).toFixed(2)}m, {(hovered.y * SCU).toFixed(2)}m, {(hovered.z * SCU).toFixed(2)}m
              </span>
            </>
          ) : (
            <span>Hover para inspeccionar · LMB click para pintar · Arrastrar para orbitar</span>
          )}
        </div>

        {/* Barra SCU stacked */}
        <div className="flex-1 flex items-center gap-3">
          <span className="text-[10px] font-mono whitespace-nowrap" style={{ color: "rgba(255,255,255,0.3)" }}>
            SCU {usedSCU}/{totalSCU}
          </span>
          <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
            {segments.length > 0 && (
              <div className="flex h-full">
                {segments.map((s) => (
                  <div
                    key={s.type}
                    className="h-full transition-all duration-300"
                    style={{ width: `${s.pct}%`, backgroundColor: CARGO[s.type].css }}
                    title={`${CARGO[s.type].label}: ${s.count} SCU`}
                  />
                ))}
              </div>
            )}
          </div>
          <span className="text-[10px] font-mono whitespace-nowrap" style={{ color: "rgba(255,255,255,0.25)" }}>
            {totalSCU > 0 ? `${((usedSCU / totalSCU) * 100).toFixed(0)}%` : "—"}
          </span>
        </div>

        <span className="text-[9px] font-mono whitespace-nowrap" style={{ color: "rgba(255,255,255,0.15)" }}>
          {gx}×{gy}×{gz} · {gx * gy * gz} cells
        </span>
      </div>
    </div>
  );
}
