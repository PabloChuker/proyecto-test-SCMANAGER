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
  glbUrl?: string | null;
  className?: string;
}

// Color de cada línea de eje según la convención de la nave:
//   X (rojo)  — cola → nariz   → Roll gira sobre este eje
//   Y (verde) — ala  → ala     → Pitch gira sobre este eje
//   Z (azul)  — panza → arriba → Yaw gira sobre este eje
const AXIS_LINE_COLORS: Record<Exclude<RotationAxis, "free">, number> = {
  pitch: 0x22c55e, // verde — eje Y (ala→ala)
  yaw:   0x3b82f6, // azul  — eje Z (panza→arriba)
  roll:  0xef4444, // rojo  — eje X (cola→nariz)
};

// ─── Cache de GLB por URL ────────────────────────────────────────────────────
// Guardamos la Promise<THREE.Group> una sola vez por URL. Los consumers que
// hagan .then() sobre la misma entrada recibirán el mismo Group y deben
// clonarlo antes de meterlo en su escena (no se puede compartir Object3D).
const glbCache = new Map<string, Promise<THREE.Group>>();

async function loadGlb(url: string): Promise<THREE.Group> {
  let entry = glbCache.get(url);
  if (!entry) {
    entry = (async () => {
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(url);
      const root = gltf.scene;

      // Normalizar: centrar y escalar para que el bounding box quepa en ±0.9
      const box = new THREE.Box3().setFromObject(root);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      // IMPORTANTE: no podemos setear position y scale en el mismo nodo,
      // porque la matriz local se computa como T(position) * S(scale), y
      // una traslación por -center seguida de escala deja el modelo en
      // `center * (scale - 1)` — o sea, descentrado del eje de rotación.
      // Solución: centrar en el nodo interno (position = -center) y
      // escalar en un Group envolvente. Resultado: S_outer * T_inner * v
      // = scale * (v - center), centrado correctamente en el origen.
      root.position.sub(center);

      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const targetSize = 2.4; // antes 1.8 — naves más grandes dentro del viewer
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
  // Clon profundo: geometría compartida, materiales clonados para evitar
  // que un dispose en una instancia rompa las otras.
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
      // Geometría NO se dispone: es compartida con el source cacheado.
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
}: ShipViewer3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const container = canvas.parentElement!;

    const W = container.clientWidth  || 200;
    const H = container.clientHeight || 200;

    // ─── Escena ───────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x09090b); // zinc-950

    // Cámara: fov más cerrado + cámara más cerca ⇒ la nave ocupa más frame
    const camera = new THREE.PerspectiveCamera(36, W / H, 0.1, 80);
    camera.position.set(1.7, 0.95, 2.1);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // ─── Luces ────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.45));

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
    keyLight.position.set(2, 3, 2);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x22d3ee, 0.50); // cyan rim
    rimLight.position.set(-2, 0.5, -1.5);
    scene.add(rimLight);

    const fillLight = new THREE.DirectionalLight(0x818cf8, 0.18); // indigo fill
    fillLight.position.set(0, -2, 1);
    scene.add(fillLight);

    // ─── Grid de suelo ────────────────────────────────────────────────────
    const grid = new THREE.GridHelper(7, 14, 0x27272a, 0x18181b);
    grid.position.y = -0.55;
    scene.add(grid);

    // ─── Nave: arrancamos con la procedural, luego swap al GLB si carga ──
    let shipGroup: THREE.Group = buildShipGeometry(shipColor);
    let shipIsGlb = false;
    scene.add(shipGroup);

    let cancelled = false;
    if (glbUrl) {
      loadGlb(glbUrl)
        .then((source) => {
          if (cancelled) return;
          // Swap: remover la procedural y montar el GLB clonado
          scene.remove(shipGroup);
          disposeShipGeometry(shipGroup);
          shipGroup = cloneGlbForScene(source);
          shipIsGlb = true;
          scene.add(shipGroup);
        })
        .catch((err) => {
          if (cancelled) return;
          console.warn("[ShipViewer3D] GLB load failed, keeping procedural:", glbUrl, err);
        });
    }

    // ─── Línea del eje de rotación ─────────────────────────────────────────
    let axisLine: THREE.Line | null = null;
    if (rotationAxis !== "free") {
      // pitch → eje Y (ala→ala), yaw → eje Z (panza→arriba), roll → eje X (cola→nariz)
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

    // ─── OrbitControls (solo en modo "free") ──────────────────────────────
    let controls: { update(): void; dispose(): void } | null = null;
    let ctrlReady = false;

    if (rotationAxis === "free") {
      import("three/examples/jsm/controls/OrbitControls.js").then(({ OrbitControls }) => {
        if (cancelled) return;
        const ctrl = new OrbitControls(camera, renderer.domElement);
        ctrl.enableDamping = true;
        ctrl.dampingFactor = 0.07;
        ctrl.minDistance   = 1.5;
        ctrl.maxDistance   = 14;
        controls  = ctrl;
        ctrlReady = true;
      });
    }

    // ─── Loop de animación ────────────────────────────────────────────────
    let lastMs = performance.now();
    let rafId  = 0;
    let loopRunning = false;

    const loop = () => {
      rafId = requestAnimationFrame(loop);

      // Pausar rendering durante drag (evita presión GPU que crashea el tab)
      if (document.body.hasAttribute("data-dnd-active")) return;

      const now = performance.now();
      const dt  = Math.min((now - lastMs) / 1000, 0.1); // cap a 100 ms
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

    // Page Visibility API: pausar el RAF cuando el tab está en background.
    // Evita que múltiples instancias Three.js acumulen GPU time y crasheen
    // el renderer cuando el usuario tiene varios tabs abiertos.
    const onVisibilityChange = () => {
      if (document.hidden) {
        stopLoop();
      } else {
        startLoop();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    // Arrancar solo si el tab está visible
    if (!document.hidden) startLoop();

    // ─── Resize observer ──────────────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(container);

    // ─── Cleanup ──────────────────────────────────────────────────────────
    return () => {
      cancelled = true;
      stopLoop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
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
  }, [rotationAxis, animate, animationSpeed, shipColor, glbUrl]);

  return (
    <div className={`relative w-full h-full${className ? ` ${className}` : ""}`}>
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
}
