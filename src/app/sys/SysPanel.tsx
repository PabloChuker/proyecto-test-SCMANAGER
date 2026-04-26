"use client";

import { useState, useTransition } from "react";
import { setMaintenanceMode } from "./actions";

interface Props {
  initialMaintenance: boolean;
}

export default function SysPanel({ initialMaintenance }: Props) {
  const [maintenance, setMaintenance] = useState(initialMaintenance);
  const [isPending, startTransition] = useTransition();

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

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-start p-6 pt-16 gap-8">
      <div className="w-full max-w-sm space-y-2">
        <h1 className="text-xl font-bold text-zinc-100 tracking-wider">Panel de Sistema</h1>
        <p className="text-xs text-zinc-500">Solo visible para administradores</p>
      </div>

      {/* Maintenance toggle */}
      <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
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

      {/* Status indicator */}
      <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900 p-5">
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
