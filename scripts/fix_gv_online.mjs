import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

console.log('=== game_versions ANTES ===');
let v = await sql`SELECT version, online, "processedAt" FROM game_versions ORDER BY "processedAt" DESC NULLS LAST`;
for (const r of v) console.log(`  ${r.online?'✓':' '}  ${r.version.padEnd(38)} ${r.processedAt}`);

const r = await sql`UPDATE game_versions SET online = true WHERE version = '4.8.0-live.11825000'`;
console.log(`\n→ Marcado online: ${r.count} filas`);

console.log('\n=== game_versions DESPUÉS ===');
v = await sql`SELECT version, online, "processedAt" FROM game_versions ORDER BY "processedAt" DESC NULLS LAST`;
for (const r of v) console.log(`  ${r.online?'✓':' '}  ${r.version.padEnd(38)} ${r.processedAt}`);

await sql.end({ timeout: 3 });
