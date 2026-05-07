// Aplicar migración 073 (event raffle session) a Supabase prod.
// Uso: node scripts/apply_073.mjs
import postgres from 'postgres';
import fs from 'node:fs';
import path from 'node:path';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[ERR] DATABASE_URL no seteada');
  process.exit(1);
}

const sql = postgres(DATABASE_URL, {
  ssl: 'require',
  prepare: false, // Supabase pooler
  max: 1,
  idle_timeout: 20,
  connect_timeout: 30,
});

async function columnExists(table, column) {
  const r = await sql`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${table}
        AND column_name = ${column}
    ) AS yes
  `;
  return !!r[0].yes;
}

async function viewExists(name) {
  const r = await sql`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.views
      WHERE table_schema = 'public'
        AND table_name = ${name}
    ) AS yes
  `;
  return !!r[0].yes;
}

async function main() {
  console.log('=== SC Labs — Aplicar migración 073 (event raffle session) ===');
  console.log('host:', DATABASE_URL.split('@')[1]?.split('/')[0]);

  const beforeCol = await columnExists('community_events', 'raffle_session');
  const beforeView = await viewExists('community_events_public');
  console.log('community_events.raffle_session existe?', beforeCol);
  console.log('community_events_public view existe?', beforeView);

  if (beforeCol) {
    console.log('[OK] La columna raffle_session ya existe — solo recreamos la view por las dudas.');
  }

  console.log('\n[1/3] DROP VIEW community_events_public...');
  await sql.unsafe(`DROP VIEW IF EXISTS public.community_events_public;`);

  console.log('[2/3] ALTER TABLE community_events ADD COLUMN raffle_session...');
  await sql.unsafe(`
    ALTER TABLE public.community_events
      ADD COLUMN IF NOT EXISTS raffle_session JSONB NOT NULL DEFAULT '{"phase":"idle"}'::jsonb;
  `);
  await sql.unsafe(`
    COMMENT ON COLUMN public.community_events.raffle_session IS
      'Estado live del sorteo en escena. phase: idle/loading/loaded/spinning/won/claimed. '
      'El admin actualiza via /api/events/[slug]/admin/raffle-state. '
      'La pagina publica hace polling cuando phase != idle.';
  `);

  console.log('[3/3] CREATE OR REPLACE VIEW community_events_public...');
  await sql.unsafe(`
    CREATE OR REPLACE VIEW public.community_events_public
    WITH (security_invoker = false) AS
    SELECT
      e.*,
      (SELECT COUNT(*) FROM public.event_registrations r
        WHERE r.event_id = e.id AND r.attendance_intent = 'confirmed')        AS confirmed_count,
      (SELECT COUNT(*) FROM public.event_registrations r
        WHERE r.event_id = e.id AND r.attendance_intent = 'maybe')            AS maybe_count,
      (SELECT COUNT(*) FROM public.event_registrations r
        WHERE r.event_id = e.id AND r.attended = true)                        AS attended_count,
      (SELECT COUNT(*) FROM public.event_raffle_winners w
        WHERE w.event_id = e.id)                                              AS raffle_winners_count
    FROM public.community_events e
    WHERE e.is_active = true;
  `);
  await sql.unsafe(`GRANT SELECT ON public.community_events_public TO authenticated, anon;`);

  // Validacion post-migracion
  const afterCol = await columnExists('community_events', 'raffle_session');
  const afterView = await viewExists('community_events_public');
  console.log('\n=== Estado post-migracion ===');
  console.log('community_events.raffle_session existe?', afterCol);
  console.log('community_events_public view existe?', afterView);

  // Smoke test: leer el evento bar-citizen y ver que raffle_session venga
  const [evt] = await sql`
    SELECT slug, raffle_session
    FROM public.community_events_public
    WHERE slug = 'bar-citizen-ourense-2026-06'
    LIMIT 1
  `;
  if (evt) {
    console.log('\nSmoke test [bar-citizen-ourense-2026-06]:');
    console.log('  raffle_session =', JSON.stringify(evt.raffle_session));
  } else {
    console.log('\n[WARN] No se encontro el evento bar-citizen-ourense-2026-06 en la view publica.');
  }

  console.log('\n[DONE] Migracion 073 aplicada correctamente.');
}

main()
  .catch((err) => {
    console.error('[ERR]', err);
    process.exit(1);
  })
  .finally(async () => {
    await sql.end({ timeout: 5 });
  });
