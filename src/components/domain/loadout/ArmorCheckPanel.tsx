"use client";

// =============================================================================
// SC LABS — ArmorCheckPanel
//
// Sección embebida en el StatsPanel del LoadoutBuilder. Lista las armas más
// relevantes (cerca del umbral de deflección de la nave) y marca cuáles
// penetran y cuáles son bloqueadas.
//
// Fórmula VerseTools §6.1: damage = alpha_per_type > deflectThreshold ? alpha : 0.
//
// El componente hace fetch a /api/armor-check?physical=...&energy=...&gv=...
// cuando los umbrales o la game version cambian, y cachea por 5 min en CDN.
// =============================================================================

import { useEffect, useState } from "react";
import { ArmorCheckModal } from "./ArmorCheckModal";

interface ArmorCheckWeapon {
  className: string;
  name: string;
  size: number | null;
  manufacturer: string | null;
  alphaPhysical: number;
  alphaEnergy: number;
  penetrates: boolean;
  delta: number;
}

interface ArmorCheckResponse {
  threshold: { physical: number; energy: number };
  physicalCheck: ArmorCheckWeapon[];
  energyCheck: ArmorCheckWeapon[];
  totalWeapons: number;
}

interface Props {
  deflectionPhysical: number | null;
  deflectionEnergy: number | null;
  gameVersion?: string | null;
}

const fmt = (n: number) =>
  Math.abs(n) >= 1000 ? (n / 1000).toFixed(1) + "k" : Math.round(n).toString();

export function ArmorCheckPanel({
  deflectionPhysical,
  deflectionEnergy,
  gameVersion,
}: Props) {
  const [data, setData] = useState<ArmorCheckResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  // Si no hay umbrales válidos, no renderizamos nada (la mayoría de fighters
  // tiene alpha-deflect bajo, así que esto pasa rara vez).
  const hasThreshold =
    (deflectionPhysical != null && deflectionPhysical > 0) ||
    (deflectionEnergy != null && deflectionEnergy > 0);

  useEffect(() => {
    if (!hasThreshold) return;
    const phys = deflectionPhysical ?? 0;
    const ene = deflectionEnergy ?? 0;
    const params = new URLSearchParams();
    params.set("physical", String(phys));
    params.set("energy", String(ene));
    if (gameVersion) params.set("gv", gameVersion);
    setLoading(true);
    fetch("/api/armor-check?" + params.toString(), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && !j.error) setData(j);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [deflectionPhysical, deflectionEnergy, gameVersion, hasThreshold]);

  if (!hasThreshold) return null;

  return (
    <div className="bg-zinc-900/80 border border-zinc-800/60 p-3">
      <div className="flex items-center justify-between mb-2 gap-2">
        <span className="text-[11px] font-mono text-zinc-500 tracking-[0.2em] uppercase">
          Armor Deflection Check
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-zinc-600 tracking-wider">
            {loading ? "loading…" : data ? `${data.totalWeapons} armas evaluadas` : ""}
          </span>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 border border-amber-600/40 text-amber-300 hover:bg-amber-500/10 transition-colors"
          >
            Ver todas
          </button>
        </div>
      </div>

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ColumnList
            label="Physical"
            color="#84cc16"
            threshold={data.threshold.physical}
            weapons={data.physicalCheck}
            alphaKey="alphaPhysical"
          />
          <ColumnList
            label="Energy"
            color="#06b6d4"
            threshold={data.threshold.energy}
            weapons={data.energyCheck}
            alphaKey="alphaEnergy"
          />
        </div>
      )}

      {!data && !loading && (
        <div className="text-[10px] font-mono text-zinc-600 italic">
          No hay datos de catálogo para evaluar.
        </div>
      )}

      <ArmorCheckModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        deflectionPhysical={deflectionPhysical}
        deflectionEnergy={deflectionEnergy}
        gameVersion={gameVersion}
      />
    </div>
  );
}

function ColumnList({
  label,
  color,
  threshold,
  weapons,
  alphaKey,
}: {
  label: string;
  color: string;
  threshold: number;
  weapons: ArmorCheckWeapon[];
  alphaKey: "alphaPhysical" | "alphaEnergy";
}) {
  if (threshold <= 0) {
    return (
      <div>
        <div
          className="text-[11px] font-mono font-bold tracking-wider uppercase mb-1"
          style={{ color }}
        >
          {label}
        </div>
        <div className="text-[10px] font-mono text-zinc-600 italic">
          Sin umbral (deflect = 0).
        </div>
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span
          className="text-[11px] font-mono font-bold tracking-wider uppercase"
          style={{ color }}
        >
          {label}
        </span>
        <span className="text-[11px] font-mono text-zinc-500 tabular-nums">
          umbral {fmt(threshold)}
        </span>
      </div>
      <div className="space-y-0.5">
        {weapons.map((w) => {
          const alpha = Number(w[alphaKey]);
          const ok = w.penetrates;
          return (
            <div
              key={w.className}
              className="flex items-center justify-between gap-2 text-[10px] font-mono py-0.5 px-1 rounded-sm"
              style={{
                backgroundColor: ok ? "#16a34a14" : "#dc262614",
              }}
              title={`${w.name} S${w.size ?? "?"} — alpha ${alpha.toFixed(0)}, delta ${w.delta >= 0 ? "+" : ""}${w.delta.toFixed(0)}`}
            >
              <span
                className="truncate"
                style={{ color: ok ? "#86efac" : "#fca5a5" }}
              >
                {ok ? "✓" : "✕"} {w.name}
              </span>
              <span className="tabular-nums text-zinc-400">
                S{w.size ?? "?"} · {fmt(alpha)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
