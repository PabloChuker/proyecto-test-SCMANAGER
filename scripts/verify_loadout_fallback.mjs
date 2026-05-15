#!/usr/bin/env node
// Verifica que el merge de loadout_json fallback funciona contra BD real.
// Simula la lógica del endpoint en JS puro.

import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

function normalizeLoadoutEntries(lj) {
  if (Array.isArray(lj)) return lj;
  if (lj && typeof lj === 'object') {
    if (lj.ClassName || lj.className) return [lj];
    if (Array.isArray(lj.Loadout)) return lj.Loadout;
  }
  return [];
}

function entryNeedsLoadoutFallback(entry) {
  const className = String(entry?.ClassName || entry?.className || '');
  const type = String(entry?.Type || '');
  const expectsChildren =
    className.startsWith('Mount_Gimbal') ||
    className.includes('Missile_Rack') ||
    type.includes('Turret') ||
    type.includes('MissileLauncher');
  if (!expectsChildren) return false;
  const loadout = Array.isArray(entry?.Loadout) ? entry.Loadout : [];
  const children = Array.isArray(entry?.Children) ? entry.Children : [];
  return loadout.length === 0 && children.length === 0;
}

const SHIP_REF = 'AEGS_Avenger_Titan';
const CURRENT_GV = '4.8.0-live.11825000';

// 1. Cargar hardpoints del 4.8.0
const currentHps = await sql`
  SELECT hardpoint_name, hardpoint_type, default_item_class, loadout_json
  FROM ship_hardpoints
  WHERE ship_reference = ${SHIP_REF}
    AND game_version = ${CURRENT_GV}
  ORDER BY hardpoint_name
`;
console.log(`Hardpoints en ${CURRENT_GV}: ${currentHps.length}`);

// 2. Detectar cuáles necesitan fallback
const needFallback = currentHps.filter((hp) => {
  const entries = normalizeLoadoutEntries(hp.loadout_json);
  return entries.some(entryNeedsLoadoutFallback);
});
console.log(`Hardpoints con Loadout vacío esperando children: ${needFallback.length}`);
for (const hp of needFallback) {
  console.log(`  - ${hp.hardpoint_name} (type=${hp.hardpoint_type}, default=${hp.default_item_class})`);
}

// 3. Buscar fallback
const hpNames = needFallback.map((h) => h.hardpoint_name);
const fbRows = await sql`
  SELECT hardpoint_name, loadout_json, game_version
  FROM ship_hardpoints
  WHERE ship_reference = ${SHIP_REF}
    AND game_version <> ${CURRENT_GV}
    AND hardpoint_name = ANY(${hpNames})
  ORDER BY game_version DESC
`;
console.log(`\nFallback rows encontrados: ${fbRows.length}`);

const fallbackByHpName = new Map();
for (const fb of fbRows) {
  if (fallbackByHpName.has(fb.hardpoint_name)) continue;
  const entries = normalizeLoadoutEntries(fb.loadout_json);
  const hasUsefulChildren = entries.some((e) => {
    const className = String(e?.ClassName || e?.className || '');
    const type = String(e?.Type || '');
    const expectsChildren =
      className.startsWith('Mount_Gimbal') ||
      className.includes('Missile_Rack') ||
      type.includes('Turret') ||
      type.includes('MissileLauncher');
    if (!expectsChildren) return false;
    const loadout = Array.isArray(e?.Loadout) ? e.Loadout : [];
    const children = Array.isArray(e?.Children) ? e.Children : [];
    return loadout.length > 0 || children.length > 0;
  });
  if (hasUsefulChildren) {
    fallbackByHpName.set(fb.hardpoint_name, {
      loadout_json: fb.loadout_json,
      from_gv: fb.game_version,
    });
  }
}
console.log(`\nFallback útiles (con children no vacíos): ${fallbackByHpName.size}`);

// 4. Aplicar merge y mostrar resultado
let mergedCount = 0;
for (const hp of needFallback) {
  const fb = fallbackByHpName.get(hp.hardpoint_name);
  if (!fb) {
    console.log(`  ✗ ${hp.hardpoint_name}: SIN fallback útil`);
    continue;
  }
  const currentEntries = normalizeLoadoutEntries(hp.loadout_json);
  const fbEntries = normalizeLoadoutEntries(fb.loadout_json);
  for (const ce of currentEntries) {
    if (!entryNeedsLoadoutFallback(ce)) continue;
    const ceClass = String(ce?.ClassName || ce?.className || '');
    let fbMatch = fbEntries.find(
      (fe) => String(fe?.ClassName || fe?.className || '') === ceClass,
    );
    if (!fbMatch) {
      fbMatch = fbEntries.find((fe) => {
        const fc = String(fe?.ClassName || fe?.className || '');
        const isSameKind =
          (fc.startsWith('Mount_Gimbal') && ceClass.startsWith('Mount_Gimbal')) ||
          (fc.includes('Missile_Rack') && ceClass.includes('Missile_Rack'));
        if (!isSameKind) return false;
        const fbLoad = Array.isArray(fe?.Loadout) ? fe.Loadout : [];
        const fbChild = Array.isArray(fe?.Children) ? fe.Children : [];
        return fbLoad.length > 0 || fbChild.length > 0;
      });
    }
    if (fbMatch) {
      const fbLoad = Array.isArray(fbMatch.Loadout) ? fbMatch.Loadout : [];
      const fbChild = Array.isArray(fbMatch.Children) ? fbMatch.Children : [];
      const incomingChildren = fbLoad.length > 0 ? fbLoad : fbChild;
      if (incomingChildren.length > 0) {
        console.log(
          `  ✓ ${hp.hardpoint_name} ← ${fb.from_gv} (entry ${ceClass}): ${incomingChildren.length} children`,
        );
        for (const ch of incomingChildren) {
          console.log(`      └─ ${ch.ClassName || ch.className} (${ch.Name})`);
        }
        mergedCount++;
      }
    } else {
      console.log(`  ✗ ${hp.hardpoint_name}: NO match para entry ${ceClass}`);
    }
  }
}
console.log(`\n✓ Merge aplicaría a ${mergedCount} entries.`);
await sql.end({ timeout: 3 });
