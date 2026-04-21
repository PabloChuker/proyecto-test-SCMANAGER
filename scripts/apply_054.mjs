// Aplicar migración 054 (party lifecycle) a Supabase prod.
// Uso: node scripts/apply_054.mjs
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

async function main() {
  console.log('=== SC Labs — Aplicar migración 054 (party lifecycle) ===');
  console.log('host:', DATABASE_URL.split('@')[1]?.split('/')[0]);

  // Estado previo
  const [{ total_active }] = await sql`
    SELECT COUNT(*)::int AS total_active FROM public.parties WHERE status = 'active'
  `;
  const [{ total_all }] = await sql`
    SELECT COUNT(*)::int AS total_all FROM public.parties
  `;
  const hasEndedAt = await columnExists('parties', 'ended_at');
  const hasLastSeen = await columnExists('parties', 'last_seen_at');

  console.log('\nESTADO PREVIO:');
  console.log(`  parties total:             ${total_all}`);
  console.log(`  parties active:            ${total_active}`);
  console.log(`  col parties.ended_at:      ${hasEndedAt ? 'YA existe' : 'NO existe'}`);
  console.log(`  col parties.last_seen_at:  ${hasLastSeen ? 'YA existe' : 'NO existe'}`);

  // Aplicar
  const file = '054_add_party_lifecycle.sql';
  const full = path.join('database/migrations', file);
  const sqlText = fs.readFileSync(full, 'utf8');
  console.log(`\n[run] ${file} (${sqlText.length.toLocaleString()} bytes)`);
  await sql.unsafe(sqlText);
  console.log(`[ok]  ${file} aplicada`);

  // Estado posterior
  const [{ still_active }] = await sql`
    SELECT COUNT(*)::int AS still_active FROM public.parties WHERE status = 'active'
  `;
  const [{ now_ended }] = await sql`
    SELECT COUNT(*)::int AS now_ended FROM public.parties WHERE status = 'ended'
  `;
  const hasEndedAtAfter = await columnExists('parties', 'ended_at');
  const hasLastSeenAfter = await columnExists('parties', 'last_seen_at');

  console.log('\nESTADO POSTERIOR:');
  console.log(`  parties active:            ${still_active}`);
  console.log(`  parties ended:             ${now_ended}`);
  console.log(`  col parties.ended_at:      ${hasEndedAtAfter ? 'OK' : 'FALLÓ'}`);
  console.log(`  col parties.last_seen_at:  ${hasLastSeenAfter ? 'OK' : 'FALLÓ'}`);

  await sql.end();
}

main().catch((err) => {
  console.error('\n[FATAL]', err?.message ?? err);
  process.exit(1);
});
