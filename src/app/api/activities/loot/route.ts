import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET() {
  try {
    const rows = await sql<
      {
        id: string;
        name: string;
        category: string;
        subcategory: string | null;
        rarity: string;
        estimated_value: number;
        source: string | null;
      }[]
    >`SELECT id, name, category, subcategory, rarity, estimated_value, source FROM loot_items ORDER BY category, name`;

    const items = rows.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      subcategory: r.subcategory ?? "",
      rarity: r.rarity,
      estimatedValue: r.estimated_value,
      source: r.source ?? "",
    }));

    return NextResponse.json(items);
  } catch (err) {
    console.error("GET /api/activities/loot error:", err);
    const fallback = await import("@/data/activities/loot-items.json");
    return NextResponse.json(fallback.default ?? fallback);
  }
}
