"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useCraftingData } from "./useCraftingData";
import type { ResourceInfo, Blueprint } from "./types";

/* ───────────────────────────────────────────────────────
   Mock data — fallback when Supabase is unavailable
   ─────────────────────────────────────────────────────── */
const MOCK_MATERIALS: ResourceInfo[] = [
  {
    resourceUuid: "m1", resourceKey: "Ore_Titanium", resourceName: "Titanium",
    description: "A lightweight, high-strength metallic element used in armor fabrication.",
    refinedUuid: null, refinedName: null,
    boxSizes: [1, 2], blueprintCount: 3, totalScuUsed: 0.42,
  },
  {
    resourceUuid: "m2", resourceKey: "Ore_Agricium", resourceName: "Agricium",
    description: "An extremely rare and valuable ore used in high-end weapon components.",
    refinedUuid: "m2r", refinedName: "Refined Agricium",
    boxSizes: [0.25, 1], blueprintCount: 2, totalScuUsed: 0.18,
  },
  {
    resourceUuid: "m3", resourceKey: "Ore_Laranite", resourceName: "Laranite",
    description: "A dense ore with exceptional energy-absorbing properties.",
    refinedUuid: null, refinedName: null,
    boxSizes: [1], blueprintCount: 1, totalScuUsed: 0.09,
  },
  {
    resourceUuid: "m4", resourceKey: "Ore_Gold", resourceName: "Gold",
    description: "A precious metal used in electronic and optical components.",
    refinedUuid: null, refinedName: null,
    boxSizes: [1], blueprintCount: 2, totalScuUsed: 0.11,
  },
  {
    resourceUuid: "m5", resourceKey: "Ore_Bexalite", resourceName: "Bexalite",
    description: "A radioactive ore valued for its heat-resistant crystalline lattice.",
    refinedUuid: "m5r", refinedName: "Refined Bexalite",
    boxSizes: [0.5, 2], blueprintCount: 1, totalScuUsed: 0.24,
  },
  {
    resourceUuid: "m10", resourceKey: "Ore_Hephaestanite", resourceName: "Hephaestanite",
    description: "A volcanic compound prized for its impact-dampening molecular structure.",
    refinedUuid: null, refinedName: null,
    boxSizes: [1], blueprintCount: 2, totalScuUsed: 0.31,
  },
];

const MOCK_BLUEPRINTS_FOR_BROWSER: Pick<Blueprint, "uuid" | "outputName" | "parts">[] = [
  {
    uuid: "mock-1", outputName: "Novikov Helmet Mk I",
    parts: [
      { groupKey: "shell", groupName: "Outer Shell", requiredCount: 1, materials: [{ resourceUuid: "m1", resourceName: "Titanium", resourceKey: "", description: "", refinedName: null, boxSizes: [], quantityScu: 0, minQuality: 0 }], modifiers: [] },
      { groupKey: "padding", groupName: "Impact Padding", requiredCount: 1, materials: [{ resourceUuid: "m10", resourceName: "Hephaestanite", resourceKey: "", description: "", refinedName: null, boxSizes: [], quantityScu: 0, minQuality: 0 }], modifiers: [] },
      { groupKey: "visor", groupName: "Visor Assembly", requiredCount: 1, materials: [{ resourceUuid: "m4", resourceName: "Gold", resourceKey: "", description: "", refinedName: null, boxSizes: [], quantityScu: 0, minQuality: 0 }], modifiers: [] },
    ],
  },
  {
    uuid: "mock-2", outputName: "Ravager Chestplate",
    parts: [
      { groupKey: "plate", groupName: "Chest Plate", requiredCount: 1, materials: [{ resourceUuid: "m1", resourceName: "Titanium", resourceKey: "", description: "", refinedName: null, boxSizes: [], quantityScu: 0, minQuality: 0 }], modifiers: [] },
      { groupKey: "liner", groupName: "Inner Liner", requiredCount: 1, materials: [{ resourceUuid: "m5", resourceName: "Bexalite", resourceKey: "", description: "", refinedName: null, boxSizes: [], quantityScu: 0, minQuality: 0 }], modifiers: [] },
    ],
  },
  {
    uuid: "mock-3", outputName: "PR-SC SMG Custom",
    parts: [
      { groupKey: "barrel", groupName: "Barrel Assembly", requiredCount: 1, materials: [{ resourceUuid: "m2", resourceName: "Agricium", resourceKey: "", description: "", refinedName: null, boxSizes: [], quantityScu: 0, minQuality: 0 }], modifiers: [] },
      { groupKey: "frame", groupName: "Frame", requiredCount: 1, materials: [{ resourceUuid: "m1", resourceName: "Titanium", resourceKey: "", description: "", refinedName: null, boxSizes: [], quantityScu: 0, minQuality: 0 }], modifiers: [] },
    ],
  },
];

const GRAD_BORDER: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  borderRadius: "12px",
  padding: "1px",
  background: "linear-gradient(to right, #4a6741, #f97316)",
  WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
  WebkitMaskComposite: "xor",
  maskComposite: "exclude",
  pointerEvents: "none",
};

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative rounded-xl ${className}`} style={{ borderRadius: "12px" }}>
      <div style={GRAD_BORDER} />
      <div className="bg-zinc-900/40 rounded-[11px] overflow-hidden h-full">
        {children}
      </div>
    </div>
  );
}

export default function MaterialBrowser() {
  const t = useTranslations("Crafting.materials");
  const { blueprints: apiBps, materials: apiMats, loading, error } = useCraftingData();

  const materials = apiMats.length > 0 ? apiMats : (error ? MOCK_MATERIALS : apiMats);
  const blueprints = apiBps.length > 0 ? apiBps : (error ? (MOCK_BLUEPRINTS_FOR_BROWSER as Blueprint[]) : apiBps);

  const [sortBy, setSortBy] = useState<"name" | "usage">("name");
  const [search, setSearch] = useState("");

  const sorted = useMemo(() => {
    let list = [...materials];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((m) => m.resourceName.toLowerCase().includes(q));
    }
    switch (sortBy) {
      case "usage":
        list.sort((a, b) => b.blueprintCount - a.blueprintCount);
        break;
      case "name":
      default:
        list.sort((a, b) => a.resourceName.localeCompare(b.resourceName));
    }
    return list;
  }, [materials, sortBy, search]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-4 h-4 border-2 border-zinc-800 border-t-amber-500 rounded-full animate-spin mr-3" />
        <span className="text-xs text-zinc-500 font-mono uppercase tracking-widest">{t("loading")}</span>
      </div>
    );
  }

  if (error && materials.length === 0) {
    return <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">{error}</div>;
  }

  return (
    <div className="max-w-7xl space-y-4">

      {/* Controls */}
      <Card>
        <div className="px-5 py-3.5 border-b border-zinc-800/60 bg-zinc-950/30">
          <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-widest">{t("search")}</h3>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-[9px] text-zinc-500 uppercase tracking-widest block mb-2">{t("search")}</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="w-full px-3 py-2 bg-zinc-800/60 border border-zinc-700/50 rounded-lg text-zinc-100 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60 transition-colors"
            />
          </div>
          <div>
            <label className="text-[9px] text-zinc-500 uppercase tracking-widest block mb-2">{t("sortBy")}</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "name" | "usage")}
              className="w-full px-3 py-2 bg-zinc-800/60 border border-zinc-700/50 rounded-lg text-zinc-100 text-sm focus:outline-none focus:border-amber-500/60 transition-colors"
            >
              <option value="name">{t("sortName")}</option>
              <option value="usage">{t("sortUsage")}</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Count */}
      <div className="text-[10px] text-zinc-600 uppercase tracking-widest px-1">
        {sorted.length} {sorted.length === 1 ? "material" : "materiales"}
      </div>

      {/* Materials Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sorted.map((mat) => {
          const usedInBlueprints = blueprints.filter((bp) =>
            bp.parts.some((p) =>
              p.materials.some((m) => m.resourceUuid === mat.resourceUuid)
            )
          );

          const formatBox = (n: number) =>
            Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, "");

          return (
            <Card key={mat.resourceUuid}>
              {/* Header */}
              <div className="px-5 py-3.5 border-b border-zinc-800/60 bg-zinc-950/30 flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-bold text-amber-400">{mat.resourceName}</h3>
                  {mat.resourceKey && (
                    <p className="text-[9px] text-zinc-600 font-mono mt-0.5">{mat.resourceKey}</p>
                  )}
                </div>
                {mat.refinedName && (
                  <span className="text-[9px] px-2 py-0.5 bg-cyan-500/10 text-cyan-400 rounded-full border border-cyan-500/20 whitespace-nowrap ml-2 flex-shrink-0">
                    → {mat.refinedName}
                  </span>
                )}
              </div>

              {/* Body */}
              <div className="p-4 space-y-3">
                {mat.description && (
                  <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2">{mat.description}</p>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-zinc-950/50 rounded-lg p-2.5 border border-emerald-500/10">
                    <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1">{t("usedInBlueprints")}</div>
                    <div className="font-mono text-base font-bold text-emerald-400">{mat.blueprintCount}</div>
                  </div>
                  <div className="bg-zinc-950/50 rounded-lg p-2.5 border border-cyan-500/10">
                    <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1">{t("totalScuAcross")}</div>
                    <div className="font-mono text-base font-bold text-cyan-400">{mat.totalScuUsed.toFixed(1)} <span className="text-xs font-normal text-cyan-500/50">SCU</span></div>
                  </div>
                </div>

                {mat.boxSizes.length > 0 && (
                  <div>
                    <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1.5">{t("containerSizes")}</div>
                    <div className="flex flex-wrap gap-1">
                      {mat.boxSizes.map((size) => (
                        <span key={size} className="text-[9px] px-2 py-0.5 bg-zinc-800/50 text-zinc-300 rounded-full border border-zinc-700/40 font-mono">
                          {formatBox(size)} SCU
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {usedInBlueprints.length > 0 && (
                  <div className="pt-2 border-t border-zinc-800/40">
                    <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1.5">{t("usedInLabel")}</div>
                    <div className="flex flex-wrap gap-1">
                      {usedInBlueprints.slice(0, 3).map((bp) => (
                        <span key={bp.uuid} className="text-[9px] px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded-full border border-amber-500/20">
                          {bp.outputName}
                        </span>
                      ))}
                      {usedInBlueprints.length > 3 && (
                        <span className="text-[9px] px-2 py-0.5 bg-zinc-800/50 text-zinc-500 rounded-full">
                          +{usedInBlueprints.length - 3}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
