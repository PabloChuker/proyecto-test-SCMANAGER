"use client";
// =============================================================================
// SC LABS — /streamers/overlay — OBS Browser Source
//
// Ruta pensada para usarse como Browser Source en OBS. Lee los query params:
//   ?ship=<reference>&theme=<themeKey>&variant=horizontal|vertical
//
// Renderiza la tarjeta directamente sin chrome / header / sidebar, con el
// fondo del body transparente para que el streamer pueda posicionarla sobre
// cualquier layout. Si falta algún parámetro, muestra un mensaje mínimo.
// =============================================================================

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import ShipInfoCard from "@/components/streamers/ShipInfoCard";
import type { CardVariant } from "@/components/streamers/ship-card-themes";
import type { ShipDetailResponseV2 } from "@/types/ships";

function OverlayInner() {
  const params = useSearchParams();
  const shipRef = params.get("ship");
  const themeKey = params.get("theme") || "black";
  const variantParam = params.get("variant");
  const variant: CardVariant = variantParam === "vertical" ? "vertical" : "horizontal";

  const [data, setData] = useState<ShipDetailResponseV2 | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fondo transparente para OBS — se aplica solo mientras esta ruta esté montada
    const prevHtml = document.documentElement.style.backgroundColor;
    const prevBody = document.body.style.backgroundColor;
    document.documentElement.style.backgroundColor = "transparent";
    document.body.style.backgroundColor = "transparent";
    return () => {
      document.documentElement.style.backgroundColor = prevHtml;
      document.body.style.backgroundColor = prevBody;
    };
  }, []);

  useEffect(() => {
    if (!shipRef) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/ships/${encodeURIComponent(shipRef)}`);
        if (!res.ok) throw new Error("HTTP " + res.status);
        const json: ShipDetailResponseV2 = await res.json();
        if (!cancelled) setData(json);
      } catch (e) {
        console.error("Overlay load failed:", e);
        if (!cancelled) setError("No se pudo cargar la nave");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shipRef]);

  if (!shipRef) {
    return (
      <div
        style={{
          fontFamily: "monospace",
          color: "#a1a1aa",
          padding: 20,
          fontSize: 12,
        }}
      >
        Falta el parámetro <code>?ship=&lt;reference&gt;</code>. Ejemplo:
        <br />
        /streamers/overlay?ship=aegs_avenger&theme=black&variant=horizontal
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          fontFamily: "monospace",
          color: "#f87171",
          padding: 20,
          fontSize: 12,
        }}
      >
        {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div
        style={{
          fontFamily: "monospace",
          color: "#71717a",
          padding: 20,
          fontSize: 12,
        }}
      >
        Cargando…
      </div>
    );
  }

  return (
    <div style={{ display: "inline-block" }}>
      <ShipInfoCard data={data} themeKey={themeKey} variant={variant} />
    </div>
  );
}

export default function OverlayPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            fontFamily: "monospace",
            color: "#71717a",
            padding: 20,
            fontSize: 12,
          }}
        >
          Inicializando…
        </div>
      }
    >
      <OverlayInner />
    </Suspense>
  );
}
