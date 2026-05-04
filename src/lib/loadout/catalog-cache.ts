// =============================================================================
// SC LABS — Catalog cache + prefetch (Loadout.4d, 2026-05-04)
//
// Cache module-level del endpoint POST /api/catalog. La key es el body
// serializado del request (type + maxSize/minSize + search + grade + ...).
// TTL 5 minutos — durante ese período, las re-aperturas del ComponentPicker
// que pidan el mismo conjunto son instantáneas (no fetch).
//
// `prefetchForHardpoints` se llama desde el LoadoutBuilder cuando carga la
// nave: dispara fetches en paralelo (fire-and-forget) para todas las
// combinaciones únicas (categoria, size) presentes en el ship. Cuando el
// user clickea cualquier slot, los resultados ya están calientes en caché.
// =============================================================================

const _cache = new Map<string, { ts: number; data: any }>();
const _inflight = new Map<string, Promise<any>>();
const TTL_MS = 5 * 60 * 1000; // 5 min

/** Fetch al endpoint /api/catalog con caché module-level. */
export async function fetchCatalog(body: any, signal?: AbortSignal): Promise<any> {
  const key = JSON.stringify(body);
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.ts < TTL_MS) {
    return hit.data;
  }
  // Si ya hay un fetch en curso para esa misma key, esperarlo (deduplica
  // requests concurrentes — útil cuando prefetch + click rápido del user).
  const inflight = _inflight.get(key);
  if (inflight) return inflight;
  const p = (async () => {
    try {
      const res = await fetch("/api/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
      if (!res.ok) throw new Error(`catalog ${res.status}`);
      const data = await res.json();
      _cache.set(key, { ts: Date.now(), data });
      return data;
    } finally {
      _inflight.delete(key);
    }
  })();
  _inflight.set(key, p);
  return p;
}

/** Mapeo simple categoria del hardpoint → type del API. Mismo que en
 *  ComponentPicker (CAT_TO_API_TYPE). Lo redefinimos acá para no
 *  acoplar el módulo al picker. */
const HP_TO_API_TYPE: Record<string, string> = {
  WEAPON: "WEAPON",
  TURRET: "WEAPON,TURRET",
  MISSILE_RACK: "MISSILE_RACK",
  MISSILE: "MISSILE,BOMB",
  SHIELD: "SHIELD",
  POWER_PLANT: "POWER_PLANT",
  COOLER: "COOLER",
  QUANTUM_DRIVE: "QUANTUM_DRIVE",
  JUMP_DRIVE: "JUMP_DRIVE",
  MINING: "MINING_LASER",
  UTILITY: "TRACTOR_BEAM,EMP,QED",
  SALVAGE: "SALVAGE_HEAD",
  QIG: "QIG",
};

interface MinimalHardpoint {
  resolvedCategory: string;
  maxSize: number;
  isFixed?: boolean;
}

/**
 * Prefetch agresivo de las (categoria, size) únicas del ship. Disparado al
 * cargar el LoadoutBuilder. Fire-and-forget: errores se ignoran porque el
 * picker hará un fetch normal si falla. NO bloquea el render.
 */
export function prefetchForHardpoints(hardpoints: MinimalHardpoint[]): void {
  if (typeof window === "undefined") return;
  const combos = new Set<string>();
  for (const hp of hardpoints) {
    const apiType = HP_TO_API_TYPE[hp.resolvedCategory];
    if (!apiType) continue;
    const size = hp.maxSize > 0 ? hp.maxSize : null;
    const key = `${apiType}|${size}`;
    if (combos.has(key)) continue;
    combos.add(key);
    const body: any = { type: apiType, limit: 200 };
    if (size != null) {
      body.maxSize = size;
      body.minSize = size;
    }
    // Fire-and-forget — los errores se silencian porque el picker hace fallback.
    fetchCatalog(body).catch(() => {});
  }
}

/** Para tests / debug. */
export function clearCatalogCache(): void {
  _cache.clear();
  _inflight.clear();
}
