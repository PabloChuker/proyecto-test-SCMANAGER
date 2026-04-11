// =============================================================================
// SC LABS — seed-glb-keys.mjs
//
// Lee el directorio real de archivos GLB y popula la columna `ships.glb_key`
// para todas las naves cuyo `reference` matchea un archivo GLB.
//
// PREREQUISITO:
//   1. Haber corrido scripts/sql/add_glb_key_to_ships.sql una vez
//   2. Tener DATABASE_URL en .env apuntando a Supabase
//
// USO:
//   cd al-filo-platform
//   node --env-file=.env scripts/seed-glb-keys.mjs
//
// OPCIONES:
//   --dry-run    Solo imprime lo que haría, no ejecuta el UPDATE
//   --glb-dir    Path al directorio de GLBs (default: Modulos 3d/GLB)
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const glbDirArg = args.find((a) => a.startsWith("--glb-dir="));
const glbDir = glbDirArg
  ? glbDirArg.split("=")[1]
  : path.join(process.cwd(), "Modulos 3d", "GLB");

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL no está definido. Usá --env-file=.env");
  process.exit(1);
}

if (!fs.existsSync(glbDir)) {
  console.error(`❌ No existe el directorio de GLBs: ${glbDir}`);
  process.exit(1);
}

// 1) Extraer keys de los archivos GLB
const files = fs.readdirSync(glbDir).filter((f) => f.endsWith(".glb"));
const keys = files
  .map((f) => f.replace(/^EntityClassDefinition\./, "").replace(/\.glb$/, ""))
  .sort();

console.log(`📦 Encontré ${files.length} archivos GLB en ${glbDir}`);

if (keys.length === 0) {
  console.error("❌ No hay archivos GLB. Abortando.");
  process.exit(1);
}

// 2) Conectar a Postgres
const sql = postgres(process.env.DATABASE_URL, { prepare: false });

try {
  // 3) Verificar que la columna existe
  const col = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'ships' AND column_name = 'glb_key'
  `;
  if (col.length === 0) {
    console.error("❌ La columna ships.glb_key no existe.");
    console.error("   Corré primero: scripts/sql/add_glb_key_to_ships.sql");
    process.exit(1);
  }

  // 4) Verificar cuántas keys matchean con ships.reference
  const matches = await sql`
    SELECT reference, name
    FROM ships
    WHERE reference = ANY(${keys})
    ORDER BY reference
  `;

  const matchedRefs = new Set(matches.map((r) => r.reference));
  const unmatched = keys.filter((k) => !matchedRefs.has(k));

  console.log(`✅ Match exacto: ${matches.length} / ${keys.length}`);
  console.log(`⚠️  GLBs sin fila en DB: ${unmatched.length}`);
  if (unmatched.length > 0 && unmatched.length < 30) {
    unmatched.forEach((k) => console.log(`   - ${k}`));
  }

  if (dryRun) {
    console.log("\n🚫 --dry-run: no se ejecuta el UPDATE");
    await sql.end();
    process.exit(0);
  }

  // 5) UPDATE ships SET glb_key = reference para todas las que matchean
  const result = await sql`
    UPDATE ships
    SET glb_key = reference
    WHERE reference = ANY(${keys})
      AND (glb_key IS NULL OR glb_key <> reference)
  `;

  console.log(`\n✨ Actualizadas ${result.count} filas.`);

  // 6) Report final
  const totals = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(glb_key)::int AS with_glb
    FROM ships
  `;
  console.log(`📊 ships con glb_key: ${totals[0].with_glb} / ${totals[0].total}`);

  await sql.end();
  process.exit(0);
} catch (err) {
  console.error("❌ Error:", err);
  await sql.end().catch(() => {});
  process.exit(1);
}
