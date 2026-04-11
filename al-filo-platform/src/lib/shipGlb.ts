// =============================================================================
// SC LABS — ship GLB URL helper
//
// Construye la URL pública del modelo 3D de una nave a partir de su `reference`
// (la misma key que aparece en ships.reference, ej: "AEGS_Avenger_Titan").
//
// Los GLB están hosteados en Cloudflare R2. La base URL se configura vía
// NEXT_PUBLIC_GLB_BASE_URL (ej: https://pub-xxxx.r2.dev).
//
// Convención de nombres de archivo:
//   EntityClassDefinition.{reference}.glb
//
// Ejemplo:
//   shipGlbUrl("AEGS_Avenger_Titan")
//   → "https://pub-xxxx.r2.dev/EntityClassDefinition.AEGS_Avenger_Titan.glb"
// =============================================================================

/**
 * Lista de ship references que NO tienen GLB asociado.
 * Si alguna future falta, se puede marcar acá o delegar en la DB (columna glb_key).
 */
const GLB_EXCLUDED = new Set<string>([
  // Mantener vacío por ahora; la mayoría de las naves del catálogo tienen GLB.
]);

export function shipGlbUrl(reference: string | null | undefined): string | null {
  if (!reference) return null;
  if (GLB_EXCLUDED.has(reference)) return null;

  const base = process.env.NEXT_PUBLIC_GLB_BASE_URL;
  if (!base) return null;

  // Eliminar trailing slash si existe para componer limpio
  const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${cleanBase}/EntityClassDefinition.${reference}.glb`;
}

/**
 * Variante que acepta un `glb_key` explícito de la DB.
 * Útil si alguna nave tiene una key distinta a su reference
 * (ej: variantes AI de NPCs mapeadas a la versión civil).
 */
export function shipGlbUrlFromKey(glbKey: string | null | undefined): string | null {
  if (!glbKey) return null;
  const base = process.env.NEXT_PUBLIC_GLB_BASE_URL;
  if (!base) return null;
  const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${cleanBase}/EntityClassDefinition.${glbKey}.glb`;
}
