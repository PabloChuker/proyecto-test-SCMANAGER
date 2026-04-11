// =============================================================================
// AL FILO — WishlistGrid
//
// Muestra las naves en la wishlist del usuario como tarjetas.
// Permite: eliminar, editar prioridad/precio objetivo, mover a My Fleet.
// =============================================================================

"use client";

import { useState } from "react";
import Link from "next/link";
import { useHangarStore, type HangarWishlistItem, type WishlistPriority } from "@/store/useHangarStore";

const MFR_PREFIXES = [
  "Aegis", "RSI", "Drake", "MISC", "Anvil", "Origin", "Crusader", "Argo",
  "Aopoa", "Consolidated Outland", "Esperia", "Gatac", "Greycat", "Kruger",
  "Musashi Industrial", "Tumbril", "Banu", "Vanduul", "Roberts Space Industries",
  "Crusader Industries", "Musashi", "CO",
];

function getShipThumbUrl(name: string, manufacturer?: string | null): string {
  let n = name || "";
  if (manufacturer) {
    const m = manufacturer.trim();
    if (n.startsWith(m + " ")) n = n.slice(m.length + 1);
  }
  for (const m of MFR_PREFIXES) {
    if (n.startsWith(m + " ")) { n = n.slice(m.length + 1); break; }
  }
  const slug = n.toLowerCase().replace(/[''()]/g, "").replace(/\s+/g, "-").replace(/[^a-z0-9._-]/g, "-").replace(/-+/g, "-").replace(/-$/, "");
  return `/ships/${slug}.webp`;
}

const PRIORITY_CONFIG: Record<WishlistPriority, { label: string; color: string; border: string }> = {
  high: { label: "Alta", color: "text-red-400", border: "border-red-500/40" },
  medium: { label: "Media", color: "text-amber-400", border: "border-amber-500/40" },
  low: { label: "Baja", color: "text-zinc-400", border: "border-zinc-600/40" },
};

interface WishlistGridProps {
  items: HangarWishlistItem[];
}

export function WishlistGrid({ items }: WishlistGridProps) {
  const removeFromWishlist = useHangarStore((s) => s.removeFromWishlist);
  const updateWishlistItem = useHangarStore((s) => s.updateWishlistItem);
  const moveWishlistToFleet = useHangarStore((s) => s.moveWishlistToFleet);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div className="text-center py-16 px-8">
        <p className="text-lg text-zinc-400 font-medium mb-2">Tu wishlist está vacía</p>
        <p className="text-sm text-zinc-500 mb-4 max-w-lg mx-auto">
          Agregá naves desde la página de detalle (botón &quot;Agregar a Wishlist&quot;) o haciendo click derecho en cualquier nave de la lista.
        </p>
        <Link
          href="/ships"
          className="inline-block px-6 py-2.5 bg-fuchsia-500/20 border border-fuchsia-500/50 rounded-sm text-fuchsia-400 text-sm font-medium hover:bg-fuchsia-500/30 transition-all duration-300"
        >
          Explorar Naves →
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {items.map((item) => {
        const thumbUrl = getShipThumbUrl(item.shipName, item.manufacturer);
        const priority = PRIORITY_CONFIG[item.priority];
        const isEditing = editingId === item.id;

        return (
          <div
            key={item.id}
            className={`relative overflow-hidden rounded-sm bg-zinc-900/70 border ${priority.border} transition-all hover:border-fuchsia-500/40`}
          >
            {/* Imagen */}
            <Link href={`/ships/${item.shipReference}`} className="block relative h-[110px] overflow-hidden group">
              <div
                className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
                style={{ backgroundImage: `url(${thumbUrl})` }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/30 to-transparent" />
              <div className={`absolute top-2 left-2 px-2 py-0.5 rounded-sm bg-zinc-950/70 backdrop-blur-sm border ${priority.border}`}>
                <span className={`text-[10px] font-mono uppercase tracking-wider ${priority.color}`}>
                  ★ {priority.label}
                </span>
              </div>
              {item.targetPrice != null && item.targetPrice > 0 && (
                <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-sm bg-zinc-950/70 backdrop-blur-sm">
                  <span className="text-[10px] font-mono text-amber-400">${item.targetPrice}</span>
                </div>
              )}
            </Link>

            {/* Cuerpo */}
            <div className="px-3 py-3">
              <h3 className="text-sm font-medium text-zinc-100 truncate mb-1">{item.shipName}</h3>
              <p className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 mb-2">
                {item.manufacturer || "Unknown"}
              </p>

              {isEditing ? (
                <div className="space-y-2 mb-3">
                  <div>
                    <label className="text-[9px] uppercase tracking-widest text-zinc-500 block mb-0.5">Prioridad</label>
                    <select
                      value={item.priority}
                      onChange={(e) => updateWishlistItem(item.id, { priority: e.target.value as WishlistPriority })}
                      className="w-full bg-zinc-800/60 border border-zinc-700/60 rounded-sm px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-fuchsia-500/50"
                    >
                      <option value="high">Alta</option>
                      <option value="medium">Media</option>
                      <option value="low">Baja</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] uppercase tracking-widest text-zinc-500 block mb-0.5">Precio Objetivo (USD)</label>
                    <input
                      type="number"
                      min={0}
                      value={item.targetPrice ?? ""}
                      onChange={(e) => updateWishlistItem(item.id, { targetPrice: e.target.value ? parseFloat(e.target.value) : null })}
                      placeholder="—"
                      className="w-full bg-zinc-800/60 border border-zinc-700/60 rounded-sm px-2 py-1 text-xs font-mono text-zinc-100 focus:outline-none focus:border-fuchsia-500/50"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] uppercase tracking-widest text-zinc-500 block mb-0.5">Notas</label>
                    <textarea
                      value={item.notes}
                      onChange={(e) => updateWishlistItem(item.id, { notes: e.target.value })}
                      placeholder="Motivo, rol, estrategia..."
                      rows={2}
                      className="w-full bg-zinc-800/60 border border-zinc-700/60 rounded-sm px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-fuchsia-500/50 resize-none"
                    />
                  </div>
                </div>
              ) : (
                item.notes && (
                  <p className="text-[11px] text-zinc-400 line-clamp-2 mb-2 italic">&quot;{item.notes}&quot;</p>
                )
              )}

              {/* Fecha */}
              <div className="text-[9px] text-zinc-600 mb-2">
                Agregada: {new Date(item.addedDate).toLocaleDateString()}
              </div>

              {/* Acciones */}
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setEditingId(isEditing ? null : item.id)}
                  className="flex-1 px-2 py-1 text-[10px] bg-zinc-800/60 hover:bg-zinc-700/60 border border-zinc-700/60 rounded-sm text-zinc-300 transition-colors"
                >
                  {isEditing ? "Listo" : "Editar"}
                </button>
                <button
                  onClick={() => moveWishlistToFleet(item.id)}
                  title="Mover a My Fleet"
                  className="flex-1 px-2 py-1 text-[10px] bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 rounded-sm text-cyan-400 transition-colors"
                >
                  → Fleet
                </button>
                {confirmDelete === item.id ? (
                  <>
                    <button
                      onClick={() => { removeFromWishlist(item.id); setConfirmDelete(null); }}
                      className="px-2 py-1 text-[10px] bg-red-500/30 border border-red-500/50 rounded-sm text-red-400 font-medium hover:bg-red-500/40 transition-colors"
                    >
                      Sí
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="px-2 py-1 text-[10px] bg-zinc-800/60 border border-zinc-700/60 rounded-sm text-zinc-400 hover:bg-zinc-800 transition-colors"
                    >
                      No
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(item.id)}
                    title="Eliminar de la wishlist"
                    className="px-2 py-1 text-[10px] bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-sm text-red-400/80 hover:text-red-400 transition-colors"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
