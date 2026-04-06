#!/usr/bin/env node
// =============================================================================
// AL FILO — Ship Price Population Script
//
// 1. Adds msrp_usd and warbond_usd columns to ships table (if missing)
// 2. Matches ships in our DB against known pledge store prices
// 3. Updates matched ships with MSRP prices
//
// Usage: node scripts/populate_prices.mjs
// Requires: DATABASE_URL or DIRECT_URL in .env
// =============================================================================

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ─── Known manufacturer prefixes in our DB ──────────────────────────────────
const MFR_PREFIXES = [
  "Aegis", "Anvil", "Argo", "Aopoa", "Banu", "C.O.", "CNOU", "Crusader",
  "Drake", "Esperia", "Gatac", "Greycat", "Kruger", "MISC", "Musashi",
  "Origin", "RSI", "Tumbril", "Vanduul",
];

// ─── Ship prices from Star Citizen Wiki (USD MSRP) ─────────────────────────
// Source: starcitizen.fandom.com/wiki/List_of_ship_and_vehicle_prices
// These are pledge store standalone prices (no VAT)
const WIKI_PRICES = {
  // Origin
  "100i": 50, "125a": 60, "135c": 65,
  "300i": 60, "315p": 65, "325a": 70, "350r": 125,
  "400i": 250, "600i Explorer": 475, "600i Touring": 435,
  "85X": 50, "890 Jump": 950,

  // Aegis
  "Avenger Stalker": 60, "Avenger Titan": 60, "Avenger Titan Renegade": 75, "Avenger Warlock": 85,
  "Eclipse": 300, "Gladius": 90, "Gladius Valiant": 110,
  "Hammerhead": 725, "Hammerhead Best In Show Edition": 725,
  "Idris-K": 300, "Idris-M": 1000, "Idris-P": 1000,
  "Javelin": 3000, "Reclaimer": 400,
  "Redeemer": 325, "Retaliator": 275,
  "Sabre": 170, "Sabre Comet": 185, "Sabre Firebird": 185,
  "Vanguard Harbinger": 290, "Vanguard Hoplite": 240, "Vanguard Sentinel": 275, "Vanguard Warden": 260,

  // Anvil
  "Arrow": 75, "Ballista": 140,
  "C8 Pisces": 40, "C8R Pisces Rescue": 65, "C8X Pisces Expedition": 45,
  "Carrack": 600, "Carrack Expedition": 625,
  "Crucible": 350, "F7A Hornet Mk II": 250, "F7C Hornet": 110,
  "F7C Hornet Mk II": 200,
  "F7C-M Super Hornet": 180, "F7C-M Super Hornet Heartseeker": 195,
  "F7C-R Hornet Tracker": 140, "F7C-S Hornet Ghost": 125,
  "Gladiator": 165, "Hawk": 100, "Hurricane": 210,
  "Liberator": 575, "Terrapin": 220, "Valkyrie": 375,

  // Drake
  "Buccaneer": 110, "Caterpillar": 330,
  "Caterpillar Best In Show Edition": 295, "Caterpillar Pirate Edition": 295,
  "Corsair": 250, "Cutlass Black": 110,
  "Cutlass Blue": 160, "Cutlass Red": 135, "Cutlass Steel": 200,
  "Dragonfly Black": 40, "Dragonfly Yellowjacket": 40,
  "Herald": 85, "Kraken": 1650, "Kraken Privateer": 2000,
  "Mule": 35, "Vulture": 175,

  // RSI
  "Constellation Andromeda": 240, "Constellation Aquila": 310,
  "Constellation Phoenix": 350, "Constellation Taurus": 190,
  "Galaxy": 380, "Mantis": 150, "Polaris": 750,
  "Scorpius": 240, "Scorpius Antares": 230,
  "Zeus Mk II CL": 300, "Zeus Mk II ES": 260, "Zeus Mk II MR": 315,

  // MISC
  "Freelancer": 110, "Freelancer DUR": 135,
  "Freelancer MAX": 150, "Freelancer MIS": 175,
  "Hull A": 90, "Hull B": 140, "Hull C": 350, "Hull D": 450, "Hull E": 750,
  "Prospector": 155, "Reliant Kore": 65,
  "Reliant Mako": 85, "Reliant Sen": 75, "Reliant Tana": 75,
  "Starfarer": 300, "Starfarer Gemini": 340,
  "Starlancer MAX": 250,

  // Crusader
  "A1 Spirit": 110, "A2 Hercules Starlifter": 750,
  "C1 Spirit": 125, "C2 Hercules Starlifter": 400,
  "E1 Spirit": 150, "Genesis Starliner": 400,
  "M2 Hercules Starlifter": 520, "Mercury Star Runner": 260,

  // Origin (numbered)
  "M50": 100,

  // ARGO
  "MOLE": 315, "MPUV Cargo": 35, "MPUV Personnel": 40,
  "RAFT": 130, "SRV": 150,

  // C.O. / Consolidated Outland
  "Mustang Alpha": 30, "Mustang Alpha Vindicator": 30,
  "Mustang Beta": 40, "Mustang Delta": 65, "Mustang Gamma": 55,
  "Nomad": 80, "HoverQuad": 30,

  // Esperia
  "Blade": 275, "Glaive": 350, "Prowler": 440,
  "Talon": 115, "Talon Shrike": 115,
  "San'tok.yai": 220, "Scythe": 300,

  // Banu
  "Defender": 220, "Merchantman": 650,

  // Gatac
  "Railen": 250, "Syulen": 110,

  // Tumbril
  "Centurion": 110, "Cyclone": 55,
  "Cyclone-AA": 80, "Cyclone-MT": 75, "Cyclone-RC": 65,
  "Cyclone-RN": 65, "Cyclone-TR": 65,
  "Nova": 120, "Ranger CV": 35, "Ranger RC": 35, "Ranger TR": 40,
  "STV": 40, "Spartan": 80, "Storm": 175, "Storm AA": 200,

  // Kruger
  "P-52 Merlin": 25, "P-72 Archimedes": 35, "P-72 Archimedes Emerald": 35,

  // Greycat
  "PTV": 15, "ROC": 55, "ROC-DS": 75,

  // Aopoa
  "Khartu-Al": 170, "Nox": 45, "Nox Kue": 45,

  // Origin (vehicles)
  "G12": 60, "G12a": 65, "G12r": 60,
  "Lynx Rover": 60, "X1 Base": 40, "X1 Force": 50, "X1 Velocity": 45,

  // Misc others
  "Fury": 55, "Nautilus": 725, "Odyssey": 700,
  "Orion": 575, "Endeavor": 350, "Vulcan": 200,
  "Pioneer": 850, "Ursa Rover": 50, "Ursa Rover Fortuna": 55,
  "ATLS": 25,

  // Apollo
  "Apollo Medivac": 275, "Apollo Triage": 250,
};

// ─── Strip manufacturer prefix from DB name ─────────────────────────────────
function stripMfr(dbName) {
  for (const pfx of MFR_PREFIXES) {
    if (dbName.startsWith(pfx + " ")) {
      return dbName.slice(pfx.length + 1);
    }
  }
  return dbName;
}

// ─── Normalize name for fuzzy matching ──────────────────────────────────────
function normalize(name) {
  return name
    .toLowerCase()
    .replace(/['']/g, "'")      // normalize apostrophes
    .replace(/[\u0101]/g, "a")  // ā → a
    .replace(/edition/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== AL FILO Ship Price Population ===\n");

  // Step 1: Add columns if missing
  console.log("Step 1: Adding price columns to ships table...");
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE ships ADD COLUMN IF NOT EXISTS msrp_usd DOUBLE PRECISION;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE ships ADD COLUMN IF NOT EXISTS warbond_usd DOUBLE PRECISION;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_ships_msrp ON ships (msrp_usd) WHERE msrp_usd IS NOT NULL;
    `);
    console.log("  ✓ Columns added (or already exist)\n");
  } catch (err) {
    console.error("  ✗ Error adding columns:", err.message);
    process.exit(1);
  }

  // Step 2: Fetch all ships from DB
  console.log("Step 2: Fetching ships from database...");
  const dbShips = await prisma.$queryRawUnsafe(`
    SELECT id, name FROM ships ORDER BY name ASC
  `);
  console.log(`  Found ${dbShips.length} ships in DB\n`);

  // Step 3: Match and build UPDATE statements
  console.log("Step 3: Matching ships to prices...");

  // Build normalized lookup from wiki prices
  const wikiLookup = new Map();
  for (const [name, price] of Object.entries(WIKI_PRICES)) {
    wikiLookup.set(normalize(name), price);
  }

  let matched = 0;
  let unmatched = 0;
  const unmatchedNames = [];
  const updates = [];

  for (const ship of dbShips) {
    const stripped = stripMfr(ship.name);
    const norm = normalize(stripped);

    // Try exact match first
    let price = wikiLookup.get(norm);

    // Try without "best in show" or special edition suffixes
    if (!price) {
      const cleaned = norm
        .replace(/\s*2949\s*/g, " ")
        .replace(/\s*2950\s*/g, " ")
        .replace(/\s*best\s*in\s*show\s*/g, "")
        .replace(/\s*teach'?s?\s*special\s*/g, "")
        .replace(/\s*wikelo\s*\w+\s*special\s*/g, "")
        .replace(/\s*pirate\s*/g, "")
        .replace(/\s*citizencon\s*\d+\s*/g, "")
        .replace(/\s*pyam\s*exec\s*/g, "")
        .replace(/\s*dunlevy\s*/g, "")
        .replace(/\s*peregrine\s*/g, "")
        .replace(/\s*raven\s*/g, "")
        .replace(/\s+/g, " ")
        .trim();
      price = wikiLookup.get(cleaned);
    }

    // Try just the last part (e.g., "Cyclone" from "Cyclone-AA")
    if (!price) {
      // Try partial match - check if any wiki key ends with our stripped name
      for (const [wikiNorm, wikiPrice] of wikiLookup) {
        if (wikiNorm === norm || norm.endsWith(wikiNorm) || wikiNorm.endsWith(norm)) {
          price = wikiPrice;
          break;
        }
      }
    }

    if (price) {
      matched++;
      updates.push({ id: ship.id, name: ship.name, msrp: price });
    } else {
      unmatched++;
      unmatchedNames.push(ship.name);
    }
  }

  console.log(`  ✓ Matched: ${matched}/${dbShips.length}`);
  console.log(`  ✗ Unmatched: ${unmatched}`);
  if (unmatchedNames.length > 0) {
    console.log(`  Unmatched ships:`);
    unmatchedNames.forEach(n => console.log(`    - ${n}`));
  }
  console.log();

  // Step 4: Apply updates
  console.log("Step 4: Updating prices in database...");
  let updated = 0;
  for (const upd of updates) {
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE ships SET msrp_usd = $1 WHERE id = $2`,
        upd.msrp,
        upd.id,
      );
      updated++;
    } catch (err) {
      console.error(`  ✗ Failed to update ${upd.name}: ${err.message}`);
    }
  }
  console.log(`  ✓ Updated ${updated} ships with MSRP prices\n`);

  // Step 5: Verify
  console.log("Step 5: Verification...");
  const withPrices = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS count FROM ships WHERE msrp_usd IS NOT NULL
  `);
  const withoutPrices = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS count FROM ships WHERE msrp_usd IS NULL
  `);
  console.log(`  Ships with prices: ${withPrices[0].count}`);
  console.log(`  Ships without prices: ${withoutPrices[0].count}`);

  // Show price range
  const stats = await prisma.$queryRawUnsafe(`
    SELECT MIN(msrp_usd) AS min_price, MAX(msrp_usd) AS max_price,
           ROUND(AVG(msrp_usd)::numeric, 2) AS avg_price
    FROM ships WHERE msrp_usd IS NOT NULL
  `);
  if (stats[0]) {
    console.log(`  Price range: $${stats[0].min_price} - $${stats[0].max_price}`);
    console.log(`  Average: $${stats[0].avg_price}`);
  }

  console.log("\n=== Done! ===");
}

main()
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
