"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";

interface Loadout {
  id: string;
  ship_id: string;
  ship_name: string;
  name: string;
  build_code: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface LoadoutItem {
  id: string;
  loadout_id: string;
  hardpoint_name: string;
  item_reference: string;
  item_name: string;
  item_type: string;
  item_size: number | null;
  in_inventory: boolean;
  in_wishlist: boolean;
}

const TYPE_ICONS: Record<string, string> = {
  WEAPON: "🔫", SHIELD: "🛡", POWER_PLANT: "⚡",
  COOLER: "❄", QUANTUM_DRIVE: "🌀", MISSILE: "🚀",
};

export default function LoadoutsTab() {
  const { user } = useAuth();
  const supabase = createClient();
  const [loadouts, setLoadouts] = useState<Loadout[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<LoadoutItem[]>([]);
  const [inventory, setInventory] = useState<Set<string>>(new Set());
  const [wishlist, setWishlist] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("user_loadouts")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    setLoadouts((data ?? []) as Loadout[]);

    // Load user's inventory and wishlist references for quick check
    const { data: inv } = await supabase.from("user_inventory").select("item_reference").eq("user_id", user.id);
    setInventory(new Set((inv ?? []).map((i) => i.item_reference)));

    const { data: wl } = await supabase.from("user_wishlist").select("item_reference").eq("user_id", user.id);
    setWishlist(new Set((wl ?? []).map((i) => i.item_reference)));

    setLoading(false);
  }, [user, supabase]);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = useCallback(async (loadoutId: string) => {
    if (expanded === loadoutId) {
      setExpanded(null);
      setExpandedItems([]);
      return;
    }
    setExpanded(loadoutId);
    const { data } = await supabase
      .from("loadout_items")
      .select("*")
      .eq("loadout_id", loadoutId)
      .order("item_type")
      .order("item_name");
    setExpandedItems((data ?? []) as LoadoutItem[]);
  }, [expanded, supabase]);

  const deleteLoadout = useCallback(async (id: string) => {
    await supabase.from("loadout_items").delete().eq("loadout_id", id);
    await supabase.from("user_loadouts").delete().eq("id", id);
    setLoadouts((prev) => prev.filter((l) => l.id !== id));
    if (expanded === id) { setExpanded(null); setExpandedItems([]); }
  }, [supabase, expanded]);

  const addToInventory = useCallback(async (item: LoadoutItem) => {
    if (!user) return;
    await supabase.from("user_inventory").upsert({
      user_id: user.id,
      item_reference: item.item_reference,
      item_name: item.item_name,
      item_type: item.item_type,
      item_size: item.item_size,
    }, { onConflict: "user_id,item_reference" });
    // Update loadout_item flag
    await supabase.from("loadout_items").update({ in_inventory: true }).eq("id", item.id);
    setExpandedItems((prev) => prev.map((i) => i.id === item.id ? { ...i, in_inventory: true } : i));
    setInventory((prev) => new Set(prev).add(item.item_reference));
  }, [user, supabase]);

  const addToWishlist = useCallback(async (item: LoadoutItem) => {
    if (!user) return;
    await supabase.from("user_wishlist").upsert({
      user_id: user.id,
      item_reference: item.item_reference,
      item_name: item.item_name,
      item_type: item.item_type,
      item_size: item.item_size,
      priority: 2,
    }, { onConflict: "user_id,item_reference" });
    await supabase.from("loadout_items").update({ in_wishlist: true }).eq("id", item.id);
    setExpandedItems((prev) => prev.map((i) => i.id === item.id ? { ...i, in_wishlist: true } : i));
    setWishlist((prev) => new Set(prev).add(item.item_reference));
  }, [user, supabase]);

  if (loading) return <div className="text-zinc-500 animate-pulse text-center py-8">Cargando loadouts...</div>;

  return (
    <div className="space-y-5">
      <div className="px-2.5 py-1.5 rounded bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-400/80">
        🔧 Guarda loadouts desde el <Link href="/ships" className="underline hover:text-amber-300">DPS Calculator</Link> con el boton &quot;Guardar Loadout&quot;
      </div>

      {loadouts.length === 0 ? (
        <div className="text-center text-zinc-600 py-8">
          <div className="text-3xl mb-2">🔧</div>
          No tenes loadouts guardados. Arma uno en el DPS Calculator y guardalo.
        </div>
      ) : (
        <div className="space-y-2">
          {loadouts.map((lo) => (
            <div key={lo.id} className="rounded border border-zinc-800/50 bg-zinc-900/40 overflow-hidden">
              {/* Header */}
              <div
                className="flex items-center gap-3 p-3 cursor-pointer hover:bg-zinc-800/30 transition-colors"
                onClick={() => toggleExpand(lo.id)}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-zinc-200 font-medium">{lo.name}</span>
                    <span className="text-[10px] text-amber-400/60 bg-amber-500/10 px-1.5 rounded">{lo.ship_name}</span>
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">
                    {new Date(lo.updated_at).toLocaleDateString("es-AR")}
                    {lo.notes && <span className="ml-2">{lo.notes}</span>}
                  </div>
                </div>
                <Link
                  href={`/ships?ship=${lo.ship_id}&build=${lo.build_code}`}
                  onClick={(e) => e.stopPropagation()}
                  className="px-2 py-1 text-[10px] bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded transition-colors"
                >
                  Abrir en DPS
                </Link>
                <button onClick={(e) => { e.stopPropagation(); deleteLoadout(lo.id); }} className="text-zinc-600 hover:text-red-400 text-xs">✕</button>
                <svg width="12" height="12" viewBox="0 0 12 12" className={`text-zinc-500 transition-transform ${expanded === lo.id ? "rotate-180" : ""}`}>
                  <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>

              {/* Expanded items */}
              {expanded === lo.id && (
                <div className="border-t border-zinc-800/30 px-3 py-2 space-y-1">
                  {expandedItems.length === 0 ? (
                    <div className="text-xs text-zinc-600 py-2">Sin componentes guardados</div>
                  ) : (
                    expandedItems.map((item) => {
                      const inInv = inventory.has(item.item_reference) || item.in_inventory;
                      const inWl = wishlist.has(item.item_reference) || item.in_wishlist;
                      return (
                        <div key={item.id} className="flex items-center gap-2 py-1">
                          <span className="text-xs">{TYPE_ICONS[item.item_type] ?? "📦"}</span>
                          <span className="text-xs text-zinc-300 flex-1">{item.item_name}</span>
                          {item.item_size && <span className="text-[9px] text-zinc-600">S{item.item_size}</span>}

                          {/* Status badges */}
                          {inInv ? (
                            <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-1 rounded border border-emerald-500/20">Tengo ✓</span>
                          ) : (
                            <button
                              onClick={() => addToInventory(item)}
                              className="text-[9px] text-zinc-500 hover:text-emerald-400 transition-colors px-1"
                              title="Marcar como en inventario"
                            >
                              + Inv
                            </button>
                          )}

                          {inWl ? (
                            <span className="text-[9px] bg-amber-500/10 text-amber-400 px-1 rounded border border-amber-500/20">Wishlist ⭐</span>
                          ) : !inInv ? (
                            <button
                              onClick={() => addToWishlist(item)}
                              className="text-[9px] text-zinc-500 hover:text-amber-400 transition-colors px-1"
                              title="Agregar a wishlist"
                            >
                              + WL
                            </button>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
