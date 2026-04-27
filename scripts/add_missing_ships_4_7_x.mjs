#!/usr/bin/env node
// =============================================================================
// SC LABS — add_missing_ships_4_7_x.mjs
//
// CONTEXTO (2026-04-26):
//
// La BD `ships` se llenó con un ingest de scunpacked 4.7.0. Naves que CIG
// agregó en parches posteriores (4.7.1, 4.7.2) no están — y por eso el CCU
// Chain Calculator no las puede usar como destino ni como step intermedio.
//
// Caso reportado por Pablo: Hull B salió en 4.7.1 con MSRP $280. La BD no
// la tiene → cuando el algoritmo busca cadena RAFT → Starlancer TAC, no
// puede pasar por Hull B (que sería un buen step intermedio) porque la
// nave no existe.
//
// Esto NO debería seguir siendo manual a largo plazo — el orquestador
// `ingest_game_version.mjs` (item 8 del roadmap del docs/architecture/
// data-audit) lo hace automáticamente al cambiar de patch. Mientras eso
// no exista, este script sirve de stop-gap para insertar las naves nuevas
// puntualmente.
//
// QUÉ HACE:
//   - Para cada nave de la lista MISSING_SHIPS, verifica si ya existe en
//     `ships` (match exacto por name).
//   - Si no existe, INSERT en ships + ship_price (con warbond opcional).
//   - Si existe pero el msrp/warbond difieren, NO sobrescribe (usá
//     sync_ship_price_from_wiki.mjs --force-apply para eso).
//
// USO:
//   node scripts/add_missing_ships_4_7_x.mjs                # dry-run
//   node scripts/add_missing_ships_4_7_x.mjs --apply        # escribe
//
// Requiere DATABASE_URL o DIRECT_URL en .env.
// =============================================================================

import postgres from "postgres";
import { randomUUID } from "node:crypto";
import "dotenv/config";

const APPLY = process.argv.includes("--apply");

const connectionString = process.env.DATABASE_URL ?? process.env.DIRECT_URL ?? "";
if (!connectionString) {
  console.error("ERROR: No DATABASE_URL ni DIRECT_URL en .env");
  process.exit(1);
}

const sql = postgres(connectionString, { max: 5, idle_timeout: 20, connect_timeout: 10 });

// =============================================================================
// LISTA DE NAVES A AGREGAR
//
// Cuando confirmes nuevas naves de versiones futuras de SC, sumá entries acá
// y re-corré el script.
//
// REQUERIDOS por entry:
//   name           → nombre completo CON manufacturer prefix
//                    (ej. "MISC Hull B", NO "Hull B")
//   manufacturer   → nombre que matchea exactamente con la fila en
//                    `manufacturers` (ej. "MISC", "Drake", "Aegis Dynamics")
//   msrp_usd       → precio standalone en USD
//
// OPCIONALES:
//   warbond_usd    → precio warbond actual (si existe en RSI Pledge Store)
//   class_name     → reference técnica de scunpacked (puede ser null)
//   flight_status  → 'flight_ready' (default) | 'concept' | 'in_development'
//   size           → 1=small, 2=medium, 3=large, 4=capital
//   role           → texto libre (ej. 'Cargo', 'Freight')
//   game_version   → patch en que se agregó (default DEFAULT_GAME_VERSION)
// =============================================================================

// Default game_version para inserts nuevos. Cambialo si Pablo está en otro
// patch — `ships` tiene game_version NOT NULL.
const DEFAULT_GAME_VERSION = "4.7.2";
const MISSING_SHIPS = [
  // ── 4.7.1 — Hull B reworkeada ───────────────────────────────────────────
  {
    name: "MISC Hull B",
    manufacturer: "Musashi Industrial & Starflight Concern",
    class_name: "MISC_Hull_B",
    flight_status: "flight_ready",
    size: 2,
    role: "Cargo / Freight",
    msrp_usd: 280,
    warbond_usd: 260,
  },

  // ── Concept ships con precio en RSI pero faltantes ──────────────────────
  // Aegis Vulcan — multi-role support, en venta como concept con precio fijo
  {
    name: "Aegis Vulcan",
    manufacturer: "Aegis Dynamics",
    class_name: "AEGS_Vulcan",
    flight_status: "concept",
    size: 2,
    role: "Repair / Refuel",
    msrp_usd: 240,
    warbond_usd: 220,
  },

  // MISC Endeavor — variants concept (precio base)
  {
    name: "MISC Endeavor",
    manufacturer: "Musashi Industrial & Starflight Concern",
    class_name: "MISC_Endeavor",
    flight_status: "concept",
    size: 4,
    role: "Science / Research",
    msrp_usd: 350,
    // sin warbond conocido
  },

  // Origin G12 (vehicles, no naves — pero aparecen en CCU paths a veces)
  {
    name: "Origin G12",
    manufacturer: "Origin Jumpworks",
    class_name: "ORIG_G12",
    flight_status: "concept",
    size: 1,
    role: "Ground vehicle",
    msrp_usd: 30,
  },
  {
    name: "Origin G12a",
    manufacturer: "Origin Jumpworks",
    class_name: "ORIG_G12a",
    flight_status: "concept",
    size: 1,
    role: "Ground vehicle (combat)",
    msrp_usd: 40,
  },
  {
    name: "Origin G12r",
    manufacturer: "Origin Jumpworks",
    class_name: "ORIG_G12r",
    flight_status: "concept",
    size: 1,
    role: "Ground vehicle (racing)",
    msrp_usd: 40,
  },
];

async function findManufacturerId(name) {
  const rows = await sql`
    SELECT id FROM manufacturers
    WHERE name = ${name} OR name ILIKE ${name}
    LIMIT 1
  `;
  return rows[0]?.id ?? null;
}

async function shipExists(name) {
  const rows = await sql`
    SELECT id FROM ships WHERE name = ${name} LIMIT 1
  `;
  return rows[0]?.id ?? null;
}

async function main() {
  console.log("=== add_missing_ships_4_7_x ===");
  console.log(`Modo: ${APPLY ? "APPLY" : "DRY-RUN"}`);
  console.log("");

  try {
    let inserted = 0;
    let skipped = 0;
    let manufacturerErrors = 0;

    for (const ship of MISSING_SHIPS) {
      const existingId = await shipExists(ship.name);
      if (existingId) {
        console.log(`  = ${ship.name.padEnd(40)} ya existe (id=${existingId})`);
        skipped++;
        continue;
      }

      const mfrId = await findManufacturerId(ship.manufacturer);
      if (!mfrId) {
        console.log(`  ! ${ship.name.padEnd(40)} manufacturer "${ship.manufacturer}" NO ENCONTRADO`);
        manufacturerErrors++;
        continue;
      }

      console.log(
        `  + ${ship.name.padEnd(40)} ` +
        `MSRP=$${ship.msrp_usd}` +
        (ship.warbond_usd ? ` WB=$${ship.warbond_usd}` : "") +
        ` flight=${ship.flight_status ?? "flight_ready"}`,
      );

      if (APPLY) {
        const newId = randomUUID();
        try {
          // 1. Insert en ships. game_version es NOT NULL en la BD así que
          // siempre seteamos un valor (sea el de la entry o el default).
          await sql`
            INSERT INTO ships (
              id, class_name, name, manufacturer_id,
              flight_status, size, role, game_version
            ) VALUES (
              ${newId}::uuid,
              ${ship.class_name ?? null},
              ${ship.name},
              ${mfrId}::uuid,
              ${ship.flight_status ?? "flight_ready"},
              ${ship.size ?? null},
              ${ship.role ?? null},
              ${ship.game_version ?? DEFAULT_GAME_VERSION}
            )
          `;

          // 2. Insert en ship_price
          await sql`
            INSERT INTO ship_price (
              id, msrp_usd, warbond_usd, is_ccu_eligible, is_limited
            ) VALUES (
              ${newId}::uuid,
              ${ship.msrp_usd},
              ${ship.warbond_usd ?? null},
              true,
              false
            )
          `;
          inserted++;
        } catch (err) {
          console.error(`     ! falló insert: ${err.message}`);
        }
      }
    }

    console.log("");
    console.log("Resumen:");
    console.log(`  ${APPLY ? "Insertadas" : "A insertar"}: ${inserted || (MISSING_SHIPS.length - skipped - manufacturerErrors)}`);
    console.log(`  Ya existían:                ${skipped}`);
    console.log(`  Errores de manufacturer:    ${manufacturerErrors}`);

    if (manufacturerErrors > 0) {
      console.log("");
      console.log("Tip: si un manufacturer no se encuentra, hacé:");
      console.log("  SELECT name FROM manufacturers ORDER BY name;");
      console.log("para ver los nombres exactos en BD y ajustar la lista.");
    }

    if (!APPLY) {
      console.log("");
      console.log("Dry-run: usá --apply para escribir.");
    }
  } catch (err) {
    console.error("FATAL:", err);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

main();
