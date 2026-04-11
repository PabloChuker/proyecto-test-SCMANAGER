"use client";

// =============================================================================
// SC LABS — RadarChart (SVG Spider/Radar Chart)
// Renders an N-axis radar chart. Two modes:
//   1. Single-dataset: pass axes with `value` + `max`. Chart draws one polygon
//      using the `color` prop. Labels show the rounded value.
//   2. Multi-dataset:  pass axes with `key` + `max` (no value), and a
//      `datasets` prop where each entry has `{ label, color, values }` and
//      `values` is keyed by axis.key. Chart draws one polygon per dataset in
//      its own color. Labels show only the axis label (per-axis values would
//      collide since there's >1 per axis).
// =============================================================================

export interface RadarAxis {
  /** Key used in multi-dataset mode to look up the value in dataset.values */
  key?: string;
  label: string;
  /** Single-dataset mode: the value to plot. Ignored in multi-dataset. */
  value?: number;
  /** Max for 0–1 normalization. Required in both modes. */
  max: number;
  /** Optional formatted display (single-dataset mode only). */
  displayValue?: string;
}

export interface RadarDataset {
  label: string;
  color: string;
  /** Values keyed by axis.key (for multi-dataset mode). */
  values: Record<string, number>;
}

interface RadarChartProps {
  axes: RadarAxis[];
  /** Multi-dataset mode: pass one entry per series to overlay on the radar. */
  datasets?: RadarDataset[];
  size?: number;
  /** Fallback color (single-dataset mode). */
  color?: string;
  fillOpacity?: number;
  strokeWidth?: number;
  gridLevels?: number;
  showValues?: boolean;
  className?: string;
}

export function RadarChart({
  axes,
  datasets,
  size = 220,
  color = "#f59e0b",
  fillOpacity = 0.15,
  strokeWidth = 2,
  gridLevels = 5,
  showValues = true,
  className = "",
}: RadarChartProps) {
  if (axes.length < 3) return null;

  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.35;
  const labelRadius = size * 0.47;
  const n = axes.length;
  const angleStep = (2 * Math.PI) / n;
  const startAngle = -Math.PI / 2; // Start from top
  const isMulti = !!(datasets && datasets.length > 0);

  // Get polygon points for a given set of normalized values (0-1)
  const getPoints = (values: number[]): string =>
    values
      .map((v, i) => {
        const angle = startAngle + i * angleStep;
        const r = v * radius;
        return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
      })
      .join(" ");

  // Compute normalized series per render mode.
  // Single-dataset: one series from axis.value.
  // Multi-dataset: one series per dataset, looking up dataset.values[axis.key].
  type Series = { label: string; color: string; normalized: number[] };
  const seriesList: Series[] = isMulti
    ? datasets!.map((ds) => ({
        label: ds.label,
        color: ds.color,
        normalized: axes.map((a) => {
          const key = a.key ?? a.label;
          const v = ds.values[key] ?? 0;
          return a.max > 0 ? Math.min(1, v / a.max) : 0;
        }),
      }))
    : [
        {
          label: "",
          color,
          normalized: axes.map((a) =>
            a.max > 0 ? Math.min(1, (a.value ?? 0) / a.max) : 0,
          ),
        },
      ];

  // Grid levels
  const gridPolygons = Array.from({ length: gridLevels }, (_, i) => {
    const level = (i + 1) / gridLevels;
    const pts = axes.map((_, j) => {
      const angle = startAngle + j * angleStep;
      const r = level * radius;
      return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
    });
    return pts.join(" ");
  });

  // Labels in multi-dataset mode use zinc (neutral) because per-axis colors
  // would conflict with the >1 dataset colors.
  const labelColor = isMulti ? "#a1a1aa" : color;

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      style={{ width: size, height: size }}
    >
      {/* Grid polygons */}
      {gridPolygons.map((pts, i) => (
        <polygon
          key={`grid-${i}`}
          points={pts}
          fill="none"
          stroke="#3f3f46"
          strokeWidth={0.5}
          opacity={0.4}
        />
      ))}

      {/* Axis lines */}
      {axes.map((_, i) => {
        const angle = startAngle + i * angleStep;
        return (
          <line
            key={`axis-${i}`}
            x1={cx}
            y1={cy}
            x2={cx + radius * Math.cos(angle)}
            y2={cy + radius * Math.sin(angle)}
            stroke="#3f3f46"
            strokeWidth={0.5}
            opacity={0.3}
          />
        );
      })}

      {/* Data polygons — one per series. In single-dataset mode this is 1
          polygon; in multi-dataset mode one per dataset. */}
      {seriesList.map((s, si) => (
        <g key={`series-${si}`}>
          <polygon
            points={getPoints(s.normalized)}
            fill={s.color}
            fillOpacity={isMulti ? Math.max(0.08, fillOpacity * 0.7) : fillOpacity}
            stroke={s.color}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
          {/* Data points */}
          {s.normalized.map((v, i) => {
            const angle = startAngle + i * angleStep;
            const r = v * radius;
            return (
              <circle
                key={`dot-${si}-${i}`}
                cx={cx + r * Math.cos(angle)}
                cy={cy + r * Math.sin(angle)}
                r={2.5}
                fill={s.color}
                stroke="#18181b"
                strokeWidth={1}
              />
            );
          })}
        </g>
      ))}

      {/* Labels */}
      {axes.map((axis, i) => {
        const angle = startAngle + i * angleStep;
        const lx = cx + labelRadius * Math.cos(angle);
        const ly = cy + labelRadius * Math.sin(angle);

        // Determine text anchor based on position
        let anchor: "inherit" | "middle" | "start" | "end" = "middle";
        if (Math.cos(angle) > 0.3) anchor = "start";
        else if (Math.cos(angle) < -0.3) anchor = "end";

        // In multi-dataset mode, we show only the axis label (no per-axis
        // value since there are multiple). The polygons themselves carry
        // the comparison. In single-dataset mode we keep the existing
        // behavior: show the rounded value under the label.
        const displayVal = isMulti
          ? null
          : (axis.displayValue ?? ((axis.value ?? 0) > 0 ? Math.round(axis.value ?? 0).toString() : "—"));

        return (
          <g key={`label-${i}`}>
            <text
              x={lx}
              y={ly - (showValues && displayVal ? 4 : 0)}
              textAnchor={anchor}
              dominantBaseline="middle"
              className="fill-zinc-500"
              style={{ fontSize: "8px", fontFamily: "monospace" }}
            >
              {axis.label}
            </text>
            {showValues && displayVal !== null && (
              <text
                x={lx}
                y={ly + 8}
                textAnchor={anchor}
                dominantBaseline="middle"
                style={{ fontSize: "9px", fontFamily: "monospace", fill: labelColor, fontWeight: 600 }}
              >
                {displayVal}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
