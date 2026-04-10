// =============================================================================
// AL FILO — ShipContextMenu
//
// Menú contextual reutilizable que aparece al hacer click derecho sobre una
// nave. Ofrece acciones rápidas: agregar al hangar, a la wishlist, etc.
// =============================================================================

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useHangarStore } from "@/store/useHangarStore";

export interface ShipContextMenuTarget {
  reference: string;
  name: string;
  manufacturer: string | null;
  x: number;
  y: number;
}

interface ShipContextMenuProps {
  target: ShipContextMenuTarget | null;
  onClose: () => void;
}

type Toast = { kind: "hangar" | "wishlist" | "error"; message: string } | null;

export function ShipContextMenu({ target, onClose }: ShipContextMenuProps) {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState<Toast>(null);

  const addShip = useHangarStore((s) => s.addShip);
  const addToWishlist = useHangarStore((s) => s.addToWishlist);
  const wishlist = useHangarStore((s) => s.wishlist);
  const ships = useHangarStore((s) => s.ships);

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
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  if (!target) return null;

  const isInWishlist = wishlist.some((w) => w.shipReference === target.reference);
  const hangarCount = ships.filter(
    (s) => s.shipReference === target.reference && s.location === "hangar",
  ).length;

  // Clamp menu position to viewport
  const MENU_WIDTH = 220;
  const MENU_HEIGHT = 200;
  const viewportW = typeof window !== "undefined" ? window.innerWidth : 1920;
  const viewportH = typeof window !== "undefined" ? window.innerHeight : 1080;
  const left = Math.min(target.x, viewportW - MENU_WIDTH - 8);
  const top = Math.min(target.y, viewportH - MENU_HEIGHT - 8);

  const handleAddToHangar = () => {
    addShip({
      shipReference: target.reference,
      shipName: target.name,
      pledgeName: `Standalone Ship - ${target.name}`,
      pledgePrice: 0,
      insuranceType: "unknown",
      location: "hangar",
      itemCategory: "standalone_ship",
      isGiftable: false,
      isMeltable: true,
      purchasedDate: null,
      imageUrl: "",
      notes: "",
    });
    setToast({ kind: "hangar", message: `${target.name} agregada al Hangar` });
    onClose();
  };

  const handleAddToWishlist = () => {
    if (isInWishlist) {
      setToast({ kind: "error", message: `${target.name} ya está en tu Wishlist` });
      onClose();
      return;
    }
    addToWishlist({
      shipReference: target.reference,
      shipName: target.name,
      manufacturer: target.manufacturer,
      priority: "medium",
      targetPrice: null,
      notes: "",
    });
    setToast({ kind: "wishlist", message: `${target.name} agregada a la Wishlist` });
    onClose();
  };

  const handleOpenDetail = () => {
    router.push(`/ships/${target.reference}`);
    onClose();
  };

  const handleOpenInDps = () => {
    router.push(`/dps?ship=${target.reference}`);
    onClose();
  };

  return (
    <>
      {/* Menu */}
      <div
        ref={menuRef}
        className="fixed z-[100] bg-zinc-900/98 backdrop-blur-sm border border-zinc-700/80 rounded-sm shadow-2xl shadow-black/80 overflow-hidden"
        style={{ left, top, width: MENU_WIDTH }}
      >
        {/* Header con nombre de la nave */}
        <div className="px-3 py-2 border-b border-zinc-800/60 bg-zinc-950/80">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Acciones</div>
          <div className="text-xs text-zinc-200 font-medium truncate">{target.name}</div>
          {target.manufacturer && (
            <div className="text-[9px] text-zinc-600 truncate">{target.manufacturer}</div>
          )}
        </div>

        {/* Options */}
        <div className="py-1">
          <MenuItem
            icon="＋"
            label={hangarCount > 0 ? `Agregar al Hangar (${hangarCount})` : "Agregar al Hangar"}
            onClick={handleAddToHangar}
            color="amber"
          />
          <MenuItem
            icon="★"
            label={isInWishlist ? "Ya está en Wishlist" : "Agregar a Wishlist"}
            onClick={handleAddToWishlist}
            color="fuchsia"
            disabled={isInWishlist}
          />
          <div className="h-px bg-zinc-800/60 my-1" />
          <MenuItem icon="🛸" label="Ver detalles" onClick={handleOpenDetail} color="cyan" />
          <MenuItem icon="⚙" label="Abrir en DPS Calc" onClick={handleOpenInDps} color="cyan" />
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-[101] px-4 py-2.5 rounded-sm border text-xs font-medium shadow-2xl shadow-black/60 transition-opacity ${
            toast.kind === "hangar"
              ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
              : toast.kind === "wishlist"
              ? "bg-fuchsia-500/20 border-fuchsia-500/50 text-fuchsia-300"
              : "bg-red-500/20 border-red-500/50 text-red-300"
          }`}
        >
          {toast.kind === "hangar" ? "✓" : toast.kind === "wishlist" ? "★" : "!"} {toast.message}
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
  color: "amber" | "fuchsia" | "cyan";
  disabled?: boolean;
}) {
  const colorClass =
    color === "amber"
      ? "hover:bg-amber-500/10 hover:text-amber-300"
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
