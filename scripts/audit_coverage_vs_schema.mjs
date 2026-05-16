#!/usr/bin/env node
// =============================================================================
// SC LABS — audit_coverage_vs_schema.mjs (2026-05-15)
//
// Verifica contra la BD prod si los datos coinciden con lo prometido en
// `docs/DB_SCHEMA_FRONTEND.md` (sección 10 — Estado de cobertura).
// Reporta gaps por tabla y por game_version.
//
// Read-only.
// =============================================================================

import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

async function main() {
  // 1. ¿Existe game_versions table?
  try {
    const versions = await sql`
      SELECT version, online, source, notes, created_at
      FROM game_versions
      ORDER BY created_at DESC
      LIMIT 10
    `;
    console.log('═══ game_versions table ═══');
    for (const v of versions) {
      const flag = v.online ? '✓ online' : '   offline';
      console.log(`  ${flag}  ${v.version.padEnd(35)} src=${v.source ?? 'null'}  notes=${v.notes ?? ''}`);
    }
  } catch (e) {
    console.log(`✗ game_versions table NO existe o falló: ${e.message}`);
  }

  // 2. Cobertura por game_version según schema
  const ACTIVE_GV = '4.8.0-live.11825000';
  const OLD_GV = '4.7.2';
  const checks = [
    // (tabla, cobertura esperada)
    ['ships', 615, null],
    ['ship_flight_stats', null, 'scm_speed IS NOT NULL'],
    ['ship_fuel', null, 'hydrogen_capacity IS NOT NULL'],
    ['ship_fuel', null, 'quantum_capacity IS NOT NULL'],
    ['ship_pools', null, "item_type = 'Power' AND max_size > 0"],
    ['ship_pools', null, "item_type = 'Heat' AND max_size > 0"],
    ['ship_hardpoints', null, null],
    ['cargo_grids', null, null],
    ['ship_insurance', null, null],
    ['ship_resistances', null, 'armor_hp IS NOT NULL'],
    ['ship_power_reference', null, 'power_used_grouped_scm IS NOT NULL'],
  ];

  console.log(`\n═══ Cobertura ${ACTIVE_GV} vs ${OLD_GV} ═══`);
  console.log('TABLA / FILTRO'.padEnd(55) + `${ACTIVE_GV}`.padEnd(15) + OLD_GV);
  console.log('-'.repeat(85));
  for (const [table, _, filter] of checks) {
    try {
      const whereNew = filter ? `${filter} AND game_version = $1` : `game_version = $1`;
      const whereOld = filter ? `${filter} AND game_version = $1` : `game_version = $1`;
      const [{ n: newN }] = await sql.unsafe(`SELECT COUNT(*)::int AS n FROM ${table} WHERE ${whereNew}`, [ACTIVE_GV]);
      const [{ n: oldN }] = await sql.unsafe(`SELECT COUNT(*)::int AS n FROM ${table} WHERE ${whereOld}`, [OLD_GV]);
      const label = filter ? `${table} (${filter})` : table;
      const status = newN < oldN * 0.5 ? '⚠ falta mucho' : newN === 0 ? '✗ VACÍO' : '✓';
      console.log(`${label.padEnd(55)}${String(newN).padEnd(15)}${oldN}  ${status}`);
    } catch (e) {
      console.log(`${table.padEnd(55)} ERROR: ${e.message?.slice(0, 60)}`);
    }
  }

  // 3. ¿Cuántas naves tienen hardpoints con loadout_json.Loadout vacío?
  // (Métrica que nos importa para el LoadoutBuilder)
  console.log(`\n═══ Hardpoints con Loadout vacío (necesitan fallback) ═══`);
  const emptyLoadouts = await sql`
    SELECT ship_reference, COUNT(*)::int AS n
    FROM ship_hardpoints
    WHERE game_version = ${ACTIVE_GV}
      AND (
        (hardpoint_type = 'Turret' AND default_item_class LIKE 'Mount_Gimbal%' AND jsonb_array_length(COALESCE((loadout_json->'Loadout')::jsonb, '[]'::jsonb)) = 0)
        OR
        (hardpoint_type = 'MissileLauncher' AND jsonb_array_length(COALESCE((loadout_json->'Loadout')::jsonb, '[]'::jsonb)) = 0)
      )
    GROUP BY ship_reference
    ORDER BY n DESC
    LIMIT 15
  `;
  console.log(`Top ships con loadouts vacíos en 4.8.0 (que se benefician del fallback Loadout.15):`);
  for (const r of emptyLoadouts) {
    console.log(`  ${r.ship_reference.padEnd(40)} ${r.n} hardpoints`);
  }
  const [{ n: totalEmpty }] = await sql`
    SELECT COUNT(*)::int AS n FROM ship_hardpoints
    WHERE game_version = ${ACTIVE_GV}
      AND (
        (hardpoint_type IN ('Turret', 'MissileLauncher')
         AND jsonb_array_length(COALESCE((loadout_json->'Loadout')::jsonb, '[]'::jsonb)) = 0)
      )
  `;
  console.log(`TOTAL hardpoints vacíos en 4.8.0: ${totalEmpty}`);

  // 4. ship_power_reference: cuántas naves tienen power_used_grouped_scm NULL en 4.8.0
  console.log(`\n═══ ship_power_reference: cobertura del Power Grid en 4.8.0 ═══`);
  const [{ n: refTotal }] = await sql`
    SELECT COUNT(*)::int AS n FROM ship_power_reference WHERE game_version = ${ACTIVE_GV}
  `;
  const [{ n: refWithGrouped }] = await sql`
    SELECT COUNT(*)::int AS n FROM ship_power_reference
    WHERE game_version = ${ACTIVE_GV} AND power_used_grouped_scm IS NOT NULL
  `;
  const [{ n: refOldWithGrouped }] = await sql`
    SELECT COUNT(*)::int AS n FROM ship_power_reference
    WHERE game_version = ${OLD_GV} AND power_used_grouped_scm IS NOT NULL
  `;
  console.log(`  Filas totales 4.8.0:                ${refTotal}`);
  console.log(`  Filas con power_used_grouped_scm:   ${refWithGrouped} (4.8.0)`);
  console.log(`  Filas con power_used_grouped_scm:   ${refOldWithGrouped} (4.7.2, disponibles como fallback)`);
  console.log(`  → Naves que se benefician del merge Loadout.16: ${refOldWithGrouped - refWithGrouped}`);

  await sql.end({ timeout: 3 });
}

main().catch((e) => {
  console.error('ERROR:', e?.message ?? e);
  process.exit(1);
});
