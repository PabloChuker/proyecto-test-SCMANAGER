#!/usr/bin/env node
// =============================================================================
// AL FILO — Ship Price Population Script (Refactored to postgres.js)
//
// 1. Adds msrp_usd and warbond_usd columns to ships table (if missing)
// 2. Matches ships in our DB against known pledge store prices
// 3. Updates matched ships with MSRP prices
//
// Usage: node scripts/populate_prices.mjs
// Requires: DATABASE_URL or DIRECT_URL in .env
// =============================================================================

import postgres from "postgres";
import "dotenv/config";

const connectionString =
  process.env.DATABASE_URL ??
  process.env.DIRECT_URL ??
  "";

if (!connectionString) {
  console.error("No DATABASE_URL found in .env");
  process.exit(1);
}

const sql = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

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
  "Gladiator": 165, "Hawk": 100, "Hurricane": 210, "Liberator": 575, "Spartan": 80,
  "Terrapin": 220, "Valkyrie": 375,

  // Drake
  "Buccaneer": 110, "Caterpillar": 330, "Corsair": 250, "Cutlass Black": 110, "Cutlass Blue": 175,
  "Cutlass Red": 135, "Cutlass Steel": 235, "Cutter": 45, "Cutter Rambler": 50, "Cutter Scout": 50,
  "Dragonfly Black": 40, "Herald": 85, "Kraken": 1650, "Kraken Privateer": 2000, "Mule": 45,
  "Vulture": 175,

  // RSI
  "Apollo Medivac": 275, "Apollo Triage": 250, "Aurora CL": 45, "Aurora ES": 20, "Aurora LN": 35,
  "Aurora MR": 30, "Constellation Andromeda": 240, "Constellation Aquila": 310, "Constellation Phoenix": 350,
  "Constellation Taurus": 200, "Galaxy": 380, "Mantis": 150, "Orion": 650, "Perseus": 675,
  "Polaris": 750, "Scorpius": 240, "Scorpius Antares": 230, "Zeus Mk II CL": 150, "Zeus Mk II ES": 150,
  "Zeus Mk II MR": 190,

  // MISC
  "Freelancer": 110, "Freelancer DUR": 135, "Freelancer MAX": 150, "Freelancer MIS": 175,
  "Hull A": 90, "Hull B": 140, "Hull C": 500, "Hull D": 550, "Hull E": 750,
  "Odyssey": 700, "Prospector": 155, "Reliant Kore": 65, "Reliant Mako": 95, "Reliant Sen": 85,
  "Reliant Tana": 75, "Starfarer": 300, "Starfarer Gemini": 340,

  // Crusader
  "A1 Spirit": 175, "C1 Spirit": 125, "E1 Spirit": 150, "A2 Hercules": 750, "C2 Hercules": 400,
  "M2 Hercules": 520, "Ares Inferno": 250, "Ares Ion": 250, "Genesis Starliner": 400, "Mercury Star Runner": 260,

  // Argo
  "MOLE": 315, "RAFT": 125, "SRV": 150, "ATLS": 40, "CSV-SM": 35, "CSV-ST": 30,

  // Consolidated Outland
  "Mustang Alpha": 30, "Mustang Beta": 40, "Mustang Delta": 65, "Mustang Gamma": 55, "Mustang Omega": 55,
  "Nomad": 80, "Pioneer": 850,

  // Other
  "Banu Merchantman": 650, "Banu Defender": 220,
  "Esperia Blade": 275, "Esperia Glaive": 350, "Esperia Prowler": 440, "Esperia Talon": 115, "Esperia Talon Shrike": 115,
  "Khartu-Al": 170, "San'tok.yāi": 220,
  "ST": 40, "Cyclone": 55, "Nova": 120, "Ranger": 35, "Storm": 100,
  "Gatac Syulen": 70, "Railen": 225,
};

async function main() {
  console.log("=== AL FILO — Ship Price Population Script ===");
  
  try {
    // Step 1: Schema check
    console.log("Step 1: Checking schema...");
    await sql`ALTER TABLE ships ADD COLUMN IF NOT EXISTS msrp_usd numeric`;
    await sql`ALTER TABLE ships ADD COLUMN IF NOT EXISTS warbond_usd numeric`;
    await sql`ALTER TABLE ships ADD COLUMN IF NOT EXISTS size integer`;
    console.log("  ✓ Columns ensured\n");

    // Step 2: Fetch ships
    console.log("Step 2: Fetching ships from DB...");
    const dbShips = await sql`SELECT id, reference, name, manufacturer FROM ships`;
    console.log(`  ✓ Found ${dbShips.length} ships\n`);

    // Step 3: Match prices
    console.log("Step 3: Matching ships against price data...");
    let matches = 0;
    const updates = [];
    const unmatchedNames = [];

    for (const ship of dbShips) {
      const dbName = ship.name;
      const dbMfr = ship.manufacturer || "";

      // Try full match
      let price = WIKI_PRICES[dbName];

      // Try match without manufacturer prefix
      if (!price && dbMfr) {
        let stripped = dbName;
        if (dbName.startsWith(dbMfr + " ")) {
          stripped = dbName.slice(dbMfr.length + 1);
        }
        price = WIKI_PRICES[stripped];
      }

      // Try case-insensitive fallback if still no match
      if (!price) {
        const lowerName = dbName.toLowerCase();
        const foundKey = Object.keys(WIKI_PRICES).find(k => k.toLowerCase() === lowerName);
        if (foundKey) price = WIKI_PRICES[foundKey];
      }

      if (price) {
        updates.push({ id: ship.id, name: dbName, msrp: price });
        matches++;
      } else {
        unmatchedNames.push(dbName);
      }
    }

    console.log(`  ✓ Matched ${matches} ships`);
    if (unmatchedNames.length > 0) {
      console.log(`  ⚠ ${unmatchedNames.length} ships remain unmatched`);
      // Show first 10 unmatched
      unmatchedNames.slice(0, 10).forEach(n => console.log(`    - ${n}`));
      if (unmatchedNames.length > 10) console.log(`    - ... and ${unmatchedNames.length - 10} more`);
    }
    console.log();

    // Step 4: Apply updates
    console.log("Step 4: Updating prices in database...");
    let updatedCount = 0;
    for (const upd of updates) {
      try {
        await sql`UPDATE ships SET msrp_usd = ${upd.msrp} WHERE id = ${upd.id}`;
        updatedCount++;
      } catch (err) {
        console.error(`  ✗ Failed to update ${upd.name}: ${err.message}`);
      }
    }
    console.log(`  ✓ Updated ${updatedCount} ships with MSRP prices\n`);

    // Step 5: Verify
    console.log("Step 5: Verification...");
    const withPrices = await sql`SELECT COUNT(*)::int AS count FROM ships WHERE msrp_usd IS NOT NULL`;
    const withoutPrices = await sql`SELECT COUNT(*)::int AS count FROM ships WHERE msrp_usd IS NULL`;
    console.log(`  Ships with prices: ${withPrices[0].count}`);
    console.log(`  Ships without prices: ${withoutPrices[0].count}`);

    const stats = await sql`
      SELECT MIN(msrp_usd) AS min_price, MAX(msrp_usd) AS max_price,
             ROUND(AVG(msrp_usd)::numeric, 2) AS avg_price
      FROM ships WHERE msrp_usd IS NOT NULL
    `;
    if (stats[0] && stats[0].min_price !== null) {
      console.log(`  Price range: $${stats[0].min_price} - $${stats[0].max_price}`);
      console.log(`  Average: $${stats[0].avg_price}`);
    }

    console.log("\n=== Done! ===");
  } catch (err) {
    console.error("Fatal error:", err);
  } finally {
    await sql.end();
  }
}

main();
