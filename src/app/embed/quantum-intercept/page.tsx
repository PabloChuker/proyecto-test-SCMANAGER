import QuantumIntercept from "@/components/tools/QuantumIntercept";
import UmbraPluginBoot from "@/components/embed/UmbraPluginBoot";

// Versión embebible de Quantum Intercept — pensada para correr dentro del
// iframe sandboxed de un plugin de Umbra (o cualquier embed autorizado).
// Sin Header del sitio: el chrome lo pone el host que la embebe. El
// middleware exime a /embed/* del X-Frame-Options: DENY global y le pone
// frame-ancestors con la allowlist de hosts.
export const metadata = {
  title: "Quantum Intercept (embed) — SC Labs",
  description: "Plan quantum interception points across the Stanton system.",
  robots: { index: false },
};

export default function QuantumInterceptEmbedPage() {
  return (
    <main className="h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
      <UmbraPluginBoot />
      <QuantumIntercept />
    </main>
  );
}
