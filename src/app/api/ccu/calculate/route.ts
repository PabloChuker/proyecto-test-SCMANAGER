// =============================================================================
// AL FILO — POST /api/ccu/calculate
//
// Calculates the cheapest CCU chain between two ships.
// Two modes:
//   "Armarla Ya" (onlyAvailable=true): uses only available CCU prices
//   "Esperar y Ahorrar" (onlyAvailable=false): generates ALL possible edges
//     from ship MSRP/warbond data, maximizing warbond usage for max savings
//
// Request body:
//   { fromShipId, toShipId, ownedCCUs?, preferWarbond?, hasBuybackToken?,
//     onlyAvailable?, maxSteps?, excludeShipIds?, includeAlternatives? }
//
// Response:
//   { chain: ChainResult, alternatives: ChainResult[], meta }
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import {
  findCheapestChain,
  findCheapestChainWithWaypoints,
  findAlternativeChains,
  mergeUserInventory,
  type ShipNode,
  type CCUEdge,
  type UserOwnedCCU,
  type CalculateOptions,
} from "@/lib/ccu-engine";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      fromShipId,
      toShipId,
      ownedCCUs = [],
      preferWarbond = true,
      hasBuybackToken = false,
      paymentPriority = "balanced",
      onlyAvailable = true,
      maxSteps = 15,
      excludeShipIds = [],
      includeAlternatives = true,
      // CCU.2 / CCU.3 (2026-05-03): preferencias globales del user persistidas
      // en localStorage via ccuChainPolicy. La UI las pasa en cada call.
      forceExcludeShipIds = [],
      forceIncludeShipIds = [],
    } = body;

    if (!fromShipId || !toShipId) {
      return NextResponse.json(
        { error: "fromShipId and toShipId are required" },
        { status: 400 },
      );
    }

    // ── 1. Load all ships with MSRP ──
    // CCU.5 (2026-05-03): LEFT JOIN con ship_prices_canonical para obtener
    // warbond_usd REAL del Wiki (mejor que el cap teórico del 10%). Si la
    // tabla canónica no tiene match, cae a sp.warbond_usd local. La columna
    // `warbond_usd_real` se prioriza en el cálculo de edges abajo.
    const shipRows: any[] = await sql.unsafe(`
      SELECT s.id, s.class_name AS reference, s.name, m.name AS manufacturer, sp.msrp_usd, sp.warbond_usd,
             spc.warbond_usd AS warbond_usd_real,
             spc.pledge_availability,
             COALESCE(sp.is_ccu_eligible, true) AS is_ccu_eligible,
             COALESCE(sp.is_limited, false) AS is_limited,
             COALESCE(s.flight_status, 'flight_ready') AS flight_status
      FROM ships s
      LEFT JOIN ship_price sp ON sp.id = s.id
      LEFT JOIN manufacturers m ON m.id = s.manufacturer_id
      LEFT JOIN ship_prices_canonical spc ON spc.ship_id = s.id
      WHERE sp.msrp_usd IS NOT NULL AND sp.msrp_usd > 0
      ORDER BY sp.msrp_usd ASC
    `, []);

    const ships = new Map<string, ShipNode>();
    // Map auxiliar: shipId → warbond REAL del Wiki (si existe). Lo usamos en
    // mode "Esperar y Ahorrar" antes de aplicar el cap teórico.
    const realWarbondByShipId = new Map<string, number>();
    for (const row of shipRows) {
      const id = String(row.id);
      // Preferir warbond REAL del Wiki sobre el local. Si ninguno existe, null.
      const realWarbond = row.warbond_usd_real != null ? Number(row.warbond_usd_real) : null;
      const localWarbond = row.warbond_usd != null ? Number(row.warbond_usd) : null;
      const effectiveWarbond = realWarbond ?? localWarbond;
      if (realWarbond != null) realWarbondByShipId.set(id, realWarbond);
      ships.set(id, {
        id,
        reference: row.reference || "",
        name: row.name || "",
        manufacturer: row.manufacturer || null,
        msrpUsd: Number(row.msrp_usd) || 0,
        warbondUsd: effectiveWarbond,
        isCcuEligible: row.is_ccu_eligible !== false,
        isLimited: row.is_limited === true,
        flightStatus: row.flight_status || "flight_ready",
        // CCU.6: pledgeAvailability del Wiki, propagado hasta cada ChainStep
        // para que la UI muestre badges ✓/🕒/🚫 según disponibilidad real.
        pledgeAvailability: row.pledge_availability || null,
      });
    }

    // Verify start and target ships exist
    if (!ships.has(String(fromShipId)) || !ships.has(String(toShipId))) {
      return NextResponse.json(
        { error: "One or both ships not found or missing MSRP data" },
        { status: 404 },
      );
    }

    let edges: CCUEdge[];

    if (onlyAvailable) {
      // ═══════════════════════════════════════════════════════════════════
      // MODE: "Armarla Ya" — only load CCU prices for ships available HOY
      //
      // CCU.7-coherence (2026-05-04, BUGFIX Pablo):
      //   El SQL anterior solo filtraba `cp.is_available = true` lo cual
      //   significa "el wiki lista este CCU price". Pero NO chequeaba si
      //   las naves intermedias (from / to) están a la venta HOY en RSI.
      //   Resultado: el solver veía edges hacia naves "Time-limited sales"
      //   (solo en IAE/Invictus) y las usaba como pasos intermedios →
      //   cadenas con "9 pasos solo en eventos" en modo "Armarla Ya".
      //
      // Fix: JOIN con ship_prices_canonical y filtrar pledge_availability.
      //   - Si la nave es el startShip o targetShip del user: SIEMPRE
      //     permitida (vos ya la tenés, o vos elegiste el target — incluso
      //     si es concept, el user lo decide).
      //   - Si pledge_availability es NULL en el wiki: asumimos disponible
      //     (gap de data, mejor falso positivo que falso negativo).
      //   - Si pledge_availability incluye "always available": permitida.
      //   - Cualquier otro valor (Time-limited / Concept / Out of
      //     production / Reward): BLOQUEADA en modo Armarla Ya.
      //
      // Esto es defensa en profundidad: el solver también tiene
      // isShipAvailableNow() como backup, pero filtrar en SQL es más
      // determinista y reduce el grafo a explorar.
      const ccuRows: any[] = await sql.unsafe(
        `SELECT cp.from_ship_id, cp.to_ship_id, cp.standard_price, cp.warbond_price,
                cp.is_available, cp.is_warbond_available, cp.is_limited
         FROM ccu_prices cp
         LEFT JOIN ship_prices_canonical from_av ON from_av.ship_id = cp.from_ship_id
         LEFT JOIN ship_prices_canonical to_av   ON to_av.ship_id   = cp.to_ship_id
         WHERE cp.is_available = true
           AND (
             cp.from_ship_id::text = $1
             OR from_av.pledge_availability IS NULL
             OR LOWER(from_av.pledge_availability) LIKE '%always available%'
           )
           AND (
             cp.to_ship_id::text = $2
             OR to_av.pledge_availability IS NULL
             OR LOWER(to_av.pledge_availability) LIKE '%always available%'
           )`,
        [String(fromShipId), String(toShipId)],
      );

      edges = ccuRows.map((row) => ({
        fromShipId: String(row.from_ship_id),
        toShipId: String(row.to_ship_id),
        standardPrice: Number(row.standard_price) || 0,
        warbondPrice: row.warbond_price ? Number(row.warbond_price) : null,
        isWarbondAvailable: row.is_warbond_available === true,
        isOwned: false,
        ownedLocation: null,
        ownedPricePaid: 0,
        isLimited: row.is_limited === true,
      }));
    } else {
      // ═══════════════════════════════════════════════════════════════════
      // MODE: "Esperar y Ahorrar" — generate ALL possible CCU edges from
      // ship MSRP/warbond data. This creates theoretical warbond edges
      // for every pair of CCU-eligible ships, maximizing savings.
      //
      // Rules:
      // - Only use ships that ARE still sold (is_ccu_eligible = true)
      // - Include limited ships (event/seasonal — they come back)
      // - Include non-flight-ready ships (they're cheaper now, will rise)
      // - Calculate warbond price as: target.warbondUsd - source.msrpUsd
      // - Never include permanently discontinued ships (is_ccu_eligible=false)
      // ═══════════════════════════════════════════════════════════════════

      // Gather CCU-eligible ships sorted by MSRP
      // Extra safety: exclude known in-game variants that should never have CCUs
      const EXCLUDE_PATTERNS = [
        /wikelo/i, /teach.*special/i, /best in show/i, /pirate/i,
        /executive edition/i, /citizencon.*edition/i, /\bOX$/i,
        /star kitten/i, /ghoulish/i,
      ];
      const eligibleShips: ShipNode[] = [];
      for (const ship of ships.values()) {
        if (!ship.isCcuEligible) continue;
        if (EXCLUDE_PATTERNS.some(p => p.test(ship.name))) continue;
        eligibleShips.push(ship);
      }
      eligibleShips.sort((a, b) => a.msrpUsd - b.msrpUsd);

      // Also load existing CCU prices for reference (to get any custom prices)
      const existingCcuRows: any[] = await sql.unsafe(`
        SELECT from_ship_id, to_ship_id, standard_price, warbond_price,
               is_warbond_available
        FROM ccu_prices
      `, []);
      const existingPrices = new Map<string, { standard: number; warbond: number | null; wbAvail: boolean }>();
      for (const row of existingCcuRows) {
        const key = `${String(row.from_ship_id)}->${String(row.to_ship_id)}`;
        existingPrices.set(key, {
          standard: Number(row.standard_price) || 0,
          warbond: row.warbond_price ? Number(row.warbond_price) : null,
          wbAvail: row.is_warbond_available === true,
        });
      }

      edges = [];

      // ── Realistic warbond discount caps ──
      // CIG warbond CCU discounts son consistentemente ~10% del MSRP del
      // target. Datos verificados en Pledge Store (2026-04-26):
      //   L-22 Alpha Wolf  $120 → $110 (8%)
      //   Prospector       $155 → $145 (6.5%)
      //   RAFT             $190 → $175 (8%)
      //   Hull B           $280 → $260 (7%)
      //   Valkyrie         $375 → $350 (7%)
      //   C2 Hercules      $400 → $360 (10%)
      //   Hull E           $750 → $675 (10%)
      // Antes usaba caps por rangos absolutos que se quedaban cortos para
      // naves >$300 (Hull E $750 capeaba a $40 cuando real era $75). Cap por
      // porcentaje fijo refleja mejor la realidad.
      function getMaxWarbondDiscount(targetMsrp: number): number {
        return Math.ceil(targetMsrp * 0.10);
      }

      // Generate edges for all pairs where target MSRP > source MSRP
      // This is O(n²) but n ~230 so ~26k pairs — manageable
      for (let i = 0; i < eligibleShips.length; i++) {
        const from = eligibleShips[i];
        for (let j = i + 1; j < eligibleShips.length; j++) {
          const to = eligibleShips[j];
          if (to.msrpUsd <= from.msrpUsd) continue;

          const key = `${from.id}->${to.id}`;
          const existing = existingPrices.get(key);

          // Standard price = target MSRP - source MSRP
          const standardPrice = existing?.standard || (to.msrpUsd - from.msrpUsd);

          // Warbond price calculation with realistic caps.
          // FIX 2026-04-26: en modo "Esperar y Ahorrar" aplicamos el CAP
          // TEÓRICO también al warbond real de BD para protegernos contra
          // outliers — entries scrape-adas de eventos pasados (CitizenCon,
          // IAE) donde CIG dio descuentos agresivos y temporales que ya no
          // son continuos. Sin esto, el algoritmo creía que un salto Hull A
          // ($90) → MOTH ($315) costaba $5 warbond (descuento del 97%) y
          // armaba paths irreales con muchos saltos warbond imposibles.
          //
          // CCU.5 (2026-05-03): cuando tenemos warbond REAL del Wiki
          // (`realWarbondByShipId.has(to.id)`), NO aplicamos el cap. El cap
          // teórico (10% MSRP) es solo un fallback para naves sin datos —
          // 41% de las naves tienen discount real > 10% (RAFT 42%, Cyclone
          // 27%, Idris-P 21%) y cap-earlas falsea las cadenas resultantes.
          let warbondPrice: number | null = null;
          let isWarbondAvailable = false;

          const maxDiscount = getMaxWarbondDiscount(to.msrpUsd);
          const hasRealWarbond = realWarbondByShipId.has(to.id);

          if (existing?.warbond != null && existing.warbond > 0) {
            // Si tenemos warbond REAL del Wiki para esta nave, confiar en
            // existing.warbond sin capear. Si no, mantener el cap defensivo.
            const realDiscount = standardPrice - existing.warbond;
            const cappedDiscount = hasRealWarbond
              ? Math.max(realDiscount, 0)
              : Math.min(Math.max(realDiscount, 0), maxDiscount);
            warbondPrice = standardPrice - cappedDiscount;
            isWarbondAvailable = cappedDiscount > 0;
          } else if (to.warbondUsd != null && to.warbondUsd > 0 && standardPrice > 0) {
            // to.warbondUsd YA fue priorizado al real del Wiki en el SELECT
            // inicial (ver `effectiveWarbond`). Si el ship tiene real, NO
            // capear; sino, aplicar cap teórico contra outliers de BD local.
            const rawShipDiscount = to.msrpUsd - to.warbondUsd;
            const cappedDiscount = hasRealWarbond
              ? Math.max(rawShipDiscount, 0)
              : Math.min(rawShipDiscount, maxDiscount);
            const theoreticalWB = standardPrice - cappedDiscount;

            if (theoreticalWB > 0 && cappedDiscount > 0) {
              warbondPrice = theoreticalWB;
              isWarbondAvailable = true;
            }
          }

          edges.push({
            fromShipId: from.id,
            toShipId: to.id,
            standardPrice,
            warbondPrice,
            isWarbondAvailable,
            isOwned: false,
            ownedLocation: null,
            ownedPricePaid: 0,
            isLimited: from.isLimited || to.isLimited,
          });
        }
      }
    }

    // ── 3. Merge user's owned CCUs ──
    if (ownedCCUs && ownedCCUs.length > 0) {
      edges = mergeUserInventory(
        edges,
        ships,
        ownedCCUs as UserOwnedCCU[],
      );
    }

    // ── 4. Run pathfinding ──
    const options: Partial<CalculateOptions> = {
      preferWarbond,
      includeOwned: true,
      hasBuybackToken,
      paymentPriority: paymentPriority as "balanced" | "prefer-cash" | "prefer-credits",
      maxSteps,
      excludeShipIds: (excludeShipIds as unknown[]).map(String),
      onlyAvailable,
      forceExcludeShipIds: (forceExcludeShipIds as unknown[]).map(String),
      forceIncludeShipIds: (forceIncludeShipIds as unknown[]).map(String),
    };

    // Si el user marcó waypoints obligatorios usamos la variante con sub-Dijkstras.
    // Sin waypoints, ambas funciones son equivalentes (la "WithWaypoints" delega).
    const chain = findCheapestChainWithWaypoints(
      String(fromShipId),
      String(toShipId),
      ships,
      edges,
      options,
    );

    // ── 5. Find alternatives ──
    let alternatives: any[] = [];
    if (includeAlternatives && chain) {
      alternatives = findAlternativeChains(
        String(fromShipId),
        String(toShipId),
        ships,
        edges,
        options,
        3,
      );
      if (alternatives.length > 0) {
        alternatives = alternatives.slice(1);
      }
    }

    // ── 6. Response ──
    return NextResponse.json({
      chain,
      alternatives,
      meta: {
        totalShips: ships.size,
        totalEdges: edges.length,
        ownedCCUsMatched: edges.filter(e => e.isOwned).length,
        mode: onlyAvailable ? "available_now" : "wait_and_save",
      },
    });
  } catch (error: any) {
    console.error("[API /ccu/calculate] Error:", error?.message || error);
    return NextResponse.json(
      { error: "Calculation failed", detail: error?.message || "Unknown" },
      { status: 500 },
    );
  }
}