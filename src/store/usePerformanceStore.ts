// =============================================================================
// SC LABS — usePerformanceStore (Fase I.1)
//
// Modo "light" vs "full" para equipos modestos o conexiones lentas.
// - light: sin video de fondo (no se descarga). ES EL DEFAULT.
// - full:  videos de fondo animados. Lo elige el usuario con el toggle.
//
// 2026-11-14: el default pasó de "full" a "light" — los videos de fondo pesan
// 3–12 MB por página y se descargaban siempre. Ahora no se piden hasta que el
// usuario activa "Full" a mano. Los modelos 3D NO dependen de este modo:
// se muestran siempre.
//
// Persistido en localStorage con key "sc-labs-perf-mode-v2" (por dispositivo).
// La key se bumpeó a v2 para que quien tenía "full" guardado de antes arranque
// también en light; a partir de ahí se respeta lo que elija.
//
// Uso típico:
//   const showVideo = useShowBackgroundVideo();
//   return showVideo ? <Video /> : null;
//
// El toggle visible vive en <PerformanceToggle /> dentro del Header global.
// =============================================================================

import { useSyncExternalStore } from "react";
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
      mode: "light",
      setMode: (mode) => set({ mode }),
      toggle: () =>
        set({ mode: get().mode === "full" ? "light" : "full" }),
    }),
    {
      name: "sc-labs-perf-mode-v2",
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

/**
 * `true` solo cuando el usuario eligió "Full" Y el componente ya montó en el
 * cliente. En el server y en el primer render devuelve `false`, igual que el
 * default "light": así no hay hydration mismatch y el <video> ni siquiera
 * llega al HTML inicial (el navegador no empieza a bajarlo).
 */
export function useShowBackgroundVideo(): boolean {
  const isLight = useIsLight();
  // false en el server y durante la hidratación; true ya en el cliente.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  return hydrated && !isLight;
}

const noopSubscribe = () => () => {};
