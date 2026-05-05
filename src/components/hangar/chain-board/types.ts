// =============================================================================
// SC LABS — Chain Board v2 (rewrite 2026-05-05)
//
// Tipos minimalistas para el canvas free-form de planificación de CCU.
// Inspirado en el mockup "Ship Upgrade Planner" — pero dark theme y conectado
// al hangar real del usuario.
// =============================================================================

/** Una nave del catálogo (vino de /api/ccu/ships). */
export interface CatalogShip {
  id: string;
  reference: string;
  name: string;
  manufacturer: string | null;
  /** Rol display-only: "combat" | "exploration" | "industrial" | "multi" | "ground" | etc.
   *  Si la BD no lo trae, queda null y la card no muestra ese tag. */
  role: string | null;
  msrpUsd: number;
  warbondUsd: number | null;
  imageUrl: string | null;
}

/** Tipo de upgrade entre dos naves del board. */
export type UpgradeKind = "normal" | "warbond" | "hanger";

/** Un nodo en la pizarra: una nave colocada en una posición. */
export interface BoardNode {
  id: string;
  ship: CatalogShip;
  position: { x: number; y: number };
}

/** Una conexión entre dos nodos del board (un CCU). */
export interface BoardEdge {
  id: string;
  source: string;     // BoardNode.id
  target: string;
  kind: UpgradeKind;
  price: number;
  /** True si la edge proviene de un CCU REAL del hangar del user — el
   *  trámite ya está comprado, así que kind/from/to son inmutables y no
   *  se cicla con click. Solo se puede borrar el bloque entero. */
  locked?: boolean;
  /** True si el precio fue editado manualmente — no se sobrescribe al
   *  ciclar kind. */
  priceManual?: boolean;
  /** True si la conexión no tiene CCU directo válido (RSI no permite el
   *  salto de A → B sin pasar por intermedios). Se renderiza en rojo. */
  invalid?: boolean;
}

/** Snapshot persistible (localStorage / export JSON). */
export interface BoardSnapshot {
  version: 2;
  nodes: BoardNode[];
  edges: BoardEdge[];
  savedAt: string;
}

// ── MIME types usados por el drag-and-drop entre columnas ↔ canvas ──────────
export const SHIP_MIME = "application/x-sclabs-ship";
export const HANGAR_CCU_MIME = "application/x-sclabs-hangar-ccu";

/** Payload del drag de un CCU del hangar (ambos extremos). */
export interface HangarCcuPayload {
  from: CatalogShip;
  to: CatalogShip;
  kind: UpgradeKind;
  price: number;
  /** True si proviene del hangar del user — la edge resultante queda locked. */
  owned: boolean;
}
