// =============================================================================
// SC LABS — /api/mining/commodity-prices/import
//
// POST — Two modes:
//   1. { source: "api" }       → Fetch from UEX public API and import
//   2. multipart file or JSON  → Upload CSV and import
//
// Protected: requires auth (only logged-in users can trigger import)
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const UEX_PRICES_URL = "https://api.uexcorp.space/2.0/commodities_prices_all";
const UEX_COMMODITIES_URL = "https://api.uexcorp.space/2.0/commodities";
const UEX_TERMINALS_URL = "https://api.uexcorp.space/2.0/terminals";

// ─── CSV Parser ────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
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

interface PriceRow {
  commodity_abbr: string;
  station: string;
  system: string;
  direction: string;
  price: number;
}

function parseUEXCSV(csvContent: string): PriceRow[] {
  const rawLines = csvContent.split("\n");

  let headerLineIdx = -1;
  for (let i = 0; i < Math.min(rawLines.length, 5); i++) {
    if (rawLines[i].includes("AGRI")) {
      headerLineIdx = i;
      break;
    }
  }
  if (headerLineIdx === -1) return [];

  const headerLine = rawLines.slice(0, headerLineIdx + 1).join(" ");
  const dataLines = rawLines.slice(headerLineIdx + 1);
  const lines = [headerLine, ...dataLines].map((l) => l.trim()).filter(Boolean);

  const headerCells = parseCSVLine(lines[0]);
  const commodities = headerCells.slice(1).map((c) => c.trim());

  let currentSystem = "Unknown";
  const rows: PriceRow[] = [];

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

// ─── API Fetcher ───────────────────────────────────────────────────────────

interface UEXPriceEntry {
  id_commodity: number;
  id_terminal: number;
  commodity_name?: string;
  terminal_name?: string;
  price_buy?: number;
  price_sell?: number;
}

interface UEXCommodity {
  id: number;
  code: string;
  name: string;
}

interface UEXTerminal {
  id: number;
  name: string;
  star_system_name?: string;
}

async function fetchFromUEXAPI(): Promise<PriceRow[]> {
  // Fetch all three endpoints in parallel
  const [pricesRes, commoditiesRes, terminalsRes] = await Promise.all([
    fetch(UEX_PRICES_URL),
    fetch(UEX_COMMODITIES_URL),
    fetch(UEX_TERMINALS_URL),
  ]);

  if (!pricesRes.ok) {
    throw new Error(`UEX API error: ${pricesRes.status} ${pricesRes.statusText}`);
  }

  const pricesJson = await pricesRes.json();
  const pricesData: UEXPriceEntry[] = pricesJson.data || pricesJson;

  if (!Array.isArray(pricesData) || pricesData.length === 0) {
    throw new Error("No price data returned from UEX API");
  }

  // Build commodity id → code map
  const commodityCodeMap: Record<number, string> = {};
  if (commoditiesRes.ok) {
    const commJson = await commoditiesRes.json();
    const commData: UEXCommodity[] = commJson.data || commJson;
    if (Array.isArray(commData)) {
      for (const c of commData) {
        commodityCodeMap[c.id] = c.code || c.name?.substring(0, 4).toUpperCase() || "";
      }
    }
  }

  // Build terminal id → { name, system } map
  const terminalMap: Record<number, { name: string; system: string }> = {};
  if (terminalsRes.ok) {
    const termJson = await terminalsRes.json();
    const termData: UEXTerminal[] = termJson.data || termJson;
    if (Array.isArray(termData)) {
      for (const t of termData) {
        terminalMap[t.id] = {
          name: t.name || "Unknown",
          system: t.star_system_name || "Unknown",
        };
      }
    }
  }

  const rows: PriceRow[] = [];

  for (const entry of pricesData) {
    const commodityCode = commodityCodeMap[entry.id_commodity] ||
      entry.commodity_name?.substring(0, 4).toUpperCase() || "";
    const terminal = terminalMap[entry.id_terminal];
    const terminalName = entry.terminal_name || terminal?.name || `Terminal ${entry.id_terminal}`;
    const system = terminal?.system || "Unknown";

    if (entry.price_buy && entry.price_buy > 0) {
      rows.push({
        commodity_abbr: commodityCode,
        station: terminalName,
        system,
        direction: "buy",
        price: Math.round(entry.price_buy),
      });
    }

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

// ─── Route handler ──────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let rows: PriceRow[] = [];
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      // CSV file upload
      const formData = await request.formData();
      const file = formData.get("file");
      if (file && typeof file === "object" && "text" in file) {
        const csvContent = await (file as File).text();
        rows = parseUEXCSV(csvContent);
      }
    } else {
      const body = await request.json();

      if (body.source === "api") {
        // Fetch from UEX API
        rows = await fetchFromUEXAPI();
      } else if (body.csvContent) {
        // Raw CSV text
        rows = parseUEXCSV(body.csvContent);
      }
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "No price data found" },
        { status: 400 }
      );
    }

    // Stats
    const commodities = new Set(rows.map((r) => r.commodity_abbr));
    const stations = new Set(rows.map((r) => r.station));

    // Clear existing data
    await supabase
      .from("commodity_prices")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");

    // Insert in batches
    const BATCH_SIZE = 500;
    let inserted = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from("commodity_prices").insert(batch);

      if (error) {
        const { error: upsertError } = await supabase
          .from("commodity_prices")
          .upsert(batch, { onConflict: "commodity_abbr,station,direction" });
        if (upsertError) {
          errors.push(`Batch ${i}: ${upsertError.message}`);
          continue;
        }
      }
      inserted += batch.length;
    }

    return NextResponse.json({
      success: true,
      stats: {
        totalRows: rows.length,
        inserted,
        commodities: commodities.size,
        stations: stations.size,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
