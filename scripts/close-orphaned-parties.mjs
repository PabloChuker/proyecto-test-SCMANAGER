// =============================================================================
// SC LABS — Close orphaned parties (one-shot)
//
// Uso:
//   node scripts/close-orphaned-parties.mjs                (dry-run: solo cuenta)
//   node scripts/close-orphaned-parties.mjs --apply        (ejecuta el UPDATE)
//
// Qué hace:
//   - Marca como `status='ended'` todas las parties que siguen `active` y
//     se crearon hace más de 24 horas.  Fija `ended_at = created_at + 24h`
//     y `last_seen_at = created_at + 24h` (timestamp conservador).
//   - Preserva filas (no borra nada).  El historial queda intacto para
//     stats de actividades.
//
// Prereq:
//   - `DATABASE_URL` o `DIRECT_URL` en el .env (usa postgres.js Porsager).
//   - La migración 054 debe estar aplicada (columnas ended_at + last_seen_at).
//
// Este script también se puede saltear porque la migración 054 ya ejecuta el
// mismo UPDATE en su BEGIN/COMMIT.  Queda como herramienta para volver a
// correrlo si aparecen nuevos fantasmas entre aplicaciones de migraciones.
// =============================================================================

import "dotenv/config";
import postgres from "postgres";

const APPLY = process.argv.includes("--apply");
const DB_URL = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!DB_URL) {
  console.error("ERROR: DIRECT_URL / DATABASE_URL no definida en .env");
  process.exit(1);
}

const sql = postgres(DB_URL, { prepare: false });

async function main() {
  const mode = APPLY ? "APPLY" : "DRY-RUN";
  console.log(`\n=== close-orphaned-parties (${mode}) ===\n`);

  const [{ total_active }] = await sql`
    SELECT COUNT(*)::int AS total_active
    FROM public.parties
    WHERE status = 'active'
  `;

  const [{ to_close }] = await sql`
    SELECT COUNT(*)::int AS to_close
    FROM public.parties
    WHERE status = 'active'
      AND created_at < NOW() - INTERVAL '24 hours'
  `;

  console.log(`Total active:           ${total_active}`);
  console.log(`> 24h viejas (a cerrar): ${to_close}`);

  if (to_close === 0) {
    console.log("\nNada que hacer.");
    await sql.end();
    return;
  }

  if (!APPLY) {
    // Muestra 10 candidatas para inspección manual
    const sample = await sql`
      SELECT id, name, leader_id, activity_type, created_at
      FROM public.parties
      WHERE status = 'active'
        AND created_at < NOW() - INTERVAL '24 hours'
      ORDER BY created_at DESC
      LIMIT 10
    `;
    console.log("\nMuestra (primeras 10):");
    sample.forEach((p) => {
      console.log(
        `  - ${p.id}  ${p.name}  ${p.activity_type || "?"}  ${p.created_at.toISOString()}`,
      );
    });
    console.log("\nRe-correr con --apply para ejecutar el UPDATE.");
    await sql.end();
    return;
  }

  const result = await sql`
    UPDATE public.parties
    SET
      status       = 'ended',
      ended_at     = COALESCE(ended_at, created_at + INTERVAL '24 hours'),
      last_seen_at = COALESCE(last_seen_at, created_at + INTERVAL '24 hours')
    WHERE
      status = 'active'
      AND created_at < NOW() - INTERVAL '24 hours'
    RETURNING id
  `;

  console.log(`\n✓ Cerradas ${result.length} parties huérfanas.`);
  await sql.end();
}

main().catch((err) => {
  console.error("ERROR:", err?.message ?? err);
  process.exit(1);
});
