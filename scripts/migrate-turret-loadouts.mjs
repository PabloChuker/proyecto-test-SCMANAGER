/**
 * migrate-turret-loadouts.mjs
 * ============================================================================
 * Populates the loadout_json column for turret hardpoints in ship_hardpoints.
 *
 * Problem: Turret hardpoints (Manned Turret, Remote Turret, etc.) are stored
 * in the DB without their sub-weapons. The loadout_json column is NULL, so the
 * DPS calculator can't display turret weapons.
 *
 * Solution: Fetch turret sub-weapon data from the Star Citizen Wiki API
 * (api.star-citizen.wiki) for each ship, match turrets by class_name, and
 * populate the loadout_json with gimbals + weapons.
 *
 * Usage:
 *   node scripts/migrate-turret-loadouts.mjs
 *
 * Requires: npm install pg  (in project root or globally)
 * ============================================================================
 */

import pg from "pg";
const { Client } = pg;

// ─── Config ─────────────────────────────────────────────────────────────────
const DB_URL =
  process.env.DIRECT_URL ||
  process.env.DATABASE_URL ||
  "postgresql://postgres.htqfrcxtsghhcmimxdad:CQpCrOz0HzmWF5Ok@aws-1-us-west-2.pooler.supabase.com:5432/postgres";

const SC_WIKI_API = "https://api.star-citizen.wiki/api/v2/vehicles";
const DELAY_MS = 350; // Delay between API calls to be respectful

// ─── Helpers ────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJSON(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  return resp.json();
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log("🔧 Turret Loadout Migration Script");
  console.log("═══════════════════════════════════════════════════════════\n");

  // 1. Connect to DB
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("✅ Connected to database\n");

  // 2. Get all distinct ship references that have turret hardpoints
  //    (where default_item_class is not null and name/type suggests turret)
  const turretHpRows = await client.query(`
    SELECT DISTINCT ship_reference, id, hardpoint_name, hardpoint_type,
           default_item_class, default_item_name, max_size, loadout_json
    FROM ship_hardpoints
    WHERE (
      LOWER(default_item_name) LIKE '%turret%'
      OR LOWER(hardpoint_name) LIKE '%turret%'
      OR LOWER(hardpoint_type) LIKE '%turret%'
    )
    AND hardpoint_type NOT IN ('ManneuverThruster', 'MainThruster', 'Armor', 'FuelTank', 'FuelIntake')
    ORDER BY ship_reference, hardpoint_name
  `);

  console.log(`📋 Found ${turretHpRows.rows.length} turret hardpoints in DB\n`);

  // Group by ship_reference
  const shipTurrets = new Map();
  for (const row of turretHpRows.rows) {
    if (!shipTurrets.has(row.ship_reference)) {
      shipTurrets.set(row.ship_reference, []);
    }
    shipTurrets.get(row.ship_reference).push(row);
  }

  console.log(`🚀 Processing ${shipTurrets.size} ships with turrets...\n`);

  // 3. Get all ships from our DB to map reference → wiki class_name
  const allShips = await client.query(`SELECT id, reference, name FROM ships ORDER BY name`);
  const shipRefToName = new Map();
  for (const s of allShips.rows) {
    shipRefToName.set(s.reference, s.name);
  }

  // 4. Fetch all vehicles from Star Citizen Wiki API (paginated)
  console.log("📡 Fetching vehicle list from Star Citizen Wiki API...");
  const wikiVehicles = new Map(); // class_name → vehicle slug
  let page = 1;
  let lastPage = 1;
  while (page <= lastPage) {
    const json = await fetchJSON(`${SC_WIKI_API}?limit=50&page=${page}`);
    lastPage = json.meta?.last_page || 1;
    for (const v of json.data || []) {
      wikiVehicles.set(v.class_name, v.class_name);
      // Also index by name for fuzzy matching
      wikiVehicles.set(v.name?.toLowerCase(), v.class_name);
      wikiVehicles.set(v.game_name?.toLowerCase(), v.class_name);
    }
    page++;
    await sleep(200);
  }
  console.log(`✅ Loaded ${wikiVehicles.size} vehicle entries from wiki\n`);

  // 5. Process each ship
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const [shipRef, turretRows] of shipTurrets) {
    const shipName = shipRefToName.get(shipRef) || shipRef;
    process.stdout.write(`  → ${shipName} (${shipRef}): `);

    // Try to find wiki class_name from ship reference
    let wikiClassName = wikiVehicles.get(shipRef);
    if (!wikiClassName) {
      // Try fuzzy: remove suffixes like _BIS2950
      const baseRef = shipRef.replace(/_BIS\d+$/, "").replace(/_\d+$/, "");
      wikiClassName = wikiVehicles.get(baseRef);
    }
    if (!wikiClassName) {
      // Try by name
      wikiClassName = wikiVehicles.get(shipName?.toLowerCase());
    }

    if (!wikiClassName) {
      console.log(`⏭️  No wiki match found`);
      skipped++;
      continue;
    }

    // Fetch detailed vehicle data from wiki
    let vehicleData;
    try {
      await sleep(DELAY_MS);
      const json = await fetchJSON(`${SC_WIKI_API}/${wikiClassName}`);
      vehicleData = json.data;
    } catch (e) {
      console.log(`❌ API error: ${e.message}`);
      errors++;
      continue;
    }

    if (!vehicleData?.turrets) {
      console.log(`⏭️  No turret data in wiki`);
      skipped++;
      continue;
    }

    // Build lookup: turret class_name → wiki turret data (from all categories)
    const wikiTurretsByClass = new Map();
    const wikiTurretsByHp = new Map();
    for (const [category, list] of Object.entries(vehicleData.turrets)) {
      for (const t of list) {
        if (t.class_name) wikiTurretsByClass.set(t.class_name, { ...t, category });
        if (t.hardpoint_name) wikiTurretsByHp.set(t.hardpoint_name, { ...t, category });
      }
    }

    // Match each DB turret hardpoint to wiki turret data
    let shipUpdated = 0;
    for (const dbRow of turretRows) {
      // Skip if already has loadout_json with data
      if (dbRow.loadout_json && Array.isArray(dbRow.loadout_json) && dbRow.loadout_json.length > 0) {
        continue;
      }

      // Match by class_name first, then by hardpoint_name
      let wikiTurret =
        wikiTurretsByClass.get(dbRow.default_item_class) ||
        wikiTurretsByHp.get(dbRow.hardpoint_name);

      if (!wikiTurret || !wikiTurret.mounts || wikiTurret.mounts.length === 0) {
        continue;
      }

      // Build loadout_json from wiki mounts
      const loadoutJson = [];
      for (const mount of wikiTurret.mounts) {
        // Each mount is a gimbal/weapon slot in the turret
        const weaponClassName = mount.weapons?.[0] || mount.payload_class_names?.[0] || null;
        const gimbalClassName = mount.class_name;
        const hpName = mount.hardpoint_name;
        const weaponSize = mount.weapon_sizes?.[0] || mount.size || 0;

        // If mount has a gimbal (Mount_Gimbal_SX), the gimbal contains the weapon
        if (gimbalClassName && gimbalClassName.startsWith("Mount_Gimbal")) {
          // The gimbal entry with its weapon as nested
          loadoutJson.push({
            HardpointName: hpName,
            ClassName: gimbalClassName,
            Type: "Turret.GunTurret",
            MaxSize: mount.size || weaponSize,
            Size: mount.size || weaponSize,
            Children: weaponClassName
              ? [
                  {
                    HardpointName: "hardpoint_class_2",
                    ClassName: weaponClassName,
                    Type: "WeaponGun.Gun",
                    MaxSize: weaponSize,
                    Size: weaponSize,
                  },
                ]
              : [],
          });
        } else if (weaponClassName) {
          // Direct weapon mount (no gimbal)
          loadoutJson.push({
            HardpointName: hpName,
            ClassName: weaponClassName,
            Type: "WeaponGun.Gun",
            MaxSize: weaponSize,
            Size: weaponSize,
          });
        }
      }

      if (loadoutJson.length === 0) continue;

      // Update DB
      try {
        await client.query(
          `UPDATE ship_hardpoints SET loadout_json = $1 WHERE id = $2`,
          [JSON.stringify(loadoutJson), dbRow.id]
        );
        shipUpdated++;
        updated++;
      } catch (e) {
        console.log(`❌ DB error for ${dbRow.hardpoint_name}: ${e.message}`);
        errors++;
      }
    }

    if (shipUpdated > 0) {
      console.log(`✅ Updated ${shipUpdated} turret(s)`);
    } else {
      console.log(`⏭️  No updates needed`);
    }
  }

  // 6. Summary
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(`✅ Updated: ${updated} turret hardpoints`);
  console.log(`⏭️  Skipped: ${skipped} ships (no wiki match or no turret data)`);
  console.log(`❌ Errors:  ${errors}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  await client.end();
  console.log("🔧 Done! Turret loadouts have been populated.");
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
