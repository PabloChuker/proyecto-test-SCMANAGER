#!/usr/bin/env node
// =============================================================================
// SC LABS — UEX Commodity Prices Importer
//
// Two modes:
//   1. API mode (default): Fetches all prices from the UEX public API
//      https://api.uexcorp.space/2.0/commodities_prices_all
//   2. CSV mode: Reads a local "UEX - All Commodities SCU.csv" file
//
// Usage:
//   node scripts/importers/import-uex-prices.mjs              → API mode
//   node scripts/importers/import-uex-prices.mjs --csv [path] → CSV mode
//
// Environment variables needed:
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   (or NEXT_PUBLIC_SUPABASE_ANON_KEY as fallback)
// =============================================================================

import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

// ─── Config ─────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const UEX_PRICES_URL = "https://api.uexcorp.space/2.0/commodities_prices_all";
const UEX_COMMODITIES_URL = "https://api.uexcorp.space/2.0/commodities";
const UEX_TERMINALS_URL = "https://api.uexcorp.space/2.0/terminals";

// ─── API Mode: Fetch from UEX API ─────────────────────────────────────────

async function fetchFromAPI() {
  console.log("Fetching data from UEX API...");

  // 1. Fetch all three endpoints in parallel
  const [pricesRes, commoditiesRes, terminalsRes] = await Promise.all([
    fetch(UEX_PRICES_URL),
    fetch(UEX_COMMODITIES_URL),
    fetch(UEX_TERMINALS_URL),
  ]);

  if (!pricesRes.ok) {
    throw new Error(`UEX prices API error: ${pricesRes.status} ${pricesRes.statusText}`);
  }

  const pricesJson = await pricesRes.json();
  const pricesData = pricesJson.data || pricesJson;

  if (!Array.isArray(pricesData) || pricesData.length === 0) {
    throw new Error("No price data returned from UEX API");
  }
  console.log(`   ${pricesData.length} price entries`);

  // 2. Build commodity id → code map (e.g. 1 → "AGRI", 5 → "ALUM")
  const commodityCodeMap = {};
  if (commoditiesRes.ok) {
    const commJson = await commoditiesRes.json();
    const commData = commJson.data || commJson;
    if (Array.isArray(commData)) {
      for (const c of commData) {
        commodityCodeMap[c.id] = c.code || c.name?.substring(0, 4).toUpperCase() || "";
      }
      console.log(`   ${Object.keys(commodityCodeMap).length} commodity codes mapped`);
    }
  }

  // 3. Build terminal id → { name, system } map
  const terminalMap = {};
  if (terminalsRes.ok) {
    const termJson = await terminalsRes.json();
    const termData = termJson.data || termJson;
    if (Array.isArray(termData)) {
      for (const t of termData) {
        terminalMap[t.id] = {
          name: t.name || "Unknown",
          system: t.star_system_name || "Unknown",
        };
      }
      console.log(`   ${Object.keys(terminalMap).length} terminals mapped`);
    }
  }

  // 4. Convert API data to our DB format
  const rows = [];

  for (const entry of pricesData) {
    // Resolve commodity abbreviation: use commodities lookup, fall back to name
    const commodityCode = commodityCodeMap[entry.id_commodity] ||
      entry.commodity_name?.substring(0, 4).toUpperCase() || "";

    // Resolve terminal name and system
    const terminal = terminalMap[entry.id_terminal];
    const terminalName = entry.terminal_name || terminal?.name || `Terminal ${entry.id_terminal}`;
    const system = terminal?.system || "Unknown";

    // Buy price: station buys from player (player sells here)
    if (entry.price_buy && entry.price_buy > 0) {
      rows.push({
        commodity_abbr: commodityCode,
        station: terminalName,
        system,
        direction: "buy",
        price: Math.round(entry.price_buy),
      });
    }

    // Sell price: station sells to player (player buys here)
    if (entry.price_sell && entry.price_sell > 0) {
      rows.push({
        commodity_abbr: commodityCode,
        station: terminalName,
        system,
        direction: "sell",
        price: Math.round(entry.price_sell),
      });
    }
  }

  return rows;
}

// ─── CSV Mode: Parse local file ────────────────────────────────────────────

function findCSV(explicitPath) {
  if (explicitPath && fs.existsSync(explicitPath)) return explicitPath;

  const candidates = [
    "UEX - All Commodities SCU.csv",
    "Commodities SCU.csv",
    path.join(process.env.HOME || process.env.USERPROFILE || ".", "Downloads", "UEX - All Commodities SCU.csv"),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  return null;
}

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseUEXCSV(csvContent) {
  const rawLines = csvContent.split("\n");

  // Find the header line containing commodity abbreviations (has "AGRI" in it)
  let headerLineIdx = -1;
  for (let i = 0; i < Math.min(rawLines.length, 5); i++) {
    if (rawLines[i].includes("AGRI")) {
      headerLineIdx = i;
      break;
    }
  }

  if (headerLineIdx === -1) {
    console.error("Could not find header line with commodity abbreviations");
    return [];
  }

  const headerLine = rawLines.slice(0, headerLineIdx + 1).join(" ");
  const dataLines = rawLines.slice(headerLineIdx + 1);
  const lines = [headerLine, ...dataLines].map((l) => l.trim()).filter(Boolean);

  const headerCells = parseCSVLine(lines[0]);
  const commodities = headerCells.slice(1).map((c) => c.trim());

  let currentSystem = "Unknown";
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    if (cells.length === 0) continue;

    const name = cells[0].trim();
    if (!name) continue;

    if (name.toLowerCase().endsWith("system")) {
      currentSystem = name.replace(/\s*system\s*/i, "").trim();
      continue;
    }

    for (let j = 1; j < cells.length && j - 1 < commodities.length; j++) {
      const val = cells[j].trim();
      if (!val) continue;

      const match = val.match(/^([SB])\s+(\d+)$/);
      if (!match) continue;

      rows.push({
        commodity_abbr: commodities[j - 1],
        station: name,
        system: currentSystem,
        direction: match[1] === "B" ? "buy" : "sell",
        price: parseInt(match[2], 10),
      });
    }
  }

  return rows;
}

// ─── Upsert to Supabase ────────────────────────────────────────────────────

async function upsertPrices(rows) {
  console.log(`Parsed ${rows.length} price entries`);

  const commodities = new Set(rows.map((r) => r.commodity_abbr));
  const stations = new Set(rows.map((r) => r.station));
  const systems = new Set(rows.map((r) => r.system));
  console.log(`   ${commodities.size} commodities, ${stations.size} stations, ${systems.size} systems`);

  // Clear existing data
  console.log("Clearing existing commodity_prices...");
  const { error: deleteError } = await supabase
    .from("commodity_prices")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (deleteError) {
    console.error("Delete failed:", deleteError.message);
  }

  // Insert in batches of 500
  const BATCH_SIZE = 500;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("commodity_prices").insert(batch);

    if (error) {
      // Try upsert instead
      const { error: upsertError } = await supabase
        .from("commodity_prices")
        .upsert(batch, { onConflict: "commodity_abbr,station,direction" });
      if (upsertError) {
        console.error(`Batch ${i} failed: ${upsertError.message}`);
        continue;
      }
    }

    inserted += batch.length;
    process.stdout.write(`\r   Inserted ${inserted}/${rows.length}...`);
  }

  console.log(`\nDone! ${inserted} prices loaded into commodity_prices`);
  return inserted;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const csvMode = args.includes("--csv");

  let rows;

  if (csvMode) {
    // CSV mode: read local file
    const csvIdx = args.indexOf("--csv");
    const explicitPath = args[csvIdx + 1] && !args[csvIdx + 1].startsWith("--")
      ? args[csvIdx + 1]
      : undefined;
    const csvPath = findCSV(explicitPath);

    if (!csvPath) {
      console.error('CSV file not found. Pass path after --csv or place "UEX - All Commodities SCU.csv" in current dir or ~/Downloads/');
      process.exit(1);
    }

    console.log(`Reading CSV: ${csvPath}`);
    const content = fs.readFileSync(csvPath, "utf-8");
    rows = parseUEXCSV(content);
  } else {
    // API mode (default): fetch from UEX
    rows = await fetchFromAPI();
  }

  if (!rows || rows.length === 0) {
    console.error("No price data found");
    process.exit(1);
  }

  await upsertPrices(rows);
}

export { parseUEXCSV, upsertPrices, findCSV, fetchFromAPI };

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
