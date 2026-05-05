// =============================================================================
// SC LABS — POST /api/chain-board/share
//
// Publica una cadena de la pizarra a la comunidad. Auth requerido (el owner_id
// se setea automáticamente desde auth.uid()). Calcula stats denormalizados
// (msrp_cost, total_cost, savings, steps_count, from/to ship name) a partir
// del snapshot para que el listing sea rápido.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface BoardNode {
  id: string;
  ship: { id: string; name: string; manufacturer: string | null; msrpUsd: number };
  position: { x: number; y: number };
}
interface BoardEdge {
  id: string;
  source: string;
  target: string;
  kind: string;
  price: number;
}
interface BoardSnapshot {
  version: number;
  nodes: BoardNode[];
  edges: BoardEdge[];
  savedAt: string;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { name, snapshot, tags } = body as {
      name?: string;
      snapshot?: BoardSnapshot;
      tags?: string[];
    };

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 400 });
    }
    if (!snapshot || snapshot.version !== 2 || !Array.isArray(snapshot.nodes) || !Array.isArray(snapshot.edges)) {
      return NextResponse.json({ error: "Snapshot inválido." }, { status: 400 });
    }
    if (snapshot.nodes.length < 2) {
      return NextResponse.json({ error: "La cadena necesita al menos 2 naves." }, { status: 400 });
    }

    // ── Compute denormalized stats ────────────────────────────────────────
    // Encontramos el "leaf" final (nodo sin outgoing edges) que tenga la
    // cadena más larga.
    const sourceIds = new Set(snapshot.edges.map((e) => e.source));
    const targetIds = new Set(snapshot.edges.map((e) => e.target));
    const leafs = snapshot.nodes.filter((n) => !sourceIds.has(n.id));
    const roots = snapshot.nodes.filter((n) => !targetIds.has(n.id));

    let bestLeaf: BoardNode | null = null;
    let bestLeafCost = 0;
    const incomingByTarget = new Map<string, BoardEdge>();
    for (const e of snapshot.edges) incomingByTarget.set(e.target, e);

    const computeUpstream = (nodeId: string, visited: Set<string>): number => {
      if (visited.has(nodeId)) return 0;
      visited.add(nodeId);
      const incoming = incomingByTarget.get(nodeId);
      if (!incoming) return 0;
      return computeUpstream(incoming.source, visited) + (incoming.price ?? 0);
    };

    for (const leaf of leafs.length > 0 ? leafs : snapshot.nodes) {
      const cost = computeUpstream(leaf.id, new Set());
      if (cost > bestLeafCost || bestLeaf === null) {
        bestLeaf = leaf;
        bestLeafCost = cost;
      }
    }

    // Encontrar el root de la cadena del bestLeaf
    let rootOfBest: BoardNode | null = null;
    if (bestLeaf) {
      const visited = new Set<string>();
      let current: BoardNode | undefined = bestLeaf;
      while (current && !visited.has(current.id)) {
        visited.add(current.id);
        const inE = incomingByTarget.get(current.id);
        if (!inE) {
          rootOfBest = current;
          break;
        }
        current = snapshot.nodes.find((n) => n.id === inE.source);
      }
      if (!rootOfBest && roots.length > 0) rootOfBest = roots[0];
    }

    const fromShipName = rootOfBest?.ship.name ?? snapshot.nodes[0]?.ship.name ?? null;
    const toShipName   = bestLeaf?.ship.name ?? snapshot.nodes[snapshot.nodes.length - 1]?.ship.name ?? null;
    const msrpCost     = bestLeaf?.ship.msrpUsd ?? 0;
    const totalCost    = Math.round(bestLeafCost * 100) / 100;
    const savings      = Math.round((msrpCost - totalCost) * 100) / 100;
    const stepsCount   = snapshot.edges.length;

    // Sanitize tags (max 5, max 20 chars each, alfanum + dash + space)
    const cleanTags: string[] = Array.isArray(tags)
      ? tags
          .filter((t) => typeof t === "string")
          .map((t) => t.trim().slice(0, 20))
          .filter((t) => t.length > 0 && /^[\w\s-]+$/.test(t))
          .slice(0, 5)
      : [];

    const { data, error } = await supabase
      .from("shared_chains")
      .insert({
        owner_id: user.id,
        name: name.trim().slice(0, 120),
        snapshot_json: snapshot,
        from_ship_name: fromShipName,
        to_ship_name: toShipName,
        steps_count: stepsCount,
        msrp_cost: msrpCost,
        total_cost: totalCost,
        savings,
        tags: cleanTags,
      })
      .select("id")
      .single();

    if (error) throw error;
    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (e: any) {
    console.error("[/api/chain-board/share POST]", e);
    return NextResponse.json({ error: e?.message ?? "Error interno" }, { status: 500 });
  }
}
