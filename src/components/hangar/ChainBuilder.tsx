"use client";

import { useState, useRef, useEffect } from "react";
import { useHangarStore, type CCUChain, type CCUChainStep } from "@/store/useHangarStore";

interface ShipSearchResult {
  reference: string;
  name: string;
  manufacturer?: string;
  msrpUsd?: number | null;
}

interface ChainBuilderProps {
  chain?: CCUChain;
  onClose: () => void;
}

export function ChainBuilder({ chain, onClose }: ChainBuilderProps) {
  const isEditMode = !!chain;

  // Form state
  const [chainName, setChainName] = useState(chain?.name || "");
  const [startShip, setStartShip] = useState(chain?.startShip || "");
  const [startShipRef, setStartShipRef] = useState(chain?.startShipReference || "");
  const [targetShip, setTargetShip] = useState(chain?.targetShip || "");
  const [targetShipRef, setTargetShipRef] = useState(chain?.targetShipReference || "");
  const [steps, setSteps] = useState<CCUChainStep[]>(chain?.steps || []);
  const [status, setStatus] = useState<"planning" | "in_progress" | "completed">(
    chain?.status || "planning"
  );
  const [startShipMsrp, setStartShipMsrp] = useState<number | null>(null);
  const [targetShipMsrp, setTargetShipMsrp] = useState<number | null>(null);
  const [error, setError] = useState("");

  // Ship search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ShipSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeSearchField, setActiveSearchField] = useState<"start" | "target" | "step" | null>(
    null
  );
  const [addStepIndex, setAddStepIndex] = useState<number | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const addChain = useHangarStore((state) => state.addChain);
  const updateChain = useHangarStore((state) => state.updateChain);

  // Ship search API
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/ships", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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

  const handleSelectShip = (ship: ShipSearchResult) => {
    if (activeSearchField === "start") {
      setStartShip(ship.name);
      setStartShipRef(ship.reference);
      setStartShipMsrp(ship.msrpUsd ?? null);
    } else if (activeSearchField === "target") {
      setTargetShip(ship.name);
      setTargetShipRef(ship.reference);
      setTargetShipMsrp(ship.msrpUsd ?? null);
    } else if (activeSearchField === "step" && addStepIndex !== null) {
      addStep(ship);
    }
    setSearchQuery("");
    setSearchResults([]);
    setActiveSearchField(null);
  };

  const addStep = (intermediateShip: ShipSearchResult) => {
    if (addStepIndex === null) return;

    const newStep: CCUChainStep = {
      fromShip: addStepIndex === 0 ? startShip : steps[addStepIndex - 1].toShip,
      fromShipReference: addStepIndex === 0 ? startShipRef : steps[addStepIndex - 1].toShipReference,
      toShip: intermediateShip.name,
      toShipReference: intermediateShip.reference,
      ccuPrice: 0,
      isOwned: false,
      isCompleted: false,
      isWarbond: false,
    };

    const newSteps = [...steps];
    newSteps.splice(addStepIndex, 0, newStep);
    setSteps(newSteps);
    setAddStepIndex(null);
  };

  const removeStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
  };

  const updateStep = (index: number, updates: Partial<CCUChainStep>) => {
    const newSteps = [...steps];
    newSteps[index] = { ...newSteps[index], ...updates };
    setSteps(newSteps);
  };

  const handleSave = () => {
    if (!chainName.trim()) {
      setError("Please enter a chain name");
      return;
    }
    if (!startShip || !targetShip) {
      setError("Please select start and target ships");
      return;
    }

    const chainData: Omit<CCUChain, "id"> = {
      name: chainName,
      startShip,
      startShipReference: startShipRef,
      targetShip,
      targetShipReference: targetShipRef,
      steps,
      status,
    };

    if (isEditMode && chain) {
      updateChain(chain.id, chainData);
    } else {
      addChain(chainData);
    }
    onClose();
  };

  const totalCost = steps.reduce((sum, step) => sum + step.ccuPrice, 0);
  const ownedSteps = steps.filter((step) => step.isOwned).length;
  const completedSteps = steps.filter((step) => step.isCompleted).length;

  // Savings calculation: direct purchase price vs chain cost
  const directPurchasePrice = targetShipMsrp ? targetShipMsrp - (startShipMsrp || 0) : null;
  const savings = directPurchasePrice !== null ? directPurchasePrice - totalCost : null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800/50 rounded-sm max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-zinc-900/95 border-b border-zinc-800/50 p-6 flex items-center justify-between">
          <h2 className="text-lg font-medium tracking-wide text-zinc-100">
            {isEditMode ? "Edit CCU Chain" : "Create CCU Chain"}
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
        <div className="p-6 space-y-6">
          {/* Chain Name */}
          <div>
            <label className="block text-[11px] text-zinc-500 tracking-[0.12em] uppercase mb-2">
              Chain Name
            </label>
            <input
              type="text"
              value={chainName}
              onChange={(e) => setChainName(e.target.value)}
              placeholder="e.g., Arrow to Corsair Path"
              className="w-full px-3 py-2 bg-zinc-900/60 border border-zinc-800/50 rounded-sm text-zinc-100 text-sm placeholder-zinc-500 focus:outline-none focus:border-amber-500/50 transition-all duration-300"
            />
          </div>

          {/* Start & Target Ships */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] text-zinc-500 tracking-[0.12em] uppercase mb-2">
                Start Ship
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={activeSearchField === "start" ? searchQuery : startShip}
                  onChange={(e) => {
                    if (activeSearchField === "start") {
                      setSearchQuery(e.target.value);
                    }
                  }}
                  onFocus={() => {
                    setActiveSearchField("start");
                    setSearchQuery(startShip);
                  }}
                  placeholder="Search ship..."
                  className="w-full px-3 py-2 bg-zinc-900/60 border border-zinc-800/50 rounded-sm text-zinc-100 text-sm placeholder-zinc-500 focus:outline-none focus:border-amber-500/50 transition-all duration-300"
                />
                {activeSearchField === "start" && searchResults.length > 0 && (
                  <div className="absolute top-full mt-1 w-full bg-zinc-800/80 border border-zinc-700/50 rounded-sm z-10 max-h-[200px] overflow-y-auto">
                    {searchResults.map((ship) => (
                      <button
                        key={ship.reference}
                        onClick={() => handleSelectShip(ship)}
                        className="w-full text-left px-3 py-2 hover:bg-zinc-700/50 transition-colors text-sm"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-zinc-100">{ship.name}</p>
                          {ship.msrpUsd && (
                            <span className="text-[10px] text-amber-400 font-mono">${ship.msrpUsd}</span>
                          )}
                        </div>
                        {ship.manufacturer && (
                          <p className="text-[11px] text-zinc-500">{ship.manufacturer}</p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-zinc-500 tracking-[0.12em] uppercase mb-2">
                Target Ship
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={activeSearchField === "target" ? searchQuery : targetShip}
                  onChange={(e) => {
                    if (activeSearchField === "target") {
                      setSearchQuery(e.target.value);
                    }
                  }}
                  onFocus={() => {
                    setActiveSearchField("target");
                    setSearchQuery(targetShip);
                  }}
                  placeholder="Search ship..."
                  className="w-full px-3 py-2 bg-zinc-900/60 border border-zinc-800/50 rounded-sm text-zinc-100 text-sm placeholder-zinc-500 focus:outline-none focus:border-amber-500/50 transition-all duration-300"
                />
                {activeSearchField === "target" && searchResults.length > 0 && (
                  <div className="absolute top-full mt-1 w-full bg-zinc-800/80 border border-zinc-700/50 rounded-sm z-10 max-h-[200px] overflow-y-auto">
                    {searchResults.map((ship) => (
                      <button
                        key={ship.reference}
                        onClick={() => handleSelectShip(ship)}
                        className="w-full text-left px-3 py-2 hover:bg-zinc-700/50 transition-colors text-sm"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-zinc-100">{ship.name}</p>
                          {ship.msrpUsd && (
                            <span className="text-[10px] text-amber-400 font-mono">${ship.msrpUsd}</span>
                          )}
                        </div>
                        {ship.manufacturer && (
                          <p className="text-[11px] text-zinc-500">{ship.manufacturer}</p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Steps Timeline */}
          {steps.length > 0 && (
            <div className="space-y-2">
              <label className="block text-[11px] text-zinc-500 tracking-[0.12em] uppercase">
                Chain Steps ({steps.length})
              </label>
              <div className="space-y-2 pl-4 border-l-2 border-zinc-700">
                {steps.map((step, index) => (
                  <div key={index} className="space-y-2">
                    <div className="bg-zinc-800/30 border border-zinc-800/50 rounded-sm p-3 space-y-2">
                      {/* Step Header */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-[12px] text-zinc-400">
                            Step {index + 1}: {step.fromShip} <span className="text-zinc-600">→</span>{" "}
                            {step.toShip}
                          </p>
                        </div>
                        <button
                          onClick={() => removeStep(index)}
                          className="px-2 py-1 text-[11px] bg-red-500/10 border border-red-500/30 rounded-sm text-red-400 hover:bg-red-500/20 transition-all duration-300"
                        >
                          Remove
                        </button>
                      </div>

                      {/* Step Fields */}
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[10px] text-zinc-600 mb-1">Price</label>
                          <input
                            type="number"
                            value={step.ccuPrice}
                            onChange={(e) =>
                              updateStep(index, { ccuPrice: parseFloat(e.target.value) || 0 })
                            }
                            step="0.01"
                            min="0"
                            className="w-full px-2 py-1 bg-zinc-900/60 border border-zinc-800/50 rounded-sm text-zinc-100 text-xs focus:outline-none focus:border-amber-500/50 transition-all duration-300"
                          />
                        </div>

                        <div className="flex items-end gap-1">
                          <label className="flex items-center gap-1.5 cursor-pointer flex-1">
                            <input
                              type="checkbox"
                              checked={step.isOwned}
                              onChange={(e) => updateStep(index, { isOwned: e.target.checked })}
                              className="w-3 h-3 rounded border border-zinc-700 bg-zinc-800/50 accent-emerald-500"
                            />
                            <span className="text-[10px] text-zinc-400">Owned</span>
                          </label>
                        </div>

                        <div className="flex items-end gap-1">
                          <label className="flex items-center gap-1.5 cursor-pointer flex-1">
                            <input
                              type="checkbox"
                              checked={step.isCompleted}
                              onChange={(e) => updateStep(index, { isCompleted: e.target.checked })}
                              className="w-3 h-3 rounded border border-zinc-700 bg-zinc-800/50 accent-cyan-500"
                            />
                            <span className="text-[10px] text-zinc-400">Done</span>
                          </label>
                        </div>
                      </div>

                      {/* Warbond Badge */}
                      <div>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={step.isWarbond}
                            onChange={(e) => updateStep(index, { isWarbond: e.target.checked })}
                            className="w-3 h-3 rounded border border-zinc-700 bg-zinc-800/50 accent-amber-500"
                          />
                          <span className="text-[10px] text-zinc-400">Warbond</span>
                        </label>
                      </div>
                    </div>

                    {/* Add Step Button */}
                    {index < steps.length - 1 && addStepIndex === null && (
                      <div className="text-center py-1">
                        <button
                          onClick={() => {
                            setAddStepIndex(index + 1);
                            setActiveSearchField("step");
                          }}
                          className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                          + Add Step
                        </button>
                      </div>
                    )}

                    {addStepIndex === index + 1 && (
                      <div className="bg-amber-500/10 border border-amber-500/30 rounded-sm p-2">
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search intermediate ship..."
                          autoFocus
                          className="w-full px-2 py-1 bg-zinc-900/60 border border-zinc-800/50 rounded-sm text-zinc-100 text-[12px] placeholder-zinc-500 focus:outline-none focus:border-amber-500/50 transition-all duration-300"
                        />
                        {isSearching && (
                          <p className="text-[11px] text-zinc-500 mt-1">Searching...</p>
                        )}
                        {searchResults.length > 0 && (
                          <div className="mt-2 space-y-1 max-h-[150px] overflow-y-auto">
                            {searchResults.map((ship) => (
                              <button
                                key={ship.reference}
                                onClick={() => handleSelectShip(ship)}
                                className="w-full text-left px-2 py-1 bg-zinc-800/50 hover:bg-zinc-800 rounded-sm text-[11px] transition-colors"
                              >
                                <div className="flex items-center justify-between">
                                  <p className="text-zinc-100">{ship.name}</p>
                                  {ship.msrpUsd && (
                                    <span className="text-[10px] text-amber-400 font-mono">${ship.msrpUsd}</span>
                                  )}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add First Step Button */}
          {steps.length === 0 && (
            <button
              onClick={() => {
                setAddStepIndex(0);
                setActiveSearchField("step");
              }}
              className="w-full px-4 py-2 bg-amber-500/20 border border-amber-500/50 rounded-sm text-amber-400 text-sm font-medium hover:bg-amber-500/30 transition-all duration-300"
            >
              Add First Step
            </button>
          )}

          {/* Summary Panel */}
          <div className="bg-zinc-800/20 border border-zinc-800/50 rounded-sm p-4 space-y-3">
            {/* MSRP Info */}
            {(startShipMsrp !== null || targetShipMsrp !== null) && (
              <div className="flex items-center justify-between text-[11px] pb-2 border-b border-zinc-800/30">
                <div className="flex gap-4">
                  {startShipMsrp !== null && (
                    <span className="text-zinc-500">
                      Start MSRP: <span className="text-zinc-300 font-mono">${startShipMsrp}</span>
                    </span>
                  )}
                  {targetShipMsrp !== null && (
                    <span className="text-zinc-500">
                      Target MSRP: <span className="text-zinc-300 font-mono">${targetShipMsrp}</span>
                    </span>
                  )}
                </div>
                {directPurchasePrice !== null && (
                  <span className="text-zinc-500">
                    Direct CCU: <span className="text-zinc-300 font-mono">${directPurchasePrice}</span>
                  </span>
                )}
              </div>
            )}

            <div className="grid grid-cols-4 gap-4 text-[12px]">
              <div>
                <p className="text-zinc-500">Chain Cost</p>
                <p className="text-amber-400 font-medium mt-1">${totalCost.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-zinc-500">Savings</p>
                <p className={`font-medium mt-1 ${
                  savings !== null && savings > 0
                    ? "text-emerald-400"
                    : savings !== null && savings < 0
                    ? "text-red-400"
                    : "text-zinc-500"
                }`}>
                  {savings !== null ? (savings >= 0 ? `$${savings.toFixed(2)}` : `-$${Math.abs(savings).toFixed(2)}`) : "—"}
                </p>
              </div>
              <div>
                <p className="text-zinc-500">Owned</p>
                <p className="text-emerald-400 font-medium mt-1">
                  {ownedSteps}/{steps.length}
                </p>
              </div>
              <div>
                <p className="text-zinc-500">Completed</p>
                <p className="text-cyan-400 font-medium mt-1">
                  {completedSteps}/{steps.length}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-zinc-500 tracking-[0.12em] uppercase mb-2">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as "planning" | "in_progress" | "completed")}
                className="w-full px-3 py-2 bg-zinc-900/60 border border-zinc-800/50 rounded-sm text-zinc-100 text-sm focus:outline-none focus:border-amber-500/50 transition-all duration-300"
              >
                <option value="planning">Planning</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
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
              {isEditMode ? "Update Chain" : "Create Chain"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
