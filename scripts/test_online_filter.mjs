import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

console.log('=== Estado actual de game_versions ===');
let v = await sql`SELECT version, online FROM game_versions ORDER BY "processedAt" DESC NULLS LAST`;
for (const r of v) console.log(`  ${r.online ? '✓' : ' '} ${r.version}`);

// Helper que replica resolveEffectiveGv del lib
async function resolveEffectiveGv(requested) {
  const rows = await sql`
    SELECT version FROM game_versions
    WHERE COALESCE(online, true) = true AND version = ${requested}
  `;
  if (rows.length > 0) return requested;
  const def = await sql`
    SELECT version FROM game_versions
    WHERE COALESCE(online, true) = true
      AND version !~* 'PTU' AND version ~ '^[0-9]+\\.[0-9]+'
    ORDER BY "processedAt" DESC NULLS LAST, version DESC LIMIT 1
  `;
  return def[0]?.version ?? null;
}

console.log('\n=== Test 1: resolveEffectiveGv(null) ===');
console.log('  → ', await resolveEffectiveGv(null));

console.log('\n=== Test 2: resolveEffectiveGv("4.8.0-live.11825000") (online) ===');
console.log('  → ', await resolveEffectiveGv('4.8.0-live.11825000'));

console.log('\n=== Test 3: resolveEffectiveGv("4.7.2") (offline ahora) ===');
console.log('  → ', await resolveEffectiveGv('4.7.2'), '(debería caer al default online)');

console.log('\n=== Test 4: ships count filtrado por online ===');
const onlineList = (await sql`
  SELECT version FROM game_versions WHERE COALESCE(online, true) = true ORDER BY "processedAt" DESC
`).map(r => r.version);
console.log('  online list:', onlineList);
const [c1] = await sql.unsafe(`SELECT COUNT(*)::int AS n FROM ships`, []);
const [c2] = await sql.unsafe(`SELECT COUNT(*)::int AS n FROM ships WHERE game_version = ANY($1::text[])`, [onlineList]);
console.log(`  ships TOTAL = ${c1.n}`);
console.log(`  ships ONLINE = ${c2.n}`);

await sql.end({ timeout: 3 });
