#!/usr/bin/env node
// =============================================================================
// SC LABS — diagnose_ship_pricing.mjs
//
// Diagnóstico de una nave específica del catálogo: muestra TODA la info que
// hay en `ships` y `ship_price`, plus el resultado del lookup contra el wiki
// del script de sync. Útil para entender por qué una nave aparece como "—" en
// el gestor de hangar.
//
// USO:
//   node scripts/diagnose_ship_pricing.mjs "Hull B"
//   node scripts/diagnose_ship_pricing.mjs "Hull B" "Railen" "Galaxy"
//   node scripts/diagnose_ship_pricing.mjs --all-missing  # todas las que tienen
//                                                          # msrp NULL/0
//
// Requiere DATABASE_URL o DIRECT_URL en .env.
// =============================================================================

import postgres from "postgres";
import "dotenv/config";

const args = process.argv.slice(2);
const showAllMissing = args.includes("--all-missing");
const queries = args.filter((a) => !a.startsWith("--"));

if (queries.length === 0 && !showAllMissing) {
  console.error("Uso: node scripts/diagnose_ship_pricing.mjs \"Hull B\" [...]");
  console.error("     node scripts/diagnose_ship_pricing.mjs --all-missing");
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL ?? process.env.DIRECT_URL ?? "";
if (!connectionString) {
  console.error("ERROR: No DATABASE_URL ni DIRECT_URL en .env");
  process.exit(1);
}

const sql = postgres(connectionString, { max: 5, idle_timeout: 20, connect_timeout: 10 });

async function diagnoseOne(query) {
  console.log("\n" + "─".repeat(78));
  console.log(`Query: "${query}"`);
  console.log("─".repeat(78));

  const rows = await sql`
    SELECT
      s.id,
      s.class_name AS reference,
      s.name,
      m.name AS manufacturer,
      s.flight_status,
      s.size,
      s.role,
      sp.msrp_usd,
      sp.warbond_usd,
      sp.is_ccu_eligible,
      sp.is_limited,
      sp.acquisition_method
    FROM ships s
    LEFT JOIN ship_price sp ON sp.id = s.id
    LEFT JOIN manufacturers m ON m.id = s.manufacturer_id
    WHERE s.name ILIKE ${'%' + query + '%'}
       OR s.class_name ILIKE ${'%' + query + '%'}
    ORDER BY s.name
    LIMIT 20
  `;

  if (rows.length === 0) {
    console.log(`  Sin resultados en ships para "${query}".`);
    return;
  }

  for (const r of rows) {
    console.log(`\n  ${r.name}`);
    console.log(`    id:                  ${r.id}`);
    console.log(`    class_name:          ${r.reference || "(null)"}`);
    console.log(`    manufacturer:        ${r.manufacturer || "(null)"}`);
    console.log(`    flight_status:       ${r.flight_status || "(null)"}`);
    console.log(`    size:                ${r.size ?? "(null)"}`);
    console.log(`    role:                ${r.role || "(null)"}`);
    console.log(`    ship_price.msrp_usd: ${r.msrp_usd ?? "(null)"}`);
    console.log(`    ship_price.warbond:  ${r.warbond_usd ?? "(null)"}`);
    console.log(`    is_ccu_eligible:     ${r.is_ccu_eligible ?? "(null)"}`);
    console.log(`    is_limited:          ${r.is_limited ?? "(null)"}`);
    console.log(`    acquisition_method:  ${r.acquisition_method || "(null)"}`);

    // Diagnóstico
    const hasMsrp = r.msrp_usd != null && Number(r.msrp_usd) > 0;
    if (!hasMsrp) {
      console.log(`    >>> SIN MSRP — el endpoint /api/ccu/ships la descarta`);
      console.log(`        Causa: no aparece en el lookup MSRP de CCUList → "—" en pantalla`);
    } else if (r.is_ccu_eligible === false) {
      console.log(`    >>> is_ccu_eligible=false — quizás el endpoint la incluye pero el cliente la filtra`);
    } else {
      console.log(`    >>> tiene MSRP $${r.msrp_usd} — debería aparecer en el catálogo`);
      console.log(`        Si en pantalla sigue "—" puede ser:`);
      console.log(`          (a) cache del browser → Ctrl+F5`);
      console.log(`          (b) cache server-side de /api/ccu/ships (5 min)`);
      console.log(`          (c) matching client-side falla — verificar shape del CCU import`);
    }
  }
}

async function listAllMissing() {
  console.log("\n=== Naves SIN MSRP cargado en ship_price ===\n");
  const rows = await sql`
    SELECT
      s.id, s.name, m.name AS manufacturer, s.flight_status,
      sp.msrp_usd
    FROM ships s
    LEFT JOIN ship_price sp ON sp.id = s.id
    LEFT JOIN manufacturers m ON m.id = s.manufacturer_id
    WHERE sp.msrp_usd IS NULL OR sp.msrp_usd = 0
    ORDER BY s.name
  `;

  if (rows.length === 0) {
    console.log("  Ninguna! Todas las naves tienen MSRP cargado.");
    return;
  }

  for (const r of rows) {
    const status = r.flight_status === "concept" ? "[CONCEPT]" :
                   r.flight_status === "flight_ready" ? "[FLIGHT]" : "[?]";
    console.log(`  ${status.padEnd(10)} ${r.name.padEnd(45)} mfr=${r.manufacturer || "—"}`);
  }
  console.log(`\n  Total: ${rows.length} naves sin MSRP`);
}

async function main() {
  console.log("=== diagnose_ship_pricing ===");

  try {
    if (showAllMissing) {
      await listAllMissing();
    }
    for (const q of queries) {
      await diagnoseOne(q);
    }
  } catch (err) {
    console.error("FATAL:", err);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

main();
