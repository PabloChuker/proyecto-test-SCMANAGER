"use client";

// =============================================================================
// SC LABS — RadarChart (SVG Spider/Radar Chart)
// Renders an N-axis radar chart with configurable data, labels, and styling.
// =============================================================================

interface RadarAxis {
  label: string;
  value: number;    // actual value
  max: number;      // max for normalization (0–1 range)
  displayValue?: string; // optional formatted display
}

interface RadarChartProps {
  axes: RadarAxis[];
  size?: number;
  color?: string;
  fillOpacity?: number;
  strokeWidth?: number;
  gridLevels?: number;
  showValues?: boolean;
  className?: string;
}

export function RadarChart({
  axes,
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

  // Get polygon points for a given set of normalized values (0-1)
  const getPoints = (values: number[]): string =>
    values
      .map((v, i) => {
        const angle = startAngle + i * angleStep;
        const r = v * radius;
        return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
      })
      .join(" ");

  // Normalize values to 0–1
  const normalizedValues = axes.map((a) =>
    a.max > 0 ? Math.min(1, a.value / a.max) : 0,
  );

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

      {/* Data polygon fill */}
      <polygon
        points={getPoints(normalizedValues)}
        fill={color}
        fillOpacity={fillOpacity}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />

      {/* Data points */}
      {normalizedValues.map((v, i) => {
        const angle = startAngle + i * angleStep;
        const r = v * radius;
        return (
          <circle
            key={`dot-${i}`}
            cx={cx + r * Math.cos(angle)}
            cy={cy + r * Math.sin(angle)}
            r={2.5}
            fill={color}
            stroke="#18181b"
            strokeWidth={1}
          />
        );
      })}

      {/* Labels */}
      {axes.map((axis, i) => {
        const angle = startAngle + i * angleStep;
        const lx = cx + labelRadius * Math.cos(angle);
        const ly = cy + labelRadius * Math.sin(angle);

        // Determine text anchor based on position
        let anchor: string = "middle";
        if (Math.cos(angle) > 0.3) anchor = "start";
        else if (Math.cos(angle) < -0.3) anchor = "end";

        const displayVal = axis.displayValue ?? (axis.value > 0 ? Math.round(axis.value).toString() : "—");

        return (
          <g key={`label-${i}`}>
            <text
              x={lx}
              y={ly - (showValues ? 4 : 0)}
              textAnchor={anchor}
              dominantBaseline="middle"
              className="fill-zinc-500"
              style={{ fontSize: "8px", fontFamily: "monospace" }}
            >
              {axis.label}
            </text>
            {showValues && (
              <text
                x={lx}
                y={ly + 8}
                textAnchor={anchor}
                dominantBaseline="middle"
                style={{ fontSize: "9px", fontFamily: "monospace", fill: color, fontWeight: 600 }}
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
