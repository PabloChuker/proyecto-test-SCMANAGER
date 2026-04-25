// =============================================================================
// SC Labs — Hangar shared style tokens
//
// Estos diccionarios viven afuera de HangarShipCard / FleetList / etc. para que
// la vista lista y la vista cards compartan exactamente las mismas etiquetas y
// colores. Si cambia un color de insurance o un label de category, se cambia
// acá una sola vez.
// =============================================================================

import type { ItemCategory } from "@/store/useHangarStore";

export const INSURANCE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  LTI: { bg: "bg-emerald-500/20", text: "text-emerald-400", border: "border-emerald-500/30" },
  "120_months": { bg: "bg-amber-500/20", text: "text-amber-400", border: "border-amber-500/30" },
  "72_months": { bg: "bg-amber-400/20", text: "text-amber-300", border: "border-amber-400/30" },
  "48_months": { bg: "bg-orange-400/20", text: "text-orange-300", border: "border-orange-400/30" },
  "24_months": { bg: "bg-orange-500/20", text: "text-orange-400", border: "border-orange-500/30" },
  "6_months":  { bg: "bg-violet-500/20", text: "text-violet-400", border: "border-violet-500/30" },
  "3_months":  { bg: "bg-rose-500/20",   text: "text-rose-400",   border: "border-rose-500/30" },
  unknown:     { bg: "bg-zinc-500/20",   text: "text-zinc-400",   border: "border-zinc-500/30" },
};

export const INSURANCE_LABELS: Record<string, string> = {
  LTI: "LTI",
  "120_months": "120m",
  "72_months": "72m",
  "48_months": "48m",
  "24_months": "24m",
  "6_months": "6m",
  "3_months": "3m",
  unknown: "—",
};

export const CATEGORY_BADGE: Record<ItemCategory, { bg: string; text: string; border: string; label: string }> = {
  standalone_ship: { bg: "bg-cyan-500/20",   text: "text-cyan-400",   border: "border-cyan-500/30",   label: "Ship" },
  game_package:    { bg: "bg-indigo-500/20", text: "text-indigo-400", border: "border-indigo-500/30", label: "Package" },
  paint:           { bg: "bg-pink-500/20",   text: "text-pink-400",   border: "border-pink-500/30",   label: "Paint" },
  flair:           { bg: "bg-yellow-500/20", text: "text-yellow-400", border: "border-yellow-500/30", label: "Flair" },
  gear:            { bg: "bg-teal-500/20",   text: "text-teal-400",   border: "border-teal-500/30",   label: "Gear" },
  subscriber:      { bg: "bg-violet-500/20", text: "text-violet-400", border: "border-violet-500/30", label: "Sub" },
  upgrade:         { bg: "bg-sky-500/20",    text: "text-sky-400",    border: "border-sky-500/30",    label: "CCU" },
  other:           { bg: "bg-zinc-500/20",   text: "text-zinc-400",   border: "border-zinc-500/30",   label: "Other" },
};

export const LOCATION_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  hangar:    { bg: "bg-cyan-500/20",   text: "text-cyan-400",   border: "border-cyan-500/30" },
  buyback:   { bg: "bg-orange-500/20", text: "text-orange-400", border: "border-orange-500/30" },
  ccu_chain: { bg: "bg-purple-500/20", text: "text-purple-400", border: "border-purple-500/30" },
};
