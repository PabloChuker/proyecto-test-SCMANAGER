"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, Suspense } from "react";
import Header from "@/app/assets/header/Header";

function LoginContent() {
  const { user, loading, signInWithDiscord } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const error = params.get("error");

  useEffect(() => {
    if (!loading && user) router.push("/profile");
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-zinc-500 animate-pulse">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center z-10 relative">
      <div className="max-w-md w-full mx-4 space-y-8">
        {/* Logo / Title */}
        <div className="text-center space-y-3">
          <div className="text-5xl">🚀</div>
          <h1 className="text-3xl font-bold text-zinc-100 tracking-wider">
            SC LABS
          </h1>
          <p className="text-zinc-500 text-sm">
            Star Citizen Intelligence Platform
          </p>
        </div>

        {/* Login Card */}
        <div className="p-6 rounded-lg border border-zinc-800/50 bg-zinc-900/60 backdrop-blur space-y-6">
          <div className="text-center">
            <h2 className="text-lg text-zinc-200">Iniciar Sesion</h2>
            <p className="text-xs text-zinc-500 mt-1">
              Conecta con Discord para acceder a tu perfil, amigos y party
            </p>
          </div>

          {error && (
            <div className="p-3 rounded border border-red-800/50 bg-red-900/20 text-red-400 text-sm text-center">
              Error al autenticar. Intenta nuevamente.
            </div>
          )}

          <button
            onClick={signInWithDiscord}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-lg bg-[#5865F2] hover:bg-[#4752C4] text-white font-medium transition-colors"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
            Iniciar con Discord
          </button>

          <p className="text-xs text-zinc-600 text-center">
            Al iniciar sesion aceptas que usemos tu perfil de Discord para
            identificarte en la plataforma.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <video
        autoPlay loop muted playsInline
        className="fixed inset-0 w-full h-full object-cover opacity-10 pointer-events-none z-0"
      >
        <source src="/videos/mineria.mp4" type="video/mp4" />
      </video>
      <div className="fixed inset-0 bg-gradient-to-b from-zinc-950/60 via-zinc-950/80 to-zinc-950/95 pointer-events-none z-0" />
      <Header subtitle="Login" />
      <Suspense fallback={<div className="flex-1" />}>
        <LoginContent />
      </Suspense>
    </main>
  );
}
