#!/usr/bin/env node
// =============================================================================
// SC LABS — diagnose_loadout_48ptu.mjs (2026-05-15)
//
// Diagnóstico del bug "el loadout se rompió con el parche 4.8 PTU".
// Imprime el estado actual de:
//   - ships (cuántos por game_version)
//   - weapon_guns (cuántas filas + sample de class_names)
//   - ship_hardpoints para el Avenger Titan (qué class_names referencia)
//   - intersección: cuáles del ship existen en weapon_guns y cuáles no
//
// Uso:
//   node scripts/diagnose_loadout_48ptu.mjs
//
// Requiere DATABASE_URL en .env. NO modifica nada — solo lee.
// =============================================================================

import 'dotenv/config';
import postgres from 'postgres';

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error('ERROR: DATABASE_URL no está definido en .env');
  process.exit(1);
}

async function main() {
  const sql = postgres(DB_URL, {
    ssl: 'require',
    max: 1,
    idle_timeout: 5,
    connect_timeout: 30,
  });

  try {
    // ── 1. ¿weapon_guns tiene columna game_version? ──
    console.log('\n=== 1. weapon_guns schema ===');
    const wgCols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'weapon_guns'
      ORDER BY ordinal_position
    `;
    const hasGvCol = wgCols.some((c) => c.column_name === 'game_version');
    console.log(
      `  weapon_guns tiene ${wgCols.length} columnas. game_version: ${hasGvCol ? '✓' : '✗ NO EXISTE'}`,
    );
    console.log(`  Columnas: ${wgCols.map((c) => c.column_name).join(', ')}`);

    // ── 2. weapon_guns counts ──
    console.log('\n=== 2. weapon_guns row counts ===');
    const [{ total: wgTotal }] = await sql`SELECT COUNT(*)::int AS total FROM weapon_guns`;
    console.log(`  TOTAL filas en weapon_guns: ${wgTotal}`);
    if (hasGvCol) {
      const wgByGv = await sql`
        SELECT game_version, COUNT(*)::int AS n
        FROM weapon_guns
        GROUP BY game_version
        ORDER BY n DESC
      `;
      console.log('  Por game_version:');
      for (const r of wgByGv) {
        console.log(`    ${r.game_version ?? '(NULL)'}: ${r.n}`);
      }
    }

    // Sample class_names
    const wgSample = await sql`
      SELECT class_name FROM weapon_guns ORDER BY class_name LIMIT 10
    `;
    console.log('  Sample class_names:');
    for (const r of wgSample) console.log(`    - ${r.class_name}`);

    // ── 3. ships counts por game_version ──
    console.log('\n=== 3. ships por game_version ===');
    const shipsByGv = await sql`
      SELECT COALESCE(game_version, '(NULL)') AS gv, COUNT(*)::int AS n
      FROM ships
      GROUP BY gv
      ORDER BY n DESC
    `;
    for (const r of shipsByGv) console.log(`  ${r.gv}: ${r.n}`);

    // ── 4. Aegis Avenger Titan: ¿en qué versions existe? ──
    console.log('\n=== 4. Aegis Avenger Titan ===');
    const titanShips = await sql`
      SELECT id, class_name, name, class_name AS reference, game_version
      FROM ships
      WHERE LOWER(name) LIKE '%avenger titan%' OR LOWER(class_name) LIKE '%avenger_titan%'
      ORDER BY game_version DESC
    `;
    for (const t of titanShips) {
      console.log(
        `  id=${t.id} class=${t.class_name} gv=${t.game_version} ref=${t.reference}`,
      );
    }

    if (titanShips.length === 0) {
      console.log('  ✗ NO se encontró Aegis Avenger Titan en ships!');
      return;
    }

    // ── 5. ship_hardpoints para Titan (la última versión por gv) ──
    const titan = titanShips[0]; // la más reciente
    console.log(`\n=== 5. ship_hardpoints para Titan (${titan.game_version}) ===`);
    let hpRows;
    try {
      hpRows = await sql`
        SELECT hardpoint_name, hardpoint_type, default_item_class, loadout_json,
               game_version
        FROM ship_hardpoints
        WHERE ship_reference = ${titan.reference} AND game_version = ${titan.game_version}
        ORDER BY hardpoint_name
      `;
    } catch (e) {
      hpRows = await sql`
        SELECT hardpoint_name, hardpoint_type, default_item_class, loadout_json
        FROM ship_hardpoints
        WHERE ship_reference = ${titan.reference}
        ORDER BY hardpoint_name
      `;
    }
    console.log(`  ${hpRows.length} hardpoints encontrados`);

    // ── 6. Recolectar TODOS los class_names referenciados por el Titan ──
    console.log('\n=== 6. class_names referenciados (default + loadout_json) ===');
    const referencedClasses = new Set();
    for (const hp of hpRows) {
      if (hp.default_item_class) referencedClasses.add(hp.default_item_class);
      // loadout_json puede ser array o objeto con .Loadout
      let entries = [];
      const lj = hp.loadout_json;
      if (Array.isArray(lj)) entries = lj;
      else if (lj && Array.isArray(lj.Loadout)) entries = lj.Loadout;
      else if (lj && Array.isArray(lj.Children)) entries = lj.Children;
      for (const entry of entries) {
        if (entry?.ClassName) referencedClasses.add(entry.ClassName);
        if (entry?.className) referencedClasses.add(entry.className);
        // Nested
        const nested = Array.isArray(entry?.Loadout)
          ? entry.Loadout
          : Array.isArray(entry?.Children)
            ? entry.Children
            : [];
        for (const c of nested) {
          if (c?.ClassName) referencedClasses.add(c.ClassName);
          if (c?.className) referencedClasses.add(c.className);
        }
      }
    }
    const refArr = Array.from(referencedClasses).filter(Boolean);
    console.log(`  ${refArr.length} class_names únicos referenciados`);
    console.log(`  Sample: ${refArr.slice(0, 15).join(', ')}`);

    // ── 7. ¿Cuáles de esos existen en weapon_guns? ──
    console.log('\n=== 7. Match contra weapon_guns ===');
    if (refArr.length === 0) {
      console.log('  Sin class_names para verificar');
    } else {
      const found = await sql`
        SELECT class_name FROM weapon_guns
        WHERE class_name = ANY(${refArr})
      `;
      const foundSet = new Set(found.map((r) => r.class_name));
      const missing = refArr.filter((c) => !foundSet.has(c));
      console.log(
        `  ✓ EXISTEN en weapon_guns: ${foundSet.size} / ${refArr.length}`,
      );
      console.log(`  ✗ FALTAN en weapon_guns: ${missing.length}`);
      if (missing.length > 0) {
        console.log('  Sample de FALTANTES:');
        for (const m of missing.slice(0, 20)) console.log(`    - ${m}`);
      }
    }

    // ── 8. Match contra TODAS las tablas de componentes ──
    console.log('\n=== 8. Match completo (todas las tablas) ===');
    const tables = [
      { table: 'weapon_guns', col: 'class_name' },
      { table: 'turrets', col: 'class_name' },
      { table: 'shields', col: 'class_name' },
      { table: 'power_plants', col: 'class_name' },
      { table: 'coolers', col: 'class_name' },
      { table: 'quantum_drives', col: 'class_name' },
      { table: 'missile_launchers', col: 'class_name' },
      { table: 'bombs', col: 'class_name' },
      { table: 'radars', col: 'class_name' },
      { table: 'missiles', col: 'name' },
      { table: 'weapon_mining', col: 'class_name' },
      { table: 'weapon_salvage', col: 'class_name' },
    ];
    const allMatched = new Set();
    for (const { table, col } of tables) {
      try {
        const rows = await sql.unsafe(
          `SELECT ${col} AS k FROM ${table} WHERE ${col} = ANY($1::text[])`,
          [refArr],
        );
        if (rows.length > 0) {
          console.log(`  ✓ ${table.padEnd(25)} matches: ${rows.length}`);
          for (const r of rows) allMatched.add(r.k);
        }
      } catch {
        // tabla puede no existir
      }
    }
    const trulyMissing = refArr.filter((c) => !allMatched.has(c));
    console.log(
      `\n  TOTAL matches en algún tabla: ${allMatched.size} / ${refArr.length}`,
    );
    console.log(`  TOTAL faltantes en TODAS las tablas: ${trulyMissing.length}`);
    if (trulyMissing.length > 0 && trulyMissing.length <= 50) {
      console.log('  Lista completa de faltantes:');
      for (const c of trulyMissing) console.log(`    - ${c}`);
    }

    // ── 9. Focus en las weapons que deberían estar dentro de gimbal mounts ──
    console.log('\n=== 9. Children del loadout_json (weapons dentro de gimbals) ===');
    const weaponChildClasses = new Set();
    for (const hp of hpRows) {
      const lj = hp.loadout_json;
      let entries = [];
      if (Array.isArray(lj)) entries = lj;
      else if (lj && Array.isArray(lj.Loadout)) entries = lj.Loadout;
      for (const entry of entries) {
        // Solo nos interesan los children de gimbals (turrets con weapons adentro)
        const isGimbal =
          (entry?.ClassName || '').startsWith('Mount_Gimbal') ||
          (entry?.Type || '').includes('Turret');
        if (!isGimbal) continue;
        const nested = Array.isArray(entry?.Loadout)
          ? entry.Loadout
          : Array.isArray(entry?.Children)
            ? entry.Children
            : [];
        for (const c of nested) {
          if (c?.ClassName) weaponChildClasses.add(c.ClassName);
        }
      }
    }
    const wcArr = Array.from(weaponChildClasses);
    console.log(`  ${wcArr.length} weapon children referenciados desde gimbals`);
    if (wcArr.length > 0) {
      console.log(`  Lista: ${wcArr.join(', ')}`);
      const foundWC = await sql`
        SELECT class_name FROM weapon_guns WHERE class_name = ANY(${wcArr})
      `;
      const foundWCSet = new Set(foundWC.map((r) => r.class_name));
      const missingWC = wcArr.filter((c) => !foundWCSet.has(c));
      console.log(`  ✓ Encontrados en weapon_guns: ${foundWCSet.size}`);
      console.log(`  ✗ FALTAN: ${missingWC.length}`);
      if (missingWC.length > 0) {
        console.log('  Faltantes:');
        for (const m of missingWC) console.log(`    - ${m}`);
      }
    }

    console.log('\n✓ Done.');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error('ERROR:', e?.message ?? e);
  process.exit(1);
});
