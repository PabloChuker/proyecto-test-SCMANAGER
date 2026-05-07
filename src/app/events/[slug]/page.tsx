"use client";

// =============================================================================
// SC LABS — Community Event Page (v3 medieval, 2026-05-06)
//
// Cambios v3:
//   · Tema medieval con paleta de pergamino + dorado (matchea la onda del mapa)
//   · Logo del Bar Citizen Ourense en el hero
//   · Stats privados (movidos al panel admin)
//   · Botón Panel Admin sólo visible para admins, en footer discreto
//   · Mapa estático sin markers
// =============================================================================

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import Header from "@/app/assets/header/Header";
import { useAuth } from "@/contexts/AuthContext";
import { RaffleStage, type RaffleSession } from "@/components/events/RaffleStage";

interface CommunityEvent {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  tagline: string | null;
  event_date: string;
  location: string | null;
  sponsor_name: string | null;
  sponsor_url: string | null;
  banner_url: string | null;
  logo_url: string | null;
  map_image_url: string | null;
  google_maps_url: string | null;
  discord_url: string | null;
  twitter_url: string | null;
  website_url: string | null;
  custom_links: { label: string; url: string }[] | null;
  registration_open: boolean;
  raffle_active: boolean;
  raffle_prize_description: string | null;
  raffle_rules: string | null;
  raffle_session?: RaffleSession | null;
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
  const [isAdmin, setIsAdmin] = useState(false);

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

  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    fetch(`/api/events/${slug}/admin`).then((r) => setIsAdmin(r.ok)).catch(() => setIsAdmin(false));
  }, [user, slug]);

  // ── Live polling ───────────────────────────────────────────────────────
  // Polling base de 5s siempre activo: necesario para que la pagina detecte
  // automaticamente cuando el admin arranca el modo sorteo (transicion
  // idle → loading) sin que el usuario tenga que recargar. Cuando el modo
  // ya esta activo, aceleramos a 1.5s para captar la pasarela / popup
  // ganador en tiempo real.
  const phase = data?.event?.raffle_session?.phase ?? "idle";
  const liveSorteo = phase !== "idle";
  useEffect(() => {
    const interval = liveSorteo ? 1500 : 5000;
    const id = window.setInterval(() => {
      refresh();
    }, interval);
    return () => window.clearInterval(id);
  }, [liveSorteo, refresh]);

  // ── Candidatos de la pasarela: lista publica de presentes (display_name +
  //    avatar). Solo se hidrata cuando el modo sorteo esta activo, para no
  //    pegarle al endpoint si no se necesita.
  const [candidates, setCandidates] = useState<{ display_name: string; avatar_url: string | null }[]>([]);
  useEffect(() => {
    if (!liveSorteo) return;
    let cancelled = false;
    fetch(`/api/events/${slug}/raffle/candidates`)
      .then((r) => (r.ok ? r.json() : { candidates: [] }))
      .then((j) => {
        if (cancelled) return;
        const list = Array.isArray(j?.candidates) ? j.candidates : [];
        setCandidates(list);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [liveSorteo, slug]);

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950 text-amber-50">
        <Header subtitle="Bar Citizen" />
        <div className="flex items-center justify-center py-20 text-amber-200/50 font-serif italic text-sm">
          Cargando evento...
        </div>
      </main>
    );
  }
  if (error || !data) {
    return (
      <main className="min-h-screen bg-zinc-950 text-amber-50">
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

  return (
    <main className="min-h-screen bg-zinc-950 text-amber-50 medieval-theme relative">
      {/* Fondo de video habitual del sitio + overlay sutil */}
      <video autoPlay loop muted playsInline className="fixed inset-0 w-full h-full object-cover opacity-35 pointer-events-none z-0">
        <source src="/videos/bg.mp4" type="video/mp4" />
      </video>
      <div className="fixed inset-0 bg-gradient-to-b from-zinc-950/40 via-zinc-950/55 to-zinc-950/70 pointer-events-none z-0" />

      {/* Estilos medieval — paleta espacial+pergamino claro tomada del mapa */}
      <style jsx global>{`
        .medieval-theme h1, .medieval-theme h2, .medieval-theme h3 {
          font-family: 'Cinzel', 'Trajan Pro', 'Times New Roman', serif;
          letter-spacing: 0.05em;
        }
        .medieval-card {
          background: rgba(20, 18, 14, 0.55);
          backdrop-filter: blur(6px);
          border: 1px solid rgba(232, 213, 170, 0.30);
          box-shadow:
            inset 0 1px 0 rgba(255, 240, 200, 0.10),
            0 4px 16px rgba(0, 0, 0, 0.6);
        }
        .medieval-divider {
          height: 1px;
          background: linear-gradient(to right, transparent, rgba(232, 213, 170, 0.4), transparent);
        }
        .gold-text {
          color: #e8d5aa;
          text-shadow: 0 1px 0 rgba(0,0,0,0.7);
        }
        .parchment-border {
          border-color: rgba(232, 213, 170, 0.45);
        }
      `}</style>

      <Header subtitle="Bar Citizen" />

      <div className="relative z-10 max-w-[1400px] mx-auto px-3 sm:px-4 lg:px-6 py-4 lg:py-8 space-y-6">

        {/* HERO con logo + nombre + countdown */}
        <section className="medieval-card rounded-md overflow-hidden">
          <div className="px-5 pt-5 pb-5 flex items-start gap-4 flex-wrap">
            {/* Logo */}
            {event.logo_url && (
              <div className="shrink-0 w-24 h-24 sm:w-32 sm:h-32 rounded-md overflow-hidden border-2 parchment-border bg-zinc-950/30 shadow-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={event.logo_url}
                  alt={`Logo ${event.name}`}
                  className="w-full h-full object-contain"
                  draggable={false}
                />
              </div>
            )}

            <div className="flex-1 min-w-0">
              {event.sponsor_name && (
                <p className="text-[10px] font-mono uppercase tracking-[0.2em] gold-text mb-1">
                  Evento Comunitario · Auspiciado por{" "}
                  {event.sponsor_url ? (
                    <a href={event.sponsor_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {event.sponsor_name}
                    </a>
                  ) : (
                    event.sponsor_name
                  )}
                </p>
              )}
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-amber-50 tracking-wide">
                {event.name}
              </h1>
              {event.tagline && (
                <p className="text-[12px] text-amber-100/85 mt-1 font-serif italic max-w-2xl">
                  {event.tagline}
                </p>
              )}
              <div className="mt-2 space-y-0.5">
                {event.location && (
                  <p className="text-[12px] text-amber-200/70 font-serif italic">
                    {event.google_maps_url ? (
                      <a
                        href={event.google_maps_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-amber-100 transition-colors"
                        title="Abrir en Google Maps"
                      >
                        ⚜ {event.location} <span className="text-[10px] not-italic text-cyan-300/80">↗</span>
                      </a>
                    ) : (
                      <>⚜ {event.location}</>
                    )}
                  </p>
                )}
                <p className="text-[12px] text-amber-200/70 font-serif italic">
                  📜{" "}
                  {eventDate.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}{" "}
                  · {eventDate.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })} hs
                </p>
              </div>
              {/* Redes sociales + links extra */}
              <SocialLinks event={event} />
            </div>

            {/* Countdown + admin badge */}
            <div className="shrink-0 flex flex-col items-end gap-2">
              {daysUntil >= 0 && (
                <div className="text-center bg-gradient-to-b from-amber-200/10 to-amber-200/5 border-2 border-amber-200/40 rounded-md px-5 py-3 shadow-inner">
                  <p className="text-[9px] font-mono uppercase tracking-[0.2em] gold-text">Faltan</p>
                  <p className="text-3xl font-bold font-mono gold-text">{daysUntil}</p>
                  <p className="text-[10px] gold-text font-serif italic">{daysUntil === 1 ? "día" : "días"}</p>
                </div>
              )}
              {/* Atajo Panel Admin — visible solo para admins del evento */}
              {isAdmin && (
                <Link
                  href={`/events/${slug}/admin`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-amber-400/60 bg-amber-500/15 text-amber-200 text-[11px] font-mono uppercase tracking-wider hover:bg-amber-500/25 hover:text-amber-100 transition-colors shadow-sm"
                  title="Abrir panel de administración del evento"
                >
                  ⚜ Panel Admin
                </Link>
              )}
            </div>
          </div>

        </section>

        {/* Layout principal: registro + sorteo + anuncios | mapa */}
        <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-4">
          <div className="space-y-4">
            {/* Descripción del evento (sale de la tabla, links clickeables) */}
            {event.description && <DescriptionCard description={event.description} />}

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
            {event.raffle_session && event.raffle_session.phase !== "idle" ? (
              <RaffleStage
                session={event.raffle_session}
                candidates={candidates}
                eventName={event.name}
                currentUserId={user?.id ?? null}
                slug={slug}
              />
            ) : (
              <MapCard event={event} />
            )}
          </div>
        </div>

        {/* Footer con link admin discreto */}
        <div className="medieval-divider" />
        <div className="flex items-center justify-between text-[10px] text-amber-200/40 font-serif italic">
          <span>
            Hecho con ⚔ por la comunidad ·{" "}
            <Link href="/" className="hover:text-amber-300 transition-colors not-italic">
              SC Labs
            </Link>
          </span>
          {isAdmin && (
            <Link
              href={`/events/${slug}/admin`}
              className="px-2.5 py-1 rounded-sm border border-amber-200/30 text-amber-300/70 hover:text-amber-200 hover:border-amber-500/60 transition-colors not-italic"
            >
              ⚜ Panel Admin
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}

// ─── RegistrationCard (medieval) ─────────────────────────────────────────────

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
      <div className="medieval-card rounded-md p-4">
        <h3 className="text-[14px] font-bold gold-text mb-2 flex items-center gap-2">
          📜 Inscripción al evento
        </h3>
        <p className="text-[11px] text-amber-100/70 mb-3 font-serif italic">
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
      <div className="medieval-card rounded-md p-4 space-y-2 border-emerald-600/40">
        <h3 className="text-[14px] font-bold text-emerald-300 flex items-center gap-2">
          ⚔ Estás inscripto
        </h3>
        <p className="text-[12px] text-amber-50">
          <span className="font-mono">{myRegistration.display_name}</span>
          {myRegistration.rsi_handle && <span className="text-amber-200/60"> · @{myRegistration.rsi_handle}</span>}
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
        <div className="flex gap-2 pt-1">
          <button onClick={() => setEditing(true)} className="flex-1 px-2 py-1.5 rounded-sm border border-amber-200/30 text-amber-200 text-[11px] hover:bg-zinc-900/40 transition-colors">Editar</button>
          <button onClick={cancel} disabled={busy} className="flex-1 px-2 py-1.5 rounded-sm border border-rose-500/40 text-rose-300 text-[11px] hover:bg-rose-500/15 transition-colors disabled:opacity-50">Cancelar</button>
        </div>
        {msg && <p className={`text-[10px] ${msg.kind === "ok" ? "text-emerald-300" : "text-rose-300"}`}>{msg.text}</p>}
      </div>
    );
  }

  return (
    <div className="medieval-card rounded-md p-4 space-y-3">
      <h3 className="text-[14px] font-bold gold-text flex items-center gap-2">📜 Inscripción al evento</h3>

      {!myRegistration && (
        <div className="space-y-2">
          <p className="text-[11px] text-amber-100/80 font-serif italic">¿Vas a venir, valiente ciudadano?</p>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => { setAttendance("confirmed"); submit("confirmed"); }}
              className="px-2 py-2 rounded-sm border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 text-[12px] font-medium hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
            >
              ⚔ Voy
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
          <p className="text-[10px] text-amber-200/60 font-serif italic">
            Te inscribimos como <strong className="text-amber-100 not-italic">{discordName || "tu usuario Discord"}</strong>.
            Editá nombre o handle RSI más abajo si querés.
          </p>
        </div>
      )}

      <details open={!!myRegistration}>
        <summary className="cursor-pointer text-[10px] font-mono uppercase tracking-widest text-amber-200/60 hover:text-amber-200 transition-colors">
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
              className="w-full px-2 py-1.5 bg-zinc-950/60 border border-amber-200/30 rounded-sm text-[12px] text-amber-50 placeholder-amber-200/30 focus:outline-none focus:border-amber-500/70"
            />
          </Field>
          <Field label="Handle RSI (opcional)">
            <input
              type="text"
              value={rsiHandle}
              onChange={(e) => setRsiHandle(e.target.value)}
              maxLength={80}
              placeholder="elchuker"
              className="w-full px-2 py-1.5 bg-zinc-950/60 border border-amber-200/30 rounded-sm text-[12px] text-amber-50 placeholder-amber-200/30 focus:outline-none focus:border-amber-500/70"
            />
          </Field>
          <Field label="Notas (opcional)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Algo que quieras compartir con el organizador"
              className="w-full px-2 py-1.5 bg-zinc-950/60 border border-amber-200/30 rounded-sm text-[12px] text-amber-50 placeholder-amber-200/30 focus:outline-none focus:border-amber-500/70 resize-none"
            />
          </Field>
        </div>
      </details>

      {myRegistration && (
        <>
          <div className="flex gap-1">
            <AttendanceOption value="confirmed" current={attendance} onClick={() => setAttendance("confirmed")} label="⚔ Voy" />
            <AttendanceOption value="maybe" current={attendance} onClick={() => setAttendance("maybe")} label="? Tal vez" />
            <AttendanceOption value="no" current={attendance} onClick={() => setAttendance("no")} label="✕ No puedo" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="flex-1 px-2 py-1.5 rounded-sm border border-amber-200/30 text-amber-200/80 text-[11px] hover:bg-zinc-900/40">Cancelar edición</button>
            <button
              onClick={() => submit()}
              disabled={busy || !displayName.trim()}
              className="flex-1 px-2 py-1.5 rounded-sm border border-amber-500/50 bg-amber-500/20 text-amber-200 text-[12px] font-medium hover:bg-amber-500/30 transition-colors disabled:opacity-50"
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
      <p className="text-[9px] font-mono uppercase tracking-widest text-amber-200/60 mb-1">{label}</p>
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
          : "border-amber-200/30 text-amber-200/60 hover:text-amber-100"
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

// ─── RaffleCard (medieval) ──────────────────────────────────────────────────

function RaffleCard({ event, winners }: { event: CommunityEvent; winners: RaffleWinner[] }) {
  return (
    <div className="medieval-card rounded-md p-4 space-y-2">
      <h3 className="text-[14px] font-bold gold-text flex items-center gap-2">🏆 Sorteo de naves CIG</h3>
      {event.raffle_prize_description && (
        <p className="text-[12px] text-amber-100/85 leading-snug font-serif">{linkify(event.raffle_prize_description)}</p>
      )}
      {event.raffle_rules && (
        <details className="text-[11px] text-amber-200/60">
          <summary className="cursor-pointer hover:text-amber-100 transition-colors">Reglas del sorteo</summary>
          <p className="mt-2 text-[11px] text-amber-200/70 whitespace-pre-line leading-relaxed font-serif">{event.raffle_rules}</p>
        </details>
      )}
      <p className="text-[10px] text-amber-200/60 pt-1 border-t border-amber-200/20 leading-relaxed font-serif italic">
        El sorteo se realiza entre los <strong className="text-amber-200 not-italic">asistentes presentes</strong>,
        confirmados por el equipo organizador en el lugar.
      </p>

      {winners.length > 0 && (
        <div className="pt-2 border-t border-amber-200/20 space-y-2">
          <p className="text-[10px] font-mono uppercase tracking-widest gold-text">⚜ Ganadores</p>
          {winners.map((w) => (
            <div key={w.id} className="flex items-start gap-2 bg-zinc-900/40 border border-amber-200/30 rounded-sm p-2">
              {w.winner_avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={w.winner_avatar_url} alt="" className="w-8 h-8 rounded-full shrink-0 border border-amber-200/40" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-[12px] shrink-0">🏆</div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-amber-50 font-semibold truncate">{w.winner_display_name}</p>
                <p className="text-[10px] gold-text">{w.prize}</p>
                {w.notes && <p className="text-[9px] text-amber-200/60 italic">{w.notes}</p>}
                <p className="text-[8px] text-amber-200/40 font-mono">{new Date(w.drawn_at).toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── AnnouncementsCard (medieval) ───────────────────────────────────────────

function AnnouncementsCard({ announcements }: { announcements: Announcement[] }) {
  return (
    <div className="medieval-card rounded-md p-4">
      <h3 className="text-[14px] font-bold gold-text flex items-center gap-2 mb-3">📣 Heraldos</h3>
      {announcements.length === 0 ? (
        <p className="text-[11px] text-amber-200/60 italic font-serif">Sin anuncios todavía. Volvé a chequear cerca del evento.</p>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {announcements.map((a) => (
            <div key={a.id} className={`rounded-sm border p-2 ${a.is_pinned ? "border-amber-500/50 bg-amber-500/10" : "border-amber-200/20 bg-zinc-950/40"}`}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <h4 className="text-[12px] font-semibold text-amber-50">
                  {a.is_pinned && <span className="text-amber-400 mr-1">📌</span>}
                  {a.title}
                </h4>
                <span className="text-[9px] text-amber-200/40 font-mono shrink-0">{new Date(a.created_at).toLocaleDateString()}</span>
              </div>
              <p className="text-[11px] text-amber-100/80 whitespace-pre-line leading-relaxed font-serif">{linkify(a.body)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── linkify helper ─────────────────────────────────────────────────────────
// Detecta URLs http/https/www dentro de un string y devuelve fragmentos React
// con los links como <a target="_blank">. Soporta saltos de línea (whitespace
// se preserva via la clase del contenedor — no transformamos `\n`).

const URL_REGEX = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;

function linkify(text: string) {
  if (!text) return null;
  const parts: (string | React.ReactNode)[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  // Hacemos una copia local del regex para no usar lastIndex compartido.
  const re = new RegExp(URL_REGEX.source, URL_REGEX.flags);
  while ((m = re.exec(text)) !== null) {
    const start = m.index;
    const url = m[0];
    if (start > lastIdx) parts.push(text.slice(lastIdx, start));
    const href = url.startsWith("www.") ? `https://${url}` : url;
    parts.push(
      <a
        key={`u-${key++}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-cyan-300 hover:text-cyan-200 underline decoration-cyan-500/40 hover:decoration-cyan-400 transition-colors break-words"
      >
        {url}
      </a>
    );
    lastIdx = start + url.length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts;
}

// ─── DescriptionCard ────────────────────────────────────────────────────────
// Muestra el texto descriptivo del evento como una tarjeta independiente,
// con auto-detección de URLs.

function DescriptionCard({ description }: { description: string }) {
  return (
    <div className="medieval-card rounded-md p-4 space-y-1.5">
      <h3 className="text-[12px] font-bold gold-text flex items-center gap-2 mb-1">
        ✒ Sobre el evento
      </h3>
      <p className="text-[12px] text-amber-100/85 leading-relaxed font-serif whitespace-pre-line">
        {linkify(description)}
      </p>
    </div>
  );
}

// ─── SocialLinks ────────────────────────────────────────────────────────────
// Fila compacta de iconos hacia Discord, Twitter, web y links libres.
// Solo se renderiza si hay al menos uno cargado.

function SocialLinks({ event }: { event: CommunityEvent }) {
  const items: { label: string; url: string; icon: string }[] = [];
  if (event.discord_url) items.push({ label: "Discord", url: event.discord_url, icon: "💬" });
  if (event.twitter_url) items.push({ label: "Twitter", url: event.twitter_url, icon: "𝕏" });
  if (event.website_url) items.push({ label: "Web", url: event.website_url, icon: "🌐" });
  for (const cl of event.custom_links ?? []) {
    if (cl?.label && cl?.url) items.push({ label: cl.label, url: cl.url, icon: "🔗" });
  }
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2.5">
      {items.map((it, idx) => (
        <a
          key={idx}
          href={it.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-2 py-1 rounded-sm border parchment-border bg-zinc-950/40 text-amber-200/90 text-[10px] font-mono hover:bg-amber-500/15 hover:text-amber-100 transition-colors"
          title={it.url}
        >
          <span>{it.icon}</span>
          <span>{it.label}</span>
        </a>
      ))}
    </div>
  );
}

// ─── MapCard ────────────────────────────────────────────────────────────────

function MapCard({ event }: { event: CommunityEvent }) {
  if (!event.map_image_url) {
    return (
      <div className="medieval-card rounded-md p-4 text-amber-200/60 text-[12px] italic font-serif">
        Sin mapa todavía.
      </div>
    );
  }
  return (
    <div className="medieval-card rounded-md overflow-hidden">
      <div className="px-3 py-2 border-b border-amber-200/20">
        <h3 className="text-[12px] font-bold gold-text flex items-center gap-2">📜 Cartel del evento</h3>
      </div>
      <div className="relative w-full bg-zinc-950/40 flex items-center justify-center p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={event.map_image_url}
          alt={`Cartel de ${event.name}`}
          className="max-w-full max-h-[80vh] object-contain rounded-sm"
          draggable={false}
        />
      </div>
    </div>
  );
}
