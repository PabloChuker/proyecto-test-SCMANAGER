"use client";

import { useState, useTransition } from "react";
import { setMaintenanceMode, runRsiSyncAction, type RsiSyncResponse } from "./actions";

interface Props {
  initialMaintenance: boolean;
  initialLastRsiSyncAt: string | null;
}

function fmtTimestamp(iso: string | null): string {
  if (!iso) return "nunca";
  const d = new Date(iso);
  const now = Date.now();
  const diffMin = Math.floor((now - d.getTime()) / 60_000);
  if (diffMin < 1) return "recién";
  if (diffMin < 60) return `hace ${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `hace ${diffH}h ${diffMin % 60}m`;
  const diffD = Math.floor(diffH / 24);
  return `hace ${diffD}d`;
}

export default function SysPanel({ initialMaintenance, initialLastRsiSyncAt }: Props) {
  const [maintenance, setMaintenance] = useState(initialMaintenance);
  const [isPending, startTransition] = useTransition();

  // ── RSI sync state (CB.6 manual trigger) ───────────────────────────────
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(initialLastRsiSyncAt);
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<RsiSyncResponse | null>(null);

  function toggle() {
    const next = !maintenance;
    setMaintenance(next);
    startTransition(async () => {
      try {
        await setMaintenanceMode(next);
      } catch {
        setMaintenance(!next);
      }
    });
  }

  async function handleRsiSync() {
    setSyncing(true);
    setLastResult(null);
    try {
      const res = await runRsiSyncAction();
      setLastResult(res);
      if (res.ok) {
        setLastSyncAt(new Date().toISOString());
      }
    } catch (e: any) {
      setLastResult({ ok: false, error: e?.message ?? "unknown" });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-start p-6 pt-16 gap-6">
      <div className="w-full max-w-md space-y-2">
        <h1 className="text-xl font-bold text-zinc-100 tracking-wider">Panel de Sistema</h1>
        <p className="text-xs text-zinc-500">Solo visible para administradores</p>
      </div>

      {/* Maintenance toggle */}
      <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-zinc-200">Modo mantenimiento</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              {maintenance ? "Web en mantenimiento (503)" : "Web operativa"}
            </p>
          </div>
          <button
            onClick={toggle}
            disabled={isPending}
            aria-label="Toggle mantenimiento"
            className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
              maintenance ? "bg-red-600" : "bg-zinc-700"
            }`}
          >
            <span
              className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform duration-200 ${
                maintenance ? "translate-x-7" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {maintenance && (
          <div className="rounded-lg bg-red-950/50 border border-red-800/50 px-4 py-3">
            <p className="text-sm text-red-400 font-medium">⚠ Sitio en mantenimiento</p>
            <p className="text-xs text-red-500 mt-1">
              Todos los visitantes ven el mensaje 503. Esta pantalla sigue activa.
            </p>
          </div>
        )}
      </div>

      {/* RSI Sync (CB.6) */}
      <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
        <div>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-zinc-200">Sync RSI Store</p>
            <span className="text-[10px] font-mono text-zinc-500">
              {fmtTimestamp(lastSyncAt)}
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
            Refresca metadata de naves desde RSI ship-matrix (production_status,
            chassis, manufacturer) y bumpea synced_at de ship_prices_canonical.
            Detecta naves nuevas y cambios concept→flight-ready.
          </p>
        </div>

        <button
          onClick={handleRsiSync}
          disabled={syncing}
          className="w-full px-4 py-2.5 bg-cyan-600/20 border border-cyan-500/40 rounded-lg text-cyan-300 text-sm font-medium hover:bg-cyan-600/30 hover:border-cyan-500/60 transition-colors disabled:opacity-50 disabled:cursor-wait flex items-center justify-center gap-2"
        >
          {syncing ? (
            <>
              <span className="w-4 h-4 border-2 border-cyan-500/30 border-t-cyan-300 rounded-full animate-spin" />
              Sincronizando...
            </>
          ) : (
            <>🔄 Refrescar ahora</>
          )}
        </button>

        {/* Resultado del último run */}
        {lastResult && lastResult.ok && lastResult.result && (
          <div className="rounded-lg bg-emerald-950/40 border border-emerald-800/40 px-4 py-3 space-y-1.5">
            <p className="text-sm text-emerald-300 font-medium">
              ✓ Sync completado en {lastResult.result.durationMs}ms
            </p>
            <ul className="text-xs text-emerald-200/80 space-y-0.5">
              <li>
                Ships en ship-matrix:{" "}
                <span className="font-mono">{lastResult.result.matrixFetched}</span>
              </li>
              <li>
                Naves NUEVAS detectadas:{" "}
                <span className="font-mono text-amber-300">
                  {lastResult.result.newShips.length}
                </span>
                {lastResult.result.newShips.length > 0 && (
                  <span className="text-zinc-400 ml-1">
                    ({lastResult.result.newShips.slice(0, 3).join(", ")}
                    {lastResult.result.newShips.length > 3 && "…"})
                  </span>
                )}
              </li>
              <li>
                Cambios production_status:{" "}
                <span className="font-mono text-amber-300">
                  {lastResult.result.statusChanges.length}
                </span>
              </li>
              <li>
                Rows synced_at bumpeadas:{" "}
                <span className="font-mono">{lastResult.result.pricesCanonicalBumped}</span>
              </li>
            </ul>
            {lastResult.result.statusChanges.length > 0 && (
              <details className="text-xs text-emerald-200/70 pt-1">
                <summary className="cursor-pointer hover:text-emerald-100">
                  Ver cambios de status ({lastResult.result.statusChanges.length})
                </summary>
                <ul className="mt-1.5 space-y-0.5 pl-2 font-mono">
                  {lastResult.result.statusChanges.map((c) => (
                    <li key={c.rsiShipId}>
                      <span className="text-zinc-300">{c.shipName}</span>:{" "}
                      <span className="text-zinc-500">{c.oldStatus ?? "?"}</span>
                      {" → "}
                      <span className="text-amber-300">{c.newStatus}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
        {lastResult && !lastResult.ok && (
          <div className="rounded-lg bg-red-950/40 border border-red-800/40 px-4 py-3">
            <p className="text-sm text-red-400 font-medium">✗ Falló</p>
            <p className="text-xs text-red-300 mt-1 font-mono break-all">
              {lastResult.error}
            </p>
          </div>
        )}
      </div>

      {/* Status indicator */}
      <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">Estado</p>
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${maintenance ? "bg-red-500" : "bg-emerald-500"}`} />
          <span className="text-sm text-zinc-300">
            {maintenance ? "Mantenimiento activo" : "Sistema operativo"}
          </span>
        </div>
      </div>
    </main>
  );
}
