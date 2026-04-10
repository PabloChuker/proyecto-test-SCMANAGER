// =============================================================================
// AL FILO — GET /api/crafting/blueprints
//
// Returns all blueprints from DB with materials, quality modifiers, reward
// pools, and category tree. Replaces the old static JSON approach.
//
// Response shape:
//   { blueprints: Blueprint[], categories: Category[] }
// =============================================================================

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

// ─── Types ──────────────────────────────────────────────────────────────────

interface MaterialEntry {
  resourceUuid: string;
  resourceName: string;
  resourceKey: string;
  description: string;
  refinedName: string | null;
  boxSizes: number[];
  quantityScu: number;
  minQuality: number;
}

interface ModifierEntry {
  propertyKey: string;
  qualityMin: number;
  qualityMax: number;
  atMinQuality: number;
  atMaxQuality: number;
}

interface Part {
  groupKey: string;
  groupName: string;
  requiredCount: number;
  materials: MaterialEntry[];
  modifiers: ModifierEntry[];
}

interface RewardPool {
  poolUuid: string;
  poolKey: string;
}

interface Blueprint {
  uuid: string;
  key: string;
  kind: string;
  outputName: string;
  outputClass: string;
  outputType: string;
  outputSubtype: string;
  outputGrade: string;
  tierIndex: number;
  craftTimeSeconds: number;
  isDefault: boolean;
  parts: Part[];
  qualityEffects: Record<string, { atMinQuality: number; atMaxQuality: number }>;
  rewardPools: RewardPool[];
}

interface SubCategory {
  id: string;
  name: string;
  count: number;
}

interface Category {
  id: string;
  name: string;
  subCategories: SubCategory[];
  count: number;
}

export async function GET() {
  try {
    // ── 1. Load all blueprints ──
    const bpRows: any[] = await sql.unsafe(`
      SELECT uuid, key, kind, category_uuid, output_uuid,
             output_class, output_type, output_subtype, output_grade,
             output_name, tier_index, craft_time_seconds, "default"
      FROM blueprints
      ORDER BY output_type, output_subtype, output_name
    `, []);

    // ── 2. Load all materials (grouped), enriched with resource metadata
    //       (description, key, refining chain) and container box sizes. ──
    const matRows: any[] = await sql.unsafe(`
      SELECT
        bm.id, bm.blueprint_uuid, bm.group_key, bm.group_name, bm.required_count,
        bm.resource_uuid, bm.resource_name, bm.quantity_scu, bm.min_quality,
        bm.modifier_property_uuid, bm.modifier_property_key,
        bm.modifier_quality_min, bm.modifier_quality_max,
        bm.modifier_at_min_quality, bm.modifier_at_max_quality,
        r.key         AS resource_key,
        r.description AS resource_description,
        r.refined_uuid,
        r.refined_name,
        COALESCE(bs.sizes, '{}'::numeric[]) AS box_sizes
      FROM blueprint_materials bm
      LEFT JOIN resources r ON r.uuid = bm.resource_uuid
      LEFT JOIN LATERAL (
        SELECT array_agg(box_size ORDER BY box_size)::numeric[] AS sizes
        FROM resources_box_sizes
        WHERE resource_uuid = bm.resource_uuid
      ) bs ON TRUE
      ORDER BY bm.blueprint_uuid, bm.group_key, bm.resource_name
    `, []);

    // ── 3. Load reward pools ──
    const poolRows: any[] = await sql.unsafe(`
      SELECT id, blueprint_uuid, pool_uuid, pool_key
      FROM blueprint_rewardpool
      ORDER BY blueprint_uuid
    `, []);

    // ── 4. Index materials by blueprint_uuid ──
    const matByBp = new Map<string, any[]>();
    for (const row of matRows) {
      const bpId = String(row.blueprint_uuid);
      if (!matByBp.has(bpId)) matByBp.set(bpId, []);
      matByBp.get(bpId)!.push(row);
    }

    // ── 5. Index pools by blueprint_uuid ──
    const poolByBp = new Map<string, RewardPool[]>();
    for (const row of poolRows) {
      const bpId = String(row.blueprint_uuid);
      if (!poolByBp.has(bpId)) poolByBp.set(bpId, []);
      poolByBp.get(bpId)!.push({
        poolUuid: String(row.pool_uuid),
        poolKey: row.pool_key || "",
      });
    }

    // ── 6. Build blueprint objects ──
    const blueprints: Blueprint[] = [];
    const categoryMap = new Map<string, { subs: Map<string, number>; total: number }>();

    for (const bp of bpRows) {
      const bpId = String(bp.uuid);
      const rawMats = matByBp.get(bpId) || [];

      // Group materials by group_key
      const partMap = new Map<string, Part>();
      const qualityEffects: Record<string, { atMinQuality: number; atMaxQuality: number }> = {};

      for (const m of rawMats) {
        const gk = m.group_key || "UNKNOWN";
        if (!partMap.has(gk)) {
          partMap.set(gk, {
            groupKey: gk,
            groupName: m.group_name || gk,
            requiredCount: Number(m.required_count) || 1,
            materials: [],
            modifiers: [],
          });
        }
        const part = partMap.get(gk)!;

        // Add material (deduplicate by resource_uuid within same group)
        const alreadyHasMat = part.materials.some(
          (mat) => mat.resourceUuid === String(m.resource_uuid)
        );
        if (!alreadyHasMat) {
          const rawSizes = Array.isArray(m.box_sizes) ? m.box_sizes : [];
          const boxSizes = rawSizes
            .map((s: any) => Number(s))
            .filter((n: number) => !Number.isNaN(n));
          part.materials.push({
            resourceUuid: String(m.resource_uuid),
            resourceName: m.resource_name || "",
            resourceKey: m.resource_key || "",
            description: m.resource_description || "",
            refinedName: m.refined_name || null,
            boxSizes,
            quantityScu: Number(m.quantity_scu) || 0,
            minQuality: Number(m.min_quality) || 0,
          });
        }

        // Add modifier (quality effect)
        if (m.modifier_property_key) {
          const alreadyHasMod = part.modifiers.some(
            (mod) => mod.propertyKey === m.modifier_property_key
          );
          if (!alreadyHasMod) {
            part.modifiers.push({
              propertyKey: m.modifier_property_key,
              qualityMin: Number(m.modifier_quality_min) || 0,
              qualityMax: Number(m.modifier_quality_max) || 1000,
              atMinQuality: Number(m.modifier_at_min_quality) || 0,
              atMaxQuality: Number(m.modifier_at_max_quality) || 0,
            });
          }

          // Build top-level quality effects summary (merge across parts)
          const propKey = m.modifier_property_key;
          if (!qualityEffects[propKey]) {
            qualityEffects[propKey] = {
              atMinQuality: Number(m.modifier_at_min_quality) || 0,
              atMaxQuality: Number(m.modifier_at_max_quality) || 0,
            };
          }
          // Some blueprints have same property across parts — take the one
          // with the biggest range
          const existing = qualityEffects[propKey];
          const range = Math.abs(
            (Number(m.modifier_at_max_quality) || 0) - (Number(m.modifier_at_min_quality) || 0)
          );
          const existingRange = Math.abs(existing.atMaxQuality - existing.atMinQuality);
          if (range > existingRange) {
            qualityEffects[propKey] = {
              atMinQuality: Number(m.modifier_at_min_quality) || 0,
              atMaxQuality: Number(m.modifier_at_max_quality) || 0,
            };
          }
        }
      }

      const outputType = bp.output_type || "Other";
      const outputSubtype = bp.output_subtype || "General";

      // Track categories
      if (!categoryMap.has(outputType)) {
        categoryMap.set(outputType, { subs: new Map(), total: 0 });
      }
      const cat = categoryMap.get(outputType)!;
      cat.total++;
      cat.subs.set(outputSubtype, (cat.subs.get(outputSubtype) || 0) + 1);

      blueprints.push({
        uuid: bpId,
        key: bp.key || "",
        kind: bp.kind || "creation",
        outputName: bp.output_name || "",
        outputClass: bp.output_class || "",
        outputType,
        outputSubtype,
        outputGrade: bp.output_grade || "",
        tierIndex: Number(bp.tier_index) || 0,
        craftTimeSeconds: Number(bp.craft_time_seconds) || 0,
        isDefault: bp.default === true,
        parts: Array.from(partMap.values()),
        qualityEffects,
        rewardPools: poolByBp.get(bpId) || [],
      });
    }

    // ── 7. Build category tree ──
    const categories: Category[] = [];
    for (const [typeName, data] of categoryMap) {
      const subCategories: SubCategory[] = [];
      for (const [subName, count] of data.subs) {
        subCategories.push({
          id: subName,
          name: subName,
          count,
        });
      }
      subCategories.sort((a, b) => a.name.localeCompare(b.name));
      categories.push({
        id: typeName,
        name: formatTypeName(typeName),
        subCategories,
        count: data.total,
      });
    }
    categories.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      blueprints,
      categories,
      meta: {
        totalBlueprints: blueprints.length,
        totalCategories: categories.length,
        defaultCount: blueprints.filter((b) => b.isDefault).length,
        withRewards: blueprints.filter((b) => b.rewardPools.length > 0).length,
      },
    });
  } catch (error: any) {
    console.error("[API /crafting/blueprints] Error:", error?.message || error);
    return NextResponse.json(
      { error: "Failed to load blueprints", detail: error?.message || "Unknown" },
      { status: 500 },
    );
  }
}

/** Convert output_type like "Char_Armor_Torso" → "Armor - Torso" */
function formatTypeName(raw: string): string {
  // Common patterns: Char_Armor_Torso, WeaponPersonal, WeaponAttachment
  if (raw.startsWith("Char_Armor_")) {
    const part = raw.replace("Char_Armor_", "");
    return `Armor - ${part}`;
  }
  if (raw === "WeaponPersonal") return "FPS Weapons";
  if (raw === "WeaponAttachment") return "Weapon Attachments";
  return raw.replace(/_/g, " ");
}
