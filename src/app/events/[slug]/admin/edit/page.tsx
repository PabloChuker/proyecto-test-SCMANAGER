"use client";

// =============================================================================
// SC LABS — Event Edit (Twitter-style template editor, 2026-05-06)
//
// /events/[slug]/admin/edit — admin-only. Permite editar todo lo que define
// la página pública del evento: logo, título, tagline, descripción, fecha,
// ubicación con Google Maps, redes sociales, links libres, premio del sorteo,
// reglas, etc. Es la "plantilla editable" que pidió Pablo — cualquier admin
// arma su Bar Citizen modificando estos campos.
// =============================================================================

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/app/assets/header/Header";
import { useAuth } from "@/contexts/AuthContext";

interface CommunityEventFull {
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
  custom_links: { label: string; url: string }[];
  is_active: boolean;
  registration_open: boolean;
  raffle_active: boolean;
  raffle_prize_description: string | null;
  raffle_rules: string | null;
}

export default function EventEditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [event, setEvent] = useState<CommunityEventFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(() => {
    Promise.all([
      fetch(`/api/events/${slug}`).then((r) => r.json()),
      fetch(`/api/events/${slug}/admin`).then((r) => ({ status: r.status, ok: r.ok })),
    ])
      .then(([d, admin]) => {
        if (!admin.ok) { setAccessDenied(true); return; }
        if (d.error) throw new Error(d.error);
        setEvent({
          ...d.event,
          custom_links: Array.isArray(d.event?.custom_links) ? d.event.custom_links : [],
        });
      })
      .catch(() => setAccessDenied(true))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  const updateField = <K extends keyof CommunityEventFull>(key: K, value: CommunityEventFull[K]) => {
    setEvent((e) => (e ? { ...e, [key]: value } : e));
  };

  const save = async () => {
    if (!event) return;
    setSaving(true);
    setMsg(null);
    try {
      // Sanitizar custom_links — quitar entries con label/url vacíos
      const cleanLinks = (event.custom_links ?? []).filter(
        (l) => l && typeof l.label === "string" && typeof l.url === "string" && l.label.trim() && l.url.trim(),
      );
      const r = await fetch(`/api/events/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: event.name,
          description: event.description,
          tagline: event.tagline,
          event_date: event.event_date,
          location: event.location,
          sponsor_name: event.sponsor_name,
          sponsor_url: event.sponsor_url,
          logo_url: event.logo_url,
          banner_url: event.banner_url,
          map_image_url: event.map_image_url,
          google_maps_url: event.google_maps_url,
          discord_url: event.discord_url,
          twitter_url: event.twitter_url,
          website_url: event.website_url,
          custom_links: cleanLinks,
          is_active: event.is_active,
          registration_open: event.registration_open,
          raffle_active: event.raffle_active,
          raffle_prize_description: event.raffle_prize_description,
          raffle_rules: event.raffle_rules,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Error guardando.");
      setEvent({ ...d.event, custom_links: Array.isArray(d.event?.custom_links) ? d.event.custom_links : [] });
      setMsg({ kind: "ok", text: "Cambios guardados." });
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message ?? "Error." });
    } finally {
      setSaving(false);
    }
  };

  // Custom links handlers
  const addCustomLink = () => updateField("custom_links", [...(event?.custom_links ?? []), { label: "", url: "" }]);
  const removeCustomLink = (idx: number) =>
    updateField("custom_links", (event?.custom_links ?? []).filter((_, i) => i !== idx));
  const updateCustomLink = (idx: number, field: "label" | "url", value: string) => {
    const next = (event?.custom_links ?? []).slice();
    next[idx] = { ...next[idx], [field]: value };
    updateField("custom_links", next);
  };

  if (authLoading || loading) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        <Header subtitle="Editar evento" />
        <div className="py-20 text-center text-zinc-500 font-mono text-sm">Cargando...</div>
      </main>
    );
  }
  if (!user || accessDenied || !event) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        <Header subtitle="Editar evento" />
        <div className="max-w-3xl mx-auto px-4 py-12 space-y-3">
          <p className="text-rose-300">Acceso denegado.</p>
          <Link href={`/events/${slug}`} className="text-cyan-300 hover:underline text-[12px]">← Volver al evento</Link>
        </div>
      </main>
    );
  }

  // Para datetime-local input
  const eventDateLocal = event.event_date ? new Date(event.event_date).toISOString().slice(0, 16) : "";

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <Header subtitle="Editar evento" />
      <div className="max-w-[900px] mx-auto px-3 sm:px-4 py-4 lg:py-6 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-rose-400 mb-0.5">Editar plantilla</p>
            <h1 className="text-xl font-bold text-zinc-100">{event.name}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/events/${slug}/admin`} className="text-[11px] px-2.5 py-1.5 rounded-sm border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors">
              ← Panel admin
            </Link>
            <Link href={`/events/${slug}`} target="_blank" className="text-[11px] px-2.5 py-1.5 rounded-sm border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/15 transition-colors">
              👁 Ver pública
            </Link>
          </div>
        </div>

        {/* Toggles top */}
        <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-md p-3 flex flex-wrap gap-3 items-center">
          <Toggle label="Evento activo" value={event.is_active} onChange={(v) => updateField("is_active", v)} />
          <Toggle label="Registro abierto" value={event.registration_open} onChange={(v) => updateField("registration_open", v)} />
          <Toggle label="Sorteo activo" value={event.raffle_active} onChange={(v) => updateField("raffle_active", v)} />
        </div>

        {/* Card 1: Identidad */}
        <Section title="🎨 Identidad del evento">
          <Grid2>
            <Field label="Logo (URL de imagen)">
              <input type="text" value={event.logo_url ?? ""} onChange={(e) => updateField("logo_url", e.target.value)} placeholder="/events/mi-logo.png o https://..." className={inputCls} />
              {event.logo_url && (
                <div className="mt-1.5 w-20 h-20 rounded-sm bg-zinc-950 border border-zinc-800 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={event.logo_url} alt="logo preview" className="w-full h-full object-contain" />
                </div>
              )}
            </Field>
            <Field label="Mapa de la ruta (URL imagen)">
              <input type="text" value={event.map_image_url ?? ""} onChange={(e) => updateField("map_image_url", e.target.value)} placeholder="/events/mapa.png o https://..." className={inputCls} />
              {event.map_image_url && (
                <div className="mt-1.5 max-h-20 rounded-sm bg-zinc-950 border border-zinc-800 overflow-hidden flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={event.map_image_url} alt="map preview" className="max-h-20 object-contain" />
                </div>
              )}
            </Field>
          </Grid2>
          <Field label="Nombre del evento *">
            <input type="text" value={event.name} onChange={(e) => updateField("name", e.target.value)} maxLength={120} className={inputCls} />
          </Field>
          <Field label="Tagline / Frase corta (aparece arriba del título, máx 200 chars)">
            <input type="text" value={event.tagline ?? ""} onChange={(e) => updateField("tagline", e.target.value)} maxLength={200} placeholder='Ej: "Encuentro de pilotos en Galicia con tapeo y birra"' className={inputCls} />
          </Field>
          <Field label="Descripción (acepta saltos de línea)">
            <textarea value={event.description ?? ""} onChange={(e) => updateField("description", e.target.value)} rows={4} className={inputCls + " resize-y"} />
          </Field>
        </Section>

        {/* Card 2: Cuándo y dónde */}
        <Section title="📅 Cuándo y dónde">
          <Grid2>
            <Field label="Fecha y hora *">
              <input type="datetime-local" value={eventDateLocal} onChange={(e) => updateField("event_date", new Date(e.target.value).toISOString())} className={inputCls} />
            </Field>
            <Field label="Ubicación (texto)">
              <input type="text" value={event.location ?? ""} onChange={(e) => updateField("location", e.target.value)} placeholder="Ourense, Galicia (España)" className={inputCls} />
            </Field>
          </Grid2>
          <Field label="Link Google Maps (botón 'Cómo llegar')">
            <input type="url" value={event.google_maps_url ?? ""} onChange={(e) => updateField("google_maps_url", e.target.value)} placeholder="https://maps.app.goo.gl/..." className={inputCls} />
            <p className="text-[10px] text-zinc-500 mt-1">
              Tip: en Google Maps abrí el lugar, click en "Compartir" → "Copiar link". Pegalo acá.
            </p>
          </Field>
        </Section>

        {/* Card 3: Sponsor + redes */}
        <Section title="🤝 Sponsor y redes">
          <Grid2>
            <Field label="Nombre del sponsor">
              <input type="text" value={event.sponsor_name ?? ""} onChange={(e) => updateField("sponsor_name", e.target.value)} className={inputCls} />
            </Field>
            <Field label="URL del sponsor">
              <input type="url" value={event.sponsor_url ?? ""} onChange={(e) => updateField("sponsor_url", e.target.value)} placeholder="https://..." className={inputCls} />
            </Field>
          </Grid2>
          <Grid2>
            <Field label="Discord (URL invitación)">
              <input type="url" value={event.discord_url ?? ""} onChange={(e) => updateField("discord_url", e.target.value)} placeholder="https://discord.gg/..." className={inputCls} />
            </Field>
            <Field label="Twitter / X">
              <input type="url" value={event.twitter_url ?? ""} onChange={(e) => updateField("twitter_url", e.target.value)} placeholder="https://x.com/..." className={inputCls} />
            </Field>
          </Grid2>
          <Field label="Website / link adicional">
            <input type="url" value={event.website_url ?? ""} onChange={(e) => updateField("website_url", e.target.value)} placeholder="https://..." className={inputCls} />
          </Field>

          {/* Custom links (linktree-style) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">
                Links extra (linktree)
              </p>
              <button onClick={addCustomLink} className="text-[10px] text-cyan-300 hover:text-cyan-200 transition-colors">+ Agregar link</button>
            </div>
            <div className="space-y-1.5">
              {(event.custom_links ?? []).map((l, idx) => (
                <div key={idx} className="flex gap-1.5 items-center">
                  <input
                    type="text"
                    value={l.label}
                    onChange={(e) => updateCustomLink(idx, "label", e.target.value)}
                    placeholder="Etiqueta (ej. Twitch)"
                    className={inputCls + " flex-1"}
                  />
                  <input
                    type="url"
                    value={l.url}
                    onChange={(e) => updateCustomLink(idx, "url", e.target.value)}
                    placeholder="https://..."
                    className={inputCls + " flex-[2]"}
                  />
                  <button onClick={() => removeCustomLink(idx)} className="text-rose-400 hover:text-rose-300 px-2 text-[14px]">✕</button>
                </div>
              ))}
              {(event.custom_links ?? []).length === 0 && (
                <p className="text-[10px] text-zinc-600 italic">Sin links extra. Agregá los que quieras (Twitch, Patreon, tienda merch, etc).</p>
              )}
            </div>
          </div>
        </Section>

        {/* Card 4: Sorteo */}
        <Section title="🎰 Sorteo">
          <Field label="Descripción del premio">
            <textarea value={event.raffle_prize_description ?? ""} onChange={(e) => updateField("raffle_prize_description", e.target.value)} rows={2} className={inputCls + " resize-y"} placeholder="Ej: Sorteo de 3 packs Aurora MR LTI donados por CIG..." />
          </Field>
          <Field label="Reglas del sorteo (separá con dos saltos de línea para mostrar como lista)">
            <textarea value={event.raffle_rules ?? ""} onChange={(e) => updateField("raffle_rules", e.target.value)} rows={6} className={inputCls + " resize-y"} placeholder="1) Registrate antes...&#10;&#10;2) Asistí presencialmente..." />
          </Field>
        </Section>

        {/* Save bar — sticky bottom */}
        <div className="sticky bottom-2 bg-zinc-900/90 backdrop-blur border border-amber-500/40 rounded-md p-3 flex items-center justify-between gap-3">
          <div>
            {msg ? (
              <p className={`text-[12px] ${msg.kind === "ok" ? "text-emerald-300" : "text-rose-300"}`}>
                {msg.text}
              </p>
            ) : (
              <p className="text-[11px] text-zinc-400 font-mono uppercase tracking-widest">
                Editando: <span className="text-amber-300">{event.slug}</span>
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Link href={`/events/${slug}/admin`} className="px-3 py-2 rounded-sm border border-zinc-700 text-zinc-400 text-[11px] hover:bg-zinc-800 transition-colors">
              Salir
            </Link>
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 rounded-sm border border-amber-500/40 bg-amber-500/15 text-amber-300 text-[12px] font-medium hover:bg-amber-500/25 transition-colors disabled:opacity-50"
            >
              {saving ? "Guardando..." : "💾 Guardar cambios"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const inputCls =
  "w-full px-2 py-1.5 bg-zinc-950 border border-zinc-800/60 rounded-sm text-[12px] text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-500/50";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-md p-4 space-y-3">
      <h2 className="text-[13px] font-semibold text-amber-300">{title}</h2>
      {children}
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

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>;
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="accent-amber-500" />
      {label}
    </label>
  );
}
