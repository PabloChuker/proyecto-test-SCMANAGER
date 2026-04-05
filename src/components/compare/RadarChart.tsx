"use client";
// =============================================================================
// SC LABS — Radar Chart (SVG) for ship comparison
// Renders an overlapping polygon chart for up to 3 ships
// =============================================================================

interface RadarAxis {
  key: string;
  label: string;
  max: number;
}

interface RadarDataset {
  label: string;
  values: Record<string, number>;
  color: string;
}

interface RadarChartProps {
  axes: RadarAxis[];
  datasets: RadarDataset[];
  size?: number;
}

export function RadarChart({ axes, datasets, size = 300 }: RadarChartProps) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.38;
  const levels = 4;

  const angleStep = (2 * Math.PI) / axes.length;
  const startAngle = -Math.PI / 2; // Start from top

  function getPoint(axisIndex: number, value: number, max: number): [number, number] {
    const angle = startAngle + axisIndex * angleStep;
    const r = (value / Math.max(max, 1)) * radius;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  }

  // Grid circles
  const gridCircles = Array.from({ length: levels }, (_, i) => {
    const r = ((i + 1) / levels) * radius;
    const points = axes.map((_, j) => {
      const angle = startAngle + j * angleStep;
      return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
    });
    return points.join(" ");
  });

  // Axis lines
  const axisLines = axes.map((_, i) => {
    const angle = startAngle + i * angleStep;
    return {
      x2: cx + radius * Math.cos(angle),
      y2: cy + radius * Math.sin(angle),
    };
  });

  // Labels
  const labels = axes.map((axis, i) => {
    const angle = startAngle + i * angleStep;
    const labelR = radius + 24;
    const x = cx + labelR * Math.cos(angle);
    const y = cy + labelR * Math.sin(angle);
    return { x, y, text: axis.label };
  });

  // Dataset polygons
  const polygons = datasets.map((ds) => {
    const points = axes.map((axis, i) => {
      const val = ds.values[axis.key] || 0;
      const [px, py] = getPoint(i, val, axis.max);
      return `${px},${py}`;
    });
    return { points: points.join(" "), color: ds.color, label: ds.label };
  });

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Grid */}
        {gridCircles.map((pts, i) => (
          <polygon
            key={`grid-${i}`}
            points={pts}
            fill="none"
            stroke="rgb(63,63,70)"
            strokeWidth={0.5}
            strokeDasharray={i < levels - 1 ? "2,3" : "none"}
          />
        ))}

        {/* Axis lines */}
        {axisLines.map((line, i) => (
          <line
            key={`axis-${i}`}
            x1={cx}
            y1={cy}
            x2={line.x2}
            y2={line.y2}
            stroke="rgb(63,63,70)"
            strokeWidth={0.5}
          />
        ))}

        {/* Data polygons */}
        {polygons.map((poly, i) => (
          <g key={`poly-${i}`}>
            <polygon
              points={poly.points}
              fill={poly.color}
              fillOpacity={0.15}
              stroke={poly.color}
              strokeWidth={1.5}
            />
            {/* Data points */}
            {axes.map((axis, j) => {
              const val = datasets[i].values[axis.key] || 0;
              const [px, py] = getPoint(j, val, axis.max);
              return (
                <circle
                  key={`dot-${i}-${j}`}
                  cx={px}
                  cy={py}
                  r={3}
                  fill={poly.color}
                  stroke="rgb(24,24,27)"
                  strokeWidth={1}
                />
              );
            })}
          </g>
        ))}

        {/* Labels */}
        {labels.map((lbl, i) => (
          <text
            key={`lbl-${i}`}
            x={lbl.x}
            y={lbl.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="rgb(161,161,170)"
            fontSize={10}
            fontFamily="system-ui"
          >
            {lbl.text}
          </text>
        ))}
      </svg>

      {/* Legend */}
      <div className="flex gap-4 mt-3">
        {datasets.map((ds) => (
          <div key={ds.label} className="flex items-center gap-1.5 text-xs text-zinc-400">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: ds.color }} />
            {ds.label}
          </div>
        ))}
      </div>
    </div>
  );
}
