import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });
const NEW = '4.8.0-live.11825000';

console.log('=== Vanguard variants en 4.8.0 ===');
const v = await sql`SELECT class_name, name FROM ships WHERE class_name ILIKE '%vanguard%' AND game_version = ${NEW}`;
for (const r of v) console.log(`  ${r.class_name.padEnd(30)} ${r.name}`);

console.log('\n=== Reclaimer en 4.8.0 ===');
const r = await sql`SELECT class_name, name FROM ships WHERE class_name ILIKE '%reclaimer%' AND game_version = ${NEW}`;
for (const x of r) console.log(`  ${x.class_name.padEnd(30)} ${x.name}`);

console.log('\n=== Liberator en 4.8.0 ===');
const l = await sql`SELECT class_name, name FROM ships WHERE class_name ILIKE '%liberator%' AND game_version = ${NEW}`;
for (const x of l) console.log(`  ${x.class_name.padEnd(30)} ${x.name}`);

console.log('\n=== Cuántas naves de 4.8.0 NO tienen contraparte en 4.7.2 (no se hidrataron) ===');
const orphans = await sql`
  SELECT COUNT(*)::int AS n
  FROM ships s
  WHERE s.game_version = ${NEW}
    AND NOT EXISTS (SELECT 1 FROM ships s2 WHERE s2.id = s.id AND s2.game_version = '4.7.2')
`;
console.log(`  ${orphans[0].n} naves`);

const sample = await sql`
  SELECT s.class_name, s.name
  FROM ships s
  WHERE s.game_version = ${NEW}
    AND NOT EXISTS (SELECT 1 FROM ships s2 WHERE s2.id = s.id AND s2.game_version = '4.7.2')
  ORDER BY s.class_name
  LIMIT 25
`;
console.log(`  Sample:`);
for (const x of sample) console.log(`    ${x.class_name.padEnd(35)} ${x.name}`);

await sql.end({ timeout: 3 });
