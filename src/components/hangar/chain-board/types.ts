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
}
