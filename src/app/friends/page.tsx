"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import Header from "@/app/assets/header/Header";
import { SIDEBAR_ITEMS } from "@/app/assets/header/navigation";
import { useAuth, type Profile } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { sendNotification } from "@/lib/notifications";
import { useTranslations } from "next-intl";

interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: string;
  created_at: string;
}

interface FriendDisplay {
  friendship: Friendship;
  profile: Profile;
  direction: "sent" | "received";
}

export default function FriendsPage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  const t = useTranslations("PageTitles");

  const [friends, setFriends] = useState<FriendDisplay[]>([]);
  const [pending, setPending] = useState<FriendDisplay[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  const loadFriends = useCallback(async () => {
    if (!user) return;

    const { data: friendships } = await supabase
      .from("friendships")
      .select("*")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

    if (!friendships) return;

    const accepted = friendships.filter((f) => f.status === "accepted");
    const pendingReqs = friendships.filter((f) => f.status === "pending");

    // Load profiles for friends
    const friendIds = accepted.map((f) =>
      f.requester_id === user.id ? f.addressee_id : f.requester_id
    );
    const pendingIds = pendingReqs.map((f) =>
      f.requester_id === user.id ? f.addressee_id : f.requester_id
    );
    const allIds = [...new Set([...friendIds, ...pendingIds])];

    if (allIds.length === 0) {
      setFriends([]);
      setPending([]);
      return;
    }

    // SECURITY: whitelist EXPLÍCITA de columnas safe — nunca discord_id,
    // discord_username, last_seen, first_name, last_name, age, country.
    // (La view profiles_public + RLS owner-only de la mig 063 se va a
    //  activar cuando esa migración corra en Supabase. Mientras tanto, la
    //  protección está en este whitelist.)
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, is_online")
      .in("id", allIds);

    const profileMap = new Map<string, Profile>();
    (profiles ?? []).forEach((p) => profileMap.set(p.id, p as Profile));

    setFriends(
      accepted
        .map((f) => {
          const otherId = f.requester_id === user.id ? f.addressee_id : f.requester_id;
          const profile = profileMap.get(otherId);
          if (!profile) return null;
          return {
            friendship: f,
            profile,
            direction: f.requester_id === user.id ? "sent" : "received",
          } as FriendDisplay;
        })
        .filter(Boolean) as FriendDisplay[]
    );

    setPending(
      pendingReqs
        .map((f) => {
          const otherId = f.requester_id === user.id ? f.addressee_id : f.requester_id;
          const profile = profileMap.get(otherId);
          if (!profile) return null;
          return {
            friendship: f,
            profile,
            direction: f.requester_id === user.id ? "sent" : "received",
          } as FriendDisplay;
        })
        .filter(Boolean) as FriendDisplay[]
    );
  }, [user, supabase]);

  useEffect(() => {
    loadFriends();
  }, [loadFriends]);

  // Realtime subscription for friendship changes
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("friendships-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships" },
        () => {
          loadFriends();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `is_online=eq.true` },
        () => {
          loadFriends();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, supabase, loadFriends]);

  const searchUsers = useCallback(async () => {
    if (!searchQuery.trim() || !user) return;
    setSearching(true);
    // SECURITY: whitelist explícita — la búsqueda PUEDE filtrar por
    // discord_username (porque postgres lo evalúa server-side) pero NO lo
    // devolvemos en el SELECT. Así seguimos pudiendo encontrar gente por su
    // handle de Discord pero no exponemos el handle de OTROS users en la UI.
    const { data } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, is_online")
      .or(`username.ilike.%${searchQuery}%,display_name.ilike.%${searchQuery}%,discord_username.ilike.%${searchQuery}%`)
      .neq("id", user.id)
      .limit(20);
    setSearchResults((data ?? []) as Profile[]);
    setSearching(false);
  }, [searchQuery, user, supabase]);

  const sendRequest = useCallback(
    async (targetId: string) => {
      if (!user) return;
      setSendingIds((prev) => new Set(prev).add(targetId));
      await supabase.from("friendships").insert({
        requester_id: user.id,
        addressee_id: targetId,
        status: "pending",
      });
      const myName = profile?.display_name ?? user.user_metadata?.full_name ?? "Alguien";
      await sendNotification({
        supabase,
        recipientId: targetId,
        fromUserId: user.id,
        type: "friend_request",
        title: "Solicitud de amistad",
        message: `${myName} quiere ser tu amigo`,
        link: "/friends",
      });
      setSendingIds((prev) => { const s = new Set(prev); s.delete(targetId); return s; });
      setSentIds((prev) => new Set(prev).add(targetId));
      loadFriends();
    },
    [user, profile, supabase, loadFriends]
  );

  const acceptRequest = useCallback(
    async (friendshipId: string) => {
      await supabase
        .from("friendships")
        .update({ status: "accepted" })
        .eq("id", friendshipId);
      loadFriends();
    },
    [supabase, loadFriends]
  );

  const removeFriend = useCallback(
    async (friendshipId: string) => {
      await supabase.from("friendships").delete().eq("id", friendshipId);
      loadFriends();
    },
    [supabase, loadFriends]
  );

  if (loading || !user) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <div className="text-zinc-500 animate-pulse">Cargando...</div>
      </main>
    );
  }

  const onlineFriends = friends.filter((f) => f.profile.is_online);
  const offlineFriends = friends.filter((f) => !f.profile.is_online);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <video
        autoPlay loop muted playsInline
        className="fixed inset-0 w-full h-full object-cover opacity-15 pointer-events-none z-0"
      >
        <source src="/videos/mineria.mp4" type="video/mp4" />
      </video>
      <div className="fixed inset-0 bg-gradient-to-b from-zinc-950/60 via-zinc-950/80 to-zinc-950/95 pointer-events-none z-0" />

      <Header subtitle={t("friends")} />

      <div className="flex flex-1 min-h-0">
        <aside className="w-12 sm:w-14 flex-shrink-0 bg-zinc-950/90 border-r border-zinc-800/50 flex flex-col items-center py-3 gap-1 z-20 sticky top-12 h-[calc(100vh-3rem)] overflow-y-auto">
          {SIDEBAR_ITEMS.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              title={item.label}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded flex items-center justify-center transition-all duration-150 hover:bg-zinc-800/40"
            >
              <Image src={item.icon} alt={item.label} width={22} height={22} className="opacity-40 hover:opacity-70" />
            </Link>
          ))}
        </aside>

        <div className="flex-1 z-10 relative px-4 py-6 overflow-y-auto">
          <div className="max-w-6xl mx-auto space-y-5">
            {/* ═══ SEARCH siempre arriba ═══ */}
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchUsers()}
                  placeholder="Buscar por nombre, usuario o Discord..."
                  className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-amber-500 focus:outline-none"
                />
                <button
                  onClick={searchUsers}
                  disabled={searching || !searchQuery.trim()}
                  className="px-4 py-2 bg-amber-600/80 hover:bg-amber-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-zinc-950 text-sm font-medium rounded transition-colors"
                >
                  {searching ? "..." : "Buscar"}
                </button>
                {(searchQuery || searchResults.length > 0) && (
                  <button
                    onClick={() => { setSearchQuery(""); setSearchResults([]); }}
                    className="px-3 py-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    Limpiar
                  </button>
                )}
              </div>

              {/* Resultados de búsqueda — inline debajo del search, compactos */}
              {searchResults.length > 0 && (
                <div className="space-y-1.5 p-3 rounded border border-zinc-800/40 bg-zinc-900/30">
                  <h4 className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                    Resultados ({searchResults.length})
                  </h4>
                  {searchResults.map((p) => {
                    const alreadyFriend = friends.some((f) => f.profile.id === p.id);
                    const alreadyPending = pending.some((f) => f.profile.id === p.id);
                    return (
                      <div
                        key={p.id}
                        className="flex items-center gap-3 p-2 rounded border border-zinc-800/50 bg-zinc-900/40"
                      >
                        {p.avatar_url ? (
                          <img src={p.avatar_url} alt="" className="w-9 h-9 rounded-full" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center text-sm">👤</div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-zinc-200 truncate">
                            {p.display_name ?? p.username}
                          </div>
                          {p.username && (
                            <div className="text-[11px] text-zinc-500 truncate">@{p.username}</div>
                          )}
                        </div>
                        {alreadyFriend ? (
                          <span className="text-[11px] text-emerald-400">Ya son amigos</span>
                        ) : alreadyPending || sentIds.has(p.id) ? (
                          <span className="text-[11px] text-amber-400/80 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">Sent ✓</span>
                        ) : (
                          <button
                            onClick={() => sendRequest(p.id)}
                            disabled={sendingIds.has(p.id)}
                            className={`px-3 py-1 text-xs rounded transition-all duration-200 ${
                              sendingIds.has(p.id)
                                ? "bg-zinc-700 text-zinc-400 cursor-wait"
                                : "bg-amber-600/80 hover:bg-amber-600 active:scale-95 text-zinc-950"
                            }`}
                          >
                            {sendingIds.has(p.id) ? "..." : "+ Add"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ═══ Dos columnas: FRIENDS izq | PENDING der ═══ */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* COL IZQ — Friends */}
              <section className="space-y-3">
                <div className="flex items-baseline justify-between border-b border-zinc-800/60 pb-1.5">
                  <h2 className="text-sm uppercase tracking-wider text-amber-400">
                    Amigos
                  </h2>
                  <span className="text-[11px] text-zinc-500">
                    {onlineFriends.length} online · {friends.length} total
                  </span>
                </div>
                {friends.length === 0 ? (
                  <div className="text-center text-zinc-500 py-8 text-sm border border-dashed border-zinc-800/50 rounded">
                    <div className="text-3xl mb-2 opacity-60">👥</div>
                    Sin amigos todavía. Usá el buscador arriba.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {onlineFriends.length > 0 && (
                      <div className="space-y-1.5">
                        <h3 className="text-[10px] text-emerald-400 uppercase tracking-wider">
                          En línea ({onlineFriends.length})
                        </h3>
                        {onlineFriends.map((f) => (
                          <FriendCard
                            key={f.friendship.id}
                            friend={f}
                            onRemove={() => removeFriend(f.friendship.id)}
                            online
                          />
                        ))}
                      </div>
                    )}
                    {offlineFriends.length > 0 && (
                      <div className="space-y-1.5">
                        <h3 className="text-[10px] text-zinc-500 uppercase tracking-wider">
                          Offline ({offlineFriends.length})
                        </h3>
                        {offlineFriends.map((f) => (
                          <FriendCard
                            key={f.friendship.id}
                            friend={f}
                            onRemove={() => removeFriend(f.friendship.id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* COL DER — Pending */}
              <section className="space-y-3">
                <div className="flex items-baseline justify-between border-b border-zinc-800/60 pb-1.5">
                  <h2 className="text-sm uppercase tracking-wider text-amber-400">
                    Pending
                  </h2>
                  <span className="text-[11px] text-zinc-500">
                    {pending.filter(p => p.direction === "received").length} recibidas · {pending.length} total
                  </span>
                </div>
                {pending.length === 0 ? (
                  <div className="text-center text-zinc-500 py-8 text-sm border border-dashed border-zinc-800/50 rounded">
                    No hay solicitudes pendientes.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {pending.map((f) => (
                      <div
                        key={f.friendship.id}
                        className={`flex items-center gap-3 p-2.5 rounded border ${
                          f.direction === "received"
                            ? "border-amber-500/30 bg-amber-500/5"
                            : "border-zinc-800/50 bg-zinc-900/40"
                        }`}
                      >
                        {f.profile.avatar_url ? (
                          <img src={f.profile.avatar_url} alt="" className="w-9 h-9 rounded-full" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center">👤</div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-zinc-200 truncate">
                            {f.profile.display_name ?? f.profile.username}
                          </div>
                          <div className="text-[11px] text-zinc-500">
                            {f.direction === "received" ? "Te envió solicitud" : "Solicitud enviada"}
                          </div>
                        </div>
                        {f.direction === "received" && (
                          <button
                            onClick={() => acceptRequest(f.friendship.id)}
                            className="px-2.5 py-1 text-xs bg-emerald-600/80 hover:bg-emerald-600 text-zinc-950 rounded transition-colors"
                          >
                            Aceptar
                          </button>
                        )}
                        <button
                          onClick={() => removeFriend(f.friendship.id)}
                          className="px-2.5 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded transition-colors"
                          title={f.direction === "received" ? "Rechazar" : "Cancelar"}
                        >
                          {f.direction === "received" ? "✕" : "Cancel"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function FriendCard({
  friend,
  onRemove,
  online,
}: {
  friend: FriendDisplay;
  onRemove: () => void;
  online?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded border border-zinc-800/50 bg-zinc-900/40">
      <div className="relative">
        {friend.profile.avatar_url ? (
          <img
            src={friend.profile.avatar_url}
            alt=""
            className="w-10 h-10 rounded-full"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-lg">
            👤
          </div>
        )}
        {online && (
          <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-zinc-900" />
        )}
      </div>
      <div className="flex-1">
        <div className="text-sm text-zinc-200">
          {friend.profile.display_name ?? friend.profile.username}
        </div>
        <div className="text-xs text-zinc-500">
          {friend.profile.username ? `@${friend.profile.username}` : ""}
        </div>
      </div>
      <button
        onClick={onRemove}
        className="text-zinc-600 hover:text-red-400 text-xs"
        title="Remove friend"
      >
        ✕
      </button>
    </div>
  );
}
