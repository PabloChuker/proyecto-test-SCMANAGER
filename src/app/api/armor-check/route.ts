// =============================================================================
// SC LABS — GET /api/armor-check
//
// Devuelve un set de armas del catálogo evaluadas contra la deflección de una
// nave. Implementa la fórmula 6.1 de VerseTools:
//
//     if Weapon Alpha (per-type) <= Armor Deflect Value → Damage = 0
//     if Weapon Alpha (per-type) >  Armor Deflect Value → daño completo
//
// Por cada tipo (Physical / Energy) devolvemos las `count` armas más cercanas
// al umbral — half que penetran y half que son deflectadas — ordenadas por
// |alpha - threshold|. Sirve para responder "¿qué arma necesito para perforar
// esta nave?".
//
// 2026-05-12: agregamos `mode=full` que devuelve TODAS las armas del catálogo
// ordenadas por alpha ascendente (Pablo pidió listado completo + filtros en
// un modal). En full mode el set ignora el slice de count.
//
// Params:
//   ?physical=N       (umbral physical, requerido — viene de ships.deflection_physical)
//   ?energy=N         (umbral energy, requerido)
//   ?gv=4.7.2         (game_version a filtrar; default LIVE actual)
//   ?count=6          (cuántas armas por tipo, default 6, ignorado si mode=full)
//   ?mode=full        (cuando esta seteado, devuelve TODAS las armas)
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { secureHeaders } from "@/lib/api-security";

export const revalidate = 300;

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
  /** True si alpha-per-type > umbral (penetra). */
  penetrates: boolean;
  /** Distancia firmada al umbral (alpha - threshold). */
  delta: number;
}

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl;
    const physical = Number(url.searchParams.get("physical") ?? "");
    const energy = Number(url.searchParams.get("energy") ?? "");
    const gv = url.searchParams.get("gv") ?? null;
    const count = Math.max(1, Math.min(20, Number(url.searchParams.get("count") ?? "6")));
    const mode = url.searchParams.get("mode") ?? "compact";
    const fullMode = mode === "full";

    if (!Number.isFinite(physical) || physical < 0) {
      return NextResponse.json({ error: "physical threshold required" }, { status: 400 });
    }
    if (!Number.isFinite(energy) || energy < 0) {
      return NextResponse.json({ error: "energy threshold required" }, { status: 400 });
    }

    // Pull weapons filtradas por game_version cuando se especifica. Excluimos
    // armas con alpha = 0 (defensivos / utility) y NPC-only obvious por
    // class_name. Limitamos a un set sano para el cliente (40 weapons cerca
    // de cada umbral por type, después se filtran client-side).
    const rows: any[] = await sql.unsafe(
      `SELECT
         w.class_name, w.name, w.size,
         w.grade, w.sub_type,
         m.name AS manufacturer,
         (COALESCE(w.alpha_physical,0))::float AS alpha_physical,
         (COALESCE(w.alpha_energy,0))::float   AS alpha_energy,
         (COALESCE(w.alpha_distortion,0))::float AS alpha_distortion,
         (COALESCE(w.alpha_physical,0)
          + COALESCE(w.alpha_energy,0)
          + COALESCE(w.alpha_distortion,0)
          + COALESCE(w.alpha_thermal,0))::float AS alpha_total
       FROM weapon_guns w
       LEFT JOIN manufacturers m ON m.id = w.manufacturer_id
       WHERE (COALESCE(w.alpha_physical,0)
              + COALESCE(w.alpha_energy,0)
              + COALESCE(w.alpha_distortion,0)
              + COALESCE(w.alpha_thermal,0)) > 0
         ${gv ? "AND w.game_version = $1" : ""}
       `,
      gv ? [gv] : [],
    );

    const all: ArmorCheckWeapon[] = rows.map((r) => ({
      className: r.class_name,
      name: r.name ?? r.class_name,
      size: r.size ?? null,
      manufacturer: r.manufacturer ?? null,
      grade: r.grade ?? null,
      itemClass: null,
      subType: r.sub_type ?? null,
      alphaPhysical: r.alpha_physical,
      alphaEnergy: r.alpha_energy,
      alphaDistortion: r.alpha_distortion,
      alphaTotal: r.alpha_total,
      penetrates: false,
      delta: 0,
    }));

    // Selecciona las `count` armas por tipo más cercanas al umbral, mezclando
    // las que penetran y las que no. La idea es ver el "borderline".
    const pickClosest = (arr: ArmorCheckWeapon[], alphaKey: keyof ArmorCheckWeapon, threshold: number): ArmorCheckWeapon[] => {
      const enriched = arr
        .filter((w) => Number(w[alphaKey] as number) > 0)
        .map((w) => {
          const a = Number(w[alphaKey] as number);
          return {
            ...w,
            penetrates: a > threshold,
            delta: a - threshold,
          };
        });
      // 50/50: half que penetran (delta > 0), ordenadas por delta asc
      // (más cercanas al umbral primero); half que no penetran (delta < 0),
      // ordenadas por |delta| asc.
      const half = Math.ceil(count / 2);
      const penetrating = enriched
        .filter((w) => w.penetrates)
        .sort((a, b) => a.delta - b.delta)
        .slice(0, half);
      const blocked = enriched
        .filter((w) => !w.penetrates)
        .sort((a, b) => b.delta - a.delta) // delta más cercano a 0
        .slice(0, count - penetrating.length);
      // Devolver ordenado por alpha desc (de mayor a menor) para que el user
      // vea primero las grandes que penetran.
      return [...penetrating, ...blocked].sort(
        (a, b) => Number(b[alphaKey] as number) - Number(a[alphaKey] as number),
      );
    };

    // Full mode: TODO el catálogo ordenado ASC por alpha-per-type, anotado con
    // penetrates/delta para que el cliente filtre y pinte ✓/✕. No corta por count.
    const enrichAllAsc = (
      arr: ArmorCheckWeapon[],
      alphaKey: keyof ArmorCheckWeapon,
      threshold: number,
    ): ArmorCheckWeapon[] => {
      return arr
        .filter((w) => Number(w[alphaKey] as number) > 0)
        .map((w) => {
          const a = Number(w[alphaKey] as number);
          return {
            ...w,
            penetrates: a > threshold,
            delta: a - threshold,
          };
        })
        .sort(
          (a, b) =>
            Number(a[alphaKey] as number) - Number(b[alphaKey] as number),
        );
    };

    const physicalCheck = fullMode
      ? enrichAllAsc(all, "alphaPhysical", physical)
      : pickClosest(all, "alphaPhysical", physical);
    const energyCheck = fullMode
      ? enrichAllAsc(all, "alphaEnergy", energy)
      : pickClosest(all, "alphaEnergy", energy);

    return NextResponse.json(
      {
        threshold: { physical, energy },
        gameVersion: gv,
        mode: fullMode ? "full" : "compact",
        physicalCheck,
        energyCheck,
        totalWeapons: all.length,
      },
      {
        headers: {
          ...secureHeaders(),
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  } catch (e: any) {
    console.error("[/api/armor-check]", e?.message || e);
    return NextResponse.json(
      { error: "armor-check failed", detail: e?.message ?? "unknown" },
      { status: 500 },
    );
  }
}
