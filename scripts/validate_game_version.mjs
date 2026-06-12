// SC Labs — Gate de validación post-import (Loadout.16, 2026-06-12)
//
// Corre DESPUÉS de aplicar los seeds de un parche nuevo y ANTES de marcar la
// game_version como online. Detecta las clases de rotura que ya nos pasaron:
// hardpoints fantasma, hijos huérfanos, racks sin misiles, gaps de catálogo,
// regresiones de cobertura vs la versión anterior.
//
// Uso:   node scripts/validate_game_version.mjs --gv 4.8.1-live.12345678
//        node scripts/validate_game_version.mjs            (usa la gv online)
//        [--baseline <gv>]  comparar contra una gv específica (default: online previa o la más reciente distinta)
//
// Solo lectura. Exit code 1 si hay ERRORES (no marcar online), 0 si pasa.
import 'dotenv/config';
import postgres from 'postgres';
import { writeFileSync, mkdirSync } from 'fs';

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

const args = process.argv.slice(2);
const argVal = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};

const errors = [];
const warns = [];
const info = [];
const err = (m) => errors.push(m);
const warn = (m) => warns.push(m);

// ── Resolver GV objetivo y baseline ─────────────────────────────────────────
let GV = argVal('--gv');
if (!GV) {
  const r = await sql.unsafe(`SELECT version FROM game_versions WHERE online = true LIMIT 1`);
  GV = r[0]?.version;
}
if (!GV) { console.error('No se pudo resolver la game_version objetivo'); process.exit(2); }

let BASE = argVal('--baseline');
if (!BASE) {
  const r = await sql.unsafe(`
    SELECT DISTINCT game_version FROM ship_hardpoints
    WHERE game_version <> $1 ORDER BY game_version DESC LIMIT 1
  `, [GV]);
  BASE = r[0]?.game_version ?? null;
}
console.log(`Validando gv=${GV}  baseline=${BASE ?? '(ninguna)'}\n`);

// ── 1. Sanidad de game_versions ─────────────────────────────────────────────
if (/-fix\d*$/i.test(GV)) err(`La version "${GV}" tiene sufijo -fixN — los seeds iterados a mano no deben llegar a la BD con otra gv`);
const gvRow = await sql.unsafe(`SELECT version, source, online FROM game_versions WHERE version = $1`, [GV]);
if (!gvRow.length) err(`game_versions no tiene la fila "${GV}" — registrar la versión antes de los seeds`);
const onlineCount = await sql.unsafe(`SELECT COUNT(*)::int AS n FROM game_versions WHERE online = true`);
if (onlineCount[0].n > 1) err(`Hay ${onlineCount[0].n} versiones online=true — debe haber exactamente 1`);

// ── 2. Cobertura de naves y hardpoints vs baseline ──────────────────────────
const [{ n: nShips }] = await sql.unsafe(`SELECT COUNT(DISTINCT ship_reference)::int AS n FROM ship_hardpoints WHERE game_version = $1`, [GV]);
info.push(`naves con hardpoints: ${nShips}`);
if (nShips === 0) err('0 naves con hardpoints en esta gv');
if (BASE) {
  const [{ n: nBase }] = await sql.unsafe(`SELECT COUNT(DISTINCT ship_reference)::int AS n FROM ship_hardpoints WHERE game_version = $1`, [BASE]);
  if (nBase > 0 && nShips < nBase * 0.9) err(`Naves cayeron ${nBase} → ${nShips} (>10%) vs ${BASE}`);
  const dropped = await sql.unsafe(`
    WITH cur AS (SELECT ship_reference, COUNT(*)::int AS n FROM ship_hardpoints WHERE game_version = $1 GROUP BY 1),
         base AS (SELECT ship_reference, COUNT(*)::int AS n FROM ship_hardpoints WHERE game_version = $2 GROUP BY 1)
    SELECT base.ship_reference, base.n AS antes, COALESCE(cur.n, 0) AS ahora
    FROM base LEFT JOIN cur USING (ship_reference)
    WHERE COALESCE(cur.n, 0) < base.n * 0.7
    ORDER BY base.n - COALESCE(cur.n, 0) DESC LIMIT 25
  `, [GV, BASE]);
  for (const d of dropped) warn(`${d.ship_reference}: hardpoints ${d.antes} → ${d.ahora} (-30%+) vs baseline`);
}

// ── 3. Duplicados case-insensitive top-level (torretas fantasma) ─────────────
const ghosts = await sql.unsafe(`
  SELECT ship_reference, LOWER(hardpoint_name) AS hp, COUNT(*)::int AS n
  FROM ship_hardpoints
  WHERE game_version = $1 AND parent_hp_id IS NULL
  GROUP BY 1, 2 HAVING COUNT(*) > 1
`, [GV]);
if (ghosts.length) {
  warn(`${ghosts.length} hardpoints top-level duplicados (case-insensitive) — generan slots fantasma. Ej: ${ghosts.slice(0, 5).map(g => `${g.ship_reference}:${g.hp}`).join(', ')}`);
}

// ── 4. Hijos huérfanos (parent_hp_id sin fila en la misma gv) ────────────────
const orphans = await sql.unsafe(`
  SELECT COUNT(*)::int AS n FROM ship_hardpoints c
  WHERE c.game_version = $1 AND c.parent_hp_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM ship_hardpoints p WHERE p.id = c.parent_hp_id AND p.game_version = c.game_version)
`, [GV]);
if (orphans[0].n > 0) err(`${orphans[0].n} filas hijas con parent_hp_id inexistente en la misma gv`);

// ── 5. Racks equipados sin misiles ───────────────────────────────────────────
const emptyRacks = await sql.unsafe(`
  SELECT p.ship_reference, p.hardpoint_name
  FROM ship_hardpoints p
  WHERE p.game_version = $1 AND p.parent_hp_id IS NULL
    AND p.hardpoint_type ILIKE 'MissileLauncher%'
    AND p.default_item_class IS NOT NULL
    AND jsonb_array_length(COALESCE(p.loadout_json->'Loadout', '[]'::jsonb)) = 0
    AND NOT EXISTS (SELECT 1 FROM ship_hardpoints c WHERE c.parent_hp_id = p.id AND c.game_version = p.game_version)
`, [GV]);
if (emptyRacks.length) {
  err(`${emptyRacks.length} racks de misiles EQUIPADOS sin hijos ni loadout_json — el dumper no extrajo la ordenanza default. Ej: ${emptyRacks.slice(0, 5).map(r => `${r.ship_reference}:${r.hardpoint_name}`).join(', ')}`);
}

// ── 6. Cobertura de catálogo: clases equipadas sin fila de catálogo en la gv ─
const CATALOG = [
  ['WeaponGun', 'weapon_guns', 'class_name'],
  ['Shield', 'shields', 'class_name'],
  ['PowerPlant', 'power_plants', 'class_name'],
  ['Cooler', 'coolers', 'class_name'],
  ['QuantumDrive', 'quantum_drives', 'class_name'],
  ['MissileLauncher', 'missile_launchers', 'class_name'],
  ['WeaponMining', 'weapon_mining', 'class_name'],
];
for (const [hpType, table, col] of CATALOG) {
  try {
    const missing = await sql.unsafe(`
      SELECT DISTINCT sh.default_item_class
      FROM ship_hardpoints sh
      WHERE sh.game_version = $1
        AND split_part(sh.hardpoint_type, '.', 1) = $2
        AND sh.default_item_class IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM ${table} t WHERE t.${col} = sh.default_item_class AND t.game_version = $1)
      LIMIT 50
    `, [GV, hpType]);
    if (missing.length) {
      const sev = missing.length > 10 ? err : warn;
      sev(`${missing.length} clases ${hpType} equipadas sin fila en ${table}@${GV}. Ej: ${missing.slice(0, 4).map(m => m.default_item_class).join(', ')}`);
    }
  } catch (e) {
    warn(`check de ${table} falló: ${String(e.message).slice(0, 60)}`);
  }
}

// Misiles: la tabla missiles matchea por raw_data->>'ClassName'
const missingMissiles = await sql.unsafe(`
  SELECT DISTINCT sh.default_item_class
  FROM ship_hardpoints sh
  WHERE sh.game_version = $1 AND split_part(sh.hardpoint_type, '.', 1) = 'Missile'
    AND sh.default_item_class IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM missiles m
      WHERE (m.raw_data->>'ClassName' = sh.default_item_class OR m.name = sh.default_item_name)
        AND m.game_version = $1
    )
  LIMIT 50
`, [GV]);
if (missingMissiles.length) {
  err(`${missingMissiles.length} clases de misil equipadas sin fila en missiles@${GV}. Ej: ${missingMissiles.slice(0, 4).map(m => m.default_item_class).join(', ')}`);
}

// ── 7. Calidad de missile_launchers ──────────────────────────────────────────
try {
  const [ml] = await sql.unsafe(`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE missile_count IS NULL)::int AS sin_count,
           COUNT(*) FILTER (WHERE ports IS NULL OR jsonb_typeof(ports) <> 'array')::int AS sin_ports
    FROM missile_launchers WHERE game_version = $1
  `, [GV]);
  if (ml.total > 0 && ml.sin_count / ml.total > 0.3) err(`missile_launchers@${GV}: ${ml.sin_count}/${ml.total} sin missile_count`);
  if (ml.total > 0 && ml.sin_ports / ml.total > 0.5) warn(`missile_launchers@${GV}: ${ml.sin_ports}/${ml.total} sin array ports (la UI pierde tamaños por puerto)`);
} catch (e) {
  warn(`check missile_launchers falló: ${String(e.message).slice(0, 60)}`);
}

// ── 8. Tasa de placeholders (informativo — el API ya los sanea) ──────────────
const [ph] = await sql.unsafe(`
  SELECT COUNT(*)::int AS n FROM ship_hardpoints
  WHERE game_version = $1 AND default_item_name LIKE '%PLACEHOLDER%'
`, [GV]);
info.push(`filas con default_item_name placeholder: ${ph.n} (esperable — el juego los trae; la web los sanea)`);

// ── Reporte ──────────────────────────────────────────────────────────────────
await sql.end();
let md = `# Validación de import — ${GV}\n\nFecha: ${new Date().toISOString()}\nBaseline: ${BASE ?? '-'}\n\n`;
md += `## Errores (${errors.length})\n` + (errors.map(e => `- ❌ ${e}`).join('\n') || '- ninguno') + '\n\n';
md += `## Warnings (${warns.length})\n` + (warns.map(w => `- ⚠️ ${w}`).join('\n') || '- ninguno') + '\n\n';
md += `## Info\n` + info.map(i => `- ${i}`).join('\n') + '\n';
mkdirSync('scripts/_audit', { recursive: true });
const outPath = `scripts/_audit/VALIDACION_${GV.replace(/[^\w.-]/g, '_')}.md`;
writeFileSync(outPath, md, 'utf-8');

console.log(md);
console.log(`Reporte: ${outPath}`);
if (errors.length) {
  console.log(`\nRESULTADO: ❌ ${errors.length} errores — NO marcar esta versión como online hasta corregir.`);
  process.exit(1);
}
console.log(`\nRESULTADO: ✅ pasa (${warns.length} warnings)`);
