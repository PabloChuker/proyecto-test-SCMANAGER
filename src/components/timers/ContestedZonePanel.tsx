"use client";
import { useCountdownTimer } from "@/hooks/useCountdownTimer";
import { useTranslations } from "next-intl";

const PRINTER_MS = 30 * 60 * 1000;
const VAULT_OPEN_MS = 1 * 60 * 1000;
const VAULT_CYCLE_MS = 21 * 60 * 1000;

function formatMM_SS(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ── Individual printer timer card ──────────────────────────────────────────
function PrinterCard({ id, label }: { id: string; label: string }) {
  const t = useTranslations("Timers.cz");
  const { remaining, isRunning, isReady, start, reset } = useCountdownTimer(
    id,
    PRINTER_MS
  );
  const elapsed = PRINTER_MS - remaining;
  const fillPct = isRunning ? (elapsed / PRINTER_MS) * 100 : 0;

  return (
    <div
      className={`bg-zinc-900/60 border rounded p-3 flex flex-col gap-2 transition-colors ${
        isReady
          ? "border-emerald-500/40"
          : isRunning
          ? "border-amber-500/20"
          : "border-zinc-800/50"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-zinc-500 uppercase tracking-[0.1em]">
          {label}
        </span>
        {isReady && (
          <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">
            {t("ready")}
          </span>
        )}
      </div>

      <div
        className={`text-2xl font-mono font-bold text-center tracking-tight ${
          isReady
            ? "text-emerald-400"
            : isRunning
            ? "text-amber-400"
            : "text-zinc-700"
        }`}
      >
        {isRunning || isReady ? formatMM_SS(remaining) : "--:--"}
      </div>

      {isRunning && (
        <div className="h-0.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-500/60 transition-all duration-1000"
            style={{ width: `${fillPct}%` }}
          />
        </div>
      )}

      <div className="flex gap-1">
        <button
          onClick={start}
          disabled={isRunning}
          className={`flex-1 py-1 text-[10px] uppercase tracking-wider rounded transition-colors ${
            isRunning
              ? "bg-zinc-800/20 text-zinc-700 cursor-not-allowed border border-zinc-800/30"
              : "bg-amber-600/15 hover:bg-amber-600/25 border border-amber-500/30 text-amber-400"
          }`}
        >
          {t("startTimer")}
        </button>
        <button
          onClick={reset}
          className="px-2 py-1 text-[10px] uppercase tracking-wider rounded bg-zinc-800/40 hover:bg-zinc-700/50 border border-zinc-700/40 text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          {t("resetTimer")}
        </button>
      </div>
    </div>
  );
}

// ── Vault door card ────────────────────────────────────────────────────────
function VaultCard() {
  const t = useTranslations("Timers.cz");
  const { remaining, isRunning, isReady, start, reset } = useCountdownTimer(
    "vault-door",
    VAULT_CYCLE_MS
  );

  // First minute → OPEN, remaining 20 → CLOSED
  const isOpen = isRunning && remaining > VAULT_CYCLE_MS - VAULT_OPEN_MS;
  const isClosed = isRunning && !isOpen;

  return (
    <div
      className={`bg-zinc-900 border rounded-lg p-4 ${
        isOpen
          ? "border-emerald-500/30"
          : isClosed
          ? "border-red-500/20"
          : "border-zinc-800/50"
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-zinc-400 uppercase tracking-[0.1em]">
          {t("vaultDoor")}
        </span>
        <span
          className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${
            isOpen
              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
              : isClosed
              ? "bg-red-500/10 text-red-400 border-red-500/20"
              : "bg-zinc-800/50 text-zinc-600 border-zinc-700/40"
          }`}
        >
          {isOpen ? t("vaultOpen") : isClosed ? t("vaultClosed") : "—"}
        </span>
      </div>

      <div
        className={`text-4xl font-mono font-bold text-center mb-2 tracking-tight ${
          isOpen ? "text-emerald-400" : isClosed ? "text-red-400" : "text-zinc-700"
        }`}
      >
        {isRunning || isReady ? formatMM_SS(remaining) : "--:--"}
      </div>

      <p className="text-[10px] text-zinc-600 text-center mb-3">
        {t("vaultCycle")}
      </p>

      <div className="flex gap-2">
        <button
          onClick={start}
          disabled={isRunning}
          className={`flex-1 py-1.5 text-[10px] uppercase tracking-wider rounded transition-colors ${
            isRunning
              ? "bg-zinc-800/20 text-zinc-700 cursor-not-allowed border border-zinc-800/30"
              : "bg-amber-600/15 hover:bg-amber-600/25 border border-amber-500/30 text-amber-400"
          }`}
        >
          {t("syncVault")}
        </button>
        <button
          onClick={reset}
          className="px-3 py-1.5 text-[10px] uppercase tracking-wider rounded bg-zinc-800/40 hover:bg-zinc-700/50 border border-zinc-700/40 text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          {t("resetTimer")}
        </button>
      </div>
    </div>
  );
}

// ── Station card ───────────────────────────────────────────────────────────
function StationCard({
  stationKey,
  printerCount,
}: {
  stationKey: "checkmate" | "orbituary" | "ruin";
  printerCount: number;
}) {
  const t = useTranslations("Timers.cz");
  return (
    <div className="bg-zinc-900 border border-zinc-800/50 rounded-lg p-4">
      <h3 className="text-xs text-amber-400 tracking-[0.12em] uppercase mb-3">
        {t(stationKey)}
      </h3>
      <div className="space-y-2">
        {Array.from({ length: printerCount }, (_, i) => (
          <PrinterCard
            key={i}
            id={`${stationKey}-printer-${i + 1}`}
            label={`${t("printer")} ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

// ── Panel root ─────────────────────────────────────────────────────────────
export default function ContestedZonePanel() {
  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StationCard stationKey="checkmate" printerCount={4} />
        <StationCard stationKey="orbituary" printerCount={2} />
        <StationCard stationKey="ruin" printerCount={3} />
      </div>
      <VaultCard />
    </div>
  );
}
