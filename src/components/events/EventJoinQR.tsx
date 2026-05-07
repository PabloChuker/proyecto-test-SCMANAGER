"use client";

// =============================================================================
// SC LABS — EventJoinQR
//
// Panel admin: muestra el QR + URL directa de inscripcion al evento. Pensado
// para que los organizadores impriman/proyecten el QR en el lugar y los
// asistentes escaneen con su celular para inscribirse al sorteo en 1 click
// (siempre via login Discord).
//
// QR generado por api.qrserver.com (servicio publico, sin auth ni cuotas
// agresivas). Si por alguna razon el endpoint cae, mantenemos la URL como
// fallback copiable.
// =============================================================================

import { useEffect, useMemo, useState } from "react";

export function EventJoinQR({ slug }: { slug: string }) {
  const [origin, setOrigin] = useState<string>("");
  const [copied, setCopied] = useState(false);

  // En SSR no tenemos window — calcular origin del lado cliente.
  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  const joinUrl = origin ? `${origin}/events/${slug}/join` : "";
  const qrSrc = useMemo(() => {
    if (!joinUrl) return "";
    const params = new URLSearchParams({
      size: "480x480",
      data: joinUrl,
      bgcolor: "f8f4ea", // mismo beige claro del cartel medieval
      color: "1a1410",
      margin: "10",
      qzone: "2",
    });
    return `https://api.qrserver.com/v1/create-qr-code/?${params.toString()}`;
  }, [joinUrl]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* swallow */
    }
  };

  return (
    <div className="bg-zinc-900/40 border border-cyan-500/40 rounded-md p-4 space-y-3">
      <div>
        <h2 className="text-[14px] font-semibold text-cyan-300 flex items-center gap-2">
          📱 QR de inscripción
        </h2>
        <p className="text-[10px] text-zinc-500 mt-0.5">
          Imprimí o proyectá este QR en el evento. Los asistentes lo escanean →
          login con Discord (si no estaban logueados) → quedan inscriptos y
          marcados como <strong className="text-cyan-300">presentes</strong>{" "}
          automáticamente.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-start gap-4">
        {qrSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrSrc}
            alt="QR de inscripción al sorteo"
            className="w-48 h-48 sm:w-56 sm:h-56 rounded-md border-2 border-cyan-500/40 bg-[#f8f4ea] shrink-0"
          />
        ) : (
          <div className="w-48 h-48 sm:w-56 sm:h-56 rounded-md border border-zinc-800 bg-zinc-950/60 flex items-center justify-center text-zinc-600 text-[10px] shrink-0">
            cargando...
          </div>
        )}

        <div className="flex-1 min-w-0 space-y-2 w-full">
          <div>
            <p className="text-[9px] uppercase tracking-widest text-zinc-500 font-mono mb-1">
              URL directa
            </p>
            <code className="block w-full px-2 py-1.5 bg-zinc-950 border border-zinc-800/60 rounded-sm text-[11px] text-cyan-200 font-mono break-all">
              {joinUrl || "..."}
            </code>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={copy}
              disabled={!joinUrl}
              className="px-3 py-1.5 rounded-sm border border-cyan-500/50 bg-cyan-500/15 text-cyan-200 text-[11px] font-medium hover:bg-cyan-500/25 transition disabled:opacity-40"
            >
              {copied ? "✓ Copiado" : "Copiar URL"}
            </button>
            {qrSrc && (
              <a
                href={qrSrc.replace("size=480x480", "size=1024x1024")}
                target="_blank"
                rel="noopener noreferrer"
                download={`qr-${slug}.png`}
                className="px-3 py-1.5 rounded-sm border border-cyan-500/50 bg-cyan-500/10 text-cyan-200 text-[11px] font-medium hover:bg-cyan-500/20 transition"
              >
                ⬇ Descargar QR (1024px)
              </a>
            )}
            {joinUrl && (
              <a
                href={joinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-sm border border-cyan-500/30 text-cyan-300/80 text-[11px] font-medium hover:bg-cyan-500/10 transition"
              >
                Probar URL ↗
              </a>
            )}
          </div>

          <p className="text-[10px] text-zinc-500 leading-relaxed pt-1 border-t border-zinc-800/40">
            <strong className="text-amber-300">Tip:</strong> el escaneo crea
            la inscripción y deja al usuario marcado como presente, así no
            tenés que confirmarlos a mano desde la lista. Si querés permitir
            que se inscriban remoto SIN marcar presente, ahora se sigue
            pudiendo desde el flujo normal del evento.
          </p>
        </div>
      </div>
    </div>
  );
}

export default EventJoinQR;
