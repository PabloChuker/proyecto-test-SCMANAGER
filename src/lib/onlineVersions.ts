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

// =============================================================================
// Comparador de versiones (semver + build numérico)
// -----------------------------------------------------------------------------
// Los strings de versión del juego tienen forma "MAJOR.MINOR[.PATCH][-BRANCH.BUILD]"
//   ej: "4.8.0-live.11875683", "4.7.3-PTU.123", "4.7.2"
// El orden lexicográfico (`version DESC` en SQL) es INCORRECTO para esto:
//   - "4.10.0" < "4.8.0" lexicográficamente (pero 4.10 es mayor)
//   - "...live.9000000" > "...live.11000000" lexicográficamente (build 9M parece
//     mayor que 11M porque '9' > '1') — al revés de lo correcto.
// Por eso comparamos numéricamente cada segmento + el build.
// =============================================================================

export interface ParsedGameVersion {
  major: number;
  minor: number;
  patch: number;
  branch: "LIVE" | "PTU";
  build: number; // 0 si no hay sufijo de build
  raw: string;
}

export function parseGameVersion(v: string | null | undefined): ParsedGameVersion {
  const raw = String(v ?? "").trim();
  const m = raw.match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
  const major = m ? Number(m[1]) : -1;
  const minor = m ? Number(m[2]) : -1;
  const patch = m && m[3] != null ? Number(m[3]) : 0;
  const branch: "LIVE" | "PTU" = /ptu/i.test(raw) ? "PTU" : "LIVE";
  // Build = último grupo numérico del sufijo (después de "-rama.").
  const buildMatch = raw.match(/[-.]([0-9]{3,})\b(?!.*[0-9]{3,})/);
  const build = buildMatch ? Number(buildMatch[1]) : 0;
  return { major, minor, patch, branch, build, raw };
}

/**
 * Compara dos versiones. Devuelve >0 si `a` es MÁS NUEVA que `b`, <0 si más
 * vieja, 0 si equivalentes. Pensado para `arr.sort((a,b)=>compareGameVersions(b,a))`
 * (descendente = más nueva primero).
 */
export function compareGameVersions(a: string, b: string): number {
  const pa = parseGameVersion(a);
  const pb = parseGameVersion(b);
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  if (pa.patch !== pb.patch) return pa.patch - pb.patch;
  if (pa.build !== pb.build) return pa.build - pb.build;
  return 0;
}

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
       WHERE COALESCE(online, true) = true`,
      [],
    );
    // Ordenamos en JS: primario processedAt DESC (señal de import más confiable),
    // desempate por comparador semver+build (NO lexicográfico). Esto deja el
    // array "más nuevo primero", así `array_position()` en SQL sirve de ranking.
    const sorted = rows
      .map((r) => ({ v: String(r.version || "").trim(), t: r.processedAt ? new Date(r.processedAt).getTime() : 0 }))
      .filter((r) => r.v)
      .sort((a, b) => (b.t - a.t) || compareGameVersions(b.v, a.v));

    const versions = new Set<string>();
    const array: string[] = [];
    let defaultGv: string | null = null;
    for (const { v } of sorted) {
      versions.add(v);
      array.push(v);
      // Default = primera versión semver-ish no-PTU según el orden canónico.
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
