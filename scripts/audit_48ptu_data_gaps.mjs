#!/usr/bin/env node
// =============================================================================
// SC LABS — audit_48ptu_data_gaps.mjs (2026-05-15)
//
// Audita qué tablas tienen data para 4.8.0 PTU vs 4.7.2 (la "completa").
// Para cada tabla con game_version, compara el count y avisa gaps.
// Después se enfoca en el Aegis Avenger Titan: verifica qué componentes
// hereda del fallback vs qué están en 4.8.0.
//
// Read-only, NO modifica nada.
// =============================================================================

import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });
const NEW_GV = '4.8.0-live.11825000';
const OLD_GV = '4.7.2';

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`AUDIT: tablas con game_version, comparando ${NEW_GV} vs ${OLD_GV}`);
  console.log('═══════════════════════════════════════════════════════════');

  // 1. Listar todas las tablas con columna game_version
  const tablesWithGv = await sql`
    SELECT table_name FROM information_schema.columns
    WHERE column_name = 'game_version' AND table_schema = 'public'
    ORDER BY table_name
  `;
  console.log(`\nTablas con columna game_version: ${tablesWithGv.length}\n`);
  console.log(
    'TABLA'.padEnd(35) +
      OLD_GV.padEnd(15) +
      NEW_GV.padEnd(30) +
      'Δ (gap)'
  );
  console.log('-'.repeat(95));

  const gaps = [];
  for (const { table_name } of tablesWithGv) {
    try {
      const byGv = await sql.unsafe(
        `SELECT game_version, COUNT(*)::int AS n FROM ${table_name} GROUP BY game_version`,
      );
      const counts = new Map(byGv.map((r) => [r.game_version, r.n]));
      const oldN = counts.get(OLD_GV) ?? 0;
      const newN = counts.get(NEW_GV) ?? 0;
      const delta = newN - oldN;
      const status = newN === 0 ? '✗ VACÍA' : delta < -10 ? '⚠ menos' : '✓';
      console.log(
        table_name.padEnd(35) +
          String(oldN).padEnd(15) +
          String(newN).padEnd(30) +
          `${delta >= 0 ? '+' : ''}${delta}  ${status}`,
      );
      if (newN === 0 && oldN > 0) {
        gaps.push({ table: table_name, oldN, missing: oldN });
      } else if (oldN > 0 && delta < -10) {
        gaps.push({ table: table_name, oldN, newN, missing: -delta });
      }
    } catch (e) {
      console.log(`${table_name.padEnd(35)} ERROR: ${e.message}`);
    }
  }

  if (gaps.length > 0) {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('GAPS CRÍTICOS — tablas que necesitan reimport para 4.8.0:');
    console.log('═══════════════════════════════════════════════════════════');
    for (const g of gaps) {
      console.log(
        `  ✗ ${g.table}: falta ${g.missing} filas (4.7.2 tenía ${g.oldN}, 4.8.0 tiene ${g.newN ?? 0})`,
      );
    }
  }

  // 2. Componentes específicos del Avenger Titan en 4.8.0
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('AVENGER TITAN — Componentes referenciados en 4.8.0 y su estado');
  console.log('═══════════════════════════════════════════════════════════');

  const hpRows = await sql`
    SELECT default_item_class
    FROM ship_hardpoints
    WHERE ship_reference = 'AEGS_Avenger_Titan'
      AND game_version = ${NEW_GV}
      AND default_item_class IS NOT NULL
  `;
  const classNames = [...new Set(hpRows.map((r) => r.default_item_class))];
  console.log(`\n${classNames.length} default_item_class únicos referenciados.\n`);

  // Tablas de componentes que pueden tener game_version
  const componentTables = [
    'weapon_guns',
    'turrets',
    'shields',
    'power_plants',
    'coolers',
    'quantum_drives',
    'jump_drives',
    'missile_launchers',
    'bombs',
    'radars',
    'missiles',
    'weapon_mining',
    'weapon_salvage',
    'weapon_defensives',
    'flight_controllers',
    'life_support_generators',
    'containers',
    'paints',
    'transponders',
    'self_destruct_systems',
    'fuel_tanks',
    'fuel_intakes',
    'main_thrusters',
    'manneuver_thrusters',
    'quantum_fuel_tanks',
    'quantum_interdiction_generators',
    'scanners',
    'armors',
    'emps',
    'cargo_grids',
    'weapon_attachments',
  ];

  for (const table of componentTables) {
    try {
      // Verificar si la tabla existe y tiene game_version
      const hasGv = tablesWithGv.find((t) => t.table_name === table);
      const colName = table === 'missiles' ? 'name' : 'class_name';

      // Match en 4.8.0
      let foundIn48 = 0;
      if (hasGv) {
        try {
          const rs = await sql.unsafe(
            `SELECT COUNT(*)::int AS n FROM ${table} WHERE ${colName} = ANY($1::text[]) AND game_version = $2`,
            [classNames, NEW_GV],
          );
          foundIn48 = rs[0]?.n ?? 0;
        } catch {}
      }

      // Match en 4.7.2 (fallback)
      let foundIn472 = 0;
      try {
        const rs = await sql.unsafe(
          hasGv
            ? `SELECT COUNT(*)::int AS n FROM ${table} WHERE ${colName} = ANY($1::text[]) AND game_version = $2`
            : `SELECT COUNT(*)::int AS n FROM ${table} WHERE ${colName} = ANY($1::text[])`,
          hasGv ? [classNames, OLD_GV] : [classNames],
        );
        foundIn472 = rs[0]?.n ?? 0;
      } catch {}

      if (foundIn48 === 0 && foundIn472 > 0) {
        console.log(
          `  ⚠ ${table.padEnd(30)} 4.8.0: ${foundIn48}  /  4.7.2: ${foundIn472}  → necesita reimport para 4.8.0`,
        );
      } else if (foundIn48 > 0) {
        console.log(
          `  ✓ ${table.padEnd(30)} 4.8.0: ${foundIn48}  /  4.7.2: ${foundIn472}`,
        );
      }
    } catch {}
  }

  // 3. Ship-level data (flight dynamics): aceleraciones, masa, etc.
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('SHIP-LEVEL flight dynamics fields para Avenger Titan');
  console.log('═══════════════════════════════════════════════════════════');

  const shipCols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'ships' AND column_name SIMILAR TO
      '(scm%|nav%|boost%|accel%|pitch%|yaw%|roll%|mass|hp%|cargo%|h2|qt%)'
    ORDER BY column_name
  `;
  const fieldNames = shipCols.map((c) => c.column_name);

  const titan48 = await sql.unsafe(
    `SELECT ${fieldNames.map((f) => `"${f}"`).join(', ')}
     FROM ships
     WHERE class_name = 'AEGS_Avenger_Titan' AND game_version = $1
     LIMIT 1`,
    [NEW_GV],
  );
  const titan472 = await sql.unsafe(
    `SELECT ${fieldNames.map((f) => `"${f}"`).join(', ')}
     FROM ships
     WHERE class_name = 'AEGS_Avenger_Titan' AND game_version = $1
     LIMIT 1`,
    [OLD_GV],
  );

  if (titan48.length === 0) {
    console.log('  ✗ Titan NO existe en ships para 4.8.0');
  } else {
    const t48 = titan48[0];
    const t472 = titan472[0] ?? {};
    console.log(`\n  ${'FIELD'.padEnd(30)} ${'4.8.0'.padEnd(15)} ${'4.7.2'.padEnd(15)} STATUS`);
    console.log('  ' + '-'.repeat(75));
    let missingIn48 = 0;
    for (const f of fieldNames) {
      const v48 = t48[f];
      const v472 = t472[f];
      const isMissing48 = v48 == null || v48 === 0 || v48 === '';
      const has472 = v472 != null && v472 !== 0 && v472 !== '';
      const status = isMissing48 && has472 ? '✗ falta' : isMissing48 ? '·' : '✓';
      if (isMissing48 && has472) missingIn48++;
      console.log(
        `  ${f.padEnd(30)} ${String(v48 ?? 'NULL').padEnd(15)} ${String(v472 ?? 'NULL').padEnd(15)} ${status}`,
      );
    }
    console.log(`\n  TOTAL fields que faltan en 4.8.0 pero tiene 4.7.2: ${missingIn48}`);
  }

  await sql.end({ timeout: 3 });
}

main().catch((e) => {
  console.error('ERROR:', e?.message ?? e);
  process.exit(1);
});
