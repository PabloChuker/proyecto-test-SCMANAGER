"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";

export default function Home() {
  const [phase, setPhase] = useState<"logo" | "reveal" | "ready">("logo");

  useEffect(() => {
    // Logo centrado por 1.8s, luego transiciona
    const t1 = setTimeout(() => setPhase("reveal"), 1800);
    // Contenido aparece después de la transición del logo
    const t2 = setTimeout(() => setPhase("ready"), 2600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <main className="relative min-h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* ── Background provisorio con gradientes ── */}
      <div className="fixed inset-0 -z-10">
        {/* Base oscura */}
        <div className="absolute inset-0 bg-zinc-950" />
        {/* Glow ambar sutil arriba */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(232,137,12,0.06),transparent_50%)]" />
        {/* Glow verde sutil abajo-derecha */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(93,160,7,0.04),transparent_50%)]" />
        {/* Grid lines sutiles */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
            backgroundSize: "80px 80px",
          }}
        />
        {/* Vignette */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,0.7)_100%)]" />
      </div>

      {/* ── Logo animado ── */}
      <div
        className="fixed z-50 transition-all ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{
          ...(phase === "logo"
            ? {
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%) scale(1)",
                width: "280px",
                height: "280px",
                transitionDuration: "0ms",
              }
            : {
                top: "12px",
                left: "20px",
                transform: "translate(0, 0) scale(1)",
                width: "48px",
                height: "48px",
                transitionDuration: "800ms",
              }),
        }}
      >
        <Image
          src="/sclabs-logo.png"
          alt="SC LABS"
          fill
          className="object-contain drop-shadow-[0_0_30px_rgba(232,137,12,0.3)]"
          priority
        />
      </div>

      {/* ── Glow detrás del logo (solo en fase centrada) ── */}
      <div
        className="fixed z-40 pointer-events-none transition-opacity duration-500"
        style={{
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "500px",
          height: "500px",
          background:
            "radial-gradient(circle, rgba(232,137,12,0.12) 0%, transparent 70%)",
          opacity: phase === "logo" ? 1 : 0,
        }}
      />

      {/* ── Header (aparece cuando logo llega arriba) ── */}
      <header
        className="sticky top-0 z-40 border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-xl transition-all duration-700"
        style={{
          opacity: phase === "logo" ? 0 : 1,
          transform: phase === "logo" ? "translateY(-100%)" : "translateY(0)",
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              {/* Espacio para el logo fijo */}
              <div className="w-12" />
              <span className="text-sm font-medium tracking-[0.2em] uppercase text-zinc-400">
                SC Labs
              </span>
              <div className="h-5 w-px bg-zinc-800" />
              <span className="text-xs tracking-[0.15em] uppercase text-amber-500/60">
                Intelligence Platform
              </span>
            </div>

            <nav className="hidden sm:flex items-center gap-6 text-xs tracking-[0.12em] uppercase text-zinc-600">
              <Link
                href="/ships"
                className="hover:text-zinc-300 transition-colors"
              >
                Naves
              </Link>
              <Link
                href="/compare"
                className="hover:text-zinc-300 transition-colors"
              >
                Comparar
              </Link>
              <span className="cursor-not-allowed opacity-40">Mineria</span>
              <span className="cursor-not-allowed opacity-40">Crafting</span>
            </nav>
          </div>
        </div>
      </header>

      {/* ── Contenido principal ── */}
      <div
        className="relative z-10 transition-all duration-700 ease-out"
        style={{
          opacity: phase === "ready" ? 1 : 0,
          transform:
            phase === "ready" ? "translateY(0)" : "translateY(30px)",
        }}
      >
        {/* Hero section */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">
          <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-light tracking-wide text-zinc-100 leading-tight">
              Star Citizen
              <span className="block text-amber-500/90 font-normal mt-1">
                Intelligence Platform
              </span>
            </h1>
            <p className="mt-6 text-lg text-zinc-500 leading-relaxed max-w-xl mx-auto">
              Datos en tiempo real extraidos del cliente del juego. Base de
              naves, comparador, herramientas de mineria y crafting.
            </p>
            <p className="mt-2 text-xs tracking-[0.2em] uppercase text-zinc-700">
              Game Version 4.0.2 &mdash; 293 ships indexed
            </p>
          </div>

          {/* CTA buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-12">
            <Link
              href="/ships"
              className="group relative px-8 py-3 bg-amber-600/10 border border-amber-600/30 text-amber-500 text-sm tracking-[0.15em] uppercase hover:bg-amber-600/20 hover:border-amber-500/50 transition-all duration-300"
            >
              <span className="relative z-10">Explorar Naves</span>
              <div className="absolute inset-0 bg-gradient-to-r from-amber-600/0 via-amber-600/5 to-amber-600/0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
            <Link
              href="/compare"
              className="px-8 py-3 border border-zinc-800 text-zinc-500 text-sm tracking-[0.15em] uppercase hover:border-zinc-700 hover:text-zinc-400 transition-all duration-300"
            >
              Comparador
            </Link>
          </div>
        </section>

        {/* Stats bar */}
        <section className="border-t border-zinc-800/40 bg-zinc-950/50 backdrop-blur">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              <StatBlock value="293" label="Naves" />
              <StatBlock value="7,724" label="Hardpoints" />
              <StatBlock value="137" label="Fabricantes" />
              <StatBlock value="4.0.2" label="Game Version" />
            </div>
          </div>
        </section>

        {/* Module cards */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <ModuleCard
              href="/ships"
              title="Ship Database"
              description="Base completa de naves con stats de vuelo, armamento, resistencias, combustible y seguros."
              status="online"
              icon="&#9670;"
            />
            <ModuleCard
              href="/compare"
              title="Ship Comparator"
              description="Compara hasta 3 naves lado a lado. Flight stats, DPS, resistencias y mas."
              status="online"
              icon="&#9674;"
            />
            <ModuleCard
              href="#"
              title="Mining Solver"
              description="Calculadora de mineria con gadgets, resistencias de roca y profit estimado."
              status="coming soon"
              icon="&#9699;"
            />
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-zinc-800/30 py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-xs text-zinc-700 tracking-wide">
                SC LABS &mdash; Fan-made project. Not affiliated with CIG or
                RSI.
              </p>
              <p className="text-xs text-zinc-800 font-mono">
                sclabs.vercel.app
              </p>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}

/* ── Componentes auxiliares ── */

function StatBlock({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-2xl sm:text-3xl font-light text-zinc-200 tracking-wide font-mono">
        {value}
      </div>
      <div className="text-xs text-zinc-600 tracking-[0.15em] uppercase mt-1">
        {label}
      </div>
    </div>
  );
}

function ModuleCard({
  href,
  title,
  description,
  status,
  icon,
}: {
  href: string;
  title: string;
  description: string;
  status: "online" | "coming soon";
  icon: string;
}) {
  const isOnline = status === "online";

  const content = (
    <div
      className={`group relative p-6 border rounded-sm transition-all duration-300 h-full ${
        isOnline
          ? "border-zinc-800/60 bg-zinc-900/30 hover:border-zinc-700/60 hover:bg-zinc-900/50 cursor-pointer"
          : "border-zinc-800/30 bg-zinc-900/10 opacity-50 cursor-not-allowed"
      }`}
    >
      {/* Status indicator */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-xl opacity-40">{icon}</span>
        <span
          className={`text-[10px] tracking-[0.2em] uppercase px-2 py-0.5 rounded-sm ${
            isOnline
              ? "text-emerald-500/80 bg-emerald-500/10 border border-emerald-500/20"
              : "text-zinc-600 bg-zinc-800/30 border border-zinc-800/40"
          }`}
        >
          {status}
        </span>
      </div>
      <h3 className="text-base font-medium text-zinc-200 tracking-wide mb-2">
        {title}
      </h3>
      <p className="text-sm text-zinc-500 leading-relaxed">{description}</p>
      {isOnline && (
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-600/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
    </div>
  );

  return isOnline ? <Link href={href}>{content}</Link> : <div>{content}</div>;
}
