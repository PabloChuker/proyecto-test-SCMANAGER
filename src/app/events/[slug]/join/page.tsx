"use client";

// =============================================================================
// SC LABS — /events/[slug]/join
//
// URL directa de inscripcion al sorteo, pensada para imprimirse como QR en
// el evento. Flow:
//
//   1. Si el user NO esta logueado → redirect a /login?next=/events/[slug]/join
//      Despues de Discord OAuth + /auth/callback, el user vuelve aca ya logueado.
//   2. Si esta logueado → POST /api/events/[slug]/join (auto inscribe + marca
//      attended=true) y muestra confirmacion con boton para volver al evento.
//   3. Si el endpoint devuelve 403 (registration_open=false) o 401, mostramos
//      el error con un link manual al evento para que el user vea el contexto.
// =============================================================================

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Header from "@/app/assets/header/Header";
import { useAuth } from "@/contexts/AuthContext";

export default function EventJoinPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const { user, loading } = useAuth();
  const [phase, setPhase] = useState<
    "waiting" | "joining" | "joined" | "error"
  >("waiting");
  const [message, setMessage] = useState<string | null>(null);
  const [registration, setRegistration] = useState<{
    display_name: string;
    action: "created" | "updated";
  } | null>(null);
  const REDIRECT_DELAY_MS = 2500;
  const [redirectIn, setRedirectIn] = useState<number | null>(null);

  // Step 1: si no esta logueado, redirect a /login con next=
  useEffect(() => {
    if (loading) return;
    if (!user) {
      // Reemplazamos en vez de push para que el back del browser no vuelva al
      // /join inmediatamente (user no logueado) y haga loop con el login.
      const next = `/events/${encodeURIComponent(slug)}/join`;
      window.location.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [user, loading, slug]);

  // Step 2: si ya esta logueado, hacer el POST a /api/events/[slug]/join.
  //
  // BUGFIX (cuarto intento, 2026-05-07): el effect tenia `phase` en el dep
  // array, asi que cuando hacia setPhase("joining") React corria el cleanup
  // del effect anterior (cancelled=true) ANTES de que el fetch terminara.
  // Resultado: la rama exitosa salia temprano por `if (cancelled) return`
  // y nunca se llegaba a setPhase("joined") ni a schedular el redirect.
  //
  // Fix: sin `phase` en deps + ref como guard contra el doble-fire de
  // StrictMode en dev. El fetch corre una sola vez por user logueado.
  const didStartRef = useRef(false);
  useEffect(() => {
    if (loading || !user) return;
    if (didStartRef.current) return;
    didStartRef.current = true;

    setPhase("joining");
    (async () => {
      try {
        const r = await fetch(`/api/events/${slug}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          setPhase("error");
          setMessage(j?.error ?? `Error ${r.status}`);
          return;
        }
        setRegistration({
          display_name: j?.registration?.display_name ?? "",
          action: j?.action ?? "created",
        });
        setPhase("joined");

        // ── Auto-redirect schedulado aca, en el flujo exitoso ──
        // Mostramos un countdown visual pero el setTimeout del redirect
        // NO depende del state — corre solo, fire-and-forget.
        const targetUrl = `/events/${slug}`;
        let secondsLeft = Math.ceil(REDIRECT_DELAY_MS / 1000);
        setRedirectIn(secondsLeft);
        const tickId = window.setInterval(() => {
          secondsLeft -= 1;
          setRedirectIn(Math.max(0, secondsLeft));
          if (secondsLeft <= 0) window.clearInterval(tickId);
        }, 1000);
        window.setTimeout(() => {
          // Hard navigation — garantizada, no dependemos de router refs.
          // eslint-disable-next-line no-console
          console.info("[events/join] redirect →", targetUrl);
          window.location.href = targetUrl;
        }, REDIRECT_DELAY_MS);
      } catch (e: any) {
        setPhase("error");
        setMessage(e?.message ?? "No se pudo procesar la inscripción.");
      }
    })();
  }, [user, loading, slug]);

  return (
    <main className="min-h-screen bg-zinc-950 text-amber-50 relative">
      <video
        autoPlay
        loop
        muted
        playsInline
        className="fixed inset-0 w-full h-full object-cover opacity-30 pointer-events-none z-0"
      >
        <source src="/videos/bg.mp4" type="video/mp4" />
      </video>
      <div className="fixed inset-0 bg-gradient-to-b from-zinc-950/50 via-zinc-950/65 to-zinc-950/80 pointer-events-none z-0" />
      <Header subtitle="Bar Citizen" />

      <div className="relative z-10 max-w-md mx-auto px-4 py-12 space-y-6 text-center">
        {(loading || (!user && phase === "waiting")) && (
          <div className="space-y-3">
            <div className="text-5xl animate-pulse">🔐</div>
            <h1 className="text-2xl font-bold tracking-wide">
              Iniciando sesión...
            </h1>
            <p className="text-[12px] text-amber-200/70 font-serif italic">
              Te llevamos a Discord para iniciar sesión y volver al sorteo.
            </p>
          </div>
        )}

        {user && phase === "joining" && (
          <div className="space-y-3">
            <div className="text-5xl animate-pulse">🎰</div>
            <h1 className="text-2xl font-bold tracking-wide">
              Inscribiéndote al sorteo...
            </h1>
            <p className="text-[12px] text-amber-200/70 font-serif italic">
              Un segundo, registramos tu asistencia presencial.
            </p>
          </div>
        )}

        {user && phase === "joined" && registration && (
          <div className="space-y-4">
            <div className="text-6xl">🍻</div>
            <h1 className="text-3xl font-black tracking-wider text-amber-100 drop-shadow-[0_2px_8px_rgba(252,211,77,0.6)]">
              {registration.action === "created"
                ? "¡Estás dentro!"
                : "¡Bienvenido de vuelta!"}
            </h1>
            <p className="text-[14px] text-amber-100/90 font-serif">
              <strong className="font-mono not-italic">
                {registration.display_name}
              </strong>
              , quedaste inscripto y marcado como{" "}
              <strong className="text-emerald-300 not-italic">presente</strong>.
              Ya entrás al sorteo de naves CIG.
            </p>
            <p className="text-[12px] text-amber-200/70 font-mono">
              {redirectIn !== null && redirectIn > 0
                ? `Te llevamos al evento en ${redirectIn}s...`
                : "Llevándote al evento..."}
            </p>
            {/* Fallback manual por si el auto-redirect falla (browsers raros,
                back-button, etc) */}
            <Link
              href={`/events/${slug}`}
              className="inline-block px-4 py-2 rounded-md border border-amber-400/40 text-amber-200 hover:bg-amber-500/10 transition text-[11px]"
            >
              Ir ahora →
            </Link>
          </div>
        )}

        {phase === "error" && (
          <div className="space-y-3">
            <div className="text-5xl">⚠</div>
            <h1 className="text-2xl font-bold tracking-wide text-rose-300">
              No se pudo procesar la inscripción
            </h1>
            <p className="text-[12px] text-rose-200/80 font-mono bg-rose-500/10 border border-rose-500/30 rounded px-3 py-2">
              {message ?? "Error desconocido."}
            </p>
            <Link
              href={`/events/${slug}`}
              className="inline-block px-4 py-2 rounded-md border border-amber-400/40 text-amber-200 hover:bg-amber-500/10 transition text-[12px]"
            >
              ← Volver al evento
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
