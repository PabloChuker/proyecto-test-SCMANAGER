// =============================================================================
// SC LABS — GET /api/mining/materials
//
// Devuelve la data del Material Finder de mineria:
//   - materials[]       : nombres unicos de materiales
//   - signatures[]      : (material, method) con rs, tier, instability, resistance
//   - locations[]       : (name, system)
//   - yields[]          : (location, system, method, material, chance_pct)
//
// Fuente: tablas `mining_materials`, `mining_material_signatures`,
// `mining_locations`, `mining_location_yields` (migracion 050).
//
// Si las tablas no existen todavia (migracion no aplicada en prod), devuelve
// { data: null, datasetVersion: null, source: 'missing-tables' } para que la
// UI muestre un warning en vez de romper.
// =============================================================================

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const revalidate = 60; // 1 min — reducido desde 600 para evitar cachear fallbacks "missing-tables" por 10 min tras aplicar migraciones

type MaterialRow = { name: string };
type SignatureRow = {
  material_name: string;
  method: "Ship" | "ROC" | "Hand";
  radar_signature: number | null;
  tier: string | null;
  instability: number | null;
  resistance: number | null;
  note: string | null;
  dataset_version: string;
};
type LocationRow = { name: string; system: string };
type YieldRow = {
  location_name: string;
  system: string;
  method: "Ship" | "ROC" | "Hand";
  material_name: string;
  chance_pct: number;
};
type VariantRow = {
  material_name: string;
  method: "Ship" | "ROC" | "Hand";
  radar_signature: number;
  sort_order: number;
};

export async function GET() {
  try {
    const [materials, signatures, variants, locations, yields] = await Promise.all([
      sql<MaterialRow[]>`
        SELECT name FROM mining_materials ORDER BY name ASC
      `,
      sql<SignatureRow[]>`
        SELECT material_name, method, radar_signature, tier,
               instability, resistance, note, dataset_version
        FROM mining_material_signatures
        ORDER BY material_name ASC, method ASC
      `,
      // 051 — firmas multiples por (material, metodo). Puede no existir aun.
      (async () => {
        try {
          return await sql<VariantRow[]>`
            SELECT material_name, method, radar_signature, sort_order
            FROM mining_material_signature_variants
            ORDER BY material_name ASC, method ASC, sort_order ASC
          `;
        } catch {
          return [] as VariantRow[];
        }
      })(),
      sql<LocationRow[]>`
        SELECT name, system FROM mining_locations
        ORDER BY system ASC, name ASC
      `,
      sql<YieldRow[]>`
        SELECT location_name, system, method, material_name, chance_pct
        FROM mining_location_yields
        ORDER BY location_name ASC, method ASC, chance_pct DESC
      `,
    ]);

    const datasetVersion =
      (signatures as any[])[0]?.dataset_version ?? "unknown";

    // Agrupar variants por (material, method) => array de radar_signatures.
    const variantMap: Record<string, number[]> = {};
    for (const v of variants as any[]) {
      const key = `${v.material_name}|${v.method}`;
      if (!variantMap[key]) variantMap[key] = [];
      variantMap[key].push(Number(v.radar_signature));
    }

    return NextResponse.json({
      data: {
        materials: (materials as any[]).map((m) => m.name),
        signatures: (signatures as any[]).map((s) => {
          const key = `${s.material_name}|${s.method}`;
          const variantSigs = variantMap[key] ?? [];
          return {
            material: s.material_name,
            method: s.method,
            radarSignature:
              s.radar_signature !== null ? Number(s.radar_signature) : null,
            // Array de firmas alternativas (rock type IDs). Incluye la base.
            radarSignatures: variantSigs.length
              ? variantSigs
              : s.radar_signature !== null
              ? [Number(s.radar_signature)]
              : [],
            tier: s.tier,
            instability: s.instability !== null ? Number(s.instability) : null,
            resistance: s.resistance !== null ? Number(s.resistance) : null,
            note: s.note,
          };
        }),
        locations: (locations as any[]).map((l) => ({
          name: l.name,
          system: l.system,
        })),
        yields: (yields as any[]).map((y) => ({
          location: y.location_name,
          system: y.system,
          method: y.method,
          material: y.material_name,
          chance: Number(y.chance_pct),
        })),
      },
      datasetVersion,
      source: "db",
    });
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (/relation.*does not exist/i.test(msg)) {
      return NextResponse.json({
        data: null,
        datasetVersion: null,
        source: "missing-tables",
      });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
