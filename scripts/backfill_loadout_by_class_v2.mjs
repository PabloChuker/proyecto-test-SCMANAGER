import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 5 });

const NEW = '4.8.0-live.11825000';
const OLD = '4.7.2';
const APPLY = process.argv.includes('--apply');

console.log(`\n${APPLY ? '🚀 APPLY' : '🔍 DRY RUN'} v2 (batched parallel)\n`);

const targets = await sql.unsafe(`
  SELECT id::text as id, ship_reference, hardpoint_name, default_item_class, max_size, loadout_json
  FROM ship_hardpoints
  WHERE game_version = $1
    AND hardpoint_type = 'Turret'
    AND default_item_class IS NOT NULL
    AND default_item_class LIKE 'Mount_Gimbal%'
    AND jsonb_array_length(COALESCE((loadout_json->'Loadout')::jsonb, '[]'::jsonb)) = 0
`, [NEW]);

const sources = await sql.unsafe(`
  SELECT default_item_class, max_size, loadout_json
  FROM ship_hardpoints
  WHERE game_version = $1
    AND default_item_class LIKE 'Mount_Gimbal%'
    AND jsonb_array_length(COALESCE((loadout_json->'Loadout')::jsonb, '[]'::jsonb)) > 0
`, [OLD]);

const byExactClass = new Map();
const bySize = new Map();
for (const s of sources) {
  const cn = s.default_item_class;
  if (!byExactClass.has(cn)) byExactClass.set(cn, s);
  const m = cn.match(/Mount_Gimbal_S(\d+)/);
  if (m && !bySize.has(m[1])) bySize.set(m[1], s);
}
console.log(`Targets=${targets.length}, sources=${sources.length}`);

// Build list of (id, newLoadoutJson)
const updates = [];
for (const t of targets) {
  let src = byExactClass.get(t.default_item_class);
  if (!src) {
    const m = t.default_item_class.match(/Mount_Gimbal_S(\d+)/);
    if (m) src = bySize.get(m[1]);
  }
  if (!src) continue;

  let srcLoadoutArr = Array.isArray(src.loadout_json) ? src.loadout_json
                    : src.loadout_json?.Loadout;
  if (!Array.isArray(srcLoadoutArr) || srcLoadoutArr.length === 0) continue;

  let dst = t.loadout_json;
  let newDst;
  if (Array.isArray(dst)) {
    newDst = dst.length === 0 ? srcLoadoutArr : [{ ...dst[0], Loadout: srcLoadoutArr }, ...dst.slice(1)];
  } else if (dst && typeof dst === 'object') {
    newDst = { ...dst, Loadout: srcLoadoutArr };
  } else {
    newDst = { Loadout: srcLoadoutArr };
  }
  updates.push({ id: t.id, obj: newDst });
}

console.log(`Updates to apply: ${updates.length}`);
if (!APPLY) {
  console.log('⚠️  añadí --apply'); await sql.end({ timeout: 3 }); process.exit(0);
}

// FIX: JSON.stringify + $1::jsonb causa doble-quoting (queda como JSON STRING).
// postgres.js helper sql.json(obj) maneja el escaping correcto.
let done = 0;
const CONCURRENCY = 10;
for (let i = 0; i < updates.length; i += CONCURRENCY) {
  const batch = updates.slice(i, i + CONCURRENCY);
  await Promise.all(batch.map(u =>
    sql`UPDATE ship_hardpoints SET loadout_json = ${sql.json(u.obj)}
        WHERE id::text = ${u.id} AND game_version = ${NEW}`
  ));
  done += batch.length;
  if (i % 100 === 0) console.log(`  ${done}/${updates.length}`);
}
console.log(`\n✅ Updated ${done} hardpoints`);

await sql.end({ timeout: 3 });
