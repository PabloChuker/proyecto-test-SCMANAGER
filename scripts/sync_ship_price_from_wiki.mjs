#!/usr/bin/env node
// =============================================================================
// SC LABS — Sync MSRP a la tabla `ship_price` desde precios de RSI/SC Wiki
//
// CONTEXTO (2026-04-26):
//
// El gestor de hangar mostraba "—" en muchos precios destino de CCUs y eso
// truncaba el cálculo de ahorro. El bug raíz:
//
//   • Hay DOS lugares con el MSRP: la columna legacy `ships.msrp_usd` y la
//     tabla canónica `ship_price` (one-to-one con ships, agregada en Fase R).
//   • El script viejo `populate_prices.mjs` escribe a `ships.msrp_usd`, pero
//     el endpoint `/api/ccu/ships` lee de `ship_price.msrp_usd` y filtra
//     `WHERE sp.msrp_usd IS NOT NULL`. Las filas sin entry en ship_price (o
//     con msrp_usd NULL) quedan invisibles para el lookup MSRP del CCUList.
//   • `import-concept-ships.mjs` (Fase R.2) sólo cargó concept ships nuevas;
//     no rellenó precios faltantes de naves que ya existían en `ships`.
//
// QUÉ HACE ESTE SCRIPT:
//
//   1. Toma WIKI_PRICES (precios de RSI/SC Wiki) extendido con concept ships
//      faltantes (Ironclad, Ironclad Assault, Expanse, etc.).
//   2. Para cada nave de la tabla `ships`, intenta matchear contra el catálogo:
//        - exact match por nombre
//        - case-insensitive
//        - sin prefix de manufacturer
//   3. UPSERT a `ship_price` con la regla SAFE: si ya hay un msrp_usd cargado
//      (>0), lo respeta. Sólo llena los huecos. Esto evita sobrescribir
//      ajustes manuales del equipo.
//   4. Reporta diff: cuántas filas vacías se llenan, cuántas naves siguen sin
//      precio (para investigar manualmente).
//
// USO:
//
//   node scripts/sync_ship_price_from_wiki.mjs                 # dry-run
//   node scripts/sync_ship_price_from_wiki.mjs --apply         # escribe
//   node scripts/sync_ship_price_from_wiki.mjs --force-apply   # SOBREESCRIBE
//
// Requiere DATABASE_URL o DIRECT_URL en .env.
// =============================================================================

import postgres from "postgres";
import "dotenv/config";

const APPLY = process.argv.includes("--apply") || process.argv.includes("--force-apply");
const FORCE = process.argv.includes("--force-apply");

const connectionString = process.env.DATABASE_URL ?? process.env.DIRECT_URL ?? "";
if (!connectionString) {
  console.error("ERROR: No DATABASE_URL ni DIRECT_URL en .env");
  process.exit(1);
}

const sql = postgres(connectionString, { max: 5, idle_timeout: 20, connect_timeout: 10 });

// ─── Catálogo de precios MSRP (USD, store estándar — sin VAT) ──────────────
// Fuente: starcitizen.fandom.com/wiki/List_of_ship_and_vehicle_prices
// + RSI Pledge Store directo para concepts recientes (Ironclad, Expanse, etc.)
//
// REGLA: si encontrás un precio desactualizado o un missing, agregalo acá.
// El script es idempotente — re-correrlo no daña nada.
const WIKI_PRICES = {
  // Origin
  "100i": 50, "125a": 60, "135c": 65,
  "300i": 60, "315p": 65, "325a": 70, "350r": 125,
  "400i": 250, "600i Explorer": 475, "600i Touring": 435,
  "85X": 50, "890 Jump": 950,
  "X1": 40, "X1 Force": 50, "X1 Velocity": 45,

  // Aegis
  "Avenger Stalker": 60, "Avenger Titan": 60, "Avenger Titan Renegade": 75, "Avenger Warlock": 85,
  "Eclipse": 300, "Gladius": 90, "Gladius Valiant": 110,
  "Hammerhead": 725, "Hammerhead Best In Show Edition": 725,
  "Idris-K": 300, "Idris-M": 1000, "Idris-P": 1000,
  "Javelin": 3000, "Reclaimer": 400,
  "Redeemer": 325, "Retaliator": 275,
  "Sabre": 170, "Sabre Comet": 185, "Sabre Firebird": 185, "Sabre Raven": 110,
  "Vanguard Harbinger": 290, "Vanguard Hoplite": 240, "Vanguard Sentinel": 275, "Vanguard Warden": 260,
  // ── Concepts Aegis agregadas 2026-04-26 ─────────────────────────────────
  "Ironclad": 400, "Ironclad Assault": 525,
  "Nautilus": 750, "Nautilus Solstice Edition": 800,

  // Anvil
  "Arrow": 75, "Ballista": 140, "Ballista Dunestalker": 150, "Ballista Snowblind": 150,
  "C8 Pisces": 40, "C8R Pisces Rescue": 65, "C8X Pisces Expedition": 45,
  "Carrack": 600, "Carrack Expedition": 625,
  "Crucible": 350, "F7A Hornet Mk II": 250, "F7C Hornet": 110,
  "F7C Hornet Mk II": 200,
  "F7C-M Super Hornet": 180, "F7C-M Super Hornet Heartseeker": 195,
  "Gladiator": 165, "Hawk": 100, "Hurricane": 210, "Liberator": 575, "Spartan": 80,
  "Terrapin": 220, "Terrapin Medic": 230, "Valkyrie": 375,
  // Concepts
  "Legionnaire": 110,

  // Drake
  "Buccaneer": 110, "Caterpillar": 330, "Caterpillar Pirate Edition": 360,
  "Corsair": 250, "Cutlass Black": 110, "Cutlass Blue": 175,
  "Cutlass Red": 135, "Cutlass Steel": 235, "Cutter": 45, "Cutter Rambler": 50, "Cutter Scout": 50,
  "Dragonfly Black": 40, "Dragonfly Yellowjacket": 40,
  "Herald": 85, "Kraken": 1650, "Kraken Privateer": 2000, "Mule": 45,
  "Vulture": 175,
  // Concepts
  "Ironclad": 400, // duplicado intencional (alias) — Aegis Ironclad

  // RSI
  "Apollo Medivac": 275, "Apollo Triage": 250, "Aurora CL": 45, "Aurora ES": 20, "Aurora LN": 35,
  "Aurora MR": 30,
  "Constellation Andromeda": 240, "Constellation Aquila": 310, "Constellation Phoenix": 350,
  "Constellation Taurus": 200,
  "Galaxy": 380, "Mantis": 150, "Orion": 650, "Perseus": 675,
  "Polaris": 750, "Scorpius": 240, "Scorpius Antares": 230,
  "Zeus Mk II CL": 150, "Zeus Mk II ES": 150, "Zeus Mk II MR": 190,
  "Lynx": 110,
  // Concepts
  "Arrastra": 700,

  // MISC
  "Freelancer": 110, "Freelancer DUR": 135, "Freelancer MAX": 150, "Freelancer MIS": 175,
  "Hull A": 90, "Hull B": 140, "Hull C": 500, "Hull D": 550, "Hull E": 750,
  "Odyssey": 700, "Prospector": 155, "Reliant Kore": 65, "Reliant Mako": 95, "Reliant Sen": 85,
  "Reliant Tana": 75, "Starfarer": 300, "Starfarer Gemini": 340,
  "Fortune": 195, "Starlancer MAX": 195, "Starlancer TAC": 250, "Starlancer BLD": 220,
  "Razor": 145, "Razor EX": 165, "Razor LX": 165,

  // Crusader
  "A1 Spirit": 175, "C1 Spirit": 125, "E1 Spirit": 150,
  "A2 Hercules": 750, "C2 Hercules": 400, "M2 Hercules": 520,
  "Ares Inferno": 250, "Ares Ion": 250, "Genesis Starliner": 400,
  "Mercury Star Runner": 260,
  "Intrepid": 95,
  // Concepts
  "Expanse": 270,

  // Argo
  "MOLE": 315, "MOLE Carbon Edition": 335, "MOLE Talus Edition": 335,
  "RAFT": 125, "SRV": 150, "ATLS": 40, "ATLS Geo": 45,
  "CSV-SM": 35, "CSV-ST": 30,

  // Consolidated Outland
  "Mustang Alpha": 30, "Mustang Beta": 40, "Mustang Delta": 65, "Mustang Gamma": 55, "Mustang Omega": 55,
  "Nomad": 80, "Pioneer": 850,

  // Greycat
  "ROC": 30, "ROC-DS": 40, "PTV": 25, "STV": 35,

  // Tumbril
  "Cyclone": 55, "Cyclone AA": 65, "Cyclone MT": 60, "Cyclone RC": 65, "Cyclone RN": 60, "Cyclone TR": 70,
  "Nova": 120, "Ranger CV": 35, "Ranger RC": 35, "Ranger TR": 35, "Storm": 100, "Storm AA": 130,

  // Esperia / Tevarin / otros
  "Banu Merchantman": 650, "Banu Defender": 220,
  "Esperia Blade": 275, "Esperia Glaive": 350, "Esperia Prowler": 440, "Esperia Talon": 115, "Esperia Talon Shrike": 115,
  "Khartu-Al": 170, "San'tok.yāi": 220,
  "Gatac Syulen": 70, "Railen": 225,

  // L-22 Alpha (Origin)
  "L-22 Alpha Wolf": 120,

  // Otros que aparecen en hangares
  "Liberator Pirate Edition": 600,
  "ST": 40,
};

// Manufacturers tokens — para stripear de los nombres antes de comparar.
// AMPLIADO 2026-04-26: la BD trae el manufacturer como "Gatac Manufacture",
// "Aegis Dynamics", "Anvil Aerospace", etc., entonces necesitamos tokenizar
// TODOS los términos del nombre del fabricante para que el matching ande.
const MFR_TOKENS = new Set([
  // Manufacturer roots
  "rsi", "anvil", "aegis", "drake", "origin", "misc", "crusader",
  "argo", "consolidated", "outland", "tumbril", "esperia", "banu",
  "vanduul", "xian", "kruger", "intergalactic", "ag",
  "gatac", "mirai", "aopoa", "musashi", "roberts", "greycat",
  // Manufacturer suffixes (palabras que aparecen en los nombres completos)
  "manufacture", "dynamics", "aerospace", "industries", "industrial",
  "starflight", "concern", "jumpworks", "astronautics", "land",
  "systems", "space", "interstellar", "international",
]);

function tokenize(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[-_/]/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);
}

function lookupPrice(name, manufacturer) {
  // 1. Exact match
  if (WIKI_PRICES[name]) return { price: WIKI_PRICES[name], how: "exact" };

  // 2. Case-insensitive
  const lower = (name || "").toLowerCase();
  for (const [k, v] of Object.entries(WIKI_PRICES)) {
    if (k.toLowerCase() === lower) return { price: v, how: "case-insensitive" };
  }

  // 3. Sin prefix de manufacturer
  if (manufacturer) {
    const mfr = manufacturer + " ";
    if (name.startsWith(mfr)) {
      const stripped = name.slice(mfr.length);
      if (WIKI_PRICES[stripped]) return { price: WIKI_PRICES[stripped], how: "stripped-mfr" };
    }
  }

  // 4. Tokenized intersection (más laxo)
  // Pase A: candidate ⊆ query CON mismo tamaño — match más conservador.
  // Pase B: candidate ⊆ query con diferencia <= 1 token (típicamente cuando
  //         el manufacturer no se pudo strippear porque no estaba en MFR_TOKENS).
  //         Lo permitimos sólo si el candidato tiene >= 2 tokens (para evitar
  //         que "Hull" matchee con "Constellation Hull").
  const queryTokens = new Set(tokenize(name).filter((t) => !MFR_TOKENS.has(t)));
  if (queryTokens.size === 0) return null;

  // Recolectamos TODOS los matches y elegimos el más específico (más tokens).
  const matches = [];
  for (const [k, v] of Object.entries(WIKI_PRICES)) {
    const candTokens = new Set(tokenize(k).filter((t) => !MFR_TOKENS.has(t)));
    if (candTokens.size === 0) continue;
    let allPresent = true;
    for (const t of candTokens) {
      if (!queryTokens.has(t)) { allPresent = false; break; }
    }
    if (!allPresent) continue;

    const diff = queryTokens.size - candTokens.size;
    if (diff === 0) {
      matches.push({ k, v, score: 100, how: "token-equal" });
    } else if (diff === 1 && candTokens.size >= 2) {
      // Permitido: candidato más corto por 1 token (ej. mfr no strippeado).
      matches.push({ k, v, score: 80, how: "token-loose" });
    } else if (diff >= 1 && candTokens.size === 1) {
      // Candidato de 1 token contra query más largo (ej. "Railen" vs "Gatac Railen"
      // donde Gatac no está en MFR_TOKENS). Sólo si el query.size <= 2.
      if (queryTokens.size <= 2) {
        matches.push({ k, v, score: 60, how: "token-single" });
      }
    }
  }

  if (matches.length === 0) return null;
  matches.sort((a, b) => b.score - a.score || b.k.length - a.k.length);
  return { price: matches[0].v, how: matches[0].how };
}

async function main() {
  console.log("=== sync_ship_price_from_wiki ===");
  console.log(`Modo: ${APPLY ? (FORCE ? "FORCE-APPLY (sobreescribe!)" : "APPLY") : "DRY-RUN"}`);
  console.log("");

  try {
    // Snapshot del estado actual
    const ships = await sql`
      SELECT s.id, s.name, m.name AS manufacturer, sp.msrp_usd AS current_msrp
      FROM ships s
      LEFT JOIN ship_price sp ON sp.id = s.id
      LEFT JOIN manufacturers m ON m.id = s.manufacturer_id
      ORDER BY s.name
    `;
    console.log(`Ships en catálogo: ${ships.length}`);

    const totalConPrecio = ships.filter((s) => s.current_msrp != null && Number(s.current_msrp) > 0).length;
    const totalSinPrecio = ships.length - totalConPrecio;
    console.log(`  con MSRP cargado: ${totalConPrecio}`);
    console.log(`  sin MSRP cargado: ${totalSinPrecio}`);
    console.log("");

    // Categorizar
    const llenarHueco = []; // sin precio actual + match en wiki
    const yaCargado = [];   // con precio actual (no se toca, salvo --force)
    const sinMatch = [];    // sin precio actual + sin match en wiki

    for (const ship of ships) {
      const result = lookupPrice(ship.name, ship.manufacturer);
      const cur = ship.current_msrp != null ? Number(ship.current_msrp) : null;
      const hasCur = cur != null && cur > 0;

      if (!hasCur && result) {
        llenarHueco.push({ ship, ...result });
      } else if (hasCur) {
        yaCargado.push({ ship, ...(result ?? {}) });
      } else {
        sinMatch.push({ ship });
      }
    }

    console.log(`A LLENAR (huecos con match): ${llenarHueco.length}`);
    for (const { ship, price, how } of llenarHueco.slice(0, 50)) {
      console.log(`  + ${ship.name.padEnd(40)} -> $${price}  (${how})`);
    }
    if (llenarHueco.length > 50) console.log(`  + ... y ${llenarHueco.length - 50} más`);
    console.log("");

    console.log(`SIN MATCH (no se puede llenar): ${sinMatch.length}`);
    for (const { ship } of sinMatch.slice(0, 30)) {
      console.log(`  ? ${ship.name}  (${ship.manufacturer ?? "—"})`);
    }
    if (sinMatch.length > 30) console.log(`  ? ... y ${sinMatch.length - 30} más`);
    console.log("");

    if (FORCE) {
      console.log(`FORCE: revisar ${yaCargado.length} naves con precio cargado para sobrescribir desde wiki...`);
      let drift = 0;
      for (const { ship, price } of yaCargado) {
        if (!price) continue;
        const cur = Number(ship.current_msrp);
        if (cur !== price) {
          console.log(`  ~ ${ship.name.padEnd(40)} cur=$${cur} -> wiki=$${price}`);
          drift++;
        }
      }
      console.log(`  ${drift} naves con drift de precio vs wiki`);
      console.log("");
    }

    if (!APPLY) {
      console.log("Dry-run: no se escribe a la BD. Usá --apply para llenar los huecos.");
      console.log("        --force-apply también sobrescribe precios ya cargados desde la wiki.");
      return;
    }

    // APPLY ────────────────────────────────────────────────────────────────
    console.log("Aplicando cambios...");

    let inserted = 0;
    let updated = 0;
    for (const { ship, price } of llenarHueco) {
      try {
        await sql`
          INSERT INTO ship_price (id, msrp_usd, is_ccu_eligible, is_limited)
          VALUES (${ship.id}::uuid, ${price}, true, false)
          ON CONFLICT (id) DO UPDATE
            SET msrp_usd = EXCLUDED.msrp_usd
            WHERE ship_price.msrp_usd IS NULL OR ship_price.msrp_usd = 0
        `;
        // Detectar si fue insert o update
        const exists = await sql`SELECT 1 FROM ship_price WHERE id = ${ship.id}::uuid`;
        if (exists.length > 0) updated++;
        else inserted++;
      } catch (err) {
        console.error(`  ! falló ${ship.name}: ${err.message}`);
      }
    }

    if (FORCE) {
      let overwritten = 0;
      for (const { ship, price } of yaCargado) {
        if (!price) continue;
        const cur = Number(ship.current_msrp);
        if (cur === price) continue;
        try {
          await sql`UPDATE ship_price SET msrp_usd = ${price} WHERE id = ${ship.id}::uuid`;
          overwritten++;
        } catch (err) {
          console.error(`  ! falló overwrite de ${ship.name}: ${err.message}`);
        }
      }
      console.log(`  sobrescritos por --force-apply: ${overwritten}`);
    }

    console.log(`  filas afectadas: ${inserted + updated}`);

    // Verificación post
    const after = await sql`
      SELECT COUNT(*)::int AS n
      FROM ships s LEFT JOIN ship_price sp ON sp.id = s.id
      WHERE sp.msrp_usd IS NOT NULL AND sp.msrp_usd > 0
    `;
    console.log(`  ships con MSRP después: ${after[0].n} / ${ships.length}`);
  } catch (err) {
    console.error("FATAL:", err);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

main();
