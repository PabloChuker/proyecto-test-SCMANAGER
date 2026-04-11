"use client";
// =============================================================================
// SC LABS — Compare Bar Chart v2
// Clean stat-row style: thin colored bars with values on the right.
// Each ship gets a row with name, thin bar, and numeric value.
// =============================================================================

interface BarEntry {
  label: string;
  value: number;
  color: string;
}

interface CompareBarChartProps {
  title: string;
  unit?: string;
  entries: BarEntry[];
  maxValue?: number;
}

export function CompareBarChart({ title, unit = "", entries, maxValue }: CompareBarChartProps) {
  const max = maxValue || Math.max(...entries.map((e) => e.value), 1);
  const bestVal = Math.max(...entries.map((e) => e.value));
  const allZero = entries.every((e) => e.value === 0);

  return (
    <div className="group">
      {/* Title row */}
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[11px] font-medium tracking-wide uppercase text-zinc-400">
          {title}
        </span>
        {unit && (
          <span className="text-[10px] text-zinc-600 font-mono">{unit}</span>
        )}
      </div>

      {/* Stat rows */}
      <div className="space-y-1">
        {entries.map((entry) => {
          const pct = allZero ? 0 : (entry.value / max) * 100;
          const isBest = entry.value === bestVal && !allZero && entries.length > 1;

          return (
            <div key={entry.label} className="flex items-center gap-2">
              {/* Ship name — fixed width, right-aligned */}
              <div
                className="w-[72px] shrink-0 text-[10px] text-right truncate"
                style={{ color: entry.color }}
                title={entry.label}
              >
                {shortenName(entry.label)}
              </div>

              {/* Bar track */}
              <div className="flex-1 h-[6px] bg-zinc-900/80 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${Math.max(pct, 0.5)}%`,
                    backgroundColor: entry.color,
                    opacity: isBest ? 1 : 0.6,
                  }}
                />
              </div>

              {/* Value */}
              <div
                className={`w-[56px] shrink-0 text-right text-[11px] font-mono tabular-nums ${
                  isBest ? "font-semibold" : "text-zinc-400"
                }`}
                style={isBest ? { color: entry.color } : {}}
              >
                {entry.value === 0 ? "—" : formatValue(entry.value)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Shorten "Aegis Avenger Titan" → "Avenger Titan" for compact display */
function shortenName(name: string): string {
  const parts = name.split(" ");
  if (parts.length > 2) return parts.slice(1).join(" ");
  return name;
}

function formatValue(v: number): string {
  if (v >= 1000000) return (v / 1000000).toFixed(1) + "M";
  if (v >= 10000) return (v / 1000).toFixed(1) + "k";
  if (v >= 1000) return v.toLocaleString();
  if (Number.isInteger(v)) return v.toString();
  return v.toFixed(1);
}
