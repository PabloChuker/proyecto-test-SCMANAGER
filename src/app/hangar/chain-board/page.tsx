"use client";

// =============================================================================
// SC LABS — CCU Chain Board (Modo Pizarra)
//
// Vista alternativa al CCU Chain Calculator clásico. Layout de 3 columnas:
//
//   ┌──────────────┬───────────────────┬──────────────┐
//   │ Mi Inventario│ Pizarra (chain)   │ En venta RSI │
//   │ (ships+CCUs) │ Cards encadenadas │ (concept+std)│
//   │   filtros    │ ↓ flecha verde    │   filtros    │
//   │   buscador   │ ↓ flecha roja     │   last sync  │
//   └──────────────┴───────────────────┴──────────────┘
//
// El usuario arma la cadena visualmente: click en una nave del lado
// izquierdo o derecho → se inserta en la pizarra. Drag para reordenar.
// El sistema valida cada par adyacente y muestra:
//   - flecha verde si existe CCU disponible (warbond/std)
//   - flecha azul si tenés un CCU owned que cubre ese salto
//   - flecha roja si no hay edge válido (variant rule, fuera de mercado)
//
// Botón "Sugerencia automática" corre el solver clásico y popula la pizarra.
// =============================================================================

import Header from "@/app/assets/header/Header";
import { useTranslations } from "next-intl";
import { ChainBoardWorkspace } from "@/components/hangar/chain-board/ChainBoardWorkspace";

export default function ChainBoardPage() {
  const t = useTranslations("PageTitles");
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <video
        autoPlay
        loop
        muted
        playsInline
        className="fixed inset-0 w-full h-full object-cover opacity-10 pointer-events-none z-0"
      >
        <source src="/videos/bg.mp4" type="video/mp4" />
      </video>
      <div className="fixed inset-0 bg-gradient-to-b from-zinc-950/70 via-zinc-950/85 to-zinc-950/95 pointer-events-none z-0" />
      <Header subtitle={t("hangar")} />
      <div className="relative z-10 max-w-[1800px] mx-auto px-3 sm:px-4 lg:px-6 py-4 lg:py-6">
        <ChainBoardWorkspace />
      </div>
    </main>
  );
}
