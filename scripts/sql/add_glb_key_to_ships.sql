-- =============================================================================
-- SC LABS — Add glb_key column to ships table
--
-- Agrega una columna `glb_key` (text, nullable) a la tabla `ships` que guarda
-- la key del modelo 3D para esa nave.
--
-- El frontend construye la URL del GLB así:
--   `${NEXT_PUBLIC_GLB_BASE_URL}/EntityClassDefinition.${glb_key}.glb`
--
-- Para la gran mayoría de las naves, `glb_key === reference`, así que el
-- script `scripts/seed-glb-keys.mjs` lee el directorio real `Modulos 3d/GLB/`
-- y hace UPDATE ships SET glb_key = reference WHERE reference = ANY(list).
--
-- ORDEN DE EJECUCIÓN:
--   1. Correr este SQL (una sola vez) → agrega la columna
--   2. Correr `node scripts/seed-glb-keys.mjs` → puebla las 178 naves con match
-- =============================================================================

ALTER TABLE ships
  ADD COLUMN IF NOT EXISTS glb_key text;

COMMENT ON COLUMN ships.glb_key IS
  'Key del archivo GLB de la nave. Se combina con NEXT_PUBLIC_GLB_BASE_URL para formar la URL: {base}/EntityClassDefinition.{glb_key}.glb';

-- Índice opcional para queries que filtren "naves con modelo 3D"
CREATE INDEX IF NOT EXISTS ships_glb_key_idx ON ships (glb_key) WHERE glb_key IS NOT NULL;
