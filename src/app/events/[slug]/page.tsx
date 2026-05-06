"use client";

// =============================================================================
// SC LABS — Community Event Page (v2, 2026-05-06)
//
// Cambios v2:
//   · Mapa estático sin markers (la imagen ya es decorativa de por sí)
//   · Login Discord obligatorio para inscribirse
//   · Display name default = Discord username, editable
//   · Sin checkbox "participar del sorteo" — la elegibilidad la confirma
//     el admin con asistencia presencial
//   · Sección de ganadores publicados (cuando los haya)
// =============================================================================

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import Header from "@/app/assets/header/Header";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";

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
  attended_count: number;
  raffle_winners_count: number;
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
  notes: string | null;
  created_at: string;
}

interface RaffleWinner {
  id: string;
  prize: string;
  notes: string | null;
  drawn_at: string;
  winner_display_name: string;
  winner_rsi_handle: string | null;
  winner_username: string | null;
  winner_avatar_url: string | null;
}

interface PageData {
  event: CommunityEvent;
  pois: any[];
  announcements: Announcement[];
  myRegistration: MyRegistration | null;
}

export default function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { user } = useAuth();
  const [data, setData] = useState<PageData | null>(null);
  const [winners, setWinners] = useState<RaffleWinner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    Promise.all([
      fetch(`/api/events/${slug}`).then((r) => r.json()),
      fetch(`/api/events/${slug}/raffle`).then((r) => r.json()),
    ])
      .then(([d, w]) => {
        if (d.error) throw new Error(d.error);
        setData(d);
        setWinners(w?.winners ?? []);
        setError(null);
      })
      .catch((e) => setError(e?.message ?? "Error cargando evento."))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => { refresh(); }, [refresh]);

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

  const { event, announcements, myRegistration } = data;
  const eventDate = new Date(event.event_date);
  const now = new Date();
  const daysUntil = Math.ceil((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  // Es admin? Lo detectamos pidiendo al endpoint admin (devuelve 403 si no)
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    fetch(`/api/events/${slug}/admin`).then((r) => setIsAdmin(r.ok)).catch(() => setIsAdmin(false));
  }, [user, slug]);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <video autoPlay loop muted playsInline className="fixed inset-0 w-full h-full object-cover opacity-10 pointer-events-none z-0">
        <source src="/videos/bg.mp4" type="video/mp4" />
      </video>
      <div className="fixed inset-0 bg-gradient-to-b from-zinc-950/70 via-zinc-950/85 to-zinc-950/95 pointer-events-none z-0" />
      <Header subtitle="Bar Citizen" />

      <div className="relative z-10 max-w-[1400px] mx-auto px-3 sm:px-4 lg:px-6 py-4 lg:py-6 space-y-6">
        {/* HERO */}
        <section className="bg-zinc-900/50 border border-zinc-800/60 rounded-md overflow-hidden">
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-amber-400 mb-1">
                  Evento Comunitario · Auspiciado por {event.sponsor_name}
                </p>
                <h1 className="text-2xl sm:text-3xl font-bold text-zinc-100 tracking-wide">{event.name}</h1>
                <p className="text-[12px] text-zinc-400 mt-1">
                  📍 {event.location} · 📅{" "}
                  {eventDate.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}{" "}
                  · {eventDate.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })} hs
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <Link
                    href={`/events/${slug}/admin`}
                    className="text-[11px] px-3 py-2 rounded-sm border border-rose-500/50 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 transition-colors font-medium"
                  >
                    🔧 Panel Admin
                  </Link>
                )}
                {daysUntil >= 0 && (
                  <div className="text-center bg-amber-500/10 border border-amber-500/40 rounded-sm px-4 py-2">
                    <p className="text-[10px] font-mono uppercase tracking-widest text-amber-400">Faltan</p>
                    <p className="text-2xl font-bold font-mono text-amber-300">{daysUntil}</p>
                    <p className="text-[10px] text-amber-400">{daysUntil === 1 ? "día" : "días"}</p>
                  </div>
                )}
              </div>
            </div>
            {event.description && (
              <p className="text-[13px] text-zinc-300 mt-3 leading-relaxed max-w-3xl">
                {event.description}
              </p>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
              <Stat label="Inscriptos" value={event.confirmed_count + event.maybe_count} accent="emerald" />
              <Stat label="Confirman" value={event.confirmed_count} accent="cyan" />
              <Stat label="Tal vez" value={event.maybe_count} accent="amber" />
              <Stat label="Asistieron" value={event.attended_count} accent="zinc" icon="✓" />
            </div>
          </div>
        </section>

        {/* Layout principal */}
        <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-4">
          <div className="space-y-4">
            <RegistrationCard
              event={event}
              myRegistration={myRegistration}
              isLoggedIn={!!user}
              userMetadata={user?.user_metadata as any}
              onRegistered={refresh}
              slug={slug}
            />

            {event.raffle_active && <RaffleCard event={event} winners={winners} />}

            <AnnouncementsCard announcements={announcements} />
          </div>

          <div className="space-y-4">
            <MapCard event={event} />
          </div>
        </div>

        <p className="text-[10px] text-zinc-600 text-center pt-2">
          ¿Querés organizar tu propio Bar Citizen con SC Labs?{" "}
          <Link href="/" className="text-cyan-400 hover:underline">Contactanos</Link>
        </p>
      </div>
    </main>
  );
}

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
  event, myRegistration, isLoggedIn, userMetadata, onRegistered, slug,
}: {
  event: CommunityEvent;
  myRegistration: MyRegistration | null;
  isLoggedIn: boolean;
  userMetadata: { full_name?: string; name?: string; user_name?: string; preferred_username?: string; avatar_url?: string } | undefined;
  onRegistered: () => void;
  slug: string;
}) {
  // Discord username de los metadata del auth.user (Supabase llena estos
  // campos al hacer OAuth con Discord). Caemos a varios fallbacks porque
  // el shape varía entre versiones del provider.
  const discordName =
    userMetadata?.full_name ||
    userMetadata?.name ||
    userMetadata?.user_name ||
    userMetadata?.preferred_username ||
    "";

  const [editing, setEditing] = useState(myRegistration === null);
  const [displayName, setDisplayName] = useState(myRegistration?.display_name ?? discordName);
  const [rsiHandle, setRsiHandle] = useState(myRegistration?.rsi_handle ?? "");
  const [attendance, setAttendance] = useState<"confirmed" | "maybe" | "no">(myRegistration?.attendance_intent ?? "confirmed");
  const [notes, setNotes] = useState(myRegistration?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Actualizar el form cuando cambia myRegistration o el discordName
  useEffect(() => {
    if (myRegistration) {
      setDisplayName(myRegistration.display_name);
      setRsiHandle(myRegistration.rsi_handle ?? "");
      setAttendance(myRegistration.attendance_intent);
      setNotes(myRegistration.notes ?? "");
      setEditing(false);
    } else {
      setDisplayName(discordName);
      setEditing(true);
    }
  }, [myRegistration, discordName]);

  const submit = async (intent?: "confirmed" | "maybe" | "no") => {
    const finalIntent = intent ?? attendance;
    const finalName = displayName.trim() || discordName.trim();
    if (!finalName) {
      setMsg({ kind: "err", text: "Falta el nombre de visualización." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/events/${slug}/registration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: finalName,
          rsi_handle: rsiHandle.trim() || null,
          attendance_intent: finalIntent,
          notes: notes.trim() || null,
          // El sorteo lo confirma el admin con presencialidad — no lo
          // ofrecemos como toggle del usuario, pero mandamos true para
          // marcar la intención (el admin filtra por attended).
          raffle_entry: true,
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
        <h3 className="text-[14px] font-semibold text-amber-300 mb-2">📝 Inscripción al evento</h3>
        <p className="text-[11px] text-zinc-400 mb-3">
          Iniciá sesión con <strong>Discord</strong> para inscribirte. El sorteo se realiza entre los presentes
          confirmados por el equipo organizador.
        </p>
        <Link
          href="/login"
          className="block w-full text-center px-3 py-2 rounded-sm border border-[#5865F2]/60 bg-[#5865F2]/15 text-[#a8b2ff] text-[12px] font-medium hover:bg-[#5865F2]/25 transition-colors"
        >
          Iniciar sesión con Discord →
        </Link>
      </div>
    );
  }

  if (myRegistration && !editing) {
    return (
      <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-md p-4 space-y-2">
        <h3 className="text-[14px] font-semibold text-emerald-300 flex items-center gap-2">✓ Estás inscripto</h3>
        <p className="text-[12px] text-zinc-300">
          <span className="font-mono">{myRegistration.display_name}</span>
          {myRegistration.rsi_handle && <span className="text-zinc-500"> · @{myRegistration.rsi_handle}</span>}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Badge
            text={
              myRegistration.attendance_intent === "confirmed" ? "Voy"
              : myRegistration.attendance_intent === "maybe" ? "Tal vez"
              : "No puedo"
            }
            accent={
              myRegistration.attendance_intent === "confirmed" ? "emerald"
              : myRegistration.attendance_intent === "maybe" ? "amber"
              : "rose"
            }
          />
        </div>
        <p className="text-[10px] text-zinc-500 leading-snug pt-1">
          🎰 Si asistís presencialmente y el equipo te confirma, entrás automáticamente al sorteo.
        </p>
        <div className="flex gap-2 pt-1">
          <button onClick={() => setEditing(true)} className="flex-1 px-2 py-1.5 rounded-sm border border-zinc-700 text-zinc-300 text-[11px] hover:bg-zinc-800 transition-colors">Editar</button>
          <button onClick={cancel} disabled={busy} className="flex-1 px-2 py-1.5 rounded-sm border border-rose-500/40 text-rose-300 text-[11px] hover:bg-rose-500/15 transition-colors disabled:opacity-50">Cancelar</button>
        </div>
        {msg && <p className={`text-[10px] ${msg.kind === "ok" ? "text-emerald-300" : "text-rose-300"}`}>{msg.text}</p>}
      </div>
    );
  }

  // FORM (nuevo o editando)
  return (
    <div className="bg-zinc-900/50 border border-amber-500/30 rounded-md p-4 space-y-3">
      <h3 className="text-[14px] font-semibold text-amber-300">📝 Inscripción al evento</h3>

      {/* Botones rápidos: Voy / Tal vez / No puedo */}
      {!myRegistration && (
        <div className="space-y-2">
          <p className="text-[11px] text-zinc-400">¿Vas a venir?</p>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => { setAttendance("confirmed"); submit("confirmed"); }}
              className="px-2 py-2 rounded-sm border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 text-[12px] font-medium hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
            >
              ✓ Voy
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => { setAttendance("maybe"); submit("maybe"); }}
              className="px-2 py-2 rounded-sm border border-amber-500/40 bg-amber-500/15 text-amber-300 text-[12px] font-medium hover:bg-amber-500/25 transition-colors disabled:opacity-50"
            >
              ? Tal vez
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => { setAttendance("no"); submit("no"); }}
              className="px-2 py-2 rounded-sm border border-rose-500/40 bg-rose-500/15 text-rose-300 text-[12px] font-medium hover:bg-rose-500/25 transition-colors disabled:opacity-50"
            >
              ✕ No puedo
            </button>
          </div>
          <p className="text-[10px] text-zinc-500">
            Te inscribimos como <strong className="text-zinc-300">{discordName || "tu usuario Discord"}</strong>.
            Editá nombre o handle RSI más abajo si querés.
          </p>
        </div>
      )}

      {/* Campos editables (default = Discord username) */}
      <details open={!!myRegistration}>
        <summary className="cursor-pointer text-[10px] font-mono uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors">
          Detalles opcionales
        </summary>
        <div className="space-y-2 mt-2">
          <Field label="Nombre de visualización (Discord por defecto)">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={80}
              placeholder={discordName || "Cómo te llamamos"}
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
      </details>

      {/* Acciones */}
      {myRegistration && (
        <>
          <div className="flex gap-1">
            <AttendanceOption value="confirmed" current={attendance} onClick={() => setAttendance("confirmed")} label="✓ Voy" />
            <AttendanceOption value="maybe" current={attendance} onClick={() => setAttendance("maybe")} label="? Tal vez" />
            <AttendanceOption value="no" current={attendance} onClick={() => setAttendance("no")} label="✕ No puedo" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="flex-1 px-2 py-1.5 rounded-sm border border-zinc-700 text-zinc-400 text-[11px] hover:bg-zinc-800">Cancelar edición</button>
            <button
              onClick={() => submit()}
              disabled={busy || !displayName.trim()}
              className="flex-1 px-2 py-1.5 rounded-sm border border-amber-500/40 bg-amber-500/15 text-amber-300 text-[12px] font-medium hover:bg-amber-500/25 transition-colors disabled:opacity-50"
            >
              {busy ? "Guardando..." : "Actualizar"}
            </button>
          </div>
        </>
      )}

      {msg && <p className={`text-[10px] ${msg.kind === "ok" ? "text-emerald-300" : "text-rose-300"}`}>{msg.text}</p>}
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
          ? value === "confirmed" ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
          : value === "maybe"     ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
          :                         "border-rose-500/40 bg-rose-500/15 text-rose-300"
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
    <span className={`text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-sm border ${cls}`}>{text}</span>
  );
}

// ─── RaffleCard ─────────────────────────────────────────────────────────────

function RaffleCard({ event, winners }: { event: CommunityEvent; winners: RaffleWinner[] }) {
  return (
    <div className="bg-zinc-900/50 border border-cyan-500/30 rounded-md p-4 space-y-2">
      <h3 className="text-[14px] font-semibold text-cyan-300 flex items-center gap-2">🎰 Sorteo de naves CIG</h3>
      {event.raffle_prize_description && (
        <p className="text-[12px] text-zinc-300 leading-snug">{event.raffle_prize_description}</p>
      )}
      {event.raffle_rules && (
        <details className="text-[11px] text-zinc-400">
          <summary className="cursor-pointer hover:text-zinc-200 transition-colors">Reglas del sorteo</summary>
          <p className="mt-2 text-[11px] text-zinc-400 whitespace-pre-line leading-relaxed">{event.raffle_rules}</p>
        </details>
      )}
      <p className="text-[10px] text-zinc-500 pt-1 border-t border-cyan-500/15 leading-relaxed">
        El sorteo se realiza entre los <strong className="text-cyan-300">asistentes presentes</strong>,
        confirmados por el equipo organizador en el lugar.
      </p>

      {/* Ganadores publicados */}
      {winners.length > 0 && (
        <div className="pt-2 border-t border-cyan-500/15 space-y-2">
          <p className="text-[10px] font-mono uppercase tracking-widest text-cyan-400">
            🏆 Ganadores
          </p>
          {winners.map((w) => (
            <div key={w.id} className="flex items-start gap-2 bg-cyan-500/10 border border-cyan-500/30 rounded-sm p-2">
              {w.winner_avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={w.winner_avatar_url} alt="" className="w-8 h-8 rounded-full shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-[12px] shrink-0">🎰</div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-zinc-100 font-semibold truncate">{w.winner_display_name}</p>
                <p className="text-[10px] text-cyan-300">{w.prize}</p>
                {w.notes && <p className="text-[9px] text-zinc-500 italic">{w.notes}</p>}
                <p className="text-[8px] text-zinc-600 font-mono">{new Date(w.drawn_at).toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── AnnouncementsCard ──────────────────────────────────────────────────────

function AnnouncementsCard({ announcements }: { announcements: Announcement[] }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-md p-4">
      <h3 className="text-[14px] font-semibold text-zinc-200 flex items-center gap-2 mb-3">📣 Anuncios</h3>
      {announcements.length === 0 ? (
        <p className="text-[11px] text-zinc-500 italic">Sin anuncios todavía. Volvé a chequear cerca del evento.</p>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {announcements.map((a) => (
            <div key={a.id} className={`rounded-sm border p-2 ${a.is_pinned ? "border-amber-500/40 bg-amber-500/5" : "border-zinc-800/60 bg-zinc-950/40"}`}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <h4 className="text-[12px] font-semibold text-zinc-100">
                  {a.is_pinned && <span className="text-amber-400 mr-1">📌</span>}
                  {a.title}
                </h4>
                <span className="text-[9px] text-zinc-600 font-mono shrink-0">{new Date(a.created_at).toLocaleDateString()}</span>
              </div>
              <p className="text-[11px] text-zinc-400 whitespace-pre-line leading-relaxed">{a.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MapCard ────────────────────────────────────────────────────────────────
// Mapa estático sin markers — la imagen ya tiene la ruta dibujada como bolitas
// azules y los nombres de cada bar. No agregamos overlays.

function MapCard({ event }: { event: CommunityEvent }) {
  if (!event.map_image_url) {
    return (
      <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-md p-4 text-zinc-500 text-[12px]">
        Sin mapa todavía.
      </div>
    );
  }
  return (
    <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-md overflow-hidden">
      <div className="px-3 py-2 border-b border-zinc-800/50">
        <h3 className="text-[12px] font-semibold text-zinc-200 flex items-center gap-2">🗺 Mapa del recorrido</h3>
      </div>
      <div className="relative w-full bg-zinc-950 flex items-center justify-center p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={event.map_image_url}
          alt={`Mapa de ${event.name}`}
          className="max-w-full max-h-[80vh] object-contain rounded-sm"
          draggable={false}
        />
      </div>
    </div>
  );
}
