"use client";
// =============================================================================
// SC LABS — /streamers/referral — Info & URL builder del programa de referral
//
// Página informativa del sistema de referrals. Permite al streamer generar y
// copiar su URL con ?ref=<codigo> a partir de un input. Cada visita a SC Labs
// con ese query param queda registrada en la tabla referral_visits para que
// el equipo de SC Labs pueda ver qué streamers traen usuarios.
// =============================================================================

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import Header from "@/app/assets/header/Header";

export default function StreamersReferralPage() {
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);

  const sanitized = useMemo(
    () =>
      code
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "")
        .slice(0, 32),
    [code]
  );

  const fullUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const origin = window.location.origin;
    return sanitized ? `${origin}/?ref=${sanitized}` : `${origin}/?ref=tu_codigo`;
  }, [sanitized]);

  const handleCopy = useCallback(async () => {
    if (!sanitized) return;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e) {
      console.error("Copy failed:", e);
    }
  }, [fullUrl, sanitized]);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <video
        autoPlay
        loop
        muted
        playsInline
        className="fixed inset-0 w-full h-full object-cover opacity-10 pointer-events-none z-0"
      >
        <source src="/media/videos/bg.mp4" type="video/mp4" />
      </video>
      <div className="fixed inset-0 bg-gradient-to-b from-zinc-950/70 via-zinc-950/85 to-zinc-950/95 pointer-events-none z-0" />

      <Header subtitle="Streamers · Referral" />

      <div className="relative z-10 max-w-3xl mx-auto w-full px-4 sm:px-6 py-8">
        <div className="mb-6 flex items-center gap-2 text-[10px] font-mono tracking-widest uppercase text-zinc-600">
          <Link href="/streamers" className="hover:text-zinc-400 transition-colors">
            ← Streamers
          </Link>
          <span className="text-zinc-800">/</span>
          <span className="text-amber-500">Referral</span>
        </div>

        <h1 className="text-2xl font-light tracking-tight mb-2">
          Programa de referral
        </h1>
        <p className="text-xs text-zinc-500 leading-relaxed mb-8 max-w-2xl">
          Cada streamer tiene un código único. Cuando alguien entra a SC Labs usando tu
          link con <code className="text-amber-400">?ref=tu_codigo</code>, la visita queda
          registrada. Esto nos sirve para medir qué creadores están trayendo usuarios y
          futuros beneficios (acceso anticipado a features, branding custom, etc.).
        </p>

        {/* URL builder */}
        <div className="border border-zinc-800/60 bg-zinc-900/40 rounded p-5 mb-6">
          <div className="text-[10px] tracking-[0.18em] uppercase font-mono text-amber-500 mb-2">
            Tu link personalizado
          </div>
          <label className="block text-[10px] text-zinc-500 font-mono tracking-wider uppercase mb-1">
            Código de referral
          </label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ej: chuker"
            className="w-full px-3 py-2 bg-zinc-900/80 border border-zinc-800 rounded text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500/40 font-mono"
          />
          <p className="text-[10px] text-zinc-600 mt-1">
            Solo minúsculas, números, guiones y guión bajo. Máximo 32 caracteres.
          </p>

          <div className="mt-4">
            <label className="block text-[10px] text-zinc-500 font-mono tracking-wider uppercase mb-1">
              URL para compartir
            </label>
            <div className="flex items-stretch gap-2">
              <code className="flex-1 px-3 py-2 bg-zinc-950/80 border border-zinc-800 rounded text-[11px] text-zinc-300 font-mono break-all">
                {fullUrl}
              </code>
              <button
                onClick={handleCopy}
                disabled={!sanitized}
                className="px-4 text-[10px] tracking-widest uppercase font-mono rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                {copied ? "✓" : "Copiar"}
              </button>
            </div>
          </div>
        </div>

        {/* Cómo funciona */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="border border-zinc-800/40 bg-zinc-900/30 rounded p-4">
            <div className="text-[10px] tracking-widest uppercase font-mono text-amber-500 mb-2">
              Cómo funciona
            </div>
            <ul className="text-[11px] text-zinc-400 space-y-1.5 leading-relaxed">
              <li>➊ Compartí tu link en tu stream, descripción de YouTube o bio.</li>
              <li>➋ Cuando alguien lo abre, SC Labs guarda el código en su dispositivo.</li>
              <li>➌ Registramos la visita en nuestra base de datos (tabla <code>referral_visits</code>).</li>
              <li>➍ Si el usuario crea cuenta, te la atribuimos a vos.</li>
            </ul>
          </div>
          <div className="border border-zinc-800/40 bg-zinc-900/30 rounded p-4">
            <div className="text-[10px] tracking-widest uppercase font-mono text-amber-500 mb-2">
              Privacidad
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Solo guardamos el código del referrer, la fecha, la URL visitada y el
              user-agent. No trackeamos a los usuarios de forma identificable ni
              compartimos los datos con terceros. Los datos son para uso interno del
              equipo de SC Labs.
            </p>
          </div>
        </div>

        <div className="mt-8 border border-amber-500/20 bg-amber-500/5 rounded p-4">
          <div className="text-[10px] tracking-widest uppercase font-mono text-amber-400 mb-1">
            ¿Todavía no tenés código?
          </div>
          <p className="text-[11px] text-zinc-300 leading-relaxed">
            Escribinos por Discord para que te asignemos uno. Es gratis y solo tenés que
            ser un streamer / creador activo de contenido de Star Citizen.
          </p>
        </div>
      </div>
    </main>
  );
}
