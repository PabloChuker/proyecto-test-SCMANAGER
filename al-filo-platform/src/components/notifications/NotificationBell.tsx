"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
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
  // Joined
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

export default function NotificationBell() {
  const { user } = useAuth();
  const supabase = createClient();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // Load notifications
  const loadNotifications = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);

    if (!data) return;

    // Load from_user profiles
    const fromIds = [...new Set(data.filter((n) => n.from_user_id).map((n) => n.from_user_id))];
    let profileMap = new Map<string, { display_name: string | null; username: string | null; avatar_url: string | null }>();

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

  // Realtime — listen for new notifications
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          loadNotifications();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          loadNotifications();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          loadNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, supabase, loadNotifications]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Mark single as read
  const markRead = useCallback(
    async (id: string) => {
      await supabase.from("notifications").update({ is_read: true }).eq("id", id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
    },
    [supabase]
  );

  // Mark all as read
  const markAllRead = useCallback(async () => {
    if (!user) return;
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }, [user, supabase]);

  // Clear all
  const clearAll = useCallback(async () => {
    if (!user) return;
    await supabase.from("notifications").delete().eq("user_id", user.id);
    setNotifications([]);
  }, [user, supabase]);

  if (!user) return null;

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "ahora";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `${days}d`;
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center justify-center w-8 h-8 rounded hover:bg-zinc-800/50 transition-colors"
        title="Notificaciones"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-red-500 text-[9px] text-white font-bold px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-80 max-h-[420px] rounded-lg border border-zinc-800/70 bg-zinc-900/95 backdrop-blur-xl shadow-xl shadow-black/30 z-50 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/50">
            <span className="text-xs text-zinc-400 uppercase tracking-wider font-medium">
              Notificaciones
              {unreadCount > 0 && (
                <span className="ml-1 text-amber-400">({unreadCount})</span>
              )}
            </span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Marcar leidas
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={clearAll}
                  className="text-[10px] text-zinc-600 hover:text-red-400 transition-colors"
                >
                  Limpiar
                </button>
              )}
            </div>
          </div>

          {/* Notification List */}
          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="text-center text-zinc-600 py-8 text-xs">
                No hay notificaciones
              </div>
            ) : (
              notifications.map((n) => {
                const icon = TYPE_ICONS[n.type] ?? "🔔";
                const color = TYPE_COLORS[n.type] ?? "text-zinc-400";
                const content = (
                  <div
                    className={`flex items-start gap-2.5 px-3 py-2.5 transition-colors cursor-pointer ${
                      n.is_read
                        ? "hover:bg-zinc-800/30"
                        : "bg-zinc-800/20 hover:bg-zinc-800/40"
                    }`}
                    onClick={() => {
                      if (!n.is_read) markRead(n.id);
                      if (!n.link) setOpen(false);
                    }}
                  >
                    {/* Icon or Avatar */}
                    <div className="flex-shrink-0 mt-0.5">
                      {n.from_profile?.avatar_url ? (
                        <img
                          src={n.from_profile.avatar_url}
                          alt=""
                          className="w-8 h-8 rounded-full"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-sm">
                          {icon}
                        </div>
                      )}
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-medium ${color}`}>
                          {n.title}
                        </span>
                        {!n.is_read && (
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                        )}
                      </div>
                      {n.message && (
                        <p className="text-[11px] text-zinc-500 mt-0.5 truncate">
                          {n.message}
                        </p>
                      )}
                      <span className="text-[10px] text-zinc-600 mt-0.5 block">
                        {timeAgo(n.created_at)}
                      </span>
                    </div>
                  </div>
                );

                return n.link ? (
                  <Link
                    key={n.id}
                    href={n.link}
                    onClick={() => {
                      if (!n.is_read) markRead(n.id);
                      setOpen(false);
                    }}
                    className="block"
                  >
                    {content}
                  </Link>
                ) : (
                  <div key={n.id}>{content}</div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
