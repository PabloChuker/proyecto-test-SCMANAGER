"use client";
// =============================================================================
// SC LABS — ShipViewer3D
//
// Canvas WebGL que muestra una nave rotando sobre un eje (pitch/yaw/roll)
// o en modo libre con OrbitControls.
//
// Soporta dos fuentes de modelo:
//   1. `glbUrl`: carga GLB real (Cloudflare R2). Cacheado por URL.
//   2. Fallback procedural (`buildShipGeometry`) si no hay URL, mientras se
//      está cargando el GLB, o si la carga falla.
//
// Props:
//   rotationAxis   — "pitch" | "yaw" | "roll" | "free"  (default "free")
//   animate        — habilita rotación automática (default true)
//   animationSpeed — rad/s (default 0.75)
//   shipColor      — hex opcional para teñir el modelo procedural
//   glbUrl         — URL absoluta del .glb; opcional
//   className      — clases extra para el contenedor
// =============================================================================

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { buildShipGeometry, disposeShipGeometry } from "./utils/buildShipGeometry";

export type RotationAxis = "pitch" | "yaw" | "roll" | "free";

export interface ShipViewer3DProps {
  rotationAxis?: RotationAxis;
  animate?: boolean;
  animationSpeed?: number;
  shipColor?: string;
  /**
   * Single URL or ordered list of candidate URLs. When an array is passed the
   * viewer tries each URL in order and keeps the first that loads successfully
   * — this enables "sister ship" fallbacks for variants (Wikelo / PYAM / …).
   */
  glbUrl?: string | string[] | null;
  className?: string;
  showGrid?: boolean;
  showAxis?: boolean;
  transparent?: boolean;
  /** Activa rotación automática en modo "free" (OrbitControls). Default false. */
  autoRotate?: boolean;
  /** Velocidad de autoRotate (default 1.0 = ~30s/vuelta). Valores negativos invierten sentido. */
  autoRotateSpeed?: number;
}

// Color de cada línea de eje según la convención de la nave:
//   X (rojo)  — cola → nariz   → Roll gira sobre este eje
//   Y (verde) — ala  → ala     → Pitch gira sobre este eje
//   Z (azul)  — panza → arriba → Yaw gira sobre este eje
const AXIS_LINE_COLORS: Record<Exclude<RotationAxis, "free">, number> = {
  pitch: 0x22c55e,
  yaw:   0x3b82f6,
  roll:  0xef4444,
};

// ─── Cache de GLB por URL (LRU, máx 20 entradas) ────────────────────────────
// Guardamos la Promise<THREE.Group> una sola vez por URL. Los consumers que
// hagan .then() sobre la misma entrada recibirán el mismo Group y deben
// clonarlo antes de meterlo en su escena (no se puede compartir Object3D).
// El LRU evita que el cache crezca sin límite cuando el usuario navega muchas
// naves distintas: descarta la entrada menos usada recientemente.
class LRUCache<K, V> {
  private readonly max: number;
  private readonly map: Map<K, V>;
  constructor(max: number) { this.max = max; this.map = new Map(); }
  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const v = this.map.get(key)!;
    this.map.delete(key);
    this.map.set(key, v);
    return v;
  }
  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    else if (this.map.size >= this.max) this.map.delete(this.map.keys().next().value!);
    this.map.set(key, value);
  }
  has(key: K): boolean { return this.map.has(key); }
}
const glbCache = new LRUCache<string, Promise<THREE.Group>>(20);

async function loadGlb(url: string): Promise<THREE.Group> {
  let entry = glbCache.get(url);
  if (!entry) {
    entry = (async () => {
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(url);
      const root = gltf.scene;

      const box = new THREE.Box3().setFromObject(root);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      root.position.sub(center);

      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const targetSize = 2.4;
      const scale = targetSize / maxDim;

      const holder = new THREE.Group();
      holder.add(root);
      holder.scale.setScalar(scale);

      return holder;
    })();
    glbCache.set(url, entry);
  }
  return entry;
}

function cloneGlbForScene(source: THREE.Group): THREE.Group {
  const cloned = source.clone(true);
  cloned.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      if (Array.isArray(obj.material)) {
        obj.material = obj.material.map((m) => m.clone());
      } else if (obj.material) {
        obj.material = obj.material.clone();
      }
    }
  });
  return cloned;
}

function disposeClonedGlb(group: THREE.Group): void {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => m.dispose());
      } else if (obj.material) {
        obj.material.dispose();
      }
    }
  });
}

export function ShipViewer3D({
  rotationAxis = "free",
  animate = true,
  animationSpeed = 0.75,
  shipColor,
  glbUrl,
  className = "",
  showGrid = true,
  showAxis = true,
  transparent = false,
  autoRotate = false,
  autoRotateSpeed = 1.0,
}: ShipViewer3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const container = canvas.parentElement!;

    const W = container.clientWidth  || 200;
    const H = container.clientHeight || 200;

    const scene = new THREE.Scene();
    if (!transparent) scene.background = new THREE.Color(0x09090b);

    const camera = new THREE.PerspectiveCamera(36, W / H, 0.1, 80);
    camera.position.set(1.7, 0.95, 2.1);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: transparent });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    scene.add(new THREE.AmbientLight(0xffffff, 0.45));

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
    keyLight.position.set(2, 3, 2);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x22d3ee, 0.50);
    rimLight.position.set(-2, 0.5, -1.5);
    scene.add(rimLight);

    const fillLight = new THREE.DirectionalLight(0x818cf8, 0.18);
    fillLight.position.set(0, -2, 1);
    scene.add(fillLight);

    if (showGrid) {
      const grid = new THREE.GridHelper(7, 14, 0x27272a, 0x18181b);
      grid.position.y = -0.55;
      scene.add(grid);
    }

    let shipGroup: THREE.Group = buildShipGeometry(shipColor);
    let shipIsGlb = false;
    scene.add(shipGroup);

    let cancelled = false;
    const glbCandidates: string[] = Array.isArray(glbUrl)
      ? glbUrl.filter((u): u is string => !!u)
      : glbUrl
        ? [glbUrl]
        : [];

    if (glbCandidates.length > 0) {
      (async () => {
        for (let i = 0; i < glbCandidates.length; i++) {
          const url = glbCandidates[i];
          try {
            const source = await loadGlb(url);
            if (cancelled) return;
            scene.remove(shipGroup);
            disposeShipGeometry(shipGroup);
            shipGroup = cloneGlbForScene(source);
            shipIsGlb = true;
            scene.add(shipGroup);
            return;
          } catch (err) {
            if (cancelled) return;
            const isLast = i === glbCandidates.length - 1;
            if (isLast) {
              console.warn("[ShipViewer3D] All GLB candidates failed, keeping procedural:", glbCandidates, err);
            } else {
              console.info("[ShipViewer3D] GLB failed, trying sister fallback:", url);
            }
          }
        }
      })();
    }

    let axisLine: THREE.Line | null = null;
    if (showAxis && rotationAxis !== "free") {
      const pts =
        rotationAxis === "pitch"
          ? [new THREE.Vector3(-1.6, 0, 0), new THREE.Vector3(1.6, 0, 0)]
          : rotationAxis === "yaw"
          ? [new THREE.Vector3(0, -1.6, 0), new THREE.Vector3(0, 1.6, 0)]
          : [new THREE.Vector3(0, 0, -1.6), new THREE.Vector3(0, 0, 1.6)];

      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({
        color: AXIS_LINE_COLORS[rotationAxis],
        transparent: true,
        opacity: 0.42,
      });
      axisLine = new THREE.Line(geo, mat);
      scene.add(axisLine);
    }

    let controls: { update(): void; dispose(): void } | null = null;
    let ctrlReady = false;

    if (rotationAxis === "free") {
      import("three/examples/jsm/controls/OrbitControls.js").then(({ OrbitControls }) => {
        if (cancelled) return;
        const ctrl = new OrbitControls(camera, renderer.domElement);
        ctrl.enableDamping    = true;
        ctrl.dampingFactor    = 0.07;
        ctrl.minDistance      = 1.5;
        ctrl.maxDistance      = 14;
        ctrl.autoRotate       = autoRotate;
        ctrl.autoRotateSpeed  = autoRotateSpeed;
        controls  = ctrl;
        ctrlReady = true;
      });
    }

    let lastMs = performance.now();
    let rafId  = 0;
    let loopRunning = false;
    let isVisible   = !document.hidden; // tab visibility
    let isInView    = false;            // viewport intersection

    const loop = () => {
      rafId = requestAnimationFrame(loop);
      const now = performance.now();
      const dt  = Math.min((now - lastMs) / 1000, 0.1);
      lastMs = now;

      if (animate && rotationAxis !== "free") {
        switch (rotationAxis) {
          case "pitch": shipGroup.rotation.x += animationSpeed * dt; break;
          case "yaw":   shipGroup.rotation.y += animationSpeed * dt; break;
          case "roll":  shipGroup.rotation.z += animationSpeed * dt; break;
        }
      }

      if (ctrlReady) controls!.update();
      renderer.render(scene, camera);
    };

    const startLoop = () => {
      if (loopRunning || cancelled) return;
      loopRunning = true;
      lastMs = performance.now();
      loop();
    };

    const stopLoop = () => {
      loopRunning = false;
      cancelAnimationFrame(rafId);
      rafId = 0;
    };

    /** Only run RAF when BOTH the tab is visible AND the canvas is in viewport */
    const syncLoop = () => {
      if (isVisible && isInView) startLoop();
      else stopLoop();
    };

    const onVisibilityChange = () => {
      isVisible = !document.hidden;
      syncLoop();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    // IntersectionObserver: pause RAF when scrolled out of viewport
    const io = new IntersectionObserver(
      ([entry]) => { isInView = entry.isIntersecting; syncLoop(); },
      { threshold: 0 },
    );
    io.observe(container);

    syncLoop();

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
      cancelled = true;
      stopLoop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      io.disconnect();
      ro.disconnect();
      controls?.dispose();

      if (axisLine) {
        (axisLine.geometry as THREE.BufferGeometry).dispose();
        (axisLine.material as THREE.Material).dispose();
      }

      if (shipIsGlb) {
        disposeClonedGlb(shipGroup);
      } else {
        disposeShipGeometry(shipGroup);
      }
      renderer.dispose();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rotationAxis, animate, animationSpeed, shipColor, glbUrl, autoRotate, autoRotateSpeed]);

  return (
    <div className={`relative w-full h-full${className ? ` ${className}` : ""}`}>
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
}
