"use client";

import { useState } from "react";
import { useHangarStore, type HangarCCU } from "@/store/useHangarStore";

interface EditCCUModalProps {
  ccu: HangarCCU;
  onClose: () => void;
}

export function EditCCUModal({ ccu, onClose }: EditCCUModalProps) {
  const [pricePaid, setPricePaid] = useState(ccu.pricePaid.toString());
  const [isWarbond, setIsWarbond] = useState(ccu.isWarbond);
  const [location, setLocation] = useState<"hangar" | "buyback">(ccu.location);
  const [notes, setNotes] = useState(ccu.notes);
  const [error, setError] = useState("");

  const updateCCU = useHangarStore((state) => state.updateCCU);

  const handleSave = () => {
    const price = parseFloat(pricePaid);
    if (isNaN(price) || price < 0) {
      setError("Please enter a valid price");
      return;
    }

    updateCCU(ccu.id, {
      pricePaid: price,
      isWarbond,
      location,
      notes,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800/50 rounded-sm max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-zinc-900/95 border-b border-zinc-800/50 p-6 flex items-center justify-between">
          <h2 className="text-lg font-medium tracking-wide text-zinc-100">Edit CCU</h2>
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
          {/* From/To Ships (Read-only) */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] text-zinc-500 tracking-[0.12em] uppercase mb-2">
                From Ship
              </label>
              <div className="w-full px-3 py-2 bg-zinc-900/40 border border-zinc-800/30 rounded-sm text-zinc-400 text-sm">
                {ccu.fromShip}
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-zinc-500 tracking-[0.12em] uppercase mb-2">
                To Ship
              </label>
              <div className="w-full px-3 py-2 bg-zinc-900/40 border border-zinc-800/30 rounded-sm text-zinc-400 text-sm">
                {ccu.toShip}
              </div>
            </div>
          </div>

          {/* Price */}
          <div>
            <label className="block text-[11px] text-zinc-500 tracking-[0.12em] uppercase mb-2">
              Price Paid (USD)
            </label>
            <input
              type="number"
              value={pricePaid}
              onChange={(e) => setPricePaid(e.target.value)}
              step="0.01"
              min="0"
              className="w-full px-3 py-2 bg-zinc-900/60 border border-zinc-800/50 rounded-sm text-zinc-100 text-sm focus:outline-none focus:border-amber-500/50 transition-all duration-300"
            />
          </div>

          {/* Location */}
          <div>
            <label className="block text-[11px] text-zinc-500 tracking-[0.12em] uppercase mb-2">
              Location
            </label>
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value as "hangar" | "buyback")}
              className="w-full px-3 py-2 bg-zinc-900/60 border border-zinc-800/50 rounded-sm text-zinc-100 text-sm focus:outline-none focus:border-amber-500/50 transition-all duration-300"
            >
              <option value="hangar">Hangar</option>
              <option value="buyback">Buyback</option>
            </select>
          </div>

          {/* Warbond Checkbox */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isWarbond}
                onChange={(e) => setIsWarbond(e.target.checked)}
                className="w-4 h-4 rounded border border-zinc-700 bg-zinc-800/50 accent-amber-500"
              />
              <span className="text-sm text-zinc-300">Warbond</span>
            </label>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[11px] text-zinc-500 tracking-[0.12em] uppercase mb-2">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes about this CCU..."
              className="w-full px-3 py-2 bg-zinc-900/60 border border-zinc-800/50 rounded-sm text-zinc-100 text-sm placeholder-zinc-500 focus:outline-none focus:border-amber-500/50 transition-all duration-300 resize-none h-20"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-sm">
              <p className="text-[12px] text-red-400">{error}</p>
            </div>
          )}

          {/* Action Buttons */}
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
