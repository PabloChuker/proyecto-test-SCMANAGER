#!/usr/bin/env node
// =============================================================================
// SC LABS — sync_ironclad_pitbull.mjs (2026-05-13)
//
// Sincroniza Drake Ironclad, Ironclad Assault y Pitbull desde el JSON canonical
// `data/rsi_prices_canonical.json` a la BD. Crea filas en `ships` si la nave
// no existe todavía (caso típico: Pitbull recién lanzada, scunpacked aún no
// la indexó). Actualiza `ship_prices_canonical` y `ship_price` con los precios
// del JSON.
//
// Precios actuales (RSI Pledge Store, 2026-05-13):
//   Drake Ironclad         pledge $600, warbond $525 (orig $450/$410)
//   Drake Ironclad Assault pledge $650, warbond $575 (orig $535/$465)
//   Drake Pitbull          pledge  $55, warbond  $50 (nueva, snub fighter)
//
// Uso:
//   node scripts/sync_ironclad_pitbull.mjs
//
// El script lee los valores del JSON canonical. Si los precios cambian de
// nuevo en el futuro, actualizar el JSON y re-correr.
//
// Requisitos: DATABASE_URL en .env, postgres.js + dotenv.
// =============================================================================

import 'dotenv/config';
import postgres from 'postgres';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'data', 'rsi_prices_canonical.json');

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error('ERROR: DATABASE_URL no está definido en .env');
  process.exit(1);
}

// Naves a sincronizar: name del JSON → metadata para crearla en `ships` si no existe
const TARGETS = [
  {
    jsonName: 'Ironclad',
    bdName: 'Drake Ironclad',
    classNameGuesses: ['DRAK_Ironclad', 'Drake_Ironclad', 'DRAKE_Ironclad'],
    flightStatus: 'flight_ready',
    size: 6, // Large
    role: 'Transport',
  },
  {
    jsonName: 'Ironclad Assault',
    bdName: 'Drake Ironclad Assault',
    classNameGuesses: ['DRAK_Ironclad_Assault', 'Drake_Ironclad_Assault', 'DRAKE_Ironclad_Assault'],
    flightStatus: 'flight_ready',
    size: 6,
    role: 'Combat',
  },
  {
    jsonName: 'Pitbull',
    bdName: 'Drake Pitbull',
    classNameGuesses: ['DRAK_Pitbull', 'Drake_Pitbull', 'DRAKE_Pitbull'],
    flightStatus: 'flight_ready',
    size: 1, // Snub
    role: 'Combat',
  },
];

async function main() {
  const raw = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  const sql = postgres(DB_URL, {
    ssl: 'require',
    max: 1,
    idle_timeout: 5,
    connect_timeout: 30,
  });

  try {
    // Drake manufacturer id (necesario para INSERT de naves nuevas)
    const drakeMfr = await sql`
      SELECT id FROM manufacturers
      WHERE LOWER(name) IN ('drake interplanetary', 'drake')
      LIMIT 1
    `;
    const drakeMfrId = drakeMfr[0]?.id ?? null;
    if (!drakeMfrId) {
      console.warn('⚠  No encontré "Drake Interplanetary" en manufacturers. Naves nuevas tendrán manufacturer_id = NULL.');
    } else {
      console.log(`✓ Drake manufacturer_id = ${drakeMfrId}`);
    }

    for (const target of TARGETS) {
      const entry = raw.find((r) => r.name === target.jsonName);
      if (!entry) {
        console.warn(`✗ ${target.jsonName}: no está en el JSON canonical. Skip.`);
        continue;
      }

      console.log(
        `\n→ ${target.bdName}: pledge $${entry.pledge_usd}, warbond $${entry.warbond_usd}`,
      );

      // 1. Buscar si ya existe en `ships` (por class_name guess o por name)
      let shipRow = await sql`
        SELECT id, class_name, name FROM ships
        WHERE LOWER(name) = LOWER(${target.bdName})
           OR class_name = ANY(${target.classNameGuesses})
        LIMIT 1
      `;
      let shipId = shipRow[0]?.id ?? null;

      if (!shipId) {
        // Crear la nave en `ships`
        const inserted = await sql`
          INSERT INTO ships (
            class_name, name, manufacturer_id, flight_status, size, role
          ) VALUES (
            ${target.classNameGuesses[0]}, ${target.bdName}, ${drakeMfrId},
            ${target.flightStatus}, ${target.size}, ${target.role}
          )
          RETURNING id
        `;
        shipId = inserted[0].id;
        console.log(`  ✓ Creado en ships con id ${shipId} y class_name "${target.classNameGuesses[0]}"`);
      } else {
        console.log(`  → Ya existe en ships: id ${shipId}, class_name "${shipRow[0].class_name}"`);
      }

      // 2. UPSERT en ship_prices_canonical (key = ship_name)
      await sql`
        INSERT INTO ship_prices_canonical (
          ship_name, ship_id, manufacturer, career, role, size,
          production_state, pledge_availability,
          pledge_usd, orig_pledge_usd, warbond_usd, orig_warbond_usd,
          loaner, avg_purchase_auec, avg_daily_rental_auec, concept_date,
          synced_at
        ) VALUES (
          ${target.jsonName}, ${shipId}, ${entry.manufacturer ?? 'Drake Interplanetary'},
          ${entry.career ?? null}, ${entry.role ?? null}, ${entry.size ?? null},
          ${entry.production_state ?? null}, ${entry.pledge_availability ?? null},
          ${entry.pledge_usd}, ${entry.orig_pledge_usd ?? entry.pledge_usd},
          ${entry.warbond_usd}, ${entry.orig_warbond_usd ?? entry.warbond_usd},
          null, null, null, null,
          NOW()
        )
        ON CONFLICT (ship_name) DO UPDATE SET
          ship_id              = EXCLUDED.ship_id,
          pledge_usd           = EXCLUDED.pledge_usd,
          orig_pledge_usd      = EXCLUDED.orig_pledge_usd,
          warbond_usd          = EXCLUDED.warbond_usd,
          orig_warbond_usd     = EXCLUDED.orig_warbond_usd,
          pledge_availability  = EXCLUDED.pledge_availability,
          production_state     = EXCLUDED.production_state,
          synced_at            = NOW()
      `;
      console.log(`  ✓ ship_prices_canonical seteado`);

      // 3. UPSERT en ship_price para coherencia con el resto de la app.
      // (Después del fix CCU.25 el wiki canonical gana por prioridad en el
      // COALESCE, pero igual mantenemos ship_price sync para fallbacks.)
      await sql`
        INSERT INTO ship_price (id, msrp_usd, warbond_usd, is_ccu_eligible, is_limited)
        VALUES (
          ${shipId}, ${entry.pledge_usd}, ${entry.warbond_usd}, true, false
        )
        ON CONFLICT (id) DO UPDATE SET
          msrp_usd    = EXCLUDED.msrp_usd,
          warbond_usd = EXCLUDED.warbond_usd
      `;
      console.log(`  ✓ ship_price seteado a msrp=$${entry.pledge_usd}, warbond=$${entry.warbond_usd}`);
    }

    console.log('\n✓ Done. Hacer hard refresh del dropdown en /hangar/chain-board.');
    console.log('   Si las naves no aparecen aún, esperar 5min al cache CDN o forzar redeploy en Vercel.');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error('ERROR:', e?.message ?? e);
  process.exit(1);
});
