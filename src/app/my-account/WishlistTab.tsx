"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import ComponentSearch from "./ComponentSearch";

interface WishlistItem {
  id: string;
  item_reference: string;
  item_name: string;
  item_type: string;
  item_size: number | null;
  item_grade: string | null;
  priority: number;
  notes: string | null;
}

const PRIORITY_COLORS = ["", "text-zinc-500", "text-zinc-300", "text-amber-400", "text-red-400"];

export default function WishlistTab() {
  const { user } = useAuth();
  const supabase = createClient();
  const t = useTranslations("MyAccount.wishlist");
  const tt = useTranslations("MyAccount.componentTypes");
  const TYPE_LABELS: Record<string, string> = {
    WEAPON: tt("weapon"), SHIELD: tt("shield"), POWER_PLANT: tt("powerPlant"),
    COOLER: tt("cooler"), QUANTUM_DRIVE: tt("quantum"), MISSILE: tt("missile"),
  };
  const PRIORITY_LABELS = ["", t("priorities.low"), t("priorities.normal"), t("priorities.high"), t("priorities.urgent")];
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("user_wishlist")
      .select("*")
      .eq("user_id", user.id)
      .order("priority", { ascending: false })
      .order("item_name");
    setItems((data ?? []) as WishlistItem[]);
    setLoading(false);
  }, [user, supabase]);

  useEffect(() => { load(); }, [load]);

  const addItem = useCallback(async (component: { reference: string; name: string; type: string; size: number | null; grade: string | null }) => {
    if (!user) return;
    if (items.some((i) => i.item_reference === component.reference)) return; // Already in wishlist
    setAdding(true);
    await supabase.from("user_wishlist").insert({
      user_id: user.id,
      item_reference: component.reference,
      item_name: component.name,
      item_type: component.type,
      item_size: component.size,
      item_grade: component.grade,
      priority: 2, // Normal by default
    });
    await load();
    setAdding(false);
  }, [user, supabase, items, load]);

  const removeItem = useCallback(async (id: string) => {
    await supabase.from("user_wishlist").delete().eq("id", id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, [supabase]);

  const setPriority = useCallback(async (id: string, priority: number) => {
    await supabase.from("user_wishlist").update({ priority }).eq("id", id);
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, priority } : i)));
  }, [supabase]);

  if (loading) return <div className="text-zinc-500 animate-pulse text-center py-8">{t("loading")}</div>;

  return (
    <div className="space-y-5">
      <ComponentSearch
        onSelect={addItem}
        disabled={adding}
        buttonLabel={t("addButton")}
        placeholder={t("searchPlaceholder")}
      />

      <div className="px-2.5 py-1.5 rounded bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-400/80">
        {t("hint")}
      </div>

      {items.length === 0 ? (
        <div className="text-center text-zinc-600 py-8">
          <div className="text-3xl mb-2">⭐</div>
          {t("empty")}
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 p-2.5 rounded border border-zinc-800/40 bg-zinc-900/30">
              <div className="flex-1">
                <span className="text-sm text-zinc-200">{item.item_name}</span>
                {item.item_size && <span className="text-[10px] text-zinc-500 ml-1.5">S{item.item_size}</span>}
                {item.item_grade && <span className="text-[10px] text-amber-500/60 ml-1">G{item.item_grade}</span>}
                <span className="text-[10px] text-zinc-600 ml-1.5">{TYPE_LABELS[item.item_type] ?? item.item_type}</span>
              </div>
              <div className="flex items-center gap-1">
                {[1, 2, 3].map((p) => (
                  <button
                    key={p}
                    onClick={() => setPriority(item.id, p)}
                    className={`w-5 h-5 rounded text-[10px] transition-all ${
                      item.priority >= p
                        ? p === 3 ? "bg-red-500/30 text-red-400 border border-red-500/40"
                          : p === 2 ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                          : "bg-zinc-600/30 text-zinc-400 border border-zinc-600/40"
                        : "bg-zinc-800 text-zinc-600 border border-zinc-700 hover:bg-zinc-700"
                    }`}
                    title={PRIORITY_LABELS[p]}
                  >
                    ★
                  </button>
                ))}
              </div>
              <button onClick={() => removeItem(item.id)} className="text-zinc-600 hover:text-red-400 text-xs">✕</button>
            </div>
          ))}
          <div className="text-xs text-zinc-600 text-center">
            {t("totalItems", { count: items.length })}
          </div>
        </div>
      )}
    </div>
  );
}
