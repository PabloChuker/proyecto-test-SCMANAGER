// =============================================================================
// AL FILO — StatGauge Component
// Gauge visual para estadísticas computadas. Soporta modos:
//   - "bar": barra horizontal con fill animado
//   - "value": solo el número grande con label
//   - "balance": barra centrada (para power balance, puede ser negativo)
// =============================================================================

"use client";

interface StatGaugeProps {
  label: string;
  value: number;
  unit?: string;
  mode?: "bar" | "value" | "balance";
  /** Para modo "bar": valor máximo para calcular el porcentaje */
  maxValue?: number;
  /** Color del acento (hex) */
  color?: string;
  /** Ícono decorativo (carácter unicode) */
  icon?: string;
  /** Tamaño: "sm" para inline, "lg" para destacado */
  size?: "sm" | "lg";
}

export function StatGauge({
  label,
  value,
  unit = "",
  mode = "value",
  maxValue = 100,
  color = "#06b6d4",
  icon,
  size = "sm",
}: StatGaugeProps) {
  const isLarge = size === "lg";
  const displayValue = formatStatValue(value);

  if (mode === "balance") {
    return <BalanceGauge label={label} value={value} unit={unit} color={color} icon={icon} isLarge={isLarge} />;
  }

  if (mode === "bar") {
    const pct = maxValue > 0 ? Math.min(100, (value / maxValue) * 100) : 0;

    return (
      <div className={`${isLarge ? "p-4" : "p-3"} rounded-sm bg-zinc-900/40 border border-zinc-800/40`}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] tracking-[0.15em] uppercase text-zinc-500 flex items-center gap-1.5">
            {icon && <span style={{ color }} className="text-xs opacity-70">{icon}</span>}
            {label}
          </span>
          <span className={`font-mono ${isLarge ? "text-base" : "text-sm"} text-zinc-200`}>
            {displayValue}
            {unit && <span className="text-zinc-600 text-[10px] ml-1">{unit}</span>}
          </span>
        </div>
        <div className="h-1 w-full bg-zinc-800/60 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${pct}%`,
              background: `linear-gradient(90deg, ${color}88, ${color})`,
              boxShadow: `0 0 8px ${color}40`,
            }}
          />
        </div>
      </div>
    );
  }

  // mode === "value"
  return (
    <div className={`
      ${isLarge ? "p-5" : "p-3"} rounded-sm bg-zinc-900/40 border border-zinc-800/40
      group hover:border-zinc-700/50 transition-colors duration-200
    `}>
      <div className="flex items-center gap-1.5 mb-1">
        {icon && <span style={{ color }} className="text-xs opacity-60">{icon}</span>}
        <span className="text-[10px] tracking-[0.15em] uppercase text-zinc-500">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className={`font-mono ${isLarge ? "text-2xl" : "text-lg"} font-light`}
          style={{ color }}
        >
          {displayValue}
        </span>
        {unit && (
          <span className="text-[10px] text-zinc-600 tracking-wide">{unit}</span>
        )}
      </div>
    </div>
  );
}

// ── Balance gauge: barra centrada que muestra positivo/negativo ──
function BalanceGauge({
  label, value, unit, color, icon, isLarge,
}: {
  label: string; value: number; unit: string; color: string;
  icon?: string; isLarge: boolean;
}) {
  const isPositive = value >= 0;
  const barColor = isPositive ? "#22c55e" : "#ef4444";
  // Clamp visual a ±100% desde el centro
  const pct = Math.min(50, Math.abs(value) / (Math.abs(value) + 100) * 50);

  return (
    <div className={`${isLarge ? "p-5" : "p-3"} rounded-sm bg-zinc-900/40 border border-zinc-800/40`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] tracking-[0.15em] uppercase text-zinc-500 flex items-center gap-1.5">
          {icon && <span style={{ color }} className="text-xs opacity-70">{icon}</span>}
          {label}
        </span>
        <span className={`font-mono ${isLarge ? "text-base" : "text-sm"} font-light`}
              style={{ color: barColor }}>
          {isPositive ? "+" : ""}{formatStatValue(value)}
          {unit && <span className="text-zinc-600 text-[10px] ml-1">{unit}</span>}
        </span>
      </div>

      {/* Barra centrada */}
      <div className="relative h-1.5 w-full bg-zinc-800/60 rounded-full overflow-hidden">
        {/* Línea central */}
        <div className="absolute left-1/2 top-0 w-px h-full bg-zinc-600/50 -translate-x-px z-10" />

        {/* Fill */}
        <div
          className="absolute top-0 h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${pct}%`,
            ...(isPositive
              ? { left: "50%", background: `linear-gradient(90deg, ${barColor}88, ${barColor})` }
              : { right: "50%", left: `${50 - pct}%`, background: `linear-gradient(90deg, ${barColor}, ${barColor}88)` }
            ),
            boxShadow: `0 0 10px ${barColor}30`,
          }}
        />
      </div>

      <div className="flex justify-between mt-1.5 text-[9px] text-zinc-700 tracking-wide">
        <span>DÉFICIT</span>
        <span>BALANCE</span>
        <span>SURPLUS</span>
      </div>
    </div>
  );
}

// ── Formatter ──
function formatStatValue(val: number): string {
  if (val === 0) return "0";
  if (Math.abs(val) >= 10000) return `${(val / 1000).toFixed(1)}k`;
  if (Math.abs(val) >= 1000) return `${(val / 1000).toFixed(2)}k`;
  if (Number.isInteger(val)) return val.toString();
  return val.toFixed(1);
}
