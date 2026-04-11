"use client";
// =============================================================================
// SC LABS — Streamers · ReferralTracker
//
// Componente cliente-only que se monta una única vez en el root layout. Lee
// ?ref=<code> de la URL al iniciar la sesión, lo persiste en localStorage y
// dispara una llamada a /api/referral/track para registrar la visita.
//
// Solo trackea UNA vez por combinación ref_code + sesión (usamos sessionStorage)
// para no meter ruido en la tabla si el usuario navega entre páginas.
// =============================================================================

import { useEffect } from "react";

const STORAGE_KEY_PERSISTENT = "sclabs:referral_code";
const STORAGE_KEY_SESSION = "sclabs:referral_tracked";

function isValidRefCode(s: string): boolean {
  return /^[a-z0-9_-]{2,32}$/.test(s);
}

export default function ReferralTracker() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const params = new URLSearchParams(window.location.search);
      const raw = params.get("ref");
      if (!raw) return;

      const normalized = raw.toLowerCase().trim();
      if (!isValidRefCode(normalized)) return;

      // Persistimos el código para futuros signups
      try {
        window.localStorage.setItem(STORAGE_KEY_PERSISTENT, normalized);
      } catch {
        // localStorage puede estar deshabilitado
      }

      // Evitamos trackear dos veces en la misma sesión
      let alreadyTracked = false;
      try {
        alreadyTracked =
          window.sessionStorage.getItem(STORAGE_KEY_SESSION) === normalized;
      } catch {
        // Ignore
      }
      if (alreadyTracked) return;

      // Fire-and-forget POST al endpoint interno
      fetch("/api/referral/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ref: normalized,
          landingPath: window.location.pathname + window.location.search,
        }),
        keepalive: true,
      })
        .then(() => {
          try {
            window.sessionStorage.setItem(STORAGE_KEY_SESSION, normalized);
          } catch {
            // Ignore
          }
        })
        .catch(() => {
          // No molestamos al usuario si falla
        });
    } catch {
      // Defensive: cualquier error en esta lógica se traga en silencio
    }
  }, []);

  return null;
}
