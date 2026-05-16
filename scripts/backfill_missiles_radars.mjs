// =============================================================================
// Backfill missiles + missile_launchers + radars desde 4.7.0 → 4.8.0
//
// HALLAZGOS:
// - missiles NO tiene class_name (usa uuid + name); uuids son distintos entre
//   4.7.0 y 4.8.0 → mi backfill anterior por uuid falló silenciosamente.
//   Fix: match por (name, size, tracking_signal_type).
// - missile_launchers tiene class_name estable (mismo id UUID en todas las gvs)
//   pero faltan stats (mass, missiles_label, dimensiones precisas) en 4.8.0.
// - radars tiene class_name estable. Faltan range_max_m, range_min_m,
//   sensitivity, piercing en 4.8.0.
// =============================================================================

import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

const NEW = '4.8.0-live.11825000';
const SRC = '4.7.0-LIVE.11518367';
const APPLY = process.argv.includes('--apply');

console.log(`\n${APPLY ? '🚀 APPLY' : '🔍 DRY RUN'} missiles + missile_launchers + radars backfill\n  NEW=${NEW}\n  SRC=${SRC}\n`);

// ──────────────────────────────────────────────────────────────────
// MISSILES — match por (name, size, tracking_signal_type) ya que uuids difieren
// ──────────────────────────────────────────────────────────────────
console.log('═══ MISSILES coverage AHORA ═══');
for (const gv of [NEW, SRC]) {
  const [c] = await sql.unsafe(`
    SELECT COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE damage_total > 0)::int as dmg_pos,
      COUNT(*) FILTER (WHERE linear_speed > 0)::int as speed_pos,
      COUNT(lock_range_max)::int as has_range,
      COUNT(lock_time)::int as has_time,
      COUNT(tracking_signal_type)::int as has_signal
    FROM missiles WHERE game_version = $1
  `, [gv]);
  console.log(`  ${gv.padEnd(22)} total=${c.total} dmg>0=${c.dmg_pos} speed>0=${c.speed_pos} range=${c.has_range} time=${c.has_time} signal=${c.has_signal}`);
}

console.log('\n── Missiles a backfillear ──');
const MISSILE_COLS = ['lock_range_min','lock_range_max','lock_time','damage_total','linear_speed','is_cluster','tracking_signal_type'];
for (const col of MISSILE_COLS) {
  const [{ n }] = await sql.unsafe(`
    SELECT COUNT(*)::int AS n
    FROM missiles dst
    JOIN missiles src
      ON LOWER(dst.name) = LOWER(src.name)
     AND dst.size = src.size
    WHERE dst.game_version = $1 AND src.game_version = $2
      AND dst.${col} IS NULL AND src.${col} IS NOT NULL
  `, [NEW, SRC]);
  if (n > 0) console.log(`  ${col.padEnd(28)} ${n}`);
}

if (APPLY) {
  const sets = MISSILE_COLS.map(c => `${c} = COALESCE(dst.${c}, src.${c})`).join(', ');
  const r = await sql.unsafe(`
    UPDATE missiles AS dst SET ${sets}
    FROM missiles AS src
    WHERE LOWER(dst.name) = LOWER(src.name) AND dst.size = src.size
      AND dst.game_version = $1 AND src.game_version = $2
  `, [NEW, SRC]);
  console.log(`  ✓ missiles: ${r.count} rows touched`);
}

// ──────────────────────────────────────────────────────────────────
// MISSILE_LAUNCHERS — match por class_name (id UUID estable)
// ──────────────────────────────────────────────────────────────────
console.log('\n═══ MISSILE_LAUNCHERS coverage AHORA ═══');
for (const gv of [NEW, SRC]) {
  const [c] = await sql.unsafe(`
    SELECT COUNT(*)::int as total,
      COUNT(missile_count)::int as has_count,
      COUNT(missiles_label)::int as has_label,
      COUNT(durability_health)::int as has_hp,
      COUNT(*) FILTER (WHERE mass > 0)::int as mass_pos
    FROM missile_launchers WHERE game_version = $1
  `, [gv]);
  console.log(`  ${gv.padEnd(22)} total=${c.total} count=${c.has_count} label=${c.has_label} hp=${c.has_hp} mass>0=${c.mass_pos}`);
}

const ML_COLS = ['missile_count','missiles_label','durability_health','mass','width','height','length','description'];
console.log('\n── missile_launchers a backfillear ──');
for (const col of ML_COLS) {
  const [{ n }] = await sql.unsafe(`
    SELECT COUNT(*)::int AS n
    FROM missile_launchers dst
    JOIN missile_launchers src ON dst.class_name = src.class_name
    WHERE dst.game_version = $1 AND src.game_version = $2
      AND (dst.${col} IS NULL OR dst.${col}::text = '' OR dst.${col}::text = '0')
      AND src.${col} IS NOT NULL
  `, [NEW, SRC]).catch(() => [{ n: 0 }]);
  if (n > 0) console.log(`  ${col.padEnd(28)} ${n}`);
}

if (APPLY) {
  // Para missiles_label que es text, usamos NULLIF para tratar '' como NULL
  // Para mass usamos > 0 check
  const r = await sql.unsafe(`
    UPDATE missile_launchers AS dst
    SET missile_count = COALESCE(dst.missile_count, src.missile_count),
        missiles_label = COALESCE(NULLIF(dst.missiles_label, ''), src.missiles_label),
        durability_health = COALESCE(dst.durability_health, src.durability_health),
        mass = CASE WHEN COALESCE(dst.mass, 0) = 0 AND src.mass > 0 THEN src.mass ELSE dst.mass END,
        description = COALESCE(NULLIF(dst.description, ''), src.description)
    FROM missile_launchers AS src
    WHERE dst.class_name = src.class_name
      AND dst.game_version = $1 AND src.game_version = $2
  `, [NEW, SRC]);
  console.log(`  ✓ missile_launchers: ${r.count} rows touched`);
}

// ──────────────────────────────────────────────────────────────────
// RADARS — match por class_name
// ──────────────────────────────────────────────────────────────────
console.log('\n═══ RADARS coverage AHORA ═══');
for (const gv of [NEW, SRC]) {
  const [c] = await sql.unsafe(`
    SELECT COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE range_max_m > 0)::int as range_max,
      COUNT(*) FILTER (WHERE range_min_m > 0)::int as range_min,
      COUNT(*) FILTER (WHERE sensitivity > 0)::int as sens,
      COUNT(piercing)::int as pierce,
      COUNT(sub_type)::int as has_subtype
    FROM radars WHERE game_version = $1
  `, [gv]);
  console.log(`  ${gv.padEnd(22)} total=${c.total} range_max=${c.range_max} range_min=${c.range_min} sens=${c.sens} pierce=${c.pierce} subtype=${c.has_subtype}`);
}

const RADAR_COLS = ['range_max_m','range_min_m','sensitivity','piercing','sub_type','sensitivity_profile','ground_vehicle_sensitivity_addition'];
console.log('\n── radars a backfillear ──');
for (const col of RADAR_COLS) {
  const [{ n }] = await sql.unsafe(`
    SELECT COUNT(*)::int AS n
    FROM radars dst
    JOIN radars src ON dst.class_name = src.class_name
    WHERE dst.game_version = $1 AND src.game_version = $2
      AND dst.${col} IS NULL AND src.${col} IS NOT NULL
  `, [NEW, SRC]).catch(() => [{ n: 0 }]);
  if (n > 0) console.log(`  ${col.padEnd(28)} ${n}`);
}

if (APPLY) {
  const sets = RADAR_COLS.map(c => `${c} = COALESCE(dst.${c}, src.${c})`).join(', ');
  const r = await sql.unsafe(`
    UPDATE radars AS dst SET ${sets}
    FROM radars AS src
    WHERE dst.class_name = src.class_name
      AND dst.game_version = $1 AND src.game_version = $2
  `, [NEW, SRC]);
  console.log(`  ✓ radars: ${r.count} rows touched`);
}

if (!APPLY) {
  console.log('\n⚠️ añadí --apply');
} else {
  console.log('\n══ POST-BACKFILL coverage 4.8.0 ══');
  const [m] = await sql`SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE damage_total > 0)::int dmg_pos, COUNT(*) FILTER (WHERE linear_speed > 0)::int speed_pos FROM missiles WHERE game_version = ${NEW}`;
  console.log(`  missiles: total=${m.total} dmg>0=${m.dmg_pos} speed>0=${m.speed_pos}`);
  const [l] = await sql`SELECT COUNT(*)::int total, COUNT(missiles_label)::int label, COUNT(*) FILTER (WHERE mass > 0)::int mass FROM missile_launchers WHERE game_version = ${NEW}`;
  console.log(`  missile_launchers: total=${l.total} label=${l.label} mass>0=${l.mass}`);
  const [r] = await sql`SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE range_max_m > 0)::int range_max, COUNT(*) FILTER (WHERE sensitivity > 0)::int sens, COUNT(sub_type)::int sub FROM radars WHERE game_version = ${NEW}`;
  console.log(`  radars: total=${r.total} range_max>0=${r.range_max} sens>0=${r.sens} sub_type=${r.sub}`);
}

await sql.end({ timeout: 3 });
