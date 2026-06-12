-- =============================================================================
-- Migración: 075_security_lockdown_audit_2026_06_12
-- Módulo:    SECURITY — lockdown integral según auditoría 2026-06-12
-- Aplica:    (1) la 063 (profiles PII) que NUNCA se corrió, adaptada a la BD
--            real (profiles no tiene columna country); (2) organizations
--            takeover; (3) eventos: inscriptos y emails de ganadores expuestos
--            a anon; (4) party: invite/kick/transferencia rotos por RLS;
--            (5) friendships auto-aceptación; (6) wishlist pública sin feature.
-- La view event_raffle_winners_public se recrea SIN winner_email/claimed_at
-- en el script aplicador (definición dinámica) — ver scripts/apply_075.mjs.
-- =============================================================================

-- ── 1) profiles: view pública segura + RLS owner-only (063 adaptada) ────────
DROP VIEW IF EXISTS public.profiles_public CASCADE;
CREATE VIEW public.profiles_public AS
SELECT id, username, display_name, avatar_url, is_online, user_number, org_id
FROM public.profiles;
GRANT SELECT ON public.profiles_public TO authenticated, anon;
COMMENT ON VIEW public.profiles_public IS
  'Perfiles públicos: SOLO columnas seguras (sin discord_id/discord_username/last_seen). Lookups de OTROS usuarios van por acá.';

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_owner_select" ON public.profiles;
CREATE POLICY "profiles_owner_select" ON public.profiles
  FOR SELECT USING ( auth.uid() = id );

-- ── 2) organizations: matar la policy permisiva que anulaba orgs_update ─────
-- 'auth users can update org logo_url' tenía qual=true (RLS no restringe
-- columnas) → cualquier user logueado podía pisar nombre/tag/owner_id de
-- CUALQUIER org. orgs_update (owner-only) queda como única policy de UPDATE.
DROP POLICY IF EXISTS "auth users can update org logo_url" ON public.organizations;

-- ── 3) eventos: inscriptos solo para admins/dueño; ganadores sin PII ─────────
DROP POLICY IF EXISTS "event_registrations_read" ON public.event_registrations;
CREATE POLICY "event_registrations_read" ON public.event_registrations
  FOR SELECT TO authenticated
  USING ( auth.uid() = user_id OR is_event_admin(event_id) );

DROP POLICY IF EXISTS "event_raffle_winners_read" ON public.event_raffle_winners;
CREATE POLICY "event_raffle_winners_read" ON public.event_raffle_winners
  FOR SELECT TO authenticated
  USING (
    is_event_admin(event_id)
    OR registration_id IN (SELECT id FROM event_registrations WHERE user_id = auth.uid())
  );
-- (la lectura pública del listado de ganadores pasa por la view
--  event_raffle_winners_public, recreada sin winner_email/claimed_at)

-- ── 4) party_members: el líder puede invitar, kickear y transferir ───────────
DROP POLICY IF EXISTS "pm_insert" ON public.party_members;
CREATE POLICY "pm_insert" ON public.party_members
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM parties p WHERE p.id = party_id AND p.leader_id = auth.uid())
  );

DROP POLICY IF EXISTS "pm_delete" ON public.party_members;
CREATE POLICY "pm_delete" ON public.party_members
  FOR DELETE
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM parties p WHERE p.id = party_id AND p.leader_id = auth.uid())
  );

DROP POLICY IF EXISTS "pm_update" ON public.party_members;
CREATE POLICY "pm_update" ON public.party_members
  FOR UPDATE
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM parties p WHERE p.id = party_id AND p.leader_id = auth.uid())
  )
  WITH CHECK ( true );

-- ── 5) friendships: solo el RECEPTOR acepta la solicitud ─────────────────────
DROP POLICY IF EXISTS "friends_update" ON public.friendships;
CREATE POLICY "friends_update" ON public.friendships
  FOR UPDATE
  USING ( auth.uid() = addressee_id )
  WITH CHECK ( auth.uid() = addressee_id );

-- ── 6) user_wishlist: owner-only (no existe feature de wishlist pública) ─────
DROP POLICY IF EXISTS "wl_select_public" ON public.user_wishlist;
CREATE POLICY "wl_select" ON public.user_wishlist
  FOR SELECT USING ( auth.uid() = user_id );
