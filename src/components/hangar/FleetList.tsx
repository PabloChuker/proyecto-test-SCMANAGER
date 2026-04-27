"use client";

// =============================================================================
// FleetList — vista lista del Hangar (Fase T)
//
// Alternativa a FleetGrid (tarjetas). Compacta, escaneable de un vistazo,
// con todas las columnas relevantes para decidir qué naves vender, mover a
// buyback o editar. Se ordena con la prop sortBy igual que FleetGrid (la
// ordena el dashboard antes de pasar el array).
// =============================================================================

import { useMemo, useState } from "react";
import Link from "next/link";
import { useHangarStore, type HangarShip, type ItemCategory } from "@/store/useHangarStore";
import { EditShipModal } from "./EditShipModal";
import { CouponSafeName } from "./CouponSafeName";
import {
  INSURANCE_COLORS,
  INSURANCE_LABELS,
  CATEGORY_BADGE,
  LOCATION_COLORS,
} from "./hangar-style";
import { SortableHeader, nextSortState, compareValues, type SortDir } from "./hangar-utils";

interface FleetListProps {
  ships: HangarShip[];
}

// FEAT 2026-04-26: ordenamiento clickeable por columna. Cuando el user
// clickea un header se sortea ese campo. Toggle asc/desc al re-clickear.
type FleetSortKey = "name" | "type" | "insurance" | "location" | "pledge" | "date";

export function FleetList({ ships }: FleetListProps) {
  const [sortKey, setSortKey] = useState<FleetSortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = (key: FleetSortKey) => {
    // Default desc para columnas numéricas/fecha, asc para texto.
    const defaultDir: SortDir = key === "pledge" || key === "date" ? "desc" : "asc";
    const next = nextSortState(sortKey, sortDir, key, defaultDir);
    setSortKey(next.sortKey);
    setSortDir(next.sortDir);
  };

  const sortedShips = useMemo(() => {
    if (!sortKey) return ships; // sin sort local → respeta el orden del padre
    const arr = [...ships];
    arr.sort((a, b) => {
      let av: any, bv: any;
      switch (sortKey) {
        case "name": av = a.shipName ?? a.pledgeName ?? ""; bv = b.shipName ?? b.pledgeName ?? ""; break;
        case "type": av = a.itemCategory ?? "other"; bv = b.itemCategory ?? "other"; break;
        case "insurance": av = a.insuranceType ?? "unknown"; bv = b.insuranceType ?? "unknown"; break;
        case "location": av = a.location ?? ""; bv = b.location ?? ""; break;
        case "pledge": av = a.price ?? 0; bv = b.price ?? 0; break;
        case "date": av = a.purchasedDate ?? ""; bv = b.purchasedDate ?? ""; break;
      }
      return compareValues(av, bv, sortDir);
    });
    return arr;
  }, [ships, sortKey, sortDir]);

  if (ships.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 border border-zinc-800/50 rounded-sm bg-zinc-900/30">
        <div className="text-center">
          <p className="text-zinc-400 text-sm">No items in your hangar</p>
          <p className="text-zinc-500 text-xs mt-1">Add a ship to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-sm border border-zinc-800/60 bg-zinc-900/40">
      {/* Header con sort por columna */}
      <div className="hidden md:flex items-center gap-3 px-3 py-2 border-b border-zinc-800/60 bg-zinc-900/60 text-[9px] tracking-[0.15em] uppercase text-zinc-500 font-mono">
        <div className="w-12">Img</div>
        <SortableHeader<FleetSortKey>
          sortKey="name" label="Name"
          activeKey={sortKey} activeDir={sortDir} onClick={handleSort}
          className="flex-1"
        />
        <SortableHeader<FleetSortKey>
          sortKey="type" label="Type"
          activeKey={sortKey} activeDir={sortDir} onClick={handleSort}
          className="w-20" align="center"
        />
        <SortableHeader<FleetSortKey>
          sortKey="insurance" label="Insurance"
          activeKey={sortKey} activeDir={sortDir} onClick={handleSort}
          className="w-20" align="center"
        />
        <SortableHeader<FleetSortKey>
          sortKey="location" label="Location"
          activeKey={sortKey} activeDir={sortDir} onClick={handleSort}
          className="w-24" align="center"
        />
        <SortableHeader<FleetSortKey>
          sortKey="pledge" label="Pledge"
          activeKey={sortKey} activeDir={sortDir} onClick={handleSort}
          className="w-20" align="right"
        />
        <SortableHeader<FleetSortKey>
          sortKey="date" label="Date"
          activeKey={sortKey} activeDir={sortDir} onClick={handleSort}
          className="w-24" align="center"
        />
        <div className="w-32 text-right">Actions</div>
      </div>
      {/* Rows */}
      <div className="divide-y divide-zinc-800/40">
        {sortedShips.map((ship) => (
          <FleetRow key={ship.id} ship={ship} />
        ))}
      </div>
    </div>
  );
}

function FleetRow({ ship }: { ship: HangarShip }) {
  const [showEdit, setShowEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [imgError, setImgError] = useState(false);
  const removeShip = useHangarStore((s) => s.removeShip);
  const updateShip = useHangarStore((s) => s.updateShip);

  const category: ItemCategory = ship.itemCategory || "standalone_ship";
  const isShip = category === "standalone_ship" || category === "game_package";
  const catBadge = CATEGORY_BADGE[category] || CATEGORY_BADGE.other;
  const insurance = INSURANCE_COLORS[ship.insuranceType] || INSURANCE_COLORS.unknown;
  const insLabel = INSURANCE_LABELS[ship.insuranceType] || ship.insuranceType;
  const location = LOCATION_COLORS[ship.location];

  const displayName = ship.shipName || ship.pledgeName || "Unknown";
  const slug = displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const localThumb = isShip ? `/ships/${slug}.webp` : "";
  const fallbackImg = (() => {
    if (!ship.imageUrl || ship.imageUrl.includes("default-image")) return "";
    const raw = ship.imageUrl.trim();
    if (raw.startsWith("//")) return `https:${raw}`;
    if (raw.startsWith("/")) return `https://robertsspaceindustries.com${raw}`;
    return raw;
  })();

  const handleMove = () => {
    const next = ship.location === "hangar" ? "buyback" : "hangar";
    updateShip(ship.id, { location: next });
  };
  const handleDelete = () => {
    removeShip(ship.id);
    setShowDeleteConfirm(false);
  };

  const dateLabel = ship.purchasedDate
    ? new Date(ship.purchasedDate).toLocaleDateString("en-GB", { year: "2-digit", month: "short", day: "2-digit" })
    : "—";

  return (
    <div className="group flex items-center gap-3 px-3 py-2 hover:bg-zinc-800/30 transition-colors text-[12px]">
      {/* Thumb */}
      <div className="w-12 h-9 flex-shrink-0 rounded-sm overflow-hidden bg-zinc-900 border border-zinc-800/60">
        {isShip && !imgError && localThumb ? (
          <img src={localThumb} alt={displayName} className="w-full h-full object-cover" onError={() => setImgError(true)} />
        ) : fallbackImg && !imgError ? (
          <img src={fallbackImg} alt={displayName} className="w-full h-full object-cover" onError={() => setImgError(true)} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-600">{catBadge.label}</div>
        )}
      </div>

      {/* Name + meta — el nombre del pledge puede contener un código de
          cupón (Imperator/BIS/Referral); CouponSafeName lo redacta por
          default para no exponerlo en streams. */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <CouponSafeName
            name={displayName}
            className="text-zinc-200 truncate font-medium"
            compact
          />
          {ship.isLoaner && (
            <span className="text-[8px] px-1 py-0 border border-amber-500/30 text-amber-300 rounded-[2px] uppercase tracking-wider">Loaner</span>
          )}
          {ship.acquisitionType === "in_game" && (
            <span className="text-[8px] px-1 py-0 border border-cyan-500/30 text-cyan-300 rounded-[2px] uppercase tracking-wider">In-game</span>
          )}
          {ship.isGiftable && (
            <span className="text-[8px] px-1 py-0 border border-emerald-500/30 text-emerald-300/80 rounded-[2px] uppercase tracking-wider">Gift</span>
          )}
          {ship.isMeltable && !ship.isLoaner && (
            <span className="text-[8px] px-1 py-0 border border-rose-500/30 text-rose-300/80 rounded-[2px] uppercase tracking-wider">Melt</span>
          )}
        </div>
        {ship.pledgeName && ship.pledgeName !== displayName && (
          <CouponSafeName
            name={ship.pledgeName}
            className="text-[10px] text-zinc-500 truncate mt-0.5 block"
            compact
          />
        )}
      </div>

      {/* Type badge */}
      <div className="w-20 text-center hidden md:block">
        <span className={`text-[9px] px-1.5 py-0.5 rounded-[2px] border ${catBadge.bg} ${catBadge.text} ${catBadge.border}`}>
          {catBadge.label}
        </span>
      </div>

      {/* Insurance */}
      <div className="w-20 text-center hidden md:block">
        <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-[2px] border ${insurance.bg} ${insurance.text} ${insurance.border}`}>
          {insLabel}
        </span>
      </div>

      {/* Location */}
      <div className="w-24 text-center hidden md:block">
        <span className={`text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-[2px] border ${location?.bg ?? ""} ${location?.text ?? ""} ${location?.border ?? ""}`}>
          {ship.location}
        </span>
      </div>

      {/* Pledge */}
      <div className="w-20 text-right hidden md:block font-mono tabular-nums text-amber-300/80">
        ${ship.pledgePrice.toLocaleString()}
      </div>

      {/* Date */}
      <div className="w-24 text-center hidden md:block text-[10px] text-zinc-500 font-mono">{dateLabel}</div>

      {/* Actions */}
      <div className="w-32 flex justify-end gap-1 flex-shrink-0">
        {isShip && ship.shipReference && (
          <Link
            href={`/ships/${encodeURIComponent(ship.shipReference)}`}
            className="text-[10px] px-2 py-1 text-zinc-400 hover:text-cyan-300 border border-zinc-800/60 hover:border-cyan-500/40 rounded-[2px] transition-colors"
            title="View ship details"
          >
            View
          </Link>
        )}
        {!ship.isLoaner && (
          <button
            onClick={handleMove}
            className="text-[10px] px-2 py-1 text-zinc-400 hover:text-orange-300 border border-zinc-800/60 hover:border-orange-500/40 rounded-[2px] transition-colors"
            title={ship.location === "hangar" ? "Move to Buyback" : "Move to Hangar"}
          >
            {ship.location === "hangar" ? "→ Buyback" : "→ Hangar"}
          </button>
        )}
        <button
          onClick={() => setShowEdit(true)}
          className="text-[10px] px-2 py-1 text-zinc-400 hover:text-amber-300 border border-zinc-800/60 hover:border-amber-500/40 rounded-[2px] transition-colors"
          title="Edit"
        >
          Edit
        </button>
        {showDeleteConfirm ? (
          <button
            onClick={handleDelete}
            className="text-[10px] px-2 py-1 text-rose-400 bg-rose-500/10 border border-rose-500/40 rounded-[2px]"
            title="Confirm delete"
          >
            Confirm
          </button>
        ) : (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="text-[10px] px-2 py-1 text-zinc-500 hover:text-rose-400 border border-zinc-800/60 hover:border-rose-500/40 rounded-[2px] transition-colors"
            title="Delete"
          >
            ✕
          </button>
        )}
      </div>

      {showEdit && <EditShipModal ship={ship} onClose={() => setShowEdit(false)} />}
    </div>
  );
}
