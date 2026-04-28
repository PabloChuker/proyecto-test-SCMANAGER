// =============================================================================
// SC Labs — Game Version Store (LIVE / PTU)
//
// Estado global del branch del juego (LIVE/PTU) que el usuario quiere usar.
// Todos los módulos del proyecto (loadout, ships, crafting, mining, hangar,
// herramientas) leen sus datos filtrando por la versión activa.
//
// El equipo de DBs (Garnok) sube a Supabase ambos branches en tablas con
// columna `game_version`. Cada endpoint del proyecto debe filtrar por esta
// columna para devolver datos del branch activo.
//
// PROPAGACIÓN A ENDPOINTS — patrón a respetar en todos los nuevos endpoints
// que toquen tablas con `game_version`:
//
//   1. Cliente: usar el helper `useGameVersionParam()` para obtener el query
//      string actual (ej. `?gv=4.7.2`).
//   2. Server: leer `searchParams.get("gv")` y aplicarlo al `WHERE` SQL.
//   3. Si no viene el param, usar el branch LIVE por default (compat back).
//
// Ejemplo cliente:
//   const gv = useGameVersionParam();
//   fetch(`/api/ships${gv}`)        // → /api/ships?gv=4.7.2
//
// Ejemplo server:
//   const gv = request.nextUrl.searchParams.get("gv");
//   const where = gv ? `WHERE game_version = $1` : "";
//
// =============================================================================

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type GameBranch = "LIVE" | "PTU";

export interface GameVersionInfo {
  version: string;       // "4.7.2"
  branch: GameBranch;    // "LIVE" | "PTU"
  label: string;         // "4.7.2" o "4.7.3-PTU" (cómo se muestra)
}

interface GameVersionState {
  // Selección del usuario (persistida)
  branch: GameBranch;

  // Versiones detectadas en BD (no persistidas — se refetchan)
  liveVersion: string | null;
  ptuVersion: string | null;
  versionsLoaded: boolean;

  // Acciones
  setBranch: (branch: GameBranch) => void;
  fetchVersions: () => Promise<void>;
}

export const useGameVersionStore = create<GameVersionState>()(
  persist(
    (set, get) => ({
      branch: "LIVE",
      liveVersion: null,
      ptuVersion: null,
      versionsLoaded: false,

      setBranch: (branch) => {
        // Si el user pide PTU pero no hay PTU activo, ignoramos.
        if (branch === "PTU" && !get().ptuVersion) return;
        set({ branch });
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
          // Si el user tenía PTU seleccionado pero ya no hay PTU activo,
          // forzamos vuelta a LIVE para no romper queries.
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
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ branch: s.branch }), // sólo persistimos branch
    },
  ),
);

/**
 * Hook utilitario: devuelve la versión activa string ("4.7.2") según el
 * branch seleccionado. Devuelve null mientras `fetchVersions` no terminó.
 */
export function useActiveGameVersion(): string | null {
  return useGameVersionStore((s) =>
    s.branch === "PTU" ? s.ptuVersion : s.liveVersion,
  );
}

/**
 * Hook utilitario: devuelve el query string `?gv=...&` listo para concatenar
 * a una URL de fetch. Devuelve "" si la versión no se cargó todavía.
 *
 * Ejemplos:
 *   const gv = useGameVersionParam();
 *   fetch(`/api/ships${gv}`)  // → "/api/ships?gv=4.7.2" o "/api/ships"
 */
export function useGameVersionParam(): string {
  const v = useActiveGameVersion();
  return v ? `?gv=${encodeURIComponent(v)}` : "";
}

/**
 * Hook server-side helper: tomar el `?gv=` de una request. Devuelve null si
 * no viene (el endpoint debe usar fallback al LIVE actual).
 */
export function getGameVersionFromRequest(
  searchParams: URLSearchParams,
): string | null {
  const v = searchParams.get("gv");
  return v && v.length > 0 ? v : null;
}
