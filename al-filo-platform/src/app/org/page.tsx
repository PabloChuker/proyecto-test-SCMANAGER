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

interface Organization {
  id: string;
  name: string;
  tag: string | null;
  description: string | null;
  owner_id: string | null;
  avatar_url: string | null;
}

interface OrgMember {
  user_id: string;
  role: string;
  joined_at: string;
  profile: Profile;
}

export default function OrgPage() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [org, setOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [tab, setTab] = useState<"org" | "create" | "search">("org");

  // Create form
  const [orgName, setOrgName] = useState("");
  const [orgTag, setOrgTag] = useState("");
  const [orgDesc, setOrgDesc] = useState("");
  const [creating, setCreating] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Organization[]>([]);

  // Invite
  const [inviteSearch, setInviteSearch] = useState("");
  const [inviteResults, setInviteResults] = useState<Profile[]>([]);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  const loadOrg = useCallback(async () => {
    if (!profile?.org_id) {
      setOrg(null);
      setMembers([]);
      return;
    }

    const { data: orgData } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", profile.org_id)
      .single();

    if (orgData) setOrg(orgData as Organization);

    // Load members
    const { data: memberData } = await supabase
      .from("org_members")
      .select("*")
      .eq("org_id", profile.org_id);

    if (memberData && memberData.length > 0) {
      const userIds = memberData.map((m) => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("*")
        .in("id", userIds);

      const profileMap = new Map<string, Profile>();
      (profiles ?? []).forEach((p) => profileMap.set(p.id, p as Profile));

      setMembers(
        memberData
          .map((m) => ({
            ...m,
            profile: profileMap.get(m.user_id),
          }))
          .filter((m) => m.profile) as OrgMember[]
      );
    }
  }, [profile, supabase]);

  useEffect(() => {
    loadOrg();
  }, [loadOrg]);

  const createOrg = useCallback(async () => {
    if (!user || !orgName.trim()) return;
    setCreating(true);

    const { data: newOrg } = await supabase
      .from("organizations")
      .insert({
        name: orgName.trim(),
        tag: orgTag.trim() || null,
        description: orgDesc.trim() || null,
        owner_id: user.id,
      })
      .select()
      .single();

    if (newOrg) {
      // Add creator as member
      await supabase.from("org_members").insert({
        org_id: newOrg.id,
        user_id: user.id,
        role: "owner",
      });

      // Update profile
      await supabase
        .from("profiles")
        .update({ org_id: newOrg.id })
        .eq("id", user.id);

      await refreshProfile();
      setTab("org");
    }

    setCreating(false);
  }, [user, orgName, orgTag, orgDesc, supabase, refreshProfile]);

  const searchOrgs = useCallback(async () => {
    if (!searchQuery.trim()) return;
    const { data } = await supabase
      .from("organizations")
      .select("*")
      .or(`name.ilike.%${searchQuery}%,tag.ilike.%${searchQuery}%`)
      .limit(20);
    setSearchResults((data ?? []) as Organization[]);
  }, [searchQuery, supabase]);

  const joinOrg = useCallback(
    async (orgId: string) => {
      if (!user) return;
      await supabase.from("org_members").insert({
        org_id: orgId,
        user_id: user.id,
        role: "member",
      });
      await supabase
        .from("profiles")
        .update({ org_id: orgId })
        .eq("id", user.id);
      await refreshProfile();
      setTab("org");
    },
    [user, supabase, refreshProfile]
  );

  const leaveOrg = useCallback(async () => {
    if (!user || !profile?.org_id) return;
    await supabase
      .from("org_members")
      .delete()
      .eq("org_id", profile.org_id)
      .eq("user_id", user.id);
    await supabase
      .from("profiles")
      .update({ org_id: null })
      .eq("id", user.id);
    await refreshProfile();
  }, [user, profile, supabase, refreshProfile]);

  const searchFriendsToInvite = useCallback(async () => {
    if (!inviteSearch.trim() || !user) return;
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .or(`username.ilike.%${inviteSearch}%,display_name.ilike.%${inviteSearch}%`)
      .neq("id", user.id)
      .limit(10);
    setInviteResults((data ?? []) as Profile[]);
  }, [inviteSearch, user, supabase]);

  const inviteToOrg = useCallback(
    async (userId: string) => {
      if (!profile?.org_id || !user) return;
      await supabase.from("org_members").insert({
        org_id: profile.org_id,
        user_id: userId,
        role: "member",
      });
      await supabase
        .from("profiles")
        .update({ org_id: profile.org_id })
        .eq("id", userId);
      // Notify invited user
      const orgName = org?.name ?? "una organizacion";
      await sendNotification({
        supabase,
        recipientId: userId,
        fromUserId: user.id,
        type: "org_invite",
        title: "Invitacion a Organizacion",
        message: `Te invitaron a unirte a ${orgName}`,
        link: "/org",
      });
      loadOrg();
      setInviteResults((prev) => prev.filter((p) => p.id !== userId));
    },
    [profile, user, org, supabase, loadOrg]
  );

  const removeMember = useCallback(
    async (userId: string) => {
      if (!profile?.org_id) return;
      await supabase
        .from("org_members")
        .delete()
        .eq("org_id", profile.org_id)
        .eq("user_id", userId);
      await supabase
        .from("profiles")
        .update({ org_id: null })
        .eq("id", userId);
      loadOrg();
    },
    [profile, supabase, loadOrg]
  );

  if (loading || !user) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <div className="text-zinc-500 animate-pulse">Cargando...</div>
      </main>
    );
  }

  const isOwner = org?.owner_id === user.id;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <video autoPlay loop muted playsInline className="fixed inset-0 w-full h-full object-cover opacity-15 pointer-events-none z-0">
        <source src="/videos/mineria.mp4" type="video/mp4" />
      </video>
      <div className="fixed inset-0 bg-gradient-to-b from-zinc-950/60 via-zinc-950/80 to-zinc-950/95 pointer-events-none z-0" />
      <Header subtitle="Organization" />

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
              <button onClick={() => setTab("org")} className={`px-4 py-2 text-sm tracking-wider uppercase transition-all ${tab === "org" ? "text-amber-400 border-b-2 border-amber-500" : "text-zinc-500 hover:text-zinc-400 border-b-2 border-transparent"}`}>
                🏛 Mi Org
              </button>
              {!profile?.org_id && (
                <>
                  <button onClick={() => setTab("create")} className={`px-4 py-2 text-sm tracking-wider uppercase transition-all ${tab === "create" ? "text-amber-400 border-b-2 border-amber-500" : "text-zinc-500 hover:text-zinc-400 border-b-2 border-transparent"}`}>
                    + Crear
                  </button>
                  <button onClick={() => setTab("search")} className={`px-4 py-2 text-sm tracking-wider uppercase transition-all ${tab === "search" ? "text-amber-400 border-b-2 border-amber-500" : "text-zinc-500 hover:text-zinc-400 border-b-2 border-transparent"}`}>
                    🔍 Buscar
                  </button>
                </>
              )}
            </div>

            {/* My Org */}
            {tab === "org" && (
              <>
                {!profile?.org_id ? (
                  <div className="text-center text-zinc-500 py-8">
                    <div className="text-4xl mb-3">🏛</div>
                    <p>No perteneces a ninguna organizacion.</p>
                    <p className="text-xs mt-1">Crea una nueva o busca una existente.</p>
                  </div>
                ) : org ? (
                  <div className="space-y-4">
                    <div className="p-4 rounded-lg border border-zinc-800/50 bg-zinc-900/40">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-xl">
                          🏛
                        </div>
                        <div>
                          <h2 className="text-lg text-zinc-100">{org.name}</h2>
                          {org.tag && <span className="text-xs text-amber-400">[{org.tag}]</span>}
                        </div>
                        {!isOwner && (
                          <button onClick={leaveOrg} className="ml-auto px-3 py-1 text-xs bg-zinc-700 hover:bg-red-600/80 text-zinc-300 rounded transition-colors">
                            Salir
                          </button>
                        )}
                      </div>
                      {org.description && <p className="text-sm text-zinc-400">{org.description}</p>}
                    </div>

                    {/* Members */}
                    <div className="space-y-2">
                      <h3 className="text-xs text-zinc-500 uppercase tracking-wider">
                        Miembros ({members.length})
                      </h3>
                      {members.map((m) => (
                        <div key={m.user_id} className="flex items-center gap-3 p-2 rounded border border-zinc-800/40 bg-zinc-900/30">
                          <div className="relative">
                            {m.profile.avatar_url ? (
                              <img src={m.profile.avatar_url} alt="" className="w-8 h-8 rounded-full" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center">👤</div>
                            )}
                            {m.profile.is_online && (
                              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border border-zinc-900" />
                            )}
                          </div>
                          <div className="flex-1">
                            <span className="text-sm text-zinc-200">{m.profile.display_name ?? m.profile.username}</span>
                            <span className="text-xs text-zinc-600 ml-2">{m.role}</span>
                          </div>
                          {isOwner && m.user_id !== user.id && (
                            <button onClick={() => removeMember(m.user_id)} className="text-zinc-600 hover:text-red-400 text-xs">✕</button>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Invite */}
                    {isOwner && (
                      <div className="p-3 rounded border border-zinc-800/50 bg-zinc-900/30 space-y-2">
                        <h3 className="text-xs text-zinc-500 uppercase tracking-wider">Invitar Miembros</h3>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={inviteSearch}
                            onChange={(e) => setInviteSearch(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && searchFriendsToInvite()}
                            placeholder="Buscar usuario..."
                            className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-amber-500 focus:outline-none"
                          />
                          <button onClick={searchFriendsToInvite} className="px-3 py-1.5 bg-amber-600/80 hover:bg-amber-600 text-zinc-950 text-sm rounded">Buscar</button>
                        </div>
                        {inviteResults.map((p) => (
                          <div key={p.id} className="flex items-center gap-2 p-1.5">
                            <span className="text-sm text-zinc-300 flex-1">{p.display_name ?? p.username}</span>
                            <button onClick={() => inviteToOrg(p.id)} className="px-2 py-0.5 text-xs bg-emerald-600/80 text-zinc-950 rounded">+ Invitar</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-zinc-500 animate-pulse">Cargando org...</div>
                )}
              </>
            )}

            {/* Create Org */}
            {tab === "create" && (
              <div className="p-4 rounded-lg border border-zinc-800/50 bg-zinc-900/40 space-y-4">
                <h2 className="text-sm text-zinc-400 uppercase tracking-wider">Crear Organizacion</h2>
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">Nombre *</label>
                  <input type="text" value={orgName} onChange={(e) => setOrgName(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">Tag (abreviatura)</label>
                  <input type="text" value={orgTag} onChange={(e) => setOrgTag(e.target.value.toUpperCase().slice(0, 6))} maxLength={6} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" placeholder="Ej: ALFLO" />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">Descripcion</label>
                  <textarea value={orgDesc} onChange={(e) => setOrgDesc(e.target.value)} rows={3} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:border-amber-500 focus:outline-none resize-none" />
                </div>
                <button onClick={createOrg} disabled={!orgName.trim() || creating} className="w-full py-2 bg-amber-600/80 hover:bg-amber-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 font-medium rounded transition-colors">
                  {creating ? "Creando..." : "Crear Organizacion"}
                </button>
              </div>
            )}

            {/* Search Orgs */}
            {tab === "search" && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && searchOrgs()} placeholder="Buscar organizacion..." className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-amber-500 focus:outline-none" />
                  <button onClick={searchOrgs} className="px-4 py-2 bg-amber-600/80 hover:bg-amber-600 text-zinc-950 text-sm font-medium rounded">Buscar</button>
                </div>
                {searchResults.map((o) => (
                  <div key={o.id} className="flex items-center gap-3 p-3 rounded border border-zinc-800/50 bg-zinc-900/40">
                    <div className="w-10 h-10 rounded bg-amber-500/20 flex items-center justify-center">🏛</div>
                    <div className="flex-1">
                      <div className="text-sm text-zinc-200">{o.name} {o.tag && <span className="text-xs text-amber-400">[{o.tag}]</span>}</div>
                      {o.description && <div className="text-xs text-zinc-500">{o.description}</div>}
                    </div>
                    <button onClick={() => joinOrg(o.id)} className="px-3 py-1 text-xs bg-emerald-600/80 text-zinc-950 rounded">Unirse</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
