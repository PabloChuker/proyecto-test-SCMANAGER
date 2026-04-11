// =============================================================================
// SC LABS — Streamers · Ship Info Card Themes
//
// Presets de color usados por /streamers/cards y /streamers/overlay.
// Cada preset define el color de fondo principal, el color del texto y el
// accent (líneas divisorias, labels destacados, logo color).
// =============================================================================

export interface CardTheme {
  key: string;
  label: string;
  /** Fondo principal de la tarjeta */
  bg: string;
  /** Fondo secundario / paneles internos */
  bgPanel: string;
  /** Color base del texto */
  text: string;
  /** Color de labels secundarios */
  textMuted: string;
  /** Color de acento — borde, líneas divisorias, highlights de valores */
  accent: string;
  /** Color del logo SC Labs (para monocromo) */
  logoTint: string;
  /** Borde general */
  border: string;
}

export const CARD_THEMES: CardTheme[] = [
  {
    key: "black",
    label: "Negro clásico",
    bg: "#000000",
    bgPanel: "#0a0a0a",
    text: "#f4f4f5",
    textMuted: "#71717a",
    accent: "#f59e0b",
    logoTint: "#f59e0b",
    border: "#27272a",
  },
  {
    key: "light",
    label: "Claro",
    bg: "#fafafa",
    bgPanel: "#ffffff",
    text: "#18181b",
    textMuted: "#71717a",
    accent: "#ea580c",
    logoTint: "#ea580c",
    border: "#e4e4e7",
  },
  {
    key: "pink",
    label: "Barbie",
    bg: "#f5aeeb",
    bgPanel: "#efa0e3",
    text: "#2d0a24",
    textMuted: "#6b2858",
    accent: "#8e1664",
    logoTint: "#8e1664",
    border: "#d77cc3",
  },
  {
    key: "orange",
    label: "SC Labs Orange",
    bg: "#1a0f00",
    bgPanel: "#26160a",
    text: "#fef3c7",
    textMuted: "#fbbf24",
    accent: "#f59e0b",
    logoTint: "#fbbf24",
    border: "#78350f",
  },
  {
    key: "purple",
    label: "Púrpura",
    bg: "#140524",
    bgPanel: "#1f0a33",
    text: "#ede9fe",
    textMuted: "#c4b5fd",
    accent: "#a855f7",
    logoTint: "#c084fc",
    border: "#4c1d95",
  },
  {
    key: "cyan",
    label: "Cian",
    bg: "#00141a",
    bgPanel: "#001f26",
    text: "#cffafe",
    textMuted: "#67e8f9",
    accent: "#06b6d4",
    logoTint: "#22d3ee",
    border: "#164e63",
  },
  {
    key: "green",
    label: "Verde",
    bg: "#03170a",
    bgPanel: "#052111",
    text: "#d1fae5",
    textMuted: "#6ee7b7",
    accent: "#22c55e",
    logoTint: "#34d399",
    border: "#14532d",
  },
  {
    key: "red",
    label: "Rojo",
    bg: "#1a0303",
    bgPanel: "#260606",
    text: "#fee2e2",
    textMuted: "#fca5a5",
    accent: "#ef4444",
    logoTint: "#f87171",
    border: "#7f1d1d",
  },
  {
    key: "navy",
    label: "Azul Marino",
    bg: "#020617",
    bgPanel: "#0f172a",
    text: "#e0e7ff",
    textMuted: "#93c5fd",
    accent: "#3b82f6",
    logoTint: "#60a5fa",
    border: "#1e3a8a",
  },
  {
    key: "steel",
    label: "Acero",
    bg: "#18181b",
    bgPanel: "#27272a",
    text: "#fafafa",
    textMuted: "#a1a1aa",
    accent: "#e4e4e7",
    logoTint: "#f4f4f5",
    border: "#52525b",
  },
  {
    key: "gold",
    label: "Oro",
    bg: "#1a1505",
    bgPanel: "#2a2208",
    text: "#fef3c7",
    textMuted: "#fde68a",
    accent: "#eab308",
    logoTint: "#facc15",
    border: "#713f12",
  },
];

export function getTheme(key: string): CardTheme {
  return CARD_THEMES.find((t) => t.key === key) ?? CARD_THEMES[0];
}

export type CardVariant = "horizontal" | "vertical";
