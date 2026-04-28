// =============================================================================
// SC Labs — Game Version Store (LIVE / PTU)
//
// Estado global del branch del juego (LIVE/PTU) que el usuario quiere usar.
// Cada módulo del proyecto que toque tablas con `game_version` puede usar
// `useGameVersionParam()` para concatenar `?gv=...` a sus fetches y filtrar
// los datos por la versión activa.
//
// SSR-SAFE: el storage usa noop cuando typeof window === undefined para que
// el render server-side de Next.js no rompa por acceder a localStorage.
//
// REINSTALADO 2026-04-28 (post-incidente): la primera implementación se
// removió por falsa hipótesis de que rompía /loadout (en realidad era un
// bug independiente con hardpoint_type=NULL). Ahora el endpoint del ship
// está estabilizado y podemos avanzar.
// =============================================================================

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type GameBranch = "LIVE" | "PTU";

export interface GameVersionInfo {
  version: string;
  branch: GameBranch;
  label: string;
}

interface GameVersionState {
  branch: GameBranch;
  liveVersion: string | null;
  ptuVersion: string | null;
  versionsLoaded: boolean;
  setBranch: (branch: GameBranch) => void;
  fetchVersions: () => Promise<void>;
}

// Storage SSR-safe: noop en server, localStorage real en client.
const ssrSafeStorage = createJSONStorage(() => {
  if (typeof window === "undefined") {
    return {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
  }
  return localStorage;
});

export const useGameVersionStore = create<GameVersionState>()(
  persist(
    (set, get) => ({
      branch: "LIVE",
      liveVersion: null,
      ptuVersion: null,
      versionsLoaded: false,

      setBranch: (branch) => {
        if (branch === "PTU" && !get().ptuVersion) return;
        if (branch === get().branch) return; // sin cambio, no hacer nada
        set({ branch });
        // Reload para que TODAS las páginas refetcheen con la nueva versión.
        // Es la forma más simple y robusta de propagar el cambio sin tener
        // que invalidar manualmente cada query/store del proyecto. El user
        // hace un click consciente, espera ver datos del otro branch — el
        // reload es esperado.
        if (typeof window !== "undefined") {
          // pequeño delay para que el set() se persista a localStorage antes
          // del reload, sino vuelve al branch viejo al recargar.
          setTimeout(() => window.location.reload(), 50);
        }
      },

      fetchVersions: async () => {
        try {
          const r = await fetch("/api/game-versions", { cache: "no-store" });
          if (!r.ok) return;
          const json = await r.json();
          const live = json.live?.version ?? null;
          const ptu = json.ptu?.version ?? null;
          set({
            liveVersion: live,
            ptuVersion: ptu,
            versionsLoaded: true,
          });
          // Si el user tenía PTU seleccionado pero ya no existe → vuelve a LIVE.
          if (get().branch === "PTU" && !ptu) {
            set({ branch: "LIVE" });
          }
        } catch {
          // best-effort
        }
      },
    }),
    {
      name: "sc-labs-game-version",
      storage: ssrSafeStorage,
      partialize: (s) => ({ branch: s.branch }),
      skipHydration: typeof window === "undefined",
    },
  ),
);

/**
 * Devuelve la versión activa string ("4.7.0-LIVE.11518367") según el branch.
 * Devuelve null mientras `fetchVersions` no terminó.
 */
export function useActiveGameVersion(): string | null {
  return useGameVersionStore((s) =>
    s.branch === "PTU" ? s.ptuVersion : s.liveVersion,
  );
}

/**
 * Devuelve `?gv=...` listo para concatenar a un fetch URL. "" si no cargó.
 */
export function useGameVersionParam(): string {
  const v = useActiveGameVersion();
  return v ? `?gv=${encodeURIComponent(v)}` : "";
}
