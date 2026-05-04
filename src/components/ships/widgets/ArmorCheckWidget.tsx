// =============================================================================
// SC LABS — ArmorCheckWidget (Loadout.3, 2026-05-04)
//
// Widget independiente para el Armor Check, separado del LoadoutDetail.
// Antes vivía dentro del LOADOUT DETAIL, pero la tabla de 174 armas evaluadas
// (PHYSICAL / ENERGY contra los thresholds del armor de la nave) tiene
// suficiente contenido para tener su propia tarjeta. Esto permite además
// reordenar/redimensionar el widget independientemente.
// =============================================================================
"use client";

import { memo } from "react";
import { useLoadoutStore } from "@/store/useLoadoutStore";
import { useShallow } from "zustand/react/shallow";
import { ArmorCheckPanel } from "@/components/domain/loadout/ArmorCheckPanel";

export const ArmorCheckContent = memo(function ArmorCheckContent() {
  const { shipInfo } = useLoadoutStore(
    useShallow((s) => ({ shipInfo: s.shipInfo })),
  );

  if (!shipInfo) return null;
  const si = shipInfo as any;

  // Igual condición que tenía el bloque dentro de LoadoutDetail: si no hay
  // ningún threshold de armor (deflectionPhysical o deflectionEnergy), ni
  // siquiera renderizamos. El widget queda vacío con leyenda.
  const hasThreshold =
    (si.deflectionPhysical != null && si.deflectionPhysical > 0) ||
    (si.deflectionEnergy != null && si.deflectionEnergy > 0);

  if (!hasThreshold) {
    return (
      <div className="text-[10px] text-zinc-500 italic px-2 py-3 text-center">
        Esta nave no tiene thresholds de armor cargados — el chequeo no aplica.
      </div>
    );
  }

  return (
    <ArmorCheckPanel
      deflectionPhysical={si.deflectionPhysical ?? null}
      deflectionEnergy={si.deflectionEnergy ?? null}
      gameVersion={si.gameVersion ?? null}
    />
  );
});
