import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

console.log('=== TRANSPONDERS columns ===');
const tc = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='transponders' AND table_schema='public'`;
console.log(tc.map(c => `${c.column_name}(${c.data_type})`).join('\n  '));

console.log('\n=== QIG (quantum_interdiction_generators) columns ===');
const qc = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='quantum_interdiction_generators' AND table_schema='public'`;
console.log(qc.map(c => `${c.column_name}(${c.data_type})`).join('\n  '));

console.log('\n=== Sample QIG raw_data (busca range) ===');
const qr = await sql`SELECT class_name, raw_data FROM quantum_interdiction_generators WHERE class_name IS NOT NULL LIMIT 1`;
if (qr[0]?.raw_data) {
  console.log(JSON.stringify(qr[0].raw_data, null, 2).slice(0, 2000));
}

console.log('\n=== Sample transponder raw_data ===');
const tr = await sql`SELECT raw_data FROM transponders LIMIT 1`.catch(() => []);
if (tr[0]?.raw_data) {
  console.log(JSON.stringify(tr[0].raw_data, null, 2).slice(0, 1500));
}

console.log('\n=== ¿Algún campo en cualquier tabla con MaxDetectionRange / ScanRange? ===');
const r = await sql`
  SELECT table_name FROM information_schema.tables WHERE table_schema='public'
`;
let hit = 0;
for (const t of r) {
  try {
    const rd = await sql.unsafe(`SELECT raw_data FROM ${t.table_name} WHERE raw_data::text ILIKE '%detection%' OR raw_data::text ILIKE '%scanrange%' OR raw_data::text ILIKE '%MaxRange%' LIMIT 1`);
    if (rd.length > 0) {
      console.log(`  HIT: ${t.table_name}`);
      const found = JSON.stringify(rd[0].raw_data).match(/[A-Za-z]*[Rr]ange[A-Za-z]*[":\s]*[^,}\]]+/g);
      if (found) console.log('    matches:', found.slice(0, 5).join(' | '));
      hit++;
    }
  } catch {}
}
console.log(`Total tablas con range data en raw_data: ${hit}`);
