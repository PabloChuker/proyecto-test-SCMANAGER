"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

type Method = "Ship" | "ROC" | "Hand";

interface SigRow {
  material: string;
  method: Method;
  radarSignature: number | null;
  tier: string | null;
  instability: number | null;
  resistance: number | null;
  note: string | null;
}
interface LocRow {
  name: string;
  system: string;
}
interface YieldRow {
  location: string;
  system: string;
  method: Method;
  material: string;
  chance: number;
}
interface ApiData {
  materials: string[];
  signatures: SigRow[];
  locations: LocRow[];
  yields: YieldRow[];
}

type View = "byMaterial" | "byLocation" | "signatures";

function tierColor(tier: string | null): string {
  switch (tier) {
    case "Common":
      return "text-zinc-300";
    case "Uncommon":
      return "text-emerald-400";
    case "Rare":
      return "text-cyan-400";
    case "Very Rare":
      return "text-fuchsia-400";
    default:
      return "text-zinc-400";
  }
}

function tierLabel(tier: string | null, t: (k: string) => string): string {
  switch (tier) {
    case "Common":
      return t("tierCommon");
    case "Uncommon":
      return t("tierUncommon");
    case "Rare":
      return t("tierRare");
    case "Very Rare":
      return t("tierVeryRare");
    default:
      return tier ?? "—";
  }
}

function methodLabel(m: Method, t: (k: string) => string): string {
  if (m === "Ship") return t("methodShip");
  if (m === "ROC") return t("methodRoc");
  return t("methodHand");
}

// Componente de barra de probabilidad
function ChanceBar({ pct }: { pct: number }) {
  const color =
    pct >= 25 ? "bg-emerald-500" : pct >= 10 ? "bg-amber-500" : "bg-zinc-500";
  const w = Math.min(100, Math.max(2, pct));
  return (
    <div className="flex items-center gap-2 min-w-[140px]">
      <div className="flex-1 h-1.5 bg-zinc-800 rounded overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${w}%` }} />
      </div>
      <span className="font-mono text-xs tabular-nums text-zinc-300 w-12 text-right">
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

export default function MaterialFinder() {
  const t = useTranslations("MiningFinder");
  const [data, setData] = useState<ApiData | null>(null);
  const [datasetVersion, setDatasetVersion] = useState<string | null>(null);
  const [source, setSource] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [view, setView] = useState<View>("byMaterial");
  const [materialFilter, setMaterialFilter] = useState<string>("all");
  const [systemFilter, setSystemFilter] = useState<string>("all");
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");

  useEffect(() => {
    let alive = true;
    fetch("/api/mining/materials")
      .then((r) => r.json())
      .then((res) => {
        if (!alive) return;
        if (res.error) {
          setError(res.error);
          setLoading(false);
          return;
        }
        setData(res.data);
        setDatasetVersion(res.datasetVersion);
        setSource(res.source);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setError(String(e));
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const systems = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.locations.map((l) => l.system))).sort();
  }, [data]);

  // Yields filtrados (vista byLocation y byMaterial)
  const filteredYields = useMemo<YieldRow[]>(() => {
    if (!data) return [];
    const s = search.trim().toLowerCase();
    return data.yields.filter((y) => {
      if (materialFilter !== "all" && y.material !== materialFilter) return false;
      if (systemFilter !== "all" && y.system !== systemFilter) return false;
      if (methodFilter !== "all" && y.method !== methodFilter) return false;
      if (s) {
        const hit =
          y.location.toLowerCase().includes(s) ||
          y.material.toLowerCase().includes(s);
        if (!hit) return false;
      }
      return true;
    });
  }, [data, materialFilter, systemFilter, methodFilter, search]);

  const filteredSignatures = useMemo<SigRow[]>(() => {
    if (!data) return [];
    const s = search.trim().toLowerCase();
    return data.signatures.filter((sig) => {
      if (materialFilter !== "all" && sig.material !== materialFilter)
        return false;
      if (methodFilter !== "all" && sig.method !== methodFilter) return false;
      if (s && !sig.material.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [data, materialFilter, methodFilter, search]);

  // Vista byMaterial: agrupar por material
  const groupedByMaterial = useMemo(() => {
    const groups: Record<string, YieldRow[]> = {};
    for (const y of filteredYields) {
      if (!groups[y.material]) groups[y.material] = [];
      groups[y.material].push(y);
    }
    // Ordenar cada grupo por chance desc
    for (const k of Object.keys(groups)) {
      groups[k].sort((a, b) => b.chance - a.chance);
    }
    return groups;
  }, [filteredYields]);

  // Vista byLocation: agrupar por (location, system)
  const groupedByLocation = useMemo(() => {
    const groups: Record<string, { system: string; rows: YieldRow[] }> = {};
    for (const y of filteredYields) {
      const key = `${y.location}|${y.system}`;
      if (!groups[key]) groups[key] = { system: y.system, rows: [] };
      groups[key].rows.push(y);
    }
    for (const k of Object.keys(groups)) {
      groups[k].rows.sort((a, b) => b.chance - a.chance);
    }
    return groups;
  }, [filteredYields]);

  // -----------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-zinc-500">
        <div className="animate-pulse">{t("loading")}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded border border-red-500/30 bg-red-500/10 p-6 text-red-300">
        {error}
      </div>
    );
  }

  if (!data || source === "missing-tables") {
    return (
      <div className="rounded border border-amber-500/30 bg-amber-500/10 p-6 text-amber-200">
        {t("fallbackWarn")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header descripcion + version */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-light text-amber-400 tracking-wide">
            {t("title")}
          </h2>
          <p className="mt-1 text-sm text-zinc-400 max-w-2xl">
            {t("description")}
          </p>
        </div>
        <div className="text-xs text-zinc-500">
          {t("source", { version: datasetVersion ?? "?" })}
        </div>
      </div>

      {/* View tabs */}
      <div className="flex gap-1 border-b border-zinc-800/60">
        {(["byMaterial", "byLocation", "signatures"] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-3 py-2 text-xs uppercase tracking-[0.15em] transition border-b-2 ${
              view === v
                ? "text-amber-400 border-amber-500"
                : "text-zinc-500 border-transparent hover:text-zinc-300"
            }`}
          >
            {v === "byMaterial"
              ? t("viewByMaterial")
              : v === "byLocation"
              ? t("viewByLocation")
              : t("viewSignatures")}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="text"
          placeholder="🔍"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-zinc-900/60 border border-zinc-800 rounded px-3 py-1.5 text-sm text-zinc-200 w-48 focus:outline-none focus:border-amber-500/50"
        />

        <select
          value={materialFilter}
          onChange={(e) => setMaterialFilter(e.target.value)}
          className="bg-zinc-900/60 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-300"
        >
          <option value="all">{t("allMaterials")}</option>
          {data.materials.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        {view !== "signatures" && (
          <select
            value={systemFilter}
            onChange={(e) => setSystemFilter(e.target.value)}
            className="bg-zinc-900/60 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-300"
          >
            <option value="all">{t("allSystems")}</option>
            {systems.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}

        <select
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value)}
          className="bg-zinc-900/60 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-300"
        >
          <option value="all">{t("allMethods")}</option>
          <option value="Ship">{t("methodShip")}</option>
          <option value="ROC">{t("methodRoc")}</option>
          <option value="Hand">{t("methodHand")}</option>
        </select>
      </div>

      {/* CONTENT */}
      {view === "byMaterial" && (
        <div className="space-y-4">
          {Object.keys(groupedByMaterial).length === 0 && (
            <div className="text-center text-zinc-500 py-8">{t("empty")}</div>
          )}
          {Object.entries(groupedByMaterial)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([material, rows]) => (
              <div
                key={material}
                className="rounded border border-zinc-800 bg-zinc-900/40"
              >
                <div className="px-4 py-2 border-b border-zinc-800/60 flex items-center justify-between">
                  <div className="font-light text-amber-400">{material}</div>
                  <div className="text-[10px] uppercase text-zinc-500">
                    {rows.length}{" "}
                    {rows.length === 1 ? "ubicación" : "ubicaciones"}
                  </div>
                </div>
                <div className="divide-y divide-zinc-800/40">
                  {rows.map((r, i) => (
                    <div
                      key={i}
                      className="px-4 py-2 flex flex-wrap items-center gap-3 text-sm"
                    >
                      <div className="flex-1 min-w-[180px]">
                        <div className="text-zinc-200">{r.location}</div>
                        <div className="text-[11px] text-zinc-500">
                          {r.system} · {methodLabel(r.method, t)}
                        </div>
                      </div>
                      <ChanceBar pct={r.chance} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}

      {view === "byLocation" && (
        <div className="space-y-4">
          {Object.keys(groupedByLocation).length === 0 && (
            <div className="text-center text-zinc-500 py-8">{t("empty")}</div>
          )}
          {Object.entries(groupedByLocation)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, group]) => {
              const locName = key.split("|")[0];
              return (
                <div
                  key={key}
                  className="rounded border border-zinc-800 bg-zinc-900/40"
                >
                  <div className="px-4 py-2 border-b border-zinc-800/60 flex items-center justify-between">
                    <div>
                      <div className="font-light text-amber-400">{locName}</div>
                      <div className="text-[11px] text-zinc-500">
                        {group.system}
                      </div>
                    </div>
                    <div className="text-[10px] uppercase text-zinc-500">
                      {group.rows.length}{" "}
                      {group.rows.length === 1 ? "material" : "materiales"}
                    </div>
                  </div>
                  <div className="divide-y divide-zinc-800/40">
                    {group.rows.map((r, i) => (
                      <div
                        key={i}
                        className="px-4 py-2 flex flex-wrap items-center gap-3 text-sm"
                      >
                        <div className="flex-1 min-w-[180px]">
                          <div className="text-zinc-200">{r.material}</div>
                          <div className="text-[11px] text-zinc-500">
                            {methodLabel(r.method, t)}
                          </div>
                        </div>
                        <ChanceBar pct={r.chance} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {view === "signatures" && (
        <div className="rounded border border-zinc-800 bg-zinc-900/40 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-800/60 text-[10px] uppercase tracking-[0.15em] text-zinc-500">
              <tr>
                <th className="text-left px-3 py-2">{t("colMaterial")}</th>
                <th className="text-left px-3 py-2">{t("colMethod")}</th>
                <th className="text-left px-3 py-2">{t("colTier")}</th>
                <th className="text-right px-3 py-2">{t("colSignature")}</th>
                <th className="text-right px-3 py-2">{t("colInstability")}</th>
                <th className="text-right px-3 py-2">{t("colResistance")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40">
              {filteredSignatures.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-zinc-500 py-6">
                    {t("empty")}
                  </td>
                </tr>
              )}
              {filteredSignatures.map((s, i) => (
                <tr key={i} className="hover:bg-zinc-800/20 transition">
                  <td className="px-3 py-2 text-zinc-200">{s.material}</td>
                  <td className="px-3 py-2 text-zinc-400">
                    {methodLabel(s.method, t)}
                  </td>
                  <td className={`px-3 py-2 ${tierColor(s.tier)}`}>
                    {tierLabel(s.tier, t)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-300">
                    {s.radarSignature ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-300">
                    {s.instability !== null ? s.instability.toFixed(0) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-300">
                    {s.resistance !== null ? s.resistance.toFixed(2) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
