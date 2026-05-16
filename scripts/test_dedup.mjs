import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

const online = ['4.8.0-live.11825000', 'CONCEPT'];

// Sin filtro online en CTE (BUG): primero dedup global, después filtro
const r1 = await sql`
  WITH deduped AS (
    SELECT *,
      ROW_NUMBER() OVER (PARTITION BY LOWER(name), manufacturer_id::text ORDER BY id ASC) AS rn
    FROM ships
  )
  SELECT COUNT(*)::int as n FROM deduped WHERE rn = 1 AND game_version = ANY(${online}::text[])
`;
console.log('Comportamiento BUG (filtro post-CTE):', r1[0].n);

// CON filtro online dentro del CTE (FIX)
const r2 = await sql`
  WITH deduped AS (
    SELECT *,
      ROW_NUMBER() OVER (PARTITION BY LOWER(name), manufacturer_id::text ORDER BY id ASC) AS rn
    FROM ships
    WHERE game_version = ANY(${online}::text[])
  )
  SELECT COUNT(*)::int as n FROM deduped WHERE rn = 1
`;
console.log('Comportamiento FIX (filtro IN CTE):', r2[0].n);

// Spot check: ¿qué naves clave vuelven?
const r3 = await sql`
  WITH deduped AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY LOWER(name), manufacturer_id::text ORDER BY id ASC) AS rn
    FROM ships WHERE game_version = ANY(${online}::text[])
  )
  SELECT name, class_name, game_version FROM deduped WHERE rn=1 AND name ~* 'Avenger Titan|Cutlass Black|Reclaimer|Carrack|Constellation Andromeda|Hornet F7|Eclipse|Aurora MR|Mole|Nova|Hull B|Spartan'
  ORDER BY name
`;
console.log('\nNaves clave presentes con fix:');
for (const s of r3) console.log(`  ${s.name.padEnd(35)} ${s.class_name.padEnd(35)} gv=${s.game_version}`);

await sql.end({ timeout: 3 });
