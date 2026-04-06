"use client";

import { useState, useRef, useEffect } from "react";
import { useHangarStore, type InsuranceType, type ItemLocation } from "@/store/useHangarStore";

interface ShipSearchResult {
  reference: string;
  name: string;
  manufacturer?: string;
}

interface AddShipModalProps {
  onClose: () => void;
}

type ModalStep = "search" | "form";

export function AddShipModal({ onClose }: AddShipModalProps) {
  const [step, setStep] = useState<ModalStep>("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ShipSearchResult[]>([]);
  const [selectedShip, setSelectedShip] = useState<ShipSearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // Form state
  const [pledgeName, setPledgeName] = useState("");
  const [pledgePrice, setPledgePrice] = useState("");
  const [insuranceType, setInsuranceType] = useState<InsuranceType>("LTI");
  const [location, setLocation] = useState<ItemLocation>("hangar");
  const [isGiftable, setIsGiftable] = useState(false);
  const [isMeltable, setIsMeltable] = useState(false);
  const [notes, setNotes] = useState("");
  const [saveError, setSaveError] = useState("");

  const addShip = useHangarStore((state) => state.addShip);

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
        const res = await fetch(`/api/ships?search=${encodeURIComponent(searchQuery)}&limit=10`);
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

  const handleSelectShip = (ship: ShipSearchResult) => {
    setSelectedShip(ship);
    setPledgeName(ship.name);
    setStep("form");
  };

  const handleSaveShip = () => {
    if (!pledgeName || !pledgePrice || !selectedShip) {
      setSaveError("Please fill in all required fields");
      return;
    }

    const price = parseFloat(pledgePrice);
    if (isNaN(price) || price < 0) {
      setSaveError("Please enter a valid pledge price");
      return;
    }

    try {
      addShip({
        shipReference: selectedShip.reference,
        pledgeName,
        pledgePrice: price,
        insuranceType,
        location,
        isGiftable,
        isMeltable,
        purchasedDate: null,
        notes,
      });
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save ship");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800/50 rounded-sm max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-zinc-900/95 border-b border-zinc-800/50 p-6 flex items-center justify-between">
          <h2 className="text-lg font-medium tracking-wide text-zinc-100">
            {step === "search" ? "Add Ship" : "Ship Details"}
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
          {step === "search" ? (
            <>
              {/* Search Input */}
              <div>
                <label className="block text-[11px] text-zinc-500 tracking-[0.12em] uppercase mb-2">
                  Search Ship
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
                      onClick={() => handleSelectShip(ship)}
                      className="w-full text-left p-3 bg-zinc-800/30 border border-zinc-800/50 rounded-sm hover:border-amber-500/50 hover:bg-zinc-800/50 transition-all duration-300"
                    >
                      <p className="text-sm text-zinc-100 font-medium">{ship.name}</p>
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
          ) : (
            <>
              {/* Ship Details Form */}
              <div>
                <label className="block text-[11px] text-zinc-500 tracking-[0.12em] uppercase mb-2">
                  Ship Name
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
                  Pledge Price (USD)
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

              {saveError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-sm">
                  <p className="text-[12px] text-red-400">{saveError}</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setStep("search")}
                  className="flex-1 px-4 py-2 bg-zinc-800/50 border border-zinc-700/50 rounded-sm text-zinc-300 text-sm font-medium hover:bg-zinc-800 transition-all duration-300"
                >
                  Back
                </button>
                <button
                  onClick={handleSaveShip}
                  className="flex-1 px-4 py-2 bg-amber-500/20 border border-amber-500/50 rounded-sm text-amber-400 text-sm font-medium hover:bg-amber-500/30 transition-all duration-300"
                >
                  Add Ship
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
