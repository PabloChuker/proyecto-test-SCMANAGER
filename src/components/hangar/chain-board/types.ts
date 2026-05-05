// =============================================================================
// SC LABS — Chain Board types compartidos
// =============================================================================

/** Una nave en el catálogo (de la BD o del wiki). */
export interface BoardShipRow {
  id: string;
  reference: string;
  name: string;
  manufacturer: string | null;
  msrpUsd: number;
  warbondUsd: number | null;
  flightStatus: string | null;
  pledgeAvailability: string | null; // 'Always available' | 'Time-limited sales' | ...
}

/** Una card en la pizarra: ship con metadata mínima para render + validación. */
export interface BoardCard {
  /** UUID de la card en la pizarra (para reordenar/drag). NO es el ship.id. */
  cardId: string;
  shipId: string;
  shipName: string;
  shipReference: string;
  manufacturer: string | null;
  msrpUsd: number;
  warbondUsd: number | null;
  /** Imagen URL: típicamente /ships/<slug>.webp o /jpg, computado en lookup. */
  imageUrl: string | null;
  /** Origen del ship: "fleet" si vino de Mi Inventario, "store" si vino de RSI. */
  origin: "fleet" | "store" | "manual";
  /** Si origin=fleet, referencia al HangarShip o HangarCCU ID original. */
  sourceItemId?: string;
  /**
   * CB.10 (2026-05-05): posición {x, y} en el canvas free-form. Las cards
   * mantienen su posición entre sesiones (persisted con el resto del board).
   * Nodos sin posición se auto-layout al montarse.
   */
  position?: { x: number; y: number };
  /**
   * CB.10: rol del nodo en la cadena. Útil para colorear distinto el
   * outline (BASE = naranja, TARGET = emerald, intermediate = zinc).
   * Calculado por el board, no persisted (deriva de la posición en la
   * cadena lógica).
   */
  role?: "base" | "intermediate" | "target";
}

/** Validación entre cards[i] y cards[i+1]. */
export type EdgeStatus =
  | "valid"        // existe CCU comprable hoy (warbond o std)
  | "valid-owned"  // el user tiene este CCU en hangar/buyback
  | "invalid"      // no hay edge — variant mismatch, no eligible, downgrade
  | "unknown";     // no validado todavía

export interface EdgeValidation {
  fromShipId: string;
  toShipId: string;
  status: EdgeStatus;
  /** Precio mínimo disponible para este salto (si valid o valid-owned). */
  minPrice: number | null;
  /** Tipo de mejor precio: warbond/standard/owned-hangar/owned-buyback. */
  bestPriceKind: "warbond" | "standard" | "owned-hangar" | "owned-buyback" | null;
  /** Mensaje human-readable para mostrar en tooltip. */
  reason: string;
  // CB.8 (2026-05-04): campos adicionales para el CCU builder estilo RSI.
  /** Precio standard del CCU (sin descuento warbond) — null si edge no existe. */
  standardPrice?: number | null;
  /** Precio warbond del CCU (cash only) — null si no hay warbond para este edge. */
  warbondPrice?: number | null;
  /** True si el edge tiene warbond actualmente disponible (no solo histórico). */
  warbondAvailable?: boolean;
  /** Si el user ya tiene este CCU, su precio pagado original. */
  ownedPricePaid?: number | null;
  ownedLocation?: "hangar" | "buyback" | null;
  ownedIsWarbond?: boolean | null;
  ownedGrantsInsurance?: string | null;
}
