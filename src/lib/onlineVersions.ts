// =============================================================================
// SC Labs — onlineVersions.ts
//
// Helper centralizado que devuelve el SET de game_versions con `online = true`.
//
// El admin (Pablo) usa `game_versions.online` como kill-switch: si una versión
// está marcada offline, NINGÚN endpoint debe servir datos de esa versión —
// ni como default, ni como fallback, ni como merge auxiliar.
//
// USO:
//   const online = await getOnlineVersionsSet();
//   if (!online.has(requestedGv)) { ... fallback al default ... }
//
//   // Para usar en queries SQL:
//   const onlineList = await getOnlineVersionsArray();
//   sql.unsafe(`SELECT ... WHERE game_version = ANY($1::text[])`, [onlineList]);
//
// El resultado se cachea en módulo por `CACHE_TTL_MS` para no martillar la BD
// en cada request. Las marcaciones offline/online de Pablo se propagan al
// siguiente flush (max 30s por default). Si necesitás respuesta inmediata,
// llamá `invalidateOnlineVersionsCache()`.
// =============================================================================

import { sql } from "@/lib/db";

const CACHE_TTL_MS = 30_000; // 30s — suficiente para evitar martilleo, rápido para reflejar toggles

interface CacheEntry {
  versions: Set<string>;
  array: string[];
  default: string | null; // GV más reciente online no-PTU (semver-ish)
  expiresAt: number;
}

let cache: CacheEntry | null = null;
let inflight: Promise<CacheEntry> | null = null;

async function loadOnlineVersions(): Promise<CacheEntry> {
  try {
    // COALESCE(online, true) = true para no romper filas legacy sin la columna
    // (defensa por si la migración no se aplicó en algún ambiente).
    const rows: any[] = await sql.unsafe(
      `SELECT version, "processedAt"
       FROM game_versions
       WHERE COALESCE(online, true) = true
       ORDER BY "processedAt" DESC NULLS LAST, version DESC`,
      [],
    );
    const versions = new Set<string>();
    const array: string[] = [];
    let defaultGv: string | null = null;
    for (const r of rows) {
      const v = String(r.version || "").trim();
      if (!v) continue;
      versions.add(v);
      array.push(v);
      // Default = primer match semver-ish no-PTU (filas ya ordenadas processedAt DESC)
      if (defaultGv === null && /^\d+\.\d+/.test(v) && !/PTU/i.test(v)) {
        defaultGv = v;
      }
    }
    return {
      versions,
      array,
      default: defaultGv,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
  } catch (e: any) {
    console.warn("[onlineVersions] load failed:", e?.message ?? e);
    // Fail-open: si la query falla, devolvemos cache vacío con TTL corto para
    // re-intentar. NO bloqueamos el endpoint — los queries downstream usarán
    // un fallback (típicamente: aceptar cualquier versión).
    return {
      versions: new Set(),
      array: [],
      default: null,
      expiresAt: Date.now() + 5_000, // retry rápido
    };
  }
}

export async function getOnlineVersionsCache(): Promise<CacheEntry> {
  if (cache && cache.expiresAt > Date.now()) return cache;
  if (inflight) return inflight;
  inflight = loadOnlineVersions().finally(() => {
    inflight = null;
  });
  cache = await inflight;
  return cache;
}

/**
 * Set de versions online. Útil para `has()` checks rápidos.
 */
export async function getOnlineVersionsSet(): Promise<Set<string>> {
  return (await getOnlineVersionsCache()).versions;
}

/**
 * Array de versions online (ordenado processedAt DESC). Útil para `ANY($1::text[])`.
 * NOTA: si el array viene vacío (cache fail-open), devolvemos null para que el
 * caller decida — no queremos generar `ANY('{}')` que matchea nada y rompe todo.
 */
export async function getOnlineVersionsArray(): Promise<string[] | null> {
  const c = await getOnlineVersionsCache();
  return c.array.length > 0 ? c.array : null;
}

/**
 * Default GV: versión semver-ish no-PTU más reciente online.
 * Usado por endpoints que necesitan un default cuando el cliente no manda `?gv=`.
 */
export async function getDefaultOnlineVersion(): Promise<string | null> {
  return (await getOnlineVersionsCache()).default;
}

/**
 * Resuelve la GV efectiva: si `requested` está online → la usa; si no → cae al default.
 * Útil al inicio de cada endpoint que acepta `?gv=`.
 */
export async function resolveEffectiveGv(requested: string | null | undefined): Promise<string | null> {
  const c = await getOnlineVersionsCache();
  if (requested && c.versions.has(requested)) return requested;
  return c.default;
}

/**
 * Verifica si una GV está online.
 */
export async function isOnlineGv(version: string | null | undefined): Promise<boolean> {
  if (!version) return false;
  const c = await getOnlineVersionsCache();
  return c.versions.has(version);
}

/**
 * Force-flush del cache. Llamar después de admin UPDATE de `online` flag.
 */
export function invalidateOnlineVersionsCache(): void {
  cache = null;
  inflight = null;
}
