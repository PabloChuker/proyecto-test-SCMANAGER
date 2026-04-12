// =============================================================================
// SC LABS — Mining Realtime Hook
//
// Subscribes to Supabase Realtime postgres_changes on mining tables so all
// party members see work orders, inventory & dashboard updates in real time.
//
// Usage: call useMiningRealtime() inside any component that displays mining
//        session data. It requires an active session in useMiningStore.
// =============================================================================

"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useMiningStore } from "./useMiningStore";

/**
 * Subscribes to realtime changes on the active mining session's tables.
 * Automatically refreshes the Zustand store when other users make changes.
 *
 * Tables monitored:
 * - mining_work_orders  → refreshes workOrders
 * - mining_inventory    → refreshes inventory + movements
 * - mining_movements    → refreshes inventory + movements
 * - mining_members      → refreshes members
 * - mining_expenses     → refreshes workOrders (expense line changes)
 * - mining_crew_payouts → refreshes workOrders (payout changes)
 */
export function useMiningRealtime() {
  const activeSessionId = useMiningStore((s) => s.activeSessionId);
  const fetchWorkOrders = useMiningStore((s) => s.fetchWorkOrders);
  const fetchInventory = useMiningStore((s) => s.fetchInventory);
  const fetchMembers = useMiningStore((s) => s.fetchMembers);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);

  useEffect(() => {
    if (!activeSessionId) return;

    const supabase = createClient();

    // Debounce refreshes to avoid flooding when batch operations happen
    let workOrderTimer: ReturnType<typeof setTimeout> | null = null;
    let inventoryTimer: ReturnType<typeof setTimeout> | null = null;
    let membersTimer: ReturnType<typeof setTimeout> | null = null;

    const debouncedRefreshOrders = () => {
      if (workOrderTimer) clearTimeout(workOrderTimer);
      workOrderTimer = setTimeout(() => {
        fetchWorkOrders(activeSessionId);
      }, 500);
    };

    const debouncedRefreshInventory = () => {
      if (inventoryTimer) clearTimeout(inventoryTimer);
      inventoryTimer = setTimeout(() => {
        fetchInventory(activeSessionId);
      }, 500);
    };

    const debouncedRefreshMembers = () => {
      if (membersTimer) clearTimeout(membersTimer);
      membersTimer = setTimeout(() => {
        fetchMembers(activeSessionId);
      }, 500);
    };

    const channel = supabase
      .channel(`mining-session-${activeSessionId}`)
      // Work orders: new order, status change, collection
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "mining_work_orders",
          filter: `session_id=eq.${activeSessionId}`,
        },
        debouncedRefreshOrders
      )
      // Inventory: quantity changes, location edits
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "mining_inventory",
          filter: `session_id=eq.${activeSessionId}`,
        },
        debouncedRefreshInventory
      )
      // Movements: sell, distribute, transfer, manual adjustments
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "mining_movements",
          filter: `session_id=eq.${activeSessionId}`,
        },
        debouncedRefreshInventory
      )
      // Members: join, leave, role/share changes
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "mining_members",
          filter: `session_id=eq.${activeSessionId}`,
        },
        debouncedRefreshMembers
      )
      // Expenses: added/removed/edited on work orders in this session
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "mining_expenses",
        },
        debouncedRefreshOrders
      )
      // Crew payouts: payment status changes
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "mining_crew_payouts",
        },
        debouncedRefreshOrders
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (workOrderTimer) clearTimeout(workOrderTimer);
      if (inventoryTimer) clearTimeout(inventoryTimer);
      if (membersTimer) clearTimeout(membersTimer);
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [activeSessionId, fetchWorkOrders, fetchInventory, fetchMembers]);
}
