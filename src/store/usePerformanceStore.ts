// =============================================================================
// SC LABS — usePerformanceStore (Fase I.1)
//
// Modo "light" vs "full" para equipos modestos o conexiones lentas.
// - full:  videos de fondo animados, 3D viewers, charts, todo completo
// - light: poster estático en vez de video, fallbacks 2D donde haya 3D
//
// Persistido en localStorage con key "sc-labs-perf-mode" (por dispositivo).
// Default: "full".
//
// Uso típico:
//   const isLight = useIsLight();
//   return isLight ? <Poster /> : <Video />;
//
// El toggle visible vive en <PerformanceToggle /> dentro del Header global.
// =============================================================================

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type PerfMode = "full" | "light";

interface PerformanceState {
  mode: PerfMode;
  setMode: (mode: PerfMode) => void;
  toggle: () => void;
}

export const usePerformanceStore = create<PerformanceState>()(
  persist(
    (set, get) => ({
      mode: "full",
      setMode: (mode) => set({ mode }),
      toggle: () =>
        set({ mode: get().mode === "full" ? "light" : "full" }),
    }),
    {
      name: "sc-labs-perf-mode",
      // Solo persistimos `mode`, no las funciones.
      partialize: (state) => ({ mode: state.mode }),
    }
  )
);

/**
 * Sugar hook — devuelve `true` si el modo activo es "light".
 * Preferir este hook sobre `usePerformanceStore((s) => s.mode === "light")`
 * para que los componentes consumidores sean explícitos.
 */
export function useIsLight(): boolean {
  return usePerformanceStore((s) => s.mode === "light");
}
