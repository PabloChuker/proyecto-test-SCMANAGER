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
import { getOnlineVersionsArray } from "@/lib/onlineVersions";
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
    //
    // 2026-05-12 (Loadout.14 / CCU.16): unificar fuente de MSRP con el endpoint
    // /api/ccu/ships → usar COALESCE(sp.msrp_usd, spc.pledge_usd). Antes este
    // solver solo miraba sp.msrp_usd y excluía concept ships (Greycat UTV,
    // Anvil MTC, etc.) que tienen precio en el wiki canonical pero aún no en
    // ship_price. Resultado: el user las veía en el dropdown del Planner pero
    // al elegirlas como FROM/TO fallaba "ship not found or missing MSRP data".
    // Ahora cualquier nave con precio en alguna de las dos tablas entra al
    // grafo y puede ser punto de partida o destino de una cadena.
    // 2026-05-12 (CCU.17): segundo LEFT JOIN por nombre — ver comentario
    // detallado en /api/ccu/ships. Cubre el caso de naves cuyo ship_id quedó
    // NULL en ship_prices_canonical porque el script de matching falló (ej.
    // Anvil Spartan: JSON wiki dice "Spartan", BD dice "Anvil Spartan").
    // 2026-05-13 (CCU.25): wiki canonical primero (más actualizado), ship_price
    // como fallback histórico. Antes ship_price ganaba siempre y bloqueaba
    // las actualizaciones de precio (Drake Ironclad subió $400→$450 en RSI,
    // el wiki se actualizó pero ship_price quedó viejo → el solver y el
    // dropdown mostraban $400).
    // Sitio.12 (2026-06-12): este endpoint ignoraba el kill-switch
    // game_versions.online y mezclaba naves 4.7.0 offline con 4.8.0 (doble
    // espacio de ids para la misma nave). Filtramos a versiones online;
    // CONCEPT sigue pasando (comportamiento deliberado de CCU.16) salvo que
    // la nave ya exista en una versión online (ej. Ironclad: el nodo CONCEPT
    // duplicado sobra y reintroduciría el doble id). Además los precios se
    // resuelven por class_name vía LATERAL (mismo patrón que /api/ccu/ships):
    // ship_price/ship_prices_canonical referencian ids de imports viejos, así
    // que el join directo por id dejaba a casi todas las naves online sin MSRP.
    const onlineGvList = await getOnlineVersionsArray();
    const gvFilter = onlineGvList
      ? `AND (s.game_version = ANY($1::text[])
              OR (s.game_version = 'CONCEPT' AND NOT EXISTS (
                    SELECT 1 FROM ships so
                    WHERE so.class_name = s.class_name
                      AND so.game_version = ANY($1::text[]))))`
      : "";
    const shipRows: any[] = await sql.unsafe(`
      SELECT s.id, s.class_name AS reference, s.name, m.name AS manufacturer,
             COALESCE(spc.pledge_usd, spc_name.pledge_usd, sp.msrp_usd) AS msrp_usd,
             COALESCE(spc.warbond_usd, spc_name.warbond_usd, sp.warbond_usd) AS warbond_usd,
             COALESCE(spc.warbond_usd, spc_name.warbond_usd) AS warbond_usd_real,
             COALESCE(spc.pledge_availability, spc_name.pledge_availability) AS pledge_availability,
             COALESCE(sp.is_ccu_eligible, true) AS is_ccu_eligible,
             COALESCE(sp.is_limited, false) AS is_limited,
             COALESCE(s.flight_status, 'flight_ready') AS flight_status
      FROM ships s
      LEFT JOIN LATERAL (
        SELECT sp2.* FROM ship_price sp2
        JOIN ships sx ON sx.id = sp2.id AND sx.class_name = s.class_name
        ORDER BY sx.game_version DESC LIMIT 1
      ) sp ON true
      LEFT JOIN LATERAL (
        SELECT spc2.* FROM ship_prices_canonical spc2
        JOIN ships sx2 ON sx2.id = spc2.ship_id AND sx2.class_name = s.class_name
        ORDER BY sx2.game_version DESC LIMIT 1
      ) spc ON true
      LEFT JOIN manufacturers m ON m.id = s.manufacturer_id
      LEFT JOIN ship_prices_canonical spc_name
        ON spc.ship_id IS NULL
       AND LOWER(spc_name.ship_name) = LOWER(REGEXP_REPLACE(
             s.name,
             '^(Aegis|Anvil|Drake|RSI|Origin|MISC|Crusader|Esperia|Banu|Tumbril|Argo|Greycat|Kruger|Mirai|Vanduul|Aopoa|Consolidated Outland|Gatac|CNOU)\\s+',
             '', 'i'))
      WHERE COALESCE(spc.pledge_usd, spc_name.pledge_usd, sp.msrp_usd) IS NOT NULL
        AND COALESCE(spc.pledge_usd, spc_name.pledge_usd, sp.msrp_usd) > 0
        ${gvFilter}
      ORDER BY COALESCE(spc.pledge_usd, spc_name.pledge_usd, sp.msrp_usd) ASC
    `, onlineGvList ? [onlineGvList] : []);

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

    // Sitio.12 (2026-06-12): las 31.715 filas de ccu_prices referencian ship ids
    // del import 4.7.0-LIVE.11518367 (offline) mientras el catálogo y la UI mandan
    // ids 4.8.0 → sin re-resolución, "Armarla Ya" no encontraba NINGUNA edge para
    // el ship de partida y devolvía chain:null siempre. Resolvemos cada id canónico
    // (online) a TODOS sus ids homólogos por class_name y remapeamos las edges de
    // ccu_prices al espacio canónico. La respuesta siempre usa ids canónicos 4.8.
    const classToCanonical = new Map<string, string>();
    for (const ship of ships.values()) {
      if (ship.reference) classToCanonical.set(ship.reference, ship.id);
    }
    const aliasToCanonical = new Map<string, string>();
    const aliasesByCanonical = new Map<string, string[]>();
    if (classToCanonical.size > 0) {
      const aliasRows: any[] = await sql.unsafe(
        `SELECT DISTINCT id, class_name FROM ships WHERE class_name = ANY($1::text[])`,
        [[...classToCanonical.keys()]],
      );
      for (const row of aliasRows) {
        const canonId = classToCanonical.get(String(row.class_name));
        if (!canonId) continue;
        aliasToCanonical.set(String(row.id), canonId);
        const list = aliasesByCanonical.get(canonId);
        if (list) list.push(String(row.id));
        else aliasesByCanonical.set(canonId, [String(row.id)]);
      }
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
      // Sitio.12 (2026-06-12): la excepción start/target debe matchear también
      // los ids homólogos 4.7.0 (ccu_prices vive en ese espacio de ids).
      const fromIdAliases = aliasesByCanonical.get(String(fromShipId)) ?? [String(fromShipId)];
      const toIdAliases = aliasesByCanonical.get(String(toShipId)) ?? [String(toShipId)];
      const ccuRows: any[] = await sql.unsafe(
        `SELECT cp.from_ship_id, cp.to_ship_id, cp.standard_price, cp.warbond_price,
                cp.is_available, cp.is_warbond_available, cp.is_limited
         FROM ccu_prices cp
         LEFT JOIN ship_prices_canonical from_av ON from_av.ship_id = cp.from_ship_id
         LEFT JOIN ship_prices_canonical to_av   ON to_av.ship_id   = cp.to_ship_id
         WHERE cp.is_available = true
           AND (
             cp.from_ship_id::text = ANY($1::text[])
             OR from_av.pledge_availability IS NULL
             OR LOWER(from_av.pledge_availability) LIKE '%always available%'
           )
           AND (
             cp.to_ship_id::text = ANY($2::text[])
             OR to_av.pledge_availability IS NULL
             OR LOWER(to_av.pledge_availability) LIKE '%always available%'
           )`,
        [fromIdAliases, toIdAliases],
      );

      edges = [];
      for (const row of ccuRows) {
        // Sitio.12 (2026-06-12): remapear ids 4.7.0 de ccu_prices al id canónico
        // online; edges hacia naves sin homólogo en el grafo online se descartan.
        const edgeFromId = aliasToCanonical.get(String(row.from_ship_id));
        const edgeToId = aliasToCanonical.get(String(row.to_ship_id));
        if (!edgeFromId || !edgeToId) continue;
        const fromShip = ships.get(edgeFromId);
        const toShip = ships.get(edgeToId);
        if (!fromShip || !toShip) continue;
        // Sitio.12 (2026-06-12): delta del canónico FRESCO primero — el
        // standard_price de ccu_prices quedó stale (calculado 2026-04 con MSRPs
        // viejos; 9.892/31.715 filas difieren >$1 del delta real).
        const canonicalDelta = toShip.msrpUsd - fromShip.msrpUsd;
        edges.push({
          fromShipId: edgeFromId,
          toShipId: edgeToId,
          standardPrice: canonicalDelta > 0 ? canonicalDelta : (Number(row.standard_price) || 0),
          warbondPrice: row.warbond_price ? Number(row.warbond_price) : null,
          isWarbondAvailable: row.is_warbond_available === true,
          isOwned: false,
          ownedLocation: null,
          ownedPricePaid: 0,
          isLimited: row.is_limited === true,
        });
      }
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
        // Sitio.12 (2026-06-12): remapear los ids 4.7.0 de ccu_prices al espacio
        // canónico online — sin esto el lookup `4.8->4.8` de abajo jamás matcheaba.
        const fromKey = aliasToCanonical.get(String(row.from_ship_id)) ?? String(row.from_ship_id);
        const toKey = aliasToCanonical.get(String(row.to_ship_id)) ?? String(row.to_ship_id);
        const key = `${fromKey}->${toKey}`;
        existingPrices.set(key, {
          standard: Number(row.standard_price) || 0,
          warbond: row.warbond_price ? Number(row.warbond_price) : null,
          wbAvail: row.is_warbond_available === true,
        });
      }

      edges = [];

      // ── Realistic warbond discount caps ──
      //
      // 2026-05-13 (CCU.22) — RECALIBRACIÓN basada en feedback de Pablo:
      // los warbond reales de CIG son MUCHO más chicos de lo que el solver
      // ofrecía. Datos verificados en RSI Pledge Store hoy:
      //   - Naves chicas ($40-$80):  warbond $5-10 USD descuento (5-12%)
      //   - Naves medias ($200-$400): warbond $20-40 USD (8-12%)
      //   - Naves caras ($700+):    warbond $50 USD max (~7%)
      // CIG raramente discounta más de $50 absolutos incluso en naves caras.
      //
      // Cap = min(15% del MSRP target, $50 absoluto). El min asegura que:
      //   - Naves chicas se capean por porcentaje (15% de $40 = $6)
      //   - Naves caras se capean por absoluto ($50)
      // Esto bloquea los outliers de scrape histórico (CitizenCon, IAE) donde
      // CIG dio descuentos temporales agresivos del 30-80% que ya no aplican.
      //
      // Se eliminó el clampWarbondFloor (CCU.21) — era demasiado restrictivo
      // y bloqueaba descuentos legítimos en naves caras con CCUs grandes
      // (ej. Constellation → Hercules con discount $40 real cae bajo el 85%
      // floor del standard $85 = $72 floor). El cap solo basta.
      function getMaxWarbondDiscount(targetMsrp: number): number {
        return Math.min(Math.ceil(targetMsrp * 0.15), 50);
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
          // Sitio.12 (2026-06-12): invertida la prioridad — el delta canónico
          // FRESCO gana sobre existing.standard (stale de 2026-04, subestimaba
          // el costo: ej. Pulse→350r mostraba $5 con delta real $95).
          const canonicalDelta = to.msrpUsd - from.msrpUsd;
          const standardPrice = canonicalDelta > 0 ? canonicalDelta : (existing?.standard || 0);

          // Warbond price calculation with realistic caps.
          //
          // 2026-05-13 (CCU.21 — Audit Chain Board): REVERT del bypass de
          // cap para hasRealWarbond. El razonamiento de CCU.5 era: "naves
          // con warbond real en wiki pueden tener descuentos >10%". El
          // problema en la práctica: ese flag protegía del cap pero NO
          // validaba que existing.warbond (de la tabla `ccu_prices`) fuera
          // un valor sano — esa tabla tiene entradas de eventos pasados
          // (CitizenCon, IAE) con descuentos de 50-90% que ya no aplican.
          // Resultado: UTV ($40) → Spartan ($80) costaba $5 warbond
          // (87% descuento) y el solver armaba paths absurdos como
          // "10 naves → Drake Ironclad por $40 total" cuando lo real sería $300+.
          //
          // Fix:
          //   1. SIEMPRE aplicar `getMaxWarbondDiscount(15%)` como techo.
          //   2. SIEMPRE aplicar `clampWarbondFloor` (60% del standard) como
          //      piso para evitar valores absurdamente bajos.
          //   3. Estos dos guards en conjunto garantizan que cualquier CCU
          //      warbond cueste entre 60-100% del standard.
          let warbondPrice: number | null = null;
          let isWarbondAvailable = false;

          const maxDiscount = getMaxWarbondDiscount(to.msrpUsd);

          if (existing?.warbond != null && existing.warbond > 0) {
            const realDiscount = standardPrice - existing.warbond;
            const cappedDiscount = Math.min(Math.max(realDiscount, 0), maxDiscount);
            warbondPrice = standardPrice - cappedDiscount;
            isWarbondAvailable = cappedDiscount > 0;
          } else if (to.warbondUsd != null && to.warbondUsd > 0 && standardPrice > 0) {
            const rawShipDiscount = Math.max(to.msrpUsd - to.warbondUsd, 0);
            const cappedDiscount = Math.min(rawShipDiscount, maxDiscount);
            const theoreticalWB = standardPrice - cappedDiscount;

            if (theoreticalWB > 0 && cappedDiscount > 0) {
              warbondPrice = theoreticalWB;
              isWarbondAvailable = true;
            }
          }

          // 2026-05-13 (CCU.22) — Sanity: si el warbond CCU cae a $0 o se queda
          // igual al standard (descuento < $1), no es realmente un warbond,
          // es un edge sin descuento mal-etiquetado por data basura. Lo descartamos
          // para que el solver no lo prefiera ni la UI lo etiquete "Warbond" sin
          // razón. Caso típico: BD ccu_prices con warbond_price = $0 hace
          // theoreticalWB = standard (0 discount efectivo, pero isWarbondAvailable
          // se setea = true). Resultado: cadena llena de "Warbond $5" que en
          // realidad son normal price sin descuento.
          if (warbondPrice != null && (warbondPrice <= 0 || warbondPrice >= standardPrice)) {
            warbondPrice = null;
            isWarbondAvailable = false;
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