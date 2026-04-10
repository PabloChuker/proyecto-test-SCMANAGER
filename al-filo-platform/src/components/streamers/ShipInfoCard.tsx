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
// Marca + nombre de nave viven en un bloque de título en la parte superior,
// dejando el layout más fino y alargado.
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

// ── Tipo para escala de tipografía ──
// Permite reescalar todo el bloque de info en sync (horizontal vs vertical).

type Theme = ReturnType<typeof getTheme>;

interface TypoScale {
  sectionHeader: number;
  subHeader: number;
  row: number;
  unit: number;
  modifier: number;
}

// Fuentes base +50% respecto a la versión anterior
const TYPO_H: TypoScale = {
  sectionHeader: 17,
  subHeader: 13,
  row: 15,
  unit: 12,
  modifier: 13,
};

const TYPO_V: TypoScale = {
  sectionHeader: 16,
  subHeader: 12,
  row: 14,
  unit: 11,
  modifier: 12,
};

// ── Shared subcomponents ──

function SectionHeader({
  title,
  theme,
  suffix,
  typo,
}: {
  title: string;
  theme: Theme;
  suffix?: string;
  typo: TypoScale;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: `1px solid ${theme.border}`,
        paddingBottom: 4,
        marginBottom: 6,
        marginTop: 10,
      }}
    >
      <span
        style={{
          fontSize: typo.sectionHeader,
          fontWeight: 600,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: theme.accent,
          lineHeight: 1,
        }}
      >
        {title}
      </span>
      {suffix && (
        <span
          style={{
            fontSize: typo.unit,
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

function SubHeader({
  title,
  theme,
  typo,
}: {
  title: string;
  theme: Theme;
  typo: TypoScale;
}) {
  return (
    <div
      style={{
        fontSize: typo.subHeader,
        fontWeight: 600,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: theme.textMuted,
        marginTop: 6,
        marginBottom: 3,
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
  typo,
}: {
  label: string;
  value: string | React.ReactNode;
  theme: Theme;
  unit?: string;
  typo: TypoScale;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 10,
        padding: "2px 0",
        fontSize: typo.row,
        lineHeight: 1.22,
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
              fontSize: typo.unit,
              marginLeft: 4,
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
  typo,
}: {
  a: [string, string];
  b: [string, string];
  theme: Theme;
  typo: TypoScale;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        columnGap: 12,
        fontSize: typo.modifier,
        lineHeight: 1.3,
        padding: "1px 0",
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

/**
 * Brand mark: logo + wordmark. Escalado configurable (+40% respecto a versión
 * previa: 28 → 40 default).
 */
function BrandMark({
  theme,
  size = 40,
  labelSize = 18,
  subSize = 10,
}: {
  theme: Theme;
  size?: number;
  labelSize?: number;
  subSize?: number;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <Image
        src="/sclabs-logo.png"
        alt="SC LABS"
        width={size}
        height={size}
        style={{ borderRadius: 5 }}
        crossOrigin="anonymous"
        unoptimized
      />
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
        <span
          style={{
            fontSize: labelSize,
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
            fontSize: subSize,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: theme.textMuted,
            marginTop: 3,
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
  // HORIZONTAL — formato alargado, título arriba, 4 cols de data + img
  // ═════════════════════════════════════════════════════════════════════
  if (variant === "horizontal") {
    const W = 1800;
    const H = 440;
    const HEADER_H = 80;
    const FOOTER_H = 28;
    const typo = TYPO_H;

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

        {/* ── Título arriba: logo + marca + nombre + version ── */}
        <div
          style={{
            position: "absolute",
            top: 3,
            left: 0,
            right: 0,
            height: HEADER_H - 3,
            display: "flex",
            alignItems: "center",
            padding: "0 28px",
            borderBottom: `1px solid ${theme.border}`,
            gap: 24,
          }}
        >
          {/* Brand izquierda — logo +40% */}
          <BrandMark theme={theme} size={48} labelSize={18} subSize={10} />

          {/* Divider */}
          <div
            style={{
              width: 1,
              height: 46,
              backgroundColor: theme.border,
              flexShrink: 0,
            }}
          />

          {/* Title center: manufacturer + ship name */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              minWidth: 0,
            }}
          >
            <div
              style={{
                fontSize: 13,
                letterSpacing: "0.28em",
                textTransform: "uppercase",
                color: theme.textMuted,
                marginBottom: 3,
                lineHeight: 1,
              }}
            >
              {ship.manufacturer ?? "Manufacturer"}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 18,
                lineHeight: 1,
              }}
            >
              <span
                style={{
                  fontSize: 42,
                  fontWeight: 300,
                  color: theme.text,
                  letterSpacing: "-0.01em",
                }}
              >
                {displayName}
              </span>
              {(ship.type || specs.role) && (
                <span
                  style={{
                    fontSize: 13,
                    color: theme.accent,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  {[ship.type, specs.role].filter(Boolean).join(" · ")}
                </span>
              )}
            </div>
          </div>

          {/* Version badge right */}
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: theme.textMuted,
              }}
            >
              Ship Spec Sheet
            </div>
            <div
              style={{
                fontSize: 16,
                color: theme.accent,
                marginTop: 3,
                fontFamily: "monospace",
                fontWeight: 600,
              }}
            >
              {ship.gameVersion || "4.x"}
            </div>
          </div>
        </div>

        {/* ── Content: image + 4 data cols ── */}
        <div
          style={{
            position: "absolute",
            top: HEADER_H + 10,
            left: 24,
            right: 24,
            bottom: FOOTER_H + 6,
            display: "grid",
            gridTemplateColumns: "340px 1fr 1fr 1fr 1fr",
            gap: 16,
          }}
        >
          {/* ── Col 0: Ship image (full height) ── */}
          <div
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
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
                padding: 12,
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.opacity = "0.3";
              }}
            />
            {(specs.maxCrew != null || mass != null) && (
              <div
                style={{
                  position: "absolute",
                  bottom: 6,
                  left: 10,
                  right: 10,
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12,
                  color: theme.textMuted,
                }}
              >
                {specs.maxCrew != null ? (
                  <span>
                    <span style={{ color: theme.text, fontWeight: 600 }}>
                      {specs.maxCrew}
                    </span>{" "}
                    crew
                  </span>
                ) : (
                  <span />
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

          {/* ── Col 1: Hull + Vital Part + Armor ── */}
          <div style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
            <SectionHeader title="Hull" theme={theme} typo={typo} />
            <Row label="Dimensions (F)" value={dimsFlight} theme={theme} typo={typo} />
            <Row label="Dimensions (L)" value={MISSING} theme={theme} typo={typo} />
            <Row label="Mass" value={num(mass)} unit="Kg" theme={theme} typo={typo} />
            <Row
              label="Total HP"
              value={num(hullHp)}
              unit="HP"
              theme={theme}
              typo={typo}
            />

            <SubHeader title="Vital Part" theme={theme} typo={typo} />
            <Row label="Body" value={MISSING} unit="HP" theme={theme} typo={typo} />
            <SubHeader title="Damage Modifiers" theme={theme} typo={typo} />
            <ModifierTriplet
              a={["Physical", deflPhys != null ? `${num(deflPhys)} %` : MISSING]}
              b={["EM", MISSING]}
              theme={theme}
              typo={typo}
            />
            <ModifierTriplet
              a={["Energy", deflEne != null ? `${num(deflEne)} %` : MISSING]}
              b={["CrossSec.", MISSING]}
              theme={theme}
              typo={typo}
            />
            <ModifierTriplet
              a={["Distortion", deflDis != null ? `${num(deflDis)} %` : MISSING]}
              b={["Infrared", MISSING]}
              theme={theme}
              typo={typo}
            />
          </div>

          {/* ── Col 2: Weaponry + Carrying + Armor ── */}
          <div style={{ minWidth: 0 }}>
            <SectionHeader title="Weaponry" theme={theme} typo={typo} />
            <Row
              label="Pilot DPS"
              value={pilotDps != null ? num(pilotDps) : MISSING}
              theme={theme}
              typo={typo}
            />
            <Row label="Crew DPS" value={MISSING} theme={theme} typo={typo} />
            <Row
              label="Missiles & Bombs"
              value={MISSING}
              unit="Dmg"
              theme={theme}
              typo={typo}
            />
            <Row
              label="Max Armed / Rearm"
              value={MISSING}
              theme={theme}
              typo={typo}
            />
            <Row
              label="Shield (Quadrant)"
              value={shieldHp != null ? num(shieldHp) : MISSING}
              unit="HP"
              theme={theme}
              typo={typo}
            />

            <SectionHeader title="Armor" theme={theme} typo={typo} />
            <Row
              label="Health points"
              value={MISSING}
              unit="HP"
              theme={theme}
              typo={typo}
            />
            <Row
              label="Deflect. Threshold"
              value={MISSING}
              theme={theme}
              typo={typo}
            />
          </div>

          {/* ── Col 3: Carrying + Fuel + Refuel Cost ── */}
          <div style={{ minWidth: 0 }}>
            <SectionHeader title="Carrying Capacity" theme={theme} typo={typo} />
            <Row
              label="Cargo Grid"
              value={num(cargo)}
              unit="SCU"
              theme={theme}
              typo={typo}
            />

            <SectionHeader title="Fuel" theme={theme} typo={typo} />
            <Row label="Hydrogen" value={h2Str} unit="SCU" theme={theme} typo={typo} />
            <Row label="Quantum" value={qtStr} unit="SCU" theme={theme} typo={typo} />
            <Row
              label="Range"
              value={qtRangeGm != null ? num(qtRangeGm, 2) : MISSING}
              unit="GM"
              theme={theme}
              typo={typo}
            />

            <SectionHeader title="Refuel Cost" theme={theme} typo={typo} />
            <Row
              label="Hydrogen"
              value={MISSING}
              unit="aUEC"
              theme={theme}
              typo={typo}
            />
            <Row
              label="Quantum"
              value={MISSING}
              unit="aUEC"
              theme={theme}
              typo={typo}
            />
          </div>

          {/* ── Col 4: Flight Performances + Accelerations + Insurance ── */}
          <div style={{ minWidth: 0 }}>
            <SectionHeader title="Flight Performances" theme={theme} typo={typo} />
            <Row
              label="SCM / Fwd Boost"
              value={scmBoostStr}
              unit="m/s"
              theme={theme}
              typo={typo}
            />
            <Row label="NAV" value={MISSING} unit="m/s" theme={theme} typo={typo} />
            <Row
              label="Pitch / Yaw / Roll"
              value={pitchYawRoll}
              unit="°/s"
              theme={theme}
              typo={typo}
            />
            <Row label="Boosted" value={boostedPYR} unit="°/s" theme={theme} typo={typo} />

            <SectionHeader title="Accelerations" theme={theme} typo={typo} />
            <Row label="Main" value={toG(accelFwd)} unit="G" theme={theme} typo={typo} />
            <Row label="Retro" value={toG(accelBwd)} unit="G" theme={theme} typo={typo} />
            <Row label="Up / Down" value={`${toG(accelUp)} / ${toG(accelDown)}`} unit="G" theme={theme} typo={typo} />
            <Row label="Strafe" value={toG(accelStr)} unit="G" theme={theme} typo={typo} />
          </div>
        </div>

        {/* Footer: cortesía */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: FOOTER_H,
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
              fontSize: 11,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: theme.textMuted,
            }}
          >
            Cortesía de SC Labs
          </span>
          <span
            style={{
              fontSize: 11,
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
  // VERTICAL — título arriba + img + 2 cols stacked
  // ═════════════════════════════════════════════════════════════════════
  const W = 760;
  const H = 1380;
  const typo = TYPO_V;

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
          top: 20,
          left: 26,
          right: 26,
          bottom: 36,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* ── Título arriba: logo + marca + nombre ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <BrandMark theme={theme} size={44} labelSize={17} subSize={9} />
          <div
            style={{
              fontSize: 11,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: theme.textMuted,
            }}
          >
            {ship.gameVersion || "4.x"}
          </div>
        </div>

        {/* Manufacturer + Ship name as title */}
        <div
          style={{
            marginBottom: 10,
            paddingBottom: 10,
            borderBottom: `1px solid ${theme.border}`,
          }}
        >
          <div
            style={{
              fontSize: 13,
              letterSpacing: "0.26em",
              textTransform: "uppercase",
              color: theme.textMuted,
              marginBottom: 4,
            }}
          >
            {ship.manufacturer ?? "Manufacturer"}
          </div>
          <div
            style={{
              fontSize: 46,
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
                fontSize: 14,
                marginTop: 6,
                color: theme.accent,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              {[ship.type, specs.role].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>

        {/* Ship image */}
        <div
          style={{
            position: "relative",
            width: "100%",
            height: 280,
            backgroundColor: theme.bgPanel,
            borderTop: `2px solid ${theme.accent}`,
            borderBottom: `2px solid ${theme.accent}`,
            marginBottom: 8,
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
              padding: 16,
            }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.opacity = "0.3";
            }}
          />
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
            <SectionHeader title="Hull" theme={theme} typo={typo} />
            <Row label="Dimensions (F)" value={dimsFlight} theme={theme} typo={typo} />
            <Row label="Mass" value={num(mass)} unit="Kg" theme={theme} typo={typo} />
            <Row
              label="Total HP"
              value={num(hullHp)}
              unit="HP"
              theme={theme}
              typo={typo}
            />

            <SubHeader title="Vital Part" theme={theme} typo={typo} />
            <Row label="Body" value={MISSING} unit="HP" theme={theme} typo={typo} />
            <SubHeader title="Damage Modifiers" theme={theme} typo={typo} />
            <ModifierTriplet
              a={["Physical", deflPhys != null ? `${num(deflPhys)} %` : MISSING]}
              b={["EM", MISSING]}
              theme={theme}
              typo={typo}
            />
            <ModifierTriplet
              a={["Energy", deflEne != null ? `${num(deflEne)} %` : MISSING]}
              b={["CrossSec.", MISSING]}
              theme={theme}
              typo={typo}
            />
            <ModifierTriplet
              a={["Distortion", deflDis != null ? `${num(deflDis)} %` : MISSING]}
              b={["Infrared", MISSING]}
              theme={theme}
              typo={typo}
            />

            <SectionHeader title="Weaponry" theme={theme} typo={typo} />
            <Row
              label="Pilot DPS"
              value={pilotDps != null ? num(pilotDps) : MISSING}
              theme={theme}
              typo={typo}
            />
            <Row label="Crew DPS" value={MISSING} theme={theme} typo={typo} />
            <Row
              label="Missiles & Bombs"
              value={MISSING}
              unit="Dmg"
              theme={theme}
              typo={typo}
            />
            <Row
              label="Max Armed / Rearm"
              value={MISSING}
              theme={theme}
              typo={typo}
            />
            <Row
              label="Shield (Quadrant)"
              value={shieldHp != null ? num(shieldHp) : MISSING}
              unit="HP"
              theme={theme}
              typo={typo}
            />

            <SectionHeader title="Armor" theme={theme} typo={typo} />
            <Row label="Health points" value={MISSING} unit="HP" theme={theme} typo={typo} />
            <Row label="Deflect. Threshold" value={MISSING} theme={theme} typo={typo} />
          </div>

          {/* RIGHT COLUMN */}
          <div>
            <SectionHeader title="Carrying Capacity" theme={theme} typo={typo} />
            <Row label="Cargo Grid" value={num(cargo)} unit="SCU" theme={theme} typo={typo} />

            <SectionHeader title="Fuel" theme={theme} typo={typo} />
            <Row label="Hydrogen" value={h2Str} unit="SCU" theme={theme} typo={typo} />
            <Row label="Quantum" value={qtStr} unit="SCU" theme={theme} typo={typo} />
            <Row
              label="Range"
              value={qtRangeGm != null ? num(qtRangeGm, 2) : MISSING}
              unit="GM"
              theme={theme}
              typo={typo}
            />

            <SectionHeader title="Refuel Cost" theme={theme} typo={typo} />
            <Row label="Hydrogen" value={MISSING} unit="aUEC" theme={theme} typo={typo} />
            <Row label="Quantum" value={MISSING} unit="aUEC" theme={theme} typo={typo} />

            <SectionHeader title="Flight Performances" theme={theme} typo={typo} />
            <Row
              label="SCM / Fwd Boost"
              value={scmBoostStr}
              unit="m/s"
              theme={theme}
              typo={typo}
            />
            <Row label="NAV" value={MISSING} unit="m/s" theme={theme} typo={typo} />
            <Row
              label="Pitch / Yaw / Roll"
              value={pitchYawRoll}
              unit="°/s"
              theme={theme}
              typo={typo}
            />
            <Row label="Boosted" value={boostedPYR} unit="°/s" theme={theme} typo={typo} />

            <SectionHeader title="Accelerations" theme={theme} typo={typo} />
            <Row label="Main" value={toG(accelFwd)} unit="G" theme={theme} typo={typo} />
            <Row label="Retro" value={toG(accelBwd)} unit="G" theme={theme} typo={typo} />
            <Row label="Up" value={toG(accelUp)} unit="G" theme={theme} typo={typo} />
            <Row label="Down" value={toG(accelDown)} unit="G" theme={theme} typo={typo} />
            <Row label="Strafe" value={toG(accelStr)} unit="G" theme={theme} typo={typo} />

            <SectionHeader title="Insurance" theme={theme} typo={typo} />
            <Row label="Claim / Expedite" value={MISSING} theme={theme} typo={typo} />
            <Row label="Expedite cost" value={MISSING} unit="aUEC" theme={theme} typo={typo} />
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
          height: 30,
          backgroundColor: theme.bgPanel,
          borderTop: `1px solid ${theme.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 26px",
        }}
      >
        <span
          style={{
            fontSize: 11,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: theme.textMuted,
          }}
        >
          Cortesía de SC Labs
        </span>
        <span
          style={{
            fontSize: 11,
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
