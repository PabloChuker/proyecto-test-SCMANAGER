"use client";

import { useState } from "react";
import { useHangarStore, type HangarShip, type InsuranceType, type ItemLocation, type ItemCategory } from "@/store/useHangarStore";

interface EditShipModalProps {
  ship: HangarShip;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<ItemCategory, string> = {
  standalone_ship: "Ship",
  game_package: "Package",
  paint: "Paint",
  flair: "Flair",
  gear: "Gear / Armor",
  subscriber: "Subscriber Item",
  upgrade: "CCU / Upgrade",
  other: "Other",
};

export function EditShipModal({ ship, onClose }: EditShipModalProps) {
  const [pledgeName, setPledgeName] = useState(ship.pledgeName);
  const [pledgePrice, setPledgePrice] = useState(ship.pledgePrice.toString());
  const [insuranceType, setInsuranceType] = useState<InsuranceType>(ship.insuranceType);
  const [location, setLocation] = useState<ItemLocation>(ship.location);
  const [itemCategory, setItemCategory] = useState<ItemCategory>(ship.itemCategory || "standalone_ship");
  const [isGiftable, setIsGiftable] = useState(ship.isGiftable);
  const [isMeltable, setIsMeltable] = useState(ship.isMeltable);
  const [notes, setNotes] = useState(ship.notes);
  const [error, setError] = useState("");

  const isShip = itemCategory === "standalone_ship" || itemCategory === "game_package";
  const updateShip = useHangarStore((state) => state.updateShip);

  const handleSave = () => {
    const price = parseFloat(pledgePrice);
    if (isNaN(price) || price < 0) {
      setError("Please enter a valid price");
      return;
    }

    updateShip(ship.id, {
      pledgeName,
      pledgePrice: price,
      insuranceType,
      location,
      itemCategory,
      isGiftable,
      isMeltable,
      notes,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800/50 rounded-sm max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-zinc-900/95 border-b border-zinc-800/50 p-6 flex items-center justify-between">
          <h2 className="text-lg font-medium tracking-wide text-zinc-100">
            Edit {CATEGORY_LABELS[itemCategory] || "Item"}
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-300 transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-[11px] text-zinc-500 tracking-[0.12em] uppercase mb-2">
              {isShip ? "Ship Name" : "Item Name"}
            </label>
            <input
              type="text"
              value={pledgeName}
              onChange={(e) => setPledgeName(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-900/60 border border-zinc-800/50 rounded-sm text-zinc-100 text-sm focus:outline-none focus:border-amber-500/50 transition-all duration-300"
            />
          </div>

          <div>
            <label className="block text-[11px] text-zinc-500 tracking-[0.12em] uppercase mb-2">
              Category
            </label>
            <select
              value={itemCategory}
              onChange={(e) => setItemCategory(e.target.value as ItemCategory)}
              className="w-full px-3 py-2 bg-zinc-900/60 border border-zinc-800/50 rounded-sm text-zinc-100 text-sm focus:outline-none focus:border-amber-500/50 transition-all duration-300"
            >
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-zinc-500 tracking-[0.12em] uppercase mb-2">
              {isShip ? "Pledge Price (USD)" : "Value (USD)"}
            </label>
            <input
              type="number"
              value={pledgePrice}
              onChange={(e) => setPledgePrice(e.target.value)}
              step="0.01"
              min="0"
              className="w-full px-3 py-2 bg-zinc-900/60 border border-zinc-800/50 rounded-sm text-zinc-100 text-sm focus:outline-none focus:border-amber-500/50 transition-all duration-300"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-zinc-500 tracking-[0.12em] uppercase mb-2">
                Insurance
              </label>
              <select
                value={insuranceType}
                onChange={(e) => setInsuranceType(e.target.value as InsuranceType)}
                className="w-full px-3 py-2 bg-zinc-900/60 border border-zinc-800/50 rounded-sm text-zinc-100 text-sm focus:outline-none focus:border-amber-500/50 transition-all duration-300"
              >
                <option value="LTI">LTI</option>
                <option value="120_months">120 Months</option>
                <option value="72_months">72 Months</option>
                <option value="48_months">48 Months</option>
                <option value="24_months">24 Months</option>
                <option value="6_months">6 Months</option>
                <option value="3_months">3 Months</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-zinc-500 tracking-[0.12em] uppercase mb-2">
                Location
              </label>
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value as ItemLocation)}
                className="w-full px-3 py-2 bg-zinc-900/60 border border-zinc-800/50 rounded-sm text-zinc-100 text-sm focus:outline-none focus:border-amber-500/50 transition-all duration-300"
              >
                <option value="hangar">Hangar</option>
                <option value="buyback">Buyback</option>
                <option value="ccu_chain">CCU Chain</option>
              </select>
            </div>
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isGiftable}
                onChange={(e) => setIsGiftable(e.target.checked)}
                className="w-4 h-4 rounded border border-zinc-700 bg-zinc-800/50 accent-amber-500"
              />
              <span className="text-sm text-zinc-300">Giftable</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isMeltable}
                onChange={(e) => setIsMeltable(e.target.checked)}
                className="w-4 h-4 rounded border border-zinc-700 bg-zinc-800/50 accent-amber-500"
              />
              <span className="text-sm text-zinc-300">Meltable</span>
            </label>
          </div>

          <div>
            <label className="block text-[11px] text-zinc-500 tracking-[0.12em] uppercase mb-2">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes about this ship..."
              className="w-full px-3 py-2 bg-zinc-900/60 border border-zinc-800/50 rounded-sm text-zinc-100 text-sm placeholder-zinc-500 focus:outline-none focus:border-amber-500/50 transition-all duration-300 resize-none h-20"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-sm">
              <p className="text-[12px] text-red-400">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-zinc-800/50 border border-zinc-700/50 rounded-sm text-zinc-300 text-sm font-medium hover:bg-zinc-800 transition-all duration-300"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex-1 px-4 py-2 bg-amber-500/20 border border-amber-500/50 rounded-sm text-amber-400 text-sm font-medium hover:bg-amber-500/30 transition-all duration-300"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
