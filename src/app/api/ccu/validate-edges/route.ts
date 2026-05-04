// =============================================================================
// SC LABS — POST /api/ccu/validate-edges
//
// CB.4 (2026-05-04): Recibe una lista de pares (fromShipId → toShipId) y
// devuelve, para cada par, si existe un edge CCU válido y cuál sería el
// precio mínimo. Usado por la pizarra del Chain Board para pintar flechas
// verde/azul/roja entre cards adyacentes.
//
// Body:
//   { pairs: [{ fromShipId, toShipId }, ...], ownedCCUs?: [...] }
//
// Response:
//   { results: [{ fromShipId, toShipId, status, minPrice, bestPriceKind, reason }] }
//
// status:
//   - "valid"        → existe un edge CCU comprable hoy (warbond o std)
//   - "valid-owned"  → el user ya tiene este CCU (hangar/buyback)
//   - "invalid"      → no existe edge en ccu_prices (variant mismatch, downgrade, ineligible)
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

interface PairRequest {
  fromShipId: string;
  toShipId: string;
}

interface OwnedCCURequest {
  fromShip: string;
  toShip: string;
  pricePaid: number;
  location: "hangar" | "buyback";
}

interface ValidationResult {
  fromShipId: string;
  toShipId: string;
  status: "valid" | "valid-owned" | "invalid";
  minPrice: number | null;
  bestPriceKind: "warbond" | "standard" | "owned-hangar" | "owned-buyback" | null;
  reason: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const pairs: PairRequest[] = Array.isArray(body?.pairs) ? body.pairs : [];
    const ownedCCUs: OwnedCCURequest[] = Array.isArray(body?.ownedCCUs) ? body.ownedCCUs : [];

    if (pairs.length === 0) {
      return NextResponse.json({ results: [] });
    }
    if (pairs.length > 50) {
      return NextResponse.json(
        { error: "Máximo 50 pairs por request" },
        { status: 400 },
      );
    }

    // Cargar todos los pares de ccu_prices que aplican (1 query batch)
    const fromIds = [...new Set(pairs.map((p) => String(p.fromShipId)))];
    const toIds = [...new Set(pairs.map((p) => String(p.toShipId)))];

    const ccuRows: any[] = await sql.unsafe(
      `SELECT from_ship_id, to_ship_id, standard_price, warbond_price,
              is_available, is_warbond_available
         FROM ccu_prices
        WHERE from_ship_id::text = ANY($1::text[])
          AND to_ship_id::text = ANY($2::text[])`,
      [fromIds, toIds],
    );
    const edgeMap = new Map<
      string,
      { standard: number; warbond: number | null; isAvailable: boolean; warbondAvailable: boolean }
    >();
    for (const row of ccuRows) {
      const key = `${String(row.from_ship_id)}->${String(row.to_ship_id)}`;
      edgeMap.set(key, {
        standard: Number(row.standard_price) || 0,
        warbond: row.warbond_price != null ? Number(row.warbond_price) : null,
        isAvailable: row.is_available === true,
        warbondAvailable: row.is_warbond_available === true,
      });
    }

    // También cargamos info de naves para poder dar reason explicativa cuando
    // no hay edge (ej. "downgrade detectado" si toMsrp < fromMsrp).
    const allShipIds = [...new Set([...fromIds, ...toIds])];
    const shipRows: any[] = await sql.unsafe(
      `SELECT s.id, s.name, sp.msrp_usd, sp.is_ccu_eligible
         FROM ships s
         LEFT JOIN ship_price sp ON sp.id = s.id
        WHERE s.id::text = ANY($1::text[])`,
      [allShipIds],
    );
    const shipInfoMap = new Map<string, { name: string; msrp: number; eligible: boolean }>();
    for (const row of shipRows) {
      shipInfoMap.set(String(row.id), {
        name: String(row.name),
        msrp: Number(row.msrp_usd) || 0,
        eligible: row.is_ccu_eligible !== false,
      });
    }

    // Construir lookup de owned CCUs por par de nombres (case-insensitive).
    const ownedByPair = new Map<string, OwnedCCURequest>();
    for (const o of ownedCCUs) {
      const k = `${o.fromShip.toLowerCase()}|${o.toShip.toLowerCase()}`;
      // Si hay duplicados (raro), preferir el de hangar al de buyback
      if (!ownedByPair.has(k) || (o.location === "hangar" && ownedByPair.get(k)!.location !== "hangar")) {
        ownedByPair.set(k, o);
      }
    }

    // Validar cada par
    const results: ValidationResult[] = pairs.map((p) => {
      const fromId = String(p.fromShipId);
      const toId = String(p.toShipId);
      const fromInfo = shipInfoMap.get(fromId);
      const toInfo = shipInfoMap.get(toId);

      // Edge case: ship no existe en BD
      if (!fromInfo || !toInfo) {
        return {
          fromShipId: fromId,
          toShipId: toId,
          status: "invalid",
          minPrice: null,
          bestPriceKind: null,
          reason: "Una de las naves no existe en la BD",
        };
      }

      // Owned CCU match (gana sobre cualquier edge nuevo)
      const ownedKey = `${fromInfo.name.toLowerCase()}|${toInfo.name.toLowerCase()}`;
      const owned = ownedByPair.get(ownedKey);
      if (owned) {
        return {
          fromShipId: fromId,
          toShipId: toId,
          status: "valid-owned",
          minPrice: owned.pricePaid,
          bestPriceKind: owned.location === "hangar" ? "owned-hangar" : "owned-buyback",
          reason: `CCU owned en ${owned.location} ($${owned.pricePaid.toFixed(0)})`,
        };
      }

      // Downgrade detection
      if (toInfo.msrp <= fromInfo.msrp) {
        return {
          fromShipId: fromId,
          toShipId: toId,
          status: "invalid",
          minPrice: null,
          bestPriceKind: null,
          reason: `Downgrade: ${toInfo.name} ($${toInfo.msrp}) ≤ ${fromInfo.name} ($${fromInfo.msrp}). RSI no permite CCU hacia menor valor.`,
        };
      }

      // Edge en BD
      const key = `${fromId}->${toId}`;
      const edge = edgeMap.get(key);
      if (!edge || !edge.isAvailable) {
        return {
          fromShipId: fromId,
          toShipId: toId,
          status: "invalid",
          minPrice: null,
          bestPriceKind: null,
          reason: edge
            ? `CCU ${fromInfo.name} → ${toInfo.name} no está disponible hoy (probablemente solo en eventos)`
            : `Sin CCU directo de ${fromInfo.name} → ${toInfo.name}. Probá con un paso intermedio.`,
        };
      }

      // Determinar mejor precio (warbond si disponible, sino standard)
      const useWarbond =
        edge.warbond != null && edge.warbond > 0 && edge.warbondAvailable && edge.warbond < edge.standard;
      const minPrice = useWarbond ? edge.warbond! : edge.standard;
      const bestPriceKind: "warbond" | "standard" = useWarbond ? "warbond" : "standard";

      return {
        fromShipId: fromId,
        toShipId: toId,
        status: "valid",
        minPrice,
        bestPriceKind,
        reason: useWarbond
          ? `Warbond $${edge.warbond} (std $${edge.standard})`
          : `Standard $${edge.standard}`,
      };
    });

    return NextResponse.json({ results });
  } catch (e: any) {
    console.error("[/api/ccu/validate-edges]", e?.message ?? e);
    return NextResponse.json(
      { error: "validate-edges failed", detail: e?.message ?? "unknown" },
      { status: 500 },
    );
  }
}
