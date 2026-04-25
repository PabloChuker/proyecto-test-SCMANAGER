"use client";

// =============================================================================
// WishlistList — vista lista de la wishlist (Fase T)
// =============================================================================

import { useState } from "react";
import Link from "next/link";
import { useHangarStore, type HangarWishlistItem, type WishlistPriority } from "@/store/useHangarStore";

const PRIORITY_CONFIG: Record<WishlistPriority, { label: string; color: string; border: string; bg: string }> = {
  high:   { label: "Alta",  color: "text-red-300",   border: "border-red-500/40",   bg: "bg-red-500/15" },
  medium: { label: "Media", color: "text-amber-300", border: "border-amber-500/40", bg: "bg-amber-500/15" },
  low:    { label: "Baja",  color: "text-zinc-400",  border: "border-zinc-600/40",  bg: "bg-zinc-700/15" },
};

interface WishlistListProps {
  items: HangarWishlistItem[];
}

export function WishlistList({ items }: WishlistListProps) {
  if (items.length === 0) {
    return (
      <div className="text-center py-12 px-8 border border-zinc-800/50 rounded-sm bg-zinc-900/30">
        <p className="text-sm text-zinc-400 font-medium mb-2">Your wishlist is empty</p>
        <Link
          href="/ships"
          className="inline-block px-4 py-2 bg-fuchsia-500/20 border border-fuchsia-500/50 rounded-sm text-fuchsia-400 text-xs font-medium hover:bg-fuchsia-500/30 transition-all duration-300"
        >
          Explore Ships →
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-sm border border-zinc-800/60 bg-zinc-900/40">
      <div className="hidden md:flex items-center gap-3 px-3 py-2 border-b border-zinc-800/60 bg-zinc-900/60 text-[9px] tracking-[0.15em] uppercase text-zinc-500 font-mono">
        <div className="flex-1">Ship</div>
        <div className="w-32 text-center">Manufacturer</div>
        <div className="w-20 text-center">Priority</div>
        <div className="w-24 text-right">Target $</div>
        <div className="w-24 text-center">Added</div>
        <div className="flex-1 max-w-[220px]">Notes</div>
        <div className="w-32 text-right">Actions</div>
      </div>
      <div className="divide-y divide-zinc-800/40">
        {items.map((item) => (
          <WishlistRow key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

function WishlistRow({ item }: { item: HangarWishlistItem }) {
  const removeFromWishlist = useHangarStore((s) => s.removeFromWishlist);
  const updateWishlistItem = useHangarStore((s) => s.updateWishlistItem);
  const moveWishlistToFleet = useHangarStore((s) => s.moveWishlistToFleet);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const priority = PRIORITY_CONFIG[item.priority];

  return (
    <div className="group flex items-center gap-3 px-3 py-2 hover:bg-zinc-800/30 transition-colors text-[12px]">
      <Link href={`/ships/${item.shipReference}`} className="flex-1 min-w-0 text-zinc-200 hover:text-fuchsia-300 truncate font-medium">
        {item.shipName}
      </Link>

      <div className="w-32 text-center hidden md:block text-[10px] text-zinc-500 truncate">
        {item.manufacturer || "—"}
      </div>

      <div className="w-20 text-center hidden md:block">
        <select
          value={item.priority}
          onChange={(e) => updateWishlistItem(item.id, { priority: e.target.value as WishlistPriority })}
          className={`text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-[2px] border bg-transparent ${priority.border} ${priority.color} focus:outline-none cursor-pointer`}
        >
          <option value="high">★ Alta</option>
          <option value="medium">★ Media</option>
          <option value="low">★ Baja</option>
        </select>
      </div>

      <div className="w-24 text-right hidden md:block">
        <input
          type="number"
          min={0}
          value={item.targetPrice ?? ""}
          onChange={(e) => updateWishlistItem(item.id, { targetPrice: e.target.value ? parseFloat(e.target.value) : null })}
          placeholder="—"
          className="w-full bg-transparent border border-zinc-800/60 rounded-[2px] px-1.5 py-0.5 text-[10px] font-mono text-amber-300/80 text-right focus:outline-none focus:border-fuchsia-500/40"
        />
      </div>

      <div className="w-24 text-center hidden md:block text-[10px] text-zinc-600 font-mono">
        {new Date(item.addedDate).toLocaleDateString("en-GB", { year: "2-digit", month: "short", day: "2-digit" })}
      </div>

      <div className="flex-1 max-w-[220px] hidden md:block">
        <input
          type="text"
          value={item.notes}
          onChange={(e) => updateWishlistItem(item.id, { notes: e.target.value })}
          placeholder="Notes..."
          className="w-full bg-transparent border border-zinc-800/60 rounded-[2px] px-1.5 py-0.5 text-[10px] text-zinc-400 focus:outline-none focus:border-fuchsia-500/40"
        />
      </div>

      <div className="w-32 flex justify-end gap-1 flex-shrink-0">
        <button
          onClick={() => moveWishlistToFleet(item.id)}
          className="text-[10px] px-2 py-1 text-zinc-400 hover:text-cyan-300 border border-zinc-800/60 hover:border-cyan-500/40 rounded-[2px] transition-colors"
          title="Move to My Fleet"
        >
          → Fleet
        </button>
        {confirmDelete ? (
          <button
            onClick={() => { removeFromWishlist(item.id); setConfirmDelete(false); }}
            className="text-[10px] px-2 py-1 text-rose-400 bg-rose-500/10 border border-rose-500/40 rounded-[2px]"
          >
            Confirm
          </button>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-[10px] px-2 py-1 text-zinc-500 hover:text-rose-400 border border-zinc-800/60 hover:border-rose-500/40 rounded-[2px] transition-colors"
            title="Delete"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
