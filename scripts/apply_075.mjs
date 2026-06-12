// Aplica la migración 075 (security lockdown) + recrea event_raffle_winners_public
// SIN winner_email/claimed_at conservando su definición actual.
// Autorizado por Pablo 2026-06-12 ("termina lo que falte, te autorizo").
import 'dotenv/config';
import postgres from 'postgres';
import { readFileSync } from 'fs';

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

// 1. Capturar la definición ACTUAL de la view de ganadores (antes de tocarla)
const [vd] = await sql.unsafe(`SELECT pg_get_viewdef('public.event_raffle_winners_public'::regclass, true) AS def`);
const oldDef = vd.def;
console.log('viewdef capturada:', oldDef.slice(0, 120).replace(/\n/g, ' ') + '...');

// 2. Migración estática
const mig = readFileSync('database/migrations/075_security_lockdown_audit_2026_06_12.sql', 'utf-8');
await sql.unsafe(mig);
console.log('075 estática aplicada');

// 3. Recrear la view pública de ganadores sin PII, envolviendo la definición vieja
await sql.unsafe(`DROP VIEW IF EXISTS public.event_raffle_winners_public`);
await sql.unsafe(`
  CREATE VIEW public.event_raffle_winners_public AS
  SELECT id, event_id, prize, notes, drawn_at,
         winner_display_name, winner_rsi_handle, winner_username, winner_avatar_url
  FROM ( ${oldDef.replace(/;\s*$/, '')} ) AS base
`);
await sql.unsafe(`GRANT SELECT ON public.event_raffle_winners_public TO authenticated, anon`);
await sql.unsafe(`COMMENT ON VIEW public.event_raffle_winners_public IS 'Ganadores públicos SIN winner_email/claimed_at (lockdown 075, auditoría 2026-06-12)'`);
console.log('event_raffle_winners_public recreada sin winner_email/claimed_at');

// 4. Verificación inmediata
const cols = await sql.unsafe(`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'event_raffle_winners_public' ORDER BY ordinal_position
`);
console.log('columnas view ganadores:', cols.map(c => c.column_name).join(', '));
const pcols = await sql.unsafe(`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'profiles_public' ORDER BY ordinal_position
`);
console.log('columnas profiles_public:', pcols.map(c => c.column_name).join(', '));
const pol = await sql.unsafe(`
  SELECT tablename, policyname, cmd FROM pg_policies
  WHERE tablename IN ('profiles','organizations','event_registrations','event_raffle_winners','party_members','friendships','user_wishlist')
  ORDER BY tablename, policyname
`);
console.log('\npolicies finales:');
for (const p of pol) console.log(`  ${p.tablename}.${p.policyname} [${p.cmd}]`);

await sql.end();
