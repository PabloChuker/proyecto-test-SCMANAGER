// =============================================================================
// AL FILO — Tipos de dominio para Naves y Loadouts
//
// Estrategia: Prisma genera tipos base desde el schema. Acá definimos los
// tipos de RESPUESTA de la API, que incluyen relaciones anidadas.
// Así el frontend sabe exactamente qué forma tiene cada response.
// =============================================================================

import type { Prisma } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos de respuesta de API (incluyen relaciones)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lo que devuelve GET /api/ships — lista resumida.
 * No incluye rawData ni hardpoints (son pesados para una lista).
 */
export type ShipListItem = Prisma.ItemGetPayload<{
  select: {
    id: true;
    reference: true;
    name: true;
    localizedName: true;
    type: true;
    size: true;
    manufacturer: true;
    gameVersion: true;
    ship: {
      select: {
        maxCrew: true;
        cargo: true;
        maxSpeed: true;
        role: true;
        focus: true;
        career: true;
        lengthMeters: true;
        beamMeters: true;
        heightMeters: true;
      };
    };
  };
}>;

/**
 * Lo que devuelve GET /api/ships/[id] — detalle completo con loadout.
 * Incluye todos los hardpoints con sus items equipados y stats.
 */
export type ShipDetail = Prisma.ItemGetPayload<{
  include: {
    ship: true;
    hardpoints: {
      include: {
        equippedItem: {
          include: {
            componentStats: true;
          };
        };
      };
    };
  };
}>;

/**
 * Un hardpoint con su item equipado y stats — para usar en componentes.
 */
export type HardpointWithEquipped = Prisma.HardpointGetPayload<{
  include: {
    equippedItem: {
      include: {
        componentStats: true;
      };
    };
  };
}>;

// ─────────────────────────────────────────────────────────────────────────────
// Tipos para la API request/response
// ─────────────────────────────────────────────────────────────────────────────

/** Parámetros de query para GET /api/ships */
export interface ShipListParams {
  search?: string;
  manufacturer?: string;
  role?: string;
  career?: string;
  page?: number;
  limit?: number;
  sortBy?: "name" | "manufacturer" | "maxSpeed" | "cargo" | "maxCrew";
  sortOrder?: "asc" | "desc";
}

/** Respuesta paginada de GET /api/ships */
export interface ShipListResponse {
  data: ShipListItem[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    manufacturers: string[];  // Para filtros del UI
  };
}

/** Respuesta de GET /api/ships/[id] */
export interface ShipDetailResponse {
  data: ShipDetail;
  computed: {
    totalDps: number;
    totalShieldHp: number;
    totalPowerDraw: number;
    totalPowerOutput: number;
    totalCooling: number;
    powerBalance: number;       // output - draw (positivo = OK)
    hardpointSummary: {
      weapons: number;
      missiles: number;
      shields: number;
      coolers: number;
      powerPlants: number;
      quantumDrives: number;
    };
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de tipo para el frontend
// ─────────────────────────────────────────────────────────────────────────────

/** Categorías de hardpoint agrupadas para el UI */
export const HARDPOINT_GROUPS = {
  offensive: ["WEAPON", "MISSILE_RACK", "TURRET"],
  defensive: ["SHIELD", "ARMOR", "COUNTERMEASURE"],
  systems: ["POWER_PLANT", "COOLER", "QUANTUM_DRIVE", "RADAR", "AVIONICS"],
  propulsion: ["THRUSTER_MAIN", "THRUSTER_MANEUVERING", "FUEL_TANK", "FUEL_INTAKE"],
  utility: ["MINING", "UTILITY", "OTHER"],
} as const;

/** Colores para categorías de hardpoint en el UI */
export const HARDPOINT_COLORS: Record<string, string> = {
  WEAPON:               "#ef4444", // rojo
  MISSILE_RACK:         "#f97316", // naranja
  TURRET:               "#f59e0b", // ámbar
  SHIELD:               "#3b82f6", // azul
  ARMOR:                "#6366f1", // índigo
  COUNTERMEASURE:       "#8b5cf6", // violeta
  POWER_PLANT:          "#22c55e", // verde
  COOLER:               "#06b6d4", // cyan
  QUANTUM_DRIVE:        "#a855f7", // púrpura
  RADAR:                "#14b8a6", // teal
  AVIONICS:             "#64748b", // slate
  THRUSTER_MAIN:        "#eab308", // amarillo
  THRUSTER_MANEUVERING: "#84cc16", // lima
  FUEL_TANK:            "#78716c", // stone
  FUEL_INTAKE:          "#a8a29e", // stone claro
  MINING:               "#f472b6", // rosa
  UTILITY:              "#94a3b8", // slate claro
  OTHER:                "#71717a", // zinc
};
