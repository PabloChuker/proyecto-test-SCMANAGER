"use client";

import { useEffect } from "react";

// Handshake mínimo del Bridge de Umbra (apiVersion 1) sin depender del SDK:
// anuncia 'ready' al host y aplica los tokens CSS de tema que llegan en el
// mensaje 'init' (--umbra-accent, etc.), para que la herramienta adopte el
// acento del tema de Umbra. Fuera de un iframe no hace nada.
// Protocolo: Umbra-VoIP/docs/plugins/03-bridge-api-v1.md
export default function UmbraPluginBoot() {
  useEffect(() => {
    if (window.parent === window) return; // no estamos embebidos

    const onMessage = (e: MessageEvent) => {
      if (e.source !== window.parent) return;
      const data = e.data as
        | { umbra?: string; context?: { theme?: Record<string, string> } }
        | null;
      if (!data || data.umbra !== "init") return;
      for (const [token, value] of Object.entries(data.context?.theme ?? {})) {
        if (token.startsWith("--")) {
          document.documentElement.style.setProperty(token, value);
        }
      }
    };

    window.addEventListener("message", onMessage);
    window.parent.postMessage({ umbra: "ready" }, "*");
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return null;
}
