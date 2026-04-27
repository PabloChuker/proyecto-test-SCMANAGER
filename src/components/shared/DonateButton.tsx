"use client";

// =============================================================================
// SC Labs — Donate Button (header)
//
// Botón compacto que abre el flow de donación PayPal en una pestaña nueva.
// Usa el `hosted_button_id` del proyecto (F5XB33KKRXH2C) directo en la URL,
// sin cargar el SDK donate-sdk.js — es más rápido (sin script externo) y se
// puede estilizar con Tailwind para que combine con el header amber/cyan
// del resto de SC Labs.
//
// Si en algún momento querés el botón "oficial" de PayPal con la imagen
// btn_donate_LG.gif, hay que migrar a Next.js <Script> + un effect que
// llama PayPal.Donation.Button(...).render() una sola vez. Pero el botón
// oficial es ~150×50 y rompe la grilla del header, así que lo evito acá.
// =============================================================================

const DONATE_URL = "https://www.paypal.com/donate?hosted_button_id=F5XB33KKRXH2C";

export function DonateButton() {
  return (
    <a
      href={DONATE_URL}
      target="_blank"
      rel="noopener noreferrer"
      title="Apoyar a SC Labs con una donación vía PayPal"
      aria-label="Donar a SC Labs vía PayPal"
      className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-[10px] font-mono uppercase tracking-wider rounded-sm bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 hover:border-amber-500/50 transition-all"
    >
      <span aria-hidden="true">♥</span>
      <span>Donar</span>
    </a>
  );
}
