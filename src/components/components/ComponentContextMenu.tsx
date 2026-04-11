// =============================================================================
// SC LABS — ComponentContextMenu
//
// Menú contextual que aparece al hacer click derecho sobre un componente en
// las tablas de /components. Ofrece agregar el componente al inventario del
// usuario o a su wishlist (tablas user_inventory / user_wishlist en Supabase).
// =============================================================================

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";

export interface ComponentContextMenuTarget {
  reference: string;
  name: string;
  itemType: string; // Ej: WEAPON, SHIELD, POWER_PLANT, etc.
  size: number | null;
  grade: string | null;
  x: number;
  y: number;
}

interface ComponentContextMenuProps {
  target: ComponentContextMenuTarget | null;
  onClose: () => void;
}

type Toast = { kind: "inventory" | "wishlist" | "error" | "info"; message: string } | null;

export function ComponentContextMenu({ target, onClose }: ComponentContextMenuProps) {
  const router = useRouter();
  const { user } = useAuth();
  const menuRef = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState<"inventory" | "wishlist" | null>(null);

  // Close on outside click or ESC
  useEffect(() => {
    if (!target) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [target, onClose]);

  // Auto-hide toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  if (!target) return null;

  // Clamp menu position to viewport
  const MENU_WIDTH = 240;
  const MENU_HEIGHT = 210;
  const viewportW = typeof window !== "undefined" ? window.innerWidth : 1920;
  const viewportH = typeof window !== "undefined" ? window.innerHeight : 1080;
  const left = Math.min(target.x, viewportW - MENU_WIDTH - 8);
  const top = Math.min(target.y, viewportH - MENU_HEIGHT - 8);

  const handleAddToInventory = async () => {
    if (!user) {
      setToast({ kind: "error", message: "Necesitas iniciar sesión para usar el inventario" });
      return;
    }
    setBusy("inventory");
    try {
      const supabase = createClient();
      // Check if already exists → increment quantity
      const { data: existing } = await supabase
        .from("user_inventory")
        .select("id, quantity")
        .eq("user_id", user.id)
        .eq("item_reference", target.reference)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("user_inventory")
          .update({ quantity: (existing.quantity ?? 1) + 1 })
          .eq("id", existing.id);
        setToast({
          kind: "inventory",
          message: `${target.name} +1 (x${(existing.quantity ?? 1) + 1} en inventario)`,
        });
      } else {
        await supabase.from("user_inventory").insert({
          user_id: user.id,
          item_reference: target.reference,
          item_name: target.name,
          item_type: target.itemType,
          item_size: target.size,
          item_grade: target.grade,
        });
        setToast({ kind: "inventory", message: `${target.name} agregado al Inventario` });
      }
    } catch (e: any) {
      console.error("[ComponentContextMenu] inventory error:", e);
      setToast({ kind: "error", message: "No se pudo agregar al inventario" });
    } finally {
      setBusy(null);
      onClose();
    }
  };

  const handleAddToWishlist = async () => {
    if (!user) {
      setToast({ kind: "error", message: "Necesitas iniciar sesión para usar la wishlist" });
      return;
    }
    setBusy("wishlist");
    try {
      const supabase = createClient();
      // Check duplicate
      const { data: existing } = await supabase
        .from("user_wishlist")
        .select("id")
        .eq("user_id", user.id)
        .eq("item_reference", target.reference)
        .maybeSingle();

      if (existing) {
        setToast({ kind: "info", message: `${target.name} ya está en tu Wishlist` });
      } else {
        await supabase.from("user_wishlist").insert({
          user_id: user.id,
          item_reference: target.reference,
          item_name: target.name,
          item_type: target.itemType,
          item_size: target.size,
          item_grade: target.grade,
          priority: 2,
        });
        setToast({ kind: "wishlist", message: `${target.name} agregado a la Wishlist` });
      }
    } catch (e: any) {
      console.error("[ComponentContextMenu] wishlist error:", e);
      setToast({ kind: "error", message: "No se pudo agregar a la wishlist" });
    } finally {
      setBusy(null);
      onClose();
    }
  };

  const handleOpenAccount = () => {
    router.push("/my-account");
    onClose();
  };

  const sizeBadge = target.size != null ? `S${target.size}` : null;
  const gradeBadge = target.grade ? `G${target.grade}` : null;

  return (
    <>
      {/* Menu */}
      <div
        ref={menuRef}
        className="fixed z-[100] bg-zinc-900/98 backdrop-blur-sm border border-zinc-700/80 rounded-sm shadow-2xl shadow-black/80 overflow-hidden"
        style={{ left, top, width: MENU_WIDTH }}
      >
        {/* Header con nombre del componente */}
        <div className="px-3 py-2 border-b border-zinc-800/60 bg-zinc-950/80">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
            Componente
          </div>
          <div className="text-xs text-zinc-200 font-medium truncate">{target.name}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[9px] font-mono text-zinc-600 uppercase truncate">
              {target.itemType.replace(/_/g, " ")}
            </span>
            {sizeBadge && (
              <span className="text-[9px] font-mono text-zinc-500">{sizeBadge}</span>
            )}
            {gradeBadge && (
              <span className="text-[9px] font-mono text-amber-500/70">{gradeBadge}</span>
            )}
          </div>
        </div>

        {/* Options */}
        <div className="py-1">
          <MenuItem
            icon="＋"
            label={busy === "inventory" ? "Agregando..." : "Agregar al Inventario"}
            onClick={handleAddToInventory}
            color="emerald"
            disabled={busy !== null}
          />
          <MenuItem
            icon="★"
            label={busy === "wishlist" ? "Agregando..." : "Agregar a Wishlist"}
            onClick={handleAddToWishlist}
            color="fuchsia"
            disabled={busy !== null}
          />
          <div className="h-px bg-zinc-800/60 my-1" />
          <MenuItem
            icon="👤"
            label="Abrir Mi Cuenta"
            onClick={handleOpenAccount}
            color="cyan"
          />
        </div>

        {!user && (
          <div className="px-3 py-1.5 border-t border-zinc-800/60 bg-red-500/5">
            <div className="text-[9px] text-red-400/80 font-mono uppercase tracking-wider">
              Inicia sesión para usar estas opciones
            </div>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-[101] px-4 py-2.5 rounded-sm border text-xs font-medium shadow-2xl shadow-black/60 ${
            toast.kind === "inventory"
              ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
              : toast.kind === "wishlist"
              ? "bg-fuchsia-500/20 border-fuchsia-500/50 text-fuchsia-300"
              : toast.kind === "info"
              ? "bg-blue-500/20 border-blue-500/50 text-blue-300"
              : "bg-red-500/20 border-red-500/50 text-red-300"
          }`}
        >
          {toast.kind === "inventory"
            ? "✓"
            : toast.kind === "wishlist"
            ? "★"
            : toast.kind === "info"
            ? "ℹ"
            : "!"}{" "}
          {toast.message}
        </div>
      )}
    </>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  color,
  disabled,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  color: "emerald" | "fuchsia" | "cyan";
  disabled?: boolean;
}) {
  const colorClass =
    color === "emerald"
      ? "hover:bg-emerald-500/10 hover:text-emerald-300"
      : color === "fuchsia"
      ? "hover:bg-fuchsia-500/10 hover:text-fuchsia-300"
      : "hover:bg-cyan-500/10 hover:text-cyan-300";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] text-zinc-300 text-left transition-colors ${
        disabled ? "opacity-50 cursor-not-allowed" : colorClass
      }`}
    >
      <span className="text-sm w-4 text-center flex-shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}
