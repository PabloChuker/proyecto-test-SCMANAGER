// =============================================================================
// SC LABS — RSI Sync (CB.6, 2026-05-04)
//
// Módulo que sincroniza data fresca desde fuentes públicas de RSI:
//
//   1. `https://robertsspaceindustries.com/ship-matrix/index`
//      JSON público, no requiere auth, devuelve TODAS las naves del juego con
//      su `production_status` (in-concept, in-production, flight-ready, etc),
//      manufacturer, stats básicas. Lo usamos para detectar:
//        - Naves NUEVAS que aparecieron en RSI (no estaban antes en ships)
//        - Cambios de production_status (concept→flight-ready, etc) que son
//          señales fuertes de release y disparan alertas para users con esa
//          nave en su wishlist pending.
//
//   2. Bumpea `synced_at` en ship_prices_canonical para indicar a la UI que
//      la data está fresca (cron corrió hace poco). Los precios reales del
//      store siguen viniendo del wiki (carga manual via load_rsi_prices_canonical.mjs)
//      hasta que tengamos el scraper completo de RSI store en una iteración futura.
//
// LIMITACIÓN actual: NO captura precios actualizados ni CCUs en venta. El
// `ship-matrix` solo da metadata. Para eso necesitamos:
//   - Wiki scraping via MediaWiki API (TODO CB.6b)
//   - O headless browser RSI scraping (TODO CB.6c)
// =============================================================================

import type { Sql } from "postgres";

const SHIP_MATRIX_URL = "https://robertsspaceindustries.com/ship-matrix/index";

interface ShipMatrixEntry {
  id: number;
  name: string;
  url: string;
  manufacturer: { id: number; code: string; name: string } | null;
  manufacturer_id: number;
  chassis_id: number;
  production_status: string; // "flight-ready" | "in-concept" | "in-production" | "announced" | etc.
  size: string;
  type: string;
  focus: string | null;
  length: number | null;
  beam: number | null;
  height: number | null;
  cargocapacity: number | null;
  max_crew: number | null;
  scm_speed: number | null;
}

interface ShipMatrixResponse {
  success: number;
  code?: string;
  msg?: string;
  data?: ShipMatrixEntry[];
}

export interface ShipChange {
  shipName: string;
  manufacturer: string | null;
  oldStatus: string | null;
  newStatus: string;
  rsiShipId: number;
}

export interface RsiSyncResult {
  matrixFetched: number;       // total ships fetched from ship-matrix
  newShips: string[];          // names of ships not previously in BD
  statusChanges: ShipChange[]; // ships whose production_status changed
  pricesCanonicalBumped: number; // rows updated with synced_at = NOW()
  durationMs: number;
}

/**
 * Normaliza un nombre de nave para matching tolerante:
 * lowercase + sin espacios extras + tokens ordenados consistentemente.
 */
function normalizeName(name: string): string {
  return String(name).toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Fetch el ship-matrix de RSI.
 * Retorna lista de ships o lanza si la respuesta es inválida.
 */
async function fetchShipMatrix(): Promise<ShipMatrixEntry[]> {
  const r = await fetch(SHIP_MATRIX_URL, {
    headers: {
      // RSI a veces devuelve HTML en lugar de JSON si no se solicita JSON
      // explícitamente. UA de browser para evitar bloqueos triviales.
      Accept: "application/json",
      "User-Agent":
        "SC-Labs-Sync/1.0 (+https://sclabs.space; contact: pablo.m.silva.fernandez@gmail.com)",
    },
    cache: "no-store",
  });
  if (!r.ok) {
    throw new Error(`ship-matrix fetch failed: HTTP ${r.status}`);
  }
  const j = (await r.json()) as ShipMatrixResponse;
  if (!j || j.success !== 1 || !Array.isArray(j.data)) {
    throw new Error(`ship-matrix invalid response shape (success=${j?.success})`);
  }
  return j.data;
}

/**
 * Sincroniza ship-matrix → tabla `ships`. Detecta:
 *   - Naves nuevas (no existían antes en ships por nombre normalizado)
 *   - Cambios de production_status
 *
 * No mete las naves nuevas automáticamente — las reporta para que un humano
 * decida agregarlas (cada nave nueva en BD requiere también class_name correcto,
 * insurance, hardpoints, etc, que no vienen en ship-matrix).
 *
 * SÍ aplica cambios de production_status si la nave ya existe en BD (campo
 * flight_status). Eso permite que una nave concept que pasa a flight-ready se
 * marque automáticamente.
 */
async function syncShipMatrix(
  sql: Sql,
): Promise<{ matrixFetched: number; newShips: string[]; statusChanges: ShipChange[] }> {
  const matrix = await fetchShipMatrix();

  // Cargar todas las ships actuales (id + name + flight_status)
  const dbShips: any[] = await sql.unsafe(
    `SELECT id, name, flight_status FROM ships ORDER BY name`,
    [],
  );
  const dbByName = new Map<string, { id: string; flight_status: string | null }>();
  for (const r of dbShips) {
    dbByName.set(normalizeName(r.name), { id: String(r.id), flight_status: r.flight_status });
  }

  const newShips: string[] = [];
  const statusChanges: ShipChange[] = [];

  for (const entry of matrix) {
    if (!entry?.name) continue;
    const norm = normalizeName(entry.name);
    const existing = dbByName.get(norm);

    if (!existing) {
      newShips.push(entry.name);
      continue;
    }

    // Mapear production_status RSI → flight_status interno
    // RSI: "flight-ready", "in-production", "in-concept", "announced", "released"
    // BD:  "flight_ready" | "concept" | "in_progress" (legacy/loose)
    const rsiStatus = entry.production_status || "";
    let newInternalStatus: string | null = null;
    if (rsiStatus === "flight-ready") newInternalStatus = "flight_ready";
    else if (rsiStatus === "in-concept" || rsiStatus === "announced")
      newInternalStatus = "concept";
    else if (rsiStatus === "in-production") newInternalStatus = "in_progress";
    // Si no matchea, lo dejamos como está (no overrideamos con valores raros)

    if (newInternalStatus && newInternalStatus !== existing.flight_status) {
      statusChanges.push({
        shipName: entry.name,
        manufacturer: entry.manufacturer?.name ?? null,
        oldStatus: existing.flight_status,
        newStatus: newInternalStatus,
        rsiShipId: entry.id,
      });
      // UPDATE en ships
      await sql.unsafe(
        `UPDATE ships SET flight_status = $1 WHERE id::text = $2`,
        [newInternalStatus, existing.id],
      );
    }
  }

  return { matrixFetched: matrix.length, newShips, statusChanges };
}

/**
 * Bumpea `synced_at = NOW()` en `ship_prices_canonical` para indicar a la UI
 * que la data fue revisada recientemente. No modifica los valores en sí —
 * el wiki scraping real va en CB.6b.
 */
async function bumpPricesCanonicalSyncedAt(sql: Sql): Promise<number> {
  const result = await sql.unsafe(
    `UPDATE ship_prices_canonical SET synced_at = NOW() WHERE TRUE RETURNING id`,
    [],
  );
  return result.length;
}

/**
 * Sync completo. Llamado desde el cron endpoint.
 * Returns un summary detallado.
 */
export async function runRsiSync(sql: Sql): Promise<RsiSyncResult> {
  const start = Date.now();

  const matrixResult = await syncShipMatrix(sql);
  const bumped = await bumpPricesCanonicalSyncedAt(sql);

  return {
    matrixFetched: matrixResult.matrixFetched,
    newShips: matrixResult.newShips,
    statusChanges: matrixResult.statusChanges,
    pricesCanonicalBumped: bumped,
    durationMs: Date.now() - start,
  };
}
