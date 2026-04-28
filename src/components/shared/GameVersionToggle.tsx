"use client";

// =============================================================================
// SC Labs — Game Version Toggle (Header)
//
// Pill compacta LIVE / PTU. El user clickea el branch que NO está activo
// para alternar. Muestra la versión específica (ej. "LIVE 4.7.2" / "PTU
// 4.7.3-PTU").
//
// El estado vive en useGameVersionStore (persistido en localStorage). Cada
// módulo del proyecto que toque tablas con `game_version` debe usar el
// helper `useGameVersionParam()` para concatenar `?gv=...` a sus fetches.
//
// Si no hay PTU activo en BD, el botón PTU queda disabled con tooltip.
// =============================================================================

import { useEffect } from "react";
import { useGameVersionStore } from "@/store/useGameVersionStore";

export default function GameVersionToggle() {
  const branch = useGameVersionStore((s) => s.branch);
  const liveVersion = useGameVersionStore((s) => s.liveVersion);
  const ptuVersion = useGameVersionStore((s) => s.ptuVersion);
  const versionsLoaded = useGameVersionStore((s) => s.versionsLoaded);
  const setBranch = useGameVersionStore((s) => s.setBranch);
  const fetchVersions = useGameVersionStore((s) => s.fetchVersions);

  // Cargar las versiones al mount. El componente del Header monta una sola
  // vez por sesión, así que esto se ejecuta solo una vez.
  useEffect(() => {
    if (!versionsLoaded) {
      fetchVersions();
    }
  }, [versionsLoaded, fetchVersions]);

  const ptuAvailable = !!ptuVersion;

  return (
    <div
      className="hidden md:flex items-center h-7 rounded-sm bg-zinc-900/60 border border-zinc-800/60 overflow-hidden text-[9px] font-mono uppercase tracking-widest"
      role="group"
      aria-label="Game version branch"
    >
      {/* LIVE — siempre disponible */}
      <button
        type="button"
        onClick={() => setBranch("LIVE")}
        className={`flex items-center gap-1.5 h-full px-2 transition-colors cursor-pointer ${
          branch === "LIVE"
            ? "bg-emerald-500/20 text-emerald-300"
            : "text-zinc-500 hover:text-zinc-300"
        }`}
        title={liveVersion ? `LIVE ${liveVersion}` : "Versión LIVE actual"}
        aria-pressed={branch === "LIVE"}
      >
        <span>Live</span>
        {liveVersion && (
          <span className={branch === "LIVE" ? "text-emerald-200/80" : "text-zinc-600"}>
            {liveVersion}
          </span>
        )}
      </button>

      {/* Divider */}
      <span className="block w-px h-4 bg-zinc-800/80" />

      {/* PTU — disabled si no hay versión PTU activa en BD */}
      <button
        type="button"
        onClick={() => ptuAvailable && setBranch("PTU")}
        disabled={!ptuAvailable}
        className={`flex items-center gap-1.5 h-full px-2 transition-colors ${
          !ptuAvailable
            ? "text-zinc-700 cursor-not-allowed"
            : branch === "PTU"
              ? "bg-amber-500/20 text-amber-300 cursor-pointer"
              : "text-zinc-500 hover:text-zinc-300 cursor-pointer"
        }`}
        title={
          !ptuAvailable
            ? "No hay versión PTU activa en la base de datos"
            : ptuVersion
              ? `PTU ${ptuVersion}`
              : "Versión PTU"
        }
        aria-pressed={branch === "PTU"}
        aria-disabled={!ptuAvailable}
      >
        <span>PTU</span>
        {ptuVersion ? (
          <span className={branch === "PTU" ? "text-amber-200/80" : "text-zinc-600"}>
            {ptuVersion}
          </span>
        ) : (
          <span className="text-zinc-700">—</span>
        )}
      </button>
    </div>
  );
}
