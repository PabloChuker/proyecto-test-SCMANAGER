import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET() {
  try {
    const rows = await sql<
      {
        id: string;
        name: string;
        category: string;
        description: string | null;
        typical_loot: string[];
        min_players: number;
        max_players: number;
        difficulty: string;
      }[]
    >`SELECT id, name, category, description, typical_loot, min_players, max_players, difficulty FROM activity_types ORDER BY category, name`;

    const types = rows.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      description: r.description ?? "",
      typicalLoot: r.typical_loot ?? [],
      minPlayers: r.min_players,
      maxPlayers: r.max_players,
      difficulty: r.difficulty,
    }));

    return NextResponse.json(types);
  } catch (err) {
    console.error("GET /api/activities/types error:", err);
    // Fallback to static data
    const fallback = await import("@/data/activities/activity-types.json");
    return NextResponse.json(fallback.default ?? fallback);
  }
}
