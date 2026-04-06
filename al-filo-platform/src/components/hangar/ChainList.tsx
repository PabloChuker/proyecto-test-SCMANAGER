"use client";

import { useState } from "react";
import { useHangarStore, type CCUChain } from "@/store/useHangarStore";

interface ChainListProps {
  chains: CCUChain[];
  onEditChain?: (chain: CCUChain) => void;
}

export function ChainList({ chains, onEditChain }: ChainListProps) {
  const [chainToDelete, setChainToDelete] = useState<string | null>(null);
  const removeChain = useHangarStore((state) => state.removeChain);

  const handleConfirmDelete = (id: string) => {
    removeChain(id);
    setChainToDelete(null);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "planning":
        return "bg-zinc-700/30 border-zinc-700/50 text-zinc-300";
      case "in_progress":
        return "bg-amber-500/20 border-amber-500/50 text-amber-400";
      case "completed":
        return "bg-emerald-500/20 border-emerald-500/50 text-emerald-400";
      default:
        return "bg-zinc-700/30 border-zinc-700/50 text-zinc-300";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "planning":
        return "Planning";
      case "in_progress":
        return "In Progress";
      case "completed":
        return "Completed";
      default:
        return status;
    }
  };

  if (chains.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-zinc-400 text-sm">No CCU chains created yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {chains.map((chain) => {
        const totalCost = chain.steps.reduce((sum, step) => sum + step.ccuPrice, 0);
        const completedSteps = chain.steps.filter((step) => step.isCompleted).length;
        const ownedSteps = chain.steps.filter((step) => step.isOwned).length;
        const totalSteps = chain.steps.length;

        return (
          <div
            key={chain.id}
            className="bg-zinc-900/60 backdrop-blur-sm border border-zinc-800/50 rounded-sm p-4 hover:border-cyan-500/30 transition-all duration-300 cursor-pointer group"
            onClick={() => onEditChain?.(chain)}
          >
            <div className="space-y-3">
              {/* Header Row */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-zinc-100 truncate group-hover:text-cyan-400 transition-colors">
                    {chain.name}
                  </h3>
                  <p className="text-[12px] text-zinc-400 mt-1">
                    {chain.startShip} <span className="text-zinc-600">→</span> {chain.targetShip}
                  </p>
                </div>

                {/* Status Badge */}
                <div
                  className={`px-3 py-1 border rounded-sm text-[11px] font-medium whitespace-nowrap tracking-[0.06em] ${getStatusColor(
                    chain.status
                  )}`}
                >
                  {getStatusLabel(chain.status)}
                </div>
              </div>

              {/* Info Row */}
              <div className="flex items-center justify-between gap-4 text-[12px]">
                <div className="flex gap-6">
                  <div>
                    <span className="text-zinc-500">Steps:</span>
                    <span className="text-zinc-100 ml-1 font-medium">{totalSteps}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500">Owned:</span>
                    <span className="text-emerald-400 ml-1 font-medium">
                      {ownedSteps}/{totalSteps}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500">Completed:</span>
                    <span className="text-cyan-400 ml-1 font-medium">
                      {completedSteps}/{totalSteps}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-zinc-500">Total Cost:</span>
                  <span className="text-amber-400 ml-2 font-medium">${totalCost.toFixed(2)}</span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="h-1.5 bg-zinc-800/50 border border-zinc-800/30 rounded-sm overflow-hidden">
                <div
                  className="h-full bg-emerald-500/60 transition-all duration-300"
                  style={{ width: `${(completedSteps / (totalSteps || 1)) * 100}%` }}
                />
              </div>

              {/* Delete Button */}
              <div className="flex justify-end">
                {chainToDelete === chain.id ? (
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); setChainToDelete(null); }}
                      className="px-3 py-1 text-[11px] bg-zinc-800/50 border border-zinc-700/50 rounded-sm text-zinc-300 hover:bg-zinc-800 transition-all duration-300"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleConfirmDelete(chain.id); }}
                      className="px-3 py-1 text-[11px] bg-red-500/20 border border-red-500/50 rounded-sm text-red-400 hover:bg-red-500/30 transition-all duration-300"
                    >
                      Confirm Delete
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); setChainToDelete(chain.id); }}
                    className="px-3 py-1 text-[11px] bg-red-500/10 border border-red-500/30 rounded-sm text-red-400 hover:bg-red-500/20 transition-all duration-300"
                  >
                    Delete
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
