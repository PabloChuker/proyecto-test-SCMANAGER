// =============================================================================
// SC LABS — Mining Realtime Hook
//
// Hybrid real-time sync for mining sessions:
//   1. Supabase Broadcast channel — instant push (like ActivityManager pattern)
//   2. Supabase postgres_changes  — DB-level change detection as fallback
//
// The broadcast channel is the primary sync mechanism because it's instant
// and doesn't require tables to be added to supabase_realtime publication.
// postgres_changes acts as a safety net for changes made outside the app.
//
// Usage: call useMiningRealtime() in any component that displays mining data.
// =============================================================================

"use client";

import { useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useMiningStore } from "./useMiningStore";

// Broadcast event types
type MiningEvent =
  | "order_created"
  | "order_updated"
  | "order_deleted"
  | "inventory_changed"
  | "inventory_cleared"
  | "member_changed"
  | "full_sync";

/**
 * Send a broadcast event to all party members listening on the same session.
 * Call this from any component that mutates mining data.
 */
export function useMiningBroadcast() {
  const activeSessionId = useMiningStore((s) => s.activeSessionId);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);

  useEffect(() => {
    if (!activeSessionId) {
      channelRef.current = null;
      return;
    }
    const supabase = createClient();
    const channel = supabase.channel(`mining-broadcast-${activeSessionId}`);
    channel.subscribe();
    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [activeSessionId]);

  const broadcast = useCallback(
    (event: MiningEvent, payload?: Record<string, unknown>) => {
      if (!channelRef.current) return;
      channelRef.current.send({
        type: "broadcast",
        event,
        payload: { ...payload, ts: Date.now() },
      });
    },
    []
  );

  return broadcast;
}

/**
 * Subscribes to realtime changes on the active mining session.
 * Uses both broadcast (instant) and postgres_changes (fallback).
 */
export function useMiningRealtime() {
  const activeSessionId = useMiningStore((s) => s.activeSessionId);
  const fetchWorkOrders = useMiningStore((s) => s.fetchWorkOrders);
  const fetchInventory = useMiningStore((s) => s.fetchInventory);
  const fetchMembers = useMiningStore((s) => s.fetchMembers);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const skipRefreshRef = useRef(false);

  useEffect(() => {
    if (!activeSessionId) return;

    const supabase = createClient();

    // ── Debounce timers ────────────────────────────────────────────────────
    let workOrderTimer: ReturnType<typeof setTimeout> | null = null;
    let inventoryTimer: ReturnType<typeof setTimeout> | null = null;
    let membersTimer: ReturnType<typeof setTimeout> | null = null;

    const debouncedRefreshOrders = () => {
      if (skipRefreshRef.current) return;
      if (workOrderTimer) clearTimeout(workOrderTimer);
      workOrderTimer = setTimeout(() => fetchWorkOrders(activeSessionId), 150);
    };

    const debouncedRefreshInventory = () => {
      if (skipRefreshRef.current) return;
      if (inventoryTimer) clearTimeout(inventoryTimer);
      inventoryTimer = setTimeout(() => fetchInventory(activeSessionId), 150);
    };

    const debouncedRefreshMembers = () => {
      if (skipRefreshRef.current) return;
      if (membersTimer) clearTimeout(membersTimer);
      membersTimer = setTimeout(() => fetchMembers(activeSessionId), 150);
    };

    const refreshAll = () => {
      fetchWorkOrders(activeSessionId);
      fetchInventory(activeSessionId);
      fetchMembers(activeSessionId);
    };

    // ── Channel setup ──────────────────────────────────────────────────────
    const channel = supabase
      .channel(`mining-broadcast-${activeSessionId}`)

      // ═══ BROADCAST events (instant, like ActivityManager) ═══
      .on("broadcast", { event: "order_created" }, () => debouncedRefreshOrders())
      .on("broadcast", { event: "order_updated" }, () => debouncedRefreshOrders())
      .on("broadcast", { event: "order_deleted" }, () => debouncedRefreshOrders())
      .on("broadcast", { event: "inventory_changed" }, () => debouncedRefreshInventory())
      .on("broadcast", { event: "inventory_cleared" }, () => debouncedRefreshInventory())
      .on("broadcast", { event: "member_changed" }, () => debouncedRefreshMembers())
      .on("broadcast", { event: "full_sync" }, () => refreshAll())

      // ═══ POSTGRES CHANGES events (fallback / safety net) ═══
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mining_work_orders", filter: `session_id=eq.${activeSessionId}` },
        debouncedRefreshOrders
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mining_inventory", filter: `session_id=eq.${activeSessionId}` },
        debouncedRefreshInventory
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mining_movements", filter: `session_id=eq.${activeSessionId}` },
        debouncedRefreshInventory
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mining_members", filter: `session_id=eq.${activeSessionId}` },
        debouncedRefreshMembers
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mining_expenses" },
        debouncedRefreshOrders
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mining_crew_payouts" },
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
