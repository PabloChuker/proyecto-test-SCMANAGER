"use client";
// =============================================================================
// SC LABS — Streamers · ShipInfoCard
//
// Tarjeta de información horizontal y vertical lista para exportar como PNG
// o mostrar en un Browser Source de OBS. El formato sigue 1:1 el layout de
// Erkul: mismas secciones (Hull · Vital Part · Armor · Weaponry · Carrying
// Capacity · Fuel · Refuel Cost · Flight Performances · Accelerations ·
// Insurance), misma info, misma disposición. Los campos que nuestra DB aún
// no expone se dejan como "—" para mantener el layout idéntico.
//
// Toda tarjeta lleva el logo de SC Labs + "Cortesía de SC Labs".
// =============================================================================

import Image from "next/image";
import type { ShipDetailResponseV2 } from "@/types/ships";
import { getTheme, type CardVariant } from "./ship-card-themes";

// ── Helpers de formateo ──

const MISSING = "—";

function num(n: number | null | undefined, decimals = 0): string {
  if (n == null || Number.isNaN(n)) return MISSING;
  if (decimals > 0) return n.toFixed(decimals);
  return Math.round(n).toLocaleString("en-US").replace(/,/g, " ");
}

function numOrDash(n: number | null | undefined, decimals = 0): string {
  return num(n, decimals);
}

/** Convierte m/s² a G (1 G ≈ 9.80665 m/s²) */
function toG(accelMs2: number | null | undefined): string {
  if (accelMs2 == null) return MISSING;
  return (accelMs2 / 9.80665).toFixed(1);
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

type Theme = ReturnType<typeof getTheme>;

function SectionHeader({
  title,
  theme,
  suffix,
  dense = false,
}: {
  title: string;
  theme: Theme;
  suffix?: string;
  dense?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: `1px solid ${theme.border}`,
        paddingBottom: dense ? 2 : 3,
        marginBottom: dense ? 4 : 6,
        marginTop: dense ? 6 : 8,
      }}
    >
      <span
        style={{
          fontSize: dense ? 10 : 11,
          fontWeight: 600,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: theme.accent,
          fontFamily: "inherit",
        }}
      >
        {title}
      </span>
      {suffix && (
        <span
          style={{
            fontSize: 8,
            color: theme.textMuted,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {suffix}
        </span>
      )}
    </div>
  );
}

function SubHeader({ title, theme }: { title: string; theme: Theme }) {
  return (
    <div
      style={{
        fontSize: 8.5,
        fontWeight: 600,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: theme.textMuted,
        marginTop: 4,
        marginBottom: 2,
      }}
    >
      {title}
    </div>
  );
}

function Row({
  label,
  value,
  theme,
  unit,
  dense = false,
}: {
  label: string;
  value: string | React.ReactNode;
  theme: Theme;
  unit?: string;
  dense?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 8,
        padding: dense ? "1px 0" : "2px 0",
        fontSize: dense ? 9.5 : 10.5,
        lineHeight: 1.25,
      }}
    >
      <span style={{ color: theme.textMuted, flexShrink: 0 }}>{label}</span>
      <span
        style={{
          color: theme.text,
          fontWeight: 500,
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
        {unit && (
          <span
            style={{
              color: theme.textMuted,
              fontSize: "0.82em",
              marginLeft: 3,
            }}
          >
            {unit}
          </span>
        )}
      </span>
    </div>
  );
}

function ModifierTriplet({
  a,
  b,
  theme,
}: {
  a: [string, string];
  b: [string, string];
  theme: Theme;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        columnGap: 10,
        fontSize: 9,
        lineHeight: 1.3,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ color: theme.textMuted }}>{a[0]}</span>
        <span style={{ color: theme.text, fontVariantNumeric: "tabular-nums" }}>
          {a[1]}
        </span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ color: theme.textMuted }}>{b[0]}</span>
        <span style={{ color: theme.text, fontVariantNumeric: "tabular-nums" }}>
          {b[1]}
        </span>
      </div>
    </div>
  );
}

function LogoWordmark({
  theme,
  size = 28,
}: {
  theme: Theme;
  size?: number;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Image
        src="/sclabs-logo.png"
        alt="SC LABS"
        width={size}
        height={size}
        style={{ borderRadius: 4 }}
        crossOrigin="anonymous"
        unoptimized
      />
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: theme.text,
          }}
        >
          SC Labs
        </span>
        <span
          style={{
            fontSize: 7,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: theme.textMuted,
            marginTop: 2,
          }}
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
  // El API devuelve varios campos que no están en el type oficial (mass,
  // hullHp, scmSpeed, accelForward, etc.) — los leemos con cast puntual.
  const specs = (ship.ship ?? {}) as any;

  const displayName = ship.localizedName || ship.name;
  const imageUrl = getShipImageUrl(displayName, ship.manufacturer);

  // ── Datos para cada sección ──
  const lengthM = specs.lengthMeters ?? null;
  const beamM = specs.beamMeters ?? null;
  const heightM = specs.heightMeters ?? null;
  const size = specs.size ?? null;
  const mass = specs.mass ?? null;
  const hullHp = specs.hullHp ?? null;

  const deflPhys = specs.deflectionPhysical ?? null;
  const deflEne = specs.deflectionEnergy ?? null;
  const deflDis = specs.deflectionDistortion ?? null;

  const scmSpeed = specs.scmSpeed ?? specs.maxSpeed ?? null;
  const boostFwd = specs.boostSpeedForward ?? specs.afterburnerSpeed ?? null;
  const pitch = specs.pitchRate ?? null;
  const yaw = specs.yawRate ?? null;
  const roll = specs.rollRate ?? null;
  const bPitch = specs.boostedPitch ?? null;
  const bYaw = specs.boostedYaw ?? null;
  const bRoll = specs.boostedRoll ?? null;

  const accelFwd = specs.accelForward ?? null;
  const accelBwd = specs.accelBackward ?? null;
  const accelUp = specs.accelUp ?? null;
  const accelDown = specs.accelDown ?? null;
  const accelStr = specs.accelStrafe ?? null;

  const cargo = specs.cargo ?? null;
  const h2 = specs.hydrogenCapacity ?? specs.hydrogenFuelCap ?? null;
  const qt = specs.quantumFuelCapacity ?? specs.quantumFuelCap ?? null;
  const qtRangeGm = specs.quantumRange ?? null;

  const shieldHp = specs.shieldHpTotal ?? computed?.totalShieldHp ?? null;
  const pilotDps = computed?.totalDps ?? null;

  // Dimensiones string
  const dimsFlight =
    lengthM != null && beamM != null && heightM != null
      ? `${size ? `(S${size}) ` : ""}${num(lengthM)} L × ${num(
          beamM
        )} W × ${num(heightM)} H m`
      : MISSING;

  // Helpers para strings con unidad
  const pitchYawRoll =
    pitch != null || yaw != null || roll != null
      ? `${num(pitch)} / ${num(yaw)} / ${num(roll)}`
      : MISSING;
  const boostedPYR =
    bPitch != null || bYaw != null || bRoll != null
      ? `${num(bPitch, 1)} / ${num(bYaw, 1)} / ${num(bRoll, 1)}`
      : MISSING;

  const scmBoostStr =
    scmSpeed != null || boostFwd != null
      ? `${num(scmSpeed)} / ${num(boostFwd)}`
      : MISSING;

  const h2Str = h2 != null ? `${num(h2)}` : MISSING;
  const qtStr = qt != null ? `${num(qt, 2)}` : MISSING;

  // ═════════════════════════════════════════════════════════════════════
  // HORIZONTAL — formato Erkul-like ancho y bajo
  // ═════════════════════════════════════════════════════════════════════
  if (variant === "horizontal") {
    const W = 1600;
    const H = 480;

    return (
      <div
        id={captureId}
        style={{
          position: "relative",
          width: W,
          height: H,
          backgroundColor: theme.bg,
          color: theme.text,
          border: `1px solid ${theme.border}`,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          overflow: "hidden",
        }}
      >
        {/* Top accent bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            backgroundColor: theme.accent,
          }}
        />

        {/* Brand header */}
        <div
          style={{
            position: "absolute",
            top: 14,
            left: 20,
            right: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <LogoWordmark theme={theme} size={28} />
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: 8,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: theme.textMuted,
              }}
            >
              Ship Spec Sheet
            </div>
            <div
              style={{
                fontSize: 10,
                color: theme.accent,
                marginTop: 2,
                fontFamily: "monospace",
              }}
            >
              {ship.gameVersion || "4.x"}
            </div>
          </div>
        </div>

        {/* Main content grid: image col + 4 data cols */}
        <div
          style={{
            position: "absolute",
            top: 60,
            left: 20,
            right: 20,
            bottom: 32,
            display: "grid",
            gridTemplateColumns: "340px 1fr 1fr 1fr 1fr",
            gap: 14,
          }}
        >
          {/* ── Col 0: Image + Name ── */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                position: "relative",
                width: "100%",
                height: 210,
                backgroundColor: theme.bgPanel,
                border: `1px solid ${theme.border}`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt={displayName}
                crossOrigin="anonymous"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  padding: 10,
                }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.opacity = "0.3";
                }}
              />
            </div>
            <div style={{ marginTop: 10 }}>
              <div
                style={{
                  fontSize: 9,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: theme.textMuted,
                  marginBottom: 2,
                }}
              >
                {ship.manufacturer ?? "Manufacturer"}
              </div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 300,
                  lineHeight: 1,
                  color: theme.text,
                  letterSpacing: "-0.01em",
                }}
              >
                {displayName}
              </div>
              {(ship.type || specs.role) && (
                <div
                  style={{
                    fontSize: 10,
                    marginTop: 4,
                    color: theme.accent,
                    letterSpacing: "0.05em",
                  }}
                >
                  {[ship.type, specs.role].filter(Boolean).join(" · ")}
                </div>
              )}
              {(specs.maxCrew != null || mass != null) && (
                <div
                  style={{
                    display: "flex",
                    gap: 14,
                    marginTop: 6,
                    fontSize: 10,
                    color: theme.textMuted,
                  }}
                >
                  {specs.maxCrew != null && (
                    <span>
                      <span style={{ color: theme.text, fontWeight: 600 }}>
                        {specs.maxCrew}
                      </span>{" "}
                      crew
                    </span>
                  )}
                  {mass != null && (
                    <span>
                      <span style={{ color: theme.text, fontWeight: 600 }}>
                        {num(mass)}
                      </span>{" "}
                      kg
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Col 1: Hull + Vital Part + Armor ── */}
          <div style={{ minWidth: 0 }}>
            <SectionHeader title="Hull" theme={theme} />
            <Row label="Dimensions (Flight)" value={dimsFlight} theme={theme} dense />
            <Row label="Dimensions (Landed)" value={MISSING} theme={theme} dense />
            <Row label="Mass" value={num(mass)} unit="Kg" theme={theme} dense />
            <Row
              label="Total health points"
              value={num(hullHp)}
              unit="HP"
              theme={theme}
              dense
            />

            <SubHeader title="Vital Part" theme={theme} />
            <Row label="Body" value={MISSING} unit="HP" theme={theme} dense />
            <SubHeader title="Damage Modifiers" theme={theme} />
            <ModifierTriplet
              a={["Physical", deflPhys != null ? `${num(deflPhys)} %` : MISSING]}
              b={["Electromagnetic", MISSING]}
              theme={theme}
            />
            <ModifierTriplet
              a={["Energy", deflEne != null ? `${num(deflEne)} %` : MISSING]}
              b={["CrossSection", MISSING]}
              theme={theme}
            />
            <ModifierTriplet
              a={["Distortion", deflDis != null ? `${num(deflDis)} %` : MISSING]}
              b={["Infrared", MISSING]}
              theme={theme}
            />

            <SubHeader title="Armor" theme={theme} />
            <Row label="Health points" value={MISSING} unit="HP" theme={theme} dense />
            <Row
              label="Deflection Threshold"
              value={MISSING}
              theme={theme}
              dense
            />
          </div>

          {/* ── Col 2: Weaponry ── */}
          <div style={{ minWidth: 0 }}>
            <SectionHeader title="Weaponry" theme={theme} />
            <Row
              label="Pilot DPS"
              value={pilotDps != null ? num(pilotDps) : MISSING}
              theme={theme}
              dense
            />
            <Row label="Crew DPS" value={MISSING} theme={theme} dense />
            <Row label="Missiles & Bombs" value={MISSING} unit="Dmg" theme={theme} dense />
            <Row
              label="Max Armed / Rearm CD"
              value={MISSING}
              theme={theme}
              dense
            />
            <Row
              label="Shield (Quadrant)"
              value={shieldHp != null ? num(shieldHp) : MISSING}
              unit="HP"
              theme={theme}
              dense
            />
            <Row
              label="Weapons (count)"
              value={num(computed?.hardpointSummary?.weapons)}
              theme={theme}
              dense
            />
            <Row
              label="Missiles (count)"
              value={num(computed?.hardpointSummary?.missiles)}
              theme={theme}
              dense
            />
            <Row
              label="Shields (count)"
              value={num(computed?.hardpointSummary?.shields)}
              theme={theme}
              dense
            />

            <SectionHeader title="Carrying Capacity" theme={theme} />
            <Row
              label="Cargo Grid"
              value={num(cargo)}
              unit="SCU"
              theme={theme}
              dense
            />
          </div>

          {/* ── Col 3: Fuel + Refuel Cost ── */}
          <div style={{ minWidth: 0 }}>
            <SectionHeader title="Fuel" theme={theme} />
            <Row label="Hydrogen" value={h2Str} unit="SCU" theme={theme} dense />
            <Row label="Quantum" value={qtStr} unit="SCU" theme={theme} dense />
            <Row
              label="Range"
              value={qtRangeGm != null ? num(qtRangeGm, 2) : MISSING}
              unit="GM"
              theme={theme}
              dense
            />

            <SectionHeader title="Refuel Cost" theme={theme} />
            <Row label="Hydrogen" value={MISSING} unit="aUEC" theme={theme} dense />
            <Row label="Quantum" value={MISSING} unit="aUEC" theme={theme} dense />

            <SectionHeader title="Insurance" theme={theme} />
            <Row label="Claim / Expedite" value={MISSING} theme={theme} dense />
            <Row label="Expedite cost" value={MISSING} unit="aUEC" theme={theme} dense />
          </div>

          {/* ── Col 4: Flight Perf + Accelerations ── */}
          <div style={{ minWidth: 0 }}>
            <SectionHeader title="Flight Performances" theme={theme} />
            <Row
              label="SCM / Forward Boost"
              value={scmBoostStr}
              unit="m/s"
              theme={theme}
              dense
            />
            <Row label="NAV" value={MISSING} unit="m/s" theme={theme} dense />
            <Row
              label="Boost Ramp Up / Down"
              value={MISSING}
              unit="s"
              theme={theme}
              dense
            />
            <Row
              label="Pitch / Yaw / Roll"
              value={pitchYawRoll}
              unit="°/s"
              theme={theme}
              dense
            />
            <Row
              label="Boosted"
              value={boostedPYR}
              unit="°/s"
              theme={theme}
              dense
            />

            <SectionHeader title="Accelerations" theme={theme} />
            <Row label="Main" value={toG(accelFwd)} unit="G" theme={theme} dense />
            <Row label="Retro" value={toG(accelBwd)} unit="G" theme={theme} dense />
            <Row label="Up" value={toG(accelUp)} unit="G" theme={theme} dense />
            <Row label="Down" value={toG(accelDown)} unit="G" theme={theme} dense />
            <Row label="Strafe" value={toG(accelStr)} unit="G" theme={theme} dense />
          </div>
        </div>

        {/* Footer: cortesía */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 26,
            backgroundColor: theme.bgPanel,
            borderTop: `1px solid ${theme.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 20px",
          }}
        >
          <span
            style={{
              fontSize: 9,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: theme.textMuted,
            }}
          >
            Cortesía de SC Labs
          </span>
          <span
            style={{
              fontSize: 9,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: theme.accent,
            }}
          >
            sclabs · star citizen intelligence
          </span>
        </div>
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════════════════
  // VERTICAL — mismo contenido, layout stacked para portrait
  // ═════════════════════════════════════════════════════════════════════
  const W = 720;
  const H = 1280;

  return (
    <div
      id={captureId}
      style={{
        position: "relative",
        width: W,
        height: H,
        backgroundColor: theme.bg,
        color: theme.text,
        border: `1px solid ${theme.border}`,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        overflow: "hidden",
      }}
    >
      {/* Accent top */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 4,
          backgroundColor: theme.accent,
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 18,
          left: 24,
          right: 24,
          bottom: 34,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Brand header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <LogoWordmark theme={theme} size={32} />
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: theme.textMuted,
            }}
          >
            {ship.gameVersion || "4.x"}
          </div>
        </div>

        {/* Ship image */}
        <div
          style={{
            position: "relative",
            width: "100%",
            height: 260,
            backgroundColor: theme.bgPanel,
            borderTop: `2px solid ${theme.accent}`,
            borderBottom: `2px solid ${theme.accent}`,
            marginBottom: 10,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={displayName}
            crossOrigin="anonymous"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "contain",
              padding: 14,
            }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.opacity = "0.3";
            }}
          />
        </div>

        {/* Name + manufacturer */}
        <div style={{ marginBottom: 10 }}>
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.24em",
              textTransform: "uppercase",
              color: theme.textMuted,
              marginBottom: 3,
            }}
          >
            {ship.manufacturer ?? "Manufacturer"}
          </div>
          <div
            style={{
              fontSize: 36,
              fontWeight: 300,
              lineHeight: 1,
              color: theme.text,
              letterSpacing: "-0.01em",
            }}
          >
            {displayName}
          </div>
          {(ship.type || specs.role) && (
            <div
              style={{
                fontSize: 12,
                marginTop: 5,
                color: theme.accent,
              }}
            >
              {[ship.type, specs.role].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>

        {/* 2-col data grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            columnGap: 18,
            flex: 1,
            alignContent: "start",
          }}
        >
          {/* LEFT COLUMN */}
          <div>
            <SectionHeader title="Hull" theme={theme} dense />
            <Row label="Dimensions (F)" value={dimsFlight} theme={theme} dense />
            <Row label="Dimensions (L)" value={MISSING} theme={theme} dense />
            <Row label="Mass" value={num(mass)} unit="Kg" theme={theme} dense />
            <Row label="Total HP" value={num(hullHp)} unit="HP" theme={theme} dense />

            <SubHeader title="Vital Part" theme={theme} />
            <Row label="Body" value={MISSING} unit="HP" theme={theme} dense />
            <SubHeader title="Damage Modifiers" theme={theme} />
            <ModifierTriplet
              a={["Physical", deflPhys != null ? `${num(deflPhys)} %` : MISSING]}
              b={["Electromag.", MISSING]}
              theme={theme}
            />
            <ModifierTriplet
              a={["Energy", deflEne != null ? `${num(deflEne)} %` : MISSING]}
              b={["CrossSection", MISSING]}
              theme={theme}
            />
            <ModifierTriplet
              a={["Distortion", deflDis != null ? `${num(deflDis)} %` : MISSING]}
              b={["Infrared", MISSING]}
              theme={theme}
            />

            <SubHeader title="Armor" theme={theme} />
            <Row label="Health points" value={MISSING} unit="HP" theme={theme} dense />
            <Row label="Deflect. Threshold" value={MISSING} theme={theme} dense />

            <SectionHeader title="Weaponry" theme={theme} dense />
            <Row
              label="Pilot DPS"
              value={pilotDps != null ? num(pilotDps) : MISSING}
              theme={theme}
              dense
            />
            <Row label="Crew DPS" value={MISSING} theme={theme} dense />
            <Row label="Missiles & Bombs" value={MISSING} unit="Dmg" theme={theme} dense />
            <Row label="Max Armed / Rearm" value={MISSING} theme={theme} dense />
            <Row
              label="Shield (Quadrant)"
              value={shieldHp != null ? num(shieldHp) : MISSING}
              unit="HP"
              theme={theme}
              dense
            />
          </div>

          {/* RIGHT COLUMN */}
          <div>
            <SectionHeader title="Carrying Capacity" theme={theme} dense />
            <Row label="Cargo Grid" value={num(cargo)} unit="SCU" theme={theme} dense />

            <SectionHeader title="Fuel" theme={theme} dense />
            <Row label="Hydrogen" value={h2Str} unit="SCU" theme={theme} dense />
            <Row label="Quantum" value={qtStr} unit="SCU" theme={theme} dense />
            <Row
              label="Range"
              value={qtRangeGm != null ? num(qtRangeGm, 2) : MISSING}
              unit="GM"
              theme={theme}
              dense
            />

            <SectionHeader title="Refuel Cost" theme={theme} dense />
            <Row label="Hydrogen" value={MISSING} unit="aUEC" theme={theme} dense />
            <Row label="Quantum" value={MISSING} unit="aUEC" theme={theme} dense />

            <SectionHeader title="Flight Performances" theme={theme} dense />
            <Row
              label="SCM / Fwd Boost"
              value={scmBoostStr}
              unit="m/s"
              theme={theme}
              dense
            />
            <Row label="NAV" value={MISSING} unit="m/s" theme={theme} dense />
            <Row label="Boost Ramp U/D" value={MISSING} unit="s" theme={theme} dense />
            <Row
              label="Pitch / Yaw / Roll"
              value={pitchYawRoll}
              unit="°/s"
              theme={theme}
              dense
            />
            <Row label="Boosted" value={boostedPYR} unit="°/s" theme={theme} dense />

            <SectionHeader title="Accelerations" theme={theme} dense />
            <Row label="Main" value={toG(accelFwd)} unit="G" theme={theme} dense />
            <Row label="Retro" value={toG(accelBwd)} unit="G" theme={theme} dense />
            <Row label="Up" value={toG(accelUp)} unit="G" theme={theme} dense />
            <Row label="Down" value={toG(accelDown)} unit="G" theme={theme} dense />
            <Row label="Strafe" value={toG(accelStr)} unit="G" theme={theme} dense />

            <SectionHeader title="Insurance" theme={theme} dense />
            <Row label="Claim / Expedite" value={MISSING} theme={theme} dense />
            <Row label="Expedite cost" value={MISSING} unit="aUEC" theme={theme} dense />
          </div>
        </div>
      </div>

      {/* Footer: cortesía */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 28,
          backgroundColor: theme.bgPanel,
          borderTop: `1px solid ${theme.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
        }}
      >
        <span
          style={{
            fontSize: 10,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: theme.textMuted,
          }}
        >
          Cortesía de SC Labs
        </span>
        <span
          style={{
            fontSize: 10,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: theme.accent,
          }}
        >
          sclabs.app
        </span>
      </div>
    </div>
  );
}
