"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import Header from "@/app/assets/header/Header";
import { SIDEBAR_ITEMS } from "@/app/assets/header/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";

export default function ProfilePage() {
  const { user, profile, loading, signOut, refreshProfile } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [age, setAge] = useState<number | "">("");
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name ?? "");
      setLastName(profile.last_name ?? "");
      setAge(profile.age ?? "");
      setDisplayName(profile.display_name ?? "");
    }
  }, [profile]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    await supabase
      .from("profiles")
      .update({
        first_name: firstName || null,
        last_name: lastName || null,
        age: age === "" ? null : Number(age),
        display_name: displayName || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    await refreshProfile();
    setSaving(false);
    setEditing(false);
  };

  if (loading || !user) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <div className="text-zinc-500 animate-pulse">Cargando...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <video
        autoPlay loop muted playsInline
        className="fixed inset-0 w-full h-full object-cover opacity-15 pointer-events-none z-0"
      >
        <source src="/videos/mineria.mp4" type="video/mp4" />
      </video>
      <div className="fixed inset-0 bg-gradient-to-b from-zinc-950/60 via-zinc-950/80 to-zinc-950/95 pointer-events-none z-0" />

      <Header subtitle="Profile" />

      <div className="flex flex-1 min-h-0">
        <aside className="w-12 sm:w-14 flex-shrink-0 bg-zinc-950/90 border-r border-zinc-800/50 flex flex-col items-center py-3 gap-1 z-20 sticky top-12 h-[calc(100vh-3rem)] overflow-y-auto">
          {SIDEBAR_ITEMS.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              title={item.label}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded flex items-center justify-center transition-all duration-150 hover:bg-zinc-800/40"
            >
              <Image
                src={item.icon}
                alt={item.label}
                width={22}
                height={22}
                className="transition-opacity opacity-40 hover:opacity-70"
              />
            </Link>
          ))}
        </aside>

        <div className="flex-1 z-10 relative px-4 py-6 overflow-y-auto">
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Profile Header */}
            <div className="flex items-center gap-4 p-4 rounded-lg border border-zinc-800/50 bg-zinc-900/40">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt="Avatar"
                  className="w-16 h-16 rounded-full border-2 border-amber-500/50"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-zinc-800 border-2 border-zinc-700 flex items-center justify-center text-2xl">
                  👤
                </div>
              )}
              <div className="flex-1">
                <h1 className="text-xl text-zinc-100 font-medium">
                  {profile?.display_name ?? user.email ?? "Usuario"}
                </h1>
                <div className="text-sm text-zinc-500 flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="#5865F2">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                  </svg>
                  {profile?.discord_username ?? user.user_metadata?.full_name ?? ""}
                </div>
              </div>
              <div className="flex gap-2">
                {!editing && (
                  <button
                    onClick={() => setEditing(true)}
                    className="px-3 py-1.5 text-sm bg-amber-600/80 hover:bg-amber-600 text-zinc-950 rounded transition-colors"
                  >
                    Editar
                  </button>
                )}
                <button
                  onClick={signOut}
                  className="px-3 py-1.5 text-sm bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded transition-colors"
                >
                  Cerrar Sesion
                </button>
              </div>
            </div>

            {/* Profile Details */}
            <div className="p-4 rounded-lg border border-zinc-800/50 bg-zinc-900/40 space-y-4">
              <h2 className="text-sm text-zinc-400 uppercase tracking-wider">
                Datos del Perfil
              </h2>

              {editing ? (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-zinc-500 block mb-1">Nombre</label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 block mb-1">Apellido</label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 block mb-1">Display Name</label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 block mb-1">Edad</label>
                    <input
                      type="number"
                      value={age}
                      onChange={(e) => setAge(e.target.value === "" ? "" : parseInt(e.target.value))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <div className="col-span-2 flex gap-2">
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="px-4 py-2 bg-amber-600/80 hover:bg-amber-600 text-zinc-950 text-sm font-medium rounded transition-colors disabled:opacity-50"
                    >
                      {saving ? "Guardando..." : "Guardar"}
                    </button>
                    <button
                      onClick={() => setEditing(false)}
                      className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-sm rounded transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-zinc-500">Nombre:</span>{" "}
                    <span className="text-zinc-200">{profile?.first_name ?? "—"}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500">Apellido:</span>{" "}
                    <span className="text-zinc-200">{profile?.last_name ?? "—"}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500">Display Name:</span>{" "}
                    <span className="text-zinc-200">{profile?.display_name ?? "—"}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500">Edad:</span>{" "}
                    <span className="text-zinc-200">{profile?.age ?? "—"}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500">Organizacion:</span>{" "}
                    <span className="text-zinc-200">{profile?.org_id ? "Vinculada" : "Sin org"}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Links */}
            <div className="grid grid-cols-3 gap-3">
              <Link
                href="/friends"
                className="p-4 rounded-lg border border-zinc-800/50 bg-zinc-900/40 hover:border-amber-500/30 transition-colors text-center"
              >
                <div className="text-2xl mb-1">👥</div>
                <div className="text-sm text-zinc-300">Amigos</div>
              </Link>
              <Link
                href="/org"
                className="p-4 rounded-lg border border-zinc-800/50 bg-zinc-900/40 hover:border-amber-500/30 transition-colors text-center"
              >
                <div className="text-2xl mb-1">🏛</div>
                <div className="text-sm text-zinc-300">Organizacion</div>
              </Link>
              <Link
                href="/party"
                className="p-4 rounded-lg border border-zinc-800/50 bg-zinc-900/40 hover:border-amber-500/30 transition-colors text-center"
              >
                <div className="text-2xl mb-1">🎮</div>
                <div className="text-sm text-zinc-300">Party</div>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
