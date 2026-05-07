"use client";

// =============================================================================
// SC LABS — EventDangerZone
//
// Panel admin para limpiar datos del evento (inscripciones, ganadores, sesion
// del sorteo, o todo). Pide confirmacion explicita ("BORRAR" tipeado a mano)
// antes de hacer el POST. UI roja para que sea claramente "zona de peligro".
//
// Endpoint: POST /api/events/[slug]/admin/cleanup
// =============================================================================

import { useState } from "react";

type Action = "registrations" | "winners" | "raffle_session" | "all";

interface ActionMeta {
  key: Action;
  label: string;
  description: string;
}

const ACTIONS: ActionMeta[] = [
  {
    key: "registrations",
    label: "Borrar inscripciones",
    description:
      "Elimina TODAS las inscripciones del evento (incluye attended y notes). Los usuarios pueden volver a inscribirse.",
  },
  {
    key: "winners",
    label: "Borrar ganadores",
    description:
      "Elimina el historial completo de ganadores del sorteo (event_raffle_winners) — incluye emails grabados.",
  },
  {
    key: "raffle_session",
    label: "Resetear sorteo en vivo",
    description:
      "Forzar el modo sorteo a phase=idle. Util si quedo trabado o si querés cerrar la stage publica sin esperar.",
  },
  {
    key: "all",
    label: "Limpiar TODO",
    description:
      "Borra inscripciones + ganadores + resetea el sorteo. El evento queda como recien creado.",
  },
];

export function EventDangerZone({
  slug,
  onChange,
}: {
  slug: string;
  onChange: () => void;
}) {
  const [openAction, setOpenAction] = useState<Action | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setOpenAction(null);
    setConfirmation("");
    setError(null);
  };

  const submit = async (action: Action) => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch(`/api/events/${slug}/admin/cleanup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, confirmation }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `Error ${r.status}`);
      const c = j.counts ?? {};
      const parts: string[] = [];
      if (typeof c.registrations === "number" && c.registrations > 0) {
        parts.push(`${c.registrations} inscripciones`);
      }
      if (typeof c.winners === "number" && c.winners > 0) {
        parts.push(`${c.winners} ganadores`);
      }
      if (c.raffle_session_reset) parts.push("sorteo reseteado");
      setResult(parts.length > 0 ? `Borrado: ${parts.join(", ")}.` : "Hecho — nada para borrar.");
      reset();
      onChange();
    } catch (e: any) {
      setError(e?.message ?? "Error.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-zinc-900/40 border-2 border-rose-500/40 rounded-md p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-rose-400 text-lg">⚠</span>
        <div>
          <h2 className="text-[14px] font-semibold text-rose-300">
            Zona de peligro
          </h2>
          <p className="text-[10px] text-zinc-500 mt-0.5">
            Borra datos del evento. Acciones irreversibles — pide confirmación tipeada antes de ejecutar.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {ACTIONS.map((a) => (
          <div
            key={a.key}
            className={`rounded-sm border p-3 transition ${
              a.key === "all"
                ? "border-rose-600/60 bg-rose-950/20"
                : "border-rose-500/30 bg-rose-500/5"
            }`}
          >
            <p className={`text-[12px] font-bold ${a.key === "all" ? "text-rose-200" : "text-rose-300"}`}>
              {a.label}
            </p>
            <p className="text-[10px] text-zinc-400 mt-1 mb-2 leading-relaxed">
              {a.description}
            </p>
            <button
              onClick={() => {
                setOpenAction(a.key);
                setConfirmation("");
                setError(null);
              }}
              disabled={busy}
              className={`w-full text-[11px] font-medium px-3 py-1.5 rounded-sm border transition disabled:opacity-50 ${
                a.key === "all"
                  ? "border-rose-500 bg-rose-600/30 text-rose-100 hover:bg-rose-600/50"
                  : "border-rose-500/50 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25"
              }`}
            >
              {a.label}
            </button>
          </div>
        ))}
      </div>

      {result && (
        <p className="text-[11px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-sm px-2 py-1.5">
          ✓ {result}
        </p>
      )}

      {/* Modal de confirmacion */}
      {openAction && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) reset();
          }}
        >
          <div className="bg-zinc-900 border-2 border-rose-500/60 rounded-lg max-w-md w-full p-5 space-y-3 shadow-[0_0_60px_rgba(244,63,94,0.4)]">
            <h3 className="text-base font-bold text-rose-300 flex items-center gap-2">
              ⚠ Confirmá la acción
            </h3>
            <p className="text-[12px] text-zinc-200 leading-relaxed">
              Vas a ejecutar:{" "}
              <strong className="text-rose-200">
                {ACTIONS.find((a) => a.key === openAction)?.label}
              </strong>
              .
            </p>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              {ACTIONS.find((a) => a.key === openAction)?.description}
            </p>
            <p className="text-[11px] text-amber-300/90 leading-relaxed">
              Para autorizar, escribí{" "}
              <code className="px-1.5 py-0.5 bg-zinc-950 border border-rose-500/40 rounded font-mono text-rose-200">
                BORRAR
              </code>{" "}
              en el campo de abajo. La acción no se puede deshacer.
            </p>
            <input
              type="text"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value.toUpperCase())}
              placeholder="BORRAR"
              autoFocus
              className="w-full px-3 py-2 bg-zinc-950 border-2 border-rose-500/40 rounded-sm text-[14px] text-rose-100 font-mono uppercase tracking-widest placeholder-zinc-700 focus:outline-none focus:border-rose-400"
            />
            {error && (
              <p className="text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-sm px-2 py-1">
                {error}
              </p>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={reset}
                disabled={busy}
                className="flex-1 px-3 py-2 rounded-sm border border-zinc-700 bg-zinc-800 text-zinc-200 text-[12px] font-medium hover:bg-zinc-700 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => submit(openAction)}
                disabled={busy || confirmation !== "BORRAR"}
                className="flex-1 px-3 py-2 rounded-sm border border-rose-500 bg-gradient-to-b from-rose-500 to-rose-700 text-white text-[12px] font-bold hover:from-rose-400 hover:to-rose-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busy ? "Borrando..." : "Confirmar y borrar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default EventDangerZone;
