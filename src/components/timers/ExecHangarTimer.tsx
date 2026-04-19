"use client";
import { useExecTimer } from "@/hooks/useExecTimer";
import { useTranslations } from "next-intl";

function formatTime(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const GREEN_FRACTION = 65 / 185;

export default function ExecHangarTimer() {
  const t = useTranslations("Timers.hangar");
  const {
    phase,
    remaining,
    cycleProgress,
    phaseProgress,
    offsetMs,
    mounted,
    adjustOffset,
    resetOffset,
  } = useExecTimer();

  const isOnline = phase === "GREEN";
  const offsetMinutes = Math.round(offsetMs / 60000);
  const leds = Array.from({ length: 5 }, (_, i) => phaseProgress >= (i + 1) / 5);

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* ── Main phase card ── */}
      <div
        className={`bg-zinc-900 border rounded-lg p-6 text-center ${
          isOnline ? "border-emerald-500/30" : "border-red-500/30"
        }`}
      >
        {/* Phase badge */}
        <div className="flex items-center justify-center gap-2 mb-4">
          <span
            className={`w-2.5 h-2.5 rounded-full animate-pulse ${
              isOnline ? "bg-emerald-400" : "bg-red-400"
            }`}
          />
          <span
            className={`px-3 py-1 rounded-full text-xs tracking-[0.15em] uppercase font-medium border ${
              isOnline
                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                : "bg-red-500/15 text-red-400 border-red-500/30"
            }`}
          >
            {isOnline ? t("online") : t("offline")}
          </span>
        </div>

        {/* Countdown */}
        <div
          className={`text-6xl font-mono font-bold tracking-tight mb-1 ${
            isOnline ? "text-emerald-400" : "text-red-400"
          }`}
        >
          {mounted ? formatTime(remaining) : "--:--"}
        </div>
        <div className="text-[10px] text-zinc-600 tracking-[0.12em] uppercase mb-6">
          {t("remaining")}
        </div>

        {/* Phase progress bar */}
        <div className="mb-1">
          <div className="flex justify-between text-[10px] text-zinc-600 mb-1.5">
            <span>{isOnline ? t("greenPhase") : t("redPhase")}</span>
            <span>{Math.round(phaseProgress * 100)}%</span>
          </div>
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${
                isOnline ? "bg-emerald-500/70" : "bg-red-500/70"
              }`}
              style={{ width: `${phaseProgress * 100}%` }}
            />
          </div>
        </div>

        {/* LED indicators */}
        <div className="flex justify-center gap-2.5 mt-5">
          {leds.map((on, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full border transition-all duration-500 ${
                on
                  ? isOnline
                    ? "bg-emerald-400 border-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]"
                    : "bg-red-400 border-red-400 shadow-[0_0_8px_rgba(248,113,113,0.5)]"
                  : "bg-zinc-800 border-zinc-700"
              }`}
            />
          ))}
        </div>
      </div>

      {/* ── Full cycle progress ── */}
      <div className="bg-zinc-900 border border-zinc-800/50 rounded-lg p-4">
        <div className="flex justify-between text-[10px] text-zinc-500 uppercase tracking-[0.1em] mb-2">
          <span>{t("cycleDuration")}</span>
          <span>{Math.round(cycleProgress * 100)}%</span>
        </div>
        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden flex">
          {/* GREEN segment */}
          <div
            className="h-full bg-emerald-600/50 flex-shrink-0"
            style={{ width: `${GREEN_FRACTION * 100}%` }}
          />
          {/* RED segment */}
          <div
            className="h-full bg-red-600/40 flex-shrink-0"
            style={{ width: `${(1 - GREEN_FRACTION) * 100}%` }}
          />
        </div>
        {/* Cursor */}
        <div className="relative h-1 mt-0.5">
          <div
            className={`absolute top-0 w-0.5 h-1.5 -mt-0.5 rounded-full transition-all duration-1000 ${
              isOnline ? "bg-emerald-400" : "bg-red-400"
            }`}
            style={{ left: `calc(${cycleProgress * 100}% - 1px)` }}
          />
        </div>
        <div className="flex justify-between mt-1 text-[10px] text-zinc-700">
          <span>0m</span>
          <span className="text-emerald-700/60">65m</span>
          <span>185m</span>
        </div>
      </div>

      {/* ── Offset sync ── */}
      <div className="bg-zinc-900 border border-zinc-800/50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-zinc-400 tracking-[0.1em] uppercase">
            {t("syncOffset")}
          </span>
          {offsetMs !== 0 && (
            <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
              {offsetMinutes > 0 ? "+" : ""}
              {offsetMinutes}m
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 justify-center flex-wrap">
          {(
            [
              { label: "−1m", delta: -60000 },
              { label: "−10s", delta: -10000 },
            ] as const
          ).map(({ label, delta }) => (
            <button
              key={label}
              onClick={() => adjustOffset(delta)}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/60 text-zinc-300 text-xs rounded transition-colors"
            >
              {label}
            </button>
          ))}
          <button
            onClick={resetOffset}
            className="px-3 py-1.5 bg-zinc-800/50 hover:bg-zinc-700 border border-zinc-700/60 text-zinc-500 text-[10px] tracking-wider uppercase rounded transition-colors"
          >
            {t("resetBtn")}
          </button>
          {(
            [
              { label: "+10s", delta: 10000 },
              { label: "+1m", delta: 60000 },
            ] as const
          ).map(({ label, delta }) => (
            <button
              key={label}
              onClick={() => adjustOffset(delta)}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/60 text-zinc-300 text-xs rounded transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-zinc-700 text-center mt-3 leading-relaxed max-w-sm mx-auto">
          {t("hint")}
        </p>
      </div>
    </div>
  );
}
