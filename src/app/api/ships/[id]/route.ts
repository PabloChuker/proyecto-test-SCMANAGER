// =============================================================================
// AL FILO — GET /api/ships/[id] v10 (New ship_hardpoints schema)
//
// Uses the new ship_hardpoints table populated from sc-unpacked JSON.
// Hardpoints JOIN with component tables (weapon_guns, shields, power_plants,
// coolers, quantum_drives) via default_item_class = class_name.
// Nested loadout (gimbals→weapons, racks→missiles) stored in loadout_json.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
// Fallback: static JSON for data not yet in DB (flight controllers, etc.)
import powerNetworkLookup from "@/data/power-network-lookup.json";
import shipPowerData from "@/data/ship-power-data.json";

export const revalidate = 300;

// ─── Helpers ────────────────────────────────────────────────────────────────

function numOrNull(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function col(row: any, ...keys: string[]): any {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null) return row[k];
  }
  return null;
}

/** Convert numeric grade (1,2,3) to letter (A,B,C,D) */
function gradeToLetter(g: any): string | null {
  if (g === null || g === undefined) return null;
  const GRADE_MAP: Record<number, string> = { 1: "A", 2: "B", 3: "C", 4: "D" };
  const n = Number(g);
  if (!isNaN(n) && GRADE_MAP[n]) return GRADE_MAP[n];
  if (typeof g === "string" && g.length === 1) return g.toUpperCase();
  return String(g);
}

// ─── Power network lookup helper ─────────────────────────────────────────────

const pnLookup = powerNetworkLookup as Record<string, any>;
const spLookup = shipPowerData as Record<string, any>;

function getPowerNetworkInfo(className: string | null): any | null {
  if (!className) return null;
  return pnLookup[className] ?? null;
}

/** Build powerNetwork object from DB columns (new power model).
 *  Falls back to JSON lookup if DB columns are empty. */
function buildPowerNetwork(row: any, componentType: string): any | null {
  const className = row.class_name;
  // If we have power model data in DB columns, use them
  const pMin = numOrNull(row.power_consumption_min);
  const pMax = numOrNull(row.power_consumption_max);
  const cMin = numOrNull(row.coolant_consumption_min);
  const cMax = numOrNull(row.coolant_consumption_max);
  const pips = numOrNull(row.pips);
  const ranges = row.power_ranges ?? null; // already jsonb
  const emMax = numOrNull(row.em_max);
  const irMax = numOrNull(row.ir_max);

  // For power plants: generation fields
  const genP = componentType === "PowerPlant" ? numOrNull(row.power_generation) : null;
  const genC = componentType === "Cooler" ? numOrNull(row.cooling_generation) : null;

  // If we have at least SOME DB power data, build from DB
  if (pMin !== null || pMax !== null || pips !== null || genP !== null || genC !== null) {
    return {
      type: componentType,
      pMin, pMax, cMin, cMax,
      genP, genC,
      pips,
      ranges: Array.isArray(ranges) ? ranges : null,
      em: emMax,
      ir: irMax,
    };
  }

  // Fallback to static JSON
  return getPowerNetworkInfo(className);
}

// ─── Hardpoint type → store category mapping ────────────────────────────────

const HP_TYPE_TO_CATEGORY: Record<string, string> = {
  Weapon: "WEAPON",
  Shield: "SHIELD",
  PowerPlant: "POWER_PLANT",
  Cooler: "COOLER",
  QuantumDrive: "QUANTUM_DRIVE",
  Radar: "RADAR",
  Countermeasure: "COUNTERMEASURE",
  ManneuverThruster: "THRUSTER_MANEUVERING",
  MainThruster: "THRUSTER_MAIN",
  Armor: "ARMOR",
  FuelTank: "FUEL_TANK",
  FuelIntake: "FUEL_INTAKE",
  LifeSupportGenerator: "LIFE_SUPPORT",
  TurretBase: "TURRET",
  Turret: "TURRET",
  // Industrial (Pablo, 2026-04-17): naves mineras / salvage necesitan que estos
  // hpTypes se promuevan a MINING / SALVAGE para no quedar filtrados como OTHER.
  MiningLaser: "MINING",
  MiningModifier: "MINING",
  SalvageLaser: "SALVAGE",
  SalvageModifier: "SALVAGE",
  SalvageHead: "SALVAGE",
  Tool: "UTILITY",
  TractorBeam: "UTILITY",
  Cargo: "UTILITY",
  EMP: "UTILITY",
};

function hpCategory(hpType: string, hpName: string): string {
  const n = hpName.toLowerCase();

  // 2026-04-17: industrial name detection gana SIEMPRE sobre HP_TYPE_TO_CATEGORY.
  // Razón: en el Reclaimer los salvage arms vienen como hpType="Turret", así que
  // el mapa genérico los mandaba a "TURRET" y nunca aparecían en el widget de
  // salvage. El nombre (`hardpoint_remote_turret_salvage_*`) es el signal más
  // fuerte, así que se chequea primero.
  if (n.includes("salvage") || n.includes("scraper")) return "SALVAGE";
  if (n.includes("mining")) return "MINING";
  if (n.includes("tractor") || n.includes("cargo_beam")) return "UTILITY";

  if (HP_TYPE_TO_CATEGORY[hpType]) return HP_TYPE_TO_CATEGORY[hpType];
  // Try base type (e.g. "LifeSupportGenerator.UNDEFINED" → "LifeSupportGenerator")
  const baseType = hpType.split(".")[0];
  if (baseType !== hpType && HP_TYPE_TO_CATEGORY[baseType]) return HP_TYPE_TO_CATEGORY[baseType];
  // Fallback: infer from name (resto de categorías no-industriales)
  if (n.includes("turret")) return "TURRET";
  if (n.includes("weapon") || n.includes("gun")) return "WEAPON";
  if (n.includes("missile")) return "MISSILE_RACK";
  if (n.includes("shield")) return "SHIELD";
  if (n.includes("power_plant")) return "POWER_PLANT";
  if (n.includes("cooler")) return "COOLER";
  // Quantum Fuel Tank (hardpoint_quantum_fuel_tank) matcheaba "quantum" y
  // aparecía en el widget QT DRIVES. Los fuel tanks van en OTHER — el widget
  // QT DRIVES solo muestra quantum drives reales (spool time, jump speed).
  if (n.includes("fuel_tank") || n.includes("quantum_fuel")) return "OTHER";
  if (n.includes("fuel_intake")) return "OTHER";
  if (n.includes("quantum")) return "QUANTUM_DRIVE";
  if (n.includes("radar")) return "RADAR";
  if (n.includes("countermeasure")) return "COUNTERMEASURE";
  if (n.includes("lifesupport") || n.includes("life_support")) return "LIFE_SUPPORT";
  return "OTHER";
}

// ─── Build equippedItem from component row ──────────────────────────────────

function buildWeaponItem(row: any): any {
  const dps_total =
    (numOrNull(row.dps_physical) ?? 0) +
    (numOrNull(row.dps_energy) ?? 0) +
    (numOrNull(row.dps_distortion) ?? 0) +
    (numOrNull(row.dps_thermal) ?? 0) +
    (numOrNull(row.dps_biochemical) ?? 0) +
    (numOrNull(row.dps_stun) ?? 0);

  const alpha_total =
    (numOrNull(row.alpha_physical) ?? 0) +
    (numOrNull(row.alpha_energy) ?? 0) +
    (numOrNull(row.alpha_distortion) ?? 0) +
    (numOrNull(row.alpha_thermal) ?? 0) +
    (numOrNull(row.alpha_biochemical) ?? 0) +
    (numOrNull(row.alpha_stun) ?? 0);

  return {
    id: row.id || row.class_name,
    reference: row.class_name || "",
    name: row.name || row.item_name || "",
    localizedName: null,
    className: row.class_name,
    type: "WEAPON",
    size: numOrNull(row.size),
    grade: gradeToLetter(row.grade),
    manufacturer: row.manufacturer_id ?? null,
    componentStats: {
      alphaDamage: alpha_total,
      dps: dps_total,
      fireRate: numOrNull(row.rate_of_fire),
      damagePerShot: numOrNull(row.damage_per_shot),
      alphaPhysical: numOrNull(row.alpha_physical),
      alphaEnergy: numOrNull(row.alpha_energy),
      alphaDistortion: numOrNull(row.alpha_distortion),
      effectiveRange: numOrNull(row.effective_range),
      ammoSpeed: numOrNull(row.ammo_speed),
      ammoCapacity: numOrNull(row.ammo_capacity),
      fireMode: row.fire_mode ?? null,
      heatPerShot: numOrNull(row.heat_per_shot),
      emSignature: numOrNull(row.emission_em_max),
      penetrationDistance: numOrNull(row.penetration_distance),
      maxPenetrationThickness: numOrNull(row.max_penetration_thickness),
      // Ammo / capacitor
      weaponCapacity: numOrNull(row.weapon_capacity),
      requestedAmmoLoad: numOrNull(row.requested_ammo_load),
      regenCostPerBullet: numOrNull(row.regen_cost_per_bullet),
      maxAmmoLoad: numOrNull(row.max_ammo_load),
      maxRegenPerSec: numOrNull(row.max_regen_per_sec),
      regenCooldown: numOrNull(row.regen_cooldown),
      // Thermal (sustained-DPS heat-limited)
      overheatTemperature: numOrNull(row.overheat_temperature),
      coolingPerSecond: numOrNull(row.cooling_per_second),
      overheatFixTime: numOrNull(row.overheat_fix_time),
      // Power model fields from DB
      powerDraw: numOrNull(row.power_consumption_max),
      powerDrawMin: numOrNull(row.power_consumption_min),
      powerDrawMax: numOrNull(row.power_consumption_max),
      irSignature: numOrNull(row.ir_max),
    },
    powerNetwork: buildPowerNetwork(row, "WeaponGun"),
  };
}

function buildShieldItem(row: any): any {
  return {
    id: row.id || row.class_name,
    reference: row.class_name || "",
    name: row.name || row.item_name || "",
    localizedName: null,
    className: row.class_name,
    type: "SHIELD",
    size: numOrNull(row.size),
    grade: gradeToLetter(row.grade),
    manufacturer: row.manufacturer_id ?? null,
    componentStats: {
      shieldHp: numOrNull(row.pool_hp),
      maxHp: numOrNull(row.pool_hp),
      shieldRegen: numOrNull(row.max_shield_regen),
      regenRate: numOrNull(row.max_shield_regen),
      regenTime: numOrNull(row.regen_time),
      downedDelay: numOrNull(row.downed_regen_delay),
      damagedDelay: numOrNull(row.damaged_regen_delay),
      powerDraw: numOrNull(row.power_consumption_max) ?? numOrNull(row.power_consumption),
      powerDrawMin: numOrNull(row.power_consumption_min),
      powerDrawMax: numOrNull(row.power_consumption_max),
      emSignature: numOrNull(row.em_max),
      // Resistance ranges (min/max as fraction, e.g. 0.25 = 25%)
      physicalResistanceMin: numOrNull(row.physical_resistance_min),
      physicalResistanceMax: numOrNull(row.physical_resistance_max),
      energyResistanceMin: numOrNull(row.energy_resistance_min),
      energyResistanceMax: numOrNull(row.energy_resistance_max),
      distortionResistanceMin: numOrNull(row.distortion_resistance_min),
      distortionResistanceMax: numOrNull(row.distortion_resistance_max),
      // Absorption ranges
      physicalAbsorptionMin: numOrNull(row.physical_absorption_min),
      physicalAbsorptionMax: numOrNull(row.physical_absorption_max),
      energyAbsorptionMin: numOrNull(row.energy_absorption_min),
      energyAbsorptionMax: numOrNull(row.energy_absorption_max),
      distortionAbsorptionMin: numOrNull(row.distortion_absorption_min),
      distortionAbsorptionMax: numOrNull(row.distortion_absorption_max),
      irSignature: numOrNull(row.ir_max),
    },
    powerNetwork: buildPowerNetwork(row, "Shield"),
  };
}

function buildPowerPlantItem(row: any): any {
  // power_generation column now has real values from the updated DB
  let powerGen = numOrNull(row.power_generation);
  // Fallback: try raw_data if column is still 0
  if (!powerGen || powerGen === 0) {
    powerGen = numOrNull(row.raw_data?.stdItem?.ResourceNetwork?.Usage?.Power?.Maximum) ?? 0;
  }

  // EM signature now directly available in the table
  let emSig = numOrNull(row.em_max);
  if (!emSig || emSig === 0) {
    emSig = numOrNull(row.raw_data?.stdItem?.Emission?.Em?.Maximum) ?? 0;
  }

  return {
    id: row.uuid || row.id || row.class_name,
    reference: row.class_name || "",
    name: row.name || "",
    localizedName: null,
    className: row.class_name,
    type: "POWER_PLANT",
    size: numOrNull(row.size),
    grade: gradeToLetter(row.grade),
    manufacturer: row.manufacturer_id ?? null,
    componentStats: {
      powerOutput: powerGen,
      powerDraw: numOrNull(row.power_consumption_max) ?? 0,
      powerDrawMin: numOrNull(row.power_consumption_min),
      powerDrawMax: numOrNull(row.power_consumption_max),
      emSignature: emSig,
      irSignature: numOrNull(row.ir_max),
      health: numOrNull(row.health),
    },
    powerNetwork: buildPowerNetwork(row, "PowerPlant"),
  };
}

function buildCoolerItem(row: any): any {
  return {
    id: row.id || row.class_name,
    reference: row.class_name || "",
    name: row.name || "",
    localizedName: null,
    className: row.class_name,
    type: "COOLER",
    size: numOrNull(row.size),
    grade: gradeToLetter(row.grade),
    manufacturer: row.manufacturer_id ?? null,
    componentStats: {
      coolingRate: numOrNull(row.cooling_generation),
      powerDraw: numOrNull(row.power_consumption_max) ?? numOrNull(row.power_consumption),
      powerDrawMin: numOrNull(row.power_consumption_min),
      powerDrawMax: numOrNull(row.power_consumption_max),
      emSignature: numOrNull(row.em_max),
      irSignature: numOrNull(row.ir_max),
      health: numOrNull(row.health),
    },
    powerNetwork: buildPowerNetwork(row, "Cooler"),
  };
}

function buildQuantumItem(row: any): any {
  return {
    id: row.uuid || row.class_name,
    reference: row.class_name || "",
    name: row.name || "",
    localizedName: null,
    className: row.class_name,
    type: "QUANTUM_DRIVE",
    size: numOrNull(row.size),
    grade: gradeToLetter(row.grade),
    manufacturer: row.manufacturer_id ?? null,
    componentStats: {
      maxSpeed: numOrNull(row.drive_speed),
      fuelRate: numOrNull(row.fuel_rate),
      cooldownTime: numOrNull(row.cooldown_time),
      spoolUpTime: numOrNull(row.spool_up_time),
      powerDraw: numOrNull(row.power_consumption_max),
      powerDrawMin: numOrNull(row.power_consumption_min),
      powerDrawMax: numOrNull(row.power_consumption_max),
      emSignature: numOrNull(row.em_max),
      irSignature: numOrNull(row.ir_max),
      health: numOrNull(row.health),
    },
    powerNetwork: buildPowerNetwork(row, "QuantumDrive"),
  };
}

// Build a generic item from ship_hardpoints data (no component table match)
function buildGenericItem(hp: any): any {
  if (!hp.default_item_name || hp.default_item_name === "") return null;
  return {
    id: hp.default_item_uuid || hp.id,
    reference: hp.default_item_class || "",
    name: hp.default_item_name || "",
    localizedName: null,
    className: hp.default_item_class,
    type: hp.hardpoint_type || "OTHER",
    size: numOrNull(hp.max_size),
    grade: gradeToLetter(hp.default_item_grade),
    manufacturer: hp.default_item_manufacturer ?? null,
    componentStats: null,
    powerNetwork: getPowerNetworkInfo(hp.default_item_class),
  };
}

// ─── Build children from loadout_json ───────────────────────────────────────

function buildChildren(
  loadoutJson: any[] | null,
  weaponMap: Map<string, any>,
  missileMap: Map<string, any>,
): any[] {
  if (!loadoutJson || !Array.isArray(loadoutJson)) return [];

  const results: any[] = [];

  for (let idx = 0; idx < loadoutJson.length; idx++) {
    const entry = loadoutJson[idx];
    const className = entry.ClassName || entry.className || "";
    let equippedItem: any = null;

    // Check if this is a gimbal/mount with nested Children (turret sub-weapons)
    const isGimbal = className.startsWith("Mount_Gimbal") ||
      entry.Type?.includes("Turret.GunTurret") ||
      entry.Type?.includes("TurretBase");

    if (isGimbal && Array.isArray(entry.Children) && entry.Children.length > 0) {
      // This is a gimbal inside a turret — flatten to show the actual weapons
      for (let ci = 0; ci < entry.Children.length; ci++) {
        const child = entry.Children[ci];
        const childClassName = child.ClassName || child.className || "";
        let childItem: any = null;

        if (weaponMap.has(childClassName)) {
          childItem = buildWeaponItem(weaponMap.get(childClassName));
        }
        if (!childItem) {
          childItem = {
            id: child.UUID || `child-${idx}-${ci}`,
            reference: childClassName,
            name: child.Name || childClassName,
            localizedName: null,
            className: childClassName,
            type: "WEAPON",
            size: child.Size ?? child.MaxSize ?? null,
            grade: null,
            manufacturer: null,
            componentStats: null,
          };
        }

        results.push({
          id: child.UUID || `child-${idx}-${ci}`,
          hardpointName: child.HardpointName || entry.HardpointName || `sub_${idx}_${ci}`,
          category: "WEAPON",
          minSize: 0,
          maxSize: child.MaxSize ?? childItem.size ?? entry.MaxSize ?? 0,
          isFixed: false,
          equippedItem: childItem,
        });
      }
      continue;
    }

    // ── Industrial heads (salvage / mining) ────────────────────────────────
    // Reclaimer et al. meten un SalvageHead como hijo del turret, y dentro
    // del SalvageHead.Loadout vienen los SalvageModifier (scraper, tractor).
    // Mole/Prospector: un MiningArm con WeaponMining + MiningModifier como Loadout.
    // Queremos mostrar head + modificadores como siblings dentro del widget.
    const entryTypeStr = String(entry.Type || "");
    const entryItemTypes = String(entry.ItemTypes || "");
    const isSalvageHead =
      entryTypeStr.startsWith("SalvageHead") || entryItemTypes.includes("SalvageHead");
    const isSalvageModifier =
      entryTypeStr.startsWith("SalvageModifier") || entryItemTypes.includes("SalvageModifier");
    const isMiningLaser =
      entryTypeStr.includes("WeaponMining") ||
      entryTypeStr.startsWith("MiningLaser") ||
      entryItemTypes.includes("WeaponMining") ||
      entryItemTypes.includes("MiningLaser");
    const isMiningModifier =
      entryTypeStr.startsWith("MiningModifier") || entryItemTypes.includes("MiningModifier");

    if (isSalvageHead || isSalvageModifier || isMiningLaser || isMiningModifier) {
      const industrialType = isSalvageHead || isSalvageModifier ? "SALVAGE" : "MINING";
      // Emitir el head/laser como child
      const headItem = {
        id: entry.UUID || `child-${idx}`,
        reference: className,
        name: entry.Name || className,
        localizedName: null,
        className,
        type: industrialType,
        size: entry.Size ?? entry.MaxSize ?? null,
        grade: gradeToLetter(entry.Grade),
        manufacturer: null,
        componentStats: null,
      };
      results.push({
        id: entry.UUID || `child-${idx}`,
        hardpointName: entry.HardpointName || `sub_${idx}`,
        category: industrialType,
        minSize: 0,
        maxSize: entry.MaxSize ?? entry.Size ?? 0,
        isFixed: false,
        equippedItem: headItem,
      });

      // Emitir modificadores nested (scraper/tractor/mining_modifier) también como siblings
      if (Array.isArray(entry.Loadout) && entry.Loadout.length > 0) {
        for (let li = 0; li < entry.Loadout.length; li++) {
          const sub = entry.Loadout[li];
          const subTypeStr = String(sub.Type || "");
          const subItemTypes = String(sub.ItemTypes || "");
          const subIsSalvage =
            subTypeStr.startsWith("SalvageModifier") ||
            subItemTypes.includes("SalvageModifier") ||
            subTypeStr.startsWith("SalvageHead") ||
            subItemTypes.includes("SalvageHead");
          const subIsMining =
            subTypeStr.startsWith("MiningModifier") ||
            subItemTypes.includes("MiningModifier") ||
            subTypeStr.includes("WeaponMining") ||
            subItemTypes.includes("WeaponMining") ||
            subItemTypes.includes("MiningLaser");
          if (!subIsSalvage && !subIsMining) continue;

          const subCat = subIsSalvage ? "SALVAGE" : "MINING";
          const subClass = sub.ClassName || sub.className || "";
          results.push({
            id: sub.UUID || `child-${idx}-sub-${li}`,
            hardpointName: sub.HardpointName || `sub_${idx}_${li}`,
            category: subCat,
            minSize: 0,
            maxSize: sub.MaxSize ?? sub.Size ?? 0,
            isFixed: false,
            equippedItem: {
              id: sub.UUID || `child-${idx}-sub-${li}`,
              reference: subClass,
              name: sub.Name || subClass,
              localizedName: null,
              className: subClass,
              type: subCat,
              size: sub.Size ?? sub.MaxSize ?? null,
              grade: gradeToLetter(sub.Grade),
              manufacturer: null,
              componentStats: null,
            },
          });
        }
      }
      continue;
    }

    // Direct weapon (no nested children)
    if (weaponMap.has(className)) {
      equippedItem = buildWeaponItem(weaponMap.get(className));
    }

    // If not found and it's a weapon type, build from loadout entry data
    if (!equippedItem && (entry.Type?.includes("WeaponGun") || isGimbal)) {
      equippedItem = {
        id: entry.UUID || `child-${idx}`,
        reference: className,
        name: entry.Name || className,
        localizedName: null,
        className,
        type: "WEAPON",
        size: entry.Size ?? null,
        grade: gradeToLetter(entry.Grade),
        manufacturer: null,
        componentStats: null,
      };
    }

    // Tractor beam
    if (!equippedItem && entry.Type?.includes("TractorBeam")) {
      equippedItem = {
        id: entry.UUID || `child-${idx}`,
        reference: className,
        name: entry.Name || className,
        localizedName: null,
        className,
        type: "WEAPON",
        size: entry.Size ?? entry.MaxSize ?? null,
        grade: gradeToLetter(entry.Grade),
        manufacturer: null,
        componentStats: null,
      };
    }

    // Missile
    if (!equippedItem && entry.Type?.includes("Missile")) {
      equippedItem = {
        id: entry.UUID || `child-${idx}`,
        reference: className,
        name: entry.Name || className,
        localizedName: null,
        className,
        type: "MISSILE_RACK",
        size: entry.Size ?? null,
        grade: gradeToLetter(entry.Grade),
        manufacturer: null,
        componentStats: entry.DamageTotal
          ? { alphaDamage: Number(entry.DamageTotal), damage: Number(entry.DamageTotal) }
          : null,
      };
    }

    if (!equippedItem) continue;

    results.push({
      id: entry.UUID || `child-${idx}`,
      hardpointName: entry.HardpointName || `sub_${idx}`,
      category: equippedItem.type === "MISSILE_RACK" ? "MISSILE_RACK" : "WEAPON",
      minSize: 0,
      maxSize: entry.MaxSize ?? equippedItem.size ?? 0,
      isFixed: false,
      equippedItem,
    });
  }

  return results;
}

// ─── Hardpoints industriales sintéticos ─────────────────────────────────────
//
// Contexto (2026-04-17): varias naves industriales (Mole/Moth/Prospector/Golem
// en mining, Vulture/Fortune/Salvation en salvage) NO tienen sus brazos en la
// tabla `ship_hardpoints` porque CIG los trata como parte fija de la geometría
// y scunpacked no los mete en la sección Loadout. Como consecuencia los
// widgets Mining/Salvage del LoadoutBuilder quedaban vacíos para estas naves.
//
// En lugar de re-ingestar (task #31), inyectamos hardpoints sintéticos con un
// equippedItem default razonable. Si el usuario cambia el componente desde el
// picker, la lógica del store de overrides lo maneja como cualquier otro.
// El Reclaimer NO está acá porque ya tiene los hardpoints reales en DB.

interface IndustrialChildDef {
  hardpointName: string;
  /** Para mining: MINING_MODULE (slot vacío que el user llena). Para salvage: SALVAGE. */
  category: "SALVAGE" | "MINING_MODULE" | "MINING";
  size: number;
  /** Si está, se emite el child con equippedItem pre-poblado (salvage default).
   *  Si no, el child queda vacío y el picker lo llena (mining modules). */
  defaultItem?: { className: string; name: string };
}

interface IndustrialArmDef {
  category: "MINING" | "SALVAGE";
  hardpointName: string;   // nombre único por brazo
  size: number;
  /** Override del minSize (default = 0 para MINING, = size para SALVAGE). */
  minSize?: number;
  /** true → arm fijo (ej. Golem con Pitman soldado). Bloquea el picker. */
  fixed?: boolean;
  /** Para mining: className que resuelve contra mining_lasers. Para salvage: placeholder del head. */
  equippedClass: string;
  equippedName: string;
  /** Sub-items embebidos (module slots para mining, tractor+scraper para salvage). */
  children?: IndustrialChildDef[];
}

// Regex ship_reference → lista de brazos a inyectar.
// Cada regex se evalúa contra `ship.reference` (ej. ARGO_MOLE, ARGO_MOLE_Carbon).
//
// Reglas por nave (tomadas del MiningLoadoutCalculator):
//  - Mole: 3 brazos S2 estrictos, Arbor MH2 default
//  - Prospector: 1 brazo S1 ≤ (Arbor MH1 default)
//  - Moth: 1 brazo S1 ≤ (Arbor MH1 default)
//  - Golem: 1 brazo FIJO con Pitman (no swap del laser)
//
// NOTA: los module slots (children MINING_MODULE) NO se inyectan acá. Se
// generan dinámicamente en el LoadoutBuilder según el `moduleSlots` del laser
// equipado (viene de mining_lasers.module_slots en el catálogo). Ej: Helix I
// tiene 2, Arbor MH1 tiene 1, Klein-S1 tiene 0, Impact II tiene 3.
const INDUSTRIAL_INJECTIONS: Array<{ match: RegExp; arms: IndustrialArmDef[] }> = [
  // ── MINING ──────────────────────────────────────────────────────────────
  // Mole: 3 brazos laterales S2 estricto. Default Arbor MH2.
  {
    match: /^ARGO_MOLE/i,
    arms: [1, 2, 3].map((i) => ({
      category: "MINING" as const,
      hardpointName: `hardpoint_mining_arm_${i}`,
      size: 2,
      minSize: 2, // estricto S2
      equippedClass: "Mining_Laser_MPUV_Arm_S2",
      equippedName: "Arbor MH2",
    })),
  },
  // Moth: 1 brazo S1 ≤. Default Arbor MH1.
  {
    match: /^ARGO_MOTH/i,
    arms: [{
      category: "MINING",
      hardpointName: "hardpoint_mining_arm",
      size: 1,
      equippedClass: "Mining_Laser_MPUV_Arm",
      equippedName: "Arbor MH1",
    }],
  },
  // Prospector: 1 brazo S1 ≤. Default Arbor MH1.
  {
    match: /^MISC_Prospector/i,
    arms: [{
      category: "MINING",
      hardpointName: "hardpoint_mining_arm",
      size: 1,
      equippedClass: "Mining_Laser_MPUV_Arm",
      equippedName: "Arbor MH1",
    }],
  },
  // Golem: 1 brazo FIJO con Pitman (no se puede cambiar el laser, solo los
  // módulos). Pitman tiene 2 module slots (se generan en runtime).
  {
    match: /^DRAK_Golem/i,
    arms: [{
      category: "MINING",
      hardpointName: "hardpoint_mining_arm",
      size: 1,
      fixed: true,
      equippedClass: "Mining_Laser_DRAK_Golem_S1",
      equippedName: "Pitman",
    }],
  },

  // ── SALVAGE ─────────────────────────────────────────────────────────────
  // Vulture: 1 brazo frontal con Baler + ReadyGrip Tractor + Trawler Scraper.
  {
    match: /^DRAK_Vulture/i,
    arms: [{
      category: "SALVAGE",
      hardpointName: "hardpoint_salvage_arm",
      size: 2,
      equippedClass: "Salvage_Head_standard",
      equippedName: "Baler Salvage Head",
      children: [
        {
          hardpointName: "hardpoint_salvage_subItem01",
          category: "SALVAGE",
          size: 1,
          defaultItem: { className: "Salvage_Modifier_Tractor_Small", name: "ReadyGrip Tractor Module" },
        },
        {
          hardpointName: "hardpoint_salvage_subItem02",
          category: "SALVAGE",
          size: 1,
          defaultItem: { className: "Salvage_Modifier_Scraper_Large", name: "Trawler Scraper Module" },
        },
      ],
    }],
  },
  // Fortune: 1 brazo salvage con stack por default.
  {
    match: /^MISC_Fortune/i,
    arms: [{
      category: "SALVAGE",
      hardpointName: "hardpoint_salvage_arm",
      size: 2,
      equippedClass: "Salvage_Head_standard",
      equippedName: "Baler Salvage Head",
      children: [
        {
          hardpointName: "hardpoint_salvage_subItem01",
          category: "SALVAGE",
          size: 1,
          defaultItem: { className: "Salvage_Modifier_Tractor_Small", name: "ReadyGrip Tractor Module" },
        },
        {
          hardpointName: "hardpoint_salvage_subItem02",
          category: "SALVAGE",
          size: 1,
          defaultItem: { className: "Salvage_Modifier_Scraper_Large", name: "Trawler Scraper Module" },
        },
      ],
    }],
  },
  // Salvation: nave de salvage grande. 4 brazos salvage por default.
  {
    match: /^RSI_Salvation/i,
    arms: [1, 2, 3, 4].map((i) => ({
      category: "SALVAGE" as const,
      hardpointName: `hardpoint_salvage_arm_${i}`,
      size: 3,
      equippedClass: "Salvage_Head_standard",
      equippedName: "Baler Salvage Head",
      children: [
        {
          hardpointName: `hardpoint_salvage_subItem01_${i}`,
          category: "SALVAGE" as const,
          size: 1,
          defaultItem: { className: "Salvage_Modifier_Tractor_Small", name: "ReadyGrip Tractor Module" },
        },
        {
          hardpointName: `hardpoint_salvage_subItem02_${i}`,
          category: "SALVAGE" as const,
          size: 1,
          defaultItem: { className: "Salvage_Modifier_Scraper_Large", name: "Trawler Scraper Module" },
        },
      ],
    })),
  },
];

/**
 * Construye hardpoints sintéticos (ya con shape final del API) para una nave
 * industrial que no tiene sus brazos en ship_hardpoints. Si la nave ya tiene
 * hardpoints reales de la categoría pedida, NO inyecta (evita duplicar en
 * Reclaimer et al.).
 */
function buildSyntheticIndustrialHardpoints(
  shipReference: string,
  existing: any[],
  miningLaserStats: Map<string, any> = new Map(),
): any[] {
  const out: any[] = [];
  for (const { match, arms } of INDUSTRIAL_INJECTIONS) {
    if (!match.test(shipReference)) continue;
    for (const arm of arms) {
      // Skip si la DB ya trae hardpoints de esa categoría (Reclaimer).
      const alreadyHas = existing.some((hp) => hp.category === arm.category);
      if (alreadyHas) continue;
      const idBase = `synthetic:${shipReference}:${arm.hardpointName}`;
      const isFixed = arm.fixed ?? false;
      // Para MINING: buscar stats del laser default en mining_lasers para que
      // componentStats.moduleSlots esté disponible desde el primer render.
      // Sin esto, el laser default muestra 0 slots hasta que el user elije
      // explícitamente un laser del picker.
      const defaultStats =
        arm.category === "MINING"
          ? miningLaserStats.get(arm.equippedClass) ?? null
          : null;
      const equippedItem = {
        id: `${idBase}:item`,
        reference: arm.equippedClass,
        name: arm.equippedName,
        localizedName: null,
        className: arm.equippedClass,
        type: arm.category,
        size: arm.size,
        grade: null,
        manufacturer: null,
        componentStats: defaultStats,
      };
      // Children: pueden venir con `defaultItem` (salvage: head pre-poblado con
      // tractor/scraper) o sin él (mining: slots vacíos que el user llena con
      // módulos del JSON mining-modules). El picker respeta cada caso.
      const childWeapons =
        arm.children?.map((ch, ci) => {
          const childEquipped = ch.defaultItem
            ? {
                id: `${idBase}:child:${ci}:item`,
                reference: ch.defaultItem.className,
                name: ch.defaultItem.name,
                localizedName: null,
                className: ch.defaultItem.className,
                type: ch.category,
                size: ch.size,
                grade: null,
                manufacturer: null,
                componentStats: null,
              }
            : null;
          return {
            id: `${idBase}:child:${ci}`,
            hardpointName: ch.hardpointName,
            category: ch.category,
            minSize: 0,
            maxSize: ch.size,
            isFixed: false,
            equippedItem: childEquipped,
            childWeapons: [],
          };
        }) ?? [];
      // Para MINING el default es minSize=0 (laser.size <= arm.size, mismo
      // criterio que el MiningLoadoutCalculator); para SALVAGE mantenemos
      // igualdad estricta. `arm.minSize` permite override explícito (Mole: S2).
      const minSize =
        arm.minSize !== undefined
          ? arm.minSize
          : arm.category === "MINING"
            ? 0
            : arm.size;
      out.push({
        id: idBase,
        hardpointName: arm.hardpointName,
        category: arm.category,
        minSize,
        maxSize: arm.size,
        isFixed,
        isManned: false,
        isInternal: true,
        equippedItem,
        childWeapons,
      });
    }
  }
  return out;
}

// ─── Main handler ───────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // ── 1. Find the ship (exact matches prioritized over partial) ──
    const shipRows: any[] = await sql.unsafe(
      `SELECT s.*, s.class_name AS reference, sp.msrp_usd, sp.warbond_usd, m.name AS manufacturer,
         CASE
           WHEN s.class_name = $1 THEN 0
           WHEN s.class_name ILIKE $1 THEN 1
           WHEN s.id::text = $1 THEN 2
           WHEN s.name ILIKE $1 THEN 3
           WHEN s.class_name ILIKE '%' || $1 || '%' THEN 4
         END AS match_rank
       FROM ships s
       LEFT JOIN ship_price sp ON sp.id = s.id
       LEFT JOIN manufacturers m ON m.id = s.manufacturer_id
       WHERE s.class_name = $1
          OR s.class_name ILIKE $1
          OR s.name ILIKE $1
          OR s.id::text = $1
          OR s.class_name ILIKE '%' || $1 || '%'
       ORDER BY match_rank ASC
       LIMIT 1`,
      [String(id)],
    );

    if (shipRows.length === 0) {
      return NextResponse.json({ error: "Nave no encontrada" }, { status: 404 });
    }

    const ship = shipRows[0];

    // ── 2. Load satellite data in parallel ──
    const [flightStats, fuelStats, powerRef, poolRows, resistances, insurance] = await Promise.all([
      sql.unsafe(`SELECT * FROM ship_flight_stats WHERE ship_id::text = $1 LIMIT 1`, [String(ship.id)])
        .then((rows: any[]) => rows[0] ?? null)
        .catch((e: unknown) => { console.warn("[ships/[id]] Could not load flight stats:", e); return null; }),
      sql.unsafe(`SELECT * FROM ship_fuel WHERE ship_id::text = $1 LIMIT 1`, [String(ship.id)])
        .then((rows: any[]) => rows[0] ?? null)
        .catch((e: unknown) => { console.warn("[ships/[id]] Could not load fuel stats:", e); return null; }),
      sql.unsafe(`SELECT * FROM ship_power_reference WHERE ship_id = $1 LIMIT 1`, [String(ship.id)])
        .then((rows: any[]) => rows[0] ?? null)
        .catch((e: unknown) => { console.warn("[ships/[id]] Could not load power reference:", e); return null; }),
      sql.unsafe(`SELECT item_type, max_size FROM ship_pools WHERE ship_id = $1`, [String(ship.id)])
        .then((rows: any[]) => rows ?? [])
        .catch((e: unknown) => { console.warn("[ships/[id]] Could not load ship pools:", e); return []; }),
      sql.unsafe(`SELECT * FROM ship_resistances WHERE ship_id::text = $1 LIMIT 1`, [String(ship.id)])
        .then((rows: any[]) => rows[0] ?? null)
        .catch((e: unknown) => { console.warn("[ships/[id]] Could not load ship resistances:", e); return null; }),
      sql.unsafe(`SELECT * FROM ship_insurance WHERE ship_id::text = $1 LIMIT 1`, [String(ship.id)])
        .then((rows: any[]) => rows[0] ?? null)
        .catch((e: unknown) => { console.warn("[ships/[id]] Could not load insurance:", e); return null; }),
    ]);

    // ── 3. Get hardpoints from NEW schema (match by ship reference) ──
    const hardpointRows: any[] = await sql.unsafe(
      `SELECT * FROM ship_hardpoints
       WHERE ship_reference = $1
       ORDER BY hardpoint_type, max_size DESC, hardpoint_name ASC`,
      [String(ship.reference)],
    );

    // ── 4. Collect all default_item_class values for batch lookup ──
    const allClasses = hardpointRows
      .map((hp) => hp.default_item_class)
      .filter((c) => c && c !== "");

    // Also collect class names from loadout_json children (including nested Children)
    const childClasses: string[] = [];
    for (const hp of hardpointRows) {
      const loadout = hp.loadout_json;
      if (Array.isArray(loadout)) {
        for (const entry of loadout) {
          if (entry.ClassName) childClasses.push(entry.ClassName);
          if (entry.className) childClasses.push(entry.className);
          // Turret gimbals may have nested Children with the actual weapons
          if (Array.isArray(entry.Children)) {
            for (const child of entry.Children) {
              if (child.ClassName) childClasses.push(child.ClassName);
              if (child.className) childClasses.push(child.className);
            }
          }
        }
      }
    }

    const uniqueClasses = [...new Set([...allClasses, ...childClasses])];

    // ── 5. Batch-fetch components from all tables ──
    const componentMap = new Map<string, { table: string; row: any }>();

    const batchFetch = async (
      table: string,
      classCol: string,
      classes: string[],
    ) => {
      if (classes.length === 0) return;
      try {
        const placeholders = classes.map((_, i) => `$${i + 1}`).join(",");
        const rows: any[] = await sql.unsafe(
          `SELECT * FROM ${table} WHERE ${classCol} IN (${placeholders})`,
          classes,
        );
        for (const row of rows) {
          componentMap.set(row[classCol], { table, row });
        }
      } catch {
        // Table might not exist or have issues — skip
      }
    };

    await Promise.all([
      batchFetch("weapon_guns", "class_name", uniqueClasses),
      batchFetch("shields", "class_name", uniqueClasses),
      batchFetch("power_plants", "class_name", uniqueClasses),
      batchFetch("coolers", "class_name", uniqueClasses),
      batchFetch("quantum_drives", "class_name", uniqueClasses),
    ]);

    // Build weapon map for child resolution
    const weaponMap = new Map<string, any>();
    for (const [cls, { table, row }] of componentMap) {
      if (table === "weapon_guns") weaponMap.set(cls, row);
    }
    // Missile map (missiles use 'name' not 'class_name', so we skip batch for now)
    const missileMap = new Map<string, any>();

    // ── 6. Build flatHardpoints ──
    const flatHardpointsFromDb = hardpointRows
      .map((hp) => {
        const category = hpCategory(hp.hardpoint_type, hp.hardpoint_name);

        // Skip non-useful hardpoints (thrusters, armor, fuel, etc. - info only)
        // Keep: combat + industrial (MINING/SALVAGE/UTILITY) + ship systems.
        // Los widgets mining/salvage del LoadoutBuilder necesitan que estos pasen.
        const USEFUL = new Set([
          "WEAPON", "TURRET", "MISSILE_RACK", "SHIELD", "POWER_PLANT",
          "COOLER", "QUANTUM_DRIVE", "RADAR", "COUNTERMEASURE", "LIFE_SUPPORT",
          "MINING", "SALVAGE", "UTILITY",
        ]);
        if (!USEFUL.has(category)) return null;

        // Skip empty weapon_rack / weapon_regen_pool hardpoints (non-functional slots)
        const hpNameLower = (hp.hardpoint_name || "").toLowerCase();
        if (
          !hp.default_item_class &&
          (hpNameLower.includes("weapon_rack") || hpNameLower.includes("weapon_regen_pool"))
        ) {
          return null;
        }

        // Build equippedItem from component table match
        let equippedItem: any = null;
        const cls = hp.default_item_class;
        if (cls && componentMap.has(cls)) {
          const { table, row } = componentMap.get(cls)!;
          switch (table) {
            case "weapon_guns":
              equippedItem = buildWeaponItem(row);
              break;
            case "shields":
              equippedItem = buildShieldItem(row);
              break;
            case "power_plants":
              equippedItem = buildPowerPlantItem(row);
              break;
            case "coolers":
              equippedItem = buildCoolerItem(row);
              break;
            case "quantum_drives":
              equippedItem = buildQuantumItem(row);
              break;
          }
        }

        // If no component match, build generic item from hardpoint data
        if (!equippedItem) {
          equippedItem = buildGenericItem(hp);
        }

        // For weapons: check if this is a gimbal/turret with nested weapons
        // The loadout_json contains the actual weapons inside gimbals
        const children = buildChildren(hp.loadout_json, weaponMap, missileMap);

        // Detect turrets: by children, by item name, or by hardpoint name
        let finalCategory = category;
        const itemName = (equippedItem?.name || "").toLowerCase();
        const isMissileRack = itemName.includes("missile") || hpNameLower.includes("missile");
        if (category === "WEAPON" && children.length > 0 && !isMissileRack) {
          finalCategory = "TURRET";
        } else if (
          category === "WEAPON" && !isMissileRack &&
          (itemName.includes("turret") || hpNameLower.includes("turret"))
        ) {
          finalCategory = "TURRET";
        } else if (isMissileRack) {
          finalCategory = "MISSILE_RACK";
        }

        return {
          id: hp.id,
          hardpointName: hp.hardpoint_name,
          category: finalCategory,
          minSize: hp.min_size ?? 0,
          maxSize: hp.max_size ?? 0,
          isFixed: !hp.editable,
          isManned: false,
          isInternal:
            finalCategory !== "WEAPON" &&
            finalCategory !== "TURRET" &&
            finalCategory !== "MISSILE_RACK",
          equippedItem,
          childWeapons: children,
        };
      })
      .filter(Boolean);

    // ── 6b. Inyectar hardpoints industriales sintéticos ──
    // Contexto: Mole/Moth/Prospector/Golem (mining) y Vulture/Fortune/Salvation
    // (salvage) NO tienen sus brazos en ship_hardpoints porque CIG los modela
    // como geometría fija. Sin esto los widgets Mining/Salvage del
    // LoadoutBuilder aparecen vacíos. Reclaimer ya tiene data real y se skipea.
    //
    // Pre-fetch mining_lasers una vez para poblar componentStats del laser
    // default (crítico: moduleSlots se usa para renderizar los slots de módulos
    // en el LoadoutBuilder). Solo hace la query si la nave es industrial.
    const needsIndustrial = /^(ARGO_MOLE|ARGO_MOTH|MISC_Prospector|DRAK_Golem|DRAK_Vulture|MISC_Fortune|RSI_Salvation)/i
      .test(String(ship.reference ?? ""));
    let miningLaserStats = new Map<string, any>();
    if (needsIndustrial) {
      // Migrado a weapon_mining (Fase L.1 — migración 054). Esta tabla tiene
      // el class_name canonical del juego, así que ya no necesitamos mapear
      // manualmente arbor-mh1 → Mining_Laser_MPUV_Arm — usamos class_name
      // directo y matcheamos contra el hardpoint del ship.
      const lasers: any[] = await sql.unsafe(
        `SELECT id, name, class_name, size,
                mining_laser_power, resistance, instability,
                optimal_range, maximum_range, throttle_rate, throttle_min,
                heat_output, shatter_damage, module_slots
           FROM weapon_mining`,
      ).catch((e: unknown) => { console.warn("[ships/[id]] weapon_mining fetch failed:", e); return []; });
      for (const l of lasers) {
        // class_name directo como key (ej. Mining_Laser_MPUV_Arm, Mining_Laser_DRAK_Golem_S1).
        // Varias filas pueden tener el mismo name (ej. Arbor MH1 aparece en 4
        // class_names distintos), cada una se inserta por su class_name único.
        miningLaserStats.set(String(l.class_name), {
          miningPower: l.mining_laser_power,
          resistance: l.resistance,
          instability: l.instability,
          optimalRange: l.optimal_range,
          maxRange: l.maximum_range,
          throttleRate: l.throttle_rate,
          throttleMin: l.throttle_min,
          heatOutput: l.heat_output,
          shatterDamage: l.shatter_damage,
          moduleSlots: l.module_slots,
        });
      }
    }
    const syntheticIndustrial = buildSyntheticIndustrialHardpoints(
      String(ship.reference ?? ""),
      flatHardpointsFromDb as any[],
      miningLaserStats,
    );
    const flatHardpoints = [...flatHardpointsFromDb, ...syntheticIndustrial];

    // ── 7. Build response ──
    const scmSpeed =
      numOrNull(col(ship, "scm_speed", "scmSpeed")) ??
      numOrNull(col(flightStats, "scm_speed", "scmSpeed"));
    const afterburnerSpeed =
      numOrNull(col(ship, "afterburner_speed", "afterburnerSpeed")) ??
      numOrNull(col(flightStats, "max_speed", "maxSpeed"));

    const data = {
      id: ship.id,
      reference: ship.reference,
      name: ship.name,
      localizedName: null,
      manufacturer: ship.manufacturer,
      gameVersion: col(ship, "game_version", "gameVersion") ?? "",
      type: "SHIP",
      msrpUsd: numOrNull(ship.msrp_usd),
      warbondUsd: numOrNull(ship.warbond_usd),
      ship: {
        scmSpeed,
        afterburnerSpeed,
        pitchRate: numOrNull(col(flightStats, "pitch", "pitchRate")),
        yawRate: numOrNull(col(flightStats, "yaw", "yawRate")),
        rollRate: numOrNull(col(flightStats, "roll", "rollRate")),
        maxCrew: col(ship, "crew", "maxCrew"),
        cargo: numOrNull(
          col(ship, "cargo_capacity", "cargoCapacity", "cargo"),
        ),
        role: ship.role ?? null,
        focus: null,
        career: null,
        size: ship.size ?? null,
        mass: numOrNull(ship.mass_total_kg) ?? numOrNull(col(flightStats, "mass_total", "mass_loadout", "mass_empty")),
        boostSpeedForward: numOrNull(
          col(flightStats, "boost_speed_forward", "boostSpeedForward"),
        ),
        accelForward: numOrNull(
          col(flightStats, "accel_forward", "accelForward"),
        ),
        accelBackward: numOrNull(
          col(flightStats, "accel_backward", "accelBackward"),
        ),
        accelUp: numOrNull(col(flightStats, "accel_up", "accelUp")),
        accelDown: numOrNull(col(flightStats, "accel_down", "accelDown")),
        accelStrafe: numOrNull(
          col(flightStats, "accel_strafe", "accelStrafe"),
        ),
        boostSpeedBackward: numOrNull(
          col(flightStats, "boost_speed_backward", "boostSpeedBackward"),
        ),
        boostMultUp: numOrNull(
          col(flightStats, "boost_mult_up", "boostMultUp"),
        ),
        boostMultStrafe: numOrNull(
          col(flightStats, "boost_mult_strafe", "boostMultStrafe"),
        ),
        boostedPitch: numOrNull(
          col(flightStats, "pitch_boosted", "boosted_pitch", "boostedPitch"),
        ),
        boostedYaw: numOrNull(col(flightStats, "yaw_boosted", "boosted_yaw", "boostedYaw")),
        boostedRoll: numOrNull(
          col(flightStats, "roll_boosted", "boosted_roll", "boostedRoll"),
        ),
        hydrogenCapacity: numOrNull(
          col(fuelStats, "hydrogen_capacity", "hydrogenCapacity"),
        ),
        quantumFuelCapacity: numOrNull(
          col(fuelStats, "quantum_fuel_capacity", "quantumFuelCapacity"),
        ),
        quantumRange: numOrNull(
          col(fuelStats, "quantum_range", "quantumRange"),
        ),
        shieldHpTotal: numOrNull(
          col(fuelStats, "shield_hp_total", "shieldHpTotal"),
        ),
        powerGeneration: numOrNull(
          col(fuelStats, "power_generation", "powerGeneration"),
        ),
        hullHp: numOrNull(col(fuelStats, "hull_hp", "hullHp")) ?? numOrNull(resistances?.armor_hp),
        // Flight extras — not in original API
        navSpeed: numOrNull(col(flightStats, "max_speed", "maxSpeed")),
        boostRampUp: numOrNull(col(flightStats, "zero_to_scm", "zeroToScm")),
        boostRampDown: numOrNull(col(flightStats, "scm_to_zero", "scmToZero")),
        deflectionPhysical: numOrNull(ship.deflection_physical),
        deflectionEnergy: numOrNull(ship.deflection_energy),
        deflectionDistortion: numOrNull(ship.deflection_distortion),
        // Physical dimensions (from ships table)
        lengthMeters: numOrNull(ship.length_meters ?? ship.length),
        beamMeters: numOrNull(ship.beam_meters ?? ship.beam),
        heightMeters: numOrNull(ship.height_meters ?? ship.height),
        // Base signatures (from ships table)
        baseEmSignature: numOrNull(ship.base_em_signature),
        baseIrSignature: numOrNull(ship.base_ir_signature),
        baseCsSignature: numOrNull(ship.base_cs_signature),
        // Hull / armor resistances (full ship_resistances row)
        resistances: resistances ? {
          armorHp: numOrNull(resistances.armor_hp),
          // Damage multipliers: < 1 = resistance (e.g. 0.75 = 25% reduction)
          dmgMultPhysical: numOrNull(resistances.dmg_mult_physical),
          dmgMultEnergy: numOrNull(resistances.dmg_mult_energy),
          dmgMultDistortion: numOrNull(resistances.dmg_mult_distortion),
          dmgMultThermal: numOrNull(resistances.dmg_mult_thermal),
          dmgMultBiochemical: numOrNull(resistances.dmg_mult_biochemical),
          dmgMultStun: numOrNull(resistances.dmg_mult_stun),
          // Signature multipliers (stealth variants: Ghost, Stalker, etc.)
          sigMultCrossSection: numOrNull(resistances.sig_mult_cross_section),
          sigMultInfrared: numOrNull(resistances.sig_mult_infrared),
          sigMultElectromagnetic: numOrNull(resistances.sig_mult_electromagnetic),
          // Penetration resistances
          penResistBase: numOrNull(resistances.pen_resist_base),
          penResistPhysical: numOrNull(resistances.pen_resist_physical),
          penResistEnergy: numOrNull(resistances.pen_resist_energy),
          penResistDistortion: numOrNull(resistances.pen_resist_distortion),
          // Base signatures (pre-loadout)
          baseEmSignature: numOrNull(resistances.base_em_signature),
          baseIrSignature: numOrNull(resistances.base_ir_signature),
          baseCsSignature: numOrNull(resistances.base_cs_signature),
          // Cross-section dimensions
          crossSectionX: numOrNull(resistances.cross_section_x),
          crossSectionY: numOrNull(resistances.cross_section_y),
          crossSectionZ: numOrNull(resistances.cross_section_z),
          // Total signatures by mode (shields on vs quantum)
          emTotalShields: numOrNull(resistances.em_total_shields),
          emTotalQuantum: numOrNull(resistances.em_total_quantum),
          irTotalShields: numOrNull(resistances.ir_total_shields),
          irTotalQuantum: numOrNull(resistances.ir_total_quantum),
        } : null,
      },
    };

    // Ship-level power data: prefer DB (ship_power_reference), fallback to static JSON
    const shipClassName = ship.reference || "";

    // Build pools map from DB
    const poolsMap: Record<string, number> = {};
    for (const p of poolRows as any[]) {
      poolsMap[p.item_type] = numOrNull(p.max_size) ?? 0;
    }

    // shipPower: DB-backed power snapshot
    const shipPower = powerRef ? {
      // Core power model
      gen: numOrNull(powerRef.power_generation_segments),
      usedScm: numOrNull(powerRef.power_used_scm),
      usedNav: numOrNull(powerRef.power_used_nav),
      usedGroupedScm: powerRef.power_used_grouped_scm ?? null,
      usedGroupedNav: powerRef.power_used_grouped_nav ?? null,
      // Cooling model
      coolingGen: numOrNull(powerRef.cooling_generation_segments),
      coolingUsedScm: numOrNull(powerRef.cooling_used_scm),
      coolingUsedNav: numOrNull(powerRef.cooling_used_nav),
      coolingUsedPctScm: numOrNull(powerRef.cooling_used_pct_scm),
      coolingUsedPctNav: numOrNull(powerRef.cooling_used_pct_nav),
      coolingUsedGroupedScm: powerRef.cooling_used_grouped_scm ?? null,
      coolingUsedGroupedNav: powerRef.cooling_used_grouped_nav ?? null,
      // Emission model
      emShields: numOrNull(powerRef.em_shields),
      emQuantum: numOrNull(powerRef.em_quantum),
      irShields: numOrNull(powerRef.ir_shields),
      irQuantum: numOrNull(powerRef.ir_quantum),
      emPerSegment: numOrNull(powerRef.em_per_segment),
      emGroupsScm: powerRef.em_groups_scm ?? null,
      emGroupsNav: powerRef.em_groups_nav ?? null,
      // Ship totals
      totalShieldHp: numOrNull(powerRef.total_shield_hp),
      totalShieldRegen: numOrNull(powerRef.total_shield_regen),
      distortionPool: numOrNull(powerRef.distortion_pool),
      fuelHydrogen: numOrNull(powerRef.fuel_capacity_hydrogen),
      fuelQuantum: numOrNull(powerRef.fuel_capacity_quantum),
      qtRangeKm: numOrNull(powerRef.qt_range_km),
      qtSpeedMs: numOrNull(powerRef.qt_speed_ms),
      qtSpoolTimeS: numOrNull(powerRef.qt_spool_time_s),
      // Multi-PP model
      multiPpRatio: numOrNull(powerRef.multi_pp_ratio),
      // Pools
      pools: Object.keys(poolsMap).length > 0 ? poolsMap : undefined,
    } : (spLookup[shipClassName] ?? null); // fallback to static JSON

    // Flight controller (thrusters) power data — still from JSON lookup for now
    const flightController =
      pnLookup[`Controller_Flight_${shipClassName}`] ?? null;

    // ── Compute stats from flatHardpoints for ShipSpecSheet ──
    let totalDps = 0, totalAlphaDamage = 0, totalShieldHp = 0, totalShieldRegen = 0;
    let totalPowerDraw = 0, totalPowerOutput = 0, totalCooling = 0, totalThermalOutput = 0;
    let totalEmSignature = 0, totalIrSignature = 0;
    let weaponCount = 0, missileCount = 0, shieldCount = 0, coolerCount = 0, powerPlantCount = 0, quantumDriveCount = 0;

    for (const hp of flatHardpoints as any[]) {
      const cat = hp.category;
      const eq = hp.equippedItem;
      const cs = eq?.componentStats;

      if (cat === "WEAPON" || cat === "TURRET") {
        weaponCount++;
        const cws = hp.childWeapons ?? [];
        if (cws.length > 0) {
          for (const cw of cws) {
            totalDps += cw.equippedItem?.componentStats?.dps ?? 0;
            totalAlphaDamage += cw.equippedItem?.componentStats?.alphaDamage ?? 0;
          }
        } else if (cs) {
          totalDps += cs.dps ?? 0;
          totalAlphaDamage += cs.alphaDamage ?? 0;
        }
      } else if (cat === "MISSILE_RACK") {
        missileCount++;
      } else if (cat === "SHIELD" && cs) {
        shieldCount++;
        totalShieldHp += cs.shieldHp ?? 0;
        totalShieldRegen += cs.shieldRegen ?? 0;
      } else if (cat === "POWER_PLANT" && cs) {
        powerPlantCount++;
        totalPowerOutput += cs.powerOutput ?? 0;
      } else if (cat === "COOLER" && cs) {
        coolerCount++;
        totalCooling += cs.coolingRate ?? 0;
      } else if (cat === "QUANTUM_DRIVE") {
        quantumDriveCount++;
      }

      if (cs) {
        totalPowerDraw += cs.powerDraw ?? 0;
        totalThermalOutput += cs.thermalOutput ?? 0;
        totalEmSignature += cs.emSignature ?? 0;
        totalIrSignature += cs.irSignature ?? 0;
      }
    }

    const computed = {
      totalDps, totalAlphaDamage, totalShieldHp, totalShieldRegen,
      totalPowerDraw, totalPowerOutput, totalCooling, totalThermalOutput,
      powerBalance: totalPowerOutput - totalPowerDraw,
      thermalBalance: totalCooling - totalThermalOutput,
      totalEmSignature, totalIrSignature,
      hardpointSummary: {
        weapons: weaponCount, missiles: missileCount, shields: shieldCount,
        coolers: coolerCount, powerPlants: powerPlantCount, quantumDrives: quantumDriveCount,
      },
    };

    // Insurance
    const insuranceData = insurance ? {
      standardClaimTime: numOrNull(insurance.standard_claim_time),
      expeditedClaimTime: numOrNull(insurance.expedited_claim_time),
      expeditedCost: numOrNull(insurance.expedited_cost),
    } : null;

    return NextResponse.json(
      { data, flatHardpoints, computed, shipPower, flightController, insurance: insuranceData },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  } catch (error: any) {
    console.error("[API /ships/[id]] Error:", error?.message || error);
    return NextResponse.json(
      { error: "Error interno", detail: error?.message || "Unknown" },
      { status: 500 },
    );
  }
}
