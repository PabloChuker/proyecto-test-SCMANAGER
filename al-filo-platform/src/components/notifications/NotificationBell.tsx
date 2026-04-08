"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Notification {
  id: string;
  user_id: string;
  from_user_id: string | null;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  is_read: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  from_profile?: {
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
  } | null;
}

const TYPE_ICONS: Record<string, string> = {
  friend_request: "👥",
  party_invite: "🎮",
  org_invite: "🏛",
};

const TYPE_COLORS: Record<string, string> = {
  friend_request: "text-blue-400",
  party_invite: "text-amber-400",
  org_invite: "text-emerald-400",
};

// Actionable notification types — show accept/reject buttons
const ACTIONABLE_TYPES = ["friend_request", "party_invite", "org_invite"];

export default function NotificationBell() {
  const { user, refreshProfile } = useAuth();
  const supabase = createClient();
  const router = useRouter();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [actingOn, setActingOn] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);

    if (!data) return;

    const fromIds = [...new Set(data.filter((n) => n.from_user_id).map((n) => n.from_user_id))];
    const profileMap = new Map<string, { display_name: string | null; username: string | null; avatar_url: string | null }>();

    if (fromIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_url")
        .in("id", fromIds);
      (profiles ?? []).forEach((p) => profileMap.set(p.id, p));
    }

    setNotifications(
      data.map((n) => ({
        ...n,
        from_profile: n.from_user_id ? profileMap.get(n.from_user_id) ?? null : null,
      })) as Notification[]
    );
  }, [user, supabase]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("notifications-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => {
        loadNotifications();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, supabase, loadNotifications]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const markRead = useCallback(async (id: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  }, [supabase]);

  const markAllRead = useCallback(async () => {
    if (!user) return;
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }, [user, supabase]);

  const clearAll = useCallback(async () => {
    if (!user) return;
    await supabase.from("notifications").delete().eq("user_id", user.id);
    setNotifications([]);
  }, [user, supabase]);

  // ─── Accept action per notification type ───
  const handleAccept = useCallback(async (n: Notification) => {
    if (!user) return;
    setActingOn((prev) => new Set(prev).add(n.id));

    try {
      if (n.type === "friend_request" && n.from_user_id) {
        // Find the pending friendship and accept it
        const { data: friendship } = await supabase
          .from("friendships")
          .select("id")
          .eq("requester_id", n.from_user_id)
          .eq("addressee_id", user.id)
          .eq("status", "pending")
          .limit(1)
          .single();

        if (friendship) {
          await supabase.from("friendships").update({ status: "accepted" }).eq("id", friendship.id);
        }
      }

      if (n.type === "party_invite") {
        // User is already added to party by the invite action,
        // just navigate them to the party page
        router.push("/party");
      }

      if (n.type === "org_invite") {
        // User is already added to org by the invite action,
        // refresh profile and navigate
        await refreshProfile();
        router.push("/org");
      }

      // Mark notification as read and update its metadata to show it was accepted
      await supabase
        .from("notifications")
        .update({ is_read: true, metadata: { ...n.metadata, action_taken: "accepted" } })
        .eq("id", n.id);

      setNotifications((prev) =>
        prev.map((notif) =>
          notif.id === n.id ? { ...notif, is_read: true, metadata: { ...notif.metadata, action_taken: "accepted" } } : notif
        )
      );
    } finally {
      setActingOn((prev) => { const s = new Set(prev); s.delete(n.id); return s; });
    }
  }, [user, supabase, router, refreshProfile]);

  // ─── Reject action per notification type ───
  const handleReject = useCallback(async (n: Notification) => {
    if (!user) return;
    setActingOn((prev) => new Set(prev).add(n.id));

    try {
      if (n.type === "friend_request" && n.from_user_id) {
        // Delete the pending friendship
        await supabase
          .from("friendships")
          .delete()
          .eq("requester_id", n.from_user_id)
          .eq("addressee_id", user.id)
          .eq("status", "pending");
      }

      if (n.type === "party_invite") {
        // Leave the party if already added
        const { data: membership } = await supabase
          .from("party_members")
          .select("party_id")
          .eq("user_id", user.id)
          .limit(1);

        if (membership && membership.length > 0) {
          const partyId = membership[0].party_id;
          await supabase.from("party_members").delete().eq("party_id", partyId).eq("user_id", user.id);
        }
      }

      if (n.type === "org_invite" && n.metadata?.org_id) {
        // Leave the org
        await supabase.from("org_members").delete().eq("org_id", n.metadata.org_id as string).eq("user_id", user.id);
        await supabase.from("profiles").update({ org_id: null }).eq("id", user.id);
        await refreshProfile();
      }

      // Mark as read with rejected status
      await supabase
        .from("notifications")
        .update({ is_read: true, metadata: { ...n.metadata, action_taken: "rejected" } })
        .eq("id", n.id);

      setNotifications((prev) =>
        prev.map((notif) =>
          notif.id === n.id ? { ...notif, is_read: true, metadata: { ...notif.metadata, action_taken: "rejected" } } : notif
        )
      );
    } finally {
      setActingOn((prev) => { const s = new Set(prev); s.delete(n.id); return s; });
    }
  }, [user, supabase, refreshProfile]);

  if (!user) return null;

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "ahora";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center justify-center w-8 h-8 rounded hover:bg-zinc-800/50 transition-colors"
        title="Notificaciones"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-500 hover:text-zinc-300 transition-colors">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-red-500 text-[9px] text-white font-bold px-1 animate-pulse">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-80 max-h-[450px] rounded-lg border border-zinc-800/70 bg-zinc-900/95 backdrop-blur-xl shadow-xl shadow-black/30 z-50 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/50">
            <span className="text-xs text-zinc-400 uppercase tracking-wider font-medium">
              Notificaciones
              {unreadCount > 0 && <span className="ml-1 text-amber-400">({unreadCount})</span>}
            </span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors">
                  Marcar leidas
                </button>
              )}
              {notifications.length > 0 && (
                <button onClick={clearAll} className="text-[10px] text-zinc-600 hover:text-red-400 transition-colors">
                  Limpiar
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="text-center text-zinc-600 py-8 text-xs">No hay notificaciones</div>
            ) : (
              notifications.map((n) => {
                const icon = TYPE_ICONS[n.type] ?? "🔔";
                const color = TYPE_COLORS[n.type] ?? "text-zinc-400";
                const isActionable = ACTIONABLE_TYPES.includes(n.type) && !n.metadata?.action_taken;
                const actionTaken = n.metadata?.action_taken as string | undefined;
                const isActing = actingOn.has(n.id);

                return (
                  <div
                    key={n.id}
                    className={`px-3 py-2.5 transition-colors border-b border-zinc-800/20 ${
                      n.is_read ? "hover:bg-zinc-800/30" : "bg-zinc-800/20 hover:bg-zinc-800/40"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      {/* Avatar / Icon */}
                      <div className="flex-shrink-0 mt-0.5">
                        {n.from_profile?.avatar_url ? (
                          <img src={n.from_profile.avatar_url} alt="" className="w-8 h-8 rounded-full" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-sm">{icon}</div>
                        )}
                      </div>
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs font-medium ${color}`}>{n.title}</span>
                          {!n.is_read && !actionTaken && (
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                          )}
                        </div>
                        {n.message && (
                          <p className="text-[11px] text-zinc-500 mt-0.5">{n.message}</p>
                        )}
                        <span className="text-[10px] text-zinc-600 mt-0.5 block">{timeAgo(n.created_at)}</span>

                        {/* ─── Action buttons ─── */}
                        {isActionable && !actionTaken && (
                          <div className="flex items-center gap-2 mt-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleAccept(n); }}
                              disabled={isActing}
                              className={`px-3 py-1 text-[11px] font-medium rounded transition-all duration-200 ${
                                isActing
                                  ? "bg-zinc-700 text-zinc-400 cursor-wait"
                                  : "bg-emerald-600/80 hover:bg-emerald-600 active:scale-95 text-zinc-950"
                              }`}
                            >
                              {isActing ? "..." : "Aceptar"}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleReject(n); }}
                              disabled={isActing}
                              className={`px-3 py-1 text-[11px] font-medium rounded transition-all duration-200 ${
                                isActing
                                  ? "bg-zinc-700 text-zinc-400 cursor-wait"
                                  : "bg-zinc-700 hover:bg-red-600/80 hover:text-zinc-100 active:scale-95 text-zinc-300"
                              }`}
                            >
                              {isActing ? "..." : "Rechazar"}
                            </button>
                          </div>
                        )}

                        {/* Action already taken */}
                        {actionTaken && (
                          <div className="mt-1.5">
                            <span className={`text-[10px] px-2 py-0.5 rounded ${
                              actionTaken === "accepted"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : "bg-zinc-700/50 text-zinc-500 border border-zinc-700/30"
                            }`}>
                              {actionTaken === "accepted" ? "Aceptado ✓" : "Rechazado"}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
