#!/usr/bin/env node
// =============================================================================
// SC LABS — restore_msrp_pre_force_apply.mjs
//
// REVERTIR los 49 precios que `sync_ship_price_from_wiki.mjs --force-apply`
// pisó el 2026-04-26 con valores viejos del WIKI_PRICES. La BD tenía precios
// actualizados (Polaris $975, Idris-M $1500, Perseus $800, etc.) y el script
// los reemplazó con valores de un wiki desactualizado.
//
// Esta lista viene del output de PowerShell de Pablo donde figura `cur=$X`
// para cada drift detectado. `cur` es el valor que la BD tenía ANTES del
// --force-apply, así que ese es el que queremos restaurar.
//
// USO:
//   node scripts/restore_msrp_pre_force_apply.mjs                # dry-run
//   node scripts/restore_msrp_pre_force_apply.mjs --apply        # escribe
//
// Requiere DATABASE_URL o DIRECT_URL en .env.
// =============================================================================

import postgres from "postgres";
import "dotenv/config";

const APPLY = process.argv.includes("--apply");

const connectionString = process.env.DATABASE_URL ?? process.env.DIRECT_URL ?? "";
if (!connectionString) {
  console.error("ERROR: No DATABASE_URL ni DIRECT_URL en .env");
  process.exit(1);
}

const sql = postgres(connectionString, { max: 5, idle_timeout: 20, connect_timeout: 10 });

// Snapshot pre-force-apply (output del 2026-04-26 de Pablo).
// Match por nombre exacto de `ships.name`. Sólo restauramos las naves cuyo
// precio pre-force-apply era distinto al wiki.
const RESTORE = [
  { name: "Aegis Idris-M",                       msrp: 1500 },
  { name: "Aegis Idris-P",                       msrp: 1900 },
  { name: "Aegis Redeemer",                      msrp: 330 },
  { name: "Aegis Retaliator",                    msrp: 175 },
  { name: "Aegis Sabre",                         msrp: 175 },
  { name: "Aegis Sabre Raven",                   msrp: 170 },
  { name: "Anvil Ballista Dunestalker",          msrp: 140 },
  { name: "Anvil Ballista Snowblind",            msrp: 140 },
  { name: "Anvil F7A Hornet Mk II",              msrp: 175 },
  { name: "Anvil F7C Hornet Mk II",              msrp: 175 },
  { name: "Anvil Terrapin Medic",                msrp: 220 },
  { name: "Aopoa San'tok.yāi",                   msrp: 240 },
  { name: "Argo CSV-SM",                         msrp: 45 },
  { name: "Argo RAFT",                           msrp: 190 },
  { name: "Argo SRV",                            msrp: 165 },
  { name: "Consolidated Outland Pioneer",        msrp: 925 },
  { name: "Crusader A1 Spirit",                  msrp: 200 },
  { name: "Crusader Intrepid",                   msrp: 65 },
  { name: "Mirai Razor EX",                      msrp: 155 },
  { name: "Mirai Razor LX",                      msrp: 150 },
  { name: "MISC Fortune",                        msrp: 175 },
  { name: "MISC Starlancer MAX",                 msrp: 250 },
  { name: "MISC Starlancer TAC",                 msrp: 375 },
  { name: "Origin X1",                           msrp: 45 },
  { name: "Origin X1 Force",                     msrp: 55 },
  { name: "Origin X1 Velocity",                  msrp: 50 },
  { name: "RSI Apollo Medivac",                  msrp: 290 },
  { name: "RSI Apollo Triage",                   msrp: 260 },
  { name: "RSI Constellation Aquila",            msrp: 315 },
  { name: "RSI Lynx",                            msrp: 60 },
  { name: "RSI Perseus",                         msrp: 800 },
  { name: "RSI Polaris",                         msrp: 975 },
  { name: "RSI Zeus Mk II CL",                   msrp: 175 },
  { name: "RSI Zeus Mk II ES",                   msrp: 175 },
  { name: "Tumbril Cyclone AA",                  msrp: 80 },
  { name: "Tumbril Cyclone MT",                  msrp: 75 },
  { name: "Tumbril Cyclone RN",                  msrp: 65 },
  { name: "Tumbril Cyclone TR",                  msrp: 65 },
  { name: "Tumbril Storm",                       msrp: 90 },
  { name: "Tumbril Storm AA",                    msrp: 100 },
];

async function main() {
  console.log("=== restore_msrp_pre_force_apply ===");
  console.log(`Modo: ${APPLY ? "APPLY" : "DRY-RUN"}`);
  console.log("");

  try {
    let applied = 0;
    let unchanged = 0;
    let notFound = 0;

    for (const r of RESTORE) {
      // Match por nombre. Algunas naves aparecen DUPLICADAS en `ships` (mismas
      // entries por instance_count o por bug histórico), por eso usamos
      // todas las rows que matcheen.
      const ships = await sql`
        SELECT s.id, s.name, sp.msrp_usd
        FROM ships s LEFT JOIN ship_price sp ON sp.id = s.id
        WHERE s.name = ${r.name}
      `;

      if (ships.length === 0) {
        console.log(`  ? ${r.name}  — NO ENCONTRADA en ships`);
        notFound++;
        continue;
      }

      for (const ship of ships) {
        const cur = ship.msrp_usd != null ? Number(ship.msrp_usd) : null;
        if (cur === r.msrp) {
          console.log(`  = ${r.name.padEnd(40)} ya $${r.msrp}`);
          unchanged++;
          continue;
        }
        console.log(`  ~ ${r.name.padEnd(40)} cur=$${cur ?? "null"} -> $${r.msrp}`);
        if (APPLY) {
          await sql`
            INSERT INTO ship_price (id, msrp_usd, is_ccu_eligible, is_limited)
            VALUES (${ship.id}::uuid, ${r.msrp}, true, false)
            ON CONFLICT (id) DO UPDATE SET msrp_usd = EXCLUDED.msrp_usd
          `;
          applied++;
        }
      }
    }

    console.log("");
    console.log(`Resumen:`);
    console.log(`  ${APPLY ? "Aplicados" : "A aplicar"}: ${applied}`);
    console.log(`  Ya en valor correcto:                ${unchanged}`);
    console.log(`  No encontradas:                       ${notFound}`);

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
