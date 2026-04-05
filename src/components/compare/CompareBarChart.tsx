"use client";
// =============================================================================
// SC LABS — Horizontal Bar Chart for ship stat comparison
// Shows bars for up to 3 ships per metric
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

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium tracking-wider uppercase text-zinc-400">{title}</span>
        {unit && <span className="text-[10px] text-zinc-600">{unit}</span>}
      </div>
      <div className="space-y-1.5">
        {entries.map((entry) => {
          const pct = (entry.value / max) * 100;
          return (
            <div key={entry.label} className="group">
              <div className="flex items-center gap-2">
                <div className="w-20 text-[11px] text-zinc-500 truncate">{entry.label}</div>
                <div className="flex-1 h-5 bg-zinc-900 rounded-sm overflow-hidden relative">
                  <div
                    className="h-full rounded-sm transition-all duration-500"
                    style={{
                      width: `${Math.max(pct, 1)}%`,
                      backgroundColor: entry.color,
                      opacity: 0.8,
                    }}
                  />
                  <span className="absolute right-1.5 top-0 h-full flex items-center text-[10px] font-mono text-zinc-300">
                    {formatValue(entry.value)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatValue(v: number): string {
  if (v === 0) return "—";
  if (v >= 1000000) return (v / 1000000).toFixed(1) + "M";
  if (v >= 10000) return (v / 1000).toFixed(1) + "k";
  if (v >= 1000) return (v / 1000).toFixed(2) + "k";
  if (Number.isInteger(v)) return v.toLocaleString();
  return v.toFixed(1);
}
