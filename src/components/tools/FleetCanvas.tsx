"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import * as THREE from "three";
import { X, Plus, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { useHangarStore } from "@/store/useHangarStore";
import type { HangarShip } from "@/store/useHangarStore";
import { shipGlbCandidates } from "@/lib/shipGlb";

// ─── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = "sc-labs-fleet-scene-v1";
const SHIP_NORM   = 3.0;   // longest axis normalized to this many units
const SHIP_GAP    = 1.8;   // gap between adjacent ships

// ─── Types ─────────────────────────────────────────────────────────────────────

interface FleetShip {
  id:           string;
  reference:    string;
  name:         string;
  manufacturer: string;
  imageUrl?:    string;
}

interface ApiShip {
  id:           number;
  reference:    string;
  name:         string;
  manufacturer: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 11); }
function isShipItem(s: HangarShip) {
  return s.itemCategory === "standalone_ship" || s.itemCategory === "game_package";
}

// ─── GLB loader (LRU cache, shared across additions) ───────────────────────────

class LRU<K, V> {
  private max: number; private map = new Map<K, V>();
  constructor(max: number) { this.max = max; }
  get(k: K) {
    const v = this.map.get(k); if (v === undefined) return undefined;
    this.map.delete(k); this.map.set(k, v); return v;
  }
  set(k: K, v: V) {
    if (this.map.has(k)) this.map.delete(k);
    else if (this.map.size >= this.max) this.map.delete(this.map.keys().next().value!);
    this.map.set(k, v);
  }
  has(k: K) { return this.map.has(k); }
}
const glbCache = new LRU<string, Promise<THREE.Group>>(30);

function loadGlbRaw(url: string): Promise<THREE.Group> {
  if (!glbCache.has(url)) {
    const p = import("three/examples/jsm/loaders/GLTFLoader.js")
      .then(({ GLTFLoader }) => new GLTFLoader().loadAsync(url))
      .then((gltf) => gltf.scene as THREE.Group);
    glbCache.set(url, p);
  }
  return glbCache.get(url)!;
}

async function tryLoadGlb(candidates: string[]): Promise<THREE.Group | null> {
  for (const url of candidates) {
    try { return await loadGlbRaw(url); } catch { /* next */ }
  }
  return null;
}

// Normalize source GLB: longest axis → SHIP_NORM, bottom at Y=0, centered XZ
function buildShipPivot(source: THREE.Group): { pivot: THREE.Group; halfWidth: number } {
  const clone = source.clone(true);
  clone.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.castShadow = true;
    obj.material = Array.isArray(obj.material)
      ? obj.material.map((m) => m.clone())
      : obj.material?.clone() ?? obj.material;
  });

  // Pre-scale bounding box
  const box0 = new THREE.Box3().setFromObject(clone);
  const size0 = new THREE.Vector3(); box0.getSize(size0);
  const scale = SHIP_NORM / (Math.max(size0.x, size0.y, size0.z) || 1);
  clone.scale.setScalar(scale);
  clone.updateMatrixWorld(true);

  // Post-scale bounding box for grounding and sizing
  const box1 = new THREE.Box3().setFromObject(clone);
  const ctr  = new THREE.Vector3(); box1.getCenter(ctr);
  const sz1  = new THREE.Vector3(); box1.getSize(sz1);

  clone.position.set(-ctr.x, -box1.min.y, -ctr.z);

  const pivot = new THREE.Group();
  pivot.add(clone);
  return { pivot, halfWidth: Math.max(sz1.x / 2, 0.5) };
}

function buildFallbackPivot(): { pivot: THREE.Group; halfWidth: number } {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.5, 3.8),
    new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.5, roughness: 0.5 }),
  );
  mesh.castShadow = true;
  mesh.position.y = 0.25;
  const pivot = new THREE.Group(); pivot.add(mesh);
  return { pivot, halfWidth: 0.8 };
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function FleetCanvas() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const allShips = useHangarStore((state) => state.ships);
  const hangarShipList = useMemo(
    () => mounted
      ? allShips.filter((s) => isShipItem(s) && s.shipReference && s.location === "hangar")
      : [],
    [mounted, allShips],
  );

  const [fleet,          setFleet]          = useState<FleetShip[]>([]);
  const [sidebarOpen,    setSidebarOpen]    = useState(true);
  const [activeTab,      setActiveTab]      = useState<"hangar" | "catalog">("hangar");
  const [searchQuery,    setSearchQuery]    = useState("");
  const [catalogShips,   setCatalogShips]   = useState<ApiShip[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  const mountRef = useRef<HTMLDivElement>(null);

  // Three.js refs — never in React state
  const threeRef = useRef<{
    scene:    THREE.Scene;
    camera:   THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: { update(): void; dispose(): void; target: THREE.Vector3 } | null;
    raf:      number;
    ships:    Map<string, { pivot: THREE.Group; halfWidth: number }>;
    order:    string[];   // insertion order for layout
  } | null>(null);

  const loadingRef = useRef(new Set<string>());  // ids currently loading

  // ─── Scene init (once) ───────────────────────────────────────────────────

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const W = el.clientWidth  || 800;
    const H = el.clientHeight || 600;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x08080e);
    scene.fog        = new THREE.FogExp2(0x08080e, 0.016);

    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 200);
    camera.position.set(0, 5, 14);
    camera.lookAt(0, 1, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));

    const key = new THREE.DirectionalLight(0xffffff, 2.5);
    key.position.set(8, 14, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -20; key.shadow.camera.right  = 20;
    key.shadow.camera.top  = 20;  key.shadow.camera.bottom = -20;
    key.shadow.camera.far  = 80;
    scene.add(key);

    const rim = new THREE.DirectionalLight(0x22d3ee, 0.65);
    rim.position.set(-6, 3, -6);
    scene.add(rim);

    const fill = new THREE.DirectionalLight(0x818cf8, 0.2);
    fill.position.set(0, -1, 4);
    scene.add(fill);

    // Ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: 0x0c0c14, roughness: 1 }),
    );
    ground.rotation.x    = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.position.y    = -0.005;
    scene.add(ground);

    scene.add(new THREE.GridHelper(100, 100, 0x18182a, 0x10101a));

    // Render loop
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      threeRef.current?.controls?.update();
      renderer.render(scene, camera);
    };
    loop();

    // OrbitControls (async import)
    import("three/examples/jsm/controls/OrbitControls.js").then(({ OrbitControls }) => {
      if (!threeRef.current) return;
      const ctrl = new OrbitControls(camera, renderer.domElement);
      ctrl.enableDamping = true;
      ctrl.dampingFactor = 0.07;
      ctrl.minDistance   = 2;
      ctrl.maxDistance   = 100;
      ctrl.maxPolarAngle = Math.PI * 0.48;
      ctrl.target.set(0, 1, 0);
      ctrl.update();
      threeRef.current.controls = ctrl;
    });

    const ro = new ResizeObserver(() => {
      const w = el.clientWidth; const h = el.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(el);

    threeRef.current = { scene, camera, renderer, controls: null, raf, ships: new Map(), order: [] };

    return () => {
      cancelAnimationFrame(raf);
      threeRef.current?.controls?.dispose();
      ro.disconnect();
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
      threeRef.current = null;
    };
  }, []);

  // ─── Layout: arrange ships side-by-side + fit camera ─────────────────────

  const relayout = useCallback(() => {
    const t = threeRef.current;
    if (!t || t.ships.size === 0) return;

    const ordered = t.order
      .filter((id) => t.ships.has(id))
      .map((id) => t.ships.get(id)!);

    const totalSpan = ordered.reduce((s, e) => s + e.halfWidth * 2, 0)
      + SHIP_GAP * Math.max(ordered.length - 1, 0);

    let x = -totalSpan / 2;
    for (const { pivot, halfWidth } of ordered) {
      pivot.position.set(x + halfWidth, 0, 0);
      x += halfWidth * 2 + SHIP_GAP;
    }

    // Fit camera
    const dist = Math.max(totalSpan * 0.65, 10);
    t.camera.position.set(0, dist * 0.35, dist);
    t.camera.lookAt(0, 1, 0);
    if (t.controls) {
      t.controls.target.set(0, 1, 0);
      t.controls.update();
    }
  }, []);

  // ─── Add ship to scene (async GLB load) ───────────────────────────────────

  const addShipToScene = useCallback(async (ship: FleetShip) => {
    const raw = await tryLoadGlb(shipGlbCandidates(ship.reference));
    if (!threeRef.current) return;

    const { pivot, halfWidth } = raw ? buildShipPivot(raw) : buildFallbackPivot();
    pivot.userData.shipId = ship.id;
    threeRef.current.scene.add(pivot);
    threeRef.current.ships.set(ship.id, { pivot, halfWidth });
    relayout();
  }, [relayout]);

  // ─── Remove ship from scene ───────────────────────────────────────────────

  const removeShipFromScene = useCallback((id: string) => {
    const t = threeRef.current;
    if (!t) return;
    const entry = t.ships.get(id);
    if (!entry) return;
    t.scene.remove(entry.pivot);
    entry.pivot.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else (obj.material as THREE.Material)?.dispose();
      }
    });
    t.ships.delete(id);
    t.order = t.order.filter((i) => i !== id);
    relayout();
  }, [relayout]);

  // ─── Sync fleet state → Three.js scene ───────────────────────────────────

  useEffect(() => {
    const t = threeRef.current;
    if (!t) return;

    const fleetIds = new Set(fleet.map((s) => s.id));

    // Remove ships no longer in fleet
    for (const id of [...t.ships.keys()]) {
      if (!fleetIds.has(id)) {
        loadingRef.current.delete(id);
        removeShipFromScene(id);
      }
    }
    for (const id of [...loadingRef.current]) {
      if (!fleetIds.has(id)) loadingRef.current.delete(id);
    }

    // Add new ships
    for (const ship of fleet) {
      if (!t.ships.has(ship.id) && !loadingRef.current.has(ship.id)) {
        loadingRef.current.add(ship.id);
        t.order.push(ship.id);
        addShipToScene(ship).finally(() => loadingRef.current.delete(ship.id));
      }
    }
  }, [fleet, addShipToScene, removeShipFromScene]);

  // ─── Persistence ──────────────────────────────────────────────────────────

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (Array.isArray(saved.fleet)) setFleet(saved.fleet);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ fleet })); }
    catch { /* ignore */ }
  }, [fleet]);

  // ─── Catalog search ───────────────────────────────────────────────────────

  useEffect(() => {
    if (activeTab !== "catalog") return;
    const q = searchQuery.trim();
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setLoadingCatalog(true);
      try {
        const res  = await fetch(`/api/ships?limit=40${q ? `&search=${encodeURIComponent(q)}` : ""}`, { signal: ctrl.signal });
        const json = await res.json();
        setCatalogShips(json.data ?? []);
      } catch { /* aborted */ }
      finally { setLoadingCatalog(false); }
    }, 300);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [searchQuery, activeTab]);

  // ─── Fleet actions ────────────────────────────────────────────────────────

  const addToFleet = useCallback((reference: string, name: string, manufacturer: string, imageUrl?: string) => {
    setFleet((prev) => [...prev, { id: uid(), reference, name, manufacturer, imageUrl }]);
  }, []);

  const removeFromFleet = useCallback((id: string) => {
    setFleet((prev) => prev.filter((s) => s.id !== id));
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────

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
            !mounted
              ? <EmptyHint text="Loading…" />
              : hangarShipList.length === 0
                ? <EmptyHint text={"No ships in hangar.\nImport your fleet first."} />
                : <div className="divide-y divide-zinc-800/40">
                    {hangarShipList.map((s) => (
                      <SidebarRow key={s.id} name={s.shipName} sub={s.insuranceType.replace(/_/g, " ")}
                        onAdd={() => addToFleet(s.shipReference, s.shipName, "", s.imageUrl)} />
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
                        onAdd={() => addToFleet(s.reference, s.name, s.manufacturer)} />
                    ))}
                  </div>
          )}
        </div>

        {fleet.length > 0 && (
          <>
            <div className="border-t border-zinc-800 shrink-0">
              <p className="px-3 pt-2.5 pb-1 text-[10px] uppercase tracking-widest text-zinc-600">
                In scene ({fleet.length})
              </p>
              <div className="max-h-44 overflow-y-auto divide-y divide-zinc-800/30">
                {fleet.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-800/40">
                    <span className="flex-1 text-xs text-zinc-300 truncate">{s.name}</span>
                    <button onClick={() => removeFromFleet(s.id)}
                      className="text-zinc-600 hover:text-red-400 shrink-0 transition-colors p-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-2 border-t border-zinc-800 shrink-0">
              <button onClick={() => setFleet([])}
                className="w-full text-xs text-zinc-600 hover:text-red-400 transition-colors py-1">
                Clear scene
              </button>
            </div>
          </>
        )}
      </aside>

      {/* Sidebar toggle */}
      <button onClick={() => setSidebarOpen((v) => !v)}
        className="absolute z-30 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 p-1.5 rounded-r border border-l-0 border-zinc-700 transition-colors"
        style={{ top: "50%", transform: "translateY(-50%)", left: sidebarOpen ? 256 : 0 }}>
        {sidebarOpen ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>

      {/* Three.js mount point — fills remaining width */}
      <div ref={mountRef} className="flex-1 relative overflow-hidden" />

      {/* Empty state overlay */}
      {fleet.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ left: sidebarOpen ? 256 : 0 }}>
          <div className="text-center space-y-3">
            <div className="text-zinc-800 text-5xl font-thin">◇</div>
            <p className="text-zinc-600 text-sm">Add ships from the sidebar to begin</p>
            <p className="text-zinc-700 text-xs">Drag to orbit · Scroll to zoom · Right-click to pan</p>
          </div>
        </div>
      )}
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
        <p className="text-xs    text-zinc-200 truncate leading-tight">{name}</p>
        <p className="text-[10px] text-zinc-500 truncate leading-tight mt-0.5">{sub}</p>
      </div>
      <Plus className="w-3.5 h-3.5 text-zinc-600 group-hover:text-amber-400 shrink-0 transition-colors" />
    </button>
  );
}
