#!/usr/bin/env node
// =============================================================================
// SC LABS — audit_game_version_columns.mjs
//
// Recorre todas las tablas de Supabase (schema public), detecta cuáles
// tienen una columna `game_version`, y para cada una muestra:
//   - cantidad total de filas
//   - distribución por valor de game_version (top 10)
//
// Útil para saber qué tablas el toggle LIVE/PTU del header puede usar para
// filtrar resultados, y qué tablas NO están versionadas todavía (esas
// devuelven los mismos datos en LIVE y PTU — el extractor de Garnok va a
// ir versionándolas progresivamente).
//
// USO:  node scripts/audit_game_version_columns.mjs
//
// Requiere DATABASE_URL o DIRECT_URL en .env.
// =============================================================================

import postgres from "postgres";
import "dotenv/config";

const connectionString = process.env.DATABASE_URL ?? process.env.DIRECT_URL ?? "";
if (!connectionString) {
  console.error("ERROR: No DATABASE_URL ni DIRECT_URL en .env");
  process.exit(1);
}

const sql = postgres(connectionString, { max: 5, idle_timeout: 20, connect_timeout: 10 });

async function main() {
  console.log("=== audit_game_version_columns ===\n");

  try {
    // 1. Listar todas las tablas + cuáles tienen columna game_version
    const tablesWithGV = await sql`
      SELECT
        c.table_name,
        c.data_type,
        c.is_nullable,
        c.column_default
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.column_name  = 'game_version'
      ORDER BY c.table_name
    `;

    console.log(`Tablas CON columna game_version: ${tablesWithGV.length}\n`);

    if (tablesWithGV.length === 0) {
      console.log("(ninguna tabla tiene game_version — el toggle no puede filtrar nada)");
    }

    const versioned = [];
    for (const t of tablesWithGV) {
      console.log(`─── ${t.table_name} ───`);
      console.log(`  type: ${t.data_type}, nullable: ${t.is_nullable}, default: ${t.column_default ?? "(none)"}`);

      // Contar filas totales y por game_version
      try {
        const totalRow = await sql.unsafe(
          `SELECT COUNT(*)::int AS n FROM ${t.table_name}`,
          [],
        );
        const total = totalRow[0]?.n ?? 0;
        console.log(`  total rows: ${total}`);

        const dist = await sql.unsafe(
          `SELECT game_version, COUNT(*)::int AS n
             FROM ${t.table_name}
             GROUP BY game_version
             ORDER BY n DESC
             LIMIT 10`,
          [],
        );
        console.log(`  distribución por game_version (top 10):`);
        for (const d of dist) {
          const pct = total > 0 ? ((d.n / total) * 100).toFixed(1) : "0";
          console.log(`    ${String(d.game_version ?? "(NULL)").padEnd(36)} ${String(d.n).padStart(6)}  (${pct}%)`);
        }
        versioned.push({ name: t.table_name, total, distinct: dist.length });
      } catch (err) {
        console.log(`  ✗ no pude leer la tabla: ${err.message}`);
      }
      console.log("");
    }

    // 2. Listar las tablas que NO tienen game_version (potencialmente afectadas
    //    por cambios de versión pero sin columna para distinguir).
    const allPublicTables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;
    const versionedNames = new Set(tablesWithGV.map((t) => t.table_name));
    const unversioned = allPublicTables
      .map((r) => r.table_name)
      .filter((n) => !versionedNames.has(n));

    console.log(`─── Tablas SIN game_version: ${unversioned.length} ───`);
    console.log("(estas devuelven los mismos datos en LIVE y PTU — el extractor");
    console.log("de Garnok va a ir versionándolas progresivamente)\n");

    // Categorizar visualmente
    const PROBABLE_GAME = /ship|weapon|shield|cooler|power|quantum|missile|bomb|armor|paint|cargo|hardpoint|component|item/i;
    const PROBABLE_USER = /^(profile|friendship|party|org|wishlist|hangar|notification|referral|activity|trade|mining)/i;
    const LOOKUP = /^(manufacturer|trade_commodit|trade_terminal|commodity|crafting|loaner)/i;

    const groups = { game: [], user: [], lookup: [], other: [] };
    for (const name of unversioned) {
      if (PROBABLE_GAME.test(name)) groups.game.push(name);
      else if (PROBABLE_USER.test(name)) groups.user.push(name);
      else if (LOOKUP.test(name)) groups.lookup.push(name);
      else groups.other.push(name);
    }

    if (groups.game.length > 0) {
      console.log(`  CATÁLOGO DE JUEGO (deberían tener game_version, pero NO):`);
      groups.game.forEach((n) => console.log(`    ⚠ ${n}`));
      console.log("");
    }
    if (groups.user.length > 0) {
      console.log(`  USUARIO / SOCIAL (no necesitan game_version — ignorar):`);
      groups.user.forEach((n) => console.log(`    · ${n}`));
      console.log("");
    }
    if (groups.lookup.length > 0) {
      console.log(`  LOOKUP / EXTERNOS (commodities, manufacturers — no aplica):`);
      groups.lookup.forEach((n) => console.log(`    · ${n}`));
      console.log("");
    }
    if (groups.other.length > 0) {
      console.log(`  OTROS (revisar manualmente):`);
      groups.other.forEach((n) => console.log(`    ? ${n}`));
      console.log("");
    }

    // 3. Resumen
    console.log("═══ RESUMEN ═══");
    console.log(`  Tablas versionadas:      ${versioned.length}`);
    console.log(`  Catálogo SIN versionar:  ${groups.game.length} (gap potencial)`);
    console.log(`  Usuario / Social:        ${groups.user.length} (no aplica versionar)`);
    console.log(`  Lookup / externo:        ${groups.lookup.length} (no aplica)`);
    console.log(`  Otros (revisar):         ${groups.other.length}`);
    console.log("");
    console.log("Próximo paso: para cada tabla versionada, los endpoints que la");
    console.log("consumen deben leer ?gv= del query y filtrar WHERE game_version = $1.");
    console.log("Para las que están en 'CATÁLOGO SIN versionar', coordinar con");
    console.log("Garnok para agregar la columna en la próxima ronda.");
  } catch (err) {
    console.error("FATAL:", err);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

main();
