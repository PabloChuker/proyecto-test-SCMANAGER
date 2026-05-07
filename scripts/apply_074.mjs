// Aplicar migración 074 (winner email + claim timestamp + RLS self-claim)
// Uso: node scripts/apply_074.mjs
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('[ERR] DATABASE_URL no seteada'); process.exit(1); }

const sql = postgres(DATABASE_URL, { ssl: 'require', prepare: false, max: 1 });

async function main() {
  console.log('=== SC Labs — Aplicar migración 074 (winner email) ===');

  console.log('[1/4] DROP VIEW event_raffle_winners_public...');
  await sql.unsafe(`DROP VIEW IF EXISTS public.event_raffle_winners_public;`);

  console.log('[2/4] ALTER TABLE event_raffle_winners ADD COLUMNS...');
  await sql.unsafe(`
    ALTER TABLE public.event_raffle_winners
      ADD COLUMN IF NOT EXISTS winner_email TEXT,
      ADD COLUMN IF NOT EXISTS claimed_at   TIMESTAMPTZ;
  `);

  console.log('[3/4] CREATE OR REPLACE VIEW event_raffle_winners_public...');
  await sql.unsafe(`
    CREATE OR REPLACE VIEW public.event_raffle_winners_public
    WITH (security_invoker = false) AS
    SELECT
      w.id, w.event_id, w.prize, w.notes, w.drawn_at,
      w.winner_email, w.claimed_at,
      r.display_name AS winner_display_name,
      r.rsi_handle   AS winner_rsi_handle,
      p.username     AS winner_username,
      p.avatar_url   AS winner_avatar_url
    FROM public.event_raffle_winners w
    JOIN public.event_registrations r ON r.id = w.registration_id
    LEFT JOIN public.profiles p       ON p.id = r.user_id;
  `);
  await sql.unsafe(`GRANT SELECT ON public.event_raffle_winners_public TO authenticated, anon;`);

  console.log('[4/4] RLS policy event_raffle_winners_self_claim...');
  await sql.unsafe(`ALTER TABLE public.event_raffle_winners ENABLE ROW LEVEL SECURITY;`);
  await sql.unsafe(`DROP POLICY IF EXISTS event_raffle_winners_self_claim ON public.event_raffle_winners;`);
  await sql.unsafe(`
    CREATE POLICY event_raffle_winners_self_claim ON public.event_raffle_winners
      FOR UPDATE TO authenticated
      USING (
        registration_id IN (
          SELECT id FROM public.event_registrations WHERE user_id = auth.uid()
        )
      )
      WITH CHECK (
        registration_id IN (
          SELECT id FROM public.event_registrations WHERE user_id = auth.uid()
        )
      );
  `);

  // Smoke test
  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='event_raffle_winners'
    ORDER BY ordinal_position
  `;
  console.log('\nevent_raffle_winners columns:', cols.map(c => c.column_name).join(', '));

  console.log('\n[DONE] Migracion 074 aplicada.');
}

main().catch((e) => { console.error('[ERR]', e); process.exit(1); }).finally(async () => { await sql.end({ timeout: 5 }); });
