"use client";
// =============================================================================
// SC LABS — ShipHeroCard (Loadout.20, 2026-11-14)
//
// Cabecera de la nave: el MODELO 3D real (GLB) girando en vista libre — se
// puede arrastrar para orbitarlo — junto al nombre, fabricante y los datos
// de identidad. Es lo que distingue a SC Labs: donde otros calculadores
// muestran una foto, acá va el modelo.
// =============================================================================

import { memo } from "react";
import dynamic from "next/dynamic";
import { useLoadoutStore } from "@/store/useLoadoutStore";
import { shipGlbCandidates } from "@/lib/shipGlb";
import { fmtInt } from "./DeckCard";

// Three.js es pesado: se carga aparte y solo en el cliente.
const ShipViewer3D = dynamic(
  () => import("@/components/shared/flight-dynamics").then((m) => ({ default: m.ShipViewer3D })),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-4 h-4 border-2 border-zinc-800 border-t-amber-500 rounded-full animate-spin" />
      </div>
    ),
  },
);

function Tag({ children, strong = false }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <span
      className={
        "inline-flex items-center h-[22px] px-2 rounded text-[11px] font-semibold whitespace-nowrap " +
        (strong
          ? "bg-amber-500 text-zinc-950"
          : "bg-amber-500/10 text-amber-300 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.35)]")
      }
    >
      {children}
    </span>
  );
}

function Spec({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] font-mono uppercase tracking-[0.14em] text-zinc-500">{label}</div>
      <div className="mt-0.5 text-[15px] font-mono font-bold tabular-nums text-zinc-100 truncate">
        {value}
        {unit && <span className="ml-1 text-[10px] font-normal text-zinc-500">{unit}</span>}
      </div>
    </div>
  );
}

export const ShipHeroCard = memo(function ShipHeroCard() {
  const shipInfo = useLoadoutStore((s) => s.shipInfo);
  if (!shipInfo) return null;

  const name = shipInfo.localizedName || shipInfo.name;
  const mfr = shipInfo.manufacturer;
  // "Anvil Asgard" → "Asgard" cuando el fabricante ya va en la línea de arriba.
  const firstWord = mfr?.split(" ")[0];
  const shortName = firstWord && name.startsWith(firstWord + " ") ? name.slice(firstWord.length + 1) : name;

  return (
    <section className="rounded-lg border border-zinc-800/80 bg-zinc-950/75 backdrop-blur-sm overflow-hidden grid grid-cols-1 sm:grid-cols-[minmax(0,11fr)_minmax(0,9fr)]">
      {/* ── Modelo 3D ── */}
      <div className="relative h-[220px] sm:h-[250px] bg-[radial-gradient(ellipse_at_center,rgba(161,161,170,0.18),rgba(245,158,11,0.07)_45%,transparent_72%)] border-b sm:border-b-0 sm:border-r border-zinc-800/70">
        <ShipViewer3D
          key={shipInfo.reference}
          rotationAxis="free"
          autoRotate
          autoRotateSpeed={0.9}
          showAxis={false}
          zoom={1.35}
          transparent
          glbUrl={shipGlbCandidates(shipInfo.reference)}
        />
        <span className="pointer-events-none absolute left-2.5 bottom-2 text-[9px] font-mono uppercase tracking-[0.18em] text-zinc-600">
          3D · drag to orbit
        </span>
      </div>

      {/* ── Identidad ── */}
      <div className="min-w-0 p-4 flex flex-col justify-center gap-3">
        <div className="min-w-0">
          {mfr && <div className="text-[11px] text-zinc-400 truncate">{mfr}</div>}
          <h1 className="text-[30px] leading-[1.05] font-bold tracking-tight text-zinc-50 truncate">
            {shortName}
          </h1>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {shipInfo.size != null && shipInfo.size > 0 && <Tag strong>S{shipInfo.size}</Tag>}
          {shipInfo.role && <Tag>{shipInfo.role}</Tag>}
          {shipInfo.focus && shipInfo.focus !== shipInfo.role && <Tag>{shipInfo.focus}</Tag>}
          {shipInfo.crew != null && shipInfo.crew > 0 && <Tag>{shipInfo.crew} crew</Tag>}
          {shipInfo.cargo != null && shipInfo.cargo > 0 && <Tag>{fmtInt(shipInfo.cargo)} SCU</Tag>}
        </div>
        <div className="grid grid-cols-3 gap-3 pt-3 border-t border-zinc-800/60">
          <Spec label="SCM" value={fmtInt(shipInfo.scmSpeed)} unit="m/s" />
          <Spec label="NAV" value={fmtInt(shipInfo.afterburnerSpeed)} unit="m/s" />
          <Spec
            label="Mass"
            value={shipInfo.mass && shipInfo.mass > 0 ? fmtInt(shipInfo.mass / 1000) : "—"}
            unit="t"
          />
        </div>
        {shipInfo.gameVersion && (
          <div className="text-[9px] font-mono uppercase tracking-[0.14em] text-zinc-600 truncate">
            Game data {shipInfo.gameVersion}
          </div>
        )}
      </div>
    </section>
  );
});
