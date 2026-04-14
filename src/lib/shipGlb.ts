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

// Warning one-shot si NEXT_PUBLIC_GLB_BASE_URL no está en el bundle.
// Next.js inlinea las vars NEXT_PUBLIC_* en compile-time, así que si esta
// está undefined lo más probable es que el dev server no haya reiniciado
// después de agregarla al .env.
let baseUrlWarned = false;

function getBaseUrl(): string | null {
  const base = process.env.NEXT_PUBLIC_GLB_BASE_URL;
  if (!base) {
    if (!baseUrlWarned && typeof window !== "undefined") {
      // eslint-disable-next-line no-console
      console.warn(
        "[shipGlb] NEXT_PUBLIC_GLB_BASE_URL no está definido en el bundle. " +
        "Reiniciá el dev server (Ctrl+C + npm run dev) y borrá .next/ si persiste."
      );
      baseUrlWarned = true;
    }
    return null;
  }
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

// R2 folder structure (Apr 2026 rework):
//   - Flying ships     → SHIPS/EntityClassDefinition.{reference}.glb
//   - Ground vehicles  → VEHICLES/EntityClassDefinition.{reference}.glb
//
// Some entries blur the line (ARGO_CSV_Cargo, ANVL_Ballista, etc.), so instead
// of guessing we always try SHIPS first and fall back to VEHICLES. The viewer
// keeps the first URL that loads successfully.
const GLB_FOLDERS = ["SHIPS", "VEHICLES"] as const;

function buildUrls(base: string, reference: string): string[] {
  return GLB_FOLDERS.map(
    (folder) => `${base}/${folder}/EntityClassDefinition.${reference}.glb`,
  );
}

export function shipGlbUrl(reference: string | null | undefined): string | null {
  if (!reference) return null;
  if (GLB_EXCLUDED.has(reference)) return null;
  const base = getBaseUrl();
  if (!base) return null;
  // Legacy single-URL API: return the SHIPS/ path. New code should prefer
  // `shipGlbCandidates()` which returns the full fallback chain.
  return `${base}/SHIPS/EntityClassDefinition.${reference}.glb`;
}

/**
 * Variant-stripping regexes. Applied iteratively on a reference string to
 * reduce it to its base-ship reference (the "sister" ship whose GLB is known
 * to exist in R2).
 *
 * Examples:
 *   ANVL_F8C_Lightning_Wikelo        → ANVL_F8C_Lightning
 *   ARGO_RAFT_Wikelo_Work_Special    → ARGO_RAFT
 *   ANVL_Hornet_F7C_PYAM             → ANVL_Hornet_F7C
 *   DRAK_Cutlass_Black_Teach_Special → DRAK_Cutlass_Black
 *   ANVL_F8C_Lightning_Executive     → ANVL_F8C_Lightning
 */
const VARIANT_STRIP_REGEXES: RegExp[] = [
  /_Wikelo(s)?(_[A-Za-z0-9]+)*$/i,
  /_PYAM(_[A-Za-z0-9]+)*$/i,
  /_Teach(s)?(_[A-Za-z0-9]+)*$/i,
  /_(Executive|Exec)(_[A-Za-z0-9]+)*$/i,
  /_(Sneak|War|Work)_?Special(_[A-Za-z0-9]+)*$/i,
  /_Special(_[A-Za-z0-9]+)*$/i,
  /_Edition$/i,
];

function stripVariantSuffix(reference: string): string {
  let r = reference;
  let changed = true;
  while (changed) {
    changed = false;
    for (const rx of VARIANT_STRIP_REGEXES) {
      const next = r.replace(rx, "");
      if (next !== r && next.length > 0) {
        r = next;
        changed = true;
      }
    }
  }
  return r;
}

/**
 * Returns an ordered list of GLB URLs to try for a given reference.
 *
 * [0] → primary (the ship's own reference)
 * [1..] → fallbacks obtained by stripping variant tokens (Wikelo / PYAM /
 *         Teach's Special / Executive / ...) so variants fall back to their
 *         base-ship GLB. The viewer tries each URL in order and keeps the
 *         first one that loads.
 */
export function shipGlbCandidates(
  reference: string | null | undefined,
): string[] {
  if (!reference) return [];
  if (GLB_EXCLUDED.has(reference)) return [];
  const base = getBaseUrl();
  if (!base) return [];

  const ordered: string[] = [];
  const seen = new Set<string>();
  const push = (r: string) => {
    if (!r) return;
    for (const url of buildUrls(base, r)) {
      if (seen.has(url)) continue;
      seen.add(url);
      ordered.push(url);
    }
  };

  push(reference);
  const stripped = stripVariantSuffix(reference);
  if (stripped !== reference) push(stripped);
  return ordered;
}

/**
 * Variante que acepta un `glb_key` explícito de la DB.
 * Útil si alguna nave tiene una key distinta a su reference
 * (ej: variantes AI de NPCs mapeadas a la versión civil).
 */
export function shipGlbUrlFromKey(glbKey: string | null | undefined): string | null {
  if (!glbKey) return null;
  const base = getBaseUrl();
  if (!base) return null;
  return `${base}/SHIPS/EntityClassDefinition.${glbKey}.glb`;
}

/**
 * Variante en lista: devuelve SHIPS/ y VEHICLES/ para un `glb_key` explícito.
 */
export function shipGlbCandidatesFromKey(
  glbKey: string | null | undefined,
): string[] {
  if (!glbKey) return [];
  const base = getBaseUrl();
  if (!base) return [];
  return buildUrls(base, glbKey);
}
