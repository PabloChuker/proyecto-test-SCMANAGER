export const dynamic = "force-dynamic";
// =============================================================================
// AL FILO — /api/ships v3 (Raw SQL — actual DB schema)
//
// Lists all ships from the ships table directly.
// Supports search, manufacturer filter, role filter, sorting, pagination.
//
// GET: Query parameters (backward compatible)
// POST: JSON body with same parameters
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import {
  sanitizeString,
  validateInt,
  validateSortColumn,
  validateSortDir,
  parsePostBody,
  secureHeaders,
} from "@/lib/api-security";
import { getOnlineVersionsArray } from "@/lib/onlineVersions";

export const revalidate = 300;

// =============================================================================
// CATALOG CLEANUP RULES (2026-04-14)
// -----------------------------------------------------------------------------
// 1) Hide entirely (never appear in /ships): BIS / Best in Show / Power Suit.
// 2) In-game-only acquisitions — hide USD price (msrp_usd/warbond_usd → null):
//    Wikelo, Executive Hangar, PYAM, Teach / Teach's Special.
// 3) Dedup: collapse rows with same (name, manufacturer), keep the row with the
//    most populated fields (ties → lower id).
//
// All rules are applied at the API layer; no rows are deleted from the DB.
// =============================================================================

// POSIX regex (PostgreSQL `~*`) for names that must NEVER appear in the catalog.
// Uses word boundaries (\y) so "BIS" doesn't match e.g. "Orbis".
// F8A Lightning is a duplicate of the F8C variants (no thumb, no hull model).
const HIDDEN_NAME_REGEX =
  "(\\ybis\\y|best\\s+in\\s+show|power\\s+suit|\\yf8a\\y)";

// SQL-side ILIKE patterns for "in-game only" ships whose USD price we null out.
// Matches the ship's name OR reference string (case-insensitive).
const INGAME_ONLY_PATTERNS = [
  "%wikelo%",
  "%executive hangar%",
  "%exec hangar%",
  "%executive edition%", // e.g. "Anvil F8C Lightning Executive Edition"
  "%pyam%",
  "%teach%", // covers "Teach's Special", "Teach Special", etc.
];

// Map sort keys to actual columns
// Note: scm_speed and afterburner_speed are in ship_flight_stats, not ships
const SORT_MAP: Record<string, string> = {
  name: "s.name",
  scmSpeed: "fs.scm_speed",
  maxSpeed: "fs.max_speed",
  cargo: "s.cargo_capacity",
  maxCrew: "s.crew",
  afterburnerSpeed: "fs.max_speed",
  manufacturer: "m.name",
  size: "s.size",
  role: "s.role",
  mass: "s.mass_total_kg",
  msrpUsd: "sp.msrp_usd",
  price: "sp.msrp_usd",
};

interface ShipsQueryParams {
  search: string;
  manufacturer: string;
  role: string;
  reference: string;
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: "ASC" | "DESC";
  /**
   * Fase R.3 (2026-04-25): cuando es true, excluye naves cuyo `flight_status`
   * es 'concept' o 'in_development' (las que no se pueden cargar en el
   * LoadoutBuilder porque no tienen hardpoints reales en la BD). Usado por
   * el ShipSelector del Loadout Manager para evitar errores de carga.
   * Default false → la página /ships y los demás endpoints siguen viéndolas.
   */
  flightReadyOnly: boolean;
}

/**
 * Shared internal function for querying ships.
 * Handles all business logic, security validation, and database queries.
 */
async function handleShipsQuery(params: ShipsQueryParams) {
  try {
    // Sanitize string inputs
    const search = sanitizeString(params.search, 100);
    const manufacturer = sanitizeString(params.manufacturer, 100);
    const role = sanitizeString(params.role, 100);

    // Validate and clamp integers
    const page = validateInt(params.page, 1, 1, 1000);
    const limit = validateInt(params.limit, 24, 1, 500);

    // Validate sort column against whitelist and sort order
    const sortBy = validateSortColumn(params.sortBy, SORT_MAP, "name");
    const sortOrder = validateSortDir(params.sortOrder);
    const sortCol = SORT_MAP[sortBy] || "s.name";

    // Build WHERE conditions (applied AFTER dedup, referencing alias `s`).
    const conditions: string[] = [];
    const queryParams: any[] = [];
    let paramIdx = 1;

    // ── Always-on rule: hide BIS / Best in Show / Power Suit ──
    conditions.push(
      `COALESCE(s.name, '') !~* $${paramIdx} AND COALESCE(s.class_name, '') !~* $${paramIdx}`,
    );
    queryParams.push(HIDDEN_NAME_REGEX);
    paramIdx++;

    if (search) {
      conditions.push(
        `(s.name ILIKE $${paramIdx} OR s.class_name ILIKE $${paramIdx} OR m.name ILIKE $${paramIdx})`,
      );
      queryParams.push(`%${search}%`);
      paramIdx++;
    }

    if (manufacturer) {
      conditions.push(`m.name ILIKE $${paramIdx}`);
      queryParams.push(`%${manufacturer}%`);
      paramIdx++;
    }

    if (role) {
      conditions.push(`s.role ILIKE $${paramIdx}`);
      queryParams.push(`%${role}%`);
      paramIdx++;
    }

    if (params.reference) {
      conditions.push(`s.class_name = $${paramIdx}`);
      queryParams.push(params.reference);
      paramIdx++;
    }

    if (params.flightReadyOnly) {
      // Solo flight_ready (o NULL por compatibilidad con filas antiguas que
      // no tenían el campo poblado). Excluye 'concept' e 'in_development'.
      conditions.push(`(s.flight_status IS NULL OR s.flight_status = 'flight_ready')`);
    }

    // Fase GV-Online (2026-05-15 → fix 2026-05-16): el filtro online tiene que
    // entrar DENTRO del CTE dedup. Si lo aplicamos después, el dedup elige una
    // fila por (name, manufacturer) entre TODAS las versiones (incluidas las
    // offline) — y si la "ganadora" es offline (4.7.2 con más campos populated
    // que el 4.8.0 recién importado), después la descartamos del filtro y la
    // nave entera desaparece. Resultado del bug: 938 ships totales colapsadas
    // a 87 únicos en el endpoint. Fix: pasar onlineList al CTE como pre-filtro.
    const onlineList = await getOnlineVersionsArray();
    let onlineParamIdx = -1;
    const onlineGvFilterCTE = (onlineList && onlineList.length > 0)
      ? `WHERE game_version = ANY($${paramIdx}::text[])`
      : "";
    if (onlineList && onlineList.length > 0) {
      onlineParamIdx = paramIdx;
      queryParams.push(onlineList);
      paramIdx++;
    }
    // Ranking de versión: `onlineList` viene ordenado de MÁS NUEVA a más vieja,
    // así que `array_position()` da 1 a la más reciente. Lo usamos como PRIMER
    // criterio del dedup para que, cuando una nave existe en varias versions
    // online, gane la más nueva (no la que casualmente tenga más campos sueltos
    // de una versión vieja). Si no hay onlineList, queda vacío y el dedup usa
    // solo field-population como antes.
    const onlineRankExpr = onlineParamIdx > 0
      ? `array_position($${onlineParamIdx}::text[], game_version) ASC NULLS LAST,`
      : "";

    const whereClause = "WHERE " + conditions.join(" AND ");

    // Dedup CTE: collapse duplicates by (lower(name), lower(manufacturer)),
    // keep the row with the most populated fields (ties → lower id).
    // `s` below is the deduped alias, so downstream WHERE/ORDER BY still work.
    const dedupCTE = `
      WITH deduped AS (
        SELECT *,
          ROW_NUMBER() OVER (
            PARTITION BY LOWER(COALESCE(name, '')), COALESCE(manufacturer_id::text, '')
            ORDER BY
              ${onlineRankExpr}
              ( (CASE WHEN crew           IS NOT NULL THEN 1 ELSE 0 END)
              + (CASE WHEN cargo_capacity IS NOT NULL THEN 1 ELSE 0 END)
              + (CASE WHEN mass_total_kg   IS NOT NULL THEN 1 ELSE 0 END)
              + (CASE WHEN role           IS NOT NULL THEN 1 ELSE 0 END)
              ) DESC,
              id ASC
          ) AS __rn
        FROM ships
        ${onlineGvFilterCTE}
      )
    `;

    // Count total (deduped + filtered)
    const countResult: any[] = await sql.unsafe(
      `${dedupCTE}
       SELECT COUNT(*)::int as total
       FROM deduped s
       LEFT JOIN manufacturers m ON m.id = s.manufacturer_id
       ${whereClause} AND s.__rn = 1`,
      queryParams,
    );
    const total = countResult[0]?.total ?? 0;

    // Fetch ships with optional LEFT JOIN to flight_stats for speed data
    const offset = (page - 1) * limit;
    // Ships.1 (2026-05-03): LEFT JOIN extra contra ship_prices_canonical para
    // traer avg_purchase_auec (precio in-game) y avg_daily_rental_auec. La
    // tabla cubre 167/246 ships linked. Naves Wikelo / Reward / Limited
    // suelen no tener precio in-game → quedan en NULL y la UI no muestra chip.
    // Fix dup (2026-05-28): los LEFT JOIN ship_flight_stats / ship_price /
    // ship_prices_canonical tienen que matchear por (ship_id, game_version)
    // si NO, la misma nave aparece N veces porque su ship_id se repite en
    // múltiples gvs en las tablas satellite. Síntoma: Xolii reportaba que
    // /ships devolvía Avenger Titan x3 todas con gv 4.8.0-live.11875683.
    // La cuenta venía dedupeada (CTE) pero la SELECT multiplicaba al JOIN.
    // Sitio.1 (2026-06-12, CRÍTICO): ship_price/ship_prices_canonical guardan
    // ship_id/id con los UUIDs de la GV en que se importaron (mayoría 4.7.0).
    // Al servir solo naves de la GV online, el join directo por UUID matcheaba
    // 1/322 → msrp/warbond/aUEC null en todo el catálogo, hangar y chain board.
    // Puente por class_name vía LATERAL (LIMIT 1 = no multiplica filas, toma
    // la fila de la nave más reciente que tenga precio).
    const joinClause = `LEFT JOIN ship_flight_stats fs ON fs.ship_id = s.id AND fs.game_version = s.game_version
       LEFT JOIN LATERAL (
         SELECT sp2.* FROM ship_price sp2
         JOIN ships sx ON sx.id = sp2.id AND sx.class_name = s.class_name
         ORDER BY sx.game_version DESC LIMIT 1
       ) sp ON true
       LEFT JOIN manufacturers m ON m.id = s.manufacturer_id
       LEFT JOIN LATERAL (
         SELECT spc2.* FROM ship_prices_canonical spc2
         JOIN ships sx2 ON sx2.id = spc2.ship_id AND sx2.class_name = s.class_name
         ORDER BY sx2.game_version DESC LIMIT 1
       ) spc ON true`;
    const ships: any[] = await sql.unsafe(
      `${dedupCTE}
       SELECT s.id, s.class_name AS reference, s.name, m.name AS manufacturer, s.role, s.size,
              s.crew, s.mass_total_kg AS mass, s.cargo_capacity, s.game_version,
              s.flight_status,
              sp.msrp_usd, sp.warbond_usd, sp.acquisition_method, sp.is_limited,
              fs.scm_speed, fs.max_speed as afterburner_speed,
              s.length_m AS length_m,
              s.width_m  AS width_m,
              s.height_m AS height_m,
              spc.avg_purchase_auec, spc.avg_daily_rental_auec
       FROM deduped s
       ${joinClause}
       ${whereClause} AND s.__rn = 1
       ORDER BY ${sortCol} ${sortOrder} NULLS LAST
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...queryParams, limit, offset],
    );

    // Get manufacturer list for filter dropdown
    const mfrs: any[] = await sql.unsafe(
      `SELECT DISTINCT m.name AS manufacturer FROM ships s LEFT JOIN manufacturers m ON m.id = s.manufacturer_id WHERE m.name IS NOT NULL ORDER BY m.name ASC`,
      [],
    );

    // Helper: is this ship "in-game only"? (strip USD prices from response)
    const isInGameOnly = (row: any): boolean => {
      const hay = `${row.name ?? ""} ${row.reference ?? ""}`.toLowerCase();
      return INGAME_ONLY_PATTERNS.some((p) => {
        // strip leading/trailing % and match as substring
        const needle = p.replace(/^%|%$/g, "").toLowerCase();
        return hay.includes(needle);
      });
    };

    // Map to expected format
    const data = ships.map((s) => {
      const inGameOnly = isInGameOnly(s);
      // Fase R (2026-04-25): naves del Referral Program no se compran en
      // tienda ni en juego — viene marcado en ship_price.acquisition_method.
      // Si es REFERRAL, ocultamos los precios USD para que la UI muestre el
      // badge "REFERRAL PROGRAM" en su lugar.
      const acquisitionMethod = (s.acquisition_method ?? "STORE") as string;
      const isReferralOnly = acquisitionMethod === "REFERRAL";
      const hideUsd = inGameOnly || isReferralOnly;
      return {
      id: s.id,
      reference: s.reference,
      name: s.name,
      localizedName: null,
      type: "SHIP",
      size: s.size,
      manufacturer: s.manufacturer,
      gameVersion: s.game_version,
      inGameOnly, // flag for UI if it wants to show a "In-Game Only" badge
      acquisitionMethod, // 'STORE' | 'REFERRAL' | 'IN_GAME' | …
      // Fase R.2 (2026-04-25): exponer estado productivo (concept / in_development /
      // flight_ready) y flag de tirada limitada para que ShipCard muestre el
      // badge correspondiente.
      flightStatus: (s.flight_status ?? "flight_ready") as string,
      isLimited: !!s.is_limited,
      msrpUsd: hideUsd ? null : (s.msrp_usd != null ? Number(s.msrp_usd) : null),
      warbondUsd: hideUsd ? null : (s.warbond_usd != null ? Number(s.warbond_usd) : null),
      // Ships.1: precio in-game (aUEC) + costo de renta diaria. NO se hide
      // por inGameOnly o referral porque para esas naves el precio in-game
      // es PRECISAMENTE el dato útil — son obtenibles en juego.
      avgPurchaseAuec: s.avg_purchase_auec != null ? Number(s.avg_purchase_auec) : null,
      avgDailyRentalAuec: s.avg_daily_rental_auec != null ? Number(s.avg_daily_rental_auec) : null,
      ship: {
        maxCrew: s.crew,
        mass: s.mass != null ? Number(s.mass) : null,
        cargo: s.cargo_capacity != null ? Number(s.cargo_capacity) : null,
        scmSpeed: s.scm_speed != null ? Number(s.scm_speed) : null,
        afterburnerSpeed: s.afterburner_speed != null ? Number(s.afterburner_speed) : null,
        role: s.role,
        focus: null,
        career: null,
        lengthMeters: s.length_m != null ? Number(s.length_m) : null,
        beamMeters:   s.width_m  != null ? Number(s.width_m)  : null,
        heightMeters: s.height_m != null ? Number(s.height_m) : null,
      },
      };
    });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        manufacturers: mfrs.map((m) => m.manufacturer).filter(Boolean),
      },
    };
  } catch (error) {
    console.error("[API /ships] Query error:", error);
    throw error;
  }
}

/**
 * GET handler — query parameters for backward compatibility
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const params: ShipsQueryParams = {
      search:       searchParams.get("search")       || "",
      manufacturer: searchParams.get("manufacturer") || "",
      role:         searchParams.get("role")         || "",
      reference:    searchParams.get("reference")    || "",
      page:         parseInt(searchParams.get("page")  || "1",  10),
      limit:        parseInt(searchParams.get("limit") || "24", 10),
      sortBy:       searchParams.get("sortBy")  || "name",
      sortOrder:    (searchParams.get("sortOrder") === "desc" ? "DESC" : "ASC") as "ASC" | "DESC",
      flightReadyOnly: searchParams.get("flightReadyOnly") === "1" || searchParams.get("flightReadyOnly") === "true",
    };

    const result = await handleShipsQuery(params);

    return NextResponse.json(result, {
      headers: secureHeaders(),
    });
  } catch (error: any) {
    console.error("[API /ships GET] Error:", error);
    return NextResponse.json(
      { error: "Error al obtener las naves", detail: error?.message ?? String(error) },
      { status: 500, headers: secureHeaders() },
    );
  }
}

/**
 * POST handler — JSON body parameters
 */
export async function POST(request: NextRequest) {
  try {
    const body = await parsePostBody<Record<string, any>>(request);

    if (!body) {
      return NextResponse.json(
        { error: "Invalid request body or content type" },
        { status: 400, headers: secureHeaders() },
      );
    }

    const params: ShipsQueryParams = {
      search:       body.search       || "",
      manufacturer: body.manufacturer || "",
      role:         body.role         || "",
      reference:    body.reference    || "",
      page:         body.page  || 1,
      limit:        body.limit || 24,
      sortBy:       body.sortBy    || "name",
      sortOrder:    (body.sortOrder === "DESC" ? "DESC" : "ASC") as "ASC" | "DESC",
      flightReadyOnly: !!body.flightReadyOnly,
    };

    const result = await handleShipsQuery(params);

    return NextResponse.json(result, {
      headers: secureHeaders(),
    });
  } catch (error: any) {
    console.error("[API /ships POST] Error:", error);
    return NextResponse.json(
      { error: "Error al obtener las naves", detail: error?.message ?? String(error) },
      { status: 500, headers: secureHeaders() },
    );
  }
}
