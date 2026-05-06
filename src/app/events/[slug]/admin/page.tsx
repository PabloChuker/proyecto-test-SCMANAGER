"use client";

// =============================================================================
// SC LABS — Event Admin Panel (2026-05-06)
//
// /events/[slug]/admin — solo accesible para usuarios listados en
// community_events.admin_user_ids. Permite:
//   · Ver toda la lista de inscriptos con filtros
//   · Marcar / desmarcar asistencia presencial (toggle "attended")
//   · Sortear ganadores entre los asistentes confirmados
//   · Ver historial de ganadores publicados, borrar entradas si hubo errores
// =============================================================================

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import Header from "@/app/assets/header/Header";
import { useAuth } from "@/contexts/AuthContext";

interface Registration {
  id: string;
  user_id: string;
  display_name: string;
  rsi_handle: string | null;
  attendance_intent: "confirmed" | "maybe" | "no";
  notes: string | null;
  attended: boolean;
  attended_confirmed_at: string | null;
  attended_confirmed_by: string | null;
  created_at: string;
  author_username: string | null;
  author_avatar_url: string | null;
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

interface AdminData {
  event: { id: string; slug: string; name: string };
  registrations: Registration[];
  winners: RaffleWinner[];
}

export default function EventAdminPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterIntent, setFilterIntent] = useState<"all" | "confirmed" | "maybe" | "no">("all");
  const [filterAttended, setFilterAttended] = useState<"all" | "yes" | "no">("all");

  const refresh = useCallback(() => {
    fetch(`/api/events/${slug}/admin`)
      .then((r) => r.json().then((j) => ({ status: r.status, ...j })))
      .then((d) => {
        if (d.status >= 400) throw new Error(d.error || "Acceso denegado.");
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e?.message ?? "Error cargando."))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => { refresh(); }, [refresh]);

  if (authLoading || loading) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        <Header subtitle="Admin" />
        <div className="py-20 text-center text-zinc-500 font-mono text-sm">Cargando panel admin...</div>
      </main>
    );
  }
  if (!user) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        <Header subtitle="Admin" />
        <div className="py-20 text-center">
          <p className="text-rose-300">Necesitás iniciar sesión.</p>
          <Link href="/login" className="text-cyan-300 hover:underline">Login →</Link>
        </div>
      </main>
    );
  }
  if (error || !data) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        <Header subtitle="Admin" />
        <div className="max-w-3xl mx-auto px-4 py-12 space-y-3">
          <p className="text-rose-300">{error ?? "Acceso denegado."}</p>
          <Link href={`/events/${slug}`} className="text-cyan-300 hover:underline text-[12px]">← Volver al evento</Link>
        </div>
      </main>
    );
  }

  const { event, registrations, winners } = data;

  // Filtros
  const filtered = registrations.filter((r) => {
    if (filterIntent !== "all" && r.attendance_intent !== filterIntent) return false;
    if (filterAttended === "yes" && !r.attended) return false;
    if (filterAttended === "no" && r.attended) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (
        !r.display_name.toLowerCase().includes(q) &&
        !(r.rsi_handle ?? "").toLowerCase().includes(q) &&
        !(r.author_username ?? "").toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  // Stats rápidos
  const totalRegs = registrations.length;
  const confirmedIntents = registrations.filter((r) => r.attendance_intent === "confirmed").length;
  const presentCount = registrations.filter((r) => r.attended).length;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <Header subtitle="Admin" />
      <div className="max-w-[1400px] mx-auto px-3 sm:px-4 lg:px-6 py-4 lg:py-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-rose-400 mb-0.5">Panel Admin</p>
            <h1 className="text-xl font-bold text-zinc-100">{event.name}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/events/${slug}/admin/edit`} className="text-[11px] px-2.5 py-1.5 rounded-sm border border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 transition-colors font-medium">
              ✎ Editar evento
            </Link>
            <Link href={`/events/${slug}`} className="text-[11px] px-2.5 py-1.5 rounded-sm border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/15 transition-colors">
              ← Volver al evento
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="Inscriptos totales" value={totalRegs} accent="zinc" />
          <Stat label="Confirman" value={confirmedIntents} accent="emerald" />
          <Stat label="Presentes" value={presentCount} accent="cyan" icon="✓" />
          <Stat label="Ganadores" value={winners.length} accent="amber" icon="🏆" />
        </div>

        {/* Sortear */}
        <RaffleSection slug={slug} winners={winners} presentCount={presentCount} onChange={refresh} />

        {/* Filtros */}
        <div className="flex items-center gap-2 flex-wrap p-3 bg-zinc-900/40 border border-zinc-800/60 rounded-md">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, handle RSI, username..."
            className="flex-1 min-w-[200px] px-3 py-1.5 bg-zinc-950 border border-zinc-800/60 rounded-sm text-[12px] text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-rose-500/50"
          />
          <select value={filterIntent} onChange={(e) => setFilterIntent(e.target.value as any)} className="px-2 py-1.5 bg-zinc-950 border border-zinc-800/60 rounded-sm text-[11px] text-zinc-200">
            <option value="all">Asistencia: Todas</option>
            <option value="confirmed">Confirmados</option>
            <option value="maybe">Tal vez</option>
            <option value="no">No vienen</option>
          </select>
          <select value={filterAttended} onChange={(e) => setFilterAttended(e.target.value as any)} className="px-2 py-1.5 bg-zinc-950 border border-zinc-800/60 rounded-sm text-[11px] text-zinc-200">
            <option value="all">Presencia: Todas</option>
            <option value="yes">Presentes</option>
            <option value="no">No marcados</option>
          </select>
        </div>

        {/* Lista de inscriptos */}
        <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-md overflow-hidden">
          <div className="px-3 py-2 border-b border-zinc-800/50 flex items-center justify-between">
            <h2 className="text-[12px] font-semibold text-zinc-200">Inscriptos ({filtered.length}/{totalRegs})</h2>
          </div>
          <div className="divide-y divide-zinc-800/40 max-h-[700px] overflow-y-auto">
            {filtered.map((r) => (
              <RegistrationRow key={r.id} reg={r} slug={slug} onChange={refresh} />
            ))}
            {filtered.length === 0 && (
              <p className="text-center py-8 text-zinc-500 italic text-[12px]">Sin resultados.</p>
            )}
          </div>
        </div>
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

function Stat({ label, value, accent, icon }: { label: string; value: number; accent: string; icon?: string }) {
  return (
    <div className={`rounded-sm border px-3 py-2 ${ACCENTS[accent]}`}>
      <p className="text-[9px] font-mono uppercase tracking-widest opacity-80">{icon && <span className="mr-1">{icon}</span>}{label}</p>
      <p className="text-2xl font-bold font-mono">{value}</p>
    </div>
  );
}

// ─── RegistrationRow ────────────────────────────────────────────────────────

function RegistrationRow({ reg, slug, onChange }: { reg: Registration; slug: string; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const toggleAttended = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/events/${slug}/attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registration_id: reg.id, attended: !reg.attended }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      onChange();
    } catch (e: any) {
      alert(e?.message ?? "Error.");
    } finally { setBusy(false); }
  };

  return (
    <div className={`flex items-center gap-3 px-3 py-2 ${reg.attended ? "bg-cyan-500/5" : ""}`}>
      {reg.author_avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={reg.author_avatar_url} alt="" className="w-9 h-9 rounded-full shrink-0" />
      ) : (
        <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-600 text-sm shrink-0">
          {(reg.display_name?.[0] ?? "?").toUpperCase()}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[12px] text-zinc-100 font-medium truncate">{reg.display_name}</p>
          {reg.author_username && reg.author_username !== reg.display_name && (
            <span className="text-[10px] text-zinc-500 font-mono">@{reg.author_username}</span>
          )}
          {reg.rsi_handle && (
            <span className="text-[9px] text-amber-400 font-mono px-1 bg-amber-500/10 border border-amber-500/30 rounded-sm">
              RSI: {reg.rsi_handle}
            </span>
          )}
          <IntentBadge intent={reg.attendance_intent} />
          {reg.attended && (
            <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-cyan-500/15 text-cyan-300 border border-cyan-500/40">
              ✓ Presente
            </span>
          )}
        </div>
        {reg.notes && (
          <p className="text-[10px] text-zinc-500 italic truncate mt-0.5" title={reg.notes}>
            "{reg.notes}"
          </p>
        )}
        <p className="text-[9px] text-zinc-600 font-mono">
          Inscripto: {new Date(reg.created_at).toLocaleDateString()}
          {reg.attended_confirmed_at && ` · Confirmado: ${new Date(reg.attended_confirmed_at).toLocaleString()}`}
        </p>
      </div>
      <button
        onClick={toggleAttended}
        disabled={busy}
        className={`px-3 py-2 rounded-sm border text-[11px] font-medium transition-colors disabled:opacity-50 shrink-0 ${
          reg.attended
            ? "border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
            : "border-cyan-500/40 bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25"
        }`}
      >
        {busy ? "..." : reg.attended ? "✕ Quitar" : "✓ Confirmar"}
      </button>
    </div>
  );
}

function IntentBadge({ intent }: { intent: "confirmed" | "maybe" | "no" }) {
  const cls =
    intent === "confirmed" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
    : intent === "maybe" ? "bg-amber-500/15 text-amber-300 border-amber-500/40"
    : "bg-rose-500/15 text-rose-300 border-rose-500/40";
  const text = intent === "confirmed" ? "Voy" : intent === "maybe" ? "Tal vez" : "No puedo";
  return <span className={`text-[9px] font-mono uppercase tracking-wider px-1 py-0.5 rounded-sm border ${cls}`}>{text}</span>;
}

// ─── RaffleSection ──────────────────────────────────────────────────────────

function RaffleSection({
  slug, winners, presentCount, onChange,
}: {
  slug: string;
  winners: RaffleWinner[];
  presentCount: number;
  onChange: () => void;
}) {
  const [prize, setPrize] = useState("");
  const [notes, setNotes] = useState("");
  const [excludePrev, setExcludePrev] = useState(true);
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<{ name: string; prize: string; pool: number } | null>(null);

  const draw = async () => {
    if (!prize.trim()) return;
    if (!confirm(`¿Sortear "${prize.trim()}" entre los presentes confirmados?`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/events/${slug}/raffle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prize: prize.trim(),
          notes: notes.trim() || null,
          exclude_previous_winners: excludePrev,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Error sorteando.");
      setLastResult({
        name: d.winner.winner_display_name,
        prize: d.winner.prize,
        pool: d.poolSize,
      });
      setPrize("");
      setNotes("");
      onChange();
    } catch (e: any) {
      alert(e?.message ?? "Error sorteando.");
    } finally { setBusy(false); }
  };

  const removeWinner = async (winnerId: string) => {
    if (!confirm("¿Borrar este ganador? El registro se elimina y la persona vuelve al pool elegible.")) return;
    try {
      const r = await fetch(`/api/events/${slug}/raffle`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ winner_id: winnerId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      onChange();
    } catch (e: any) {
      alert(e?.message ?? "Error.");
    }
  };

  return (
    <div className="bg-zinc-900/40 border border-amber-500/40 rounded-md p-4 space-y-3">
      <h2 className="text-[14px] font-semibold text-amber-300 flex items-center gap-2">🎰 Sortear ganador</h2>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_auto] gap-2 items-end">
        <div>
          <p className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 mb-1">Premio *</p>
          <input
            type="text"
            value={prize}
            onChange={(e) => setPrize(e.target.value)}
            maxLength={200}
            placeholder="Ej: Aurora MR LTI Gift Code"
            className="w-full px-2 py-1.5 bg-zinc-950 border border-zinc-800/60 rounded-sm text-[12px] text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
          />
        </div>
        <div>
          <p className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 mb-1">Notas (opcional)</p>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={1000}
            placeholder="Ronda 1, sponsor X..."
            className="w-full px-2 py-1.5 bg-zinc-950 border border-zinc-800/60 rounded-sm text-[12px] text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
          />
        </div>
        <label className="flex items-center gap-1.5 text-[10px] text-zinc-300 cursor-pointer whitespace-nowrap pb-1">
          <input
            type="checkbox"
            checked={excludePrev}
            onChange={(e) => setExcludePrev(e.target.checked)}
            className="accent-amber-500"
          />
          Excluir ganadores previos
        </label>
        <button
          onClick={draw}
          disabled={busy || !prize.trim() || presentCount === 0}
          className="px-4 py-2 rounded-sm border border-amber-500/40 bg-amber-500/15 text-amber-300 text-[12px] font-medium hover:bg-amber-500/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          title={presentCount === 0 ? "Marcá al menos 1 asistente como presente antes de sortear" : "Sortear"}
        >
          {busy ? "Sorteando..." : "🎲 Sortear ahora"}
        </button>
      </div>

      <p className="text-[10px] text-zinc-500">
        Pool elegible: <strong className="text-cyan-300">{presentCount} asistentes presentes</strong>
        {presentCount === 0 && " · Marcá al menos uno como presente antes de sortear."}
      </p>

      {lastResult && (
        <div className="p-3 rounded-sm border border-emerald-500/40 bg-emerald-500/10">
          <p className="text-[11px] text-emerald-300">
            🎉 ¡Ganador sorteado! <strong>{lastResult.name}</strong> — {lastResult.prize}
            <br />
            <span className="text-[10px] text-zinc-500">(pool: {lastResult.pool} elegibles)</span>
          </p>
        </div>
      )}

      {winners.length > 0 && (
        <details className="pt-2 border-t border-zinc-800/40">
          <summary className="cursor-pointer text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors">
            🏆 Historial de ganadores ({winners.length})
          </summary>
          <div className="mt-2 space-y-1.5">
            {winners.map((w) => (
              <div key={w.id} className="flex items-center gap-2 p-2 bg-zinc-950/60 border border-zinc-800/60 rounded-sm">
                {w.winner_avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={w.winner_avatar_url} alt="" className="w-7 h-7 rounded-full shrink-0" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-amber-500/20 flex items-center justify-center text-[12px] shrink-0">🏆</div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-zinc-100 font-medium truncate">{w.winner_display_name}</p>
                  <p className="text-[10px] text-amber-300 truncate">{w.prize}</p>
                  <p className="text-[9px] text-zinc-600 font-mono">{new Date(w.drawn_at).toLocaleString()}</p>
                </div>
                <button
                  onClick={() => removeWinner(w.id)}
                  className="text-rose-400 hover:text-rose-300 text-[14px] px-2 shrink-0"
                  title="Borrar ganador (vuelve al pool)"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
