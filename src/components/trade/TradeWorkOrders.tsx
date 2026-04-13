"use client";

// =============================================================================
// SC LABS — TradeWorkOrders (container)
//
// Switches between the dashboard (list + metrics) and the calculator
// (create / edit form) based on the shared Zustand store.
// =============================================================================

import { useTradeWorkOrderStore } from "@/store/useTradeWorkOrderStore";
import TradeWorkOrderDashboard from "./TradeWorkOrderDashboard";
import TradeWorkOrderCalculator from "./TradeWorkOrderCalculator";

export default function TradeWorkOrders() {
  const view = useTradeWorkOrderStore((s) => s.view);
  return view === "editor" ? <TradeWorkOrderCalculator /> : <TradeWorkOrderDashboard />;
}
