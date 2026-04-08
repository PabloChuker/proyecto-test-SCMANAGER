"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import ComponentSearch from "./ComponentSearch";

interface InventoryItem {
  id: string;
  item_reference: string;
  item_name: string;
  item_type: string;
  item_size: number | null;
  item_grade: string | null;
  quantity: number;
  notes: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  WEAPON: "🔫 Arma", SHIELD: "🛡 Shield", POWER_PLANT: "⚡ Power Plant",
  COOLER: "❄ Cooler", QUANTUM_DRIVE: "🌀 Quantum", MISSILE: "🚀 Misil",
};

export default function InventoryTab() {
  const { user } = useAuth();
  const supabase = createClient();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("user_inventory")
      .select("*")
      .eq("user_id", user.id)
      .order("item_type")
      .order("item_name");
    setItems((data ?? []) as InventoryItem[]);
    setLoading(false);
  }, [user, supabase]);

  useEffect(() => { load(); }, [load]);

  const addItem = useCallback(async (component: { reference: string; name: string; type: string; size: number | null; grade: string | null }) => {
    if (!user) return;
    setAdding(true);
    // Check if already in inventory — if so, increment quantity
    const existing = items.find((i) => i.item_reference === component.reference);
    if (existing) {
      await supabase.from("user_inventory").update({ quantity: existing.quantity + 1 }).eq("id", existing.id);
    } else {
      await supabase.from("user_inventory").insert({
        user_id: user.id,
        item_reference: component.reference,
        item_name: component.name,
        item_type: component.type,
        item_size: component.size,
        item_grade: component.grade,
      });
    }
    await load();
    setAdding(false);
  }, [user, supabase, items, load]);

  const removeItem = useCallback(async (id: string) => {
    await supabase.from("user_inventory").delete().eq("id", id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, [supabase]);

  const updateQty = useCallback(async (id: string, qty: number) => {
    if (qty < 1) return;
    await supabase.from("user_inventory").update({ quantity: qty }).eq("id", id);
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, quantity: qty } : i)));
  }, [supabase]);

  const filtered = filter
    ? items.filter((i) => i.item_name.toLowerCase().includes(filter.toLowerCase()) || i.item_type.toLowerCase().includes(filter.toLowerCase()))
    : items;

  // Group by type
  const grouped = filtered.reduce((acc, item) => {
    if (!acc[item.item_type]) acc[item.item_type] = [];
    acc[item.item_type].push(item);
    return acc;
  }, {} as Record<string, InventoryItem[]>);

  if (loading) return <div className="text-zinc-500 animate-pulse text-center py-8">Cargando inventario...</div>;

  return (
    <div className="space-y-5">
      {/* Add from catalog */}
      <ComponentSearch
        onSelect={addItem}
        disabled={adding}
        buttonLabel="+ Inventario"
        placeholder="Buscar componente para agregar al inventario..."
      />

      {/* Filter */}
      {items.length > 0 && (
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtrar inventario..."
          className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-amber-500 focus:outline-none"
        />
      )}

      {/* Inventory list */}
      {items.length === 0 ? (
        <div className="text-center text-zinc-600 py-8">
          <div className="text-3xl mb-2">📦</div>
          Tu inventario esta vacio. Busca componentes arriba para agregarlos.
        </div>
      ) : (
        Object.entries(grouped).map(([type, typeItems]) => (
          <div key={type} className="space-y-1.5">
            <h3 className="text-xs text-zinc-500 uppercase tracking-wider">
              {TYPE_LABELS[type] ?? type} ({typeItems.length})
            </h3>
            {typeItems.map((item) => (
              <div key={item.id} className="flex items-center gap-3 p-2 rounded border border-zinc-800/40 bg-zinc-900/30">
                <div className="flex-1">
                  <span className="text-sm text-zinc-200">{item.item_name}</span>
                  {item.item_size && <span className="text-[10px] text-zinc-500 ml-1.5">S{item.item_size}</span>}
                  {item.item_grade && <span className="text-[10px] text-amber-500/60 ml-1">G{item.item_grade}</span>}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => updateQty(item.id, item.quantity - 1)} disabled={item.quantity <= 1} className="w-5 h-5 rounded bg-zinc-800 text-zinc-400 text-xs hover:bg-zinc-700 disabled:opacity-30">-</button>
                  <span className="text-xs text-zinc-300 w-6 text-center">{item.quantity}</span>
                  <button onClick={() => updateQty(item.id, item.quantity + 1)} className="w-5 h-5 rounded bg-zinc-800 text-zinc-400 text-xs hover:bg-zinc-700">+</button>
                </div>
                <button onClick={() => removeItem(item.id)} className="text-zinc-600 hover:text-red-400 text-xs">✕</button>
              </div>
            ))}
          </div>
        ))
      )}

      {items.length > 0 && (
        <div className="text-xs text-zinc-600 text-center">
          {items.reduce((a, i) => a + i.quantity, 0)} componentes totales en inventario
        </div>
      )}
    </div>
  );
}
