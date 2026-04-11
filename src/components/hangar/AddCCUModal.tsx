"use client";

import { useState, useRef, useEffect } from "react";
import { useHangarStore, type HangarCCU } from "@/store/useHangarStore";

interface ShipSearchResult {
  reference: string;
  name: string;
  manufacturer?: string;
  msrpUsd?: number | null;
}

interface AddCCUModalProps {
  ccu?: HangarCCU;
  onClose: () => void;
}

type ModalStep = "fromShip" | "toShip" | "details";

export function AddCCUModal({ ccu, onClose }: AddCCUModalProps) {
  const [step, setStep] = useState<ModalStep>("fromShip");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ShipSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // Step 1: From Ship
  const [fromShip, setFromShip] = useState<ShipSearchResult | null>(null);

  // Step 2: To Ship
  const [toShip, setToShip] = useState<ShipSearchResult | null>(null);

  // Step 3: Details
  const [pricePaid, setPricePaid] = useState("");
  const [isWarbond, setIsWarbond] = useState(false);
  const [location, setLocation] = useState<"hangar" | "buyback">("hangar");
  const [notes, setNotes] = useState("");
  const [saveError, setSaveError] = useState("");

  const addCCU = useHangarStore((state) => state.addCCU);
  const updateCCU = useHangarStore((state) => state.updateCCU);

  // Initialize with existing CCU data if editing
  useEffect(() => {
    if (ccu) {
      setFromShip({
        reference: ccu.fromShipReference,
        name: ccu.fromShip,
      });
      setToShip({
        reference: ccu.toShipReference,
        name: ccu.toShip,
      });
      setPricePaid(ccu.pricePaid.toString());
      setIsWarbond(ccu.isWarbond);
      setLocation(ccu.location);
      setNotes(ccu.notes);
      setStep("details");
    }
  }, [ccu]);

  // Search ships API
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/ships', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ search: searchQuery, limit: 10 }),
        });
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.data || []);
        }
      } catch (err) {
        console.error("Failed to search ships:", err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery]);

  const handleSelectFromShip = (ship: ShipSearchResult) => {
    setFromShip(ship);
    setSearchQuery("");
    setSearchResults([]);
    setStep("toShip");
  };

  const handleSelectToShip = (ship: ShipSearchResult) => {
    setToShip(ship);
    setSearchQuery("");
    setSearchResults([]);
    setStep("details");
  };

  const handleSaveCCU = () => {
    if (!fromShip || !toShip || !pricePaid) {
      setSaveError("Please fill in all required fields");
      return;
    }

    const price = parseFloat(pricePaid);
    if (isNaN(price) || price < 0) {
      setSaveError("Please enter a valid price");
      return;
    }

    try {
      if (ccu) {
        // Update existing CCU
        updateCCU(ccu.id, {
          fromShip: fromShip.name,
          fromShipReference: fromShip.reference,
          toShip: toShip.name,
          toShipReference: toShip.reference,
          pricePaid: price,
          isWarbond,
          location,
          notes,
        });
      } else {
        // Add new CCU
        addCCU({
          fromShip: fromShip.name,
          fromShipReference: fromShip.reference,
          toShip: toShip.name,
          toShipReference: toShip.reference,
          pricePaid: price,
          isWarbond,
          location,
          notes,
        });
      }
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save CCU");
    }
  };

  const isEditing = !!ccu;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800/50 rounded-sm max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-zinc-900/95 border-b border-zinc-800/50 p-6 flex items-center justify-between">
          <h2 className="text-lg font-medium tracking-wide text-zinc-100">
            {isEditing ? "Edit CCU" : "Add CCU"}
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
          {step === "fromShip" && (
            <>
              {/* Search Input */}
              <div>
                <label className="block text-[11px] text-zinc-500 tracking-[0.12em] uppercase mb-2">
                  From Ship (Source)
                </label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Type ship name..."
                  className="w-full px-3 py-2 bg-zinc-900/60 border border-zinc-800/50 rounded-sm text-zinc-100 text-sm placeholder-zinc-500 focus:outline-none focus:border-amber-500/50 transition-all duration-300"
                  autoFocus
                />
              </div>

              {/* Search Results */}
              {isSearching && (
                <div className="text-center py-4">
                  <p className="text-[12px] text-zinc-400">Searching...</p>
                </div>
              )}

              {searchResults.length > 0 ? (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {searchResults.map((ship) => (
                    <button
                      key={ship.reference}
                      onClick={() => handleSelectFromShip(ship)}
                      className="w-full text-left p-3 bg-zinc-800/30 border border-zinc-800/50 rounded-sm hover:border-amber-500/50 hover:bg-zinc-800/50 transition-all duration-300"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-zinc-100 font-medium">{ship.name}</p>
                        {ship.msrpUsd && (
                          <span className="text-[11px] text-amber-400 font-mono">${ship.msrpUsd}</span>
                        )}
                      </div>
                      {ship.manufacturer && (
                        <p className="text-[11px] text-zinc-500 mt-0.5">{ship.manufacturer}</p>
                      )}
                    </button>
                  ))}
                </div>
              ) : searchQuery.length > 1 ? (
                <div className="text-center py-4">
                  <p className="text-[12px] text-zinc-500">No ships found</p>
                </div>
              ) : null}
            </>
          )}

          {step === "toShip" && (
            <>
              {/* Selected From Ship */}
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-sm">
                <p className="text-[11px] text-emerald-400 tracking-[0.12em] uppercase">From Ship</p>
                <p className="text-sm text-emerald-300 mt-1">{fromShip?.name}</p>
              </div>

              {/* Search Input */}
              <div>
                <label className="block text-[11px] text-zinc-500 tracking-[0.12em] uppercase mb-2">
                  To Ship (Target)
                </label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Type ship name..."
                  className="w-full px-3 py-2 bg-zinc-900/60 border border-zinc-800/50 rounded-sm text-zinc-100 text-sm placeholder-zinc-500 focus:outline-none focus:border-amber-500/50 transition-all duration-300"
                  autoFocus
                />
              </div>

              {/* Search Results */}
              {isSearching && (
                <div className="text-center py-4">
                  <p className="text-[12px] text-zinc-400">Searching...</p>
                </div>
              )}

              {searchResults.length > 0 ? (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {searchResults.map((ship) => (
                    <button
                      key={ship.reference}
                      onClick={() => handleSelectToShip(ship)}
                      className="w-full text-left p-3 bg-zinc-800/30 border border-zinc-800/50 rounded-sm hover:border-amber-500/50 hover:bg-zinc-800/50 transition-all duration-300"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-zinc-100 font-medium">{ship.name}</p>
                        {ship.msrpUsd && (
                          <span className="text-[11px] text-amber-400 font-mono">${ship.msrpUsd}</span>
                        )}
                      </div>
                      {ship.manufacturer && (
                        <p className="text-[11px] text-zinc-500 mt-0.5">{ship.manufacturer}</p>
                      )}
                    </button>
                  ))}
                </div>
              ) : searchQuery.length > 1 ? (
                <div className="text-center py-4">
                  <p className="text-[12px] text-zinc-500">No ships found</p>
                </div>
              ) : null}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setStep("fromShip")}
                  className="flex-1 px-4 py-2 bg-zinc-800/50 border border-zinc-700/50 rounded-sm text-zinc-300 text-sm font-medium hover:bg-zinc-800 transition-all duration-300"
                >
                  Back
                </button>
              </div>
            </>
          )}

          {step === "details" && (
            <>
              {/* Ship Path */}
              <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-sm">
                <p className="text-[11px] text-cyan-400 tracking-[0.12em] uppercase">CCU Conversion</p>
                <p className="text-sm text-cyan-300 mt-1">
                  {fromShip?.name} → {toShip?.name}
                </p>
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
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isWarbond}
                  onChange={(e) => setIsWarbond(e.target.checked)}
                  className="w-4 h-4 rounded border border-zinc-700 bg-zinc-800/50 accent-amber-500"
                />
                <span className="text-sm text-zinc-300">Warbond CCU</span>
              </label>

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

              {saveError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-sm">
                  <p className="text-[12px] text-red-400">{saveError}</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setStep("toShip")}
                  className="flex-1 px-4 py-2 bg-zinc-800/50 border border-zinc-700/50 rounded-sm text-zinc-300 text-sm font-medium hover:bg-zinc-800 transition-all duration-300"
                >
                  Back
                </button>
                <button
                  onClick={handleSaveCCU}
                  className="flex-1 px-4 py-2 bg-amber-500/20 border border-amber-500/50 rounded-sm text-amber-400 text-sm font-medium hover:bg-amber-500/30 transition-all duration-300"
                >
                  {isEditing ? "Save Changes" : "Add CCU"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
