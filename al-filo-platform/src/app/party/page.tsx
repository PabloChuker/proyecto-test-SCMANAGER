"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import Header from "@/app/assets/header/Header";
import { SIDEBAR_ITEMS } from "@/app/assets/header/navigation";
import { useAuth, type Profile } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import activityTypesFallback from "@/data/activities/activity-types.json";
import { sendNotification } from "@/lib/notifications";

interface Party {
  id: string;
  name: string;
  leader_id: string;
  activity_type: string | null;
  max_members: number;
  status: string;
  created_at: string;
}

interface PartyMember {
  user_id: string;
  role: string;
  profile: Profile;
}

interface ActivityType {
  id: string;
  name: string;
  category: string;
  maxPlayers: number;
}

export default function PartyPage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [myParty, setMyParty] = useState<Party | null>(null);
  const [partyMembers, setPartyMembers] = useState<PartyMember[]>([]);
  const [activities, setActivities] = useState<ActivityType[]>(activityTypesFallback as ActivityType[]);
  const [creating, setCreating] = useState(false);

  // Online friends for quick invite
  const [onlineFriends, setOnlineFriends] = useState<Profile[]>([]);
  const [invitingIds, setInvitingIds] = useState<Set<string>>(new Set());
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    fetch("/api/activities/types")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d) && d.length > 0) setActivities(d); })
      .catch(() => {});
  }, []);

  // Load online friends
  const loadOnlineFriends = useCallback(async () => {
    if (!user) return;
    // Get accepted friendships
    const { data: friendships } = await supabase
      .from("friendships")
      .select("requester_id, addressee_id")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .eq("status", "accepted");

    if (!friendships || friendships.length === 0) { setOnlineFriends([]); return; }

    const friendIds = friendships.map((f) =>
      f.requester_id === user.id ? f.addressee_id : f.requester_id
    );

    const { data: profiles } = await supabase
      .from("profiles")
      .select("*")
      .in("id", friendIds)
      .eq("is_online", true);

    setOnlineFriends((profiles ?? []) as Profile[]);
  }, [user, supabase]);

  const loadMyParty = useCallback(async () => {
    if (!user) return;
    const { data: membership } = await supabase
      .from("party_members")
      .select("party_id")
      .eq("user_id", user.id)
      .limit(1);

    if (!membership || membership.length === 0) {
      setMyParty(null);
      setPartyMembers([]);
      return;
    }

    const partyId = membership[0].party_id;
    const { data: party } = await supabase
      .from("parties")
      .select("*")
      .eq("id", partyId)
      .single();

    if (party) {
      setMyParty(party as Party);
      const { data: members } = await supabase
        .from("party_members")
        .select("*")
        .eq("party_id", partyId);

      if (members && members.length > 0) {
        const userIds = members.map((m) => m.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("*")
          .in("id", userIds);

        const profileMap = new Map<string, Profile>();
        (profiles ?? []).forEach((p) => profileMap.set(p.id, p as Profile));

        setPartyMembers(
          members
            .map((m) => ({ ...m, profile: profileMap.get(m.user_id) }))
            .filter((m) => m.profile) as PartyMember[]
        );
      }
    }
  }, [user, supabase]);

  useEffect(() => {
    loadMyParty();
    loadOnlineFriends();
  }, [loadMyParty, loadOnlineFriends]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("party-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "party_members" }, () => { loadMyParty(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "parties" }, () => { loadMyParty(); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, () => { loadOnlineFriends(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, supabase, loadMyParty, loadOnlineFriends]);

  // Create party — volatile session, no name needed
  const createParty = useCallback(async () => {
    if (!user) return;
    setCreating(true);
    const { data: newParty } = await supabase
      .from("parties")
      .insert({
        name: `Party de ${user.user_metadata?.full_name ?? "Jugador"}`,
        leader_id: user.id,
        max_members: 8,
        status: "active",
      })
      .select()
      .single();

    if (newParty) {
      await supabase.from("party_members").insert({
        party_id: newParty.id,
        user_id: user.id,
        role: "leader",
      });
      await loadMyParty();
    }
    setCreating(false);
  }, [user, supabase, loadMyParty]);

  const leaveParty = useCallback(async () => {
    if (!user || !myParty) return;
    await supabase.from("party_members").delete().eq("party_id", myParty.id).eq("user_id", user.id);

    // Check remaining members
    const { count } = await supabase
      .from("party_members")
      .select("*", { count: "exact", head: true })
      .eq("party_id", myParty.id);

    // If no one left, delete the party (volatile)
    if (!count || count === 0) {
      await supabase.from("parties").delete().eq("id", myParty.id);
    } else if (myParty.leader_id === user.id) {
      // Transfer leadership to first remaining member
      const { data: next } = await supabase
        .from("party_members")
        .select("user_id")
        .eq("party_id", myParty.id)
        .limit(1)
        .single();
      if (next) {
        await supabase.from("parties").update({ leader_id: next.user_id }).eq("id", myParty.id);
        await supabase.from("party_members").update({ role: "leader" }).eq("party_id", myParty.id).eq("user_id", next.user_id);
      }
    }

    setMyParty(null);
    setPartyMembers([]);
  }, [user, myParty, supabase]);

  const removeMember = useCallback(async (userId: string) => {
    if (!myParty) return;
    await supabase.from("party_members").delete().eq("party_id", myParty.id).eq("user_id", userId);
    loadMyParty();
  }, [myParty, supabase, loadMyParty]);

  const inviteToParty = useCallback(async (userId: string) => {
    if (!myParty || !user) return;
    setInvitingIds((prev) => new Set(prev).add(userId));
    await supabase.from("party_members").insert({
      party_id: myParty.id,
      user_id: userId,
      role: "member",
    });
    const myName = profile?.display_name ?? user.user_metadata?.full_name ?? "Alguien";
    await sendNotification({
      supabase,
      recipientId: userId,
      fromUserId: user.id,
      type: "party_invite",
      title: "Invitacion a Party",
      message: `${myName} te invito a su party`,
      link: "/party",
      metadata: { party_id: myParty.id },
    });
    setInvitingIds((prev) => { const s = new Set(prev); s.delete(userId); return s; });
    setInvitedIds((prev) => new Set(prev).add(userId));
    loadMyParty();
  }, [myParty, user, profile, supabase, loadMyParty]);

  if (loading || !user) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <div className="text-zinc-500 animate-pulse">Cargando...</div>
      </main>
    );
  }

  const isLeader = myParty?.leader_id === user.id;
  const activityName = activities.find((a) => a.id === myParty?.activity_type)?.name;
  // Friends not already in party
  const invitableFriends = onlineFriends.filter(
    (f) => !partyMembers.some((m) => m.user_id === f.id)
  );

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <video autoPlay loop muted playsInline className="fixed inset-0 w-full h-full object-cover opacity-15 pointer-events-none z-0">
        <source src="/videos/mineria.mp4" type="video/mp4" />
      </video>
      <div className="fixed inset-0 bg-gradient-to-b from-zinc-950/60 via-zinc-950/80 to-zinc-950/95 pointer-events-none z-0" />
      <Header subtitle="Party" />

      <div className="flex flex-1 min-h-0">
        <aside className="w-12 sm:w-14 flex-shrink-0 bg-zinc-950/90 border-r border-zinc-800/50 flex flex-col items-center py-3 gap-1 z-20 sticky top-12 h-[calc(100vh-3rem)] overflow-y-auto">
          {SIDEBAR_ITEMS.map((item) => (
            <Link key={item.key} href={item.href} title={item.label} className="w-9 h-9 sm:w-10 sm:h-10 rounded flex items-center justify-center hover:bg-zinc-800/40">
              <Image src={item.icon} alt={item.label} width={22} height={22} className="opacity-40 hover:opacity-70" />
            </Link>
          ))}
        </aside>

        <div className="flex-1 z-10 relative px-4 py-6 overflow-y-auto">
          <div className="max-w-2xl mx-auto space-y-6">

            {/* ═══ NO PARTY — Create or wait ═══ */}
            {!myParty ? (
              <div className="space-y-6">
                <div className="text-center py-6">
                  <div className="text-5xl mb-3">🎮</div>
                  <p className="text-zinc-400">No estas en ninguna party</p>
                  <button
                    onClick={createParty}
                    disabled={creating}
                    className="mt-4 px-6 py-3 bg-amber-600/80 hover:bg-amber-600 disabled:bg-zinc-800 text-zinc-950 font-medium rounded-lg transition-colors text-sm"
                  >
                    {creating ? "Creando..." : "Crear Party"}
                  </button>
                </div>

                {/* Online friends — quick invite after creating */}
                {onlineFriends.length > 0 && (
                  <div className="p-4 rounded-lg border border-zinc-800/50 bg-zinc-900/40">
                    <h3 className="text-xs text-emerald-400 uppercase tracking-wider mb-3">
                      Amigos Conectados ({onlineFriends.length})
                    </h3>
                    <div className="space-y-1.5">
                      {onlineFriends.map((f) => (
                        <div key={f.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-zinc-800/30">
                          <div className="relative">
                            {f.avatar_url ? (
                              <img src={f.avatar_url} alt="" className="w-7 h-7 rounded-full" />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center text-xs">👤</div>
                            )}
                            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border border-zinc-900" />
                          </div>
                          <span className="text-sm text-zinc-300 flex-1">{f.display_name ?? f.username}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* ═══ ACTIVE PARTY ═══ */
              <div className="space-y-4">
                {/* Party header */}
                <div className="p-4 rounded-lg border border-amber-500/20 bg-zinc-900/40">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-xl">🎮</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-amber-400 font-medium">Party Activa</span>
                        <span className="text-xs text-zinc-600">•</span>
                        <span className="text-xs text-zinc-500">{activityName ?? "General"}</span>
                      </div>
                      <div className="text-xs text-zinc-500 mt-0.5">
                        {partyMembers.length}/{myParty.max_members} miembros
                      </div>
                    </div>
                    <button onClick={leaveParty} className="px-3 py-1.5 text-xs bg-zinc-700 hover:bg-red-600/80 text-zinc-300 rounded transition-colors">
                      {isLeader ? "Disolver" : "Salir"}
                    </button>
                  </div>
                </div>

                {/* Members */}
                <div className="space-y-1.5">
                  <h3 className="text-xs text-zinc-500 uppercase tracking-wider">Miembros</h3>
                  {partyMembers.map((m) => (
                    <div key={m.user_id} className="flex items-center gap-3 p-2.5 rounded border border-zinc-800/40 bg-zinc-900/30">
                      <div className="relative">
                        {m.profile.avatar_url ? (
                          <img src={m.profile.avatar_url} alt="" className="w-8 h-8 rounded-full" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center">👤</div>
                        )}
                        {m.profile.is_online && <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border border-zinc-900" />}
                      </div>
                      <span className="text-sm text-zinc-200 flex-1">{m.profile.display_name ?? m.profile.username}</span>
                      {m.role === "leader" && <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">LIDER</span>}
                      {isLeader && m.user_id !== user.id && (
                        <button onClick={() => removeMember(m.user_id)} className="text-zinc-600 hover:text-red-400 text-xs">✕</button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Quick invite — online friends */}
                {partyMembers.length < myParty.max_members && invitableFriends.length > 0 && (
                  <div className="p-3 rounded-lg border border-emerald-800/30 bg-emerald-900/10">
                    <h3 className="text-xs text-emerald-400 uppercase tracking-wider mb-2">
                      Invitar Amigos Conectados
                    </h3>
                    <div className="space-y-1">
                      {invitableFriends.map((f) => (
                        <div key={f.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-zinc-800/30">
                          <div className="relative">
                            {f.avatar_url ? (
                              <img src={f.avatar_url} alt="" className="w-7 h-7 rounded-full" />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center text-xs">👤</div>
                            )}
                            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border border-zinc-900" />
                          </div>
                          <span className="text-sm text-zinc-300 flex-1">{f.display_name ?? f.username}</span>
                          <button
                            onClick={() => inviteToParty(f.id)}
                            disabled={invitingIds.has(f.id) || invitedIds.has(f.id)}
                            className={`px-2.5 py-1 text-xs rounded transition-all duration-200 ${
                              invitedIds.has(f.id)
                                ? "bg-emerald-800/40 text-emerald-400 border border-emerald-600/30 cursor-default"
                                : invitingIds.has(f.id)
                                ? "bg-zinc-700 text-zinc-400 cursor-wait"
                                : "bg-emerald-600/80 hover:bg-emerald-600 active:scale-95 text-zinc-950"
                            }`}
                          >
                            {invitedIds.has(f.id) ? "Enviado ✓" : invitingIds.has(f.id) ? "Enviando..." : "+ Invitar"}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {invitableFriends.length === 0 && partyMembers.length < myParty.max_members && (
                  <div className="text-xs text-zinc-600 text-center py-2">
                    No hay amigos conectados para invitar
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </main>
  );
}
