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
  const { user, loading } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [myParty, setMyParty] = useState<Party | null>(null);
  const [partyMembers, setPartyMembers] = useState<PartyMember[]>([]);
  const [publicParties, setPublicParties] = useState<(Party & { memberCount: number; leaderName: string })[]>([]);
  const [activities, setActivities] = useState<ActivityType[]>(activityTypesFallback as ActivityType[]);
  const [tab, setTab] = useState<"party" | "create" | "browse">("party");

  // Create form
  const [partyName, setPartyName] = useState("");
  const [partyActivity, setPartyActivity] = useState("");
  const [partyMax, setPartyMax] = useState(4);
  const [creating, setCreating] = useState(false);

  // Invite
  const [inviteSearch, setInviteSearch] = useState("");
  const [inviteResults, setInviteResults] = useState<Profile[]>([]);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  // Load activities
  useEffect(() => {
    fetch("/api/activities/types")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d) && d.length > 0) setActivities(d); })
      .catch(() => {});
  }, []);

  const loadMyParty = useCallback(async () => {
    if (!user) return;

    // Check if user is in any party
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

      // Load members
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

  const loadPublicParties = useCallback(async () => {
    const { data: parties } = await supabase
      .from("parties")
      .select("*")
      .eq("status", "forming")
      .order("created_at", { ascending: false })
      .limit(20);

    if (parties && parties.length > 0) {
      // Get member counts and leader names
      const results = await Promise.all(
        (parties as Party[]).map(async (p) => {
          const { count } = await supabase
            .from("party_members")
            .select("*", { count: "exact", head: true })
            .eq("party_id", p.id);

          const { data: leader } = await supabase
            .from("profiles")
            .select("display_name, username")
            .eq("id", p.leader_id)
            .single();

          return {
            ...p,
            memberCount: count ?? 0,
            leaderName: leader?.display_name ?? leader?.username ?? "Unknown",
          };
        })
      );

      setPublicParties(results);
    }
  }, [supabase]);

  useEffect(() => {
    loadMyParty();
    loadPublicParties();
  }, [loadMyParty, loadPublicParties]);

  // Realtime for party changes
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("party-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "party_members" }, () => {
        loadMyParty();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "parties" }, () => {
        loadMyParty();
        loadPublicParties();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, supabase, loadMyParty, loadPublicParties]);

  const createParty = useCallback(async () => {
    if (!user || !partyName.trim()) return;
    setCreating(true);

    const { data: newParty } = await supabase
      .from("parties")
      .insert({
        name: partyName.trim(),
        leader_id: user.id,
        activity_type: partyActivity || null,
        max_members: partyMax,
        status: "forming",
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
      setTab("party");
    }
    setCreating(false);
  }, [user, partyName, partyActivity, partyMax, supabase, loadMyParty]);

  const joinParty = useCallback(
    async (partyId: string) => {
      if (!user) return;
      await supabase.from("party_members").insert({
        party_id: partyId,
        user_id: user.id,
        role: "member",
      });
      await loadMyParty();
      setTab("party");
    },
    [user, supabase, loadMyParty]
  );

  const leaveParty = useCallback(async () => {
    if (!user || !myParty) return;

    await supabase
      .from("party_members")
      .delete()
      .eq("party_id", myParty.id)
      .eq("user_id", user.id);

    // If leader leaves, disband
    if (myParty.leader_id === user.id) {
      await supabase.from("party_members").delete().eq("party_id", myParty.id);
      await supabase.from("parties").delete().eq("id", myParty.id);
    }

    setMyParty(null);
    setPartyMembers([]);
  }, [user, myParty, supabase]);

  const removeMember = useCallback(
    async (userId: string) => {
      if (!myParty) return;
      await supabase
        .from("party_members")
        .delete()
        .eq("party_id", myParty.id)
        .eq("user_id", userId);
      loadMyParty();
    },
    [myParty, supabase, loadMyParty]
  );

  const searchFriends = useCallback(async () => {
    if (!inviteSearch.trim() || !user) return;
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .or(`username.ilike.%${inviteSearch}%,display_name.ilike.%${inviteSearch}%`)
      .neq("id", user.id)
      .limit(10);
    setInviteResults((data ?? []) as Profile[]);
  }, [inviteSearch, user, supabase]);

  const inviteToParty = useCallback(
    async (userId: string) => {
      if (!myParty) return;
      await supabase.from("party_members").insert({
        party_id: myParty.id,
        user_id: userId,
        role: "member",
      });
      loadMyParty();
      setInviteResults((prev) => prev.filter((p) => p.id !== userId));
    },
    [myParty, supabase, loadMyParty]
  );

  if (loading || !user) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <div className="text-zinc-500 animate-pulse">Cargando...</div>
      </main>
    );
  }

  const isLeader = myParty?.leader_id === user.id;
  const activityName = activities.find((a) => a.id === myParty?.activity_type)?.name;

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
            {/* Tabs */}
            <div className="flex gap-2 border-b border-zinc-800/60 pb-2">
              <button onClick={() => setTab("party")} className={`px-4 py-2 text-sm tracking-wider uppercase transition-all ${tab === "party" ? "text-amber-400 border-b-2 border-amber-500" : "text-zinc-500 hover:text-zinc-400 border-b-2 border-transparent"}`}>
                🎮 Mi Party
              </button>
              {!myParty && (
                <>
                  <button onClick={() => setTab("create")} className={`px-4 py-2 text-sm tracking-wider uppercase transition-all ${tab === "create" ? "text-amber-400 border-b-2 border-amber-500" : "text-zinc-500 hover:text-zinc-400 border-b-2 border-transparent"}`}>
                    + Crear
                  </button>
                  <button onClick={() => { setTab("browse"); loadPublicParties(); }} className={`px-4 py-2 text-sm tracking-wider uppercase transition-all ${tab === "browse" ? "text-amber-400 border-b-2 border-amber-500" : "text-zinc-500 hover:text-zinc-400 border-b-2 border-transparent"}`}>
                    🔍 Buscar
                  </button>
                </>
              )}
            </div>

            {/* My Party */}
            {tab === "party" && (
              <>
                {!myParty ? (
                  <div className="text-center text-zinc-500 py-8">
                    <div className="text-4xl mb-3">🎮</div>
                    <p>No estas en ninguna party.</p>
                    <p className="text-xs mt-1">Crea una nueva o busca una publica.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 rounded-lg border border-amber-500/20 bg-zinc-900/40">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="text-2xl">🎮</div>
                        <div className="flex-1">
                          <h2 className="text-lg text-zinc-100">{myParty.name}</h2>
                          <div className="text-xs text-zinc-500">
                            {activityName ?? "Sin actividad"} • {partyMembers.length}/{myParty.max_members} miembros • {myParty.status}
                          </div>
                        </div>
                        <button onClick={leaveParty} className="px-3 py-1 text-xs bg-zinc-700 hover:bg-red-600/80 text-zinc-300 rounded transition-colors">
                          {isLeader ? "Disolver" : "Salir"}
                        </button>
                      </div>
                    </div>

                    {/* Members */}
                    <div className="space-y-2">
                      <h3 className="text-xs text-zinc-500 uppercase tracking-wider">Miembros</h3>
                      {partyMembers.map((m) => (
                        <div key={m.user_id} className="flex items-center gap-3 p-2 rounded border border-zinc-800/40 bg-zinc-900/30">
                          <div className="relative">
                            {m.profile.avatar_url ? (
                              <img src={m.profile.avatar_url} alt="" className="w-8 h-8 rounded-full" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center">👤</div>
                            )}
                            {m.profile.is_online && <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border border-zinc-900" />}
                          </div>
                          <span className="text-sm text-zinc-200 flex-1">{m.profile.display_name ?? m.profile.username}</span>
                          <span className={`text-xs ${m.role === "leader" ? "text-amber-400" : "text-zinc-600"}`}>{m.role}</span>
                          {isLeader && m.user_id !== user.id && (
                            <button onClick={() => removeMember(m.user_id)} className="text-zinc-600 hover:text-red-400 text-xs">✕</button>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Invite */}
                    {isLeader && partyMembers.length < myParty.max_members && (
                      <div className="p-3 rounded border border-zinc-800/50 bg-zinc-900/30 space-y-2">
                        <h3 className="text-xs text-zinc-500 uppercase tracking-wider">Invitar</h3>
                        <div className="flex gap-2">
                          <input type="text" value={inviteSearch} onChange={(e) => setInviteSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && searchFriends()} placeholder="Buscar amigo..." className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-amber-500 focus:outline-none" />
                          <button onClick={searchFriends} className="px-3 py-1.5 bg-amber-600/80 hover:bg-amber-600 text-zinc-950 text-sm rounded">Buscar</button>
                        </div>
                        {inviteResults.map((p) => {
                          const alreadyInParty = partyMembers.some((m) => m.user_id === p.id);
                          return (
                            <div key={p.id} className="flex items-center gap-2 p-1.5">
                              <span className="text-sm text-zinc-300 flex-1">{p.display_name ?? p.username}</span>
                              {alreadyInParty ? (
                                <span className="text-xs text-zinc-500">Ya en party</span>
                              ) : (
                                <button onClick={() => inviteToParty(p.id)} className="px-2 py-0.5 text-xs bg-emerald-600/80 text-zinc-950 rounded">+ Invitar</button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Create Party */}
            {tab === "create" && (
              <div className="p-4 rounded-lg border border-zinc-800/50 bg-zinc-900/40 space-y-4">
                <h2 className="text-sm text-zinc-400 uppercase tracking-wider">Crear Party</h2>
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">Nombre *</label>
                  <input type="text" value={partyName} onChange={(e) => setPartyName(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" placeholder="Ej: Contested Zone Run" />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">Actividad</label>
                  <select value={partyActivity} onChange={(e) => setPartyActivity(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:border-amber-500 focus:outline-none">
                    <option value="">Sin actividad especifica</option>
                    {activities.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">Max miembros</label>
                  <input type="number" min={2} max={50} value={partyMax} onChange={(e) => setPartyMax(parseInt(e.target.value) || 4)} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />
                </div>
                <button onClick={createParty} disabled={!partyName.trim() || creating} className="w-full py-2 bg-amber-600/80 hover:bg-amber-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 font-medium rounded transition-colors">
                  {creating ? "Creando..." : "Crear Party"}
                </button>
              </div>
            )}

            {/* Browse Parties */}
            {tab === "browse" && (
              <div className="space-y-3">
                <h2 className="text-xs text-zinc-500 uppercase tracking-wider">Parties Abiertas</h2>
                {publicParties.length === 0 ? (
                  <div className="text-center text-zinc-500 py-8">No hay parties abiertas en este momento.</div>
                ) : (
                  publicParties.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 p-3 rounded border border-zinc-800/50 bg-zinc-900/40">
                      <div className="text-xl">🎮</div>
                      <div className="flex-1">
                        <div className="text-sm text-zinc-200">{p.name}</div>
                        <div className="text-xs text-zinc-500">
                          Lider: {p.leaderName} • {p.memberCount}/{p.max_members} • {activities.find((a) => a.id === p.activity_type)?.name ?? "General"}
                        </div>
                      </div>
                      {p.memberCount < p.max_members && (
                        <button onClick={() => joinParty(p.id)} className="px-3 py-1 text-xs bg-emerald-600/80 text-zinc-950 rounded">Unirse</button>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
