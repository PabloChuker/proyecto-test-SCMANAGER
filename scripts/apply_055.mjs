// Aplicar migración 055 (close orphan mining_sessions) a Supabase prod.
// Uso: node scripts/apply_055.mjs
import postgres from 'postgres';
import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';

const DATABASE_URL = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[ERR] DATABASE_URL / DIRECT_URL no seteada');
  process.exit(1);
}

const sql = postgres(DATABASE_URL, {
  ssl: 'require',
  prepare: false, // Supabase pooler
  max: 1,
  idle_timeout: 20,
  connect_timeout: 30,
});

async function main() {
  console.log('=== SC Labs — Aplicar migración 055 (close orphan mining_sessions) ===');
  console.log('host:', DATABASE_URL.split('@')[1]?.split('/')[0]);

  // Estado previo
  const [{ orphans_before }] = await sql`
    SELECT COUNT(*)::int AS orphans_before
    FROM public.mining_sessions ms
    WHERE ms.status = 'active'
      AND ms.party_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.parties p
        WHERE p.id = ms.party_id AND p.status = 'ended'
      )
  `;
  const [{ total_active_before }] = await sql`
    SELECT COUNT(*)::int AS total_active_before
    FROM public.mining_sessions WHERE status = 'active'
  `;

  console.log('\nESTADO PREVIO:');
  console.log(`  mining_sessions active:              ${total_active_before}`);
  console.log(`  mining_sessions huérfanas (a cerrar): ${orphans_before}`);

  // Muestra hasta 10 para verificar
  const sample = await sql`
    SELECT ms.id, ms.name, ms.party_id, ms.created_at, p.status AS party_status
    FROM public.mining_sessions ms
    JOIN public.parties p ON p.id = ms.party_id
    WHERE ms.status = 'active' AND p.status = 'ended'
    ORDER BY ms.created_at DESC
    LIMIT 10
  `;
  if (sample.length > 0) {
    console.log('\nMuestra huérfanas:');
    sample.forEach((s) => {
      console.log(`  - ${s.id} "${s.name}" party=${s.party_id} (${s.party_status})`);
    });
  }

  // Aplicar
  const file = '055_close_orphan_mining_sessions.sql';
  const full = path.join('database/migrations', file);
  const sqlText = fs.readFileSync(full, 'utf8');
  console.log(`\n[run] ${file} (${sqlText.length.toLocaleString()} bytes)`);
  await sql.unsafe(sqlText);
  console.log(`[ok]  ${file} aplicada`);

  // Estado posterior
  const [{ orphans_after }] = await sql`
    SELECT COUNT(*)::int AS orphans_after
    FROM public.mining_sessions ms
    WHERE ms.status = 'active'
      AND ms.party_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.parties p
        WHERE p.id = ms.party_id AND p.status = 'ended'
      )
  `;
  const [{ total_active_after }] = await sql`
    SELECT COUNT(*)::int AS total_active_after
    FROM public.mining_sessions WHERE status = 'active'
  `;
  const [{ total_completed_after }] = await sql`
    SELECT COUNT(*)::int AS total_completed_after
    FROM public.mining_sessions WHERE status = 'completed'
  `;

  console.log('\nESTADO POSTERIOR:');
  console.log(`  mining_sessions active:      ${total_active_after}`);
  console.log(`  mining_sessions completed:   ${total_completed_after}`);
  console.log(`  orphans restantes:           ${orphans_after}`);

  await sql.end();
}

main().catch((err) => {
  console.error('\n[FATAL]', err?.message ?? err);
  process.exit(1);
});
