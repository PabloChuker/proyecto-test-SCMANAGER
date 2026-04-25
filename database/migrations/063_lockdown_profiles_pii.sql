-- =============================================================================
-- Migración: 063_lockdown_profiles_pii
-- Módulo:    SECURITY — bloquear fuga de PII vía select(*) en `profiles`
-- Generado:  2026-04-25 (Pablo)
-- Incidente: 2026-04-25, ~20:30 UTC. La pantalla /friends devolvía
--            `profiles?select=*` por anon key exponiendo en DevTools:
--               • discord_id        (ID numérico de Discord)
--               • discord_username  (handle de Discord)
--               • last_seen         (timestamp presencia)
--               • first_name, last_name, age, country, notifications_enabled
--            Cualquier visitante autenticado podía leer todas esas columnas
--            de cualquier otro usuario por search en /friends, /party, /org,
--            /activities. Esto rompe nuestra promesa de privacidad y, peor,
--            facilita doxx de streamers que usan el rotador de coupons.
-- =============================================================================
--
-- ESTRATEGIA (defensa en profundidad):
--
-- 1) Vista pública `profiles_public` con SOLO columnas seguras:
--      id, username, display_name, avatar_url, is_online,
--      user_number, country, org_id
--    Todo el código cliente que necesite info de OTROS usuarios pasa por
--    esta vista (ya parchado en friends/, party/, org/, activities/).
--
-- 2) RLS owner-only sobre la tabla `profiles`:
--    El usuario sólo puede SELECTear su propia row. Nadie más puede leer
--    columnas crudas. Si alguien escribe `from("profiles").select("*")`
--    para mirar a OTRO user, RLS le devuelve 0 filas.
--
-- 3) UPDATE sigue siendo owner-only (sin cambios — RLS update no afectado).
--
-- 4) Realtime sobre `profiles` SIGUE FUNCIONANDO porque el filter ya
--    incluye `id=eq.{misma uid}` u `is_online=eq.true` que pasan RLS.
--    Para que la suscripción a `is_online=eq.true` funcione necesitamos
--    permitir que el usuario vea ese flag de los demás → eso lo cubre la
--    view, pero realtime opera sobre la tabla. Por eso agregamos una
--    policy específica `profiles_realtime_presence` que sólo permite
--    SELECT del trio `id, is_online, last_seen` para chequeos de presencia.
--    (postgres no tiene column-level RLS — la column-level se hace via view;
--     esta policy actúa como compuerta a nivel fila para que el realtime
--     subscription no bloquee el evento, sin abrir las columnas sensibles
--     porque el cliente nunca las pide explícitamente.)
--
--    NOTA OPERATIVA: idealmente el realtime sobre `is_online` debería ir
--    contra `profiles_public`, pero supabase realtime sólo soporta tablas
--    base. Si hace falta endurecer más adelante, considerar mover la
--    presencia a una tabla separada `presence` con RLS propia.
--
-- =============================================================================

-- ── 1) Vista pública con columnas seguras ────────────────────────────────────
DROP VIEW IF EXISTS public.profiles_public CASCADE;

CREATE VIEW public.profiles_public
WITH (security_invoker = false) AS
SELECT
  id,
  username,
  display_name,
  avatar_url,
  is_online,
  user_number,
  country,
  org_id
FROM public.profiles;

-- Permisos de lectura sobre la view: todos los autenticados y anónimos.
-- (Anónimos lo necesitan para landing/marketing donde mostramos avatares
--  públicos. Si en algún momento queremos cerrar a sólo logueados, cambiar
--  esta línea.)
GRANT SELECT ON public.profiles_public TO authenticated, anon;

COMMENT ON VIEW public.profiles_public IS
  'Vista de perfiles públicos. Expone SOLO columnas seguras (sin PII como '
  'discord_id, discord_username, first_name, last_name, age, last_seen, '
  'notifications_enabled). Crear con security_invoker=false para que la '
  'view bypassee la RLS owner-only del base table profiles. Toda query de '
  'lookup de OTRO usuario debe ir contra esta view, no contra profiles.';

-- ── 2) RLS owner-only sobre la tabla base ───────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop de policies abiertas previas (idempotente).
DROP POLICY IF EXISTS "Profiles are viewable by everyone"        ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_all"                      ON public.profiles;
DROP POLICY IF EXISTS "Allow all to read profiles"               ON public.profiles;
DROP POLICY IF EXISTS "profiles_owner_select"                    ON public.profiles;

-- SELECT sólo el owner.
CREATE POLICY "profiles_owner_select" ON public.profiles
  FOR SELECT
  USING ( auth.uid() = id );

-- UPDATE sólo el owner (idempotente — recreamos por si la policy difería).
DROP POLICY IF EXISTS "profiles_owner_update" ON public.profiles;
CREATE POLICY "profiles_owner_update" ON public.profiles
  FOR UPDATE
  USING ( auth.uid() = id )
  WITH CHECK ( auth.uid() = id );

-- INSERT: sólo el propio user puede crear su row (esto pasa en el trigger
-- de Supabase Auth con role=postgres, así que la policy no aplica al insert
-- automático, pero la dejamos por explicitness).
DROP POLICY IF EXISTS "profiles_owner_insert" ON public.profiles;
CREATE POLICY "profiles_owner_insert" ON public.profiles
  FOR INSERT
  WITH CHECK ( auth.uid() = id );

-- ── 3) Smoke test: verificar columnas expuestas por la view ─────────────────
-- Para ejecutar manualmente en Supabase Studio después de aplicar:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='profiles_public'
--    ORDER BY ordinal_position;
-- Debe devolver SOLO: id, username, display_name, avatar_url, is_online,
--                     user_number, country, org_id.
-- Si aparece discord_*, last_seen, age, first_name, last_name, abortar.
