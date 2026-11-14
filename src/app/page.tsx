import { redirect } from "next/navigation";

// Branding.5 (2026-11-14): Pablo sacó el video de presentación — tardaba en
// cargar y gastaba recursos antes de dejar entrar a la herramienta. La home
// ahora redirige directo al gestor de loadouts, sin intro ni video de fondo.
//
// Destino por defecto: `/loadout`. Es el módulo más usado y la entrada
// natural al producto.
const DEFAULT_ROUTE = "/loadout";

export default function Home() {
  redirect(DEFAULT_ROUTE);
}
