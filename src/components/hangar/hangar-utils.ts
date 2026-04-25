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
