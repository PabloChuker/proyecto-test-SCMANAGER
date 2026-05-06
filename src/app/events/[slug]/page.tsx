"use client";

// =============================================================================
// SC LABS — Community Event Page (2026-05-06)
//
// /events/[slug] — página del evento comunitario (Bar Citizen Ourense, etc).
// Incluye:
//   1) Hero: nombre, fecha, sponsor, descripción, contadores
//   2) Mapa interactivo con POIs como markers + ruta destacada
//   3) Sección de registro / sorteo (auth required)
//   4) Anuncios del organizador
// =============================================================================

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import Header from "@/app/assets/header/Header";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslations } from "next-intl";

interface CommunityEvent {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  event_date: string;
  location: string | null;
  sponsor_name: string | null;
  sponsor_url: string | null;
  banner_url: string | null;
  map_image_url: string | null;
  registration_open: boolean;
  raffle_active: boolean;
  raffle_prize_description: string | null;
  raffle_rules: string | null;
  confirmed_count: number;
  maybe_count: number;
  raffle_entries_count: number;
}

interface POI {
  id: string;
  name: string;
  description: string | null;
  poi_type: "start" | "route" | "meeting" | "end" | "reference";
  order_index: number;
  map_x_percent: number | null;
  map_y_percent: number | null;
  latitude: number | null;
  longitude: number | null;
  icon: string | null;
  external_url: string | null;
}

interface Announcement {
  id: string;
  title: string;
  body: string;
  is_pinned: boolean;
  created_at: string;
}

interface MyRegistration {
  id: string;
  display_name: string;
  rsi_handle: string | null;
  attendance_intent: "confirmed" | "maybe" | "no";
  raffle_entry: boolean;
  notes: string | null;
  created_at: string;
}

interface PageData {
  event: CommunityEvent;
  pois: POI[];
  announcements: Announcement[];
  myRegistration: MyRegistration | null;
}

export default function EventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const t = useTranslations("PageTitles");
  const { slug } = use(params);
  const { user } = useAuth();
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPoi, setSelectedPoi] = useState<POI | null>(null);

  const refresh = useCallback(() => {
    fetch(`/api/events/${slug}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e?.message ?? "Error cargando evento."))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        <Header subtitle="Bar Citizen" />
        <div className="flex items-center justify-center py-20 text-zinc-500 font-mono text-sm">
          Cargando evento...
        </div>
      </main>
    );
  }
  if (error || !data) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        <Header subtitle="Bar Citizen" />
        <div className="max-w-3xl mx-auto px-4 py-12">
          <p className="text-rose-300 text-sm">{error ?? "Evento no encontrado."}</p>
        </div>
      </main>
    );
  }

  const { event, pois, announcements, myRegistration } = data;
  const eventDate = new Date(event.event_date);
  const now = new Date();
  const daysUntil = Math.ceil((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const routePois = pois.filter((p) => p.poi_type !== "reference").sort((a, b) => a.order_index - b.order_index);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <video autoPlay loop muted playsInline className="fixed inset-0 w-full h-full object-cover opacity-10 pointer-events-none z-0">
        <source src="/videos/bg.mp4" type="video/mp4" />
      </video>
      <div className="fixed inset-0 bg-gradient-to-b from-zinc-950/70 via-zinc-950/85 to-zinc-950/95 pointer-events-none z-0" />
      <Header subtitle="Bar Citizen" />

      <div className="relative z-10 max-w-[1400px] mx-auto px-3 sm:px-4 lg:px-6 py-4 lg:py-6 space-y-6">
        {/* ── HERO ────────────────────────────────────────────────────────── */}
        <section className="bg-zinc-900/50 border border-zinc-800/60 rounded-md overflow-hidden">
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-amber-400 mb-1">
                  Evento Comunitario · Auspiciado por {event.sponsor_name}
                </p>
                <h1 className="text-2xl sm:text-3xl font-bold text-zinc-100 tracking-wide">
                  {event.name}
                </h1>
                <p className="text-[12px] text-zinc-400 mt-1">
                  📍 {event.location} · 📅{" "}
                  {eventDate.toLocaleDateString("es-AR", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}{" "}
                  · {eventDate.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })} hs
                </p>
              </div>
              {daysUntil >= 0 && (
                <div className="text-center bg-amber-500/10 border border-amber-500/40 rounded-sm px-4 py-2">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-amber-400">
                    Faltan
                  </p>
                  <p className="text-2xl font-bold font-mono text-amber-300">{daysUntil}</p>
                  <p className="text-[10px] text-amber-400">{daysUntil === 1 ? "día" : "días"}</p>
                </div>
              )}
            </div>
            {event.description && (
              <p className="text-[13px] text-zinc-300 mt-3 leading-relaxed max-w-3xl">
                {event.description}
              </p>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
              <Stat label="Confirmados" value={event.confirmed_count} accent="emerald" />
              <Stat label="Tal vez" value={event.maybe_count} accent="amber" />
              {event.raffle_active && (
                <Stat label="En el sorteo" value={event.raffle_entries_count} accent="cyan" icon="🎰" />
              )}
              <Stat label="Paradas" value={routePois.length} accent="zinc" icon="📍" />
            </div>
          </div>
        </section>

        {/* ── 2-col layout: registro+anuncios | mapa+ruta ────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-4">
          {/* IZQ: Registro + Sorteo + Anuncios */}
          <div className="space-y-4">
            <RegistrationCard
              event={event}
              myRegistration={myRegistration}
              isLoggedIn={!!user}
              onRegistered={refresh}
              slug={slug}
            />

            {event.raffle_active && (
              <RaffleCard event={event} myRegistration={myRegistration} />
            )}

            <AnnouncementsCard announcements={announcements} />
          </div>

          {/* DER: Mapa + Ruta */}
          <div className="space-y-4">
            <MapCard
              event={event}
              pois={pois}
              selectedPoi={selectedPoi}
              onSelectPoi={setSelectedPoi}
            />
            <RouteList
              pois={routePois}
              selectedPoi={selectedPoi}
              onSelectPoi={setSelectedPoi}
            />
          </div>
        </div>

        <p className="text-[10px] text-zinc-600 text-center pt-2">
          ¿Querés organizar tu propio Bar Citizen con SC Labs?{" "}
          <Link href="/" className="text-cyan-400 hover:underline">
            Contactanos
          </Link>
        </p>
      </div>
    </main>
  );
}

// ─── Stat ────────────────────────────────────────────────────────────────────

const ACCENTS: Record<string, string> = {
  emerald: "border-emerald-500/30 bg-emerald-500/5 text-emerald-300",
  amber: "border-amber-500/30 bg-amber-500/5 text-amber-300",
  cyan: "border-cyan-500/30 bg-cyan-500/5 text-cyan-300",
  zinc: "border-zinc-700/40 bg-zinc-900/40 text-zinc-300",
};

function Stat({ label, value, accent = "zinc", icon }: { label: string; value: number; accent?: string; icon?: string }) {
  const cls = ACCENTS[accent] ?? ACCENTS.zinc;
  return (
    <div className={`rounded-sm border px-3 py-2 ${cls}`}>
      <p className="text-[9px] font-mono uppercase tracking-widest opacity-80">
        {icon && <span className="mr-1">{icon}</span>}
        {label}
      </p>
      <p className="text-xl font-bold font-mono mt-0.5">{value}</p>
    </div>
  );
}

// ─── RegistrationCard ───────────────────────────────────────────────────────

function RegistrationCard({
  event, myRegistration, isLoggedIn, onRegistered, slug,
}: {
  event: CommunityEvent;
  myRegistration: MyRegistration | null;
  isLoggedIn: boolean;
  onRegistered: () => void;
  slug: string;
}) {
  const [editing, setEditing] = useState(myRegistration === null);
  const [displayName, setDisplayName] = useState(myRegistration?.display_name ?? "");
  const [rsiHandle, setRsiHandle] = useState(myRegistration?.rsi_handle ?? "");
  const [attendance, setAttendance] = useState<"confirmed" | "maybe" | "no">(
    myRegistration?.attendance_intent ?? "confirmed",
  );
  const [raffleEntry, setRaffleEntry] = useState(myRegistration?.raffle_entry ?? true);
  const [notes, setNotes] = useState(myRegistration?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Refresh state from props on prop change (después de un refresh externo)
  useEffect(() => {
    if (myRegistration) {
      setDisplayName(myRegistration.display_name);
      setRsiHandle(myRegistration.rsi_handle ?? "");
      setAttendance(myRegistration.attendance_intent);
      setRaffleEntry(myRegistration.raffle_entry);
      setNotes(myRegistration.notes ?? "");
      setEditing(false);
    } else {
      setEditing(true);
    }
  }, [myRegistration]);

  const submit = async () => {
    if (!displayName.trim()) {
      setMsg({ kind: "err", text: "Ingresá un nombre de visualización." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/events/${slug}/registration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName.trim(),
          rsi_handle: rsiHandle.trim() || null,
          attendance_intent: attendance,
          raffle_entry: raffleEntry,
          notes: notes.trim() || null,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Error registrando.");
      setMsg({ kind: "ok", text: d.action === "created" ? "¡Inscripción confirmada!" : "Inscripción actualizada." });
      onRegistered();
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message ?? "No se pudo registrar." });
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!confirm("¿Cancelar tu inscripción al evento?")) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/events/${slug}/registration`, { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Error.");
      setMsg({ kind: "ok", text: "Inscripción cancelada." });
      onRegistered();
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message ?? "Error." });
    } finally {
      setBusy(false);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="bg-zinc-900/50 border border-amber-500/30 rounded-md p-4">
        <h3 className="text-[14px] font-semibold text-amber-300 mb-2">📝 Inscripción</h3>
        <p className="text-[11px] text-zinc-400 mb-3">
          Iniciá sesión para inscribirte y participar del sorteo.
        </p>
        <Link
          href="/login"
          className="block w-full text-center px-3 py-2 rounded-sm border border-amber-500/40 bg-amber-500/15 text-amber-300 text-[12px] font-medium hover:bg-amber-500/25 transition-colors"
        >
          Iniciar sesión →
        </Link>
      </div>
    );
  }

  if (myRegistration && !editing) {
    return (
      <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-md p-4 space-y-2">
        <h3 className="text-[14px] font-semibold text-emerald-300 flex items-center gap-2">
          ✓ Estás inscripto
        </h3>
        <p className="text-[12px] text-zinc-300">
          <span className="font-mono">{myRegistration.display_name}</span>
          {myRegistration.rsi_handle && (
            <span className="text-zinc-500"> · @{myRegistration.rsi_handle}</span>
          )}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Badge text={myRegistration.attendance_intent === "confirmed" ? "Asistencia confirmada" : myRegistration.attendance_intent === "maybe" ? "Tal vez" : "No asisto"} accent={myRegistration.attendance_intent === "confirmed" ? "emerald" : "amber"} />
          {myRegistration.raffle_entry && <Badge text="🎰 En el sorteo" accent="cyan" />}
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={() => setEditing(true)} className="flex-1 px-2 py-1.5 rounded-sm border border-zinc-700 text-zinc-300 text-[11px] hover:bg-zinc-800 transition-colors">
            Editar
          </button>
          <button onClick={cancel} disabled={busy} className="flex-1 px-2 py-1.5 rounded-sm border border-rose-500/40 text-rose-300 text-[11px] hover:bg-rose-500/15 transition-colors disabled:opacity-50">
            Cancelar
          </button>
        </div>
        {msg && (
          <p className={`text-[10px] ${msg.kind === "ok" ? "text-emerald-300" : "text-rose-300"}`}>{msg.text}</p>
        )}
      </div>
    );
  }

  return (
    <div className="bg-zinc-900/50 border border-amber-500/30 rounded-md p-4 space-y-3">
      <h3 className="text-[14px] font-semibold text-amber-300">
        📝 Inscripción al evento
      </h3>

      <div className="space-y-2">
        <Field label="Nombre de visualización *">
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={80}
            placeholder="Cómo te llamamos en el evento"
            className="w-full px-2 py-1.5 bg-zinc-950 border border-zinc-800/60 rounded-sm text-[12px] text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
          />
        </Field>
        <Field label="Handle RSI (opcional)">
          <input
            type="text"
            value={rsiHandle}
            onChange={(e) => setRsiHandle(e.target.value)}
            maxLength={80}
            placeholder="elchuker"
            className="w-full px-2 py-1.5 bg-zinc-950 border border-zinc-800/60 rounded-sm text-[12px] text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
          />
        </Field>
        <Field label="Asistencia">
          <div className="flex gap-1">
            <AttendanceOption value="confirmed" current={attendance} onClick={() => setAttendance("confirmed")} label="✓ Voy" />
            <AttendanceOption value="maybe" current={attendance} onClick={() => setAttendance("maybe")} label="? Tal vez" />
            <AttendanceOption value="no" current={attendance} onClick={() => setAttendance("no")} label="✕ No puedo" />
          </div>
        </Field>
        {event.raffle_active && (
          <label className="flex items-center gap-2 text-[12px] text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={raffleEntry}
              onChange={(e) => setRaffleEntry(e.target.checked)}
              className="accent-cyan-500"
            />
            🎰 Participar del sorteo de naves CIG
          </label>
        )}
        <Field label="Notas (opcional)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Algo que quieras compartir con el organizador"
            className="w-full px-2 py-1.5 bg-zinc-950 border border-zinc-800/60 rounded-sm text-[12px] text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 resize-none"
          />
        </Field>
      </div>

      <div className="flex gap-2">
        {myRegistration && (
          <button onClick={() => setEditing(false)} className="flex-1 px-2 py-1.5 rounded-sm border border-zinc-700 text-zinc-400 text-[11px] hover:bg-zinc-800">
            Cancelar
          </button>
        )}
        <button
          onClick={submit}
          disabled={busy || !displayName.trim()}
          className="flex-1 px-2 py-1.5 rounded-sm border border-amber-500/40 bg-amber-500/15 text-amber-300 text-[12px] font-medium hover:bg-amber-500/25 transition-colors disabled:opacity-50"
        >
          {busy ? "Guardando..." : myRegistration ? "Actualizar" : "Inscribirme"}
        </button>
      </div>
      {msg && (
        <p className={`text-[10px] ${msg.kind === "ok" ? "text-emerald-300" : "text-rose-300"}`}>{msg.text}</p>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <p className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 mb-1">{label}</p>
      {children}
    </label>
  );
}

function AttendanceOption({ value, current, onClick, label }: { value: string; current: string; onClick: () => void; label: string }) {
  const active = value === current;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 px-2 py-1.5 rounded-sm border text-[11px] transition-colors ${
        active
          ? value === "confirmed"
            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
            : value === "maybe"
            ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
            : "border-rose-500/40 bg-rose-500/15 text-rose-300"
          : "border-zinc-800 text-zinc-500 hover:text-zinc-300"
      }`}
    >
      {label}
    </button>
  );
}

function Badge({ text, accent }: { text: string; accent: "emerald" | "amber" | "cyan" | "rose" }) {
  const cls =
    accent === "emerald" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" :
    accent === "amber"   ? "bg-amber-500/15 text-amber-300 border-amber-500/40" :
    accent === "cyan"    ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/40" :
                            "bg-rose-500/15 text-rose-300 border-rose-500/40";
  return (
    <span className={`text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-sm border ${cls}`}>
      {text}
    </span>
  );
}

// ─── RaffleCard ─────────────────────────────────────────────────────────────

function RaffleCard({ event, myRegistration }: { event: CommunityEvent; myRegistration: MyRegistration | null }) {
  return (
    <div className="bg-zinc-900/50 border border-cyan-500/30 rounded-md p-4 space-y-2">
      <h3 className="text-[14px] font-semibold text-cyan-300 flex items-center gap-2">
        🎰 Sorteo de naves CIG
      </h3>
      {event.raffle_prize_description && (
        <p className="text-[12px] text-zinc-300 leading-snug">
          {event.raffle_prize_description}
        </p>
      )}
      {event.raffle_rules && (
        <details className="text-[11px] text-zinc-400">
          <summary className="cursor-pointer hover:text-zinc-200 transition-colors">
            Reglas del sorteo
          </summary>
          <p className="mt-2 text-[11px] text-zinc-400 whitespace-pre-line leading-relaxed">
            {event.raffle_rules}
          </p>
        </details>
      )}
      <div className="pt-2 border-t border-cyan-500/15">
        {myRegistration?.raffle_entry ? (
          <p className="text-[11px] text-cyan-300">
            ✓ Estás participando del sorteo
          </p>
        ) : (
          <p className="text-[11px] text-zinc-500">
            Marcá la casilla "Participar del sorteo" en tu inscripción para entrar.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── AnnouncementsCard ──────────────────────────────────────────────────────

function AnnouncementsCard({ announcements }: { announcements: Announcement[] }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-md p-4">
      <h3 className="text-[14px] font-semibold text-zinc-200 flex items-center gap-2 mb-3">
        📣 Anuncios
      </h3>
      {announcements.length === 0 ? (
        <p className="text-[11px] text-zinc-500 italic">
          Sin anuncios todavía. Volvé a chequear cerca del evento.
        </p>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {announcements.map((a) => (
            <div
              key={a.id}
              className={`rounded-sm border p-2 ${
                a.is_pinned
                  ? "border-amber-500/40 bg-amber-500/5"
                  : "border-zinc-800/60 bg-zinc-950/40"
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <h4 className="text-[12px] font-semibold text-zinc-100">
                  {a.is_pinned && <span className="text-amber-400 mr-1">📌</span>}
                  {a.title}
                </h4>
                <span className="text-[9px] text-zinc-600 font-mono shrink-0">
                  {new Date(a.created_at).toLocaleDateString()}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 whitespace-pre-line leading-relaxed">
                {a.body}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MapCard ────────────────────────────────────────────────────────────────

function MapCard({
  event, pois, selectedPoi, onSelectPoi,
}: {
  event: CommunityEvent;
  pois: POI[];
  selectedPoi: POI | null;
  onSelectPoi: (poi: POI | null) => void;
}) {
  if (!event.map_image_url) {
    return (
      <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-md p-4 text-zinc-500 text-[12px]">
        Sin mapa todavía.
      </div>
    );
  }
  return (
    <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-md overflow-hidden">
      <div className="px-3 py-2 border-b border-zinc-800/50 flex items-center justify-between">
        <h3 className="text-[12px] font-semibold text-zinc-200 flex items-center gap-2">
          🗺 Mapa del recorrido
        </h3>
        <span className="text-[9px] font-mono text-zinc-500">
          Click en una parada para ver detalles
        </span>
      </div>
      <div className="relative w-full aspect-[1436/2048] max-h-[80vh] mx-auto bg-zinc-950">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={event.map_image_url}
          alt={`Mapa de ${event.name}`}
          className="w-full h-full object-contain"
          draggable={false}
        />
        {/* POIs como markers absolutos */}
        {pois.map((poi) => {
          if (poi.map_x_percent == null || poi.map_y_percent == null) return null;
          const isSelected = selectedPoi?.id === poi.id;
          const isReference = poi.poi_type === "reference";
          return (
            <button
              key={poi.id}
              onClick={() => onSelectPoi(isSelected ? null : poi)}
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-all flex items-center justify-center text-[11px] sm:text-[14px] ${
                isReference
                  ? "w-5 h-5 sm:w-6 sm:h-6 bg-zinc-700/80 border border-zinc-500 text-zinc-300"
                  : poi.poi_type === "start"
                  ? "w-7 h-7 sm:w-9 sm:h-9 bg-emerald-500 border-2 border-emerald-200 text-white shadow-lg"
                  : poi.poi_type === "end"
                  ? "w-7 h-7 sm:w-9 sm:h-9 bg-rose-500 border-2 border-rose-200 text-white shadow-lg"
                  : poi.poi_type === "meeting"
                  ? "w-7 h-7 sm:w-9 sm:h-9 bg-amber-500 border-2 border-amber-200 text-zinc-900 shadow-lg"
                  : "w-6 h-6 sm:w-7 sm:h-7 bg-cyan-500 border-2 border-cyan-200 text-zinc-900 shadow-lg"
              } ${isSelected ? "ring-2 ring-white scale-125 z-10" : "hover:scale-110"}`}
              style={{
                left: `${poi.map_x_percent}%`,
                top: `${poi.map_y_percent}%`,
              }}
              title={poi.name}
            >
              {poi.icon ?? (poi.poi_type === "start" ? "▶" : poi.poi_type === "end" ? "■" : "●")}
            </button>
          );
        })}

        {/* Tooltip del POI seleccionado */}
        {selectedPoi && (
          <div
            className="absolute bg-zinc-950/95 border border-amber-500/40 rounded-sm p-2 max-w-[260px] shadow-xl z-20 pointer-events-auto"
            style={{
              left: `${Math.min(75, selectedPoi.map_x_percent ?? 0)}%`,
              top: `${(selectedPoi.map_y_percent ?? 0) + 3}%`,
              transform: "translateX(-50%)",
            }}
          >
            <p className="text-[11px] font-semibold text-amber-300">
              {selectedPoi.icon} {selectedPoi.name}
            </p>
            {selectedPoi.description && (
              <p className="text-[10px] text-zinc-300 mt-1 leading-snug">
                {selectedPoi.description}
              </p>
            )}
            {(selectedPoi.latitude && selectedPoi.longitude) && (
              <a
                href={`https://www.google.com/maps?q=${selectedPoi.latitude},${selectedPoi.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-cyan-300 hover:underline block mt-1"
              >
                📍 Cómo llegar
              </a>
            )}
            <button
              onClick={() => onSelectPoi(null)}
              className="absolute top-1 right-1 text-zinc-500 hover:text-zinc-200 text-[12px]"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── RouteList ──────────────────────────────────────────────────────────────

function RouteList({
  pois, selectedPoi, onSelectPoi,
}: {
  pois: POI[];
  selectedPoi: POI | null;
  onSelectPoi: (poi: POI | null) => void;
}) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-md overflow-hidden">
      <div className="px-3 py-2 border-b border-zinc-800/50">
        <h3 className="text-[12px] font-semibold text-zinc-200">
          📍 Ruta del evento
        </h3>
      </div>
      <ol className="divide-y divide-zinc-800/40">
        {pois.map((poi, idx) => {
          const active = selectedPoi?.id === poi.id;
          return (
            <li key={poi.id}>
              <button
                onClick={() => onSelectPoi(active ? null : poi)}
                className={`w-full text-left px-3 py-2 flex items-center gap-3 transition-colors ${
                  active ? "bg-amber-500/10" : "hover:bg-zinc-800/40"
                }`}
              >
                <span
                  className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold font-mono ${
                    poi.poi_type === "start"
                      ? "bg-emerald-500 text-white"
                      : poi.poi_type === "end"
                      ? "bg-rose-500 text-white"
                      : poi.poi_type === "meeting"
                      ? "bg-amber-500 text-zinc-900"
                      : "bg-cyan-500 text-zinc-900"
                  }`}
                >
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-zinc-100">
                    {poi.icon} {poi.name}
                  </p>
                  {poi.description && (
                    <p className="text-[10px] text-zinc-500 truncate">{poi.description}</p>
                  )}
                </div>
                {poi.latitude && poi.longitude && (
                  <a
                    href={`https://www.google.com/maps?q=${poi.latitude},${poi.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 text-[10px] text-cyan-300 hover:underline"
                  >
                    Cómo llegar
                  </a>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
