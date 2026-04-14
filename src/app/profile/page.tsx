"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  X, Lock, ChevronDown, Shield,
  Settings, CreditCard, Heart, Globe, Bell, Eye, Check, Link2,
} from "lucide-react";
import Header from "@/app/assets/header/Header";
import { SIDEBAR_ITEMS } from "@/app/assets/header/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { PageVideoBackground } from "@/components/shared/PageVideoBackground";

// ── Types ──────────────────────────────────────────────────────────────────
type SectionId = "config" | "subs" | "org";

// ── Panel: Configuración ───────────────────────────────────────────────────

function ConfigPanel({ onClose }: { onClose: () => void }) {
  const [lang, setLang] = useState("es");
  const [notifOn, setNotifOn] = useState(true);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [privacy, setPrivacy] = useState("Todo el mundo");
  const [linkedOpen, setLinkedOpen] = useState(true);
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-zinc-900/50 backdrop-blur-sm px-6 py-5 border-b border-zinc-800/30 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <Settings size={16} className="text-amber-500" />
          <span className="font-mono text-xs tracking-[0.15em] uppercase text-zinc-300">Configuración del sitio</span>
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded border border-zinc-700/50 flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-all"><X size={13} /></button>
      </div>
      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(245,158,11,0.3) transparent" }}>
        {/* Language */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Globe size={12} className="text-zinc-600" />
              <span className="text-[10px] font-mono tracking-[0.15em] uppercase text-zinc-500">Idioma predefinido</span>
            </div>
          </div>
          <p className="text-[11px] text-zinc-600 mb-3">Selecciona el idioma por defecto de la interfaz</p>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { code: "es", flag: "🇪🇸", label: "Español" },
              { code: "en", flag: "🇬🇧", label: "English" },
              { code: "de", flag: "🇩🇪", label: "Deutsch" },
              { code: "fr", flag: "🇫🇷", label: "Français" },
              { code: "it", flag: "🇮🇹", label: "Italiano" },
              { code: "zh", flag: "🇨🇳", label: "中文" },
            ].map(l => (
              <button key={l.code} onClick={() => setLang(l.code)}
                className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs border transition-all ${
                  lang === l.code
                    ? "border-amber-500/60 bg-amber-500/10 text-amber-400"
                    : "border-zinc-800/60 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
                }`}>
                <span className="text-base leading-none">{l.flag}</span>
                <span>{l.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="h-px bg-zinc-800/40" />

        {/* Notificaciones — toggle */}
        <div className="flex items-center gap-3 py-3 border-b border-zinc-800/20">
          <div className="w-8 h-8 rounded-lg bg-zinc-800/50 flex items-center justify-center text-zinc-400 flex-shrink-0"><Bell size={14} /></div>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-zinc-300">Notificaciones</div>
            <div className="text-xs text-zinc-600 mt-0.5">Recibir alertas y avisos del sistema</div>
          </div>
          <button
            onClick={() => setNotifOn(v => !v)}
            className={`relative w-10 h-5 rounded-full border transition-all flex-shrink-0 cursor-pointer ${
              notifOn ? "bg-amber-500/20 border-amber-500/50" : "bg-zinc-800 border-zinc-700"
            }`}
          >
            <div className={`absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200 ${
              notifOn ? "left-5 bg-amber-500" : "left-0.5 bg-zinc-600"
            }`} />
          </button>
        </div>

        {/* Privacidad — dropdown */}
        <div className="border-b border-zinc-800/20">
          <button
            onClick={() => setPrivacyOpen(v => !v)}
            className="w-full flex items-center gap-3 py-3 cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-zinc-800/50 flex items-center justify-center text-zinc-400 flex-shrink-0"><Eye size={14} /></div>
            <div className="flex-1 min-w-0 text-left">
              <div className="text-sm text-zinc-300">Privacidad del perfil</div>
              <div className="text-xs text-zinc-500 mt-0.5">{privacy}</div>
            </div>
            <ChevronDown size={13} className={`text-zinc-600 flex-shrink-0 transition-transform ${privacyOpen ? "rotate-180" : ""}`} />
          </button>
          {privacyOpen && (
            <div className="mb-2 ml-11 flex flex-col gap-1">
              {["Todo el mundo", "Organización", "Amigos", "Nadie"].map(opt => (
                <button
                  key={opt}
                  onClick={() => { setPrivacy(opt); setPrivacyOpen(false); }}
                  className={`text-left text-sm px-3 py-2 rounded-lg transition-all cursor-pointer ${
                    privacy === opt
                      ? "bg-amber-500/10 text-amber-400 border border-amber-500/25"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                  }`}
                >{opt}</button>
              ))}
            </div>
          )}
        </div>

        {/* Cuentas vinculadas — collapsible */}
        <div>
          <button
            onClick={() => setLinkedOpen(v => !v)}
            className="w-full flex items-center justify-between mb-3 cursor-pointer group"
          >
            <div className="flex items-center gap-2">
              <Link2 size={12} className="text-zinc-600 group-hover:text-zinc-400 transition-colors" />
              <span className="text-[10px] font-mono tracking-[0.15em] uppercase text-zinc-500 group-hover:text-zinc-300 transition-colors">Cuentas Vinculables</span>
            </div>
            <ChevronDown
              size={12}
              className={`text-zinc-600 group-hover:text-zinc-400 transition-all duration-200 ${linkedOpen ? "rotate-0" : "-rotate-90"}`}
            />
          </button>
          {linkedOpen && (
            <>
              {/* Discord */}
              <div className="flex items-center gap-3 py-3 border-b border-zinc-800/20">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-indigo-400">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-zinc-300">Discord</div>
                  <div className="text-xs text-zinc-500 mt-0.5">sr_frost#0001 · Vinculado</div>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-lime-700/40 text-lime-500 bg-lime-500/5">Activo</span>
              </div>
              {/* RSI */}
              <div className="flex items-center gap-3 py-3 border-b border-zinc-800/20 opacity-50">
                <div className="w-8 h-8 rounded-lg bg-zinc-800/40 flex items-center justify-center flex-shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-zinc-600">
                    <path d="M12 3L22 9V15L12 21L2 15V9L12 3Z" stroke="currentColor" strokeWidth="1.5"/>
                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-zinc-500">RSI Account</div>
                  <div className="text-xs text-zinc-700 mt-0.5">No vinculado</div>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-zinc-700/40 text-zinc-600 bg-zinc-900/30">—</span>
              </div>
            </>
          )}
        </div>

        {/* Placeholders */}
        <div>
          <div className="text-[10px] font-mono tracking-[0.15em] uppercase text-zinc-600 mb-2">Próximamente</div>
          {[
            { icon: <Shield size={14} />, label: "Seguridad y 2FA", desc: "Autenticación en dos pasos" },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-3 py-3 border-b border-zinc-800/20 opacity-35 cursor-not-allowed select-none">
              <div className="w-8 h-8 rounded-lg bg-zinc-800/50 flex items-center justify-center text-zinc-600 flex-shrink-0">{item.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-zinc-400">{item.label}</div>
                <div className="text-xs text-zinc-600 mt-0.5">{item.desc}</div>
              </div>
              <span className="text-[10px] font-mono text-zinc-700 border border-zinc-800 rounded px-2 py-0.5 flex-shrink-0">SOON</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Panel: Suscripciones ───────────────────────────────────────────────────

function SubsPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-zinc-900/50 backdrop-blur-sm px-6 py-5 border-b border-zinc-800/30 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <Lock size={16} className="text-zinc-500" />
          <span className="font-mono text-xs tracking-[0.15em] uppercase text-zinc-300">Funciones especiales</span>
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded border border-zinc-700/50 flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-all"><X size={13} /></button>
      </div>
      {/* Body */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
        <div className="w-14 h-14 rounded-2xl border border-zinc-800/60 bg-zinc-900/40 flex items-center justify-center">
          <Lock size={24} className="text-zinc-700" />
        </div>
        <div>
          <div className="text-base font-bold text-zinc-400 mb-1">Próximamente</div>
          <p className="text-xs text-zinc-600 leading-relaxed">Esta sección estará disponible más adelante.</p>
        </div>
      </div>
    </div>
  );
}

// ── Panel: Organización ────────────────────────────────────────────────────

function OrgInfoPanel({ orgName, onClose }: { orgName: string | null; onClose: () => void }) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-zinc-900/50 backdrop-blur-sm px-6 py-5 border-b border-zinc-800/30 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <Shield size={16} className="text-amber-500" />
          <span className="font-mono text-xs tracking-[0.15em] uppercase text-zinc-300">Organización</span>
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded border border-zinc-700/50 flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-all"><X size={13} /></button>
      </div>
      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(245,158,11,0.3) transparent" }}>
        {orgName ? (
          <>
            {/* Org header */}
            <div className="flex items-center gap-4 p-4 rounded-xl border border-zinc-800/50 bg-zinc-900/30">
              <div className="w-[64px] h-[64px] rounded-xl border border-amber-600/30 bg-zinc-900/60 flex items-center justify-center flex-shrink-0 overflow-hidden p-1">
                <img src="/sclabs-logo.png" alt="org logo" className="w-full h-full object-contain drop-shadow-[0_0_8px_rgba(232,137,12,0.4)]" />
              </div>
              <div>
                <div className="text-lg font-bold text-zinc-100 tracking-wide">{orgName}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-lime-400" />
                  <span className="text-xs text-zinc-500 font-mono">15 miembros online</span>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/20 p-3 text-center">
                <div className="text-2xl font-bold text-lime-400">15</div>
                <div className="text-xs text-zinc-500 mt-0.5">Miembros online</div>
              </div>
              <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/20 p-3 text-center">
                <div className="text-2xl font-bold text-amber-400">3</div>
                <div className="text-xs text-zinc-500 mt-0.5">Rango</div>
              </div>
            </div>

            {/* Bio */}
            <div>
              <div className="text-[10px] font-mono tracking-[0.15em] uppercase text-zinc-500 mb-2">Descripción</div>
              <div className="rounded-xl border border-zinc-800/40 bg-zinc-900/20 p-4 min-h-[90px]">
                <p className="text-sm text-zinc-500 leading-relaxed italic">
                  Somos una organización dedicada al análisis táctico, la minería y las operaciones de combate en el universo de Star Citizen. Únete a nosotros y forma parte de una comunidad en crecimiento.
                </p>
              </div>
              <p className="text-[10px] text-zinc-700 mt-2 font-mono">* Editable por el fundador de la org — próximamente</p>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-48 text-center gap-3">
            <Shield size={36} className="text-zinc-800" />
            <div>
              <p className="text-sm text-zinc-500">No perteneces a ninguna organización</p>
              <p className="text-xs text-zinc-700 mt-1">La gestión de organizaciones estará disponible próximamente</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { user, profile, loading, signOut, refreshProfile } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  // Section state
  const [activeSection, setActiveSection] = useState<SectionId | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Edit state
  const [editMode,    setEditMode]    = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [country,     setCountry]     = useState("");
  const [orgName,     setOrgName]     = useState<string | null>(null);

  // Auth redirect
  // useEffect(() => {
  //   if (!loading && !user) router.push("/login");
  // }, [user, loading, router]);

  // Init profile data
  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? "");
      setCountry(profile.country ?? "");
    }
  }, [profile]);

  // Fetch org name from organizations table
  useEffect(() => {
    if (!profile?.org_id) { setOrgName("SC Labs"); return; } // preview fallback
    supabase
      .from("organizations")
      .select("name")
      .eq("id", profile.org_id)
      .single()
      .then(({ data }) => setOrgName(data?.name ?? null));
  }, [profile?.org_id]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1600);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  function cancelEdit() {
    setDisplayName(profile?.display_name ?? "");
    setCountry(profile?.country ?? "");
    setEditMode(false);
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    await supabase.from("profiles").update({
      display_name: displayName || null,
      country:      country || null,
      updated_at:   new Date().toISOString(),
    }).eq("id", user.id);
    await refreshProfile();
    setSaving(false);
    setEditMode(false);
  }

  if (loading) {
    return (
      <main className="relative min-h-screen text-zinc-100 flex items-center justify-center">
        <PageVideoBackground src="/videos/comparador.mp4" />
        <div className="relative z-10 text-zinc-500 font-mono text-sm animate-pulse">CARGANDO PERFIL...</div>
      </main>
    );
  }

  const heroName     = profile?.display_name ?? user?.email?.split("@")[0] ?? "Sr_Frost";
  const initials     = heroName.slice(0, 2).toUpperCase();
  const avatarUrl    = profile?.avatar_url ?? null;
  // Discord linked account — all real users enter via Discord so discord_username is always set.
  // "sr_frost" fallback only activates in preview (profile=null, user=null).
  const linkedDiscord = profile?.discord_username ?? "sr_frost";

  // Panel width animation helper
  function panelStyle(open: boolean): React.CSSProperties {
    return {
      width:         open ? "620px" : "0px",
      opacity:       open ? 1 : 0,
      pointerEvents: open ? "auto" : "none",
      transition:    "width 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.32s ease",
      overflow:      "hidden",
      flexShrink:    0,
    };
  }

  // Center border-radius based on activeSection and isMobile
  const centerRadius = activeSection !== null && !isMobile ? "rounded-l-2xl rounded-r-none" : "rounded-2xl";

  const dotBg: React.CSSProperties = {
    backgroundImage: "radial-gradient(rgba(245,158,11,0.05) 1px, transparent 1px)",
    backgroundSize:  "28px 28px",
  };

  return (
    <main className="relative h-screen overflow-hidden text-zinc-100 flex flex-col">
      <PageVideoBackground src="/videos/comparador.mp4" />

      {/* Dot grid background (above the video, below content) */}
      <div className="fixed inset-0 pointer-events-none z-[1]" style={dotBg} />

      <Header subtitle="Perfil" />

      <div className="flex flex-1 min-h-0 relative z-10">
        {/* Sidebar */}
        <aside className="w-12 sm:w-14 flex-shrink-0 bg-zinc-950/90 border-r border-zinc-800/50 flex flex-col items-center py-3 gap-1 z-20 overflow-y-auto">
          {SIDEBAR_ITEMS.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              title={item.label}
              className={`w-9 h-9 sm:w-10 sm:h-10 rounded flex items-center justify-center transition-all duration-150 ${
                item.key === "profile"
                  ? "bg-amber-500/15 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.3)]"
                  : "hover:bg-zinc-800/40"
              }`}
            >
              <Image
                src={item.icon}
                alt={item.label}
                width={22}
                height={22}
                className={`transition-opacity ${item.key === "profile" ? "opacity-100" : "opacity-40 hover:opacity-70"}`}
              />
            </Link>
          ))}
        </aside>

        {/* Stage: center always fixed, panel absolutely positioned on the right */}
        <div className="flex-1 relative flex items-center justify-center overflow-y-hidden">

          {/* ── CENTER — always centered ── */}
          <div
            style={{
              width:          "min(880px, 100%)",
              height:         "82vh",
              flexShrink:     0,
              background:     "rgba(12,14,10,0.72)",
              backdropFilter: "blur(16px)",
              border:         "1px solid rgba(180,170,120,0.15)",
              overflow:       "hidden",
              display:        "flex",
              flexDirection:  "column",
              transition:     "border-radius 0.4s cubic-bezier(0.4,0,0.2,1)",
              zIndex:         10,
            }}
            className={centerRadius}
          >
            {/* Center accent line */}
            <div className="h-[3px] bg-gradient-to-r from-amber-600 to-lime-600 flex-shrink-0" />

            {/* Hero */}
            <div className="bg-zinc-900/50 px-7 border-b border-zinc-800/30 flex items-center gap-5 flex-shrink-0 backdrop-blur-sm h-[130px]">
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                <div className="w-[78px] h-[78px] rounded-full border-2 border-amber-600 bg-zinc-800 flex items-center justify-center font-bold text-[26px] text-amber-500 overflow-hidden">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                  ) : (
                    initials
                  )}
                </div>
                <div className="w-3 h-3 rounded-full bg-lime-400 border-[3px] border-zinc-900 absolute bottom-0.5 right-0.5" />
              </div>

              {/* Name & badges */}
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[30px] text-zinc-100 tracking-wide leading-none">{heroName}</div>
                <div className="flex items-center gap-1.5 mt-1.5 font-mono text-xs text-lime-400">
                  <div className="w-1.5 h-1.5 rounded-full bg-lime-400" />
                  EN LÍNEA
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full border border-slate-600/30 bg-slate-500/10 text-slate-300">
                    <Shield size={10} />
                    {orgName}
                  </span>
                  <span className="inline-flex items-center text-xs font-medium px-3 py-1 rounded-full border border-zinc-700/50 text-zinc-500 font-mono">
                    #{profile?.user_number ?? "—"}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col items-end gap-2 ml-auto flex-shrink-0">
                <button
                  onClick={() => setEditMode(true)}
                  className={`h-10 px-5 rounded-lg border font-bold text-sm tracking-wide cursor-pointer transition-all ${
                    editMode
                      ? "bg-amber-600 border-amber-600 text-white"
                      : "border-amber-600 bg-transparent text-amber-500 hover:bg-amber-500/10"
                  }`}
                >
                  {editMode ? "EDITANDO…" : "EDITAR PERFIL"}
                </button>
                <button
                  onClick={signOut}
                  className="text-[10px] font-mono tracking-widest uppercase text-zinc-600 hover:text-zinc-400 transition-colors"
                >
                  Cerrar sesión
                </button>
              </div>
            </div>

            {/* Center scrollable body */}
            <div
              className="flex-1 overflow-y-auto overflow-x-hidden"
              style={{
                scrollbarWidth: "thin",
                scrollbarColor: "rgba(245,158,11,0.3) transparent",
              }}
            >
              {isMobile && activeSection ? (
                <>
                  <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-800/40 flex-shrink-0 bg-zinc-900/30">
                    <button
                      onClick={() => setActiveSection(null)}
                      className="flex items-center gap-2 text-sm text-zinc-300 hover:text-zinc-100 transition-colors"
                    >
                      <ChevronDown size={16} className="-rotate-90" />
                      Volver al perfil
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(245,158,11,0.3) transparent" }}>
                    {activeSection === "config" && <ConfigPanel onClose={() => setActiveSection(null)} />}
                    {activeSection === "subs"   && <SubsPanel onClose={() => setActiveSection(null)} />}
                    {activeSection === "org"    && <OrgInfoPanel orgName={orgName} onClose={() => setActiveSection(null)} />}
                  </div>
                </>
              ) : (
                <>
                  {/* Profile data section */}
                  <div className="px-7 py-5 border-b border-zinc-800/30">
                    <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-zinc-500 mb-3.5">
                      Datos del perfil
                    </div>

                    {editMode ? (
                      <>
                        <div className="grid grid-cols-2 gap-x-10 gap-y-0">
                          <div>
                            <div className="flex justify-between items-center py-2.5 border-b border-zinc-800/30">
                              <span className="text-sm text-zinc-400">Display name</span>
                              <input
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                className="w-[155px] bg-zinc-800 border border-zinc-600/70 rounded-md px-3 py-1.5 text-[13px] text-zinc-100 focus:border-amber-500 focus:outline-none"
                              />
                            </div>
                            <div className="flex justify-between items-center py-2.5">
                              <span className="text-sm text-zinc-400">Organización</span>
                              <span className="text-sm font-medium text-zinc-200">{orgName ?? "—"}</span>
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between items-center py-2.5 border-b border-zinc-800/30">
                              <span className="text-sm text-zinc-400">RSI Handle</span>
                              <span className="text-sm text-yellow-500 cursor-pointer">{profile?.username ?? "—"} ↗</span>
                            </div>
                            <div className="flex justify-between items-center py-2.5">
                              <span className="text-sm text-zinc-400">Country</span>
                              <input
                                value={country}
                                onChange={(e) => setCountry(e.target.value)}
                                placeholder="País"
                                className="w-[155px] bg-zinc-800 border border-zinc-600/70 rounded-md px-3 py-1.5 text-[13px] text-zinc-100 placeholder-zinc-600 focus:border-amber-500 focus:outline-none"
                              />
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-end gap-2.5 mt-4">
                          <button
                            onClick={cancelEdit}
                            className="h-9 px-4 rounded-lg border border-zinc-600/50 bg-transparent text-zinc-400 text-sm cursor-pointer transition-all hover:bg-zinc-800"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={handleSave}
                            disabled={saving}
                            className="h-9 px-5 rounded-lg border-none bg-amber-600 text-white font-bold text-sm cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-50"
                          >
                            {saving ? "GUARDANDO..." : "GUARDAR"}
                          </button>
                        </div>
                      </>
                    ) : (
                      <><div className="grid grid-cols-2 gap-x-10">
                        <div>
                          <div className="flex justify-between items-center py-2.5 border-b border-zinc-800/30">
                            <span className="text-sm text-zinc-400">Display name</span>
                            <span className="text-sm font-medium text-zinc-100">{heroName}</span>
                          </div>
                          <div className="flex justify-between items-center py-2.5">
                            <span className="text-sm text-zinc-400">Organización</span>
                            <span className="text-sm font-medium text-zinc-200">{orgName ?? "—"}</span>
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between items-center py-2.5 border-b border-zinc-800/30">
                            <span className="text-sm text-zinc-400">RSI Handle</span>
                            <span className="text-sm text-yellow-500 cursor-pointer">{profile?.username ?? "—"} ↗</span>
                          </div>
                          <div className="flex justify-between items-center py-2.5">
                            <span className="text-sm text-zinc-400">Country</span>
                            <span className={`text-sm font-medium ${country ? "text-zinc-100" : "text-zinc-600"}`}>{country || "—"}</span>
                          </div>
                        </div>
                      </div>

                      {/* Linked accounts — always visible */}
                      {linkedDiscord && (
                        <div className="mt-4 pt-3 border-t border-zinc-700/40">
                          <div className="flex items-center gap-1.5 mb-2">
                            <Link2 size={10} className="text-zinc-500" />
                            <span className="text-[10px] font-mono tracking-[0.12em] uppercase text-zinc-500">Cuentas vinculadas</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-indigo-500/40 bg-indigo-500/10">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-indigo-400 flex-shrink-0">
                                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
                              </svg>
                              <span className="text-xs text-indigo-300 font-medium">{linkedDiscord}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                    )}
                  </div>

                  {/* Menu sections */}
                  <div className="px-7 py-5 flex-1">
                    <div className="text-[10px] font-mono tracking-[0.12em] uppercase text-zinc-500 mb-4">
                      Configuración de cuenta
                    </div>
                    <div className="space-y-2">
                      {[
                        {
                          id: "config" as SectionId,
                          icon: <Settings size={17} />,
                          iconCls: "bg-zinc-800/80 text-zinc-400",
                          label: "Configuración del sitio",
                          desc: "Idioma, notificaciones y preferencias",
                          soon: false,
                        },
                        {
                          id: "subs" as SectionId,
                          icon: <Lock size={17} />,
                          iconCls: "bg-zinc-800/50 text-zinc-600",
                          label: "Funciones especiales",
                          desc: "Próximamente disponible",
                          soon: true,
                        },
                        {
                          id: "org" as SectionId,
                          icon: <Shield size={17} />,
                          iconCls: "bg-slate-500/10 text-slate-400",
                          label: "Organización",
                          desc: orgName ?? "Sin organización",
                          soon: false,
                        },
                      ].map(item => (
                        <button
                          key={item.id}
                          onClick={() => setActiveSection(prev => prev === item.id ? null : item.id)}
                          className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl border transition-all text-left cursor-pointer ${
                            activeSection === item.id
                              ? "border-amber-500/30 bg-amber-500/5"
                              : "border-zinc-800/50 bg-zinc-900/20 hover:border-zinc-700/50 hover:bg-zinc-800/20"
                          }`}
                        >
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${item.iconCls}`}>
                            {item.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className={`text-sm font-medium ${item.soon ? "text-zinc-500" : "text-zinc-200"}`}>{item.label}</div>
                            <div className="text-xs text-zinc-500 mt-0.5 truncate">{item.desc}</div>
                          </div>
                          {item.soon ? (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-zinc-700/50 text-zinc-600 bg-zinc-900/50 flex-shrink-0">SOON</span>
                          ) : (
                            <ChevronDown
                              size={14}
                              className={`flex-shrink-0 transition-all duration-200 ${
                                activeSection === item.id
                                  ? "-rotate-90 text-amber-500"
                                  : "-rotate-90 text-zinc-700"
                              }`}
                            />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                </>
              )}
            </div>
          </div>

          {/* ── RIGHT PANEL — anchored to center's right edge ── */}
          {!isMobile && (
            <div style={{
              position:   "absolute",
              left:       "calc(50% + 440px)",
              top:        "50%",
              transform:  "translateY(-50%)",
              height:     "82vh",
              display:    "flex",
              alignItems: "stretch",
            }}>
              {(["config", "subs", "org"] as SectionId[]).map(id => (
                <div key={id} style={{
                  ...panelStyle(activeSection === id),
                  borderRadius:   "0 16px 16px 0",
                  background:     "rgba(12,14,10,0.72)",
                  backdropFilter: "blur(16px)",
                  border:         "1px solid rgba(180,170,120,0.15)",
                  borderLeft:     "none",
                  display:        "flex",
                  flexDirection:  "column",
                }}>
                  <div className="h-[3px] bg-gradient-to-r from-lime-600 to-amber-600 flex-shrink-0" />
                  {activeSection === "config" && id === "config" && <ConfigPanel onClose={() => setActiveSection(null)} />}
                  {activeSection === "subs"   && id === "subs"   && <SubsPanel onClose={() => setActiveSection(null)} />}
                  {activeSection === "org"    && id === "org"    && <OrgInfoPanel orgName={orgName} onClose={() => setActiveSection(null)} />}
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </main>
  );
}
