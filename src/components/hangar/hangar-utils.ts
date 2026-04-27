// =============================================================================
// SC Labs — Hangar utilities
//
// Helpers compartidos entre vistas Cards y List del Hangar.
// =============================================================================

/**
 * Detecta y enmascara códigos de cupón (Imperator rewards, Referrals,
 * Best-In-Show codes, etc.) que vienen embebidos en el nombre del pledge.
 *
 * Patrones cubiertos (RSI suele incluir el código alfanumérico al final del
 * nombre del pledge, ej. "6 Months Imperator Reward - 20% Coupon: SRPN4FMFNF"):
 *
 *   • "Coupon: SRPN4FMFNF"    → "Coupon: ••••••••••"
 *   • "Code: ABCDE12345"      → "Code: ••••••••••"
 *   • "Voucher: XYZQQ123"     → "Voucher: ••••••••"
 *   • Strings de 8+ caracteres alfanuméricos en mayúsculas al final del nombre
 *     después de ":" o "-"
 *
 * Es importante NO redactar nombres normales como "MSD-322" o "RSI Mantis":
 * solo aplicamos cuando hay un PREFIJO explícito tipo "Coupon:" / "Code:" /
 * "Voucher:" / "Reward Code:". Eso evita falsos positivos en racks/turrets
 * que tienen alfanuméricos en su nombre legítimamente.
 *
 * Devuelve:
 *   - display: el nombre seguro para mostrar por default (con código tapado)
 *   - code:    el código real (string) si encontró uno, o null
 *   - hasCoupon: true cuando había algo que ocultar
 */
export interface CouponInfo {
  display: string;
  code: string | null;
  hasCoupon: boolean;
}

const COUPON_PATTERNS: Array<{ re: RegExp; placeholder: string }> = [
  // "Coupon: ABCD1234" — el patrón principal de Imperator rewards
  {
    re: /(\b(?:coupon|code|voucher|reward\s*code|gift\s*code)\s*[:\-]\s*)([A-Z0-9]{6,})/gi,
    placeholder: "$1••••••••••",
  },
];

const REVEAL_HOLD_MS = 0; // sin delay extra; quien clickea quiere ver ya

export function maskCoupon(name: string | null | undefined): CouponInfo {
  if (!name) return { display: "", code: null, hasCoupon: false };
  let code: string | null = null;
  let display = name;
  for (const { re, placeholder } of COUPON_PATTERNS) {
    re.lastIndex = 0;
    const m = re.exec(name);
    if (m) {
      // Capturar el primer código encontrado para que el botón "show" pueda
      // restaurarlo. Si hay múltiples (raro), revelamos el primero — los
      // pledges de RSI traen un solo código por item.
      code = m[2];
      re.lastIndex = 0;
      display = name.replace(re, placeholder);
      break;
    }
  }
  return { display, code, hasCoupon: code !== null };
}

/**
 * Tiempo (ms) que el código permanece visible tras el click "reveal".
 * El componente UI puede usar este valor para auto-ocultar.
 */
export const COUPON_AUTO_HIDE_MS = 8000;
export { REVEAL_HOLD_MS };

// =============================================================================
// SortableTableHeader — header reutilizable para columnas con ordenamiento
//
// Patrón: cada columna sortable tiene una `key` (string única). El padre
// mantiene state { sortKey, sortDir } y un handler `onSort(key)` que toggle
// dir si la misma key, o cambia key + setea dir default según tipo.
//
// Usado en: FleetList, BuybackList, WishlistList, CCUList, ChainList. La
// idea es que TODAS las tablas del Hangar tengan el mismo patrón.
// =============================================================================

import * as React from "react";

export type SortDir = "asc" | "desc";

export interface SortableHeaderProps<K extends string> {
  /** Key única de esta columna (ej. "name", "pledge", "date"). */
  sortKey: K;
  /** Texto que se muestra en el header. */
  label: string;
  /** Key actualmente activa en el padre (null = sin sort local). */
  activeKey: K | null;
  /** Dirección actual ("asc" | "desc"). */
  activeDir: SortDir;
  /** Callback al click — el padre decide si toggle dir o cambia de key. */
  onClick: (key: K) => void;
  /** Clases tailwind del wrapper (ancho, alineamiento, etc.). */
  className?: string;
  /** Alineamiento del label dentro del button. Default "left". */
  align?: "left" | "center" | "right";
  /** Si true, no es clickeable (columna no-sortable). Default false. */
  disabled?: boolean;
}

/**
 * Header de columna sortable. Muestra el label + indicador asc/desc cuando
 * la columna está activa.
 */
export function SortableHeader<K extends string>({
  sortKey,
  label,
  activeKey,
  activeDir,
  onClick,
  className = "",
  align = "left",
  disabled = false,
}: SortableHeaderProps<K>) {
  const isActive = activeKey === sortKey;
  const justify =
    align === "center" ? "justify-center" :
    align === "right" ? "justify-end" :
    "justify-start";

  if (disabled) {
    return React.createElement(
      "div",
      { className: `${className} ${justify} flex items-center gap-1` },
      label,
    );
  }

  const arrow = isActive ? (activeDir === "asc" ? "▲" : "▼") : "↕";
  const arrowColor = isActive ? "text-amber-400" : "text-zinc-700";

  return React.createElement(
    "button",
    {
      type: "button",
      onClick: () => onClick(sortKey),
      className: `${className} ${justify} flex items-center gap-1 hover:text-zinc-300 transition-colors cursor-pointer`,
    },
    React.createElement("span", null, label),
    React.createElement(
      "span",
      { className: `text-[8px] ${arrowColor}` },
      arrow,
    ),
  );
}

/**
 * Helper para el handler común: toggle dir si misma key, sino cambia key
 * con dir default.
 *
 * @param prevKey - sort key actual
 * @param prevDir - dirección actual
 * @param newKey - key clickeada
 * @param defaultDir - dir a usar si la key cambia (suele ser "asc" para
 *   strings y "desc" para números/fechas)
 * @returns nuevo { sortKey, sortDir }
 */
export function nextSortState<K extends string>(
  prevKey: K | null,
  prevDir: SortDir,
  newKey: K,
  defaultDir: SortDir = "asc",
): { sortKey: K; sortDir: SortDir } {
  if (prevKey === newKey) {
    return { sortKey: newKey, sortDir: prevDir === "asc" ? "desc" : "asc" };
  }
  return { sortKey: newKey, sortDir: defaultDir };
}

/**
 * Compara dos strings o números para ordenamiento. Maneja null/undefined
 * empujándolos al final independientemente de la dirección.
 */
export function compareValues(
  a: any,
  b: any,
  dir: SortDir,
): number {
  const aNull = a === null || a === undefined || a === "";
  const bNull = b === null || b === undefined || b === "";
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  if (typeof a === "number" && typeof b === "number") {
    return dir === "asc" ? a - b : b - a;
  }
  const sa = String(a).toLowerCase();
  const sb = String(b).toLowerCase();
  const cmp = sa.localeCompare(sb);
  return dir === "asc" ? cmp : -cmp;
}
