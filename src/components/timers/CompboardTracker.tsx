"use client";
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { storageGet, storageSet, storageRemove } from "@/lib/safe-storage";

const STORAGE_KEY = "sc-compboard";

const ITEMS = [
  { id: "chk1", station: "checkmate" },
  { id: "chk2", station: "checkmate" },
  { id: "orb1", station: "orbituary" },
  { id: "orb2", station: "orbituary" },
  { id: "ruin1", station: "ruin" },
  { id: "ruin2", station: "ruin" },
  { id: "ruin3", station: "ruin" },
] as const;

const STATION_COLOR = {
  checkmate: "text-cyan-400",
  orbituary: "text-violet-400",
  ruin: "text-orange-400",
} as const;

export default function CompboardTracker() {
  const t = useTranslations("Timers.compboard");
  const tz = useTranslations("Timers.cz");
  const [collected, setCollected] = useState<Record<string, boolean>>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = storageGet(STORAGE_KEY);
    if (stored) {
      try {
        setCollected(JSON.parse(stored));
      } catch {
        // corrupted storage — ignore
      }
    }
    setMounted(true);
  }, []);

  function toggle(id: string) {
    setCollected((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      storageSet(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  function resetAll() {
    setCollected({});
    storageRemove(STORAGE_KEY);
  }

  const total = ITEMS.length;
  const done = mounted ? ITEMS.filter((i) => collected[i.id]).length : 0;
  const pct = (done / total) * 100;

  return (
    <div className="max-w-lg mx-auto space-y-4">
      {/* Progress header */}
      <div className="bg-zinc-900 border border-zinc-800/50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-amber-400 tracking-[0.12em] uppercase">
            {t("title")}
          </span>
          <span className="text-sm font-mono text-zinc-300">
            {done}/{total}
          </span>
        </div>
        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden mb-1">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              done === total ? "bg-emerald-500/70" : "bg-amber-500/60"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-zinc-600">
          <span>{t("progress")}</span>
          <span>{Math.round(pct)}%</span>
        </div>
      </div>

      {/* Item list */}
      <div className="bg-zinc-900 border border-zinc-800/50 rounded-lg overflow-hidden divide-y divide-zinc-800/40">
        {ITEMS.map((item) => {
          const isCollected = mounted ? !!collected[item.id] : false;
          return (
            <button
              key={item.id}
              onClick={() => toggle(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-800/30 ${
                isCollected ? "opacity-50" : ""
              }`}
            >
              {/* Checkbox */}
              <div
                className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all ${
                  isCollected
                    ? "bg-amber-500/25 border-amber-500/50"
                    : "border-zinc-700 bg-zinc-800/50"
                }`}
              >
                {isCollected && (
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    fill="none"
                  >
                    <path
                      d="M2 5l2.5 2.5L8 3"
                      stroke="rgb(251,191,36)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>

              {/* Label */}
              <span
                className={`flex-1 text-sm ${
                  isCollected
                    ? "line-through text-zinc-600"
                    : "text-zinc-200"
                }`}
              >
                {t(`items.${item.id}`)}
              </span>

              {/* Station tag */}
              <span
                className={`text-[10px] uppercase tracking-wider flex-shrink-0 ${
                  STATION_COLOR[item.station]
                }`}
              >
                {tz(item.station)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Reset */}
      <div className="flex justify-end">
        <button
          onClick={resetAll}
          className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-zinc-600 hover:text-zinc-400 border border-zinc-800 hover:border-zinc-700 rounded transition-colors"
        >
          {t("resetAll")}
        </button>
      </div>
    </div>
  );
}
