"use client";
// =============================================================================
// SC LABS — Streamers · ShipInfoCard  (v3 — SPViewer-style sections + icons)
//
// Tarjeta de información horizontal (1800×720) y vertical (760×1560) lista
// para exportar como PNG o mostrar en un Browser Source de OBS.
// Mantiene aspecto cinematográfico en el hero (ship image + nombre gigante).
// Data strip reorganizada siguiendo la estructura de SPViewer: Hull · Armor ·
// Weaponry · Carrying Capacity · Fuel · Flight Performances · Accelerations ·
// Insurance — con icono SVG por sección.
// =============================================================================

import Image from "next/image";
import type { ShipDetailResponseV2 } from "@/types/ships";
import { getTheme, type CardVariant } from "./ship-card-themes";
import { ShipViewer3D } from "@/components/shared/flight-dynamics/ShipViewer3D";
import { shipGlbCandidates } from "@/lib/shipGlb";

// ─── Formato ─────────────────────────────────────────────────────────────────

const MISSING = "—";

function num(n: number | null | undefined, decimals = 0): string {
  if (n == null || Number.isNaN(n)) return MISSING;
  if (decimals > 0) return n.toFixed(decimals);
  return Math.round(n).toLocaleString("en-US").replace(/,/g, " ");
}

function toG(v: number | null | undefined): string {
  if (v == null) return MISSING;
  return (v / 9.80665).toFixed(1);
}

/** Multiplier (0.75 = -25%, 1.0 = 0%) → "+/- X %" */
function fmtMult(v: number | null | undefined): string {
  if (v == null) return MISSING;
  const pct = Math.round((v - 1) * 100);
  if (pct === 0) return "0 %";
  return `${pct > 0 ? "+" : ""}${pct} %`;
}

/** Seconds → "Xm XXs" */
function fmtTime(s: number | null | undefined): string {
  if (s == null) return MISSING;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}m ${sec.toString().padStart(2, "0")}s`;
}

const MFR_PREFIXES = [
  "Aegis", "RSI", "Drake", "MISC", "Anvil", "Origin", "Crusader", "Argo",
  "Aopoa", "Consolidated Outland", "Esperia", "Gatac", "Greycat", "Kruger",
  "Musashi Industrial", "Tumbril", "Banu", "Vanduul",
  "Roberts Space Industries", "Crusader Industries", "Musashi", "CO",
];

export function getShipImageUrl(name: string, manufacturer?: string | null): string {
  let n = name || "";
  if (manufacturer) {
    const m = manufacturer.trim();
    if (n.startsWith(m + " ")) n = n.slice(m.length + 1);
  }
  for (const m of MFR_PREFIXES) {
    if (n.startsWith(m + " ")) { n = n.slice(m.length + 1); break; }
  }
  const slug = n.toLowerCase()
    .replace(/[''()]/g, "").replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "-").replace(/-+/g, "-").replace(/-$/, "");
  return `/ships/${slug}.webp`;
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

type Theme = ReturnType<typeof getTheme>;

interface TypoScale {
  sectionTitle: number;  // icon+title in SectionBlock
  subSect: number;       // sub-section labels
  row: number;           // standard row
  unit: number;          // unit text
  mini: number;          // mini-stat
}

const TYPO_H: TypoScale = { sectionTitle: 11, subSect: 9, row: 13, unit: 11, mini: 12 };
const TYPO_V: TypoScale = { sectionTitle: 12, subSect: 10, row: 14, unit: 11, mini: 13 };

// ─── Iconos SVG inline ───────────────────────────────────────────────────────

const PlaneIcon = ({ c }: { c: string }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill={c}>
    <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
  </svg>
);

const ShieldIcon = ({ c }: { c: string }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill={c}>
    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
  </svg>
);

const CrosshairIcon = ({ c }: { c: string }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2">
    <circle cx="12" cy="12" r="8" />
    <line x1="12" y1="2" x2="12" y2="6" />
    <line x1="12" y1="18" x2="12" y2="22" />
    <line x1="2" y1="12" x2="6" y2="12" />
    <line x1="18" y1="12" x2="22" y2="12" />
    <circle cx="12" cy="12" r="2" fill={c} />
  </svg>
);

const BoxIcon = ({ c }: { c: string }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

const DropletIcon = ({ c }: { c: string }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill={c}>
    <path d="M12 2C6 9 4 13 4 16a8 8 0 0 0 16 0c0-3-2-7-8-14z" />
  </svg>
);

const RocketIcon = ({ c }: { c: string }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill={c}>
    <path d="M12 2.5c-1.5 0-5.5 3.5-5.5 9.5h11C17.5 6 13.5 2.5 12 2.5zm-2 12.5v1a2 2 0 0 0 4 0v-1H10zm-1.5-3h7v1.5h-7V12zM9 10.5h1.5v1H9v-1zm4.5 0H15v1h-1.5v-1z" />
  </svg>
);

const GaugeIcon = ({ c }: { c: string }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2">
    <path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z" />
    <path d="M12 6v2M6 12H8M16 12h2" />
    <path d="M12 12l3-3" strokeLinecap="round" />
    <circle cx="12" cy="12" r="1" fill={c} />
  </svg>
);

const ClockIcon = ({ c }: { c: string }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

// ─── Subcomponentes ───────────────────────────────────────────────────────────

/** Cabecera de sección: icono + título */
function SectionBlock({
  icon, title, theme, typo, children, mt = 0,
}: {
  icon: React.ReactNode;
  title: string;
  theme: Theme;
  typo: TypoScale;
  children: React.ReactNode;
  mt?: number;
}) {
  return (
    <div style={{ marginTop: mt }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 5,
        borderBottom: `1px solid ${theme.accent}60`,
        paddingBottom: 3, marginBottom: 5,
      }}>
        {icon}
        <span style={{
          fontSize: typo.sectionTitle, fontWeight: 700,
          letterSpacing: "0.18em", textTransform: "uppercase",
          color: theme.accent, lineHeight: 1,
        }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

/** Sub-sección dentro de un SectionBlock */
function SubSect({ title, theme, typo }: { title: string; theme: Theme; typo: TypoScale }) {
  return (
    <div style={{
      fontSize: typo.subSect, letterSpacing: "0.16em", textTransform: "uppercase",
      color: theme.textMuted, marginTop: 5, marginBottom: 2,
      paddingBottom: 2, borderBottom: `1px solid ${theme.border}`,
    }}>
      {title}
    </div>
  );
}

/** Fila label + value */
function Row({
  label, value, unit, theme, typo,
}: {
  label: string;
  value: string | React.ReactNode;
  unit?: string;
  theme: Theme;
  typo: TypoScale;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "baseline",
      justifyContent: "space-between", gap: 8,
      padding: "1px 0", fontSize: typo.row, lineHeight: 1.2,
    }}>
      <span style={{ color: theme.textMuted, flexShrink: 0 }}>{label}</span>
      <span style={{ color: theme.text, fontWeight: 500, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {value}
        {unit && <span style={{ color: theme.textMuted, fontSize: typo.unit, marginLeft: 3 }}>{unit}</span>}
      </span>
    </div>
  );
}

/** Mini stat 2-col */
function Mini({
  label, value, theme, typo,
}: {
  label: string;
  value: string;
  theme: Theme;
  typo: TypoScale;
}) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "baseline",
      fontSize: typo.mini, padding: "1px 0", lineHeight: 1.2,
    }}>
      <span style={{ color: theme.textMuted }}>{label}</span>
      <span style={{ color: theme.text, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

/** Grid 2-col de mini-stats */
function MiniGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 8px" }}>
      {children}
    </div>
  );
}

/** Logo SC LABS */
function BrandMark({ theme, size = 40, labelSize = 18, subSize = 10 }: {
  theme: Theme; size?: number; labelSize?: number; subSize?: number;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <Image
        src="/sclabs-logo.png" alt="SC LABS"
        width={size} height={size}
        style={{ borderRadius: 5 }}
        crossOrigin="anonymous" unoptimized
      />
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
        <span style={{ fontSize: labelSize, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: theme.text }}>
          SC Labs
        </span>
        <span style={{ fontSize: subSize, letterSpacing: "0.2em", textTransform: "uppercase", color: theme.textMuted, marginTop: 3 }}>
          Star Citizen Intelligence
        </span>
      </div>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ShipInfoCardProps {
  data: ShipDetailResponseV2;
  themeKey: string;
  variant: CardVariant;
  captureId?: string;
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ShipInfoCard({
  data, themeKey, variant, captureId = "sclabs-ship-card",
}: ShipInfoCardProps) {
  const theme = getTheme(themeKey);
  const ship = data.data;
  const computed = data.computed;
  const specs = (ship.ship ?? {}) as any;
  const shipPower = (data as any).shipPower as {
    totalShieldHp?: number | null; totalShieldRegen?: number | null;
    fuelHydrogen?: number | null; fuelQuantum?: number | null;
    qtRangeKm?: number | null; qtSpeedMs?: number | null; qtSpoolTimeS?: number | null;
  } | null ?? null;
  const insuranceData = (data as any).insurance as {
    standardClaimTime?: number | null;
    expeditedClaimTime?: number | null;
    expeditedCost?: number | null;
  } | null ?? null;
  const res = specs.resistances as {
    armorHp?: number | null;
    dmgMultPhysical?: number | null; dmgMultEnergy?: number | null; dmgMultDistortion?: number | null;
    sigMultElectromagnetic?: number | null; sigMultCrossSection?: number | null; sigMultInfrared?: number | null;
    penResistBase?: number | null; penResistPhysical?: number | null;
  } | null ?? null;

  const displayName = ship.localizedName || ship.name;
  const imageUrl = getShipImageUrl(displayName, ship.manufacturer);

  // ── Datos ──
  const lengthM  = specs.lengthMeters ?? null;
  const beamM    = specs.beamMeters ?? null;
  const heightM  = specs.heightMeters ?? null;
  const size     = specs.size ?? null;
  const mass     = specs.mass ?? null;
  const hullHp   = specs.hullHp ?? null;

  const deflPhys = specs.deflectionPhysical ?? null;
  const deflEne  = specs.deflectionEnergy ?? null;
  const deflDis  = specs.deflectionDistortion ?? null;

  const dmgMultPhys = res?.dmgMultPhysical ?? null;
  const dmgMultEne  = res?.dmgMultEnergy ?? null;
  const dmgMultDis  = res?.dmgMultDistortion ?? null;
  const sigMultEm   = res?.sigMultElectromagnetic ?? null;
  const sigMultCs   = res?.sigMultCrossSection ?? null;
  const sigMultIr   = res?.sigMultInfrared ?? null;
  const penBase     = res?.penResistBase ?? null;
  const penPhys     = res?.penResistPhysical ?? null;

  const scmSpeed  = specs.scmSpeed ?? specs.maxSpeed ?? null;
  const boostFwd  = specs.boostSpeedForward ?? specs.afterburnerSpeed ?? null;
  const navSpeed  = specs.navSpeed ?? null;
  const rampUp    = specs.boostRampUp ?? null;
  const rampDown  = specs.boostRampDown ?? null;
  const pitch     = specs.pitchRate ?? null;
  const yaw       = specs.yawRate ?? null;
  const roll      = specs.rollRate ?? null;
  const bPitch    = specs.boostedPitch ?? null;
  const bYaw      = specs.boostedYaw ?? null;
  const bRoll     = specs.boostedRoll ?? null;
  const accelFwd  = specs.accelForward ?? null;
  const accelBwd  = specs.accelBackward ?? null;
  const accelUp   = specs.accelUp ?? null;
  const accelDown = specs.accelDown ?? null;
  const accelStr  = specs.accelStrafe ?? null;

  const cargo      = specs.cargo ?? null;
  const h2         = specs.hydrogenCapacity ?? specs.hydrogenFuelCap ?? shipPower?.fuelHydrogen ?? null;
  const qt         = specs.quantumFuelCapacity ?? specs.quantumFuelCap ?? shipPower?.fuelQuantum ?? null;
  const qtRangeGm  = specs.quantumRange ?? null;
  const qtSpeed    = shipPower?.qtSpeedMs != null ? Math.round(shipPower.qtSpeedMs / 1_000_000) : null;
  const qtSpool    = shipPower?.qtSpoolTimeS ?? null;

  const shieldHp    = specs.shieldHpTotal ?? computed?.totalShieldHp ?? shipPower?.totalShieldHp ?? null;
  const shieldRegen = computed?.totalShieldRegen ?? shipPower?.totalShieldRegen ?? null;
  const pilotDps    = computed?.totalDps ?? null;
  const weaponCount = computed?.hardpointSummary?.weapons ?? null;
  const missileCount= computed?.hardpointSummary?.missiles ?? null;

  const insClaim     = insuranceData?.standardClaimTime ?? null;
  const insExpedite  = insuranceData?.expeditedClaimTime ?? null;
  const insExpCost   = insuranceData?.expeditedCost ?? null;

  // ── Strings formateados ──
  const dimsFlight = lengthM != null && beamM != null && heightM != null
    ? `${size ? `(S${size}) ` : ""}${num(lengthM)} L × ${num(beamM)} W × ${num(heightM)} H m`
    : MISSING;

  const scmBoostStr = scmSpeed != null || boostFwd != null
    ? `${num(scmSpeed)} / ${num(boostFwd)}`
    : MISSING;

  const pitchYawRoll = pitch != null || yaw != null || roll != null
    ? `${num(pitch)} / ${num(yaw)} / ${num(roll)}`
    : MISSING;

  const boostedPYR = bPitch != null || bYaw != null || bRoll != null
    ? `${num(bPitch, 1)} / ${num(bYaw, 1)} / ${num(bRoll, 1)}`
    : MISSING;

  const rampStr = rampUp != null || rampDown != null
    ? `${rampUp != null ? `${rampUp.toFixed(1)}` : MISSING} / ${rampDown != null ? `${rampDown.toFixed(1)}` : MISSING}`
    : MISSING;

  const insClaimStr = insClaim != null || insExpedite != null
    ? `${fmtTime(insClaim)} → ${fmtTime(insExpedite)}`
    : MISSING;

  // ══════════════════════════════════════════════════════════════════════
  // HORIZONTAL — 1800 × 720
  // ══════════════════════════════════════════════════════════════════════
  if (variant === "horizontal") {
    const W = 1800;
    const H = 720;
    const ACCENT_H = 4;
    const DATA_H = 260;
    const HERO_H = H - ACCENT_H - DATA_H; // 456px
    const typo = TYPO_H;

    const nameFontSize = Math.max(44, Math.min(100, Math.floor(760 / Math.max(displayName.length, 4))));

    const kpiStats = [
      cargo    != null ? { label: "Cargo",     value: num(cargo),    unit: "SCU" } : null,
      hullHp   != null ? { label: "Hull HP",   value: num(hullHp),   unit: "HP"  } : null,
      scmSpeed != null ? { label: "SCM Speed", value: num(scmSpeed), unit: "m/s" } : null,
      shieldHp != null ? { label: "Shield",    value: num(shieldHp), unit: "HP"  } : null,
    ].filter(Boolean) as { label: string; value: string; unit: string }[];

    return (
      <div
        id={captureId}
        style={{
          position: "relative", width: W, height: H,
          backgroundColor: "#000", color: theme.text,
          border: `1px solid ${theme.accent}55`,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          overflow: "hidden",
        }}
      >
        {/* Accent top bar */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: ACCENT_H, backgroundColor: theme.accent }} />

        {/* BG diagonal gradient */}
        <div style={{
          position: "absolute", top: ACCENT_H, left: 0, right: 0, height: HERO_H,
          background: `linear-gradient(135deg, ${theme.accent}18 0%, transparent 40%)`,
          pointerEvents: "none",
        }} />

        {/* Thin left accent bar */}
        <div style={{
          position: "absolute", top: ACCENT_H, left: 0, width: 3, height: HERO_H,
          background: `linear-gradient(to bottom, ${theme.accent}, transparent)`,
        }} />

        {/* Ship image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt={displayName} crossOrigin="anonymous"
          style={{
            position: "absolute", top: ACCENT_H, left: 0, width: W, height: HERO_H,
            objectFit: "contain", objectPosition: "68% center",
            filter: `drop-shadow(0 0 60px ${theme.accent}99) drop-shadow(0 0 180px ${theme.accent}55)`,
          }}
          onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.08"; }}
        />

        {/* Ambient glow */}
        <div style={{
          position: "absolute", top: ACCENT_H, left: 0, right: 0, height: HERO_H,
          background: `radial-gradient(ellipse 48% 78% at 68% 50%, ${theme.accent}28 0%, transparent 68%)`,
          pointerEvents: "none",
        }} />

        {/* Vignettes */}
        <div style={{ position: "absolute", top: ACCENT_H, left: 0, width: "54%", height: HERO_H, background: `linear-gradient(to right, #000000 0%, #000000e6 32%, #000000aa 52%, transparent 100%)`, pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: ACCENT_H, right: 0, width: 140, height: HERO_H, background: "linear-gradient(to left, #000000e6 0%, transparent 100%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: ACCENT_H, left: 0, right: 0, height: 110, background: "linear-gradient(to bottom, #000000d0 0%, transparent 100%)", pointerEvents: "none", zIndex: 2 }} />
        <div style={{ position: "absolute", top: ACCENT_H + HERO_H - 120, left: 0, right: 0, height: 120, background: "linear-gradient(to top, #000000e6 0%, transparent 100%)", pointerEvents: "none", zIndex: 2 }} />

        {/* Identity block */}
        <div style={{ position: "absolute", top: ACCENT_H + 22, left: 24, right: "44%" }}>
          <BrandMark theme={theme} size={30} labelSize={12} subSize={8} />
          <div style={{ marginTop: 22 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.38em", textTransform: "uppercase", color: theme.accent, marginBottom: 8, lineHeight: 1 }}>
              {ship.manufacturer ?? "—"}
            </div>
            <div style={{ fontSize: nameFontSize, fontWeight: 800, lineHeight: 0.88, letterSpacing: "-0.03em", textTransform: "uppercase", color: theme.text, textShadow: `0 0 70px ${theme.accent}55, 0 2px 0 #000`, marginBottom: 16 }}>
              {displayName}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {(ship.type || specs.role) && (
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "#000", backgroundColor: theme.accent, padding: "4px 12px", lineHeight: 1.5 }}>
                  {[ship.type, specs.role].filter(Boolean).join(" · ")}
                </span>
              )}
              {specs.maxCrew != null && <span style={{ fontSize: 12, color: theme.textMuted }}><span style={{ color: theme.text, fontWeight: 700 }}>{specs.maxCrew}</span> crew</span>}
              {mass != null && <span style={{ fontSize: 12, color: theme.textMuted }}><span style={{ color: theme.text, fontWeight: 700 }}>{num(mass)}</span> kg</span>}
            </div>
          </div>
        </div>

        {/* KPI stats */}
        {kpiStats.length > 0 && (
          <div style={{ position: "absolute", bottom: DATA_H, left: 0, display: "flex" }}>
            {kpiStats.map((s, i) => (
              <div key={i} style={{ padding: "10px 26px 10px 20px", borderRight: i < kpiStats.length - 1 ? `1px solid ${theme.border}` : undefined }}>
                <div style={{ fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: theme.textMuted, marginBottom: 3, lineHeight: 1 }}>{s.label}</div>
                <div style={{ fontSize: 32, fontWeight: 800, color: theme.accent, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
                <div style={{ fontSize: 10, color: theme.textMuted, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 2 }}>{s.unit}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── DATA STRIP — 4 data cols + brand col ── */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: DATA_H,
          backgroundColor: theme.bgPanel,
          display: "grid",
          gridTemplateColumns: "1fr 1px 1fr 1px 1fr 1px 1fr 1px 130px",
        }}>

          {/* ── COL 1: Hull + Armor ── */}
          <div style={{ padding: "12px 14px", overflow: "hidden" }}>
            <SectionBlock icon={<PlaneIcon c={theme.accent} />} title="Hull" theme={theme} typo={typo}>
              <Row label="Dimensions (F)" value={dimsFlight} theme={theme} typo={typo} />
              <Row label="Mass" value={num(mass)} unit="kg" theme={theme} typo={typo} />

              <SubSect title="Damage Modifiers" theme={theme} typo={typo} />
              <MiniGrid>
                <Mini label="Physical"   value={fmtMult(dmgMultPhys)} theme={theme} typo={typo} />
                <Mini label="Energy"     value={fmtMult(dmgMultEne)}  theme={theme} typo={typo} />
                <Mini label="Distortion" value={fmtMult(dmgMultDis)}  theme={theme} typo={typo} />
              </MiniGrid>

              <SubSect title="Signature Modifiers" theme={theme} typo={typo} />
              <MiniGrid>
                <Mini label="EM"       value={fmtMult(sigMultEm)} theme={theme} typo={typo} />
                <Mini label="CrossSec" value={fmtMult(sigMultCs)} theme={theme} typo={typo} />
                <Mini label="IR"       value={fmtMult(sigMultIr)} theme={theme} typo={typo} />
              </MiniGrid>

              <SubSect title="Penetration" theme={theme} typo={typo} />
              <MiniGrid>
                <Mini label="Fuse"      value={penBase != null ? `${num(penBase * 100)} %` : MISSING} theme={theme} typo={typo} />
                <Mini label="Component" value={penPhys != null ? `${num(penPhys * 100)} %` : MISSING} theme={theme} typo={typo} />
              </MiniGrid>
            </SectionBlock>

          </div>

          <div style={{ backgroundColor: theme.border }} />

          {/* ── COL 2: Armor + Weaponry + Cargo ── */}
          <div style={{ padding: "12px 14px", overflow: "hidden" }}>
            <SectionBlock icon={<ShieldIcon c={theme.accent} />} title="Armor" theme={theme} typo={typo}>
              <Row label="Health Points" value={num(hullHp)} unit="HP" theme={theme} typo={typo} />
              <SubSect title="Deflection" theme={theme} typo={typo} />
              <MiniGrid>
                <Mini label="Physical"   value={deflPhys != null ? num(deflPhys) : MISSING} theme={theme} typo={typo} />
                <Mini label="Energy"     value={deflEne  != null ? num(deflEne)  : MISSING} theme={theme} typo={typo} />
                <Mini label="Distortion" value={deflDis  != null ? num(deflDis)  : MISSING} theme={theme} typo={typo} />
              </MiniGrid>
            </SectionBlock>

            <SectionBlock icon={<CrosshairIcon c={theme.accent} />} title="Weaponry" theme={theme} typo={typo} mt={8}>
              <Row label="Pilot DPS"    value={pilotDps    != null ? num(pilotDps)            : MISSING}          theme={theme} typo={typo} />
              <Row label="Shield HP"    value={shieldHp    != null ? num(shieldHp)            : MISSING} unit="HP"   theme={theme} typo={typo} />
              <Row label="Shield Regen" value={shieldRegen != null ? `${num(shieldRegen, 1)}` : MISSING} unit="HP/s" theme={theme} typo={typo} />
              <MiniGrid>
                <Mini label="Weapons"  value={weaponCount  != null ? String(weaponCount)  : MISSING} theme={theme} typo={typo} />
                <Mini label="Missiles" value={missileCount != null ? String(missileCount) : MISSING} theme={theme} typo={typo} />
              </MiniGrid>
            </SectionBlock>

            <SectionBlock icon={<BoxIcon c={theme.accent} />} title="Carrying Capacity" theme={theme} typo={typo} mt={8}>
              <Row label="Cargo Grid" value={num(cargo)} unit="SCU" theme={theme} typo={typo} />
            </SectionBlock>
          </div>

          <div style={{ backgroundColor: theme.border }} />

          {/* ── COL 3: Fuel + Insurance ── */}
          <div style={{ padding: "12px 14px", overflow: "hidden" }}>
            <SectionBlock icon={<DropletIcon c={theme.accent} />} title="Fuel" theme={theme} typo={typo}>
              <Row label="Hydrogen"  value={h2        != null ? num(h2)               : MISSING} unit="SCU" theme={theme} typo={typo} />
              <Row label="Quantum"   value={qt        != null ? num(qt, 2)            : MISSING} unit="SCU" theme={theme} typo={typo} />
              <Row label="QT Range"  value={qtRangeGm != null ? num(qtRangeGm, 2)    : MISSING} unit="Gm"  theme={theme} typo={typo} />
              {(qtSpeed != null || qtSpool != null) && (
                <MiniGrid>
                  <Mini label="QT Speed" value={qtSpeed != null ? `${qtSpeed} Mm/s`         : MISSING} theme={theme} typo={typo} />
                  <Mini label="QT Spool" value={qtSpool != null ? `${qtSpool.toFixed(1)} s` : MISSING} theme={theme} typo={typo} />
                </MiniGrid>
              )}
            </SectionBlock>

            <SectionBlock icon={<ClockIcon c={theme.accent} />} title="Insurance" theme={theme} typo={typo} mt={8}>
              <Row label="Claim → Expedite" value={insClaimStr}                                                       theme={theme} typo={typo} />
              <Row label="Expedite Cost"     value={insExpCost != null ? num(insExpCost) : MISSING} unit="aUEC" theme={theme} typo={typo} />
            </SectionBlock>
          </div>

          <div style={{ backgroundColor: theme.border }} />

          {/* ── COL 4: Flight + Accelerations ── */}
          <div style={{ padding: "12px 14px", overflow: "hidden" }}>
            <SectionBlock icon={<RocketIcon c={theme.accent} />} title="Flight Performances" theme={theme} typo={typo}>
              <Row label="SCM / Boost"       value={scmBoostStr}                                   unit="m/s" theme={theme} typo={typo} />
              <Row label="NAV"               value={navSpeed != null ? num(navSpeed) : MISSING}    unit="m/s" theme={theme} typo={typo} />
              <Row label="Boost Ramp Up/Down" value={rampStr}                                      unit="s"   theme={theme} typo={typo} />
              <Row label="Pitch / Yaw / Roll" value={pitchYawRoll}                                 unit="°/s" theme={theme} typo={typo} />
              <Row label="Boosted"            value={boostedPYR}                                   unit="°/s" theme={theme} typo={typo} />
            </SectionBlock>

            <SectionBlock icon={<GaugeIcon c={theme.accent} />} title="Accelerations" theme={theme} typo={typo} mt={8}>
              <MiniGrid>
                <Mini label="Main"   value={`${toG(accelFwd)} G`}  theme={theme} typo={typo} />
                <Mini label="Retro"  value={`${toG(accelBwd)} G`}  theme={theme} typo={typo} />
                <Mini label="Up"     value={`${toG(accelUp)} G`}   theme={theme} typo={typo} />
                <Mini label="Down"   value={`${toG(accelDown)} G`} theme={theme} typo={typo} />
                <Mini label="Strafe" value={`${toG(accelStr)} G`}  theme={theme} typo={typo} />
              </MiniGrid>
            </SectionBlock>
          </div>

          <div style={{ backgroundColor: theme.border }} />

          {/* ── Brand column ── */}
          <div style={{
            padding: "12px 10px", height: "100%", boxSizing: "border-box",
            display: "flex", flexDirection: "column", justifyContent: "center",
            alignItems: "center", textAlign: "center", gap: 8,
          }}>
            <Image src="/sclabs-logo.png" alt="SC LABS" width={44} height={44} style={{ borderRadius: 6 }} crossOrigin="anonymous" unoptimized />
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: theme.text, lineHeight: 1 }}>SC LABS</div>
              <div style={{ fontSize: 7, letterSpacing: "0.18em", textTransform: "uppercase", color: theme.textMuted, marginTop: 4, lineHeight: 1.4 }}>Star Citizen<br />Intelligence</div>
            </div>
            <div style={{ width: 40, height: 1, backgroundColor: theme.border }} />
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: theme.accent }}>SCLABS.SPACE</div>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // SHOWCASE — 1800 × 900 — "Showroom espacial"
  // ══════════════════════════════════════════════════════════════════════
  if (variant === "showcase") {
    const SW = 1800;
    const SH = 900;
    const PANEL_H = 130;

    const glbCandidates = shipGlbCandidates((ship as any).reference ?? null);

    const nameFontSize = Math.max(48, Math.min(130, Math.floor(880 / Math.max(displayName.length, 4))));

    const showcaseStats = [
      cargo    != null ? { label: "Cargo",     value: num(cargo),            unit: "SCU" } : null,
      hullHp   != null ? { label: "Hull HP",   value: num(hullHp),           unit: "HP"  } : null,
      scmSpeed != null ? { label: "SCM Speed", value: num(scmSpeed),         unit: "m/s" } : null,
      shieldHp != null ? { label: "Shield",    value: num(shieldHp),         unit: "HP"  } : null,
      specs.maxCrew != null ? { label: "Crew", value: String(specs.maxCrew), unit: "crew"} : null,
      mass     != null ? { label: "Mass",      value: num(mass),             unit: "kg"  } : null,
    ].filter(Boolean) as { label: string; value: string; unit: string }[];

    return (
      <div
        id={captureId}
        style={{
          position: "relative", width: SW, height: SH,
          overflow: "hidden",
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        }}
      >
        {/* Fondo CSS: simula horizonte espacial. Se oculta si showcase-bg.jpg carga. */}
        <div style={{
          position: "absolute", inset: 0,
          background: [
            "radial-gradient(ellipse 140% 60% at 50% 132%, #1a5080 0%, #0c3259 22%, transparent 52%)",
            "radial-gradient(circle 200px at 72% 13%, #ffe066cc 0%, #f59e0b55 22%, transparent 42%)",
            "linear-gradient(170deg, #000005 0%, #000a1c 40%, #00132e 75%, #000814 100%)",
          ].join(", "),
          zIndex: 0,
        }} />

        {/* Imagen de fondo real — se muestra si el archivo existe */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/media/images/pyrostarsystem.webp"
          alt=""
          crossOrigin="anonymous"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center center", zIndex: 1 }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />

        {/* Vignette superior */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 220, background: "linear-gradient(to bottom, #000000b0 0%, transparent 100%)", zIndex: 3, pointerEvents: "none" }} />

        {/* Vignette inferior — funde con el panel */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 300, background: "linear-gradient(to top, #000000a0 0%, transparent 100%)", zIndex: 3, pointerEvents: "none" }} />

        {/* 3D Ship Viewer — ocupa toda la tarjeta, fondo transparente */}
        <div style={{ position: "absolute", inset: 0, zIndex: 2 }}>
          <ShipViewer3D
            glbUrl={glbCandidates}
            rotationAxis="yaw"
            animate
            animationSpeed={0.3}
            showGrid={false}
            showAxis={false}
            transparent
            className="w-full h-full"
          />
        </div>

        {/* Brand mark — top-left */}
        <div style={{ position: "absolute", top: 28, left: 36, zIndex: 10 }}>
          <BrandMark theme={{ ...theme, text: "#ffffff", textMuted: "rgba(255,255,255,0.55)" }} size={36} labelSize={13} subSize={8} />
        </div>

        {/* Nombre de nave — bottom-left, sobre el panel */}
        <div style={{ position: "absolute", bottom: PANEL_H + 20, left: 36, right: "48%", zIndex: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.38em", textTransform: "uppercase", color: theme.accent, marginBottom: 8, lineHeight: 1 }}>
            {ship.manufacturer ?? "—"}
          </div>
          <div style={{ fontSize: nameFontSize, fontWeight: 800, lineHeight: 0.88, letterSpacing: "-0.03em", textTransform: "uppercase", color: "#ffffff", textShadow: `0 0 80px ${theme.accent}99, 0 3px 12px #000` }}>
            {displayName}
          </div>
          {(ship.type || specs.role) && (
            <span style={{ display: "inline-block", marginTop: 14, fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "#000", backgroundColor: theme.accent, padding: "5px 16px", lineHeight: 1.5 }}>
              {[ship.type, specs.role].filter(Boolean).join(" · ")}
            </span>
          )}
        </div>

        {/* Panel glassmorphism — stats en la base */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: PANEL_H,
          background: "rgba(0, 0, 0, 0.60)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderTop: "1px solid rgba(255,255,255,0.07)",
          display: "flex", alignItems: "center",
          zIndex: 10,
        }}>
          {showcaseStats.map((s, i) => (
            <div key={i} style={{ flex: 1, textAlign: "center", borderRight: i < showcaseStats.length - 1 ? "1px solid rgba(255,255,255,0.07)" : undefined, padding: "0 16px" }}>
              <div style={{ fontSize: 10, letterSpacing: "0.24em", textTransform: "uppercase", color: "rgba(255,255,255,0.40)", marginBottom: 5, lineHeight: 1 }}>{s.label}</div>
              <div style={{ fontSize: 38, fontWeight: 800, color: theme.accent, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.30)", letterSpacing: "0.12em", textTransform: "uppercase", marginTop: 4 }}>{s.unit}</div>
            </div>
          ))}
          {/* Brand slot final */}
          <div style={{ padding: "0 28px", borderLeft: "1px solid rgba(255,255,255,0.07)", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <Image src="/sclabs-logo.png" alt="SC LABS" width={34} height={34} style={{ borderRadius: 5 }} crossOrigin="anonymous" unoptimized />
            <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.20em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)" }}>SCLABS.SPACE</div>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // VERTICAL — 760 × 1560
  // ══════════════════════════════════════════════════════════════════════
  const W = 760;
  const H = 1560;
  const HERO_H = 560;
  const KPI_H = 80;
  const BRAND_H = 70;
  const DATA_H = H - HERO_H - KPI_H - BRAND_H; // 850px
  const typo = TYPO_V;

  const nameFontSize = Math.max(36, Math.min(110, Math.floor(680 / Math.max(displayName.length, 4))));

  const kpiStats = [
    cargo    != null ? { label: "Cargo",     value: num(cargo),    unit: "SCU" } : null,
    hullHp   != null ? { label: "Hull HP",   value: num(hullHp),   unit: "HP"  } : null,
    scmSpeed != null ? { label: "SCM Speed", value: num(scmSpeed), unit: "m/s" } : null,
    shieldHp != null ? { label: "Shield",    value: num(shieldHp), unit: "HP"  } : null,
  ].filter(Boolean) as { label: string; value: string; unit: string }[];

  return (
    <div
      id={captureId}
      style={{
        position: "relative", width: W, height: H,
        backgroundColor: "#000", color: theme.text,
        border: `1px solid ${theme.accent}55`,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        overflow: "hidden",
      }}
    >
      {/* BG gradient */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: HERO_H, background: `linear-gradient(135deg, ${theme.accent}18 0%, transparent 40%)`, pointerEvents: "none" }} />

      {/* Thin left accent bar */}
      <div style={{ position: "absolute", top: 0, left: 0, width: 3, height: HERO_H, background: `linear-gradient(to bottom, ${theme.accent}, transparent)` }} />

      {/* Ship image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt={displayName} crossOrigin="anonymous"
        style={{ position: "absolute", top: 0, left: 0, width: W, height: HERO_H, objectFit: "contain", objectPosition: "center 45%", filter: `drop-shadow(0 0 50px ${theme.accent}99) drop-shadow(0 0 130px ${theme.accent}44)` }}
        onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.08"; }}
      />

      {/* Ambient glow */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: HERO_H, background: `radial-gradient(ellipse 75% 55% at 50% 50%, ${theme.accent}22 0%, transparent 68%)`, pointerEvents: "none" }} />

      {/* Vignettes */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 100, background: "linear-gradient(to bottom, #000000c0 0%, transparent 100%)", pointerEvents: "none", zIndex: 2 }} />
      <div style={{ position: "absolute", top: HERO_H - 140, left: 0, right: 0, height: 140, background: "linear-gradient(to top, #000000f5 0%, transparent 100%)", pointerEvents: "none", zIndex: 2 }} />
      <div style={{ position: "absolute", top: 0, left: 0, width: 70, height: HERO_H, background: "linear-gradient(to right, #000000b0 0%, transparent 100%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", top: 0, right: 0, width: 70, height: HERO_H, background: "linear-gradient(to left, #000000b0 0%, transparent 100%)", pointerEvents: "none" }} />

      {/* Identity block */}
      <div style={{ position: "absolute", bottom: KPI_H + DATA_H + BRAND_H + 18, left: 22, right: 22, zIndex: 3 }}>
        <BrandMark theme={theme} size={22} labelSize={9} subSize={7} />
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.38em", textTransform: "uppercase", color: theme.accent, marginBottom: 6, lineHeight: 1 }}>
            {ship.manufacturer ?? "—"}
          </div>
          <div style={{ fontSize: nameFontSize, fontWeight: 800, lineHeight: 0.88, letterSpacing: "-0.03em", textTransform: "uppercase", color: theme.text, textShadow: `0 0 60px ${theme.accent}55, 0 2px 0 #000`, marginBottom: 14 }}>
            {displayName}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {(ship.type || specs.role) && (
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "#000", backgroundColor: theme.accent, padding: "3px 10px", lineHeight: 1.5 }}>
                {[ship.type, specs.role].filter(Boolean).join(" · ")}
              </span>
            )}
            {specs.maxCrew != null && <span style={{ fontSize: 11, color: theme.textMuted }}><span style={{ color: theme.text, fontWeight: 700 }}>{specs.maxCrew}</span> crew</span>}
            {mass != null && <span style={{ fontSize: 11, color: theme.textMuted }}><span style={{ color: theme.text, fontWeight: 700 }}>{num(mass)}</span> kg</span>}
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{
        position: "absolute", top: HERO_H, left: 0, right: 0, height: KPI_H,
        backgroundColor: theme.bgPanel,
        borderTop: `1px solid ${theme.border}`, borderBottom: `1px solid ${theme.border}`,
        display: "flex", alignItems: "center",
      }}>
        {kpiStats.map((s, i) => (
          <div key={i} style={{ flex: 1, padding: "6px 0", textAlign: "center", borderRight: i < kpiStats.length - 1 ? `1px solid ${theme.border}` : undefined }}>
            <div style={{ fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", color: theme.textMuted, marginBottom: 2, lineHeight: 1 }}>{s.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: theme.accent, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
            <div style={{ fontSize: 9, color: theme.textMuted, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 1 }}>{s.unit}</div>
          </div>
        ))}
      </div>

      {/* ── DATA AREA: 2 cols ── */}
      <div style={{
        position: "absolute", top: HERO_H + KPI_H, left: 0, right: 0, height: DATA_H,
        backgroundColor: theme.bgPanel,
        display: "grid", gridTemplateColumns: "1fr 1px 1fr",
      }}>
        {/* COL IZQ: Hull + Armor + Weaponry */}
        <div style={{ padding: "12px 14px", overflow: "hidden" }}>
          <SectionBlock icon={<PlaneIcon c={theme.accent} />} title="Hull" theme={theme} typo={typo}>
            <Row label="Dimensions (F)" value={dimsFlight} theme={theme} typo={typo} />
            <Row label="Mass"           value={num(mass)}  unit="kg" theme={theme} typo={typo} />

            <SubSect title="Damage Modifiers" theme={theme} typo={typo} />
            <MiniGrid>
              <Mini label="Physical"   value={fmtMult(dmgMultPhys)} theme={theme} typo={typo} />
              <Mini label="Energy"     value={fmtMult(dmgMultEne)}  theme={theme} typo={typo} />
              <Mini label="Distortion" value={fmtMult(dmgMultDis)}  theme={theme} typo={typo} />
            </MiniGrid>

            <SubSect title="Signature Modifiers" theme={theme} typo={typo} />
            <MiniGrid>
              <Mini label="EM"       value={fmtMult(sigMultEm)} theme={theme} typo={typo} />
              <Mini label="CrossSec" value={fmtMult(sigMultCs)} theme={theme} typo={typo} />
              <Mini label="IR"       value={fmtMult(sigMultIr)} theme={theme} typo={typo} />
            </MiniGrid>

            <SubSect title="Penetration" theme={theme} typo={typo} />
            <MiniGrid>
              <Mini label="Fuse"      value={penBase != null ? `${num(penBase * 100)} %` : MISSING} theme={theme} typo={typo} />
              <Mini label="Component" value={penPhys != null ? `${num(penPhys * 100)} %` : MISSING} theme={theme} typo={typo} />
            </MiniGrid>
          </SectionBlock>

          <SectionBlock icon={<ShieldIcon c={theme.accent} />} title="Armor" theme={theme} typo={typo} mt={10}>
            <Row label="Health Points" value={num(hullHp)} unit="HP" theme={theme} typo={typo} />
            <SubSect title="Deflection" theme={theme} typo={typo} />
            <MiniGrid>
              <Mini label="Physical"   value={deflPhys != null ? num(deflPhys) : MISSING} theme={theme} typo={typo} />
              <Mini label="Energy"     value={deflEne  != null ? num(deflEne)  : MISSING} theme={theme} typo={typo} />
              <Mini label="Distortion" value={deflDis  != null ? num(deflDis)  : MISSING} theme={theme} typo={typo} />
            </MiniGrid>
          </SectionBlock>

          <SectionBlock icon={<CrosshairIcon c={theme.accent} />} title="Weaponry" theme={theme} typo={typo} mt={10}>
            <Row label="Pilot DPS"    value={pilotDps    != null ? num(pilotDps)           : MISSING}          theme={theme} typo={typo} />
            <Row label="Shield HP"    value={shieldHp    != null ? num(shieldHp)           : MISSING} unit="HP"   theme={theme} typo={typo} />
            <Row label="Shield Regen" value={shieldRegen != null ? `${num(shieldRegen, 1)}` : MISSING} unit="HP/s" theme={theme} typo={typo} />
            <MiniGrid>
              <Mini label="Weapons"  value={weaponCount  != null ? String(weaponCount)  : MISSING} theme={theme} typo={typo} />
              <Mini label="Missiles" value={missileCount != null ? String(missileCount) : MISSING} theme={theme} typo={typo} />
            </MiniGrid>
          </SectionBlock>
        </div>

        <div style={{ backgroundColor: theme.border }} />

        {/* COL DER: Cargo + Fuel + Flight + Accel + Insurance */}
        <div style={{ padding: "12px 14px", overflow: "hidden" }}>
          <SectionBlock icon={<BoxIcon c={theme.accent} />} title="Carrying Capacity" theme={theme} typo={typo}>
            <Row label="Cargo Grid" value={num(cargo)} unit="SCU" theme={theme} typo={typo} />
          </SectionBlock>

          <SectionBlock icon={<DropletIcon c={theme.accent} />} title="Fuel" theme={theme} typo={typo} mt={10}>
            <Row label="Hydrogen"  value={h2      != null ? num(h2)          : MISSING} unit="SCU" theme={theme} typo={typo} />
            <Row label="Quantum"   value={qt      != null ? num(qt, 2)       : MISSING} unit="SCU" theme={theme} typo={typo} />
            <Row label="QT Range"  value={qtRangeGm != null ? num(qtRangeGm, 2) : MISSING} unit="Gm" theme={theme} typo={typo} />
            {(qtSpeed != null || qtSpool != null) && (
              <MiniGrid>
                <Mini label="QT Speed" value={qtSpeed != null ? `${qtSpeed} Mm/s` : MISSING} theme={theme} typo={typo} />
                <Mini label="QT Spool" value={qtSpool != null ? `${qtSpool.toFixed(1)} s` : MISSING} theme={theme} typo={typo} />
              </MiniGrid>
            )}
          </SectionBlock>

          <SectionBlock icon={<RocketIcon c={theme.accent} />} title="Flight Performances" theme={theme} typo={typo} mt={10}>
            <Row label="SCM / Boost"       value={scmBoostStr}                                unit="m/s" theme={theme} typo={typo} />
            <Row label="NAV"               value={navSpeed != null ? num(navSpeed) : MISSING} unit="m/s" theme={theme} typo={typo} />
            <Row label="Boost Ramp Up/Down" value={rampStr}                                   unit="s"   theme={theme} typo={typo} />
            <Row label="Pitch / Yaw / Roll" value={pitchYawRoll}                              unit="°/s" theme={theme} typo={typo} />
            <Row label="Boosted"            value={boostedPYR}                                unit="°/s" theme={theme} typo={typo} />
          </SectionBlock>

          <SectionBlock icon={<GaugeIcon c={theme.accent} />} title="Accelerations" theme={theme} typo={typo} mt={10}>
            <MiniGrid>
              <Mini label="Main"   value={`${toG(accelFwd)} G`}  theme={theme} typo={typo} />
              <Mini label="Retro"  value={`${toG(accelBwd)} G`}  theme={theme} typo={typo} />
              <Mini label="Up"     value={`${toG(accelUp)} G`}   theme={theme} typo={typo} />
              <Mini label="Down"   value={`${toG(accelDown)} G`} theme={theme} typo={typo} />
              <Mini label="Strafe" value={`${toG(accelStr)} G`}  theme={theme} typo={typo} />
            </MiniGrid>
          </SectionBlock>

          <SectionBlock icon={<ClockIcon c={theme.accent} />} title="Insurance" theme={theme} typo={typo} mt={10}>
            <Row label="Claim → Expedite" value={insClaimStr}                                                       theme={theme} typo={typo} />
            <Row label="Expedite Cost"     value={insExpCost != null ? num(insExpCost) : MISSING} unit="aUEC" theme={theme} typo={typo} />
          </SectionBlock>
        </div>
      </div>

      {/* Brand footer */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: BRAND_H,
        backgroundColor: theme.bgPanel,
        borderTop: `1px solid ${theme.border}`,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 14,
      }}>
        <Image src="/sclabs-logo.png" alt="SC LABS" width={36} height={36} style={{ borderRadius: 5 }} crossOrigin="anonymous" unoptimized />
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: theme.text, lineHeight: 1 }}>SC LABS</div>
          <div style={{ fontSize: 7, letterSpacing: "0.18em", textTransform: "uppercase", color: theme.textMuted, marginTop: 3, lineHeight: 1.3 }}>Star Citizen Intelligence</div>
        </div>
        <div style={{ width: 1, height: 28, backgroundColor: theme.border }} />
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: theme.accent }}>SCLABS.SPACE</div>
      </div>
    </div>
  );
}
