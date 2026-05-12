"use client";

// =============================================================================
// SC LABS — ArmorCheckModal
//
// Modal con listado COMPLETO del catálogo de armas evaluado contra los umbrales
// de deflección de la nave seleccionada. Llamada al backend con `mode=full`
// (devuelve todas las armas anotadas con penetrates/delta).
//
// Filtros lado cliente:
//   - Tipo de daño dominante (Physical / Energy / All)
//   - Size
//   - Grade
//   - Manufacturer
//   - Solo penetrantes (toggle)
//
// Ordenamiento por defecto: alpha-per-type ascendente.
// =============================================================================

import { useEffect, useMemo, useState } from "react";

interface ArmorCheckWeapon {
  className: string;
  name: string;
  size: number | null;
  manufacturer: string | null;
  grade: number | null;
  itemClass: string | null;
  subType: string | null;
  alphaPhysical: number;
  alphaEnergy: number;
  alphaDistortion: number;
  alphaTotal: number;
  penetrates: boolean;
  delta: number;
}

interface ArmorCheckResponse {
  threshold: { physical: number; energy: number };
  mode: "compact" | "full";
  physicalCheck: ArmorCheckWeapon[];
  energyCheck: ArmorCheckWeapon[];
  totalWeapons: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  deflectionPhysical: number | null;
  deflectionEnergy: number | null;
  gameVersion?: string | null;
}

const fmt = (n: number) =>
  Math.abs(n) >= 1000 ? (n / 1000).toFixed(1) + "k" : Math.round(n).toString();

type DamageType = "physical" | "energy" | "all";

export function ArmorCheckModal({
  open,
  onClose,
  deflectionPhysical,
  deflectionEnergy,
  gameVersion,
}: Props) {
  const [data, setData] = useState<ArmorCheckResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // Filtros
  const [damageType, setDamageType] = useState<DamageType>("all");
  const [sizeFilter, setSizeFilter] = useState<number | null>(null);
  const [gradeFilter, setGradeFilter] = useState<number | null>(null);
  const [mfrFilter, setMfrFilter] = useState<string | null>(null);
  const [onlyPenetrating, setOnlyPenetrating] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    const phys = deflectionPhysical ?? 0;
    const ene = deflectionEnergy ?? 0;
    const params = new URLSearchParams();
    params.set("physical", String(phys));
    params.set("energy", String(ene));
    params.set("mode", "full");
    if (gameVersion) params.set("gv", gameVersion);
    setLoading(true);
    setData(null);
    fetch("/api/armor-check?" + params.toString(), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && !j.error) setData(j);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, deflectionPhysical, deflectionEnergy, gameVersion]);

  // ESC cierra
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Combinamos physicalCheck + energyCheck en un mapa por className para
  // tener un solo registro por arma con AMBOS verdicts.
  const rows = useMemo(() => {
    if (!data) return [] as ArmorCheckWeapon[];
    const byClass = new Map<string, ArmorCheckWeapon>();
    for (const w of data.physicalCheck) byClass.set(w.className, w);
    for (const w of data.energyCheck) {
      const prev = byClass.get(w.className);
      if (prev) {
        // Mantener registro pero asegurar valores energy/physical correctos
        byClass.set(w.className, { ...prev });
      } else {
        byClass.set(w.className, w);
      }
    }
    return Array.from(byClass.values());
  }, [data]);

  const allSizes = useMemo(
    () =>
      Array.from(
        new Set(rows.map((r) => r.size).filter((x): x is number => x != null)),
      ).sort((a, b) => a - b),
    [rows],
  );
  const allGrades = useMemo(
    () =>
      Array.from(
        new Set(
          rows.map((r) => r.grade).filter((x): x is number => x != null),
        ),
      ).sort((a, b) => a - b),
    [rows],
  );
  const allMfrs = useMemo(
    () =>
      Array.from(
        new Set(
          rows.map((r) => r.manufacturer).filter((x): x is string => !!x),
        ),
      ).sort(),
    [rows],
  );

  const physThreshold = data?.threshold.physical ?? 0;
  const eneThreshold = data?.threshold.energy ?? 0;

  // Para ordenar y mostrar, usamos el alpha del damageType seleccionado, o
  // alphaTotal si "all".
  const alphaOf = (w: ArmorCheckWeapon) =>
    damageType === "physical"
      ? w.alphaPhysical
      : damageType === "energy"
        ? w.alphaEnergy
        : Math.max(w.alphaPhysical, w.alphaEnergy);

  const penetratesOf = (w: ArmorCheckWeapon) =>
    damageType === "physical"
      ? w.alphaPhysical > physThreshold && physThreshold > 0
      : damageType === "energy"
        ? w.alphaEnergy > eneThreshold && eneThreshold > 0
        : (w.alphaPhysical > physThreshold && physThreshold > 0) ||
          (w.alphaEnergy > eneThreshold && eneThreshold > 0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (damageType === "physical" && !(r.alphaPhysical > 0)) return false;
        if (damageType === "energy" && !(r.alphaEnergy > 0)) return false;
        if (sizeFilter != null && r.size !== sizeFilter) return false;
        if (gradeFilter != null && r.grade !== gradeFilter) return false;
        if (mfrFilter != null && r.manufacturer !== mfrFilter) return false;
        if (onlyPenetrating && !penetratesOf(r)) return false;
        if (q && !r.name.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => alphaOf(a) - alphaOf(b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    rows,
    damageType,
    sizeFilter,
    gradeFilter,
    mfrFilter,
    onlyPenetrating,
    search,
    physThreshold,
    eneThreshold,
  ]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-zinc-950 border border-zinc-800 w-full max-w-4xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div className="flex items-baseline gap-3">
            <h2 className="text-sm font-mono font-bold tracking-[0.25em] uppercase text-amber-400">
              Armor Deflection Check
            </h2>
            <span className="text-[10px] font-mono text-zinc-500">
              Physical {fmt(physThreshold)} · Energy {fmt(eneThreshold)}
            </span>
            {gameVersion && (
              <span className="text-[10px] font-mono text-zinc-600">
                {gameVersion}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-100 text-xs font-mono"
            aria-label="Cerrar"
          >
            ✕ ESC
          </button>
        </div>

        {/* Filtros */}
        <div className="px-4 py-3 border-b border-zinc-800 flex flex-wrap items-center gap-3 text-[11px] font-mono">
          {/* Tipo */}
          <div className="flex items-center gap-1">
            {(["all", "physical", "energy"] as DamageType[]).map((t) => (
              <button
                key={t}
                onClick={() => setDamageType(t)}
                className={`px-2 py-1 border tracking-wider uppercase ${
                  damageType === t
                    ? "border-amber-500/60 text-amber-300 bg-amber-500/10"
                    : "border-zinc-700 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Size */}
          <select
            value={sizeFilter ?? ""}
            onChange={(e) =>
              setSizeFilter(e.target.value === "" ? null : Number(e.target.value))
            }
            className="bg-zinc-900 border border-zinc-700 px-2 py-1 text-zinc-200"
          >
            <option value="">Todos los sizes</option>
            {allSizes.map((s) => (
              <option key={s} value={s}>
                S{s}
              </option>
            ))}
          </select>

          {/* Grade */}
          <select
            value={gradeFilter ?? ""}
            onChange={(e) =>
              setGradeFilter(e.target.value === "" ? null : Number(e.target.value))
            }
            className="bg-zinc-900 border border-zinc-700 px-2 py-1 text-zinc-200"
          >
            <option value="">Todos los grades</option>
            {allGrades.map((g) => (
              <option key={g} value={g}>
                G{g}
              </option>
            ))}
          </select>

          {/* Manufacturer */}
          <select
            value={mfrFilter ?? ""}
            onChange={(e) =>
              setMfrFilter(e.target.value === "" ? null : e.target.value)
            }
            className="bg-zinc-900 border border-zinc-700 px-2 py-1 text-zinc-200 max-w-[160px]"
          >
            <option value="">Todos los fabricantes</option>
            {allMfrs.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          {/* Search */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="buscar…"
            className="bg-zinc-900 border border-zinc-700 px-2 py-1 text-zinc-200 placeholder-zinc-600 flex-1 min-w-[120px]"
          />

          {/* Only penetrating */}
          <label className="flex items-center gap-1.5 text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyPenetrating}
              onChange={(e) => setOnlyPenetrating(e.target.checked)}
              className="accent-amber-500"
            />
            solo penetrantes
          </label>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1">
          {loading && (
            <div className="p-6 text-center text-[11px] font-mono text-zinc-500">
              cargando catálogo…
            </div>
          )}
          {!loading && data && (
            <table className="w-full text-[11px] font-mono">
              <thead className="sticky top-0 bg-zinc-950 border-b border-zinc-800">
                <tr className="text-zinc-500 tracking-widest uppercase">
                  <th className="text-left px-3 py-2">Arma</th>
                  <th className="text-left px-2 py-2">S</th>
                  <th className="text-left px-2 py-2">G</th>
                  <th className="text-left px-2 py-2">Fabricante</th>
                  <th className="text-right px-2 py-2" title="Alpha Physical">
                    α PHY
                  </th>
                  <th className="text-right px-2 py-2" title="Alpha Energy">
                    α ENE
                  </th>
                  <th className="text-center px-2 py-2">PHY</th>
                  <th className="text-center px-2 py-2">ENE</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((w) => {
                  const physOK =
                    physThreshold > 0 && w.alphaPhysical > physThreshold;
                  const eneOK = eneThreshold > 0 && w.alphaEnergy > eneThreshold;
                  return (
                    <tr
                      key={w.className}
                      className="border-b border-zinc-900 hover:bg-zinc-900/40"
                    >
                      <td className="px-3 py-1.5 text-zinc-200 truncate max-w-[260px]">
                        {w.name}
                      </td>
                      <td className="px-2 py-1.5 text-zinc-400">
                        S{w.size ?? "?"}
                      </td>
                      <td className="px-2 py-1.5 text-zinc-400">
                        {w.grade != null ? `G${w.grade}` : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-zinc-500 truncate max-w-[140px]">
                        {w.manufacturer ?? "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-lime-400/90">
                        {w.alphaPhysical > 0 ? fmt(w.alphaPhysical) : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-cyan-400/90">
                        {w.alphaEnergy > 0 ? fmt(w.alphaEnergy) : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {physThreshold <= 0 ? (
                          <span className="text-zinc-700">—</span>
                        ) : w.alphaPhysical <= 0 ? (
                          <span className="text-zinc-700">·</span>
                        ) : physOK ? (
                          <span className="text-emerald-400">✓</span>
                        ) : (
                          <span className="text-rose-400">✕</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {eneThreshold <= 0 ? (
                          <span className="text-zinc-700">—</span>
                        ) : w.alphaEnergy <= 0 ? (
                          <span className="text-zinc-700">·</span>
                        ) : eneOK ? (
                          <span className="text-emerald-400">✓</span>
                        ) : (
                          <span className="text-rose-400">✕</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="text-center px-3 py-6 text-zinc-600 italic"
                    >
                      No hay armas que cumplan los filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-zinc-800 flex items-center justify-between text-[10px] font-mono text-zinc-500">
          <span>
            {filtered.length} / {rows.length} armas
            {data ? ` (catálogo: ${data.totalWeapons})` : ""}
          </span>
          <span className="text-zinc-600">
            ✓ penetra · ✕ bloqueada · — sin umbral · · sin daño de ese tipo
          </span>
        </div>
      </div>
    </div>
  );
}
