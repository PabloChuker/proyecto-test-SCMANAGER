"use client";
// =============================================================================
// SC LABS — Streamers · ShipInfoCard
//
// Tarjeta de información horizontal y vertical lista para exportar como PNG
// o mostrar en un Browser Source de OBS. Diseñada para ser legible a 1080p
// en overlays de stream y miniaturas de YouTube.
//
// El contenedor siempre lleva el logo de SC Labs y la frase "Cortesía de SC Labs"
// independientemente del tema elegido.
// =============================================================================

import Image from "next/image";
import type { ShipDetailResponseV2 } from "@/types/ships";
import { getTheme, type CardVariant } from "./ship-card-themes";

// ── Helpers de formateo ──

function fmt(n: number | null | undefined, decimals = 0): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (decimals > 0) return n.toFixed(decimals);
  return Math.round(n).toLocaleString("en-US");
}

function fmtScu(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n)}`;
}

function fmtHp(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n)}`;
}

const MFR_PREFIXES = [
  "Aegis", "RSI", "Drake", "MISC", "Anvil", "Origin", "Crusader", "Argo",
  "Aopoa", "Consolidated Outland", "Esperia", "Gatac", "Greycat", "Kruger",
  "Musashi Industrial", "Tumbril", "Banu", "Vanduul",
  "Roberts Space Industries", "Crusader Industries", "Musashi", "CO",
];

export function getShipImageUrl(
  name: string,
  manufacturer?: string | null
): string {
  let n = name || "";
  if (manufacturer) {
    const m = manufacturer.trim();
    if (n.startsWith(m + " ")) n = n.slice(m.length + 1);
  }
  for (const m of MFR_PREFIXES) {
    if (n.startsWith(m + " ")) {
      n = n.slice(m.length + 1);
      break;
    }
  }
  const slug = n
    .toLowerCase()
    .replace(/[''()]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/-$/, "");
  return `/ships/${slug}.webp`;
}

// ── Shared subcomponents ──

function StatCell({
  label,
  value,
  unit,
  theme,
}: {
  label: string;
  value: string;
  unit?: string;
  theme: ReturnType<typeof getTheme>;
}) {
  return (
    <div className="flex flex-col gap-0.5 leading-tight">
      <span
        className="text-[9px] tracking-[0.15em] uppercase font-mono"
        style={{ color: theme.textMuted }}
      >
        {label}
      </span>
      <span className="text-sm font-mono font-medium" style={{ color: theme.text }}>
        {value}
        {unit && (
          <span className="text-[9px] ml-0.5" style={{ color: theme.textMuted }}>
            {unit}
          </span>
        )}
      </span>
    </div>
  );
}

function SectionTitle({
  title,
  theme,
}: {
  title: string;
  theme: ReturnType<typeof getTheme>;
}) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <div
        className="w-1 h-3 rounded-full"
        style={{ backgroundColor: theme.accent }}
      />
      <h4
        className="text-[10px] tracking-[0.18em] uppercase font-mono font-medium"
        style={{ color: theme.accent }}
      >
        {title}
      </h4>
    </div>
  );
}

function LogoWordmark({
  theme,
  size = 22,
}: {
  theme: ReturnType<typeof getTheme>;
  size?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <Image
        src="/sclabs-logo.png"
        alt="SC LABS"
        width={size}
        height={size}
        className="rounded-sm"
        crossOrigin="anonymous"
        unoptimized
      />
      <div className="flex flex-col leading-none">
        <span
          className="text-[11px] tracking-[0.22em] uppercase font-semibold"
          style={{ color: theme.text }}
        >
          SC Labs
        </span>
        <span
          className="text-[7px] tracking-[0.2em] uppercase font-mono mt-0.5"
          style={{ color: theme.textMuted }}
        >
          Star Citizen Intelligence
        </span>
      </div>
    </div>
  );
}

// ── Props ──

interface ShipInfoCardProps {
  data: ShipDetailResponseV2;
  themeKey: string;
  variant: CardVariant;
  /** ID del nodo para que html-to-image lo encuentre */
  captureId?: string;
}

// ── Componente principal ──

export default function ShipInfoCard({
  data,
  themeKey,
  variant,
  captureId = "sclabs-ship-card",
}: ShipInfoCardProps) {
  const theme = getTheme(themeKey);
  const ship = data.data;
  const computed = data.computed;
  const specs = ship.ship;

  const displayName = ship.localizedName || ship.name;
  const imageUrl = getShipImageUrl(displayName, ship.manufacturer);

  // Totales desde computed (los que muestra el DPS calculator)
  const pilotDps = computed?.totalDps ?? null;
  const shieldHp = computed?.totalShieldHp ?? null;

  // Totales desde specs del barco
  const cargo = specs?.cargo ?? null;
  const maxSpeed = specs?.maxSpeed ?? null;
  const afterburner = specs?.afterburnerSpeed ?? null;
  const pitch = specs?.pitchRate ?? null;
  const yaw = specs?.yawRate ?? null;
  const roll = specs?.rollRate ?? null;
  const hydrogenFuel = specs?.hydrogenFuelCap ?? null;
  const quantumFuel = specs?.quantumFuelCap ?? null;
  const length = specs?.lengthMeters ?? null;
  const beam = specs?.beamMeters ?? null;
  const height = specs?.heightMeters ?? null;
  const maxCrew = specs?.maxCrew ?? null;

  if (variant === "horizontal") {
    return (
      <div
        id={captureId}
        className="relative overflow-hidden"
        style={{
          width: 1200,
          height: 560,
          backgroundColor: theme.bg,
          border: `1px solid ${theme.border}`,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        }}
      >
        {/* Border accent top */}
        <div
          className="absolute top-0 left-0 right-0 h-1"
          style={{ backgroundColor: theme.accent }}
        />

        {/* Main grid: image left, stats right */}
        <div className="absolute inset-0 p-8 flex gap-6">
          {/* Left column: image + name + manufacturer */}
          <div
            className="flex-shrink-0 flex flex-col justify-between"
            style={{ width: 480 }}
          >
            <div className="flex-1 flex items-center justify-center relative">
              <div
                className="relative w-full"
                style={{ height: 280, backgroundColor: theme.bgPanel }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt={displayName}
                  crossOrigin="anonymous"
                  className="absolute inset-0 w-full h-full object-contain p-2"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.opacity = "0.3";
                  }}
                />
              </div>
            </div>

            {/* Name + manufacturer */}
            <div className="mt-4">
              <div
                className="text-[10px] tracking-[0.22em] uppercase font-mono mb-1"
                style={{ color: theme.textMuted }}
              >
                {ship.manufacturer ?? "Manufacturer"}
              </div>
              <h2
                className="text-3xl font-light tracking-tight leading-none"
                style={{ color: theme.text }}
              >
                {displayName}
              </h2>
              {(ship.type || specs?.role) && (
                <div
                  className="text-xs font-mono mt-2"
                  style={{ color: theme.accent }}
                >
                  {[ship.type, specs?.role].filter(Boolean).join(" · ")}
                </div>
              )}
            </div>
          </div>

          {/* Right column: stat panels */}
          <div className="flex-1 flex flex-col gap-5 min-w-0">
            {/* Header with SC Labs logo */}
            <div className="flex items-center justify-between">
              <LogoWordmark theme={theme} size={26} />
              <div className="flex flex-col items-end">
                <span
                  className="text-[8px] tracking-[0.22em] uppercase font-mono"
                  style={{ color: theme.textMuted }}
                >
                  Ship Spec Sheet
                </span>
                <span
                  className="text-[10px] font-mono mt-0.5"
                  style={{ color: theme.accent }}
                >
                  {ship.gameVersion ?? "4.x"}
                </span>
              </div>
            </div>

            {/* Offense + Defense */}
            <div className="grid grid-cols-2 gap-5">
              <div
                className="p-3 rounded"
                style={{
                  backgroundColor: theme.bgPanel,
                  borderLeft: `2px solid ${theme.accent}`,
                }}
              >
                <SectionTitle title="⬡ Weaponry" theme={theme} />
                <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                  <StatCell
                    label="Pilot DPS"
                    value={fmt(pilotDps)}
                    theme={theme}
                  />
                  <StatCell
                    label="Weapons"
                    value={fmt(computed?.hardpointSummary?.weapons)}
                    theme={theme}
                  />
                  <StatCell
                    label="Missiles"
                    value={fmt(computed?.hardpointSummary?.missiles)}
                    theme={theme}
                  />
                  <StatCell
                    label="Alpha"
                    value={fmt(computed?.totalAlphaDamage)}
                    theme={theme}
                  />
                </div>
              </div>

              <div
                className="p-3 rounded"
                style={{
                  backgroundColor: theme.bgPanel,
                  borderLeft: `2px solid ${theme.accent}`,
                }}
              >
                <SectionTitle title="◈ Defense" theme={theme} />
                <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                  <StatCell
                    label="Shield HP"
                    value={fmtHp(shieldHp)}
                    theme={theme}
                  />
                  <StatCell
                    label="Shields"
                    value={fmt(computed?.hardpointSummary?.shields)}
                    theme={theme}
                  />
                  <StatCell
                    label="Power"
                    value={fmt(computed?.totalPowerOutput)}
                    unit="W"
                    theme={theme}
                  />
                  <StatCell
                    label="Cooling"
                    value={fmt(computed?.totalCooling)}
                    theme={theme}
                  />
                </div>
              </div>
            </div>

            {/* Mobility + Cargo */}
            <div className="grid grid-cols-2 gap-5">
              <div
                className="p-3 rounded"
                style={{
                  backgroundColor: theme.bgPanel,
                  borderLeft: `2px solid ${theme.accent}`,
                }}
              >
                <SectionTitle title="△ Mobility" theme={theme} />
                <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                  <StatCell
                    label="SCM"
                    value={fmt(maxSpeed)}
                    unit="m/s"
                    theme={theme}
                  />
                  <StatCell
                    label="Boost"
                    value={fmt(afterburner)}
                    unit="m/s"
                    theme={theme}
                  />
                  <StatCell
                    label="Pitch"
                    value={fmt(pitch, 1)}
                    unit="°/s"
                    theme={theme}
                  />
                  <StatCell
                    label="Yaw"
                    value={fmt(yaw, 1)}
                    unit="°/s"
                    theme={theme}
                  />
                </div>
              </div>

              <div
                className="p-3 rounded"
                style={{
                  backgroundColor: theme.bgPanel,
                  borderLeft: `2px solid ${theme.accent}`,
                }}
              >
                <SectionTitle title="⊞ Cargo & Crew" theme={theme} />
                <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                  <StatCell
                    label="Cargo"
                    value={fmtScu(cargo)}
                    unit="SCU"
                    theme={theme}
                  />
                  <StatCell
                    label="Crew"
                    value={fmt(maxCrew)}
                    theme={theme}
                  />
                  <StatCell
                    label="H₂ Fuel"
                    value={fmt(hydrogenFuel)}
                    theme={theme}
                  />
                  <StatCell
                    label="QT Fuel"
                    value={fmt(quantumFuel)}
                    theme={theme}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer: cortesía */}
        <div
          className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-8 py-2.5 border-t"
          style={{
            backgroundColor: theme.bgPanel,
            borderColor: theme.border,
          }}
        >
          <span
            className="text-[9px] tracking-[0.22em] uppercase font-mono"
            style={{ color: theme.textMuted }}
          >
            Cortesía de SC Labs
          </span>
          <span
            className="text-[9px] tracking-[0.22em] uppercase font-mono"
            style={{ color: theme.accent }}
          >
            sclabs · star citizen intelligence
          </span>
        </div>
      </div>
    );
  }

  // ── Vertical variant ──
  return (
    <div
      id={captureId}
      className="relative overflow-hidden"
      style={{
        width: 600,
        height: 1066, // ≈ 9:16 para Reels / Shorts / portrait overlays
        backgroundColor: theme.bg,
        border: `1px solid ${theme.border}`,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      }}
    >
      {/* Border accent top */}
      <div
        className="absolute top-0 left-0 right-0 h-1.5"
        style={{ backgroundColor: theme.accent }}
      />

      <div className="absolute inset-0 p-8 pt-10 flex flex-col">
        {/* Top: SC Labs brand */}
        <div className="flex items-center justify-between mb-6">
          <LogoWordmark theme={theme} size={30} />
          <span
            className="text-[9px] tracking-[0.22em] uppercase font-mono"
            style={{ color: theme.textMuted }}
          >
            {ship.gameVersion ?? "4.x"}
          </span>
        </div>

        {/* Ship image */}
        <div
          className="w-full flex items-center justify-center relative mb-5"
          style={{
            height: 320,
            backgroundColor: theme.bgPanel,
            borderTop: `2px solid ${theme.accent}`,
            borderBottom: `2px solid ${theme.accent}`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={displayName}
            crossOrigin="anonymous"
            className="absolute inset-0 w-full h-full object-contain p-3"
            onError={(e) => {
              (e.target as HTMLImageElement).style.opacity = "0.3";
            }}
          />
        </div>

        {/* Name + manufacturer */}
        <div className="mb-5">
          <div
            className="text-[10px] tracking-[0.24em] uppercase font-mono mb-1.5"
            style={{ color: theme.textMuted }}
          >
            {ship.manufacturer ?? "Manufacturer"}
          </div>
          <h2
            className="text-4xl font-light tracking-tight leading-none"
            style={{ color: theme.text }}
          >
            {displayName}
          </h2>
          {(ship.type || specs?.role) && (
            <div
              className="text-sm font-mono mt-2"
              style={{ color: theme.accent }}
            >
              {[ship.type, specs?.role].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>

        {/* Stats grid 2x4 */}
        <div
          className="grid grid-cols-2 gap-3 flex-1"
          style={{ alignContent: "start" }}
        >
          <div
            className="p-3 rounded"
            style={{
              backgroundColor: theme.bgPanel,
              borderLeft: `2px solid ${theme.accent}`,
            }}
          >
            <SectionTitle title="⬡ DPS Pilot" theme={theme} />
            <div className="text-2xl font-mono font-medium" style={{ color: theme.text }}>
              {fmt(pilotDps)}
            </div>
          </div>

          <div
            className="p-3 rounded"
            style={{
              backgroundColor: theme.bgPanel,
              borderLeft: `2px solid ${theme.accent}`,
            }}
          >
            <SectionTitle title="◈ Shields" theme={theme} />
            <div className="text-2xl font-mono font-medium" style={{ color: theme.text }}>
              {fmtHp(shieldHp)}
            </div>
          </div>

          <div
            className="p-3 rounded"
            style={{
              backgroundColor: theme.bgPanel,
              borderLeft: `2px solid ${theme.accent}`,
            }}
          >
            <SectionTitle title="⊞ Cargo" theme={theme} />
            <div className="text-2xl font-mono font-medium" style={{ color: theme.text }}>
              {fmtScu(cargo)}
              <span className="text-xs ml-1" style={{ color: theme.textMuted }}>
                SCU
              </span>
            </div>
          </div>

          <div
            className="p-3 rounded"
            style={{
              backgroundColor: theme.bgPanel,
              borderLeft: `2px solid ${theme.accent}`,
            }}
          >
            <SectionTitle title="△ SCM" theme={theme} />
            <div className="text-2xl font-mono font-medium" style={{ color: theme.text }}>
              {fmt(maxSpeed)}
              <span className="text-xs ml-1" style={{ color: theme.textMuted }}>
                m/s
              </span>
            </div>
          </div>

          <div
            className="p-3 rounded col-span-2"
            style={{
              backgroundColor: theme.bgPanel,
              borderLeft: `2px solid ${theme.accent}`,
            }}
          >
            <SectionTitle title="◎ Dimensions" theme={theme} />
            <div
              className="text-sm font-mono font-medium tracking-wide"
              style={{ color: theme.text }}
            >
              {fmt(length, 1)}
              <span className="text-[10px] mx-1" style={{ color: theme.textMuted }}>
                L
              </span>
              {" × "}
              {fmt(beam, 1)}
              <span className="text-[10px] mx-1" style={{ color: theme.textMuted }}>
                W
              </span>
              {" × "}
              {fmt(height, 1)}
              <span className="text-[10px] mx-1" style={{ color: theme.textMuted }}>
                H
              </span>
              <span className="text-[10px] ml-1" style={{ color: theme.textMuted }}>
                m
              </span>
            </div>
          </div>
        </div>

        {/* Footer: cortesía */}
        <div
          className="mt-5 pt-4 flex items-center justify-between border-t"
          style={{ borderColor: theme.border }}
        >
          <span
            className="text-[10px] tracking-[0.22em] uppercase font-mono"
            style={{ color: theme.textMuted }}
          >
            Cortesía de SC Labs
          </span>
          <span
            className="text-[10px] tracking-[0.22em] uppercase font-mono"
            style={{ color: theme.accent }}
          >
            sclabs.app
          </span>
        </div>
      </div>
    </div>
  );
}
