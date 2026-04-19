"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";

// -------------------------------------------------------------
// Tipos de datos del API
// -------------------------------------------------------------
type ScheduleData = {
  intervalMinutes: number;
  openDurationMinutes: number;
  anchorUtc: string;
  anchorCycleNumber: number | null;
  gameVersion: string;
  source: string;
  notes?: string | null;
};

type CycleState = {
  isOpen: boolean;
  cycleNumber: number;
  // ms hasta el proximo evento (cierre si abierto, apertura si cerrado)
  msUntilNextChange: number;
  openAt: Date;      // apertura del ciclo actual o proximo
  closeAt: Date;     // cierre del ciclo actual
  // para el progress bar
  elapsedMs: number;
  totalMs: number;
};

function computeState(data: ScheduleData, now: Date): CycleState {
  const anchor = new Date(data.anchorUtc).getTime();
  const intervalMs = data.intervalMinutes * 60_000;
  const openMs = data.openDurationMinutes * 60_000;
  const diffMs = now.getTime() - anchor;

  // Numero de ciclos desde el anchor (redondeado hacia abajo)
  const cyclesSinceAnchor = Math.floor(diffMs / intervalMs);
  const cycleNumber = (data.anchorCycleNumber ?? 0) + cyclesSinceAnchor;

  // Momento en el que se abrio el ciclo actual
  const currentCycleOpen = anchor + cyclesSinceAnchor * intervalMs;
  const currentCycleClose = currentCycleOpen + openMs;
  const nextCycleOpen = currentCycleOpen + intervalMs;

  const msSinceOpen = now.getTime() - currentCycleOpen;
  const isOpen = msSinceOpen < openMs;

  let msUntilNextChange: number;
  let totalMs: number;
  let elapsedMs: number;
  if (isOpen) {
    msUntilNextChange = currentCycleClose - now.getTime();
    totalMs = openMs;
    elapsedMs = msSinceOpen;
  } else {
    msUntilNextChange = nextCycleOpen - now.getTime();
    totalMs = intervalMs - openMs; // ventana cerrada
    elapsedMs = msSinceOpen - openMs;
  }

  return {
    isOpen,
    cycleNumber,
    msUntilNextChange,
    openAt: isOpen ? new Date(currentCycleOpen) : new Date(nextCycleOpen),
    closeAt: new Date(currentCycleClose),
    elapsedMs,
    totalMs,
  };
}

function formatCountdown(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

function formatTime(d: Date, locale: string, tz: "local" | "utc"): string {
  return d.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: tz === "utc" ? "UTC" : undefined,
  });
}

function formatDateTime(d: Date, locale: string, tz: "local" | "utc"): string {
  return d.toLocaleString(locale, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz === "utc" ? "UTC" : undefined,
  });
}

// -------------------------------------------------------------
// Componente principal
// -------------------------------------------------------------
export default function HangarExecutiveClient() {
  const t = useTranslations("HangarExecutive");
  const locale = useLocale();
  const [data, setData] = useState<ScheduleData | null>(null);
  const [source, setSource] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());
  const [tz, setTz] = useState<"local" | "utc">("local");

  // Fetch inicial
  useEffect(() => {
    let alive = true;
    fetch("/api/hangar-executive")
      .then((r) => r.json())
      .then((res) => {
        if (!alive) return;
        if (res.error) {
          setError(res.error);
          return;
        }
        setData(res.data);
        setSource(res.source);
      })
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, []);

  // Tick cada segundo
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const state = useMemo<CycleState | null>(() => {
    if (!data) return null;
    return computeState(data, now);
  }, [data, now]);

  // Siguientes 4 aperturas
  const upcoming = useMemo(() => {
    if (!data || !state) return [];
    const anchor = new Date(data.anchorUtc).getTime();
    const intervalMs = data.intervalMinutes * 60_000;
    // ciclo actual es state.cycleNumber; si esta abierto el ciclo actual
    // ya abrio, queremos los proximos 4 despues del actual. Si esta cerrado,
    // el proximo es state.openAt.
    const startCycle = state.isOpen ? state.cycleNumber + 1 : state.cycleNumber + 1;
    const list: { n: number; openAt: Date; closeAt: Date }[] = [];
    for (let i = 0; i < 4; i++) {
      const cycleN = startCycle + i;
      const openAt = new Date(
        anchor + (cycleN - (data.anchorCycleNumber ?? 0)) * intervalMs,
      );
      const closeAt = new Date(openAt.getTime() + data.openDurationMinutes * 60_000);
      list.push({ n: cycleN, openAt, closeAt });
    }
    return list;
  }, [data, state]);

  if (error) {
    return (
      <div className="rounded border border-red-500/30 bg-red-500/10 p-6 text-red-300">
        {t("error", { message: error })}
      </div>
    );
  }

  if (!data || !state) {
    return (
      <div className="flex items-center justify-center py-24 text-zinc-500">
        <div className="animate-pulse">{t("loading")}</div>
      </div>
    );
  }

  const percent = Math.min(100, Math.max(0, (state.elapsedMs / state.totalMs) * 100));

  return (
    <div className="space-y-6">
      {/* HEADER + description */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-light tracking-wide text-amber-400">
            {t("title")}
          </h1>
          <p className="mt-2 text-sm text-zinc-400 max-w-xl">{t("description")}</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => setTz(tz === "local" ? "utc" : "local")}
            className="px-3 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800/40 transition"
          >
            {tz === "local" ? t("showUtc") : t("showLocal")}
          </button>
          <div className="text-zinc-500">
            {t("version", { version: data.gameVersion })}
          </div>
        </div>
      </div>

      {/* MAIN CARD */}
      <div
        className={`rounded-lg border p-6 transition-colors ${
          state.isOpen
            ? "border-emerald-500/40 bg-emerald-500/5"
            : "border-amber-500/30 bg-amber-500/5"
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div
              className={`text-sm uppercase tracking-[0.2em] ${
                state.isOpen ? "text-emerald-400" : "text-amber-400"
              }`}
            >
              {state.isOpen ? t("statusOpen") : t("statusClosed")}
            </div>
            <div className="mt-2 text-6xl font-mono font-light tabular-nums text-zinc-50">
              {formatCountdown(state.msUntilNextChange)}
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              {state.isOpen ? t("untilClose") : t("untilOpen")}
            </div>
          </div>
          <div className="text-right text-sm space-y-1">
            <div className="text-zinc-500">
              {t("cycleNumber", { n: state.cycleNumber })}
            </div>
            <div className="text-zinc-300">
              {state.isOpen ? t("closesAt") : t("opensAt")}:{" "}
              <span className="font-mono text-zinc-100">
                {formatTime(
                  state.isOpen ? state.closeAt : state.openAt,
                  locale,
                  tz,
                )}
              </span>
            </div>
            <div className="text-xs text-zinc-500">
              {tz === "local" ? t("localTime") : t("utcTime")}
            </div>
          </div>
        </div>

        {/* progress */}
        <div className="mt-6 h-2 rounded-full bg-zinc-800 overflow-hidden">
          <div
            className={`h-full transition-all duration-1000 ${
              state.isOpen ? "bg-emerald-500" : "bg-amber-500"
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-[10px] uppercase tracking-wider text-zinc-500">
          <span>
            {t("openDuration", { n: data.openDurationMinutes })}
          </span>
          <span>
            {t("closedDuration", {
              n: data.intervalMinutes - data.openDurationMinutes,
            })}
          </span>
          <span>
            {t("interval", { n: data.intervalMinutes })}
          </span>
        </div>
      </div>

      {/* UPCOMING CYCLES */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
        <div className="text-xs uppercase tracking-[0.2em] text-zinc-500 mb-3">
          {t("upcomingTitle")}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {upcoming.map((u) => (
            <div
              key={u.n}
              className="rounded border border-zinc-800/70 bg-zinc-900/60 p-3"
            >
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                {t("cycleNumber", { n: u.n })}
              </div>
              <div className="mt-1 font-mono text-sm text-zinc-100">
                {formatDateTime(u.openAt, locale, tz)}
              </div>
              <div className="mt-0.5 text-[11px] text-zinc-500">
                → {formatTime(u.closeAt, locale, tz)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* TECH INFO */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4 text-xs text-zinc-500">
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span>
            {t("sourceLabel")}:{" "}
            <span className="text-zinc-400">{data.source}</span>
          </span>
          <span>
            {t("intervalLabel")}:{" "}
            <span className="text-zinc-400">
              {data.intervalMinutes}m ({data.openDurationMinutes}m
              {" "}{t("openShort")} / {data.intervalMinutes - data.openDurationMinutes}m
              {" "}{t("closedShort")})
            </span>
          </span>
          {source !== "db" && (
            <span className="text-amber-500">
              {t("fallbackWarn")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
