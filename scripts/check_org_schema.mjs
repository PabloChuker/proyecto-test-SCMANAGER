import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

console.log('=== org_members columns ===');
const c = await sql`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='org_members' AND table_schema='public' ORDER BY ordinal_position`;
for (const x of c) console.log(`  ${x.column_name.padEnd(25)} ${x.data_type.padEnd(20)} null=${x.is_nullable}`);

console.log('\n=== organizations columns ===');
const o = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='organizations' AND table_schema='public' ORDER BY ordinal_position`;
for (const x of o) console.log(`  ${x.column_name.padEnd(25)} ${x.data_type}`);

console.log('\n=== parties columns ===');
const p = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='parties' AND table_schema='public' ORDER BY ordinal_position`;
for (const x of p) console.log(`  ${x.column_name.padEnd(25)} ${x.data_type}`);

console.log('\n=== party_members columns ===');
const pm = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='party_members' AND table_schema='public' ORDER BY ordinal_position`;
for (const x of pm) console.log(`  ${x.column_name.padEnd(25)} ${x.data_type}`);
