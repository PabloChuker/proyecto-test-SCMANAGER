import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

const NEW = '4.8.0-live.11825000';
const OLD = '4.7.2';
const APPLY = process.argv.includes('--apply');

console.log(`\n${APPLY ? '🚀 APPLY' : '🔍 DRY RUN'} — backfill loadout_json by default_item_class\n`);

// Paso 1: encontrar hardpoints en 4.8.0 con Loadout vacío
const targets = await sql.unsafe(`
  SELECT id, ship_reference, hardpoint_name, default_item_class, max_size
  FROM ship_hardpoints
  WHERE game_version = $1
    AND hardpoint_type = 'Turret'
    AND default_item_class IS NOT NULL
    AND default_item_class LIKE 'Mount_Gimbal%'
    AND jsonb_array_length(COALESCE((loadout_json->'Loadout')::jsonb, '[]'::jsonb)) = 0
`, [NEW]);
console.log(`Target hardpoints con Loadout=[] en 4.8.0: ${targets.length}`);

// Paso 2: indexar fuentes — Mount_Gimbal con Loadout poblado en 4.7.2 (ANY ship), por class_name + por size
const sources = await sql.unsafe(`
  SELECT ship_reference, hardpoint_name, default_item_class, max_size, loadout_json
  FROM ship_hardpoints
  WHERE game_version = $1
    AND default_item_class LIKE 'Mount_Gimbal%'
    AND jsonb_array_length(COALESCE((loadout_json->'Loadout')::jsonb, '[]'::jsonb)) > 0
`, [OLD]);
console.log(`Sources Mount_Gimbal con Loadout populated en 4.7.2: ${sources.length}`);

// Index por exact class_name
const byExactClass = new Map();
const bySize = new Map();
for (const s of sources) {
  const cn = s.default_item_class;
  if (!byExactClass.has(cn)) byExactClass.set(cn, s);
  const m = cn.match(/Mount_Gimbal_S(\d+)/);
  if (m) {
    const size = m[1];
    if (!bySize.has(size)) bySize.set(size, s);
  }
}
console.log(`Unique classes: ${byExactClass.size}, sizes covered: ${[...bySize.keys()].sort().join(',')}`);

// Paso 3: para cada target, encontrar best match
let exactMatches = 0;
let sizeMatches = 0;
let noMatch = 0;
const updates = [];
for (const t of targets) {
  let src = byExactClass.get(t.default_item_class);
  if (src) exactMatches++;
  else {
    const m = t.default_item_class.match(/Mount_Gimbal_S(\d+)/);
    if (m) src = bySize.get(m[1]);
    if (src) sizeMatches++;
    else { noMatch++; continue; }
  }
  // Construir nuevo loadout_json: tomar el wrapper de target (con su class_name correcto)
  // pero copiar el Loadout array de la fuente
  updates.push({ id: t.id, ref: t.ship_reference, hp: t.hardpoint_name, fromCN: src.default_item_class, srcLoadout: src.loadout_json });
}
console.log(`\n  exact class_name matches: ${exactMatches}`);
console.log(`  size-fallback matches: ${sizeMatches}`);
console.log(`  no match: ${noMatch}`);

if (!APPLY) {
  console.log(`\nSample updates:`);
  for (const u of updates.slice(0, 5)) {
    console.log(`  ${u.ref}/${u.hp} ← src=${u.fromCN}`);
  }
  console.log(`\n⚠️  añadí --apply para ejecutar`);
  await sql.end({ timeout: 3 });
  process.exit(0);
}

// Apply updates: actualizar loadout_json copiando solo el Loadout array
let updated = 0;
for (const u of updates) {
  try {
    // Get current loadout_json of target
    const [{ loadout_json: dstLJ }] = await sql.unsafe(`SELECT loadout_json FROM ship_hardpoints WHERE id = $1 AND game_version = $2`, [u.id, NEW]);
    let dst = dstLJ;
    let src = u.srcLoadout;
    // Normalize: dst can be array or object. src probably has .Loadout
    let srcLoadoutArr = null;
    if (Array.isArray(src)) srcLoadoutArr = src;
    else if (src?.Loadout) srcLoadoutArr = src.Loadout;
    if (!srcLoadoutArr || !Array.isArray(srcLoadoutArr) || srcLoadoutArr.length === 0) continue;

    // Build new dst with copied Loadout
    let newDst;
    if (Array.isArray(dst)) {
      // Legacy: dst is array of entries. Add the Loadout to first entry.
      if (dst.length === 0) newDst = srcLoadoutArr;
      else {
        newDst = [...dst];
        newDst[0] = { ...newDst[0], Loadout: srcLoadoutArr };
      }
    } else if (dst && typeof dst === 'object' && dst.ClassName) {
      // Entry-shape: { ClassName, Loadout, ... }
      newDst = { ...dst, Loadout: srcLoadoutArr };
    } else if (dst && typeof dst === 'object' && Array.isArray(dst.Loadout)) {
      // Wrapper: { Name, Loadout: [], ClassName }
      newDst = { ...dst, Loadout: srcLoadoutArr };
    } else {
      newDst = { Loadout: srcLoadoutArr };
    }
    await sql.unsafe(`UPDATE ship_hardpoints SET loadout_json = $1::jsonb WHERE id = $2 AND game_version = $3`, [JSON.stringify(newDst), u.id, NEW]);
    updated++;
  } catch (e) {
    console.log(`  ERR on ${u.ref}/${u.hp}: ${e.message?.slice(0,80)}`);
  }
}
console.log(`\n✅ Updated ${updated}/${updates.length} hardpoints`);

await sql.end({ timeout: 3 });
